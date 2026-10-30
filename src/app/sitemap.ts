import type { MetadataRoute } from "next";

/** Domaine de production — base des URL absolues du sitemap.
 *  Miroir de `SITE_URL` (.env.local) et du repli de `absoluteInterviewUrl`. */
const SITE_URL = "https://atheris-labs.sofianeasma.me";

/**
 * Sitemap statique des 2 locales (`/fr`, `/en`, SSG via `src/app/[locale]/page.tsx`).
 * Les URL alternates sont référencées ici en absolu ; l'hreflang `<head>` reste
 * porté par `alternates.languages` de `generateMetadata` dans le layout.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const alternates = {
    languages: {
      fr: `${SITE_URL}/fr`,
      en: `${SITE_URL}/en`,
    },
  };

  /** Alternates de la page recrutement (même pattern, chemin imbriqué). */
  const recrutementAlternates = {
    languages: {
      fr: `${SITE_URL}/fr/recrutement`,
      en: `${SITE_URL}/en/recrutement`,
    },
  };

  return [
    {
      url: `${SITE_URL}/fr`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
      alternates,
    },
    {
      url: `${SITE_URL}/en`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
      alternates,
    },
    {
      url: `${SITE_URL}/fr/recrutement`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: recrutementAlternates,
    },
    {
      url: `${SITE_URL}/en/recrutement`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: recrutementAlternates,
    },
  ];
}
