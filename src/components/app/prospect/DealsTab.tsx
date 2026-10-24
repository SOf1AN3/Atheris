"use client";

/**
 * Atheris — onglet « Devis & paiements » de la fiche prospect (FE-5 · T18,
 * **étendu FE-8 · T21/T22** : création de devis, transitions de statut,
 * échéancier et encaissement côté CEO).
 *
 * Le composant devient CLIENT pour héberger les dialogs d'écriture, mais
 * **toutes les données restent calculées et formatées côté serveur** par la
 * page détail (`quotes` + `payments` : montants USD, statuts, dates,
 * transitions autorisées, échéance déclencheur) — props 100 % sérialisables,
 * aucun `viewer`/`actor` ne transite par le client.
 *
 * DOUBLE FILET RÔLE (FE-8) : les actions CEO ne sont rendues QUE si `isCeo`
 * (préparé server-side depuis la session, jamais recalculé ici) ; même un
 * appel forgé reçoit `forbidden`, car `@/actions/ceo` reconstruit l'acteur
 * depuis `auth()` et les actions figées exigent `role === "ceo"`. Tout autre
 * rôle garde exactement l'état lecture seule de FE-5 — **aucun bouton**.
 *
 * LIBELLÉS (dict verrouillé) : montant = valeur seule déjà présente dans
 * l'en-tête ; statut = badge `dict.statuses.quote[status]` ; dates = texte
 * `muted` ; encaissement = `dict.client.paid` / `dict.client.due` (repli
 * sémantique documenté par FE-5) ; libellés CEO = dict + replis bilingues
 * **listés dans la page détail** (jamais de string FR/EN en dur ici).
 */

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ceoChangeQuoteStatus } from "@/actions/ceo";
import {
  MarkPaymentPaidButton,
  PaymentPanel,
  type MarkPaymentPaidLabels,
  type PaymentPanelLabels,
} from "@/components/app/prospect/PaymentPanel";
import {
  QuoteCreateDialog,
  type QuoteCreateDialogLabels,
} from "@/components/app/prospect/QuoteCreateDialog";
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
import type { QuoteStatus } from "@/content/platform/types";

/** Une échéance d'un devis, pré-formatée côté serveur. */
export type DealPaymentView = {
  id: string;
  /** `payments.label` (« Acompte », « Échéance 1 »…). */
  label: string;
  /** Montant formaté en USD (`Intl.NumberFormat`, server). */
  amountLabel: string;
  /** Échéance formatée, `null` si absente. */
  dueLabel: string | null;
  /** Date de paiement formatée, `null` si non encaissée. */
  paidLabel: string | null;
  isPaid: boolean;
  /**
   * Aucune échéance de CE devis n'est encore encaissée → ce paiement est le
   * déclencheur potentiel des commissions (ConfirmDialog + rappels requis).
   * Calculé côté serveur (deuxième passe sur l'échéancier du devis).
   */
  isFirstPayment: boolean;
};

/** Une transition de devis **admise par le graphe figé**, libellée server. */
export type DealQuoteAction = {
  to: QuoteStatus;
  /** Libellé du STATUT cible (badge de confirmation + toast de succès). */
  label: string;
  /** Intitulé du bouton d'action (spécifique sur `draft→sent`). */
  buttonLabel: string;
};

/** Un devis du prospect, pré-formaté côté serveur. */
export type DealQuoteView = {
  id: string;
  /** Montant formaté en USD. */
  amountLabel: string;
  /** `dict.statuses.quote[status]` (libellé localisé, server). */
  statusLabel: string;
  /** État brut — transmis en `expectedFrom` (optimistic locking). */
  status: QuoteStatus;
  /** Date pertinente au statut (envoi ou signature), `null` si aucune. */
  dateLabel: string | null;
  /**
   * `sent`/`signed` uniquement — miroir server du garde-fou `createPayment`
   * (`draft` non envoyé et `lost` refusés) : pas de bouton mort à l'écran.
   */
  canAddPayment: boolean;
  /** Transitions autorisées (graphe `draft→sent|lost`, `sent→signed|lost`). */
  actions: DealQuoteAction[];
  payments: DealPaymentView[];
};

/** Libellés i18n résolus côté serveur. */
export type DealsTabLabels = {
  /** `dict.common.noData` — état vide. */
  empty: string;
  /** `dict.client.paid` — badge « encaissée » (variante `verified` = succès). */
  paid: string;
  /** `dict.client.due` — badge « à venir ». */
  upcoming: string;
};

