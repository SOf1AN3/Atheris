"use client";

/**
 * Atheris — panneau des candidatures de l'espace CEO (espace recrutement).
 *
 * Composant CLIENT dont **toutes** les données et tous les libellés sont
 * produits côté serveur par `espace/recrutement/page.tsx` : lignes projetées
 * (`ApplicationRow`, dates déjà formatées en `Africa/Algiers`) et strings du
 * dict (`dict.recruitment.*`, y compris `modal`). Le serveur ne renvoie
 * **jamais** de message : les codes `forbidden` / `invalid` / `not_found` /
 * `conflict` / `mail_failed` / `failed` sont traduits ici
 * (`recruitment.modal.errors.*`).
 *
 * ─── DÉTAIL ────────────────────────────────────────────────────────────────
 * « Dossier » appelle `getJobApplication(id)` (Server Action) et affiche le
 * résultat dans une ligne dépliable sous la ligne courante (`<tr>` +
 * `colSpan`) : email (mailto), message du candidat, dates et lien CV ouvert
 * dans un nouvel onglet (`rel="noopener noreferrer"`).
 *
 * ─── DÉCISIONS ─────────────────────────────────────────────────────────────
 * Seules trois actions vivent ici : « Dossier » (détail déplié),
 * « Générer le lien d'examen » puis — une fois le lien affiché (URL
 * absolue + copie) — « Envoyer par e-mail », qui ouvre
 * `ApplicationEmailModal` en `kind="exam_invite"` : aperçu du modèle
 * prérempli AVEC le lien substitué, vérification par le CEO, envoi réel via
 * `sendExamInviteEmail`. La bascule `exam_pending` n'a lieu côté serveur
 * qu'après l'envoi effectif (retour client), jamais à la génération. Les
 * décisions **Recruter** / **Refuser** (e-mail de refus via
 * `ApplicationEmailModal`) restent sur la page `/espace/examen`.
 *
 * ─── RESPONSIVE ────────────────────────────────────────────────────────────
 * ≥ md : tableau inchangé (`hidden md:block`). < md : chaque candidature
 * devient une carte empilée (libellé `.micro` + valeur : candidat, statut,
 * date, actions) — les actions et le détail sont partagés avec le
 * tableau via `renderRowActions` / `renderDetailBody` (aucun double moteur).
 *
 * ─── A11Y ──────────────────────────────────────────────────────────────────
 * Filtre de statut en `<fieldset>` + `<legend>` (sr-only) avec `aria-pressed` ;
 * tableau sémantique (`<table>`, `<thead>`, `th scope="col"`) + liste de
 * cartes sémantique (`<ul>`/`<li>`, `<dl>`) sous `md` ; badge statut
 * = couleur **ET** texte (jamais la couleur seule) ; boutons ≥ 44 px
 * (`Button size="sm"` = `h-11`) ; une seule ligne dépliée à la fois.
 *
 * ─── VOLT ──────────────────────────────────────────────────────────────────
 * Aucun aplat volt ici : les actions de ligne sont en hairline.
 */

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import {
  generateExamLink,
  getJobApplication,
  type JobApplicationDetail,
} from "@/actions/recrutement";
import { Button } from "@/components/ui/Button";
import { ApplicationEmailModal } from "@/components/app/ApplicationEmailModal";
import type { ApplicationRow } from "@/app/[locale]/(app)/espace/recrutement/page";
import type {
  JobApplicationStatus,
  RecruitmentContent,
} from "@/content/platform/types";
import type { Locale } from "@/i18n/config";
import {
  EXAM_SECTIONS,
  SECTION_TITLES,
  questionsForSection,
} from "@/lib/exam";
import { cn } from "@/lib/utils";

/** Filtre actif — `"all"` = tous les statuts. */
type StatusFilter = "all" | JobApplicationStatus;

/**
 * Âge d'une soumission en heures (flottant).
 *
 * Sert à l'engagement public de revue **sous 24 h** : au-delà, la pastille
 * passe en ambre pour signaler un retard. Une date absente renvoie `0` (aucune
 * alerte à afficher sans horodatage).
 *
 * @param submittedAt ISO 8601 ou `null`.
 */
