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
import {
  ClientAccessCard,
  type ClientAccessCardLabels,
} from "@/components/app/prospect/ClientAccessCard";
import type { BriefFieldLabel } from "@/components/app/prospect/brief-steps";
import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import {
  clientProjects,
  prospectBriefs,
  prospects,
  quotes,
} from "@/lib/db/schema";
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
 *  4. rôle `sdr` → **lecture seule** (décision FE-6) : le brief est
 *     l'outil du commercial / manager / CEO — `saveBriefBlock` refuse de
 *     toute façon son rôle, la page se contente de désactiver la saisie ;
 *  5. uuid d'URL invalide ou prospect/brief absent → `notFound()` (le brief
 *     absent est un cas nominal : la page affiche 5 blocs vides).
 */

/** Garde uuid sur le segment d'URL (évite une erreur PG sur un id forgé). */
const uuidSchema = z.uuid();

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
  const readOnly = viewer.role === "sdr";

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
    .select({
      id: prospects.id,
      fullName: prospects.fullName,
      email: prospects.email,
      status: prospects.status,
    })
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);
  const prospect = prospectRows[0];
  if (prospect === undefined) notFound();

  // --- Éligibilité à l'espace client (Lot 3 · PLAN.md §FE-D) ---------------
  // Miroir des gardes 3 et 4 de `createClientInvitation` (`@/actions/invitations`)
  // : statut ouvrant le portail + projet de livraison rattaché au prospect.
  // Le refus éventuel reste serveur (`invalid`), mais le bouton n'est jamais
  // présenté sur un prospect non éligible.
  const invitableStatus =
    prospect.status === "client_actif" || prospect.status === "en_livraison";
  let hasDeliveryProject = false;
  if (invitableStatus) {
    const projectRows = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .innerJoin(quotes, eq(clientProjects.quoteId, quotes.id))
      .where(eq(quotes.prospectId, prospect.id))
      .limit(1);
    hasDeliveryProject = projectRows.length > 0;
  }
  const canInviteClient = invitableStatus && hasDeliveryProject;

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
    saving: dict.brief.saving,
    saved: dict.brief.savedToast,
    retry: dict.common.retry,
    next: dict.common.next,
    previous: dict.brief.previous,
    backToProspect: dict.brief.backToProspect,
    requiredError: dict.auth.validation.required,
    readOnlyNotice: dict.brief.readOnlyNotice,
    readOnly,
    fields: fieldDefs,
  };

  // --- Carte « accès client » (Lot 3) — libellés 100 % dict ---------------
  // `{actor}` de la phrase d'audit est remplacé ICI (le dictionnaire ne
  // franchit jamais la frontière RSC) — motif : `activityPhrase` de la fiche
  // détaillée. Aucun littéral bilingue, aucune branche sur la locale.
  const clientAccessLabels: ClientAccessCardLabels = {
    title: dict.auth.invitation.email.client.subject,
    description: dict.auth.invitation.description,
    submit: dict.client.send,
    sending: dict.recruitment.modal.sending,
    success: dict.activities.invitationCreated.replace(
      "{actor}",
      session.user.name,
    ),
    mailWarning: dict.recruitment.modal.errors.mailFailed,
    linkLabel: dict.interviews.columns.link,
    copy: dict.interviews.copy,
    copied: dict.interviews.copied,
    copyFallback: dict.interviews.copyFallback,
    errors: {
      forbidden: dict.interviews.errors.forbidden,
      notFound: dict.common.notFound,
      invalid: dict.interviews.errors.invalid,
      failed: dict.interviews.errors.failed,
    },
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

      {/* Envoyer le lien d'accès client — seulement si éligible (statut
          `client_actif`/`en_livraison` + projet de livraison). */}
      {canInviteClient ? (
        <ClientAccessCard
          prospectId={prospect.id}
          email={prospect.email}
          name={prospect.fullName}
          locale={locale}
          actor={viewer}
          labels={clientAccessLabels}
        />
      ) : null}

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
