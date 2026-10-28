import { and, asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listMessages } from "@/actions/messages";
import { getProjectOverview } from "@/actions/project";
import { auth } from "@/auth";
import {
  DocList,
  type DocListItem,
  type DocListLabels,
  type InvoiceListItem,
} from "@/components/app/client/DocList";
import {
  MilestoneTimeline,
  type MilestoneTimelineLabels,
  type TimelineMilestone,
} from "@/components/app/client/MilestoneTimeline";
import { ProjectTabs } from "@/components/app/client/ProjectTabs";
import { Thread, type ThreadLabels, type ThreadMessageView } from "@/components/app/client/Thread";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import { clientProjects, documents, payments, quotes } from "@/lib/db/schema";
import { isRole, type ProspectStatus } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (la page lit `auth()`,
// `getDb()` et `listMessages` — aucun pré-rendu au build, aucun cache qui
// servirait une timeline périmée).
export const dynamic = "force-dynamic";

/**
 * Atheris — hub du portail client (FE-9 · T26–T29).
 *
 * GARDE (défensive, double filet) : le middleware RBAC (T07) redirige déjà
 * tout rôle ≠ `client` vers SA home (`ROUTE_ACCESS['/projet'] = ['client']`)
 * et le layout `(app)` rejette les sessions absentes/non actives. ICI, un
 * compte interne qui parviendrait malgré tout sur cette page reçoit
 * `notFound()` (404 muet, aucune confirmation d'existence) — `getProjectOverview`
 * est de toute façon verrouillé `client` seul côté action figée.
 *
 * FRONTIÈRE RSC : tous les libellés du dictionnaire sont résolus ICI en
 * strings (les composants client ne reçoivent jamais le dict complet, qui
 * contient des fonctions) ; toutes les dates et tailles sont formatées ici
 * (`Africa/Algiers`, `Intl.NumberFormat`) — le client ne reçoit que des
 * données sérialisables, aucun `Date` (zéro décalage d'hydratation).
 *
 * LECTURES (requêtes parallèles) :
 * - `getProjectOverview(viewer)` (action figée, client seul) → projet +
 *   jalons ;
 * - `documents WHERE owner_type='project' AND owner_id=$1` — **sans la
 *   colonne `bytes`** (léger + aucune donnée binaire en RSC payload) ;
 * - `payments JOIN quotes` via `client_projects.quote_id` → échéancier +
 *   totaux (`totalPaidCents` / `remainingCents`) ;
 * - `listMessages` (action figée) → fil de discussion.
 */

/** Montants DB en centimes USD → dollars (format `en-US`, stable FR/EN). */
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Libellés 100 % dict : `statuses.milestoneStatus` (états d'un jalon),
// `statuses.document` (kind de PDF), `client.emptyProject` (état vide) —
// aucune constante locale bilingue.

/**
 * Format de date UNIQUE côté serveur (string transmise au client → aucun
 * décalage d'hydratation, fuseau `Africa/Algiers` sur stockage UTC, T02).
 */
function formatDateOrNull(value: Date | null, locale: Locale): string | null {
  if (value === null) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(value);
}

/** Variante « toujours une string » (voygette « — » si absente). */
function formatDate(value: Date | null | undefined, locale: Locale): string {
  return formatDateOrNull(value ?? null, locale) ?? "—";
}

/** Taille en octets → unité locale (`ko`/`Mo` FR, `kB`/`MB` EN), base 1024. */
function formatBytes(bytes: number, locale: Locale): string {
  const units = locale === "fr" ? (["o", "ko", "Mo"] as const) : (["B", "kB", "MB"] as const);
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = unitIndex === 0 ? String(value) : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

/**
 * Libellé du badge statut projet — **réutilisation documentée** : le statut
 * projet est une colonne `text` (`en_livraison` | `clos`, valeurs identiques
 * à celles du dict `statuses.prospect`) ; le dict n'a aucune
 * clé `statuses.project.*` ni méta de badge §12.2 dédiée aux projets →
 * badge NEUTRE `bg-surface-2 text-muted border border-line` (couleur seule
 * jamais porteur : le texte du dict l'est). Statut inconnu → pas de badge.
 */
function projectStatusLabel(
  status: string,
  prospectStatuses: Record<ProspectStatus, string>,
): string | null {
  if (status === "en_livraison") return prospectStatuses.en_livraison;
  if (status === "clos") return prospectStatuses.clos;
  return null;
}

type ProjetPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: ProjetPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title: dict.seo.clientPortal.title,
    description: dict.seo.clientPortal.description,
  };
}

export default async function ProjetPage({
  params,
}: ProjetPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }
  // Portail client UNIQUEMENT : un rôle interne qui parviendrait ici (le
  // middleware le redirige déjà vers sa home) reçoit 404 muet.
  if (session.user.role !== "client") notFound();

  const viewer = { id: session.user.id, role: session.user.role };
  const dict = await getPlatformDictionary(locale);

  const { project } = await getProjectOverview(viewer);

  // --- État vide légitime : compte client sans projet rattaché --------------
  if (project === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {dict.client.projectTitle}
        </h1>
        <p className="text-[15px] text-muted">{dict.common.noData}</p>
        {/* État vide du portail : `client.emptyProject` (dict). */}
        <p className="text-[13px] text-muted">{dict.client.emptyProject}</p>
      </div>
    );
  }

  // --- Lectures parallèles (documents + échéancier + fil) -------------------
  const db = getDb();
  const [documentRows, paymentRows, messageResult] = await Promise.all([
    // Colonnes EXPLICITES : `bytes` n'est jamais projeté (payload RSC léger,
    // aucun octet binaire côté client — le téléchargement passe par la route
    // `/api/documents/[id]`, BK-5).
    db
      .select({
        id: documents.id,
        kind: documents.kind,
        filename: documents.filename,
        byteSize: documents.byteSize,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(
        and(eq(documents.ownerType, "project"), eq(documents.ownerId, project.id)),
      )
      .orderBy(desc(documents.createdAt)),
    // Échéancier du devis rattaché au projet (1-1 : quote_id unique).
    db
      .select({
        id: payments.id,
        label: payments.label,
        amountUsdCents: payments.amountUsdCents,
        dueAt: payments.dueAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(quotes, eq(payments.quoteId, quotes.id))
      .innerJoin(clientProjects, eq(clientProjects.quoteId, quotes.id))
      .where(eq(clientProjects.id, project.id))
      .orderBy(asc(payments.dueAt)),
    listMessages({ projectId: project.id }, viewer),
  ]);

  // Le projet vient d'être résolu pour CE viewer via `getProjectOverview`
  // (même accès) : `listMessages` ne peut échouer que sur une erreur
  // d'infra (propagée en 500) — repli défensif sur fil vide sinon,
  // journalisé (FE-11 · T33 : aucun repli `ok: false` silencieux).
  if (!messageResult.ok) {
    console.error("[projet] échec de la lecture du fil de discussion", messageResult.code);
  }
  const threadItems = messageResult.ok ? messageResult.items : [];

  // --- Vues sérialisables (100 % données, libellés/dates résolus ici) -------
  const timelineMilestones: TimelineMilestone[] = project.milestones.map(
    (milestone) => ({
      key: milestone.key,
      status: milestone.status,
      order: milestone.order,
      label: dict.statuses.milestone[milestone.key],
      validatedAtLabel: formatDateOrNull(milestone.validatedAt, locale),
    }),
  );

  const docItems: DocListItem[] = documentRows.map((row) => ({
    id: row.id,
    kindLabel: dict.statuses.document[row.kind],
    filename: row.filename,
    sizeLabel: formatBytes(row.byteSize, locale),
    dateLabel: formatDate(row.createdAt, locale),
    // Route BK-5 : téléchargement authentifié par cookies de session.
    // La route est montée SANS segment de locale (`/api/documents/[id]`) :
    // le middleware T07 laisse maintenant `/api/*` intact (correctif Lead
    // après signalement FE-9) — le href pointe donc la route réelle.
    href: `/api/documents/${row.id}`,
  }));

  // Totaux de l'échéancier : encaissé vs à venir (cents → dollars ici).
  let totalPaidCents = 0;
  let remainingCents = 0;
  for (const row of paymentRows) {
    if (row.paidAt !== null) totalPaidCents += row.amountUsdCents;
    else remainingCents += row.amountUsdCents;
  }

  const invoiceItems: InvoiceListItem[] = paymentRows.map((row) => ({
    id: row.id,
    label: row.label,
    amountLabel: usdFormatter.format(row.amountUsdCents / 100),
    dueLabel: formatDateOrNull(row.dueAt, locale),
    isPaid: row.paidAt !== null,
  }));

  const threadMessages: ThreadMessageView[] = threadItems.map((item) => ({
    id: item.id,
    body: item.body,
    senderId: item.senderId,
    senderName: item.senderName,
    senderRoleLabel: dict.statuses.role[item.senderRole],
    createdAtLabel: formatDate(item.createdAt, locale),
    // `markThreadRead` ne marque que les messages REÇUS : `readAt === null`
    // sur un message d'un AUTRE expéditeur = non lu pour moi.
    unread: item.readAt === null && item.senderId !== viewer.id,
  }));

  // --- Libellés résolus (frontière RSC : uniquement des strings) -----------
  const statusLabel = projectStatusLabel(project.status, dict.statuses.prospect);

  const timelineLabels: MilestoneTimelineLabels = {
    title: dict.client.milestones,
    validateStep: dict.client.validateStep,
    validateConfirm: dict.client.validateConfirm,
    cancel: dict.common.cancel,
    retry: dict.common.retry,
    statusLabels: dict.statuses.milestoneStatus,
  };

  const docListLabels: DocListLabels = {
    emptyDocuments: dict.client.emptyDocuments,
    noData: dict.common.noData,
    paid: dict.client.paid,
    due: dict.client.due,
    totalPaid: dict.client.totalPaid,
    remaining: dict.client.remaining,
  };

  const threadLabels: ThreadLabels = {
    title: dict.client.messages,
    placeholder: dict.client.messagePlaceholder,
    send: dict.client.send,
    loading: dict.common.loading,
    empty: dict.client.emptyMessages,
    retry: dict.common.retry,
    unread: dict.client.unread,
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* En-tête : nom du projet + badge statut (neutre, voir helper). */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {project.name}
        </h1>
        {statusLabel !== null ? (
          <span className="inline-flex items-center rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
            {statusLabel}
          </span>
        ) : null}
      </div>

      {/* Onglets : Suivi (timeline = panneau héros, onglet actif par
          défaut) · Documents · Factures · Messagerie. Les panneaux sont des
          Server Components passés en `children` (pattern FE-5) ; `Thread`
          n'est monté (et ne marque le fil lu) qu'à l'ouverture de son
          onglet, Radix démontant les panneaux inactifs. */}
      <ProjectTabs
        labels={{
          tracking: dict.client.milestones,
          documents: dict.client.documents,
          invoices: dict.client.invoices,
          messages: dict.client.messages,
        }}
        trackingPanel={
          <MilestoneTimeline
            projectId={project.id}
            projectStatus={project.status}
            milestones={timelineMilestones}
            labels={timelineLabels}
          />
        }
        documentsPanel={
          <DocList variant="documents" items={docItems} labels={docListLabels} />
        }
        invoicesPanel={
          <DocList
            variant="invoices"
            items={invoiceItems}
            totals={{
              totalPaidLabel: usdFormatter.format(totalPaidCents / 100),
              remainingLabel: usdFormatter.format(remainingCents / 100),
            }}
            labels={docListLabels}
          />
        }
        messagesPanel={
          <Thread
            projectId={project.id}
            currentUserId={viewer.id}
            messages={threadMessages}
            labels={threadLabels}
          />
        }
      />
    </div>
  );
}
