import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { listProspects, type ProspectListItem } from "@/actions/prospects";
import { auth } from "@/auth";
import {
  PipelineTableSkeleton,
  type PipelineColumnLabels,
  type PipelineEmptyState,
  type PipelineRow,
} from "@/components/app/PipelineTable";
import { ProspectListSection } from "@/components/app/prospect/ProspectListSection";
import { Button } from "@/components/ui/Button";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import {
  canViewAllProspects,
  isRole,
  type ProspectStatus,
  type Role,
} from "@/lib/permissions";
import { STATUS_ORDER } from "@/lib/status-meta";

// DB-PENDING / cache : voir le commentaire de `LIST_LIMIT` ci-dessous — la
// page n'est jamais statique (session + searchParams + `listProspects`).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Pipeline » / « Mes prospects » (FE-5 · T17).
 *
 * FILTRES SERVEUR (pattern RSC, aucun fetch client) :
 * - le composant client `ProspectListSection` ÉCRIT l'URL (`?status=` + `?q=`)
 *   via `useProspectFilters` (FE-4) ;
 * - **cette page RELIT ses `searchParams`** (Next 15 : `Promise`), appelle
 *   `listProspects({ status, q, limit }, viewer)` et re-passe les items en
 *   props au client à chaque navigation. Le filtrage/tri/scoping sdr
 *   sont donc faits une seule fois, côté serveur.
 *
 * `dynamic = "force-dynamic"` : la page est protégée (middleware + layout),
 * lit une session et des `searchParams` — jamais statique, donc jamais
 * pré-rendue au build (aucune lecture `getDb()` au moment de `next build`).
 *
 * viewer = `{ id, role }` chargé **ici** depuis `await auth()` (contrat C-5 :
 * jamais monté depuis le client — les arguments de Server Action voyagent en
 * POST).
 */

/** Nombre de lignes par page (plafond Zod de `listFiltersSchema` : 100). */
const LIST_LIMIT = 20;

/**
 * `force-dynamic` — la page lit une session (`auth()`), des `searchParams` et
 * appelle `listProspects` (→ `getDb()`, placeholder tant que la chaîne Neon
 * n'est pas branchée). Elle est donc **jamais** pré-rendue au build : aucune
 * lecture DB au moment de `next build`, et aucun cache statique qui
 * servirait une liste périmée (page protégée par le middleware + le layout).
 */

/** Longueur max de `q` — alignée sur `listFiltersSchema` (`@/actions/prospects`). */
const MAX_SEARCH_LENGTH = 120;

/** Suffixe des routes prospects (nav + CTA), SANS préfixe de locale. */
const PROSPECTS_HREF = "/espace/prospects";

/** Rôles habilités à créer un prospect (miroir de `CREATE_ROLES`, C-5). */
const CREATE_ROLES: readonly Role[] = ["ceo", "manager", "commercial", "sdr"];

/** Garde runtime sur l'URL forgée : seuls les 10 statuts DB sont admis. */
const VALID_STATUS_VALUES: ReadonlySet<string> = new Set<string>(STATUS_ORDER);

/**
 * Format de date UNIQUE des deux côtés de la frontière RSC : la page formatte
 * côté server et transmet une **string** (jamais de `Date` à relire côté
 * client) → aucun décalage d'hydratation possible, fuseau `Africa/Algiers`
 * (stockage UTC, rendu local, spec T02).
 */
function formatDate(value: Date | null | undefined, locale: Locale): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(value);
}

/**
 * Parse `?status=a,b` : ignore toute valeur inconnue (URL forgée), déduplique
 * et renvoie dans l'ordre canonique `STATUS_ORDER` — miroir serveur du hook
 * client (le hook n'est utilisable que dans un Client Component).
 */
function parseStatusParam(raw: string | string[] | undefined): ProspectStatus[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const requested = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (VALID_STATUS_VALUES.has(value)) requested.add(value);
  }
  return STATUS_ORDER.filter((status) => requested.has(status));
}

/** `?q=` : string trimée et plafonnée ; `undefined` si vide (filtre absent). */
function parseSearchParam(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().slice(0, MAX_SEARCH_LENGTH);
  return value.length > 0 ? value : undefined;
}

/**
 * Label de la page, **repris de la nav du rôle** (`dict.nav[role]`, entry
 * `/espace/prospects`) : « Pipeline » pour les rôles de management,
 * « Mes prospects » pour le SDR. Replis 100 % dict (jamais de littéral) :
 * la 3ᵉ branche n'est jamais atteinte (`/prospects` est interdit au client
 * par le middleware RBAC).
 */
