import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import {
  BriefWizard,
  type BriefWizardLabels,
  type BriefWizardProps,
} from "@/components/app/prospect/BriefWizard";
import type { BriefFieldLabel } from "@/components/app/prospect/brief-steps";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import { prospectBriefs, prospects } from "@/lib/db/schema";
import { isRole } from "@/lib/permissions";

/**
 * Atheris — « Assistant fiche projet » du prospect (FE-6 · T19).
 *
 * PAGE SERVER : la session, le prospect, le brief et **tous les libellés** du
 * wizard sont résolus ici — le client reçoit uniquement des strings déjà
 * traduites (le dictionnaire ne franchit jamais la frontière RSC) et zéro
 * fonction (props 100 % sérialisables).
 *
 * `dynamic = "force-dynamic"` (OBLIGATOIRE) : la page lit une session et la
 * DB → jamais pré-rendue, donc `next build` n'exécute jamais `getDb()` sur
 * le `DATABASE_URL` placeholder (constat DB-PENDING du projet).
 *
 * GARDES (dans l'ordre) :
 *  1. locale valide (sinon 404) ;
 *  2. session absente / inactif / rôle inconnu → redirection connexion
 *     (filet défensif : le middleware RBAC fait déjà le même job) ;
 *  3. rôle `client` → `notFound()` : la fiche est un outil interne ;
 *  4. rôle `vendeur` → **lecture seule** (décision FE-6) : le brief est
 *     l'outil du commercial / manager / CEO — `saveBriefBlock` refuse de
 *     toute façon son rôle, la page se contente de désactiver la saisie ;
 *  5. uuid d'URL invalide ou prospect/brief absent → `notFound()` (le brief
 *     absent est un cas nominal : la page affiche 5 blocs vides).
 */

/** Garde uuid sur le segment d'URL (évite une erreur PG sur un id forgé). */
const uuidSchema = z.uuid();

/**
 * ⚠ CLÉS DICTIONNAIRE MANQUANTES (dict verrouillé — **listées en
 * restitution**, jamais créées dans `src/content/platform/*`) :
 * `brief.savedToast` et `brief.readOnlyNotice` n'existent pas dans le
 * contrat `BriefContent`. Repli local bilingue **documenté** (même motif que
 * `NEW_PROSPECT_LABEL`, page pipeline) : ces chaînes sont résolues ici et
 * voyagent dans `labels` — le client ne contient aucune string affichable et
 * le dictionnaire n'est jamais transmis.
 */
const MISSING_BRIEF_LABELS: Record<Locale, { saved: string; readOnlyNotice: string }> = {
  fr: {
    saved: "Modification enregistrée.",
    readOnlyNotice: "Consultation seule : votre rôle ne permet pas de modifier cette fiche.",
  },
  en: {
    saved: "Change saved.",
    readOnlyNotice: "Read-only: your role cannot modify this brief.",
  },
};

type ProspectBriefPageProps = {
  /** Next 15 : `params` est une `Promise`, résolue par la page server. */
  params: Promise<{ locale: string; id: string }>;
};

/**
 * Convertit un bloc jsonb lu en base en valeurs texte du wizard : seules les
 * clés **affichées** (celles du dict) et les valeurs réellement `string` sont
 * conservées — une clé héritée d'une version antérieure du dict est ignorée
 * (jamais d'affichage d'une donnée non labellisée).
 */
function toBlockValues(
  source: Record<string, unknown> | undefined,
  definitions: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  if (source === undefined) return values;
  for (const key of Object.keys(definitions)) {
    const value = source[key];
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/** Libellés d'un bloc : `{ businessProblem: "Problème business" }` → labels. */
function toFieldLabels(definitions: Record<string, string>): Record<string, BriefFieldLabel> {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, label]) => [key, { label }]),
  );
}

export const dynamic = "force-dynamic";

