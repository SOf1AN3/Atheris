/**
 * Atheris — barème de l'examen de recrutement (pipeline zero-interview).
 *
 * ⚑ MODULE PUR : aucune dépendance DB, aucun accès réseau — testable seul et
 * importable à la fois côté serveur (validation des réponses) et côté client
 * (rendu du formulaire). C'est VOLONTAIRE : le barème est la source de vérité
 * UNIQUE, pour qu'une question ne puisse jamais être acceptée par le serveur
 * alors qu'elle n'est pas affichée par le formulaire (ou l'inverse).
 *
 * ─── STRUCTURE ───────────────────────────────────────────────────────────────
 * 4 sections obligatoires, ~9 questions, cible 20–25 minutes :
 *   1. Sales & Objection Handling        — réflexes commerciaux (texte libre)
 *   2. Tech & Software Development       — sur-mesure vs constructeur, cadrage
 *   3. Prospecting & Lead Generation     — canaux, capacité, rythme
 *   4. Commission Model Agreement        — ÉLIMINATOIRE (binaire Oui/Non)
 *
 * ─── ARBITRAGES DE CONCEPTION ────────────────────────────────────────────────
 * • `questionId` = **clé stable** (`s1q1`, `s2q2`…), JAMAIS un index de
 *   position : le serveur stocke les réponses par cette clé (`exam_answers`).
 *   Réordonner ou injecter une question plus tard ne rend jamais interprétables
 *   les réponses déjà en base — la question 4 éliminatoire reste retrouvable.
 *
 * • **Aucune notation automatique** sur les sections 1 à 3 : le modèle est une
 *   revue manuelle par le CEO (« full quality control »). Le champ
 *   `recommended` sur une option n'est qu'un REPÈRE AFFICHÉ au CEO pendant la
 *   revue — il n'est jamais comparé au choix du candidat pour produire un score.
 *
 * • La section 4 porte le **modèle réel du moteur de commission**
 *   (`src/lib/commission.ts`) : barème progressif 10 % → 20 % par clients
 *   payants cumulés, versé à l'acompte, sans plafond. Ce n'est PAS un forfait
 *   fixe : un candidat signerait sinon un accord contredisant à la fois le
 *   moteur de paiement et le kit d'onboarding.
 */

import type { Locale } from "@/i18n/config";

// ---------------------------------------------------------------------------
// Constantes de parcours.
// ---------------------------------------------------------------------------

/** Cible de durée annoncée au candidat — INDICATIVE, jamais bloquante. */
export const EXAM_TARGET_MINUTES = 20;
/**borne haute de la fourchette annoncée. */
export const EXAM_MAX_MINUTES = 25;

/** Longueur maximale d'une réponse (alignée sur `messages.body`). */
export const EXAM_MAX_ANSWER_CHARS = 2000;

/** Longueur minimale d'une réponse longue — filtre le « je ne sais pas ». */
export const EXAM_MIN_TEXTAREA_CHARS = 40;

/** Les 4 sections obligatoires, dans l'ordre d'affichage. */
export const EXAM_SECTIONS = [1, 2, 3, 4] as const;
export type ExamSection = (typeof EXAM_SECTIONS)[number];

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

/**
 * Type de question.
 * - `textarea` : texte libre (sections 1–3), validé par longueur ;
 * - `choice`   : choix unique parmi `options` (section 2 et 3) ;
 * - `binary`   : Oui/Non — réservé à la section 4 éliminatoire.
 */
export type ExamQuestionKind = "textarea" | "choice" | "binary";

export type ExamOption = {
  /** Clé stable stockée en base (`exam_answers.answer`). */
  id: string;
  label: Record<Locale, string>;
  /**
   * Repère affiché au CEO pendant la revue (✓). JAMAIS comparé au choix du
   * candidat : sections 1–3 non notées automatiquement.
   */
  recommended?: boolean;
};

export type ExamQuestion = {
  /** Clé stable — voir note d'arbitrage en tête de fichier. */
  id: string;
  section: ExamSection;
  kind: ExamQuestionKind;
  prompt: Record<Locale, string>;
  /** Consigne de longueur, affichée sous l'intitulé. */
  hint?: Record<Locale, string>;
  /** Présent si et seulement si `kind === "choice" | "binary"`. */
  options?: readonly ExamOption[];
  /** Présent si et seulement si `kind === "textarea"`. */
  minLength?: number;
  maxLength: number;
  /** Section 4 : une réponse autre que `yes` fait échouer l'examen. */
  eliminatory?: boolean;
};