function resolvePageTitle(dict: Awaited<ReturnType<typeof getPlatformDictionary>>, role: Role): string {
  return (
    dict.nav[role].find((item) => item.href === PROSPECTS_HREF)?.label ??
    dict.nav.ceo.find((item) => item.href === PROSPECTS_HREF)?.label ??
    dict.common.filter
  );
}

/** Adapte un item brut au contrat `PipelineRow` de FE-4 (labels pré-formatés). */
function toPipelineRow(item: ProspectListItem, locale: Locale): PipelineRow {
  return {
    ...item,
    href: `/${locale}${PROSPECTS_HREF}/${item.id}`,
    dateLabel: formatDate(item.updatedAt, locale),
    companyLabel: item.company ?? "—",
    reminderLabel:
      item.nextReminderAt === null ? null : formatDate(item.nextReminderAt, locale),
  };
}

type ProspectsPageProps = {
  params: Promise<{ locale: string }>;
  /** Next 15 : `searchParams` est une `Promise` — résolue par la page server. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: ProspectsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: resolvePageTitle(dict, "ceo") };
}

export default async function ProspectsPage({
  params,
  searchParams,
}: ProspectsPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (
    !session ||
    session.user.status !== "active" ||
    !isRole(session.user.role)
  ) {
    redirect(`/${locale}/connexion`);
  }

  const viewer = { id: session.user.id, role: session.user.role };
  const dict = await getPlatformDictionary(locale);

  // --- Filtres lus côté SERVEUR (source : l'URL écrite par le hook client) --
  const rawParams = await searchParams;
  const statuses = parseStatusParam(rawParams.status);
  const q = parseSearchParam(rawParams.q);

  const { items, total } = await listProspects(
    {
      status: statuses.length > 0 ? statuses : undefined,
      q,
      limit: LIST_LIMIT,
    },
    viewer,
  );

  // --- Libellés résolus ici (frontière RSC : uniquement des données) --------
  const statusLabels = dict.statuses.prospect;
  const columnLabels: PipelineColumnLabels = {
    name: dict.pipeline.columns.name,
    status: dict.pipeline.columns.status,
    lastActivity: dict.pipeline.columns.lastActivity,
    reminder: dict.pipeline.columns.reminder,
  };
  const canCreate = CREATE_ROLES.includes(viewer.role);
  // Colonne « Relance » : lecture globale (ceo/manager/commercial) + tous les
  // SDR internes (leur propre portefeuille).
  const showReminder = canViewAllProspects(viewer.role) || viewer.role === "sdr";

  const emptyState: PipelineEmptyState = {
    title: dict.common.noData,
    // État vide de la liste pipeline — `prospect.list.empty` (actionnable :
    // ajuster les filtres ou ajouter un prospect).
    description: dict.prospect.list.empty,
    // CTA de création (page FE-7) — masqué pour un rôle sans droit d'écriture.
    ctaLabel: canCreate ? dict.pipeline.newProspect : undefined,
    ctaHref: canCreate ? `/${locale}${PROSPECTS_HREF}/nouveau` : undefined,
  };
  const resultCountLabel = dict.pipeline.filters.resultCount.replace(
    "{count}",
    String(total),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {resolvePageTitle(dict, viewer.role)}
        </h1>
        {/* CTA création — page FE-7 (`/prospects/nouveau`) : lien seul. */}
        {canCreate ? (
          <Button href={`/${locale}${PROSPECTS_HREF}/nouveau`} size="sm">
            {`+ ${dict.pipeline.newProspect}`}
          </Button>
        ) : null}
      </div>

      {/* `useProspectFilters` (dans la section client) exige une frontière
          Suspense : c'est aussi elle qui porte le skeleton de chargement. */}
      <Suspense fallback={<PipelineTableSkeleton />}>
        <ProspectListSection
          items={items.map((item) => toPipelineRow(item, locale))}
          columnLabels={columnLabels}
          statusLabels={statusLabels}
          filterLabels={{
            allStatuses: dict.pipeline.filters.allStatuses,
            searchPlaceholder: dict.pipeline.filters.searchPlaceholder,
            clearFilters: dict.pipeline.filters.clearFilters,
            statusLabels,
          }}
          emptyState={emptyState}
          showReminder={showReminder}
          resultCountLabel={resultCountLabel}
        />
      </Suspense>
    </div>
  );
}
