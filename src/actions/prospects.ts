"use server";

/**
 * Atheris — Server Actions prospects : création anti-doublon, lecture scopée
 * et sauvegarde du brief (T14 · contrat C-5 · FE-6 T19 · PLAN.md §Sécurité).
 *
 * CONTRAT C-5 (figé) :
 * - `createProspect(input, viewer)` → `{ ok: true; id }` |
 *   `{ ok: false; code: "duplicate" | "forbidden" | "invalid" }` ;
 * - `listProspects(filters, viewer)` → `{ items, total }` (jamais d'erreur
 *   métier : un rôle sans droits reçoit `{ items: [], total: 0 }`).
 *
 * CHOIX DU `viewer` : `{ id, role }` est fourni par l'**appelant** (les pages
 * chargent la session eux-mêmes) — **aucun appel `auth()` ici**, conformément
 * au contrat. Conséquence de sécurité : TOUTE page/route appelant ces actions
 * doit passer un viewer issu de `await auth()` côté serveur, jamais une valeur
 * montée du client (les arguments de Server Action voyagent dans la requête
 * POST). En complément, le viewer est revalidé ici (uuid + enum rôle) : un
 * viewer forgé est refusé (`invalid` / `forbidden` / liste vide), il ne peut
 * pas débloquer un scoping.
 *
 * CODES SANS MESSAGE : uniquement des codes bruts (`duplicate`, `forbidden`,
 * `invalid`), i18nalisés côté client en T09 — jamais de message i18n ici.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des fonctions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 *
 * ANTI-DOUBLON « DOUBLE FILET » :
 *  1. SELECT `WHERE email_norm = $1 OR phone_norm = $2` avant insertion ;
 *  2. repli sur l'erreur d'index unique PostgreSQL `23505` (course entre le
 *     SELECT et l'INSERT) → même code `duplicate`.
 * Aucun des deux chemins ne renvoie la moindre coordonnée du prospect
 * existant (pas de fuite).
 */

import { type SQL, and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  activities,
  prospectBriefs,
  prospectSourceEnum,
  prospects,
  prospectStatusEnum,
  roleEnum,
} from "@/lib/db/schema";
import { canViewAllProspects, type ProspectStatus, type Role } from "@/lib/permissions";
import { dedupKey, normalizePhone } from "@/lib/prospect-dedup";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout traitement.
// ---------------------------------------------------------------------------

const roleSchema = z.enum(roleEnum.enumValues);
const prospectStatusSchema = z.enum(prospectStatusEnum.enumValues);
const viewerIdSchema = z.uuid();
const viewerSchema = z.object({ id: viewerIdSchema, role: roleSchema });

const createProspectSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  // Même motif que `src/actions/auth.ts` : trim + minuscules puis validation.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // ≥ 8 chiffres après normalisation : garantit un `phone_norm` jamais vide
  // (l'index UNIQUE `prospects_phone_norm_idx` traiterait sinon deux vides
  // comme un doublon) et écarte les saisies « abcd ».
  phone: z.string().trim().min(1).refine((value) => normalizePhone(value).length >= 8),
  // Pas de colonne `note` sur `prospects` : la note est tracée dans le meta
  // de l'activité `prospect.created` (voir plus bas).
  note: z.string().trim().max(2000).optional(),
  // Champ-piège anti-robot : doit rester vide.
  honeypot: z.string().trim().max(200).optional(),
});

