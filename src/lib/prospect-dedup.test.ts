/**
 * Atheris — tests unitaires de la normalisation anti-doublon (T14).
 *
 * 100 % pur : **aucun appel `getDb()`**, aucune DB (règle DB-PENDING).
 * Import relatif volontaire (pas d'alias `@/`) : le fichier tourne sous
 * `vitest run` sans configuration de résolution d'alias.
 */

import { describe, expect, it } from "vitest";

import { dedupKey, normalizeEmail, normalizePhone } from "./prospect-dedup";

describe("normalizeEmail", () => {
  it("minuscules + trim : « CEO@Ex.Com » → « ceo@ex.com »", () => {
    expect(normalizeEmail(" CEO@Ex.Com ")).toBe("ceo@ex.com");
  });

  it("est idempotent (deux normalisations = même forme)", () => {
    expect(normalizeEmail(normalizeEmail(" CEO@Ex.Com "))).toBe("ceo@ex.com");
  });
});

describe("normalizePhone", () => {
  it("« +213 555 12 34 56 » → « 0555123456 » (Algérie international)", () => {
    expect(normalizePhone("+213 555 12 34 56")).toBe("0555123456");
  });

  it("« 00213555123456 » → « 0555123456 » (00 + 213)", () => {
    expect(normalizePhone("00213555123456")).toBe("0555123456");
  });

  it("« 213555123456 » → « 0555123456 » (213 nu)", () => {
    expect(normalizePhone("213555123456")).toBe("0555123456");
  });

  it("« 0555123456 » déjà national → conservé tel quel", () => {
    expect(normalizePhone("0555123456")).toBe("0555123456");
  });

  it("« +33 6 12 34 56 78 » international non algérien → conservé", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("33612345678");
  });

  it("espaces et séparateurs variés (« (0) 555.12-34 56 ») → chiffres", () => {
    expect(normalizePhone(" (0) 555.12-34 56 ")).toBe("0555123456");
  });

  it("téléphone vide → chaîne vide, sans crash", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("lettres sans chiffre (« n/a ») → chaîne vide, sans crash", () => {
    expect(normalizePhone("n/a")).toBe("");
  });

  it("mélange lettres + chiffres (« tél 0555 12 34 56 ») → chiffres seuls", () => {
    expect(normalizePhone("tél 0555 12 34 56")).toBe("0555123456");
  });

  it("est idempotent sur les formes normalisées", () => {
    expect(normalizePhone(normalizePhone("+213 555 12 34 56"))).toBe("0555123456");
    expect(normalizePhone(normalizePhone("+33 6 12 34 56 78"))).toBe("33612345678");
  });
});

describe("dedupKey", () => {
  it("normalise email ET téléphone en une passe", () => {
    expect(dedupKey({ email: " CEO@Ex.Com ", phone: "+213 555 12 34 56" })).toEqual({
      emailNorm: "ceo@ex.com",
      phoneNorm: "0555123456",
    });
  });

  it("deux écritures d'un même contact → même clé (détection de doublon)", () => {
    const saisi = dedupKey({ email: "ceo@ex.com", phone: "0555 12 34 56" });
    const importe = dedupKey({ email: " CEO@EX.com ", phone: "+213555123456" });
    expect(saisi).toEqual(importe);
  });

  it("touche vide / illisible → clé vide sans crash", () => {
    expect(dedupKey({ email: "", phone: "n/a" })).toEqual({ emailNorm: "", phoneNorm: "" });
  });
});
