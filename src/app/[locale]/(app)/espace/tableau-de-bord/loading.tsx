import { Skeleton } from "@/components/ui/skeleton";

/**
 * Atheris — squelette de chargement de la page « Tableau de bord »
 * (FE-11 · T33).
 *
 * Composant **pur** (aucun dictionnaire, aucune session) : affiché par
 * Next.js pendant le rendu de la page server (`loading.tsx`). Purement
 * décoratif (`aria-busy` porte l'annonce, aucun texte en dur — un squelette
 * unique couvre les 4 branches de rôle).
 */
export default function DashboardLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {/* En-tête : titre de page. */}
      <Skeleton className="h-8 w-52 max-w-full" />

      {/* Section (files d'action / classement / relances). */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44 max-w-full" />
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border border-line bg-surface px-4 py-3"
          >
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        ))}
      </div>

      {/* Indicateurs (2 à 4 cartes selon le rôle). */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
