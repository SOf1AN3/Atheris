"use client";

/**
 * Atheris — file « Commissions à verser » (FE-8 · T24 · structure.md §3.3).
 *
 * Composant CLIENT : sélection **multi-lignes** (checkbox) + versement groupé
 * via `ceoMarkCommissionsPaid` (`@/actions/ceo` — l'acteur est reconstruit
 * côté serveur depuis `auth()`, aucun `actor` ne transite par le client).
 *
 * MODES :
 * - `readOnly = false` (CEO) : checkboxes + barre d'actions **sticky** au bas
 *   du tableau — compteur de sélection, total sélectionné, ConfirmDialog avec
 *   rappel `noClawbackWarning` + total, puis `router.refresh()` ;
 * - `readOnly = true` (manager, décision FE-8 : lecture seule) : AUCUNE case
 *   à cocher, AUCUN bouton — le même SELECT que le CEO, sans écriture.
 *
 * LIGNES SANS BÉNÉFICIAIRE (`beneficiaryId NULL`, leads Ads/Landing) :
 * checkbox **désactivée** + badge `commissions.noBeneficiary` + bannière
 * (`orphanCount`) — un montant n'est jamais versé sans bénéficiaire ; le
 * serveur exclut de toute façon ces lignes du versement.
 *
 * SÉMANTIQUE : le serveur ignore silencieusement les ids non `due` (déjà
 * versées) et plafonne à 100 ids par appel → `paidCount` fait foi, aucun
 * optimisme local, simple `router.refresh()` après succès.
 *
 * LIBELLÉS : props sérialisables résolus côté serveur (dict `commissions.*`
 * + replis bilingues listés dans `espace/commissions/page.tsx`).
 */

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ceoMarkCommissionsPaid } from "@/actions/ceo";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Format monétaire USD imposé par la spec (montants en cents → dollars). */
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Convertit des cents entiers en libellé monétaire (`123456` → « $1,234.56 »). */
function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

/** Une ligne de la file — données brutes + libellés pré-formatés server. */
export type CommissionQueueItem = {
  id: string;
  /** `users.name`, ou `null` (`beneficiaryId NULL` → ligne orpheline). */
  beneficiaryName: string | null;
  /** `prospects.fullName` — le « deal ». */
  prospectName: string;
  /** Montant du devis en cents (colonne Deal). */
  quoteAmountCents: number;
  /** Taux du palier, formaté server (« 12,5 % »). */
  rateLabel: string;
  /** Montant de la commission en cents. */
  amountCents: number;
  /** Date de génération, formatée server. */
  generatedLabel: string;
};

/** Agrégats de la file (Σ `due` du SELECT complet + nombre de lignes). */
export type CommissionQueueTotals = {
  totalDueCents: number;
  count: number;
};

/** Libellés résolus server (dict + replis listés par la page). */
export type CommissionQueueLabels = {
  /** `dict.commissions.queue` — titre de la section. */
  title: string;
  /** Colonne bénéficiaire (⚠ clé manquante : repli bilingue server). */
  beneficiary: string;
  /** Colonne « Deal » (⚠ clé manquante : repli bilingue server). */
  deal: string;
  /** `dict.commissions.tier.label` — colonne « Palier ». */
  tier: string;
  /** `dict.commissions.amount` — colonne montant + total de la sélection. */
  amount: string;
  /** `dict.commissions.generatedAt` — colonne « Générée le ». */
  generatedAt: string;
  /** `dict.commissions.pending` — carte de total. */
  pending: string;
  /** `dict.commissions.noBeneficiary` — badge + bannière d'orphelines. */
  noBeneficiary: string;
  /** `{count} sélectionné(s)` (⚠ clé manquante : repli bilingue server). */
  selectedCount: string;
  /** `dict.commissions.markPaidLot` — bouton de la barre sticky. */
  markPaidLot: string;
  /** `{total}` = montant total — description du ConfirmDialog. */
  lotConfirm: string;
  /** `dict.commissions.noClawbackWarning` — rappel dans le ConfirmDialog. */
  noClawback: string;
  /** `dict.commissions.markPaid` — confirmation du versement. */
  markPaid: string;
  /** `dict.commissions.paid` — toast de succès. */
  paid: string;
  /** `dict.common.cancel`. */
  cancel: string;
  /** `dict.common.retry` — toast d'échec / vue obsolète. */
  retry: string;
  /** `dict.common.noData` — état vide. */
  noData: string;
};

export type CommissionQueueProps = {
  items: CommissionQueueItem[];
  totals: CommissionQueueTotals;
  /** Lignes `due` sans bénéficiaire (bannière d'information). */
  orphanCount: number;
  /** `true` (manager) : aucun checkbox, aucun bouton — lecture seule. */
  readOnly: boolean;
  labels: CommissionQueueLabels;
};

