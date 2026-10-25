/**
 * Atheris — tests unitaires du module de créneaux d'entretien
 * (PLAN §4 « Unitaires (vitest) : `slots.ts` sur 3 fuseaux » · §Sécurité 3).
 *
 * 100 % pur : aucune DB, aucun appel réseau, aucune donnée mockée — uniquement
 * `Intl` et du calcul de dates. Toutes les dates sont **figées** en fixtures
 * ISO explicites : aucun `new Date()` sans argument dans les assertions, donc
 * aucun test qui « casse l'an prochain ».
 *
 * Import relatif volontaire (pas d'alias `@/`) : le fichier tourne sous
 * `vitest run` sans configuration de résolution d'alias — même convention que
 * `src/lib/commission.test.ts` et `src/lib/prospect-dedup.test.ts`.
 *
 * Fuseaux couverts (PLAN §4) :
 * - `Africa/Algiers` — UTC+1 **sans** heure d'été ;
 * - `Europe/Paris` — UTC+1 / UTC+2 **avec** passage à l'heure (dernier
 *   dimanche de mars et d'octobre) ;
 * - `America/Los_Angeles` — UTC−8 / UTC−7 : DST **et** décalage sur la nuit
 *   locale (fenêtre du matin déjà avancée côté UTC).
 *
 * HORS PÉRIMÈTRE (signalé au LEAD) : la « Zod des 2 actions » et la limite
 * de 5 Mo ne sont **pas** testées ici — `applySchema`, `submitInterviewSchema`
 * et `MAX_CV_BYTES` sont des valeurs runtime internes à des fichiers
 * `"use server"`, qui n'autorisent que l'export de fonctions async : les
 * exposer casserait `next build`. Aucune extraction n'a donc été faite.
 */

import { describe, expect, it } from "vitest";

import {
  DAYS,
  getSlotsForTimezone,
  HOURS,
  isValidSlot,
  RECRUITER_TZ,
  SLOT_DURATION_MINUTES,
  toRecruiterTime,
  type Slot,
  type SlotRef,
} from "./slots";

// ---------------------------------------------------------------------------
// Fixtures — instants FIGÉS (aucune dépendance à l'horloge système).
// ---------------------------------------------------------------------------

/** Dimanche 15 mars 2026, 13 h 00 à Alger (UTC+1, sans DST). */
const ALGIERS_NOW = new Date("2026-03-15T12:00:00.000Z");

/** Mardi 20 janvier 2026, 13 h 00 à Paris (UTC+1, plein hiver). */
const PARIS_WINTER_NOW = new Date("2026-01-20T12:00:00.000Z");

/** Vendredi 10 juillet 2026, 05 h 00 à Los Angeles (UTC−7, plein été). */
const LA_SUMMER_NOW = new Date("2026-07-10T12:00:00.000Z");

/** Vendredi 10 juin 2026, 14 h 00 à Paris (UTC+2) — référence d'assertions. */
const PARIS_SUMMER_NOW = new Date("2026-06-10T12:00:00.000Z");

/** Vendredi 27 mars 2026, 13 h 00 à Paris : fenêtre **chevauchant** le
 *  passage à l'heure d'été (dimanche 29 mars 2026, dernier dimanche de mars). */
const SPRING_NOW = new Date("2026-03-27T12:00:00.000Z");

/** Dimanche 29 mars 2026, 01 h 30 à Paris — matin même du trou DST. */
const SPRING_DAY_NOW = new Date("2026-03-29T00:30:00.000Z");

/** Vendredi 23 octobre 2026, 14 h 00 à Paris : fenêtre **chevauchant** le
 *  passage à l'heure d'hiver (dimanche 25 octobre 2026, dernier dimanche
 *  d'octobre). */
const FALL_NOW = new Date("2026-10-23T12:00:00.000Z");

/** Dimanche 25 octobre 2026, 02 h 30 à Paris — `now` posé **dans** l'heure
 *  locale répétée (02:30 CEST puis 02:30 CET). */
const FALL_AMBIGUOUS_NOW = new Date("2026-10-25T00:30:00.000Z");

/** Samedi 24 octobre 2026, 23 h 00 à Alger — samedi soir. */
const SATURDAY_NIGHT_NOW = new Date("2026-10-24T22:00:00.000Z");

