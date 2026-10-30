import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Filet **catch-all** du segment localisé — voir `../not-found.tsx`.
 *
 * POUR CE FICHIER EXISTE (documenté Next.js : `not-found.js` file convention +
 * discussions vercel/next.js #50518 / #48609) :
 * un `not-found.tsx` posé dans `app/[locale]/` n'est rendu **que si
 * `notFound()` est appelé à l'intérieur de ce segment**. Une URL non appariée
 * comme `/fr/page-inexistante` n'entre dans AUCUN `page.tsx` du segment →
 * Next tombe sur le not-found **racine** `app/not-found.tsx`, rendu HORS de
 * `app/[locale]/layout.tsx` (le projet n'a pas de `app/layout.tsx`), donc en
 * HTML nu : zéro token, zéro police, Times New Roman (constat d'audit du
 * 30/10/2026, vérifié par Playwright).
 *
 * Ce catch-all capte toute URL résiduelle sous `/{locale}/…` et appelle
 * `notFound()` → Next rend alors `app/[locale]/not-found.tsx` **à
 * l'intérieur** du layout `[locale]` : `<html lang>`, `globals.css`, les 3
 * polices, tokens `bg-ink`/`text-fg`, `.grain`, et **statut HTTP 404**
 * (le `notFound()` émis avant tout streaming conserve le 404).
 *
 * PRÉCÉDENCE DES ROUTES (inchangée pour l'existant) : les segments STATIQUES
 * (`/fr/espace`, `/fr/recrutement`…) et les paramètres NOMMÉS
 * (`/fr/invitation/[token]`, `/fr/entretien/[token]`) l'emportent sur un
 * catch-all — aucune route existante n'est masquée.
 *
 * Composant serveur minimal : zéro donnée, zéro string (le contenu 404 vient
 * de `notFound.*` FR/EN, gelé dans `src/content/{fr,en}.ts`).
 */
export default function MissingRoute(): ReactNode {
  notFound();
}
