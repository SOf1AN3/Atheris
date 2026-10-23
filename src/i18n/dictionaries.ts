import type { SiteContent } from "@/content/types";
import type { Locale } from "@/i18n/config";

const loaders = {
  fr: () => import("@/content/fr").then((m) => m.fr),
  en: () => import("@/content/en").then((m) => m.en),
} satisfies Record<Locale, () => Promise<SiteContent>>;

/** Charge le contenu de la locale, repli FR. */
export async function getDictionary(locale: Locale): Promise<SiteContent> {
  return (loaders[locale] ?? loaders.fr)();
}
