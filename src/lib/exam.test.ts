/**
 * Tests du barème d'examen — priorité absolue sur la section 4 éliminatoire :
 * une régression silencieuse laisserait passer un candidat qui refuse le
 * modèle de commission.
 */
import { describe, expect, it } from "vitest";

import {
  ELIMINATORY_ACCEPTED_ANSWER,
  ELIMINATORY_QUESTION_ID,
  EXAM_QUESTIONS,
  EXAM_LINK_VALIDITY_DAYS,
  EXAM_MAX_ANSWER_CHARS,
  EXAM_MIN_TEXTAREA_CHARS,
  EXAM_SECTIONS,
  SECTION_TITLES,
  examExpiryFrom,
  isExamComplete,
  isExamExpired,
  isEliminatoryFailure,
  questionsForSection,
  sectionAnswersAreCoherent,
  validateAnswer,
  type ExamQuestion,
} from "./exam";

/** Construit une map de réponses valides pour TOUT le barème. */
function completeAnswers(overrides: Record<string, string> = {}): Map<string, string> {
  const map = new Map<string, string>();
  for (const q of EXAM_QUESTIONS) {
    if (q.kind === "textarea") {
      map.set(q.id, "Une réponse suffisamment longue pour satisfaire au minimum.");
    } else if (q.kind === "choice") {
      map.set(q.id, q.options?.[0]?.id ?? "");
    } else {
      map.set(q.id, "yes");
    }
  }
  for (const [key, value] of Object.entries(overrides)) map.set(key, value);
  return map;
}

const byId = (id: string): ExamQuestion => {
  const found = EXAM_QUESTIONS.find((q) => q.id === id);
  if (!found) throw new Error(`question introuvable: ${id}`);
  return found;
};

