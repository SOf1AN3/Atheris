/**
 * Atheris — lien Google Meet **permanent** (PLAN Lot 5 · décision **D1**).
 *
 * POURQUOI PAS D'API GOOGLE (D1) : le CEO crée un salon réutilisable depuis
 * l'interface Google Meet (« Obtenir un lien de réunion ») et le dépose dans
 * la variable d'env `MEET_LINK`. Aucun compte de service, aucune credential,
 * aucun appel réseau : le créneau réservé étant **unique en base** (index
 * unique partiel du Lot 2), aucune double réservation simultanée n'est
 * possible et un seul salon partagé reste cohérent. Un upgrade futur (API
 * Google) pourra être ajouté plus tard sans changer ce contrat.
 *
 * RÈGLE « JAMAIS BLOQUANT » : variable absente, vide ou mal formée → `null`
 * + **un seul** `console.warn` par process (flag module). L'appelant se
 * contente alors d'omettre le lien : réservation, e-mail et pages gardent
 * exactement leur comportement d'origine. Cette fonction **ne throw jamais**
 * et n'importe ni DB ni auth — module pur, testable sans infra.
 *
 * SÉCURITÉ (côté client) : lecture de `process.env` **côté serveur
 * uniquement** — ce module ne doit jamais être importé par un composant
 * client (hors `NEXT_PUBLIC_*`, Next.js n'inlinera pas `MEET_LINK` côté
 * navigateur : le résultat y serait `null`, mais l'interdit tient par
 * convention). L'URL n'est injectée au navigateur que par des props serveur
 * sérialisables (contrat inter-pistes C3).
 */

/**
 * `true` dès qu'un avertissement a été émis — **un seul warning par process**,
 * qu'il s'agisse d'une variable absente ou d'une forme invalide : le premier
 * diagnostic suffit à l'opérateur.
 */
let warned = false;

/**
 * Lit `MEET_LINK` et renvoie le lien Meet permanent validé, ou `null`.
 *
 * Comportement (contrat C1) :
 * - `undefined` / vide après `trim()` → `null` + warning unique ;
 * - ne commençant pas par `https://meet.google.com/` → `null` + warning
 *   unique (validation de forme : évite d'afficher un brouillon saisi en
 *   prod — la valeur est considérée comme absente) ;
 * - sinon → l'URL trimée telle quelle.
 *
 * @returns L'URL `https://meet.google.com/…`, ou `null` si indisponible.
 *   **Jamais** d'exception, aucune dépendance externe.
 */
export function getMeetLink(): string | null {
  const raw = process.env.MEET_LINK?.trim();

  if (raw === undefined || raw.length === 0) {
    if (!warned) {
      warned = true;
      console.warn("[meet] MEET_LINK absent — e-mail et pages omettront le lien Google Meet");
    }
    return null;
  }

  if (!raw.startsWith("https://meet.google.com/")) {
    if (!warned) {
      warned = true;
      console.warn(
        "[meet] MEET_LINK invalide (attendu https://meet.google.com/…) — e-mail et pages omettront le lien Google Meet",
      );
    }
    return null;
  }

  return raw;
}