function overdueHours(submittedAt: string | null): number {
  if (submittedAt === null) return 0;
  const submitted = Date.parse(submittedAt);
  if (Number.isNaN(submitted)) return 0;
  return Math.max(0, (Date.now() - submitted) / 3_600_000);
}

/** État du chargement du dossier déplié. */
type DetailState =
  | { id: string; loading: true }
  | { id: string; loading: false; item: JobApplicationDetail | null; error: string | null };

/** Libellés résolus server (100 % `dict.recruitment.*` + `common.loading`). */
export type ApplicationsPanelLabels = {
  loading: string;
  listTitle: string;
  empty: string;
  emptyHint: string;
  columns: RecruitmentContent["columns"];
  status: RecruitmentContent["status"];
  filterLabel: string;
  filterAll: string;
  timezoneNote: string;
  openDetail: string;
  closeDetail: string;
  detailTitle: string;
  messageLabel: string;
  noMessage: string;
  emailLabel: string;
  cvDownload: string;
  invitedAtLabel: string;
  rejectedAtLabel: string;
  unavailable: string;
  /** ── Revue de l'examen (pipeline zero-interview) ─────────────────────── */
  examTitle: RecruitmentContent["examTitle"];
  examAbsent: RecruitmentContent["examAbsent"];
  examInProgress: RecruitmentContent["examInProgress"];
  examDurationLabel: RecruitmentContent["examDurationLabel"];
  examSubmittedLabel: RecruitmentContent["examSubmittedLabel"];
  examOverdue: RecruitmentContent["examOverdue"];
  examWithinDeadline: RecruitmentContent["examWithinDeadline"];
  examNoAnswers: RecruitmentContent["examNoAnswers"];
  examSectionLabel: RecruitmentContent["examSectionLabel"];
  generateExamAction: RecruitmentContent["generateExamAction"];
  generatingExam: RecruitmentContent["generatingExam"];
  examLinkLabel: RecruitmentContent["examLinkLabel"];
  copyLink: RecruitmentContent["copyLink"];
  linkCopied: RecruitmentContent["linkCopied"];
  generateExamError: RecruitmentContent["generateExamError"];
  generateExamConflict: RecruitmentContent["generateExamConflict"];
  examLinkExisting: RecruitmentContent["examLinkExisting"];
  examExpectedLabel: RecruitmentContent["examExpectedLabel"];
  examMatches: RecruitmentContent["examMatches"];
  examDiffers: RecruitmentContent["examDiffers"];
  modal: RecruitmentContent["modal"];
};

export type ApplicationsPanelProps = {
  rows: ApplicationRow[];
  labels: ApplicationsPanelLabels;
  locale: Locale;
};

/**
 * Pastille de statut de candidature — teintes §12.2 (accent pour `nouveau`,
 * acier sobre pour `invite`, danger pour `refuse`). Le libellé est toujours
 * rendu (la couleur ne porte jamais le sens seule).
 *
 * Pipeline zero-interview (§2.1.1) — AUCUN volt ajouté, déjà consommé par
 * `nouveau` ; on reste dans la palette des statuts :
 * - `exam_pending`   → acier désaturé : en cours, à lire comme une information ;
 * - `exam_submitted` → ambre : engagement requis (file de revue CEO « < 24 h ») ;
 * - `exam_failed`    → danger, cohérent avec `refuse` (issue négative).
 */
const STATUS_TONE_CLASSES: Record<JobApplicationStatus, string> = {
  nouveau:
    "border-[rgba(204,255,74,0.25)] bg-[rgba(204,255,74,0.10)] text-accent",
  invite:
    "border-[rgba(143,166,200,0.30)] bg-[rgba(143,166,200,0.14)] text-[#B8C7DF]",
  refuse:
    "border-[rgba(255,107,90,0.25)] bg-[rgba(255,107,90,0.12)] text-danger",
  recrute:
    "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.10)] text-success",
  exam_pending:
    "border-[rgba(143,166,200,0.30)] bg-[rgba(143,166,200,0.14)] text-[#B8C7DF]",
  exam_submitted:
    "border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]",
  exam_failed:
    "border-[rgba(255,107,90,0.25)] bg-[rgba(255,107,90,0.12)] text-danger",
};

