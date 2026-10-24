"use client";

/**
 * Atheris — tableau du pipeline commercial (FE-4 · T16 · DESIGN.md §12.3).
 *
 * ============================================================================
 * CONTRAT POUR FE-5 (page server) — à lire avant consommation :
 * ----------------------------------------------------------------------------
 * 1. **Frontière RSC** : aucune fonction ne traverse server → client. Toutes
 *    les props ci-dessous sont des données sérialisables ; les libellés
 *    (`columnLabels`, `statusLabels`, `emptyState`) sont résolus côté serveur
 *    depuis `dict.pipeline.*` / `dict.statuses.prospect` (FR/EN).
 * 2. **`PipelineRow`** = `ProspectListItem` + 3 champs **pré-formatés par la
 *    page server** (elle détient la locale via `Intl`) :
 *    - `dateLabel`    → « Dernière activité » déjà formatée (`updatedAt`) ;
 *    - `companyLabel` → entreprise déjà résolue (`—` si `company === null`) ;
 *    - `href`         → lien de la fiche **déjà préfixé par la locale**
 *                       (ex. `/fr/espace/prospects/{id}`).
 *    Le composant ne formate donc aucune date et ne construit aucun chemin.
 * 3. **Ce composant ne filtre pas.** Le filtrage/tri/pagination sont faits
 *    **côté serveur** dans `listProspects` (`@/actions/prospects`), pilotés
 *    par les `searchParams` lus par `useProspectFilters` (hook URL) puis
 *    transmis à la page server. `items` = déjà filtrés.
 * 4. `PipelineTableSkeleton` est exporté pour le chargement initial
 *    (`loading.tsx` ou `Suspense` de la page).
 */

import { Inbox } from "lucide-react";
import Link from "next/link";

import type { ProspectListItem } from "@/actions/prospects";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProspectStatus } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Une ligne du pipeline : données DB + formatage/locale pré-resolus par la page. */
export type PipelineRow = ProspectListItem & {
  /** Date de `updatedAt` déjà formatée pour la locale (jamais de `Date` à lire). */
  dateLabel: string;
  /** Lien de la fiche prospect, **préfixé par la locale** côté serveur. */
  href: string;
  /** Entreprise déjà résolue (`"—"` si `company === null`) — aucun fallback client. */
  companyLabel: string;
  /**
   * Date de relance (`nextReminderAt`) pré-formatée par la page server —
   * **champ ADDITIF optionnel** au contrat minimal de FE-4 : recommandé à la
   * page (elle a la locale). Si absent, repli déterministe `YYYY-MM-DD`
   * calculé depuis l'ISO (stable côté serveur/client, aucun décalage
   * d'hydratation, aucune locale fantôme).
   */
  reminderLabel?: string | null;
};

/** Libellés de colonnes, résolus dans `dict.pipeline.columns` côté serveur. */
export type PipelineColumnLabels = {
  name: string;
  status: string;
  source: string;
  lastActivity: string;
  reminder: string;
};

/** État vide, résolu côté serveur (`dict.common.noData` + CTA éventuel). */
export type PipelineEmptyState = {
  title: string;
  description: string;
  /** Libellé du CTA (masqué si absent ou si `ctaHref` manquant). */
  ctaLabel?: string;
  /** Cible du CTA (masquée si absente). */
  ctaHref?: string;
};

export type PipelineTableProps = {
  /** Lignes **déjà filtrées** par la page server (voir contrat ci-dessus). */
  items: PipelineRow[];
  columnLabels: PipelineColumnLabels;
  /** `dict.statuses.prospect` (les 10 libellés, résolus côté serveur). */
  statusLabels: Record<ProspectStatus, string>;
  emptyState: PipelineEmptyState;
  /** Affiche la colonne/ligne « Relance » (`nextReminderAt`). */
  showReminder: boolean;
  /**
   * Interdit : la comparaison de retard se fait côté client au rendu
   * (`new Date(nextReminderAt) < new Date()`), aucun libellé « maintenenant »
   * n'est requis. Présent pour figer le contrat (FE-5 : ne jamais le passer).
   */
  nowLabel?: never;
};

/** Lien de ligne : focus clavier visible + survol sans décoration. */
const ROW_LINK_CLASSES =
  "inline-flex flex-col rounded-md text-[15px] font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Date de relance : rouge si dépassée « au jugé client » (horloge navigateur). */
function reminderClasses(isOverdue: boolean): string {
  return cn(
    "tabular-nums",
    isOverdue ? "font-semibold text-danger" : "text-muted",
  );
}

