import { and, asc, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  DealsTab,
  type DealPaymentView,
  type DealQuoteView,
  type DealsCeoLabels,
} from "@/components/app/prospect/DealsTab";
import {
  HistoryTab,
  type HistoryEntryView,
} from "@/components/app/prospect/HistoryTab";
import { IdentityTab } from "@/components/app/prospect/IdentityTab";
import {
  StatusActions,
  type StatusTransitionOption,
} from "@/components/app/prospect/StatusActions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActivitiesContent, QuoteStatus } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import {
  activities,
  payments,
  prospects,
  quotes,
  users,
} from "@/lib/db/schema";
import {
  TRANSITIONS,
  canChangeStatus,
  canViewAllProspects,
  isRole,
  type ProspectStatus,
} from "@/lib/permissions";
import { STATUS_ORDER } from "@/lib/status-meta";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
// `force-dynamic` est exigé par l'en-tête de ce fichier (DB-PENDING) —
// posé ici, comme sur `prospects/page.tsx` et `fiche/page.tsx`.
export const dynamic = "force-dynamic";

/**
 * Atheris — fiche détaillée d'un prospect (FE-5 · T18).
 *
 * ⚠ `force-dynamic` — OBLIGATOIRE (DB-PENDING) : cette page interroge la base
 * via `getDb()` (placeholder tant que la chaîne Neon n'est pas branchée).
 * Sans ce segment, `next build` essaierait de la pré-rendre (SSG) et
 * échouerait sur le placeholder. La page est de toute façon protégée
 * (middleware RBAC + layout `(app)` + session ici) : elle n'a aucune raison
 * d'être statique. `getDb()` n'est JAMAIS appelé au top-level du module.
 *
 * RELECTURE DU PROSPECT (pas d'action dédiée — `src/actions/prospects.ts` est
 * figé et ne prend pas d'id) : SELECT direct Drizzle **avec le même scoping
 * serveur que `listProspects`** (`source_user_id = viewer.id` pour un rôle
 * sans lecture globale). Introuvable OU hors scope → `notFound()` (aucune
 * distinction : pas d'énumération d'ids).
 *
 * PATTERN ONGLETS : les primitives shadcn `Tabs*` sont des Client Components,
 * mais une RSC peut les rendre directement et leur passer des **panneaux
 * Server Components en `children`** (sérialisés dans le RSC payload). C'est le
 * pattern retenu : un wrapper client supplémentaire serait inutile, et les 4
 * onglets restent rendus côté serveur (zéro fetch, zéro `Permissions` importé
 * côté client — seuls `isTerminalStatus` l'est, depuis un module pur).
 */

/** Garde sur l'`id` d'URL : un uuid malformé ne doit jamais atteindre la DB. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Montants DB en centimes USD → dollars (format `en-US`, stable en FR/EN). */
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

/** Variante « toujours une string » (valeurs d'identité, timeline). */
function formatDate(value: Date | null, locale: Locale): string {
  return formatDateOrNull(value, locale) ?? "—";
}

/** Lit une valeur textuelle de `activities.meta` (jsonb non typé). */
function readMetaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Replie une valeur brute de `meta` sur l'enum statut (garde URL/fraude). */
function toStatus(value: unknown): ProspectStatus | null {
  if (typeof value !== "string") return null;
  return STATUS_ORDER.find((status) => status === value) ?? null;
}

// ---------------------------------------------------------------------------
// Journal d'audit — résolution `dict.activities.*` (côté serveur uniquement).
// ---------------------------------------------------------------------------

/**
 * Vrai si `key` est une clé réelle de `dict.activities` (repli `unknown`
 * pour tout code DB sans gabarin correspondant).
 */
function isActivityKey(
  activities: ActivitiesContent,
  key: string,
): key is keyof ActivitiesContent {
  return Object.hasOwn(activities, key);
}

/**
 * Gabarin d'une activité : le code DB (`status.changed`, `quote.status_changed`…)
 * est converti en clé camelCase de `dict.activities` (`statusChanged`,
 * `quoteStatusChanged`…) — correspondance vérifiée sur les littéraux
 * `action:` de `src/actions/*`. Aucun code connu → `activities.unknown`.
 *
 * Les jetons `{actor}` / `{from}` / `{to}` sont remplacés ici par de simples
 * `String.replace` (jamais de fonction côté server, frontière RSC respectée).
 */
