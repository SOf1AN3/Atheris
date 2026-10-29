"use client";

/**
 * Atheris — liens d'entretien de l'espace CEO (PLAN Q3 · §2.3 · §3.1).
 *
 * Composant CLIENT dont **toutes** les données et tous les libellés sont
 * produits côté serveur par `espace/entretien/page.tsx` : lignes (statut,
 * créneau formaté `Africa/Algiers`, candidat), chemins `/{locale}/entretien/
 * {token}` et strings du dict (`dict.interviews.*`). Le serveur ne renvoie
 * **jamais** de message : les codes `forbidden` / `invalid` / `failed` sont
 * traduits ici (`interviews.errors.*`).
 *
 * ─── CRÉATION ──────────────────────────────────────────────────────────────
 * `createInterviewLink(locale, label?)` avec la locale lue via `useParams()`
 * (jamais de code langue en dur ; locale absente/invalide → `undefined`,
 * l'action applique son propre repli). Champ facultatif « Nom du lien »
 * (120 car. max) transmis comme `label`. Bouton désactivé pendant l'appel,
 * retour d'erreur `role="alert"`, puis affichage de l'URL + copie + lien
 * direct.
 *
 * ─── NOM DE LIEN ───────────────────────────────────────────────────────────
 * Chaque ligne affiche son étiquette (`row.label`) en titre de carte, avant
 * les badges de statut ; étiquette absente → tiret sobre en `text-muted`
 * (le candidat réservé reste dans le `dl`).
 *
 * ─── SUPPRESSION ───────────────────────────────────────────────────────────
 * `deleteInterviewLink(id)` (CEO seul) avec confirmation EN LIGNE (jamais de
 * `window.confirm`) : le bloc d'actions bascule en mode confirmation
 * (`labels.deleteConfirm` + « Supprimer » + « Annuler ») et le second geste
 * appelle l'action. `deletingId` fige la ligne en cours (bouton désactivé +
 * libellé `labels.deleting`) ; succès → `router.refresh()`, échec →
 * `role="alert"` avec un code traduit localement (`interviews.errors.*`,
 * aucun message serveur en clair). L'annulation remet l'état initial.
 *
 * ─── COPIE ─────────────────────────────────────────────────────────────────
 * `navigator.clipboard.writeText` d'abord ; en échec → **sélection du champ**
 * (`select()` + focus) pour une copie manuelle Ctrl+C, annoncé en `aria-live`.
 * Retour visuel « Copié » pendant 1,5 s, timer nettoyé au démontage.
 *
 * ─── URL ABSOLUE ───────────────────────────────────────────────────────────
 * Le contrat renvoie un chemin relatif : le domaine (`window.location.origin`)
 * n'est connu qu'après montage. L'état `origin` démarre à `""` → le rendu
 * serveur et le premier rendu client sont identiques (aucun décalage
 * d'hydratation), l'URL bascule en absolue juste après le montage.
 *
 * ─── MOUVEMENT (DESIGN §3.1) ───────────────────────────────────────────────
 * Entrées via `Reveal` (courbe unique `cubic-bezier(0.16, 1, 0.3, 1)`, sans
 * spring) — aucun `useReducedMotion` branché au premier rendu : la préférence
 * est neutralisée par `MotionConfig(reducedMotion="user")` du layout racine.
 *
 * ─── BADGE MEET ────────────────────────────────────────────────────────────
 * Quand la page server transmet un `meetLink` (env, jamais un secret côté
 * client), chaque ligne **réservée et non annulée** affiche, à côté du
 * créneau, un lien « Google Meet » (`labels.meetBadge`) ouvrant un nouvel
 * onglet (`target="_blank"` + `rel="noopener noreferrer"`). Les lignes en
 * attente et les lignes annulées restent strictement identiques.
 *
 * ─── VOLT ──────────────────────────────────────────────────────────────────
 * Un SEUL aplat volt par écran : le bouton de création. Les statuts portent
 * les teintes sémantiques (acier / success / danger), les copie et les liens
 * sont en hairline.
 *
 * A11y : `aria-live` sur chaque retour de copie, cibles ≥ 44 px (`h-11`),
 * `<label>` associé à chaque champ, focus volt global conservé.
 */

import { CalendarClock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FocusEvent } from "react";

