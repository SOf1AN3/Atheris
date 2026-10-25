import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getEmployeeStats,
  getCeoDashboard,
  getManagerDashboard,
  getSalesDashboard,
  type DashboardActor,
  type EmployeeStatsRow,
} from "@/actions/dashboard";
import { auth } from "@/auth";
import { CommercialDashboard } from "@/components/app/dashboards/CommercialDashboard";
import { CeoDashboard } from "@/components/app/dashboards/CeoDashboard";
import { ManagerDashboard } from "@/components/app/dashboards/ManagerDashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActivitiesContent, PlatformContent } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Tableau de bord » (FE-10 · T30/T31/T32 · PLAN.md §3.2).
 *
 * PAGE UNIQUE, BRANCHES PAR RÔLE :
 * - `ceo` → `getCeoDashboard` (files + KPI + journal) **puis**
 *   `getEmployeeStats` affiché en tableau SOUS le dashboard ;
 * - `manager` → `getManagerDashboard` (classement + totaux, lecture seule) ;
 * - `commercial` → `getSalesDashboard` (relances, briefs, récents) ;
 * - `vendeur` → `getSalesDashboard` + carte « Mes gains » → `/espace/commissions` ;
 * - `client` → `notFound()` (route RBAC `tableau-de-bord` exclut déjà le
 *   portail client côté middleware : double filet, comme ailleurs).
 *
 * GARDES : locale valide → session `active` + rôle connu (redirection
 * connexion, pattern `(app)/layout.tsx`), sinon `notFound()` pour `client`.
 *
 * ERREURS : tout retour `{ ok: false }` des actions est journalisé
 * (`console.error` + code) puis présenté par un bloc sobre `common.retry` —
 * aucun détail technique en UI. Une erreur d'infra DB est propagée → 500.
 *
 * FRONTIÈRE RSC : tous les libellés (100 % dict), montants,
 * taux et dates sont résolus/formatés ICI, en strings sérialisables — les
 * dashboards sont des renderers purs, aucun formatage côté client.
 */

// ---------------------------------------------------------------------------
// Helpers de formatage (pattern `espace/commissions/page.tsx`, FE-7/FE-8).
// ---------------------------------------------------------------------------

/** Format monétaire USD imposé par la spec (montants en cents → dollars). */
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Convertit des cents entiers en libellé monétaire (`123456` → « $1,234.56 »). */
function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

/**
 * Taux en % — la valeur du contrat est DÉJÀ en points de pourcentage
 * (12.3 → « 12,3 % ») ; `null` (division par zéro côté action) → « — ».
 */
function formatPercent(value: number | null, locale: Locale): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** Date formatée côté server, fuseau `Africa/Algiers` (spec T02). */
function formatDate(value: Date | null, locale: Locale): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(value);
}

// ---------------------------------------------------------------------------
// FE-10 : tous les libellés viennent du dict (`dashboard.*`, `commissions.*`,
// `pipeline.*`, `common.*`, `nav.*`, `brief.gauge.*`, `activities.*`) — aucune
// constante locale bilingue (les replis T09 ont été remplacés par les clés
// `dashboard.kpis|totals|ranking|perEmployee|queues.*` ouvertes depuis).
// ---------------------------------------------------------------------------

/** Bloc d'erreur sobre — `common.retry`, aucun détail technique en UI. */
function errorBlock(retryLabel: string): React.JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <p role="status" className="text-[15px] font-semibold text-fg">
        {retryLabel}
      </p>
    </div>
  );
}

/**
 * Titre de page : label de nav du rôle pour `/espace/tableau-de-bord`
 * (pattern repris de FE-7/FE-8, tous les rôles internes portent cette
 * entrée de nav ; repli = `dashboard.title`).
 */
function resolvePageTitle(dict: PlatformContent, role: Role): string {
  return (
    dict.nav[role].find((item) => item.href === "/espace/tableau-de-bord")?.label ??
    dict.dashboard.title
  );
}

// ---------------------------------------------------------------------------
// Journal d'audit du dashboard CEO — résolution `dict.activities.*` (serveur).
// ---------------------------------------------------------------------------

