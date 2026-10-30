import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  listJobApplications,
  type JobApplicationListItem,
} from "@/actions/recrutement";
import { auth } from "@/auth";
import {
  ApplicationsPanel,
  type ApplicationsPanelLabels,
} from "@/components/app/ApplicationsPanel";
import { Reveal } from "@/components/motion/Reveal";
import type {
  JobApplicationStatus,
  RecruitmentContent,
} from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Recrutement » (espace CEO).
 *
 * ─── RÔLE ──────────────────────────────────────────────────────────────────
 * **CEO seul** : `listJobApplications` / `inviteToInterview` / `rejectApplication`
 * sont réservés `ceo` côté serveur, la page applique la même garde (motif
 * identique à `espace/entretien/page.tsx` : le middleware ne couvre pas ce
 * suffixe, la garde de la page est LE premier filet, doublée de la
 * revalidation du rôle dans chaque action).
 *
 * ─── DONNÉES ───────────────────────────────────────────────────────────────
 * Lecture via `listJobApplications()` (Server Action, acteur reconstruit en
 * session) puis projection en `ApplicationRow` : **uniquement des strings et
 * booléens sérialisables** franchissent la frontière RSC. Les dates sont
 * formatées ICI (`Intl.DateTimeFormat`, fuseau `Africa/Algiers` — la DB
 * stocke en UTC) : aucun `Date` ni formatter côté client, donc aucun décalage
 * d'hydratation.
 *
 * ─── ERREURS ───────────────────────────────────────────────────────────────
 * `{ ok: false }` → `console.error` + bloc sobre `common.retry` (aucun détail
 * technique en UI) ; l'erreur d'infra non interceptée par l'action est
 * propagée → 500 (jamais présentée comme « aucune candidature »).
 */

/** Une ligne de la table — projection 100 % sérialisable (frontière RSC). */
export type ApplicationRow = {
  id: string;
  candidateName: string;
  /** Prénom seul — variables `{{prenom}}` du modèle d'e-mail. */
  firstName: string;
  /** Nom seul — variable `{{nom}}` du modèle d'e-mail. */
  lastName: string;
  email: string;
  status: JobApplicationStatus;
  /** `dict.recruitment.status[status]`. */
  statusLabel: string;
  locale: Locale;
  /** CV facultatif : `null` = déposé sans pièce jointe (CTA masqué en UI). */
  cvFilename: string | null;
  /** Taille du CV formatée server (`Intl.NumberFormat`, motif `ApplyForm`).
   *  `null` sans CV. */
  cvByteSizeLabel: string | null;
  /** Date de dépôt, formatée server. */
  appliedLabel: string;
  /** Date d'invitation, formatée server, `null` si jamais invitée. */
  invitedLabel: string | null;
  /** Date de refus, formatée server, `null` si jamais refusée. */
  rejectedLabel: string | null;
  /** Créneau réel formaté server en `Africa/Algiers`, `null` si non réservé. */
  slotLabel: string | null;
  /** Invitée et pas encore réservée → créneau « Pas encore réservé ». */
  bookable: boolean;
  inviteAllowed: boolean;
  rejectAllowed: boolean;
};

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
 * @param value ISO 8601 (`created_at`, `invited_at`, `rejected_at`, `starts_at`).
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
 * Taille de fichier lisible SANS string en dur : l'unité (`Mo`/`MB`,
 * `ko`/`kB`) vient d'`Intl` — miroir exact de `formatFileSize` dans
 * `src/components/recrutement/ApplyForm.tsx`.
 */
function formatFileSize(bytes: number, locale: Locale): string {
  const megabyte = 1024 * 1024;
  const isMegabyte = bytes >= megabyte;
  const unit = isMegabyte ? ("megabyte" as const) : ("kilobyte" as const);
  const value = isMegabyte ? bytes / megabyte : bytes / 1024;

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: isMegabyte ? 1 : 0,
  }).format(value);
}

/**
 * Projection `JobApplicationListItem` → `ApplicationRow` (tout sérialisable).
 *
 * `slotLabel` n'est renseigné QUE si le créneau est réellement réservé
 * (`interview.booked`) : une invitation sans réservation reste « Pas encore
 * réservé ». `invitedAt`/`rejectedAt` ne portent une date que si l'action
 * correspondante a été exécutée.
 */
