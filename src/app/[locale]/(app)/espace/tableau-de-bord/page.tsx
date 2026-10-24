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
import type { PlatformContent } from "@/content/platform/types";
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
 * FRONTIÈRE RSC : tous les libellés (dict + replis listés), montants,
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
// ⚠ CLÉS DICTIONNAIRE MANQUANTES FE-10 (dict verrouillé — listées en
// restitution, JAMAIS créées) : `DashboardContent` n'expose ni titre de
// page, ni libellés d'indicateurs, ni colonnes des tableaux « par employé »
// / « classement ». Replis bilingues documentés — même arbitrage que FE-5
// (`NEW_PROSPECT_LABEL`) et FE-8 (`REFERENCE_LABEL`, `BENEFICIARY_LABEL`).
// Tout le reste vient du dict (`dashboard.*`, `commissions.*`,
// `pipeline.*`, `common.*`, `nav.*`, `brief.gauge.*`).
// ---------------------------------------------------------------------------

type LocalLabels = {
  /** `dashboard.kpis.collected` — KPI CA encaissé. */
  kpiCollected: string;
  /** `dashboard.kpis.pipeline` — KPI valeur du pipeline. */
  kpiPipeline: string;
  /** `dashboard.kpis.conversion` — KPI taux de conversion. */
  kpiConversion: string;
  /** `dashboard.kpis.quotesSent` — sous-ligne pipeline (template `{count}`). */
  quotesSentHint: string;
  /** `dashboard.totals.paidCount` — sous-ligne totaux manager (template `{count}`). */
  paidCountHint: string;
  /** Colonnes du classement manager (`dashboard.ranking.*`). */
  rank: string;
  added: string;
  deals: string;
  /** Colonnes des statistiques employé (`dashboard.perEmployee.*`). */
  qualified: string;
  signed: string;
  conversion: string;
  changes: string;
  generated: string;
  cost: string;
  margin: string;
  /** `dashboard.queues.incompleteBriefs` — section du dashboard commercial. */
  briefsTitle: string;
};

const LOCAL_LABELS: Record<Locale, LocalLabels> = {
  fr: {
    kpiCollected: "CA encaissé",
    kpiPipeline: "Pipeline",
    kpiConversion: "Taux de conversion",
    quotesSentHint: "{count} devis en attente",
    paidCountHint: "{count} versement(s)",
    rank: "Rang",
    added: "Ajoutés",
    deals: "Deals",
    qualified: "Qualifiés",
    signed: "Signés",
    conversion: "Conversion",
    changes: "Changements",
    generated: "CA généré",
    cost: "Coût commissions",
    margin: "Marge",
    briefsTitle: "Fiches incomplètes",
  },
  en: {
    kpiCollected: "Collected revenue",
    kpiPipeline: "Pipeline",
    kpiConversion: "Conversion rate",
    quotesSentHint: "{count} quotes awaiting",
    paidCountHint: "{count} payment(s)",
    rank: "Rank",
    added: "Added",
    deals: "Deals",
    qualified: "Qualified",
    signed: "Signed",
    conversion: "Conversion",
    changes: "Status changes",
    generated: "Revenue generated",
    cost: "Commissions cost",
    margin: "Margin",
    briefsTitle: "Incomplete briefs",
  },
};

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
 * (pattern repris de FE-7/FE-8 — `dashboard.title` n'existe pas, cf. replis
 * listés plus haut ; tous les rôles internes portent cette entrée de nav).
 */
function resolvePageTitle(dict: PlatformContent, role: Role): string {
  return (
    dict.nav[role].find((item) => item.href === "/espace/tableau-de-bord")?.label ??
    dict.dashboard.kpi
  );
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
  /** Colonnes — dict ou replis listés (`LOCAL_LABELS`). */
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
  const local = LOCAL_LABELS[locale];
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
        added: local.added,
        qualified: local.qualified,
        signed: local.signed,
        conversion: local.conversion,
        changes: local.changes,
        lastActivity: dict.pipeline.columns.lastActivity,
        generated: local.generated,
        cost: local.cost,
        margin: local.margin,
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
                label: local.kpiCollected,
                value: formatCents(data.kpis.collectedCents),
                tone: "success",
              },
              pipeline: {
                label: local.kpiPipeline,
                value: formatCents(data.kpis.pipelineValueCents),
                hint: local.quotesSentHint.replace(
                  "{count}",
                  String(data.kpis.quotesSent),
                ),
              },
              conversion: {
                label: local.kpiConversion,
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
              action: item.action,
              actorName: item.actorName,
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
            paidCountLabel: local.paidCountHint.replace(
              "{count}",
              String(data.totals.paidCount),
            ),
          }}
          commissionsHref={`/${locale}/espace/commissions`}
          labels={{
            title: dict.dashboard.perEmployee.title,
            rank: local.rank,
            name: dict.pipeline.columns.name,
            added: local.added,
            deals: local.deals,
            conversion: local.conversion,
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
              briefsTitle: local.briefsTitle,
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
              className="group flex items-center justify-between rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-[rgba(59,130,246,0.4)] hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
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