import { createInterviewLink, deleteInterviewLink } from "@/actions/interviews";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import type { InterviewStatus } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Durée du retour visuel « Copié » (ms). */
const COPY_FEEDBACK_MS = 1500;

/** id du champ URL du bloc de création (repli de sélection). */
const CREATE_FIELD_ID = "interview-create-url";
/** id du champ « Nom du lien » (formulaire de création, carte + état vide). */
const CREATE_LABEL_FIELD_ID = "interview-create-label";
/** Longueur maximale du nom de lien (contrat serveur). */
const LABEL_MAX_LENGTH = 120;
/** clé de feedback du bloc de création (distincte de tout uuid). */
const CREATE_KEY = "create";

/**
 * Pastille de statut d'entretien — teintes §12.2 (jamais de volt sur un
 * statut, DESIGN §2.1) : acier pour `pending`, success pour `done`, danger
 * pour `cancelled`. Le libellé est toujours rendu (la couleur ne porte
 * jamais le sens seule).
 */
const STATUS_TONE_CLASSES: Record<InterviewStatus, string> = {
  pending: "border-[rgba(143,166,200,0.30)] bg-[rgba(143,166,200,0.14)] text-[#B8C7DF]",
  cancelled: "border-[rgba(255,107,90,0.25)] bg-[rgba(255,107,90,0.12)] text-danger",
  done: "border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.10)] text-success",
};

/** Champ URL : 44 px, hairline, filet volt au focus (focus global). */
const FIELD_CLASSES =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-ink-2 px-3.5 text-[13px] text-muted focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 sm:flex-1";

/** Une ligne de la liste — données et libellés résolus server. */
export type InterviewRow = {
  id: string;
  /** Chemin relatif `/{locale}/entretien/{token}` (contrat de l'action). */
  path: string;
  status: InterviewStatus;
  /** `dict.interviews.status[status]`. */
  statusLabel: string;
  /** Étiquette optionnelle du lien (titre de carte), `null` si absente. */
  label: string | null;
  /** `false` = lien créé mais pas encore réservé. */
  booked: boolean;
  /** Créneau réel formaté server en `Africa/Algiers`, `null` si non réservé. */
  slotLabel: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  /** Date de création, formatée server. */
  createdLabel: string;
  /** Lien encore utilisable (`pending` et non réservé) → champ + copie. */
  reservable: boolean;
};

/** Libellés résolus server (100 % `dict.interviews.*`). */
export type InterviewLinksLabels = {
  create: string;
  creating: string;
  createTitle: string;
  createHint: string;
  linkTitle: string;
  linkLabel: string;
  copy: string;
  copied: string;
  copyFallback: string;
  openLink: string;
  delete: string;
  deleting: string;
  deleteConfirm: string;
  cancel: string;
  listTitle: string;
  empty: string;
  emptyHint: string;
  linkName: string;
  linkNamePlaceholder: string;
  booked: string;
  notBooked: string;
  /** Libellé du lien de visio (`dict.interviews.meetBadge`). */
  meetBadge: string;
  timezoneNote: string;
  columns: {
    created: string;
    slot: string;
    candidate: string;
    link: string;
  };
  errors: {
    forbidden: string;
    invalid: string;
    failed: string;
  };
};

export type InterviewLinksProps = {
  rows: InterviewRow[];
  labels: InterviewLinksLabels;
  /**
   * URL de visio (Google Meet) lue côté server (env), `null` si absente →
   * aucun badge n'est rendu, les lignes restent strictement identiques.
   */
  meetLink: string | null;
};

/** Écrit dans le presse-papier — `false` si l'API est absente ou refusée. */
async function writeToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** Repli de copie : sélectionne le champ pour une copie manuelle (Ctrl+C). */
function selectField(fieldId: string): void {
  const field = document.getElementById(fieldId);
  if (field instanceof HTMLInputElement) {
    field.focus();
    field.select();
  }
}

/** Sélection du contenu au focus — un Ctrl+C suffit ensuite. */
function handleFieldFocus(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}

