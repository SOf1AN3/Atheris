/**
 * Atheris — tests unitaires du module de créneaux d'entretien
 * (**Lot 2**, PLAN §2 : « heure algérienne », fenêtre J+1 → J+3).
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
 * Modèle vérifié (règle métier actée, remplace l'ancienne fenêtre glissante
 * « à partir d'aujourd'hui côté candidat ») :
 * - grille **ancrée** en `Africa/Algiers` (7 prises 9 h → 15 h, fenêtre
 *   9 h – 16 h **heure de l'entreprise**), rendue en fuseau **candidat** ;
 * - fenêtre **figée** J+1 → J+3 dérivée de la génération du lien ;
 * - `localDate`/`localHour` = rendu candidat (offset Philippines `+7`,
 *   recul de jour côté Amériques), `instant` = vérité absolue revalidée.
 *
 * Fuseaux couverts :
 * - `Africa/Algiers` — UTC+1 **sans** DST (ancrage de la grille) ;
 * - `Europe/Paris` — UTC+1 / UTC+2 **avec** DST (dernier dimanche de mars
 *   et d'octobre) ;
 * - `Asia/Manila` — UTC+8 **sans** DST : décalage `+7` sur Alger, testé au
 *   pixel (09:00 Algérie → **16:00** affiché) ;
 * - `America/Los_Angeles` — UTC−8 / UTC−7 : DST **et** retour d'heure du
 *   1ᵉʳ dimanche de novembre (heure murale répétée) ;
 * - `America/Anchorage` — UTC−9 / UTC−8 : l'offset négatif qui fait
 *   **reculer d'un jour** l'affichage (09:00 Algérie → 23:00 la veille).
 *   ⚠ Los Angeles plafonne à UTC−8 : 09:00 Algérie y affiche 00:00 (hiver)
 *   ou 01:00 (été) le **même** jour civil — le recul de jour est donc prouvé
 *   sur Anchorage (hiver, UTC−9), jamais sur L.A. (constat ICU vérifié).
 *
 * HORS PÉRIMÈTRE (signalé au LEAD) : la « Zod des 2 actions » et la limite
 * de 5 Mo ne sont **pas** testées ici — `applySchema`, `submitInterviewSchema`
 * et `MAX_CV_BYTES` sont des valeurs runtime internes à des fichiers
 * `"use server"`, qui n'autorisent que l'export de fonctions async : les
 * exposer casserait `next build`.
 */

import { describe, expect, it } from "vitest";

import {
  ANCHOR_TZ,
  DAYS,
  getSlotsForWindow,
  getSlotsForWindowDates,
  HOURS,
  isValidSlot,
  RECRUITER_TZ,
  SLOT_DURATION_MINUTES,
  toRecruiterTime,
  type Slot,
  type SlotRef,
} from "./slots";

// ---------------------------------------------------------------------------
// Fixtures — instants et fenêtres FIGÉS (aucune dépendance à l'horloge).
// ---------------------------------------------------------------------------

/** Dimanche 25 octobre 2026, 13 h 00 à Alger — génération du lien. */
const CREATED_AT = new Date("2026-10-25T12:00:00.000Z");

/** Fenêtre algérienne dérivée de `CREATED_AT` : lundi 26, mardi 27, mercredi 28 oct. */
const WINDOW_OCT: readonly string[] = ["2026-10-26", "2026-10-27", "2026-10-28"];
/** Référence posée **avant** toute heure de la fenêtre : rien n'est `past`. */
const NOW_OCT = new Date("2026-10-25T12:00:00.000Z");

/** Fenêtre de janvier — Paris en plein hiver (UTC+1). */
const WINDOW_JAN: readonly string[] = ["2026-01-19", "2026-01-20", "2026-01-21"];
const NOW_JAN = new Date("2026-01-15T12:00:00.000Z");

/** Fenêtre de juillet — Los Angeles en plein été (UTC−7). */
const WINDOW_JUL: readonly string[] = ["2026-07-13", "2026-07-14", "2026-07-15"];
const NOW_JUL = new Date("2026-07-10T12:00:00.000Z");

/** Fenêtre de juin — Paris en plein été (UTC+2), pour l'anti-falsification. */
const WINDOW_JUIN: readonly string[] = ["2026-06-10", "2026-06-11", "2026-06-12"];
const NOW_JUIN = new Date("2026-06-08T12:00:00.000Z");

