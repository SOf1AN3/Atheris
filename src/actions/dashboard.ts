"use server";

/**
 * Atheris — Server Actions des TABLEAUX DE BORD internes (T30-T32 · BK-7 ·
 * PLAN.md §3.2) : agrégats SQL **read-only** pour les 4 vues internes
 * (CEO, statistiques équipe, dashboard manager, dashboard commercial).
 *
 * ─── CONTRAT COMMUN ────────────────────────────────────────────────────────
 * Les 4 fonctions suivent le même gabarit :
 *   `getXDashboard(actor)` → `{ ok: true; data }` |
 *   `{ ok: false; code: "forbidden" | "invalid" }`.
 *
 * AUTH (règle absolue) : `actor` = `{ id, role }` construit **côté serveur**
 * par la page appelante depuis `await auth()` — JAMAIS reçu du client (les
 * arguments d'une Server Action voyagent dans la requête POST). Il est
 * revalidé ici par Zod (uuid + enum rôle) : un actor forgé → `invalid`, un
 * rôle hors de la liste admise → `forbidden`. Aucun appel `auth()` ici
 * (contrat C-5, même schéma que `src/actions/prospects.ts`).
 *
 * Toutes les fonctions sont **read-only** : aucune écriture DB, aucun
 * `db.batch`, aucune ligne `activities` insérée.
 *
 * CONVENTIONS (schéma figé) :
 * - montants en **centimes USD bruts** (formatage/UI côté FE-10) ;
 * - dates en `Date` (rendu de fuseau Africa/Algiers côté UI) ;
 * - division par zéro → `null` (jamais `NaN`/`Infinity`) ;
 * - toute liste porte une `LIMIT` ; zéro concaténation SQL : paramètres liés
 *   Drizzle uniquement, y compris l'extraction jsonb `meta->>'actorId'`.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des fonctions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  notInArray,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { getTier } from "@/lib/commission";
import { getDb, type Database } from "@/lib/db";
import {
  activities,
  commissions,
  payments,
  prospectBriefs,
  prospects,
  quotes,
  roleEnum,
  users,
} from "@/lib/db/schema";
import { canViewAllProspects, type ProspectStatus, type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const roleSchema = z.enum(roleEnum.enumValues);

/** Identité de l'appelant, chargée depuis la session par la page appelante. */
const actorSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
});

// ---------------------------------------------------------------------------
// Règles métier locales (listes figées — dérivées du type `ProspectStatus`).
// ---------------------------------------------------------------------------

/** Statuts ACTIFS pour la file des rappels : les sorties terminal et `clos`
 *  sont exclues (`perdu`, `disqualifie`, `clos` — PLAN.md §3.2 T30/T32). */
const REMINDER_EXCLUDED_STATUSES: ProspectStatus[] = [
  "perdu",
  "disqualifie",
  "clos",
];

/** Prospect « qualifié » (entonnoir équipe) : `qualifie` et au-delà, hors
 *  sorties négatives. */
const QUALIFIED_STATUSES: ProspectStatus[] = [
  "qualifie",
  "devis_envoye",
  "signe",
  "client_actif",
  "en_livraison",
  "clos",
];

/** Prospect « signé » : `signe` et au-delà. */
const SIGNED_STATUSES: ProspectStatus[] = [
  "signe",
  "client_actif",
  "en_livraison",
  "clos",
];

/** Deal « gagné » (KPI conversion CEO + CA généré équipe) : client en cours
 *  ou clos. */
const WON_STATUSES: ProspectStatus[] = ["client_actif", "en_livraison", "clos"];

/** Employés du classement/statistiques : `sdr` + `manager`
 *  (Rayan touche aussi le palier SDR — `src/lib/commission.ts` §6). Le
 *  `commercial` et le `ceo` n'entrent pas dans ce périmètre (spec T31). */
const EMPLOYEE_ROLES: readonly Role[] = ["sdr", "manager"];

/** Rôles habilités à lire les stats équipe et le dashboard manager. */
const MANAGER_VIEW_ROLES: readonly Role[] = ["ceo", "manager"];

/** Rôles internes admis sur le dashboard commercial — **aucun rôle interne
 *  n'est exclu** (la page filtrera l'affichage, spec T32) ; seul le portail
 *  `client` est refusé (`forbidden`) : aucune donnée pipeline ne doit fuiter
 *  vers un client. */
const SALES_VIEW_ROLES: readonly Role[] = ["ceo", "manager", "commercial", "sdr"];

/** Nombre maximal de lignes pour TOUTE liste renvoyée par ce module. */
const ACTIVITY_LIMIT = 5;
const REMINDERS_LIMIT = 10;
const BRIEFS_LIMIT = 10;
const RECENT_PROSPECTS_LIMIT = 5;
const EMPLOYEE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Identité de l'appelant, chargée depuis la session par la page appelante. */
export type DashboardActor = { id: string; role: Role };

