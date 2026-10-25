import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";

import { MotionConfig } from "framer-motion";

import { isValidLocale, locales } from "@/i18n/config";

import "../globals.css";

/* DESIGN §2.2 — les 3 voix du système typographique :
   - Inter Tight  (structure)  → titres + UI + corps
   - Instrument Serif (émotion) → italique des titres, `.voix`
   - JetBrains Mono (donnée)   → index de section, micro-labels, chiffres
   Inter seul est désormais interdit en display. */
const interTight = Inter_Tight({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter-tight",
});

const instrumentSerif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
});

type Params = { locale: string };

type RootLayoutProps = {
  children: React.ReactNode;
  params: Promise<Params>;
};

/**
 * Root layout global (fournit `<html>`) de toutes les routes sous `[locale]`.
 * Header/Footer, skip-link, JSON-LD et `generateMetadata` SEO vivent dans le
 * groupe de routes `(marketing)` afin de ne pas s'appliquer à `(auth)`/`(app)`.
 * Locale validée via `isValidLocale` (Next 15 : `params` est un Promise).
 */
export default async function RootLayout({
  children,
  params,
}: RootLayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return (
    <html
      lang={locale}
      className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body className="bg-ink text-fg antialiased">
        {/* MotionConfig ne rend aucun DOM (provider de contexte) : le body
            garde exactement le même DOM serveur/client, seul le moteur de
            Framer Motion respecte `prefers-reduced-motion` après hydratation.
            Il reste au root pour englober Header (marketing) et pages. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}

export const dynamicParams = false;

export function generateStaticParams(): Array<{ locale: string }> {
  return locales.map((locale) => ({ locale }));
}
