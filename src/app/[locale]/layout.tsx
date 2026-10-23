import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getDictionary } from "@/i18n/dictionaries";
import { isValidLocale, locales } from "@/i18n/config";

import "../globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

/** Domaine placeholder documenté (tâche SEO dédiée : sitemap/canonical). */
const SITE_URL = "https://atherislabs.com";
/** Identifiant JSON-LD stable référencé par `Service.provider`. */
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** Formats `lang_TERRITORY` attendus par OpenGraph (`og:locale`). */
const OG_LOCALES = {
  fr: "fr_FR",
  en: "en_US",
} as const satisfies Record<(typeof locales)[number], string>;

type Params = { locale: string };

type RootLayoutProps = {
  children: React.ReactNode;
  params: Promise<Params>;
};

/**
 * Root layout (fournit `<html>`) de la landing bilingue.
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

  const dict = await getDictionary(locale);

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "ATHERIS LABS",
        url: SITE_URL,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          email: "contact@atherislabs.com",
          availableLanguage: [...locales],
        },
      },
      {
        "@type": "Service",
        name: dict.services.title,
        description: dict.services.description,
        serviceType: dict.services.items.map((item) => item.title),
        provider: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "FAQPage",
        mainEntity: dict.faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
    // Sécurité : neutralise toute fermeture de balise `<script>` injection.
  }).replace(/</g, "\\u003c");

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning={false}>
      <body className="bg-ink text-fg antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-fg"
        >
          {dict.a11y.skipToContent}
        </a>
        <Header nav={dict.nav} a11y={dict.a11y} />
        {children}
        <Footer nav={dict.nav} footer={dict.footer} />
      </body>
    </html>
  );
}

export const dynamicParams = false;

export function generateStaticParams(): Array<{ locale: string }> {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const dict = await getDictionary(locale);
  const alternateLocales = locales.filter((l) => l !== locale);

  return {
    title: dict.seo.title,
    description: dict.seo.description,
    keywords: dict.seo.keywords,
    alternates: {
      languages: { fr: "/fr", en: "/en" },
    },
    openGraph: {
      title: dict.seo.title,
      description: dict.seo.description,
      locale: OG_LOCALES[locale],
      alternateLocale: alternateLocales.map((l) => OG_LOCALES[l]),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: dict.seo.title,
      description: dict.seo.description,
    },
  };
}
