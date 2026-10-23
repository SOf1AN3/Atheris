import type { MetadataRoute } from "next";

/** Domaine placeholder documenté (tâche SEO) : à remplacer dès le domaine définitif. */
const SITE_URL = "https://atherislabs.com";

/** Robots.txt : tout indexable, sitemap au même niveau (`src/app/sitemap.ts`). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
