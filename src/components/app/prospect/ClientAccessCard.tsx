"use client";

/**
 * Atheris — carte « Envoyer le lien d'accès client » (Lot 3 · PLAN.md §FE-D).
 *
 * Composant CLIENT monté par la page server `espace/prospects/[id]/fiche` :
 * **tous** les libellés et données y sont résolus côté serveur (frontière
 * RSC) — ce composant n'importe jamais `@/i18n/*` et ne détient aucun droit.
 *
 * ─── CONTRAT ────────────────────────────────────────────────────────────────
 * Appelle `createClientInvitation({ prospectId, email, name, locale }, actor)`
 * (`@/actions/invitations`) :
 * - `ok: true, mailSent: true`  → message de succès `role="status"` ;
 * - `ok: true, mailSent: false` → avertissement + lien d'activation copiable
 *   (`{origin}/{locale}/invitation/{token}`) dans un champ `readOnly` ;
 * - `ok: false`                 → message `role="alert"` (code brut traduit
 *   ici, jamais un message servi par le serveur) ;
 * - exception d'infra           → repli `errors.failed`, aucun détail fuité.
 *
 * JETON UNIQUE : l'action **réutilise** une invitation non consommée déjà
 * existante (refresh d'`expiresAt`) — on ne régénère donc jamais de second
 * lien : un renvoi produit le même jeton. Ce composant ne fait AUCUN appel au
 * montage (aucun envoi non sollicité).
 *
 * ─── URL ABSOLUE ────────────────────────────────────────────────────────────
 * L'origine (`window.location.origin`) n'est connue qu'après montage : l'état
 * démarre à `""` → rendu serveur et premier rendu client identiques (aucun
 * décalage d'hydratation), l'URL bascule en absolue juste après le montage
 * (motif : `InterviewLinks.tsx`).
 *
 * ─── COPIE ──────────────────────────────────────────────────────────────────
 * `navigator.clipboard.writeText` d'abord ; en échec → sélection du champ
 * (`select()` + focus) pour une copie manuelle Ctrl+C, annoncée en `aria-live`
 * (motif : `InterviewLinks.tsx` `handleCopy` / `selectField`).
 *
 * A11y : `<section>` + `aria-labelledby`, `<label>` associé au champ, cibles
 * tactiles ≥ 44 px (`h-11` / bouton `md` = 52 px), `role="status"` pour les
 * retours attendus, `role="alert"` pour les refus serveur.
 */

import { useEffect, useRef, useState } from "react";
import type { FocusEvent } from "react";

import { createClientInvitation } from "@/actions/invitations";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Role } from "@/lib/permissions";

/** Durée du retour visuel « Copié » (ms) — identique à `InterviewLinks`. */
const COPY_FEEDBACK_MS = 1500;

/** id du champ URL (repli de sélection au clavier). */
const LINK_FIELD_ID = "client-access-link";

/** Champ URL : 44 px, hairline, filet accent au focus (focus global). */
const FIELD_CLASSES =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3.5 text-[13px] text-muted focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 sm:flex-1";

/** Libellés, tous résolus côté serveur (100 % dict — jamais de littéral). */
export type ClientAccessCardLabels = {
  /** `dict.auth.invitation.email.client.subject` — titre de la carte. */
  title: string;
  /** `dict.auth.invitation.description` — lien personnel, valable 48 h. */
  description: string;
  /** `dict.client.send` — libellé du bouton d'envoi. */
  submit: string;
  /** `dict.recruitment.modal.sending` — libellé pendant l'appel. */
  sending: string;
  /**
   * `dict.activities.invitationCreated` — `{actor}` **déjà remplacé** côté
   * serveur (le dictionnaire ne franchit pas la frontière RSC).
   */
  success: string;
  /** `dict.recruitment.modal.errors.mailFailed` — e-mail non envoyé. */
  mailWarning: string;
  /** `dict.interviews.columns.link` — label du champ URL. */
  linkLabel: string;
  /** `dict.interviews.copy`. */
  copy: string;
  /** `dict.interviews.copied`. */
  copied: string;
  /** `dict.interviews.copyFallback` — repli Ctrl+C. */
  copyFallback: string;
  /** Codes de `createClientInvitation` (+ repli d'infra) traduits server. */
  errors: {
    /** `dict.interviews.errors.forbidden` — rôle ≠ CEO. */
    forbidden: string;
    /** `dict.common.notFound` — prospect absent. */
    notFound: string;
    /** `dict.interviews.errors.invalid` — statut/projet non éligibles. */
    invalid: string;
    /** `dict.interviews.errors.failed` — erreur d'infra (exception). */
    failed: string;
  };
};

