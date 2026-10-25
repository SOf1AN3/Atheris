"use client";

/**
 * Atheris — liste des candidatures de l'espace équipe (FE-10 · T11 ·
 * PLAN.md §3.2).
 *
 * Composant CLIENT (dialogs shadcn + appel de Server Action) dont **toutes
 * les données sont calculées côté serveur** par `espace/equipe/page.tsx` :
 * lignes (nom, email, téléphone, rôle, statut, date), libellés dict,
 * et `actor` = `{ id, role }` **chargé en session côté
 * serveur** (contrat C-5, même schéma que `StatusActions` : la Server
 * Action revalide uuid + rôle `ceo` de toute façon).
 *
 * DÉCISIONS D'UI :
 * - **`canDecide === false` (manager, lecture seule) : AUCUN bouton n'est
 *   rendu — pas même désactivé** (le manager ne peut ni approuver ni
 *   refuser : `decideApplication` est CEO-only côté serveur aussi) ;
 * - **Approuver** → dialog de confirmation (`applications.approveConfirm`) ;
 * - **Refuser** → dialog avec **motif obligatoire** (≥ 3 caractères, validé
 *   côté client et ré-asserté par l'action → `reason_required`) ;
 * - succès → toast `sonner` + `router.refresh()` (la page server re-fetch) ;
 *   `conflict` → toast d'erreur « Réessayer » + `router.refresh()` (état
 *   obsolète) ; `forbidden` / erreur infra → toast d'erreur, aucun détail.
 *
 * ÉTATS : chargement (boutons désactivés + `common.loading`), erreur (toasts),
 * vide (`common.noData`) et « plus aucune candidature en attente »
 * (`applications.empty`).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { decideApplication } from "@/actions/applications";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { UserStatus } from "@/content/platform/types";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Une ligne de candidature — données et libellés déjà résolus server. */
export type ApplicationRow = {
  id: string;
  name: string;
  email: string;
  /** Téléphone (nullable en DB) — déjà basculé en « — » côté serveur. */
  phone: string;
  /** `dict.statuses.role[role]`. */
  roleLabel: string;
  status: UserStatus;
  /** `dict.statuses.userStatus[status]`. */
  statusLabel: string;
  /** `status === "pending"` : seule ligne pouvant recevoir une action. */
  isPending: boolean;
  /** Date de création, formatée server. */
  createdLabel: string;
};

/** Libellés résolus server (100 % dict). */
export type ApplicationListLabels = {
  /** En-têtes de colonnes. */
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created: string;
  actions: string;
  /** Actions. */
  approve: string;
  reject: string;
  /** `dict.applications.approveConfirm`. */
  approveConfirm: string;
  rejectReason: string;
  /** États. */
  empty: string;
  noData: string;
  /** Dialog / formulaire / erreurs. */
  cancel: string;
  loading: string;
  retry: string;
  required: string;
  /** `dict.applications.rejectReasonHint` + `dict.applications.forbidden`. */
  reasonHint: string;
  forbidden: string;
};

export type ApplicationListProps = {
  rows: ApplicationRow[];
  labels: ApplicationListLabels;
  /** `false` (manager) → aucun bouton rendu, la page n'assemble aucun appel. */
  canDecide: boolean;
  /** Identité de session chargée par la page server (`await auth()`). */
  actor: { id: string; role: Role };
};

/** Longueur minimale du motif — alignée sur `decideApplication` (C-5). */
const MIN_REASON_LENGTH = 3;

const TH_CLASS = "py-3 pr-4 text-xs font-medium uppercase tracking-wide text-muted";

/** Pastille de statut de compte — couleurs §12.2, texte toujours présent. */
const STATUS_TONE_CLASSES: Record<UserStatus, string> = {
  pending: "border-[rgba(143,166,200,0.30)] bg-[rgba(143,166,200,0.14)] text-accent",
  active: "border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.10)] text-success",
  rejected: "border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.12)] text-danger",
  disabled: "border-line bg-surface-2 text-muted",
};

function StatusPill({ status, label }: { status: UserStatus; label: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-lg border px-2.5 py-[5px] text-xs font-semibold",
        STATUS_TONE_CLASSES[status],
      )}
    >
      {label}
    </span>
  );
}

