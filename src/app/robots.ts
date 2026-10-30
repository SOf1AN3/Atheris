import type { MetadataRoute } from "next";

/** Domaine de production — base des canonical / sitemap / hreflang.
 *  Miroir de `SITE_URL` (.env.local) et du repli de `absoluteInterviewUrl`. */
const SITE_URL = "https://atheris-labs.sofianeasma.me";

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
