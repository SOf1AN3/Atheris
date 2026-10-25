"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Mail, MapPin, MessageCircle } from "lucide-react";
import { useForm } from "react-hook-form";

import { submitContact } from "@/actions/contact";
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

// DESIGN: M10 (§5) — swap formulaire → succès : fade + scale 0.96→1, 300ms,
// courbe UNIQUE du site (§3.1) — aucun easing concurrent.
const EASE_PREMIUM: [number, number, number, number] = [0.16, 1, 0.3, 1];

// DESIGN: mapping lucide ciblé (§4.10) — icônes 20px `text-muted`, stroke 1.5.
// L'accent est interdit sur les icônes décoratives (§2.3).
const CHANNEL_ICONS = {
  mail: Mail,
  whatsapp: MessageCircle,
  pin: MapPin,
} as const satisfies Record<ChannelIcon, typeof Mail>;

// DESIGN: §2.6 — champ 52px, rayon 12px (`rounded-xl`), padding-x 16px,
// texte 15px, bordure `line-2`. Focus : bordure volt + ring volt localisé
// (remplacement explicite du `focus ring` — aucun `outline: none` §2.7).
const FIELD_BASE =
  "block h-[52px] w-full rounded-xl border bg-surface px-4 text-[15px] text-fg placeholder:text-faint transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)]";

const FIELD_ERROR_CLASS = "border-danger";
const FIELD_IDLE_CLASS = "border-line-2";

const TEXTAREA_BASE =
  "block w-full resize-y rounded-xl border bg-surface px-4 py-4 text-[15px] leading-relaxed text-fg placeholder:text-faint transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)]";

/**
 * Couleur de bordure d'état — MUTUELLEMENT EXCLUSIVE : poser `border-line-2`
 * ET `border-danger` laisserait l'ordre de cascade Tailwind trancher à notre
 * place. Le focus volt (`focus:border-accent`) reste une variante, toujours
 * résolue après l'état de base.
 */
const fieldBorderClass = (hasError: boolean): string =>
  hasError ? FIELD_ERROR_CLASS : FIELD_IDLE_CLASS;

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
 * Un canal de contact (§2.5) : carte `card spot` cliquable si `href`
 * (mailto / wa.me — externe = `target="_blank" rel="noopener noreferrer"`),
 * statique sinon (localisation). Icône lucide 20px `text-muted`, micro-label
 * mono, valeur 15px `fg` — hover = arête `line-2` + -3px, aucune ombre.
 */