// ---------------------------------------------------------------------------
// Consignes réutilisées.
// ---------------------------------------------------------------------------

const HINT_SENTENCES: Record<Locale, string> = {
  fr: "Réponse attendue : deux à quatre phrases.",
  en: "Expected answer: two to four sentences.",
};

const HINT_CONCRETE: Record<Locale, string> = {
  fr: "Réponse attendue : soyez concret et spécifique — deux à quatre phrases.",
  en: "Expected answer: be concrete and specific — two to four sentences.",
};

/** Options binaire communes (section 4). */
const BINARY_OPTIONS: readonly ExamOption[] = [
  { id: "yes", label: { fr: "Oui, je confirme", en: "Yes, I confirm" } },
  { id: "no", label: { fr: "Non", en: "No" } },
];

// ---------------------------------------------------------------------------
// Le barème.
// ---------------------------------------------------------------------------

export const EXAM_QUESTIONS: readonly ExamQuestion[] = [
  // ── Section 1 — Sales & Objection Handling ────────────────────────────────
  {
    id: "s1q1",
    section: 1,
    kind: "textarea",
    prompt: {
      fr: "Un prospect vous écrit : « Votre devis est trois fois plus cher qu'un freelance. » Rédigez la réponse que vous lui enverriez.",
      en: "A prospect writes to you: “Your quote is three times what a freelancer quoted me.” Write the response you would send.",
    },
    hint: HINT_SENTENCES,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },
  {
    id: "s1q2",
    section: 1,
    kind: "textarea",
    prompt: {
      fr: "Un prospect répond : « Nous avons déjà un site, et déjà une agence. Pourquoi changer ? » Rédigez votre réponse.",
      en: "A prospect replies: “We already have a website, and already an agency. Why would we change?” Write your reply.",
    },
    hint: HINT_SENTENCES,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },
  {
    id: "s1q3",
    section: 1,
    kind: "textarea",
    prompt: {
      fr: "Un prospect est manifestement intéressé mais conclut par : « Revenez vers moi dans six mois. » Que lui écrivez-vous ?",
      en: "A prospect is clearly interested but ends with: “Come back to me in six months.” What do you write?",
    },
    hint: HINT_SENTENCES,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },

  // ── Section 2 — Tech & Software Development ───────────────────────────────
  {
    id: "s2q1",
    section: 2,
    kind: "choice",
    prompt: {
      fr: "Un prospect hésite entre un site fait sur Wix ou Shopify et une application sur mesure. Quelle position adoptez-vous ?",
      en: "A prospect is hesitating between a Wix or Shopify site and a custom application. What position do you take?",
    },
    options: [
      {
        id: "nuanced",
        label: {
          fr: "Expliquer qu'un sur-mesure se justifie par un besoin précis — propriété, intégrations, workflow spécifique — et reconnaître honnêtement qu'un constructeur suffit pour les besoins simples.",
          en: "Explain that a custom build is justified by a specific need — ownership, integrations, a specific workflow — and honestly acknowledge that a builder is enough for simpler needs.",
        },
        recommended: true,
      },
      {
        id: "absolute",
        label: {
          fr: "Affirmer que le sur-mesure est toujours supérieur et qu'un constructeur produit de mauvais résultats.",
          en: "State that custom is always superior and that builders produce poor results.",
        },
      },
      {
        id: "cheapest",
        label: {
          fr: "Recommander la solution la moins chère et laisser le prospect décider seul.",
          en: "Recommend the cheapest option and let the prospect decide alone.",
        },
      },
      {
        id: "evade",
        label: {
          fr: "Esquiver la question et parler de notre stack technique.",
          en: "Sidestep the question and talk about our technology stack instead.",
        },
      },
    ],
    minLength: undefined,
    maxLength: 0,
  },
  {
    id: "s2q2",
    section: 2,
    kind: "textarea",
    prompt: {
      fr: "Pendant un appel de découverte, un prospect décrit un besoin flou et demande « combien ça coûte ? » sans périmètre défini. Quels éléments cherchez-vous à cadrer avant de chiffrer, et comment ?",
      en: "During a discovery call, a prospect describes a vague need and asks “how much does it cost?” with no scope defined. What do you try to frame before quoting, and how?",
    },
    hint: HINT_CONCRETE,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },
  {
    id: "s2q3",
    section: 2,
    kind: "textarea",
    prompt: {
      fr: "En fin d'appel, un prospect vous demande d'ajouter une fonctionnalité complexe et demande « est-ce faisable en deux semaines ? » sans étude. Que répondez-vous ?",
      en: "At the end of a call, a prospect asks you to add a complex feature and asks “can this be done in two weeks?” with no study. What do you answer?",
    },
    hint: HINT_CONCRETE,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },

  // ── Section 3 — Prospecting & Lead Generation ─────────────────────────────
  {
    id: "s3q1",
    section: 3,
    kind: "textarea",
    prompt: {
      fr: "Quels canaux comptez-vous utiliser pour identifier et contacter des décideurs (CEO, fondateurs, COO) sur des marchés internationaux ? Décrivez votre approche concrète.",
      en: "Which channels will you use to identify and reach decision-makers (CEOs, founders, COOs) in international markets? Describe your concrete approach.",
    },
    hint: HINT_CONCRETE,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },
  {
    id: "s3q2",
    section: 3,
    kind: "choice",
    prompt: {
      fr: "Quelle disponibilité hebdomadaire RÉELLE pouvez-vous consacrer à la prospection ?",
      en: "What REALISTIC weekly availability can you dedicate to prospecting?",
    },
    options: [
      { id: "lt5", label: { fr: "Moins de 5 h par semaine", en: "Less than 5 hours per week" } },
      { id: "5to10", label: { fr: "5 à 10 h par semaine", en: "5 to 10 hours per week" } },
      { id: "10to20", label: { fr: "10 à 20 h par semaine", en: "10 to 20 hours per week" } },
      { id: "fulltime", label: { fr: "Temps plein (40 h et plus)", en: "Full-time (40 hours or more)" } },
    ],
    maxLength: 0,
  },
  {
    id: "s3q3",
    section: 3,
    kind: "textarea",
    prompt: {
      fr: "Décrivez votre rythme de prospection hebdomadaire : combien de nouveaux contacts, combien de relances, et comment organisez-vous votre suivi ?",
      en: "Describe your weekly prospecting rhythm: how many new contacts, how many follow-ups, and how do you organise your follow-up?",
    },
    hint: HINT_CONCRETE,
    minLength: EXAM_MIN_TEXTAREA_CHARS,
    maxLength: EXAM_MAX_ANSWER_CHARS,
  },

  // ── Section 4 — Commission Model Agreement (ÉLIMINATOIRE) ─────────────────
  {
    id: "s4q1",
    section: 4,
    kind: "binary",
    eliminatory: true,
    prompt: {
      fr: "Confirmez-vous avoir compris, et acceptez-vous, le modèle de rémunération suivant : 100 % à la commission, avec un taux progressif de 10 % à 20 % selon votre nombre cumulé de clients payants, versé dès réception de l'acompte du client, et sans plafond de gains ?",
      en: "Do you confirm that you understand, and accept, the following compensation model: 100% commission-based, with a progressive rate of 10% to 20% depending on your cumulative number of paid clients, paid upon receipt of the client's down payment, with no ceiling on earnings?",
    },
    options: BINARY_OPTIONS,
    maxLength: 0,
  },
] as const;

