"use server";

/**
 * Atheris — Server Action **messagerie projet** (T29 · BK-6 ·
 * structure.md §3.3).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé en T09 :
 * jamais de clé ni de message dans ce fichier, traduction côté client) :
 * - `postMessage(input, viewer)` → `{ ok: true; id: string }` |
 *   `{ ok: false; code: "not_found" | "forbidden" | "invalid" }` ;
 * - `listMessages(input, viewer)` → `{ ok: true; items: [...] }` |
 *   `{ ok: false; code: "not_found" | "forbidden" | "invalid" }` ;
 * - `markThreadRead(input, viewer)` → `{ ok: true }` |
 *   `{ ok: false; code: "not_found" | "forbidden" | "invalid" }`.
 *
 * ACCÈS — 100 % délégué à `resolveProjectAccess` (`src/actions/project.ts`,
 * exporté et factorisé) : projet introuvable **ou** visiteur non autorisé →
 * `not_found` (aucune distinction qui confirmerait l'existence, cohérent avec
 * la route documents en 404). Règles de la matrice (rappel) : `client` =
 * son seul projet ; `ceo|manager|commercial` = tous ; `vendeur` = ses deals
 * uniquement.
 *
 * ÉCRITURE — **tous les rôles ayant accès peuvent poster** (décision Lead :
 * la messagerie projet est bilatérale client ↔ équipe ; le vendeur rattaché
 * au deal y participe en lecture/écriture, ce qui ne lui donne aucun droit de
 * gestion sur les jalons ni la clôture — voir `resolveProjectAccess`).
 * `postMessage` n'écrit **aucune ligne d'audit** : le message EST
 * l'activité du fil (un audit par message dupliquerait l'information dans
 * `activities` sans valeur ajoutée).
 *
 * LECTURE — `listMessages` : `ORDER BY created_at ASC` (ordre
 * chronologique du fil), `limit` défaut **200** (plafond **500**), JOIN
 * `users` pour `senderName`/`senderRole` avec **colonnes explicites** : le
 * `SELECT *` est prohibé, `passwordHash` ne figure jamais dans le projection
 * (vérifié sous `listMessages`).
 *
 * LU / NON LU — `markThreadRead` marque lus **les messages de l'autre côté**
 * du fil (`read_at IS NULL AND sender_id <> moi`) : chaque partie ne marque
 * que ce qu'elle a reçu. Idempotent (0 ligne = déjà lu = `ok`). L'UI l'appelle
 * à l'ouverture de l'onglet de discussion.
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : **aucun `db.transaction()`**. Chaque
 * action n'a qu'une écriture métier (insert message / update read_at) ; pas
 * d'audit à accoupler ici.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { isRole, type Role } from "@/lib/permissions";

import { resolveProjectAccess, type ProjectViewer } from "@/actions/project";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const uuidSchema = z.uuid();

const postMessageInputSchema = z.object({
  projectId: z.uuid(),
  // Corps du message : trim + 1 à 2000 caractères (contrainte applicative
  // documentée en tête du schéma `messages.body`).
  body: z.string().trim().min(1).max(2000),
});

const listMessagesInputSchema = z.object({
  projectId: z.uuid(),
  // Plafond de sécurité sur la taille du fil (défaut appliqué plus bas).
  limit: z.number().int().min(1).max(500).optional(),
});

const markThreadReadInputSchema = z.object({
  projectId: z.uuid(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `postMessage` (dérivée du schéma Zod). */
export type PostMessageInput = z.input<typeof postMessageInputSchema>;

/** Contrat de `postMessage` (union discriminée par `ok`). */
export type PostMessageResult =
  | { ok: true; id: string }
  | { ok: false; code: "not_found" | "forbidden" | "invalid" };

/** Entrée de `listMessages` (dérivée du schéma Zod). */
export type ListMessagesInput = z.input<typeof listMessagesInputSchema>;

/** Un message du fil, avec l'expéditeur résolu (nom + rôle). */
export type MessageItem = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  readAt: Date | null;
  createdAt: Date;
};

/** Contrat de `listMessages` (union discriminée par `ok`). */
export type ListMessagesResult =
  | { ok: true; items: MessageItem[] }
  | { ok: false; code: "not_found" | "forbidden" | "invalid" };

/** Entrée de `markThreadRead` (dérivée du schéma Zod). */
export type MarkThreadReadInput = z.input<typeof markThreadReadInputSchema>;

/** Contrat de `markThreadRead` (union discriminée par `ok`). */
export type MarkThreadReadResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "forbidden" | "invalid" };

// ---------------------------------------------------------------------------
// Règles locales.
// ---------------------------------------------------------------------------

/** Nombre de messages retournés quand `limit` est omis (défaut contrat). */
const DEFAULT_LIST_LIMIT = 200;

// ---------------------------------------------------------------------------
// postMessage — envoi d'un message dans le fil projet.
// ---------------------------------------------------------------------------

