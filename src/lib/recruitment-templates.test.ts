/**
 * Atheris — tests unitaires des modèles d'e-mail de recrutement (refus CEO).
 *
 * 100 % pur : **aucun appel `getDb()`**, aucune DB (règle DB-PENDING).
 * Import relatif volontaire (pas d'alias `@/`) : le fichier tourne sous
 * `vitest run` sans configuration de résolution d'alias.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteInterviewUrl, DEFAULT_EMAIL_TEMPLATES, renderTemplate } from "./recruitment-templates";

describe("DEFAULT_EMAIL_TEMPLATES", () => {
  it("existe pour le kind reject × 2 locales (sujets et corps non vides)", () => {
    for (const locale of ["fr", "en"] as const) {
      const template = DEFAULT_EMAIL_TEMPLATES.reject[locale];
      expect(template.subject.length).toBeGreaterThan(0);
      expect(template.body.length).toBeGreaterThan(0);
    }
  });

  it("le modèle reject contient le placeholder {{prenom}}", () => {
    for (const locale of ["fr", "en"] as const) {
      expect(DEFAULT_EMAIL_TEMPLATES.reject[locale].body).toContain("{{prenom}}");
    }
  });

  it("le modèle reject ne contient PAS {{lien}} (aucun lien dans un refus)", () => {
    expect(DEFAULT_EMAIL_TEMPLATES.reject.fr.body).not.toContain("{{lien}}");
    expect(DEFAULT_EMAIL_TEMPLATES.reject.en.body).not.toContain("{{lien}}");
  });
});

describe("renderTemplate", () => {
  it("remplace les 3 placeholders {{prenom}}, {{nom}} et {{lien}}", () => {
    const out = renderTemplate("Bonjour {{prenom}} {{nom}} — {{lien}}", {
      prenom: "Ada",
      nom: "Lovelace",
      lien: "https://ex.com/lien",
    });
    expect(out).toBe("Bonjour Ada Lovelace — https://ex.com/lien");
    expect(out).not.toContain("{{");
  });

  it("remplace un placeholder plusieurs fois (remplacement global)", () => {
    const out = renderTemplate("{{prenom}} / {{prenom}}", { prenom: "Ada", nom: "L" });
    expect(out).toBe("Ada / Ada");
  });

  it("réinjecte le lien supprimé du corps en fin de message", () => {
    const out = renderTemplate("Bonjour {{prenom}},\n\nCorps sans placeholder de lien.", {
      prenom: "Ada",
      nom: "Lovelace",
      lien: "https://ex.com/lien",
    });
    expect(out.endsWith("\nhttps://ex.com/lien")).toBe(true);
    expect(out).toContain("https://ex.com/lien");
  });

  it("laisse intact un placeholder inconnu du corps ({{nom}} absent)", () => {
    // `{{nom}}` n'est pas dans le corps → aucune trace de la valeur, aucun
    // remplacement fantôme ni de crash.
    const out = renderTemplate("Bonjour {{prenom}}, {{ville}}.", {
      prenom: "Ada",
      nom: "Lovelace",
    });
    expect(out).toBe("Bonjour Ada, {{ville}}.");
  });

  it("sans `lien`, le placeholder {{lien}} est préservé tel quel", () => {
    const out = renderTemplate("Choisissez : {{lien}}", { prenom: "Ada", nom: "Lovelace" });
    expect(out).toBe("Choisissez : {{lien}}");
  });

  it("sans `lien` et sans placeholder, le corps revient identique", () => {
    const body = "Aucun placeholder ici.";
    expect(renderTemplate(body, { prenom: "Ada", nom: "Lovelace" })).toBe(body);
  });
});

describe("absoluteInterviewUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retire les slashs finaux de SITE_URL avant concaténation", () => {
    vi.stubEnv("SITE_URL", "https://ex.com///");
    expect(absoluteInterviewUrl("/fr/invitation/abc")).toBe("https://ex.com/fr/invitation/abc");
  });

  it("concatène tel quel si SITE_URL n'a pas de slash final", () => {
    vi.stubEnv("SITE_URL", "https://ex.com");
    expect(absoluteInterviewUrl("/en/invitation/abc")).toBe("https://ex.com/en/invitation/abc");
  });

  it("replie sur le domaine de production sans SITE_URL", () => {
    vi.stubEnv("SITE_URL", "");
    expect(absoluteInterviewUrl("/fr/invitation/abc")).toBe(
      "https://atheris-labs.sofianeasma.me/fr/invitation/abc",
    );
  });

  it("replie aussi si SITE_URL n'est qu'une chaîne d'espaces", () => {
    vi.stubEnv("SITE_URL", "   ");
    expect(absoluteInterviewUrl("/fr/invitation/abc")).toBe(
      "https://atheris-labs.sofianeasma.me/fr/invitation/abc",
    );
  });
});

/**
 * Modèles d'examen (zero-interview) — envoyés AUTOMATIQUEMENT à la
 * soumission, sans intervention CEO. Ils portent la décision au candidat :
 * un texte manquant ou un placeholder non résolu s'y lit comme un défaut.
 */
