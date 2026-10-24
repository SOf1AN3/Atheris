"use server";

/**
 * Atheris — Server Actions prospects : création anti-doublon + lecture scopée
 * (T14 · contrat C-5 · PLAN.md §Sécurité).
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
