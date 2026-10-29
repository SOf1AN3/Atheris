"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { submitInterview } from "@/actions/interviews";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { InterviewContent, InterviewFormStrings } from "@/content/types";
import { getSlotsForWindow } from "@/lib/slots";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Piste F1 — Prise de rendez-vous (PLAN §3.1 · Q1 · Q3).
   Page publique `/{locale}/entretien/{token}` : coordonnées + agenda des
   3 jours algériens J+1→J+3 (7 créneaux d'1 h, 9 h → 15 h HEURE DE
   L'ENTREPRISE) affichés DANS LE FUSEAU DU CANDIDAT (heures passées
   désactivées). Après validation, le créneau n'est PLUS modifiable (Q3).

   CONTRAT FIGÉ (PLAN §Contrats) :
     submitInterview({ token, firstName, lastName, email, instant,
                       timezone, localDate, localHour })
       → { ok: true } | { ok: false; code: "invalid" | "not_found" | "taken"
                                 | "rate_limited" | "failed" }

   L'agenda est calculé par `@/lib/slots` (module PUR, exécuté ici côté
   CLIENT) à partir des 3 dates algériennes fournies par la page serveur
   (dérivées du `createdAt` en base) ; le serveur revalide le créneau soumis
   (anti-falsification + DST, PLAN §Sécurité 3).
   ========================================================================== */

/** DESIGN §3.1 — courbe UNIQUE du site : aucun spring, aucun easing concurrent. */
const EASE_PREMIUM: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Squelette de chargement : 3 onglets jours × 7 créneaux (Q1 : 9 h → 15 h). */
const SKELETON_DAY_COUNT = 3;
const SKELETON_SLOT_COUNT = 7;

// DESIGN §2.6 — champ 52 px, rayon 12 px, bordure `line-2` ; focus bordure
// volt + ring volt localisé (jamais `outline: none`).
const FIELD_BASE =
  "block h-[52px] w-full rounded-xl border bg-surface px-4 text-[15px] text-fg placeholder:text-faint transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-accent focus:shadow-[0_0_0_3px_rgba(204,255,74,0.16)]";

/* ==========================================================================
   1. Validation locale (RHF + Zod v4).
   ========================================================================== */

/**
 * Schéma Zod **local** : `src/lib/form-schema.ts` appartient à une autre
 * piste et ne doit pas être modifié ici (règle « aucun fichier en double »).
 * Aucune règle n'est dupliquée côté serveur : `submitInterview` applique son
 * propre Zod ; celui-ci sert uniquement au feedback immédiat du candidat.
 * 100 % des messages viennent du dict (`interview.form.errors`) — zéro string
 * en dur.
 */
function createInterviewSchema(errors: InterviewFormStrings["errors"]) {
  return z.object({
    firstName: z.string().trim().min(1, errors.firstNameRequired),
    lastName: z.string().trim().min(1, errors.lastNameRequired),
    // API Zod v4 (identique au schéma contact) : « requis » avant « invalide ».
    email: z
      .string()
      .trim()
      .min(1, errors.emailRequired)
      .pipe(z.email({ error: errors.emailInvalid })),
  });
}

type InterviewFormValues = z.infer<ReturnType<typeof createInterviewSchema>>;

/* ==========================================================================
   2. Modèle de l'agenda (calculé côté client via `@/lib/slots`).
   ========================================================================== */

type Slot = {
  /** Identifiant stable `AAAA-MM-JJ|HH:mm` (clé React + sélection). */
  id: string;
  /** Date LOCALE du candidat (`AAAA-MM-JJ`, fuseau détecté). */
  localDate: string;
  /** Heure LOCALE du candidat (`HH:mm`, fuseau détecté). */
  localHour: string;
  /** Instant absolu ISO UTC — valeur envoyée au serveur. */
  instant: string;
  /** Libellé formaté selon la locale du NAVIGATEUR (jamais en dur). */
  label: string;
  /** Heure déjà passée (`past` calculé par `@/lib/slots`). */
  disabled: boolean;
};

