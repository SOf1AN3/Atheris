"use client";

/**
 * Atheris — assistant fiche projet en 5 étapes (FE-6 · T19).
 *
 * Composant CLIENT **sans aucune string affichable** : étapes, jauge, boutons,
 * champs et messages proviennent tous de `labels`, résolus côté serveur par
 * `src/app/[locale]/(app)/espace/prospects/[id]/fiche/page.tsx` (le
 * dictionnaire ne franchit jamais la frontière RSC).
 *
 * WIZARD À ÉTAT REACT SIMPLE (RHF+Zod inutiles ici : pas de formulaire
 * soumis, juste une navigation entre 5 panneaux) :
 * - `values`  = brouillon courant (par bloc) ;
 * - `baseline` = dernier état **enregistré** (comparaison `JSON.stringify`
 *   pour le dirty-check) ;
 * - quitter une étape **dirty** appelle `saveBriefBlock` ; succès → toast
 *   `saved` + `baseline` mise à jour ; échec → toast `retry` et **on reste sur
 *   l'étape** (zéro perte de saisie).
 *
 * Jauge : `completed / 5` (valeur renvoyée par le serveur après recompute),
 * barre `h-1.5` `bg-surface` + jauge `bg-accent` (accent = indicateur d'état
 * actif, DESIGN §2.3), texte `gaugeTemplate.replace("{done}", …)`.
 *
 * `readOnly` (vendeur) : champs désactivés, bandeau de lecture seule, aucun
 * bouton d'enregistrement ni de navigation par étapes (le rail reste
 * cliquable : il sert à CONSULTER les 5 blocs, pas à les modifier).
 *
 * `viewer` ({ id, role }) est chargé en session côté serveur (contrat C-5 :
 * jamais une valeur montée par l'utilisateur — `saveBriefBlock` revalide
 * uuid + rôle de toute façon).
 */

import { useState } from "react";
import { toast } from "sonner";

import { saveBriefBlock } from "@/actions/prospects";
import { BriefStepPanel, type BriefBlockKey, type BriefFieldLabel } from "@/components/app/prospect/brief-steps";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Une étape de l'assistant, libellée côté serveur (ordre canonique). */
export type BriefStepLabel = {
  key: BriefBlockKey;
  title: string;
  description: string;
};

/** Tous les libellés du wizard — résolus server, 100 % sérialisables. */
export type BriefWizardLabels = {
  steps: BriefStepLabel[];
  /** Template de jauge du dict (`"{done}/{total}"`), placeholders remplacés. */
  gaugeTemplate: string;
  /** Message affiché quand les 5 blocs sont renseignés. */
  ready: string;
  save: string;
  saving: string;
  saved: string;
  /** Repli d'erreur (toast après un échec de sauvegarde). */
  retry: string;
  next: string;
  previous: string;
  backToProspect: string;
  /** Validation client des blocs `context` / `need`. */
  requiredError: string;
  /** Bandeau de lecture seule (rôle `vendeur`). */
  readOnlyNotice: string;
  /** Lecture seule : aucun bouton d'écriture. */
  readOnly: boolean;
  fields: Record<BriefBlockKey, Record<string, BriefFieldLabel>>;
};

export type BriefWizardProps = {
  prospectId: string;
  locale: Locale;
  /** Session chargée par la page serveur (revalidée dans l'action). */
  viewer: { id: string; role: Role };
  initialData: Record<BriefBlockKey, Record<string, string>>;
  initialCompleted: number;
  labels: BriefWizardLabels;
};

/** Étapes exigées pour avancer depuis les blocs `context` et `need`. */
const MANDATORY_BLOCKS: readonly BriefBlockKey[] = ["context", "need"];

/** `01` → `05` (pastilles du rail, DESIGN §4.7). */
function stepNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** Bloc contenant au moins 1 valeur non blanche (complétion côté client). */
function hasContent(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => value.trim().length > 0);
}

