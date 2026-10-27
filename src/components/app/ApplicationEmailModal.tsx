"use client";

/**
 * Atheris — modal d'envoi d'e-mail de recrutement (invitation à l'entretien OU
 * refus) — espace CEO, `PLAN-RECRUTEMENT-CEO.md` §3.
 *
 * ─── RÔLE ───────────────────────────────────────────────────────────────────
 * Un SEUL composant réutilisé pour les deux décisions (`kind`), rendu par
 * `ApplicationsPanel` : au montage, `getEmailTemplate(kind, localeCandidature)`
 * préremplit l'objet et le corps (modèle mémorisé en base, sinon défaut) ; le
 * CEO édite librement, puis envoie via `inviteToInterview` / `rejectApplication`.
 *
 * ─── CONTRAT ────────────────────────────────────────────────────────────────
 * - TOUTES les strings viennent de `labels.modal` (`dict.recruitment.modal`) :
 *   zéro string en dur, zéro message serveur (les codes `forbidden` /
 *   `invalid` / `not_found` / `conflict` / `mail_failed` / `failed` sont
 *   traduits localement, `errorText`).
 * - `saveTemplate` (coche) : si active, le CEO enregistre son texte comme
 *   modèle par défaut pour les prochains envois de même type/langue.
 * - `onSent` notifie le panel (toast + `router.refresh()`) ; `onClose` ferme.
 * - Un échec d'envoi ne vide JAMAIS le formulaire (la saisie du CEO est
 *   précieuse : `mail_failed` → réessai sans re- saisie).
 *
 * ─── A11Y ───────────────────────────────────────────────────────────────────
 * `role="dialog"` + `aria-modal` + `aria-labelledby` · focus initial sur le
 * champ Objet · `Escape` ferme · focus piégé (Tab cyclique) · backdrop
 * cliquable · verrouillage du scroll du body pendant l'ouverture · erreurs en
 * `role="alert"`.
 *
 * ─── VOLT ───────────────────────────────────────────────────────────────────
 * Le SEUL aplat volt du modal est le bouton « Envoyer » (`Button` primary) ;
 * « Annuler » reste fantôme. Courbe UNIQUE du projet (§DESIGN).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  getEmailTemplate,
  inviteToInterview,
  rejectApplication,
} from "@/actions/recrutement";
import { Button } from "@/components/ui/Button";
import type { RecruitmentContent } from "@/content/platform/types";

/** Courbe unique du projet (aucun easing concurrent). */
const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

type EmailKind = "invite" | "reject";

export type ApplicationEmailModalProps = {
  kind: EmailKind;
  applicationId: string;
  candidateFirstName: string;
  candidateLastName: string;
  applicationLocale: "fr" | "en";
  labels: { modal: RecruitmentContent["modal"] };
  onClose: () => void;
  onSent: () => void;
};

/** Code brut du serveur → message localisé (jamais de string servie en dur). */
function errorText(code: string, labels: RecruitmentContent["modal"]): string {
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

/** Champ de formulaire typé (contrôle de focus, a11y). */
function isFocusable(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLAnchorElement
  );
}

