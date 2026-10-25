/**
 * Atheris — créneaux d'entretien (PLAN §2.1 · §Contrats inter-pistes) —
 * **module PUR**.
 *
 * Aucun import runtime (ni DB, ni auth, ni API Node) : le même code tourne
 * côté **serveur** (revalidation `isValidSlot` dans
 * `src/actions/interviews.ts`) et côté **client** (agenda de
 * `InterviewForm`, fuseau lu via
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`).
 *
 * RÈGLE CENTRALE — toute conversion « heure locale » passe par
 * `Intl.DateTimeFormat` (fuseaux IANA) : `Date#getHours()` / `getDate()`
 * renvoient l'heure **du serveur** et faussent le rendu dès que le candidat
 * n'est pas sur le fuseau hôte (PLAN §2.1 · §Sécurité 3).
 *
 * Fenêtre proposée (hypothèses actées du PLAN) :
 * - `DAYS = 3` jours **à partir d'aujourd'hui** (date locale du candidat) ;
 * - `HOURS = 9…19` → fenêtre 9 h – 20 h, créneaux de
 *   `SLOT_DURATION_MINUTES` minutes alignés sur l'heure pile ;
 * - une heure rendue **inexistante** par un passage à l'heure d'été
 *   (« trou DST ») n'est **pas** générée et est rejetée par `isValidSlot` ;
 * - une heure **ambiguë** (double passage à l'heure d'hiver) est publiée
 *   exactement UNE fois (l'instant retenu par `resolveInstant`, déterministe)
 *   : la revalidation compare l'instant, jamais la seule heure murale.
 *
 * DÉCISION DOCUMENTÉE sur `past` : les heures déjà passées restent dans la
 * fenêtre avec `past: true` (le client les désactive) ; le serveur **ne
 * rejette pas** un créneau passé, il revalide l'*identité* du créneau
 * (fenêtre 3 jours + hour ∈ HOURS + instant exact + DST). Rejeter le passé
 * côté serveur créer une course client/serveur à la frontière de l'heure
 * (formulaire rempli à 8 h 59, envoyé à 9 h 00 → refus injustifié).
 */

/** Heures locales de début de créneau (11 créneaux : 9 h → 19 h inclus). */
export const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

/** Nombre de jours de la fenêtre (aujourd'hui + 2). */
export const DAYS = 3;

/** Durée d'un créneau, en minutes (fenêtre 9 h → 20 h). */
export const SLOT_DURATION_MINUTES = 60;

/** Fuseau du recruteur — équivalent affiché dans le récapitulatif e-mail. */
export const RECRUITER_TZ = "Africa/Algiers";

/** Un créneau publié par `getSlotsForTimezone`. */
export type Slot = {
  /** Date locale du candidat, format `YYYY-MM-DD`. */
  localDate: string;
  /** Heure locale de début, format `HH:mm`. */
  localHour: string;
  /** Instant absolu (ISO 8601 UTC) — vérité stockée en base (`starts_at`). */
  instant: string;
  /** `true` si l'instant est déjà passé au regard de `now` (affichage seul). */
  past: boolean;
};

/** Référence de créneau soumise au serveur (contrat `submitInterview`). */
export type SlotRef = {
  timezone: string;
  localDate: string;
  localHour: string;
  instant: string;
};

// ---------------------------------------------------------------------------
// Lectures IANA (privées).
// ---------------------------------------------------------------------------

/** Composants de calendrier locaux, tous entiers. */
type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * `Intl.DateTimeFormat` mis en cache par fuseau (les instances sont lourdes à
 * construire). `null` en cache = fuseau IANA inconnu (jamais retenté deux fois).
 */
const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

/**
 * Formateur de décomposition horaire dans `timezone`.
 *
 * `hourCycle: "h23"` (et non `hour12: false`) garantit des heures `00`–`23` :
 * le repli `24:00` minuit casserait l'arithmétique de fenêtre.
 *
 * @returns `null` si le fuseau est inconnu d'ICU (jamais d'exception levée).
 */
function partsFormatter(timezone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timezone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    // Fuseau IANA absent de la table ICU : traité comme « aucun créneau ».
    formatter = null;
  }
  formatterCache.set(timezone, formatter);
  return formatter;
}

