"use server";

/**
 * Atheris — Server Action de transition du pipeline (T15 · contrat C-5).
 *
 * `changeProspectStatus(input, viewer)` → `{ ok: true }` |
 * `{ ok: false; code: "conflict" | "forbidden" | "reason_required" | "invalid" }`.
 *
 * GARDE-FOUS (dans l'ordre) :
 *  1. Zod sur l'entrée (uuid, enum statuts, raison ≤ 500) ;
 *  2. rôle avec droit d'écriture : `ceo | manager | commercial` (un rôle
 *     inconnu — JWT forgé — est traité comme non autorisé) ;
 *  3. `canChangeStatus(rôle, expectedFrom, to)` (graphe `@/lib/permissions`,
 *     plafond commercial à `devis_envoye`) → `forbidden` ;
 *  4. statut terminal (`perdu` / `disqualifie`) → raison obligatoire ≥ 3
 *     caractères après trim → sinon `reason_required` ;
 *  5. UPDATE **conditionnel** sous concurrence (optimistic locking) :
 *     `WHERE id = $id AND status = $expectedFrom` → 0 ligne = l'état a bougé
 *     depuis le rechargement (ou prospect inexistant) → `conflict`, code
 *     seulement, sans détail.
 *
 * Pas d'appel `auth()` ici (contrat C-5 : le `viewer` est chargé en session
 * par la page appelante et revalidé ci-dessous). Aucun message i18n : codes
 * bruts i18nalisés en T09.
 *
 * ⚠ ATOMICITÉ — driver `neon-http` (voir constat DB-1) : **pas de
 * `db.transaction()`** (« No transactions support in neon-http driver »).
 * Ici aucune n'est nécessaire : l'UPDATE conditionnel est une requête UNIQUE,
 * donc atomique par nature (verrou de ligne) — c'est lui qui garantit
 * l'état-fort. L'insert `activities` est une requête séparée **non fatale** :
 * si elle échoue, le statut du prospect est déjà juste et l'action renvoie
 * `ok` — on préfère une ligne d'audit manquante à un échec signalé après une
 * transition réussie (le client retenterait → `conflict`). Un `db.batch()`
 * serait inutile ici : il ne couvrirait pas davantage (l'audit dépend du
 * résultat de l'UPDATE).
 *
 * DB-PENDING : `getDb()` appelé lazy, à l'intérieur de la fonction.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { activities, prospects, prospectStatusEnum, roleEnum } from "@/lib/db/schema";
import { canChangeStatus, isTerminalStatus, type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout traitement.
// ---------------------------------------------------------------------------

const roleSchema = z.enum(roleEnum.enumValues);
const prospectStatusSchema = z.enum(prospectStatusEnum.enumValues);
const viewerIdSchema = z.uuid();

const changeStatusInputSchema = z.object({
  id: z.uuid(),
  to: prospectStatusSchema,
  /** État attendu au moment du rechargement (optimistic locking). */
  expectedFrom: prospectStatusSchema,
  // Pas de `.min(3)` ici : la longueur minimale n'est exigée QUE pour une
  // cible terminal, avec le code métier `reason_required` (≠ `invalid`).
  // `.trim()` normalise avant la vérification de longueur.
  reason: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat C-5) — uniquement des `export type`.
// ---------------------------------------------------------------------------

/** Entrée de `changeProspectStatus` (dérivée du schéma Zod). */
export type ChangeProspectStatusInput = z.input<typeof changeStatusInputSchema>;

/** Contrat de `changeProspectStatus` (union discriminée par `ok`). */
export type ChangeProspectStatusResult =
  | { ok: true }
  | { ok: false; code: "conflict" | "forbidden" | "reason_required" | "invalid" };

// ---------------------------------------------------------------------------
// Règles métier locales.
// ---------------------------------------------------------------------------

/** Rôles avec droit d'ÉCRITURE sur le pipeline (le SDR est lecture seule). */
const WRITE_ROLES: readonly Role[] = ["ceo", "manager", "commercial"];

// ---------------------------------------------------------------------------
// changeProspectStatus — machine à états + concurrence.
// ---------------------------------------------------------------------------