/**
 * Libellé de la colonne « Relance » : `reminderLabel` pré-formaté par la page
 * server si fourni, sinon repli déterministe `YYYY-MM-DD` (ISO stable, pas de
 * dépendance à la locale navigateur → pas de décalage d'hydratation).
 *
 * @param at - `nextReminderAt` déjà nulé-verified par l'appelant.
 */
function reminderDateLabel(item: PipelineRow, at: Date): string {
  if (item.reminderLabel) return item.reminderLabel;
  return at.toISOString().slice(0, 10);
}

export function PipelineTable({
  items,
  columnLabels,
  statusLabels,
  emptyState,
  showReminder,
}: PipelineTableProps) {
  // ---------------------------------------------------------------- état vide
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-16 text-center">
        <Inbox aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
        <p className="text-[15px] font-semibold text-fg">{emptyState.title}</p>
        <p className="max-w-sm text-sm text-muted">{emptyState.description}</p>
        {emptyState.ctaLabel !== undefined && emptyState.ctaHref !== undefined ? (
          <Button variant="secondary" size="sm" href={emptyState.ctaHref}>
            {emptyState.ctaLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {/* ------------------------------------------------- Desktop (≥ md) --- */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {/* §12.3 : en-tête `micro` 12px/500 uppercase #94A3B8 (déjà le
                  défaut de `TableHead`). Bordures `line` = défaut posé par la
                  couche `base` de globals.css. */}
              <TableHead className="w-[28%]">{columnLabels.name}</TableHead>
              <TableHead>{columnLabels.status}</TableHead>
              <TableHead>{columnLabels.source}</TableHead>
              <TableHead>{columnLabels.lastActivity}</TableHead>
              {showReminder ? <TableHead>{columnLabels.reminder}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const reminderAt = item.nextReminderAt;
              const isOverdue =
                reminderAt !== null && new Date(reminderAt) < new Date();

              return (
                // Ligne accessible : hover `ink-2` porté par `TableRow`
                // (§12.3) — aucun `onClick` sur `<tr>` ; la navigation vit
                // dans le `<Link>` de la première cellule (focus clavier OK).
                <TableRow key={item.id}>
                  <TableCell>
                    {/* Liseré accent au focus du lien : indicateur d'état
                        actif autorisé §2.3 (variante sobre §12.3). */}
                    <Link href={item.href} className={ROW_LINK_CLASSES}>
                      {item.fullName}
                      <span className="mt-0.5 text-xs font-medium text-faint">
                        {item.companyLabel}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={item.status}
                      label={statusLabels[item.status]}
                    />
                  </TableCell>
                  {/* Source : badge neutre (§12.3 — ni couleur ni décor). */}
                  <TableCell>
                    <span className="inline-flex items-center whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2.5 py-[5px] text-xs font-medium text-muted">
                      {item.source}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted">
                    {item.dateLabel}
                  </TableCell>
                  {showReminder ? (
                    // Relance : date + teinte danger si dépassée « au jugé
                    // client » (horloge navigateur, aucun flux temps réel).
                    <TableCell
                      className={cn("text-sm", reminderClasses(isOverdue))}
                      // Le retard n'est jamais porté par la seule couleur
                      // (WCAG 1.4.1) : le texte reste lisible et la page
                      // pourra ajouter un libellé i18n dédié plus tard.
                      data-overdue={isOverdue ? "true" : undefined}
                    >
                      {reminderAt !== null ? reminderDateLabel(item, reminderAt) : "—"}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ------------------------------------------------- Mobile (< md) ---- */}
      {/* Cartes empilées : même `href`, zéro scroll horizontal. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => {
          const reminderAt = item.nextReminderAt;
          const isOverdue =
            reminderAt !== null && new Date(reminderAt) < new Date();

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold text-fg">
                      {item.fullName}
                    </span>
                    <span className="mt-0.5 truncate text-xs font-medium text-faint">
                      {item.companyLabel}
                    </span>
                  </span>
                  <StatusBadge
                    status={item.status}
                    label={statusLabels[item.status]}
                    className="shrink-0"
                  />
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {item.dateLabel}
                </span>
                {showReminder && reminderAt !== null ? (
                  <span
                    className={cn("text-xs", reminderClasses(isOverdue))}
                    data-overdue={isOverdue ? "true" : undefined}
                  >
                    {reminderDateLabel(item, reminderAt)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Squelette de chargement (5 lignes `surface-2` animées) — à monter dans le
 * `loading.tsx` / `<Suspense>` de la page pipeline (FE-5). Purement
 * décoratif : `aria-hidden`, l'annonce de chargement est portée par la page.
 */
export function PipelineTableSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-4"
        >
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-24 rounded-lg" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}
