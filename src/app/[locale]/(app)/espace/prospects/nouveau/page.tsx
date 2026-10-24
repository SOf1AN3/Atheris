import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  AddProspectForm,
  type AddProspectFormLabels,
  type AddProspectFormMessages,
} from "@/components/app/vendor/AddProspectForm";
import { Button } from "@/components/ui/Button";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + action DB au rendu : jamais statique, jamais pré-rendu au build
// (aucune lecture `getDb()` au moment de `next build`).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Nouveau prospect » (FE-7 · T20).
 *
 * Un seul écran mobile-first porté par le client `AddProspectForm`
 * (validation locale Zod + Server Action `addMyProspect` — le viewer est
 * reconstruit côté serveur dans `@/actions/vendor`, jamais monté du client).
 *
 * GARDES (défense en profondeur) :
 * - le middleware RBAC bloque déjà `/prospects/*` au rôle `client` ;
 * - cette page le ré-asserte (`notFound()`) + double filet session du layout
 *   (`redirect` connexion) repris ici pour rester correcte appelée seule.
 *
 * Tous les libellés viennent du dict (`pipeline.newProspect`,
 * `prospect.fields.*`, `common.*`) ; les messages de validation
 * proviennent de `auth.validation.*` et `pipeline.messages.*`.
 */

/** Suffixe des routes prospects (retour), SANS préfixe de locale. */
const PROSPECTS_HREF = "/espace/prospects";

type NouveauProspectPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: NouveauProspectPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.pipeline.newProspect };
}

export default async function NouveauProspectPage({
  params,
}: NouveauProspectPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  // RBAC route : le rôle `client` n'a aucun accès pipeline → 404 silencieux
  // (aucune information sur l'existence de la ressource).
  if (session.user.role === "client") notFound();

  const dict = await getPlatformDictionary(locale);

  const labels: AddProspectFormLabels = {
    name: dict.prospect.fields.fullName,
    email: dict.prospect.labels.email,
    phone: dict.prospect.labels.phone,
    note: dict.prospect.fields.note,
    submit: dict.common.submit,
    optionalSuffix: dict.common.optional,
  };

  const messages: AddProspectFormMessages = {
    required: dict.auth.validation.required,
    emailInvalid: dict.auth.validation.emailInvalid,
    phoneInvalid: dict.auth.validation.phoneInvalid,
    // Fonctions du dict résolues ici (frontière RSC : strings seulement).
    nameTooShort: dict.auth.validation.tooShort(2),
    noteTooLong: dict.auth.validation.tooLong(2000),
    duplicate: dict.pipeline.messages.duplicate,
    createdToast: dict.pipeline.messages.createdToast,
    retry: dict.common.retry,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {/* Retour au pipeline — ghost (flèche décorative masquée, cf. FE-4). */}
        <Button
          variant="ghost"
          size="sm"
          href={`/${locale}${PROSPECTS_HREF}`}
          className="w-fit self-start [&>span]:hidden"
        >
          ← {dict.common.back}
        </Button>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {dict.pipeline.newProspect}
        </h1>
      </div>

      {/* Formulaire pleine largeur, mobile-first (§3.6). */}
      <div className="w-full max-w-xl">
        <AddProspectForm locale={locale} labels={labels} messages={messages} />
      </div>
    </div>
  );
}