export function ApplicationEmailModal({
  kind,
  applicationId,
  candidateFirstName,
  candidateLastName,
  applicationLocale,
  labels,
  onClose,
  onSent,
}: ApplicationEmailModalProps): React.JSX.Element {
  const { modal } = labels;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Modèle initial — un seul fetch au montage (kind + locale figés par ligne).
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadTemplate(): Promise<void> {
      try {
        const result = await getEmailTemplate(kind, applicationLocale);
        if (cancelled) return;
        if (result.ok) {
          setSubject(result.subject);
          setBody(result.body);
          setLoading(false);
        } else {
          setLoadFailed(true);
          setLoading(false);
        }
      } catch {
        // Erreur d'infra propagée par l'action : aucun détail technique en UI.
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      }
    }

    void loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [kind, applicationLocale]);

  // Focus initial sur le champ Objet (dès que le modèle est chargé).
  useEffect(() => {
    if (!loading && !loadFailed) subjectRef.current?.focus();
  }, [loading, loadFailed]);

  // Verrouillage du scroll du body pendant l'ouverture.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Focus piégé + Échap.
  // -------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!sending) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("*")).filter(
        (element) => isFocusable(element) && !element.hasAttribute("disabled"),
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose, sending],
  );

  // -------------------------------------------------------------------------
  // Envoi.
  // -------------------------------------------------------------------------
  async function handleSend(): Promise<void> {
    if (sending) return;
    setSending(true);
    setSendError(null);

    const input = {
      applicationId,
      subject,
      body,
      saveTemplate,
    };

    try {
      const result =
        kind === "invite" ? await inviteToInterview(input) : await rejectApplication(input);
      if (result.ok) {
        onSent();
        onClose();
        return;
      }
      // Échec : message traduit, formulaire INTACT (aucun reset de saisie).
      setSendError(errorText(result.code, modal));
      setSending(false);
    } catch {
      // Erreur d'infra propagée : repli sobre, jamais de détail technique.
      setSendError(modal.errors.failed);
      setSending(false);
    }
  }

  const title = kind === "invite" ? modal.inviteTitle : modal.rejectTitle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop — cliquable pour fermer (jamais pendant l'envoi). */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[rgba(8,9,11,0.72)] transition-opacity duration-200 ${EASE}`}
        onClick={() => {
          if (!sending) onClose();
        }}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[90svh] w-full max-w-[640px] flex-col gap-5 overflow-y-auto rounded-[20px] border border-line bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] transition-[transform,opacity] duration-200 sm:p-7 ${EASE}`}
      >
        {/* Titre + destinataire (vérification visuelle avant envoi). */}
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="h-display text-[22px] leading-tight text-fg">
            {title}
          </h2>
          <p className="text-[14px] text-muted">
            {`${candidateFirstName} ${candidateLastName}`.trim()}
          </p>
        </div>

        {loading ? (
          <p role="status" className="text-sm text-muted">
            {modal.sending}
          </p>
        ) : loadFailed ? (
          /* Modèle non chargeable : on ferme plutôt qu'un formulaire vide. */
          <div className="flex flex-col gap-4">
            <p role="alert" className="text-sm text-danger">
              {modal.loadError}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {modal.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Objet */}
            <div className="flex flex-col gap-2">
              <label htmlFor={`${titleId}-subject`} className="micro text-faint">
                {modal.subjectLabel}
              </label>
              <input
                id={`${titleId}-subject`}
                ref={subjectRef}
                type="text"
                value={subject}
                maxLength={200}
                onChange={(event) => {
                  setSubject(event.target.value);
                }}
                className={`block h-[52px] w-full rounded-xl border border-line-2 bg-surface px-4 text-[15px] text-fg transition-[border-color,box-shadow] duration-200 ${EASE} focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)] focus:outline-none`}
              />
            </div>

            {/* Corps */}
            <div className="flex flex-col gap-2">
              <label htmlFor={`${titleId}-body`} className="micro text-faint">
                {modal.bodyLabel}
              </label>
              <textarea
                id={`${titleId}-body`}
                value={body}
                rows={14}
                maxLength={10_000}
                onChange={(event) => {
                  setBody(event.target.value);
                }}
                className={`block w-full resize-y rounded-xl border border-line-2 bg-surface px-4 py-4 text-[15px] leading-relaxed text-fg transition-[border-color,box-shadow] duration-200 ${EASE} focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)] focus:outline-none`}
              />
              <p className="text-[13px] leading-relaxed text-faint">{modal.bodyHint}</p>
            </div>

            {/* Modèle */}
            <label className="flex cursor-pointer items-center gap-3 text-[14px] text-muted">
              <input
                type="checkbox"
                checked={saveTemplate}
                onChange={(event) => {
                  setSaveTemplate(event.target.checked);
                }}
                className="size-4 accent-[var(--color-accent,#CCFF4A)]"
              />
              {modal.saveTemplateLabel}
            </label>

            {/* Erreur d'envoi (role="alert", formulaire intact). */}
            {sendError !== null ? (
              <p role="alert" className="text-sm text-danger">
                {sendError}
              </p>
            ) : null}

            {/* Actions — seul aplat volt : « Envoyer ». */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={sending}
                onClick={onClose}
              >
                {modal.cancel}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={sending || subject.trim().length === 0 || body.trim().length === 0}
                onClick={() => {
                  void handleSend();
                }}
              >
                {sending ? modal.sending : modal.send}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
