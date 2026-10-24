import { Skeleton } from "@/components/ui/skeleton";

/**
 * Atheris — squelette de chargement du portail client « Projet »
 * (FE-11 · T33).
 *
 * Composant **pur** (aucun dictionnaire, aucune session) : affiché par
 * Next.js pendant le rendu de la page server (`loading.tsx`). Purement
 * décoratif (`aria-busy` porte l'annonce, aucun texte en dur).
 */
export default function ProjetLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      {/* En-tête : nom du projet + badge statut. */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>

      {/* Rail d'onglets (4). */}
      <Skeleton className="h-11 w-full max-w-md rounded-xl" />

      {/* Panneau actif : timeline de jalons (empilée en mobile). */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
