"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Mail, MapPin, MessageCircle } from "lucide-react";
import { useForm } from "react-hook-form";

import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type {
  ChannelIcon,
  ContactChannel as ContactChannelData,
  ContactContent,
} from "@/content/types";
import { createContactSchema } from "@/lib/form-schema";
import type { ContactFormValues } from "@/lib/form-schema";
import { cn } from "@/lib/utils";

// DESIGN: M10 (§5) — swap formulaire → succès : fade + scale 0.96→1, 260ms.
const EASE_PREMIUM: [number, number, number, number] = [0.22, 1, 0.36, 1];

// DESIGN: mapping lucide ciblé (§4.10) — icônes 20px `text-muted`, stroke 1.5.
// L'accent est interdit sur les icônes décoratives (§2.3).
const CHANNEL_ICONS = {
  mail: Mail,
  whatsapp: MessageCircle,
  pin: MapPin,
} as const satisfies Record<ChannelIcon, typeof Mail>;

// DESIGN: §3.6 — champ 52px, radius 12px, padding-x 16px, texte 15px.
// Focus : bordure accent + focus ring global `:focus-visible` (globals.css) —
// `outline: none` interdit §6.3, aucun remplacement par une classe locale.
const FIELD_BASE =
  "block w-full rounded-xl border bg-surface px-4 text-[15px] text-fg placeholder:text-faint transition-colors duration-200 focus:border-accent";

const FIELD_ERROR_CLASS = "border-danger";

const TEXTAREA_BASE =
  "block w-full resize-y rounded-xl border bg-surface px-4 py-4 text-[15px] leading-relaxed text-fg placeholder:text-faint transition-colors duration-200 focus:border-accent";

type FieldErrorProps = {
  id: string;
  message: string | undefined;
};

/**
 * Message d'erreur §3.6 : bordure + texte `danger` 13px sous le champ,
 * icône alerte 14px inline (pattern SVG du projet), `role="alert"` pour
 * l'annonce vocale. L'élément est relié au champ via `aria-describedby`.
 */