describe("modèles d'examen (exam_passed / exam_failed)", () => {
  const KINDS = ["exam_passed", "exam_failed"] as const;
  const LOCALES = ["fr", "en"] as const;

  it("4 modèles présents (2 kinds × 2 locales), sujet + corps non vides", () => {
    for (const kind of KINDS) {
      for (const locale of LOCALES) {
        const tpl = DEFAULT_EMAIL_TEMPLATES[kind][locale];
        expect(tpl.subject.length, `${kind}/${locale} subject`).toBeGreaterThan(0);
        expect(tpl.body.length, `${kind}/${locale} body`).toBeGreaterThan(0);
      }
    }
  });

  it("aucun `{{lien}}` : l'e-mail part SANS lien (l'écran de confirmation suffit)", () => {
    for (const kind of KINDS) {
      for (const locale of LOCALES) {
        expect(DEFAULT_EMAIL_TEMPLATES[kind][locale].body, `${kind}/${locale}`).not.toContain(
          "{{lien}}",
        );
      }
    }
  });

  it("`{{prenom}}` est présent et se résout sans laisser de placeholder", () => {
    for (const kind of KINDS) {
      const body = DEFAULT_EMAIL_TEMPLATES[kind].fr.body;
      expect(body).toContain("{{prenom}}");
      const rendered = renderTemplate(body, { prenom: "Ada", nom: "Lovelace" });
      expect(rendered).toContain("Ada");
      expect(rendered).not.toContain("{{prenom}}");
    }
  });

  it("succès et échec portent des messages DISTINCTS", () => {
    expect(DEFAULT_EMAIL_TEMPLATES.exam_passed.fr.subject).not.toBe(
      DEFAULT_EMAIL_TEMPLATES.exam_failed.fr.subject,
    );
    expect(DEFAULT_EMAIL_TEMPLATES.exam_passed.en.subject).not.toBe(
      DEFAULT_EMAIL_TEMPLATES.exam_failed.en.subject,
    );
    expect(DEFAULT_EMAIL_TEMPLATES.exam_failed.fr.body).toContain("commission");
  });

  it("le succès annonce la revue sous 24 h (engagement du parcours)", () => {
    for (const locale of LOCALES) {
      expect(DEFAULT_EMAIL_TEMPLATES.exam_passed[locale].body, locale).toMatch(
        /24 h|24 hours/,
      );
    }
  });

  it("4 kinds × 2 locales = 8 modèles au total", () => {
    expect(Object.keys(DEFAULT_EMAIL_TEMPLATES).sort()).toEqual(
      ["exam_failed", "exam_invite", "exam_passed", "reject"].sort(),
    );
  });
});

/**
 * `exam_invite` — porte le LIEN D'EXAMEN au candidat (et non d'entretien).
 * Seul kind du parcours qui contient `{{lien}}` : si le placeholder disparaît,
 * `renderTemplate` le réinjecte, mais le message doit annoncer la fenêtre
 * de 3 jours, sinon le candidat ignore la deadline.
 */
describe("modèle exam_invite (lien d'examen)", () => {
  const LOCALES = ["fr", "en"] as const;

  it("contient `{{lien}}` (le lien est le cœur du message)", () => {
    for (const locale of LOCALES) {
      expect(DEFAULT_EMAIL_TEMPLATES.exam_invite[locale].body, locale).toContain("{{lien}}");
    }
  });

  it("annonce la fenêtre de 3 jours dans les deux langues", () => {
    expect(DEFAULT_EMAIL_TEMPLATES.exam_invite.fr.body).toContain("3 JOURS");
    expect(DEFAULT_EMAIL_TEMPLATES.exam_invite.en.body).toContain("3 DAYS");
  });

  it("précise qu'il n'y a PAS d'entretien vidéo (changement de parcours)", () => {
    expect(DEFAULT_EMAIL_TEMPLATES.exam_invite.fr.body).toMatch(/pas d'entretien/);
    expect(DEFAULT_EMAIL_TEMPLATES.exam_invite.en.body).toMatch(/no video interview/);
  });

  it("`{{lien}}` se remplace et le lien est rendu", () => {
    const rendered = renderTemplate(DEFAULT_EMAIL_TEMPLATES.exam_invite.en.body, {
      prenom: "Ada",
      nom: "Lovelace",
      lien: "https://example.com/en/examen/abc",
    });
    expect(rendered).toContain("https://example.com/en/examen/abc");
    expect(rendered).not.toContain("{{lien}}");
    expect(rendered).toContain("Ada");
  });
});
