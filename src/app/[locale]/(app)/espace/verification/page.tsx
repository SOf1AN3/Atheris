import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  listIdentityDocs,
  type IdentityDocListItem,
} from "@/actions/identity";
import { auth } from "@/auth";
import {
  IdentityReviewPanel,
  type IdentityReviewLabels,
  type IdentityReviewRow,
} from "@/components/app/IdentityReviewPanel";
import { Reveal } from "@/components/motion/Reveal";
import type { StatusesContent } from "@/content/platform/types";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Vérification » (file de revue KYC, espace CEO, L7b).
 *
 * ─── RÔLE ──────────────────────────────────────────────────────────────────
 * **CEO seul** : `listIdentityDocs` / `reviewIdentityDoc` sont réservées `ceo`
 * côté serveur, la page applique la même garde (motif exact de
 * `espace/recrutement/page.tsx` : la garde de la page est LE premier filet,
 * doublée de la revalidation du rôle dans chaque action).
 *
 * ─── DONNÉES ───────────────────────────────────────────────────────────────
 * Lecture via `listIdentityDocs()` (Server Action, SANS les octets) puis
 * projection en `IdentityReviewRow` : **uniquement des strings et booléens
 * sérialisables** franchissent la frontière RSC. Les dates sont formatées ICI
 * (`Intl.DateTimeFormat`, fuseau `Africa/Algiers` — la DB stocke en UTC) :
 * aucun `Date` ni formatter côté client sur la liste.
 *
 * L'aperçu charge les octets via `/api/identity-docs/[userId]` (route
 * dédiée, contrôle session + rôle CEO, 404 muet) — jamais via une action.
 *
 * ─── ERREURS ───────────────────────────────────────────────────────────────
 * `{ ok: false }` → `console.error` + bloc sobre `common.retry` (aucun détail
 * technique en UI) ; l'erreur d'infra non interceptée par l'action est
 * propagée → 500 (jamais présentée comme « aucune pièce »).
 */

type VerificationPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Format de date/heure UNIQUE côté serveur — miroir exact de
 * `espace/recrutement/page.tsx` (DB en UTC, affichage en `Africa/Algiers`).
 *
 * @param value ISO 8601 (`created_at`, `reviewed_at`, `verified_at`).
 * @returns Date formatée, ou `null` si la valeur est illisible.
 */
function formatDateTime(value: string, locale: Locale): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(date);
}

/**
 * Taille de fichier lisible SANS string en dur : l'unité (`Mo`/`MB`,
 * `ko`/`kB`) vient d'`Intl` — miroir exact de `formatFileSize` de
 * `espace/recrutement/page.tsx`.
 */
function formatFileSize(bytes: number, locale: Locale): string {
  const megabyte = 1024 * 1024;
  const isMegabyte = bytes >= megabyte;
  const unit = isMegabyte ? ("megabyte" as const) : ("kilobyte" as const);
  const value = isMegabyte ? bytes / megabyte : bytes / 1024;

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: isMegabyte ? 1 : 0,
  }).format(value);
}

/** Bloc d'erreur sobre — `common.retry`, aucun détail technique en UI. */
function errorBlock(retryLabel: string): React.JSX.Element {
  return (
    <div className="rounded-[20px] border border-line bg-surface px-6 py-12 text-center">
      <p role="status" className="text-[15px] font-semibold text-fg">
        {retryLabel}
      </p>
    </div>
  );
}

/**
 * Projection `IdentityDocListItem` → `IdentityReviewRow` (tout sérialisable).
 * Les dates et la taille sont formatées ici, côté serveur.
 */
function toRow(
  item: IdentityDocListItem,
  locale: Locale,
  roleLabels: StatusesContent["role"],
  verifiedBadgeLabel: string,
): IdentityReviewRow {
  const verifiedDate =
    item.verifiedAt === null ? null : formatDateTime(item.verifiedAt, locale);

  return {
    userId: item.userId,
    memberName: item.memberName,
    email: item.email,
    roleLabel: roleLabels[item.role],
    verifiedAtLabel:
      verifiedDate === null
        ? null
        : verifiedBadgeLabel.replace("{{date}}", verifiedDate),
    status: item.status,
    filename: item.filename,
    mimeType: item.mimeType,
    byteSizeLabel: formatFileSize(item.byteSize, locale),
    depositedLabel: formatDateTime(item.createdAt, locale) ?? "—",
    reviewedLabel:
      item.reviewedAt === null
        ? null
        : (formatDateTime(item.reviewedAt, locale) ?? "—"),
    rejectionReason: item.rejectionReason,
  };
}

export async function generateMetadata({
  params,
}: VerificationPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return {
    title:
      dict.nav.ceo.find((item) => item.href === "/espace/verification")?.label ??
      dict.verification.title,
  };
}

export default async function VerificationPage({
  params,
}: VerificationPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  // RBAC route : `/espace/verification` est réservé au CEO — les actions
  // refuseraient de toute façon, mais la page ne montre aucun vestige
  // (PII SDR + pièce d'identité).
  if (session.user.role !== "ceo") notFound();

  const dict = await getPlatformDictionary(locale);
  const { verification, common } = dict;
  const title =
    dict.nav.ceo.find((item) => item.href === "/espace/verification")?.label ??
    verification.title;

  const listResult = await listIdentityDocs();

  let content: React.JSX.Element;
  if (!listResult.ok) {
    console.error(
      "[espace/verification] échec de la liste des dossiers",
      listResult.code,
    );
    content = errorBlock(common.retry);
  } else {
    // Libellés résolus ICI (frontière RSC : uniquement des strings au client,
    // y compris les objets de popup et les codes d'erreur traduits).
    const labels: IdentityReviewLabels = {
      loading: common.loading,
      empty: verification.empty,
      emptyHint: verification.emptyHint,
      filterLabel: verification.filterLabel,
      filters: {
        all: verification.filterAll,
        pending: verification.filterPending,
        approved: verification.filterApproved,
        rejected: verification.filterRejected,
      },
      columns: verification.columns,
      status: verification.status,
      openDetail: verification.openDetail,
      closeDetail: verification.closeDetail,
      detailTitle: verification.detailTitle,
      previewUnavailable: verification.previewUnavailable,
      openInNewTab: verification.openInNewTab,
      rejectReasonLabel: verification.rejectReasonLabel,
      approveAction: verification.approveAction,
      approving: verification.approving,
      approveSuccess: verification.approveSuccess,
      rejectAction: verification.rejectAction,
      rejectSuccess: verification.rejectSuccess,
      confirmApprove: verification.confirmApprove,
      rejectDialog: verification.rejectDialog,
      errors: verification.errors,
    };

    content = (
      <IdentityReviewPanel
        rows={listResult.items.map((item) =>
          toRow(
            item,
            locale,
            dict.statuses.role,
            verification.verifiedBadgeLabel,
          ),
        )}
        labels={labels}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.5rem)] text-fg">
          {title}
        </h1>
        <p className="max-w-[68ch] text-[15px] leading-[1.65] text-muted">
          {verification.intro}
        </p>
      </div>

      <Reveal>{content}</Reveal>
    </div>
  );
}
