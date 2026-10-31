"use client";

/**
 * Atheris — panneau de revue KYC (page `/espace/verification`, espace CEO).
 *
 * Composant CLIENT dont **toutes** les données et tous les libellés sont
 * produits côté serveur par `espace/verification/page.tsx` : lignes projetées
 * (`IdentityReviewRow`, dates déjà formatées en `Africa/Algiers`) et strings
 * du dict (`dict.verification.*`). Le serveur ne renvoie **jamais** de
 * message : les codes `invalid` / `forbidden` / `not_found` / `conflict` /
 * `failed` sont traduits ici (`verification.errors.*`).
 *
 * ─── FILTRES ────────────────────────────────────────────────────────────────
 * Un groupe de boutons `aria-pressed` (Toutes / En attente / Approuvées /
 * Refusées) filtre la liste côté client — l'action sert déjà les `pending`
 * en tête.
 *
 * ─── APERÇU ─────────────────────────────────────────────────────────────────
 * `<img>` pour les images, `<iframe>` pour les PDF, tous deux pointant vers
 * `/api/identity-docs/[userId]` (contrôle session + rôle CEO côté serveur,
 * 404 muet) ; un lien « nouvel onglet » accompagne toujours l'aperçu.
 *
 * ─── DÉCISIONS : POPUP OBLIGATOIRE ──────────────────────────────────────────
 * Un clic sur « Vérifier » ou « Refuser » n'exécute **JAMAIS** l'action : il
 * ouvre une popup `role="dialog"` + `aria-modal` (motif `ExamReviewPanel`).
 * Le refus exige un **motif obligatoire** (10 caractères minimum, D7) — il
 * est transmis au SDR dans sa notification. Succès → `router.refresh()` ;
 * échec → `role="alert"` traduit.
 *
 * ─── A11Y ───────────────────────────────────────────────────────────────────
 * Sections sémantiques, liste `<ul>`/`<li>`, paires `<dl>`/`<dt>`/`<dd>`,
 * badges = couleur **ET** texte, popups focusables avec Échap + piège de
 * focus, toasts `role="status"` avec `aria-live`.
 */

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { reviewIdentityDoc } from "@/actions/identity";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import type { VerificationContent } from "@/content/platform/types";
import { cn } from "@/lib/utils";

/** Courbe unique du projet (aucun easing concurrent). */
const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

/** Longueur minimale du motif de refus — miroir du contrôle serveur (D7). */
const MIN_REASON_LENGTH = 10;

// ---------------------------------------------------------------------------
// Vue-modèle (produit par la page, 100 % sérialisable).
// ---------------------------------------------------------------------------

/** Statut du dossier — miroir de l'union `IdentityDocStatus` (action). */
type IdentityDocStatusValue = "pending" | "approved" | "rejected";

/** Une ligne de la file — dates DÉJÀ formatées côté serveur. */
export type IdentityReviewRow = {
  /** uuid du compte SDR — sert aussi de clé de la route API de la pièce. */
  userId: string;
  memberName: string;
  email: string;
  /** `dict.statuses.role[role]` résolu server. */
  roleLabel: string;
  /** « Vérifié le … » formaté server — `null` si `verified_at` est nul. */
  verifiedAtLabel: string | null;
  status: IdentityDocStatusValue;
  filename: string;
  mimeType: string;
  /** Taille formatée server (`Intl.NumberFormat`, motif `ApplyForm`). */
  byteSizeLabel: string;
  /** Dépôt courant, formaté server (remis à jour à chaque re-upload). */
  depositedLabel: string;
  /** Décision du CEO, formatée server — `null` si non examiné. */
  reviewedLabel: string | null;
  /** Dernier motif de refus porté sur le compte — `null` si jamais refusé. */
  rejectionReason: string | null;
};

/** Libellés résolus server (100 % `dict.verification.*`). */
export type IdentityReviewLabels = {
  loading: string;
  /** État vide — `dict.common.noData`. */
  empty: string;
  emptyHint: string;
  filterLabel: string;
  filters: {
    all: string;
    pending: string;
    approved: string;
    rejected: string;
  };
  columns: VerificationContent["columns"];
  status: VerificationContent["status"];
  openDetail: string;
  closeDetail: string;
  detailTitle: string;
  previewUnavailable: string;
  openInNewTab: string;
  rejectReasonLabel: string;
  approveAction: string;
  approving: string;
  approveSuccess: string;
  rejectAction: string;
  rejectSuccess: string;
  confirmApprove: VerificationContent["confirmApprove"];
  rejectDialog: VerificationContent["rejectDialog"];
  errors: VerificationContent["errors"];
};

