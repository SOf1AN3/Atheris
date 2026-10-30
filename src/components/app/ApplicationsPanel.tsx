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
 * « Inviter » / « Refuser » ouvrent `ApplicationEmailModal` ; après un envoi
 * réussi, `router.refresh()` revalide la page serveur (la liste est re-fetchée
 * avec les nouveaux statuts) et un `aria-live` annonce le toast de succès.
 * « Recruter » appelle `recruitCandidate({ applicationId, locale }, actor)`
 * (locale lue via `useParams()`, motif `InterviewLinks`) : succès → toast
 * `role="status"` + `router.refresh()` (statut `recrute`, bouton masqué) ;
 * échec → `role="alert"` (`mail_failed` = texte dédié, sinon `recruitError`).
 * Le bouton n'apparaît que si la candidature n'est ni `refuse` ni `recrute`.
 *
 * ─── RESPONSIVE ────────────────────────────────────────────────────────────
 * ≥ md : tableau inchangé (`hidden md:block`). < md : chaque candidature
 * devient une carte empilée (libellé `.micro` + valeur : candidat, statut,
 * date, créneau, actions) — les actions et le détail sont partagés avec le
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
 * Aucun aplat volt ici : les actions de ligne sont en hairline ; le SEUL
 * aplat volt de l'écran est le bouton « Envoyer » du modal.
 */

import { Inbox } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import {
  getJobApplication,
  recruitCandidate,
  type JobApplicationDetail,
} from "@/actions/recrutement";
import { ApplicationEmailModal } from "@/components/app/ApplicationEmailModal";
import { Button } from "@/components/ui/Button";
import type { ApplicationRow } from "@/app/[locale]/(app)/espace/recrutement/page";
import type {
  JobApplicationStatus,
  RecruitmentContent,
} from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Filtre actif — `"all"` = tous les statuts. */
type StatusFilter = "all" | JobApplicationStatus;

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
  booked: string;
  notBooked: string;
  openDetail: string;
  closeDetail: string;
  detailTitle: string;
  messageLabel: string;
  noMessage: string;
  emailLabel: string;
  cvDownload: string;
  invitedAtLabel: string;
  rejectedAtLabel: string;
  inviteAction: string;
  rejectAction: string;
  /** CTA « Recruter » — `dict.recruitment.recruitAction`. */
  recruitAction: string;
  /** Libellé du bouton pendant l'appel `recruitCandidate` (`recruiting`). */
  recruiting: string;
  /** Toast de succès (`role="status"`) — `dict.recruitment.recruitSuccess`. */
  recruitSuccess: string;
  /** Erreur (`role="alert"`) — `dict.recruitment.recruitError`. */
  recruitError: string;
  unavailable: string;
  modal: RecruitmentContent["modal"];
};

