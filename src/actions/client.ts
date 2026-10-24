"use server";

/**
 * Atheris — Server Actions **portail client** (FE-9 · T27–T29) : wrappers
 * « viewer serveur » des actions projets/messagerie (contrats C-5/C-6 figés).
 *
 * SÉCURITÉ DU VIEWER (même modèle que `src/actions/vendor.ts` — décision
 * Lead) : les actions de `@/actions/project` et `@/actions/messages` prennent
 * un `viewer { id, role }` destiné à être fourni par une PAGE serveur. Les
 * arguments de Server Action voyagent dans la requête POST : un client
 * malveillant pourrait forger `{ id: <uuid>, role: "ceo" }` pour valider un
 * jalon ou lire le fil d'un autre projet.
 *
 * → ICI, le viewer est **toujours reconstruit côté serveur** depuis la
 * session Auth.js (`auth()`) : aucun identifiant ni rôle ne transite par le
 * client. Les composants (`MilestoneTimeline`, `Thread`) n'importent QUE
 * `clientValidateMilestone` / `clientPostMessage` / `clientMarkThreadRead`,
 * jamais les actions brutes.
 *
 * ZÉRO DUPLICATION : toute la logique métier (validation Zod, séquence de
 * jalons non sautable, verrous optimistes, scoping projet) reste dans les
 * actions figées — ce fichier ne fait que « signer » chaque appel avec
 * l'identité serveur. Un compte sans session ou non `active` reçoit
 * `forbidden` avant tout accès DB (miroir exact de `vendor.ts`).
 *
 * DB-PENDING : aucun import de `@/lib/db` ici ; `auth()` n'est appelé qu'au
 * runtime de l'action — `next build` ne touche jamais `DATABASE_URL`.
 */

import { markThreadRead, postMessage } from "@/actions/messages";
import type {
  MarkThreadReadInput,
  MarkThreadReadResult,
  PostMessageInput,
  PostMessageResult,
} from "@/actions/messages";
import { validateMilestone } from "@/actions/project";
import type {
  ProjectViewer,
  ValidateMilestoneInput,
  ValidateMilestoneResult,
} from "@/actions/project";
import { auth } from "@/auth";

/**
 * Reconstruit le viewer `{ id, role }` depuis la session serveur.
 *
 * @returns `null` si aucun compte est connecté ou si son statut n'est pas
 *   `active` (JWT figé à la connexion, jamais forgeable côté requête).
 */
async function requireViewer(): Promise<ProjectViewer | null> {
  const session = await auth();
  if (!session || session.user.status !== "active") return null;
  return { id: session.user.id, role: session.user.role };
}

/**
 * Valide le jalon courant du projet du client connecté.
 *
 * @param input `projectId`, `milestoneKey` — revalidés par le Zod de
 *   `validateMilestone` (figé).
 * @returns Identique au contrat figé : `{ ok: true; nextKey }` |
 *   `{ ok: false; code: "not_found" | "forbidden" | "invalid" | "conflict" }`
 *   — codes bruts i18nalisés côté client.
 */
export async function clientValidateMilestone(
  input: ValidateMilestoneInput,
): Promise<ValidateMilestoneResult> {
  const viewer = await requireViewer();
  if (viewer === null) return { ok: false, code: "forbidden" };
  return validateMilestone(input, viewer);
}

/**
 * Poste un message dans le fil du projet du client connecté.
 *
 * @param input `projectId`, `body` (1..2000 car.) — revalidés par `postMessage`.
 * @returns `{ ok: true; id }` | `{ ok: false; code }` (contrat figé).
 */
export async function clientPostMessage(
  input: PostMessageInput,
): Promise<PostMessageResult> {
  const viewer = await requireViewer();
  if (viewer === null) return { ok: false, code: "forbidden" };
  return postMessage(input, viewer);
}

/**
 * Marque comme lus les messages REÇUS par le client dans un projet
 * (appelé à l'ouverture de l'onglet Messagerie, idempotent).
 *
 * @param input `projectId` — revalidé par `markThreadRead`.
 * @returns `{ ok: true }` | `{ ok: false; code }` (contrat figé).
 */
export async function clientMarkThreadRead(
  input: MarkThreadReadInput,
): Promise<MarkThreadReadResult> {
  const viewer = await requireViewer();
  if (viewer === null) return { ok: false, code: "forbidden" };
  return markThreadRead(input, viewer);
}