/** Fenêtre chevauchant le passage à l'heure d'été à Paris (dim. 29 mars 2026). */
const WINDOW_PRINTEMPS: readonly string[] = ["2026-03-27", "2026-03-28", "2026-03-29"];
const NOW_PRINTEMPS = new Date("2026-03-20T12:00:00.000Z");

/** Fenêtre chevauchant le retour à l'heure d'hiver à Paris (dim. 25 oct. 2026). */
const WINDOW_AUTOMNE: readonly string[] = ["2026-10-23", "2026-10-24", "2026-10-25"];
const NOW_AUTOMNE = new Date("2026-10-20T12:00:00.000Z");

/** Fenêtre chevauchant le retour d'heure à Los Angeles (dim. 1ᵉʳ nov. 2026, 02:00 PDT → 01:00 PST). */
const WINDOW_LA: readonly string[] = ["2026-10-30", "2026-10-31", "2026-11-01"];
const NOW_LA = new Date("2026-10-28T12:00:00.000Z");

/** Fenêtre hivernale à Anchorage (AKST, UTC−9 — retour d'heure passé le 1ᵉʳ nov.). */
const WINDOW_ANCHORAGE: readonly string[] = ["2026-11-04", "2026-11-05", "2026-11-06"];
const NOW_ANCHORAGE = new Date("2026-11-02T12:00:00.000Z");

/** Toutes les fenêtres de test — reprises pour l'aller-retour et la revalidation. */
type Fenetre = { tz: string; dates: readonly string[]; now: Date };

