import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { desc, eq, sum } from "drizzle-orm";

import { auth } from "@/auth";
import {
  CommissionHistory,
  type CommissionHistoryItem,
  type CommissionHistoryLabels,
} from "@/components/app/commission/CommissionHistory";
import {
  CommissionQueue,
  type CommissionQueueItem,
  type CommissionQueueLabels,
} from "@/components/app/commission/CommissionQueue";
import {
  EarningsLedger,
  type EarningsLedgerItem,
  type EarningsLedgerLabels,
  type EarningsLedgerTotals,
} from "@/components/app/vendor/EarningsLedger";
import { TierGauge, type TierGaugeProps } from "@/components/app/vendor/TierGauge";
import type { CommissionStatus } from "@/content/platform/types";
import { getTier, type CommissionTier } from "@/lib/commission";
import { getDb } from "@/lib/db";
import { commissions, prospects, quotes, users } from "@/lib/db/schema";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Commissions » (FE-7 · T20 + FE-8 · T23/T24 · structure.md §3.3).
 *
 * ─── TROIS VUES SELON LE RÔLE (décision FE-8) ──────────────────────────────
 * - `vendeur` : « Mes gains » scopé `WHERE beneficiary_id = $me` (FE-7, inchangé) ;
 * - `ceo` : **file de versement** (`CommissionQueue` : sélection multi +
 *   `markCommissionsPaid`) + **historique** (`CommissionHistory`) sur TOUTES
 *   les lignes, avec les infos deal (JOIN `quotes` → `prospects`) ;
 * - `manager` : **MÊME SELECT, lecture seule** — aucun bouton de versement,
 *   aucun checkbox (décision validée : Rayan n'a que la lecture des
 *   candidatures/commissions) ;
 * - `client` : `notFound()` (route RBAC `commissions` exclut déjà `client` et
 *   `commercial` côté middleware).
 *
 * ─── SCOPING ────────────────────────────────────────────────────────────────
 * La page lit directement en RSC (aucune Server Action de lecture) : les
 * conditions portent la session serveur, jamais un paramètre client. Le
 * versement, lui, passe par `@/actions/ceo` (acteur reconstruit côté serveur)
 * puis par l'action figée `markCommissionsPaid` (CEO seul, ids `due`).
 *
 * ─── AGRÉGATS CEO ───────────────────────────────────────────────────────────
 * `totalDueCents` / `count` = Σ et nombre des lignes `due` **complètement**
 * fetchées (SELECT sans limite) ; lignes à `beneficiaryId NULL` comptées dans
 * le total mais signalées par `orphanCount` (bannière `noBeneficiary`,
 * checkboxes désactivées côté client — jamais de versement sans bénéficiaire).
 * L'historique affiche les **50 dernières** lignes `paid`, mais son total
 * `paidCents` est un `SUM()` SQL sur TOUTES les lignes versées.
 *
 * ─── DÉCISION `paidCount` (documentée — vue vendeur) ───────────────────────
 * `paidCount = COUNT(DISTINCT quote_id)` sur les lignes `kind = 'seller'` du
 * vendeur, **indépendamment de `due`/`paid`** : le palier se base sur les
 * deals **ayant déclenché une commission** (i.e. acompte payé / prospect
 * `client_actif` chez `generateCommissionsForQuote`), pas sur l'état du
 * versement — sinon le palier affiché serait retardé par un simple délai
 * de trésorerie. Cohérent avec la génération, qui compte les deals
 * `client_actif` **hors devis courant**.
 * Le décompte est fait en JS sur les lignes déjà fetchées (équivalent exact
 * du `COUNT(DISTINCT …)` SQL, une seule requête, même périmètre `WHERE`).
 *
 * PALIERS (getTier, `@/lib/commission` — figé, client-safe) :
 * 100 = 10 % (0-4) · 125 = 12,5 % (5-9) · 150 = 15 % (10-19) · 200 = 20 % (20+).
 * `nextTierAt` = seuil du palier supérieur (5 | 10 | 20), `null` si 20+.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur du composant (lazy) —
 * couplé à `force-dynamic`, `next build` ne lit jamais `DATABASE_URL`.
 */

/** Seuils des paliers suivants, indexés sur le palier courant (dixièmes). */
const NEXT_TIER: Record<CommissionTier, { at: number; rate: CommissionTier } | null> = {
  100: { at: 5, rate: 125 },
  125: { at: 10, rate: 150 },
  150: { at: 20, rate: 200 },
  200: null,
};

/**
 * ⚠ CLÉ DICTIONNAIRE MANQUANTE (dict verrouillé — listée en restitution,
 * jamais créée) : aucune clé « Réf deal » dans `commissions.*` → repli
 * local bilingue **documenté** (même arbitrage que FE-5 `NEW_PROSPECT_LABEL`).
 */