const listFiltersSchema = z.object({
  status: z.array(prospectStatusSchema).max(10).optional(),
  q: z.string().trim().max(120).optional(),
  /** Offset (nb de lignes déjà consommées) — voir doc de `listProspects`. */
  cursor: z.number().int().min(0).max(1_000_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat C-5) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Canal d'acquisition d'un prospect, dérivé de l'enum `prospect_source`. */
export type ProspectSource = (typeof prospectSourceEnum.enumValues)[number];

/** Identité du spectateur, chargée depuis la session par la page appelante. */
export type ProspectViewer = { id: string; role: Role };

/** Entrée de `createProspect` (dérivée du schéma Zod). */
export type CreateProspectInput = z.input<typeof createProspectSchema>;

/** Contrat de `createProspect` (union discriminée par `ok`). */
export type CreateProspectResult =
  | { ok: true; id: string }
  | { ok: false; code: "duplicate" | "forbidden" | "invalid" };

/** Filtres de `listProspects` (dérivés du schéma Zod). */
export type ProspectListFilters = z.input<typeof listFiltersSchema>;

/** Une ligne du tableau prospects côté client. */
export type ProspectListItem = {
  id: string;
  fullName: string;
  company: string | null;
  email: string;
  status: ProspectStatus;
  source: ProspectSource;
  sourceUserId: string | null;
  nextReminderAt: Date | null;
  /**
   * `updated_at` est nullable côté schéma (pas de `.notNull()` — colonne
   * `defaultNow()` + `$onUpdate`) : typé `Date | null` pour rester exact ;
   * jamais nulle en pratique.
   */
  updatedAt: Date | null;
};

/** Contrat de `listProspects`. */
export type ProspectListResult = {
  items: ProspectListItem[];
  total: number;
};

// ---------------------------------------------------------------------------
// Règles métier locales.
// ---------------------------------------------------------------------------

/** Rôles habilités à créer un prospect (le `client` est exclu). */
const CREATE_ROLES: readonly Role[] = ["ceo", "manager", "commercial", "vendeur"];

/**
 * Source du prospect dérivée DU RÔLE de l'auteur (jamais d'un champ envoyé
 * par le client — la source n'est pas falsifiable) :
 * - `vendeur`  → `"ldg"`   (prospecteur terrain) ;
 * - `manager`  → `"rayan"` (portefeuille Rayan) ;
 * - `ceo` / `commercial` → `"ceo"`.
 *
 * Les canaux `ads` et `landing` n'ont pas d'auteur interne : ils entrent par
 * d'autres portes (T23 formulaire de contact, T34 import landing) avec
 * `sourceUserId = NULL` — jamais par cette action.
 */
function deriveSource(role: Role): ProspectSource {
  if (role === "vendeur") return "ldg";
  if (role === "manager") return "rayan";
  return "ceo";
}

/**
 * Détecte une violation d'index UNIQUE PostgreSQL (`23505`) sur le chemin
 * d'une erreur éventuellement enveloppée par le driver/Drizzle : on remonte
 * la chaîne `cause` (5 niveaux max) plutôt que de dépendre d'un type précis
 * (`NeonDbError`).
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current !== "object") return false;
    const code = (current as { code?: unknown }).code;
    if (code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Échappe les métacaractères LIKE (`%`, `_`, `\`) : la recherche `q` est
 * littérale. Le motif reste un **paramètre lié** (`$1`) — aucune
 * concaténation de chaîne dans le SQL, aucune injection possible.
 */
function toIlikePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Rôle validé (enum DB) ou `null` si absent/forgé. */
function parseViewerRole(viewer: ProspectViewer): Role | null {
  // `?.` défensif : un appel de Server Action forgé sans 2ᵉ argument ne doit
  // pas lever de TypeError mais être refusé proprement.
  const parsed = roleSchema.safeParse(viewer?.role);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// 1. createProspect — création anti-doublon.
// ---------------------------------------------------------------------------

/**
 * Crée un prospect (rôle interne uniquement) avec double filet anti-doublon.
 *
 * @param input Coordonnées validées par Zod (`fullName`, `email`, `phone`
 *   requis ; `company`, `note`, `honeypot` optionnels).
 * @param viewer `{ id, role }` chargé depuis la session par l'appelant
 *   (revalidé ici : uuid + enum rôle).
 * @returns `{ ok: true; id }` ; sinon `duplicate` (email ou téléphone déjà
 *   présent en base — **sans jamais révéler les coordonnées existantes**),
 *   `forbidden` (rôle non habilité ou inconnu), `invalid` (entrée malformée,
 *   viewer forgé ou honeypot rempli).
 * @throws Erreur d'infra non liée au doublon (DB indisponible…) — journalisée
 *   puis propagée → 500, jamais masquée derrière un code métier.
 */
export async function createProspect(
  input: CreateProspectInput,
  viewer: ProspectViewer,
): Promise<CreateProspectResult> {
  // 1. Validation Zod de l'entrée — avant tout accès DB.
  const parsed = createProspectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  // 2. Droit d'écriture : rôle valide mais non habilité (ou rôle forgé).
  const role = parseViewerRole(viewer);
  if (role === null || !CREATE_ROLES.includes(role)) return { ok: false, code: "forbidden" };

  // 3. Viewer : id doit être un uuid (sourceUserId FK) — sinon entrée forgée.
  if (!viewerIdSchema.safeParse(viewer?.id).success) return { ok: false, code: "invalid" };

  const { fullName, company, email, phone, note, honeypot } = parsed.data;

  // 4. Champ-piège rempli (robot) : refus, aucune écriture DB.
  if (honeypot !== undefined && honeypot.length > 0) return { ok: false, code: "invalid" };

  const { emailNorm, phoneNorm } = dedupKey({ email, phone });
  const source = deriveSource(role);

  const db = getDb();

  try {
    // FILET 1 — SELECT préalable sur les formes normalisées : on refuse
    // avant toute insertion si une ligne existe déjà sur l'email OU le
    // téléphone. Paramètres liés, jamais de concaténation SQL.
    const existing = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(or(eq(prospects.emailNorm, emailNorm), eq(prospects.phoneNorm, phoneNorm)))
      .limit(1);

    if (existing.length > 0) {
      // Aucune donnée du prospect existant dans le retour ni dans le journal.
      console.warn("[prospects] création refusée : doublon email/téléphone (détails non journalisés)");
      return { ok: false, code: "duplicate" };
    }

    let prospectId: string;
    try {
      const inserted = await db
        .insert(prospects)
        .values({
          fullName,
          company: company !== undefined && company.length > 0 ? company : null,
          email,
          phone,
          emailNorm,
          phoneNorm,
          source,
          sourceUserId: viewer.id,
          status: "nouveau",
        })
        .returning({ id: prospects.id });

      const returnedId = inserted[0]?.id;
      if (returnedId === undefined) {
        throw new Error("createProspect : insertion sans ligne retournée");
      }
      prospectId = returnedId;
    } catch (error) {
      // FILET 2 — course possible entre le SELECT et l'INSERT : l'index
      // unique `prospects_email_norm_idx` / `prospects_phone_norm_idx`
      // lève `23505` → même code, mêmes garanties de non-fuite.
      if (isUniqueViolation(error)) {
        console.warn("[prospects] création refusée : doublon détecté par l'index unique");
        return { ok: false, code: "duplicate" };
      }
      throw error;
    }

    // 5. Audit — requête séparée et NON FATALE : le prospect est déjà créé,
    // remonter une erreur ferait retenter le client sur un doublon. Une ligne
    // d'audit manquante est préférable à un 500 sur une création réussie
    // (choix assumé : driver `neon-http` sans `db.transaction()`, et pas de
    // `db.batch()` ici car l'`activities.entityId` dépend du RETURNING).
    try {
      await db.insert(activities).values({
        actorId: viewer.id,
        action: "prospect.created",
        entityType: "prospect",
        entityId: prospectId,
        meta: {
          source,
          actorId: viewer.id,
          // Pas de colonne `note` sur `prospects` : la note de saisie est
          // conservée dans le journal d'audit (meta jsonb).
          ...(note !== undefined && note.length > 0 ? { note } : {}),
        },
      });
    } catch (error) {
      console.error("[prospects] activité `prospect.created` non journalisée (prospect créé)", error);
    }

    return { ok: true, id: prospectId };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[prospects] échec de création de prospect", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 2. listProspects — lecture paginée, scoping serveur non contournable.
// ---------------------------------------------------------------------------

/**
 * Liste les prospects du pipeline : tri `updatedAt DESC`, pagination par
 * `cursor` (offset), `total` = nombre total de lignes filtrées.
 *
 * SCOPING SERVEUR (non contournable côté client) :
 * - `canViewAllProspects(role) === false` → clause `source_user_id = viewer.id`
 *   ajoutée **toujours** (rôle `vendeur`) ;
 * - `client` (ou viewer/rôles/filtres invalides) → `{ items: [], total: 0 }` :
 *   zéro donnée et **pas d'erreur**, pour ne pas révéler l'existence de quoi
 *   que ce soit.
 *
 * Filtres : `status` (tableau d'enum), `q` (ILIKE littéral sur `fullName`,
 * `company`, `email` — motif paramétré et échappé).
 *
 * @param cursor Offset (nb de lignes déjà consommées) ; `limit` défaut 20,
 *   plafond 100. Note : l'ordre `updatedAt DESC` peut se décaler entre deux
 *   pages si un prospect est modifié en parallèle — acceptable ici, la page
 *   raisonne en « instantané » (pas de clé de continuation opaque).
 * @param viewer `{ id, role }` chargé depuis la session par l'appelant.
 * @throws Erreur d'infra DB — journalisée puis propagée (500), jamais
 *   présentée comme « aucune donnée ».
 */
export async function listProspects(
  filters: ProspectListFilters,
  viewer: ProspectViewer,
): Promise<ProspectListResult> {
  // Validation stricte : toute entrée invalide → vide, jamais d'erreur.
  // `?.` défensif : un appel forgé sans 2ᵉ argument produit un parse en
  // échec → liste vide (aucune donnée révélée).
  const parsedViewer = viewerSchema.safeParse({ id: viewer?.id, role: viewer?.role });
  const parsedFilters = listFiltersSchema.safeParse(filters);
  if (!parsedViewer.success || !parsedFilters.success) return { items: [], total: 0 };

  const { id: viewerId, role } = parsedViewer.data;

  // `client` : aucun accès pipeline → vide (pas d'erreur qui confirmerait).
  // Rôle inconnu : déjà écarté par `roleSchema` ci-dessus.
  if (role === "client") return { items: [], total: 0 };

  const { status, q, cursor, limit } = parsedFilters.data;

  const conditions: SQL[] = [];

  // Scoping vendeur — ajouté systématiquement au-delà du plafond de lecture
  // globale : un vendeur ne voit QUE ses prospects, quel que soit le filtre.
  if (!canViewAllProspects(role)) conditions.push(eq(prospects.sourceUserId, viewerId));

  if (status !== undefined && status.length > 0) {
    conditions.push(inArray(prospects.status, status));
  }

  if (q !== undefined && q.length > 0) {
    const pattern = toIlikePattern(q);
    const qCondition = or(
      ilike(prospects.fullName, pattern),
      ilike(prospects.company, pattern),
      ilike(prospects.email, pattern),
    );
    if (qCondition !== undefined) conditions.push(qCondition);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();

  try {
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: prospects.id,
          fullName: prospects.fullName,
          company: prospects.company,
          email: prospects.email,
          status: prospects.status,
          source: prospects.source,
          sourceUserId: prospects.sourceUserId,
          nextReminderAt: prospects.nextReminderAt,
          updatedAt: prospects.updatedAt,
        })
        .from(prospects)
        .where(where)
        .orderBy(desc(prospects.updatedAt))
        .limit(limit ?? 20)
        .offset(cursor ?? 0),
      db.select({ total: count() }).from(prospects).where(where),
    ]);

    // `count(*)` revient parfois en string (int8) selon le driver : `Number()`
    // normalise sans jamais produire NaN ici (valeur absente → 0).
    const total = Number(totalRows[0]?.total ?? 0);

    return { items: rows, total };
  } catch (error) {
    console.error("[prospects] échec de lecture de la liste", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 3. saveBriefBlock — sauvegarde d'un bloc de la fiche projet (FE-6 · T19).
// ---------------------------------------------------------------------------

/**
 * Les 5 blocs de la fiche — miroir **local** de `BriefBlockKey`
 * (`src/content/platform/types.ts`, figé). Le serveur valide l'appartenance
 * d'une clé à un bloc, jamais son libellé i18n : le dictionnaire n'est jamais
 * lu ici (aucune dépendance au contenu).
 */
const BRIEF_BLOCK_KEYS = ["context", "need", "constraints", "tech", "followUp"] as const;

type BriefBlockKey = (typeof BRIEF_BLOCK_KEYS)[number];

/**
 * Miroir des clés de `dict.brief.fields.*` (dictionnaire verrouillé) : toute
 * clé absente de ce tableau est refusée (`invalid`) — le serveur ne fait
 * jamais confiance au client. Ajouter un champ au dict impose de le déclarer
 * ici en même temps (revue délibérée, jamais un refus silencieux).
 */
const ALLOWED_BRIEF_KEYS: Record<BriefBlockKey, readonly string[]> = {
  context: ["businessProblem", "productType"],
  need: ["scope", "targetUsers"],
  constraints: ["deadline", "budget", "decisionMakers", "references"],
  tech: ["forcedTech", "integrations", "hosting", "security"],
  followUp: ["nextStep", "reminderDate", "notes"],
};

/**
 * Rôles habilités à ÉCRIRE la fiche (le `vendeur` est en lecture seule côté
 * page, refusé ici) — identique au plafond d'écriture du pipeline.
 *
 * NOTE SÉCURITÉ (choix assumé) : **aucun contrôle `sourceUserId`** n'est
 * appliqué. Le brief est un outil de l'équipe commerciale (commercial /
 * manager / CEO) : un membre interne habilité peut renseigner la fiche de
 * n'importe quel prospect de l'entreprise, y compris porté par un autre
 * commercial. Le scoping vendeur (`source_user_id`) ne s'applique qu'à la
 * LISTE des prospects, pas à la fiche projet.
 */
const BRIEF_WRITE_ROLES: readonly Role[] = ["ceo", "manager", "commercial"];

const saveBriefBlockSchema = z.object({
  prospectId: z.uuid(),
  block: z.enum(BRIEF_BLOCK_KEYS),
  // 30 clés max × 2000 caractères : borne le payload d'un bloc (le serveur
  // revalide ensuite chaque clé contre `ALLOWED_BRIEF_KEYS`).
  data: z
    .record(z.string().max(128), z.string().max(2000))
    .refine((value) => Object.keys(value).length <= 30),
});

/** Entrée de `saveBriefBlock` (contrat T19). */
export type SaveBriefBlockInput = {
  prospectId: string;
  block: BriefBlockKey;
  data: Record<string, string>;
};

/** Contrat de `saveBriefBlock` (union discriminée par `ok`). */
export type SaveBriefBlockResult =
  | { ok: true; completedBlocks: number }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

/** Ligne de `prospect_briefs` (dérivée du schéma Drizzle, jamais recopiée). */
type ProspectBriefRow = typeof prospectBriefs.$inferSelect;

/** Insert partiel de `prospect_briefs`. */
type ProspectBriefInsert = typeof prospectBriefs.$inferInsert;

/**
 * Patch du bloc jsonb concerné — `switch` **exhaustif** plutôt qu'une clé
 * dynamique : TypeScript vérifie qu'ajouter un bloc au schéma fait échouer la
 * compilation ici (zéro index `[block]` non typé).
 */
function briefBlockPatch(
  block: BriefBlockKey,
  data: Record<string, string>,
): Partial<ProspectBriefInsert> {
  switch (block) {
    case "context":
      return { blockContext: data };
    case "need":
      return { blockNeed: data };
    case "constraints":
      return { blockConstraints: data };
    case "tech":
      return { blockTech: data };
    case "followUp":
      return { blockFollowUp: data };
  }
}

/**
 * Blocs renseignés = blocs portant **au moins 1 valeur non blanche après
 * trim** (les valeurs non-string héritées du jsonb sont ignorées).
 */
function countCompletedBlocks(
  blocks: Record<BriefBlockKey, Record<string, unknown>>,
): number {
  let completed = 0;
  for (const key of BRIEF_BLOCK_KEYS) {
    const hasValue = Object.values(blocks[key]).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
    if (hasValue) completed += 1;
  }
  return completed;
}

/** Extrait `completedBlocks` d'un RETURNING (garde anti-ligne absente). */
function completedFromRows(rows: { completedBlocks: number }[]): number {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("saveBriefBlock : écriture sans ligne retournée");
  }
  return row.completedBlocks;
}

/**
 * Sauvegarde UN bloc de la fiche projet (5 blocs, liaison 1-1 avec le
 * prospect) et recompte les blocs complétés.
 *
 * @param input `prospectId` (uuid), `block` (enum des 5 blocs), `data`
 *   (≤ 30 clés, valeurs ≤ 2000 caractères — chaque clé doit appartenir à
 *   `ALLOWED_BRIEF_KEYS[block]`, sinon `invalid`).
 * @param actor `{ id, role }` chargé depuis la session par la page appelante
 *   (revalidé ici : uuid + enum rôle — un actor forgé est refusé).
 * @returns `{ ok: true, completedBlocks }` ; sinon `forbidden` (rôle hors
 *   `ceo|manager|commercial`), `not_found` (prospect inexistant — même code
 *   si le brief n'existe pas encore : c'est le cas nominal d'upsert),
 *   `invalid` (entrée malformée, clé inconnue ou actor forgé).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 *
 * ATELIER (driver `neon-http`, constat DB-1) : **aucune `db.transaction()`**.
 * Séquence en requêtes séparées : SELECT prospect → SELECT brief →
 * INSERT/UPDATE (merge mémoire des 5 blocs) → audit non fatal. La ligne est
 * unique par `prospect_id` : le re-SELECT puis l'INSERT/UPDATE suivant sont
 * assez rapprochés ; une course sur un brief inexistant est rattrapée par le
 * repli unique (`23505`) → UPDATE. Le `completedBlocks` relu au RETURNING est
 * la valeur réellement écrite (merge des 5 blocs en mémoire, pas une valeur
 * envoyée par le client).
 *
 * L'audit `activities` (`brief.updated`) est **non fatal** : un brief déjà
 * enregistré ne doit pas être refait faute d'une ligne de journal manquante.
 */
export async function saveBriefBlock(
  input: SaveBriefBlockInput,
  actor: { id: string; role: Role },
): Promise<SaveBriefBlockResult> {
  // 1. Validation Zod de l'entrée — avant tout accès DB.
  const parsed = saveBriefBlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  // 2. Droit d'écriture : rôle valide mais non habilité (vendeur/client) ou
  //    rôle forgé (JWT ancien schéma) → refus identique, aucun détail.
  const parsedRole = roleSchema.safeParse(actor?.role);
  if (!parsedRole.success) return { ok: false, code: "forbidden" };
  const role = parsedRole.data;
  if (!BRIEF_WRITE_ROLES.includes(role)) return { ok: false, code: "forbidden" };

  // 3. Actor : id doit être uuid (FK `updated_by` / `actor_id`).
  if (!viewerIdSchema.safeParse(actor?.id).success) return { ok: false, code: "invalid" };

  const { prospectId, block, data } = parsed.data;

  // 4. Appartenance des clés au bloc (miroir du dict — pas de libellé lu ici).
  const allowedKeys = ALLOWED_BRIEF_KEYS[block];
  for (const key of Object.keys(data)) {
    if (!allowedKeys.includes(key)) return { ok: false, code: "invalid" };
  }

  const db = getDb();

  try {
    // 5. Le prospect doit exister (le brief lui est cascade 1-1).
    const prospectRows = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(eq(prospects.id, prospectId))
      .limit(1);
    if (prospectRows.length === 0) return { ok: false, code: "not_found" };

    // 6. Relecture de la ligne brief (merge mémoire des 5 blocs).
    const briefRows = await db
      .select()
      .from(prospectBriefs)
      .where(eq(prospectBriefs.prospectId, prospectId))
      .limit(1);
    const existing: ProspectBriefRow | undefined = briefRows[0];

    const merged: Record<BriefBlockKey, Record<string, unknown>> = {
      context: existing?.blockContext ?? {},
      need: existing?.blockNeed ?? {},
      constraints: existing?.blockConstraints ?? {},
      tech: existing?.blockTech ?? {},
      followUp: existing?.blockFollowUp ?? {},
    };
    merged[block] = data;
    const completedBlocks = countCompletedBlocks(merged);

    const patch: Partial<ProspectBriefInsert> = {
      ...briefBlockPatch(block, data),
      completedBlocks,
      updatedBy: actor.id,
    };

    let written: number;
    if (existing !== undefined) {
      const updated = await db
        .update(prospectBriefs)
        .set(patch)
        .where(eq(prospectBriefs.id, existing.id))
        .returning({ completedBlocks: prospectBriefs.completedBlocks });
      written = completedFromRows(updated);
    } else {
      try {
        const inserted = await db
          .insert(prospectBriefs)
          .values({ prospectId, ...patch })
          .returning({ completedBlocks: prospectBriefs.completedBlocks });
        written = completedFromRows(inserted);
      } catch (error) {
        // Course possible entre le SELECT et l'INSERT : l'index UNIQUE
        // `prospect_briefs_prospect_id_unique` lève `23505` → on passe en
        // UPDATE (la ligne existe maintenant), mêmes garanties.
        if (!isUniqueViolation(error)) throw error;
        const retried = await db
          .update(prospectBriefs)
          .set(patch)
          .where(eq(prospectBriefs.prospectId, prospectId))
          .returning({ completedBlocks: prospectBriefs.completedBlocks });
        written = completedFromRows(retried);
      }
    }

    // 7. Audit — séparé et NON FATAL (le brief est déjà enregistré ; une
    //    ligne d'audit manquante vaut mieux qu'un 500 sur une écriture juste).
    try {
      await db.insert(activities).values({
        actorId: actor.id,
        action: "brief.updated",
        entityType: "prospect",
        entityId: prospectId,
        meta: { block, completedBlocks: written, actorId: actor.id },
      });
    } catch (error) {
      console.error("[prospects] activité `brief.updated` non journalisée (brief enregistré)", error);
    }

    return { ok: true, completedBlocks: written };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[prospects] échec d'enregistrement du brief", error);
    throw error;
  }
}