type DayTab = {
  /** `AAAA-MM-JJ` LOCALE du candidat (peut reculer d'un jour — Amériques). */
  date: string;
  /** Onglet formaté `Intl.DateTimeFormat(undefined, { weekday, day, month })`. */
  label: string;
  slots: Slot[];
};

type Agenda = {
  /** IANA détecté (`Intl...resolvedOptions().timeZone`). */
  timeZone: string;
  /** Forme courte affichée au candidat (`timeZoneName: "short"`). */
  timeZoneShort: string;
  days: DayTab[];
};

/** Onglet jour : `Intl.DateTimeFormat(undefined, …)` → fuseau du navigateur. */
function formatDayLabel(dateKey: string): string {
  const segments = dateKey.split("-");
  const date = new Date(
    Date.UTC(Number(segments[0]), Number(segments[1]) - 1, Number(segments[2]), 12),
  );
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** Libellé d'heure : forcé en **24 h sur 2 chiffres** (`09:00`, `22:00`)
 *  pour que toutes les étiquettes de la grille fassent la même largeur,
 *  quelle que soit la locale du navigateur (`hour: "numeric"` produisait
 *  `9:00` selon la locale → colonne désalignée). */
function formatHourLabel(localHour: string): string {
  const [hour, minute] = localHour.split(":");
  const date = new Date(
    Date.UTC(2000, 0, 1, Number(hour ?? "0"), Number(minute ?? "0")),
  );
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Construit l'agenda complet côté CLIENT à partir des 3 dates algériennes
 * transmises par la page serveur : le fuseau détecté, les dates LOCALES du
 * candidat et les libellés dépendent du navigateur — jamais exécuté pendant
 * le rendu serveur (mismatch d'hydratation évité via l'état `agenda`).
 *
 * Les onglets sont regroupés sur `localDate` — JAMAIS « J0/J1/J2 » : selon le
 * fuseau, la date locale d'un créneau peut reculer d'un jour (Amériques) ou
 * avancer (Océanie). Chaque onglet affiche exactement ce que `slots.ts` a
 * calculé pour ses créneaux ; une heure rendue inexistante par un DST n'est
 * tout simplement pas publiée par le module (aucun libellé faux à masquer).
 */
function buildAgenda(dates: string[], now: Date): Agenda {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // `||` (et non `??`) : un fuseau vide exploserait `formatToParts`.
  const timeZone = detected || "UTC";
  const shortParts = new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(now);
  const timeZoneShort =
    shortParts.find((part) => part.type === "timeZoneName")?.value ?? "";

  const days: DayTab[] = [];

  for (const published of getSlotsForWindow(dates, timeZone, now)) {
    const slot: Slot = {
      id: `${published.localDate}|${published.localHour}`,
      localDate: published.localDate,
      localHour: published.localHour,
      instant: published.instant,
      label: formatHourLabel(published.localHour),
      disabled: published.past,
    };

    const day = days.find((tab) => tab.date === slot.localDate);
    if (day === undefined) {
      days.push({
        date: slot.localDate,
        label: formatDayLabel(slot.localDate),
        slots: [slot],
      });
    } else {
      day.slots.push(slot);
    }
  }

  return { timeZone, timeZoneShort, days };
}

/* ==========================================================================
   3. Codes de la Server Action → chaînes du dict (aucune string serveur).
   ========================================================================== */

type Notice = {
  /** Petit titre optionnel (uniquement pour un lien devenu invalide). */
  title: string | null;
  message: string;
};

function noticeForCode(code: string, content: InterviewContent): Notice {
  const errors = content.form.errors;
  switch (code) {
    case "not_found":
      return { title: content.notFoundTitle, message: content.notFoundMessage };
    case "taken":
      return { title: null, message: errors.slotTaken };
    // Contrat PLAN : `rate_limited` — variante `rateLimited` tolérée.
    case "rate_limited":
    case "rateLimited":
      return { title: null, message: errors.rateLimited };
    case "invalid":
    case "failed":
    default:
      return { title: null, message: errors.generic };
  }
}

/** Premier créneau activable dans une direction (flèches, Début/Fin). */
function nextEnabledIndex(slots: Slot[], from: number, step: number): number {
  for (let index = from + step; index >= 0 && index < slots.length; index += step) {
    const slot = slots[index];
    if (slot !== undefined && !slot.disabled) return index;
  }
  return from;
}

/* ==========================================================================
   4. Sous-composants.
   ========================================================================== */

/**
 * Titre à deux voix (DESIGN §2.2.1) : le dict délimite l'accent entre `*`.
 * Même découpe que `SectionHeading`, rendue ici car le H1 vit hors de lui.
 */
function TitleVoice({ text }: { text: string }): ReactNode {
  const parts = text.split("*");
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="voix">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/** Micro-label d'étape : libellé mono + filet pleine largeur (squelette §2.5). */
function StepLabel({ text }: { text: string }): ReactNode {
  return (
    <div className="flex items-center gap-4">
      <p className="micro text-faint">{text}</p>
      <span aria-hidden="true" className="h-px min-w-8 flex-1 bg-line-2" />
    </div>
  );
}

type FieldErrorProps = {
  id: string;
  message: string;
};

/** Message d'erreur 13 px `danger` + icône inline, annoncé via `role="alert"`. */
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
        <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

type TextFieldProps = {
  id: string;
  label: string;
  type: "text" | "email";
  autoComplete: string;
  error: string | undefined;
  registration: UseFormRegisterReturn;
};

function TextField({
  id,
  label,
  type,
  autoComplete,
  error,
  registration,
}: TextFieldProps): ReactNode {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[13px] font-semibold text-fg-2"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        className={cn(
          FIELD_BASE,
          error !== undefined ? "border-danger" : "border-line-2",
        )}
        {...registration}
      />
      {error !== undefined ? <FieldError id={id} message={error} /> : null}
    </div>
  );
}

