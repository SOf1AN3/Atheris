"use server";

/**
 * Atheris — Server Actions **paiements / encaissements** (T22 · BK-4).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé en T09) :
 * - `createPayment(input, actor)` → `{ ok: true; id: string }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" }` ;
 * - `markPaymentPaid(input, actor)` → `{ ok: true; commissionsGenerated }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "conflict" | "invalid" }`.
 *
 * AUTORISATION : **CEO seul** sur les deux actions — `actor.role !== "ceo"` →
 * `forbidden` ; `actor` chargé depuis la session côté serveur par la page
 * appelante puis revalidé ici (uuid → sinon `invalid`).
 *
 * ─── DÉCLENCHEUR DE COMMISSIONS (décision BK-4) ────────────────────────────
 * **Le déclencheur est le 1ᵉʳ paiement payé du devis** — plus robuste que de
 * chercher le mot « acompte » dans le libellé (un libellé est libre, une
 * colonne `paidAt` ne l'est pas). Toute transition `paidAt: NULL → date` sur
 * un devis appelle donc `generateCommissionsForQuote`.
 *
 * ORDRE RETENU (décision documentée) :
 *   (A) bascule prospect `signe → client_actif` si le graphe l'autorise ;
 *   (B) `generateCommissionsForQuote(quoteId, actor)` **AVANT** de marquer le
 *       paiement — si elle retourne autre chose que `ok`/`already_generated`,
 *       on renvoie l'erreur et **le paiement reste non payé** (aucune
 *       incohérence : jamais de paiement encaissé sans commissions tracées) ;
 *   (C) `UPDATE payments … WHERE id AND paidAt IS NULL` (optimistic locking —
 *       anti-double-clic : 0 ligne → `conflict`) ;
 *   (D) audit `payment.paid` (non fatale, convention `status.ts`).
 * `already_generated` → `commissionsGenerated = 0`, on continue normalement
 * (paiements suivants du même devis, ou double-clic rattrapé en (C)).
 *
 * BASCULE PROSPECT (A) AVANT l'appel (B) : vérifié dans le code de
 * `generateCommissionsForQuote` (BK-3) — son compteur `paidCount` compte les
 * deals du SDR à `client_actif` **hors le devis courant**
 * (`ne(quotes.id, quoteId)`), la bascule du deal courant ne modifie donc
 * jamais le palier calculé. Garde-fou : la bascule n'est écrite que si
 * `canChangeStatus("ceo", "signe", "client_actif")` l'autorise — sinon on
 * n'y touche pas (graphe figé `@/lib/permissions`).
 *
 * RÉSIDU DOCUMENTÉ : si (B) échoue (devis non `signed` → `not_signed`,
 * mappé `invalid` ci-dessous), le prospect basculé en (A) l'est resté — le
 * paiement, lui, reste non payé. Les transitions du pipeline sont monotones
 * (jamais rétrogradées) et l'état est ré-affiché au rechargement.
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : **aucun `db.transaction()`**. Chaque
 * phase est une requête UNIQUE (donc atomique par nature) : (C) porte le verrou
 * `paidAt IS NULL` qui rend le marquage sûr sous concurrence, (D) dépend du
 * résultat de (C) et n'est donc jamais batchée avec lui (sinon un `conflict`
 * laisserait un audit de paiement mensonger).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { generateCommissionsForQuote } from "@/actions/commissions";
import { getDb } from "@/lib/db";
import { activities, payments, prospects, quotes } from "@/lib/db/schema";
import { canChangeStatus, type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const actorIdSchema = z.uuid();

/**
 * Date optionnelle : `undefined` / `null` / `""` → absente (jamais
 * `new Date(null)` = epoch 1970 via `z.coerce`), sinon `string | Date`
 * coercé puis vérifié (`Invalid Date` → `invalid`).
 * Le type d'entrée exporté est explicite : le type d'input d'un `z.coerce`
 * serait `unknown`, ce qui desservirait l'appelant.
 */
const optionalDateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.coerce.date().optional(),
);

/**
 * Montant USD : strictement `> 0`, `≤ 10 000 000` et **2 décimales maximum**
 * (identique à `createQuote` : un montant à 3 décimales est irréprésentable
 * en centimes → `invalid`, jamais un arrondi silencieux).
 */
const usdAmountSchema = z
  .number()
  .max(10_000_000)
  .refine((value) => Number.isFinite(value) && value > 0)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) <= 1e-6);

