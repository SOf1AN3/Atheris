import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { isValidLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { cn } from "@/lib/utils";

type SdrKitPageProps = {
  params: Promise<{ locale: string }>;
};

/** Densité NORMALE (DESIGN §2.3) + container landing — identique à /recrutement. */
const CONTAINER_CLASS = "mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]";

/**
 * PDF statique servi depuis `public/`.
 *
 * Toute URL contenant un point est exclue du matcher du middleware — ce
 * fichier est donc délivré **sans authentification ni autorisation**, ce qui
 * est ici assumé : la page est un point de téléchargement public, accessible
 * par URL simple et partageable en interne comme en recrutement.
 */
const PDF_HREF = "/SDR-Onboarding-Kit.pdf";

/** SEO — `*…*` (convention d'affichage §2.2.1) jamais laissé dans le `<title>`. */
export async function generateMetadata({
  params,
}: SdrKitPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const dict = await getDictionary(locale);
  const brand = `${dict.nav.brand.name} ${dict.nav.brand.suffix}`;

  return {
    title: `${dict.sdrKit.title.replace(/\*/g, "")} · ${brand}`,
    description: dict.sdrKit.description,
    alternates: {
      canonical: `/${locale}/sdr-onboarding-kit`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l}/sdr-onboarding-kit`] as const),
      ),
    },
  };
}

/**
 * Page « SDR Onboarding Kit » — point de téléchargement dédié du PDF.
 *
 * Dans le groupe `(marketing)` : header, footer, skip-link et JSON-LD sont
 * fournis par le layout, et le middleware y laisse passer (seule la matrice
 * `/espace/*` exige une session active). Composant serveur.
 *
 * Le **document reste intégralement en anglais** : seules les chaînes de
 * chrome de la page sont localisées, et `languageNote` rend cette limite
 * explicite plutôt que de laisser deviner une version FR inexistante.
 */
export default async function SdrKitPage({
  params,
}: SdrKitPageProps): Promise<ReactNode> {
  const { locale } = await params;

  // Défensif : le layout racine a déjà validé la locale.
  if (!isValidLocale(locale)) {
    notFound();
  }

  const [dict, platform] = await Promise.all([
    getDictionary(locale),
    getPlatformDictionary(locale),
  ]);
  const kit = dict.sdrKit;

  return (
    <main id="main" tabIndex={-1}>
      <section
        aria-labelledby="sdr-kit-title"
        className="border-t border-line py-[clamp(80px,10vh,128px)]"
      >
        <div className={CONTAINER_CLASS}>
          {/* 1 — En-tête asymétrique : titre 7/12 · bloc téléchargement 5/12. */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <SectionHeading
                as="h1"
                index="09"
                headingId="sdr-kit-title"
                eyebrow={kit.eyebrow}
                title={kit.title}
                description={kit.description}
              />
            </div>

            {/* Le SEUL aplat volt de la page : le CTA de téléchargement (§2.6).
                `justify-center` : la carte s'étire à la hauteur de la colonne h1
                (grille stretch) — sans quoi son contenu collerait en haut et
                laisserait un vide disgracieux en bas. */}
            <Reveal
              delay={0.08}
              className="flex flex-col justify-center rounded-[20px] border border-line border-t-line-2 bg-surface p-7 lg:col-span-5"
            >
              <span aria-hidden="true" className="micro block text-faint">
                {kit.fileName}
              </span>

              <Button
                className="mt-5 w-full"
                href={PDF_HREF}
                download
                aria-label={`${kit.downloadLabel} — PDF, 1.5 MB`}
              >
                {kit.downloadLabel}
              </Button>

              <p className="mt-4 text-[13px] leading-[1.5] text-muted">
                {kit.languageNote}
              </p>
            </Reveal>
          </div>

          {/* 2 — Bandeau document : 4 pastilles mono. */}
          <Reveal delay={0.12}>
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-8">
              {kit.meta.map((item) => (
                <li
                  key={item}
                  className="micro rounded-full border border-line-2 bg-white/[0.04] px-3.5 py-1.5 text-faint"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* 3 — Intro (lead éditorial). */}
          <Reveal delay={0.16}>
            <p className="mt-8 max-w-[68ch] text-[17px] leading-[1.65] text-fg-2">
              {kit.intro}
            </p>
          </Reveal>

          {/* 4 — Ce que contient le kit : split 4/8, index mono numéroté. */}
          <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-4">
              <h2 className="h-display text-[clamp(1.5rem,2.5vw,2rem)] text-fg">
                {kit.includesTitle}
              </h2>
            </div>

            <ol className="lg:col-span-8">
              {kit.includes.map((item, index) => (
                <li
                  key={item}
                  className="flex items-baseline gap-5 border-b border-line py-4 first:border-t"
                >
                  {/* Règle « une donnée clé par écran » : seul le PREMIER index
                      porte le volt ; les autres restent `faint` (même arbitrage
                      que /recrutement sur les puces). Décoratif → aria-hidden. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "micro w-7 shrink-0",
                      index === 0 ? "text-accent" : "text-faint",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] leading-[1.6] text-fg-2">{item}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* 5 — Chiffres clés du kit (bande hairline). */}
          <Reveal delay={0.08}>
            <dl className="mt-14 grid grid-cols-2 gap-y-7 border-y border-line py-8 lg:grid-cols-4">
              {kit.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="micro text-faint">{fact.label}</dt>
                  <dd className="mt-2 text-[19px] font-semibold tracking-[-0.02em] text-fg">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>

          {/* 6 — Encart diffusion : rappel de confidentialité. */}
          <Reveal delay={0.12}>
            <div className="mt-12 rounded-[20px] border border-line border-l-2 border-l-line-3 bg-white/[0.02] p-7">
              <p className="micro text-faint">{kit.confidentialTitle}</p>
              <p className="mt-3 max-w-[72ch] text-[15px] leading-[1.6] text-muted">
                {kit.confidentialDescription}
              </p>
            </div>
          </Reveal>

          {/* 7 — Retour fantôme vers la landing. */}
          <Reveal delay={0.16}>
            <div className="mt-10">
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
