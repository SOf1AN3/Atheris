"use client";

/**
 * Atheris — barre de filtres du pipeline (FE-4 · T16 · DESIGN.md §3.5 §3.6).
 *
 * Composant **présentationnel contrôlé** : il ne détient aucun état de filtre
 * et n'écrit jamais l'URL lui-même. Toutes les props sont **sérialisables**
 * (pas de fonction venue du server) ; les callbacks `onStatusesChange` /
 * `onSearchChange` sont fournis **côté client**, typiquement depuis le hook
 * `useProspectFilters` (debounce de la recherche inclus dans le hook — le
 * champ ici est simplement contrôlé).
 *
 * Les libellés viennent du dictionnaire plateforme, résolus côté serveur et
 * passés en prop (`labels`) — ce composant n'importe jamais `@/i18n/*`.
 */

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import type { ProspectStatus } from "@/lib/permissions";
import { STATUS_ORDER } from "@/lib/status-meta";
import { cn } from "@/lib/utils";

/** Libellés i18n résolus côté serveur (toutes les props restent sérialisables). */
export type FilterBarLabels = {
  /** `dict.pipeline.filters.allStatuses` — chip « tout désélectionner ». */
  allStatuses: string;
  /** `dict.pipeline.filters.searchPlaceholder`. */
  searchPlaceholder: string;
  /** `dict.pipeline.filters.clearFilters`. */
  clearFilters: string;
  /** `dict.statuses.prospect` (les 10 libellés, indexés sur les valeurs DB). */
  statusLabels: Record<ProspectStatus, string>;
};

export type FilterBarProps = {
  /** Statuts sélectionnés (lecture seule : la sélection vit dans l'URL). */
  selected: readonly ProspectStatus[];
  /** Texte de recherche contrôlé (le debounce vit dans le hook). */
  search: string;
  /** Remplace la sélection de statuts (chip `Tous` → `[]`, sinon toggle). */
  onStatusesChange: (statuses: ProspectStatus[]) => void;
  /** Met à jour la recherche (le hook debounce l'écriture URL). */
  onSearchChange: (value: string) => void;
  /** Libellés i18n (props sérialisables — jamais de fonction). */
  labels: FilterBarLabels;
  /** Nombre de résultats — affiché en `aria-live="polite"` si fourni. */
  resultCount?: number;
};

/**
 * Chips statut — §3.5 : actif = fond accent plein + texte blanc ; inactif =
 * fond `surface`, bordure `line`, texte `muted` → `fg` au survol.
 * `min-h-11` (44px) = cible tactile mobile (WCAG 2.5.5).
 */
function chipClasses(isActive: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-4 text-sm transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    isActive
      ? "border border-accent bg-accent font-semibold text-ink"
      : "border border-line bg-surface font-medium text-muted hover:text-fg",
  );
}

export function FilterBar({
  selected,
  search,
  onStatusesChange,
  onSearchChange,
  labels,
  resultCount,
}: FilterBarProps) {
  const hasFilters = selected.length > 0 || search.trim().length > 0;

  /** Toggle d'un chip : retire s'il est déjà sélectionné, sinon l'ajoute. */
  function toggleStatus(status: ProspectStatus): void {
    onStatusesChange(
      selected.includes(status)
        ? selected.filter((value) => value !== status)
        : [...selected, status],
    );
  }

  return (
    <section
      aria-label={labels.allStatuses}
      className="flex flex-col gap-4"
    >
      {/* Groupe de chips multi-sélection (role group + aria-pressed). */}
      <div role="group" aria-label={labels.allStatuses} className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={selected.length === 0}
          onClick={() => onStatusesChange([])}
          className={chipClasses(selected.length === 0)}
        >
          {labels.allStatuses}
        </button>
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={selected.includes(status)}
            onClick={() => toggleStatus(status)}
            className={chipClasses(selected.includes(status))}
          >
            {labels.statusLabels[status]}
          </button>
        ))}
      </div>

      {/* Recherche contrôlée (debounce 300 ms côté hook) + réinitialisation. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <label htmlFor="pipeline-search" className="sr-only">
            {labels.searchPlaceholder}
          </label>
          <Input
            id="pipeline-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="h-11 pl-9"
          />
        </div>

        {hasFilters ? (
          // `Button` landing (seul `Button` du projet, DESIGN §12.0) : la
          // variante ghost y ajoute une flèche décorative → masquée ici
          // (« Réinitialiser » est une action interne, pas un lien de sortie).
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onStatusesChange([]);
              onSearchChange("");
            }}
            className="[&>span]:hidden"
          >
            <X aria-hidden="true" className="size-4" />
            {labels.clearFilters}
          </Button>
        ) : null}

        {resultCount !== undefined ? (
          <span
            role="status"
            aria-live="polite"
            className="text-xs font-medium tabular-nums text-muted"
          >
            {resultCount}
          </span>
        ) : null}
      </div>
    </section>
  );
}
