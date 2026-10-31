/**
 * Atheris — onglet « Identité » de la fiche prospect (FE-5 · T18).
 *
 * Composant **pur et server** (aucun `"use client"`, aucun hook) : toutes les
 * valeurs (dates, fallbacks `—`, liens `mailto:`/`tel:`) sont résolues par la
 * page server qui le rend — ce composant ne formate ni ne valide rien.
 */

import type { ReactNode } from "react";

/** Libellés i18n résolus côté serveur (`dict.prospect.labels.*` + `reason`). */
export type IdentityTabLabels = {
  email: string;
  phone: string;
  company: string;
  /** `dict.prospect.labels.owner` (bénéficiaire `sourceUserId`). */
  owner: string;
  /** `dict.prospect.labels.createdAt`. */
  createdAt: string;
  /**
   * Dernière modification de la fiche — `dict.prospect.labels.updatedAt`,
   * résolu côté serveur par la page détail.
   */
  updatedAt: string;
  /** `dict.prospect.actions.reasonLabel` — titre du bloc disqualification. */
  reason: string;
};

/** Valeurs déjà pré-formatées (string) côté serveur. */
export type IdentityTabValues = {
  email: string;
  phone: string;
  company: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
};

export type IdentityTabProps = {
  labels: IdentityTabLabels;
  values: IdentityTabValues;
  /** `prospects.disqualifyReason` — affiché uniquement s'il est renseigné. */
  disqualifyReason: string | null;
};

/** Un libellé + sa valeur (élément d'une `<dl>` accessible). */
function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* DESIGN §6.5 : faint (4,1:1) interdit sur un `dt` (label de champ
          porteur d'info) → muted. */}
      <dt className="text-[13px] font-medium text-muted">{label}</dt>
      <dd className="break-words text-[15px] text-fg">{children}</dd>
    </div>
  );
}

/** Lien interne (email/téléphone) : focus clavier visible, sans décor parasite. */
const LINK_CLASSES =
  "rounded-md underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function IdentityTab({
  labels,
  values,
  disqualifyReason,
}: IdentityTabProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <Field label={labels.email}>
          <a href={`mailto:${values.email}`} className={LINK_CLASSES}>
            {values.email}
          </a>
        </Field>
        <Field label={labels.phone}>
          <a href={`tel:${values.phone}`} className={LINK_CLASSES}>
            {values.phone}
          </a>
        </Field>
        <Field label={labels.company}>{values.company}</Field>
        <Field label={labels.owner}>{values.owner}</Field>
        <Field label={labels.createdAt}>{values.createdAt}</Field>
        <Field label={labels.updatedAt}>{values.updatedAt}</Field>
      </dl>

      {disqualifyReason !== null ? (
        // Motif de disqualification persisté sur la ligne (colonnes dédiées) —
        // teinte `danger` : c'est un refus, la couleur seule ne porte pas
        // l'information (le texte reste lisible et explicite).
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[13px] font-semibold text-danger">{labels.reason}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-danger">
            {disqualifyReason}
          </p>
        </div>
      ) : null}
    </div>
  );
}
