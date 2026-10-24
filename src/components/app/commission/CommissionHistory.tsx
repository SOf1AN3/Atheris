/**
 * Atheris — historique des versements de commissions (FE-8 · T24 ·
 * structure.md §3.3).
 *
 * Composant **pur** (aucun `"use client"`, aucun hook, zéro import DB/i18n) :
 * props 100 % sérialisables — montants en **cents** (entiers) et libellés
 * déjà résolus côté serveur par `espace/commissions/page.tsx` (50 dernières
 * lignes `paid` + total réel de l'historique).
 *
 * Structure (miroir d'`EarningsLedger`, FE-7) :
 * 1. carte de total « Versée » (Σ `paid`) ;
 * 2. tableau desktop (`hidden md:block`) + cartes mobiles (`md:hidden`,
 *    zéro scroll horizontal, DESIGN §12.3) ;
 * 3. état vide → `common.noData` (sans CTA).
 *
 * Aucune action : le versement vit dans `CommissionQueue` (CEO seul) — ce
 * tableau est une vue de lecture pour CEO **et** manager (décision FE-8 :
 * le manager n'a que la lecture des commissions).
 */

import { Inbox } from "lucide-react";

/** Format monétaire USD imposé par la spec (montants en cents → dollars). */
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Convertit des cents entiers en libellé monétaire (`123456` → « $1,234.56 »). */
function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

/** Une ligne de l'historique — données brutes + libellés pré-formatés server. */
export type CommissionHistoryItem = {
  id: string;
  /** `users.name`, ou `null` (ligne générée sans bénéficiaire). */
  beneficiaryName: string | null;
  /** `prospects.fullName` — le « deal ». */
  prospectName: string;
  /** Taux appliqué, formaté server (« 12,5 % »). */
  rateLabel: string;
  /** Montant de la commission en cents. */
  amountCents: number;
  /** Date de versement, formatée server. */
  paidLabel: string;
};

/** Total de l'historique (Σ `paid` — agrégat SQL, pas seulement les 50 lignes). */
export type CommissionHistoryTotals = {
  paidCents: number;
};

/** Libellés résolus server (dict + replis listés par la page). */
export type CommissionHistoryLabels = {
  /** `dict.commissions.history` — titre de la section. */
  title: string;
  /** Colonne bénéficiaire (⚠ clé manquante : repli bilingue server). */
  beneficiary: string;
  /** Colonne « Deal » (⚠ clé manquante : repli bilingue server). */
  deal: string;
  /** `dict.commissions.rate` — colonne « Taux ». */
  rate: string;
  /** `dict.commissions.amount` — colonne « Montant ». */
  amount: string;
  /** `dict.commissions.paidAt` — colonne « Versée le ». */
  paidAt: string;
  /** `dict.commissions.paid` — carte de total. */
  paid: string;
  /** `dict.common.noData` — état vide. */
  noData: string;
};

export type CommissionHistoryProps = {
  items: CommissionHistoryItem[];
  totals: CommissionHistoryTotals;
  labels: CommissionHistoryLabels;
};

/** Carte de total « Versée ». */
function TotalCard({ label, cents }: { label: string; cents: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-4">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="text-xl font-bold tabular-nums tracking-[-0.015em] text-fg">
        {formatCents(cents)}
      </span>
    </div>
  );
}

export function CommissionHistory({
  items,
  totals,
  labels,
}: CommissionHistoryProps): React.JSX.Element {
  return (
    <section aria-labelledby="commission-history-title" className="flex flex-col gap-4">
      {/* ------------------------------------------- Titre + total --------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="commission-history-title"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {labels.title}
        </h2>
      </div>
      <TotalCard label={labels.paid} cents={totals.paidCents} />

      {/* --------------------------------------------------- État vide ----- */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <Inbox aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
          <p className="text-[15px] font-semibold text-fg">{labels.noData}</p>
        </div>
      ) : (
        <>
          {/* -------------------------------------- Desktop (≥ md) -------- */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                {/* §12.3 : en-tête `micro` 12px/500 uppercase (défaut posé
                    par la couche `base` de globals.css). */}
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    {labels.beneficiary}
                  </th>
                  <th
                    scope="col"
                    className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    {labels.deal}
                  </th>
                  <th
                    scope="col"
                    className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    {labels.rate}
                  </th>
                  <th
                    scope="col"
                    className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    {labels.amount}
                  </th>
                  <th
                    scope="col"
                    className="py-3 text-xs font-medium uppercase tracking-wide text-muted"
                  >
                    {labels.paidAt}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4 text-sm font-medium text-fg">
                      {item.beneficiaryName ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted">{item.prospectName}</td>
                    <td className="py-3 pr-4 text-sm tabular-nums text-muted">
                      {item.rateLabel}
                    </td>
                    <td className="py-3 pr-4 text-sm font-semibold tabular-nums text-fg">
                      {formatCents(item.amountCents)}
                    </td>
                    <td className="py-3 text-sm tabular-nums text-muted">
                      {item.paidLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------------------------------------- Mobile (< md) -------- */}
          {/* Cartes empilées : mêmes données, zéro scroll horizontal. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                    {item.beneficiaryName ?? "—"}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-fg">
                    {formatCents(item.amountCents)}
                  </span>
                </span>
                <span className="text-sm text-muted">{item.prospectName}</span>
                <span className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="tabular-nums">{item.rateLabel}</span>
                  <span className="tabular-nums">{item.paidLabel}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
