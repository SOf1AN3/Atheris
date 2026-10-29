"use server";

/**
 * Atheris — Server Actions **marquage des notifications comme lues**
 * (Lot 4 · PLAN.md §2.4 · contrat inter-pistes C5).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé côté FE-A) :
 * - `markNotificationsRead(ids)` → `{ ok: true }` |
 *   `{ ok: false; code: "invalid" | "forbidden" }` ;
 * - `markAllNotificationsRead()` → `{ ok: true }` |
 *   `{ ok: false; code: "forbidden" }`.
 *
 * SÉCURITÉ :
 * - session `auth()` (Auth.js v5) relue **côté serveur** — pas de session,
 *   compte non `active` ou rôle inconnu (`isRole` revalide le JWT signé) →
 *   `forbidden` ; id de session malformé → même refus (aucun cast DB) ;
 * - Zod sur `ids` : **1 à 50 uuid** → sinon `invalid` (aucun traitement) ;
 * - UPDATE **toujours** `WHERE recipient_id = moi` : un id étranger est
 *   simplement non touché (0 ligne = `ok` idempotent, aucun détail qui
 *   confirmerait l'existence d'une notification d'un autre compte) ;
 * - requêtes paramétrées partout (`inArray`), zéro concaténation SQL.
 *
 * PAS D'AUDIT (`activities`) : geste trivial et hautement fréquent (clic sur
 * un item / « tout marquer lu »), sans valeur métier — écrire une ligne
 * d'audit par marquage gonflerait `activities` pour un rien. Choix assumé
 * (signalé au Lead).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

/** `ids` : 1 à 50 uuid par appel (plafond anti-payload). */
const markReadIdsSchema = z.array(z.uuid()).min(1).max(50);

/** uuid de session — malformé = refus (jamais de cast DB). */
const uuidSchema = z.uuid();

// ---------------------------------------------------------------------------
// Types publics (contrat C5) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async subsistent à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Contrat de `markNotificationsRead` (union discriminée par `ok`). */
export type MarkNotificationsReadResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "forbidden" };

/** Contrat de `markAllNotificationsRead` (union discriminée par `ok`). */
export type MarkAllNotificationsReadResult = { ok: true } | { ok: false; code: "forbidden" };

// ---------------------------------------------------------------------------
// Session — identité du connecté, revalidée côté serveur.
// ---------------------------------------------------------------------------

/**
 * Session Auth.js **relecture serveur** : aucune identité ne transite par le
 * client (les arguments de Server Action voyagent dans la requête POST).
 *
 * @returns `meId` (uuid) si session présente, compte `active` et rôle
 *   valide ; `null` sinon (→ `forbidden`).
 */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = session?.user;
  if (sessionUser === undefined) return null;
  if (sessionUser.status !== "active") return null;
  if (!isRole(sessionUser.role)) return null;
  const parsed = uuidSchema.safeParse(sessionUser.id);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// markNotificationsRead — marquage ciblé (1 à 50 ids).
// ---------------------------------------------------------------------------

/**
 * Marque comme lues les notifications **du compte connecté** dont les ids sont
 * fournis.
 *
 * @param input Tableau de 1 à 50 uuid (validé par Zod).
 * @returns `{ ok: true }` (idempotent : 0 ligne mise à jour = déjà lues ou
 *   ids étrangers/inconnus — jamais d'erreur) ; sinon `forbidden` (session
 *   absente / compte non `active` / rôle invalide / id de session forgé) ou
 *   `invalid` (tableau malformé, hors bornes 1..50, uuid invalide).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500 (jamais
 *   transformée en code métier).
 */
export async function markNotificationsRead(input: string[]): Promise<MarkNotificationsReadResult> {
  // 1. Session — relecture serveur (aucune donnée montée du client).
  const meId = await currentUserId();
  if (meId === null) return { ok: false, code: "forbidden" };

  // 2. Validation Zod AVANT toute requête.
  const parsed = markReadIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  // Dédoublonnage : un double-clic renvoyant les mêmes ids n'écrit qu'une fois.
  const ids = [...new Set(parsed.data)];

  const db = getDb();
  try {
    // 3. UPDATE ciblé — `recipient_id = moi` TOUJOURS dans la clause : un id
    //    étranger n'est jamais modifié (0 ligne → `ok`, idempotent).
    await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.recipientId, meId), inArray(notifications.id, ids)));
    return { ok: true };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500, aucun détail en réponse.
    console.error("[notifications] échec du marquage comme lu", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// markAllNotificationsRead — marquage global du compte.
// ---------------------------------------------------------------------------

/**
 * Marque **toutes** les notifications du compte connecté comme lues.
 *
 * @returns `{ ok: true }` (idempotent : 0 ligne = déjà tout lu) ; sinon
 *   `forbidden` (session absente / compte non `active` / rôle invalide).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResult> {
  // 1. Session — relecture serveur.
  const meId = await currentUserId();
  if (meId === null) return { ok: false, code: "forbidden" };

  const db = getDb();
  try {
    // 2. UPDATE global SCOOPÉ sur `recipient_id = moi` — aucun autre compte
    //    touchable, aucun `id` à valider.
    await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(eq(notifications.recipientId, meId));
    return { ok: true };
  } catch (error) {
    console.error("[notifications] échec du marquage global comme lu", error);
    throw error;
  }
}
