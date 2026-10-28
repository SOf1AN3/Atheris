/**
 * Atheris — moteur de commissions (T23 · BK-3 · structure.md §3.3).
 *
 * ⚠ MODULE PUR : **zéro import, zéro accès DB** — tout le calcul est
 * déterministe et testable sans Neon (règle DB-PENDING : `getDb()` ne vit que
 * dans `src/actions/commissions.ts`). Ce fichier documente la logique métier ;
 * l'implémentation DB (SELECT devis, palier, `db.batch`) vit dans l'action.
 *
 * ─── CONVENTION TAUX ───────────────────────────────────────────────────────
 * Entier en **DIXIÈMES de pourcentage**, strictement identique à la colonne
 * `commissions.rate_percent` (schéma, §4 « TAUX DE COMMISSION ») :
 *   100 = 10,0 % · 125 = 12,5 % · 150 = 15,0 % · 200 = 20,0 % · 50 = 5,0 %.
 * Aucun flottant n'est stocké : les montants sont des **entiers de centimes
 * USD** (`amountCents`), l'arrondi se fait au centime le plus proche
 * (`Math.round` → le demi-centime part au-dessus).
 *
 * ─── LOGIQUE MÉTIER (règles figées, implémentées côté action) ──────────────
 * 1. Devis `signed` requis : un devis draft/sent/lost ne génère rien
 *    (`not_signed` côté action).
 * 2. L'acompte **payé** est le DÉCLENCHEUR : l'action est appelée par le flux
 *    de paiement (BK-4 `markPaymentPaid`), jamais par une page publique.
 * 3. `paidCount` = deals du SDR **antérieurs** à ce deal ayant atteint
 *    `client_actif` → palier **non rétroactif** : le taux du jour du deal ne
 *    bouge plus si le SDR monte ensuite dans la grille.
 * 4. SNAPSHOT : `ratePercent` est écrit une fois sur la ligne, jamais
 *    recalculé ensuite (la colonne porte le taux « à la génération »).
 * 5. `beneficiaryId` SDR = `prospects.sourceUserId` — **peut être `null`**
 *    (leads Ads/Landing sans auteur interne) → **DÉCISION LEAD** : la ligne
 *    est créée quand même et atterrit dans la file « sans bénéficiaire »
 *    (bannière CEO côté UI). L'index unique `(quoteId, beneficiaryId, kind)`
 *    traite les `NULL` comme distincts : l'idempotence de ce cas est portée
 *    par le SELECT préalable de l'action, pas par la contrainte.
 * 6. MANAGER — **part de 5 % fixe sur CHAQUE deal converti, TOUS CANAUX**
 *    (Sales Development Representative, commercial, ads…, et Rayan lui-même) : le bénéficiaire est le
 *    compte `role = 'manager'` le **plus ancien** (`createdAt ASC`, en
 *    pratique Rayan) ; compte absent → la part est omise et son montant
 *    revient au CEO. Exemple canonique (structure.md §3.3) : *Rayan clôture un
 *    prospect d'un Sales Development Representative → la part SDR reste au Sales Development Representative, **Rayan touche alors
 *    uniquement ses 5 % de manager***.
 *    La double part (seller **+** manager) ne se produit que si le SDR
 *    EST le manager (Rayan génère lui-même le prospect) : il reçoit alors son
 *    palier SDR **et** ses 5 % sur le même compte → **2 lignes** (mêmes
 *    comptes possibles, `kind` distincts, jamais de manager en double).
 *
 * ─── INVARIANT CEO ─────────────────────────────────────────────────────────
 * Chaque deal porte la part manager (50 = 5 %) en plus du palier SDR :
 * le cumul ne dépasse jamais `MAX_TOTAL_TENTHS` (250 = 25 %) — `getTier`
 * plafonne à 200 (20 %), donc 200 + 50 = 250 sur **tous** les deals → le CEO
 * conserve au minimum **75 %** de chaque deal (asserté dans les tests,
 * formulé avec `Math.floor` : sur de très petits deals (1-3 centimes),
 * l'arrondi au centime peut coûter au plus un centime aux parts — la part
 * exacte de 75 % est atteinte dès les deals usuels).
 */

