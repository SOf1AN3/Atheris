/**
 * Atheris — badge de statut prospect (FE-4 · T16 · DESIGN.md « OBSIDIAN
 * INSTRUMENT »).
 *
 * Composant **pur** (aucun hook, aucun `"use client"` requis) : utilisable
 * depuis un Server Component ou un Client Component — ses props
 * (`status: string`, `label: string`) sont entièrement sérialisables.
 *
 * Le libellé est **résolu côté serveur** (`dict.statuses.prospect[status]`,
 * FR/EN) puis passé en prop : ce composant ne lit jamais le dictionnaire et
 * reste i18n-agnostique. Le habillage vient de `PROSPECT_STATUS_META`
 * (couleurs pixel de §12.2, module pur partagé) — **ni le mapping ni
 * `status-meta.ts` ne sont touchés**.
 *
 * FORME (§2.4 / §2.6) : pill d'action `rounded-full`, filet 1px hérité du
 * statut, sérigraphie `.micro` (mono 11px uppercase +0.18em) et point
 * `bg-current` de 6px pour lire le statut d'un coup d'œil en tableau (la
 * couleur ne porte jamais le sens seule : le libellé est toujours présent).
 */

import type { ProspectStatus } from "@/lib/permissions";
import { PROSPECT_STATUS_META } from "@/lib/status-meta";
import { cn } from "@/lib/utils";

export type StatusBadgeProps = {
  /** Statut du prospect (enum DB, `@/lib/permissions`). */
  status: ProspectStatus;
  /** Libellé localisé déjà résolu par l'appelant (server) — jamais lu ici. */
  label: string;
  /** Classes additionnelles (positionnement, marge…) — les couleurs viennent du meta. */
  className?: string;
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const meta = PROSPECT_STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 micro",
        meta.text,
        meta.bg,
        meta.border,
        className,
      )}
    >
      {/* Point de repère en tableau — `currentColor` = couleur du statut. */}
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
