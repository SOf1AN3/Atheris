"use client";

import NotFoundPage from "../not-found";

/**
 * Frontière 404 **du segment localisé** — la rationale complète est documentée
 * dans `../not-found.tsx` (plan §4.3) et dans `[...missing]/page.tsx`
 * (pourquoi un catch-all déclencheur est nécessaire).
 *
 * WRAPPER DISTINCT (et non un simple `export { default } from "../not-found"`) :
 * un ré-export brut réutilise à l'identique la référence React du not-found
 * RACINE, et le boundary imbriqué rendait alors un shell `__next_error__` côté
 * SSR (contenu non streamé, visible seulement après hydratation — constat du
 * 30/10/2026). Ce composant d'ordre supérieur donne au boundary son propre
 * nœud : SSR complet, HTML réel, design system appliqué avant hydratation.
 *
 * Aucune string, aucune règle visuelle : tout vient de `NotFoundPage`.
 */
export default function LocalizedNotFound(): React.ReactNode {
  return <NotFoundPage />;
}
