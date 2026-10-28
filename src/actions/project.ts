"use server";

/**
 * Atheris — Server Actions **projets clients & jalons** (T27 · BK-6 ·
 * structure.md §3.3).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé en T09 :
 * jamais de clé ni de message dans ce fichier, traduction côté client) :
 * - `validateMilestone(input, viewer)` →
 *   `{ ok: true; nextKey: MilestoneKey | null }` |
 *   `{ ok: false; code: "not_found" | "forbidden" | "invalid" | "conflict" }` ;
 * - `closeProject(input, viewer)` → `{ ok: true }` |
 *   `{ ok: false; code: "not_found" | "forbidden" | "conflict" | "invalid" }` ;
 * - `getProjectOverview(viewer)` →
 *   `{ ok: true; project: { id, name, status, createdAt, clientName,
 *   milestones: [...] } | null }` (état vide légitime : `project: null`).
 *
 * HELPER D'ACCÈS (exporté, factorisé) — `resolveProjectAccess(projectId,
 * viewer)` :
 * - `client` : uniquement si `users.default_project_id = projectId` →
 *   `canManage: false` (lecture seule, messagerie comprise côté écriture
 *   seulement — voir `postMessage`) ;
 * - `ceo` / `manager` / `commercial` : tous les projets → `canManage: true` ;
 * - `sdr` : uniquement si `client_projects → quotes →
 *   prospects.source_user_id = moi` → `canManage: false` (**décision Lead** :
 *   le SDR suit ses deals mais ne gère ni jalons ni messagerie) ;
 * - projet **introuvable OU non autorisé → `null`** (appelants → `not_found`) :
 *   **jamais de distinction qui confirmerait l'existence** d'un projet à un
 *   visiteur non autorisé — cohérent avec la route documents (404 uniforme).
 *
 * DÉCISIONS MÉTIER (Lead, structure.md §5 / PLAN §3.2) :
 * - **Validation jalon = `client` + `ceo`** (le CEO débloque un client
 *   absent) ; `manager` / `commercial` / `sdr` → `forbidden`.
 * - **Séquence non sautable** : `milestoneKey` doit être la 1ʳᵉ étape
 *   `en_cours` du projet (tri `order ASC`) ; sinon `invalid`. Un jalon déjà
 *   `valide` ou encore `en_attente` n'est jamais validable.
 * - **Pas de clôture automatique** : la validation de la dernière étape
 *   (`mise_en_ligne`) renvoie `nextKey: null` mais laisse le projet
 *   `en_livraison` ; la clôture est un acte MANUEL du **CEO seul**
 *   (`closeProject`) — décision documentée.
 * - `getProjectOverview` = **vue portail client uniquement** (`client` seul) ;
 *   tout autre rôle reçoit `project: null` (aucune fuite vers le tableau de
 *   bord interne).
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : **aucun `db.transaction()`** →
 * `db.batch([...])` pour valider le jalon courant ET activer l'étape suivante
 * dans le même lot HTTP. Le 1ᵉʳ UPDATE porte un verrou `WHERE status =
 * 'en_cours'` : 0 ligne (double-clic / validation concurrente) → `conflict` ;
 * le 2ᵉ UPDATE est lui-même garanti par `WHERE status = 'en_attente'` (un
 * concurrent ayant déjà tout validé le rend inoffensif, jamais de double
 * avancement). L'audit est écrit ENSUITE, de façon NON FATALE (une ligne
 * d'audit mensongère ne doit jamais accompagner un `conflict`).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  activities,
  clientProjects,
  milestoneKeyEnum,
  milestoneStatusEnum,
  milestones,
  prospects,
  quotes,
  users,
} from "@/lib/db/schema";
import { isRole, type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const milestoneKeySchema = z.enum(milestoneKeyEnum.enumValues);
/** Réutilisé pour revalider les uuid (projet ET acteur — jamais de `!`). */
const uuidSchema = z.uuid();

const validateMilestoneInputSchema = z.object({
  projectId: z.uuid(),
  milestoneKey: milestoneKeySchema,
});