export function BriefWizard({
  prospectId,
  locale,
  viewer,
  initialData,
  initialCompleted,
  labels,
}: BriefWizardProps): React.JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<BriefBlockKey, Record<string, string>>>(initialData);
  // Dernier état enregistré — référence du dirty-check (`JSON.stringify`).
  const [baseline, setBaseline] = useState<Record<BriefBlockKey, Record<string, string>>>(initialData);
  const [completed, setCompleted] = useState(initialCompleted);
  const [isSaving, setIsSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const currentStep = labels.steps[stepIndex];
  const totalSteps = labels.steps.length;
  const isLastStep = stepIndex === totalSteps - 1;
  const gaugeText = labels.gaugeTemplate
    .replace("{done}", String(completed))
    .replace("{total}", String(totalSteps));
  const prospectHref = `/${locale}/espace/prospects/${prospectId}`;

  /** Le brouillon du bloc diffère-t-il du dernier état enregistré ? */
  function isDirty(key: BriefBlockKey): boolean {
    return JSON.stringify(values[key]) !== JSON.stringify(baseline[key]);
  }

  function setField(key: BriefBlockKey, fieldKey: string, value: string): void {
    setValues((previous) => ({ ...previous, [key]: { ...previous[key], [fieldKey]: value } }));
    setStepError(null);
  }

  /**
   * Persiste le bloc si dirty. `true` = le bloc est enregistré (ou propre) ;
   * `false` = échec (toast + on reste sur l'étape, saisie intacte).
   */
  async function persist(key: BriefBlockKey): Promise<boolean> {
    if (!isDirty(key)) return true;

    setIsSaving(true);
    try {
      const result = await saveBriefBlock(
        { prospectId, block: key, data: values[key] },
        viewer,
      );

      if (result.ok) {
        // Le brouillon devient la nouvelle référence + jauge serveur recompute.
        const saved = values[key];
        setBaseline((previous) => ({ ...previous, [key]: saved }));
        setCompleted(result.completedBlocks);
        toast.success(labels.saved);
        return true;
      }

      // `forbidden` / `not_found` / `invalid` : message générique, aucune
      // fuite de détail — et la saisie reste en place pour nouvelle tentative.
      toast.error(labels.retry);
      return false;
    } catch {
      // Erreur d'infra (action propagée en 500) : aucun détail côté client.
      toast.error(labels.retry);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Change d'étape : sauvegarde l'étape QUITTANTE si dirty, puis navigue.
   * Un échec de sauvegarde bloque la navigation (zéro perte). La validation
   * « ≥ 1 champ non vide » ne s'applique qu'en avançant (`context` / `need`).
   */
  async function goTo(targetIndex: number): Promise<void> {
    if (targetIndex === stepIndex || isSaving) return;
    if (targetIndex < 0 || targetIndex >= totalSteps) return;

    // Lecture seule (vendeur) : navigation de CONSULTATION uniquement, aucun
    // appel serveur, aucune validation de saisie.
    if (labels.readOnly) {
      setStepError(null);
      setStepIndex(targetIndex);
      return;
    }

    const key = currentStep.key;
    const movingForward = targetIndex > stepIndex;
    if (movingForward && MANDATORY_BLOCKS.includes(key) && !hasContent(values[key])) {
      setStepError(labels.requiredError);
      return;
    }

    const saved = await persist(key);
    if (!saved) return;

    setStepError(null);
    setStepIndex(targetIndex);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- Jauge de complétion (5 blocs) ---------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted">{gaugeText}</span>
          {completed >= totalSteps ? (
            <Badge variant="verified">{labels.ready}</Badge>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-valuenow={completed}
          aria-label={gaugeText}
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        >
          <div
            className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${(completed / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {labels.readOnly ? (
        <div
          role="status"
          className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted"
        >
          {labels.readOnlyNotice}
        </div>
      ) : null}

      {/* --- Rail des 5 étapes (DESIGN §4.7) -------------------------------- */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-max items-center">
          {labels.steps.map((step, index) => {
            const isCurrent = index === stepIndex;
            const isDone = hasContent(values[step.key]);
            // Clic autorisé : étape atteinte ou déjà renseignée (sinon on
            // imposerait de passer par « Suivant »). En lecture seule : tout.
            const isReachable = labels.readOnly || index <= stepIndex || isDone;

            return (
              <li key={step.key} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    void goTo(index);
                  }}
                  disabled={!isReachable || isSaving}
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex items-center gap-2.5 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold tabular-nums transition-colors duration-200",
                      isCurrent
                        ? "border-accent bg-accent text-ink"
                        : isDone
                          ? "border-line bg-surface text-success"
                          : "border-line bg-surface text-muted",
                    )}
                  >
                    {stepNumber(index)}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-sm font-medium",
                      isCurrent ? "text-fg" : "text-muted",
                    )}
                  >
                    {step.title}
                  </span>
                </button>

                {/* Filet reliant les pastilles (`border-line`). */}
                {index < totalSteps - 1 ? (
                  <span aria-hidden="true" className="mx-2 h-px w-8 shrink-0 bg-line" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* --- Panneau de l'étape courante ------------------------------------ */}
      <BriefStepPanel
        blockKey={currentStep.key}
        title={currentStep.title}
        description={currentStep.description}
        fieldLabels={labels.fields[currentStep.key]}
        values={values[currentStep.key]}
        disabled={labels.readOnly || isSaving}
        error={stepError}
        errorId={`${currentStep.key}-error`}
        onFieldChange={(fieldKey, value) => {
          setField(currentStep.key, fieldKey, value);
        }}
      />

      {/* --- Navigation (aucun bouton en lecture seule) ---------------------- */}
      {labels.readOnly ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={() => {
                void goTo(stepIndex - 1);
              }}
            >
              {labels.previous}
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="flex flex-wrap items-center gap-3">
            {isLastStep ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSaving || !isDirty(currentStep.key)}
                  onClick={() => {
                    void persist(currentStep.key);
                  }}
                >
                  {isSaving ? labels.saving : labels.save}
                </Button>
                {completed >= totalSteps ? (
                  <Button type="button" variant="primary" href={prospectHref}>
                    {labels.backToProspect}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={isSaving}
                onClick={() => {
                  void goTo(stepIndex + 1);
                }}
              >
                {isSaving ? labels.saving : labels.next}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
