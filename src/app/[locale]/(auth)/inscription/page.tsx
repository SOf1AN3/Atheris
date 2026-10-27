import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateForm } from "@/components/app/CandidateForm";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type InscriptionPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * `/{locale}/inscription` : page PUBlique de candidature (Sales Development Representative, T10).
 *
 * - `generateMetadata` vit dans CETTE page (jamais dans le layout `(auth)`,
 *   réservé à FE-2) et s'appuie sur `seo.signup` du dictionnaire plateforme.
 * - Le layout `(auth)` fournit la carte centrée ; on rend ici le `h1`, le
 *   sous-titre, le formulaire client et le lien « déjà un compte ? ».
 */
export async function generateMetadata({
  params,
}: InscriptionPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title: dict.seo.signup.title,
    description: dict.seo.signup.description,
  };
}

export default async function InscriptionPage({
  params,
}: InscriptionPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getPlatformDictionary(locale);
  const { signup, validation, login } = dict.auth;
  const { loading } = dict.common;

  return (
    <div className="flex flex-col gap-6 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {signup.title}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          {signup.subtitle}
        </p>
      </div>

      {/* Le composant client reçoit un sous-ensemble SÉRIALISABLE de messages
          (le dictionnaire complet contient des fonctions : validation.tooShort
          / tooLong — impossibles à transmettre à un Client Component). */}
      <CandidateForm
        locale={locale}
        signup={signup}
        loading={loading}
        errors={{
          emailInvalid: validation.emailInvalid,
          phoneInvalid: validation.phoneInvalid,
          required: validation.required,
          passwordMismatch: validation.passwordMismatch,
          passwordWeak: validation.passwordWeak,
          nameTooShort: validation.tooShort(2),
          nameTooLong: validation.tooLong(120),
          passwordTooShort: validation.tooShort(12),
          generic: login.errors.generic,
        }}
      />

      <p className="text-[13px] text-muted">
        <Link
          href={`/${locale}/connexion`}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {signup.alreadyHaveAccount}
        </Link>
      </p>
    </div>
  );
}
