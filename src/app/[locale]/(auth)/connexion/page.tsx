import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/app/LoginForm";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type ConnexionPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Page « Connexion » (T09) — formulaire réel branché sur la Server Action
 * `login()` (T03). `useSearchParams` (callbackUrl) vit dans un composant
 * client : `<Suspense>` est requis pour la prerender statique (Next 15).
 */
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