export function InterviewLinks({
  rows,
  labels,
  meetLink,
}: InterviewLinksProps): React.JSX.Element {
  const router = useRouter();
  const params = useParams();
  // Locale de l'URL lue côté client : jamais de code langue en dur.
  const rawLocale = params["locale"];
  const locale: Locale | undefined =
    typeof rawLocale === "string" && isValidLocale(rawLocale) ? rawLocale : undefined;

  const [origin, setOrigin] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [created, setCreated] = useState<{ path: string; url: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fallbackId, setFallbackId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  /** Nom de lien facultatif du formulaire de création. */
  const [createLabel, setCreateLabel] = useState<string>("");
  /** Ligne dont le bloc d'actions est en mode confirmation (sinon `null`). */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Ligne en cours de suppression (bouton figé + libellé « Suppression… »). */
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Échec de suppression : id de la ligne + message localisé (jamais serveur). */
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(
    null,
  );

  // Origine absolue : renseignée après montage (état initial `""` = rendu
  // serveur → aucun mismatch d'hydratation).
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Nettoyage du timer « Copié » au démontage.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Confirmation en ligne : le focus clavier suit la bascule (le bouton
  // « Supprimer » initial est remplacé par le bloc de confirmation).
  useEffect(() => {
    if (confirmDeleteId === null) return;
    const button = document.getElementById(`interview-delete-confirm-${confirmDeleteId}`);
    if (button instanceof HTMLButtonElement) button.focus();
  }, [confirmDeleteId]);

  /** URL absolue affichée ET copiée (jamais de divergence entre les deux). */
  function absoluteUrl(path: string): string {
    return `${origin}${path}`;
  }

  function flashCopied(key: string): void {
    setFallbackId(null);
    setCopiedId(key);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedId(null);
      copyTimerRef.current = null;
    }, COPY_FEEDBACK_MS);
  }

  async function handleCopy(key: string, value: string, fieldId: string): Promise<void> {
    const copied = await writeToClipboard(value);
    if (copied) {
      flashCopied(key);
      return;
    }
    // Repli : le champ est sélectionné, l'utilisateur finit à la main.
    selectField(fieldId);
    setCopiedId(null);
    setFallbackId(key);
  }

  /** Code brut du serveur → message localisé (jamais de string serveur). */
  function errorMessage(
    code: "forbidden" | "invalid" | "not_found" | "failed",
  ): string {
    switch (code) {
      case "forbidden":
        return labels.errors.forbidden;
      case "invalid":
        return labels.errors.invalid;
      default:
        return labels.errors.failed;
    }
  }

  async function handleCreate(): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setCreateError(null);
    setCopiedId(null);
    setFallbackId(null);
    try {
      const label = createLabel.trim();
      const result = await createInterviewLink(
        locale,
        label.length > 0 ? label : undefined,
      );
      if (result.ok) {
        setCreateLabel("");
        setCreated({
          path: result.url,
          url: `${window.location.origin}${result.url}`,
        });
        // La page server re-fetch la liste ; l'état client du composant est
        // conservé (le bloc « lien prêt » reste affiché).
        router.refresh();
      } else {
        setCreateError(errorMessage(result.code));
      }
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setCreateError(labels.errors.failed);
    } finally {
      setIsSubmitting(false);
    }
  }

  /** Ouvre la confirmation en ligne d'une ligne (annule toute erreur résiduelle). */
  function startDelete(id: string): void {
    setDeleteError(null);
    setConfirmDeleteId(id);
  }

  /** Annulation : retour à l'état initial de la ligne. */
  function cancelDelete(): void {
    setConfirmDeleteId(null);
    setDeleteError(null);
  }

  /** Suppression — le SECOND geste après la confirmation en ligne. */
  async function handleDelete(id: string): Promise<void> {
    if (deletingId !== null) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const result = await deleteInterviewLink(id);
      if (result.ok) {
        setConfirmDeleteId(null);
        // Nettoyage des retours de copie de la ligne supprimée.
        setCopiedId((key) => (key === id ? null : key));
        setFallbackId((key) => (key === id ? null : key));
        // La page server re-fetch la liste ; aucun message serveur en clair.
        router.refresh();
      } else {
        setConfirmDeleteId(null);
        setDeleteError({ id, message: errorMessage(result.code) });
      }
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setConfirmDeleteId(null);
      setDeleteError({ id, message: labels.errors.failed });
    } finally {
      setDeletingId(null);
    }
  }

  /** Retour `aria-live` d'une copie (succès 1,5 s ou repli). */
  function feedbackFor(key: string): { text: string; tone: "success" | "warn" } | null {
    if (copiedId === key) return { text: labels.copied, tone: "success" };
    if (fallbackId === key) return { text: labels.copyFallback, tone: "warn" };
    return null;
  }

  function renderFeedback(key: string): React.JSX.Element {
    const feedback = feedbackFor(key);
    return (
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "min-h-5 text-sm",
          feedback?.tone === "success" ? "text-success" : "text-warn",
        )}
      >
        {feedback?.text ?? null}
      </p>
    );
  }

  /** Bloc « lien prêt à envoyer » — isolé pour que `url`/`path` soient des
   *  `string` non nulles dans les fermetures (aucun `?.` ni assertion). */
  function renderCreatedBlock(url: string, path: string): React.JSX.Element {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-ink-2 p-5">
        <p className="micro text-faint">{labels.linkTitle}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor={CREATE_FIELD_ID} className="text-[13px] font-semibold text-fg-2">
            {labels.linkLabel}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id={CREATE_FIELD_ID}
              type="text"
              readOnly
              value={url}
              onFocus={handleFieldFocus}
              className={FIELD_CLASSES}
            />
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void handleCopy(CREATE_KEY, url, CREATE_FIELD_ID);
                }}
              >
                {copiedId === CREATE_KEY ? labels.copied : labels.copy}
              </Button>
              <Button type="button" variant="ghost" size="sm" href={path}>
                {labels.openLink}
              </Button>
            </span>
          </div>
          {renderFeedback(CREATE_KEY)}
        </div>
      </div>
    );
  }

  // Un SEUL aplat volt à l'écran : le bouton de création vit soit dans la
  // carte de création (liste peuplée), soit dans l'état vide — jamais les
  // deux en même temps.
  const showCreateCard = rows.length > 0 || created !== null;
  const showCreateButton = rows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* -------------------------------------------- Carte de création --- */}
      {showCreateCard ? (
        <Reveal className="rounded-[20px] border border-line bg-surface p-6 md:p-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.015em] text-fg">
                {labels.createTitle}
              </h2>
              <p className="max-w-[62ch] text-sm leading-[1.6] text-muted">
                {labels.createHint}
              </p>
            </div>

            {showCreateButton ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label
                    htmlFor={CREATE_LABEL_FIELD_ID}
                    className="text-[13px] font-semibold text-fg-2"
                  >
                    {labels.linkName}
                  </label>
                  <input
                    id={CREATE_LABEL_FIELD_ID}
                    type="text"
                    maxLength={LABEL_MAX_LENGTH}
                    value={createLabel}
                    onChange={(event) => setCreateLabel(event.currentTarget.value)}
                    placeholder={labels.linkNamePlaceholder}
                    className={FIELD_CLASSES}
                  />
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="shrink-0"
                  disabled={isSubmitting}
                  onClick={() => {
                    void handleCreate();
                  }}
                >
                  {isSubmitting ? labels.creating : labels.create}
                </Button>
              </div>
            ) : null}

            {createError !== null ? (
              <p role="alert" className="text-sm text-danger">
                {createError}
              </p>
            ) : null}

            {created !== null ? renderCreatedBlock(created.url, created.path) : null}
          </div>
        </Reveal>
      ) : null}

      {/* ------------------------------------------------------ Liste ----- */}
      <section aria-labelledby="interview-list-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2
            id="interview-list-title"
            className="text-lg font-semibold tracking-[-0.015em] text-fg"
          >
            {labels.listTitle}
          </h2>
          {/* Rappel du fuseau : la DB stocke en UTC, l'affichage est local. */}
          <p className="micro text-faint">{labels.timezoneNote}</p>
        </div>

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {rows.map((row, index) => {
              const fieldId = `interview-url-${row.id}`;
              const url = absoluteUrl(row.path);
              const hasCandidate = row.candidateName !== null;
              // Lien de visio : UNIQUEMENT si configée ET ligne réservée
              // non annulée (lignes « en attente » / annulées inchangées).
              const showMeetBadge =
                meetLink !== null && row.booked && row.status !== "cancelled";

              return (
                <Reveal
                  key={row.id}
                  as="li"
                  delay={Math.min(index, 6) * 0.05}
                  className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 md:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {/* Étiquette du lien = titre de carte (fallback sobre). */}
                      <h3 className="text-[15px] font-semibold text-fg">
                        {row.label ?? <span className="text-muted">—</span>}
                      </h3>
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 micro",
                            STATUS_TONE_CLASSES[row.status],
                          )}
                        >
                          {row.statusLabel}
                        </span>
                        {row.booked ? (
                          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line-2 bg-white/[0.04] px-3 py-1.5 micro text-fg-2">
                            {labels.booked}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="micro text-faint">{labels.columns.created}</span>
                      <span className="text-sm tabular-nums text-muted">
                        {row.createdLabel}
                      </span>
                    </span>
                  </div>

                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <dt className="micro text-faint">{labels.columns.slot}</dt>
                      <dd
                        className={cn(
                          "text-[15px] text-fg",
                          // Flex uniquement quand le badge Meet s'ajoute :
                          // les lignes sans badge gardent leur rendu exact.
                          showMeetBadge && "flex flex-wrap items-center gap-2",
                        )}
                      >
                        <span>{row.slotLabel ?? labels.notBooked}</span>
                        {showMeetBadge ? (
                          <a
                            href={meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line-2 px-4 text-[14px] font-semibold text-fg hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                          >
                            {labels.meetBadge}
                          </a>
                        ) : null}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <dt className="micro text-faint">{labels.columns.candidate}</dt>
                      <dd className="flex flex-col gap-0.5 text-[15px]">
                        {hasCandidate ? (
                          <>
                            <span className="text-fg">{row.candidateName}</span>
                            <span className="text-sm text-muted">{row.candidateEmail}</span>
                          </>
                        ) : (
                          <span className="text-muted">{labels.notBooked}</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {row.reservable ? (
                    <div className="flex flex-col gap-2 border-t border-line pt-4">
                      <label htmlFor={fieldId} className="micro text-faint">
                        {labels.columns.link}
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          id={fieldId}
                          type="text"
                          readOnly
                          value={url}
                          onFocus={handleFieldFocus}
                          className={FIELD_CLASSES}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            void handleCopy(row.id, url, fieldId);
                          }}
                        >
                          {copiedId === row.id ? labels.copied : labels.copy}
                        </Button>
                      </div>
                      {renderFeedback(row.id)}
                    </div>
                  ) : null}

                  {/* ------------------------------------ Suppression --- */}
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    {confirmDeleteId === row.id ? (
                      <>
                        <p
                          id={`interview-delete-message-${row.id}`}
                          className="max-w-[62ch] text-sm leading-[1.6] text-danger"
                        >
                          {labels.deleteConfirm}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            id={`interview-delete-confirm-${row.id}`}
                            variant="secondary"
                            size="sm"
                            className="border-danger text-danger hover:border-danger"
                            disabled={deletingId !== null}
                            aria-describedby={`interview-delete-message-${row.id}`}
                            onClick={() => {
                              void handleDelete(row.id);
                            }}
                          >
                            {deletingId === row.id ? labels.deleting : labels.delete}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deletingId !== null}
                            onClick={cancelDelete}
                          >
                            {labels.cancel}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {deleteError?.id === row.id ? (
                          <p role="alert" className="max-w-[52ch] text-sm text-danger">
                            {deleteError.message}
                          </p>
                        ) : (
                          <span />
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="text-danger hover:border-danger"
                          disabled={deletingId !== null}
                          onClick={() => startDelete(row.id)}
                        >
                          {deletingId === row.id ? labels.deleting : labels.delete}
                        </Button>
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </ul>
        ) : (
          /* ---------------------------------------------- État vide ----- */
          <div className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-surface px-6 py-14 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full border border-line bg-ink-2 text-muted"
            >
              <CalendarClock size={22} strokeWidth={1.5} />
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-fg">{labels.empty}</span>
              <span className="text-sm text-muted">{labels.emptyHint}</span>
            </span>
            <div className="flex w-full max-w-[420px] flex-col gap-3">
              <div className="flex flex-col gap-1.5 text-left">
                <label
                  htmlFor={CREATE_LABEL_FIELD_ID}
                  className="text-[13px] font-semibold text-fg-2"
                >
                  {labels.linkName}
                </label>
                <input
                  id={CREATE_LABEL_FIELD_ID}
                  type="text"
                  maxLength={LABEL_MAX_LENGTH}
                  value={createLabel}
                  onChange={(event) => setCreateLabel(event.currentTarget.value)}
                  placeholder={labels.linkNamePlaceholder}
                  className={FIELD_CLASSES}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full"
                disabled={isSubmitting}
                onClick={() => {
                  void handleCreate();
                }}
              >
                {isSubmitting ? labels.creating : labels.create}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
