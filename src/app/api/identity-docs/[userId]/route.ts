/**
 * Atheris — Route Handler **pièce d'identité d'un SDR** (PLAN-REFONTE L7).
 *
 * `GET /api/identity-docs/[userId]` — sert les octets `identity_docs.bytes`
 * en leur MIME réel, avec contrôle de session, de statut et de rôle.
 *
 * SÉCURITÉ (miroir strict de `src/app/api/applications/[id]/cv/route.ts`) :
 * - **Jamais 401/403** : pas de session, compte non `active`, rôle ≠ `ceo`,
 *   id non uuid ou dossier absent → **404** muet (aucune confirmation
 *   d'existence).
 * - **Rôle CEO exclusif** : une pièce d'identité est une PII sensible (D3) ;
 *   le contrôle est repris ici même si la page `/espace/verification`
 *   applique la même garde (double filet).
 * - Réponse `Cache-Control: private, no-store` : aucun cache partagé d'un
 *   fichier sensible.
 * - `Content-Disposition: inline` pour les types rendus par le navigateur
 *   (PDF + images — la whitelist d'upload n'admet que ces familles), avec
 *   fallback RFC 6266 (`filename` ASCII + `filename*` UTF-8) et bascule en
 *   `attachment` pour tout mimetype non rendable (défense en profondeur).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'APRÈS l'authentification, dans le
 * corps du handler → aucun accès `DATABASE_URL` au build (handler dynamique).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { identityDocs } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";

/** uuid v4 strict — un id non uuid vaut 404 (jamais une erreur Postgres 500). */
const userIdSchema = z.uuid();

/** Réponse unique utilisée pour TOUS les refus : 404 muet, corps vide. */
function notFound(): Response {
  return new Response(null, { status: 404 });
}

/** Types rendus par le navigateur (aperçu `inline`) — whitelist d'upload. */
const INLINE_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Construit l'en-tête `Content-Disposition` (RFC 6266 + RFC 5987) — miroir du
 * helper de `src/app/api/applications/[id]/cv/route.ts` :
 *
 * - `filename="…"` : fallback ASCII (hors 7 bits → `_`, guillemets/antislash
 *   retirés, CR/LF supprimés) → aucune injection d'en-tête possible ;
 * - `filename*=UTF-8''…` : nom réel percent-encodé (caractères `!'()*`
 *   encodés à la main, interdits dans `attr-char`).
 */
function docDisposition(filename: string, inline: boolean): string {
  const source = filename.length > 0 ? filename : "identite";
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
 * Télécharge la pièce d'identité d'un SDR (session CEO uniquement).
 *
 * @param _request Requête ignorée (aucun paramètre d'URL utile).
 * @param ctx `params` est une **Promise** en Next 15 (route dynamique).
 * @returns 200 + octets de la pièce (MIME relu depuis la base), ou **404**
 *   pour tout refus (voir en-tête).
 * @throws Erreur d'infra (DB, session illisible) — propagée → 500, jamais
 *   transformée en 404 (un incident ne doit pas passer pour un refus).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ userId: string }> },
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
  // Seul le CEO consulte les pièces d'identité (PII sensible).
  if (sessionUser.role !== "ceo") return notFound();

  // -------------------------------------------------------------------------
  // 2. Dossier — id de route + ligne en base.
  // -------------------------------------------------------------------------
  const { userId } = await ctx.params;
  const parsedId = userIdSchema.safeParse(userId);
  // UUID invalide → 404 (et non 400 : rien à confirmer à un inconnu).
  if (!parsedId.success) return notFound();
  const dossierUserId = parsedId.data;

  const db = getDb();
  // Ligne absente (`undefined`) = dossier inexistant → 404.
  let row:
    | {
        filename: string;
        mimeType: string;
        byteSize: number;
        bytes: Buffer;
      }
    | undefined = undefined;

  try {
    const rows = await db
      .select({
        filename: identityDocs.filename,
        mimeType: identityDocs.mimeType,
        byteSize: identityDocs.byteSize,
        bytes: identityDocs.bytes,
      })
      .from(identityDocs)
      .where(eq(identityDocs.userId, dossierUserId))
      .limit(1);
    row = rows[0];
  } catch (error) {
    console.error("[identity-docs] échec de lecture du dossier", error);
    throw error;
  }
  if (row === undefined) return notFound();

  // -------------------------------------------------------------------------
  // 3. Réponse — octets bruts + en-têtes sûrs.
  // -------------------------------------------------------------------------
  const body = Buffer.from(row.bytes);
  return new Response(body, {
    headers: {
      // MIME relu depuis la base (déjà validé au dépôt : PDF + images).
      "Content-Type": row.mimeType,
      "Content-Length": String(row.byteSize),
      // Aperçu navigateur pour les types rendus ; téléchargement sinon.
      "Content-Disposition": docDisposition(
        row.filename,
        INLINE_MIME_TYPES.has(row.mimeType),
      ),
      // Jamais de cache partagé sur un fichier sensible.
      "Cache-Control": "private, no-store",
    },
  });
}