/** Libellés des transitions de statut du devis (dict, résolus server). */
export type QuoteStatusActionLabels = {
  /** `dict.prospect.actions.changeStatus` — bouton + toast. */
  changeStatus: string;
  /** `dict.prospect.actions.reasonLabel` — motif obligatoire (`lost`). */
  reasonLabel: string;
  /** `dict.prospect.actions.reasonRequired`. */
  reasonRequired: string;
  /** `dict.prospect.actions.confirmChange` — description + bouton confirmer. */
  confirmChange: string;
  /** `dict.commissions.noClawbackWarning` — rappel à la signature. */
  noClawback: string;
  /** `dict.prospect.actions.lockedByRole` — toast `forbidden`. */
  lockedByRole: string;
  /** `dict.common.cancel`. */
  cancel: string;
  /** `dict.common.retry` — toast `conflict` / erreur infra. */
  retry: string;
};

/** Bloc de libellés CEO — transmis **uniquement** à un `ceo`. */
export type DealsCeoLabels = {
  create: QuoteCreateDialogLabels;
  payment: PaymentPanelLabels;
  markPaid: MarkPaymentPaidLabels;
  status: QuoteStatusActionLabels;
  /** `dict.commissions.queue` — texte du lien post-génération. */
  viewCommissions: string;
};

export type DealsTabProps = {
  /** uuid du prospect (déjà validé par la page server). */
  prospectId: string;
  quotes: DealQuoteView[];
  labels: DealsTabLabels;
  /** Préparé server-side : `role === "ceo"` — jamais recalculé ici. */
  isCeo: boolean;
  /** Libellés CEO (omis pour tout autre rôle). */
  ceoLabels?: DealsCeoLabels;
  /** `/{locale}/espace/commissions` — lien affiché après génération. */
  commissionsHref?: string;
};

/** Longueur minimale du motif — alignée sur `changeQuoteStatus` (figé). */
const MIN_REASON_LENGTH = 3;

/** Ligne de méta discrète d'une échéance : échéance puis encaissement (`·`). */
function paymentMeta(payment: DealPaymentView): string {
  if (payment.dueLabel !== null && payment.paidLabel !== null) {
    return `${payment.dueLabel} · ${payment.paidLabel}`;
  }
  return payment.paidLabel ?? payment.dueLabel ?? "—";
}

/** Un conteneur d'état vide / d'information sobre (même format que la page). */
function Panel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      {children}
    </div>
  );
}