/**
 * Poste un message dans la conversation d'un projet.
 *
 * Étapes :
 * 1. Validation Zod (uuid projet, corps trim 1..2000 car.) → `invalid` ;
 *    acteur forgé → `invalid` (uuid ou rôle inconnu).
 * 2. `resolveProjectAccess` → `null` → `not_found` (introuvable et interdit
 *    indiscernables).
 * 3. Insert `messages` (`project_id`, `sender_id` = acteur, `body` déjà
 *    trimé par Zod). **Tous les rôles ayant accès peuvent écrire**
 *    (messagerie bilatérale, décision Lead).
 * 4. Aucune audit (`activities`) : le message est l'activité du fil.
 *
 * @param input `projectId`, `body` (1..2000 car. après trim).
 * @param viewer `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true, id }` ; sinon `invalid`, `forbidden` ou `not_found`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function postMessage(
  input: PostMessageInput,
  viewer: ProjectViewer,
): Promise<PostMessageResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = postMessageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return { ok: false, code: "invalid" };
  if (!isRole(viewer.role)) return { ok: false, code: "invalid" };

  const viewerId = parsedViewerId.data;
  const { projectId, body } = parsed.data;

  // 2. Accès au projet (helper partagé, exporté depuis project.ts).
  const access = await resolveProjectAccess(projectId, { id: viewerId, role: viewer.role });
  if (access === null) return { ok: false, code: "not_found" };

  const db = getDb();

  try {
    // 3. Insert — aucun audit (le message est l'activité du fil).
    const inserted = await db
      .insert(messages)
      .values({ projectId, senderId: viewerId, body })
      .returning({ id: messages.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error("insert messages sans retour");

    return { ok: true, id };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[messages] échec d'envoi du message", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// listMessages — historique chronologique du fil projet.
// ---------------------------------------------------------------------------

/**
 * Liste les messages d'un projet (ordre chronologique ASC).
 *
 * Étapes :
 * 1. Validation Zod (uuid projet, `limit` entier 1..500 optionnel) →
 *    `invalid` ; acteur forgé → `invalid`.
 * 2. `resolveProjectAccess` → `null` → `not_found`.
 * 3. SELECT avec **colonnes explicites** (jamais `*` : `passwordHash` et le
 *    reste de `users` ne sont jamais projetés) + JOIN `users` → `senderName`
 *    (`users.name`) et `senderRole` (`users.role`).
 * 4. `ORDER BY created_at ASC`, `LIMIT` = `limit ?? 200` (plafond 500 déjà
 *    posé par Zod).
 *
 * @param input `projectId`, `limit?` (défaut 200, max 500).
 * @param viewer `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true, items }` (items vides = fil vide, état légitime) ;
 *   sinon `invalid`, `forbidden` ou `not_found`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function listMessages(
  input: ListMessagesInput,
  viewer: ProjectViewer,
): Promise<ListMessagesResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = listMessagesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return { ok: false, code: "invalid" };
  if (!isRole(viewer.role)) return { ok: false, code: "invalid" };

  const viewerId = parsedViewerId.data;
  const { projectId } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIST_LIMIT;

  // 2. Accès au projet (helper partagé).
  const access = await resolveProjectAccess(projectId, { id: viewerId, role: viewer.role });
  if (access === null) return { ok: false, code: "not_found" };

  const db = getDb();

  try {
    // 3 + 4. Projection EXPLICITE — `passwordHash` absent par construction.
    const rows = await db
      .select({
        id: messages.id,
        body: messages.body,
        senderId: messages.senderId,
        senderName: users.name,
        senderRole: users.role,
        readAt: messages.readAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);

    // `createdAt` : colonne `defaultNow()` (jamais NULL en base) mais le
    // schéma figé ne porte pas `.notNull()` → typage Drizzle `Date | null`
    // re-plafonné ici sur le contrat `Date` (repli défensif inatteignable).
    const items: MessageItem[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt ?? new Date(),
    }));

    return { ok: true, items };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500.
    console.error("[messages] échec de lecture du fil", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// markThreadRead — accusé de lecture des messages reçus.
// ---------------------------------------------------------------------------

/**
 * Marque comme lus les messages **reçus** par le visiteur dans un projet.
 *
 * Étapes :
 * 1. Validation Zod (uuid projet) → `invalid` ; acteur forgé → `invalid`.
 * 2. `resolveProjectAccess` → `null` → `not_found`.
 * 3. UPDATE `read_at = now()` **conditionné** : `project_id` + `read_at IS
 *    NULL` + `sender_id <> moi` (un participant ne marque que ce qu'il a
 *    REÇU de l'autre côté — ses propres messages restent tels quels).
 *    Idempotent : 0 ligne (déjà lus, ou rien à lire) = `ok`.
 *    L'UI appelle cette action à l'ouverture de l'onglet de discussion.
 *
 * @param input `projectId`.
 * @param viewer `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true }` ; sinon `invalid`, `forbidden` ou `not_found`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function markThreadRead(
  input: MarkThreadReadInput,
  viewer: ProjectViewer,
): Promise<MarkThreadReadResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = markThreadReadInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return { ok: false, code: "invalid" };
  if (!isRole(viewer.role)) return { ok: false, code: "invalid" };

  const viewerId = parsedViewerId.data;
  const { projectId } = parsed.data;

  // 2. Accès au projet (helper partagé).
  const access = await resolveProjectAccess(projectId, { id: viewerId, role: viewer.role });
  if (access === null) return { ok: false, code: "not_found" };

  const db = getDb();

  try {
    // 3. Marquage idempotent des messages reçus (jamais des siens).
    await db
      .update(messages)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(messages.projectId, projectId),
          isNull(messages.readAt),
          ne(messages.senderId, viewerId),
        ),
      );

    return { ok: true };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500.
    console.error("[messages] échec de marquage du fil comme lu", error);
    throw error;
  }
}
