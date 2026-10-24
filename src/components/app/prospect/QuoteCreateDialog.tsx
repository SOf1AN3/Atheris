"use client";

/**
 * Atheris — dialog « Créer un devis » (FE-8 · T21 · structure.md §3.3).
 *
 * Composant CLIENT (dialog shadcn + RHF/Zod) rendu par l'onglet Devis **uniquement
 * pour un CEO** (`isCeo` préparé server-side par la page détail) :
 * - montant USD (**miroir** du `usdAmountSchema` figé : > 0, ≤ 10 000 000,
 *   2 décimales maximum) ;
 * - référence externe optionnelle (≤ 100 car.) ;
 * - PDF optionnel : `input file` `accept="application/pdf,.pdf"`, **≤ 5 Mo**
 *   (miroir du garde-fou serveur) lu en base64 via `FileReader` avant envoi.
 *
 * SÉCURITÉ : appelle **uniquement** `ceoCreateQuote` (`@/actions/ceo`) —
 * l'acteur est reconstruit côté serveur depuis la session (`auth()`), aucun
 * `{ id, role }` ne transite par ce composant, `@/actions/quotes` n'est jamais
 * importé ici (double filet : rôle ≠ `ceo` → `forbidden`).
 *
 * ÉTATS : succès → fermeture + `router.refresh()` (la page server re-fetch les
 * devis) · erreurs → **sous le champ** (`invalid` = montant ou PDF) ou bandeau
 * `role="alert"` (`not_found` / `forbidden` / erreur infra) — aucun code brut
 * ni détail technique côté client.
 *
 * LIBELLÉS : props sérialisables résolues côté serveur (dict verrouillé ou
 * replis bilingues listés dans la page détail) — ce composant n'importe
 * jamais `@/i18n/*`.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ceoCreateQuote } from "@/actions/ceo";
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
import { Label } from "@/components/ui/label";

/** Libellés i18n résolus côté serveur (props 100 % sérialisables). */
export type QuoteCreateDialogLabels = {
  /** Bouton + `DialogTitle` (⚠ clé manquante : repli bilingue server). */
  open: string;
  /** `dict.commissions.amount` — champ montant. */
  amount: string;
  /** Référence externe (⚠ clé manquante : repli bilingue server). */
  externalRef: string;
  /** PDF (⚠ clé manquante : repli bilingue server). */
  pdf: string;
  /** `dict.common.optional` — suffixe des champs facultatifs. */
  optional: string;
  /** `dict.common.save` — validation du formulaire. */
  submit: string;
  /** `dict.common.cancel`. */
  cancel: string;
  /** `dict.auth.validation.required`. */
  required: string;
  /** `dict.auth.validation.tooLong(100)` résolu server-side. */
  refTooLong: string;
  /** Montant invalide (⚠ clé manquante : miroir des contraintes serveur). */
  amountInvalid: string;
  /** PDF invalide (⚠ clé manquante : ≤ 5 Mo + `%PDF` côté serveur). */
  pdfInvalid: string;
  /** `dict.auth.login.errors.generic` — échec serveur hors champ. */
  genericError: string;
};

export type QuoteCreateDialogProps = {
  /** uuid du prospect (déjà validé par la page server). */
  prospectId: string;
  labels: QuoteCreateDialogLabels;
};

/** Limite octets du PDF — miroir exact de `MAX_PDF_BYTES` (`actions/quotes`). */
const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Montant plafond — miroir de `usdAmountSchema` (`actions/quotes`). */
const MAX_AMOUNT_USD = 10_000_000;

/** Référence externe — miroir de `externalRef` (`actions/quotes`). */
const MAX_EXTERNAL_REF_LENGTH = 100;

/**
 * Schéma Zod **client** — miroir du `createQuoteInputSchema` serveur pour les
 * deux champs texte (le serveur revalide tout, défense en profondeur).
 * Le montant est saisi en chaîne : mêmes contraintes numériques que le serveur
 * (fini, > 0, ≤ 10 000 000, 2 décimales maximum — ε identique).
 */
function createQuoteFormSchema(labels: QuoteCreateDialogLabels) {
  return z.object({
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
    externalRef: z.string().trim().max(MAX_EXTERNAL_REF_LENGTH, labels.refTooLong),
  });
}

type QuoteCreateFormValues = z.infer<ReturnType<typeof createQuoteFormSchema>>;

/** `File` → base64 **sans** préfixe data-URL (le serveur décode les octets). */
function readPdfBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(reader.error ?? new Error("pdf-read"));
        return;
      }
      const separator = result.indexOf(",");
      resolve(separator === -1 ? result : result.slice(separator + 1));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("pdf-read"));
    });
    reader.readAsDataURL(file);
  });
}

