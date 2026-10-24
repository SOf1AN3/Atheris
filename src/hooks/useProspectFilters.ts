/**
 * Atheris — filtres du pipeline pilotés par l'URL (FE-4 · T16).
 *
 * Le hook est la **seule source d'écriture** des paramètres `?status=` et
 * `?q=` ; la page server (FE-5) relit les mêmes params (`searchParams`) pour
 * appeler `listProspects` **côté serveur** — le composant `PipelineTable` ne
 * filtre donc jamais lui-même.
 *
 * PROTOCOLE D'ÉCRITURE :
 * - `setSearch`   → **debounce 300 ms** (timer local, flush au unmount) ;
 * - `setStatuses` → **immédiat** (clic d'un chip = une action utilisateur) ;
 * - écriture via `router.replace(…, { scroll: false })` — **CHOIX DOCUMENTÉ** :
 *   `replace` et non `push`, pour ne jamais polluer l'historique (chaque
 *   keystroke génère sinon une entrée). Consévenue assumée : le retour
 *   arrière **quitte** la page plutôt que de défiler les états de filtre —
 *   l'URL restant partageable/actualisable, l'« annulation » se fait par le
 *   bouton « Réinitialiser » (`clear`). `?status=` (action explicite) reste
 *   lui aussi en `replace` : garder une sémantique unique pour les deux
 *   paramètres évite un historique mi-push mi-remplace difficile à prédire.
 *
 * ROBUSTESSE URL : toute valeur hors des 10 statuts est **ignorée** au
 * parsing (l'URL peut être forgée) ; la liste retournée respecte
 * `STATUS_ORDER` et sans doublon.
 *
 * NOTE POUR FE-5 (pages) : `useSearchParams()` doit être descendu dans un
 * composant rendu sous un `<Suspense>` dans toute page susceptible d'être
 * pré-rendue (exigence Next 15 — « useSearchParams() should be wrapped in a
 * suspense boundary »), sinon `next build` échoue sur les pages statiques.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProspectStatus } from "@/lib/permissions";
import { STATUS_ORDER } from "@/lib/status-meta";

/** Délai du debounce sur la recherche (ms). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Garde runtime sur l'URL forgée : les valeurs admises sont exactement celles
 * de `STATUS_ORDER` (les 10 `ProspectStatus`), typées en `string` pour un
 * test sans `as` sur des entrées arbitraires.
 */
const VALID_STATUS_VALUES: ReadonlySet<string> = new Set<string>(STATUS_ORDER);

/** Longueur max de `q` — alignée sur `listFiltersSchema` (`@/actions/prospects`). */
const MAX_SEARCH_LENGTH = 120;

/**
 * Parse `?status=a,b` : ignore toute valeur inconnue, déduplique, et renvoie
 * dans l'ordre canonique `STATUS_ORDER` (déterministe pour l'affichage).
 */
function parseStatuses(raw: string | null): ProspectStatus[] {
  if (raw === null || raw.length === 0) return [];
  const requested = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (VALID_STATUS_VALUES.has(value)) {
      requested.add(value);
    }
  }
  return STATUS_ORDER.filter((status) => requested.has(status));
}

export type ProspectFilters = {
  /** Statuts sélectionnés, parsés depuis `?status=` (valeurs inconnues ignorées). */
  statuses: ProspectStatus[];
  /** Texte de recherche courant (`?q=`), immédiat côté champ contrôlé. */
  search: string;
  /** Écrit `?q=` dans l'URL **avec debounce 300 ms** (flush au unmount). */
  setSearch: (value: string) => void;
  /** Écrit `?status=` dans l'URL **immédiatement** (remplace la sélection). */
  setStatuses: (next: ProspectStatus[]) => void;
  /** Supprime `?status=` et `?q=` d'un seul geste (annule aussi le debounce). */
  clear: () => void;
  /** `true` si au moins un filtre est actif (statut OU recherche non vide). */
  hasFilters: boolean;
};

