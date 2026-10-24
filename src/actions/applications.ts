"use server";

/**
 * Atheris — Server Action de DÉCISION de candidature (FE-10 · T11 · PLAN.md
 * §3.2) : approbation / refus d'un compte `pending` par le CEO.
 *
 * CONTRAT (figé par le Lead) :
 * - `decideApplication({ userId, decision, reason? }, actor)` →
 *   `{ ok: true }` |
 *   `{ ok: false; code: "conflict" | "forbidden" | "invalid" |
 *   "reason_required" }` ;
 * - codes **bruts uniquement** (dictionnaire i18n verrouillé : jamais de
 *   clé ni de message dans ce fichier) — traduction côté client (T09).
 *
 * POURQUOI CE FICHIER — `src/actions/profile.ts` (figé) ne contient QUE
 * `applyAsCandidate` / `updateProfile` : aucune action de décision n'y
 * existe, la création de ce module est donc prévue par la spec.
 *
 * GARDE-FOUS (dans l'ordre, gabarit identique à `src/actions/status.ts`) :
 *  1. Zod sur l'entrée (uuid + enum `decision` + motif ≤ 500) ;
 *  2. Zod sur `actor` (uuid + enum rôle) puis rôle **`ceo`** exclusif —
 *     un acteur forgé → `invalid`, un rôle hors périmètre → `forbidden` ;
 *  3. refus **sans motif valide** (trim < 3) → `reason_required` ;
 *  4. UPDATE **conditionnelle** (verrou de ligne) :
 *     `WHERE id = $userId AND status = 'pending'` → 0 ligne = compte déjà
 *     tranché (ou introuvable) → `conflict` : **idempotence** garantie, un
 *     double-clic ne rejoue jamais une décision et un compte `active` /
 *     `rejected` ne peut pas repartir en arrière ;
 *  5. audit `application.decided` (`meta: { decision, actorId, reason? }`) —
 *     non fatale (la décision est déjà appliquée, convention `status.ts`).
 *
 * Pas d'appel `auth()` ici (contrat C-5 : `actor` est chargé en session par
 * la page appelante et revalidé ci-dessous — cf. `changeProspectStatus`).
 *
 * TRANSITIONS : `pending → active` (approve) · `pending → rejected`
 * (reject, motif obligatoire ≥ 3 caractères après trim).
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : aucune `db.transaction()` disponible ;
 * l'UPDATE conditionnel est une requête UNIQUE (donc atomique) et l'audit
 * est une requête séparée non fatale.
 *
 * DB-PENDING : `getDb()` est appelé lazy, à l'intérieur de la fonction —
 * `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { activities, roleEnum, users } from "@/lib/db/schema";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const actorSchema = z.object({
  id: z.uuid(),
  role: z.enum(roleEnum.enumValues),
});

const decideInputSchema = z.object({
  userId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  // `.trim()` normalise AVANT la vérification de longueur (≥ 3 exigé pour
  // `reject`, cf. corps de l'action) ; 500 = même plafond que `status.ts`.
  reason: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `decideApplication` (dérivée du schéma Zod). */
export type DecideApplicationInput = z.input<typeof decideInputSchema>;

/** Identité de l'appelant, chargée depuis la session par la page appelante. */
export type DecideApplicationActor = { id: string; role: Role };

/** Contrat de `decideApplication` (union discriminée par `ok`). */
export type DecideApplicationResult =
  | { ok: true }
  | { ok: false; code: "conflict" | "forbidden" | "invalid" | "reason_required" };

// ---------------------------------------------------------------------------
// Règle métier locale.
// ---------------------------------------------------------------------------

/** Longueur minimale du motif de refus — alignée sur `changeProspectStatus`. */
const MIN_REASON_LENGTH = 3;

// ---------------------------------------------------------------------------
// decideApplication — approbation / refus d'une candidature (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Tranche une candidature `pending` : `active` (approve) ou `rejected`
 * (reject, motif obligatoire).
 *
 * @param input `userId` (uuid), `decision` et `reason` (requis ≥ 3 pour un
 *   refus) — validés par Zod.
 * @param actor `{ id, role }` issu de la session serveur (revalidé ici :
 *   uuid + enum rôle — un acteur forgé est refusé, seul `ceo` est admis).
 * @returns `{ ok: true }` si la décision est appliquée ; sinon `invalid`
 *   (entrée malformée / acteur forgé), `forbidden` (rôle ≠ `ceo`),
 *   `reason_required` (refus sans motif valide) ou `conflict` (compte déjà
 *   tranché ou introuvable — idempotence, aucun détail fuité).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500, jamais
 *   transformée en code métier.
 */
export async function decideApplication(
  input: DecideApplicationInput,
  actor: DecideApplicationActor,
): Promise<DecideApplicationResult> {
  // 1. Validation Zod de l'entrée ET de l'acteur — avant tout accès DB.
  // `?.` défensif : un appel forgé sans argument produit un parse en échec.
  const parsed = decideInputSchema.safeParse(input);
  const parsedActor = actorSchema.safeParse({ id: actor?.id, role: actor?.role });
  if (!parsed.success || !parsedActor.success) return { ok: false, code: "invalid" };

  // 2. Droit d'écriture : SEUL le CEO valide les candidatures.
  if (parsedActor.data.role !== "ceo") return { ok: false, code: "forbidden" };

  const { userId, decision } = parsed.data;
  const reason = parsed.data.reason ?? "";
  // 3. Refus : motif obligatoire (≥ 3 caractères après trim).
  if (decision === "reject" && reason.length < MIN_REASON_LENGTH) {
    return { ok: false, code: "reason_required" };
  }

  const actorId = parsedActor.data.id;
  const db = getDb();

  try {
    // 4. UPDATE conditionnelle — verrou de ligne : le garde `status =
    // 'pending'` rend l'UPDATE atomique. 0 ligne = décision déjà prise
    // (doublon / compte introuvable) → `conflict` sans distinguer les deux.
    const updatedRows = await db
      .update(users)
      .set({
        status: decision === "approve" ? "active" : "rejected",
        updatedAt: sql`now()`,
      })
      .where(and(eq(users.id, userId), eq(users.status, "pending")))
      .returning({ id: users.id });

    if (updatedRows.length === 0) return { ok: false, code: "conflict" };

    // 5. Audit — non fatale (voir l'en-tête : la décision est déjà appliquée).
    try {
      await db.insert(activities).values({
        actorId,
        action: "application.decided",
        entityType: "user",
        entityId: userId,
        meta: {
          decision,
          actorId,
          ...(decision === "reject" && reason.length > 0 ? { reason } : {}),
        },
      });
    } catch (error) {
      console.error(
        "[applications] activité `application.decided` non journalisée (décision appliquée)",
        error,
      );
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier.
    console.error("[applications] échec de la décision de candidature", error);
    throw error;
  }
}