/** Vrai si `key` est une clé réelle de `dict.activities` (sinon `unknown`). */
function isActivityKey(
  activities: ActivitiesContent,
  key: string,
): key is keyof ActivitiesContent {
  return Object.hasOwn(activities, key);
}

/**
 * Gabarin d'une activité : le code DB (`status.changed`,
 * `quote.status_changed`…) est converti en clé camelCase de `dict.activities`
 * — correspondance vérifiée sur les littéraux `action:` de `src/actions/*`.
 * Aucun code connu → `activities.unknown` ; les jetons `{actor}` / `{from}` /
 * `{to}` sont remplacés par de simples `String.replace` (frontière RSC).
 *
 * Le journal CEO ne transporte pas `activities.meta` (contrat
 * `CeoDashboardData` figé) : un jeton sans donnée affiche « — ».
 */
function activityPhrase(
  activities: ActivitiesContent,
  action: string,
  tokens: { actor: string; from: string; to: string },
): string {
  const key = action.replace(/[_.]([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const template = isActivityKey(activities, key) ? activities[key] : activities.unknown;
  return template
    .replace("{actor}", tokens.actor)
    .replace("{from}", tokens.from)
    .replace("{to}", tokens.to);
}

// ---------------------------------------------------------------------------
// Tableau « Par employé » (CEO) — rendu DANS la page (spec : pas de
// composant supplémentaire ; le même gabarit sert `espace/equipe/page.tsx`).
// ---------------------------------------------------------------------------

type EmployeeStatsLabels = {
  /** `dict.dashboard.perEmployee.title`. */
  title: string;
  /** `dict.pipeline.columns.name`. */
  name: string;
  /** Colonnes — `dict.dashboard.perEmployee.*`. */
  added: string;
  qualified: string;
  signed: string;
  conversion: string;
  changes: string;
  /** `dict.pipeline.columns.lastActivity`. */
  lastActivity: string;
  generated: string;
  cost: string;
  margin: string;
  /** `dict.common.noData`. */
  noData: string;
};

function EmployeeStatsSection({
  rows,
  labels,
  locale,
}: {
  rows: EmployeeStatsRow[];
  labels: EmployeeStatsLabels;
  locale: Locale;
}): React.JSX.Element {
  return (
    <section aria-labelledby="employee-stats-title" className="flex flex-col gap-4">
      <h2
        id="employee-stats-title"
        className="text-lg font-semibold tracking-[-0.015em] text-fg"
      >
        {labels.title}
      </h2>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-fg">{labels.noData}</p>
        </div>
      ) : (
        /* Tableau avec scroll horizontal intégré (shadcn `Table`). */
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.name}</TableHead>
              <TableHead scope="col">{labels.added}</TableHead>
              <TableHead scope="col">{labels.qualified}</TableHead>
              <TableHead scope="col">{labels.signed}</TableHead>
              <TableHead scope="col">{labels.conversion}</TableHead>
              <TableHead scope="col">{labels.changes}</TableHead>
              <TableHead scope="col">{labels.lastActivity}</TableHead>
              <TableHead scope="col">{labels.generated}</TableHead>
              <TableHead scope="col">{labels.cost}</TableHead>
              <TableHead scope="col">{labels.margin}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell className="font-medium text-fg">{row.name}</TableCell>
                <TableCell className="tabular-nums text-muted">{row.funnel.added}</TableCell>
                <TableCell className="tabular-nums text-muted">{row.funnel.qualified}</TableCell>
                <TableCell className="tabular-nums text-muted">{row.funnel.signed}</TableCell>
                <TableCell className="tabular-nums text-fg">
                  {formatPercent(row.funnel.conversionRate, locale)}
                </TableCell>
                <TableCell className="tabular-nums text-muted">
                  {row.activity.statusChanges}
                </TableCell>
                <TableCell className="tabular-nums text-muted">
                  {formatDate(row.activity.lastActivityAt, locale)}
                </TableCell>
                <TableCell className="tabular-nums text-fg">
                  {formatCents(row.profitability.generatedCents)}
                </TableCell>
                <TableCell className="tabular-nums text-muted">
                  {formatCents(row.profitability.commissionsCostCents)}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-semibold tabular-nums",
                    row.profitability.marginCents < 0 ? "text-danger" : "text-success",
                  )}
                >
                  {formatCents(row.profitability.marginCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page.
// ---------------------------------------------------------------------------

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: DashboardPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.seo.dashboard.title };
}

export default async function DashboardPage({
  params,
}: DashboardPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  const role = session.user.role;
  // RBAC route : le portail client n'accède jamais au pipeline interne.
  if (role === "client") notFound();

  const dict = await getPlatformDictionary(locale);
  const title = resolvePageTitle(dict, role);
  // Identité chargée EN SESSION côté serveur (contrat C-5) — jamais montée
  // du client ; les actions revalident uuid + rôle par Zod.
  const actor: DashboardActor = { id: session.user.id, role };

  let content: React.ReactNode;

  // ----------------------------------------------------------------- CEO --
  if (role === "ceo") {
    const [dashboardResult, statsResult] = await Promise.all([
      getCeoDashboard(actor),
      getEmployeeStats(actor),
    ]);

    if (!dashboardResult.ok) {
      console.error("[tableau-de-bord] échec du tableau de bord CEO", dashboardResult.code);
      content = errorBlock(dict.common.retry);
    } else {
      if (!statsResult.ok) {
        console.error("[tableau-de-bord] échec des statistiques équipe", statsResult.code);
      }

      const data = dashboardResult.data;
      const employeeLabels: EmployeeStatsLabels = {
        title: dict.dashboard.perEmployee.title,
        name: dict.pipeline.columns.name,
        added: dict.dashboard.perEmployee.added,
        qualified: dict.dashboard.perEmployee.qualified,
        signed: dict.dashboard.perEmployee.signed,
        conversion: dict.dashboard.perEmployee.conversion,
        changes: dict.dashboard.perEmployee.changes,
        lastActivity: dict.pipeline.columns.lastActivity,
        generated: dict.dashboard.perEmployee.generated,
        cost: dict.dashboard.perEmployee.cost,
        margin: dict.dashboard.perEmployee.margin,
        noData: dict.common.noData,
      };

      content = (
        <>
          <CeoDashboard
            queues={data.queues}
            hrefs={{
              applications: `/${locale}/espace/equipe`,
              quotes: `/${locale}/espace/prospects?status=devis_envoye`,
              commissions: `/${locale}/espace/commissions`,
              reminders: `/${locale}/espace/prospects`,
            }}
            kpis={{
              collected: {
                label: dict.dashboard.kpis.collected,
                value: formatCents(data.kpis.collectedCents),
                tone: "success",
              },
              pipeline: {
                label: dict.dashboard.kpis.pipeline,
                value: formatCents(data.kpis.pipelineValueCents),
                hint: dict.dashboard.kpis.quotesSent.replace(
                  "{count}",
                  String(data.kpis.quotesSent),
                ),
              },
              conversion: {
                label: dict.dashboard.kpis.conversion,
                value: formatPercent(data.kpis.conversionRate, locale),
              },
              commissionsDue: {
                label: dict.dashboard.queues.commissionsDue,
                value: formatCents(data.kpis.commissionsDueCents),
                hint: `${dict.commissions.paid} · ${formatCents(data.kpis.commissionsPaidCents)}`,
                tone: "danger",
              },
            }}
            activity={data.recentActivity.map((item) => ({
              id: item.id,
              // Phrase du journal (`dict.activities.*`) résolue ici — le code
              // brut DB n'est plus affiché ; `{from}`/`{to}` faute de `meta`.
              actionLabel: activityPhrase(dict.activities, item.action, {
                actor: item.actorName ?? "—",
                from: "—",
                to: "—",
              }),
              dateLabel: formatDate(item.createdAt, locale),
            }))}
            labels={{
              actionQueues: dict.dashboard.actionQueues,
              kpi: dict.dashboard.kpi,
              recentActivity: dict.dashboard.recentActivity,
              queues: dict.dashboard.queues,
              noBeneficiary: dict.commissions.noBeneficiary,
              noData: dict.common.noData,
            }}
          />

          {statsResult.ok ? (
            <EmployeeStatsSection
              rows={statsResult.data}
              labels={employeeLabels}
              locale={locale}
            />
          ) : (
            errorBlock(dict.common.retry)
          )}
        </>
      );
    }

    // ----------------------------------------------------------- MANAGER --
  } else if (role === "manager") {
    const result = await getManagerDashboard(actor);

    if (!result.ok) {
      console.error("[tableau-de-bord] échec du tableau de bord manager", result.code);
      content = errorBlock(dict.common.retry);
    } else {
      const data = result.data;
      const commissionsLink =
        dict.nav.manager.find((item) => item.href === "/espace/commissions")?.label ??
        dict.commissions.queue;

      content = (
        <ManagerDashboard
          ranking={data.ranking.map((row, index) => ({
            userId: row.userId,
            rank: index + 1,
            name: row.name,
            added: row.added,
            dealCount: row.paidDealCount,
            conversionLabel: formatPercent(row.conversionRate, locale),
            // `tierRateTenths` : 100 = 10 % → /1000 pour le format percent.
            tierLabel: formatPercent(row.tierRateTenths / 1000, locale),
            dueLabel: formatCents(row.commissionsDueCents),
            paidLabel: formatCents(row.commissionsPaidCents),
          }))}
          totals={{
            dueLabel: formatCents(data.totals.dueCents),
            paidLabel: formatCents(data.totals.paidCents),
            paidCountLabel: dict.dashboard.totals.paidCount.replace(
              "{count}",
              String(data.totals.paidCount),
            ),
          }}
          commissionsHref={`/${locale}/espace/commissions`}
          labels={{
            title: dict.dashboard.perEmployee.title,
            rank: dict.dashboard.ranking.rank,
            name: dict.pipeline.columns.name,
            added: dict.dashboard.ranking.added,
            deals: dict.dashboard.ranking.deals,
            conversion: dict.dashboard.ranking.conversion,
            tier: dict.commissions.tier.label,
            due: dict.commissions.pending,
            paid: dict.commissions.paid,
            totalDue: dict.dashboard.queues.commissionsDue,
            totalPaid: dict.commissions.paid,
            commissionsLink,
            noData: dict.common.noData,
          }}
        />
      );
    }

    // ---------------------------------------- COMMERCIAL + VENDEUR --------
  } else {
    const result = await getSalesDashboard(actor);

    if (!result.ok) {
      console.error("[tableau-de-bord] échec du tableau de bord commercial", result.code);
      content = errorBlock(dict.common.retry);
    } else {
      const data = result.data;
      const earningsHref = `/${locale}/espace/commissions`;
      const earningsLabel =
        dict.nav.vendeur.find((item) => item.href === "/espace/commissions")?.label ??
        dict.commissions.myEarnings;

      content = (
        <>
          <CommercialDashboard
            reminders={data.remindersToday.map((item) => ({
              id: item.id,
              fullName: item.fullName,
              dateLabel: formatDate(item.nextReminderAt, locale),
              href: `/${locale}/espace/prospects/${item.id}`,
            }))}
            briefs={data.incompleteBriefs.map((item) => ({
              id: item.id,
              fullName: item.fullName,
              completedBlocks: item.completedBlocks,
              href: `/${locale}/espace/prospects/${item.id}`,
            }))}
            recent={data.recent.map((item) => ({
              id: item.id,
              fullName: item.fullName,
              status: item.status,
              statusLabel: dict.statuses.prospect[item.status],
              dateLabel: formatDate(item.updatedAt, locale),
              href: `/${locale}/espace/prospects/${item.id}`,
            }))}
            labels={{
              remindersTitle: dict.dashboard.queues.remindersToday,
              briefsTitle: dict.dashboard.queues.incompleteBriefs,
              recentTitle: dict.dashboard.recentActivity,
              blocksDone: dict.brief.gauge.blocksDone,
              noData: dict.common.noData,
            }}
          />

          {/* Carte « Mes gains » — vendeur uniquement (commercial = commissions
              hors périmètre `ROUTE_ACCESS.commissions`). */}
          {role === "vendeur" ? (
            <Link
              href={earningsHref}
              className="group flex items-center justify-between rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <span className="text-[15px] font-semibold text-fg">{earningsLabel}</span>
              <span
                aria-hidden="true"
                className="text-muted transition-transform duration-150 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          ) : null}
        </>
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h1>
      {content}
    </div>
  );
}
