/**
 * Atheris — créneaux d'entretien (**Lot 2**, PLAN §2 · décisions Q1/Q2) —
 * **module PUR**.
 *
 * Aucun import runtime (ni DB, ni auth, ni API Node) : le même code tourne
 * côté **serveur** (revalidation `isValidSlot` de
 * `src/actions/interviews.ts`, fenêtre lue sur la **ligne en base**) et côté
 * **client** (agenda de `InterviewForm`, fuseau candidat lu via
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`).
 *
 * RÈGLE CENTRALE — toute conversion « heure locale » passe par
 * `Intl.DateTimeFormat` (fuseaux IANA) : `Date#getHours()` / `getDate()`
 * renvoient l'heure **du serveur** et faussent le rendu dès que le candidat
 * n'est pas sur le fuseau hôte (PLAN §Sécurité 3).
 *
 * MODÈLE (règle métier actée — remplace l'ancienne fenêtre glissante
 * « à partir d'aujourd'hui, côté candidat ») :
 * - **Heure de référence = celle de l'entreprise** : la grille est ancrée en
 *   `ANCHOR_TZ` (`Africa/Algiers`, UTC+1 **toute l'année**, sans DST) — mais
 *   l'offset n'est JAMAIS écrit en dur, il est toujours déduit via `Intl`
 *   (`resolveInstant` traite Alger comme n'importe quel fuseau IANA) ;
 * - `HOURS = [9 … 15]` → **7 prises** par jour, fenêtre **9 h → 16 h**
 *   algérienne (Q1 : dernière prise à 15 h, la journée s'arrête à 16 h) ;
 * - `DAYS = 3` : fenêtre **J+1 → J+3 APRÈS la génération du lien**, **figée
 *   à la création** — `getSlotsForWindowDates(createdAt)` dérive les 3 dates
 *   civiles algériennes, `getSlotsForWindow` ne construit plus rien à partir
 *   de « aujourd'hui » : **plus aucune fenêtre glissante** ;
 * - **Affichage = fuseau du CANDIDAT** : `localDate`/`localHour` sont le
 *   rendu `Intl` dans `timezone` (Philippines UTC+8 : 09:00 Algérie →
 *   **16:00** affiché). `instant` reste l'instant absolu = **source de
 *   vérité** (colonne `starts_at`).
 *   ⚠ Fuseau à offset négatif : le créneau algérien du matin peut reculer
 *   d'un **jour civil** côté candidat (Anchorage UTC−9 : 09:00 Algérie =
 *   23:00 la veille) — `localDate` reflète le jour **candidat**, c'est ce
 *   qu'on lui affiche.
 *
 * DST — gardes conservées (Algérie n'a pas d'heure d'été, **le candidat peut
 * en avoir**) :
 * - une heure murale rendue **inexistante** par un trou DST à l'ancrage
 *   n'est jamais publiée (garde `resolveInstant`, rejetée à la revalidation) ;
 * - l'affichage candidat suit mécaniquement son propre passage à l'heure :
 *   décalage d'1 h sur les jours concernés (fenêtres Paris mars / octobre) ;
 * - un **retour à l'heure d'hiver** peut afficher **deux créneaux distincts
 *   sous la même heure murale** (deux instants, un même libellé) : les deux
 *   restent publiés et valides — `isValidSlot` compare donc le **triplet
 *   complet** `(localDate, localHour, instant)`, jamais l'affichage seul.
 *
 * DÉCISION DOCUMENTÉE sur `past` : les heures déjà passées restent dans la
 * fenêtre avec `past: true` (le client les désactive) ; le serveur **ne
 * rejette pas** un créneau passé, il revalide l'*identité* du créneau
 * (dates de la ligne + `hour ∈ HOURS` + instant exact + fuseau). Rejeter le
 * passé côté serveur créerait une course client/serveur à la frontière de
 * l'heure (formulaire rempli à 8 h 59, envoyé à 9 h 00 → refus injustifié).
 *
 * SÉCURITÉ (PLAN §Sécurité 1 & 3) : les `dates` passées à `isValidSlot`
 * proviennent du `createdAt` de la ligne en base (jamais du client) — un
 * candidat ne peut ni allonger la fenêtre, ni choisir un jour hors J+1→J+3.
 */

/** Heures **algériennes** de début de créneau — 7 prises, fenêtre 9 h → 16 h (Q1). */
export const HOURS = [9, 10, 11, 12, 13, 14, 15] as const;

/** Nombre de jours de la fenêtre : J+1, J+2, J+3 **après** la génération du lien. */
export const DAYS = 3;

/** Durée d'un créneau, en minutes (prise à 15 h → fin à 16 h, heure de l'entreprise). */
export const SLOT_DURATION_MINUTES = 60;

/** Fuseau de l'entreprise : heure de **référence** de toute la grille (UTC+1, sans DST). */
export const ANCHOR_TZ = "Africa/Algiers";

/** Fuseau du recruteur — équivalent affiché dans le récapitulatif e-mail. */
export const RECRUITER_TZ = "Africa/Algiers";

