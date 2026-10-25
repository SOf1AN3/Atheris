/**
 * Atheris — carte d'indicateur des tableaux de bord (FE-10 · T30/T31/T32 ·
 * DESIGN.md « OBSIDIAN INSTRUMENT »).
 *
 * Composant **pur** (aucun `"use client"`, aucun hook, zéro import i18n/DB) :
 * props 100 % sérialisables, `value` **déjà formatée côté serveur** par la
 * page appelante (montants USD, pourcentages, dates — aucun formatage côté
 * client, aucun décalage d'hydratation).
 *
 * ACCESSIBILITÉ : la couleur ne porte jamais le sens seul — le libellé reste
 * lisible quelle que soit la teinte, et la valeur est en `tabular-nums`
 * (alignement des chiffres). Contrastes : `fg` 18.9:1, `success` et `danger`
 * ≥ 4.5:1 sur `surface` (§2.7).
 *
 * HABILLAGE (§2.4 / §2.6) : carte `border border-line bg-surface
 * rounded-[20px]`, hover `border-line-2` (200ms, courbe unique). Label en
 * `.micro text-faint` (mono 11px uppercase +0.18em), valeur en
 * `clamp(1.75rem, 3vw, 2.5rem)` sémantique `fg`.
 *
 * `tone` — **`accent` n'est jamais décoratif** : il est réservé à la valeur
 * CLÉ de l'écran (DESIGN §2.1 — **une seule** valeur KPI en volt par écran,
 * tous les autres chiffres restant en `text-fg`). Sémantique de mesure :
 * `neutral` (défaut), `success` (réalisé / encaissé), `danger` (sortie de
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

/** Repos = `text-fg` ; seuls `success` / `danger` / `accent` (volt) sortent. */
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
    <div className="flex flex-col rounded-[20px] border border-line bg-surface p-5 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-line-2 md:p-6">
      {/* Micro-label : `.micro` (mono 11px, uppercase, +0.18em) — §2.2. */}
      <p className="micro text-faint">{label}</p>
      <p
        className={cn(
          "mt-2 text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tabular-nums tracking-[-0.03em]",
          TONE_CLASSES[tone],
        )}
      >
        {value}
      </p>
      {hint !== undefined ? (
        <p className="mt-4 border-t border-line pt-4 text-[13px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