describe("intégrité du barème", () => {
  it("les questionId sont uniques (clé de stockage en base)", () => {
    const ids = EXAM_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque question appartient à une section valide", () => {
    for (const q of EXAM_QUESTIONS) expect(EXAM_SECTIONS).toContain(q.section);
  });

  it("chaque section est représentée", () => {
    for (const s of EXAM_SECTIONS) expect(questionsForSection(s).length).toBeGreaterThan(0);
  });

  it("chaque section a un titre FR et EN", () => {
    for (const s of EXAM_SECTIONS) {
      expect(SECTION_TITLES[s].fr.length).toBeGreaterThan(0);
      expect(SECTION_TITLES[s].en.length).toBeGreaterThan(0);
    }
  });

  it("chaque question a un intitulé FR et EN", () => {
    for (const q of EXAM_QUESTIONS) {
      expect(q.prompt.fr.length).toBeGreaterThan(0);
      expect(q.prompt.en.length).toBeGreaterThan(0);
    }
  });

  it("une question à options porte des options ; une textarea n'en porte pas", () => {
    for (const q of EXAM_QUESTIONS) {
      if (q.kind === "textarea") {
        expect(q.options).toBeUndefined();
        expect(q.minLength).toBeGreaterThan(0);
        expect(q.maxLength).toBeGreaterThan(0);
      } else {
        expect((q.options?.length ?? 0)).toBeGreaterThan(1);
      }
    }
  });

  it("les options portent un label FR et EN", () => {
    for (const q of EXAM_QUESTIONS) {
      for (const opt of q.options ?? []) {
        expect(opt.label.fr.length).toBeGreaterThan(0);
        expect(opt.label.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("les questionId suivent la convention s<section>q<n>", () => {
    for (const q of EXAM_QUESTIONS) {
      expect(q.id).toMatch(new RegExp(`^s${q.section}q\\d+$`));
    }
  });
});

describe("section 4 — éliminatoire", () => {
  it("porte bien l'ID attendu", () => {
    expect(byId(ELIMINATORY_QUESTION_ID).section).toBe(4);
  });

  it("est binaire ET marquée éliminatoire", () => {
    const q = byId(ELIMINATORY_QUESTION_ID);
    expect(q.kind).toBe("binary");
    expect(q.eliminatory).toBe(true);
  });

  it("propose exactement oui/non", () => {
    const ids = byId(ELIMINATORY_QUESTION_ID).options?.map((o) => o.id);
    expect(ids).toEqual(["yes", "no"]);
  });

  it("seule la section 4 est éliminatoire", () => {
    const eliminatory = EXAM_QUESTIONS.filter((q) => q.eliminatory === true);
    expect(eliminatory).toHaveLength(1);
    expect(eliminatory[0]?.id).toBe(ELIMINATORY_QUESTION_ID);
  });

  it("ACCEPTÉE sur « yes »", () => {
    expect(isEliminatoryFailure(completeAnswers({ s4q1: "yes" }))).toBe(false);
  });

  it("ÉCHEC sur « no »", () => {
    expect(isEliminatoryFailure(completeAnswers({ s4q1: "no" }))).toBe(true);
  });

  it("échec sur toute valeur hors liste", () => {
    for (const bad of ["maybe", "YES", "Yes", "1", "true", "non", "y"]) {
      expect(isEliminatoryFailure(completeAnswers({ s4q1: bad }))).toBe(true);
    }
  });

  it("NON répondue ≠ échec (c'est une soumission incomplète, gérée en amont)", () => {
    const answers = completeAnswers();
    answers.delete(ELIMINATORY_QUESTION_ID);
    expect(isEliminatoryFailure(answers)).toBe(false);
    // ... mais la session est alors incomplète.
    expect(isExamComplete(answers)).toBe(false);
  });

  it("une valeur vide ou blanche n'est pas un échec", () => {
    expect(isEliminatoryFailure(completeAnswers({ s4q1: "" }))).toBe(false);
    expect(isEliminatoryFailure(completeAnswers({ s4q1: "   " }))).toBe(false);
  });

  it("ELIMINATORY_ACCEPTED_ANSWER est bien « yes »", () => {
    expect(ELIMINATORY_ACCEPTED_ANSWER).toBe("yes");
  });
});

describe("expiration du lien (D6 — fenêtre 3 j)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("EXAM_LINK_VALIDITY_DAYS vaut bien 3", () => {
    expect(EXAM_LINK_VALIDITY_DAYS).toBe(3);
  });

  it("examExpiryFrom ajoute exactement 3 jours", () => {
    const start = new Date("2026-01-01T10:00:00.000Z");
    const expiry = examExpiryFrom(start);
    expect(expiry.getTime() - start.getTime()).toBe(3 * DAY);
  });

  it("accepte une chaîne ISO et renvoie un Date (typage Drizzle)", () => {
    const expiry = examExpiryFrom("2026-01-01T10:00:00.000Z");
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.toISOString()).toBe("2026-01-04T10:00:00.000Z");
  });

  it("n'est jamais expirée avant l'échéance", () => {
    const expiry = examExpiryFrom(new Date("2026-01-01T10:00:00Z"));
    expect(isExamExpired(expiry, new Date("2026-01-04T09:59:59Z"))).toBe(false);
  });

  it("est expirée à l'échéance exacte (borne stricte : après)", () => {
    const expiry = examExpiryFrom(new Date("2026-01-01T10:00:00Z"));
    // À la seconde exacte : encore valide ; une seconde plus tard, non.
    expect(isExamExpired(expiry, new Date("2026-01-04T10:00:00Z"))).toBe(false);
    expect(isExamExpired(expiry, new Date("2026-01-04T10:00:01Z"))).toBe(true);
  });

  it("`null` = session héritée : JAMAIS expirée", () => {
    expect(isExamExpired(null, new Date("2099-01-01"))).toBe(false);
  });

  it("accepte une Date ou une ISO pour le contrôle", () => {
    const d = new Date("2020-01-01T00:00:00Z");
    expect(isExamExpired(d, new Date("2026-01-01"))).toBe(true);
    expect(isExamExpired(d.toISOString(), new Date("2026-01-01"))).toBe(true);
  });

  it("une chaîne illisible n'expire JAMAIS (repli sûr, jamais de blocage)", () => {
    expect(isExamExpired("pas-une-date", new Date())).toBe(false);
  });
});

describe("validateAnswer", () => {
  it("texte : refus si absent", () => {
    expect(validateAnswer(byId("s1q1"), undefined)).toEqual({ valid: false, code: "required" });
    expect(validateAnswer(byId("s1q1"), "")).toEqual({ valid: false, code: "required" });
    expect(validateAnswer(byId("s1q1"), "   ")).toEqual({ valid: false, code: "required" });
  });

  it("texte : refus si trop court", () => {
    const short = "x".repeat(EXAM_MIN_TEXTAREA_CHARS - 1);
    expect(validateAnswer(byId("s1q1"), short)).toEqual({ valid: false, code: "too_short" });
  });

  it("texte : accepté à la longueur minimale exacte", () => {
    const exact = "x".repeat(EXAM_MIN_TEXTAREA_CHARS);
    expect(validateAnswer(byId("s1q1"), exact)).toEqual({ valid: true });
  });

  it("texte : refus si trop long", () => {
    const long = "x".repeat(EXAM_MAX_ANSWER_CHARS + 1);
    expect(validateAnswer(byId("s1q1"), long)).toEqual({ valid: false, code: "too_long" });
  });

  it("texte : le trim est appliqué avant mesure", () => {
    const padded = `  ${"x".repeat(EXAM_MIN_TEXTAREA_CHARS)}  `;
    expect(validateAnswer(byId("s1q1"), padded)).toEqual({ valid: true });
  });

  it("choix : accepté si clé connue", () => {
    expect(validateAnswer(byId("s2q1"), "nuanced")).toEqual({ valid: true });
    expect(validateAnswer(byId("s3q2"), "fulltime")).toEqual({ valid: true });
  });

  it("choix : refus si clé inconnue", () => {
    expect(validateAnswer(byId("s2q1"), "autre")).toEqual({
      valid: false,
      code: "unknown_option",
    });
  });

  it("choix : refus si vide", () => {
    expect(validateAnswer(byId("s2q1"), "")).toEqual({ valid: false, code: "required" });
  });

  it("binaire : accepté sur yes et no uniquement", () => {
    const q = byId(ELIMINATORY_QUESTION_ID);
    expect(validateAnswer(q, "yes")).toEqual({ valid: true });
    expect(validateAnswer(q, "no")).toEqual({ valid: true });
    expect(validateAnswer(q, "maybe")).toEqual({ valid: false, code: "unknown_option" });
  });

  it("gère null et undefined sans throw", () => {
    expect(validateAnswer(byId("s1q1"), null)).toEqual({ valid: false, code: "required" });
  });
});

describe("isExamComplete", () => {
  it("vrai sur des réponses complètes", () => {
    expect(isExamComplete(completeAnswers())).toBe(true);
  });

  it("faux dès qu'une question manque", () => {
    const answers = completeAnswers();
    answers.delete("s2q2");
    expect(isExamComplete(answers)).toBe(false);
  });

  it("faux si une réponse est trop courte", () => {
    expect(isExamComplete(completeAnswers({ s1q1: "court" }))).toBe(false);
  });

  it("faux si une option est inconnue", () => {
    expect(isExamComplete(completeAnswers({ s3q2: "inconnue" }))).toBe(false);
  });

  it("faux sur une map vide", () => {
    expect(isExamComplete(new Map())).toBe(false);
  });
});

describe("sectionAnswersAreCoherent — garde anti-injection", () => {
  it("accepte les clés EXACTES d'une section, quel que soit l'ordre", () => {
    const section1 = questionsForSection(1);
    const shuffled = Object.fromEntries(
      [...section1].reverse().map((q) => [q.id, "une réponse valide suffisamment longue"]),
    );
    expect(sectionAnswersAreCoherent(1, shuffled)).toBe(true);
  });

  it("refuse une question d'une AUTRE section (vol de la section 4)", () => {
    // Toutes les questions de la section 1 + `s4q1` en plus.
    const forged: Record<string, string> = {};
    for (const q of questionsForSection(1)) forged[q.id] = "réponse valide suffisante";
    forged[ELIMINATORY_QUESTION_ID] = "yes";
    // Cardinal différent → rejet (même si une clé manque, le compteur trahit).
    expect(sectionAnswersAreCoherent(1, forged)).toBe(false);
  });

  it("refuse une clé de section 4 substituée à une vraie question", () => {
    const section2 = questionsForSection(2);
    const forged: Record<string, string> = {};
    for (const q of section2) forged[q.id] = "réponse valide suffisante";
    // Remplace la DERNIÈRE question de la section 2 par la question éliminatoire.
    const last = section2[section2.length - 1];
    if (last) delete forged[last.id];
    forged[ELIMINATORY_QUESTION_ID] = "yes";
    expect(sectionAnswersAreCoherent(2, forged)).toBe(false);
  });

  it("refuse une question inconnue (fantôme hors barème)", () => {
    const forged: Record<string, string> = {};
    for (const q of questionsForSection(3)) forged[q.id] = "réponse valide suffisante";
    forged.s9q9 = "réponse valide suffisante";
    expect(sectionAnswersAreCoherent(3, forged)).toBe(false);
  });

  it("refuse une section incomplète", () => {
    const section1 = questionsForSection(1);
    const partial: Record<string, string> = {};
    for (const q of section1.slice(0, -1)) partial[q.id] = "réponse valide suffisante";
    expect(sectionAnswersAreCoherent(1, partial)).toBe(false);
  });

  it("refuse une map vide", () => {
    expect(sectionAnswersAreCoherent(1, {})).toBe(false);
  });

  it("chaque section est cohérente avec elle-même (barème non vide)", () => {
    for (const s of EXAM_SECTIONS) {
      const answers: Record<string, string> = {};
      for (const q of questionsForSection(s)) answers[q.id] = "réponse valide suffisante";
      expect(sectionAnswersAreCoherent(s, answers)).toBe(true);
    }
  });
});