export type ApplicationsPanelProps = {
  rows: ApplicationRow[];
  labels: ApplicationsPanelLabels;
  locale: Locale;
  /**
   * Acteur CEO projeté depuis la session serveur (page `/espace/recrutement`)
   * et revalidé côté serveur par `recruitCandidate` (Zod + garde rôle `ceo`,
   * motif `invitations.ts`) : aucun rôle n'est inventé côté client.
   */
  actor: { id: string; role: Role };
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
const COLUMN_COUNT = 5;

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
  actor,
}: ApplicationsPanelProps): React.JSX.Element {
  const router = useRouter();
  const params = useParams();
  // Locale de l'URL lue côté client (motif `InterviewLinks`) : jamais de code
  // langue en dur ; repli sur la prop serveur si l'URL est illisible.
  const rawLocale = params["locale"];
  const urlLocale: Locale | undefined =
    typeof rawLocale === "string" && isValidLocale(rawLocale) ? rawLocale : undefined;

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [modalKind, setModalKind] = useState<"invite" | "reject" | null>(null);
  const [modalRow, setModalRow] = useState<ApplicationRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Id de la candidature en cours de recrutement (`null` = aucun appel vol). */
  const [recruitingId, setRecruitingId] = useState<string | null>(null);
  /** Dernière erreur de recrutement (`role="alert"`, aucun détail technique). */
  const [recruitError, setRecruitError] = useState<string | null>(null);

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

  function handleOpenModal(row: ApplicationRow, kind: "invite" | "reject"): void {
    setModalRow(row);
    setModalKind(kind);
  }

  function handleCloseModal(): void {
    setModalRow(null);
    setModalKind(null);
  }

  /** Envoi réussi : toast persistant + re-fetch server de la liste. */
  function handleSent(kind: "invite" | "reject"): void {
    setNotice(kind === "invite" ? labels.modal.successInvite : labels.modal.successReject);
    router.refresh();
  }

  /**
   * « Recruter » : envoie le lien de création de compte au candidat, puis
   * revalide la page serveur (statut `recrute` → le bouton disparaît au
   * retour de la liste). Un seul appel en vol à la fois.
   */
  async function handleRecruit(row: ApplicationRow): Promise<void> {
    if (recruitingId !== null) return;
    setRecruitingId(row.id);
    setRecruitError(null);
    try {
      const result = await recruitCandidate(
        { applicationId: row.id, locale: urlLocale ?? locale },
        actor,
      );
      if (result.ok) {
        setNotice(labels.recruitSuccess);
        router.refresh();
      } else if (result.code === "mail_failed") {
        // Le lien n'a pas pu être envoyé (le statut n'a pas bougé côté serveur).
        setRecruitError(labels.modal.errors.mailFailed);
      } else {
        // Codes non traduits un par un ici : repli sur le message générique.
        setRecruitError(labels.recruitError);
      }
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setRecruitError(labels.recruitError);
    } finally {
      setRecruitingId(null);
    }
  }

  /** Texte de la colonne « Créneau ». */
  function slotText(row: ApplicationRow): string {
    if (row.slotLabel !== null) return row.slotLabel;
    return row.bookable ? labels.notBooked : labels.unavailable;
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
              {row !== undefined ? ` · ${row.cvByteSizeLabel}` : null}
            </p>
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
   * Cellule « actions » — partagée par le tableau et la carte mobile.
   * « Recruter » n'apparaît que si la candidature n'est ni `refuse` ni
   * `recrute` (bouton désactivé + libellé `recruiting` pendant l'appel).
   */
  function renderRowActions(
    row: ApplicationRow,
    className?: string,
  ): React.JSX.Element {
    const isDetailOpen = detail !== null && detail.id === row.id;
    const isRecruiting = recruitingId === row.id;
    const canRecruit = row.status !== "refuse" && row.status !== "recrute";

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
          disabled={!row.inviteAllowed}
          aria-disabled={!row.inviteAllowed}
          onClick={() => {
            handleOpenModal(row, "invite");
          }}
        >
          {labels.inviteAction}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!row.rejectAllowed}
          aria-disabled={!row.rejectAllowed}
          onClick={() => {
            handleOpenModal(row, "reject");
          }}
        >
          {labels.rejectAction}
        </Button>
        {canRecruit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRecruiting}
            aria-disabled={isRecruiting}
            onClick={() => {
              void handleRecruit(row);
            }}
          >
            {isRecruiting ? labels.recruiting : labels.recruitAction}
          </Button>
        ) : null}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-6" lang={locale}>
      {/* Filtre de statut — fieldset/legend sr-only, aria-pressed. */}
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{labels.filterLabel}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "nouveau", "invite", "refuse"] as const).map((value) => {
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

      {/* Alerte « Recruter » (aucun détail technique, motif `LoginForm`). */}
      {recruitError !== null ? (
        <p role="alert" className="text-sm text-danger">
          {recruitError}
        </p>
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
                      {labels.columns.slot}
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
                          <td className="px-5 py-4 align-top text-[14px] text-muted md:px-6">
                            {slotText(row)}
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
                      <div className="flex flex-col gap-1.5">
                        <dt className="micro text-faint">{labels.columns.slot}</dt>
                        <dd className="text-sm text-muted">{slotText(row)}</dd>
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

      {modalRow !== null && modalKind !== null ? (
        <ApplicationEmailModal
          kind={modalKind}
          applicationId={modalRow.id}
          candidateFirstName={modalRow.firstName}
          candidateLastName={modalRow.lastName}
          applicationLocale={modalRow.locale}
          labels={{ modal: labels.modal }}
          onClose={handleCloseModal}
          onSent={() => {
            handleSent(modalKind);
          }}
        />
      ) : null}
    </div>
  );
}