const REFERENCE_LABEL: Record<Locale, string> = {
  fr: "Réf deal",
  en: "Deal ref",
};

/** Nombre de lignes de l'historique affiché (50 derniers versements). */
const HISTORY_LIMIT = 50;

/**
 * ⚠ CLÉS DICTIONNAIRE MANQUANTES FE-8 (dict verrouillé — listées en
 * restitution, jamais créées) : `commissions.beneficiary`,
 * `commissions.deal` et `commissions.selectedCount` n'existent pas →
 * replis bilingues documentés (même arbitrage que `REFERENCE_LABEL` ci-dessus
 * et `NEW_PROSPECT_LABEL` FE-5). Tous les autres libellés viennent du dict
 * (`commissions.*`, `common.*`).
 */
const BENEFICIARY_LABEL: Record<Locale, string> = {
  fr: "Bénéficiaire",
  en: "Beneficiary",
};

/** Colonne « Deal » (nom du prospect + montant du devis). */
const DEAL_LABEL: Record<Locale, string> = { fr: "Deal", en: "Deal" };

/** Compteur de sélection de la file — `{count}` remplacé côté client. */
const SELECTED_COUNT_TEMPLATE: Record<Locale, string> = {
  fr: "{count} sélectionné(s)",
  en: "{count} selected",
};

/** Taux en dixièmes → libellé localisé (125 → « 12,5 % » / « 12.5% »). */
function formatRate(rateTenths: number, locale: Locale): string {
  const tag = locale === "fr" ? "fr-FR" : "en-US";
  return new Intl.NumberFormat(tag, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(rateTenths / 1000);
}

/**
 * Format de date UNIQUE des deux côtés de la frontière RSC (même helper que
 * `prospects/page.tsx`) : formaté côté server, transmis en **string** —
 * aucun décalage d'hydratation, fuseau `Africa/Algiers` (spec T02).
 */
function formatDate(value: Date | null | undefined, locale: Locale): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(value);
}

/** Titre de la page : label de nav du rôle (pattern repris de FE-5). */
function resolvePageTitle(
  dict: Awaited<ReturnType<typeof getPlatformDictionary>>,
  role: "ceo" | "manager" | "vendeur",
): string {
  return (
    dict.nav[role].find((item) => item.href === "/espace/commissions")?.label ??
    dict.commissions.myEarnings
  );
}

type CommissionsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CommissionsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.commissions.myEarnings };
}