/** Fenêtres de référence : `(fuseau, now)` figés, repris dans plusieurs blocs. */
const FENETRES: ReadonlyArray<{ tz: string; now: Date }> = [
  { tz: "Africa/Algiers", now: ALGIERS_NOW },
  { tz: "Europe/Paris", now: PARIS_WINTER_NOW },
  { tz: "America/Los_Angeles", now: LA_SUMMER_NOW },
  // Fenêtres qui chevauchent un changement d'heure (Europe/Paris).
  { tz: "Europe/Paris", now: SPRING_NOW },
  { tz: "Europe/Paris", now: FALL_NOW },
];

// ---------------------------------------------------------------------------
// Aides de test — projections **indépendantes** du module sous test (mêmes
// primitives `Intl`, mais jamais les fonctions de `slots.ts`).
// ---------------------------------------------------------------------------

/** `instant` ISO → composants locaux `"YYYY-MM-DD HH:mm"` dans `timezone`. */
function projectLocal(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(Date.parse(instant)));
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
}

/** Dates locales distinctes, dans l'ordre d'apparition. */
function datesOf(slots: Slot[]): string[] {
  const dates: string[] = [];
  for (const slot of slots) {
    if (!dates.includes(slot.localDate)) dates.push(slot.localDate);
  }
  return dates;
}

/** Les 11 heures attendues, formatées comme le module : `"09:00"` → `"19:00"`. */
function expectedHours(): string[] {
  return HOURS.map((hour) => `${String(hour).padStart(2, "0")}:00`);
}

/** Instant publié d'un créneau, ou `undefined` (échec d'assertion plus bas). */
function instantOf(slots: Slot[], localDate: string, localHour: string): string | undefined {
  return slots.find(
    (slot) => slot.localDate === localDate && slot.localHour === localHour,
  )?.instant;
}

/** Comme `instantOf`, mais échoue explicitement si le créneau n'est pas publié. */
function requireInstant(slots: Slot[], localDate: string, localHour: string): string {
  const instant = instantOf(slots, localDate, localHour);
  if (instant === undefined) throw new Error(`Créneau non publié : ${localDate} ${localHour}`);
  return instant;
}

/** Toutes les heures `HH:MM` lues dans une chaîne affichée (ordre du texte). */
function timesOf(text: string): string[] {
  return text.match(/\d{1,2}:\d{2}/g) ?? [];
}

/** Heure entière d'une chaîne `HH:MM`. */
function hourOf(time: string): number {
  return Number(time.split(":")[0]);
}

// ---------------------------------------------------------------------------
// Constantes de la fenêtre (hypothèses actées du PLAN, §2.1).
// ---------------------------------------------------------------------------

describe("constantes de la fenêtre", () => {
  it("HOURS = 11 créneaux horaires, de 9 h à 19 h inclus", () => {
    expect(HOURS).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(HOURS).toHaveLength(11);
  });

  it("DAYS = 3 · SLOT_DURATION_MINUTES = 60 (fenêtre 9 h → 20 h) · recruteur à Alger", () => {
    expect(DAYS).toBe(3);
    expect(SLOT_DURATION_MINUTES).toBe(60);
    expect(RECRUITER_TZ).toBe("Africa/Algiers");
  });
});

// ---------------------------------------------------------------------------
// getSlotsForTimezone — 3 jours × 11 créneaux sur les 3 fuseaux.
// ---------------------------------------------------------------------------

