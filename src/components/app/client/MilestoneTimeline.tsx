"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { clientValidateMilestone } from "@/actions/client";
import type { MilestoneKey, MilestoneStatus } from "@/actions/project";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props (sérialisables : labels résolus server-side, dates pré-formatées).
// ---------------------------------------------------------------------------

/** Une étape de la timeline, adaptée depuis `ProjectOverviewMilestone`. */
export type TimelineMilestone = {
  key: MilestoneKey;
  status: MilestoneStatus;
  order: number;
  /** `statuses.milestone[key]` résolu côté serveur (frontière RSC). */
  label: string;
  /** `validatedAt` formaté côté serveur (`Africa/Algiers`) ; `null` si non validé. */
  validatedAtLabel: string | null;
};

/** Libellés i18n requis, tous en chaînes (sérialisables). */
export type MilestoneTimelineLabels = {
  /** `client.milestones` — titre de la timeline. */
  title: string;
  /** `client.validateStep` — bouton de validation. */
  validateStep: string;
  /** `client.validateConfirm` — titre du ConfirmDialog. */
  validateConfirm: string;
  /** `common.cancel` — annulation du ConfirmDialog. */
  cancel: string;
  /** `common.retry` — toast d'échec / conflit optimiste. */
  retry: string;
  /**
   * Libellés des 3 états de jalon — `dict.statuses.milestoneStatus`
   * (`en_attente` / `en_cours` / `valide`), résolus côté serveur par la page
   * `espace/projet` (jamais de littéral ici).
   */
  statusLabels: Record<MilestoneStatus, string>;
};

type MilestoneTimelineProps = {
  /** uuid du projet (revalidé par le Zod de l'action). */
  projectId: string;
  /** Texte brut du projet (`en_livraison` | `clos`) — conditionne le bouton. */
  projectStatus: string;
  /** Jalons triés `order ASC` côté serveur. */
  milestones: TimelineMilestone[];
  labels: MilestoneTimelineLabels;
};

// ---------------------------------------------------------------------------
// Styles des pastilles (DESIGN §4.7 — pastille 40px, filet `line`).
// ---------------------------------------------------------------------------

const PASTILLE_BASE =
  "z-10 flex size-10 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold";

const PASTILLE_BY_STATUS: Record<MilestoneStatus, string> = {
  valide: "border-success/40 bg-success/10 text-success",
  en_cours: "border-accent bg-accent text-ink",
  en_attente: "border-line bg-surface text-muted",
};

function CheckIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

export function MilestoneTimeline({
  projectId,
  projectStatus,
  milestones,
  labels,
}: MilestoneTimelineProps): ReactNode {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<MilestoneKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function confirmValidation(): Promise<void> {
    if (pendingKey === null || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await clientValidateMilestone({
        projectId,
        milestoneKey: pendingKey,
      });

      if (result.ok) {
        setPendingKey(null);
        // Re-fetch RSC : la timeline (jalons + bouton) et les onglets
        // reflètent le nouvel état sans rechargement plein.
        router.refresh();
        return;
      }

      setPendingKey(null);
      if (result.code === "conflict") {
        // Validation concurrente (CEO + client) : vue obsolète → re-fetch.
        router.refresh();
      }
      // `invalid` (séquence non sautable) et `conflict` → toast générique.
      toast.error(labels.retry);
    } catch {
      // Erreur d'infra (action propagée en 500) : message générique.
      toast.error(labels.retry);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="milestone-timeline-title" className="flex flex-col gap-6">
      <h2
        id="milestone-timeline-title"
        className="text-lg font-semibold tracking-[-0.015em] text-fg"
      >
        {labels.title}
      </h2>

      {/* Un seul `<ol>` responsive (mobile vertical / desktop horizontal) :
          pas de doublon sémantique pour les lecteurs d'écran. */}
      <ol className="flex flex-col md:grid md:grid-cols-5 md:items-start md:gap-4">
        {milestones.map((milestone, index) => {
          const isLast = index === milestones.length - 1;
          const canValidate =
            milestone.status === "en_cours" && projectStatus === "en_livraison";

          return (
            <li
              key={milestone.key}
              aria-current={milestone.status === "en_cours" ? "step" : undefined}
              className="relative flex gap-4 pb-8 last:pb-0 md:flex-col md:items-center md:gap-3 md:pb-0 md:text-center"
            >
              {/* Filet vertical (mobile) : du bas de la pastille au début de
                  l'étape suivante — centré sur l'axe des pastilles (20px) ;
                  `md:hidden` seul (un `hidden` de base le masquerait PARTOUT). */}
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className="absolute left-5 top-10 bottom-0 w-px -translate-x-1/2 bg-line md:hidden"
                />
              ) : null}
              {/* Filet horizontal (desktop) : du bord droit de la pastille au
                  bord gauche de la suivante — `right: calc(-50% + 4px)`
                  compense l'écart de grille (`md:gap-4` = 16px) et le rayon
                  (20px) : 0,5 W (colonne suivante) + 16 − 20 = exactement le
                  bord de la prochaine pastille. */}
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[calc(50%+20px)] right-[calc(-50%+4px)] top-5 hidden h-px bg-line md:block"
                />
              ) : null}

              <span
                className={cn(PASTILLE_BASE, PASTILLE_BY_STATUS[milestone.status])}
              >
                {milestone.status === "valide" ? (
                  <CheckIcon />
                ) : (
                  <span aria-hidden="true">{milestone.order}</span>
                )}
                {/* A11y : la couleur seule ne suffit pas (DESIGN §6.7). */}
                <span className="sr-only">{labels.statusLabels[milestone.status]}</span>
              </span>

              <div className="flex min-w-0 flex-col gap-0.5 md:items-center">
                <span className="text-[15px] font-semibold text-fg">
                  {milestone.label}
                </span>
                <span className="text-[13px] text-muted">
                  {milestone.validatedAtLabel !== null
                    ? milestone.validatedAtLabel
                    : labels.statusLabels[milestone.status]}
                </span>

                {/* Validation : étape en cours + projet encore en livraison
                    (un projet clos ne débloque plus rien — décision Lead). */}
                {canValidate ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 md:self-center"
                    onClick={() => {
                      setPendingKey(milestone.key);
                    }}
                  >
                    {labels.validateStep}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* ConfirmDialog unique (clé de jalon en attente de confirmation). */}
      <Dialog
        open={pendingKey !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setPendingKey(null);
        }}
      >
        <DialogContent aria-label={labels.validateConfirm}>
          <DialogHeader>
            <DialogTitle>{labels.validateConfirm}</DialogTitle>
            <DialogDescription>
              {milestones.find((milestone) => milestone.key === pendingKey)?.label ??
                labels.title}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setPendingKey(null);
              }}
              disabled={isSubmitting}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => {
                void confirmValidation();
              }}
            >
              {labels.validateStep}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