function activityPhrase(
  activities: ActivitiesContent,
  action: string,
  tokens: { actor: string; from: string; to: string },
): string {
  const key = action.replace(/[_.]([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const template = isActivityKey(activities, key) ? activities[key] : activities.unknown;
  return template
    .replace("{actor}", tokens.actor)
    .replace("{from}", tokens.from)
    .replace("{to}", tokens.to);
}

// ---------------------------------------------------------------------------
// FE-8 (T21 · T22) — onglet Devis enrichi en actions CEO.
// ---------------------------------------------------------------------------

/**
 * Graphe des transitions de devis — **MIROIR UI** de `QUOTE_TRANSITIONS` figé
 * dans `@/actions/quotes` (`draft→sent|lost`, `sent→signed|lost`, `signed` et
 * `lost` terminaux). Calculé ICI (server) puis transmis en props : le client
 * ne recalcule aucun droit, et l'action figée re-valide le graphe (transition
 * interdite → `forbidden`) — un miroir divergent resterait sans effet.
 */
const QUOTE_ACTIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent", "lost"],
  sent: ["signed", "lost"],
  signed: [],
  lost: [],
};

/** Statuts de devis ouverts à l'ajout d'une échéance (miroir serveur). */
const PAYABLE_QUOTE_STATUSES: readonly QuoteStatus[] = ["sent", "signed"];

// Onglet Devis & paiements : 100 % dict (`prospect.deals.*`, `commissions.*`,
// `common.*`, `auth.validation.*`) — aucune constante locale bilingue (les
// replis documentés par T09 ont été remplacés par les clés `prospect.deals.*`).

type ProspectDetailPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function ProspectDetailPage({
  params,
}: ProspectDetailPageProps): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();
  if (!UUID_PATTERN.test(id)) notFound();

  // Garde défensive identique au layout `(app)` (double filet, cf. profil).
  const session = await auth();
  if (
    !session ||
    session.user.status !== "active" ||
    !isRole(session.user.role)
  ) {
    redirect(`/${locale}/connexion`);
  }

  const viewer = { id: session.user.id, role: session.user.role };
  const dict = await getPlatformDictionary(locale);

  const db = getDb();

  // --- 1. Prospect scopé (lecture seule, scoping serveur non contournable)
  const scopedWhere = canViewAllProspects(viewer.role)
    ? eq(prospects.id, id)
    : and(eq(prospects.id, id), eq(prospects.sourceUserId, viewer.id));

  const prospectRows = await db
    .select({
      id: prospects.id,
      fullName: prospects.fullName,
      company: prospects.company,
      email: prospects.email,
      phone: prospects.phone,
      source: prospects.source,
      status: prospects.status,
      disqualifyReason: prospects.disqualifyReason,
      createdAt: prospects.createdAt,
      updatedAt: prospects.updatedAt,
      ownerName: users.name,
    })
    .from(prospects)
    .leftJoin(users, eq(prospects.sourceUserId, users.id))
    .where(scopedWhere)
    .limit(1);

  const prospect = prospectRows[0];
  if (prospect === undefined) notFound();

  // --- 2. Devis + échéanciers + historique (requêtes parallèles) -----------
  const [quoteRows, paymentRows, activityRows] = await Promise.all([
    db
      .select({
        id: quotes.id,
        amountUsdCents: quotes.amountUsdCents,
        status: quotes.status,
        sentAt: quotes.sentAt,
        signedAt: quotes.signedAt,
      })
      .from(quotes)
      .where(eq(quotes.prospectId, prospect.id))
      .orderBy(desc(quotes.createdAt)),
    db
      .select({
        id: payments.id,
        quoteId: payments.quoteId,
        label: payments.label,
        amountUsdCents: payments.amountUsdCents,
        dueAt: payments.dueAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(quotes, eq(payments.quoteId, quotes.id))
      .where(eq(quotes.prospectId, prospect.id))
      .orderBy(asc(payments.dueAt)),
    db
      .select({
        id: activities.id,
        action: activities.action,
        meta: activities.meta,
        createdAt: activities.createdAt,
        actorName: users.name,
      })
      .from(activities)
      .leftJoin(users, eq(activities.actorId, users.id))
      .where(
        and(eq(activities.entityType, "prospect"), eq(activities.entityId, prospect.id)),
      )
      .orderBy(desc(activities.createdAt))
      .limit(50),
  ]);

  // --- 3. Vues sérialisables pour les onglets (100 % données, pas d'HTML) --
  const paymentsByQuote = new Map<string, DealPaymentView[]>();
  for (const row of paymentRows) {
    const list = paymentsByQuote.get(row.quoteId) ?? [];
    list.push({
      id: row.id,
      label: row.label,
      amountLabel: usdFormatter.format(row.amountUsdCents / 100),
      dueLabel: formatDateOrNull(row.dueAt, locale),
      paidLabel: formatDateOrNull(row.paidAt, locale),
      isPaid: row.paidAt !== null,
      // Renseigné en seconde passe ci-dessous (dépend de l'échéancier entier).
      isFirstPayment: false,
    });
    paymentsByQuote.set(row.quoteId, list);
  }
  // 2ᵉ passe — déclencheur de commissions : le 1ᵉʳ paiement payé d'un devis
  // génère les lignes (décision BK-4). Tant qu'aucune échéance n'est encaissée,
  // chacune des échéances non payées EST ce déclencheur potentiel →
  // ConfirmDialog + rappels affichés pour chacune (après le premier encaissement,
  // la page re-fetch et les suivantes passent en exécution directe).
  for (const list of paymentsByQuote.values()) {
    const hasPaidPayment = list.some((payment) => payment.isPaid);
    for (const payment of list) {
      payment.isFirstPayment = !payment.isPaid && !hasPaidPayment;
    }
  }

  const dealQuotes: DealQuoteView[] = quoteRows.map((row) => {
    // La date affichée est celle pertinente au statut (pas de redite de
    // libellé : le badge voisin porte déjà le statut localisé).
    const relevantDate = row.status === "signed" ? row.signedAt ?? row.sentAt : row.sentAt;
    return {
      id: row.id,
      amountLabel: usdFormatter.format(row.amountUsdCents / 100),
      statusLabel: dict.statuses.quote[row.status],
      // État brut → `expectedFrom` (optimistic locking de `changeQuoteStatus`).
      status: row.status,
      dateLabel: formatDateOrNull(relevantDate, locale),
      // Miroir server du garde-fou `createPayment` (aucun bouton mort).
      canAddPayment: PAYABLE_QUOTE_STATUSES.includes(row.status),
      // Transitions du graphe figé, libellées ici (frontière RSC) :
      // `label` = libellé de STATUT (badge + toast), `buttonLabel` = intitulé
      // du bouton d'action (spécifique sur `draft→sent`).
      actions: QUOTE_ACTIONS[row.status].map((to) => ({
        to,
        label: dict.statuses.quote[to],
        buttonLabel: to === "sent" ? dict.prospect.deals.markSent : dict.statuses.quote[to],
      })),
      payments: paymentsByQuote.get(row.id) ?? [],
    };
  });

  const historyEntries: HistoryEntryView[] = activityRows.map((row) => {
    const from = toStatus(row.meta.from);
    const to = toStatus(row.meta.to);
    return {
      id: row.id,
      // Phrase du journal (`dict.activities.*`) — le code brut DB n'est plus
      // affiché ; auteur et transition `from → to` sont déjà dans la phrase.
      actionLabel: activityPhrase(dict.activities, row.action, {
        actor: row.actorName ?? "—",
        from: from !== null ? dict.statuses.prospect[from] : "—",
        to: to !== null ? dict.statuses.prospect[to] : "—",
      }),
      note: readMetaString(row.meta, "note"),
      reason: readMetaString(row.meta, "reason"),
      dateLabel: formatDate(row.createdAt, locale),
    };
  });

  // --- 4. Transitions autorisées pour le rôle (calcul SERVEUR) -------------
  const allowedTransitions: StatusTransitionOption[] = TRANSITIONS[prospect.status]
    .filter((to) => canChangeStatus(viewer.role, prospect.status, to))
    .map((to) => ({ to, label: dict.statuses.prospect[to] }));

  const statusLabels = dict.statuses.prospect;
  const companyLabel = prospect.company ?? "—";

  // --- 5. Actions CEO (FE-8) — préparées ICI, jamais recalculées côté client
  const isCeo = viewer.role === "ceo";
  const ceoLabels: DealsCeoLabels | undefined = isCeo
    ? {
        create: {
          open: dict.prospect.deals.createQuote,
          amount: dict.commissions.amount,
          externalRef: dict.prospect.deals.externalRef,
          pdf: dict.prospect.deals.pdf,
          optional: dict.common.optional,
          submit: dict.common.save,
          cancel: dict.common.cancel,
          required: dict.auth.validation.required,
          refTooLong: dict.auth.validation.tooLong(100),
          amountInvalid: dict.prospect.deals.amountInvalid,
          pdfInvalid: dict.prospect.deals.pdfInvalid,
          genericError: dict.auth.login.errors.generic,
        },
        payment: {
          add: dict.prospect.deals.addPayment,
          labelField: dict.prospect.deals.paymentLabel,
          amount: dict.commissions.amount,
          dueField: dict.prospect.deals.paymentDue,
          optional: dict.common.optional,
          submit: dict.common.save,
          cancel: dict.common.cancel,
          required: dict.auth.validation.required,
          labelTooShort: dict.auth.validation.tooShort(2),
          labelTooLong: dict.auth.validation.tooLong(120),
          amountInvalid: dict.prospect.deals.amountInvalid,
          genericError: dict.auth.login.errors.generic,
        },
        markPaid: {
          markPaid: dict.prospect.deals.markPaid,
          confirmChange: dict.prospect.actions.confirmChange,
          cancel: dict.common.cancel,
          triggerWarning: dict.commissions.generatesWarning,
          noClawback: dict.commissions.noClawbackWarning,
          paid: dict.commissions.paid,
          retry: dict.common.retry,
          generatedTemplate: dict.commissions.generatedCount,
        },
        status: {
          changeStatus: dict.prospect.actions.changeStatus,
          reasonLabel: dict.prospect.actions.reasonLabel,
          reasonRequired: dict.prospect.actions.reasonRequired,
          confirmChange: dict.prospect.actions.confirmChange,
          noClawback: dict.commissions.noClawbackWarning,
          lockedByRole: dict.prospect.actions.lockedByRole,
          cancel: dict.common.cancel,
          retry: dict.common.retry,
        },
        viewCommissions: dict.commissions.queue,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------- En-tête --- */}
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
          {prospect.fullName}
        </h1>
        <p className="text-[15px] text-muted">{companyLabel}</p>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            status={prospect.status}
            label={statusLabels[prospect.status]}
          />
          {/* Client : dialog de confirmation + Server Action d'écriture. */}
          <StatusActions
            prospectId={prospect.id}
            currentStatus={prospect.status}
            transitions={allowedTransitions}
            viewer={viewer}
            statusLabels={statusLabels}
            labels={{
              changeStatus: dict.prospect.actions.changeStatus,
              reasonRequired: dict.prospect.actions.reasonRequired,
              reasonLabel: dict.prospect.actions.reasonLabel,
              confirmChange: dict.prospect.actions.confirmChange,
              lockedByRole: dict.prospect.actions.lockedByRole,
              cancel: dict.common.cancel,
              close: dict.common.close,
              retry: dict.common.retry,
            }}
          />
        </div>
      </header>

      {/* ------------------------------------------------------- Onglets --- */}
      {/* `Tabs`/`TabsList`… sont des Client Components rendus ici depuis une
          RSC : les panneaux passés en `children` restent du server-rendered
          (RSC payload) — aucun wrapper client supplémentaire. */}
      <Tabs defaultValue="identity" activationMode="automatic">
        <div className="overflow-x-auto pb-1">
          <TabsList>
            <TabsTrigger value="identity">{dict.prospect.tabs.identity}</TabsTrigger>
            <TabsTrigger value="brief">{dict.prospect.tabs.brief}</TabsTrigger>
            <TabsTrigger value="deals">{dict.prospect.tabs.deals}</TabsTrigger>
            <TabsTrigger value="history">{dict.prospect.tabs.history}</TabsTrigger>
          </TabsList>
        </div>

        {/* --- Identité (onglet par défaut) --- */}
        <TabsContent value="identity">
          <IdentityTab
            labels={{
              email: dict.prospect.labels.email,
              phone: dict.prospect.labels.phone,
              company: dict.prospect.labels.company,
              source: dict.prospect.labels.source,
              owner: dict.prospect.labels.owner,
              createdAt: dict.prospect.labels.createdAt,
              updatedAt: dict.prospect.labels.updatedAt,
              reason: dict.prospect.actions.reasonLabel,
            }}
            values={{
              email: prospect.email,
              phone: prospect.phone,
              company: companyLabel,
              source: prospect.source,
              owner: prospect.ownerName ?? "—",
              createdAt: formatDate(prospect.createdAt, locale),
              updatedAt: formatDate(prospect.updatedAt, locale),
            }}
            disqualifyReason={prospect.disqualifyReason}
          />
        </TabsContent>

        {/* --- Fiche projet : placeholder volontaire (FE-6 / T19). --- */}
        {/* BriefTab.tsx n'est PAS créée ici : carte sobre uniquement, libellés
            100 % dict (`prospect.tabs.briefPlaceholder`). */}
        <TabsContent value="brief">
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-lg font-semibold tracking-[-0.015em] text-fg">
              {dict.prospect.tabs.brief}
            </p>
            <p className="mt-1 text-[15px] text-muted">
              {dict.prospect.tabs.briefPlaceholder}
            </p>
          </div>
        </TabsContent>

        {/* --- Devis & paiements : lecture seule (FE-5) + actions CEO (FE-8,
            `isCeo`/`ceoLabels` préparés server-side ci-dessus). --- */}
        <TabsContent value="deals">
          <DealsTab
            prospectId={prospect.id}
            quotes={dealQuotes}
            isCeo={isCeo}
            ceoLabels={ceoLabels}
            commissionsHref={`/${locale}/espace/commissions`}
            labels={{
              empty: dict.prospect.deals.empty,
              paid: dict.prospect.deals.paid,
              upcoming: dict.prospect.deals.upcoming,
            }}
          />
        </TabsContent>

        {/* --- Historique (journal d'audit, 50 dernières lignes). --- */}
        <TabsContent value="history">
          <HistoryTab entries={historyEntries} emptyMessage={dict.common.noData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