const TOUTES_FENETRES: readonly Fenetre[] = [
  { tz: "Africa/Algiers", dates: WINDOW_OCT, now: NOW_OCT },
  { tz: "Europe/Paris", dates: WINDOW_JAN, now: NOW_JAN },
  { tz: "Asia/Manila", dates: WINDOW_OCT, now: NOW_OCT },
  { tz: "America/Los_Angeles", dates: WINDOW_JUL, now: NOW_JUL },
  { tz: "Europe/Paris", dates: WINDOW_PRINTEMPS, now: NOW_PRINTEMPS },
  { tz: "Europe/Paris", dates: WINDOW_AUTOMNE, now: NOW_AUTOMNE },
  { tz: "America/Los_Angeles", dates: WINDOW_LA, now: NOW_LA },
  { tz: "America/Anchorage", dates: WINDOW_ANCHORAGE, now: NOW_ANCHORAGE },
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
function datesOf(slots: readonly Slot[]): string[] {
  const dates: string[] = [];
  for (const slot of slots) {
    if (!dates.includes(slot.localDate)) dates.push(slot.localDate);
  }
  return dates;
}

/** Heures affichées d'un jour donné, dans l'ordre de publication. */
function hoursOn(slots: readonly Slot[], date: string): string[] {
  return slots
    .filter((slot) => slot.localDate === date)
    .map((slot) => slot.localHour);
}

/** Plage d'heures `"HH:00"` croissante, inclusive. */
function hoursRange(from: number, to: number): string[] {
  const hours: string[] = [];
  for (let hour = from; hour <= to; hour += 1) {
    hours.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return hours;
}

/** Les 7 heures de `HOURS`, formatées comme le module : `"09:00"` → `"15:00"`. */
function expectedHours(): string[] {
  return HOURS.map((hour) => `${String(hour).padStart(2, "0")}:00`);
}

/** Instant publié d'un créneau, ou `undefined` (échec d'assertion plus bas). */
function instantOf(
  slots: readonly Slot[],
  localDate: string,
  localHour: string,
): string | undefined {
  return slots.find(
    (slot) => slot.localDate === localDate && slot.localHour === localHour,
  )?.instant;
}

/** Comme `instantOf`, mais échoue explicitement si le créneau n'est pas publié. */
function requireInstant(
  slots: readonly Slot[],
  localDate: string,
  localHour: string,
): string {
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
// Constantes de la fenêtre (Lot 2 — hypothèses actées du PLAN, §2 · Q1).
// ---------------------------------------------------------------------------

describe("constantes de la fenêtre (Lot 2)", () => {
  it("HOURS = 7 prises algériennes, de 9 h à 15 h (fenêtre 9 h → 16 h)", () => {
    expect(HOURS).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(HOURS).toHaveLength(7);
  });

  it("DAYS = 3 · SLOT_DURATION_MINUTES = 60 · ancre = recruteur = Africa/Algiers", () => {
    expect(DAYS).toBe(3);
    expect(SLOT_DURATION_MINUTES).toBe(60);
    expect(ANCHOR_TZ).toBe("Africa/Algiers");
    expect(RECRUITER_TZ).toBe("Africa/Algiers");
  });
});

// ---------------------------------------------------------------------------
// getSlotsForWindowDates — fenêtre J+1 → J+3, figée à la génération.
// ---------------------------------------------------------------------------

describe("getSlotsForWindowDates — fenêtre J+1 → J+3 (figée à la génération)", () => {
  it("génération le 25 oct. → [26, 27, 28] : le jour de génération n'y figure jamais", () => {
    const dates = getSlotsForWindowDates(CREATED_AT);

    expect(dates).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(dates).toHaveLength(DAYS);
    expect(dates).not.toContain("2026-10-25");
    // ISO civil = tri chronologique lexicographique.
    expect(dates[0] < dates[1]).toBe(true);
    expect(dates[1] < dates[2]).toBe(true);
    // `Date` et ISO équivalent donnent exactement la même fenêtre.
    expect(getSlotsForWindowDates("2026-10-25T12:00:00.000Z")).toEqual(dates);
  });

  it("chevauchement de mois (31 jan → 1, 2, 3 fév) et d'année (30 déc → 31 déc, 1, 2 jan)", () => {
    expect(getSlotsForWindowDates("2026-01-31T12:00:00.000Z")).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
    ]);
    expect(getSlotsForWindowDates("2026-12-30T12:00:00.000Z")).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("le jour de référence est ALGÉRIEN : génération à 23:30Z (00:30 le 26) → [27, 28, 29]", () => {
    // 22:30Z = 23:30 à Alger (UTC+1) → encore le 25 algérien.
    expect(getSlotsForWindowDates("2026-10-25T22:30:00.000Z")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
    // 23:30Z = 00:30 le 26 à Alger → le jour algérien a basculé : la fenêtre
    // entière avance d'un jour. Le décalage +1 est déduit via `Intl`,
    // jamais écrit en dur.
    expect(getSlotsForWindowDates("2026-10-25T23:30:00.000Z")).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ]);
  });

  it("entrée illisible (Date invalide, string, valeur forgée) → [] sans throw", () => {
    expect(() => getSlotsForWindowDates(new Date("invalid"))).not.toThrow();
    expect(getSlotsForWindowDates(new Date("invalid"))).toEqual([]);
    expect(getSlotsForWindowDates("25/10/2026")).toEqual([]);
    expect(getSlotsForWindowDates("pas-une-date")).toEqual([]);
    // Entrées forgées : ni `Date`, ni string.
    expect(getSlotsForWindowDates(42 as unknown as Date)).toEqual([]);
    expect(getSlotsForWindowDates(null as unknown as Date | string)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSlotsForWindow — grille ancrée Algérie, rendue en fuseau candidat.
// ---------------------------------------------------------------------------

describe("getSlotsForWindow — grille ancrée Algérie, rendue côté candidat", () => {
  it("Africa/Algiers : 21 créneaux, tri jour puis heure, instant exact, entrées ramenées à l'ordre", () => {
    const slots = getSlotsForWindow(WINDOW_OCT, "Africa/Algiers", NOW_OCT);

    expect(slots).toHaveLength(DAYS * HOURS.length); // 3 × 7 = 21
    expect(datesOf(slots)).toEqual(WINDOW_OCT);
    // Regroupement jour-major : 3 blocs successifs de 7 heures identiques.
    expect(slots.map((slot) => slot.localHour)).toEqual([
      ...expectedHours(),
      ...expectedHours(),
      ...expectedHours(),
    ]);
    // Contrôle d'offset INDEPENDANT (via `Intl`) : 09:00 Alger = 08:00 UTC.
    expect(requireInstant(slots, "2026-10-26", "09:00")).toBe("2026-10-26T08:00:00.000Z");
    // Instants strictement croissants, formats conformes, aucun doublon.
    for (let index = 1; index < slots.length; index += 1) {
      expect(Date.parse(slots[index].instant)).toBeGreaterThan(
        Date.parse(slots[index - 1].instant),
      );
    }
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(slot.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(slot.localHour).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.localHour.endsWith(":00")).toBe(true);
      // Instant toujours en ISO 8601 UTC millimétrique (vérité `starts_at`).
      expect(slot.instant).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    // Désordre + doublon en entrée : même grille, exactement (tri + dédup).
    const chaos = getSlotsForWindow(
      ["2026-10-28", "2026-10-26", "2026-10-26", "2026-10-27"],
      "Africa/Algiers",
      NOW_OCT,
    );
    expect(chaos).toEqual(slots);
  });

  it("chaque jour publie exactement les 7 heures de HOURS, dans l'ordre (4 fuseaux)", () => {
    const cas: ReadonlyArray<{ tz: string; dates: readonly string[]; now: Date; heures: string[] }> = [
      { tz: "Africa/Algiers", dates: WINDOW_OCT, now: NOW_OCT, heures: hoursRange(9, 15) },
      { tz: "Europe/Paris", dates: WINDOW_JAN, now: NOW_JAN, heures: hoursRange(9, 15) },
      { tz: "Asia/Manila", dates: WINDOW_OCT, now: NOW_OCT, heures: hoursRange(16, 22) },
      { tz: "America/Los_Angeles", dates: WINDOW_JUL, now: NOW_JUL, heures: hoursRange(1, 7) },
    ];
    for (const { tz, dates, now, heures } of cas) {
      const slots = getSlotsForWindow(dates, tz, now);
      expect(slots).toHaveLength(DAYS * HOURS.length);
      // Sur ces 4 fuseaux, chaque date d'ancre se projette sur la même date
      // locale : les blocs de 7 heures sont donc regroupés à l'identique.
      expect(datesOf(slots)).toEqual([...dates]);
      for (const date of datesOf(slots)) {
        expect(hoursOn(slots, date)).toEqual(heures);
      }
    }
  });

  it("aller-retour instant → localDate/localHour : identique sur les 8 fenêtres", () => {
    for (const { tz, dates, now } of TOUTES_FENETRES) {
      for (const slot of getSlotsForWindow(dates, tz, now)) {
        expect(projectLocal(slot.instant, tz)).toBe(`${slot.localDate} ${slot.localHour}`);
      }
    }
  });

  it("Asia/Manila (UTC+8) : 09:00 Algérie affiché 16:00 — décalage +7 h vérifié au pixel", () => {
    const slots = getSlotsForWindow(WINDOW_OCT, "Asia/Manila", NOW_OCT);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    // Heures affichées : 09…15 h algériennes + 7 h = 16…22 h manillaises.
    expect(hoursOn(slots, "2026-10-26")).toEqual(hoursRange(16, 22));
    expect(hoursOn(slots, "2026-10-27")).toEqual(hoursRange(16, 22));
    expect(hoursOn(slots, "2026-10-28")).toEqual(hoursRange(16, 22));
    // Instant exact du premier créneau : 09:00 Alger = 08:00 UTC = 16:00 à Manille.
    expect(requireInstant(slots, "2026-10-26", "16:00")).toBe("2026-10-26T08:00:00.000Z");
    // Les 7 instants du jour restent la grille algérienne 08:00Z → 14:00Z.
    expect(slots.filter((slot) => slot.localDate === "2026-10-26").map((slot) => slot.instant)).toEqual([
      "2026-10-26T08:00:00.000Z",
      "2026-10-26T09:00:00.000Z",
      "2026-10-26T10:00:00.000Z",
      "2026-10-26T11:00:00.000Z",
      "2026-10-26T12:00:00.000Z",
      "2026-10-26T13:00:00.000Z",
      "2026-10-26T14:00:00.000Z",
    ]);
  });

  it("America/Los_Angeles : 09:00 Algérie affichée 01:00 (été) / 00:00 (hiver), même jour civil", () => {
    // Été (PDT, UTC−7) : décalage mural affiché −8 h, aucun recul de jour.
    const ete = getSlotsForWindow(WINDOW_JUL, "America/Los_Angeles", NOW_JUL);
    expect(datesOf(ete)).toEqual(WINDOW_JUL);
    expect(hoursOn(ete, "2026-07-13")).toEqual(hoursRange(1, 7));
    expect(requireInstant(ete, "2026-07-13", "01:00")).toBe("2026-07-13T08:00:00.000Z");

    // Hiver (PST, UTC−8) : 09:00 Algérie = 00:00 pile — MINUIT le même jour.
    // Los Angeles plafonne à UTC−8 : à l'heure algérienne la plus ancienne
    // (9 h = 08:00Z), le calendrier local n'a JAMAIS reculé — cf. le test
    // Anchorage pour le vrai recul de jour.
    const hiver = getSlotsForWindow(WINDOW_JAN, "America/Los_Angeles", NOW_JAN);
    expect(datesOf(hiver)).toEqual(WINDOW_JAN);
    expect(hoursOn(hiver, "2026-01-19")).toEqual(hoursRange(0, 6));
    expect(requireInstant(hiver, "2026-01-19", "00:00")).toBe("2026-01-19T08:00:00.000Z");
  });

  it("America/Anchorage (UTC−9, hiver) : 09:00 Algérie affichée 23:00 la VEILLE", () => {
    const slots = getSlotsForWindow(WINDOW_ANCHORAGE, "America/Anchorage", NOW_ANCHORAGE);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    // Le créneau algérien du matin recule d'un jour civil côté candidat :
    // 09:00 Algérie = 08:00Z = 23:00 AKST la veille → `localDate` recule.
    expect(requireInstant(slots, "2026-11-03", "23:00")).toBe("2026-11-04T08:00:00.000Z");
    // Affichage du 4 novembre : 00:00 → 05:00 (ancre du 4), puis 23:00
    // (ancre du 5, qui recule à son tour) — l'ordre de publication suit
    // l'ancre, jamais l'affichage.
    expect(hoursOn(slots, "2026-11-04")).toEqual([...hoursRange(0, 5), "23:00"]);
    // 4 dates affichées pour 3 dates algériennes (recul de jour), instants
    // toujours strictement croissants (l'affichage ne réordonne rien).
    expect(datesOf(slots)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    for (let index = 1; index < slots.length; index += 1) {
      expect(Date.parse(slots[index].instant)).toBeGreaterThan(
        Date.parse(slots[index - 1].instant),
      );
    }
  });

  it("past strict (borne = now, comparaison <) + fenêtre figée même des mois plus tard", () => {
    // Avant la fenêtre : aucun créneau passé.
    const futur = getSlotsForWindow(WINDOW_OCT, "Africa/Algiers", NOW_OCT);
    expect(futur.filter((slot) => slot.past)).toHaveLength(0);

    // Now posé à 10:00Z (11 h à Alger) le 26 : seuls les instants strictement
    // antérieurs sont `past` — 09:00 et 10:00 affichés (08:00Z / 09:00Z) ;
    // le créneau à 10:00Z (affiché 11:00) ne l'est PAS encore (borne stricte).
    const miFenetre = getSlotsForWindow(WINDOW_OCT, "Africa/Algiers", new Date("2026-10-26T10:00:00.000Z"));
    const passes = miFenetre.filter((slot) => slot.past);
    expect(passes.map((slot) => `${slot.localDate} ${slot.localHour}`)).toEqual([
      "2026-10-26 09:00",
      "2026-10-26 10:00",
    ]);
    expect(instantOf(miFenetre, "2026-10-26", "11:00")).toBe("2026-10-26T10:00:00.000Z");

    // Now APRÈS la fenêtre (le 29) : la fenêtre ne « glisse » PAS — elle
    // reste [26, 27, 28] (figée à la génération), tout est `past`.
    const tard = getSlotsForWindow(WINDOW_OCT, "Africa/Algiers", new Date("2026-10-29T00:00:00.000Z"));
    expect(tard).toHaveLength(DAYS * HOURS.length);
    expect(datesOf(tard)).toEqual(WINDOW_OCT);
    expect(tard.every((slot) => slot.past)).toBe(true);
  });

  it("tz vide/inconnu, now illisible ou fenêtre illisible → [] sans throw", () => {
    // Fuseau vide ou inconnu d'ICU.
    expect(() => getSlotsForWindow(WINDOW_OCT, "", NOW_OCT)).not.toThrow();
    expect(getSlotsForWindow(WINDOW_OCT, "", NOW_OCT)).toEqual([]);
    expect(getSlotsForWindow(WINDOW_OCT, "Mars/Olympus_Mons", NOW_OCT)).toEqual([]);

    // `now` illisible (pas même un `Date`).
    expect(getSlotsForWindow(WINDOW_OCT, "Europe/Paris", new Date("invalid"))).toEqual([]);
    expect(getSlotsForWindow(WINDOW_OCT, "Europe/Paris", null as unknown as Date)).toEqual([]);

    // Fenêtre vide ou illisible (format, calendrier, non-tableau).
    expect(getSlotsForWindow([], "Europe/Paris", NOW_OCT)).toEqual([]);
    expect(getSlotsForWindow(["n'importe-quoi"], "Europe/Paris", NOW_OCT)).toEqual([]);
    expect(getSlotsForWindow(["2026-02-31"], "Europe/Paris", NOW_OCT)).toEqual([]);
    expect(getSlotsForWindow([42 as unknown as string], "Europe/Paris", NOW_OCT)).toEqual([]);
    expect(getSlotsForWindow(null as unknown as string[], "Europe/Paris", NOW_OCT)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Passage à l'heure côté CANDIDAT — gardes DST conservées (Algérie n'a pas
// d'heure d'été, le candidat si).
// ---------------------------------------------------------------------------

describe("passage à l'heure — candidat en DST (garde conservée)", () => {
  it("printemps Paris (dim. 29 mars) : affichage décalé +1 h, instants toujours espacés de 24 h", () => {
    const slots = getSlotsForWindow(WINDOW_PRINTEMPS, "Europe/Paris", NOW_PRINTEMPS);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    // 27 et 28 mars (heure d'hiver, UTC+1) : 9 h → 15 h. Le 29 (après le
    // passage de 02:00 à 03:00, 01:00Z) : le MÊME créneau algérien s'affiche
    // une heure plus tard — 10 h → 16 h (UTC+2).
    expect(hoursOn(slots, "2026-03-27")).toEqual(hoursRange(9, 15));
    expect(hoursOn(slots, "2026-03-28")).toEqual(hoursRange(9, 15));
    expect(hoursOn(slots, "2026-03-29")).toEqual(hoursRange(10, 16));
    // Ancre algérienne sans DST : la distance entre deux 9 h… reste de 24 h
    // (l'ancien modèle, ancré sur Paris, produisait une fenêtre de 23 h).
    const avant = requireInstant(slots, "2026-03-28", "09:00");
    const apres = requireInstant(slots, "2026-03-29", "10:00");
    expect(avant).toBe("2026-03-28T08:00:00.000Z");
    expect(apres).toBe("2026-03-29T08:00:00.000Z");
    expect(Date.parse(apres) - Date.parse(avant)).toBe(24 * 3_600_000);
    // Aller-retour et unicité sur toute la fenêtre.
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(projectLocal(slot.instant, "Europe/Paris")).toBe(`${slot.localDate} ${slot.localHour}`);
    }
  });

  it("automne Paris (dim. 25 oct.) : affichage décalé −1 h, aucune heure publiée en double", () => {
    const slots = getSlotsForWindow(WINDOW_AUTOMNE, "Europe/Paris", NOW_AUTOMNE);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    // 23 et 24 oct. (UTC+2) : 10 h → 16 h ; le 25 (retour à 02:00, 01:00Z) :
    // de retour en UTC+1, le même créneau algérien s'affiche 9 h → 15 h.
    expect(hoursOn(slots, "2026-10-23")).toEqual(hoursRange(10, 16));
    expect(hoursOn(slots, "2026-10-24")).toEqual(hoursRange(10, 16));
    expect(hoursOn(slots, "2026-10-25")).toEqual(hoursRange(9, 15));
    const avant = requireInstant(slots, "2026-10-24", "10:00");
    const apres = requireInstant(slots, "2026-10-25", "09:00");
    expect(avant).toBe("2026-10-24T08:00:00.000Z");
    expect(apres).toBe("2026-10-25T08:00:00.000Z");
    expect(Date.parse(apres) - Date.parse(avant)).toBe(24 * 3_600_000);
    // Journée longue côté candidat (heure murale répétée à 01:00X) : les 21
    // instants restent distincts — l'ancrage algérien ne publie JAMAIS deux
    // fois le même instant, et n'est jamais ambigu (heures entières UTC).
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(projectLocal(slot.instant, "Europe/Paris")).toBe(`${slot.localDate} ${slot.localHour}`);
    }
  });

  it("retour d'heure Los Angeles (1ᵉʳ nov.) : deux créneaux affichent 01:00 — instants distincts, tous deux valides", () => {
    const slots = getSlotsForWindow(WINDOW_LA, "America/Los_Angeles", NOW_LA);

    expect(slots).toHaveLength(DAYS * HOURS.length);
    expect(new Set(slots.map((slot) => slot.instant)).size).toBe(slots.length);
    // 30 oct. (plein PDT) : affichage 01:00 → 07:00.
    expect(hoursOn(slots, "2026-10-30")).toEqual(hoursRange(1, 7));
    // 1ᵉʳ nov. : le retour d'heure tombe pile entre deux créneaux algériens —
    // 08:00Z affiche 01:00 PDT et 09:00Z affiche 01:00 PST : MÊME libellé,
    // deux instants. Les deux restent publiés (le libellé n'est qu'un rendu).
    expect(hoursOn(slots, "2026-11-01")).toEqual([
      "01:00",
      "01:00",
      "02:00",
      "03:00",
      "04:00",
      "05:00",
      "06:00",
    ]);
    const collisions = slots.filter(
      (slot) => slot.localDate === "2026-11-01" && slot.localHour === "01:00",
    );
    expect(collisions.map((slot) => slot.instant)).toEqual([
      "2026-11-01T08:00:00.000Z",
      "2026-11-01T09:00:00.000Z",
    ]);
    for (const slot of collisions) {
      expect(projectLocal(slot.instant, "America/Los_Angeles")).toBe("2026-11-01 01:00");
      // Revalidation par le triplet complet : CHACUN des deux est accepté.
      expect(
        isValidSlot(
          {
            timezone: "America/Los_Angeles",
            localDate: slot.localDate,
            localHour: slot.localHour,
            instant: slot.instant,
          },
          WINDOW_LA,
          NOW_LA,
        ),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// isValidSlot — revalidation serveur anti-falsification (PLAN §Sécurité 1 & 3).
// ---------------------------------------------------------------------------

describe("isValidSlot — revalidation serveur anti-falsification", () => {
  it("tous les créneaux publiés (8 fenêtres × fuseaux + DST) → true", () => {
    for (const { tz, dates, now } of TOUTES_FENETRES) {
      for (const slot of getSlotsForWindow(dates, tz, now)) {
        const ref: SlotRef = {
          timezone: tz,
          localDate: slot.localDate,
          localHour: slot.localHour,
          instant: slot.instant,
        };
        expect(isValidSlot(ref, dates, now)).toBe(true);
      }
    }
  });

  it("instant décalé de +1 h, −1 h ou d'1 seule seconde → false", () => {
    const base: SlotRef = {
      timezone: "Africa/Algiers",
      localDate: "2026-06-10",
      localHour: "09:00",
      instant: "2026-06-10T08:00:00.000Z",
    };
    expect(isValidSlot(base, WINDOW_JUIN, NOW_JUIN)).toBe(true); // référence saine

    const ms = Date.parse(base.instant);
    // +1 h : ce MÊME instant existe en grille, mais il s'affiche 10:00 — le
    // triplet revendiqué (09:00 + 09:00Z) n'est publié nulle part.
    expect(isValidSlot({ ...base, instant: new Date(ms + 3_600_000).toISOString() }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, instant: new Date(ms - 3_600_000).toISOString() }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, instant: new Date(ms + 1_000).toISOString() }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, instant: new Date(ms - 1_000).toISOString() }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
  });

  it("heure ou date hors grille → false (et 16:00 affiché reste VALIDE côté Manila)", () => {
    const base: SlotRef = {
      timezone: "Africa/Algiers",
      localDate: "2026-06-10",
      localHour: "09:00",
      instant: "2026-06-10T08:00:00.000Z",
    };
    expect(isValidSlot(base, WINDOW_JUIN, NOW_JUIN)).toBe(true); // référence saine

    // Avant la 1ʳᵉ prise (9 h) et après la dernière (15 h) : jamais publiés.
    expect(isValidSlot({ ...base, localHour: "08:00" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, localHour: "16:00" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    // Hors fenêtre : avant J+1 (le 9 juin = jour de génération de cette
    // fenêtre), après J+3 (le 13), et une date sans rapport avec la fenêtre.
    expect(isValidSlot({ ...base, localDate: "2026-06-09" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, localDate: "2026-06-13" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, localDate: "2026-10-25" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);

    // Découplage ancre/affichage : le MÊME instant, affiché 16:00 à Manille
    // (09:00 Algérie + 7 h), est parfaitement valide — 16:00 n'est refusé
    // ci-dessus QUE parce qu'Alger est l'ancre, pas une heure absolue.
    expect(
      isValidSlot(
        {
          timezone: "Asia/Manila",
          localDate: "2026-06-10",
          localHour: "16:00",
          instant: "2026-06-10T08:00:00.000Z",
        },
        WINDOW_JUIN,
        NOW_JUIN,
      ),
    ).toBe(true);
  });

  it("substitution de fuseau → false (le bon fuseau, lui, accepte)", () => {
    // 08:00Z s'affiche 09:00 à Alger et 10:00 à Paris (UTC+2 en juin).
    const instant = "2026-06-10T08:00:00.000Z";
    const bon: SlotRef = {
      timezone: "Europe/Paris",
      localDate: "2026-06-10",
      localHour: "10:00",
      instant,
    };
    expect(isValidSlot(bon, WINDOW_JUIN, NOW_JUIN)).toBe(true);

    // Même affichage parisien revendiqué « à Alger » : l'identité complète
    // (fuseau + affichage + instant) est exigée → refus.
    expect(isValidSlot({ ...bon, timezone: "Africa/Algiers" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    // Et l'inverse : l'affichage algérien du même instant, sous Paris → refus.
    expect(
      isValidSlot({ ...bon, timezone: "Europe/Paris", localHour: "09:00" }, WINDOW_JUIN, NOW_JUIN),
    ).toBe(false);
  });

  it("fuseau inconnu (« Mars/Olympus_Mons ») → [] / false, sans throw", () => {
    expect(() => getSlotsForWindow(WINDOW_JUIN, "Mars/Olympus_Mons", NOW_JUIN)).not.toThrow();
    expect(getSlotsForWindow(WINDOW_JUIN, "Mars/Olympus_Mons", NOW_JUIN)).toEqual([]);

    const ref: SlotRef = {
      timezone: "Mars/Olympus_Mons",
      localDate: "2026-06-10",
      localHour: "09:00",
      instant: "2026-06-10T08:00:00.000Z",
    };
    expect(() => isValidSlot(ref, WINDOW_JUIN, NOW_JUIN)).not.toThrow();
    expect(isValidSlot(ref, WINDOW_JUIN, NOW_JUIN)).toBe(false);
  });

  it("champs malformés ou fenêtre illisible → false", () => {
    const base: SlotRef = {
      timezone: "Africa/Algiers",
      localDate: "2026-06-10",
      localHour: "09:00",
      instant: "2026-06-10T08:00:00.000Z",
    };
    expect(isValidSlot(base, WINDOW_JUIN, NOW_JUIN)).toBe(true); // référence saine

    expect(isValidSlot(null as unknown as SlotRef, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, localDate: "10/06/2026" }, WINDOW_JUIN, NOW_JUIN)).toBe(false); // format
    expect(isValidSlot({ ...base, localHour: "9:00" }, WINDOW_JUIN, NOW_JUIN)).toBe(false); // padding requis
    expect(isValidSlot({ ...base, localHour: "14:30" }, WINDOW_JUIN, NOW_JUIN)).toBe(false); // pas publié (aligné :00)
    expect(isValidSlot({ ...base, instant: "pas-un-instant" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, instant: "" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, timezone: "" }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    expect(isValidSlot({ ...base, timezone: 42 as unknown as string }, WINDOW_JUIN, NOW_JUIN)).toBe(false);
    // Horloge serveur illisible → refus net (jamais d'acceptation aveugle).
    expect(isValidSlot(base, WINDOW_JUIN, new Date("invalid"))).toBe(false);

    // Fenêtre illisible : date civile impossible, liste vide, non-tableau.
    expect(isValidSlot(base, ["2026-06-31"], NOW_JUIN)).toBe(false);
    expect(isValidSlot(base, [], NOW_JUIN)).toBe(false);
    expect(isValidSlot(base, null as unknown as string[], NOW_JUIN)).toBe(false);
  });

  it("un créneau passé reste ACCEPTÉ (revalidation d'identité, pas d'horloge)", () => {
    const now = new Date("2026-10-29T00:00:00.000Z"); // fenêtre entièrement passée
    const slots = getSlotsForWindow(WINDOW_OCT, "Africa/Algiers", now);
    const passe = slots[0];

    expect(passe.past).toBe(true);
    expect(slots.every((slot) => slot.past)).toBe(true);
    // Le serveur revalide le CRENEAU (dates de la ligne + affichage +
    // instant), jamais le fait qu'il soit passé : rejeter ici créerait une
    // course client/serveur à la frontière de l'heure.
    expect(
      isValidSlot(
        {
          timezone: "Africa/Algiers",
          localDate: passe.localDate,
          localHour: passe.localHour,
          instant: passe.instant,
        },
        WINDOW_OCT,
        now,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toRecruiterTime — heure du candidat + équivalent Africa/Algiers (inchangé).
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