// ---------------------------------------------------------------------------
// Constantes dérivées du barème.
// ---------------------------------------------------------------------------

/** ID de la question éliminatoire (section 4). */
export const ELIMINATORY_QUESTION_ID = "s4q1";
/** Seule réponse qui NE fait PAS échouer l'examen. */
export const ELIMINATORY_ACCEPTED_ANSWER = "yes";

/**
 * Longueur du jeton d'accès en bytes (32 → 64 chars hex), et motif de
 * validation. Miroir strict de `interviews.token` : le jeton est la SEULE
 * clé d'accès à une session — jamais un id d'application (public et
 * devinable), d'où cette entropie (2^256, zéro énumération possible).
 */
export const EXAM_TOKEN_BYTES = 32;
export const EXAM_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/** Toutes les questions d'une section, dans l'ordre du barème. */
export function questionsForSection(section: ExamSection): ExamQuestion[] {
  return EXAM_QUESTIONS.filter((question) => question.section === section);
}

/**
 * URL relative du parcours d'examen (locale incluse).
 *
 * Vit ici (module pur) et non dans `src/actions/exams.ts` : un fichier
 * `"use server"` n'autorise que des fonctions **async**, une constante ou un
 * helper sync y ferait échouer le build RSC — alors même que `tsc` passe,
 * puisque la contrainte n'est pas exprimée par les types.
 */
