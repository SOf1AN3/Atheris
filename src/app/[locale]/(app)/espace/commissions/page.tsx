import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import {
  EarningsLedger,
  type EarningsLedgerItem,
  type EarningsLedgerLabels,
  type EarningsLedgerTotals,
} from "@/components/app/vendor/EarningsLedger";
import { TierGauge, type TierGaugeProps } from "@/components/app/vendor/TierGauge";
import { getTier, type CommissionTier } from "@/lib/commission";
import { getDb } from "@/lib/db";
import { commissions } from "@/lib/db/schema";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Mes gains » (vendeur) (FE-7 · T20 · structure.md §3.3).
 *
 * ─── VUE VENDEUR SEULEMENT ─────────────────────────────────────────────────
 * Pour un rôle ≠ `vendeur` (CEO / manager — la route RBAC `commissions`
 * admet ceo, manager, vendeur), la page rend un **bloc sobre** : titre de
 * nav + `common.noData`, **aucune donnée, aucun bouton de versement**.
 * LE REPLIER EST EXPLICITE : la file CEO « Commissions à verser » (queue,
 * sélection, `markPaidLot`) viendra en **FE-8**, le tableau de bord CEO en
 * **FE-10** — ne rien ajouter ici entre-temps.
 *
 * ─── SCOPING ───────────────────────────────────────────────────────────────
 * `WHERE beneficiary_id = $me` (la session serveur, jamais un paramètre
 * client) : un vendeur ne voit **que** ses lignes. Le `viewer` ne transite
 * jamais par le client (page server, lecture directe — pas d'action ici).
 *
 * ─── DÉCISION `paidCount` (documentée) ─────────────────────────────────────
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

  // -----------------------------------------------------------------------
  // Repli non-vendeur — bloc SOBRE, sans aucune action (voir en-tête §FE-8).
  // -----------------------------------------------------------------------
  if (role !== "vendeur") {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h1>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-fg">{dict.common.noData}</p>
          {/* Aucun bouton de versement ici : FE-8 (queue CEO) / FE-10 (dashboard). */}
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
