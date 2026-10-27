/**
 * Atheris — Route Handler **téléchargement du CV d'une candidature**
 * (`PLAN-RECRUTEMENT-CEO.md` §3).
 *
 * `GET /api/applications/[id]/cv` — sert les octets `job_applications.cv_bytes`
 * en leur MIME réel, avec contrôle de session, de statut et de rôle.
 *
 * SÉCURITÉ (miroir strict de `src/app/api/documents/[id]/route.ts`) :
 * - **Jamais 401/403** : pas de session, compte non `active`, rôle ≠ `ceo`,
 *   id non uuid ou candidature absente → **404** muet (aucune confirmation
 *   d'existence).
 * - **Rôle CEO exclusif** : les candidatures contiennent des PII + le CV ; le
 *   contrôle est repris ici même si la page `/{locale}/espace/recrutement`
 *   applique la même garde (double filet).
 * - Réponse `Cache-Control: private, no-store` : aucun cache partagé d'un
 *   fichier sensible.
 * - `Content-Disposition` : `inline` pour les PDF (aperçu dans l'onglet),
 *   `attachment` sinon (DOC/DOCX/RTF ne sont pas rendus par le navigateur).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'APRÈS l'authentification, dans le
 * corps du handler → aucun accès `DATABASE_URL` au build (handler dynamique).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";

/** uuid v4 strict — un id non uuid vaut 404 (jamais une erreur Postgres 500). */
const applicationIdSchema = z.uuid();

/** Réponse unique utilisée pour TOUS les refus : 404 muet, corps vide. */
function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * Construit l'en-tête `Content-Disposition` (RFC 6266 + RFC 5987) — miroir du
 * helper de `src/lib/documents.ts`, avec un mode paramétrable (`inline` pour
 * les PDF, `attachment` pour les binaires non rendus).
 *
 * - `filename="…"` : fallback ASCII (hors 7 bits → `_`, guillemets/antislash
 *   retirés, CR/LF supprimés) → aucune injection d'en-tête possible ;
 * - `filename*=UTF-8''…` : nom réel percent-encodé (caractères `!'()*`
 *   encodés à la main, interdits dans `attr-char`).
 */
function cvDisposition(filename: string, inline: boolean): string {
  const source = filename.length > 0 ? filename : "cv";
  const mode = inline ? "inline" : "attachment";

  const ascii = source
    // Contrôle (dont CR/LF) puis hors 7 bits → "_", guillemet/antislash retirés.
    .replace(/[\u0000-\u001F\u007F]/g, "_")
    .replace(/[^\u0020-\u007E]/g, "_")
    .replace(/["\\]/g, "_");

  const encoded = encodeURIComponent(source).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Télécharge le CV d'une candidature (session CEO uniquement).
 *
 * @param _request Requête ignorée (aucun paramètre d'URL utile).
 * @param ctx `params` est une **Promise** en Next 15 (route dynamique).
 * @returns 200 + octets du CV (MIME relu depuis la base), ou **404** pour
 *   tout refus (voir en-tête).
 * @throws Erreur d'infra (DB, session illisible) — propagée → 500, jamais
 *   transformée en 404 (un incident ne doit pas passer pour un refus).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // -------------------------------------------------------------------------
  // 1. Session — Auth.js v5. Toute anomalie → 404 (jamais 401/403).
  // -------------------------------------------------------------------------
  const session = await auth();
  const sessionUser = session?.user;
  // Pas de session : 404 (on ne révèle pas « connectez-vous »).
  if (sessionUser === undefined) return notFound();
  // Compte non actif (disabled/rejected/pending) → 404.
  if (sessionUser.status !== "active") return notFound();
  // Rôle inconnu (JWT forgé ou ancien schéma) : `isRole` revalide le type.
  if (!isRole(sessionUser.role)) return notFound();
  // Seul le CEO consulte les dossiers de candidature.
  if (sessionUser.role !== "ceo") return notFound();

  // -------------------------------------------------------------------------
  // 2. Candidature — id de route + ligne en base.
  // -------------------------------------------------------------------------
  const { id } = await ctx.params;
  const parsedId = applicationIdSchema.safeParse(id);
  // UUID invalide → 404 (et non 400 : rien à confirmer à un inconnu).
  if (!parsedId.success) return notFound();
  const applicationId = parsedId.data;

  const db = getDb();
  // Ligne absente (`undefined`) = candidature inexistante → 404.
  let row:
    | {
        cvFilename: string;
        cvMimeType: string;
        cvByteSize: number;
        cvBytes: Buffer;
      }
    | undefined = undefined;

  try {
    const rows = await db
      .select({
        cvFilename: jobApplications.cvFilename,
        cvMimeType: jobApplications.cvMimeType,
        cvByteSize: jobApplications.cvByteSize,
        cvBytes: jobApplications.cvBytes,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId))
      .limit(1);
    row = rows[0];
  } catch (error) {
    console.error("[applications/cv] échec de lecture de la candidature", error);
    throw error;
  }
  if (row === undefined) return notFound();

  // -------------------------------------------------------------------------
  // 3. Réponse — octets bruts + en-têtes sûrs.
  // -------------------------------------------------------------------------
  const body = Buffer.from(row.cvBytes);
  return new Response(body, {
    headers: {
      // MIME relu depuis la base (déjà validé au dépôt : PDF/DOC/DOCX/RTF).
      "Content-Type": row.cvMimeType,
      "Content-Length": String(row.cvByteSize),
      // Aperçu navigateur pour les PDF ; téléchargement pour les binaires.
      "Content-Disposition": cvDisposition(
        row.cvFilename,
        row.cvMimeType === "application/pdf",
      ),
      // Jamais de cache partagé sur un fichier sensible.
      "Cache-Control": "private, no-store",
    },
  });
}
