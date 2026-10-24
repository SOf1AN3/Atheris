"use client";

/**
 * Atheris — échéancier & encaissement d'un devis (FE-8 · T22 · structure.md §3.3).
 *
 * Deux composants CLIENTS rendus par l'onglet Devis **uniquement pour un
 * CEO** (`isCeo` préparé server-side) :
 * - `PaymentPanel` : bouton « Ajouter une échéance » + dialog (libellé,
 *   montant, date d'échéance) — n'affiché que sur un devis `sent`/`signed`
 *   (`canAddPayment` calculé côté serveur, miroir du garde-fou `createPayment`) ;
 * - `MarkPaymentPaidButton` : encaissement d'une échéance non payée —
 *   **ConfirmDialog + rappels métier** quand c'est le 1ᵉʳ paiement payé du
 *   devis (déclencheur de commissions), exécution directe sinon.
 *
 * SÉCURITÉ : uniquement `ceoCreatePayment` / `ceoMarkPaymentPaid`
 * (`@/actions/ceo`) — l'acteur est reconstruit côté serveur depuis la session,
 * aucun `{ id, role }` ne transite par le client, `@/actions/payments` n'est
 * jamais importé ici (double filet : rôle ≠ `ceo` → `forbidden`).
 *
 * RETOUR `commissionsGenerated` : > 0 → toast `{count} commission(s)
 * générée(s)` + `onCommissionsGenerated()` (la page détail affiche alors le
 * lien vers `/{locale}/espace/commissions`) ; sinon toast `commissions.paid`.
 *
 * LIBELLÉS : props sérialisables résolus côté serveur (dict verrouillé ou
 * replis bilingues listés dans la page détail).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ceoCreatePayment, ceoMarkPaymentPaid } from "@/actions/ceo";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/** Libellés du formulaire « Ajouter une échéance » (résolus server). */
export type PaymentPanelLabels = {
  /** Bouton + `DialogTitle` (⚠ clé manquante : repli bilingue server). */
  add: string;
  /** Champ libellé (⚠ clé manquante : repli bilingue server). */
  labelField: string;
  /** `dict.commissions.amount` — champ montant. */
  amount: string;
  /** Champ date d'échéance (⚠ clé manquante : repli bilingue server). */
  dueField: string;
  /** `dict.common.optional` — la date d'échéance est facultative. */
  optional: string;
  /** `dict.common.save`. */
  submit: string;
  /** `dict.common.cancel`. */
  cancel: string;
  /** `dict.auth.validation.required`. */
  required: string;
  /** `dict.auth.validation.tooShort(2)` résolu server-side. */
  labelTooShort: string;
  /** `dict.auth.validation.tooLong(120)` résolu server-side. */
  labelTooLong: string;
  /** Montant invalide (⚠ clé manquante : miroir des contraintes serveur). */
  amountInvalid: string;
  /** `dict.auth.login.errors.generic` — échec serveur hors champ. */
  genericError: string;
};

/** Libellés de l'encaissement (résolus server). */
export type MarkPaymentPaidLabels = {
  /** Bouton d'encaissement (⚠ clé manquante : repli bilingue server). */
  markPaid: string;
  /** `dict.prospect.actions.confirmChange` — titre du ConfirmDialog. */
  confirmChange: string;
  /** `dict.common.cancel`. */
  cancel: string;
  /** Rappel : ce paiement déclenche la génération (⚠ clé manquante). */
  triggerWarning: string;
  /** `dict.commissions.noClawbackWarning` — rappel de non-récupération. */
  noClawback: string;
  /** `dict.commissions.paid` — toast de succès. */
  paid: string;
  /** `dict.common.retry` — toast d'échec / conflit optimiste. */
  retry: string;
  /** `{count} commission(s) générée(s)` (⚠ clé manquante : repli server). */
  generatedTemplate: string;
};

export type PaymentPanelProps = {
  /** uuid du devis `sent`/`signed` (déjà validé par la page server). */
  quoteId: string;
  labels: PaymentPanelLabels;
};

export type MarkPaymentPaidButtonProps = {
  /** uuid de l'échéance **non encaissée**. */
  paymentId: string;
  /** Aucun paiement de ce devis n'est encore encaissé → ConfirmDialog requis. */
  isFirstPayment: boolean;
  labels: MarkPaymentPaidLabels;
  /** Signalé au parent : le lien « Commissions à verser » doit apparaître. */
  onCommissionsGenerated: () => void;
};

/** Montant plafond — miroir de `usdAmountSchema` (`actions/payments`). */
const MAX_AMOUNT_USD = 10_000_000;

/** Libellé d'échéance — miroir du `label` serveur (2 à 120 caractères). */
const LABEL_MIN = 2;
const LABEL_MAX = 120;