function FieldError({ id, message }: FieldErrorProps): ReactNode {
  return (
    <p
      id={`${id}-error`}
      role="alert"
      className="mt-2 flex items-center gap-1.5 text-[13px] text-danger"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5 shrink-0"
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

type ContactChannelProps = {
  channel: ContactChannelData;
};

/**
 * Un canal de contact (§4.10) : bloc `surface` cliquable si `href` (mailto /
 * wa.me — externe = `target="_blank"`), statique sinon (localisation).
 * Hover : bordure accent uniquement, aucun fond bleu (§2.3).
 */
function ContactChannel({ channel }: ContactChannelProps): ReactNode {
  const Icon = CHANNEL_ICONS[channel.icon];
  const isExternal = channel.href?.startsWith("http") ?? false;

  const content = (
    <>
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted"
        strokeWidth={1.5}
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium uppercase tracking-[0.06em] text-faint">
          {channel.label}
        </span>
        <span className="mt-0.5 block text-[15px] font-medium text-fg">
          {channel.value}
        </span>
      </span>
    </>
  );

  const baseClassName =
    "flex items-center gap-4 rounded-2xl border border-line bg-surface p-5";

  if (channel.href === null) {
    return <div className={baseClassName}>{content}</div>;
  }

  return (
    <a
      href={channel.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className={cn(
        baseClassName,
        "transition-[border-color] duration-200 hover:border-[rgba(59,130,246,0.4)]",
      )}
    >
      {content}
    </a>
  );
}

type ContactProps = {
  contact: ContactContent;
};

/**
 * Section « Contact & demande de devis » (§4.10) : split 5/7 — colonne gauche
 * infos (SectionHeading + 3 canaux), colonne droite carte `surface` contenant
 * le formulaire §3.6 (Zod + React Hook Form, messages i18n via les props).
 *
 * **Frontend-only** : aucun `fetch`, aucun `router` — le succès est simulé
 * localement (M10), l'envoi sera branché ultérieurement.
 */
export function Contact({ contact }: ContactProps): ReactNode {
  const prefersReducedMotion = useReducedMotion();
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(createContactSchema(contact.form.errors)),
    mode: "onTouched",
    // `type` volontairement absent : le `<select>` ouvre sur l'option
    // placeholder (`value=""`), valeur lue au submit → `typeRequired`.
    defaultValues: {
      name: "",
      email: "",
      message: "",
      company_website: "",
    },
  });

  // SECURITY/TODO: brancher l'envoi (Resend ou DB) ultérieurement —
  // décision frontend-only : aucun appel réseau, aucun routage.
  const handleValidSubmit = (values: ContactFormValues): void => {
    // SECURITY: honeypot `company_website` pré-câblé (le backend future doit
    // rejeter toute soumission où il est rempli — signalement de bot).
    if (values.company_website) {
      setSent(true);
      return;
    }

    setSent(true);
  };

  // `Button` force `type="button"` (sa prop `type` est omise, hors périmètre
  // de modification) : le clic délègue au formulaire natif via `requestSubmit`
  // pour conserver un seul chemin de validation/soumission (Zod → handleSubmit).
  const handleButtonClick = (): void => {
    formRef.current?.requestSubmit();
  };

  const handleReset = (): void => {
    reset();
    setSent(false);
  };

  return (
    // DESIGN: `id="contact"` = ancre des CTA (« Lancer un projet »).
    // Bande visuellement séparée §4.10 : bordure haute + fond `ink-2`.
    <section
      id="contact"
      className="border-t border-line bg-ink-2 py-[72px] md:py-24 lg:py-[120px]"
    >
      {/* Container §2.7. */}
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* Split §4.10 : infos `span 5` / formulaire `span 7`, empilé mobile. */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              align="left"
              eyebrow={contact.eyebrow}
              title={contact.title}
              description={contact.description}
            />

            <div className="mt-10 space-y-3">
              {contact.channels.map((channel) => (
                <ContactChannel key={channel.id} channel={channel} />
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <Reveal>
              <div className="rounded-[24px] border border-line bg-surface p-6 md:p-10">
                {/* DESIGN: M10 (§5) — swap animé entre formulaire et bloc
                    succès (fade + scale 0.96→1, 260ms), reduced-motion →
                    état final immédiat sans animation. */}
                <AnimatePresence mode="wait">
                  {sent ? (
                    <motion.div
                      key="success"
                      initial={
                        prefersReducedMotion
                          ? false
                          : { opacity: 0, scale: 0.96 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.26, ease: EASE_PREMIUM }}
                      role="status"
                      className="flex flex-col items-center py-10 text-center"
                    >
                      <span className="flex size-16 items-center justify-center rounded-full border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.10)]">
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
                      <h3 className="mt-5 text-[22px] font-semibold text-fg">
                        {contact.form.successTitle}
                      </h3>
                      <p className="mt-2 max-w-[38ch] text-[15px] text-muted">
                        {contact.form.successMessage}
                      </p>
                      <button
                        type="button"
                        className="mt-6 text-sm font-semibold text-muted underline decoration-line underline-offset-4 transition-colors hover:text-fg"
                        onClick={handleReset}
                      >
                        {contact.form.successAction}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="form"
                      initial={false}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.26, ease: EASE_PREMIUM }}
                    >
                      <form
                        ref={formRef}
                        noValidate
                        onSubmit={handleSubmit(handleValidSubmit)}
                      >
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="contact-name"
                              className="mb-2 block text-[13px] font-semibold text-fg"
                            >
                              {contact.form.nameLabel}
                            </label>
                            <input
                              id="contact-name"
                              type="text"
                              autoComplete="name"
                              required
                              aria-invalid={!!errors.name}
                              aria-describedby={
                                errors.name ? "contact-name-error" : undefined
                              }
                              className={cn(
                                FIELD_BASE,
                                "h-[52px]",
                                errors.name && FIELD_ERROR_CLASS,
                              )}
                              {...register("name")}
                            />
                            {errors.name ? (
                              <FieldError
                                id="contact-name"
                                message={errors.name.message}
                              />
                            ) : null}
                          </div>

                          <div>
                            <label
                              htmlFor="contact-email"
                              className="mb-2 block text-[13px] font-semibold text-fg"
                            >
                              {contact.form.emailLabel}
                            </label>
                            <input
                              id="contact-email"
                              type="email"
                              autoComplete="email"
                              required
                              aria-invalid={!!errors.email}
                              aria-describedby={
                                errors.email ? "contact-email-error" : undefined
                              }
                              className={cn(
                                FIELD_BASE,
                                "h-[52px]",
                                errors.email && FIELD_ERROR_CLASS,
                              )}
                              {...register("email")}
                            />
                            {errors.email ? (
                              <FieldError
                                id="contact-email"
                                message={errors.email.message}
                              />
                            ) : null}
                          </div>

                          <div className="sm:col-span-2">
                            <label
                              htmlFor="contact-type"
                              className="mb-2 block text-[13px] font-semibold text-fg"
                            >
                              {contact.form.typeLabel}
                            </label>
                            <div className="relative">
                              <select
                                id="contact-type"
                                required
                                aria-invalid={!!errors.type}
                                aria-describedby={
                                  errors.type
                                    ? "contact-type-error"
                                    : undefined
                                }
                                className={cn(
                                  FIELD_BASE,
                                  "h-[52px] appearance-none pr-10",
                                  errors.type && FIELD_ERROR_CLASS,
                                )}
                                {...register("type")}
                              >
                                {/* Option placeholder désactivée : valeur vide
                                    → message `typeRequired` au submit. */}
                                <option value="" disabled>
                                  {contact.form.typeLabel}
                                </option>
                                {contact.form.typeOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                aria-hidden="true"
                                className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted"
                                strokeWidth={1.5}
                              />
                            </div>
                            {errors.type ? (
                              <FieldError
                                id="contact-type"
                                message={errors.type.message}
                              />
                            ) : null}
                          </div>

                          <div className="sm:col-span-2">
                            <label
                              htmlFor="contact-message"
                              className="mb-2 block text-[13px] font-semibold text-fg"
                            >
                              {contact.form.messageLabel}
                            </label>
                            <textarea
                              id="contact-message"
                              rows={5}
                              required
                              placeholder={contact.form.messagePlaceholder}
                              aria-invalid={!!errors.message}
                              aria-describedby={
                                errors.message
                                  ? "contact-message-error"
                                  : undefined
                              }
                              className={cn(
                                TEXTAREA_BASE,
                                "min-h-[128px]",
                                errors.message && FIELD_ERROR_CLASS,
                              )}
                              {...register("message")}
                            />
                            {errors.message ? (
                              <FieldError
                                id="contact-message"
                                message={errors.message.message}
                              />
                            ) : null}
                          </div>
                        </div>

                        {/* SECURITY: honeypot §3.6 — hors flux visuel (absolute
                            off-screen), non focalisable au clavier, ignoré des
                            lecteurs d'écran. Le backend future doit rejeter
                            toute soumission où il est rempli. */}
                        <input
                          id="contact-company-website"
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          aria-hidden="true"
                          className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
                          {...register("company_website")}
                        />

                        {/* NOTE: `Button` omits `type` de ses props (forcé
                            `type="button"`) : le clic appelle `requestSubmit()`
                            et ce bouton natif masqué assure la soumission
                            implicite par Entrée (§6.2). */}
                        <Button
                          variant="primary"
                          size="lg"
                          className="mt-7 w-full disabled:opacity-70"
                          disabled={isSubmitting}
                          aria-disabled={isSubmitting}
                          onClick={handleButtonClick}
                        >
                          {contact.form.submitLabel}
                        </Button>
                        <button
                          type="submit"
                          tabIndex={-1}
                          aria-hidden="true"
                          className="sr-only"
                        >
                          {contact.form.submitLabel}
                        </button>

                        <p className="mt-4 text-center text-[12px] text-faint">
                          {contact.form.note}
                        </p>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