describe("getSlotsForTimezone — fenêtre de base (3 fuseaux)", () => {
  it("Africa/Algiers (UTC+1, sans DST) : 33 créneaux sur 3 jours consécutifs", () => {
    const slots = getSlotsForTimezone("Africa/Algiers", ALGIERS_NOW);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(slots)).toEqual(["2026-03-15", "2026-03-16", "2026-03-17"]);
    // Contrôle d'offset indépendant : 09:00 local = 08:00 UTC (UTC+1).
    expect(requireInstant(slots, "2026-03-15", "09:00")).toBe("2026-03-15T08:00:00.000Z");
  });

  it("Europe/Paris (avec DST) : 33 créneaux sur 3 jours consécutifs", () => {
    const slots = getSlotsForTimezone("Europe/Paris", PARIS_WINTER_NOW);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(slots)).toEqual(["2026-01-20", "2026-01-21", "2026-01-22"]);
    // Contrôle d'offset indépendant : 09:00 local = 08:00 UTC (UTC+1, hiver).
    expect(requireInstant(slots, "2026-01-20", "09:00")).toBe("2026-01-20T08:00:00.000Z");
  });

  it("America/Los_Angeles (UTC−7 en été) : 33 créneaux sur 3 jours consécutifs", () => {
    const slots = getSlotsForTimezone("America/Los_Angeles", LA_SUMMER_NOW);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(slots)).toEqual(["2026-07-10", "2026-07-11", "2026-07-12"]);
    // Contrôle d'offset indépendant : 09:00 local = 16:00 UTC (UTC−7) — le
    // décalage nocturne se lit ici, la matinée locale avance sur l'UTC.
    expect(requireInstant(slots, "2026-07-10", "09:00")).toBe("2026-07-10T16:00:00.000Z");
  });

  it("chaque jour publie exactement les 11 heures de HOURS, dans l'ordre", () => {
    for (const { tz, now } of FENETRES) {
      const slots = getSlotsForTimezone(tz, now);
      expect(slots).toHaveLength(DAYS * HOURS.length);
      for (const date of datesOf(slots)) {
        expect(
          slots.filter((slot) => slot.localDate === date).map((slot) => slot.localHour),
        ).toEqual(expectedHours());
      }
    }
  });

  it("tri : jours croissants puis heures croissantes, formats conformes, aucun doublon", () => {
    const slots = getSlotsForTimezone("Africa/Algiers", ALGIERS_NOW);

    // Regroupement jour-major : 3 blocs successifs de 11 heures identiques.
    expect(slots.map((slot) => slot.localHour)).toEqual([
      ...expectedHours(),
      ...expectedHours(),
      ...expectedHours(),
    ]);
    // Un couple (date, heure) n'est jamais publié deux fois…
    expect(new Set(slots.map((slot) => `${slot.localDate} ${slot.localHour}`)).size).toBe(
      slots.length,
    );
    // … et jamais deux fois le même instant absolu.
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);

    for (const slot of slots) {
      expect(slot.localHour).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.localHour.endsWith(":00")).toBe(true);
      // Instant toujours en ISO 8601 UTC millimétrique (vérité `starts_at`).
      expect(slot.instant).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it("aller-retour localDate/localHour → instant → localDate/localHour : identique sur les 3 fuseaux", () => {
    for (const { tz, now } of FENETRES) {
      for (const slot of getSlotsForTimezone(tz, now)) {
        expect(projectLocal(slot.instant, tz)).toBe(`${slot.localDate} ${slot.localHour}`);
      }
    }
  });

  it("fuseau vide ou `now` illisible → [] (défaut sûr, sans throw)", () => {
    expect(() => getSlotsForTimezone("", ALGIERS_NOW)).not.toThrow();
    expect(getSlotsForTimezone("", ALGIERS_NOW)).toEqual([]);

    expect(() => getSlotsForTimezone("Europe/Paris", new Date("invalid"))).not.toThrow();
    expect(getSlotsForTimezone("Europe/Paris", new Date("invalid"))).toEqual([]);

    // Entrée forgée : `now` n'est même pas un `Date`.
    expect(getSlotsForTimezone("Europe/Paris", null as unknown as Date)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Passage à l'heure — Europe/Paris (dernier dimanche de mars / d'octobre).
// ---------------------------------------------------------------------------

describe("passage à l'heure — Europe/Paris", () => {
  it("printemps (dim. 29 mars 2026) : 33 créneaux, aucun doublon ni manquant", () => {
    const slots = getSlotsForTimezone("Europe/Paris", SPRING_NOW);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(slots)).toEqual(["2026-03-27", "2026-03-28", "2026-03-29"]);
    // Jour du changement d'heure : les 11 heures 9 h → 19 h sont présentes.
    expect(
      slots.filter((slot) => slot.localDate === "2026-03-29").map((slot) => slot.localHour),
    ).toEqual(expectedHours());
    // Aucun instant en double (le trou DST ne concerne pas la plage 9-19).
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    // Aller-retour sur toute la fenêtre : chaque créneau se reprojette
    // exactement sur le couple affiché (heure locale cohérente).
    for (const slot of slots) {
      expect(projectLocal(slot.instant, "Europe/Paris")).toBe(
        `${slot.localDate} ${slot.localHour}`,
      );
    }
  });

  it("printemps : 28 mars 09:00 → 08:00Z puis 29 mars 09:00 → 07:00Z (fenêtre de 23 h)", () => {
    const slots = getSlotsForTimezone("Europe/Paris", SPRING_NOW);
    const avant = requireInstant(slots, "2026-03-28", "09:00");
    const apres = requireInstant(slots, "2026-03-29", "09:00");

    expect(avant).toBe("2026-03-28T08:00:00.000Z"); // UTC+1 — heure d'hiver
    expect(apres).toBe("2026-03-29T07:00:00.000Z"); // UTC+2 — heure d'été
    // Une heure murale identique avance d'1 h en absolu : journée de 23 h.
    expect(Date.parse(apres) - Date.parse(avant)).toBe(23 * 3_600_000);
  });

  it("automne (dim. 25 octobre 2026) : 33 créneaux, journée de 25 h sans doublon", () => {
    const slots = getSlotsForTimezone("Europe/Paris", FALL_NOW);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(slots)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(
      slots.filter((slot) => slot.localDate === "2026-10-25").map((slot) => slot.localHour),
    ).toEqual(expectedHours());
    // Journée longue (heure répétée) : 11 heures murales → 11 instants distincts.
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(projectLocal(slot.instant, "Europe/Paris")).toBe(
        `${slot.localDate} ${slot.localHour}`,
      );
    }
  });

  it("automne : 24 oct 09:00 → 07:00Z puis 25 oct 09:00 → 08:00Z (25 h entre eux)", () => {
    const slots = getSlotsForTimezone("Europe/Paris", FALL_NOW);
    const avant = requireInstant(slots, "2026-10-24", "09:00");
    const apres = requireInstant(slots, "2026-10-25", "09:00");

    expect(avant).toBe("2026-10-24T07:00:00.000Z"); // UTC+2 — heure d'été
    expect(apres).toBe("2026-10-25T08:00:00.000Z"); // UTC+1 — heure d'hiver
    // Retour à l'heure d'hiver : la même heure murale recule d'1 h en absolu.
    expect(Date.parse(apres) - Date.parse(avant)).toBe(25 * 3_600_000);
  });

  it("heure inexistante (02:30 le 29 mars, trou 02:00 → 03:00) rejetée par isValidSlot", () => {
    // Preuve du trou : à 01:30Z, Paris affiche déjà 03:30 — 02:30 n'existe
    // à aucun instant de la journée.
    expect(projectLocal("2026-03-29T01:30:00.000Z", "Europe/Paris")).toBe(
      "2026-03-29 03:30",
    );

    // `now` placé le matin même : la DATE est dans la fenêtre (29, 30, 31).
    const slots = getSlotsForTimezone("Europe/Paris", SPRING_DAY_NOW);
    expect(datesOf(slots)).toEqual(["2026-03-29", "2026-03-30", "2026-03-31"]);

    const forged: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-03-29",
      localHour: "02:30",
      instant: "2026-03-29T01:30:00.000Z",
    };
    expect(() => isValidSlot(forged, SPRING_DAY_NOW)).not.toThrow();
    expect(isValidSlot(forged, SPRING_DAY_NOW)).toBe(false);

    // Le même jour, un créneau réellement publié reste accepté : le refus
    // ci-dessus vient du trou DST / de la plage HOURS, pas de la date.
    const reel: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-03-29",
      localHour: "09:00",
      instant: requireInstant(slots, "2026-03-29", "09:00"),
    };
    expect(isValidSlot(reel, SPRING_DAY_NOW)).toBe(true);
  });

  it("heure ambiguë (now posé dans l'heure répétée du 25 oct) : sans crash, créneaux uniques", () => {
    const premiere = "2026-10-25T00:30:00.000Z"; // 02:30 CEST (1ʳᵉ occurrence)
    const seconde = "2026-10-25T01:30:00.000Z"; // 02:30 CET (2ᵉ occurrence)
    // Deux instants distincts projettent la MÊME heure murale → heure ambiguë.
    expect(projectLocal(premiere, "Europe/Paris")).toBe("2026-10-25 02:30");
    expect(projectLocal(seconde, "Europe/Paris")).toBe("2026-10-25 02:30");

    expect(() => getSlotsForTimezone("Europe/Paris", FALL_AMBIGUOUS_NOW)).not.toThrow();
    const slots = getSlotsForTimezone("Europe/Paris", FALL_AMBIGUOUS_NOW);
    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(slots)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27"]);
    // Jamais deux fois le même instant (aucune heure ambigüe publiée en double).
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(projectLocal(slot.instant, "Europe/Paris")).toBe(
        `${slot.localDate} ${slot.localHour}`,
      );
    }

    // 02 h hors plage HOURS (9-19) : aucune des deux occurrences n'est
    // publiée → les deux instants sont rejetés, sans exception levée.
    for (const instant of [premiere, seconde]) {
      const ref: SlotRef = {
        timezone: "Europe/Paris",
        localDate: "2026-10-25",
        localHour: "02:30",
        instant,
      };
      expect(() => isValidSlot(ref, FALL_AMBIGUOUS_NOW)).not.toThrow();
      expect(isValidSlot(ref, FALL_AMBIGUOUS_NOW)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// isValidSlot — revalidation serveur anti-falsification (PLAN §Sécurité 3).
// ---------------------------------------------------------------------------

describe("isValidSlot — anti-falsification", () => {
  it("tous les créneaux publiés (3 fuseaux + 2 fenêtres DST) → true", () => {
    for (const { tz, now } of FENETRES) {
      for (const slot of getSlotsForTimezone(tz, now)) {
        const ref: SlotRef = {
          timezone: tz,
          localDate: slot.localDate,
          localHour: slot.localHour,
          instant: slot.instant,
        };
        expect(isValidSlot(ref, now)).toBe(true);
      }
    }
  });

  it("instant décalé de +1 h ou de −1 h par rapport au créneau attendu → false", () => {
    const now = PARIS_SUMMER_NOW;
    const slots = getSlotsForTimezone("Europe/Paris", now);
    const instant = requireInstant(slots, "2026-06-10", "14:00");
    const base: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-06-10",
      localHour: "14:00",
      instant,
    };
    expect(isValidSlot(base, now)).toBe(true); // référence saine

    const ms = Date.parse(instant);
    expect(isValidSlot({ ...base, instant: new Date(ms + 3_600_000).toISOString() }, now)).toBe(
      false,
    );
    expect(isValidSlot({ ...base, instant: new Date(ms - 3_600_000).toISOString() }, now)).toBe(
      false,
    );
  });

  it("instant décalé de 1 seule seconde → false", () => {
    const now = PARIS_SUMMER_NOW;
    const slots = getSlotsForTimezone("Europe/Paris", now);
    const instant = requireInstant(slots, "2026-06-10", "14:00");
    const base: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-06-10",
      localHour: "14:00",
      instant,
    };

    const ms = Date.parse(instant);
    expect(isValidSlot({ ...base, instant: new Date(ms + 1_000).toISOString() }, now)).toBe(
      false,
    );
    expect(isValidSlot({ ...base, instant: new Date(ms - 1_000).toISOString() }, now)).toBe(
      false,
    );
  });

  it("heure hors HOURS, date hors fenêtre ou fuseau substitué → false", () => {
    const now = PARIS_SUMMER_NOW;
    const paris = getSlotsForTimezone("Europe/Paris", now);
    const algiers = getSlotsForTimezone("Africa/Algiers", now);
    const instantParis = requireInstant(paris, "2026-06-10", "14:00");
    const base: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-06-10",
      localHour: "14:00",
      instant: instantParis,
    };
    expect(isValidSlot(base, now)).toBe(true); // référence saine

    // Avant 9 h / après 19 h : jamais publiés.
    expect(isValidSlot({ ...base, localHour: "08:00" }, now)).toBe(false);
    expect(isValidSlot({ ...base, localHour: "20:00" }, now)).toBe(false);
    // Hors fenêtre 3 jours (la fenêtre s'arrête au 12 juin).
    expect(isValidSlot({ ...base, localDate: "2026-06-13" }, now)).toBe(false);

    // Substitution de fuseau : le couple (date, heure) existe aussi à Alger,
    // mais à un autre instant absolu → l'identité complète est exigée.
    expect(instantParis).not.toBe(requireInstant(algiers, "2026-06-10", "14:00"));
    expect(
      isValidSlot({ ...base, timezone: "Africa/Algiers" }, now),
    ).toBe(false);
  });

  it("fuseau inconnu (« Mars/Olympus_Mons ») → [] / false, sans throw", () => {
    const now = PARIS_SUMMER_NOW;

    expect(() => getSlotsForTimezone("Mars/Olympus_Mons", now)).not.toThrow();
    expect(getSlotsForTimezone("Mars/Olympus_Mons", now)).toEqual([]);

    const ref: SlotRef = {
      timezone: "Mars/Olympus_Mons",
      localDate: "2026-06-10",
      localHour: "14:00",
      instant: "2026-06-10T12:00:00.000Z",
    };
    expect(() => isValidSlot(ref, now)).not.toThrow();
    expect(isValidSlot(ref, now)).toBe(false);
  });

  it("champs malformés (date, heure, instant, timezone, now) → false", () => {
    const now = PARIS_SUMMER_NOW;
    const slots = getSlotsForTimezone("Europe/Paris", now);
    const base: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-06-10",
      localHour: "14:00",
      instant: requireInstant(slots, "2026-06-10", "14:00"),
    };
    expect(isValidSlot(base, now)).toBe(true); // référence saine

    expect(isValidSlot({ ...base, localDate: "10/06/2026" }, now)).toBe(false); // format
    expect(isValidSlot({ ...base, localHour: "9:00" }, now)).toBe(false); // padding requis
    expect(isValidSlot({ ...base, localHour: "14:30" }, now)).toBe(false); // hors alignement
    expect(isValidSlot({ ...base, instant: "pas-un-instant" }, now)).toBe(false);
    expect(isValidSlot({ ...base, instant: "" }, now)).toBe(false);
    expect(isValidSlot({ ...base, timezone: "" }, now)).toBe(false);
    expect(isValidSlot({ ...base, timezone: 42 as unknown as string }, now)).toBe(false);
    expect(isValidSlot(base, new Date("invalid"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fenêtre « à partir d'aujourd'hui » — samedi soir (J0 passé mais valide).
//
// DÉCISION DOCUMENTÉE (en-tête de `slots.ts`) : les heures déjà passées
// restent publiées avec `past: true` (le client les désactive) ; le serveur
// revalide l'*identité* du créneau, jamais le fait qu'il soit passé — rejeter
// le passé créerait une course à la frontière de l'heure.
// ---------------------------------------------------------------------------

describe("fenêtre — samedi soir", () => {
  it("samedi 24 oct. 2026, 23 h à Alger → fenêtre locale 24, 25, 26 octobre", () => {
    const slots = getSlotsForTimezone("Africa/Algiers", SATURDAY_NIGHT_NOW);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    // J0 = aujourd'hui (samedi), puis dimanche et lundi : fenêtre « à partir
    // d'aujourd'hui », jamais « demain ».
    expect(datesOf(slots)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("créneaux de J0 → past : true ; créneaux de J1 et J2 → past : false", () => {
    const slots = getSlotsForTimezone("Africa/Algiers", SATURDAY_NIGHT_NOW);
    const jour0 = slots.filter((slot) => slot.localDate === "2026-10-24");
    const suivants = slots.filter((slot) => slot.localDate !== "2026-10-24");

    expect(jour0).toHaveLength(HOURS.length);
    expect(jour0.every((slot) => slot.past)).toBe(true); // 19 h max = 18 h 00Z < 22 h 00Z
    expect(suivants).toHaveLength((DAYS - 1) * HOURS.length);
    expect(suivants.every((slot) => slot.past)).toBe(false);
  });

  it("un créneau passé de J0 reste ACCEPTÉ par isValidSlot (revalidation d'identité)", () => {
    const slots = getSlotsForTimezone("Africa/Algiers", SATURDAY_NIGHT_NOW);
    const passe = slots.find(
      (slot) => slot.localDate === "2026-10-24" && slot.localHour === "09:00",
    );
    expect(passe).toBeDefined();
    if (passe === undefined) return;

    expect(passe.past).toBe(true);
    const ref: SlotRef = {
      timezone: "Africa/Algiers",
      localDate: passe.localDate,
      localHour: passe.localHour,
      instant: passe.instant,
    };
    expect(isValidSlot(ref, SATURDAY_NIGHT_NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toRecruiterTime — heure du candidat + équivalent Africa/Algiers.
// ---------------------------------------------------------------------------

describe("toRecruiterTime — équivalent recruteur", () => {
  // PRÉCISION DE CALCUL (fixture vérifiée) : `Africa/Algiers` est en **UTC+1
  // toute l'année** (sans DST). L'écart Paris ↔ Alger vaut donc 0 h en hiver
  // (Paris aussi en UTC+1) et 1 h en été (Paris en UTC+2) — pas 1 h / 2 h.
  it("hiver : Europe/Paris et Africa/Algiers toutes deux en UTC+1 → écart de 0 h", () => {
    const instant = "2026-01-20T10:00:00.000Z";
    const rendered = toRecruiterTime(instant, "Europe/Paris");
    const times = timesOf(rendered);

    expect(rendered).toContain("(Europe/Paris)");
    expect(rendered).toContain(`(${RECRUITER_TZ})`);
    // Les deux heures affichées valent les heures locales réelles (contrôle
    // croisé via une projection indépendante du module).
    expect(times).toHaveLength(2);
    expect(times[0]).toBe(projectLocal(instant, "Europe/Paris").slice(11));
    expect(times[1]).toBe(projectLocal(instant, RECRUITER_TZ).slice(11));
    expect(times).toEqual(["11:00", "11:00"]); // 10:00Z + 1 h des deux côtés
    expect(hourOf(times[0]) - hourOf(times[1])).toBe(0);
  });

  it("été : Europe/Paris en UTC+2 vs Africa/Algiers en UTC+1 → exactement 1 h d'écart", () => {
    const instant = "2026-07-20T10:00:00.000Z";
    const rendered = toRecruiterTime(instant, "Europe/Paris");
    const times = timesOf(rendered);

    expect(rendered).toContain("(Europe/Paris)");
    expect(rendered).toContain(`(${RECRUITER_TZ})`);
    expect(times).toHaveLength(2);
    expect(times[0]).toBe(projectLocal(instant, "Europe/Paris").slice(11));
    expect(times[1]).toBe(projectLocal(instant, RECRUITER_TZ).slice(11));
    expect(times).toEqual(["12:00", "11:00"]); // UTC+2 vs UTC+1 : 1 h
    expect(hourOf(times[0]) - hourOf(times[1])).toBe(1);
  });

  it("fuseau recruteur par défaut → une seule occurrence, jamais de chaîne double", () => {
    const instant = "2026-01-20T10:00:00.000Z";
    const parDefaut = toRecruiterTime(instant);
    const explicite = toRecruiterTime(instant, RECRUITER_TZ);

    expect(parDefaut).toBe(explicite);
    expect(parDefaut).toContain(`(${RECRUITER_TZ})`);
    // Une seule zone = pas de séparateur « — » (le double format n'est pas
    // produit quand les deux zones sont identiques).
    expect(parDefaut).not.toContain("—");
    expect(timesOf(parDefaut)).toEqual(["11:00"]);
  });

  it("instant illisible, fuseau inconnu ou entrée non-string → repli total, sans throw", () => {
    // Pas un ISO : renvoyé tel quel (le récapitulatif reste envoyable).
    expect(toRecruiterTime("n'importe-quoi")).toBe("n'importe-quoi");
    // Fuseau IANA inconnu d'ICU : repli sur l'instant ISO UTC, sans throw.
    expect(() => toRecruiterTime("2026-01-20T10:00:00.000Z", "Mars/Olympus_Mons")).not.toThrow();
    expect(toRecruiterTime("2026-01-20T10:00:00.000Z", "Mars/Olympus_Mons")).toBe(
      "2026-01-20T10:00:00.000Z",
    );
    // Entrée forgée (non-string) : chaîne vide, jamais d'exception.
    expect(toRecruiterTime(42 as unknown as string)).toBe("");
  });
});
