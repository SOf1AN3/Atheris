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
 * `createInterviewLink(locale)` avec la locale lue via `useParams()` (jamais
 * de code langue en dur ; locale absente/invalide → `undefined`, l'action
 * applique son propre repli). Bouton désactivé pendant l'appel, retour
 * d'erreur `role="alert"`, puis affichage de l'URL + copie + lien direct.
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

import { createInterviewLink } from "@/actions/interviews";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import type { InterviewStatus } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Durée du retour visuel « Copié » (ms). */
const COPY_FEEDBACK_MS = 1500;

/** id du champ URL du bloc de création (repli de sélection). */
const CREATE_FIELD_ID = "interview-create-url";
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
  listTitle: string;
  empty: string;
  emptyHint: string;
  booked: string;
  notBooked: string;
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
  function errorMessage(code: "forbidden" | "invalid" | "failed"): string {
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
      const result = await createInterviewLink(locale);
      if (result.ok) {
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
              <div>
                <Button
                  type="button"
                  variant="primary"
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

              return (
                <Reveal
                  key={row.id}
                  as="li"
                  delay={Math.min(index, 6) * 0.05}
                  className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 md:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <dd className="text-[15px] text-fg">
                        {row.slotLabel ?? labels.notBooked}
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
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => {
                void handleCreate();
              }}
            >
              {isSubmitting ? labels.creating : labels.create}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
