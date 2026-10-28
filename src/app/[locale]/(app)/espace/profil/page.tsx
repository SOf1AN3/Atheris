import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProfileForms } from "@/components/app/ProfileForms";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type ProfilPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * `/{locale}/espace/profil` : page profil unifiée (T13).
 *
 * Le layout `(app)` assure déjà la garde session/rôle ; on refait une
 * vérification défensive (`auth()`) car le formulaire a besoin d'un compte
 * `active` (et de son email) pour pré-remplir les champs.
 */
export async function generateMetadata({
  params,
}: ProfilPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.profile.title };
}

export default async function ProfilPage({
  params,
}: ProfilPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const session = await auth();
  if (!session || session.user.status !== "active") {
    redirect(`/${locale}/connexion`);
  }

  const dict = await getPlatformDictionary(locale);
  const { profile, validation, signup, common } = {
    profile: dict.profile,
    validation: dict.auth.validation,
    signup: dict.auth.signup,
    common: dict.common,
  };
  const wrongPasswordMessage = dict.auth.login.errors.invalid;
  const genericMessage = dict.auth.login.errors.generic;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
        {profile.title}
      </h1>

      {/* Nom en lecture seule (non modifiable, cf. nameReadonlyHint). */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="text-[13px] font-semibold text-fg">{signup.nameLabel}</p>
        <p className="mt-1 text-[15px] text-fg">{session.user.name}</p>
        <p className="mt-2 text-[13px] text-muted">{profile.nameReadonlyHint}</p>
      </div>

      {/* Le composant client reçoit un sous-ensemble SÉRIALISABLE de messages
          (le dictionnaire complet contient des fonctions : validation.tooShort
          / tooLong — impossibles à transmettre à un Client Component). */}
      <ProfileForms
        defaultEmail={session.user.email ?? ""}
        profile={profile}
        passwordRules={signup.passwordRules}
        loading={common.loading}
        errors={{
          emailInvalid: validation.emailInvalid,
          phoneInvalid: validation.phoneInvalid,
          required: validation.required,
          passwordMismatch: validation.passwordMismatch,
          passwordWeak: validation.passwordWeak,
          passwordTooShort: validation.tooShort(12),
          duplicateEmail: signup.duplicateEmail,
          wrongPassword: wrongPasswordMessage,
          generic: genericMessage,
        }}
      />
    </div>
  );
}
