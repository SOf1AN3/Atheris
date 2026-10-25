import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { ApplyForm } from "@/components/recrutement/ApplyForm";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { isValidLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { cn } from "@/lib/utils";

type RecrutementPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Densité NORMALE (DESIGN §2.3) + container landing (`max-w-[1200px]`).
 * Composition 12 colonnes ASYMÉTRIQUE : en-tête 7/12, bande poste 6+6
 * (pills alignées à droite), intro décalée à droite, JD en 2 colonnes
 * décalées, candidature 5/7.
 */
const CONTAINER_CLASS = "mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]";

/** Index interne d'un bloc JD : `01 / 04` (sérigraphie mono, décoratif). */
function cardIndexLabel(position: number, total: number): string {
  return `${String(position + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
}

/**
 * SEO de la page (i18n) : `dict.seo` ne porte AUCUNE clé dédiée au
 * recrutement (contrat `SeoMeta` figé) → titre/description pris dans
 * `dict.careers`. Le marqueur d'accent `*` est une convention d'affichage
 * (DESIGN §2.2.1) : il ne doit jamais atteindre le `<title>`.
 * `alternates` reprend le pattern du layout `(marketing)` (chemins relatifs
 * résolus par `metadataBase`), enrichi du chemin de la page.
 */
export async function generateMetadata({
  params,
}: RecrutementPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const dict = await getDictionary(locale);
  const brand = `${dict.nav.brand.name} ${dict.nav.brand.suffix}`;

  return {
    title: `${dict.careers.title.replace(/\*/g, "")} · ${brand}`,
    description: dict.careers.description,
    alternates: {
      canonical: `/${locale}/recrutement`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l}/recrutement`] as const),
      ),
    },
  };
}

/**
 * Page « Recrutement » (piste F2 · §3.2) — fiche de poste (Annexe A, rendue
 * telle quelle depuis `dict.careers`) + formulaire de candidature.
 *
 * Dans le groupe `(marketing)` → header, footer, skip-link et JSON-LD fournis
 * par le layout. Composant SERVEUR : aucune directive `"use client"` (le seul
 * client est `ApplyForm`, plus `Reveal`/`Button` qui portent leur propre `"use client"`).
 */
export default async function RecrutementPage({
  params,
}: RecrutementPageProps): Promise<ReactNode> {
  const { locale } = await params;

  // Défensif : le layout racine a déjà validé la locale.
  if (!isValidLocale(locale)) {
    notFound();
  }

  // `getPlatformDictionary` : seule source i18n disponible pour deux libellés
  // d'action (« Retour » `common.back`, suppression du fichier `common.cancel`)
  // — `src/content/*` est FIGÉ et ne porte aucune clé équivalente côté `careers`.
  // Arbitrage documenté en restitution F2 (remplacement par une clé `careers.*`
  // dès que le contenu sera dégelé).
  const [dict, platform] = await Promise.all([
    getDictionary(locale),
    getPlatformDictionary(locale),
  ]);

  const careers = dict.careers;
  const total = careers.sections.length;

  return (
    <main id="main" tabIndex={-1}>
      <section
        aria-labelledby="recrutement-title"
        className="border-t border-line py-[clamp(80px,10vh,128px)]"
      >
        <div className={CONTAINER_CLASS}>
          {/* 1 — En-tête : titre à gauche sur 7 colonnes (jamais centré). */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <SectionHeading
                as="h1"
                index="08"
                headingId="recrutement-title"
                eyebrow={careers.eyebrow}
                title={careers.title}
                description={careers.description}
              />
            </div>
          </div>

          {/* 2 — Bandeau de poste : intitulé en `.h-display` + 3 pastilles micro. */}
          <Reveal delay={0.08}>
            <div className="mt-12 grid grid-cols-1 gap-5 border-t border-line pt-9 lg:grid-cols-12 lg:items-end lg:gap-10">
              <h2 className="h-display text-[clamp(2rem,4vw,3rem)] text-fg lg:col-span-6">
                {careers.role}
              </h2>
              <ul className="flex flex-wrap gap-2 lg:col-span-6 lg:justify-end">
                {careers.meta.map((item) => (
                  <li
                    key={item}
                    className="micro rounded-full border border-line-2 bg-white/[0.04] px-3.5 py-1.5 text-faint"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* 3 — Intro (lead éditorial, décalée sur la droite). */}
          <Reveal delay={0.16}>
            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
              <p className="max-w-[62ch] text-[17px] leading-[1.65] text-fg-2 lg:col-span-7 lg:col-start-6">
                {careers.intro}
              </p>
            </div>
          </Reveal>

          {/* 4 — Fiche de poste : 4 blocs en 2 colonnes décalées (asymétrie). */}
          <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {careers.sections.map((block, index) => (
              <Reveal
                key={block.id}
                as="article"
                // M2 — cascade 80 ms, ≤ 6 éléments (4 blocs).
                delay={index * 0.08}
                className={cn(
                  "rounded-[20px] border border-line bg-surface p-7",
                  index % 2 === 1 && "lg:mt-14",
                )}
              >
                <span aria-hidden="true" className="micro block text-faint">
                  {cardIndexLabel(index, total)}
                </span>
                <h2 className="mt-4 text-[19px] font-semibold tracking-[-0.02em] text-fg">
                  {block.heading}
                </h2>
                <ul className="mt-5 space-y-3">
                  {block.bullets.map((bullet, bulletIndex) => (
                    <li
                      key={`${block.id}-${bulletIndex}`}
                      className="relative pl-5 text-[15px] leading-[1.6] text-fg-2"
                    >
                      {/* Règle « une donnée clé par écran » : la puce volt est
                          portée par le PREMIER item de chaque bloc ; les autres
                          restent neutres (`line-2`). Décoratif → aria-hidden. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-0 top-[0.6em] size-[7px] rounded-full bg-current",
                          bulletIndex === 0 ? "text-accent" : "text-line-2",
                        )}
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>

          {/* 5 — Bloc candidature : split 5/7 (texte / formulaire). */}
          <Reveal delay={0.08}>
            <div className="mt-16 grid grid-cols-1 gap-8 border-t border-line pt-12 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-5">
                <h2 className="h-display text-[clamp(1.75rem,3vw,2.5rem)] text-fg">
                  {careers.applyTitle}
                </h2>
                <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.65] text-muted">
                  {careers.applyDescription}
                </p>
              </div>
              <div className="lg:col-span-7">
                <ApplyForm
                  form={careers.form}
                  locale={locale}
                  removeLabel={platform.common.cancel}
                />
              </div>
            </div>
          </Reveal>

          {/* 6 — Retour fantôme vers la landing. */}
          <Reveal delay={0.16}>
            <div className="mt-14">
              <Button variant="ghost" href={`/${locale}`}>
                {platform.common.back}
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
