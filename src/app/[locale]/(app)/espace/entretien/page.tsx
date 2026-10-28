import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listInterviews, type InterviewListItem } from "@/actions/interviews";
import { auth } from "@/auth";
import {
  InterviewLinks,
  type InterviewLinksLabels,
  type InterviewRow,
} from "@/components/app/InterviewLinks";
import type { InterviewStatusLabels } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Entretiens » (PLAN.md décision **Q3** · §2.3).
 *
 * ─── RÔLE ──────────────────────────────────────────────────────────────────
 * **CEO seul** : `createInterviewLink` / `listInterviews` sont réservés `ceo`
 * côté serveur, la page applique la même garde (le middleware ne dispose pas
 * d'entrée `ROUTE_ACCESS` pour ce suffixe : le match retombe sur `/` qui
 * ouvre tout rôle authentifié — ce garde est donc LE premier filet, doublé
 * de la revalidation du rôle dans chaque action).
 *
 * ─── DONNÉES ───────────────────────────────────────────────────────────────
 * Lecture via `listInterviews()` (Server Action, acteur reconstruit en
 * session) puis projection en `InterviewRow` : **uniquement des strings et
 * booléens sérialisables** franchissent la frontière RSC. Les dates sont
 * formatées ICI (`Intl.DateTimeFormat`, fuseau `Africa/Algiers` — la DB
 * stocke en UTC) : aucun `Date` ni formatter côté client, donc aucun décalage
 * d'hydratation.
 *
 * ─── ERREURS ───────────────────────────────────────────────────────────────
 * `{ ok: false }` → `console.error` + bloc sobre `common.retry` (aucun détail
 * technique en UI) ; l'erreur d'infra non interceptée par l'action est
 * propagée → 500 (jamais présentée comme « aucune donnée »).
 *
 * DB-PENDING : `listInterviews()` n'est appelée qu'à l'intérieur de la page
 * (lazy) → `next build` ne lit jamais `DATABASE_URL`.
 */

/** Bloc d'erreur sobre — `common.retry`, aucun détail technique en UI. */
function errorBlock(retryLabel: string): React.JSX.Element {
  return (
    <div className="rounded-[20px] border border-line bg-surface px-6 py-12 text-center">
      <p role="status" className="text-[15px] font-semibold text-fg">
        {retryLabel}
      </p>
    </div>
  );
}

/**
 * Format de date/heure UNIQUE côté serveur : la DB stocke des ISO 8601 UTC,
 * l'affichage est demandé en `Africa/Algiers` (fuseau du recruteur, spec T02).
 *
 * @param value ISO 8601 (`starts_at` ou `created_at`).
 * @returns Date formatée, ou `null` si la valeur est illisible.
 */
function formatDateTime(value: string, locale: Locale): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(date);
}

/**
 * Projection `InterviewListItem` → `InterviewRow` (tout sérialisable).
 *
 * ⚠ `starts_at` d'un lien **non réservé** est une sentinelle (= instant de
 * création, JSDoc de `src/actions/interviews.ts`) : il n'est donc jamais
 * présenté comme un créneau, d'où `slotLabel: null`.
 */
function toRow(
  item: InterviewListItem,
  locale: Locale,
  statusLabels: InterviewStatusLabels,
): InterviewRow {
  const name = `${item.firstName} ${item.lastName}`.trim();
  const email = item.email.trim();
  const hasCandidate = item.booked && name.length > 0 && email.length > 0;

  return {
    id: item.id,
    path: `/${locale}/entretien/${item.token}`,
    status: item.status,
    statusLabel: statusLabels[item.status],
    label: item.label ?? null,
    booked: item.booked,
    slotLabel: item.booked ? formatDateTime(item.startsAt, locale) : null,
    candidateName: hasCandidate ? name : null,
    candidateEmail: hasCandidate ? email : null,
    createdLabel: formatDateTime(item.createdAt, locale) ?? "—",
    // Usage unique : un lien `pending` déjà réservé est consommé.
    reservable: item.status === "pending" && !item.booked,
  };
}

type EntretienPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: EntretienPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.interviews.title };
}

export default async function EntretienPage({
  params,
}: EntretienPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  // RBAC route : `/espace/entretien` est réservé au CEO (Q3) — les actions
  // refuseraient de toute façon, mais la page ne montre aucun vestige.
  if (session.user.role !== "ceo") notFound();

  const dict = await getPlatformDictionary(locale);
  const { interviews } = dict;
  const title =
    dict.nav.ceo.find((item) => item.href === "/espace/entretien")?.label ??
    interviews.title;

  const listResult = await listInterviews();

  let content: React.JSX.Element;
  if (!listResult.ok) {
    console.error("[entretien] échec de la liste des entretiens", listResult.code);
    content = errorBlock(dict.common.retry);
  } else {
    // Libellés résolus ICI (frontière RSC : uniquement des strings au client).
    const labels: InterviewLinksLabels = {
      create: interviews.create,
      creating: interviews.creating,
      linkName: interviews.linkName,
      linkNamePlaceholder: interviews.linkNamePlaceholder,
      createTitle: interviews.createTitle,
      createHint: interviews.createHint,
      linkTitle: interviews.linkTitle,
      linkLabel: interviews.linkLabel,
      copy: interviews.copy,
      copied: interviews.copied,
      copyFallback: interviews.copyFallback,
      openLink: interviews.openLink,
      delete: interviews.delete,
      deleting: interviews.deleting,
      deleteConfirm: interviews.deleteConfirm,
      cancel: dict.common.cancel,
      listTitle: interviews.listTitle,
      empty: interviews.empty,
      emptyHint: interviews.emptyHint,
      booked: interviews.booked,
      notBooked: interviews.notBooked,
      timezoneNote: interviews.timezoneNote,
      columns: interviews.columns,
      errors: interviews.errors,
    };

    const rows = listResult.interviews.map((item) =>
      toRow(item, locale, interviews.status),
    );

    content = <InterviewLinks rows={rows} labels={labels} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Index `08` réservé à `/recrutement` et aux sections de landing :
          pas d'index ici → H1 `.h-display` sobre dans le shell applicatif. */}
      <div className="flex flex-col gap-3">
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.5rem)] text-fg">{title}</h1>
        <p className="max-w-[68ch] text-[15px] leading-[1.65] text-muted">
          {interviews.intro}
        </p>
      </div>

      {content}
    </div>
  );
}