/**
 * Filtres du pipeline synchronisés sur l'URL (`?status=` + `?q=`).
 *
 * @example
 * const { statuses, search, setStatuses, setSearch, clear, hasFilters } =
 *   useProspectFilters();
 */
export function useProspectFilters(): ProspectFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- État dérivé de l'URL (source de vérité) -----------------------------
  const statuses = useMemo(
    () => parseStatuses(searchParams.get("status")),
    [searchParams],
  );
  const urlSearch = searchParams.get("q") ?? "";

  // --- État local du champ (optimiste pendant le debounce) -----------------
  const [search, setSearchState] = useState<string>(urlSearch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSearchRef = useRef<string | null>(null);

  /** Construit la prochaine URL : mutate les params, `replace` sans scroll. */
  const writeUrl = useCallback(
    (mutate: (params: URLSearchParams) => void): void => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const query = params.toString();
      router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  /** Annule le timer debounce en cours (sans écrire) et consomme l'attente. */
  const takePendingSearch = useCallback((): string | null => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingSearchRef.current;
    pendingSearchRef.current = null;
    return pending;
  }, []);

  /** Applique une valeur de recherche à `params` (vide = suppression). */
  const applySearchToParams = useCallback(
    (params: URLSearchParams, value: string): void => {
      if (value.trim().length === 0) {
        params.delete("q");
      } else {
        params.set("q", value.slice(0, MAX_SEARCH_LENGTH));
      }
    },
    [],
  );

  const setSearch = useCallback(
    (value: string): void => {
      setSearchState(value);
      pendingSearchRef.current = value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingSearchRef.current;
        pendingSearchRef.current = null;
        if (pending === null) return;
        writeUrl((params) => applySearchToParams(params, pending));
      }, SEARCH_DEBOUNCE_MS);
    },
    [applySearchToParams, writeUrl],
  );

  const setStatuses = useCallback(
    (next: ProspectStatus[]): void => {
      // Une écriture de statut « plie » la recherche en attente dans la même
      // URL : aucun keystroke n'est perdu, une seule navigation est émise.
      const pendingSearch = takePendingSearch();
      const deduped = next.filter(
        (status, index) =>
          VALID_STATUS_VALUES.has(status) && next.indexOf(status) === index,
      );
      writeUrl((params) => {
        if (pendingSearch !== null) {
          applySearchToParams(params, pendingSearch);
        }
        if (deduped.length === 0) {
          params.delete("status");
        } else {
          params.set("status", deduped.join(","));
        }
      });
    },
    [applySearchToParams, takePendingSearch, writeUrl],
  );

  const clear = useCallback((): void => {
    takePendingSearch();
    setSearchState("");
    writeUrl((params) => {
      params.delete("status");
      params.delete("q");
    });
  }, [takePendingSearch, writeUrl]);

  // Flush au unmount : si une saisie est en cours de debounce au moment du
  // départ, on force son écriture (dernier état = URL finale cohérente).
  const flushOnUnmountRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushOnUnmountRef.current = (): void => {
      const pending = takePendingSearch();
      if (pending === null) return;
      writeUrl((params) => applySearchToParams(params, pending));
    };
  }, [applySearchToParams, takePendingSearch, writeUrl]);
  useEffect(() => {
    return () => {
      flushOnUnmountRef.current();
    };
  }, []);

  // Resynchronisation depuis l'URL (clear, retour/avant du navigateur,
  // autre composant écrivant les mêmes params) — sauf pendant une fenêtre de
  // debounce, où l'état local prime (l'URL n'a pas encore été écrite).
  useEffect(() => {
    if (timerRef.current === null) {
      setSearchState(urlSearch);
    }
  }, [urlSearch]);

  return {
    statuses,
    search,
    setSearch,
    setStatuses,
    clear,
    hasFilters: statuses.length > 0 || search.trim().length > 0,
  };
}