const closeProjectInputSchema = z.object({
  projectId: z.uuid(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Clé de jalon, dérivée de l'enum Drizzle (source de vérité unique). */
export type MilestoneKey = (typeof milestoneKeyEnum.enumValues)[number];

/** État de jalon, dérivé de l'enum Drizzle (source de vérité unique). */
export type MilestoneStatus = (typeof milestoneStatusEnum.enumValues)[number];

/** Visiteur d'une action projet : `{ id, role }` issu de la session serveur. */
export type ProjectViewer = { id: string; role: Role };

/** Accès résolu à un projet : existence garantie + droit de gestion. */
export type ProjectAccess = { projectId: string; canManage: boolean };

/** Entrée de `validateMilestone` (dérivée du schéma Zod). */
export type ValidateMilestoneInput = z.input<typeof validateMilestoneInputSchema>;

/** Contrat de `validateMilestone` (union discriminée par `ok`). */
export type ValidateMilestoneResult =
  | { ok: true; nextKey: MilestoneKey | null }
  | { ok: false; code: "not_found" | "forbidden" | "invalid" | "conflict" };

/** Entrée de `closeProject` (dérivée du schéma Zod). */
export type CloseProjectInput = z.input<typeof closeProjectInputSchema>;

/** Contrat de `closeProject` (union discriminée par `ok`). */
export type CloseProjectResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "forbidden" | "conflict" | "invalid" };

/** Un jalon de la timeline client (vue portail). */
export type ProjectOverviewMilestone = {
  key: MilestoneKey;
  status: MilestoneStatus;
  order: number;
  validatedAt: Date | null;
};

/** Projet du client + ses 5 jalons (vue portail client). */
export type ProjectOverview = {
  id: string;
  name: string;
  /** Texte brut (`en_livraison` | `clos`, validé en Zod à l'écriture). */
  status: string;
  createdAt: Date;
  clientName: string | null;
  milestones: ProjectOverviewMilestone[];
};

/** Contrat de `getProjectOverview` — `project: null` = état vide légitime. */
export type GetProjectOverviewResult = { ok: true; project: ProjectOverview | null };

// ---------------------------------------------------------------------------
// resolveProjectAccess — helper d'accès factorisé (voir en-tête).
// ---------------------------------------------------------------------------

/**
 * Résout l'accès d'un visiteur à un projet : existence du projet + droit de
 * gestion selon le rôle (règles détaillées en tête de fichier).
 *
 * @param projectId uuid du projet (revalidé : uuid forgé → `null`).
 * @param viewer `{ id, role }` revalidé (uuid + `isRole`) — un acteur forgé
 *   traversant la requête POST n'est jamais accepté.
 * @returns `{ projectId, canManage }` si le projet existe ET que le visiteur
 *   y est autorisé ; `null` sinon (introuvable **et** interdit indiscernables,
 *   appelants → `not_found` — cohérent avec la route documents en 404).
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée →
 *   500, jamais masquée en `null` (un échec DB n'est pas un accès refusé).
 */
export async function resolveProjectAccess(
  projectId: string,
  viewer: ProjectViewer,
): Promise<ProjectAccess | null> {
  const parsedProjectId = uuidSchema.safeParse(projectId);
  if (!parsedProjectId.success) return null;
  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return null;
  if (!isRole(viewer.role)) return null;

  const viewerId = parsedViewerId.data;
  const db = getDb();

  try {
    switch (viewer.role) {
      case "client": {
        // Portail client : accès UNIQUEMENT à son propre projet
        // (`users.default_project_id` renseigné à l'activation du compte).
        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, viewerId), eq(users.defaultProjectId, projectId)))
          .limit(1);
        if (rows[0] === undefined) return null;
        return { projectId, canManage: false };
      }

      case "ceo":
      case "manager":
      case "commercial": {
        // Équipe interne : tous les projets, gestion complète (jalons +
        // clôture restent soumis aux contrôles de rôle de chaque action).
        const rows = await db
          .select({ id: clientProjects.id })
          .from(clientProjects)
          .where(eq(clientProjects.id, projectId))
          .limit(1);
        if (rows[0] === undefined) return null;
        return { projectId, canManage: true };
      }

      case "sdr": {
        // Scoping SDR : uniquement les projets issus de SES prospects
        // (`prospects.source_user_id`), lecture seule (décision Lead).
        const rows = await db
          .select({ id: clientProjects.id })
          .from(clientProjects)
          .innerJoin(quotes, eq(clientProjects.quoteId, quotes.id))
          .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
          .where(and(eq(clientProjects.id, projectId), eq(prospects.sourceUserId, viewerId)))
          .limit(1);
        if (rows[0] === undefined) return null;
        return { projectId, canManage: false };
      }
    }
  } catch (error) {
    console.error("[project] échec de résolution d'accès au projet", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// validateMilestone — validation séquentielle d'un jalon (client + CEO).
// ---------------------------------------------------------------------------

/**
 * Valide le jalon courant d'un projet et active l'étape suivante.
 *
 * Étapes :
 * 1. Validation Zod (uuid, enum `milestone_key`) → `invalid` ; acteur forgé →
 *    `invalid` ; rôle ∉ {`client`, `ceo`} → `forbidden` (**décision Lead** :
 *    le CEO débloque un client absent ; manager/commercial/sdr n'y
 *    touchent pas — le SDR suit ses deals, lecture seule).
 * 2. `resolveProjectAccess` → `null` → `not_found` (aucune distinction
 *    révélant l'existence d'un projet).
 * 3. Jalons du projet triés `order ASC` : la 1ʳᵉ étape `en_cours` DOIT
 *    correspondre à `milestoneKey` (**séquence non sautable**) → sinon
 *    `invalid` (jalon déjà `valide` ou encore `en_attente` = non validable ;
 *    aucune étape `en_cours` = rien à valider → `invalid` aussi).
 * 4. `db.batch` (driver `neon-http`, pas de transaction) :
 *    - UPDATE jalon courant → `valide` + `validated_at` + `validated_by`,
 *      **`WHERE status = 'en_cours'`** (verrou anti-course) ;
 *    - UPDATE étape suivante (s'il en existe une) → `en_cours`, **`WHERE
 *      status = 'en_attente'`** (inoffensif si un concurrent a déjà avancé).
 *    0 ligne mise à jour sur le 1ᵉʳ UPDATE → `conflict` (double-clic /
 *    validation concurrente) — le 2ᵉ UPDATE garanti ne peut jamais doubler
 *    l'avancement.
 * 5. Dernière étape validée → `nextKey: null` ; le projet **ne se clôture
 *    PAS automatiquement** (`closeProject` = CEO seul, décision documentée).
 * 6. Audit `milestone.validated` (`entityType: "project"`, `meta:
 *    { milestoneKey, nextKey, actorId }`) — **non fatal**, écrit après
 *    confirmation du batch (jamais sur un `conflict`).
 *
 * @param input `projectId`, `milestoneKey`.
 * @param viewer `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true, nextKey }` ; sinon `invalid`, `forbidden`,
 *   `not_found` ou `conflict`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function validateMilestone(
  input: ValidateMilestoneInput,
  viewer: ProjectViewer,
): Promise<ValidateMilestoneResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = validateMilestoneInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return { ok: false, code: "invalid" };
  if (!isRole(viewer.role)) return { ok: false, code: "invalid" };
  // Client + CEO seulement (décision Lead — voir en-tête).
  if (viewer.role !== "client" && viewer.role !== "ceo") return { ok: false, code: "forbidden" };

  const viewerId = parsedViewerId.data;
  const { projectId, milestoneKey } = parsed.data;

  // 2. Accès au projet (introuvable et interdit indiscernables).
  const access = await resolveProjectAccess(projectId, { id: viewerId, role: viewer.role });
  if (access === null) return { ok: false, code: "not_found" };

  const db = getDb();

  try {
    // 3. Jalons du projet, ordre canonique (cadrage → … → mise_en_ligne).
    const rows = await db
      .select({
        id: milestones.id,
        key: milestones.key,
        status: milestones.status,
        order: milestones.order,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.order));

    const currentIndex = rows.findIndex((row) => row.status === "en_cours");
    if (currentIndex === -1) return { ok: false, code: "invalid" };
    const current = rows[currentIndex];
    // Séquence non sautable : la cible doit être LA 1ʳᵉ étape en cours.
    if (current === undefined || current.key !== milestoneKey) return { ok: false, code: "invalid" };

    // Étape suivante éventuelle (dernière étape → `nextKey: null`).
    const next = rows[currentIndex + 1] ?? null;

    // 4. Lot atomique (HTTP) : verrou `status` sur les DEUX UPDATE.
    const now = sql`now()`;
    const currentUpdate = db
      .update(milestones)
      .set({ status: "valide", validatedAt: now, validatedBy: viewerId })
      .where(and(eq(milestones.id, current.id), eq(milestones.status, "en_cours")))
      .returning({ id: milestones.id });

    const batchItems: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [currentUpdate];
    if (next !== null) {
      batchItems.push(
        db
          .update(milestones)
          .set({ status: "en_cours" })
          .where(and(eq(milestones.id, next.id), eq(milestones.status, "en_attente"))),
      );
    }
    const batchResults = await db.batch(batchItems);
    // Verrou optimiste : le jalon n'était plus `en_cours` au moment de
    // l'écriture (validation concurrente) → aucun audit mensonger.
    if (batchResults[0].length === 0) return { ok: false, code: "conflict" };

    const nextKey: MilestoneKey | null = next?.key ?? null;

    // 6. Audit NON FATAL — après confirmation (jamais sur `conflict`).
    try {
      await db.insert(activities).values({
        actorId: viewerId,
        action: "milestone.validated",
        entityType: "project",
        entityId: projectId,
        meta: { milestoneKey, nextKey, actorId: viewerId },
      });
    } catch (error) {
      console.error(
        "[project] activité `milestone.validated` non journalisée (validation appliquée)",
        error,
      );
    }

    return { ok: true, nextKey };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[project] échec de validation du jalon", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// closeProject — clôture manuelle d'un projet (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Clôt un projet (`status` → `clos`) — **acte manuel du CEO seul**
 * (décision Lead : la validation de `mise_en_ligne` ne clôt PAS
 * automatiquement, `validateMilestone` s'arrête à `nextKey: null`).
 *
 * Étapes :
 * 1. Validation Zod (uuid) → `invalid` ; acteur forgé → `invalid` ; rôle ≠
 *    `ceo` → `forbidden` (**décision Lead** : clôture = CEO seul).
 * 2. `resolveProjectAccess` → `null` → `not_found`.
 * 3. Projet déjà `clos` → `conflict`.
 * 4. UPDATE **conditionnel** `WHERE id AND status <> 'clos'` (optimistic
 *    locking : double-clic / clôture concurrente → 0 ligne → `conflict`).
 * 5. Audit `project.closed` (`entityType: "project"`, `meta: { actorId }`) —
 *    **non fatal**.
 *
 * @param input `projectId`.
 * @param viewer `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true }` ; sinon `invalid`, `forbidden`, `not_found` ou
 *   `conflict`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function closeProject(
  input: CloseProjectInput,
  viewer: ProjectViewer,
): Promise<CloseProjectResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = closeProjectInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return { ok: false, code: "invalid" };
  if (!isRole(viewer.role)) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (viewer.role !== "ceo") return { ok: false, code: "forbidden" };

  const viewerId = parsedViewerId.data;
  const { projectId } = parsed.data;

  // 2. Accès au projet (le CEO ne voit que l'existence réelle).
  const access = await resolveProjectAccess(projectId, { id: viewerId, role: viewer.role });
  if (access === null) return { ok: false, code: "not_found" };

  const db = getDb();

  try {
    // 3. Statut actuel (relu pour distinguer `conflict` net de la course).
    const rows = await db
      .select({ status: clientProjects.status })
      .from(clientProjects)
      .where(eq(clientProjects.id, projectId))
      .limit(1);
    const project = rows[0];
    if (project === undefined) return { ok: false, code: "not_found" };
    if (project.status === "clos") return { ok: false, code: "conflict" };

    // 4. UPDATE garanti (optimistic locking) — requête unique, atomique.
    const updated = await db
      .update(clientProjects)
      .set({ status: "clos", updatedAt: sql`now()` })
      .where(and(eq(clientProjects.id, projectId), ne(clientProjects.status, "clos")))
      .returning({ id: clientProjects.id });
    if (updated.length === 0) return { ok: false, code: "conflict" };

    // 5. Audit NON FATAL.
    try {
      await db.insert(activities).values({
        actorId: viewerId,
        action: "project.closed",
        entityType: "project",
        entityId: projectId,
        meta: { actorId: viewerId },
      });
    } catch (error) {
      console.error(
        "[project] activité `project.closed` non journalisée (clôture appliquée)",
        error,
      );
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500 (jamais un code
    // métier mensonger sur un échec réel de clôture).
    console.error("[project] échec de clôture du projet", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getProjectOverview — vue portail client (client seul).
// ---------------------------------------------------------------------------

/**
 * Renvoie le projet du client connecté + ses 5 jalons (timeline).
 *
 * Étapes :
 * 1. Acteur revalidé (uuid + `isRole`). Acteur invalide OU rôle ≠ `client` →
 *    `{ ok: true, project: null }` (**vue portail client uniquement**, aucune
 *    donnée vers le tableau de bord interne — décision documentée).
 * 2. Projet du client = `users.default_project_id` → absent (compte sans
 *    projet) → `{ ok: true, project: null }` (état vide légitime, PAS une
 *    erreur).
 * 3. `client_projects JOIN quotes JOIN prospects` → nom du projet, statut,
 *    date de création et `clientName` = `prospects.full_name`.
 * 4. Jalons du projet triés `order ASC` (`key`, `status`, `order`,
 *    `validatedAt`).
 *
 * @param viewer `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true, project }` — `project: null` si aucun projet (ni
 *   erreur ni distinction : la session est déjà authentifiée côté page).
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function getProjectOverview(
  viewer: ProjectViewer,
): Promise<GetProjectOverviewResult> {
  // 1. Revalidation de l'acteur (session serveur, jamais de `!`).
  const parsedViewerId = uuidSchema.safeParse(viewer?.id);
  if (!parsedViewerId.success) return { ok: true, project: null };
  if (!isRole(viewer.role)) return { ok: true, project: null };
  // Vue portail client seulement : tout autre rôle → état vide.
  if (viewer.role !== "client") return { ok: true, project: null };

  const viewerId = parsedViewerId.data;
  const db = getDb();

  try {
    // 2. Projet par défaut du compte client.
    const userRows = await db
      .select({ defaultProjectId: users.defaultProjectId })
      .from(users)
      .where(eq(users.id, viewerId))
      .limit(1);
    const defaultProjectId = userRows[0]?.defaultProjectId ?? null;
    if (defaultProjectId === null) return { ok: true, project: null };

    // 3. Projet + nom du prospect d'origine (JOIN en cascade).
    const projectRows = await db
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        status: clientProjects.status,
        createdAt: clientProjects.createdAt,
        clientName: prospects.fullName,
      })
      .from(clientProjects)
      .innerJoin(quotes, eq(clientProjects.quoteId, quotes.id))
      .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
      .where(eq(clientProjects.id, defaultProjectId))
      .limit(1);
    const project = projectRows[0];
    if (project === undefined) return { ok: true, project: null };

    // 4. Les 5 jalons, ordre canonique.
    const milestoneRows = await db
      .select({
        key: milestones.key,
        status: milestones.status,
        order: milestones.order,
        validatedAt: milestones.validatedAt,
      })
      .from(milestones)
      .where(eq(milestones.projectId, defaultProjectId))
      .orderBy(asc(milestones.order));

    return {
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        clientName: project.clientName,
        // `createdAt` : `defaultNow()` (jamais NULL en base) mais schéma sans
        // `.notNull()` → typage Drizzle `Date | null` re-plafonné sur `Date`.
        createdAt: project.createdAt ?? new Date(),
        milestones: milestoneRows,
      },
    };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500.
    console.error("[project] échec de lecture de la vue projet", error);
    throw error;
  }
}