/** Actions de statut d'un devis (CEO) : choix de la cible → confirmation. */
function QuoteStatusActions({
  quoteId,
  status,
  statusLabel,
  actions,
  labels,
}: {
  quoteId: string;
  status: QuoteStatus;
  statusLabel: string;
  actions: DealQuoteAction[];
  labels: QuoteStatusActionLabels;
}): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<DealQuoteAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function closeDialog(): void {
    setOpen(false);
    setTarget(null);
    setReason("");
    setReasonError(null);
  }

  async function submit(): Promise<void> {
    if (target === null || isSubmitting) return;

    const trimmed = reason.trim();
    // Miroir du serveur : motif ≥ 3 caractères EXCLUSIVEMENT pour `lost`.
    if (target.to === "lost" && trimmed.length < MIN_REASON_LENGTH) {
      setReasonError(labels.reasonRequired);
      return;
    }
    setReasonError(null);

    const applied = target.label;
    setIsSubmitting(true);
    try {
      const result = await ceoChangeQuoteStatus({
        quoteId,
        to: target.to,
        expectedFrom: status,
        ...(trimmed.length > 0 ? { reason: trimmed } : {}),
      });

      if (result.ok) {
        closeDialog();
        toast.success(`${labels.changeStatus} — ${applied}`);
        router.refresh();
        return;
      }

      switch (result.code) {
        case "conflict":
          // État bougé entre-temps (ou double-clic) : rechargement sans fuite.
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
      // Erreur d'infra (action propagée en 500) : message générique.
      toast.error(labels.retry);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
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
            /* Étape 1 — cibles autorisées, calculées par le graphe figé côté
                serveur (le client ne recalcule aucun droit). */
            <ul className="flex flex-col gap-2">
              {actions.map((action) => (
                <li key={action.to}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setReason("");
                      setReasonError(null);
                      setTarget(action);
                    }}
                  >
                    {action.buttonLabel}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            /* Étape 2 — confirmation (+ rappels métier / motif si requis). */
            <div className="flex flex-col gap-4">
              <p className="flex flex-wrap items-center gap-2 text-[15px] text-fg">
                <Badge variant="tech">{statusLabel}</Badge>
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <Badge variant="tech">{target.label}</Badge>
              </p>

              {/* Signature : rappel de non-récupération des commissions. */}
              {target.to === "signed" ? (
                <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] font-medium text-fg">
                  {labels.noClawback}
                </p>
              ) : null}

              {/* Perdu : motif obligatoire (≥ 3 car. côté serveur). */}
              {target.to === "lost" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="quote-lost-reason" className="text-fg">
                    {labels.reasonLabel}
                  </Label>
                  <Textarea
                    id="quote-lost-reason"
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      if (reasonError !== null) setReasonError(null);
                    }}
                    aria-invalid={reasonError !== null}
                    aria-describedby={
                      reasonError !== null ? "quote-lost-reason-error" : undefined
                    }
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted">{labels.reasonRequired}</p>
                  {reasonError !== null ? (
                    <p
                      id="quote-lost-reason-error"
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

export function DealsTab({
  prospectId,
  quotes,
  labels,
  isCeo,
  ceoLabels,
  commissionsHref,
}: DealsTabProps): React.JSX.Element {
  /** Lien « Commissions à verser » affiché après une génération réussie. */
  const [generatedQuoteId, setGeneratedQuoteId] = useState<string | null>(null);

  // Narrowing unique : tout le bloc CEO passe par cette valeur (double filet).
  const ceo = isCeo && ceoLabels !== undefined ? ceoLabels : null;

  const createButton =
    ceo !== null ? (
      <div className="flex justify-end">
        <QuoteCreateDialog prospectId={prospectId} labels={ceo.create} />
      </div>
    ) : null;

  // --- État vide : aucun devis rattaché au prospect ------------------------
  if (quotes.length === 0) {
    return (
      <Panel>
        <Inbox aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
        <p className="text-[15px] font-semibold text-fg">{labels.empty}</p>
        {createButton}
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {createButton}

      <ul className="flex flex-col gap-4">
        {quotes.map((quote) => (
          <li
            key={quote.id}
            className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
          >
            {/* En-tête du devis : montant + badge statut (libellé du dict). */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-bold tabular-nums text-fg">{quote.amountLabel}</p>
              <Badge variant="tech">{quote.statusLabel}</Badge>
            </div>

            {/* Transitions admises (CEO seul — rendu conditionnel `ceo`). */}
            {ceo !== null && quote.actions.length > 0 ? (
              <QuoteStatusActions
                quoteId={quote.id}
                status={quote.status}
                statusLabel={quote.statusLabel}
                actions={quote.actions}
                labels={ceo.status}
              />
            ) : null}

            {quote.dateLabel !== null ? (
              <p className="text-xs tabular-nums text-muted">{quote.dateLabel}</p>
            ) : null}

            {/* Échéancier : création + encaissement (CEO seul). */}
            {ceo !== null && quote.canAddPayment ? (
              <PaymentPanel quoteId={quote.id} labels={ceo.payment} />
            ) : null}

            {quote.payments.length > 0 ? (
              <ul className="mt-1 flex flex-col divide-y divide-line border-t border-line">
                {quote.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold text-fg">{payment.label}</span>
                      <span className="text-xs tabular-nums text-muted">
                        {paymentMeta(payment)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-fg">
                        {payment.amountLabel}
                      </span>
                      {/* `verified` = fond vert + coche (état « payé » = succès). */}
                      <Badge variant={payment.isPaid ? "verified" : "tech"}>
                        {payment.isPaid ? labels.paid : labels.upcoming}
                      </Badge>
                      {ceo !== null && !payment.isPaid ? (
                        <MarkPaymentPaidButton
                          paymentId={payment.id}
                          isFirstPayment={payment.isFirstPayment}
                          labels={ceo.markPaid}
                          onCommissionsGenerated={() => {
                            setGeneratedQuoteId(quote.id);
                          }}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Lien post-génération : accès direct à la file de versement. */}
            {ceo !== null &&
            commissionsHref !== undefined &&
            generatedQuoteId === quote.id ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                href={commissionsHref}
                className="w-fit self-start"
              >
                {ceo.viewCommissions}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
