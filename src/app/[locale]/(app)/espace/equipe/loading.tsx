import { Skeleton } from "@/components/ui/skeleton";

/**
 * Atheris — squelette de chargement de la page « Équipe » (FE-11 · T33).
 *
 * Composant **pur** (aucun dictionnaire, aucune session) : affiché par
 * Next.js pendant le rendu de la page server (`loading.tsx`). Purement
 * décoratif (`aria-busy` porte l'annonce, aucun texte en dur).
 */
export default function EquipeLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {/* En-tête : titre de page. */}
      <Skeleton className="h-8 w-44 max-w-full" />

      {/* Section « Candidatures » : cartes empilées. */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40 max-w-[60%]" />
              <Skeleton className="h-6 w-20 rounded-lg" />
            </div>
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
        ))}
      </div>

      {/* Section « Par employé » : lignes de tableau. */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-36 max-w-full" />
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
