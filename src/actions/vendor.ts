"use server";

/**
 * Atheris — Server Action SDR (FE-7 · T20) : wrapper `createProspect`.
 *
 * SÉCURITÉ DU VIEWER (décision Lead — le cœur de ce fichier) :
 * le viewer `{ id, role }` de `createProspect(input, viewer)` (contrat C-5,
 * figé) est destiné à être fourni par une PAGE serveur or le client ne peut
 * pas être de confiance : les arguments de Server Action voyagent dans la
 * requête POST, un client malveillant pourrait forger
 * `{ id: <uuid>, role: "ceo" }` et contourner le scoping.
 *
 * → ICI, le viewer est **toujours reconstruit côté serveur** depuis la
 * session Auth.js (`auth()`) : aucun identifiant ni rôle ne transite par le
 * client. Le formulaire (`AddProspectForm`) n'importe QUE `addMyProspect`,
 * jamais `createProspect`.
 *
 * ZÉRO DUPLICATION : toute la logique métier (validation Zod, anti-doublon
 * double filet, dérivation de la source par rôle, audit) reste dans
 * `src/actions/prospects.ts` (figé) — ce wrapper ne fait que « signer »
 * l'appel avec l'identité serveur. Un compte sans session ou non `active`
 * reçoit `forbidden` avant tout accès DB.
 *
 * DB-PENDING : aucun import de `@/lib/db` ici ; `auth()` n'est appelé qu'au
 * runtime de l'action — `next build` ne touche jamais `DATABASE_URL`.
 */

import { createProspect } from "@/actions/prospects";
import type { CreateProspectInput, CreateProspectResult } from "@/actions/prospects";
import { auth } from "@/auth";

/**
 * Crée un prospect AU NOM du compte connecté.
 *
 * @param input Coordonnées validées ensuite par le Zod de `createProspect`
 *   (`fullName`, `email`, `phone` requis ; `company`, `note`, `honeypot`
 *   optionnels).
 * @returns Identique au contrat C-5 : `{ ok: true; id }` |
 *   `{ ok: false; code: "duplicate" | "forbidden" | "invalid" }` — codes
 *   bruts i18nalisés côté client.
 */
export async function addMyProspect(
  input: CreateProspectInput,
): Promise<CreateProspectResult> {
  // Viewer RECONSTRUIT ici, depuis la session serveur — jamais monté du client.
  const session = await auth();
  if (!session || session.user.status !== "active") {
    return { ok: false, code: "forbidden" };
  }

  return createProspect(input, {
    id: session.user.id,
    role: session.user.role,
  });
}