export function examRelativeUrl(token: string, locale: string): string {
  return `/${locale}/examen/${token}`;
}

/** Titre court d'une section (libellé d'entête de page). */
export const SECTION_TITLES: Record<ExamSection, Record<Locale, string>> = {
  1: { fr: "Ventes & gestion des objections", en: "Sales & objection handling" },
  2: { fr: "Qualification technique", en: "Tech & software development" },
  3: { fr: "Prospection & génération de leads", en: "Prospecting & lead generation" },
  4: { fr: "Modèle de commission", en: "Commission model agreement" },
};

/**
 * Vérifie qu'un jeu de réponses correspond EXACTEMENT aux questions d'une
 * section donnée du barème.
 *
 * C'est le garde anti-injection de l'autosauvegarde : une question inconnue
 * (forgée) ou une question d'une AUTRE section est rejetée. Sans ce contrôle,
 * un client compromis écrirait la réponse de la section 4 (éliminatoire) en
 * appelant la section 2. Le serveur n'écrit jamais ce qu'il n'expose pas.
 *
 * @param section Section attendue (1–4).
 * @param answers Clés reçues — seules ces clés sont examinées.
 * @returns `true` si les clés reçues sont exactement les `questionId` de la
 *   section, dans n'importe quel ordre.
 */
export function sectionAnswersAreCoherent(
  section: ExamSection,
  answers: Readonly<Record<string, string>>,
): boolean {
  const expected = questionsForSection(section);
  const received = Object.keys(answers);
  // Même cardinal ET mêmes clés : ni question étrangère, ni question fantôme.
  if (received.length !== expected.length) return false;
  return expected.every((question) => received.includes(question.id));
}

// ---------------------------------------------------------------------------
// Validation — pure, sans Zod (codes métier explicites, zéro couplage).
// ---------------------------------------------------------------------------

export type AnswerValidity =
  | { valid: true }
  | { valid: false; code: "required" | "too_short" | "too_long" | "unknown_option" };

/**
 * Valide une réponse selon la question posée.
 *
 * @param question Question du barème.
 * @param rawAnswer Réponse brute (chaîne normalisée par l'appelant : trim).
 */
export function validateAnswer(
  question: ExamQuestion,
  rawAnswer: string | undefined | null,
): AnswerValidity {
  const answer = (rawAnswer ?? "").trim();

  // Binaire et choix unique : la valeur doit être une clé d'option connue.
  if (question.kind === "binary" || question.kind === "choice") {
    if (answer.length === 0) return { valid: false, code: "required" };
    const known = question.options?.some((option) => option.id === answer) === true;
    if (!known) return { valid: false, code: "unknown_option" };
    return { valid: true };
  }

  // Texte libre.
  if (answer.length === 0) return { valid: false, code: "required" };
  if (answer.length > question.maxLength) return { valid: false, code: "too_long" };
  if (question.minLength !== undefined && answer.length < question.minLength) {
    return { valid: false, code: "too_short" };
  }
  return { valid: true };
}

/**
 * La session est-elle COMPLÈTE (toutes les questions du barème répondues) ?
 *
 * Une soumission incomplète est refusée par l'action : le candidat revient à la
 * section manquante plutôt que de voir son examen évalué à moitié.
 *
 * @param answers Map `questionId` → réponse.
 */
export function isExamComplete(answers: ReadonlyMap<string, string>): boolean {
  return EXAM_QUESTIONS.every((question) => {
    const answer = answers.get(question.id);
    return validateAnswer(question, answer).valid;
  });
}

/**
 * Échec ÉLIMINATOIRE de la section 4.
 *
 * Retourne `true` uniquement si la question éliminatoire a été **répondue** par
 * autre chose que `yes`. Une question non répondue n'est PAS un échec ici :
 * c'est une soumission incompleinte, refusée en amont par `isExamComplete`.
 *
 * @param answers Map `questionId` → réponse.
 */
export function isEliminatoryFailure(answers: ReadonlyMap<string, string>): boolean {
  const answer = (answers.get(ELIMINATORY_QUESTION_ID) ?? "").trim();
  if (answer.length === 0) return false;
  return answer !== ELIMINATORY_ACCEPTED_ANSWER;
}