/**
 * Schéma Zod **client** — miroir du `createPaymentInputSchema` serveur
 * (le serveur revalide tout, défense en profondeur).
 */
function createPaymentFormSchema(labels: PaymentPanelLabels) {
  return z.object({
    label: z
      .string()
      .trim()
      .min(1, labels.required)
      .min(LABEL_MIN, labels.labelTooShort)
      .max(LABEL_MAX, labels.labelTooLong),
    amount: z
      .string()
      .trim()
      .min(1, labels.required)
      .refine((value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_AMOUNT_USD) {
          return false;
        }
        return Math.abs(parsed * 100 - Math.round(parsed * 100)) <= 1e-6;
      }, labels.amountInvalid),
    /** `""` = échéance absente (jamais `new Date("")` côté client/serveur). */
    dueAt: z.string(),
  });
}

type PaymentFormValues = z.infer<ReturnType<typeof createPaymentFormSchema>>;

export function PaymentPanel({ quoteId, labels }: PaymentPanelProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** Erreur hors champ (code serveur inattendu) — bandeau `role="alert"`. */
  const [banner, setBanner] = useState<string | null>(null);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(createPaymentFormSchema(labels)),
    mode: "onTouched",
    defaultValues: { label: "", amount: "", dueAt: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  function closeDialog(): void {
    setOpen(false);
    setBanner(null);
    form.reset({ label: "", amount: "", dueAt: "" });
  }

  const onSubmit = async (values: PaymentFormValues): Promise<void> => {
    setBanner(null);
    try {
      const dueAt = values.dueAt.trim();
      const result = await ceoCreatePayment({
        quoteId,
        label: values.label.trim(),
        amountUsd: Number(values.amount),
        ...(dueAt.length > 0 ? { dueAt } : {}),
      });

      if (result.ok) {
        closeDialog();
        router.refresh();
        return;
      }

      // `invalid` (miroir local normalement hors course — statut du devis
      // bougé entre-temps) / `not_found` / `forbidden` : bandeau générique.
      setBanner(labels.genericError);
    } catch {
      // Erreur d'infra (action propagée en 500) : aucun détail côté client.
      setBanner(labels.genericError);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-fit self-start"
      >
        + {labels.add}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
        }}
      >
        <DialogContent aria-label={labels.add}>
          <DialogHeader>
            <DialogTitle>{labels.add}</DialogTitle>
            {/* Description `sr-only` : aucune clé `*.description` pertinente
                dans le dict verrouillé (listée en restitution). */}
            <DialogDescription className="sr-only">{labels.add}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              className="flex w-full flex-col gap-5"
            >
              {banner !== null ? (
                <p
                  role="alert"
                  className="rounded-xl border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.12)] px-4 py-3 text-[13px] font-medium text-[#F87171]"
                >
                  {banner}
                </p>
              ) : null}

              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{labels.labelField}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-12"
                        autoComplete="off"
                        maxLength={LABEL_MAX}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{labels.amount}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-12"
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={20}
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {labels.dueField}
                      <span className="ml-1.5 font-normal text-muted">
                        {labels.optional}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="h-12" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? `${labels.submit}…` : labels.submit}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MarkPaymentPaidButton({
  paymentId,
  isFirstPayment,
  labels,
  onCommissionsGenerated,
}: MarkPaymentPaidButtonProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await ceoMarkPaymentPaid({ paymentId });

      if (result.ok) {
        setOpen(false);
        if (result.commissionsGenerated > 0) {
          // Toast EXPLICITE du déclencheur (clés manquantes → template server).
          toast.success(
            labels.generatedTemplate.replace(
              "{count}",
              String(result.commissionsGenerated),
            ),
          );
          onCommissionsGenerated();
        } else {
          toast.success(labels.paid);
        }
        router.refresh();
        return;
      }

      if (result.code === "conflict") {
        // Déjà encaissé entre-temps (verrou `paidAt IS NULL`) : vue obsolète.
        setOpen(false);
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

  /* 1ᵉʳ paiement du devis → ConfirmDialog avec le rappel de génération ;
     paiements suivants → encaissement direct (décision FE-8). */
  if (!isFirstPayment) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isSubmitting}
        onClick={() => {
          void submit();
        }}
      >
        {labels.markPaid}
      </Button>
    );
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {labels.markPaid}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setOpen(false);
        }}
      >
        <DialogContent aria-label={labels.markPaid}>
          <DialogHeader>
            <DialogTitle>{labels.confirmChange}</DialogTitle>
            <DialogDescription>{labels.triggerWarning}</DialogDescription>
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
              onClick={() => setOpen(false)}
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
                void submit();
              }}
            >
              {labels.markPaid}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