/** Garde-fou client sur le fichier (type + taille — miroir serveur). */
function isAcceptablePdf(file: File): boolean {
  if (file.size > MAX_PDF_BYTES || file.size === 0) return false;
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function QuoteCreateDialog({
  prospectId,
  labels,
}: QuoteCreateDialogProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  /** Erreur hors champ (code serveur inattendu) — bandeau `role="alert"`. */
  const [banner, setBanner] = useState<string | null>(null);

  const form = useForm<QuoteCreateFormValues>({
    resolver: zodResolver(createQuoteFormSchema(labels)),
    mode: "onTouched",
    defaultValues: { amount: "", externalRef: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  function closeDialog(): void {
    setOpen(false);
    setPdf(null);
    setPdfError(null);
    setBanner(null);
    form.reset({ amount: "", externalRef: "" });
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file === undefined) {
      setPdf(null);
      setPdfError(null);
      return;
    }
    if (!isAcceptablePdf(file)) {
      setPdf(null);
      setPdfError(labels.pdfInvalid);
      // Le champ DOM ne conserve jamais un fichier refusé.
      event.target.value = "";
      return;
    }
    setPdf(file);
    setPdfError(null);
  }

  const onSubmit = async (values: QuoteCreateFormValues): Promise<void> => {
    setBanner(null);
    try {
      const externalRef = values.externalRef.trim();
      let pdfBytesBase64: string | undefined;
      let pdfFilename: string | undefined;
      if (pdf !== null) {
        pdfBytesBase64 = await readPdfBase64(pdf);
        // Nom tronqué au maximum serveur (200) ; le serveur re-trime et
        // re-valide (`invalid` → message sous le champ PDF).
        pdfFilename = pdf.name.slice(0, 200);
      }

      const result = await ceoCreateQuote({
        prospectId,
        amountUsd: Number(values.amount),
        ...(externalRef.length > 0 ? { externalRef } : {}),
        ...(pdfBytesBase64 !== undefined && pdfFilename !== undefined
          ? { pdfBytesBase64, pdfFilename }
          : {}),
      });

      if (result.ok) {
        closeDialog();
        router.refresh();
        return;
      }

      if (result.code === "invalid") {
        // Les deux champs texte sont validés en miroir ci-dessus : un `invalid`
        // persistant vient du PDF (magic bytes / taille) ou du statut du
        // prospect — message sous le champ PDF s'il y en a un, sinon bandeau.
        if (pdf !== null) {
          setPdfError(labels.pdfInvalid);
          return;
        }
        setBanner(labels.genericError);
        return;
      }

      // `not_found` (prospect supprimé) / `forbidden` (session hors ligne).
      setBanner(labels.genericError);
    } catch {
      // Erreur d'infra (action propagée en 500) : message générique, aucun
      // détail technique côté client.
      setBanner(labels.genericError);
    }
  };

  return (
    <>
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
        {labels.open}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
        }}
      >
        <DialogContent aria-label={labels.open}>
          <DialogHeader>
            <DialogTitle>{labels.open}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              className="flex w-full flex-col gap-5"
            >
              {/* Bandeau d'erreur global (aucun code métier fuité). */}
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
                name="externalRef"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {labels.externalRef}
                      <span className="ml-1.5 font-normal text-muted">
                        {labels.optional}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} className="h-12" autoComplete="off" maxLength={100} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* PDF — champ natif hors RHF (un `FileList` n'est pas une
                  valeur de formulaire) : label relié par `htmlFor`, erreur
                  reliée par `aria-describedby` + `role="alert". */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="quote-pdf">
                  {labels.pdf}
                  <span className="ml-1.5 font-normal text-muted">
                    {labels.optional}
                  </span>
                </Label>
                <Input
                  id="quote-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="h-12 px-3 text-[13px]"
                  aria-invalid={pdfError !== null}
                  aria-describedby={pdfError !== null ? "quote-pdf-error" : undefined}
                  onChange={onFileChange}
                />
                {pdfError !== null ? (
                  <p
                    id="quote-pdf-error"
                    role="alert"
                    className="text-[13px] font-medium text-[#F87171]"
                  >
                    {pdfError}
                  </p>
                ) : null}
              </div>

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

          {/* `sr-only` : aucune clé `*.description` pertinente n'existe dans le
              dict verrouillé (listée en restitution) — la description
              d'accessibilité reprend l'intitulé porté par le `DialogTitle`. */}
          <DialogDescription className="sr-only">{labels.open}</DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
}
