import { Skeleton } from "@/components/ui/skeleton";

/**
 * Atheris — squelette de chargement de la page « Commissions » (FE-11 · T33).
 *
 * Composant **pur** (aucun dictionnaire, aucune session) : affiché par
 * Next.js pendant le rendu de la page server (`loading.tsx`). Purement
 * décoratif (`aria-busy` porte l'annonce, aucun texte en dur — la vue est
 * triple vendeur/CEO/manager, un squelette unique couvre les trois).
 */
export default function CommissionsLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {/* En-tête : titre de page. */}
      <Skeleton className="h-8 w-56 max-w-full" />

      {/* Jauge de palier (vendeur) ou carte de total (CEO/manager). */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>

      {/* File (CEO) / registre (vendeur) : cartes empilées. */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40 max-w-[60%]" />
              <Skeleton className="h-6 w-20 rounded-lg" />
            </div>
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
