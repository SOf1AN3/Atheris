import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/app/AppShell";
import { getDictionary } from "@/i18n/dictionaries";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

/** Espace connecté : non indexé par les moteurs de recherche (PLAN §2.2). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type AppLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Layout du groupe `(app)` : garde d'authentification + shell applicatif
 * (sidebar, topbar, toasts) — T08.
 *
 * Double filet avec le middleware (qui ne fait que préfixer la locale, T07) :
 * pas de session, compte non `active` ou rôle inconnu (JWT d'un ancien
 * schéma) → redirection vers la connexion localisée.
 */
export default async function AppLayout({
  children,
  params,
}: AppLayoutProps): Promise<React.JSX.Element> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const session = await auth();

  if (
    !session ||
    session.user.status !== "active" ||
    !isRole(session.user.role)
  ) {
    redirect(`/${locale}/connexion`);
  }

  const role = session.user.role;
  const dict = await getPlatformDictionary(locale);
  // DESIGN §6.4 — libellé du skip-link : clé du dict SITE (`a11y.skipToContent`),
  // absente du dict plateforme.
  const { a11y } = await getDictionary(locale);

  return (
    <AppShell
      items={dict.nav[role]}
      locale={locale}
      nav={dict.nav}
      user={{ name: session.user.name }}
      roleLabel={dict.statuses.role[role]}
      skipToContent={a11y.skipToContent}
    >
      {children}
    </AppShell>
  );
}
