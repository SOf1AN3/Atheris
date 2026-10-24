"use client";

/**
 * Atheris — panneaux de l'assistant fiche projet (FE-6 · T19).
 *
 * Les 5 blocs (contexte, besoin, contraintes, technique, suivi) vivent dans CE
 * seul fichier : un composant unique `BriefStepPanel` rend le panneau du bloc
 * demandé à partir des **libellés résolus côté serveur** (`fieldLabels`,
 * props de `BriefWizard`).
 *
 * AUCUN libellé ni aucune string i18n ici : uniquement des types, la
 * structure des champs (input vs textarea) et le rendu. Le dictionnaire ne
 * franchit jamais la frontière RSC — la page `fiche` l'a déjà résolu en
 * strings avant de passer les props.
 *
 * ACCESSIBILITÉ (DESIGN §3.6) : label toujours visible au-dessus du champ,
 * erreur reliée par `aria-describedby` + `aria-invalid` + bordure `danger`,
 * focus clavier natif (shadcn `Input` / `Textarea`).
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Les 5 blocs de la fiche — miroir de `BriefBlockKey` (platform/types). */
export type BriefBlockKey = "context" | "need" | "constraints" | "tech" | "followUp";

/** Un libellé de champ, déjà résolu côté serveur (placeholder/hint = dict). */
export type BriefFieldLabel = {
  label: string;
  placeholder?: string;
  hint?: string;
};

/** Nature d'un champ — structure uniquement, aucune chaîne affichable. */
type FieldKind = "input" | "textarea";

/**
 * Structure des champs par bloc (miroir des clés de `dict.brief.fields.*`) :
 * les zones de saisie longues sont des `Textarea`, le reste des `Input`.
 * Une clé absente de ce tableau retombe sur `input` (jamais d'erreur de
 * rendu si le dict ajoute un champ avant cette table).
 */
const FIELD_KINDS: Record<BriefBlockKey, Record<string, FieldKind>> = {
  context: {
    businessProblem: "textarea",
    productType: "input",
  },
  need: {
    scope: "textarea",
    targetUsers: "input",
  },
  constraints: {
    deadline: "input",
    budget: "input",
    decisionMakers: "input",
    references: "textarea",
  },
  tech: {
    forcedTech: "input",
    integrations: "textarea",
    hosting: "input",
    security: "textarea",
  },
  followUp: {
    nextStep: "input",
    reminderDate: "input",
    notes: "textarea",
  },
};

export type BriefStepPanelProps = {
  /** Bloc rendu (détermine la structure des champs, pas leurs libellés). */
  blockKey: BriefBlockKey;
  /** Titre + description de l'étape (résolus server, `dict.brief.steps`). */
  title: string;
  description: string;
  /** Libellés des champs du bloc, indexés par clé (résolus server). */
  fieldLabels: Record<string, BriefFieldLabel>;
  /** Valeurs courantes du bloc (état contrôlé par le wizard). */
  values: Record<string, string>;
  /** Champs désactivés (lecture seule / en cours d'enregistrement). */
  disabled: boolean;
  /** Erreur de validation du bloc — `null` = aucun message. */
  error: string | null;
  /** id partagé du message d'erreur (relié par `aria-describedby`). */
  errorId: string;
  /** Callback de saisie : `(clé du champ, valeur)` — jamais de formulaire RHF. */
  onFieldChange: (fieldKey: string, value: string) => void;
};

/**
 * Panneau d'une étape : titre + description, grille des champs du bloc et
 * message d'erreur de validation (blocs `context` / `need` : au moins 1 champ
 * non vide pour avancer — le serveur recompte la complétion).
 */
export function BriefStepPanel({
  blockKey,
  title,
  description,
  fieldLabels,
  values,
  disabled,
  error,
  errorId,
  onFieldChange,
}: BriefStepPanelProps): React.JSX.Element {
  const fieldKeys = Object.keys(fieldLabels);

  return (
    <section
      aria-labelledby={`${blockKey}-title`}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id={`${blockKey}-title`} className="text-lg font-semibold tracking-[-0.01em] text-fg">
          {title}
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fieldKeys.map((fieldKey) => {
          const definition = fieldLabels[fieldKey];
          const kind: FieldKind = FIELD_KINDS[blockKey][fieldKey] ?? "input";
          const isTextarea = kind === "textarea";
          const id = `${blockKey}-${fieldKey}`;
          const describedBy = [
            error !== null ? errorId : null,
            definition.hint !== undefined ? `${id}-hint` : null,
          ]
            .filter((value): value is string => value !== null)
            .join(" ");

          const sharedProps = {
            id,
            value: values[fieldKey] ?? "",
            disabled,
            maxLength: 2000,
            "aria-invalid": error !== null,
            "aria-describedby": describedBy.length > 0 ? describedBy : undefined,
            className: cn(error !== null && "border-danger"),
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              onFieldChange(fieldKey, event.target.value);
            },
          };

          return (
            <div
              key={fieldKey}
              className={cn("flex flex-col gap-2", isTextarea && "sm:col-span-2")}
            >
              <Label htmlFor={id} className="text-[13px] font-semibold text-fg">
                {definition.label}
              </Label>

              {isTextarea ? (
                <Textarea {...sharedProps} rows={4} placeholder={definition.placeholder} />
              ) : (
                <Input {...sharedProps} type="text" placeholder={definition.placeholder} />
              )}

              {definition.hint !== undefined ? (
                <p id={`${id}-hint`} className="text-[13px] text-muted">
                  {definition.hint}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {error !== null ? (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
