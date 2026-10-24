import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { isValidLocale } from "@/i18n/config";
import { HOME_BY_ROLE, isRole } from "@/lib/permissions";

type EspacePageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * `/{locale}/espace` : route d'entrée de l'espace connecté, sans contenu
 * propre — elle redirige vers la home du rôle (`HOME_BY_ROLE`, PLAN §3.2).
 *
 * Garde identique à celle du layout `(app)` (double filet) pour que la
 * redirection reste correcte même si la route est appelée seule.
 */
export default async function EspacePage({
  params,
}: EspacePageProps): Promise<React.JSX.Element> {
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

  redirect(`/${locale}${HOME_BY_ROLE[session.user.role]}`);
}
