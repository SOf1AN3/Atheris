import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { desc, ne, sql } from "drizzle-orm";

import { getEmployeeStats, type DashboardActor, type EmployeeStatsRow } from "@/actions/dashboard";
import { auth } from "@/auth";
import {
  ApplicationList,
  type ApplicationListLabels,
  type ApplicationRow,
} from "@/components/app/applications/ApplicationList";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/** Nombre maximal de comptes affichés (spec T11 : bornage systématique). */
const APPLICATIONS_LIMIT = 50;

/**
 * Atheris — page « Équipe » (FE-10 · T11 + T31 · PLAN.md §3.2).
 *
 * RÔLES : `ceo` (décision) et `manager` (lecture seule) uniquement — tout
 * autre rôle → `notFound()` (la route RBAC `/equipe` du middleware est le
 * premier filet, ce garde est le second).
 *
 * DEUX BLOCS, DANS LA PAGE (spec : aucun composant supplémentaire) :
 * 1. **Candidatures** — `users WHERE role != 'client'`, colonnes
 *    EXPLICITES (jamais `passwordHash`), tri `(status='pending') DESC,
 *    created_at DESC`, `LIMIT 50` → `ApplicationList` (client) qui reçoit
 *    `canDecide = (role === 'ceo')` : le manager ne voit **aucun bouton** ;
 * 2. **Stats équipe** — `getEmployeeStats(actor)` (ceo|manager) rendu en
 *    tableau sous les candidatures.
 *
 * SÉCURITÉ : la lecture est scopée ICI (params de requête figés, aucun
 * paramètre client) ; la décision passe par `decideApplication`
 * (`@/actions/applications`) qui revalide uuid + rôle `ceo` + état
 * `pending`. `actor` est construit depuis `await auth()` (contrat C-5).
 *
 * ERREURS : lecture candidatures en échec → `console.error` + bloc sobre
 * `common.retry` ; `{ ok: false }` de `getEmployeeStats` → même traitement
 * sur son bloc. Une erreur d'infra DB non interceptée est propagée → 500.
 */

// ---------------------------------------------------------------------------
// Helpers de formatage (miroir de `tableau-de-bord/page.tsx` — chaque page
// porte ses helpers, pattern `espace/commissions/page.tsx`).
// ---------------------------------------------------------------------------

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

function formatPercent(value: number | null, locale: Locale): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

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
// restitution, JAMAIS créées) : `ApplicationsContent` n'a pas de clé pour la
// colonne « Rôle » ni pour le motif de refus / le refus d'action ; le bloc
// « stats employé » réutilise les mêmes colonnes que la page tableau de bord
// (`DashboardContent.perEmployee` ne expose que les 3 groupes). Replis
// bilingues documentés — même arbitrage que FE-5/FE-8.
// ---------------------------------------------------------------------------

type LocalLabels = {
  /** `applications.role` — colonne « Rôle ». */
  role: string;
  /** `applications.rejectReasonHint` — aide au motif (≥ 3 caractères). */
  rejectReasonHint: string;
  /** `applications.forbidden` — refus d'action (rôle sans droit). */
  forbidden: string;
  /** Colonnes des statistiques employé (`dashboard.perEmployee.*`). */
  added: string;
  qualified: string;
  signed: string;
  conversion: string;
  changes: string;
  generated: string;
  cost: string;
  margin: string;
};

