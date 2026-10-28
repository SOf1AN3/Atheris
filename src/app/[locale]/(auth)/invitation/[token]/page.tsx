import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivateForm } from "@/components/app/client/ActivateForm";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type InvitationPageProps = {
  params: Promise<{ locale: string; token: string }>;
};

/**
 * `/{locale}/invitation/{token}` : page PUBlique d'activation d'un compte
 * (création de compte par lien d'invitation — FE-9 · T26).
 *
 * - Jeton d'invitation (64 car. hex) lu dans l'URL et transmis au formulaire ;
 *   la page ne le valide pas (le Zod de `activateAccount` tranche :
 *   jeton inconnu/expiré/déjà utilisé → code i18nalisé côté client).
 * - Aucun champ e-mail : le jeton porte l'adresse, jamais modifiable à
 *   l'activation (anti-takeover, motif `invitations.ts`).
 * - `generateMetadata` vit dans CETTE page (le layout `(auth)` fournit un
 *   titre par défaut fusionné ici) : `seo.invitation.{title,description}` ;
 *   aucun email n'est exposé (le token le porte mais il n'est pas lisible
 *   sans DB, et la fuite serait inutile).
 * - Le layout `(auth)` fournit la carte centrée ; pas de session requise
 *   (action publique) — un compte déjà connecté peut activer un second lien,
 *   cas légitime d'invitation.
 * - Tous les libellés viennent du dict (`auth.invitation.*`, `common.*`,
 *   `auth.signup.*`, `auth.validation.*`) : aucune constante locale bilingue.
 */
export async function generateMetadata({
  params,
}: InvitationPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title: dict.seo.invitation.title,
    description: dict.seo.invitation.description,
  };
}

export default async function InvitationPage({
  params,
}: InvitationPageProps): Promise<React.JSX.Element> {
  const { locale, token } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getPlatformDictionary(locale);
  const { signup, validation, login, invitation } = dict.auth;

  return (
    <div className="flex flex-col gap-6 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {invitation.title}
        </h1>
      </div>

      {/* Le composant client reçoit un sous-ensemble SÉRIALISABLE de messages
          (le dictionnaire complet contient des fonctions : validation.tooShort
          / tooLong — impossibles à transmettre à un Client Component). */}
      <ActivateForm
        token={token}
        locale={locale}
        labels={{
          nameLabel: signup.nameLabel,
          passwordLabel: signup.passwordLabel,
          passwordConfirmLabel: signup.passwordConfirmLabel,
          submit: invitation.submit,
          loading: dict.common.loading,
          successTitle: invitation.successTitle,
          successBody: invitation.successBody,
          signIn: login.submit,
          errorInvalid: invitation.invalid,
          errorExpired: invitation.expired,
          errorUsed: invitation.used,
          errorDuplicate: invitation.duplicate,
          errorGeneric: login.errors.generic,
          required: validation.required,
          nameTooShort: validation.tooShort(2),
          nameTooLong: validation.tooLong(120),
          passwordTooShort: validation.tooShort(8),
          passwordTooLong: validation.tooLong(256),
          passwordMismatch: validation.passwordMismatch,
        }}
      />
    </div>
  );
}