const createPaymentInputSchema = z.object({
  quoteId: z.uuid(),
  // « Acompte », « Échéance 1 »… : 2 caractères minimum après trim.
  label: z.string().trim().min(2).max(120),
  amountUsd: usdAmountSchema,
  dueAt: optionalDateSchema,
});

const markPaymentPaidInputSchema = z.object({
  paymentId: z.uuid(),
  paidAt: optionalDateSchema,
  method: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `createPayment`. */
export type CreatePaymentInput = {
  quoteId: string;
  label: string;
  amountUsd: number;
  /** Échéance optionnelle — `null`/`""` tolérés côté runtime (→ absente). */
  dueAt?: Date | string;
};

/** Contrat de `createPayment` (union discriminée par `ok`). */
export type CreatePaymentResult =
  | { ok: true; id: string }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

/** Entrée de `markPaymentPaid`. */
export type MarkPaymentPaidInput = {
  paymentId: string;
  /** Date d'encaissement — défaut `now()` si absente. */
  paidAt?: Date | string;
  method?: string;
  note?: string;
};

/** Contrat de `markPaymentPaid` (union discriminée par `ok`). */
export type MarkPaymentPaidResult =
  | { ok: true; commissionsGenerated: number }
  | { ok: false; code: "forbidden" | "not_found" | "conflict" | "invalid" };

// ---------------------------------------------------------------------------
// createPayment — échéancier d'un devis (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Ajoute une échéance de paiement sur un devis (rôle `ceo` uniquement).
 *
 * Étapes :
 * 1. Validation Zod (label ≥ 2 car., montant > 0 ≤ 10 000 000 à 2 décimales,
 *    `dueAt?`) → `invalid` ; acteur forgé → `invalid` ; rôle ≠ `ceo` →
 *    `forbidden`.
 * 2. SELECT devis → absent → `not_found` ; statut hors {`sent`, `signed`} →
 *    `invalid` (**décision** : un échéancier ne s'ouvre que sur un devis
 *    proposé ou gagné — `draft` non envoyé et `lost` sont refusés).
 * 3. INSERT `payments` (`amountUsdCents = Math.round(amountUsd * 100)`,
 *    `createdBy = actor.id`) → `{ ok: true; id }`.
 *
 * @param input `quoteId`, `label`, `amountUsd`, `dueAt?`.
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true; id }` ; sinon `invalid`, `not_found` ou `forbidden`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function createPayment(
  input: CreatePaymentInput,
  actor: { id: string; role: Role },
): Promise<CreatePaymentResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = createPaymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { quoteId, label, amountUsd, dueAt } = parsed.data;
  const db = getDb();

  try {
    // 2. Devis requis + statut autorisé (documenté ci-dessus).
    const quoteRows = await db
      .select({ status: quotes.status })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    const quote = quoteRows[0];
    if (quote === undefined) return { ok: false, code: "not_found" };
    if (quote.status !== "sent" && quote.status !== "signed") return { ok: false, code: "invalid" };

    // 3. Insert de l'échéance.
    const inserted = await db
      .insert(payments)
      .values({
        quoteId,
        label,
        amountUsdCents: Math.round(amountUsd * 100),
        dueAt: dueAt ?? null,
        createdBy: actorId,
      })
      .returning({ id: payments.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error("insert paiement sans retour");

    return { ok: true, id };
  } catch (error) {
    console.error("[payments] échec de création du paiement", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// markPaymentPaid — encaissement + déclencheur de commissions.
// ---------------------------------------------------------------------------

/**
 * Marque une échéance comme payée (rôle `ceo` uniquement) et déclenche la
 * génération des commissions du devis.
 *
 * Étapes (ordre contractuel BK-4) :
 * 1. Validation Zod (`paidAt?` défaut `now()`, `method` ≤ 40 car., `note` ≤
 *    500 car.) → `invalid` ; acteur forgé → `invalid` ; rôle ≠ `ceo` →
 *    `forbidden`.
 * 2. SELECT paiement JOIN devis JOIN prospect → paiement absent →
 *    `not_found` (aucune donnée du devis renvoyée).
 * 3. (A) Bascule prospect `signe → client_actif` si le graphe l'autorise —
 *    AVANT l'appel (B), le compteur de `generateCommissionsForQuote` exclut
 *    le devis courant (vérifié, cf. en-tête) donc le palier est inchangé ;
 *    sinon on n'y touche pas.
 * 4. (B) `generateCommissionsForQuote(quoteId, actor)` AVANT le marquage :
 *    `ok` → `commissionsGenerated = created` ; `already_generated` → 0 ;
 *    tout autre code → renvoyé tel quel (`forbidden`/`not_found`) ou mappé
 *    en `invalid` (`not_signed` : devis non `signed` — ce code n'existe pas
 *    dans l'union contractuelle —, `invalid` : entrée incohérente) et **le
 *    paiement reste non payé**.
 * 5. (C) UPDATE conditionnel (optimistic locking, anti-double-clic) :
 *    `WHERE id AND paidAt IS NULL` → 0 ligne (déjà payé entre-temps) →
 *    `conflict`, sans audit.
 * 6. (D) Audit `payment.paid` — non fatale (convention `status.ts`) : le
 *    paiement est déjà enregistré, une ligne d'audit manquante ne doit pas
 *    faire échouer l'encaissement (le client retenterait → `conflict`).
 *
 * @param input `paymentId`, `paidAt?`, `method?`, `note?`.
 * @param actor `{ id, role }` chargé depuis la session par l'appelant
 *   (revalidé ici).
 * @returns `{ ok: true, commissionsGenerated }` ; sinon `invalid`,
 *   `forbidden`, `not_found` ou `conflict`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function markPaymentPaid(
  input: MarkPaymentPaidInput,
  actor: { id: string; role: Role },
): Promise<MarkPaymentPaidResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = markPaymentPaidInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { paymentId, paidAt, method, note } = parsed.data;
  // Chaîne vide après trim = valeur absente → `NULL` en base.
  const methodValue = method !== undefined && method.length > 0 ? method : null;
  const noteValue = note !== undefined && note.length > 0 ? note : null;
  const db = getDb();

  try {
    // 2. Paiement + devis + prospect (la bascule dépend du statut prospect).
    const rows = await db
      .select({
        quoteId: payments.quoteId,
        prospectId: prospects.id,
        prospectStatus: prospects.status,
      })
      .from(payments)
      .innerJoin(quotes, eq(payments.quoteId, quotes.id))
      .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
      .where(eq(payments.id, paymentId))
      .limit(1);
    const payment = rows[0];
    if (payment === undefined) return { ok: false, code: "not_found" };

    // 3. (A) Bascule prospect — conditionnelle au graphe (documenté en-tête).
    if (payment.prospectStatus === "signe" && canChangeStatus("ceo", "signe", "client_actif")) {
      await db
        .update(prospects)
        .set({ status: "client_actif", updatedAt: sql`now()` })
        // Garde d'état : ne touche le prospect que s'il est encore `signe`.
        .where(and(eq(prospects.id, payment.prospectId), eq(prospects.status, "signe")));
    }

    // 4. (B) Déclencheur de commissions AVANT le marquage du paiement.
    const generation = await generateCommissionsForQuote(payment.quoteId, {
      id: actorId,
      role: actor.role,
    });
    let commissionsGenerated = 0;
    if (generation.ok) {
      commissionsGenerated = generation.created;
    } else if (generation.code !== "already_generated") {
      // Codes partagés passés tels quels ; `not_signed` (devis non `signed`)
      // et `invalid` n'existent pas dans l'union contractuelle → `invalid`.
      if (generation.code === "forbidden") return { ok: false, code: "forbidden" };
      if (generation.code === "not_found") return { ok: false, code: "not_found" };
      return { ok: false, code: "invalid" };
    }

    // 5. (C) Marquage — verrou `paidAt IS NULL` (anti-double-clic).
    const updated = await db
      .update(payments)
      .set({ paidAt: paidAt ?? sql`now()`, method: methodValue, note: noteValue })
      .where(and(eq(payments.id, paymentId), isNull(payments.paidAt)))
      .returning({ id: payments.id });
    if (updated.length === 0) return { ok: false, code: "conflict" };

    // 6. (D) Audit — non fatale (convention `status.ts`).
    try {
      await db.insert(activities).values({
        actorId,
        action: "payment.paid",
        entityType: "payment",
        entityId: paymentId,
        meta: {
          paymentId,
          quoteId: payment.quoteId,
          actorId,
          commissionsGenerated,
          ...(methodValue !== null ? { method: methodValue } : {}),
        },
      });
    } catch (error) {
      console.error(
        "[payments] activité `payment.paid` non journalisée (encaissement appliqué)",
        error,
      );
    }

    return { ok: true, commissionsGenerated };
  } catch (error) {
    console.error("[payments] échec de l'encaissement", error);
    throw error;
  }
}
