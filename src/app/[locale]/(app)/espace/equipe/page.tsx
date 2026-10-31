import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { desc, inArray, ne, sql } from "drizzle-orm";
import { ChevronDown } from "lucide-react";

import { getEmployeeStats, type DashboardActor, type EmployeeStatsRow } from "@/actions/dashboard";
import { auth } from "@/auth";
import {
  ApplicationList,
  type ApplicationListLabels,
  type ApplicationRow,
} from "@/components/app/applications/ApplicationList";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayoutContent } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import { payoutDetails, users } from "@/lib/db/schema";
import { maskEmail, maskIban } from "@/lib/payout-mask";
import { isRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/** Nombre maximal de comptes affichés (spec T11 : bornage systématique). */
const APPLICATIONS_LIMIT = 50;

/**
 * Atheris — page « Équipe » (FE-10 · T11 + T31 · PLAN.md §3.2 · L9 VAGUE 3).
 *
 * RÔLES : `ceo` (décision) et `manager` (lecture seule) uniquement — tout
 * autre rôle → `notFound()` (la route RBAC `/equipe` du middleware est le
 * premier filet, ce garde est le second).
 *
 * TROIS BLOCS, DANS LA PAGE (spec : aucun composant supplémentaire) :
 * 1. **Candidatures** — `users WHERE role != 'client'`, colonnes
 *    EXPLICITES (jamais `passwordHash`), tri `(status='pending') DESC,
 *    created_at DESC`, `LIMIT 50`, **filtré `pending`** → `ApplicationList`
 *    (client, **hors périmètre L9**) qui reçoit `canDecide = (role === 'ceo')`
 *    : le manager ne voit **aucun bouton**. C'est la file d'approbation,
 *    plus la « liste d'équipe » ;
 * 2. **Membres** (L9 · D8 + D4) — même SELECT, TOUS les non-clients :
 *    - **D8** : la colonne statut devient une **pastille « Vérifié »**
 *      (`users.verified_at != null`), le statut de compte ne servant plus
 *      qu'au **tri** (et à un badge secondaire discret pour `pending`) ;
 *    - **D4** : clic sur un membre (`<details>` natif, accessible clavier) →
 *      ses **coordonnées bancaires masquées** (`maskIban` / `maskEmail`).
 *      **Portée CEO** (arbitrage Lead) : le manager n'exécute aucune requête
 *      `payout_details` et ne voit qu'une mention « réservé au CEO » ;
 * 3. **Stats équipe** — `getEmployeeStats(actor)` (ceo|manager) rendu en
 *    tableau sous la liste des membres.
 *
 * SÉCURITÉ : la lecture est scopée ICI (params de requête figés, aucun
 * paramètre client) ; la décision passe par `decideApplication`
 * (`@/actions/applications`) qui revalide uuid + rôle `ceo` + état
 * `pending`. `actor` est construit depuis `await auth()` (contrat C-5).
 * Les coordonnées bancaires sont lues et MASQUÉES **côté serveur** : seul
 * un sous-ensemble déjà masqué franchit la frontière RSC (D4).
 *
 * ERREURS : lecture candidatures/membres en échec → `console.error` + bloc
 * sobre `common.retry` ; lecture `payout_details` en échec → détail du
 * membre sur `common.retry` (jamais un faux « aucun moyen ») ;
 * `{ ok: false }` de `getEmployeeStats` → même traitement sur son bloc.
 * Une erreur d'infra DB non interceptée est propagée → 500.
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
// FE-10 : tous les libellés viennent du dict (`applications.*`,
// `dashboard.perEmployee.*`, `pipeline.*`, `common.*`) — aucune constante
// locale bilingue (les replis T09 ont été remplacés par les clés ouvertes).
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

// ---------------------------------------------------------------------------
// Section « Membres » (L9 · D8 pastille Vérifié + D4 coordonnées masquées).
// ---------------------------------------------------------------------------

/** Un champ de coordonnées DEJÀ masqué — jamais une valeur en clair. */
type PayoutField = { label: string; value: string };

/** Coordonnées de versement projetées pour l'affichage (murmé côté serveur). */
type PayoutView = { methodLabel: string; fields: PayoutField[] };

/** Une ligne de la liste « Membres » (100 % sérialisable, dates formatées). */
type TeamMemberRow = {
  id: string;
  name: string;
  email: string;
  /** Nullable en DB — déjà basculé en « — ». */
  phone: string;
  /** `dict.statuses.role[role]`. */
  roleLabel: string;
  /** `users.verified_at != null` → pastille « Vérifié » (D8). */
  verified: boolean;
  /** `users.status === 'pending'` — badge secondaire discret (traçabilité). */
  isPending: boolean;
  createdLabel: string;
  /** CEO uniquement : coordonnées masquées, `null` = aucun moyen. */
  payout: PayoutView | null;
};

/** Libellés résolus server (100 % dict). */
type TeamSectionLabels = {
  title: string;
  verified: string;
  notVerified: string;
  showPayout: string;
  payoutTitle: string;
  ceoOnly: string;
  /** `dict.statuses.userStatus.pending` — pastille secondaire. */
  pending: string;
  /** `common.retry` (lecture `payout_details` en échec). */
  retry: string;
  /** `common.noData` (liste vide). */
  empty: string;
};

/**
 * Projette une ligne `payout_details` en vue AFFICHABLE — **uniquement appelée
 * côté serveur** (page server component) : les identifiants sensibles passent
 * par `maskEmail` / `maskIban` (D4, `@/lib/payout-mask`), si bien qu'aucune
 * valeur en clair n'atteint le JSX ni la charge RSC envoyée au navigateur.
 *
 * Motif aligné sur `espace/profil/page.tsx` (L8) : `wise` → e-mail + devise ;
 * `paypal` → e-mail ; `bank` → titulaire + banque + IBAN (masqué) + BIC.
 *
 * @param row Ligne `payout_details` lue en base (valeurs en clair, D4 assumé).
 * @param labels Bloc `dict.payout.*` — libellés réutilisés tels quels.
 * @returns Méthode + champs déjà masqués, prêts à rendre.
 */
function buildPayoutView(
  row: {
    method: "wise" | "paypal" | "bank";
    accountEmail: string | null;
    currency: string | null;
    holderName: string | null;
    bankName: string | null;
    iban: string | null;
    swiftBic: string | null;
  },
  labels: PayoutContent,
): PayoutView {
  const methodLabel =
    row.method === "wise"
      ? labels.methodWise
      : row.method === "paypal"
        ? labels.methodPaypal
        : labels.methodBank;

  const fields: PayoutField[] = [];
  if (row.method === "wise") {
    if (row.accountEmail !== null) {
      fields.push({ label: labels.accountEmailLabel, value: maskEmail(row.accountEmail) });
    }
    if (row.currency !== null) {
      fields.push({ label: labels.currencyLabel, value: row.currency });
    }
  } else if (row.method === "paypal") {
    if (row.accountEmail !== null) {
      fields.push({ label: labels.accountEmailLabel, value: maskEmail(row.accountEmail) });
    }
  } else {
    if (row.holderName !== null) {
      fields.push({ label: labels.holderNameLabel, value: row.holderName });
    }
    if (row.bankName !== null) {
      fields.push({ label: labels.bankNameLabel, value: row.bankName });
    }
    if (row.iban !== null) {
      fields.push({ label: labels.ibanLabel, value: maskIban(row.iban) });
    }
    if (row.swiftBic !== null) {
      fields.push({ label: labels.swiftLabel, value: row.swiftBic });
    }
  }

  return { methodLabel, fields };
}

type TeamMembersSectionProps = {
  rows: TeamMemberRow[];
  labels: TeamSectionLabels;
  payoutLabels: PayoutContent;
  /** `true` (CEO) → détail dépliable avec coordonnées ; `false` (manager). */
  canViewPayout: boolean;
  /** Lecture `payout_details` en échec → `common.retry` au lieu d'un vide. */
  payoutReadFailed: boolean;
};

/**
 * Liste des membres — **server component** (rendu par `espace/equipe/page.tsx`).
 *
 * ARBITRAGE UI : `<details>` / `<summary>` natif plutôt qu'un `<button
 * aria-expanded>` + state client, car la page est un server component et je ne
 * crée aucun fichier de composant client (périmètre strict). Le disclosure
 * natif est focusable au clavier, se déplie sur Entrée/Espace et expose son
 * état étendu aux lecteurs d'écran — zéro JS, aucun octet sensible embarqué.
 *
 * PORTÉE (D4, arbitrage Lead) : les coordonnées bancaires sont **réservées au
 * CEO**. Le manager voit le membre + les badges, sans dépliable — l'indication
 * discrète `ceoOnly` remplace le détail. Le CEO obtient, au clic, la méthode
 * et les champs **déjà masqués** (jamais une valeur en clair dans le JSX).
 *
 * ÉTATS : vide (`common.noData`), erreur de lecture payout (`common.retry`),
 * « aucun moyen » (`payout.badgeEmpty`). Badges : couleur **ET** texte.
 */
function TeamMembersSection({
  rows,
  labels,
  payoutLabels,
  canViewPayout,
  payoutReadFailed,
}: TeamMembersSectionProps): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
        <p className="text-[15px] font-semibold text-fg">{labels.empty}</p>
      </div>
    );
  }

  /** Identité du membre (nom + e-mail + téléphone/date). */
  function identity(row: TeamMemberRow): React.JSX.Element {
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-fg">{row.name}</span>
        <span className="truncate text-sm text-muted">{row.email}</span>
        <span className="text-xs tabular-nums text-faint">
          {row.phone} · {row.createdLabel}
        </span>
      </span>
    );
  }

  /** Badges : rôle, « en attente » (secondaire) et Vérifié / Non vérifié. */
  function badges(row: TeamMemberRow): React.JSX.Element {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="tech">{row.roleLabel}</Badge>
        {row.isPending ? <Badge variant="tech">{labels.pending}</Badge> : null}
        <Badge variant={row.verified ? "verified" : "tech"}>
          {row.verified ? labels.verified : labels.notVerified}
        </Badge>
      </span>
    );
  }

  /** Contenu du détail (CEO) : coordonnées masquées / vide / erreur. */
  function payoutPanel(row: TeamMemberRow): React.JSX.Element {
    if (payoutReadFailed) {
      return <p className="text-sm text-muted">{labels.retry}</p>;
    }
    if (row.payout === null) {
      return <p className="text-sm text-muted">{payoutLabels.badgeEmpty}</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-fg">
          {labels.payoutTitle} — {row.payout.methodLabel}
        </p>
        <dl className="flex flex-col gap-2">
          {row.payout.fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-0.5">
              <dt className="micro text-faint">{field.label}</dt>
              <dd className="break-all text-[14px] text-fg">{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          {canViewPayout ? (
            <details className="group rounded-xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 md:flex-row md:items-start md:justify-between [&::-webkit-details-marker]:hidden">
                {identity(row)}
                <span className="flex flex-wrap items-center gap-2">
                  {badges(row)}
                  <span className="inline-flex items-center gap-1 micro text-faint">
                    {labels.showPayout}
                    <ChevronDown
                      aria-hidden="true"
                      className="size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
                    />
                  </span>
                </span>
              </summary>
              <div className="border-t border-line p-4">{payoutPanel(row)}</div>
            </details>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 md:flex-row md:items-start md:justify-between">
              {identity(row)}
              <span className="flex flex-wrap items-center gap-2">
                {badges(row)}
                <span className="micro text-faint">{labels.ceoOnly}</span>
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
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
        <>
          {/* Desktop (≥ md) : le tableau reste strictement inchangé. */}
          <div className="hidden md:block">
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
          </div>

          {/* Mobile (< md) : chaque ligne devient une carte empilée —
              libellé `.micro` (text-muted) + valeur, filets `border-line`,
              zéro scroll horizontal (Lot 3 · FE-E). */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => {
              const cells: Array<{ label: string; value: string; className: string }> = [
                { label: labels.added, value: String(row.funnel.added), className: "text-muted" },
                {
                  label: labels.qualified,
                  value: String(row.funnel.qualified),
                  className: "text-muted",
                },
                { label: labels.signed, value: String(row.funnel.signed), className: "text-muted" },
                {
                  label: labels.conversion,
                  value: formatPercent(row.funnel.conversionRate, locale),
                  className: "text-fg",
                },
                {
                  label: labels.changes,
                  value: String(row.activity.statusChanges),
                  className: "text-muted",
                },
                {
                  label: labels.lastActivity,
                  value: formatDate(row.activity.lastActivityAt, locale),
                  className: "text-muted",
                },
                {
                  label: labels.generated,
                  value: formatCents(row.profitability.generatedCents),
                  className: "text-fg",
                },
                {
                  label: labels.cost,
                  value: formatCents(row.profitability.commissionsCostCents),
                  className: "text-muted",
                },
                {
                  label: labels.margin,
                  value: formatCents(row.profitability.marginCents),
                  className:
                    row.profitability.marginCents < 0 ? "text-danger font-semibold" : "text-success font-semibold",
                },
              ];
              return (
                <li key={row.userId} className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-[15px] font-semibold text-fg">{row.name}</p>
                  <dl className="mt-1 flex flex-col">
                    {cells.map((cell, index) => (
                      <div
                        key={`${cell.label}-${index}`}
                        className={cn(
                          "flex items-baseline justify-between gap-3",
                          index === 0 ? "pb-2" : "border-t border-line py-2",
                        )}
                      >
                        <dt className="micro shrink-0 text-muted">{cell.label}</dt>
                        <dd className={cn("text-right text-sm tabular-nums", cell.className)}>
                          {cell.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
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
  const title =
    dict.nav[role].find((item) => item.href === "/espace/equipe")?.label ??
    dict.applications.title;
  const canDecide = role === "ceo";
  // Identité chargée EN SESSION côté serveur (contrat C-5).
  const actor: DashboardActor = { id: session.user.id, role };

  // --- 1. Candidatures + Membres (colonnes explicites — `passwordHash` JAMAIS lu)
  // Un SEUL SELECT alimente les deux vues (L9) : tri `pending` d'abord
  // conservé — il pilote l'ordre d'appel des nouveaux, inchangé.
  const db = getDb();
  let applicationRows: ApplicationRow[] | null = null;
  let memberRows: TeamMemberRow[] | null = null;
  let payoutReadFailed = false;
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        status: users.status,
        // D8 : pastille « Vérifié » = `verified_at` renseigné.
        verifiedAt: users.verifiedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(ne(users.role, "client"))
      // Candidatures en attente en tête, puis les plus récentes.
      .orderBy(sql`(${users.status} = 'pending') DESC`, desc(users.createdAt))
      .limit(APPLICATIONS_LIMIT);

    // File d'approbation : SEULEMENT les `pending`. `ApplicationList` (hors
    // périmètre de ce lot) ne sert donc plus de « liste d'équipe » : sa
    // colonne statut ne reflète que la file en attente — le statut de compte
    // n'est plus une colonne de présentation des membres (D8).
    applicationRows = rows
      .filter((row) => row.status === "pending")
      .map((row) => ({
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

    // Liste « Membres » : tous les non-clients, pastille Vérifié (D8).
    memberRows = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? "—",
      roleLabel: dict.statuses.role[row.role],
      verified: row.verifiedAt !== null,
      isPending: row.status === "pending",
      createdLabel: formatDate(row.createdAt, locale),
      payout: null,
    }));
  } catch (error) {
    // Erreur d'infra DB : journalisée puis présentée comme un bloc « Réessayer »
    // (aucun détail technique en UI, aucune donnée de compte affichée).
    console.error("[equipe] échec de la lecture des candidatures", error);
  }

  // --- 1b. Coordonnées de versement — CEO SEULEMENT (D4 : PII sensible) ----
  // Le manager n'exécute AUCUNE requête `payout_details` : aucun octet de
  // coordonnée n'est lu, ni lu puis projeté, pour un rôle non-CEO (le rôle est
  // connu en session, avant toute requête). Les valeurs lues ici sont masquées
  // immédiatement (`buildPayoutView` → `maskIban`/`maskEmail`) : seules des
  // chaînes masquées rejoignent le JSX et la charge RSC.
  if (canDecide && memberRows !== null && memberRows.length > 0) {
    try {
      const memberIds = memberRows.map((member) => member.id);
      const payoutRows = await db
        .select({
          userId: payoutDetails.userId,
          method: payoutDetails.method,
          accountEmail: payoutDetails.accountEmail,
          currency: payoutDetails.currency,
          holderName: payoutDetails.holderName,
          bankName: payoutDetails.bankName,
          iban: payoutDetails.iban,
          swiftBic: payoutDetails.swiftBic,
        })
        .from(payoutDetails)
        .where(inArray(payoutDetails.userId, memberIds));

      const payoutByMember = new Map<string, PayoutView>();
      for (const row of payoutRows) {
        payoutByMember.set(row.userId, buildPayoutView(row, dict.payout));
      }
      memberRows = memberRows.map((member) => ({
        ...member,
        payout: payoutByMember.get(member.id) ?? null,
      }));
    } catch (error) {
      // Lecture non destructrice : la liste reste visible, seul le détail
      // tombe sur `common.retry` (jamais sur « aucun moyen », qui mentirait).
      console.error("[equipe] échec de la lecture des coordonnées de versement", error);
      payoutReadFailed = true;
    }
  }

  const applicationLabels: ApplicationListLabels = {
    name: dict.pipeline.columns.name,
    email: dict.prospect.labels.email,
    phone: dict.prospect.labels.phone,
    role: dict.applications.role,
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
    reasonHint: dict.applications.rejectReasonHint,
    forbidden: dict.applications.forbidden,
  };

  // Libellés de la section « Membres » (L9) — 100 % dict, zéro string en dur.
  const teamLabels: TeamSectionLabels = {
    title: dict.team.title,
    verified: dict.team.verified,
    notVerified: dict.team.notVerified,
    showPayout: dict.team.showPayout,
    payoutTitle: dict.team.payoutTitle,
    ceoOnly: dict.team.ceoOnly,
    pending: dict.statuses.userStatus.pending,
    retry: dict.common.retry,
    empty: dict.common.noData,
  };

  // --- 3. Stats équipe (ceo | manager) ------------------------------------
  const statsResult = await getEmployeeStats(actor);
  if (!statsResult.ok) {
    console.error("[equipe] échec des statistiques équipe", statsResult.code);
  }

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

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
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
        ) : applicationRows.length > 0 ? (
          <ApplicationList
            rows={applicationRows}
            labels={applicationLabels}
            canDecide={canDecide}
            actor={actor}
          />
        ) : (
          /* File vidée : message exact « en attente », pas un vide générique. */
          <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-fg">{dict.applications.empty}</p>
          </div>
        )}
      </section>

      {/* --------------------------------- 2. Membres (L9 · D8 + D4) -------- */}
      <section aria-labelledby="team-members-title" className="flex flex-col gap-4">
        <h2
          id="team-members-title"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {teamLabels.title}
        </h2>
        {memberRows === null ? (
          errorBlock(dict.common.retry)
        ) : (
          <TeamMembersSection
            rows={memberRows}
            labels={teamLabels}
            payoutLabels={dict.payout}
            canViewPayout={canDecide}
            payoutReadFailed={payoutReadFailed}
          />
        )}
      </section>

      {/* --------------------------------- 3. Stats équipe ---------------- */}
      {statsResult.ok ? (
        <EmployeeStatsSection rows={statsResult.data} labels={employeeLabels} locale={locale} />
      ) : (
        errorBlock(dict.common.retry)
      )}
    </div>
  );
}
