/**
 * Atheris — tableau de bord commercial (FE-10 · T32 · PLAN.md §3.2).
 *
 * Composant **pur** (Server Component, aucun `"use client"`, aucun hook) :
 * props 100 % sérialisables — dates **déjà formatées côté serveur** par
 * `espace/tableau-de-bord/page.tsx`, libellés résolus server (100 % dict),
 * badges de statut habillés par `PROSPECT_STATUS_META`
 * (`StatusBadge`) avec un label déjà traduit.
 *
 * ORDRE SPEC T32 :
 * 1. **Relances du jour** — liens vers les fiches prospects ;
 * 2. **Fiches incomplètes** — mini jauge `completedBlocks / 5` en accent
 *    (valeur ACTIVE : c'est le seul usage d'accent de la page, jamais
 *    décoratif) ;
 * 3. **Modifications récentes** — badge de statut + date.
 *
 * Chaque bloc gère son état vide (`common.noData`).
 */

import Link from "next/link";

import { StatusBadge } from "@/components/app/StatusBadge";
import type { ProspectStatus } from "@/lib/permissions";

/** Nombre de blocs de la fiche projet (structure.md §5.1 — 5 blocs imposés). */
const BRIEFS_TOTAL_BLOCKS = 5;

/** Une relance à venir (lien direct vers la fiche prospect). */
export type SalesReminderItem = {
  id: string;
  fullName: string;
  /** Date de rappel, formatée server. */
  dateLabel: string;
  /** `/${locale}/espace/prospects/{id}`. */
  href: string;
};

/** Une fiche brief incomplète (jauge `completedBlocks / 5`). */
export type SalesBriefItem = {
  id: string;
  fullName: string;
  /** 0 à 4 — `completedBlocks` de `prospect_briefs`. */
  completedBlocks: number;
  href: string;
};

/** Un prospect récemment modifié (statut + date). */
export type SalesRecentItem = {
  id: string;
  fullName: string;
  status: ProspectStatus;
  /** `dict.statuses.prospect[status]` — résolu server. */
  statusLabel: string;
  /** Date de mise à jour, formatée server. */
  dateLabel: string;
  href: string;
};

/** Libellés résolus server (100 % dict). */
export type CommercialDashboardLabels = {
  /** `dict.dashboard.queues.remindersToday`. */
  remindersTitle: string;
  /** `dict.dashboard.queues.incompleteBriefs`. */
  briefsTitle: string;
  /** `dict.dashboard.recentActivity`. */
  recentTitle: string;
  /** `dict.brief.gauge.blocksDone` — template `{done}/{total}`. */
  blocksDone: string;
  /** `dict.common.noData`. */
  noData: string;
};

export type CommercialDashboardProps = {
  reminders: SalesReminderItem[];
  briefs: SalesBriefItem[];
  recent: SalesRecentItem[];
  labels: CommercialDashboardLabels;
};

const SECTION_TITLE_CLASS = "text-lg font-semibold tracking-[-0.015em] text-fg";
const EMPTY_CLASS =
  "rounded-xl border border-line bg-surface px-6 py-10 text-center text-[15px] font-semibold text-fg";
const LINK_ROW_CLASS =
  "flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 transition-colors duration-150 hover:border-line-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

export function CommercialDashboard({
  reminders,
  briefs,
  recent,
  labels,
}: CommercialDashboardProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------- 1. Relances du jour ----------------- */}
      <section aria-labelledby="sales-reminders-title" className="flex flex-col gap-4">
        <h2 id="sales-reminders-title" className={SECTION_TITLE_CLASS}>
          {labels.remindersTitle}
        </h2>
        {reminders.length === 0 ? (
          <p className={EMPTY_CLASS}>{labels.noData}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reminders.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className={LINK_ROW_CLASS}>
                  <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                    {item.fullName}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">{item.dateLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------- 2. Fiches incomplètes ------------------- */}
      <section aria-labelledby="sales-briefs-title" className="flex flex-col gap-4">
        <h2 id="sales-briefs-title" className={SECTION_TITLE_CLASS}>
          {labels.briefsTitle}
        </h2>
        {briefs.length === 0 ? (
          <p className={EMPTY_CLASS}>{labels.noData}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {briefs.map((item) => {
              const blocksLabel = labels.blocksDone
                .replace("{done}", String(item.completedBlocks))
                .replace("{total}", String(BRIEFS_TOTAL_BLOCKS));
              const percent = Math.min(
                100,
                Math.max(0, (item.completedBlocks / BRIEFS_TOTAL_BLOCKS) * 100),
              );
              return (
                <li key={item.id}>
                  <Link href={item.href} className={LINK_ROW_CLASS}>
                    <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                      {item.fullName}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {/* Jauge : la valeur est ACTIVE → accent autorisé (§2.3) ;
                          l'info est portée par le texte, pas par la couleur. */}
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="text-xs font-medium tabular-nums text-muted">
                        {blocksLabel}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------------- 3. Modifications récentes ------------------ */}
      <section aria-labelledby="sales-recent-title" className="flex flex-col gap-4">
        <h2 id="sales-recent-title" className={SECTION_TITLE_CLASS}>
          {labels.recentTitle}
        </h2>
        {recent.length === 0 ? (
          <p className={EMPTY_CLASS}>{labels.noData}</p>
        ) : (
          <ul className="rounded-xl border border-line bg-surface px-4">
            {recent.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3 last:border-0"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-3">
                  <Link
                    href={item.href}
                    className="truncate text-[15px] font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                  >
                    {item.fullName}
                  </Link>
                  <StatusBadge status={item.status} label={item.statusLabel} />
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted">{item.dateLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
