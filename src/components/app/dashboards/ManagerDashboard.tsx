/**
 * Atheris — tableau de bord manager (FE-10 · T31 · PLAN.md §3.2).
 *
 * Composant **pur** (Server Component, aucun `"use client"`, aucun hook) :
 * props 100 % sérialisables — montants, taux et paliers sont **déjà
 * formatés côté serveur** par `espace/tableau-de-bord/page.tsx` ; les
 * libellés y sont résolus (100 % dict).
 *
 * STRUCTURE :
 * 1. **Classement des vendeurs** — tableau desktop (`hidden md:block`) +
 *    cartes mobiles (`md:hidden`, zéro scroll horizontal, DESIGN §12.3) :
 *    rang, nom, ajoutés, deals, conversion, palier (`tierRateTenths / 10`),
 *    commissions dues / versées ;
 * 2. **2 indicateurs** (`StatCard`) : totaux globaux dus / versés ;
 * 3. lien discret vers `/espace/commissions`.
 *
 * ⚠ LECTURE SEULE TOTALE — **aucun bouton de versement** : décision validée
 * par le Lead, le versement (`markCommissionsPaid`, `@/actions/commissions`)
 * reste réservé au CEO. Ce composant ne dépend d'aucune Server Action
 * d'écriture et ne peut en déclencher aucune.
 */

import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/app/common/StatCard";

/** Une ligne du classement — données brutes + libellés pré-formatés server. */
export type ManagerRankingItem = {
  userId: string;
  /** Rang d'affichage (1 = tête du classement, tri imposé par l'action). */
  rank: number;
  name: string;
  /** Prospects ajoutés (`funnel.added`). */
  added: number;
  /** Deals ayant déclenché une commission vendeur (`paidDealCount`). */
  dealCount: number;
  /** Taux de conversion, formaté server (« 33,3 % » ou « — »). */
  conversionLabel: string;
  /** Palier courant, formaté server (« 10 % » — `tierRateTenths / 1000`). */
  tierLabel: string;
  /** Commissions dues (format monétaire server). */
  dueLabel: string;
  /** Commissions versées (format monétaire server). */
  paidLabel: string;
};

/** Totaux globaux (Σ `due` / Σ `paid` + nombre de versements). */
export type ManagerDashboardTotals = {
  dueLabel: string;
  paidLabel: string;
  /** Compteur de versements, formaté server (template `{count}`). */
  paidCountLabel: string;
};

/** Libellés résolus server (100 % dict). */
export type ManagerDashboardLabels = {
  /** `dict.dashboard.perEmployee.title` — titre du classement. */
  title: string;
  /** Colonnes — `dict.dashboard.ranking.*` + `dict.pipeline.columns.name`. */
  rank: string;
  name: string;
  added: string;
  deals: string;
  conversion: string;
  /** `dict.commissions.tier.label`. */
  tier: string;
  /** `dict.commissions.pending`. */
  due: string;
  /** `dict.commissions.paid`. */
  paid: string;
  /** `dict.dashboard.queues.commissionsDue` — carte de total. */
  totalDue: string;
  /** `dict.commissions.paid` — carte de total. */
  totalPaid: string;
  /** Libellé du lien discret (label de nav `commissions`). */
  commissionsLink: string;
  /** `dict.common.noData` — classement vide. */
  noData: string;
};

export type ManagerDashboardProps = {
  ranking: ManagerRankingItem[];
  totals: ManagerDashboardTotals;
  /** `/${locale}/espace/commissions` (lien discret, lecture seule). */
  commissionsHref: string;
  labels: ManagerDashboardLabels;
};

const SECTION_TITLE_CLASS = "text-lg font-semibold tracking-[-0.015em] text-fg";
const EMPTY_CLASS =
  "rounded-xl border border-line bg-surface px-6 py-10 text-center text-[15px] font-semibold text-fg";
const TH_CLASS = "py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted";

