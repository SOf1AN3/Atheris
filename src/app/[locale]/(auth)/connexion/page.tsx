import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { LoginForm } from "@/components/app/LoginForm";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { HOME_BY_ROLE } from "@/lib/permissions";

type ConnexionPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Page « Connexion » (T09) — formulaire réel branché sur la Server Action
 * `login()` (T03). `useSearchParams` (callbackUrl) vit dans un composant
 * client : `<Suspense>` est requis pour la prerender statique (Next 15).
 *
 * ─── RÈGLE « DÉJÀ CONNECTÉ » (déplacée depuis le middleware) ────────────────
 * Le middleware Edge ne dispose pas de la DB : il ne peut distinguer un jeton
 * valable d'un jeton **dont le compte a été supprimé** → boucle infinie
 * constatée en E2E (espace → connexion → espace…, `ERR_TOO_MANY_REDIRECTS`).
 * La règle vit donc ICI, via le wrapper `auth()` qui revalide en base :
 * - session valide → redirection vers la home du rôle (comportement d'origine) ;
 * - session nulle (compte supprimé/désactivé, ou jeton absent) → **le formulaire
 *   s'affiche** : le cycle est rompu et l'utilisateur repart avec un jeton neuf.
 */
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: ConnexionPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    return {};
  }
  const dict = await getPlatformDictionary(locale);
  return {
    title: dict.seo.login.title,
    description: dict.seo.login.description,
  };
}

export default async function ConnexionPage({ params }: ConnexionPageProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const dict = await getPlatformDictionary(locale);
  const { login, validation } = dict.auth;

  // Connecté ET compte toujours valide en DB → retour à la home du rôle.
  // Un jeton orphelin (compte supprimé) rend `auth()` → `null` : la page
  // s'affiche au lieu de rebondir (voir note de tête, règle déplacée du
  // middleware Edge qui ne peut pas interroger la DB).
  const session = await auth();
  if (session !== null) {
    redirect(`/${locale}${HOME_BY_ROLE[session.user.role]}`);
  }

  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {login.title}
        </h1>
        <p className="text-sm leading-snug text-muted">{login.subtitle}</p>
      </div>
      <Suspense fallback={null}>
        <LoginForm
          locale={locale}
          labels={{
            emailLabel: login.emailLabel,
            passwordLabel: login.passwordLabel,
            submit: login.submit,
            submitLoading: login.submitLoading,
            forgotNote: login.forgotNote,
            signupLink: login.signupLink,
          }}
          messages={{
            emailInvalid: validation.emailInvalid,
            required: validation.required,
            passwordTooShort: validation.tooShort(8),
            errors: login.errors,
          }}
        />
      </Suspense>
    </>
  );
}
