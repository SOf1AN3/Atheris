"use client";

/**
 * Atheris — panneau de consentement au contrat de partenariat (page
 * `/espace/contrat`, espace SDR).
 *
 * Composant CLIENT dont **tous** les libellés sont produits côté serveur par
 * la page (`dict.contract.*`) : les codes BRUTS renvoyés par `acceptContract`
 * (`invalid` / `forbidden` / `failed`) sont traduits ici (C2), aucun message
 * serveur ne transite. Les 9 clauses restent rendues par la page serveur —
 * ce panneau ne gère que la case à cocher, l'appel d'action et ses états.
 *
 * ─── COMPORTEMENT (D5 : consentement VOLONTAIRE, non bloquant) ──────────────
 * - Case à cocher OBLIGATOIRE : le bouton reste désactivé tant qu'elle n'est
 *   pas cochée (et pendant l'appel) ;
 * - succès → message `role="status"` + `router.refresh()` : la page serveur
 *   bascule sur l'état « accepté » (horodaté) et ce panneau disparaît ;
 * - échec → `role="alert"` traduit, la case et le bouton restent utilisables
 *   pour réessayer.
 *
 * ─── A11Y ───────────────────────────────────────────────────────────────────
 * `<label>` associé (Radix `Checkbox` id + `Label htmlFor`), focus visible
 * (`focus-visible:ring` shadcn), bouton `type="submit"` dans un `<form>`
 * (validation par Entrée), `aria-live` via `role` sur les retours d'état.
 */

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { acceptContract, type AcceptContractResult } from "@/actions/contract";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ContractContent } from "@/content/types";

/** Codes d'échec d'`acceptContract`, dérivés du contrat d'action (pas de dup). */
type AcceptErrorCode = Extract<AcceptContractResult, { ok: false }>["code"];

/** Libellés résolus server (100 % strings sérialisables). */
export type ContractPanelLabels = {
  checkboxLabel: ContractContent["checkboxLabel"];
  acceptLabel: ContractContent["acceptLabel"];
  acceptingLabel: ContractContent["acceptingLabel"];
  successMessage: ContractContent["successMessage"];
  errors: ContractContent["errors"];
};

type ContractPanelProps = {
  labels: ContractPanelLabels;
};

export function ContractPanel({ labels }: ContractPanelProps): React.JSX.Element {
  const router = useRouter();
  const checkboxId = useId();

  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [errorCode, setErrorCode] = useState<AcceptErrorCode | null>(null);

  async function handleAccept(): Promise<void> {
    // Garde anti double-clic pendant l'appel serveur.
    if (submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      const result = await acceptContract({ accepted: true });
      if (result.ok) {
        setSucceeded(true);
        // Re-rendu serveur : la page affiche l'état horodaté et ce panneau
        // disparaît (le consentement est désormais en base).
        router.refresh();
        return;
      }
      setErrorCode(result.code);
    } catch {
      // Panne réseau / action injoignable : même code que `failed`, traduit ici.
      setErrorCode("failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleAccept();
      }}
      className="flex max-w-[720px] flex-col gap-5 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-7 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)]"
    >
      {/* Case à cocher obligatoire — label associé, clic = toggle. */}
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={checked}
          onCheckedChange={(value) => {
            setChecked(value === true);
          }}
          disabled={submitting}
          className="mt-0.5"
        />
        <Label
          htmlFor={checkboxId}
          className="cursor-pointer select-text text-[15px] font-normal leading-[1.6] text-fg"
        >
          {labels.checkboxLabel}
        </Label>
      </div>

      {/* Succès — `role="status"` (annonce polie), remplacé par le rendu
          serveur de l'état « accepté » après `router.refresh()`. */}
      {succeeded ? (
        <p
          role="status"
          className="rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-[14px] text-accent"
        >
          {labels.successMessage}
        </p>
      ) : null}

      {/* Échec — `role="alert"` (annonce immédiate), code traduit ici. */}
      {errorCode !== null ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-danger"
        >
          {labels.errors[errorCode]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={!checked || submitting || succeeded}>
          {submitting ? labels.acceptingLabel : labels.acceptLabel}
        </Button>
      </div>
    </form>
  );
}
