"use client";

/**
 * Atheris — panneau de revue d'examen (page `/espace/examen`, espace CEO).
 *
 * Composant CLIENT dont **toutes** les données et tous les libellés sont
 * produits côté serveur par `espace/examen/page.tsx` : lignes projetées
 * (`ExamReviewRow`, dates déjà formatées en `Africa/Algiers`) et strings du
 * dict (`dict.examReview.*`, plus `recruitment.status` / `recruitment.modal`
 * pour les badges de statut et le modal d'e-mail). Le serveur ne renvoie
 * **jamais** de message : les codes `forbidden` / `invalid` / `not_found` /
 * `conflict` / `mail_failed` / `failed` sont traduits ici
 * (`examReview.errors.*`).
 *
 * ─── DEUX SECTIONS ──────────────────────────────────────────────────────────
 * « En cours » (sessions `in_progress`, triées en tête par l'action) puis
 * « Soumis » (file de revue). Le filtre H3 est appliqué EN BASE par
 * `listExamReviewSessions` : `recrute` / `refuse` / `exam_failed` n'arrivent
 * jamais ici — après une décision, `router.refresh()` re-fetch la liste et la
 * ligne sort d'elle-même (c'est un **filtre**, pas un statut).
 *
 * ─── DÉTAIL ─────────────────────────────────────────────────────────────────
 * « Voir les réponses » appelle `getExamReviewSession(sessionId)` (Server
 * Action, garde CEO revalidée) et affiche les réponses groupées par section
 * 1→4. Les QUESTIONS viennent de `EXAM_QUESTIONS` / `SECTION_TITLES`
 * (`src/lib/exam.ts`, source de vérité commune, import en lecture seule) :
 * le serveur n'a transmis que des réponses.
 *
 * ─── DÉCISIONS : POPUP OBLIGATOIRE ──────────────────────────────────────────
 * Un clic sur « Recruter » ou « Refuser » n'exécute **JAMAIS** l'action : il
 * ouvre une popup `role="dialog"` + `aria-modal` (Annuler / Confirmer). Seule
 * la validation explicite appelle `recruitCandidate({ applicationId, locale },
 * actor)` — succès → `router.refresh()` ; échec → `role="alert"` traduit.
 * « Refuser » rend ensuite `ApplicationEmailModal` avec `kind="reject"`
 * UNIQUEMENT (le kind `invite` n'existe plus dans ce parcours).
 *
 * ─── A11Y ───────────────────────────────────────────────────────────────────
 * Sections sémantiques (`section` + `aria-labelledby`), liste `<ul>`/`<li>`,
 * paires `<dl>`/`<dt>`/`<dd>` pour les métadonnées, badges = couleur **ET**
 * texte, popups focusables avec Échap pour fermer, toasts `role="status"` /
 * `role="alert"` avec `aria-live`.
 */

import { Inbox } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { getExamReviewSession, type ExamReviewSessionDetail } from "@/actions/exams";
import { recruitCandidate } from "@/actions/recrutement";
import { ApplicationEmailModal } from "@/components/app/ApplicationEmailModal";
import { Button } from "@/components/ui/Button";
import type {
  ExamReviewContent,
  JobApplicationStatus,
  RecruitmentContent,
} from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import {
  ELIMINATORY_QUESTION_ID,
  EXAM_SECTIONS,
  SECTION_TITLES,
  questionsForSection,
  type ExamQuestion,
} from "@/lib/exam";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Courbe unique du projet (aucun easing concurrent). */
const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

// ---------------------------------------------------------------------------
// Vue-modèle (produit par la page, 100 % sérialisable).
// ---------------------------------------------------------------------------

