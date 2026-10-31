import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import type { IdentityDocStatus } from "@/actions/identity";
import { auth } from "@/auth";
import {
  IdentityDocUploadForm,
  IdentityNameForm,
  PayoutForm,
  ProfileForms,
} from "@/components/app/ProfileForms";
import { Badge } from "@/components/ui/Badge";
import { getDb } from "@/lib/db";
import { identityDocs, payoutDetails, users } from "@/lib/db/schema";
import { maskEmail, maskIban } from "@/lib/payout-mask";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { cn } from "@/lib/utils";
import type { IdentityContent } from "@/content/platform/types";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

type ProfilPageProps = {
  params: Promise<{ locale: string }>;
};

/** Bloc d'erreur sobre — `common.retry`, aucun détail technique en UI. */
function errorBlock(retryLabel: string): React.JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-[20px] border border-line bg-surface px-6 py-10 text-center"
    >
      <p className="text-[15px] font-semibold text-fg">{retryLabel}</p>
    </div>
  );
}

/**
 * Format de date/heure UNIQUE côté serveur : la DB stocke des ISO 8601 UTC,
 * l'affichage est demandé en `Africa/Algiers` (fuseau de l'espace, spec T02) —
 * miroir exact de `/espace/recrutement` (aucun `Date` côté client).
 *
 * @param value ISO 8601 (`verified_at`, `created_at`, `reviewed_at`).
 * @returns Date formatée, ou `null` si la valeur est illisible.
 */
function formatDateTime(value: Date, locale: Locale): string | null {
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(value);
}

/**
 * Taille de fichier lisible SANS string en dur : l'unité (`Mo`/`MB`, `ko`/`kB`)
 * vient d'`Intl` — miroir de `formatFileSize` de `/espace/recrutement`.
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

/** Pastille de statut du dossier SDR (couleur + texte, jamais la seule couleur). */
function identityStatusBadge(
  status: IdentityDocStatus,
  labels: IdentityContent,
): React.JSX.Element {
  if (status === "approved") {
    return <Badge variant="verified">{labels.statusApproved}</Badge>;
  }
  if (status === "pending") {
    return (
      <Badge
        variant="tech"
        className="border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]"
      >
        {labels.statusPending}
      </Badge>
    );
  }
  return (
    <Badge
      variant="tech"
      className="border-[rgba(255,107,90,0.25)] bg-[rgba(255,107,90,0.12)] text-danger"
    >
      {labels.statusRejected}
    </Badge>
  );
}

/** Vue projetée du dossier KYC du SDR (aucun octet, tout sérialisable). */
type SdrIdentityView = {
  status: IdentityDocStatus;
  filename: string;
  byteSizeLabel: string;
  depositedLabel: string;
  reviewedLabel: string | null;
  verifiedAtLabel: string | null;
  rejectionReason: string | null;
};

/** Vue projetée du moyen de paiement — valeurs DÉJÀ masquées. */
type SdrPayoutView = {
  methodLabel: string;
  fields: ReadonlyArray<{ label: string; value: string }>;
};

export async function generateMetadata({
  params,
}: ProfilPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getPlatformDictionary(locale);
  return { title: dict.profile.title };
}