/** Métrique d'une carte mobile (libellé + valeur tabulaire). */
function MobileMetric({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}

export function ManagerDashboard({
  ranking,
  totals,
  commissionsHref,
  labels,
}: ManagerDashboardProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------- 1. Classement vendeurs ----------------- */}
      <section aria-labelledby="manager-ranking-title" className="flex flex-col gap-4">
        <h2 id="manager-ranking-title" className={SECTION_TITLE_CLASS}>
          {labels.title}
        </h2>

        {ranking.length === 0 ? (
          <p className={EMPTY_CLASS}>{labels.noData}</p>
        ) : (
          <>
            {/* Desktop (≥ md) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH_CLASS}>{labels.rank}</th>
                    <th scope="col" className={TH_CLASS}>{labels.name}</th>
                    <th scope="col" className={TH_CLASS}>{labels.added}</th>
                    <th scope="col" className={TH_CLASS}>{labels.deals}</th>
                    <th scope="col" className={TH_CLASS}>{labels.conversion}</th>
                    <th scope="col" className={TH_CLASS}>{labels.tier}</th>
                    <th scope="col" className={TH_CLASS}>{labels.due}</th>
                    <th scope="col" className="py-3 text-xs font-medium uppercase tracking-wide text-muted">
                      {labels.paid}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((item) => (
                    <tr key={item.userId} className="border-b border-line last:border-0">
                      <td className="py-3 pr-4 text-sm font-semibold tabular-nums text-muted">
                        {item.rank}
                      </td>
                      <td className="py-3 pr-4 text-sm font-medium text-fg">{item.name}</td>
                      <td className="py-3 pr-4 text-sm tabular-nums text-muted">{item.added}</td>
                      <td className="py-3 pr-4 text-sm tabular-nums text-muted">{item.dealCount}</td>
                      <td className="py-3 pr-4 text-sm tabular-nums text-fg">{item.conversionLabel}</td>
                      <td className="py-3 pr-4 text-sm font-semibold tabular-nums text-fg">{item.tierLabel}</td>
                      <td className="py-3 pr-4 text-sm tabular-nums text-muted">{item.dueLabel}</td>
                      <td className="py-3 text-sm font-semibold tabular-nums text-fg">{item.paidLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile (< md) — cartes empilées, mêmes données, zéro scroll. */}
            <ul className="flex flex-col gap-3 md:hidden">
              {ranking.map((item) => (
                <li
                  key={item.userId}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold tabular-nums text-muted">
                        {item.rank}
                      </span>
                      <span className="truncate text-[15px] font-semibold text-fg">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                      {item.tierLabel}
                    </span>
                  </span>
                  <dl className="flex flex-col gap-1 text-xs">
                    <MobileMetric label={labels.added} value={item.added} />
                    <MobileMetric label={labels.deals} value={item.dealCount} />
                    <MobileMetric label={labels.conversion} value={item.conversionLabel} />
                    <MobileMetric label={labels.due} value={item.dueLabel} />
                    <MobileMetric label={labels.paid} value={item.paidLabel} />
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ------------------------- 2. Totaux (2 cartes) -------------------- */}
      {/* Pas de titre de section : les libellés des 2 cartes (`dues` /
          `versées`) portent déjà leur sémantique — évite un doublon de
          libellé avec la carte « à verser ». */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={labels.totalDue} value={totals.dueLabel} tone="danger" />
        <StatCard
          label={labels.totalPaid}
          value={totals.paidLabel}
          hint={totals.paidCountLabel}
          tone="success"
        />
      </div>

      {/* ------------------- 3. Lien discret (aucune action) --------------- */}
      {/* LECTURE SEULE validée : pas de bouton de versement ici — seul le
          CEO verse (`markCommissionsPaid`). Le lien ouvre la page en
          lecture/versement selon le rôle, sans déclencher aucune écriture. */}
      <div>
        <Button href={commissionsHref} variant="ghost" size="sm">
          {labels.commissionsLink}
        </Button>
      </div>
    </div>
  );
}