/** Un créneau publié par `getSlotsForWindow`. */
export type Slot = {
  /**
   * Date **candidat** (rendue dans son fuseau), format `YYYY-MM-DD`.
   * ⚠ Chez un candidat à offset négatif, elle peut être le jour **précédent**
   * de la date algérienne de l'ancre : c'est le jour affiché à l'écran.
   */
  localDate: string;
  /** Heure **candidat** de début (rendue dans son fuseau), format `HH:mm`. */
  localHour: string;
  /** Instant absolu (ISO 8601 UTC) — vérité stockée en base (`starts_at`). */
  instant: string;
  /** `true` si l'instant est déjà passé au regard de `now` (affichage seul). */
  past: boolean;
};

/** Référence de créneau soumise au serveur (contrat `submitInterview`). */
export type SlotRef = {
  /** Fuseau IANA du candidat dans lequel `localDate`/`localHour` sont rendus. */
  timezone: string;
  /** Rendu candidat du jour (`YYYY-MM-DD`). */
  localDate: string;
  /** Rendu candidat de l'heure (`HH:mm`). */
  localHour: string;
  /** Instant absolu revendiqué (ISO 8601) — doit être exactement publié. */
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

/** Date civile (jour complet, sans composant horaire) — sous-ensemble de `ZonedParts`. */
type CivilDate = Pick<ZonedParts, "year" | "month" | "day">;

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

/** Instant (ms UTC) de **minuit** d'une date civile (mêmes conventions que `wallMs`). */
function civilMs(civil: CivilDate): number {
  return Date.UTC(civil.year, civil.month - 1, civil.day);
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
 * Dans ce module, la résolution est systématiquement faite dans `ANCHOR_TZ`
 * (Alger, sans DST) : la garde reste active par principe, jamais contournée.
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

/**
 * Valide une date civile `YYYY-MM-DD` et la décompose — **toute** valeur
 * hors format ou hors calendrier renvoie `null` (défaut sûr).
 *
 * Round-trip calendrier : `2026-02-31` se projette sur mars via `Date.UTC`
 * → rejeté. Les années < 100 sont aussi écartées (décalage 1900+ de
 * `Date.UTC`) : hors sujet pour une fenêtre du XXIᵉ siècle.
 */
function parseCivilDate(value: unknown): CivilDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** `CivilDate` → `YYYY-MM-DD`. */
function civilToIso(civil: CivilDate): string {
  return `${pad(civil.year, 4)}-${pad(civil.month, 2)}-${pad(civil.day, 2)}`;
}

// ---------------------------------------------------------------------------
// API publique.
// ---------------------------------------------------------------------------

/**
 * Les `DAYS` dates civiles **algériennes** de la fenêtre, à partir de la
 * génération du lien : **J+1, J+2, J+3** — le jour de génération n'en fait
 * jamais partie (fenêtre figée à la création, PLAN §2 · Q2).
 *
 * Le jour de référence est projeté dans `ANCHOR_TZ` **via `Intl`** : une
 * génération à 23 h 30 UTC appartient déjà au lendemain côté algérien
 * (UTC+1) et déplace la fenêtre — le décalage n'est jamais écrit en dur.
 * Les avances se font en calendrier UTC pur (86 400 000 ms : une date
 * civile avance toujours d'un jour), gérant naturellement les chevauchements
 * de mois et d'année (31 jan → 1 fév, 30 déc → 1 jan).
 *
 * @param createdAt Instant de création du lien (`Date` Drizzle ou ISO 8601).
 * @returns `DAYS` chaînes `YYYY-MM-DD` croissantes ; **`[]`** si `createdAt`
 *   est illisible — défaut sûr : sans dates, aucune fenêtre, donc aucun
 *   créneau reconnu ni côté page, ni côté revalidation.
 */
export function getSlotsForWindowDates(createdAt: Date | string): string[] {
  const ms =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === "string"
        ? Date.parse(createdAt)
        : NaN; // entrée forgée (ni `Date` ni string) : traitée comme illisible
  if (!Number.isFinite(ms)) return [];

  const today = zonedParts(ms, ANCHOR_TZ); // jour CIVIL algérien, déduit via Intl
  if (today === null) return [];

  const base = civilMs(today);
  const dates: string[] = [];
  for (let offset = 1; offset <= DAYS; offset += 1) {
    const civil = new Date(base + offset * 86_400_000);
    dates.push(
      civilToIso({
        year: civil.getUTCFullYear(),
        month: civil.getUTCMonth() + 1,
        day: civil.getUTCDate(),
      }),
    );
  }
  return dates;
}

/**
 * Grille complète des créneaux : dates civiles **algériennes** × heures
 * **algériennes** → instant absolu → rendu dans le fuseau du **candidat**.
 *
 * @param dates Dates civiles de la fenêtre (`YYYY-MM-DD`, fournies par la
 *   page ou par la ligne en base via `getSlotsForWindowDates`) — triées,
 *   dédoublonnées ; toute valeur illisible annule la grille.
 * @param timezone Fuseau IANA du candidat (ex. `Asia/Manila`).
 * @param now Instant de référence (sert **uniquement** à `past` : la
 *   fenêtre ne dérive plus de l'horloge — elle est figée).
 * @returns Les `dates × HOURS.length` créneaux, jours algériens croissants
 *   puis heures croissantes. **`[]`** si `timezone` est inconnue, `now`
 *   illisible ou fenêtre illisible : défaut sûr (aucun créneau proposé
 *   plutôt qu'une heure fausse).
 */
export function getSlotsForWindow(
  dates: readonly string[],
  timezone: string,
  now: Date,
): Slot[] {
  // --- Garde d'entrée (défaut sûr, sans jamais lever d'exception) --------
  // `Array.isArray` est la seule garde qui écarte tout non-tableau (entrée
  // forgée : `null`, objet…) qui ferait thrower la boucle `for…of`.
  if (!Array.isArray(dates)) return [];
  if (typeof timezone !== "string" || timezone.length === 0) return [];
  if (partsFormatter(timezone) === null) return []; // fuseau IANA inconnu d'ICU
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return [];
  const reference = now.getTime();
  const fenetre: readonly unknown[] = dates;

  // --- Fenêtre : dates civiles validées, dédoublonnées, ordonnées --------
  const seen = new Set<string>();
  const civils: CivilDate[] = [];
  for (const value of fenetre) {
    const civil = parseCivilDate(value);
    if (civil === null) return []; // fenêtre illisible → défaut sûr
    const iso = civilToIso(civil);
    if (seen.has(iso)) continue; // une date transmise 2× ne duplique pas son bloc
    seen.add(iso);
    civils.push(civil);
  }
  if (civils.length === 0) return [];
  civils.sort((a, b) => civilMs(a) - civilMs(b)); // contrat « jour puis heure »

  // --- Grille : date algérienne × heure algérienne → instant → rendu -----
  const slots: Slot[] = [];
  for (const civil of civils) {
    for (const hour of HOURS) {
      // Résolution dans l'ancre (pas de DST à Alger, garde conservée) :
      // un trou DST à l'ancrage supprime purement le créneau, il n'est pas
      // publié → `isValidSlot` le refusera au point 1.
      const instant = resolveInstant(ANCHOR_TZ, civil.year, civil.month, civil.day, hour, 0);
      if (instant === null) continue;

      // Rendu **dans le fuseau du candidat** : c'est ce qu'on lui affiche.
      const local = zonedParts(instant, timezone);
      if (local === null) return []; // fuseau devenu illisible → défaut sûr

      slots.push({
        localDate: civilToIso(local),
        localHour: `${pad(local.hour, 2)}:${pad(local.minute, 2)}`,
        instant: new Date(instant).toISOString(),
        past: instant < reference,
      });
    }
  }
  return slots;
}

/**
 * Revalidation **serveur** d'un créneau soumis par le client
 * (anti-falsification — PLAN §Sécurité 1 & 3).
 *
 * Quatre contrôles indissociables :
 * 1. le couple `(localDate, localHour)` doit être **publié** dans la grille
 *    des `dates` fournies (les formats sont aussi re-vérifiés) ;
 * 2. `instant` doit correspondre **exactement** à ce créneau affiché
 *    (comparaison de l'instant absolu, pas de la chaîne : toute valeur
 *    forgée — ±1 s ou ±1 h — est rejetée) ;
 * 3. le fuseau doit être IANA valide et l'heure ne doit pas être rendue
 *    inexistante par un changement d'heure (un trou DST n'est jamais publié
 *    → refusé au point 1) ;
 * 4. les `dates` doivent être lisibles — elles viennent du **`createdAt` de
 *    la ligne en base** : le client ne choisit ni le jour, ni l'étendue.
 *
 * `now` est optionnel **uniquement pour les tests** (fenêtre figée) : en
 * production le serveur utilise l'heure courante, jamais une valeur client.
 * Un `now` illisible fait échouer la revalidation (horloge serveur devenue
 * fiable = refus net plutôt qu'acceptation aveugle).
 *
 * Le rapprochement se fait sur le **triplet complet** (`some`, pas `find`) :
 * lors d'un retour d'heure côté candidat, deux créneaux peuvent afficher la
 * même heure murale — chacun reste reconnu à son propre instant.
 *
 * @returns `false` dès qu'un élément est absent ou incohérent (aucun détail
 *   renvoyé au client : le code métier reste `invalid`).
 */
export function isValidSlot(
  ref: SlotRef,
  dates: readonly string[],
  now: Date = new Date(),
): boolean {
  if (typeof ref !== "object" || ref === null) return false;
  const { timezone, localDate, localHour, instant } = ref;
  if (typeof timezone !== "string" || timezone.length === 0) return false;
  if (typeof localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return false;
  if (typeof localHour !== "string" || !/^\d{2}:\d{2}$/.test(localHour)) return false;
  if (typeof instant !== "string") return false;

  const instantMs = Date.parse(instant);
  if (!Number.isFinite(instantMs)) return false;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;

  return getSlotsForWindow(dates, timezone, now).some(
    (slot) =>
      slot.localDate === localDate &&
      slot.localHour === localHour &&
      Date.parse(slot.instant) === instantMs,
  );
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
