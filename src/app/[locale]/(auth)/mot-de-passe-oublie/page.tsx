import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PasswordForgotForm } from "@/components/app/PasswordForgotForm";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type MotDePasseOubliePageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * `/{locale}/mot-de-passe-oublie` — page PUBlique de demande de
 * réinitialisation (L10 · VAGUE 2, Piston C), miroir du style de
 * `/invitation/[token]` (carte centrée du layout `(auth)`).
 *
 * - Branchée sur la Server Action `requestPasswordReset` : la réponse est
 *   TOUJOURS générique côté serveur (anti-énumération C4) — le message
 *   « si un compte correspond… » est donc toujours celui affiché.
 * - `generateMetadata` dans CETTE page (le layout `(auth)` fournit un titre
 *   par défaut fusionné ici) : `seo.passwordReset.forgot.*`.
 * - Libellés 100 % dict (`auth.passwordReset.forgot.*`, `auth.validation.*`,
 *   `auth.login.*`) : aucune string en dur (C2).
 */
export async function generateMetadata({
  params,
}: MotDePasseOubliePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title: dict.seo.passwordReset.forgot.title,
    description: dict.seo.passwordReset.forgot.description,
  };
}

export default async function MotDePasseOubliePage({
  params,
}: MotDePasseOubliePageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getPlatformDictionary(locale);
  const { passwordReset, login, validation } = dict.auth;
  const { forgot } = passwordReset;

  return (
    <div className="flex flex-col gap-6 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {forgot.title}
        </h1>
        <p className="text-sm leading-snug text-muted">{forgot.subtitle}</p>
      </div>

      {/* Le composant client reçoit un sous-ensemble SÉRIALISABLE de
          messages (le dictionnaire complet contient des fonctions :
          validation.tooShort / tooLong — impossibles à transmettre). */}
      <PasswordForgotForm
        locale={locale}
        labels={{
          emailLabel: forgot.emailLabel,
          submit: forgot.submit,
          submitLoading: forgot.submitLoading,
          success: forgot.success,
          signIn: login.submit,
          required: validation.required,
          emailInvalid: validation.emailInvalid,
          errorGeneric: login.errors.generic,
        }}
      />

      {/* Lien retour connexion — accessible clavier, cible ≥ 44 px. */}
      <Link
        href={`/${locale}/connexion`}
        className="mx-auto inline-flex min-h-11 items-center text-[13px] leading-snug text-muted underline underline-offset-4 transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
      >
        {login.title}
      </Link>
    </div>
  );
}
