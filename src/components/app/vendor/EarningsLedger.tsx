/**
 * Atheris — grand livre des gains sdr (FE-7 · T20 · DESIGN.md §12.2 §12.3).
 *
 * Composant **pur** (aucun `"use client"`, aucun hook, zéro import DB/i18n) :
 * props 100 % sérialisables — montants en **cents** (entiers) et libellés
 * déjà résolus côté serveur par `espace/commissions/page.tsx`.
 *
 * Structure :
 * 1. 2 cartes de totaux — « En attente » (Σ `due`) / « Versé » (Σ `paid`) ;
 * 2. tableau desktop (`hidden md:block`) + cartes mobiles (`md:hidden`,
 *    zéro scroll horizontal, §12.3) ;
 * 3. état vide → `common.noData` (sans CTA).
 *
 * Statuts (DESIGN §12.2, classes Tailwind **arbitraires en dur**) :
 * - `due`  → ambre `#F59E0B`, fond teinte à 12 % ;
 * - `paid` → vert `#34D399`, fond teinte à 12 %.
 * La couleur est doublée du **libellé** (« À verser » / « Versée ») : jamais
 * la couleur seule (WCAG 1.4.1).
 */

import { Inbox } from "lucide-react";

import type { CommissionStatus } from "@/content/platform/types";

/** Format monétaire USD imposé par la spec (montants en cents → dollars). */
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Convertit des cents entiers en libellé monétaire (`123456` → « $1,234.56 »). */
function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

/** Une ligne du registre — données brutes + libellés pré-formatés. */
export type EarningsLedgerItem = {
  id: string;
  /** Réf deal (uuid court du devis) **ou** date fallback si devis absent. */
  refLabel: string;
  /** Taux du palier appliqué, déjà formaté (« 12,5 % »). */
  rateLabel: string;
  /** Montant en cents (entier). */
  amountCents: number;
  status: CommissionStatus;
  /** Libellé du statut résolu server (`dict.statuses.commission`). */
  statusLabel: string;
  /** Date (génération ou versement) déjà formatée côté serveur. */
  dateLabel: string;
};

/** Totaux agrégés, en cents (entiers). */
export type EarningsLedgerTotals = {
  /** Σ des lignes `due` (en attente de versement). */
  pendingCents: number;
  /** Σ des lignes `paid`. */
  paidCents: number;
};

/** Libellés résolus server (dict) — tous des strings. */
export type EarningsLedgerLabels = {
  /** `dict.commissions.pending` — carte « En attente ». */
  pending: string;
  /** `dict.commissions.paid` — carte « Versé ». */
  paid: string;
  /** `dict.commissions.rate` — colonne « Palier/Taux ». */
  rate: string;
  /** `dict.commissions.amount` — colonne « Montant ». */
  amount: string;
  /** `dict.pipeline.columns.status` — colonne « Statut ». */
  status: string;
  /** `dict.commissions.generatedAt` — colonne « Date ». */
  date: string;
  /** `dict.commissions.dealRef` — colonne « Réf deal ». */
  reference: string;
  /** `dict.common.noData` — état vide. */
  noData: string;
};

export type EarningsLedgerProps = {
  items: EarningsLedgerItem[];
  totals: EarningsLedgerTotals;
  labels: EarningsLedgerLabels;
};

/**
 * Habillage d'un badge de statut commission — §12.2 :
 * radius 8px, 12px/600, padding 5px 10px, fond teinte 12 % + bordure 25 %.
 */
const STATUS_BADGE_CLASSES: Record<CommissionStatus, string> = {
  // DESIGN §12.2 — ambre `#F59E0B` (fond 12 %, bordure 25 %).
  due: "border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]",
  // DESIGN §12.2 — vert `#34D399` (fond 12 %, bordure 25 %).
  paid: "border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.12)] text-[#34D399]",
};

/** Badge de statut : couleur + libellé (jamais la couleur seule). */
function StatusBadge({ status, label }: { status: CommissionStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-lg border px-2.5 py-[5px] text-xs font-semibold ${STATUS_BADGE_CLASSES[status]}`}
    >
      {label}
    </span>
  );
}

/** Carte de total (En attente / Versé). */
function TotalCard({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-4">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="text-xl font-bold tabular-nums tracking-[-0.015em] text-fg">
        {formatCents(cents)}
      </span>
    </div>
  );
}

export function EarningsLedger({ items, totals, labels }: EarningsLedgerProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------ Cartes de totaux ------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TotalCard label={labels.pending} cents={totals.pendingCents} />
        <TotalCard label={labels.paid} cents={totals.paidCents} />
      </div>

      {/* ------------------------------------------ État vide -------------- */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <Inbox aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
          <p className="text-[15px] font-semibold text-fg">{labels.noData}</p>
        </div>
      ) : (
        <>
          {/* ---------------------------------- Desktop (≥ md) ------------ */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                {/* §12.3 : en-tête `micro` 12px/500 uppercase (défaut posé
                    par la couche `base` de globals.css). */}
                <tr className="border-b border-line">
                  <th scope="col" className="w-[26%] py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    {labels.reference}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    {labels.rate}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    {labels.amount}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    {labels.status}
                  </th>
                  <th scope="col" className="py-3 text-xs font-medium uppercase tracking-wide text-muted">
                    {labels.date}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4 text-sm font-medium text-fg">
                      {item.refLabel}
                    </td>
                    <td className="py-3 pr-4 text-sm tabular-nums text-muted">
                      {item.rateLabel}
                    </td>
                    <td className="py-3 pr-4 text-sm font-semibold tabular-nums text-fg">
                      {formatCents(item.amountCents)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={item.status} label={item.statusLabel} />
                    </td>
                    <td className="py-3 text-sm tabular-nums text-muted">
                      {item.dateLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------------------------------- Mobile (< md) ------------- */}
          {/* Cartes empilées : mêmes données, zéro scroll horizontal. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                    {item.refLabel}
                  </span>
                  <StatusBadge status={item.status} label={item.statusLabel} />
                </span>
                <span className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="tabular-nums">{item.rateLabel}</span>
                  <span className="text-[15px] font-semibold tabular-nums text-fg">
                    {formatCents(item.amountCents)}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-muted">{item.dateLabel}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
