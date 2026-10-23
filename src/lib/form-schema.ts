import { z } from "zod";

import type { ContactFormStrings } from "@/content/types";

/** Messages i18n injectés par la locale (`fr.ts` / `en.ts`). */
type ContactFormErrors = ContactFormStrings["errors"];

/**
 * Valeurs `value` stables (snake_case) des options de type de projet.
 * Le contenu (`ContactFormStrings["typeOptions"]`) porte les libellés ; les
 * littéraux sont fixes → enum typé pour le formulaire.
 */
const PROJECT_TYPE_VALUES = [
  "web_saas",
  "mobile",
  "desktop",
  "cloud",
  "other",
] as const;

/**
 * Schéma de validation du formulaire de contact, **paramétré par la locale** :
 * tous les messages viennent de `ContactFormStrings["errors"]` (DESIGN §3.6).
 *
 * API Zod v4 : `z.email()` top-level (l'API `z.string().email()` est dépréciée
 * en v4) enchaîné via `.pipe()` après le `min(1, …)` required — l'ordre garantit
 * « email requis » avant « email invalide ».
 *
 * bornes non portées : `name` n'a pas de `max` et `message` pas de `max(2000)`
 * faute de clé i18n dédiée dans `ContactFormStrings["errors"]` (7 clés) — on
 * privilégie un message localisé exact plutôt qu'une borne muette.
 */
export function createContactSchema(errors: ContactFormErrors) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, errors.nameRequired)
      .refine((value) => value.length >= 2, { error: errors.nameMin }),
    email: z
      .string()
      .trim()
      .min(1, errors.emailRequired)
      .pipe(z.email({ error: errors.emailInvalid })),
    type: z.enum(PROJECT_TYPE_VALUES, { error: errors.typeRequired }),
    message: z
      .string()
      .trim()
      .min(1, errors.messageRequired)
      .refine((value) => value.length >= 20, { error: errors.messageMin }),
    // SECURITY: honeypot pré-câblé (le backend future doit rejeter) — champ
    // non validé ici ; si un bot le remplit, `Contact.tsx` simule le succès
    // silencieusement sans traiter la demande.
    company_website: z.string().optional(),
  });
}

/** Valeurs typées du formulaire (sortie Zod = entrée : aucun transform). */
export type ContactFormValues = z.infer<ReturnType<typeof createContactSchema>>;
