import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  listExamReviewSessions,
  type ExamReviewSessionItem,
} from "@/actions/exams";
import { auth } from "@/auth";
import {
  ExamReviewPanel,
  type ExamReviewLabels,
  type ExamReviewRow,
} from "@/components/app/ExamReviewPanel";
import { Reveal } from "@/components/motion/Reveal";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Examen » (revue des sessions d'examen, espace CEO).
 *
 * ─── RÔLE ──────────────────────────────────────────────────────────────────
 * **CEO seul** : `listExamReviewSessions` / `getExamReviewSession` sont
 * réservées `ceo` côté serveur, la page applique la même garde (motif exact de
 * `espace/recrutement/page.tsx` : le middleware ne couvre ce suffixe que
 * tant que `permissions.ts` n'a pas son entrée — la garde de la page est LE
 * premier filet, doublée de la revalidation du rôle dans chaque action).
 *
 * ─── DONNÉES ───────────────────────────────────────────────────────────────
 * Lecture via `listExamReviewSessions()` (Server Action) puis projection en
 * `ExamReviewRow` : **uniquement des strings et booléens sérialisables**
 * franchissent la frontière RSC. Les dates sont formatées ICI
 * (`Intl.DateTimeFormat`, fuseau `Africa/Algiers` — la DB stocke en UTC) :
 * aucun `Date` ni formatter côté client sur la liste, donc aucun décalage
 * d'hydratation.
 *
 * Le tri (`in_progress` d'abord, puis `submitted`) et le filtre H3 (exclusion
 * des candidatures `recrute` / `refuse` / `exam_failed` = « Archivés ») sont
 * appliqués EN BASE par l'action — pas de tri ni de filtre approximatifs ici.
 *
 * ─── ERREURS ───────────────────────────────────────────────────────────────
 * `{ ok: false }` → `console.error` + bloc sobre `common.retry` (aucun détail
 * technique en UI) ; l'erreur d'infra non interceptée par l'action est
 * propagée → 500 (jamais présentée comme « aucune session »).
 */

type ExamenPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Format de date/heure UNIQUE côté serveur — miroir exact de
 * `espace/recrutement/page.tsx` (DB en UTC, affichage en `Africa/Algiers`).
 *
 * @param value ISO 8601 (`started_at`, `submitted_at`, `expires_at`).
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
 * Durée mesurée `mm:ss` — **indicative**, jamais bloquante (le chrono du
 * candidat n'est ni une contrainte ni un critère de décision).
 */
function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

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
 * Projection `ExamReviewSessionItem` → `ExamReviewRow` (tout sérialisable).
 * Les dates sont formatées ici, côté serveur.
 */
function toRow(item: ExamReviewSessionItem, locale: Locale): ExamReviewRow {
  const firstName = item.firstName.trim();
  const lastName = item.lastName.trim();

  return {
    sessionId: item.sessionId,
    applicationId: item.applicationId,
    candidateName: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email: item.email.trim(),
    locale: item.locale,
    sessionStatus: item.sessionStatus,
    applicationStatus: item.applicationStatus,
    startedLabel: formatDateTime(item.startedAt, locale) ?? "—",
    submittedLabel:
      item.submittedAt === null ? null : (formatDateTime(item.submittedAt, locale) ?? "—"),
    expiresLabel:
      item.expiresAt === null ? null : (formatDateTime(item.expiresAt, locale) ?? "—"),
    durationLabel:
      item.elapsedSeconds === null ? null : formatElapsed(item.elapsedSeconds),
    submittedAt: item.submittedAt,
  };
}

export async function generateMetadata({
  params,
}: ExamenPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title:
      dict.nav.ceo.find((item) => item.href === "/espace/examen")?.label ??
      dict.examReview.title,
  };
}

export default async function ExamenPage({
  params,
}: ExamenPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  // RBAC route : `/espace/examen` est réservé au CEO — les actions refuseraient
  // de toute façon, mais la page ne montre aucun vestige (PII candidats).
  if (session.user.role !== "ceo") notFound();

  const dict = await getPlatformDictionary(locale);
  const { examReview, common, recruitment } = dict;
  const title =
    dict.nav.ceo.find((item) => item.href === "/espace/examen")?.label ??
    examReview.title;

  const listResult = await listExamReviewSessions();

  let content: React.JSX.Element;
  if (!listResult.ok) {
    console.error("[espace/examen] échec de la liste de revue", listResult.code);
    content = errorBlock(common.retry);
  } else {
    // Libellés résolus ICI (frontière RSC : uniquement des strings au client,
    // y compris les objets de popup et les codes d'erreur traduits).
    const labels: ExamReviewLabels = {
      loading: common.loading,
      empty: common.noData,
      emptyHint: examReview.emptyHint,
      inProgressTitle: examReview.inProgressTitle,
      submittedTitle: examReview.submittedTitle,
      columns: examReview.columns,
      sessionStatus: examReview.sessionStatus,
      openDetail: examReview.openDetail,
      closeDetail: examReview.closeDetail,
      detailTitle: examReview.detailTitle,
      applicationStatusLabel: examReview.applicationStatusLabel,
      startedAtLabel: examReview.startedAtLabel,
      submittedAtLabel: examReview.submittedAtLabel,
      expiresAtLabel: examReview.expiresAtLabel,
      durationLabel: examReview.durationLabel,
      sectionLabel: examReview.sectionLabel,
      noAnswers: examReview.noAnswers,
      eliminatoryLabel: examReview.eliminatoryLabel,
      expectedAnswer: examReview.expectedAnswer,
      answerMatches: examReview.answerMatches,
      answerDiffers: examReview.answerDiffers,
      withinDeadline: examReview.withinDeadline,
      overdue: examReview.overdue,
      recruitAction: examReview.recruitAction,
      recruiting: examReview.recruiting,
      recruitSuccess: examReview.recruitSuccess,
      rejectAction: examReview.rejectAction,
      confirmRecruit: examReview.confirmRecruit,
      confirmReject: examReview.confirmReject,
      errors: examReview.errors,
      applicationStatus: recruitment.status,
      modal: recruitment.modal,
    };

    content = (
      <ExamReviewPanel
        rows={listResult.items.map((item) => toRow(item, locale))}
        labels={labels}
        locale={locale}
        // Acteur revalidé côté serveur (page CEO-only ci-dessus), transmis
        // sérialisable au panel pour `recruitCandidate` (contrat §2.3).
        actor={{ id: session.user.id, role: session.user.role }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.5rem)] text-fg">{title}</h1>
        <p className="max-w-[68ch] text-[15px] leading-[1.65] text-muted">
          {examReview.intro}
        </p>
      </div>

      <Reveal>{content}</Reveal>
    </div>
  );
}
