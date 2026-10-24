import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivateForm } from "@/components/app/client/ActivateForm";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type InvitationPageProps = {
  params: Promise<{ locale: string; token: string }>;
};

/**
 * ⚠ CLÉS DICTIONNAIRE MANQUANTES (dict verrouillé T09 — listées en
 * restitution, **jamais créées**) : aucune clé `seo.invitation`,
 * `auth.invitation.*` ni `client.activate*` n'existe pour la page publique
 * d'activation d'un lien d'espace client. Replis documentés :
 * - **titre SEO** : `${common.brand.name} ${common.brand.suffix}` (même
 *   composition que le layout `(auth)`, dict 100 % `common.*`) ;
 * - **titre de page, CTA et bloc succès** : mini-constantes bilingues
 *   ci-dessous (même arbitrage que `NEW_PROSPECT_LABEL`, FE-5) — les clés
 *   `auth.signup.successTitle/Body` parlent d'une candidature examinée « sous
 *   48 heures » : mensongère pour une activation IMMÉDIATE, donc écartées.
 */
const ACTIVATION_TITLE: Record<Locale, string> = {
  fr: "Activation de votre espace",
  en: "Activate your workspace",
};

const ACTIVATION_SUBMIT: Record<Locale, string> = {
  fr: "Activer mon compte",
  en: "Activate my account",
};

const ACTIVATION_SUCCESS_TITLE: Record<Locale, string> = {
  fr: "Compte activé",
  en: "Account activated",
};

const ACTIVATION_SUCCESS_BODY: Record<Locale, string> = {
  fr: "Votre espace client est prêt. Connectez-vous pour suivre votre projet.",
  en: "Your client portal is ready. Sign in to follow your project.",
};

/**
 * `/{locale}/invitation/{token}` : page PUBlique d'activation du compte
 * client (FE-9 · T26).
 *
 * - Jeton d'invitation (64 car. hex) lu dans l'URL et transmis au formulaire ;
 *   la page ne le valide pas (le Zod de `activateClientAccount` tranche :
 *   jeton inconnu/expiré/déjà utilisé → code i18nalisé côté client).
 * - `generateMetadata` vit dans CETTE page (le layout `(auth)` fournit un
 *   titre par défaut fusionné ici) ; aucun email n'est exposé (le token le
 *   porte mais il n'est pas lisible sans DB, et la fuite serait inutile).
 * - Le layout `(auth)` fournit la carte centrée ; pas de session requise
 *   (action publique) — un compte déjà connecté peut activer un second lien,
 *   cas légitime d'invitation.
 */
export async function generateMetadata({
  params,
}: InvitationPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: `${dict.common.brand.name} ${dict.common.brand.suffix}` };
}

export default async function InvitationPage({
  params,
}: InvitationPageProps): Promise<React.JSX.Element> {
  const { locale, token } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getPlatformDictionary(locale);
  const { signup, validation, login } = dict.auth;

  return (
    <div className="flex flex-col gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {ACTIVATION_TITLE[locale]}
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
          submit: ACTIVATION_SUBMIT[locale],
          loading: dict.common.loading,
          successTitle: ACTIVATION_SUCCESS_TITLE[locale],
          successBody: ACTIVATION_SUCCESS_BODY[locale],
          signIn: login.submit,
          errorInvalid: dict.common.notFound,
          errorExpired: login.errors.generic,
          errorUsed: login.errors.generic,
          errorDuplicate: signup.duplicateEmail,
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