/**
 * Part manager fixe : Rayan touche **5 % sur chaque deal converti, tous
 * canaux** (50 dixièmes de pourcentage = 5,0 %) — voir règle 6 ci-dessus.
 */
export const TIER_MANAGER_RATE_TENTHS = 50;

/** Paliers du barème SDR, exprimés en dixièmes de pourcentage. */
export type CommissionTier = 100 | 125 | 150 | 200;

/**
 * Barème SDR par cumul de clients payés (structure.md §3.3).
 *
 * | Clients payés (`paidCount`) | Palier | Taux   |
 * | --------------------------- | ------ | ------ |
 * | 0 – 4                       | 100    | 10 %   |
 * | 5 – 9                       | 125    | 12,5 % |
 * | 10 – 19                     | 150    | 15 %   |
 * | 20 +                        | 200    | 20 %   |
 *
 * Bornes **inclusives** côté palier supérieur : 4 → 100, 5 → 125, 9 → 125,
 * 10 → 150, 19 → 150, 20 → 200.
 *
 * COMPORTEMENT DOCUMENTÉ (entrées hostiles / compteur corrompu) :
 * - `paidCount` **négatif** ou **NaN** → clamp à **0** (palier 100) ;
 * - `+Infinity` → palier 200 (borne haute), `-Infinity` → clamp à 0 ;
 * - valeur fractionnaire → `Math.floor` (4,9 client ne franchit pas la
 *   borne 5).
 *
 * @param paidCount Nombre de deals du SDR déjà passés à `client_actif`.
 * @returns Le palier en dixièmes (jamais en dessous de 100).
 */
export function getTier(paidCount: number): CommissionTier {
  const safe = Number.isNaN(paidCount) || paidCount < 0 ? 0 : Math.floor(paidCount);
  if (safe >= 20) return 200;
  if (safe >= 10) return 150;
  if (safe >= 5) return 125;
  return 100;
}

/** Plafond cumulé SDR + manager : 250 dixièmes = 25 % du deal. */
export const MAX_TOTAL_TENTHS = 250;

/** Une part de commission calculée (aucun bénéficiaire ici : module pur). */
export type DealShare = {
  kind: "seller" | "manager";
  rateTenths: number;
  amountCents: number;
};

/** Résultat du calcul des parts sur un deal. */
export type DealSharesResult = {
  /**
   * Parts émises : **2 par défaut** (SDR + manager 5 %, tous canaux),
   * 1 seule si une part arrondit à 0 cent (alors omise — règle « jamais de
   * part à 0 cent »), 0 pour un deal à 0 ou 1 centime.
   */
  shares: DealShare[];
  /**
   * Somme des taux des parts **émises** — toujours ≤ `MAX_TOTAL_TENTHS`
   * (250) avec le barème actuel (`getTier` ≤ 200 + manager 50 = 250 ; voir la
   * garde-fou de `computeDealShares`).
   */
  totalRateTenths: number;
  /** Ce qui revient au CEO : `dealCents - somme des parts`. */
  ceoShareCents: number;
};

/**
 * Ligne prête à insérer dans `commissions` (mapping pur, sans DB).
 * `beneficiaryId: null` = deal sans bénéficiaire (voir règle 5 ci-dessus).
 */
export type GeneratedCommission = {
  kind: "seller" | "manager";
  beneficiaryId: string | null;
  rateTenths: number;
  baseCents: number;
  amountCents: number;
};

