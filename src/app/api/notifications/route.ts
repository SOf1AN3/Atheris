/**
 * Atheris — Route Handler **lecture des notifications in-app**
 * (Lot 4 · PLAN.md §2.3 · contrat inter-pistes C4).
 *
 * `GET /api/notifications` — renvoie le compte de non-lues ET les 20
 * dernières notifications du compte connecté (polling du hook `useNotifications`,
 * D2 : 35 s).
 *
 * SÉCURITÉ (motif `src/app/api/documents/[id]/route.ts` pour l'auth) :
 * - pas de session OU `session.user.status !== "active"` OU rôle inconnu
 *   (`isRole` revalide le JWT signé) → **401** (le client stoppe alors son
 *   polling) ;
 * - `session.user.id` malformé (JWT ancien schéma / forgé) → 401 avant toute
 *   requête DB (aucun cast) ;
 * - les deux requêtes sont **exclusive­ment** sur `recipient_id = moi` :
 *   aucun id de paramètre, aucune possibilité de lire les lignes d'un autre
 *   compte (ni filtre, ni tri n'influencent la cible).
 *
 * PERFORMANCE : `count(*) FILTER (WHERE read_at IS NULL)` s'appuie sur
 * l'index partiel `notifications_recipient_unread_idx`, le select de 20 lignes
 * sur `notifications_recipient_created_idx` (2 requêtes simples).
 *
 * Réponse : `Response.json({ ok: true, unreadCount, items })` —
 * `items: { id, type, link, meta, readAt: string|null, createdAt: string }`
 * (ISO 8601, sérialisables tels quels pour le client).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'APRÈS l'authentification, dans le
 * corps du handler → aucun accès `DATABASE_URL` au build (handler dynamique).
 */

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";

/** Réponse d'authentification refusée — 401 sans détail (hook : stop polling). */
function unauthorized(): Response {
  return Response.json({ ok: false, code: "unauthorized" }, { status: 401 });
}

/** Nombre de lignes retournées par poll (contrat C4). */
const ITEMS_LIMIT = 20;

/** uuid strict sur l'id de session — JWT forgé → 401 avant toute requête. */
const uuidSchema = z.uuid();

/** Session lue à chaque requête : jamais de rendu mis en cache (polling). */
export const dynamic = "force-dynamic";

/**
 * Compte les non-lues + les 20 dernières notifications du connecté.
 *
 * @returns 200 `{ ok: true, unreadCount, items }` ; **401** si non
 *   authentifié, compte non `active` ou rôle invalide ; 500 `{ ok: false }`
 *   sur erreur d'infra (aucun détail interne dans la réponse).
 */
export async function GET(): Promise<Response> {
  // -------------------------------------------------------------------------
  // 1. Session — Auth.js v5. Toute anomalie → 401 (le polling s'arrête).
  // -------------------------------------------------------------------------
  const session = await auth();
  const sessionUser = session?.user;
  if (sessionUser === undefined) return unauthorized();
  if (sessionUser.status !== "active") return unauthorized();
  if (!isRole(sessionUser.role)) return unauthorized();
  const parsedId = uuidSchema.safeParse(sessionUser.id);
  if (!parsedId.success) return unauthorized();
  const meId = parsedId.data;

  const db = getDb();
  try {
    // -------------------------------------------------------------------------
    // 2. Compte des NON LUES — agrégat paramétré sur `recipient_id = moi`.
    // -------------------------------------------------------------------------
    const countRows = await db
      .select({
        unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)`,
      })
      .from(notifications)
      .where(eq(notifications.recipientId, meId));
    // `count(*)` peut revenir en string (int8) selon le driver : `Number()`
    // normalise sans NaN (valeur absente → 0), miroir de `listProspects`.
    const unreadCount = Number(countRows[0]?.unread ?? 0);

    // -------------------------------------------------------------------------
    // 3. 20 dernières lignes — tri `createdAt` DESC, colonnes explicites.
    // -------------------------------------------------------------------------
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        link: notifications.link,
        meta: notifications.meta,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.recipientId, meId))
      .orderBy(desc(notifications.createdAt))
      .limit(ITEMS_LIMIT);

    // ISO 8601 : les `Date` Drizzle sont re-sérialisés proprement pour le client.
    const items = rows.map((row) => ({
      id: row.id,
      type: row.type,
      link: row.link,
      meta: row.meta,
      readAt: row.readAt === null ? null : row.readAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));

    return Response.json({ ok: true, unreadCount, items });
  } catch (error) {
    // Erreur d'infra : journalisée côté serveur, réponse générique côté client
    // (aucune donnée ni détail interne ne fuit).
    console.error("[notifications] échec de lecture des notifications", error);
    return Response.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