/**
 * Composants **locaux** d'un instant dans `timezone` (jamais `Date#getHours`).
 *
 * @returns `null` si `ms` est illisible ou le fuseau inconnu.
 */
function zonedParts(ms: number, timezone: string): ZonedParts | null {
  if (!Number.isFinite(ms)) return null;
  const formatter = partsFormatter(timezone);
  if (formatter === null) return null;

  const parts = formatter.formatToParts(new Date(ms));
  const read = (type: string): string => {
    const found = parts.find((part) => part.type === type);
    return found === undefined ? "" : found.value;
  };

  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  const second = Number(read("second"));
  const values = [year, month, day, hour, minute, second];
  if (!values.every((value) => Number.isInteger(value))) return null;
  return { year, month, day, hour, minute, second };
}

/**
 * Instant (ms UTC) correspondant à une heure murale **locale**.
 *
 * Contient la correction de fuseau : `Date.UTC(year, month-1, …)` interprète
 * la valeur comme si elle était déjà en UTC (années < 100 écartées : la
 * fenêtre ne sort jamais du XXIᵉ siècle).
 */
function wallMs(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
}

/**
 * Décalage UTC (ms) observé à un instant donné — déduit de la projection
 * locale. Tous les offsets IANA modernes sont des multiples de 60 s : les
 * instants manipulés ici restent alignés sur la minute.
 *
 * @returns `null` si le fuseau est inconnu.
 */
function offsetMs(ms: number, timezone: string): number | null {
  const parts = zonedParts(ms, timezone);
  if (parts === null) return null;
  return wallMs(parts) - ms;
}

/**
 * Résout l'instant absolu (ms UTC) d'une heure murale locale **exacte**.
 *
 * Algorithme à passes (correction itérative du décalage) :
 * - heure ordinaire → convergé au premier passage ;
 * - heure **ambiguë** (retour à l'heure d'hiver) → la première solution
 *   vérifiée est retenue, déterministe entre appelant et revalidation ;
 * - heure **inexistante** (trou DST, ex. 02:30 le dimanche du printemps à
 *   `Europe/Paris`) → aucune passe ne se reprojette sur l'heure murale
 *   demandée → `null` : le créneau n'existe pas, il n'est pas publié.
 *
 * @returns L'instant en ms, ou `null` (tz inconnu ou trou DST).
 */
function resolveInstant(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number | null {
  const target = wallMs({ year, month, day, hour, minute, second: 0 });
  let candidate = target;
  for (let pass = 0; pass < 4; pass += 1) {
    const offset = offsetMs(candidate, timezone);
    if (offset === null) return null;
    candidate = target - offset;
    const projected = zonedParts(candidate, timezone);
    if (projected !== null && wallMs(projected) === target) return candidate;
  }
  return null;
}

/** Zéro-paddage (année sur 4 chiffres, sinon sur 2). */
function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

// ---------------------------------------------------------------------------
// API publique.
// ---------------------------------------------------------------------------

/**
 * Fenêtre complète des créneaux, calculée **dans `timezone`**.
 *
 * @param timezone Fuseau IANA du candidat (ex. `Europe/Paris`).
 * @param now Instant de référence (détermine « aujourd'hui » et `past`).
 * @returns Les `DAYS × HOURS.length` créneaux, jours croissants puis heures
 *   croissantes. **`[]`** si `timezone` est inconnue ou `now` illisible :
 *   défaut sûr (aucun créneau proposé plutôt qu'une heure fausse).
 */
export function getSlotsForTimezone(timezone: string, now: Date): Slot[] {
  if (typeof timezone !== "string" || timezone.length === 0) return [];
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return [];
  const reference = now.getTime();

  const today = zonedParts(reference, timezone);
  if (today === null) return [];

  const slots: Slot[] = [];
  for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
    // Avance date locale : calcul en UTC pur (aucun DST sur les dates civiles).
    const dayStart = Date.UTC(today.year, today.month - 1, today.day) + dayIndex * 86_400_000;
    const civil = new Date(dayStart);
    const year = civil.getUTCFullYear();
    const month = civil.getUTCMonth() + 1;
    const day = civil.getUTCDate();
    const localDate = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

    for (const hour of HOURS) {
      const instant = resolveInstant(timezone, year, month, day, hour, 0);
      // Trou DST : le créneau n'existe pas localement → non publié.
      if (instant === null) continue;
      slots.push({
        localDate,
        localHour: `${pad(hour, 2)}:00`,
        instant: new Date(instant).toISOString(),
        past: instant < reference,
      });
    }
  }
  return slots;
}