export function ApplicationList({
  rows,
  labels,
  canDecide,
  actor,
}: ApplicationListProps): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [target, setTarget] = useState<ApplicationRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function openDialog(row: ApplicationRow, nextMode: "approve" | "reject"): void {
    setTarget(row);
    setMode(nextMode);
    setReason("");
    setReasonError(null);
  }

  function closeDialog(): void {
    setMode(null);
    setTarget(null);
    setReason("");
    setReasonError(null);
  }

  async function submit(): Promise<void> {
    if (mode === null || target === null || isSubmitting) return;

    const trimmed = reason.trim();
    if (mode === "reject" && trimmed.length < MIN_REASON_LENGTH) {
      setReasonError(labels.required);
      return;
    }
    setReasonError(null);
    setIsSubmitting(true);

    try {
      const result = await decideApplication(
        {
          userId: target.id,
          decision: mode,
          ...(mode === "reject" ? { reason: trimmed } : {}),
        },
        actor,
      );

      if (result.ok) {
        const verb = mode === "approve" ? labels.approve : labels.reject;
        toast.success(`${verb} — ${target.name}`);
        closeDialog();
        router.refresh();
        return;
      }

      switch (result.code) {
        case "conflict":
          // Décision déjà prise (ou compte introuvable) : on recharge sans
          // fuite de détail — la page server re-fetch l'état réel.
          toast.error(labels.retry);
          closeDialog();
          router.refresh();
          return;
        case "forbidden":
          toast.error(labels.forbidden);
          closeDialog();
          return;
        case "reason_required":
          setReasonError(labels.required);
          return;
        default:
          toast.error(labels.retry);
      }
    } catch {
      // Erreur d'infra DB (action propagée en 500) : message générique.
      toast.error(labels.retry);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ---------------------------------------------------------- État vide --
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-fg">{labels.noData}</p>
      </div>
    );
  }

  const hasPending = rows.some((row) => row.isPending);

  /** Boutons d'action (CEO + ligne `pending` uniquement). */
  function renderActions(row: ApplicationRow): React.JSX.Element | null {
    if (!canDecide || !row.isPending) return null;
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            openDialog(row, "approve");
          }}
        >
          {labels.approve}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            openDialog(row, "reject");
          }}
        >
          {labels.reject}
        </Button>
      </span>
    );
  }

  return (
    <>
      {/* ------------------------------------ Desktop (≥ md) -------------- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH_CLASS}>{labels.name}</th>
              <th scope="col" className={TH_CLASS}>{labels.email}</th>
              <th scope="col" className={TH_CLASS}>{labels.phone}</th>
              <th scope="col" className={TH_CLASS}>{labels.role}</th>
              <th scope="col" className={TH_CLASS}>{labels.status}</th>
              <th scope="col" className={TH_CLASS}>{labels.created}</th>
              {/* Colonne « Actions » absente en lecture seule (manager) :
                  aucun bouton, ni même un en-tête vide. */}
              {canDecide ? (
                <th scope="col" className="py-3 text-xs font-medium uppercase tracking-wide text-muted">
                  {labels.actions}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="py-3 pr-4 text-sm font-medium text-fg">{row.name}</td>
                <td className="py-3 pr-4 text-sm text-muted">{row.email}</td>
                <td className="py-3 pr-4 text-sm tabular-nums text-muted">{row.phone}</td>
                <td className="py-3 pr-4">
                  <Badge variant="tech">{row.roleLabel}</Badge>
                </td>
                <td className="py-3 pr-4">
                  <StatusPill status={row.status} label={row.statusLabel} />
                </td>
                <td className="py-3 pr-4 text-sm tabular-nums text-muted">{row.createdLabel}</td>
                {canDecide ? <td className="py-3">{renderActions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------ Mobile (< md) --------------- */}
      {/* Cartes empilées : mêmes données, zéro scroll horizontal. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const actions = renderActions(row);
          return (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[15px] font-semibold text-fg">{row.name}</span>
                  <span className="truncate text-sm text-muted">{row.email}</span>
                </span>
                <StatusPill status={row.status} label={row.statusLabel} />
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="tabular-nums">{row.phone}</span>
                <Badge variant="tech">{row.roleLabel}</Badge>
              </span>
              <span className="text-xs tabular-nums text-muted">{row.createdLabel}</span>
              {actions !== null ? actions : null}
            </li>
          );
        })}
      </ul>

      {/* --------------------- Note « plus aucune en attente » ------------- */}
      {!hasPending ? <p className="text-sm text-muted">{labels.empty}</p> : null}

      {/* ------------------------------------ Dialog ---------------------- */}
      <Dialog
        open={mode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
        }}
      >
        <DialogContent aria-label={mode === "reject" ? labels.reject : labels.approve}>
          <DialogHeader>
            <DialogTitle>{mode === "reject" ? labels.reject : labels.approve}</DialogTitle>
            <DialogDescription>
              {mode === "reject" ? labels.reasonHint : labels.approveConfirm}
            </DialogDescription>
          </DialogHeader>

          {mode === "reject" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="application-reject-reason" className="text-fg">
                {labels.rejectReason}
              </Label>
              <Textarea
                id="application-reject-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (reasonError !== null) setReasonError(null);
                }}
                aria-invalid={reasonError !== null}
                aria-describedby={
                  reasonError !== null
                    ? "application-reject-reason-error"
                    : "application-reject-reason-hint"
                }
                rows={3}
                maxLength={500}
              />
              {/* Avertissement permanent : le motif est exigé par le serveur. */}
              <p id="application-reject-reason-hint" className="text-xs text-muted">
                {labels.reasonHint}
              </p>
              {reasonError !== null ? (
                <p
                  id="application-reject-reason-error"
                  role="alert"
                  className="text-sm text-danger"
                >
                  {reasonError}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                void submit();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? labels.loading
                : mode === "reject"
                  ? labels.reject
                  : labels.approve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