/** Une ligne de la file de revue — dates DÉJÀ formatées côté serveur. */
export type ExamReviewRow = {
  sessionId: string;
  /** Requise par `recruitCandidate` (jamais le jeton public). */
  applicationId: string;
  candidateName: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Locale de la CANDIDATURE (langue de l'e-mail de décision). */
  locale: "fr" | "en";
  sessionStatus: "in_progress" | "submitted";
  applicationStatus: JobApplicationStatus;
  startedLabel: string;
  submittedLabel: string | null;
  expiresLabel: string | null;
  durationLabel: string | null;
  /** ISO — pilote le badge « < 24 h » (`null` tant que non soumis). */
  submittedAt: string | null;
};

/** Libellés résolus server (100 % `dict.examReview.*` + `dict.recruitment.*`). */
export type ExamReviewLabels = {
  loading: string;
  /** État vide des sections — `dict.common.noData`. */
  empty: string;
  emptyHint: string;
  /** Titres des deux sections de la file. */
  inProgressTitle: string;
  submittedTitle: string;
  columns: ExamReviewContent["columns"];
  sessionStatus: ExamReviewContent["sessionStatus"];
  openDetail: string;
  closeDetail: string;
  detailTitle: string;
  applicationStatusLabel: string;
  startedAtLabel: string;
  submittedAtLabel: string;
  expiresAtLabel: string;
  durationLabel: string;
  sectionLabel: string;
  noAnswers: string;
  eliminatoryLabel: string;
  expectedAnswer: string;
  answerMatches: string;
  answerDiffers: string;
  withinDeadline: string;
  overdue: string;
  recruitAction: string;
  recruiting: string;
  recruitSuccess: string;
  rejectAction: string;
  confirmRecruit: ExamReviewContent["confirmRecruit"];
  confirmReject: ExamReviewContent["confirmReject"];
  errors: ExamReviewContent["errors"];
  /** Pastille de statut de la CANDIDATURE (`dict.recruitment.status`). */
  applicationStatus: RecruitmentContent["status"];
  /** Modal d'e-mail de refus (`dict.recruitment.modal`). */
  modal: RecruitmentContent["modal"];
};

export type ExamReviewPanelProps = {
  rows: ExamReviewRow[];
  labels: ExamReviewLabels;
  locale: Locale;
  /**
   * Acteur CEO projeté depuis la session serveur (page `/espace/examen`) et
   * revalidé côté serveur par `recruitCandidate` (Zod + garde rôle `ceo`) :
   * aucun rôle n'est inventé côté client.
   */
  actor: { id: string; role: Role };
};

/** État du chargement du dossier de réponses. */
type DetailState =
  | { sessionId: string; loading: true }
  | {
      sessionId: string;
      loading: false;
      item: ExamReviewSessionDetail | null;
      error: string | null;
    };

/** Décision en attente de confirmation (la popup est OBLIGATOIRE). */
type PendingDecision = {
  kind: "recruit" | "reject";
  row: ExamReviewRow;
};

// ---------------------------------------------------------------------------
// Aides pures (module scope — aucun state, aucun effet).
// ---------------------------------------------------------------------------

/**
 * Âge d'une soumission en heures (flottant) — pilote le badge « < 24 h » de
 * l'engagement de revue sous 24 h. Date absente → `0` (aucune alerte sans
 * horodatage).
 */
function hoursSince(iso: string | null): number {
  if (iso === null) return 0;
  const submitted = Date.parse(iso);
  if (Number.isNaN(submitted)) return 0;
  return Math.max(0, (Date.now() - submitted) / 3_600_000);
}

/**
 * Format de date/heure côté CLIENT (détail fraîchement fetché) — même fuseau
 * `Africa/Algiers` que le rendu serveur de la liste, aucun décalage d'affichage.
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

/** Durée `mm:ss` — indicative, jamais bloquante (motif `ApplicationsPanel`). */
function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Code brut du serveur → message localisé (jamais de string servie en dur). */
function errorText(code: string, labels: ExamReviewLabels): string {
  switch (code) {
    case "forbidden":
      return labels.errors.forbidden;
    case "invalid":
      return labels.errors.invalid;
    case "not_found":
      return labels.errors.notFound;
    case "conflict":
      return labels.errors.conflict;
    case "mail_failed":
      return labels.errors.mailFailed;
    default:
      return labels.errors.failed;
  }
}

/**
 * Réponse affichable : pour un QCM/binaire, l'id stocké (`"yes"`) devient le
 * libellé localisé de l'option ; pour du texte libre, le texte lui-même.
 */
function answerText(
  question: ExamQuestion,
  raw: string | undefined,
  locale: Locale,
): string | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  const option = question.options?.find((candidate) => candidate.id === value);
  return option !== undefined ? option.label[locale] : value;
}

