import { Skeleton } from "@/components/ui/skeleton";

/**
 * Atheris — squelette de chargement de la fiche prospect (FE-5 · T18).
 *
 * Composant **pur** (aucun dictionnaire, aucune session) : affiché par
 * Next.js pendant le rendu de la page server (`loading.tsx`), donc aussi
 * pendant chaque `router.refresh()` issu d'un changement de statut.
 * Purement décoratif (`aria-busy` porte l'annonce, aucun texte en dur).
 */
export default function ProspectDetailLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {/* En-tête : nom + entreprise + badge + actions. */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-40 max-w-full" />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-7 w-28 rounded-lg" />
          <Skeleton className="h-11 w-40 rounded-xl" />
        </div>
      </div>

      {/* Rail d'onglets (4). */}
      <Skeleton className="h-11 w-full max-w-md rounded-xl" />

      {/* Panneau actif : lignes de contenu. */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