export type ClientAccessCardProps = {
  /** uuid du prospect (entrée du contrat serveur). */
  prospectId: string;
  /** E-mail du prospect (entrée du contrat serveur). */
  email: string;
  /** Nom du prospect (entrée du contrat serveur). */
  name: string;
  /** Locale de la page (langue de l'e-mail d'invitation). */
  locale: Locale;
  /** `{ id, role }` chargé en session côté serveur (motif : `ApplicationList`). */
  actor: { id: string; role: Role };
  /** Libellés i18n résolus dans la page server (props 100 % sérialisables). */
  labels: ClientAccessCardLabels;
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

export function ClientAccessCard({
  prospectId,
  email,
  name,
  locale,
  actor,
  labels,
}: ClientAccessCardProps): React.JSX.Element {
  /** Origine absolue : renseignée après montage (`""` = rendu serveur). */
  const [origin, setOrigin] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  /** `null` = aucun appel ; sinon jeton renvoyé par l'action. */
  const [token, setToken] = useState<string | null>(null);
  /** `null` = aucun appel ; résultat d'envoi de la dernière invitation. */
  const [mailSent, setMailSent] = useState<boolean | null>(null);
  /** Message d'erreur localisé (code brut traduit ici, jamais servi). */
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [copyFallback, setCopyFallback] = useState<boolean>(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Nettoyage du timer « Copié » au démontage.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  /** URL absolue affichée ET copiée (jamais de divergence entre les deux). */
  const linkUrl = token !== null ? `${origin}/${locale}/invitation/${token}` : null;

  /** Code brut du serveur → message localisé (jamais de string serveur). */
  function errorMessage(code: "forbidden" | "not_found" | "invalid"): string {
    switch (code) {
      case "forbidden":
        return labels.errors.forbidden;
      case "not_found":
        return labels.errors.notFound;
      default:
        return labels.errors.invalid;
    }
  }

  function flashCopied(): void {
    setCopyFallback(false);
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, COPY_FEEDBACK_MS);
  }

  async function handleCopy(value: string): Promise<void> {
    const done = await writeToClipboard(value);
    if (done) {
      flashCopied();
      return;
    }
    // Repli : le champ est sélectionné, l'utilisateur finit à la main.
    selectField(LINK_FIELD_ID);
    setCopied(false);
    setCopyFallback(true);
  }

  async function handleSend(): Promise<void> {
    if (sending) return;
    setSending(true);
    setError(null);
    setCopyFallback(false);
    try {
      const result = await createClientInvitation(
        { prospectId, email, name, locale },
        actor,
      );
      if (result.ok) {
        // Même jeton si une invitation non consommée existe déjà : aucun
        // second lien n'est généré (réutilisation côté serveur).
        setToken(result.token);
        setMailSent(result.mailSent);
        return;
      }
      setToken(null);
      setMailSent(null);
      setError(errorMessage(result.code));
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setToken(null);
      setMailSent(null);
      setError(labels.errors.failed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-labelledby="client-access-title"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 md:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2
          id="client-access-title"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {labels.title}
        </h2>
        <p className="max-w-[62ch] text-sm leading-[1.6] text-muted">
          {labels.description}
        </p>
      </div>

      {/* CTA — état `sending` : bouton désactivé + libellé « Envoi… ». */}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={sending}
          onClick={() => {
            void handleSend();
          }}
          className="w-full md:w-auto"
        >
          {sending ? labels.sending : labels.submit}
        </Button>
      </div>

      {/* Refus serveur (`forbidden` / `not_found` / `invalid`) ou infra. */}
      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* E-mail remis : accusé de réception, sans lien à recopier. */}
      {mailSent === true ? (
        <p role="status" aria-live="polite" className="text-sm text-success">
          {labels.success}
        </p>
      ) : null}

      {/* E-mail non envoyé : avertissement + lien à remettre à la main. */}
      {mailSent === false && linkUrl !== null ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-ink-2 p-4">
          <p role="status" aria-live="polite" className="text-sm text-warn">
            {labels.mailWarning}
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={LINK_FIELD_ID} className="micro text-muted">
              {labels.linkLabel}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id={LINK_FIELD_ID}
                type="text"
                readOnly
                value={linkUrl}
                onFocus={handleFieldFocus}
                className={FIELD_CLASSES}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full shrink-0 sm:w-auto"
                onClick={() => {
                  void handleCopy(linkUrl);
                }}
              >
                {copied ? labels.copied : labels.copy}
              </Button>
            </div>
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={`min-h-5 text-sm ${copied ? "text-success" : "text-warn"}`}
            >
              {copied ? labels.copied : copyFallback ? labels.copyFallback : null}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
