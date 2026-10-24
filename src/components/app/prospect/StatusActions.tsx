"use client";

/**
 * Atheris — actions de transition de statut d'un prospect (FE-5 · T18).
 *
 * Composant CLIENT (dialog shadcn + appel de Server Action) dont **toutes les
 * données sont calculées côté serveur** par la page détail :
 * - `transitions` = `TRANSITIONS[statut]` filtrées par
 *   `canChangeStatus(role, from, to)` — le client ne recalcule aucun droit ;
 * - `labels` / `statusLabels` = `dict.prospect.actions.*` + `dict.common.*`
 *   (résolus server, props sérialisables) ;
 * - `viewer` = `{ id, role }` **chargé en session côté serveur** (contrat C-5 :
 *   jamais une valeur montée par l'utilisateur — la Server Action revalide
 *   uuid + rôle + graphe de toute façon).
 *
 * PARCOURS : bouton « Changer de statut » → liste des cibles autorisées →
 * confirmation ; si la cible est **terminale** (`isTerminalStatus`, module pur
 * importable côté client), un motif ≥ 3 caractères est exigé avant validation
 * (contrainte reprise de `changeProspectStatus`).
 *
 * SUCCÈS → `router.refresh()` (la page server re-fetch le prospect) + toast
 * `sonner` (monté par `AppShell`). `conflict` → toast d'erreur « Réessayer »
 * + `router.refresh()` (l'état a bougé côté serveur).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { changeProspectStatus } from "@/actions/status";
import { StatusBadge } from "@/components/app/StatusBadge";
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
import { isTerminalStatus, type ProspectStatus, type Role } from "@/lib/permissions";

/** Une cible de transition, déjà autorisée et libellée côté serveur. */
export type StatusTransitionOption = {
  to: ProspectStatus;
  label: string;
};

/** Libellés i18n résolus côté serveur (props 100 % sérialisables). */
export type StatusActionsLabels = {
  /** `dict.prospect.actions.changeStatus`. */
  changeStatus: string;
  /** `dict.prospect.actions.reasonRequired` (motif obligatoire). */
  reasonRequired: string;
  /** `dict.prospect.actions.reasonLabel`. */
  reasonLabel: string;
  /** `dict.prospect.actions.confirmChange`. */
  confirmChange: string;
  /** `dict.prospect.actions.lockedByRole` (rôle lecture seule). */
  lockedByRole: string;
  /** `dict.common.cancel`. */
  cancel: string;
  /** `dict.common.close` (aria-label du bouton de fermeture du dialog). */
  close: string;
  /** `dict.common.retry` — repli générique (conflit / erreur infra). */
  retry: string;
};

export type StatusActionsProps = {
  /** uuid du prospect (déjà validé par la page server). */
  prospectId: string;
  /** Statut lu au rendu — transmis en `expectedFrom` (optimistic locking). */
  currentStatus: ProspectStatus;
  /** Cibles autorisées pour le rôle connecté (calcul server, ordre du graphe). */
  transitions: readonly StatusTransitionOption[];
  /** Identité de session chargée par la page server (`await auth()`). */
  viewer: { id: string; role: Role };
  /** `dict.statuses.prospect` — pour le toast de succès. */
  statusLabels: Record<ProspectStatus, string>;
  labels: StatusActionsLabels;
};

/** Longueur minimale du motif — alignée sur `changeProspectStatus` (C-5). */
const MIN_REASON_LENGTH = 3;

export function StatusActions({
  prospectId,
  currentStatus,
  transitions,
  viewer,
  statusLabels,
  labels,
}: StatusActionsProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StatusTransitionOption | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Ferme le dialog et réinitialise le brouillon de transition. */
  function closeDialog(): void {
    setOpen(false);
    setTarget(null);
    setReason("");
    setReasonError(null);
  }

  async function submit(): Promise<void> {
    if (target === null || isSubmitting) return;

    const trimmed = reason.trim();
    if (isTerminalStatus(target.to) && trimmed.length < MIN_REASON_LENGTH) {
      setReasonError(labels.reasonRequired);
      return;
    }
    setReasonError(null);
    setIsSubmitting(true);
    try {
      const result = await changeProspectStatus(
        {
          id: prospectId,
          to: target.to,
          expectedFrom: currentStatus,
          ...(trimmed.length > 0 ? { reason: trimmed } : {}),
        },
        viewer,
      );

      if (result.ok) {
        closeDialog();
        toast.success(`${labels.changeStatus} — ${statusLabels[target.to]}`);
        router.refresh();
        return;
      }

      switch (result.code) {
        case "conflict":
          // État obsolète (ou prospect introuvable) : on recharge sans fuite
          // de détail — la page server re-fetch l'état réel.
          toast.error(labels.retry);
          closeDialog();
          router.refresh();
          return;
        case "forbidden":
          toast.error(labels.lockedByRole);
          return;
        case "reason_required":
          setReasonError(labels.reasonRequired);
          return;
        default:
          toast.error(labels.retry);
      }
    } catch {
      // Erreur d'infra DB (action propagée en 500) : message générique, aucun
      // détail technique côté client.
      toast.error(labels.retry);
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- Rôle lecture seule (vendeur / transition impossible) ----------------
  if (transitions.length === 0) {
    return <p className="text-sm text-muted">{labels.lockedByRole}</p>;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {labels.changeStatus}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
        }}
      >
        <DialogContent aria-label={labels.changeStatus}>
          <DialogHeader>
            <DialogTitle>{labels.changeStatus}</DialogTitle>
            <DialogDescription>{labels.confirmChange}</DialogDescription>
          </DialogHeader>

          {target === null ? (
            /* Étape 1 — choix de la cible (transitions déjà autorisées server). */
            <ul className="flex flex-col gap-2">
              {transitions.map((option) => (
                <li key={option.to}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setReason("");
                      setReasonError(null);
                      setTarget(option);
                    }}
                  >
                    <StatusBadge status={option.to} label={option.label} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            /* Étape 2 — confirmation (+ motif si la cible est terminale). */
            <div className="flex flex-col gap-4">
              <p className="flex flex-wrap items-center gap-2 text-[15px] text-fg">
                <StatusBadge status={currentStatus} label={statusLabels[currentStatus]} />
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <StatusBadge status={target.to} label={target.label} />
              </p>

              {isTerminalStatus(target.to) ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="status-reason" className="text-fg">
                    {labels.reasonLabel}
                  </Label>
                  <Textarea
                    id="status-reason"
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      if (reasonError !== null) setReasonError(null);
                    }}
                    aria-invalid={reasonError !== null}
                    aria-describedby={
                      reasonError !== null ? "status-reason-error" : undefined
                    }
                    rows={3}
                    maxLength={500}
                  />
                  {/* Avertissement permanent : le motif est exigé par le serveur. */}
                  <p className="text-xs text-muted">{labels.reasonRequired}</p>
                  {reasonError !== null ? (
                    <p id="status-reason-error" role="alert" className="text-sm text-danger">
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
                  onClick={() => {
                    setTarget(null);
                    setReason("");
                    setReasonError(null);
                  }}
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
                  {labels.confirmChange}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