export default async function ProfilPage({
  params,
}: ProfilPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const session = await auth();
  if (!session || session.user.status !== "active") {
    redirect(`/${locale}/connexion`);
  }

  const dict = await getPlatformDictionary(locale);
  const { profile, validation, signup, common, identity, payout } = {
    profile: dict.profile,
    validation: dict.auth.validation,
    signup: dict.auth.signup,
    common: dict.common,
    identity: dict.identity,
    payout: dict.payout,
  };
  const wrongPasswordMessage = dict.auth.login.errors.invalid;
  const genericMessage = dict.auth.login.errors.generic;

  // ── Lecture SDR (L7/L8) : dossier KYC + moyen de paiement, SANS octets ────
  // KYC et payout sont un pipeline SDR : les autres rôles ne voient que la
  // section « Informations personnelles » (les actions sont de toute façon
  // réservées `sdr` côté serveur).
  const isSdr = session.user.role === "sdr";
  let accountName = session.user.name;
  let verifiedAt: Date | null = null;
  let identityView: SdrIdentityView | null = null;
  let payoutView: SdrPayoutView | null = null;
  let sdrReadFailed = false;

  if (isSdr) {
    try {
      const db = getDb();
      const rows = await db
        .select({
          name: users.name,
          verifiedAt: users.verifiedAt,
          rejectionReason: users.identityRejectionReason,
          docStatus: identityDocs.status,
          docFilename: identityDocs.filename,
          docByteSize: identityDocs.byteSize,
          docCreatedAt: identityDocs.createdAt,
          docReviewedAt: identityDocs.reviewedAt,
          payoutMethod: payoutDetails.method,
          payoutAccountEmail: payoutDetails.accountEmail,
          payoutCurrency: payoutDetails.currency,
          payoutHolderName: payoutDetails.holderName,
          payoutBankName: payoutDetails.bankName,
          payoutIban: payoutDetails.iban,
        })
        .from(users)
        .leftJoin(identityDocs, eq(identityDocs.userId, users.id))
        .leftJoin(payoutDetails, eq(payoutDetails.userId, users.id))
        .where(eq(users.id, session.user.id))
        .limit(1);
      const row = rows[0];
      if (row !== undefined) {
        // Nom depuis la base (le JWT de session peut être en retard après un
        // changement de nom) + état du verrou H5 (`verified_at`).
        accountName = row.name;
        verifiedAt = row.verifiedAt;
        if (row.docStatus !== null && row.docFilename !== null) {
          const verifiedDate =
            row.verifiedAt === null
              ? null
              : formatDateTime(row.verifiedAt, locale);
          identityView = {
            status: row.docStatus,
            filename: row.docFilename,
            byteSizeLabel:
              row.docByteSize === null
                ? "—"
                : formatFileSize(row.docByteSize, locale),
            depositedLabel:
              row.docCreatedAt === null
                ? "—"
                : (formatDateTime(row.docCreatedAt, locale) ?? "—"),
            reviewedLabel:
              row.docReviewedAt === null
                ? null
                : (formatDateTime(row.docReviewedAt, locale) ?? "—"),
            verifiedAtLabel:
              verifiedDate === null
                ? null
                : identity.verifiedAtLabel.replace("{{date}}", verifiedDate),
            rejectionReason: row.rejectionReason,
          };
        }

        if (row.payoutMethod !== null) {
          const methodLabel =
            row.payoutMethod === "wise"
              ? payout.methodWise
              : row.payoutMethod === "paypal"
                ? payout.methodPaypal
                : payout.methodBank;
          const fields: Array<{ label: string; value: string }> = [];
          if (row.payoutMethod === "wise") {
            if (row.payoutAccountEmail !== null) {
              fields.push({
                label: payout.accountEmailLabel,
                value: maskEmail(row.payoutAccountEmail),
              });
            }
            if (row.payoutCurrency !== null) {
              fields.push({
                label: payout.currencyLabel,
                value: row.payoutCurrency,
              });
            }
          } else if (row.payoutMethod === "paypal") {
            if (row.payoutAccountEmail !== null) {
              fields.push({
                label: payout.accountEmailLabel,
                value: maskEmail(row.payoutAccountEmail),
              });
            }
          } else {
            if (row.payoutHolderName !== null) {
              fields.push({
                label: payout.holderNameLabel,
                value: row.payoutHolderName,
              });
            }
            if (row.payoutBankName !== null) {
              fields.push({
                label: payout.bankNameLabel,
                value: row.payoutBankName,
              });
            }
            if (row.payoutIban !== null) {
              fields.push({
                label: payout.ibanLabel,
                value: maskIban(row.payoutIban),
              });
            }
          }
          payoutView = { methodLabel, fields };
        }
      }
    } catch (error) {
      // Lecture non destructrice : un échec n'enlève jamais l'accès au profil,
      // seul le bloc KYC/payout tombe sur `common.retry`.
      console.error("[profil] lecture KYC/payout impossible", error);
      sdrReadFailed = true;
    }
  }

  // ── Bloc 1 : nom (H5) ─────────────────────────────────────────────────────
  let nameBlock: React.JSX.Element;
  if (!isSdr) {
    // Rôles non SDR : nom en lecture seule (motif T13 inchangé).
    nameBlock = (
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="text-[13px] font-semibold text-fg">{signup.nameLabel}</p>
        <p className="mt-1 text-[15px] text-fg">{accountName}</p>
        <p className="mt-2 text-[13px] text-muted">{profile.nameReadonlyHint}</p>
      </div>
    );
  } else if (verifiedAt !== null) {
    // Verrou H5 effectif : le nom est figé par la vérification d'identité.
    nameBlock = (
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="text-[13px] font-semibold text-fg">{signup.nameLabel}</p>
        <p className="mt-1 text-[15px] text-fg">{accountName}</p>
        <p className="mt-2 text-[13px] text-muted">{profile.nameLockedHint}</p>
      </div>
    );
  } else {
    nameBlock = (
      <IdentityNameForm
        currentName={accountName}
        nameLabel={signup.nameLabel}
        saveLabel={profile.saveName}
        savedMessage={profile.nameSaved}
        lockedMessage={profile.nameLockedHint}
        requiredMessage={validation.required}
        tooLongMessage={validation.tooLong(100)}
        failedMessage={genericMessage}
        loading={common.loading}
      />
    );
  }

  return (
    // Colonne centrée (`mx-auto`) et élargie (800px) — revue client.
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 px-5 sm:gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-fg">
        {profile.title}
      </h1>

      {/* ── 1. Informations personnelles ──────────────────────────────────── */}
      <section
        aria-labelledby="profil-infos-personnelles"
        className="flex flex-col gap-4"
      >
        <h2
          id="profil-infos-personnelles"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {profile.personalSection}
        </h2>

        {nameBlock}

        {/* Le composant client reçoit un sous-ensemble SÉRIALISABLE de messages
            (le dictionnaire complet contient des fonctions : validation.tooShort
            / tooLong — impossibles à transmettre à un Client Component). */}
        <ProfileForms
          defaultEmail={session.user.email ?? ""}
          profile={profile}
          passwordRules={signup.passwordRules}
          loading={common.loading}
          errors={{
            emailInvalid: validation.emailInvalid,
            phoneInvalid: validation.phoneInvalid,
            required: validation.required,
            passwordMismatch: validation.passwordMismatch,
            passwordWeak: validation.passwordWeak,
            passwordTooShort: validation.tooShort(12),
            duplicateEmail: signup.duplicateEmail,
            wrongPassword: wrongPasswordMessage,
            generic: genericMessage,
          }}
        />
      </section>

      {isSdr ? (
        <>
          {/* ── 2. Vérification d'identité (L7a · D3/D7) ──────────────────── */}
          <section
            aria-labelledby="profil-verification-identite"
            className="flex flex-col gap-4"
          >
            <h2
              id="profil-verification-identite"
              className="text-lg font-semibold tracking-[-0.015em] text-fg"
            >
              {identity.sectionTitle}
            </h2>
            <p className="text-[13px] leading-[1.6] text-muted">
              {identity.intro}
            </p>

            {sdrReadFailed ? (
              errorBlock(common.retry)
            ) : identityView === null ? (
              <p className="rounded-xl border border-line bg-surface p-6 text-[13px] text-muted">
                {identity.noDoc}
              </p>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
                {identityStatusBadge(identityView.status, identity)}
                <dl className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="micro text-faint">
                      {identity.currentFile}
                    </dt>
                    <dd className="break-all text-[14px] text-fg">
                      {identityView.filename}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="micro text-faint">
                      {dict.verification.columns.depositedAt}
                    </dt>
                    <dd className="text-[14px] tabular-nums text-muted">
                      {identityView.depositedLabel}
                    </dd>
                  </div>
                  {identityView.reviewedLabel !== null ? (
                    <div className="flex flex-col gap-0.5">
                      <dt className="micro text-faint">
                        {dict.verification.columns.reviewedAt}
                      </dt>
                      <dd className="text-[14px] tabular-nums text-muted">
                        {identityView.reviewedLabel}
                      </dd>
                    </div>
                  ) : null}
                  {identityView.verifiedAtLabel !== null ? (
                    <div className="flex flex-col gap-0.5">
                      <dt className="micro text-faint">
                        {identity.statusApproved}
                      </dt>
                      <dd className="text-[14px] tabular-nums text-muted">
                        {identityView.verifiedAtLabel}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {identityView.status === "rejected" &&
                identityView.rejectionReason !== null ? (
                  <div className="flex flex-col gap-1 border-t border-line pt-3">
                    <p className="micro text-faint">
                      {identity.rejectionReasonLabel}
                    </p>
                    <p className="whitespace-pre-wrap text-[14px] leading-[1.6] text-fg">
                      {identityView.rejectionReason}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {identity.reuploadHint}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <IdentityDocUploadForm labels={identity} />
          </section>

          {/* ── 3. Moyen de paiement (L8 · D4) ────────────────────────────── */}
          <section
            aria-labelledby="profil-moyen-paiement"
            className="flex flex-col gap-4"
          >
            <h2
              id="profil-moyen-paiement"
              className="text-lg font-semibold tracking-[-0.015em] text-fg"
            >
              {payout.sectionTitle}
            </h2>
            <p className="text-[13px] leading-[1.6] text-muted">
              {payout.intro}
            </p>

            <Badge
              variant={payoutView !== null ? "verified" : "tech"}
              className={cn(payoutView === null && "self-start")}
            >
              {payoutView !== null ? payout.badgeReady : payout.badgeEmpty}
            </Badge>

            {payoutView !== null ? (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
                <p className="text-[13px] font-semibold text-fg">
                  {payout.currentLabel} — {payoutView.methodLabel}
                </p>
                <dl className="flex flex-col gap-2">
                  {payoutView.fields.map((field) => (
                    <div
                      key={field.label}
                      className="flex flex-col gap-0.5"
                    >
                      <dt className="micro text-faint">{field.label}</dt>
                      <dd className="break-all text-[14px] text-fg">
                        {field.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {/* D4 — honnêteté : le masquage concerne l'affichage, pas le stockage. */}
            <p className="text-[13px] leading-[1.6] text-muted">
              {payout.maskingNote}
            </p>

            {sdrReadFailed ? (
              errorBlock(common.retry)
            ) : (
              <PayoutForm labels={payout} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