/** État de chargement de l'agenda (calcul post-hydratation) : sans string. */
function AgendaSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex gap-2">
        {Array.from({ length: SKELETON_DAY_COUNT }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="h-11 w-28 animate-pulse rounded-full bg-white/[0.06]"
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: SKELETON_SLOT_COUNT }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="h-11 animate-pulse rounded-xl bg-white/[0.06]"
          />
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   5. Formulaire.
   ========================================================================== */

type InterviewFormProps = {
  /** Jeton public lu dans l'URL — validé côté serveur avant d'arriver ici. */
  token: string;
  /**
   * 3 dates civiles ALGÉRIENNES (J+1→J+3) dérivées du `createdAt` en base et
   * transmises par la page serveur — la fenêtre n'est JAMAIS recalculée ici
   * (PLAN §Sécurité 1). `string[]` = sérialisable RSC.
   */
  dates: string[];
  /** `SiteContent.interview` : uniquement des strings → sérialisable RSC. */
  content: InterviewContent;
  /**
   * URL de la salle Google Meet lue côté SERVEUR uniquement (`@/lib/meet`,
   * aucun `process.env` côté client) et transmise en prop sérialisable.
   * `null` = aucune salle configurée → le bloc succès reste strictement
   * identique (aucun CTA Meet affiché).
   */
  meetLink: string | null;
};

export function InterviewForm({
  token,
  dates,
  content,
  meetLink,
}: InterviewFormProps): ReactNode {
  const errors = content.form.errors;
  const router = useRouter();
  // Locale lue dans l'URL (jamais de code langue en dur) — le bouton
  // « Fermer » du succès quitte la page vers l'accueil de cette locale.
  const { locale } = useParams<{ locale: string }>();

  // `null` = agenda encore à calculer (jamais pendant le rendu serveur :
  // fuseau et date du navigateur = mismatch d'hydratation garantie sinon).
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [agendaFailed, setAgendaFailed] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sent, setSent] = useState(false);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const {
    register,
    handleSubmit,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm<InterviewFormValues>({
    resolver: zodResolver(createInterviewSchema(errors)),
    mode: "onTouched",
    defaultValues: { firstName: "", lastName: "", email: "" },
  });

  useEffect(() => {
    const next = buildAgenda(dates, new Date());
    // Fuseau illisible ou fenêtre vide : état d'erreur explicite — jamais un
    // squelette « chargement » bloqué à l'infini.
    if (next.days.length === 0) {
      setAgendaFailed(true);
      return;
    }
    setAgenda(next);
  }, [dates]);

  const activeDay = agenda === null ? null : (agenda.days[dayIndex] ?? null);
  const selectedIndex =
    activeDay === null
      ? -1
      : activeDay.slots.findIndex((slot) => slot.id === selectedId);
  const firstEnabledIndex =
    activeDay === null
      ? -1
      : activeDay.slots.findIndex((slot) => !slot.disabled);
  // Tab stop roving : le créneau choisi (ou le premier activable) est seul
  // atteignable au Tab ; les flèches circulent dans le `radiogroup`.
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;

  const handleDayChange = (index: number): void => {
    setDayIndex(index);
    setSlotError(null);
  };

  const handleSlotSelect = (slot: Slot): void => {
    if (slot.disabled) return;
    setSelectedId(slot.id);
    setSlotError(null);
  };

  const handleSlotKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    if (activeDay === null) return;
    const slots = activeDay.slots;
    let target = index;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = nextEnabledIndex(slots, index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = nextEnabledIndex(slots, index, -1);
        break;
      case "Home":
        target = nextEnabledIndex(slots, -1, 1);
        break;
      case "End":
        target = nextEnabledIndex(slots, slots.length, -1);
        break;
      default:
        return;
    }

    event.preventDefault();
    const slot = slots[target];
    if (slot === undefined) return;
    if (!slot.disabled) {
      setSelectedId(slot.id);
      setSlotError(null);
    }
    slotRefs.current[target]?.focus();
  };

  const handleValidSubmit = async (values: InterviewFormValues): Promise<void> => {
    setNotice(null);
    setSlotError(null);

    const slot =
      agenda?.days[dayIndex]?.slots.find((item) => item.id === selectedId) ??
      null;

    if (agenda === null || slot === null) {
      setSlotError(errors.slotRequired);
      return;
    }

    try {
      const result = await submitInterview({
        token,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        instant: slot.instant,
        timezone: agenda.timeZone,
        localDate: slot.localDate,
        localHour: slot.localHour,
      });

      if (result.ok) {
        setSent(true);
        return;
      }

      setNotice(noticeForCode(result.code, content));
      // Créneau réservé entre-temps : la grille reste affichée pour
      // rechoisir SANS recharger la page (PLAN §Sécurité 2).
      if (result.code === "taken") {
        setSelectedId(null);
      }
    } catch {
      // Erreur d'infra propagée par la Server Action : message générique du
      // dict uniquement, aucun détail technique affiché.
      setNotice({ title: null, message: errors.generic });
    }
  };

  // Q3 — le créneau validé n'est PLUS modifiable : « Fermer » ne rouvre
  // aucun formulaire, il quitte la page vers l'accueil de la locale courante.
  const handleClose = (): void => {
    router.push(`/${locale}`);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-14">
      {/* EN-TÊTE — colonne gauche (composition asymétrique, DESIGN §2.5). */}
      <Reveal className="lg:col-span-5">
        <header className="flex flex-col items-start gap-6">
          <Badge variant="pill">{content.badge}</Badge>

          <h1 className="h-display text-[clamp(2.5rem,5vw,4.25rem)] text-fg">
            <TitleVoice text={content.title} />
          </h1>

          <p className="max-w-[46ch] text-[17px] leading-[1.65] text-muted">
            {content.description}
          </p>

          {/* 3 consignes sobres (clés `note*`, PLAN §1.2) : jamais en volt,
              13 px `text-muted` — le 3ᵉ rappelle Meet « 5 min avant · ~30 min
              · créneau non modifiable ». */}
          <div className="flex w-full flex-col gap-3 border-t border-line pt-5">
            <p className="text-[13px] leading-relaxed text-muted">
              {content.noteReferenceTz}
            </p>
            <p className="text-[13px] leading-relaxed text-muted">
              {content.noteNoNightWork}
            </p>
            <p className="text-[13px] leading-relaxed text-muted">
              {content.noteMeetDay}
            </p>
            {/* Fuseau IANA réellement détecté (donnée, jamais une string UI) :
                concrétise « affiché à votre heure locale » du paragraphe 1. */}
            {agenda !== null ? (
              <p className="micro text-faint">
                {agenda.timeZone}
                {agenda.timeZoneShort ? ` · ${agenda.timeZoneShort}` : ""}
              </p>
            ) : (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-32 rounded-full bg-white/10"
              />
            )}
          </div>
        </header>
      </Reveal>

      {/* CARTE — arête lumineuse (DESIGN §2.4). */}
      <Reveal delay={0.08} className="lg:col-span-7">
        <div className="rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-9">
          {/* Sans JS : l'agenda vit côté client (il lit le fuseau du
              navigateur) — jamais un écran blanc. Texte SEUL dans le
              `<noscript>` : tout enfant élémentaire (ex. `<p>`) rendrait le
              contenu différent entre serveur et client → mismatch
              d'hydratation. */}
          <noscript>{content.javascriptRequired}</noscript>

          {/* DESIGN M10 — swap formulaire → succès : opacity + scale 0.96→1,
              300 ms, courbe unique ; `MotionConfig(reducedMotion="user")` au
              root neutralise le transform côté utilisateur sensible. */}
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_PREMIUM }}
                role="status"
                className="flex flex-col items-center py-8 text-center"
              >
                <span
                  aria-hidden="true"
                  className="flex size-16 items-center justify-center rounded-full border border-success/30 bg-success/10"
                >
                  <svg
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
                <h2 className="h-display mt-5 text-[24px] text-fg">
                  {content.form.successTitle}
                </h2>
                <p className="mt-3 max-w-[38ch] text-[15px] text-muted">
                  {content.form.successMessage}
                </p>
                {/* Bloc Meet (optionnel) : phrase du dict avec `{{link}}`
                    remplacé, puis CTA secondaire vers la salle (nouvel
                    onglet) et URL brute copiable en dessous — indispensable
                    pour un candidat sur mobile SANS app Meet. Rendu UNIQUEMENT
                    si la page serveur a fourni un `meetLink`. */}
                {meetLink !== null ? (
                  <div className="mt-6 flex w-full flex-col items-center gap-3">
                    <p className="max-w-[38ch] text-[15px] leading-[1.65] text-muted">
                      {content.meetLink.replace("{{link}}", meetLink)}
                    </p>
                    <a
                      href={meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-line-2 px-5 text-[14px] font-medium text-fg-2 transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-line-3 hover:bg-white/[0.04]"
                    >
                      {content.meetCta}
                    </a>
                    <p className="text-[13px] text-muted break-all">
                      {meetLink}
                    </p>
                  </div>
                ) : null}
                {/* Q3 : aucune action de modification — « Fermer » quitte la
                    page (le créneau validé est immuable, cf. `successMessage`). */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-6 cursor-pointer"
                  onClick={handleClose}
                >
                  {content.form.successAction}
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
                  className="flex flex-col gap-7"
                >
                  <StepLabel text={content.stepProfile} />

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <TextField
                      id="interview-first-name"
                      label={content.form.firstNameLabel}
                      type="text"
                      autoComplete="given-name"
                      error={fieldErrors.firstName?.message}
                      registration={register("firstName")}
                    />
                    <TextField
                      id="interview-last-name"
                      label={content.form.lastNameLabel}
                      type="text"
                      autoComplete="family-name"
                      error={fieldErrors.lastName?.message}
                      registration={register("lastName")}
                    />
                    <div className="sm:col-span-2">
                      <TextField
                        id="interview-email"
                        label={content.form.emailLabel}
                        type="email"
                        autoComplete="email"
                        error={fieldErrors.email?.message}
                        registration={register("email")}
                      />
                    </div>
                  </div>

                  <StepLabel text={content.stepSlot} />

                  {agenda === null || activeDay === null ? (
                    agendaFailed ? (
                      // État d'erreur de l'agenda (fuseau illisible) : message
                      // générique du dict, annoncé — jamais un squelette figé.
                      <p role="alert" className="text-[13px] text-danger">
                        {errors.generic}
                      </p>
                    ) : (
                      <AgendaSkeleton />
                    )
                  ) : (
                    <div className="flex flex-col gap-4">
                      {/* Onglets = dates LOCALES du candidat (regroupées sur
                          `localDate`, jamais « J0/J1/J2 »), labels Intl. */}
                      <div className="hide-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {agenda.days.map((day, index) => (
                          <button
                            key={day.date}
                            type="button"
                            aria-pressed={index === dayIndex}
                            onClick={() => handleDayChange(index)}
                            className={cn(
                              "min-h-11 shrink-0 cursor-pointer rounded-full border px-4 text-[13px] font-medium transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                              index === dayIndex
                                ? "border-fg bg-white/[0.06] text-fg"
                                : "border-line-2 text-faint hover:border-line-3 hover:text-fg-2",
                            )}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>

                      {/* Grille : `radiogroup` + roving tabindex (≥ 44 px). */}
                      <div
                        role="radiogroup"
                        aria-label={content.form.slotLabel}
                        aria-describedby={
                          slotError !== null ? "interview-slot-error" : undefined
                        }
                        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                      >
                        {activeDay.slots.map((slot, index) => {
                          const isSelected = selectedId === slot.id;
                          return (
                            <button
                              key={slot.id}
                              ref={(element) => {
                                slotRefs.current[index] = element;
                              }}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              disabled={slot.disabled}
                              tabIndex={index === tabStopIndex ? 0 : -1}
                              onClick={() => handleSlotSelect(slot)}
                              onKeyDown={(event) =>
                                handleSlotKeyDown(event, index)
                              }
                              className={cn(
                                "min-h-11 rounded-xl border px-2 text-[14px] font-medium transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                                isSelected
                                  ? // SEUL aplat volt « état actif » de la
                                    // page avec le CTA — texte FONCÉ (§2.1).
                                    "cursor-pointer border-accent bg-accent text-ink"
                                  : slot.disabled
                                    ? "cursor-not-allowed border-line bg-white/[0.02] text-faint"
                                    : // BUG signalé : Tailwind Preflight ne
                                      // pose plus `cursor: pointer` sur les
                                      // `<button>` — actifs = pointeur.
                                      "cursor-pointer border-line-2 text-fg-2 hover:border-line-3 hover:bg-white/[0.04]",
                              )}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>

                      {slotError !== null ? (
                        <FieldError id="interview-slot" message={slotError} />
                      ) : null}
                    </div>
                  )}

                  {/* Codes serveur traduits localement (zéro string serveur). */}
                  {notice !== null ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] leading-[1.5] text-danger"
                    >
                      {notice.title !== null ? (
                        <p className="font-semibold">{notice.title}</p>
                      ) : null}
                      <p>{notice.message}</p>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 border-t border-line pt-6">
                    <Button
                      type="submit"
                      size="md"
                      className="w-full sm:w-auto"
                      disabled={isSubmitting}
                      aria-busy={isSubmitting}
                    >
                      {content.form.submitLabel}
                    </Button>
                    <p className="micro text-faint">{content.form.note}</p>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </div>
  );
}
