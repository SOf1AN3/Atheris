"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileText, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { applyToJob } from "@/actions/careers";
import { Button } from "@/components/ui/Button";
import type { CareersFormStrings } from "@/content/types";
import type { Locale } from "@/i18n/config";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents";
import { cn } from "@/lib/utils";

// DESIGN §3.1 — courbe UNIQUE du site (aucun spring, aucun easing concurrent).
const EASE_PREMIUM: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Types admis par la pièce jointe : extension ET MIME (le serveur refait la
// vérification — le contrôle client n'est qu'un premier garde-fou).
const ACCEPT_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;
const ACCEPT_MIME_TYPES = ["application/pdf"] as const;
/** `.pdf,.doc,.docx,application/pdf` — construit, jamais écrit en dur. */
const ACCEPT_ATTR = [...ACCEPT_EXTENSIONS, ...ACCEPT_MIME_TYPES].join(",");

const FILE_FIELD_ID = "apply-cv";
const HINT_ID = "apply-cv-hint";
const ERROR_ID = "apply-cv-error";

// DESIGN §2.6 — champ 52px, rayon 12px (`rounded-xl`), texte 15px, bordure
// `line-2`. Focus : bordure volt + halo volt localisé (§3.6).
const FIELD_BASE =
  "block h-[52px] w-full rounded-xl border bg-surface px-4 text-[15px] text-fg placeholder:text-faint transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)]";

const TEXTAREA_BASE =
  "block w-full resize-y rounded-xl border bg-surface px-4 py-4 text-[15px] leading-relaxed text-fg placeholder:text-faint transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)]";

const FIELD_IDLE_CLASS = "border-line-2";
const FIELD_ERROR_CLASS = "border-danger";

/** États de refus d'un fichier — traduits par `FILE_ISSUE_KEYS` (aucun message en dur). */
type FileIssue = "required" | "badType" | "tooLarge";

const FILE_ISSUE_KEYS = {
  required: "fileRequired",
  badType: "fileBadType",
  tooLarge: "fileTooLarge",
} as const satisfies Record<FileIssue, keyof CareersFormStrings["errors"]>;

/**
 * Schéma Zod LOCAL au formulaire (contrat figé §3.2) — messages i18n injectés
 * depuis `dict.careers.form.errors`. `message` est optionnel et sans borne :
 * `CareersFormStrings["errors"]` ne porte aucune clé de longueur (même
 * arbitrage que `createContactSchema` : un message exact vaut mieux qu'une
 * borne muette).
 *
 * API Zod v4 : `z.email()` top-level enchaîné via `.pipe()` après `min(1)` —
 * « email requis » avant « email invalide ».
 */
function createApplySchema(errors: CareersFormStrings["errors"]) {
  return z.object({
    firstName: z.string().trim().min(1, errors.firstNameRequired),
    lastName: z.string().trim().min(1, errors.lastNameRequired),
    email: z
      .string()
      .trim()
      .min(1, errors.emailRequired)
      .pipe(z.email({ error: errors.emailInvalid })),
    message: z.string().optional(),
  });
}

type ApplyFormValues = z.infer<ReturnType<typeof createApplySchema>>;

/** Contrôle COMPLET du fichier côté client : présence → type → taille (5 Mo). */
function validateFile(file: File | null): FileIssue | null {
  if (file === null) return "required";

  const lowerName = file.name.toLowerCase();
  const hasExtension = ACCEPT_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
  const hasMime = (ACCEPT_MIME_TYPES as readonly string[]).includes(file.type);
  if (!hasExtension && !hasMime) return "badType";

  // Miroir exact de `MAX_DOCUMENT_BYTES` (5 Mo, aligné sur `documents.bytes`).
  if (file.size > MAX_DOCUMENT_BYTES) return "tooLarge";

  return null;
}

/** Taille lisible SANS string en dur : l'unité (`Mo`/`MB`, `ko`/`kB`) vient d'`Intl`. */
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

type FieldErrorProps = {
  id: string;
  /** `null` = état global initial (aucun message rendu). */
  message: string | null | undefined;
};

/**
 * Message d'erreur §3.6 : bordure + texte `danger` 13px, icône alerte inline,
 * `role="alert"` pour l'annonce vocale, relié au champ via `aria-describedby`.
 */
function FieldError({ id, message }: FieldErrorProps): ReactNode {
  if (message === undefined || message === null) return null;

  return (
    <p
      id={`${id}-error`}
      role="alert"
      className="mt-2 flex items-start gap-1.5 text-[13px] text-danger"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 size-3.5 shrink-0"
        fill="none"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 7.5v5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M12 16.25h.01"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      {message}
    </p>
  );
}

type ApplyFormProps = {
  /** Chaînes du formulaire, figées dans `dict.careers.form`. */
  form: CareersFormStrings;
  /** Locale courante (formatage `Intl` de la taille du fichier). */
  locale: Locale;
  /** Libellé du bouton de suppression du fichier (dict `common.cancel`). */
  removeLabel: string;
};

/**
 * Formulaire de candidature (piste F2 · §3.2) : infos perso (RHF + Zod local)
 * + pièce jointe CV en drag & drop (`accept` restreint, nom/taille affichés,
 * refus type/taille côté CLIENT avant tout envoi).
 *
 * Soumission : un unique `FormData` (champs + fichier sous la clé `cv`) passé à
 * la Server Action `applyToJob`, qui ne renvoie que des **codes bruts** — la
 * traduction se fait exclusivement avec `dict.careers.form.errors`, jamais de
 * message serveur affiché. `rate_limited` s'affiche en message GLOBAL sous le
 * bouton (pas sous un champ).
 */
export function ApplyForm({
  form,
  locale,
  removeLabel,
}: ApplyFormProps): ReactNode {
  const prefersReducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Erreur globale (rate-limit / invalid / infra) — distincte des erreurs de champ.
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApplyFormValues>({
    resolver: zodResolver(createApplySchema(form.errors)),
    mode: "onTouched",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      message: "",
    },
  });

  /** Applique un fichier fourni (sélecteur OU dépôt) après validation locale. */
  const applyFile = (next: File): void => {
    const issue = validateFile(next);
    if (issue !== null) {
      setFile(null);
      setFileError(form.errors[FILE_ISSUE_KEYS[issue]]);
      return;
    }
    setFile(next);
    setFileError(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.files?.item(0) ?? null;
    // Réarmement du champ : re-sélectionner le même fichier déclenche à nouveau
    // `onChange` (le `File` retenu vit dans l'état, pas dans l'input).
    event.target.value = "";
    if (next === null) return;
    applyFile(next);
  };

  // Zone déposable : `dragover` doit être neutralisé (défaut = ouverture du
  // fichier dans le navigateur) ; l'état visuel suit le survol du drag.
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    // Pas de clignotement quand la souris passe d'un enfant à l'autre.
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const next = event.dataTransfer.files.item(0);
    if (next === null) return;
    applyFile(next);
  };

  const handleRemoveFile = (): void => {
    setFile(null);
    setFileError(null);
    if (inputRef.current !== null) {
      inputRef.current.value = "";
      // Le focus revient sur le champ : le clavier n'est jamais perdu.
      inputRef.current.focus();
    }
  };

  const handleValidSubmit = async (values: ApplyFormValues): Promise<void> => {
    setFormError(null);

    // Dernier contrôle AVANT l'envoi (le serveur re-validera de toute façon).
    const issue = validateFile(file);
    if (issue !== null) {
      setFileError(form.errors[FILE_ISSUE_KEYS[issue]]);
      return;
    }
    setFileError(null);

    try {
      const formData = new FormData();
      formData.set("firstName", values.firstName);
      formData.set("lastName", values.lastName);
      formData.set("email", values.email);
      formData.set("message", values.message ?? "");
      if (file !== null) {
        formData.set("cv", file);
      }

      const result = await applyToJob(formData);

      if (result.ok) {
        setSent(true);
        return;
      }

      if (result.code === "too_large") {
        setFileError(form.errors.fileTooLarge);
        return;
      }
      if (result.code === "bad_type") {
        setFileError(form.errors.fileBadType);
        return;
      }

      // `rate_limited`, `invalid`, `failed` → message GLOBAL sous le bouton.
      // `rateLimited` n'existe pas dans `CareersFormStrings["errors"]` : on
      // rejoue la chaîne globale du dict (`generic`), jamais de texte serveur.
      setFormError(form.errors.generic);
    } catch {
      // Erreur d'infra propagée par la Server Action → repli global uniquement.
      setFormError(form.errors.generic);
    }
  };

  const handleReset = (): void => {
    reset();
    setFile(null);
    setFileError(null);
    setFormError(null);
    setIsDragging(false);
    setSent(false);
    if (inputRef.current !== null) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-9">
      {/* M10 — swap animé formulaire → succès : fade + scale 0.96→1, 300 ms,
          courbe unique ; `prefers-reduced-motion` → état final immédiat. */}
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="success"
            initial={
              prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_PREMIUM }}
            role="status"
            className="flex flex-col items-center py-10 text-center"
          >
            <span className="flex size-16 items-center justify-center rounded-full border border-success/30 bg-success/10">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-7 text-success"
                fill="none"
              >
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h3 className="h-display mt-5 text-[22px] text-fg">
              {form.successTitle}
            </h3>
            <p className="mt-3 max-w-[38ch] text-[15px] text-muted">
              {form.successMessage}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-6"
              onClick={handleReset}
            >
              {form.successAction}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_PREMIUM }}
          >
            <form noValidate onSubmit={handleSubmit(handleValidSubmit)}>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="apply-first-name"
                    className="mb-2 block text-[13px] font-semibold text-fg-2"
                  >
                    {form.firstNameLabel}
                  </label>
                  <input
                    id="apply-first-name"
                    type="text"
                    autoComplete="given-name"
                    required
                    aria-invalid={!!errors.firstName}
                    aria-describedby={
                      errors.firstName ? "apply-first-name-error" : undefined
                    }
                    className={cn(
                      FIELD_BASE,
                      errors.firstName ? FIELD_ERROR_CLASS : FIELD_IDLE_CLASS,
                    )}
                    {...register("firstName")}
                  />
                  <FieldError
                    id="apply-first-name"
                    message={errors.firstName?.message}
                  />
                </div>

                <div>
                  <label
                    htmlFor="apply-last-name"
                    className="mb-2 block text-[13px] font-semibold text-fg-2"
                  >
                    {form.lastNameLabel}
                  </label>
                  <input
                    id="apply-last-name"
                    type="text"
                    autoComplete="family-name"
                    required
                    aria-invalid={!!errors.lastName}
                    aria-describedby={
                      errors.lastName ? "apply-last-name-error" : undefined
                    }
                    className={cn(
                      FIELD_BASE,
                      errors.lastName ? FIELD_ERROR_CLASS : FIELD_IDLE_CLASS,
                    )}
                    {...register("lastName")}
                  />
                  <FieldError
                    id="apply-last-name"
                    message={errors.lastName?.message}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="apply-email"
                    className="mb-2 block text-[13px] font-semibold text-fg-2"
                  >
                    {form.emailLabel}
                  </label>
                  <input
                    id="apply-email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-invalid={!!errors.email}
                    aria-describedby={
                      errors.email ? "apply-email-error" : undefined
                    }
                    className={cn(
                      FIELD_BASE,
                      errors.email ? FIELD_ERROR_CLASS : FIELD_IDLE_CLASS,
                    )}
                    {...register("email")}
                  />
                  <FieldError
                    id="apply-email"
                    message={errors.email?.message}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="apply-message"
                    className="mb-2 block text-[13px] font-semibold text-fg-2"
                  >
                    {form.messageLabel}
                  </label>
                  <textarea
                    id="apply-message"
                    rows={5}
                    placeholder={form.messagePlaceholder}
                    aria-invalid={!!errors.message}
                    aria-describedby={
                      errors.message ? "apply-message-error" : undefined
                    }
                    className={cn(
                      TEXTAREA_BASE,
                      "min-h-[128px]",
                      errors.message ? FIELD_ERROR_CLASS : FIELD_IDLE_CLASS,
                    )}
                    {...register("message")}
                  />
                  <FieldError
                    id="apply-message"
                    message={errors.message?.message}
                  />
                </div>

                {/* PIÈCE JOINTE — zone déposable + clic pour parcourir.
                    `peer` est le 1ᵉʳ enfant : `peer-focus-visible:` pose l'anneau
                    de focus sur le `<label>` (l'input est `sr-only` mais focalisable). */}
                <div className="sm:col-span-2">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "rounded-xl transition-[background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isDragging ? "bg-white/[0.04]" : "bg-transparent",
                    )}
                  >
                    <input
                      ref={inputRef}
                      id={FILE_FIELD_ID}
                      type="file"
                      accept={ACCEPT_ATTR}
                      className="peer sr-only"
                      aria-invalid={fileError !== null}
                      aria-describedby={cn(
                        HINT_ID,
                        fileError !== null && ERROR_ID,
                      )}
                      onChange={handleFileChange}
                    />
                    <label
                      htmlFor={FILE_FIELD_ID}
                      className={cn(
                        "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-[border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2",
                        isDragging
                          ? "border-accent"
                          : fileError !== null
                            ? "border-danger"
                            : "border-line-2",
                      )}
                    >
                      <FileText
                        aria-hidden="true"
                        className="size-5 text-muted"
                        strokeWidth={1.5}
                      />
                      <span className="text-[13px] font-semibold text-fg-2">
                        {form.fileLabel}
                      </span>
                      <span id={HINT_ID} className="micro text-faint">
                        {form.fileHint}
                      </span>
                    </label>

                    {file !== null ? (
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                        <FileText
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted"
                          strokeWidth={1.5}
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-[14px] text-fg"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="micro shrink-0 text-faint">
                          {formatFileSize(file.size, locale)}
                        </span>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          aria-label={removeLabel}
                          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-2 text-muted transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-line-3 hover:text-fg"
                        >
                          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <FieldError id="apply-cv" message={fileError} />
                </div>
              </div>

              {/* Un seul chemin de soumission : `type="submit"` natif →
                  validation Zod au clic ET par Entrée ; désactivé pendant
                  `isSubmitting` (libellé inchangé, aucun spinner inventé). */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="sweep mt-7 w-full"
                disabled={isSubmitting}
              >
                {form.submitLabel}
              </Button>

              {/* Erreur globale (rate-limit / invalid / infra) — SOUS le bouton,
                  jamais rattachée à un champ. */}
              <FieldError id="apply-submit" message={formError} />

              <p className="mt-4 text-center text-[12px] text-faint">
                {form.note}
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
