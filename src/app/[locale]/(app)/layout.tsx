import { notFound } from "next/navigation";

import { isValidLocale } from "@/i18n/config";

/** Espace connecté : non indexé par les moteurs de recherche (PLAN §2.2). */
export const metadata = {
  robots: { index: false, follow: false },
};

type AppLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Layout du groupe `(app)` : placeholder « children seulement ».
 * Le shell applicatif (nav latérale, topbar) sera construit en T08.
 */
export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return <main className="bg-ink">{children}</main>;
}
