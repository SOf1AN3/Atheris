/**
 * Atheris — helpers **pur** de masquage des coordonnées de versement (D4).
 *
 * Module 100 % pur : aucun import DB, auth ni réseau — utilisable côté serveur
 * (pages/Server Components) comme côté client. Aucun octet sensible n'y est
 * stocké : seules des chaînes DÉJÀ lisibles entrent, des chaînes masquées
 * sortent.
 *
 * ─── Arbitrage D4 (coordonnées en clair) ────────────────────────────────────
 * `payout_details` stocke les valeurs **en clair** ; ces helpers ne s'appliquent
 * qu'à l'**affichage**. Le masquage est donc un habillage d'interface, PAS une
 * protection : un accès direct à la base donne les coordonnées lisibles.
 * C'est assumé et documenté (D4, `schema.ts` §payout_details) — à réévaluer si
 * le volume de SDR croît.
 *
 * Conséquence pratique : un masque ne peut jamais reconstituer l'original —
 * le formulaire de saisie de la page profil est donc toujours vierge (jamais
 * pré-rempli depuis ces valeurs).
 *
 * Réutilisé par la piste F (page Équipe) : toute nouvelle coordonnée sensible
 * affichée au CEO passe par l'un des helpers ci-dessous.
 */

/**
 * Masquage D4 — IBAN : `•••• 4821` (4 derniers caractères, espaces retirés).
 *
 * @param iban IBAN lu en base (séparateurs éventuels tolérés).
 * @returns Forme masquée pour l'affichage — **jamais** l'IBAN complet.
 */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, "");
  return `•••• ${compact.slice(-4)}`;
}

/**
 * Masquage D4 — e-mail : `a•••o@domaine.tld` (initiale + dernière lettre de
 * la partie locale, domaine conservé pour rester identifiable).
 *
 * @param email E-mail lu en base.
 * @returns Forme masquée pour l'affichage (repli `••••` si malformé).
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "••••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const tail = local.length >= 2 ? local.slice(-1) : "";
  return `${local.slice(0, 1)}•••${tail}${domain}`;
}