function toRow(
  item: JobApplicationListItem,
  locale: Locale,
  statusLabels: RecruitmentContent["status"],
  unavailableLabel: string,
): ApplicationRow {
  const firstName = item.firstName.trim();
  const lastName = item.lastName.trim();
  const candidateName = `${firstName} ${lastName}`.trim();

  const booked = item.interview !== null && item.interview.booked;
  const slotDate =
    booked && item.interview !== null && item.interview.startsAt !== null
      ? formatDateTime(item.interview.startsAt, locale)
      : null;

  return {
    id: item.id,
    candidateName,
    firstName,
    lastName,
    email: item.email.trim(),
    status: item.status,
    statusLabel: statusLabels[item.status],
    locale: item.locale,
    cvFilename: item.cvFilename,
    // CV facultatif : sans pièce jointe, pas de taille à formater (le formatage
    // server exige un nombre — `null` n'atteint jamais `formatFileSize`).
    cvByteSizeLabel:
      item.cvByteSize === null ? null : formatFileSize(item.cvByteSize, locale),
    appliedLabel: formatDateTime(item.createdAt, locale) ?? "—",
    invitedLabel:
      item.invitedAt !== null
        ? (formatDateTime(item.invitedAt, locale) ?? "—")
        : null,
    rejectedLabel:
      item.rejectedAt !== null
        ? (formatDateTime(item.rejectedAt, locale) ?? "—")
        : null,
    // Créneau réservé mais illisible → repli explicite, jamais une date fausse.
    slotLabel: booked ? (slotDate ?? unavailableLabel) : null,
    // Invitée et toujours sans réservation → le créneau reste « à prendre ».
    bookable: item.status !== "refuse" && !booked,
    inviteAllowed: item.status !== "refuse",
    rejectAllowed: item.status !== "refuse",
  };
}

type RecrutementPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: RecrutementPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.recruitment.title };
}

export default async function RecrutementPage({
  params,
}: RecrutementPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  // RBAC route : `/espace/recrutement` est réservé au CEO — les actions
  // refuseraient de toute façon, mais la page ne montre aucun vestige.
  if (session.user.role !== "ceo") notFound();

  const dict = await getPlatformDictionary(locale);
  const { recruitment } = dict;
  const title =
    dict.nav.ceo.find((item) => item.href === "/espace/recrutement")?.label ??
    recruitment.title;

  const listResult = await listJobApplications();

  let content: React.JSX.Element;
  if (!listResult.ok) {
    console.error(
      "[recrutement] échec de la liste des candidatures",
      listResult.code,
    );
    content = errorBlock(dict.common.retry);
  } else {
    // Libellés résolus ICI (frontière RSC : uniquement des strings au client,
    // y compris `modal` et ses `errors` — jamais de message serveur).
    const labels: ApplicationsPanelLabels = {
      loading: dict.common.loading,
      listTitle: recruitment.listTitle,
      empty: recruitment.empty,
      emptyHint: recruitment.emptyHint,
      columns: recruitment.columns,
      status: recruitment.status,
      filterLabel: recruitment.filterLabel,
      filterAll: recruitment.filterAll,
      timezoneNote: recruitment.timezoneNote,
      booked: recruitment.booked,
      notBooked: recruitment.notBooked,
      openDetail: recruitment.openDetail,
      closeDetail: recruitment.closeDetail,
      detailTitle: recruitment.detailTitle,
      messageLabel: recruitment.messageLabel,
      noMessage: recruitment.noMessage,
      emailLabel: recruitment.emailLabel,
      cvDownload: recruitment.cvDownload,
      invitedAtLabel: recruitment.invitedAtLabel,
      rejectedAtLabel: recruitment.rejectedAtLabel,
      inviteAction: recruitment.inviteAction,
      recruitAction: recruitment.recruitAction,
      recruiting: recruitment.recruiting,
      recruitSuccess: recruitment.recruitSuccess,
      recruitError: recruitment.recruitError,
      rejectAction: recruitment.rejectAction,
      unavailable: recruitment.unavailable,
      examTitle: recruitment.examTitle,
      examAbsent: recruitment.examAbsent,
      examInProgress: recruitment.examInProgress,
      examDurationLabel: recruitment.examDurationLabel,
      examSubmittedLabel: recruitment.examSubmittedLabel,
      examOverdue: recruitment.examOverdue,
      examWithinDeadline: recruitment.examWithinDeadline,
      examNoAnswers: recruitment.examNoAnswers,
      examSectionLabel: recruitment.examSectionLabel,
      modal: recruitment.modal,
    };

    const rows = listResult.items.map((item) =>
      toRow(item, locale, recruitment.status, recruitment.unavailable),
    );

    // `actor` : acteur revalidé côté serveur (la page est CEO-only ci-dessus),
    // transmis sérialisable au panel pour `recruitCandidate` (contrat §2.3).
    content = (
      <ApplicationsPanel
        rows={rows}
        labels={labels}
        locale={locale}
        actor={{ id: session.user.id, role: session.user.role }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Index `08` réservé à `/recrutement` et aux sections de landing :
          pas d'index ici → H1 `.h-display` sobre dans le shell applicatif. */}
      <div className="flex flex-col gap-3">
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.5rem)] text-fg">{title}</h1>
        <p className="max-w-[68ch] text-[15px] leading-[1.65] text-muted">
          {recruitment.intro}
        </p>
      </div>

      <Reveal>{content}</Reveal>
    </div>
  );
}