export type IdentityReviewPanelProps = {
  rows: IdentityReviewRow[];
  labels: IdentityReviewLabels;
};

/** Filtre courant de la liste. */
type StatusFilter = "all" | "pending" | "approved" | "rejected";

/** Décision en attente de confirmation (la popup est OBLIGATOIRE). */
type PendingDialog =
  | { kind: "approve"; row: IdentityReviewRow }
  | { kind: "reject"; row: IdentityReviewRow };

// ---------------------------------------------------------------------------
// Aides pures (module scope — aucun state, aucun effet).
// ---------------------------------------------------------------------------

/** Code brut du serveur → message localisé (jamais de string servie en dur). */
function errorText(
  code: string,
  labels: IdentityReviewLabels,
): string {
  switch (code) {
    case "forbidden":
      return labels.errors.forbidden;
    case "invalid":
      return labels.errors.invalid;
    case "not_found":
      return labels.errors.notFound;
    case "conflict":
      return labels.errors.conflict;
    default:
      return labels.errors.failed;
  }
}

/** Teintes de pastille — la couleur ne porte JAMAIS le sens seule. */
const STATUS_TONE: Record<IdentityDocStatusValue, string> = {
  pending: "border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]",
  approved: "border-[rgba(204,255,74,0.25)] bg-[rgba(204,255,74,0.10)] text-accent",
  rejected: "border-[rgba(255,107,90,0.25)] bg-[rgba(255,107,90,0.12)] text-danger",
};

/** Un mimetype est-il rendu par le navigateur (aperçu `inline`) ? */
function isRenderableMime(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}

// ---------------------------------------------------------------------------
// Popups — un clic ne décide jamais seul.
// ---------------------------------------------------------------------------

type DialogShellProps = {
  titleId: string;
  busy: boolean;
  onCancel: () => void;
  children: React.ReactNode;
  /** Élément à mettre au focus au montage (motif `ExamReviewPanel`). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

/**
 * Coquille commune des popups : backdrop, `role="dialog"` + `aria-modal`,
 * focus initial et piège de focus (Tab circule dans la popup, Échap ferme —
 * sauf pendant l'appel serveur).
 */
function DialogShell({
  titleId,
  busy,
  onCancel,
  children,
  initialFocusRef,
}: DialogShellProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialFocusRef !== undefined) {
      initialFocusRef.current?.focus();
      return;
    }
    dialogRef.current?.focus();
  }, [initialFocusRef]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      if (!busy) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])",
      ),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center ${EASE}`}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop — cliquable pour fermer (jamais pendant l'appel). */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[rgba(8,9,11,0.72)] transition-opacity duration-200 ${EASE}`}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-[520px] flex-col gap-5 rounded-[20px] border border-line bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] focus:outline-none"
      >
        {children}
      </div>
    </div>
  );
}

