/**
 * Atheris — tests unitaires du moteur de commissions (T23 · BK-3).
 *
 * 100 % pur : **aucun appel `getDb()`**, aucune DB (règle DB-PENDING).
 * Import relatif volontaire (pas d'alias `@/`) : le fichier tourne sous
 * `vitest run` sans configuration de résolution d'alias (voir
 * `src/lib/prospect-dedup.test.ts`, même convention).
 *
 * Convention rappelée : les taux sont en **dixièmes de pourcentage**
 * (100 = 10 % · 125 = 12,5 % · 50 = 5 %), les montants en centimes USD.
 */

import { describe, expect, it } from "vitest";

import {
  computeDealShares,
  getTier,
  MAX_TOTAL_TENTHS,
  TIER_MANAGER_RATE_TENTHS,
} from "./commission";

// ---------------------------------------------------------------------------
// getTier — barème vendeur par cumul de clients payés (structure.md §3.3).
// ---------------------------------------------------------------------------

describe("getTier — barème vendeur par cumul de clients payés", () => {
  it("0 à 4 clients payés → palier 100 (10 %)", () => {
    expect(getTier(0)).toBe(100);
    expect(getTier(1)).toBe(100);
    expect(getTier(3)).toBe(100);
    expect(getTier(4)).toBe(100); // borne haute du premier palier
  });

  it("borne basse 5 clients payés → palier 125 (12,5 %)", () => {
    expect(getTier(5)).toBe(125);
  });

  it("borne haute 9 clients payés → palier 125 (12,5 %)", () => {
    expect(getTier(9)).toBe(125);
  });

  it("borne basse 10 clients payés → palier 150 (15 %)", () => {
    expect(getTier(10)).toBe(150);
  });

  it("borne haute 19 clients payés → palier 150 (15 %)", () => {
    expect(getTier(19)).toBe(150);
  });

  it("borne 20 clients payés (et au-delà) → palier 200 (20 %)", () => {
    expect(getTier(20)).toBe(200);
    expect(getTier(42)).toBe(200);
  });

  it("compteur négatif → clamp à 0 → palier 100 (comportement documenté)", () => {
    expect(getTier(-1)).toBe(100);
    expect(getTier(-1000)).toBe(100);
    expect(getTier(Number.NEGATIVE_INFINITY)).toBe(100);
  });

  it("NaN → clamp à 0 → palier 100 (comportement documenté)", () => {
    expect(getTier(Number.NaN)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeDealShares — répartition vendeur / manager / CEO.
//
// Règle centrale (structure.md §3.3) : la part manager (5 %) est émise sur
// **CHAQUE deal, tous canaux** — `sellerIsManager` ne pilote que la garde-fou
// de plafond, jamais l'émission de la part manager.
// ---------------------------------------------------------------------------

describe("computeDealShares — répartition d'un deal", () => {
  it("deal d'un Sales Partner (10 %) → parts [seller 10 %, manager 5 %] = 15 %, CEO 85 %", () => {
    const result = computeDealShares({ dealCents: 100_000, sellerRateTenths: getTier(4) });

    expect(result.shares).toEqual([
      { kind: "seller", rateTenths: 100, amountCents: 10_000 },
      { kind: "manager", rateTenths: 50, amountCents: 5_000 },
    ]);
    expect(result.totalRateTenths).toBe(150);
    expect(result.ceoShareCents).toBe(85_000);
  });

  it("deal d'un Sales Partner au palier 12,5 % → 17,5 % cumul, CEO 82,5 %", () => {
    const result = computeDealShares({ dealCents: 80_000, sellerRateTenths: getTier(5) });

    expect(result.shares).toEqual([
      { kind: "seller", rateTenths: 125, amountCents: 10_000 },
      { kind: "manager", rateTenths: 50, amountCents: 4_000 },
    ]);
    expect(result.totalRateTenths).toBe(175);
    expect(result.ceoShareCents).toBe(66_000); // 82,5 % de 80 000
  });

  it("palier 15 % (10-19 clients) → 20 % cumul avec le manager, CEO 80 %", () => {
    const result = computeDealShares({ dealCents: 100_000, sellerRateTenths: getTier(10) });

    expect(result.shares).toEqual([
      { kind: "seller", rateTenths: 150, amountCents: 15_000 },
      { kind: "manager", rateTenths: 50, amountCents: 5_000 },
    ]);
    expect(result.totalRateTenths).toBe(200);
    expect(result.ceoShareCents).toBe(80_000);
  });

  it("palier 20 % (20+ clients) → 25 % cumul avec le manager, CEO 75 % (plafond exact)", () => {
    const result = computeDealShares({ dealCents: 100_000, sellerRateTenths: getTier(20) });

    expect(result.shares).toEqual([
      { kind: "seller", rateTenths: 200, amountCents: 20_000 },
      { kind: "manager", rateTenths: 50, amountCents: 5_000 },
    ]);
    expect(result.totalRateTenths).toBe(MAX_TOTAL_TENTHS);
    expect(result.ceoShareCents).toBe(75_000);
  });

  it("Rayan vendeur palier 10 % → seller 10 % + manager 5 % = 15 %, CEO 85 %", () => {
    const result = computeDealShares({
      dealCents: 100_000,
      sellerRateTenths: 100,
      sellerIsManager: true,
    });

    expect(result.shares.map((share) => share.kind)).toEqual(["seller", "manager"]);
    expect(result.shares[0]).toEqual({ kind: "seller", rateTenths: 100, amountCents: 10_000 });
    expect(result.shares[1]).toEqual({
      kind: "manager",
      rateTenths: TIER_MANAGER_RATE_TENTHS,
      amountCents: 5_000,
    });
    expect(result.totalRateTenths).toBe(150);
    expect(result.ceoShareCents).toBe(85_000);
  });

  it("Rayan vendeur (15 %) : parts seller + manager = 25 % cumul, jamais de manager en double", () => {
    const result = computeDealShares({
      dealCents: 100_000,
      sellerRateTenths: 150,
      sellerIsManager: true,
    });

    // Exactement 2 parts, dans l'ordre seller puis manager.
    expect(result.shares).toHaveLength(2);
    expect(result.shares.map((share) => share.kind)).toEqual(["seller", "manager"]);
    expect(result.shares[0]).toEqual({ kind: "seller", rateTenths: 150, amountCents: 15_000 });
    expect(result.shares[1]).toEqual({
      kind: "manager",
      rateTenths: TIER_MANAGER_RATE_TENTHS,
      amountCents: 5_000,
    });
    expect(result.totalRateTenths).toBe(200);
    expect(result.ceoShareCents).toBe(80_000);
  });

  it("la part manager est émise sur TOUS les deals, quel que soit le rôle du vendeur", () => {
    // Sales Partner/commercial (`sellerIsManager` absent ou false) ET Rayan (true) :
    // la part manager 5 % est toujours présente, sur tous les paliers.
    for (const sellerIsManager of [false, true]) {
      for (const sellerRateTenths of [100, 125, 150, 200]) {
        const result = computeDealShares({ dealCents: 40_000, sellerRateTenths, sellerIsManager });

        expect(result.shares.map((share) => share.kind)).toEqual(["seller", "manager"]);
        const manager = result.shares.find((share) => share.kind === "manager");
        expect(manager?.rateTenths).toBe(TIER_MANAGER_RATE_TENTHS);
        expect(manager?.amountCents).toBe(2_000); // 5 % de 40 000
      }
    }

    // Preuve explicite : sans aucun flag, la part manager existe déjà.
    const noFlag = computeDealShares({ dealCents: 10_000, sellerRateTenths: 100 });
    expect(noFlag.shares).toHaveLength(2);
    expect(noFlag.totalRateTenths).toBe(150);
  });

  it("plafond cumul : vendeur + manager ne dépasse jamais 250 dixièmes (25 %)", () => {
    const deals = [1, 7, 999, 10_000, 100_000, 999_999];
    for (const rateTenths of [100, 125, 150, 200]) {
      for (const sellerIsManager of [false, true]) {
        for (const dealCents of deals) {
          const { totalRateTenths } = computeDealShares({
            dealCents,
            sellerRateTenths: rateTenths,
            sellerIsManager,
          });
          expect(totalRateTenths).toBeLessThanOrEqual(MAX_TOTAL_TENTHS);
        }
      }
    }
  });

  it("garde-fou : taux vendeur hors barème (> 200) plafonné quand le vendeur est manager", () => {
    // Palier hypothétique à 30 % pour un vendeur qui EST manager : la garde
    // ramène le taux vendeur à 200 → cumul 200 + 50 = 250 (25 %) maximum.
    const capped = computeDealShares({
      dealCents: 100_000,
      sellerRateTenths: 300,
      sellerIsManager: true,
    });
    expect(capped.shares[0]?.rateTenths).toBe(200);
    expect(capped.totalRateTenths).toBe(MAX_TOTAL_TENTHS);
    expect(capped.ceoShareCents).toBe(75_000);

    // Avec le barème actuel (`getTier` ≤ 200) la garde ne se déclenche jamais
    // et le cumul vaut exactement 250 au palier maximal, vendeur manager ou
    // non — c'est structurel (200 + 50 = 250).
    const rayanTopTier = computeDealShares({
      dealCents: 100_000,
      sellerRateTenths: 200,
      sellerIsManager: true,
    });
    expect(rayanTopTier.totalRateTenths).toBe(MAX_TOTAL_TENTHS);

    const ldgTopTier = computeDealShares({ dealCents: 100_000, sellerRateTenths: 200 });
    expect(ldgTopTier.totalRateTenths).toBe(MAX_TOTAL_TENTHS);
  });

  it("arrondi au centime : 99 999 × 10 % → 10 000 centimes (demi-centime au-dessus)", () => {
    const result = computeDealShares({ dealCents: 99_999, sellerRateTenths: 100 });

    expect(result.shares[0]?.amountCents).toBe(10_000);
    expect(result.shares[1]?.amountCents).toBe(5_000); // manager : 4 999,95 → 5 000
    expect(result.ceoShareCents).toBe(84_999); // 99 999 − 15 000
  });

  it("invariant : le CEO touche au moins 75 % du deal (toutes combinaisons du barème)", () => {
    const deals = [1, 2, 3, 7, 13, 100, 999, 10_000, 99_999, 100_000, 100_003, 123_457];
    for (const dealCents of deals) {
      for (const sellerRateTenths of [100, 125, 150, 200]) {
        for (const sellerIsManager of [false, true]) {
          const { ceoShareCents, shares } = computeDealShares({
            dealCents,
            sellerRateTenths,
            sellerIsManager,
          });
          // `Math.floor` : sur les très petits deals (1 à 3 centimes),
          // l'arrondi au centime peut coûter au plus un centime aux parts —
          // la part de 75 % reste atteinte en entier.
          expect(ceoShareCents).toBeGreaterThanOrEqual(Math.floor(dealCents * 0.75));
          expect(ceoShareCents).toBeGreaterThanOrEqual(0);
          expect(shares.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("deal à 0 cent : aucune part, total à 0, CEO = 0", () => {
    const plain = computeDealShares({ dealCents: 0, sellerRateTenths: 150 });
    expect(plain.shares).toEqual([]);
    expect(plain.totalRateTenths).toBe(0);
    expect(plain.ceoShareCents).toBe(0);

    const rayan = computeDealShares({ dealCents: 0, sellerRateTenths: 200, sellerIsManager: true });
    expect(rayan.shares).toEqual([]);
    expect(rayan.ceoShareCents).toBe(0);
  });

  it("deal à 1 cent : jamais de part à 0 cent (tout le centime revient au CEO)", () => {
    // 1 cent × 10 % = 0,1 centime → arrondi 0 → part omise (idem manager).
    const tenPercent = computeDealShares({ dealCents: 1, sellerRateTenths: 100 });
    expect(tenPercent.shares).toEqual([]);
    expect(tenPercent.ceoShareCents).toBe(1);

    // Même chose avec Rayan : seller (0,2) et manager (0,05) → deux parts 0.
    const rayan = computeDealShares({ dealCents: 1, sellerRateTenths: 200, sellerIsManager: true });
    expect(rayan.shares).toEqual([]);
    expect(rayan.totalRateTenths).toBe(0);
    expect(rayan.ceoShareCents).toBe(1);

    // Et sur un deal courant : aucune part émise n'est jamais à 0 cent.
    const usual = computeDealShares({ dealCents: 4_999, sellerRateTenths: 125, sellerIsManager: true });
    expect(usual.shares.length).toBeGreaterThan(0);
    for (const share of usual.shares) expect(share.amountCents).toBeGreaterThan(0);
  });
});
