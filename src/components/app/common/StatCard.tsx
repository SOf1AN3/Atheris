/**
 * Atheris — carte d'indicateur des tableaux de bord (FE-10 · T30/T31/T32 ·
 * DESIGN.md §12).
 *
 * Composant **pur** (aucun `"use client"`, aucun hook, zéro import i18n/DB) :
 * props 100 % sérialisables, `value` **déjà formatée côté serveur** par la
 * page appelante (montants USD, pourcentages, dates — aucun formatage côté
 * client, aucun décalage d'hydratation).
 *
 * ACCESSIBILITÉ : la couleur ne porte jamais le sens seul — le libellé reste
 * lisible quelle que soit la teinte, et la valeur est en `tabular-nums`
 * (alignement des chiffres).
 *
 * `tone` — **`accent` n'est jamais décoratif** : il est réservé à une valeur
 * ACTIVE (mesure en cours, état sélectionné, jauge remplie — sémaphore
 * DESIGN §2.3). Aucun indicateur statique ne doit l'utiliser : `neutral`
 * (défaut), `success` (réalisé / encaissé) et `danger` (sortie de
 * trésorerie / alerte) couvrent les cas des 4 dashboards.
 */

import { cn } from "@/lib/utils";

export type StatCardTone = "neutral" | "success" | "danger" | "accent";

export type StatCardProps = {
  /** Libellé court, déjà résolu côté serveur (dict ou repli listé). */
  label: string;
  /** Valeur **déjà formatée** (« $1,234.56 », « 12,3 % », « — »). */
  value: string;
  /** Sous-ligne facultative (précision, total secondaire…). */
  hint?: string;
  /** Sémantique de la valeur — voir l'en-tête du fichier. */
  tone?: StatCardTone;
};

const TONE_CLASSES: Record<StatCardTone, string> = {
  neutral: "text-fg",
  success: "text-success",
  danger: "text-danger",
  accent: "text-accent",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: StatCardProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-5">
      {/* Style `micro` §12.3 : 12px/500 uppercase, `muted`. */}
      <p className="text-[12px] font-medium uppercase tracking-[0.02em] text-muted">{label}</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums tracking-[-0.015em]",
          TONE_CLASSES[tone],
        )}
      >
        {value}
      </p>
      {hint !== undefined ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