export function CommissionQueue({
  items,
  totals,
  orphanCount,
  readOnly,
  labels,
}: CommissionQueueProps): React.JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lignes réellement sélectionnables : jamais d'orpheline (décision FE-8).
  const payableItems = items.filter((item) => item.beneficiaryName !== null);
  const selectedItems = payableItems.filter((item) => selected.has(item.id));
  const selectedCents = selectedItems.reduce((sum, item) => sum + item.amountCents, 0);

  function toggle(id: string): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function confirmLot(): Promise<void> {
    if (isSubmitting || selectedItems.length === 0) return;
    setIsSubmitting(true);
    try {
      const result = await ceoMarkCommissionsPaid({
        ids: selectedItems.map((item) => item.id),
      });

      if (result.ok) {
        setOpen(false);
        setSelected(new Set<string>());
        toast.success(labels.paid);
        router.refresh();
        return;
      }

      if (result.code === "not_found" || result.code === "invalid") {
        // Lot vide côté serveur (lignes déjà versées) ou > 100 ids :
        // la vue est obsolète, on la re-fetch sans fuite de détail.
        setOpen(false);
        setSelected(new Set<string>());
        router.refresh();
      }
      toast.error(labels.retry);
    } catch {
      // Erreur d'infra (action propagée en 500) : message générique.
      toast.error(labels.retry);
    } finally {
      setIsSubmitting(false);
    }
  }

  /** Barre d'actions collée (CEO seul) : compteur + total + bouton. */
  const actionBar = readOnly ? null : (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
        <span className="tabular-nums">
          {labels.selectedCount.replace("{count}", String(selectedItems.length))}
        </span>
        <span className="font-semibold tabular-nums text-fg">
          {labels.amount} {formatCents(selectedCents)}
        </span>
      </p>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={selectedItems.length === 0}
        onClick={() => {
          setOpen(true);
        }}
      >
        {labels.markPaidLot}
      </Button>
    </div>
  );

  /** ConfirmDialog de versement groupé (CEO seul). */
  const confirmDialog = readOnly ? null : (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
    >
      <DialogContent aria-label={labels.markPaidLot}>
        <DialogHeader>
          <DialogTitle>{labels.markPaidLot}</DialogTitle>
          <DialogDescription>
            {labels.lotConfirm.replace("{total}", formatCents(selectedCents))}
          </DialogDescription>
        </DialogHeader>

        {/* Rappel métier permanent : aucune récupération après versement. */}
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] font-medium text-fg">
          {labels.noClawback}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(false);
            }}
            disabled={isSubmitting}
          >
            {labels.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isSubmitting}
            onClick={() => {
              void confirmLot();
            }}
          >
            {labels.markPaid}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <section aria-labelledby="commission-queue-title" className="flex flex-col gap-4">
      {/* ------------------------------------------------- Titre + total --- */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="commission-queue-title"
          className="text-lg font-semibold tracking-[-0.015em] text-fg"
        >
          {labels.title}
          <span className="ml-2 tabular-nums text-muted">({totals.count})</span>
        </h2>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="text-[13px] font-semibold text-muted">{labels.pending}</span>
          <span className="text-xl font-bold tabular-nums tracking-[-0.015em] text-fg">
            {formatCents(totals.totalDueCents)}
          </span>
        </div>
      </div>

      {/* --------------------------------- Bannière lignes orphelines ------ */}
      {orphanCount > 0 ? (
        <p
          role="status"
          className="rounded-xl border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.12)] px-4 py-3 text-[13px] font-medium text-[#F59E0B]"
        >
          {labels.noBeneficiary} <span className="tabular-nums">({orphanCount})</span>
        </p>
      ) : null}

      {/* ---------------------------------------------------- État vide --- */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <Inbox aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
          <p className="text-[15px] font-semibold text-fg">{labels.noData}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                {readOnly ? null : <TableHead className="w-10" />}
                <TableHead>{labels.beneficiary}</TableHead>
                <TableHead>{labels.deal}</TableHead>
                <TableHead>{labels.tier}</TableHead>
                <TableHead>{labels.amount}</TableHead>
                <TableHead>{labels.generatedAt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isOrphan = item.beneficiaryName === null;
                const isSelected = selected.has(item.id);
                return (
                  <TableRow key={item.id} data-state={isSelected ? "selected" : undefined}>
                    {readOnly ? null : (
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          disabled={isOrphan}
                          onCheckedChange={() => {
                            toggle(item.id);
                          }}
                          aria-label={`${labels.beneficiary} : ${
                            item.beneficiaryName ?? labels.noBeneficiary
                          }`}
                          title={isOrphan ? labels.noBeneficiary : undefined}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      {isOrphan ? (
                        <Badge variant="tech">{labels.noBeneficiary}</Badge>
                      ) : (
                        <span className="text-sm font-medium text-fg">
                          {item.beneficiaryName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-fg">
                          {item.prospectName}
                        </span>
                        <span className="text-xs tabular-nums text-muted">
                          {formatCents(item.quoteAmountCents)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted">
                      {item.rateLabel}
                    </TableCell>
                    <TableCell className="text-sm font-semibold tabular-nums text-fg">
                      {formatCents(item.amountCents)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted">
                      {item.generatedLabel}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {actionBar}
        </div>
      )}

      {confirmDialog}
    </section>
  );
}