/** Contrat de `getCeoDashboard` (T30 · PLAN.md §3.2). */
export type CeoDashboardResult =
  | { ok: true; data: CeoDashboardData }
  | { ok: false; code: "forbidden" | "invalid" };

/** Données du tableau de bord CEO : files d'attente + KPI + journal. */
export type CeoDashboardData = {
  queues: {
    /** Comptes `users.status = 'pending'` — **compte seulement**, jamais de
     *  liste de coordonnées dans ce module. */
    pendingApplications: number;
    /** Devis `sent` envoyés il y a ≥ 7 jours sans réponse. */
    quotesWaiting: number;
    /** Lignes `commissions.status = 'due'`. */
    commissionsDue: number;
    /** Lignes `due` **sans bénéficiaire** (`beneficiary_id IS NULL`). */
    commissionsOrphan: number;
    /** Rappels à venir proches (formule 20 h — voir `reminderCondition`). */
    remindersToday: number;
  };
  kpis: {
    /** Σ `payments.amount_usd_cents` WHERE `paid_at IS NOT NULL`. */
    collectedCents: number;
    /** Σ `quotes.amount_usd_cents` WHERE `status = 'sent'`. */
    pipelineValueCents: number;
    /** Nombre de devis au statut `sent` — **même périmètre** que
     *  `pipelineValueCents` (couple valeur + volume du pipeline ouvert). */
    quotesSent: number;
    /** Deals gagnés (`client_actif|en_livraison|clos`) / prospects créés
     *  × 100, à 1 décimale — **0 prospect → `null`** (jamais NaN). */
    conversionRate: number | null;
    /** Σ `commissions.amount_cents` WHERE `status = 'due'`. */
    commissionsDueCents: number;
    /** Σ `commissions.amount_cents` WHERE `status = 'paid'`. */
    commissionsPaidCents: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    /** `NULL` = action système (actor_id nul — cron/seed). */
    actorName: string | null;
    createdAt: Date;
    entityType: string;
  }>;
};

/** Contrat de `getEmployeeStats` (T31 · PLAN.md §3.2). */
export type EmployeeStatsResult =
  | { ok: true; data: EmployeeStatsRow[] }
  | { ok: false; code: "forbidden" | "invalid" };

/** Une ligne de statistiques par employé (`sdr`/`manager`). */
export type EmployeeStatsRow = {
  userId: string;
  name: string;
  funnel: {
    /** Prospects dont l'employé est `sourceUserId`. */
    added: number;
    /** Parmi `added` : statuts `QUALIFIED_STATUSES`. */
    qualified: number;
    /** Parmi `added` : statuts `SIGNED_STATUSES`. */
    signed: number;
    /** `signed / added × 100` à 1 décimale — 0 prospect → `null`. */
    conversionRate: number | null;
  };
  activity: {
    /** Changements de statut **provoqués par** l'employé
     *  (`activities.action = 'status.changed'` + `meta->>'actorId'`). */
    statusChanges: number;
    /** MAX(`activities.created_at`) où `actor_id = employé` — **proxy
     *  d'activité retenu** : `login_attempts` ne journalise QUE les échecs
     *  de connexion, il sous-estimerait systématiquement une équipe
     * connectée (choix documenté, spec T31). `null` = aucune activité. */
    lastActivityAt: Date | null;
  };
  profitability: {
    /** Σ devis des prospects de l'employé avec prospect `WON_STATUSES`. */
    generatedCents: number;
    /** Σ `commissions.amount_cents` WHERE `beneficiary_id = employé`. */
    commissionsCostCents: number;
    /** `generatedCents - commissionsCostCents` (peut être négatif sur une
     *  période où les commissions dépassent le CA signé — pas de clamp). */
    marginCents: number;
  };
};

/** Contrat de `getManagerDashboard` (T31 · PLAN.md §3.2). */
export type ManagerDashboardResult =
  | { ok: true; data: ManagerDashboardData }
  | { ok: false; code: "forbidden" | "invalid" };

/** Une ligne du classement des SDR (dashboard manager). */
export type ManagerRankingRow = {
  userId: string;
  name: string;
  added: number;
  qualified: number;
  /** **Mesure palier alignée FE-7 (cohérence obligatoire)** :
   *  `COUNT(DISTINCT commissions.quote_id)` WHERE `kind = 'seller'` ET
   *  `beneficiary_id = employé` — identique à la jauge de palier affichée
   *  côté SDR ; c'est cette même valeur qui alimente `getTier()` ici. */
  paidDealCount: number;
  /** `signed / added × 100` à 1 décimale — 0 prospect → `null`. */
  conversionRate: number | null;
  /** `getTier(paidDealCount)` — taux courant en **dixièmes de pourcentage**
   *  (100 = 10 %, 125 = 12,5 %…), barème figé `src/lib/commission.ts`. */
  tierRateTenths: number;
  /** Σ commissions du bénéficiaire, tous kinds (SDR **+** parts manager
   *  5 % si le bénéficiaire EST le manager), `status = 'due'`. */
  commissionsDueCents: number;
  /** Idem, `status = 'paid'`. */
  commissionsPaidCents: number;
};