/**
 * Revalidation **serveur** d'un créneau soumis par le client
 * (anti-falsification + DST — PLAN §Sécurité 3).
 *
 * Trois contrôles indissociables :
 * 1. le couple `(localDate, localHour)` doit être **publié** dans la fenêtre
 *    3 jours × `HOURS` du fuseau reçu (les formats sont aussi re-vérifiés) ;
 * 2. `instant` doit correspondre **exactement** à ce créneau (comparaison de
 *    l'instant absolu, pas de la chaîne : toute valeur forgée est rejetée) ;
 * 3. le fuseau doit être IANA valide et l'heure ne doit pas être rendue
 *    inexistante par un changement d'heure (un trou DST n'est jamais publié
 *    → refusé au point 1).
 *
 * `now` est optionnel **uniquement pour les tests** (fenêtre figée) : en
 * production le serveur utilise l'heure courante, jamais une valeur client.
 *
 * @returns `false` dès qu'un élément est absent ou incohérent (aucun détail
 *   renvoyé au client : le code métier reste `invalid`).
 */
export function isValidSlot(ref: SlotRef, now: Date = new Date()): boolean {
  if (typeof ref !== "object" || ref === null) return false;
  const { timezone, localDate, localHour, instant } = ref;
  if (typeof timezone !== "string" || timezone.length === 0) return false;
  if (typeof localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return false;
  if (typeof localHour !== "string" || !/^\d{2}:\d{2}$/.test(localHour)) return false;
  if (typeof instant !== "string") return false;

  const instantMs = Date.parse(instant);
  if (!Number.isFinite(instantMs)) return false;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;

  const published = getSlotsForTimezone(timezone, now).find(
    (slot) => slot.localDate === localDate && slot.localHour === localHour,
  );
  if (published === undefined) return false;
  return Date.parse(published.instant) === instantMs;
}

/**
 * Phrase lisible pour le récapitulatif e-mail : heure du **candidat** puis
 * équivalent `Africa/Algiers` du **recruteur** (PLAN : le mail affiche les
 * deux).
 *
 * @param instant Instant absolu (ISO 8601).
 * @param tz Fuseau IANA du **candidat** (défaut `Africa/Algiers`, cas algérien
 *   → une seule occurrence, les deux zones sont alors identiques).
 * @returns Jamais d'exception : un instant ou un fuseau illisible est renvoyé
 *   tel quel / projeté en ISO UTC (le récapitulatif reste envoyable).
 *
 * @example toRecruiterTime("2026-10-27T09:00:00.000Z", "Europe/Paris")
 * // → "mardi 27 octobre 2026 à 10:00 (Europe/Paris) — mardi 27 octobre 2026 à 10:00 (Africa/Algiers)"
 * //   Alger est en UTC+1 TOUTE L'ANNÉE et Paris y est revenu le 25 octobre :
 * //   l'écart est donc de 0 h ici, d'1 h seulement en été (UTC+2 côté Paris).
 */
export function toRecruiterTime(instant: string, tz: string = RECRUITER_TZ): string {
  if (typeof instant !== "string") return "";
  const instantMs = Date.parse(instant);
  if (!Number.isFinite(instantMs)) return instant;

  const candidate = formatStamp(instantMs, typeof tz === "string" ? tz : RECRUITER_TZ);
  if (candidate === null) return new Date(instantMs).toISOString();

  const label = typeof tz === "string" && tz.length > 0 ? tz : RECRUITER_TZ;
  if (label === RECRUITER_TZ) return `${candidate} (${label})`;

  const recruiter = formatStamp(instantMs, RECRUITER_TZ);
  if (recruiter === null) return `${candidate} (${label})`;
  return `${candidate} (${label}) — ${recruiter} (${RECRUITER_TZ})`;
}

/** Format français « mardi 27 octobre 2026 à 10:00 » dans `timezone`. */
function formatStamp(ms: number, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}