/**
 * Répartit un deal entre SDR, manager et CEO.
 *
 * **La part manager (5 %) est émise sur CHAQUE deal, tous canaux** — un deal
 * Sales Development Representative produit `[seller (palier), manager 5 %]`, un deal de Rayan lui-même
 * produit `[seller (palier), manager 5 %]` sur le même compte (2 parts, kinds
 * distincts, jamais de manager en double).
 *
 * @param params.dealCents Montant du deal en centimes USD (≥ 0 ; entier
 *   attendu, une valeur non finie/négative est ramenée à 0 — documenté).
 * @param params.sellerRateTenths Taux SDR **déjà choisi par l'appelant**
 *   via `getTier(paidCount)` (ce module ne connaît pas le pipeline).
 * @param params.sellerIsManager `true` quand le SDR EST le manager
 *   (Rayan génère lui-même le prospect) — sert **uniquement** à la garde-fou
 *   de plafond (cf. ci-dessous) : il ne décide **PAS** de l'émission de la
 *   part manager, qui est systématique. `false` par défaut.
 * @returns Parts, cumul de taux et part CEO.
 *
 * RÈGLES :
 * - **Part manager systématique** : `TIER_MANAGER_RATE_TENTHS` (50 = 5 %)
 *   ajoutée à chaque deal (bénéficiaire attribué côté action : compte
 *   `role = 'manager'` le plus ancien).
 * - **Garde-fou cumul (25 %)** : `sellerIsManager === true` ET
 *   `tauxSdr + 50 > MAX_TOTAL_TENTHS` → le taux SDR est plafonné à
 *   `MAX_TOTAL_TENTHS - TIER_MANAGER_RATE_TENTHS` (250 − 50 = 200). Ce n'est
 *   **jamais** atteint avec le barème actuel : `getTier` plafonne à 200 et
 *   tout deal vaut alors 200 + 50 = 250 au maximum. VIGILANCE : si un palier
 *   supérieur à 200 venait à être ajouté au barème, cette garde devrait être
 *   étendue à **tous** les deals (la part manager n'est plus conditionnelle).
 * - `amountCents = Math.round(dealCents * rateTenths / 1000)` — arithmétique
 *   entière, demi-centime arrondi au-dessus.
 * - **Jamais de part à 0 cent** : une part dont l'arrondi tombe à 0 est
 *   **omise** (le centime reste au CEO) — voir `deal 1 cent` dans les tests.
 * - `ceoShareCents = dealCents - somme(des parts émises)` ≥ 75 % du deal.
 */
export function computeDealShares(params: {
  dealCents: number;
  sellerRateTenths: number;
  sellerIsManager?: boolean;
}): DealSharesResult {
  // Normalisation défensive (entrées non finies / négatives → 0) : le module
  // est appelé côté serveur mais ne doit jamais produire NaN en base.
  const dealCents =
    Number.isFinite(params.dealCents) && params.dealCents > 0 ? Math.floor(params.dealCents) : 0;

  let sellerRateTenths = Number.isFinite(params.sellerRateTenths)
    ? Math.max(0, Math.floor(params.sellerRateTenths))
    : 0;

  const sellerIsManager = params.sellerIsManager === true;

  // Garde-fou de plafond — UNIQUE usage de `sellerIsManager` : le cumul
  // SDR + manager (5 %) ne doit pas dépasser MAX_TOTAL_TENTHS (250).
  if (sellerIsManager && sellerRateTenths + TIER_MANAGER_RATE_TENTHS > MAX_TOTAL_TENTHS) {
    sellerRateTenths = MAX_TOTAL_TENTHS - TIER_MANAGER_RATE_TENTHS;
  }

  // 2 parts TOUJOURS : palier SDR + manager 5 % (tous canaux).
  const rates: ReadonlyArray<{ kind: DealShare["kind"]; rateTenths: number }> = [
    { kind: "seller", rateTenths: sellerRateTenths },
    { kind: "manager", rateTenths: TIER_MANAGER_RATE_TENTHS },
  ];

  const shares: DealShare[] = [];
  for (const { kind, rateTenths } of rates) {
    const amountCents = Math.round((dealCents * rateTenths) / 1000);
    // Jamais de part à 0 cent : omise, le centime (éventuel) reste au CEO.
    if (amountCents <= 0) continue;
    shares.push({ kind, rateTenths, amountCents });
  }

  const totalSharesCents = shares.reduce((sum, share) => sum + share.amountCents, 0);

  return {
    shares,
    totalRateTenths: shares.reduce((sum, share) => sum + share.rateTenths, 0),
    ceoShareCents: dealCents - totalSharesCents,
  };
}
