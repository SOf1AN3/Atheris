/**
 * Atheris — tests unitaires des modèles d'e-mail de recrutement (invite /
 * reject).
 *
 * 100 % pur : **aucun appel `getDb()`**, aucune DB (règle DB-PENDING).
 * Import relatif volontaire (pas d'alias `@/`) : le fichier tourne sous
 * `vitest run` sans configuration de résolution d'alias.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteInterviewUrl, DEFAULT_EMAIL_TEMPLATES, renderTemplate } from "./recruitment-templates";

describe("DEFAULT_EMAIL_TEMPLATES", () => {
  it("existe pour les 2 kinds × 2 locales (sujets et corps non vides)", () => {
    for (const kind of ["invite", "reject"] as const) {
      for (const locale of ["fr", "en"] as const) {
        const template = DEFAULT_EMAIL_TEMPLATES[kind][locale];
        expect(template.subject.length).toBeGreaterThan(0);
        expect(template.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("tous les modèles contiennent le placeholder {{prenom}}", () => {
    for (const kind of ["invite", "reject"] as const) {
      for (const locale of ["fr", "en"] as const) {
        expect(DEFAULT_EMAIL_TEMPLATES[kind][locale].body).toContain("{{prenom}}");
      }
    }
  });

  it("le modèle invite contient {{lien}}, le modèle reject non", () => {
    expect(DEFAULT_EMAIL_TEMPLATES.invite.fr.body).toContain("{{lien}}");
    expect(DEFAULT_EMAIL_TEMPLATES.invite.en.body).toContain("{{lien}}");
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
    expect(absoluteInterviewUrl("/fr/entretien/abc")).toBe("https://ex.com/fr/entretien/abc");
  });

  it("concatène tel quel si SITE_URL n'a pas de slash final", () => {
    vi.stubEnv("SITE_URL", "https://ex.com");
    expect(absoluteInterviewUrl("/en/entretien/abc")).toBe("https://ex.com/en/entretien/abc");
  });

  it("replie sur le domaine de production sans SITE_URL", () => {
    vi.stubEnv("SITE_URL", "");
    expect(absoluteInterviewUrl("/fr/entretien/abc")).toBe(
      "https://atherislabs.com/fr/entretien/abc",
    );
  });

  it("replie aussi si SITE_URL n'est qu'une chaîne d'espaces", () => {
    vi.stubEnv("SITE_URL", "   ");
    expect(absoluteInterviewUrl("/fr/entretien/abc")).toBe(
      "https://atherislabs.com/fr/entretien/abc",
    );
  });
});