/** Données du dashboard manager : classement + totaux globaux. */
export type ManagerDashboardData = {
  ranking: ManagerRankingRow[];
  totals: {
    /** Σ globale `commissions.amount_cents` WHERE `status = 'due'`. */
    dueCents: number;
    /** Σ globale WHERE `status = 'paid'`. */
    paidCents: number;
    /** `COUNT(*)` WHERE `status = 'paid'` — lecture seule : **aucune action
     *  manager de versement** (le versement est CEO, `markCommissionsPaid`). */
    paidCount: number;
  };
};

/** Contrat de `getSalesDashboard` (T32 · PLAN.md §3.2). */
export type SalesDashboardResult =
  | { ok: true; data: SalesDashboardData }
  | { ok: false; code: "forbidden" | "invalid" };

/** Données du dashboard commercial (rappels, briefs incomplets, récents). */
export type SalesDashboardData = {
  remindersToday: Array<{
    id: string;
    fullName: string;
    nextReminderAt: Date;
  }>;
  incompleteBriefs: Array<{
    /** id du **prospect** (liaison 1-1 du brief) — lien direct vers la fiche. */
    id: string;
    fullName: string;
    /** 0 à 4 : la fiche compte 5 blocs (spec T32). */
    completedBlocks: number;
  }>;
  recent: Array<{
    id: string;
    fullName: string;
    status: ProspectStatus;
    updatedAt: Date;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers partagés.
// ---------------------------------------------------------------------------

/**
 * Parse l'actor de façon défensive (`?.` : un appel de Server Action forgé
 * sans argument doit être refusé proprement, jamais lever de TypeError).
 *
 * @returns `{ id, role }` validés, ou `null` (→ code `invalid`).
 */
function parseActor(actor: DashboardActor): { id: string; role: Role } | null {
  const parsed = actorSchema.safeParse({ id: actor?.id, role: actor?.role });
  return parsed.success ? parsed.data : null;
}

/**
 * Normalise un compteur/une somme PostgreSQL : `count(*)` revient parfois en
 * `string` (int8) et `coalesce(sum(…), 0)` en `numeric` selon le driver —
 * `Number()` absorbe les deux sans jamais produire `NaN` ici (absence → 0).
 */
function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Taux en **% à 1 décimale** — division par zéro → `null` (règle du contrat :
 * jamais `NaN` ni `Infinity` côté dashboard).
 */
function computeRatePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Colonne `timestamptz DEFAULT NOW()` sans `.notNull()` (schéma Drizzle) :
 * typée `Date | null` mais **jamais nulle en pratique**. `null` (quasi
 * impossible) est ramené à l'époque plutôt que de lever une exception sur un
 * dashboard en lecture seule.
 */
function unwrapDate(value: Date | null): Date {
  return value ?? new Date(0);
}

/**
 * Condition « rappel dû » — **formule unique partagée CEO (T30) et
 * commercial (T32)** :
 *
 *   `next_reminder_at IS NOT NULL AND next_reminder_at <= now() + interval
 *   '20 hours' AND status NOT IN ('perdu','disqualifie','clos')`
 *
 * MARGE FUSEAU (documentée) : les timestamps sont stockés en **UTC** et le
 * métier raisonne en **Africa/Algiers (UTC+1)**. Une journée locale « D »
 * s'étend en UTC de `D 23:00` (J-1) à `D 23:00` : un rappel posé n'importe
 * où dans la journée locale courante est au plus ~24 h devant `now()`. La
 * marge retenue de **20 heures** couvre la quasi-totalité de la journée
 * locale à venir (y compris les rappels du soir) tout en ignorant les rappels
 * nettement post-datés (> J+1 matin) — arbitrage figé au PLAN §3.2 (T30).
 */
function reminderCondition(): SQL | undefined {
  // `and()` des 3 garde-fous — toujours non vide ici ; le type Drizzle reste
  // `SQL | undefined`, accepté tel quel par `.where(...)`.
  return and(
    isNotNull(prospects.nextReminderAt),
    lte(prospects.nextReminderAt, sql`now() + interval '20 hours'`),
    notInArray(prospects.status, REMINDER_EXCLUDED_STATUSES),
  );
}

/** Entonnoir mémorisé d'un employé (merge des requêtes groupées). */
type EmployeeFunnel = { added: number; qualified: number; signed: number };

/** Liste des employés (`sdr`/`manager`), triée par nom, bornée
 *  par `EMPLOYEE_LIMIT` (toute liste est LIMITée). */
async function loadEmployees(
  db: Database,
): Promise<Array<{ userId: string; name: string }>> {
  return db
    .select({ userId: users.id, name: users.name })
    .from(users)
    .where(inArray(users.role, EMPLOYEE_ROLES))
    .orderBy(asc(users.name), asc(users.id))
    .limit(EMPLOYEE_LIMIT);
}

/**
 * Entonnoir par employé : 3 requêtes groupées simples (`added`, `qualified`,
 * `signed`) — `Map<userId, funnel>` initialisée à zéro pour chaque employé.
 * Requêtes **paramétrées** partout (`inArray` → valeurs liées).
 */
async function loadEmployeeFunnel(
  db: Database,
  employeeIds: string[],
): Promise<Map<string, EmployeeFunnel>> {
  const funnel = new Map<string, EmployeeFunnel>();
  for (const id of employeeIds) funnel.set(id, { added: 0, qualified: 0, signed: 0 });

  const [addedRows, qualifiedRows, signedRows] = await Promise.all([
    db
      .select({ userId: prospects.sourceUserId, n: count() })
      .from(prospects)
      .where(inArray(prospects.sourceUserId, employeeIds))
      .groupBy(prospects.sourceUserId),
    db
      .select({ userId: prospects.sourceUserId, n: count() })
      .from(prospects)
      .where(
        and(
          inArray(prospects.sourceUserId, employeeIds),
          inArray(prospects.status, QUALIFIED_STATUSES),
        ),
      )
      .groupBy(prospects.sourceUserId),
    db
      .select({ userId: prospects.sourceUserId, n: count() })
      .from(prospects)
      .where(
        and(
          inArray(prospects.sourceUserId, employeeIds),
          inArray(prospects.status, SIGNED_STATUSES),
        ),
      )
      .groupBy(prospects.sourceUserId),
  ]);

  for (const row of addedRows) {
    const entry = row.userId === null ? undefined : funnel.get(row.userId);
    if (entry !== undefined) entry.added = toNumber(row.n);
  }
  for (const row of qualifiedRows) {
    const entry = row.userId === null ? undefined : funnel.get(row.userId);
    if (entry !== undefined) entry.qualified = toNumber(row.n);
  }
  for (const row of signedRows) {
    const entry = row.userId === null ? undefined : funnel.get(row.userId);
    if (entry !== undefined) entry.signed = toNumber(row.n);
  }

  return funnel;
}

// ---------------------------------------------------------------------------
// 1. getCeoDashboard — files + KPI + journal (T30 · PLAN.md §3.2).
// ---------------------------------------------------------------------------

/**
 * Tableau de bord CEO (rôle `ceo` **uniquement**).
 *
 * Agrégats (lecture seule, 12 SELECT simples en `Promise.all` — driver
 * `neon-http` sans transaction, inutile ici) :
 * - files : candidatures `pending`, devis `sent` > 7 jours, commissions
 *   `due` (dont orphelines sans bénéficiaire), rappels proches ;
 * - KPI : encaissé (`paid_at` renseigné), pipeline `sent`, taux de conversion
 *   (deals gagnés / prospects créés, `null` si 0 prospect), commissions
 *   dues/versées ;
 * - journal : 5 dernières `activities` LEFT JOIN `users` (`actorName`).
 *
 * @param actor `{ id, role }` construit côté serveur par la page appelante
 *   depuis `await auth()` (jamais monté du client — revalidé ici par Zod).
 * @returns `{ ok: true; data }` ; sinon `invalid` (actor forgé) ou
 *   `forbidden` (rôle ≠ `ceo`).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500, jamais
 *   transformée en code métier.
 */
export async function getCeoDashboard(actor: DashboardActor): Promise<CeoDashboardResult> {
  const parsedActor = parseActor(actor);
  if (parsedActor === null) return { ok: false, code: "invalid" };
  if (parsedActor.role !== "ceo") return { ok: false, code: "forbidden" };

  const db = getDb();

  try {
    const [
      pendingRows,
      quotesWaitingRows,
      commissionsDueRows,
      commissionsOrphanRows,
      remindersRows,
      collectedRows,
      pipelineRows,
      quotesSentRows,
      commissionsTotalsRows,
      wonRows,
      prospectsTotalRows,
      recentRows,
    ] = await Promise.all([
      // File candidatures — **compte seulement** (aucun détail de compte).
      db.select({ n: count() }).from(users).where(eq(users.status, "pending")),
      // Devis `sent` sans réponse depuis ≥ 7 jours.
      db
        .select({ n: count() })
        .from(quotes)
        .where(and(eq(quotes.status, "sent"), lte(quotes.sentAt, sql`now() - interval '7 days'`))),
      db.select({ n: count() }).from(commissions).where(eq(commissions.status, "due")),
      // Orphelins : `due` SANS bénéficiaire (bannière CEO, `beneficiary_id` nul).
      db
        .select({ n: count() })
        .from(commissions)
        .where(and(eq(commissions.status, "due"), isNull(commissions.beneficiaryId))),
      // Rappels proches — même formule que le dashboard commercial (T32).
      db.select({ n: count() }).from(prospects).where(reminderCondition()),
      // Encaissé : montants réellement payés (`paid_at` renseigné).
      db
        .select({ total: sql<number>`coalesce(sum(${payments.amountUsdCents}), 0)` })
        .from(payments)
        .where(isNotNull(payments.paidAt)),
      // Valeur du pipeline ouvert : devis `sent`.
      db
        .select({ total: sql<number>`coalesce(sum(${quotes.amountUsdCents}), 0)` })
        .from(quotes)
        .where(eq(quotes.status, "sent")),
      // Volume du pipeline ouvert — même périmètre que la valeur ci-dessus.
      db.select({ n: count() }).from(quotes).where(eq(quotes.status, "sent")),
      // Totaux commissions : dues + versées en une seule passe.
      db
        .select({
          dueCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'due'), 0)`,
          paidCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'paid'), 0)`,
        })
        .from(commissions),
      // Deals gagnés (numérateur du taux de conversion).
      db.select({ n: count() }).from(prospects).where(inArray(prospects.status, WON_STATUSES)),
      // Prospects créés (dénominateur — 0 → `conversionRate: null`).
      db.select({ n: count() }).from(prospects),
      // Journal : 5 dernières activités, LEFT JOIN (actor NULL = système).
      db
        .select({
          id: activities.id,
          action: activities.action,
          actorName: users.name,
          createdAt: activities.createdAt,
          entityType: activities.entityType,
        })
        .from(activities)
        .leftJoin(users, eq(activities.actorId, users.id))
        .orderBy(desc(activities.createdAt))
        .limit(ACTIVITY_LIMIT),
    ]);

    const wonCount = toNumber(wonRows[0]?.n);
    const prospectsTotal = toNumber(prospectsTotalRows[0]?.n);

    return {
      ok: true,
      data: {
        queues: {
          pendingApplications: toNumber(pendingRows[0]?.n),
          quotesWaiting: toNumber(quotesWaitingRows[0]?.n),
          commissionsDue: toNumber(commissionsDueRows[0]?.n),
          commissionsOrphan: toNumber(commissionsOrphanRows[0]?.n),
          remindersToday: toNumber(remindersRows[0]?.n),
        },
        kpis: {
          collectedCents: toNumber(collectedRows[0]?.total),
          pipelineValueCents: toNumber(pipelineRows[0]?.total),
          quotesSent: toNumber(quotesSentRows[0]?.n),
          conversionRate: computeRatePercent(wonCount, prospectsTotal),
          commissionsDueCents: toNumber(commissionsTotalsRows[0]?.dueCents),
          commissionsPaidCents: toNumber(commissionsTotalsRows[0]?.paidCents),
        },
        recentActivity: recentRows.map((row) => ({
          id: row.id,
          action: row.action,
          actorName: row.actorName,
          createdAt: unwrapDate(row.createdAt),
          entityType: row.entityType,
        })),
      },
    };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[dashboard] échec du tableau de bord CEO", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 2. getEmployeeStats — entonnoir + activité + rentabilité (T31).
// ---------------------------------------------------------------------------

/**
 * Statistiques par employé (`role IN ('sdr','manager')`) —
 * rôles `ceo|manager` **uniquement**.
 *
 * Par employé : entonnoir (`added` → `qualified` → `signed`), activité
 * (`statusChanges`, `lastActivityAt`) et rentabilité (CA généré, coût
 * commissions, marge). Tri `generatedCents DESC` (+ nom pour stabilité).
 *
 * POINTS MÉTIER DOCUMENTÉS :
 * - `statusChanges` filtre sur `meta->>'actorId'` (l'auteur DÉCLARÉ dans le
 *   jsonb de l'activité `status.changed`) via un fragment Drizzle `sql`
 *   **paramétré** — l'id ne sera jamais concaténé dans la chaîne SQL ;
 * - `lastActivityAt` = MAX(`activities.created_at`) de l'employé
 *   (`actor_id = employé`) : proxy d'activité retenu car `login_attempts`
 *   ne journalise que les **échecs** de connexion.
 *
 * @param actor `{ id, role }` construit côté serveur par la page appelante
 *   (revalidé ici par Zod).
 * @returns `{ ok: true; data }` (trié) ; sinon `invalid` / `forbidden`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getEmployeeStats(actor: DashboardActor): Promise<EmployeeStatsResult> {
  const parsedActor = parseActor(actor);
  if (parsedActor === null) return { ok: false, code: "invalid" };
  if (!MANAGER_VIEW_ROLES.includes(parsedActor.role)) return { ok: false, code: "forbidden" };

  const db = getDb();

  try {
    const employees = await loadEmployees(db);
    if (employees.length === 0) return { ok: true, data: [] };

    const employeeIds = employees.map((employee) => employee.userId);

    const [funnel, statusChangeRows, lastActivityRows, generatedRows, costRows] =
      await Promise.all([
        loadEmployeeFunnel(db, employeeIds),
        // Changements de statut PROVOQUÉS par l'employé : extraction jsonb
        // groupée, puis filtre mémoire sur les ids d'équipe (l'extraction
        // `->>` n'est pas une colonne : impossible d'utiliser `inArray` dessus).
        db
          .select({
            actorKey: sql<string | null>`${activities.meta} ->> 'actorId'`,
            n: count(),
          })
          .from(activities)
          .where(eq(activities.action, "status.changed"))
          .groupBy(sql`${activities.meta} ->> 'actorId'`),
        // Dernière activité journalisée par l'employé (colonne `actor_id`).
        db
          .select({ actorId: activities.actorId, lastActivityAt: max(activities.createdAt) })
          .from(activities)
          .where(inArray(activities.actorId, employeeIds))
          .groupBy(activities.actorId),
        // CA généré : devis des prospects de l'employé devenus clients.
        db
          .select({
            userId: prospects.sourceUserId,
            generatedCents: sql<number>`coalesce(sum(${quotes.amountUsdCents}), 0)`,
          })
          .from(quotes)
          .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
          .where(
            and(
              inArray(prospects.sourceUserId, employeeIds),
              inArray(prospects.status, WON_STATUSES),
            ),
          )
          .groupBy(prospects.sourceUserId),
        // Coût commissions pour l'entreprise (tous kinds, tous statuts).
        db
          .select({
            beneficiaryId: commissions.beneficiaryId,
            costCents: sql<number>`coalesce(sum(${commissions.amountCents}), 0)`,
          })
          .from(commissions)
          .where(inArray(commissions.beneficiaryId, employeeIds))
          .groupBy(commissions.beneficiaryId),
      ]);

    const statusChangesByEmployee = new Map<string, number>();
    for (const row of statusChangeRows) {
      if (row.actorKey === null) continue;
      const current = statusChangesByEmployee.get(row.actorKey) ?? 0;
      statusChangesByEmployee.set(row.actorKey, current + toNumber(row.n));
    }

    const lastActivityByEmployee = new Map<string, Date | null>();
    for (const row of lastActivityRows) {
      if (row.actorId !== null) lastActivityByEmployee.set(row.actorId, row.lastActivityAt);
    }

    const generatedByEmployee = new Map<string, number>();
    for (const row of generatedRows) {
      if (row.userId !== null) generatedByEmployee.set(row.userId, toNumber(row.generatedCents));
    }

    const costByEmployee = new Map<string, number>();
    for (const row of costRows) {
      if (row.beneficiaryId !== null) costByEmployee.set(row.beneficiaryId, toNumber(row.costCents));
    }

    const rows: EmployeeStatsRow[] = employees.map((employee) => {
      const funnelCounts = funnel.get(employee.userId) ?? { added: 0, qualified: 0, signed: 0 };
      const generatedCents = generatedByEmployee.get(employee.userId) ?? 0;
      const commissionsCostCents = costByEmployee.get(employee.userId) ?? 0;
      return {
        userId: employee.userId,
        name: employee.name,
        funnel: {
          added: funnelCounts.added,
          qualified: funnelCounts.qualified,
          signed: funnelCounts.signed,
          conversionRate: computeRatePercent(funnelCounts.signed, funnelCounts.added),
        },
        activity: {
          statusChanges: statusChangesByEmployee.get(employee.userId) ?? 0,
          lastActivityAt: lastActivityByEmployee.get(employee.userId) ?? null,
        },
        profitability: {
          generatedCents,
          commissionsCostCents,
          marginCents: generatedCents - commissionsCostCents,
        },
      };
    });

    rows.sort((a, b) => {
      if (b.profitability.generatedCents !== a.profitability.generatedCents) {
        return b.profitability.generatedCents - a.profitability.generatedCents;
      }
      return a.name.localeCompare(b.name);
    });

    return { ok: true, data: rows };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier.
    console.error("[dashboard] échec des statistiques équipe", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 3. getManagerDashboard — classement + totaux (T31 · PLAN.md §3.2).
// ---------------------------------------------------------------------------

/**
 * Dashboard manager : classement des SDR + totaux globaux des
 * commissions — rôles `ceo|manager` **uniquement**, 100 % lecture (aucune
 * action de versement ici : `markCommissionsPaid` reste CEO).
 *
 * **Mesure palier alignée FE-7 (cohérence obligatoire)** : `paidDealCount`
 * vaut `COUNT(DISTINCT commissions.quote_id)` WHERE `kind='seller'` ET
 * `beneficiary_id = employé` — strictement la mesure de la jauge de palier
 * affichée côté SDR ; la même valeur alimente `getTier()` ici, de sorte
 * que le taux affiché au manager est toujours celui du prochain deal du
 * SDR.
 *
 * Classement trié `paidDealCount DESC`, puis `conversionRate DESC` (les
 * `null` en fin de groupe), puis nom (stabilité).
 *
 * @param actor `{ id, role }` construit côté serveur par la page appelante
 *   (revalidé ici par Zod).
 * @returns `{ ok: true; data }` ; sinon `invalid` / `forbidden`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getManagerDashboard(
  actor: DashboardActor,
): Promise<ManagerDashboardResult> {
  const parsedActor = parseActor(actor);
  if (parsedActor === null) return { ok: false, code: "invalid" };
  if (!MANAGER_VIEW_ROLES.includes(parsedActor.role)) return { ok: false, code: "forbidden" };

  const db = getDb();

  try {
    const employees = await loadEmployees(db);

    if (employees.length === 0) {
      // Équipe vide : totaux globaux toujours renvoyés (lecture seule).
      const emptyTotals = await db
        .select({
          dueCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'due'), 0)`,
          paidCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'paid'), 0)`,
          paidCount: sql<number>`count(*) filter (where ${commissions.status} = 'paid')`,
        })
        .from(commissions);
      return {
        ok: true,
        data: {
          ranking: [],
          totals: {
            dueCents: toNumber(emptyTotals[0]?.dueCents),
            paidCents: toNumber(emptyTotals[0]?.paidCents),
            paidCount: toNumber(emptyTotals[0]?.paidCount),
          },
        },
      };
    }

    const employeeIds = employees.map((employee) => employee.userId);

    const [funnel, commissionRows, totalsRows] = await Promise.all([
      loadEmployeeFunnel(db, employeeIds),
      // Palier + montants par bénéficiaire, en une seule passe groupée.
      db
        .select({
          beneficiaryId: commissions.beneficiaryId,
          paidDealCount: sql<number>`count(distinct ${commissions.quoteId}) filter (where ${commissions.kind} = 'seller')`,
          dueCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'due'), 0)`,
          paidCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'paid'), 0)`,
        })
        .from(commissions)
        .where(inArray(commissions.beneficiaryId, employeeIds))
        .groupBy(commissions.beneficiaryId),
      // Totaux globaux (tous bénéficiaires, tous kinds).
      db
        .select({
          dueCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'due'), 0)`,
          paidCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'paid'), 0)`,
          paidCount: sql<number>`count(*) filter (where ${commissions.status} = 'paid')`,
        })
        .from(commissions),
    ]);

    const commissionByBeneficiary = new Map<
      string,
      { paidDealCount: number; dueCents: number; paidCents: number }
    >();
    for (const row of commissionRows) {
      if (row.beneficiaryId === null) continue;
      commissionByBeneficiary.set(row.beneficiaryId, {
        paidDealCount: toNumber(row.paidDealCount),
        dueCents: toNumber(row.dueCents),
        paidCents: toNumber(row.paidCents),
      });
    }

    const ranking: ManagerRankingRow[] = employees.map((employee) => {
      const funnelCounts = funnel.get(employee.userId) ?? { added: 0, qualified: 0, signed: 0 };
      const commission = commissionByBeneficiary.get(employee.userId) ?? {
        paidDealCount: 0,
        dueCents: 0,
        paidCents: 0,
      };
      return {
        userId: employee.userId,
        name: employee.name,
        added: funnelCounts.added,
        qualified: funnelCounts.qualified,
        paidDealCount: commission.paidDealCount,
        conversionRate: computeRatePercent(funnelCounts.signed, funnelCounts.added),
        // Même barème figé que la génération de commissions (dixièmes de %).
        tierRateTenths: getTier(commission.paidDealCount),
        commissionsDueCents: commission.dueCents,
        commissionsPaidCents: commission.paidCents,
      };
    });

    ranking.sort((a, b) => {
      if (b.paidDealCount !== a.paidDealCount) return b.paidDealCount - a.paidDealCount;
      const rateA = a.conversionRate;
      const rateB = b.conversionRate;
      if (rateA === null && rateB === null) return a.name.localeCompare(b.name);
      if (rateA === null) return 1;
      if (rateB === null) return -1;
      if (rateB !== rateA) return rateB - rateA;
      return a.name.localeCompare(b.name);
    });

    return {
      ok: true,
      data: {
        ranking,
        totals: {
          dueCents: toNumber(totalsRows[0]?.dueCents),
          paidCents: toNumber(totalsRows[0]?.paidCents),
          paidCount: toNumber(totalsRows[0]?.paidCount),
        },
      },
    };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier.
    console.error("[dashboard] échec du tableau de bord manager", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 4. getSalesDashboard — rappels, briefs incomplets, récents (T32).
// ---------------------------------------------------------------------------

/**
 * Dashboard commercial : rappels proches, briefs incomplets et derniers
 * prospects mis à jour.
 *
 * RÔLES : **aucun rôle interne n'est exclu** (`ceo`, `manager`, `commercial`,
 * `sdr`) — la page filtrera l'affichage selon le rôle ; seul le portail
 * `client` est refusé (`forbidden`) : aucune donnée pipeline (noms de
 * prospects, statuts) ne doit fuiter vers un client.
 *
 * SCOPING : seul `recent` est scopé — sans `canViewAllProspects(role)`, la
 * clause `source_user_id = actor.id` s'applique (sdr : ses prospects
 * uniquement, PLAN.md §Sécurité). `remindersToday` et `incompleteBriefs`
 * restent globaux (listes de travail d'équipe, spec T32 — le filtrage
 * d'affichage est porté par la page).
 *
 * @param actor `{ id, role }` construit côté serveur par la page appelante
 *   (revalidé ici par Zod).
 * @returns `{ ok: true; data }` ; sinon `invalid` / `forbidden`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getSalesDashboard(actor: DashboardActor): Promise<SalesDashboardResult> {
  const parsedActor = parseActor(actor);
  if (parsedActor === null) return { ok: false, code: "invalid" };
  if (!SALES_VIEW_ROLES.includes(parsedActor.role)) return { ok: false, code: "forbidden" };

  const db = getDb();

  try {
    // Scoping SDR sur `recent` uniquement (cf. doc de fonction).
    const recentConditions: SQL[] = [];
    if (!canViewAllProspects(parsedActor.role)) {
      recentConditions.push(eq(prospects.sourceUserId, parsedActor.id));
    }

    const [reminderRows, briefRows, recentRows] = await Promise.all([
      // Mêmes formule et statuts que la file CEO (T30) — tri `ASC` (les plus
      // urgents d'abord) et bornée à 10 lignes.
      db
        .select({
          id: prospects.id,
          fullName: prospects.fullName,
          nextReminderAt: prospects.nextReminderAt,
        })
        .from(prospects)
        .where(reminderCondition())
        .orderBy(asc(prospects.nextReminderAt))
        .limit(REMINDERS_LIMIT),
      // Briefs à compléter : 5 blocs au total → `completed_blocks < 5`.
      db
        .select({
          id: prospects.id,
          fullName: prospects.fullName,
          completedBlocks: prospectBriefs.completedBlocks,
        })
        .from(prospectBriefs)
        .innerJoin(prospects, eq(prospectBriefs.prospectId, prospects.id))
        .where(lt(prospectBriefs.completedBlocks, 5))
        // Les plus incomplets d'abord (tri déterministe avant LIMIT).
        .orderBy(asc(prospectBriefs.completedBlocks), asc(prospects.id))
        .limit(BRIEFS_LIMIT),
      // Derniers prospects mis à jour (scopé SDR si nécessaire).
      db
        .select({
          id: prospects.id,
          fullName: prospects.fullName,
          status: prospects.status,
          updatedAt: prospects.updatedAt,
        })
        .from(prospects)
        .where(recentConditions.length > 0 ? and(...recentConditions) : undefined)
        .orderBy(desc(prospects.updatedAt))
        .limit(RECENT_PROSPECTS_LIMIT),
    ]);

    return {
      ok: true,
      data: {
        remindersToday: reminderRows.map((row) => ({
          id: row.id,
          fullName: row.fullName,
          nextReminderAt: unwrapDate(row.nextReminderAt),
        })),
        incompleteBriefs: briefRows.map((row) => ({
          id: row.id,
          fullName: row.fullName,
          completedBlocks: toNumber(row.completedBlocks),
        })),
        recent: recentRows.map((row) => ({
          id: row.id,
          fullName: row.fullName,
          status: row.status,
          updatedAt: unwrapDate(row.updatedAt),
        })),
      },
    };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier.
    console.error("[dashboard] échec du tableau de bord commercial", error);
    throw error;
  }
}