const LOCAL_LABELS: Record<Locale, LocalLabels> = {
  fr: {
    role: "Rôle",
    rejectReasonHint: "Motif obligatoire, 3 caractères minimum.",
    forbidden: "Action non autorisée.",
    added: "Ajoutés",
    qualified: "Qualifiés",
    signed: "Signés",
    conversion: "Conversion",
    changes: "Changements",
    generated: "CA généré",
    cost: "Coût commissions",
    margin: "Marge",
  },
  en: {
    role: "Role",
    rejectReasonHint: "Reason required, 3 characters minimum.",
    forbidden: "Not allowed.",
    added: "Added",
    qualified: "Qualified",
    signed: "Signed",
    conversion: "Conversion",
    changes: "Status changes",
    generated: "Revenue generated",
    cost: "Commissions cost",
    margin: "Margin",
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

// ---------------------------------------------------------------------------
// Tableau « Par employé » — gabarit identique à `tableau-de-bord/page.tsx`
// (spec : rendu DANS la page, pas de composant supplémentaire).
// ---------------------------------------------------------------------------

type EmployeeStatsLabels = {
  title: string;
  name: string;
  added: string;
  qualified: string;
  signed: string;
  conversion: string;
  changes: string;
  lastActivity: string;
  generated: string;
  cost: string;
  margin: string;
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

type EquipePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: EquipePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.applications.title };
}

export default async function EquipePage({
  params,
}: EquipePageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  const role = session.user.role;
  // RBAC route : `/equipe` = ceo (décision) + manager (lecture seule).
  if (role !== "ceo" && role !== "manager") notFound();

  const dict = await getPlatformDictionary(locale);
  const local = LOCAL_LABELS[locale];
  const title =
    dict.nav[role].find((item) => item.href === "/espace/equipe")?.label ??
    dict.applications.title;
  const canDecide = role === "ceo";
  // Identité chargée EN SESSION côté serveur (contrat C-5).
  const actor: DashboardActor = { id: session.user.id, role };

  // --- 1. Candidatures (colonnes explicites — `passwordHash` JAMAIS lu) ----
  const db = getDb();
  let applicationRows: ApplicationRow[] | null = null;
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(ne(users.role, "client"))
      // Candidatures en attente en tête, puis les plus récentes.
      .orderBy(sql`(${users.status} = 'pending') DESC`, desc(users.createdAt))
      .limit(APPLICATIONS_LIMIT);

    applicationRows = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? "—",
      roleLabel: dict.statuses.role[row.role],
      status: row.status,
      statusLabel: dict.statuses.userStatus[row.status],
      isPending: row.status === "pending",
      createdLabel: formatDate(row.createdAt, locale),
    }));
  } catch (error) {
    // Erreur d'infra DB : journalisée puis présentée comme un bloc « Réessayer »
    // (aucun détail technique en UI, aucune donnée de compte affichée).
    console.error("[equipe] échec de la lecture des candidatures", error);
  }

  const applicationLabels: ApplicationListLabels = {
    name: dict.pipeline.columns.name,
    email: dict.prospect.labels.email,
    phone: dict.prospect.labels.phone,
    role: local.role,
    status: dict.applications.statusLabel,
    created: dict.prospect.labels.createdAt,
    actions: dict.common.actions,
    approve: dict.applications.approve,
    reject: dict.applications.reject,
    approveConfirm: dict.applications.approveConfirm,
    rejectReason: dict.applications.rejectReason,
    empty: dict.applications.empty,
    noData: dict.common.noData,
    cancel: dict.common.cancel,
    loading: dict.common.loading,
    retry: dict.common.retry,
    required: dict.auth.validation.required,
    reasonHint: local.rejectReasonHint,
    forbidden: local.forbidden,
  };

  // --- 2. Stats équipe (ceo | manager) ------------------------------------
  const statsResult = await getEmployeeStats(actor);
  if (!statsResult.ok) {
    console.error("[equipe] échec des statistiques équipe", statsResult.code);
  }

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h1>

      {/* --------------------------------- 1. Candidatures ---------------- */}
      <section aria-labelledby="applications-title" className="flex flex-col gap-4">
        <h2
          id="applications-title"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {dict.applications.title}
        </h2>
        {applicationRows === null ? (
          errorBlock(dict.common.retry)
        ) : (
          <ApplicationList
            rows={applicationRows}
            labels={applicationLabels}
            canDecide={canDecide}
            actor={actor}
          />
        )}
      </section>

      {/* --------------------------------- 2. Stats équipe ---------------- */}
      {statsResult.ok ? (
        <EmployeeStatsSection rows={statsResult.data} labels={employeeLabels} locale={locale} />
      ) : (
        errorBlock(dict.common.retry)
      )}
    </div>
  );
}
