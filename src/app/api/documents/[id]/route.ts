/**
 * Atheris — Route Handler **téléchargement d'un PDF** (T25 · BK-5).
 *
 * `GET /api/documents/[id]` — sert les octets `documents.bytes` en
 * `application/pdf`, avec contrôle de session, de statut, de rôle ET de
 * propriété (matrice complète ci-dessous).
 *
 * SÉCURITÉ (PLAN.md §Sécurité) :
 * - **Jamais 401/403** : toute absence de droit (pas de session, compte non
 *   `active`, rôle inconnu, document absent, hors périmètre) répond **404**
 *   — on ne confirme ni l'existence du document ni celle d'un compte.
 * - `auth()` Auth.js v5 côté serveur ; les droits de données (`vendeur`,
 *   `client`) sont une règle de **données** revérifiée ici, jamais supposée.
 * - Réponse `Cache-Control: private, no-store` : aucun cache partagé d'un
 *   PDF potentiellement sensible.
 *
 * MATRICE DES DROITS (branche de droite documentée en FR) :
 * | ownerType  | ceo/manager/commercial | vendeur                    | client                        |
 * |------------|------------------------|----------------------------|-------------------------------|
 * | `prospect` | OK                     | OK si `sourceUserId = moi` | toujours 404                  |
 * | `project`  | OK                     | OK si `sourceUserId = moi` | OK si `default_project_id = moi projet` |
 *
 * DB-PENDING : `getDb()` n'est appelé qu'APRÈS l'authentification, dans le
 * corps du handler → aucun accès `DATABASE_URL` au build (handler dynamique).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { documentDisposition } from "@/lib/documents";
import { getDb } from "@/lib/db";
import { clientProjects, documents, prospects, quotes, users } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";

/** uuid v4 strict — un id non uuid vaut 404 (jamais une erreur Postgres 500). */
const documentIdSchema = z.uuid();

/** Réponse unique utilisée pour TOUS les refus : 404 muet, corps vide. */
function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * Télécharge le PDF d'un document (session obligatoire + matrice des droits).
 *
 * @param _request Requête ignorée (aucun paramètre d'URL utile).
 * @param ctx `params` est une **Promise** en Next 15 (route dynamique).
 * @returns 200 + octets PDF, ou **404** pour tout refus (voir en-tête).
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
  // Compte non actif : la valeur vient du JWT signé (figée à la connexion,
  // jamais forgeable) — tout statut ≠ `active` (disabled/rejected/pending)
  // → 404.
  if (sessionUser.status !== "active") return notFound();
  // Rôle inconnu (JWT forgé ou ancien schéma) : `isRole` revalide le type.
  if (!isRole(sessionUser.role)) return notFound();
  // uuid d'acteur malformé → 404 avant toute requête (aucun cast DB).
  const actorId = documentIdSchema.safeParse(sessionUser.id);
  if (!actorId.success) return notFound();
  const meId = actorId.data;
  const role = sessionUser.role;

  // -------------------------------------------------------------------------
  // 2. Document — id de route + ligne en base.
  // -------------------------------------------------------------------------
  const { id } = await ctx.params;
  const parsedId = documentIdSchema.safeParse(id);
  // UUID invalide → 404 (et non 400 : rien à confirmer à un inconnu).
  if (!parsedId.success) return notFound();
  const documentId = parsedId.data;

  const db = getDb();
  // Ligne absente (`undefined`) = document inexistant → 404.
  let doc:
    | {
        ownerType: "prospect" | "project";
        ownerId: string;
        filename: string;
        byteSize: number;
        bytes: Buffer;
      }
    | undefined = undefined;

  try {
    const rows = await db
      .select({
        ownerType: documents.ownerType,
        ownerId: documents.ownerId,
        filename: documents.filename,
        byteSize: documents.byteSize,
        bytes: documents.bytes,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    doc = rows[0];
  } catch (error) {
    console.error("[documents] échec de lecture du document", error);
    throw error;
  }
  // Document absent → 404.
  if (doc === undefined) return notFound();

  // -------------------------------------------------------------------------
  // 3. Droits par propriétaire polymorphe — UNE branche par rôle.
  // -------------------------------------------------------------------------
  if (doc.ownerType === "prospect") {
    // --- Propriétaire = prospect (pipeline commercial) ---
    switch (role) {
      // Vue pipeline complète (structure.md §4.2) : accès sans condition.
      case "ceo":
      case "manager":
      case "commercial":
        break;
      // Vendeur : scoping de DONNÉES — uniquement SES prospects
      // (`prospects.sourceUserId = moi`, PLAN.md §Sécurité). Un prospect
      // sans bénéficiaire (lead Ads/Sales Development Representative) n'est visible par aucun vendeur.
      case "vendeur": {
        const owners = await db
          .select({ sourceUserId: prospects.sourceUserId })
          .from(prospects)
          .where(eq(prospects.id, doc.ownerId))
          .limit(1);
        const owner = owners[0];
        if (
          owner === undefined ||
          owner.sourceUserId === null ||
          owner.sourceUserId !== meId
        ) {
          return notFound();
        }
        break;
      }
      // Client : AUCUN accès aux documents d'un prospect (ils appartiennent
      // au pipeline interne, pas à son espace) → toujours 404.
      case "client":
        return notFound();
    }
  } else {
    // --- Propriétaire = projet de livraison ---
    switch (role) {
      // Équipe commerciale : accès projet sans condition (livraison suivie
      // par le même pipeline que le prospect d'origine).
      case "ceo":
      case "manager":
      case "commercial":
        break;
      // Vendeur : chaîne `client_projects → quotes → prospects` et contrôle
      // de propriété sur le prospect d'origine du devis (`sourceUserId`).
      case "vendeur": {
        const owners = await db
          .select({ sourceUserId: prospects.sourceUserId })
          .from(clientProjects)
          .innerJoin(quotes, eq(clientProjects.quoteId, quotes.id))
          .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
          .where(eq(clientProjects.id, doc.ownerId))
          .limit(1);
        const owner = owners[0];
        if (
          owner === undefined ||
          owner.sourceUserId === null ||
          owner.sourceUserId !== meId
        ) {
          return notFound();
        }
        break;
      }
      // Client : uniquement SON projet (`users.default_project_id`) — tout
      // autre projet de la base → 404 (pas de fuite entre clients).
      case "client": {
        const rows = await db
          .select({ defaultProjectId: users.defaultProjectId })
          .from(users)
          .where(eq(users.id, meId))
          .limit(1);
        const me = rows[0];
        if (
          me === undefined ||
          me.defaultProjectId === null ||
          me.defaultProjectId !== doc.ownerId
        ) {
          return notFound();
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Réponse — octets bruts + en-têtes de téléchargement sûrs.
  // -------------------------------------------------------------------------
  const body = Buffer.from(doc.bytes);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.length),
      // RFC 6266/5987 : nom ASCII sûr + nom UTF-8 réel (jamais cru).
      "Content-Disposition": documentDisposition(doc.filename),
      // Jamais de cache partagé sur un PDF potentiellement sensible.
      "Cache-Control": "private, no-store",
    },
  });
}