/** Statuts « déjà tranchés » = filtre H3 (archivés) — jamais de décision ici. */
function isArchived(status: JobApplicationStatus): boolean {
  return status === "recrute" || status === "refuse" || status === "exam_failed";
}

/** Teintes de pastille — la couleur ne porte JAMAIS le sens seule. */
const SESSION_STATUS_TONE: Record<"in_progress" | "submitted", string> = {
  in_progress: "border-[rgba(143,166,200,0.30)] bg-[rgba(143,166,200,0.14)] text-[#B8C7DF]",
  submitted: "border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]",
};

const DEADLINE_TONE = {
  within: "border-line text-faint",
  overdue: "border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]",
} as const;

// ---------------------------------------------------------------------------
// Popup de confirmation — un clic ne décide JAMAIS seul.
// ---------------------------------------------------------------------------

type ConfirmDialogProps = {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Libellé du bouton pendant l'appel serveur (recrutement en vol). */
  busyLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDialog({
  title,
  message,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus sur la popup au montage : le titre est annoncé, et la TABULATION
  // débute sur « Annuler » (l'action destructive n'est jamais sous le doigt).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  /**
   * Piège de focus limité (`aria-modal="true"`) : Tab tourne dans la popup et
   * n'en sort jamais — un lecteur d'écran reste dans la confirmation.
   */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      if (!busy) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])"),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center ${EASE}`}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop — cliquable pour fermer (jamais pendant l'appel). */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[rgba(8,9,11,0.72)] transition-opacity duration-200 ${EASE}`}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-[520px] flex-col gap-5 rounded-[20px] border border-line bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] focus:outline-none"
      >
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="h-display text-[20px] leading-tight text-fg">
            {title}
          </h2>
          <p className="text-[14px] leading-[1.6] text-muted">{message}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            aria-disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau.
// ---------------------------------------------------------------------------

export function ExamReviewPanel({
  rows,
  labels,
  locale,
  actor,
}: ExamReviewPanelProps): React.JSX.Element {
  const router = useRouter();
  const params = useParams();
  // Locale de l'URL lue côté client (motif `ApplicationsPanel`) : jamais de
  // code langue en dur ; repli sur la prop serveur si l'URL est illisible.
  const rawLocale = params["locale"];
  const urlLocale: Locale | undefined =
    typeof rawLocale === "string" && isValidLocale(rawLocale) ? rawLocale : undefined;

  const [detail, setDetail] = useState<DetailState | null>(null);
  const [decision, setDecision] = useState<PendingDecision | null>(null);
  const [recruiting, setRecruiting] = useState(false);
  const [rejectRow, setRejectRow] = useState<ExamReviewRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  // Après une décision, `router.refresh()` retire la ligne de la liste (filtre
  // H3) : le dossier ouvert serait orphelin → fermeture automatique.
  useEffect(() => {
    if (detail === null) return;
    if (!rows.some((row) => row.sessionId === detail.sessionId)) setDetail(null);
  }, [rows, detail]);

  /** Ouvre/ferme le dossier : un seul déplié à la fois. */
  async function handleToggle(row: ExamReviewRow): Promise<void> {
    if (detail?.sessionId === row.sessionId) {
      setDetail(null);
      return;
    }
    setDetail({ sessionId: row.sessionId, loading: true });
    setAlert(null);
    try {
      const result = await getExamReviewSession(row.sessionId);
      if (result.ok) {
        setDetail({ sessionId: row.sessionId, loading: false, item: result.item, error: null });
      } else {
        setDetail({
          sessionId: row.sessionId,
          loading: false,
          item: null,
          error: errorText(result.code, labels),
        });
      }
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setDetail({
        sessionId: row.sessionId,
        loading: false,
        item: null,
        error: labels.errors.failed,
      });
    }
  }

  /**
   * « Recruter » — exécuté UNIQUEMENT depuis la popup de confirmation.
   * Succès → toast `role="status"` + fermeture du dossier + `router.refresh()`
   * (la ligne bascule hors du filtre H3) ; échec → `role="alert"` traduit.
   */
  async function handleConfirmRecruit(row: ExamReviewRow): Promise<void> {
    if (recruiting) return;
    setRecruiting(true);
    setAlert(null);
    setNotice(null);
    try {
      const result = await recruitCandidate(
        { applicationId: row.applicationId, locale: urlLocale ?? locale },
        actor,
      );
      if (result.ok) {
        setDecision(null);
        setDetail(null);
        setNotice(labels.recruitSuccess);
        router.refresh();
        return;
      }
      setDecision(null);
      setAlert(errorText(result.code, labels));
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setDecision(null);
      setAlert(labels.errors.failed);
    } finally {
      setRecruiting(false);
    }
  }

  /** « Refuser » — la popup valide, puis le modal d'e-mail `kind="reject"`. */
  function handleConfirmReject(row: ExamReviewRow): void {
    setDecision(null);
    setAlert(null);
    setRejectRow(row);
  }

  /** Envoi du refus réussi : toast + re-fetch server (ligne archivée). */
  function handleSent(): void {
    setNotice(labels.modal.successReject);
    setRejectRow(null);
    setDetail(null);
    router.refresh();
  }

  /** Dossier de réponses d'une ligne — états chargement / erreur / contenu. */
  function renderDetail(row: ExamReviewRow): React.JSX.Element | null {
    const state = detail;
    if (state === null || state.sessionId !== row.sessionId) return null;

    if (state.loading) {
      return (
        <div className="border-t border-line pt-5">
          <p role="status" className="text-sm text-muted">
            {labels.loading}
          </p>
        </div>
      );
    }
    if (state.error !== null || state.item === null) {
      return (
        <div className="border-t border-line pt-5">
          <p role="alert" className="text-sm text-danger">
            {state.error ?? labels.errors.failed}
          </p>
        </div>
      );
    }

    const item = state.item;
    // Décisions possibles UNIQUEMENT sur un examen soumis, encore non tranché :
    // le filtre H3 garantit que `recrute`/`refuse`/`exam_failed` n'arrivent
    // pas en liste, mais le détail est re-fetché (état potentiellement figé).
    const canDecide = item.sessionStatus === "submitted" && !isArchived(item.applicationStatus);

    return (
      <div className="flex flex-col gap-5 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[15px] font-semibold text-fg">{labels.detailTitle}</h3>
          <span
            className={cn(
              "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 micro",
              isArchived(item.applicationStatus)
                ? "border-[rgba(255,107,90,0.25)] bg-[rgba(255,107,90,0.12)] text-danger"
                : "border-[rgba(204,255,74,0.25)] bg-[rgba(204,255,74,0.10)] text-accent",
            )}
          >
            {labels.applicationStatus[item.applicationStatus]}
          </span>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.email}</dt>
            <dd className="text-[15px]">
              <a
                href={`mailto:${item.email}`}
                className="text-fg underline decoration-line-2 underline-offset-4 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:decoration-accent"
              >
                {item.email}
              </a>
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.applicationStatusLabel}</dt>
            <dd className="text-[15px] text-fg">
              {labels.applicationStatus[item.applicationStatus]}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.startedAtLabel}</dt>
            <dd className="text-[15px] tabular-nums text-fg">
              {formatDateTime(item.startedAt, locale) ?? "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.submittedAtLabel}</dt>
            <dd className="text-[15px] tabular-nums text-fg">
              {item.submittedAt !== null
                ? (formatDateTime(item.submittedAt, locale) ?? "—")
                : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.durationLabel}</dt>
            <dd className="text-[15px] tabular-nums text-fg">
              {item.elapsedSeconds !== null ? formatElapsed(item.elapsedSeconds) : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.expiresAtLabel}</dt>
            <dd className="text-[15px] tabular-nums text-fg">
              {item.expiresAt !== null ? (formatDateTime(item.expiresAt, locale) ?? "—") : "—"}
            </dd>
          </div>
        </dl>

        {/* ── Réponses, groupées par section 1→4 du barème ──────────────── */}
        <div className="flex flex-col gap-4">
          {item.answers.length === 0 ? (
            <p className="text-[14px] text-muted">{labels.noAnswers}</p>
          ) : (
            EXAM_SECTIONS.map((section) => {
              // Index section → questionId : réponse, jamais la question
              // (le serveur n'envoie que des réponses).
              const byQuestion = new Map<string, string>();
              for (const answer of item.answers) {
                if (answer.section === section) byQuestion.set(answer.questionId, answer.answer);
              }
              if (byQuestion.size === 0) return null;

              return (
                <div key={section} className="flex flex-col gap-2.5">
                  <p className="micro text-accent">
                    {labels.sectionLabel.replace("{{n}}", String(section))}{" "}
                    <span className="text-faint">— {SECTION_TITLES[section][locale]}</span>
                  </p>

                  {questionsForSection(section).map((question) => {
                    const given = byQuestion.get(question.id);
                    const givenLabel = answerText(question, given, locale);
                    // Repère de REVUE : la réponse attendue d'un QCM est
                    // affichée UNIQUEMENT ICI (au CEO), jamais au candidat.
                    const expected =
                      question.options?.find((option) => option.recommended === true) ?? null;
                    const matches = expected !== null && given === expected.id;
                    const eliminatory = question.id === ELIMINATORY_QUESTION_ID;

                    return (
                      <div
                        key={question.id}
                        className={cn(
                          "rounded-xl border px-3.5 py-3",
                          eliminatory
                            ? "border-[rgba(255,107,90,0.45)] bg-[rgba(255,107,90,0.05)]"
                            : "border-line bg-ink-2",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-[13px] leading-[1.5] text-muted">
                            {question.prompt[locale]}
                          </p>
                          {eliminatory ? (
                            <span className="micro shrink-0 rounded-full border border-[rgba(255,107,90,0.45)] px-2.5 py-1 text-danger">
                              {labels.eliminatoryLabel}
                            </span>
                          ) : null}
                        </div>
                        <p
                          className={cn(
                            "mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.6]",
                            givenLabel === null ? "text-faint" : "text-fg",
                          )}
                        >
                          {givenLabel ?? labels.noAnswers}
                        </p>
                        {expected !== null ? (
                          <p className="micro mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
                            <span className="text-faint">{labels.expectedAnswer}</span>
                            <span
                              className={cn(matches ? "text-success" : "text-[#F59E0B]")}
                            >
                              {expected.label[locale]}
                            </span>
                            {given !== undefined ? (
                              <span
                                className={cn(matches ? "text-success" : "text-[#F59E0B]")}
                              >
                                · {matches ? labels.answerMatches : labels.answerDiffers}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* ── Décisions (fin des réponses) : TOUJOURS après confirmation ── */}
        {canDecide ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDecision({ kind: "reject", row });
              }}
            >
              {labels.rejectAction}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setDecision({ kind: "recruit", row });
              }}
            >
              {labels.recruitAction}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  /** Une ligne de la file (carte unique, responsive sans double moteur). */
  function renderRow(row: ExamReviewRow): React.JSX.Element {
    const open = detail !== null && detail.sessionId === row.sessionId;
    const pending =
      row.sessionStatus === "submitted" &&
      row.applicationStatus === "exam_submitted" &&
      row.submittedAt !== null;
    const hours = hoursSince(row.submittedAt);

    return (
      <li
        key={row.sessionId}
        className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] text-fg">{row.candidateName}</span>
            <a
              href={`mailto:${row.email}`}
              className="break-all text-sm text-muted underline decoration-line-2 underline-offset-4 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:decoration-accent"
            >
              {row.email}
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 micro",
                SESSION_STATUS_TONE[row.sessionStatus],
              )}
            >
              {row.sessionStatus === "in_progress"
                ? labels.sessionStatus.inProgress
                : labels.sessionStatus.submitted}
            </span>
            {/* Engagement de revue sous 24 h — soumis ET non tranché. */}
            {pending ? (
              <span
                className={cn(
                  "micro whitespace-nowrap rounded-full border px-2.5 py-1",
                  hours > 24 ? DEADLINE_TONE.overdue : DEADLINE_TONE.within,
                )}
              >
                {hours > 24 ? labels.overdue : labels.withinDeadline}
              </span>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-expanded={open}
              onClick={() => {
                void handleToggle(row);
              }}
            >
              {open ? labels.closeDetail : labels.openDetail}
            </Button>
          </div>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.startedAt}</dt>
            <dd className="text-[14px] tabular-nums text-muted">{row.startedLabel}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.submittedAt}</dt>
            <dd className="text-[14px] tabular-nums text-muted">
              {row.submittedLabel ?? "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.duration}</dt>
            <dd className="text-[14px] tabular-nums text-muted">{row.durationLabel ?? "—"}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.status}</dt>
            <dd className="text-[14px] text-muted">
              {labels.applicationStatus[row.applicationStatus]}
            </dd>
          </div>
        </dl>

        {open ? renderDetail(row) : null}
      </li>
    );
  }

  const inProgressRows = rows.filter((row) => row.sessionStatus === "in_progress");
  const submittedRows = rows.filter((row) => row.sessionStatus === "submitted");

  return (
    <div className="flex flex-col gap-6" lang={locale}>
      {/* Toast de succès (aria-live) + alerte d'échec (aucun détail technique). */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-h-5 text-sm text-success"
      >
        {notice}
      </p>
      {alert !== null ? (
        <p role="alert" className="text-sm text-danger">
          {alert}
        </p>
      ) : null}

      {rows.length === 0 ? (
        /* ---------------------------------------- État vide global -------- */
        <div className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-surface px-6 py-14 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full border border-line bg-ink-2 text-muted"
          >
            <Inbox size={22} strokeWidth={1.5} />
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold text-fg">{labels.empty}</span>
            <span className="text-sm text-muted">{labels.emptyHint}</span>
          </span>
        </div>
      ) : (
        <>
          {/* ── Section « En cours » ──────────────────────────────────────── */}
          <section
            aria-labelledby="exam-review-in-progress"
            className="flex flex-col gap-4"
          >
            <h2
              id="exam-review-in-progress"
              className="text-lg font-semibold tracking-[-0.015em] text-fg"
            >
              {labels.inProgressTitle}
            </h2>
            {inProgressRows.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {inProgressRows.map((row) => renderRow(row))}
              </ul>
            ) : (
              <p className="rounded-[20px] border border-line bg-surface px-6 py-8 text-center text-[14px] text-muted">
                {labels.empty}
              </p>
            )}
          </section>

          {/* ── Section « Soumis » ────────────────────────────────────────── */}
          <section aria-labelledby="exam-review-submitted" className="flex flex-col gap-4">
            <h2
              id="exam-review-submitted"
              className="text-lg font-semibold tracking-[-0.015em] text-fg"
            >
              {labels.submittedTitle}
            </h2>
            {submittedRows.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {submittedRows.map((row) => renderRow(row))}
              </ul>
            ) : (
              <p className="rounded-[20px] border border-line bg-surface px-6 py-8 text-center text-[14px] text-muted">
                {labels.empty}
              </p>
            )}
          </section>
        </>
      )}

      {/* ── Popup de confirmation — un clic ne décide jamais seul ─────────── */}
      {decision !== null ? (
        <ConfirmDialog
          title={
            decision.kind === "recruit"
              ? labels.confirmRecruit.title
              : labels.confirmReject.title
          }
          message={
            decision.kind === "recruit"
              ? labels.confirmRecruit.message
              : labels.confirmReject.message
          }
          cancelLabel={
            decision.kind === "recruit"
              ? labels.confirmRecruit.cancel
              : labels.confirmReject.cancel
          }
          confirmLabel={
            decision.kind === "recruit"
              ? labels.confirmRecruit.confirm
              : labels.confirmReject.confirm
          }
          busyLabel={labels.recruiting}
          busy={recruiting}
          onCancel={() => {
            if (!recruiting) setDecision(null);
          }}
          onConfirm={() => {
            if (decision.kind === "recruit") {
              void handleConfirmRecruit(decision.row);
            } else {
              handleConfirmReject(decision.row);
            }
          }}
        />
      ) : null}

      {/* ── Refus : modal d'e-mail `kind="reject"` UNIQUEMENT ─────────────── */}
      {rejectRow !== null ? (
        <ApplicationEmailModal
          kind="reject"
          applicationId={rejectRow.applicationId}
          candidateFirstName={rejectRow.firstName}
          candidateLastName={rejectRow.lastName}
          applicationLocale={rejectRow.locale}
          labels={{ modal: labels.modal }}
          onClose={() => {
            setRejectRow(null);
          }}
          onSent={handleSent}
        />
      ) : null}
    </div>
  );
}
