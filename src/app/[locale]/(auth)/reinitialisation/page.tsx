import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PasswordResetForm } from "@/components/app/PasswordResetForm";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type ReinitialisationPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

/**
 * `/{locale}/reinitialisation?token=…` — page PUBlique de choix du nouveau
 * mot de passe (L10 · VAGUE 2, Piston C).
 *
 * - `token` lu dans l'URL et transmis au formulaire ; la page ne le valide
 *   pas (l'action `resetPassword` tranche : format, signature HMAC, expiration
 *   — un SEUL code `invalid` côté client, aucun détail, C4).
 * - `token` absent de l'URL (ou forme non-string) → `notFound()` (404 muet,
 *   motif C4 — jamais 401/403 sur une route publique).
 * - Jeton stateless signé, valable 30 min — LIMITES DOCUMENTÉES dans
 *   `src/actions/password-reset.ts` (non révocable ; la révocation repose sur
 *   la courte durée de vie).
 * - Libellés 100 % dict (`auth.passwordReset.reset.*`, `auth.validation.*`) :
 *   aucune string en dur (C2).
 */
export async function generateMetadata({
  params,
}: ReinitialisationPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title: dict.seo.passwordReset.reset.title,
    description: dict.seo.passwordReset.reset.description,
  };
}

export default async function ReinitialisationPage({
  params,
  searchParams,
}: ReinitialisationPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  const { token } = await searchParams;
  if (!isValidLocale(locale)) notFound();
  // `token` absent ou multi-valué (URL forgée `?token=a&token=b`) → 404 muet.
  if (typeof token !== "string" || token.length === 0) notFound();

  const dict = await getPlatformDictionary(locale);
  const { passwordReset, validation } = dict.auth;
  const { reset, forgot } = passwordReset;

  return (
    <div className="flex flex-col gap-6 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {reset.title}
        </h1>
        <p className="text-sm leading-snug text-muted">{reset.subtitle}</p>
      </div>

      {/* Le composant client reçoit un sous-ensemble SÉRIALISABLE de
          messages (le dictionnaire complet contient des fonctions). */}
      <PasswordResetForm
        token={token}
        locale={locale}
        labels={{
          passwordLabel: reset.passwordLabel,
          passwordConfirmLabel: reset.passwordConfirmLabel,
          submit: reset.submit,
          submitLoading: reset.submitLoading,
          successTitle: reset.successTitle,
          successBody: reset.successBody,
          signIn: reset.signIn,
          invalidToken: reset.invalidToken,
          errorGeneric: reset.errorGeneric,
          errorService: reset.errorService,
          required: validation.required,
          passwordTooShort: validation.tooShort(8),
          passwordTooLong: validation.tooLong(256),
          passwordMismatch: validation.passwordMismatch,
          // Libellé réutilisé du bloc « demande » : « Mot de passe oublié ? »
          // est exactement l'action de repli après un lien mort.
          requestNewLink: forgot.linkLabel,
        }}
      />
    </div>
  );
}
