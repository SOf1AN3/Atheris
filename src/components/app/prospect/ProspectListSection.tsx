"use client";

/**
 * Atheris — section interactive de la page pipeline (FE-5 · T17).
 *
 * ============================================================================
 * PATTERN RSC RETENU — AUCUN FETCH CÔTÉ CLIENT (à lire avant toute évolution)
 * ----------------------------------------------------------------------------
 * 1. La **source de vérité des filtres est l'URL** (`?status=a,b&q=…`). C'est
 *    le hook `useProspectFilters` (FE-4) qui l'ÉCRIT, via
 *    `router.replace(path, { scroll: false })` — debounce 300 ms sur la
 *    recherche, immédiat sur les chips.
 * 2. Chaque écriture d'URL déclenche une **navigation RSC** : Next.js
 *    ré-exécute `src/app/[locale]/(app)/espace/prospects/page.tsx` (server),
 *    qui RELIT ses `searchParams`, rappelle `listProspects(…, viewer)` côté
 *    serveur (scoping sdr inclus) et **passe les nouveaux items en props**
 *    à ce composant au re-rendu.
 * 3. Ce composant ne fetch donc **jamais** (`fetch`, `useEffect` de requête,
 *    Server Action de lecture : rien). Il ne fait que :
 *    - `FilterBar` (état contrôlé par le hook) ;
 *    - le compteur de résultats (`dict.pipeline.filters.resultCount`, `{count}`
 *      remplacé **côté serveur** — un libellé formaté ne peut pas voyager en
 *      nombre dans la prop `resultCount` de `FilterBar`, qui n'affiche qu'un
 *      entier ; le texte localisé complet prime) ;
 *    - `PipelineTable` (items **déjà filtrés** par le serveur).
 * 4. `useProspectFilters` appelle `useSearchParams()` : la page server enveloppe
 *    ce composant dans `<Suspense>` (exigence Next 15, sinon build en échec
 *    sur le pré-rendu).
 */

import { FilterBar, type FilterBarLabels } from "@/components/app/FilterBar";
import {
  PipelineTable,
  type PipelineColumnLabels,
  type PipelineEmptyState,
  type PipelineRow,
} from "@/components/app/PipelineTable";
import { useProspectFilters } from "@/hooks/useProspectFilters";
import type { ProspectStatus } from "@/lib/permissions";

export type ProspectListSectionProps = {
  /** Lignes **déjà filtrées et pré-formatées** par la page server. */
  items: PipelineRow[];
  columnLabels: PipelineColumnLabels;
  /** `dict.statuses.prospect` (10 libellés, résolus server). */
  statusLabels: Record<ProspectStatus, string>;
  /** Libellés du champ de recherche / chips (résolus server). */
  filterLabels: FilterBarLabels;
  emptyState: PipelineEmptyState;
  /** Affiche la colonne « Relance » (`nextReminderAt`). */
  showReminder: boolean;
  /**
   * `dict.pipeline.filters.resultCount` avec `{count}` **déjà remplacé** côté
   * serveur : le texte localisé complet est affiché ici (rôle `status` +
   * `aria-live`), la prop numérique de `FilterBar` reste non passée pour ne
   * pas doubler l'annonce.
   */
  resultCountLabel: string;
};

export function ProspectListSection({
  items,
  columnLabels,
  statusLabels,
  filterLabels,
  emptyState,
  showReminder,
  resultCountLabel,
}: ProspectListSectionProps): React.JSX.Element {
  // État de filtre = URL (écriture seule via ce hook, lecture par la page).
  const { statuses, search, setSearch, setStatuses } = useProspectFilters();

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        selected={statuses}
        search={search}
        onStatusesChange={setStatuses}
        onSearchChange={setSearch}
        labels={filterLabels}
      />

      {/* Compteur : libellé i18n complet déjà interpolé côté serveur. */}
      <p
        role="status"
        aria-live="polite"
        className="text-xs font-medium tabular-nums text-muted"
      >
        {resultCountLabel}
      </p>

      <PipelineTable
        items={items}
        columnLabels={columnLabels}
        statusLabels={statusLabels}
        emptyState={emptyState}
        showReminder={showReminder}
      />
    </div>
  );
}