export default async function ProspectBriefPage({
  params,
}: ProspectBriefPageProps): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();

  // --- Session + rôles ------------------------------------------------------
  const session = await auth();
  if (
    !session ||
    session.user.status !== "active" ||
    !isRole(session.user.role)
  ) {
    redirect(`/${locale}/connexion`);
  }
  if (session.user.role === "client") notFound();

  const viewer = { id: session.user.id, role: session.user.role };
  const readOnly = viewer.role === "vendeur";

  if (!uuidSchema.safeParse(id).success) notFound();

  // --- Dictionnaire : tous les labels résolus server-side -------------------
  const dict = await getPlatformDictionary(locale);

  const fieldDefs: BriefWizardLabels["fields"] = {
    context: toFieldLabels(dict.brief.fields.context),
    need: toFieldLabels(dict.brief.fields.need),
    constraints: toFieldLabels(dict.brief.fields.constraints),
    tech: toFieldLabels(dict.brief.fields.tech),
    followUp: toFieldLabels(dict.brief.fields.followUp),
  };

  const steps: BriefWizardLabels["steps"] = [
    { key: "context", title: dict.brief.steps.context.label, description: dict.brief.steps.context.description },
    { key: "need", title: dict.brief.steps.need.label, description: dict.brief.steps.need.description },
    { key: "constraints", title: dict.brief.steps.constraints.label, description: dict.brief.steps.constraints.description },
    { key: "tech", title: dict.brief.steps.tech.label, description: dict.brief.steps.tech.description },
    { key: "followUp", title: dict.brief.steps.followUp.label, description: dict.brief.steps.followUp.description },
  ];

  // --- Données (DB lazy : jamais au build, grâce à force-dynamic) -----------
  const db = getDb();

  const prospectRows = await db
    .select({ id: prospects.id, fullName: prospects.fullName })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);
  const prospect = prospectRows[0];
  if (prospect === undefined) notFound();

  const briefRows = await db
    .select({
      blockContext: prospectBriefs.blockContext,
      blockNeed: prospectBriefs.blockNeed,
      blockConstraints: prospectBriefs.blockConstraints,
      blockTech: prospectBriefs.blockTech,
      blockFollowUp: prospectBriefs.blockFollowUp,
    })
    .from(prospectBriefs)
    .where(eq(prospectBriefs.prospectId, id))
    .limit(1);
  const brief = briefRows[0];

  const initialData: BriefWizardProps["initialData"] = {
    context: toBlockValues(brief?.blockContext, dict.brief.fields.context),
    need: toBlockValues(brief?.blockNeed, dict.brief.fields.need),
    constraints: toBlockValues(brief?.blockConstraints, dict.brief.fields.constraints),
    tech: toBlockValues(brief?.blockTech, dict.brief.fields.tech),
    followUp: toBlockValues(brief?.blockFollowUp, dict.brief.fields.followUp),
  };

  // Complétion recomputée à partir des blocs (source de vérité) : le compteur
  // affiché reste juste même si `completed_blocks` a été écrit par une
  // version antérieure de l'action.
  const initialCompleted = Object.values(initialData).filter((block) =>
    Object.values(block).some((value) => value.trim().length > 0),
  ).length;

  // --- Libellés résolus ici (frontière RSC : uniquement des données) --------
  const labels: BriefWizardLabels = {
    steps,
    gaugeTemplate: dict.brief.gauge.blocksDone,
    ready: dict.brief.gauge.readyForQuote,
    save: dict.common.save,
    saving: dict.common.loading,
    saved: MISSING_BRIEF_LABELS[locale].saved,
    retry: dict.common.retry,
    next: dict.common.next,
    // ⚠ clé `brief.previous` manquante (dict verrouillé) : « Retour » de
    // `common` est le repli le plus proche pour reculer d'une étape.
    previous: dict.common.back,
    // ⚠ clé `brief.backToProspect` manquante : composition `common.back` +
    // nom du prospect (donnée, pas du contenu) pour un nom accessible
    // distinct du bouton « Retour » précédent.
    backToProspect: `${dict.common.back} — ${prospect.fullName}`,
    requiredError: dict.auth.validation.required,
    readOnlyNotice: MISSING_BRIEF_LABELS[locale].readOnlyNotice,
    readOnly,
    fields: fieldDefs,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/${locale}/espace/prospects/${id}`}
          className="inline-flex w-fit items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">←</span>
          {prospect.fullName}
        </Link>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">{dict.brief.title}</h1>
      </div>

      {/* Jauge + rail + panneau vivent côté client (état dynamique). */}
      <BriefWizard
        prospectId={id}
        locale={locale}
        viewer={viewer}
        initialData={initialData}
        initialCompleted={initialCompleted}
        labels={labels}
      />
    </div>
  );
}
