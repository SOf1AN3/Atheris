/**
 * Atheris — normalisation des coordonnées prospects (T14 · anti-doublon).
 *
 * Module 100 % PUR : aucune dépendance DB ni auth (aucun import runtime) →
 * testable unitairement (`prospect-dedup.test.ts`, zéro connexion) et
 * réutilisable partout (Server Actions, portes de leads T23/T34, scripts).
 *
 * Les deux formes normalisées alimentent les colonnes UNIQUES
 * `prospects.email_norm` / `prospects.phone_norm` (filet DB anti-doublon) :
 * - email      → trim + minuscules ;
 * - téléphone  → chiffres seuls + règle nationale algérienne
 *                (`+213…` / `00213…` / `213…` → `0…`).
 *
 * Les exemples de chaque branche sont donnés en `@example` / commentaires :
 * ils font foi du contrat de normalisation.
 */

/**
 * Forme normalisée d'un email : trim + minuscules.
 *
 * @example normalizeEmail(" CEO@Ex.Com ") // → "ceo@ex.com"
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Forme normalisée d'un téléphone : **chiffres seuls**, puis règle Algérie.
 *
 * Jamais d'exception levée : une entrée vide ou illisible (lettres) produit
 * une chaîne vide — c'est au appelant (Zod, dans `src/actions/prospects.ts`)
 * de refuser une coordonnée vide, pas à ce module pur.
 *
 * @example normalizePhone("+213 555 12 34 56") // → "0555123456"
 * @example normalizePhone("00213555123456")    // → "0555123456"
 * @example normalizePhone("+33 6 12 34 56 78") // → "33612345678"
 * @example normalizePhone("n/a")               // → ""
 */
export function normalizePhone(phone: string): string {
  // 1) Séparateurs et signes retirés — seuls les chiffres restent :
  //    « +213 555 12 34 56 » → « 213555123456 » ; « (0) 555.12-34 56 » →
  //    « 0555123456 ». Toute lettre disparaît aussi : « abc » → « » (sans
  //    crash), « tél 0555… » → « 0555… ».
  const chiffres = phone.replace(/\D/g, "");

  // 2) Préfixe international « 00 » retiré au préalable —
  //    « 00213555123456 » → « 213555123456 » (d'où la branche 3 juste après).
  const digits = chiffres.startsWith("00") ? chiffres.slice(2) : chiffres;

  // 3) Algérie : indicatif 213 remplacé par le 0 national, **uniquement si le
  //    reste compte ≥ 8 chiffres** (sinon ce n'est pas un numéro algérien
  //    complet) — « 213555123456 » → « 0555123456 » ; « 21355512 » (reste de
  //    5 chiffres) tombe aux branches suivantes et est conservé tel quel.
  if (digits.startsWith("213") && digits.length - 3 >= 8) {
    return `0${digits.slice(3)}`;
  }

  // 4) Déjà au format national algérien : « 0555123456 » → « 0555123456 »
  //    (identique, donc idempotent : normalizePhone(normalizePhone(x)) === x).
  if (digits.startsWith("0")) {
    return digits;
  }

  // 5) International hors Algérie, après retrait du « 00 » éventuel :
  //    « +33 6 12 34 56 78 » → « 33612345678 » — conservé tel quel (chiffres).
  return digits;
}

/** Clé d'anti-doublon d'un prospect : les deux formes normalisées. */
export type ProspectDedupKey = {
  emailNorm: string;
  phoneNorm: string;
};

/**
 * Construit la clé d'anti-doublon (`email_norm`, `phone_norm`) à partir des
 * coordonnées brutes saisies.
 *
 * @example
 * dedupKey({ email: " CEO@Ex.Com ", phone: "+213 555 12 34 56" })
 * // → { emailNorm: "ceo@ex.com", phoneNorm: "0555123456" }
 */
export function dedupKey(input: { email: string; phone: string }): ProspectDedupKey {
  return {
    emailNorm: normalizeEmail(input.email),
    phoneNorm: normalizePhone(input.phone),
  };
}