type ApproveDialogProps = {
  labels: IdentityReviewLabels;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Popup « Vérifier » — annonce l'effet (verrou du nom, commissions). */
function ApproveDialog({
  labels,
  busy,
  onCancel,
  onConfirm,
}: ApproveDialogProps): React.JSX.Element {
  const titleId = useId();
  const { title, message, cancel, confirm } = labels.confirmApprove;

  return (
    <DialogShell titleId={titleId} busy={busy} onCancel={onCancel}>
      <div className="flex flex-col gap-2">
        <h2 id={titleId} className="h-display text-[20px] leading-tight text-fg">
          {title}
        </h2>
        <p className="text-[14px] leading-[1.6] text-muted">{message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {cancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          aria-disabled={busy}
          onClick={onConfirm}
        >
          {busy ? labels.approving : confirm}
        </Button>
      </div>
    </DialogShell>
  );
}

type RejectDialogProps = {
  labels: IdentityReviewLabels;
  reason: string;
  reasonError: string | null;
  onReasonChange: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Popup « Refuser » — le motif est OBLIGATOIRE (D7) : le textarea est
 * focusé au montage, le bouton de confirmation reste actif (l'erreur s'affiche
 * à la tentative — jamais de bouton muet).
 */
function RejectDialog({
  labels,
  reason,
  reasonError,
  onReasonChange,
  busy,
  onCancel,
  onConfirm,
}: RejectDialogProps): React.JSX.Element {
  const titleId = useId();
  const reasonId = useId();
  const hintId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { title, message, reasonLabel, reasonHint, cancel, confirm } =
    labels.rejectDialog;

  return (
    <DialogShell
      titleId={titleId}
      busy={busy}
      onCancel={onCancel}
      initialFocusRef={textareaRef}
    >
      <div className="flex flex-col gap-2">
        <h2 id={titleId} className="h-display text-[20px] leading-tight text-fg">
          {title}
        </h2>
        <p className="text-[14px] leading-[1.6] text-muted">{message}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-[13px] font-semibold text-fg">
          {reasonLabel}
        </label>
        <Textarea
          id={reasonId}
          ref={textareaRef}
          value={reason}
          aria-describedby={hintId}
          aria-invalid={reasonError !== null}
          disabled={busy}
          rows={3}
          onChange={(event) => {
            onReasonChange(event.target.value);
          }}
        />
        <p
          id={hintId}
          role={reasonError !== null ? "alert" : undefined}
          className={cn(
            "text-[12px]",
            reasonError !== null ? "font-medium text-destructive" : "text-muted",
          )}
        >
          {reasonError ?? reasonHint}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {cancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          aria-disabled={busy}
          onClick={onConfirm}
        >
          {busy ? labels.rejectDialog.confirm : confirm}
        </Button>
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Panneau.
// ---------------------------------------------------------------------------

export function IdentityReviewPanel({
  rows,
  labels,
}: IdentityReviewPanelProps): React.JSX.Element {
  const router = useRouter();

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  // Après une décision, `router.refresh()` re-fetch la liste : la ligne reste
  // visible (les filtres ne sont pas un statut) mais son STATUT change — le
  // dossier ouvert reste donc valide. Seul un compte disparu est refermé.
  useEffect(() => {
    if (openUserId === null) return;
    if (!rows.some((row) => row.userId === openUserId)) setOpenUserId(null);
  }, [rows, openUserId]);

  const visibleRows =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);

  /** Exécute la décision — UNIQUEMENT appelée depuis une popup validée. */
  async function submitDecision(
    kind: "approve" | "reject",
    row: IdentityReviewRow,
    givenReason: string,
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setAlert(null);
    setNotice(null);
    try {
      const result =
        kind === "approve"
          ? await reviewIdentityDoc({ userId: row.userId, decision: "approve" })
          : await reviewIdentityDoc({
              userId: row.userId,
              decision: "reject",
              reason: givenReason,
            });
      if (result.ok) {
        setDialog(null);
        setReason("");
        setReasonError(null);
        setNotice(
          kind === "approve" ? labels.approveSuccess : labels.rejectSuccess,
        );
        router.refresh();
        return;
      }
      setDialog(null);
      setAlert(errorText(result.code, labels));
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setDialog(null);
      setAlert(labels.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  /** Validation du motif AVANT appel (le serveur revalide — double filet). */
  function handleConfirmReject(row: IdentityReviewRow): void {
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setReasonError(labels.rejectDialog.reasonHint);
      return;
    }
    void submitDecision("reject", row, reason.trim());
  }

  /** Une ligne de la file (carte unique, responsive sans double moteur). */
  function renderRow(row: IdentityReviewRow): React.JSX.Element {
    const open = openUserId === row.userId;
    const docUrl = `/api/identity-docs/${row.userId}`;
    const renderable = isRenderableMime(row.mimeType);

    return (
      <li
        key={row.userId}
        className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] text-fg">{row.memberName}</span>
            <a
              href={`mailto:${row.email}`}
              className="break-all text-sm text-muted underline decoration-line-2 underline-offset-4 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:decoration-accent"
            >
              {row.email}
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 micro",
                STATUS_TONE[row.status],
              )}
            >
              {row.status === "pending"
                ? labels.status.pending
                : row.status === "approved"
                  ? labels.status.approved
                  : labels.status.rejected}
            </span>
            {/* D8 : pastille « Vérifié » pilotée par `users.verified_at`. */}
            {row.verifiedAtLabel !== null ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 micro text-accent">
                {row.verifiedAtLabel}
              </span>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-expanded={open}
              onClick={() => {
                setOpenUserId(open ? null : row.userId);
                setAlert(null);
              }}
            >
              {open ? labels.closeDetail : labels.openDetail}
            </Button>
          </div>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.role}</dt>
            <dd className="text-[14px] text-muted">{row.roleLabel}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.document}</dt>
            <dd className="break-all text-[14px] text-muted">{row.filename}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.size}</dt>
            <dd className="text-[14px] tabular-nums text-muted">
              {row.byteSizeLabel}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="micro text-faint">{labels.columns.depositedAt}</dt>
            <dd className="text-[14px] tabular-nums text-muted">
              {row.depositedLabel}
            </dd>
          </div>
        </dl>

        {open ? (
          <div className="flex flex-col gap-5 border-t border-line pt-5">
            <h3 className="text-[15px] font-semibold text-fg">
              {labels.detailTitle}
            </h3>

            {/* ── Aperçu — octets servis par la route API dédiée ──────────── */}
            <div className="flex flex-col gap-2">
              {row.mimeType.startsWith("image/") ? (
                // Aperçu d'une PII servie par NOTRE route (`private, no-store`)
                // : `next/image` (optimiseur + cache partagé) serait
                // contre-productif ici — `<img>` natif assumé.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={docUrl}
                  alt={row.filename}
                  loading="lazy"
                  className="max-h-[420px] w-auto max-w-full rounded-xl border border-line bg-ink-2 object-contain"
                />
              ) : renderable ? (
                <iframe
                  src={docUrl}
                  title={`${labels.detailTitle} — ${row.filename}`}
                  className="h-[480px] w-full rounded-xl border border-line bg-ink-2"
                />
              ) : (
                <p className="text-[14px] text-muted">{labels.previewUnavailable}</p>
              )}
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-muted underline decoration-line-2 underline-offset-4 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:decoration-accent"
              >
                {labels.openInNewTab}
              </a>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <dt className="micro text-faint">{labels.columns.reviewedAt}</dt>
                <dd className="text-[14px] tabular-nums text-muted">
                  {row.reviewedLabel ?? "—"}
                </dd>
              </div>
              {row.rejectionReason !== null ? (
                <div className="flex flex-col gap-1.5">
                  <dt className="micro text-faint">{labels.rejectReasonLabel}</dt>
                  <dd className="whitespace-pre-wrap text-[14px] leading-[1.6] text-muted">
                    {row.rejectionReason}
                  </dd>
                </div>
              ) : null}
            </dl>

            {/* ── Décisions : TOUJOURS après confirmation ─────────────────── */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setAlert(null);
                  setNotice(null);
                  setDialog({ kind: "reject", row });
                }}
              >
                {labels.rejectAction}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setAlert(null);
                  setNotice(null);
                  setDialog({ kind: "approve", row });
                }}
              >
                {labels.approveAction}
              </Button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  const filters: ReadonlyArray<{ value: StatusFilter; label: string }> = [
    { value: "all", label: labels.filters.all },
    { value: "pending", label: labels.filters.pending },
    { value: "approved", label: labels.filters.approved },
    { value: "rejected", label: labels.filters.rejected },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Toast de succès (aria-live) + alerte d'échec (aucun détail technique). */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-h-5 text-sm text-success"
      >
        {notice}
      </p>
      {alert !== null ? (
        <p role="alert" className="text-sm text-danger">
          {alert}
        </p>
      ) : null}

      {rows.length === 0 ? (
        /* ---------------------------------------- État vide global -------- */
        <div className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-surface px-6 py-14 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full border border-line bg-ink-2 text-muted"
          >
            <Inbox size={22} strokeWidth={1.5} />
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold text-fg">{labels.empty}</span>
            <span className="text-sm text-muted">{labels.emptyHint}</span>
          </span>
        </div>
      ) : (
        <>
          {/* ── Filtres (aria-pressed : la couleur ne porte pas le sens) ──── */}
          <div
            role="group"
            aria-label={labels.filterLabel}
            className="flex flex-wrap items-center gap-2"
          >
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => {
                  setFilter(item.value);
                }}
                className={cn(
                  "inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                  filter === item.value
                    ? "border-line-2 bg-surface-2 text-fg"
                    : "border-line text-muted hover:text-fg",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {visibleRows.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {visibleRows.map((row) => renderRow(row))}
            </ul>
          ) : (
            <p className="rounded-[20px] border border-line bg-surface px-6 py-8 text-center text-[14px] text-muted">
              {labels.empty}
            </p>
          )}
        </>
      )}

      {/* ── Popups : un clic ne décide jamais seul ─────────────────────────── */}
      {dialog?.kind === "approve" ? (
        <ApproveDialog
          labels={labels}
          busy={busy}
          onCancel={() => {
            if (!busy) setDialog(null);
          }}
          onConfirm={() => {
            void submitDecision("approve", dialog.row, "");
          }}
        />
      ) : null}

      {dialog?.kind === "reject" ? (
        <RejectDialog
          labels={labels}
          reason={reason}
          reasonError={reasonError}
          onReasonChange={(value) => {
            setReason(value);
            if (reasonError !== null) setReasonError(null);
          }}
          busy={busy}
          onCancel={() => {
            if (!busy) {
              setDialog(null);
              setReasonError(null);
            }
          }}
          onConfirm={() => {
            handleConfirmReject(dialog.row);
          }}
        />
      ) : null}
    </div>
  );
}