export default async function CommissionsPage({
  params,
}: CommissionsPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  const role = session.user.role;
  // RBAC route : `/prospects`-style, le `client` n'accède pas à `/commissions`.
  if (role === "client") notFound();

  const dict = await getPlatformDictionary(locale);
  const title = resolvePageTitle(dict, role === "commercial" ? "ceo" : role);

  if (role !== "vendeur") {
    // ---------------------------------------------------------------------
    // Vue CEO / manager (FE-8) — file de versement + historique sur TOUTES
    // les lignes, avec les infos deal (JOIN `quotes` → `prospects`).
    // `manager` : MÊME SELECT mais **lecture seule** (aucun bouton, aucun
    // checkbox — décision validée, voir en-tête).
    // ---------------------------------------------------------------------
    if (role === "ceo" || role === "manager") {
      const readOnly = role !== "ceo";
      const db = getDb();

      let dueRows: Awaited<ReturnType<typeof selectCeoCommissions>>;
      let paidRows: Awaited<ReturnType<typeof selectCeoCommissions>>;
      let totalPaidCents: number;
      try {
        [dueRows, paidRows, totalPaidCents] = await Promise.all([
          // File : TOUTES les lignes `due` (SELECT sans limite).
          selectCeoCommissions(db, "due"),
          // Historique : 50 derniers versements (total réel = agrégat SQL).
          selectCeoCommissions(db, "paid", HISTORY_LIMIT),
          selectTotalPaidCents(db),
        ]);
      } catch (error) {
        // Erreur d'infra DB : journalisée puis propagée (500), jamais
        // présentée comme « aucune donnée » (cohérent avec FE-7).
        console.error("[commissions] échec de lecture de la file CEO", error);
        throw error;
      }

      // --- Agrégats : Σ `due` (SELECT complet) + lignes sans bénéficiaire ---
      let totalDueCents = 0;
      let orphanCount = 0;
      for (const row of dueRows) {
        totalDueCents += row.amountCents;
        if (row.beneficiaryId === null) orphanCount += 1;
      }

      const queueItems: CommissionQueueItem[] = dueRows.map((row) => ({
        id: row.id,
        beneficiaryName: row.beneficiaryName,
        prospectName: row.prospectName,
        quoteAmountCents: row.quoteAmountCents,
        rateLabel: formatRate(row.ratePercent, locale),
        amountCents: row.amountCents,
        generatedLabel: formatDate(row.createdAt, locale),
      }));

      const historyItems: CommissionHistoryItem[] = paidRows.map((row) => ({
        id: row.id,
        beneficiaryName: row.beneficiaryName,
        prospectName: row.prospectName,
        rateLabel: formatRate(row.ratePercent, locale),
        amountCents: row.amountCents,
        paidLabel: formatDate(row.paidAt, locale),
      }));

      // Libellés résolus ICI (frontière RSC : uniquement des strings au client).
      const sharedLabels = {
        beneficiary: BENEFICIARY_LABEL[locale],
        deal: DEAL_LABEL[locale],
      };

      const queueLabels: CommissionQueueLabels = {
        title: dict.commissions.queue,
        ...sharedLabels,
        tier: dict.commissions.tier.label,
        amount: dict.commissions.amount,
        generatedAt: dict.commissions.generatedAt,
        pending: dict.commissions.pending,
        noBeneficiary: dict.commissions.noBeneficiary,
        selectedCount: SELECTED_COUNT_TEMPLATE[locale],
        markPaidLot: dict.commissions.markPaidLot,
        lotConfirm: dict.commissions.lotConfirm,
        noClawback: dict.commissions.noClawbackWarning,
        markPaid: dict.commissions.markPaid,
        paid: dict.commissions.paid,
        cancel: dict.common.cancel,
        retry: dict.common.retry,
        noData: dict.common.noData,
      };

      const historyLabels: CommissionHistoryLabels = {
        title: dict.commissions.history,
        ...sharedLabels,
        rate: dict.commissions.rate,
        amount: dict.commissions.amount,
        paidAt: dict.commissions.paidAt,
        paid: dict.commissions.paid,
        noData: dict.common.noData,
      };

      return (
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h1>

          <CommissionQueue
            items={queueItems}
            totals={{ totalDueCents, count: dueRows.length }}
            orphanCount={orphanCount}
            readOnly={readOnly}
            labels={queueLabels}
          />

          <CommissionHistory
            items={historyItems}
            totals={{ paidCents: totalPaidCents }}
            labels={historyLabels}
          />
        </div>
      );
    }

    // ---------------------------------------------------------------------
    // Repli sobre conservé (FE-7) : `commercial` n'accède jamais à cette page
    // (`ROUTE_ACCESS.commissions` = ceo | manager | vendeur → middleware 404).
    // ---------------------------------------------------------------------
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h1>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-fg">{dict.common.noData}</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Vue vendeur — SES seules lignes (scoping serveur non contournable).
  // -----------------------------------------------------------------------
  const me = session.user.id;
  const db = getDb();

  let rows: Awaited<ReturnType<typeof selectMyCommissions>>;
  try {
    rows = await selectMyCommissions(db, me);
  } catch (error) {
    // Erreur d'infra DB : journalisée puis propagée (500), jamais présentée
    // comme « aucune donnée » (cohérent avec `listProspects`).
    console.error("[commissions] échec de lecture du registre vendeur", error);
    throw error;
  }

  // --- Agrégats : Σ due / Σ paid + décompte des deals (palier) -------------
  let pendingCents = 0;
  let paidCents = 0;
  const sellerQuoteIds = new Set<string>();

  for (const row of rows) {
    if (row.status === "due") pendingCents += row.amountCents;
    else paidCents += row.amountCents;
    // Décision documentée (en-tête) : palier = deals ayant déclenché une
    // commission vendeur, **sans distinction due/paid**.
    if (row.kind === "seller") sellerQuoteIds.add(row.quoteId);
  }
  const paidCount = sellerQuoteIds.size;

  // --- Palier (getTier — module pur figé, aucun calcul maison) -------------
  const currentTier = getTier(paidCount);
  const next = NEXT_TIER[currentTier];
  const currentRateLabel = formatRate(currentTier, locale);

  // Libellés résolus ICI (frontière RSC : uniquement des strings au client).
  const tierLabels: TierGaugeProps = {
    paidCount,
    nextTierAt: next?.at ?? null,
    title: dict.commissions.tier.label,
    currentLabel: dict.commissions.tier.current,
    currentRateLabel,
    // `{tier}` = seuil du palier suivant (« 5 » deals), `{rate}` = son taux.
    nextTierLabel:
      next === null
        ? ""
        : dict.commissions.tier.nextTier
            .replace("{tier}", String(next.at))
            .replace("{rate}", formatRate(next.rate, locale)),
    nextRateLabel: next === null ? "" : formatRate(next.rate, locale),
  };

  const ledgerTotals: EarningsLedgerTotals = { pendingCents, paidCents };

  const ledgerLabels: EarningsLedgerLabels = {
    pending: dict.commissions.pending,
    paid: dict.commissions.paid,
    rate: dict.commissions.rate,
    amount: dict.commissions.amount,
    status: dict.pipeline.columns.status,
    date: dict.commissions.generatedAt,
    reference: REFERENCE_LABEL[locale],
    noData: dict.common.noData,
  };

  const ledgerItems: EarningsLedgerItem[] = rows.map((row) => ({
    id: row.id,
    // Réf deal = uuid du devis tronqué (jamais de donnée sensible, juste un
    // identifiant technique d'affichage) ; le devis est `notNull` en schema.
    refLabel: row.quoteId.slice(0, 8),
    rateLabel: formatRate(row.ratePercent, locale),
    amountCents: row.amountCents,
    status: row.status,
    statusLabel: dict.statuses.commission[row.status],
    // Date affichée : versement si déjà versée, sinon génération.
    dateLabel: formatDate(row.paidAt ?? row.createdAt, locale),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h1>

      <TierGauge {...tierLabels} />

      <EarningsLedger items={ledgerItems} totals={ledgerTotals} labels={ledgerLabels} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lecture DB — isolée pour garder le corps de page lisible (même fichier,
// aucune Server Action : lecture RSC seule, scoping `WHERE beneficiary_id`).
// ---------------------------------------------------------------------------

/** Colonnes du registre vendeur (montants en cents, taux en dixièmes). */
async function selectMyCommissions(
  db: ReturnType<typeof getDb>,
  beneficiaryId: string,
) {
  return db
    .select({
      id: commissions.id,
      quoteId: commissions.quoteId,
      kind: commissions.kind,
      ratePercent: commissions.ratePercent,
      amountCents: commissions.amountCents,
      status: commissions.status,
      paidAt: commissions.paidAt,
      createdAt: commissions.createdAt,
    })
    .from(commissions)
    // SCOPING : la condition porte l'id de la SESSION serveur — jamais un
    // paramètre monté du client (pas de paramètre client sur cette page).
    .where(eq(commissions.beneficiaryId, beneficiaryId))
    .orderBy(desc(commissions.createdAt));
}

/**
 * Lignes de commissions **avec le contexte deal**, pour la vue CEO/manager
 * (FE-8) : `JOIN quotes → prospects` (nom du prospect + montant du devis) et
 * `LEFT JOIN users` (bénéficiaire facultatif — `beneficiaryId NULL` → ligne
 * orpheline, signalée à l'affichage, jamais versée).
 *
 * Aucune condition de rôle ici (page serveur déjà filtrée par route RBAC) :
 * seule la lecture est faite — l'écriture passe obligatoirement par
 * `@/actions/ceo` puis l'action figée `markCommissionsPaid`.
 *
 * @param status `due` (file complète) ou `paid` (historique).
 * @param limit Dernières lignes à renvoyer (`undefined` = tout).
 */
async function selectCeoCommissions(
  db: ReturnType<typeof getDb>,
  status: CommissionStatus,
  limit?: number,
) {
  const query = db
    .select({
      id: commissions.id,
      ratePercent: commissions.ratePercent,
      amountCents: commissions.amountCents,
      createdAt: commissions.createdAt,
      paidAt: commissions.paidAt,
      beneficiaryId: commissions.beneficiaryId,
      beneficiaryName: users.name,
      prospectName: prospects.fullName,
      quoteAmountCents: quotes.amountUsdCents,
    })
    .from(commissions)
    .innerJoin(quotes, eq(commissions.quoteId, quotes.id))
    .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
    .leftJoin(users, eq(commissions.beneficiaryId, users.id))
    .where(eq(commissions.status, status));

  if (limit === undefined) {
    // File : ordre de génération, décroissant (les plus fraîches en tête).
    return query.orderBy(desc(commissions.createdAt));
  }
  // Historique : derniers versements d'abord.
  return query.orderBy(desc(commissions.paidAt)).limit(limit);
}

/**
 * Σ de **TOUTES** les commissions versées (agrégat SQL) — l'historique
 * n'affiche que les 50 dernières lignes mais son total ne doit pas être
 * tronqué. `Number()` absorbe le codec JSON de Neon (bigint → number|string).
 */
async function selectTotalPaidCents(db: ReturnType<typeof getDb>): Promise<number> {
  const rows = await db
    .select({ totalCents: sum(commissions.amountCents) })
    .from(commissions)
    .where(eq(commissions.status, "paid"))
    .limit(1);
  return Number(rows[0]?.totalCents ?? 0);
}
