import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  AddProspectForm,
  type AddProspectFormLabels,
  type AddProspectFormMessages,
} from "@/components/app/vendor/AddProspectForm";
import { Button } from "@/components/ui/Button";
import { isValidLocale, type Locale } from "@/i18n/config";
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
 * ⚠ CLÉS DICTIONNAIRE MANQUANTES (dict verrouillé — listées en restitution,
 * jamais créées) : `pipeline.newProspect` (h1 + libellé du bouton), un label
 * dédié « Nom / entreprise » et un label « Note » n'existent pas dans
 * `src/content/platform/{fr,en}.ts` → replis locaux bilingues **documentés**
 * ci-dessous (même arbitrage que `NEW_PROSPECT_LABEL` de FE-5). Tous les
 * messages de validation proviennent, eux, du dict (`auth.validation.*`,
 * `pipeline.messages.*`, `common.*`).
 */

/** Suffixe des routes prospects (retour), SANS préfixe de locale. */
const PROSPECTS_HREF = "/espace/prospects";

/** `pipeline.newProspect` absent : repli bilingue documenté (dict verrouillé). */
const PAGE_TITLE: Record<Locale, string> = {
  fr: "Nouveau prospect",
  en: "New prospect",
};

/** Label « Nom / entreprise » absent : repli bilingue documenté. */
const NAME_LABEL: Record<Locale, string> = {
  fr: "Nom / entreprise",
  en: "Name / company",
};

/** Label « Note » absent : repli bilingue documenté (fr et en identiques). */
const NOTE_LABEL: Record<Locale, string> = {
  fr: "Note",
  en: "Note",
};

type NouveauProspectPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: NouveauProspectPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  return { title: PAGE_TITLE[locale] };
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
    name: NAME_LABEL[locale],
    email: dict.prospect.labels.email,
    phone: dict.prospect.labels.phone,
    note: NOTE_LABEL[locale],
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
          {PAGE_TITLE[locale]}
        </h1>
      </div>

      {/* Formulaire pleine largeur, mobile-first (§3.6). */}
      <div className="w-full max-w-xl">
        <AddProspectForm locale={locale} labels={labels} messages={messages} />
      </div>
    </div>
  );
}
