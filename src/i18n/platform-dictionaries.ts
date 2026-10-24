import type { PlatformContent } from "@/content/platform/types";
import type { Locale } from "@/i18n/config";

/**
 * Dictionnaire de la plateforme (T06) — distinct de `src/i18n/dictionaries.ts`
 * qui sert uniquement la landing. Chargement paresseux par locale, exactement
 * sur le même modèle que `getDictionary`.
 */
const loaders = {
  fr: () => import("@/content/platform/fr").then((m) => m.fr),
  en: () => import("@/content/platform/en").then((m) => m.en),
} satisfies Record<Locale, () => Promise<PlatformContent>>;

/** Charge le dictionnaire plateforme de la locale, repli FR. */
export async function getPlatformDictionary(
  locale: Locale,
): Promise<PlatformContent> {
  return (loaders[locale] ?? loaders.fr)();
}
