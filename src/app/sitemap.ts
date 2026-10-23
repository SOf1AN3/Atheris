import type { MetadataRoute } from "next";

/** Domaine placeholder documenté (tâche SEO) : à remplacer dès le domaine définitif. */
const SITE_URL = "https://atherislabs.com";

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
  ];
}
