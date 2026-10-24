/**
 * Atheris — badge de statut prospect (FE-4 · T16 · DESIGN.md §12.2).
 *
 * Composant **pur** (aucun hook, aucun `"use client"` requis) : utilisable
 * depuis un Server Component ou un Client Component — ses props
 * (`status: string`, `label: string`) sont entièrement sérialisables.
 *
 * Le libellé est **résolu côté serveur** (`dict.statuses.prospect[status]`,
 * FR/EN) puis passé en prop : ce composant ne lit jamais le dictionnaire et
 * reste i18n-agnostique. Le habillage vient de `PROSPECT_STATUS_META`
 * (couleurs pixel de §12.2, module pur partagé).
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
      // Format commun §12.2 : radius-sm 8px (`rounded-lg`), 12px/600,
      // padding 5px 10px (`px-2.5 py-[5px]`), fond teinte 12 % + bordure 25 %.
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-lg border px-2.5 py-[5px] text-xs font-semibold",
        meta.text,
        meta.bg,
        meta.border,
        className,
      )}
    >
      {label}
    </span>
  );
}