/** Nombre de colonnes du tableau — `<td colSpan>` de la ligne de détail. */
const COLUMN_COUNT = 4;

/** Code brut du serveur → message localisé (jamais de string serveur). */
function detailErrorText(
  code: "forbidden" | "not_found" | string,
  labels: ApplicationsPanelLabels,
): string {
  if (code === "forbidden") return labels.modal.errors.forbidden;
  if (code === "not_found") return labels.modal.errors.notFound;
  return labels.modal.errors.failed;
}

export function ApplicationsPanel({
  rows,
  labels,
  locale,
}: ApplicationsPanelProps): React.JSX.Element {
  const router = useRouter();

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Génération de lien d'examen ──────────────────────────────────────────
  /** Id de la candidature en cours de génération (aucun appel vol en parallèle). */
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  /** Lien généré (ou réutilisé) : `{ id, url, existing }`. */
  const [examLink, setExamLink] = useState<{
    id: string;
    url: string;
    existing: boolean;
  } | null>(null);
  /** Dernière erreur de génération (`role="alert"`). */
  const [examLinkError, setExamLinkError] = useState<string | null>(null);
  /** Confirmation de copie (réinitialisée par le caller). */
  const [copied, setCopied] = useState(false);

  // ── Envoi du lien d'examen par e-mail ────────────────────────────────────
  /**
   * Cible du modal `kind="exam_invite"` : tout ce qui manque au rendu du
   * modal est figé à l'ouverture (libellés et candidat provenant de la
   * ligne projetée, lien absolu issu de `generateExamLink`).
   */
  const [examEmailTarget, setExamEmailTarget] = useState<{
    applicationId: string;
    firstName: string;
    lastName: string;
    locale: Locale;
    examUrl: string;
  } | null>(null);

  const visibleRows =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);

  /** Ouvre/ferme le dossier : un seul déplié à la fois. */
  async function handleToggleDetail(row: ApplicationRow): Promise<void> {
    if (detail?.id === row.id) {
      setDetail(null);
      return;
    }
    setDetail({ id: row.id, loading: true });
    try {
      const result = await getJobApplication(row.id);
      if (result.ok) {
        setDetail({ id: row.id, loading: false, item: result.item, error: null });
      } else {
        setDetail({
          id: row.id,
          loading: false,
          item: null,
          error: detailErrorText(result.code, labels),
        });
      }
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setDetail({
        id: row.id,
        loading: false,
        item: null,
        error: labels.modal.errors.failed,
      });
    }
  }

  /**
   * Génère (ou réutilise) le lien d'examen de la candidature.
   *
   * Le parcours zero-interview ne propose plus d'entretien. Un seul appel en
   * vol à la fois, et l'erreur reste locale (aucun détail technique en UI,
   * motif `detailErrorText`).
   */
  async function handleGenerateExam(row: ApplicationRow): Promise<void> {
    if (generatingId !== null) return;
    setGeneratingId(row.id);
    setExamLinkError(null);
    setCopied(false);
    try {
      const result = await generateExamLink(row.id);
      if (result.ok) {
        setExamLink({ id: row.id, url: result.examUrl, existing: !result.created });
        // `created` → « Lien généré » ; sinon le lien existant est réutilisé.
        setNotice(
          result.created ? labels.modal.examLinkGenerated : labels.examLinkExisting,
        );
        // Session éventuellement créée côté serveur → liste à jour. ATTENTION :
        // le statut NE BASCULE PLUS ici (`exam_pending` est posé par
        // `sendExamInviteEmail`, après envoi réel de l'e-mail).
        router.refresh();
      } else {
        setExamLinkError(
          result.code === "conflict"
            ? labels.generateExamConflict
            : labels.generateExamError,
        );
      }
    } catch {
      setExamLinkError(labels.generateExamError);
    } finally {
      setGeneratingId(null);
    }
  }

  /** Copie le lien dans le presse-papiers (repli silencieux si refusé). */
  async function handleCopyExamLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  /**
   * Ouvre l'aperçu d'e-mail (`kind="exam_invite"`) pour le lien déjà généré :
   * le CEO vérifie le modèle prérempli AVEC le lien absolu, puis envoie.
   *
   * La ligne projetée porte un `candidateName` combiné ; le modal attend
   * prénom et nom séparés → découpe sur le premier espace (affichage seul,
   * le serveur relit ses propres champs en base).
   */
  function handleOpenExamEmail(row: ApplicationRow, examUrl: string): void {
    const parts = row.candidateName.trim().split(/\s+/);
    setExamEmailTarget({
      applicationId: row.id,
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      locale: row.locale,
      examUrl,
    });
  }

  /**
   * Contenu du dossier d'une candidature — partagé par la ligne de tableau
   * (`renderDetailRow`) et la carte mobile (`< md`).
   */
  function renderDetailBody(item: ApplicationRow): React.JSX.Element | null {
    const state = detail;
    if (state === null || state.id !== item.id) return null;

    let body: React.JSX.Element;
    if (state.loading) {
      body = (
        <p role="status" className="text-sm text-muted">
          {labels.loading}
        </p>
      );
    } else if (state.error !== null) {
      body = (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      );
    } else if (state.item === null) {
      body = (
        <p role="alert" className="text-sm text-danger">
          {labels.modal.errors.failed}
        </p>
      );
    } else {
      const row = rows.find((candidate) => candidate.id === state.id);
      body = (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-[15px] font-semibold text-fg">
              {labels.detailTitle}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void handleToggleDetail(item);
              }}
            >
              {labels.closeDetail}
            </Button>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <dt className="micro text-faint">{labels.emailLabel}</dt>
              <dd className="text-[15px]">
                <a
                  href={`mailto:${state.item.email}`}
                  className="text-fg underline decoration-line-2 underline-offset-4 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:decoration-accent"
                >
                  {state.item.email}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="micro text-faint">{labels.columns.appliedAt}</dt>
              <dd className="text-[15px] tabular-nums text-fg">
                {row?.appliedLabel ?? "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <dt className="micro text-faint">{labels.messageLabel}</dt>
              <dd className="whitespace-pre-wrap text-[15px] leading-[1.65] text-fg">
                {state.item.message ?? labels.noMessage}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="micro text-faint">{labels.invitedAtLabel}</dt>
              <dd className="text-[15px] tabular-nums text-fg">
                {row?.invitedLabel ?? labels.unavailable}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="micro text-faint">{labels.rejectedAtLabel}</dt>
              <dd className="text-[15px] tabular-nums text-fg">
                {row?.rejectedLabel ?? labels.unavailable}
              </dd>
            </div>
          </dl>

          {/* CV facultatif : sans pièce jointe, ni CTA ni métadonnées — le
              bloc garde sa place dans la mise en page mais n'affiche rien,
              plutôt qu'un bouton qui renverrait un 404. */}
          {state.item.cvUrl !== null ? (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                href={state.item.cvUrl}
                target="_blank"
                className="self-start"
              >
                {labels.cvDownload}
              </Button>
              <p className="micro text-faint">
                {state.item.cvFilename}
                {row !== undefined && row.cvByteSizeLabel !== null
                  ? ` · ${row.cvByteSizeLabel}`
                  : null}
              </p>
            </div>
          ) : null}

          {/* ── Revue de l'examen ───────────────────────────────────────
              Aucune session (candidature antérieure) ou session non soumise :
              une ligne d'état, jamais un bloc vide. Sinon les 4 sections du
              barème, chacune avec ses réponses. */}
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <dt className="micro text-faint">{labels.examTitle}</dt>

            {state.item.exam === null ? (
              <dd className="text-[14px] text-muted">{labels.examAbsent}</dd>
            ) : state.item.exam.status === "in_progress" ? (
              <dd className="text-[14px] text-muted">{labels.examInProgress}</dd>
            ) : (
              <>
                {/* Méta : durée + horodatage + respect du délai de 24 h. */}
                <dd className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-fg">
                  {state.item.exam.elapsedSeconds !== null ? (
                    <span>
                      <span className="micro mr-1.5 text-faint">
                        {labels.examDurationLabel}
                      </span>
                      {Math.floor(state.item.exam.elapsedSeconds / 60)}:
                      {String(state.item.exam.elapsedSeconds % 60).padStart(2, "0")}
                    </span>
                  ) : null}
                  {state.item.exam.submittedAt !== null ? (
                    <span className="tabular-nums">
                      <span className="micro mr-1.5 text-faint">
                        {labels.examSubmittedLabel}
                      </span>
                      {new Date(state.item.exam.submittedAt).toLocaleString(
                        locale === "fr" ? "fr-FR" : "en-GB",
                        { dateStyle: "medium", timeStyle: "short" },
                      )}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "micro rounded-full border px-2.5 py-1",
                      overdueHours(state.item.exam.submittedAt) > 24
                        ? "border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]"
                        : "border-line text-faint",
                    )}
                  >
                    {overdueHours(state.item.exam.submittedAt) > 24
                      ? labels.examOverdue
                      : labels.examWithinDeadline}
                  </span>
                </dd>

                {/* Réponses, groupées par section du barème. Les questions
                    viennent de `lib/exam` (source de vérité partagée) — le
                    serveur n'a transmis que les réponses. */}
                <dd className="flex flex-col gap-4 pt-1">
                  {state.item.examAnswers === null ||
                  state.item.examAnswers.length === 0 ? (
                    <p className="text-[14px] text-muted">{labels.examNoAnswers}</p>
                  ) : (
                    EXAM_SECTIONS.map((section) => {
                      const answered = new Map(
                        (state.item?.examAnswers ?? [])
                          .filter((a) => a.section === section)
                          .map((a) => [a.questionId, a.answer]),
                      );
                      if (answered.size === 0) return null;
                      return (
                        <div key={section} className="flex flex-col gap-2.5">
                          <p className="micro text-accent">
                            {labels.examSectionLabel.replace(
                              "{{n}}",
                              String(section),
                            )}{" "}
                            <span className="text-faint">
                              — {SECTION_TITLES[section][locale]}
                            </span>
                          </p>
                          {questionsForSection(section).map((question) => {
                            const given = answered.get(question.id);
                            // Repère de REVUE : pour un QCM, la réponse
                            // attendue est affichée UNIQUEMENT ICI (au CEO).
                            // Elle ne l'est jamais côté candidat — ce serait
                            // lui donner la réponse (règle `exam.ts`).
                            const expected =
                              question.options?.find((o) => o.recommended === true) ??
                              null;
                            const matches =
                              expected !== null && given === expected.id;

                            return (
                              <div
                                key={question.id}
                                className="rounded-xl border border-line bg-ink-2 px-3.5 py-3"
                              >
                                <p className="text-[13px] leading-[1.5] text-muted">
                                  {question.prompt[locale]}
                                </p>
                                <p
                                  className={cn(
                                    "mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.6]",
                                    given === undefined ? "text-faint" : "text-fg",
                                  )}
                                >
                                  {given ?? labels.examNoAnswers}
                                </p>
                                {expected !== null ? (
                                  <p className="micro mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
                                    <span className="text-faint">
                                      {labels.examExpectedLabel}
                                    </span>
                                    <span
                                      className={cn(
                                        matches ? "text-success" : "text-[#F59E0B]",
                                      )}
                                    >
                                      {expected.label[locale]}
                                    </span>
                                    {given !== undefined ? (
                                      <span
                                        className={cn(
                                          matches ? "text-success" : "text-[#F59E0B]",
                                        )}
                                      >
                                        · {matches ? labels.examMatches : labels.examDiffers}
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
                </dd>
              </>
            )}
          </div>
        </div>
      );
    }

    return body;
  }

  /** Rendu de la ligne dépliée (détail d'une candidature, tableau ≥ md). */
  function renderDetailRow(item: ApplicationRow): React.JSX.Element | null {
    const body = renderDetailBody(item);
    if (body === null) return null;

    return (
      <tr className="border-t border-line bg-white/[0.02]">
        <td colSpan={COLUMN_COUNT} className="px-5 py-5 md:px-6">
          {body}
        </td>
      </tr>
    );
  }

  /**
   * Cellule « actions » — partagée par le tableau et la carte mobile :
   * « Dossier » (détail) + « Générer le lien d'examen ». Les décisions
   * Recruter / Refuser vivent sur `/espace/examen`.
   */
  function renderRowActions(
    row: ApplicationRow,
    className?: string,
  ): React.JSX.Element {
    const isDetailOpen = detail !== null && detail.id === row.id;
    // Statuts TERMINAUX : aucun lien d'examen possible. `exam_submitted` n'est
    // PAS désactivé ici — l'action renvoie alors `conflict` avec un message
    // explicite (masquer le bouton cacherait la raison au CEO).
    const canExam = row.status !== "refuse" && row.status !== "recrute";

    return (
      <span className={cn("flex flex-wrap items-center gap-2", className)}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={isDetailOpen}
          onClick={() => {
            void handleToggleDetail(row);
          }}
        >
          {isDetailOpen ? labels.closeDetail : labels.openDetail}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canExam}
          aria-disabled={!canExam}
          onClick={() => {
            void handleGenerateExam(row);
          }}
        >
          {generatingId === row.id ? labels.generatingExam : labels.generateExamAction}
        </Button>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-6" lang={locale}>
      {/* Filtre de statut — fieldset/legend sr-only, aria-pressed. */}
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{labels.filterLabel}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              "all",
              "nouveau",
              "exam_pending",
              "exam_submitted",
              "exam_failed",
              "invite",
              "refuse",
            ] as const
          ).map((value) => {
            const isActive = filter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setFilter(value);
                }}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                  isActive
                    ? "border-line-3 bg-white/[0.06] text-fg"
                    : "border-line bg-transparent text-muted hover:text-fg",
                )}
              >
                {value === "all" ? labels.filterAll : labels.status[value]}
              </button>
            );
          })}
          {/* Rappel du fuseau : la DB stocke en UTC, l'affichage est local. */}
          <p className="micro ml-auto text-faint">{labels.timezoneNote}</p>
        </div>
      </fieldset>

      {/* Toast de succès persistant (aria-live). */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-h-5 text-sm text-success"
      >
        {notice}
      </p>

      {/* Alerte de génération (conflit ou échec — aucun détail technique). */}
      {examLinkError !== null ? (
        <p role="alert" className="text-sm text-danger">
          {examLinkError}
        </p>
      ) : null}

      {/* Lien d'examen généré : URL ABSOLUE + copie + envoi par e-mail.
          Le nom du candidat est affiché : le lien seul ne dit pas QUI
          contacter. « Envoyer par e-mail » ouvre l'aperçu de la template
          `exam_invite` déjà substituée (vérification avant envoi réel). */}
      {examLink !== null
        ? (() => {
            const owner = rows.find((r) => r.id === examLink.id);
            return (
              <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="micro text-faint">
                    {labels.examLinkLabel}
                    {owner ? ` — ${owner.candidateName}` : ""}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {owner !== undefined ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          handleOpenExamEmail(owner, examLink.url);
                        }}
                      >
                        {labels.modal.examEmailAction}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void handleCopyExamLink(examLink.url);
                      }}
                    >
                      {copied ? labels.linkCopied : labels.copyLink}
                    </Button>
                  </span>
                </div>
                <code className="block break-all rounded-xl border border-line bg-ink-2 px-3 py-2 text-[13px] leading-[1.55] text-fg">
                  {examLink.url}
                </code>
              </div>
            );
          })()
        : null}

      {/* Aperçu + envoi de l'invitation d'examen (modal uni-
          `kind="exam_invite"` : modèle prérempli AVEC le lien, boutons
          Annuler / Envoyer, codes bruts traduits via `labels.modal`). */}
      {examEmailTarget !== null ? (
        <ApplicationEmailModal
          kind="exam_invite"
          applicationId={examEmailTarget.applicationId}
          candidateFirstName={examEmailTarget.firstName}
          candidateLastName={examEmailTarget.lastName}
          applicationLocale={examEmailTarget.locale}
          examUrl={examEmailTarget.examUrl}
          labels={{ modal: labels.modal }}
          onClose={() => {
            setExamEmailTarget(null);
          }}
          onSent={() => {
            // Envoi OK : le serveur a posé `exam_pending` (si la candidature
            // était encore `nouveau`) → toast de succès + liste rafraîchie.
            setExamEmailTarget(null);
            setNotice(labels.modal.successExamInvite);
            router.refresh();
          }}
        />
      ) : null}

      <section aria-labelledby="recruitment-list-title" className="flex flex-col gap-4">
        <h2
          id="recruitment-list-title"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {labels.listTitle}
        </h2>

        {visibleRows.length > 0 ? (
          <>
            {/* ≥ md : tableau sémantique (inchangé). */}
            <div className="hidden overflow-x-auto rounded-[20px] border border-line bg-surface md:block">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="px-5 py-4 micro text-faint md:px-6">
                      {labels.columns.candidate}
                    </th>
                    <th scope="col" className="px-5 py-4 micro text-faint md:px-6">
                      {labels.columns.status}
                    </th>
                    <th scope="col" className="px-5 py-4 micro text-faint md:px-6">
                      {labels.columns.appliedAt}
                    </th>
                    <th scope="col" className="px-5 py-4 micro text-faint md:px-6">
                      {labels.columns.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isDetailOpen = detail !== null && detail.id === row.id;

                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-line last:border-b-0">
                          <td className="px-5 py-4 align-top md:px-6">
                            <span className="flex flex-col gap-0.5">
                              <span className="text-[15px] text-fg">{row.candidateName}</span>
                              <span className="text-sm text-muted">{row.email}</span>
                            </span>
                          </td>
                          <td className="px-5 py-4 align-top md:px-6">
                            <span
                              className={cn(
                                "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 micro",
                                STATUS_TONE_CLASSES[row.status],
                              )}
                            >
                              {row.statusLabel}
                            </span>
                          </td>
                          <td className="px-5 py-4 align-top text-[14px] tabular-nums text-muted md:px-6">
                            {row.appliedLabel}
                          </td>
                          <td className="px-5 py-4 align-top md:px-6">
                            {renderRowActions(row)}
                          </td>
                        </tr>
                        {isDetailOpen ? renderDetailRow(row) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* < md : cartes empilées — libellé `.micro` + valeur, cibles ≥ 44 px. */}
            <ul className="flex flex-col gap-3 md:hidden">
              {visibleRows.map((row) => {
                const isDetailOpen = detail !== null && detail.id === row.id;

                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-5"
                  >
                    <dl className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <dt className="micro text-faint">
                          {labels.columns.candidate}
                        </dt>
                        <dd className="flex flex-col gap-0.5">
                          <span className="text-[15px] text-fg">
                            {row.candidateName}
                          </span>
                          <span className="text-sm text-muted">{row.email}</span>
                        </dd>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <dt className="micro text-faint">
                          {labels.columns.status}
                        </dt>
                        <dd>
                          <span
                            className={cn(
                              "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 micro",
                              STATUS_TONE_CLASSES[row.status],
                            )}
                          >
                            {row.statusLabel}
                          </span>
                        </dd>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <dt className="micro text-faint">
                          {labels.columns.appliedAt}
                        </dt>
                        <dd className="text-sm tabular-nums text-muted">
                          {row.appliedLabel}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-col gap-3 border-t border-line pt-4">
                      <span className="micro text-faint">
                        {labels.columns.actions}
                      </span>
                      {renderRowActions(row, "w-full flex-col items-stretch")}
                    </div>
                    {isDetailOpen ? (
                      <div className="border-t border-line pt-4">
                        {renderDetailBody(row)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          /* ---------------------------------------------- État vide ----- */
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
        )}
      </section>
    </div>
  );
}
