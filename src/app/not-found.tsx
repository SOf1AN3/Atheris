"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { en } from "@/content/en";
import { fr } from "@/content/fr";
import type { NotFoundContent } from "@/content/types";
import { defaultLocale, isValidLocale, type Locale } from "@/i18n/config";

/**
 * Plan §4.3 — page 404 sur-mesure (« OBSIDIAN INSTRUMENT »).
 *
 * Client component : la locale est lue dans l'URL via `useParams()` (repli
 * `defaultLocale`), puis le dictionnaire est choisi par import STATIQUE
 * synchron (`fr` / `en` sont des exports constants — pas `getDictionary`
 * asynchrone). Aucune string en dur : badge, titre, phrase et CTA viennent
 * tous de `notFound.*` (contenu GELÉ, FR/EN symétriques).
 *
 * Rendue par `app/not-found.tsx` à la racine de l'arbre : elle est donc
 * embarquée dans le layout de `app/[locale]` (`<html>` présent → polices et
 * tokens `globals.css` disponibles, cf. PLAN §4.3).
 */

/** Dictionnaires résolus par locale — clé exhaustive sur `Locale`. */
const DICTIONARIES: Record<Locale, typeof fr> = { fr, en };

/**
 * SIGNATURE TYPOGRAPHIQUE (DESIGN §2.2) — « le titre à deux voix », repris en
 * local sur le même pattern que `SectionHeading.TitleVoice` : le contenu
 * délimite l'accent entre astérisques (`"…n'existe *pas*"`) → structure en
 * Inter Tight 600, accent en Instrument Serif italique. Vider les `*` ne casse
 * jamais le rendu.
 */
function TitleVoice({ text }: { text: string }): ReactNode {
  const parts = text.split("*");
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="voix">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function NotFound(): ReactNode {
  const params = useParams();
  const localeParam = params["locale"];
  const locale: Locale =
    typeof localeParam === "string" && isValidLocale(localeParam)
      ? localeParam
      : defaultLocale;
  const content: NotFoundContent = DICTIONARIES[locale].notFound;

  return (
    <main className="relative flex min-h-[100svh] items-center overflow-hidden bg-ink">
      {/* Ambiance hero « instrument » VOILÉE : nappe froide + grille au sol +
          vignettage, couverts d'un `bg-ink/60` pour que la LECTURE prime
          (DESIGN §2.4 — purement décoratif, `pointer-events: none`). */}
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-nappe" />
        <div className="floor" />
        <div className="hero-vignette" />
        <div className="absolute inset-0 bg-ink/60" />
      </div>

      <div className="relative mx-auto w-full max-w-[1280px] px-[clamp(20px,5vw,56px)] py-24 text-center">
        {/* Badge `.micro` (composant `Badge` pill du site) : le code d'erreur
            (« 404 · Page introuvable »). */}
        <Badge variant="pill">{content.code}</Badge>

        {/* Un SEUL `h1` sur la page — titre à deux voix (accent `*…*`). */}
        <h1 className="h-display mx-auto mt-7 max-w-[16ch] text-[clamp(2.5rem,5.5vw,4.5rem)] text-fg">
          <TitleVoice text={content.title} />
        </h1>

        <p className="mx-auto mt-6 max-w-[52ch] text-[17px] leading-[1.65] text-muted">
          {content.description}
        </p>

        {/* CTA primaire (SEUL aplat volt, DESIGN §2.6) vers l'accueil de la
            locale courante + lien secondaire FANTÔME (texte + flèche, sans
            bordure) vers les réalisations. Cibles ≥ 44px (`lg` = h-14),
            focus volt global déjà posé. */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button variant="primary" size="lg" href={`/${locale}`}>
            {content.primaryCta}
          </Button>
          <Button variant="ghost" size="lg" href={`/${locale}#realisations`}>
            {content.secondaryCta}
          </Button>
        </div>
      </div>
    </main>
  );
}