/**
 * Change le statut d'un prospect.
 *
 * @param input `id` (uuid), `to` (statut cible), `expectedFrom` (état lu par
 *   l'utilisateur) et `reason` (obligatoire ≥ 3 caractères si cible terminal).
 * @param viewer `{ id, role }` chargé depuis la session par l'appelant
 *   (revalidé ici : uuid + enum rôle — un viewer forgé est refusé).
 * @returns `{ ok: true }` ; sinon `invalid` (entrée malformée / viewer
 *   forgé), `forbidden` (rôle sans droit d'écriture ou transition interdite
 *   par le graphe), `reason_required` (cible terminal sans raison valide),
 *   `conflict` (l'état a changé côté serveur → recharger).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function changeProspectStatus(
  input: ChangeProspectStatusInput,
  viewer: { id: string; role: Role },
): Promise<ChangeProspectStatusResult> {
  // 1. Validation Zod de l'entrée.
  const parsed = changeStatusInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  // 2. Droit d'écriture : rôle valide mais non habilité (sdr/client), ou
  //    rôle inconnu (JWT forgé) → refus identique, aucun détail.
  const parsedRole = roleSchema.safeParse(viewer?.role);
  if (!parsedRole.success) return { ok: false, code: "forbidden" };
  const role = parsedRole.data;
  if (!WRITE_ROLES.includes(role)) return { ok: false, code: "forbidden" };

  // 3. Viewer : id doit être un uuid — sinon entrée forgée.
  if (!viewerIdSchema.safeParse(viewer?.id).success) return { ok: false, code: "invalid" };

  const { id, to, expectedFrom } = parsed.data;
  // Raison absente OU chaîne vide (trim) = non fournie.
  const reason =
    parsed.data.reason !== undefined && parsed.data.reason.length > 0
      ? parsed.data.reason
      : undefined;

  // 4. Graphe de transitions pour ce rôle (graphe figé `@/lib/permissions`).
  if (!canChangeStatus(role, expectedFrom, to)) return { ok: false, code: "forbidden" };

  // 5. Cible terminal : raison obligatoire ≥ 3 caractères.
  if (isTerminalStatus(to)) {
    if (reason === undefined || reason.length < 3) return { ok: false, code: "reason_required" };
  } else if (reason !== undefined && reason.length < 3) {
    // Raison fournie mais trop courte sur une transition non terminal :
    // entrée invalide (le minimum n'existe que pour les transitions finales).
    return { ok: false, code: "invalid" };
  }

  const db = getDb();

  // 6. Concurrence : la garde `status = expectedFrom` rend l'UPDATE atomique
  //    (verrou de ligne PostgreSQL). 0 ligne = état obsolète ou prospect
  //    introuvable → `conflict` sans distinguer les deux (aucune fuite).
  let updatedRows: { id: string }[];
  try {
    updatedRows = await db
      .update(prospects)
      .set({
        status: to,
        updatedAt: sql`now()`,
        // La raison de la disqualification est **persistée** sur la ligne
        // (colonne dédiée) pour être affichée directement dans la fiche
        // prospect côté CEO — `activities.meta.reason` reste l'historique.
        // `perdu` n'a pas de colonne dédiée dans le schéma (figé) : sa raison
        // ne vit que dans l'audit.
        ...(to === "disqualifie" ? { disqualifyReason: reason ?? null } : {}),
      })
      // Double garde : cible correcte ET état non modifié depuis le rechargement.
      .where(and(eq(prospects.id, id), eq(prospects.status, expectedFrom)))
      .returning({ id: prospects.id });
  } catch (error) {
    console.error("[status] échec de la transition de statut", error);
    throw error;
  }

  if (updatedRows.length === 0) return { ok: false, code: "conflict" };

  // 7. Audit — non fatale (voir l'en-tête : le statut est déjà juste).
  try {
    await db.insert(activities).values({
      actorId: viewer.id,
      action: "status.changed",
      entityType: "prospect",
      entityId: id,
      meta: {
        from: expectedFrom,
        to,
        actorId: viewer.id,
        ...(reason !== undefined ? { reason } : {}),
      },
    });
  } catch (error) {
    console.error("[status] activité `status.changed` non journalisée (transition appliquée)", error);
  }

  return { ok: true };
}
