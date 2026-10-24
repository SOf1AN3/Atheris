/**
 * Atheris — tableau de bord CEO (FE-10 · T30 · PLAN.md §3.2).
 *
 * Composant **pur** (Server Component, aucun `"use client"`, aucun hook) :
 * props 100 % sérialisables — montants, taux et dates sont **déjà formatés
 * côté serveur** par `espace/tableau-de-bord/page.tsx` (aucun formatage ni
 * i18n côté client). Les libellés y sont également résolus (100 % dict).
 *
 * ORDRE IMPOSÉ PLAN §T30 :
 * 1. **Files d'action** (`ActionQueue`) : candidatures → `/espace/equipe`,
 *    devis sans réponse → pipeline filtré `?status=devis_envoye`, commissions
 *    dues → `/espace/commissions` (+ sous-ligne `commissions.noBeneficiary`
 *    si des lignes sont orphelines), relances → pipeline ;
 * 2. **4 indicateurs** (`StatCard`) : CA encaissé, pipeline, conversion
 *    (`null` → « — », jamais `NaN`), commissions dues ;
 * 3. **Activité récente** : 5 lignes (phrase `dict.activities.*` + date).
 *
 * Une file à **zéro** n'est pas une action : elle est retirée de la liste.
 * Si aucune file n'a de travail, `ActionQueue` rend `null` et un état vide
 * sobre (`common.noData`) prend le relais.
 */

import { ActionQueue, type ActionQueueItem } from "@/components/app/common/ActionQueue";
import { StatCard, type StatCardTone } from "@/components/app/common/StatCard";

/** Compteurs des files d'action (contrat `CeoDashboardData.queues`). */
export type CeoDashboardQueues = {
  pendingApplications: number;
  quotesWaiting: number;
  commissionsDue: number;
  commissionsOrphan: number;
  remindersToday: number;
};

/** Liens cibles, déjà préfixés par la locale côté serveur. */
export type CeoDashboardHrefs = {
  applications: string;
  quotes: string;
  commissions: string;
  reminders: string;
};

/** Une carte d'indicateur, label + valeur entièrement résolus server. */
export type CeoKpi = {
  label: string;
  value: string;
  hint?: string;
  tone?: StatCardTone;
};

/** Une ligne du journal d'activité (date déjà formatée server). */
export type CeoDashboardActivityItem = {
  id: string;
  /**
   * Phrase du journal (`dict.activities.*`), jetons `{actor}`/`{from}`/`{to}`
   * remplacés côté serveur — le code technique brut n'est jamais affiché.
   */
  actionLabel: string;
  dateLabel: string;
};

/** Libellés résolus server (100 % dict). */
export type CeoDashboardLabels = {
  /** `dict.dashboard.actionQueues`. */
  actionQueues: string;
  /** `dict.dashboard.kpi`. */
  kpi: string;
  /** `dict.dashboard.recentActivity`. */
  recentActivity: string;
  /** `dict.dashboard.queues.*`. */
  queues: {
    pendingApplications: string;
    quotesNoAnswer: string;
    commissionsDue: string;
    remindersToday: string;
  };
  /** `dict.commissions.noBeneficiary` — sous-ligne des orphelines. */
  noBeneficiary: string;
  /** `dict.common.noData` — aucune file n'a de travail. */
  noData: string;
};

export type CeoDashboardProps = {
  queues: CeoDashboardQueues;
  hrefs: CeoDashboardHrefs;
  kpis: {
    collected: CeoKpi;
    pipeline: CeoKpi;
    conversion: CeoKpi;
    commissionsDue: CeoKpi;
  };
  activity: CeoDashboardActivityItem[];
  labels: CeoDashboardLabels;
};

const SECTION_TITLE_CLASS = "text-lg font-semibold tracking-[-0.015em] text-fg";
const EMPTY_CLASS =
  "rounded-xl border border-line bg-surface px-6 py-10 text-center text-[15px] font-semibold text-fg";

export function CeoDashboard({
  queues,
  hrefs,
  kpis,
  activity,
  labels,
}: CeoDashboardProps): React.JSX.Element {
  // --- 1. Files d'action (les files à zéro ne sont pas des actions) -------
  const queueItems: ActionQueueItem[] = [
    {
      id: "pending-applications",
      label: labels.queues.pendingApplications,
      count: queues.pendingApplications,
      href: hrefs.applications,
    },
    {
      id: "quotes-no-answer",
      label: labels.queues.quotesNoAnswer,
      count: queues.quotesWaiting,
      href: hrefs.quotes,
    },
    {
      id: "commissions-due",
      label: labels.queues.commissionsDue,
      count: queues.commissionsDue,
      href: hrefs.commissions,
    },
    {
      id: "reminders-today",
      label: labels.queues.remindersToday,
      count: queues.remindersToday,
      href: hrefs.reminders,
    },
  ].filter((item) => item.count > 0);

  // Sous-ligne orphelines : uniquement si des lignes dues sont sans
  // bénéficiaire (compteur + libellé dict, jamais de dénomination inventée).
  if (queues.commissionsOrphan > 0) {
    const orphanItem = queueItems.find((item) => item.id === "commissions-due");
    if (orphanItem !== undefined) {
      orphanItem.hint = `${queues.commissionsOrphan} · ${labels.noBeneficiary}`;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* -------------------------------------- 1. Files d'action --------- */}
      <section aria-labelledby="ceo-action-queues-title" className="flex flex-col gap-4">
        <h2 id="ceo-action-queues-title" className={SECTION_TITLE_CLASS}>
          {labels.actionQueues}
        </h2>
        {queueItems.length > 0 ? (
          <ActionQueue items={queueItems} />
        ) : (
          <p className={EMPTY_CLASS}>{labels.noData}</p>
        )}
      </section>

      {/* -------------------------------------- 2. Indicateurs ------------ */}
      <section aria-labelledby="ceo-kpi-title" className="flex flex-col gap-4">
        <h2 id="ceo-kpi-title" className={SECTION_TITLE_CLASS}>
          {labels.kpi}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={kpis.collected.label} value={kpis.collected.value} tone={kpis.collected.tone ?? "neutral"} hint={kpis.collected.hint} />
          <StatCard label={kpis.pipeline.label} value={kpis.pipeline.value} tone={kpis.pipeline.tone ?? "neutral"} hint={kpis.pipeline.hint} />
          <StatCard label={kpis.conversion.label} value={kpis.conversion.value} tone={kpis.conversion.tone ?? "neutral"} hint={kpis.conversion.hint} />
          <StatCard label={kpis.commissionsDue.label} value={kpis.commissionsDue.value} tone={kpis.commissionsDue.tone ?? "neutral"} hint={kpis.commissionsDue.hint} />
        </div>
      </section>

      {/* -------------------------------------- 3. Activité récente ------- */}
      <section aria-labelledby="ceo-recent-activity-title" className="flex flex-col gap-4">
        <h2 id="ceo-recent-activity-title" className={SECTION_TITLE_CLASS}>
          {labels.recentActivity}
        </h2>
        {activity.length === 0 ? (
          <p className={EMPTY_CLASS}>{labels.noData}</p>
        ) : (
          <ul className="rounded-xl border border-line bg-surface px-4">
            {activity.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3 last:border-0"
              >
                <span className="min-w-0 text-sm text-fg">{item.actionLabel}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted">{item.dateLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