function ContactChannel({ channel }: ContactChannelProps): ReactNode {
  const Icon = CHANNEL_ICONS[channel.icon];
  // Liens externes : `wa.me` (https) ET `mailto:` ouvrent hors-site
  // (`target="_blank"` + `rel="noopener noreferrer"`).
  const isExternal =
    channel.href !== null &&
    (channel.href.startsWith("http") || channel.href.startsWith("mailto:"));

  const content = (
    <>
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted"
        strokeWidth={1.5}
      />
      <span className="min-w-0">
        <span className="micro block text-faint">{channel.label}</span>
        <span className="mt-1 block text-[15px] font-medium text-fg">
          {channel.value}
        </span>
      </span>
    </>
  );

  const baseClassName =
    "card spot flex items-center gap-4 rounded-[20px] border border-line bg-surface p-5 transition-[border-color,translate] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-line-2";

  if (channel.href === null) {
    return <div className={baseClassName}>{content}</div>;
  }

  return (
    <a
      href={channel.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className={baseClassName}
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
 * **Envoi réel** (BK-8 · T34) : `submitContact` (Server Action) crée un
 * prospect `source = "landing"` côté serveur. Le contrat ne renvoie que des
 * **codes bruts** — l'affichage réutilise exclusivement les chaînes du dict
 * landing (aucune clé ajoutée, aucun libellé modifié) :
 * - succès → écran de succès existant (inchangé) ;
 * - `duplicate` / `invalid` → erreur sous le champ email ;
 * - `rate_limited` (ou erreur d'infra) → message global sous le bouton.
 */
export function Contact({ contact }: ContactProps): ReactNode {
  const prefersReducedMotion = useReducedMotion();
  const [sent, setSent] = useState(false);
  // Erreur globale (rate-limit / infra) — distincte des erreurs de champ
  // gérées par React Hook Form via `setError`.
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
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

  /**
   * Soumission réelle (BK-8 · T34) : la Server Action renvoie des **codes
   * bruts**, traduits ici avec le dict landing FIGÉ — pas de clé dédiée au
   * doublon ni au rate-limit, on réutilise les chaînes existantes les plus
   * proches (voir restitution : clés manquantes).
   *
   * Le honeypot `company_website` part TOUJOURS avec le payload : c'est le
   * serveur qui décide (faux succès silencieux, aucune écriture).
   */
  const handleValidSubmit = async (values: ContactFormValues): Promise<void> => {
    setFormError(null);

    try {
      const result = await submitContact(values);

      if (result.ok) {
        // Écran de succès existant, strictement identique (M10).
        setSent(true);
        return;
      }

      if (result.code === "rate_limited") {
        // Dict sans clé `rateLimited` → repli sur la ligne global `form.note`
        // (seule chaîne globale du formulaire, déjà sous le bouton).
        setFormError(contact.form.note);
        return;
      }

      // `duplicate` (déjà contacté) et `invalid` (entrée refusée côté serveur)
      // → erreur sous le champ email : pas de clé `emailDuplicate` non plus,
      // on rejoue l'erreur générique du champ (`emailInvalid`), jamais de
      // message serveur ni de détail sur le prospect existant.
      setError("email", { type: "server", message: contact.form.errors.emailInvalid });
    } catch {
      // Erreur d'infra (DB indisponible…) propagée par la Server Action →
      // 500 sans détail côté client : message global de repli uniquement.
      setFormError(contact.form.note);
    }
  };

  const handleReset = (): void => {
    reset();
    setFormError(null);
    setSent(false);
  };

  return (
    // DESIGN: `id="contact"` = ancre des CTA (« Lancer un projet »).
    // Bande visuellement séparée (densité normale §2.3) : fond `ink-2` +
    // filet haut `line`.
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="border-t border-line bg-ink-2 py-[clamp(80px,10vh,128px)]"
    >
      {/* Container §2.7. */}
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* Split §4.10 : infos `span 5` / formulaire `span 7`, empilé mobile. */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              index="07"
              headingId="contact-title"
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
              <div className="rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-9">
                {/* DESIGN: M10 (§5) — swap animé entre formulaire et bloc
                    succès (fade + scale 0.96→1, 300ms), reduced-motion →
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
                        {contact.form.successTitle}
                      </h3>
                      <p className="mt-3 max-w-[38ch] text-[15px] text-muted">
                        {contact.form.successMessage}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-6"
                        onClick={handleReset}
                      >
                        {contact.form.successAction}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="form"
                      initial={false}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE_PREMIUM }}
                    >
                      <form
                        noValidate
                        onSubmit={handleSubmit(handleValidSubmit)}
                      >
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="contact-name"
                              className="mb-2 block text-[13px] font-semibold text-fg-2"
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
                                fieldBorderClass(!!errors.name),
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
                              className="mb-2 block text-[13px] font-semibold text-fg-2"
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
                                fieldBorderClass(!!errors.email),
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
                              className="mb-2 block text-[13px] font-semibold text-fg-2"
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
                                  "appearance-none pr-10",
                                  fieldBorderClass(!!errors.type),
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
                              className="mb-2 block text-[13px] font-semibold text-fg-2"
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
                                fieldBorderClass(!!errors.message),
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
                            lecteurs d'écran. Envoyé avec le payload : le
                            serveur (`submitContact`) répond un faux succès
                            silencieux sans aucune écriture s'il est rempli. */}
                        <input
                          id="contact-company-website"
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          aria-hidden="true"
                          className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
                          {...register("company_website")}
                        />

                        {/* Un seul chemin de soumission : `type="submit"` natif
                            → validation Zod (handleSubmit) au clic ET par
                            Entrée dans un champ (§6.2), désactivé pendant
                            `isSubmitting`. */}
                        <Button
                          type="submit"
                          variant="primary"
                          size="lg"
                          className="mt-7 w-full"
                          disabled={isSubmitting}
                        >
                          {contact.form.submitLabel}
                        </Button>

                        {/* État d'erreur global (rate-limit / infra) —
                            rendu UNIQUEMENT en erreur (zéro changement du
                            rendu nominal) : composant `FieldError` existant,
                            classes et palette inchangées. */}
                        {formError !== null ? (
                          <FieldError id="contact-submit" message={formError} />
                        ) : null}

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
