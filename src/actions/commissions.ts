"use server";

/**
 * Atheris — Server Action commissions : GÉNÉRATION des lignes de commission
 * sur un devis signé (T23 · BK-3 · structure.md §3.3) + VERSEMENT (T24 · BK-4).
 *
 * CONTRAT (figé) :
 * - `generateCommissionsForQuote(quoteId, actor)` →
 *   `{ ok: true; created: number }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "not_signed" |
 *   "already_generated" | "invalid" }` ;
 * - codes **bruts uniquement** (dictionnaire i18n verrouillé : jamais de clé ni
 *   de message dans ce fichier) — traduction côté client (T09).
 *
 * PÉRIMÈTRE : GÉNÉRATION (figée T23/BK-3) **+ VERSEMENT** —
 * `markCommissionsPaid` (T24 · BK-4 : `paidAt`, `paidBy`, `status → paid`).
 * **Aucune écriture sur `prospects.status` ici** : la bascule vers
 * `client_actif` est portée par `markPaymentPaid`
 * (`src/actions/payments.ts`, BK-4).
 *
 * DÉCLENCHEUR MÉTIER : l'acompte **payé** appelle cette action (flux de
 * paiement) — elle n'est jamais exposée à une page publique. Le contrôle
 * « devis signé » est ré-asserté ici (défense en profondeur).
 *
 * AUTH : `actor` est `{ id, role }` chargé **depuis la session côté serveur**
 * par l'appelant (jamais une valeur montée du client — les arguments de
 * Server Action voyagent dans la requête POST) puis revalidé ici par Zod
 * (uuid + enum rôle) : un acteur forgé → `invalid` / `forbidden`.
 * Seul le rôle `ceo` peut générer (`forbidden` sinon).
 *
 * CONVENTIONS DB (schéma figé) :
 * - taux en **dixièmes de pourcentage** (`ratePercent` : 100 = 10 %) ;
 * - montants en **centimes USD** (`baseCents`, `amountCents`) ;
 * - driver `neon-http` : **aucun `db.transaction()`** → un seul
 *   `db.batch([...])` atomique (inserts + audit).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur de l'action (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { computeDealShares, getTier, type GeneratedCommission } from "@/lib/commission";
import { getDb } from "@/lib/db";
import { activities, commissions, prospects, quotes, roleEnum, users } from "@/lib/db/schema";
import { type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const quoteIdSchema = z.uuid();
const actorSchema = z.object({
  id: z.uuid(),
  role: z.enum(roleEnum.enumValues),
});

/** Versement : 1 à 100 uuid par appel — le dédoublonnage suit le parse. */
const markPaidInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Identité de l'appelant, chargée depuis la session par la page appelante. */
export type GenerateCommissionsActor = { id: string; role: Role };

/** Contrat de `generateCommissionsForQuote` (union discriminée par `ok`). */
export type GenerateCommissionsResult =
  | { ok: true; created: number }
  | { ok: false; code: "forbidden" | "not_found" | "not_signed" | "already_generated" | "invalid" };

/** Entrée de `markCommissionsPaid` (dérivée du schéma Zod). */
export type MarkCommissionsPaidInput = z.input<typeof markPaidInputSchema>;

/** Contrat de `markCommissionsPaid` (union discriminée par `ok`). */
export type MarkCommissionsPaidResult =
  | { ok: true; paidCount: number }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Détecte une violation d'index UNIQUE PostgreSQL (`23505`) sur le chemin
 * d'une erreur éventuellement enveloppée par le driver/Drizzle : on remonte la
 * chaîne `cause` (5 niveaux max) plutôt que de dépendre d'un type précis
 * (`NeonDbError`).
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current !== "object") return false;
    const code = (current as { code?: unknown }).code;
    if (code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

// ---------------------------------------------------------------------------
// generateCommissionsForQuote — génération idempotente.
// ---------------------------------------------------------------------------

/**
 * Génère les lignes de commission d'un devis **signé** (rôle `ceo` uniquement).
 *
 * Étapes (logique métier détaillée dans `src/lib/commission.ts`) :
 * 1. Validation Zod → `invalid` ; rôle ≠ `ceo` → `forbidden`.
 * 2. SELECT devis JOIN prospect → devis absent → `not_found` ;
 *    `status !== "signed"` → `not_signed`.
 * 3. **Idempotence** : SELECT `WHERE quoteId` préalable → ligne(s) existante(s)
 *    → `already_generated`. **Obligatoire** car l'index unique
 *    `(quoteId, beneficiaryId, kind)` ne dédoublonne PAS les lignes à
 *    `beneficiaryId NULL` (les `NULL` sont distincts en PostgreSQL) : sans ce
 *    SELECT, un double-clic sur un deal « sans bénéficiaire » dupliquerait la
 *    ligne. Un second filet (`23505`) couvre la course sur les lignes non
 *    NULL → re-SELECT → `already_generated`.
 * 4. `paidCount` = deals du `sourceUserId` ayant atteint `client_actif`,
 *    **hors ce devis** : la frontière est `quotes.id != quoteId` — le devis
 *    courant est toujours exclu, même si son prospect est déjà passé à
 *    `client_actif` (palier non rétroactif, calculé à l'instant T).
 * 5. **Part manager sur CHAQUE deal** (règle économique validée) : ligne
 *    `manager` 5 % toujours émise, tous canaux — bénéficiaire = compte
 *    `role = 'manager'` le plus ancien (`createdAt ASC`) ; compte absent →
 *    la part est omise (montant revenant au CEO), documenté. Si le SDR EST
 *    le manager (Rayan génère lui-même le prospect) : **2 lignes** sur le même
 *    deal (mêmes comptes possibles, `kind` distincts → index unique OK). Le
 *    rôle du SDR ne sert qu'à la garde-fou de plafond de `computeDealShares`.
 * 6. Insertions via `computeDealShares` dans **un seul `db.batch([...])`**
 *    atomique (commissions + audit `commissions.generated`) — le driver
 *    `neon-http` n'offre aucun `db.transaction()`.
 *
 * `beneficiaryId` SDR = `prospects.sourceUserId` — **peut être `null`**
 * (leads Ads/Landing) : la ligne est créée quand même (file « sans
 * bénéficiaire », décision Lead).
 *
 * @param quoteId uuid du devis (validé par Zod).
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true; created }` — `created` = lignes insérées (**0** si le
 *   deal vaut 0 ou 1 centime : toutes les parts arrondissent à 0 et sont
 *   omises, seul l'audit est tracé) ; sinon le code métier correspondant.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500,
 *   jamais masquée derrière un code métier.
 */
export async function generateCommissionsForQuote(
  quoteId: string,
  actor: GenerateCommissionsActor,
): Promise<GenerateCommissionsResult> {
  // 1. Validation Zod — avant tout accès DB. `?.` défensif : un appel forgé
  // sans argument produit un parse en échec → `invalid`, jamais un TypeError.
  const parsedQuoteId = quoteIdSchema.safeParse(quoteId);
  const parsedActor = actorSchema.safeParse({ id: actor?.id, role: actor?.role });
  if (!parsedQuoteId.success || !parsedActor.success) return { ok: false, code: "invalid" };

  const { id: actorId, role } = parsedActor.data;
  // Droit d'écriture : seul le CEO génère des commissions.
  if (role !== "ceo") return { ok: false, code: "forbidden" };

  const id = parsedQuoteId.data;
  const db = getDb();

  try {
    // 2. Devis + prospect (porte le `sourceUserId` = bénéficiaire SDR).
    const quoteRows = await db
      .select({
        status: quotes.status,
        amountUsdCents: quotes.amountUsdCents,
        sourceUserId: prospects.sourceUserId,
      })
      .from(quotes)
      .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
      .where(eq(quotes.id, id))
      .limit(1);

    const quote = quoteRows[0];
    if (quote === undefined) return { ok: false, code: "not_found" };
    if (quote.status !== "signed") return { ok: false, code: "not_signed" };

    // 3. FILET 1 — idempotence par SELECT préalable (couvre `beneficiaryId`
    // NULL, cf. doc de fonction). Aucune donnée du devis existant renvoyée.
    const existing = await db
      .select({ id: commissions.id })
      .from(commissions)
      .where(eq(commissions.quoteId, id))
      .limit(1);
    if (existing.length > 0) return { ok: false, code: "already_generated" };

    const sellerId = quote.sourceUserId;
    let paidCount = 0;
    let sellerIsManager = false;

    if (sellerId !== null) {
      // 4. Palier — deals du SDR à `client_actif`, HORS ce devis
      // (frontière explicite `quotes.id != id`). Requête paramétrée partout.
      const paidRows = await db
        .select({ id: quotes.id })
        .from(quotes)
        .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
        .where(
          and(
            eq(prospects.sourceUserId, sellerId),
            eq(prospects.status, "client_actif"),
            ne(quotes.id, id),
          ),
        );
      paidCount = paidRows.length;

      // Rôle du SDR — UNIQUEMENT pour la garde-fou de plafond de
      // `computeDealShares` (le SDR = manager → double prise sur le même
      // compte) : la part manager est émise dans tous les cas, quel que soit
      // le rôle du SDR.
      const sellerRows = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, sellerId))
        .limit(1);
      sellerIsManager = sellerRows[0]?.role === "manager";
    }

    // 5. Parts pures (aucune écriture) — snapshot du taux figé sur la ligne.
    // `computeDealShares` renvoie TOUJOURS la part manager (5 %, tous canaux)
    // en plus du palier SDR.
    const { shares } = computeDealShares({
      dealCents: quote.amountUsdCents,
      sellerRateTenths: getTier(paidCount),
      sellerIsManager,
    });

    // Bénéficiaire de la part manager : compte `role = 'manager'` le PLUS
    // ANCIEN (`createdAt ASC`) — recherché dès qu'une part manager existe
    // (donc sur tout deal encaissé, y compris les deals Sales Development Representative/commercial).
    const wantsManagerShare = shares.some((share) => share.kind === "manager");
    let managerId: string | null = null;
    if (wantsManagerShare) {
      const managerRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "manager"))
        .orderBy(asc(users.createdAt))
        .limit(1);
      managerId = managerRows[0]?.id ?? null;
    }

    // Mapping part → ligne. `null` = part manager abandonnée (compte manager
    // absent en base) : elle n'est pas inscrite, la part revient au CEO.
    const rows = shares
      .map((share): GeneratedCommission | null => {
        if (share.kind === "manager") {
          if (managerId === null) return null;
          return {
            kind: "manager",
            beneficiaryId: managerId,
            rateTenths: share.rateTenths,
            baseCents: quote.amountUsdCents,
            amountCents: share.amountCents,
          };
        }
        // Part SDR — `beneficiaryId` peut être `null` (file orpheline).
        return {
          kind: "seller",
          beneficiaryId: sellerId,
          rateTenths: share.rateTenths,
          baseCents: quote.amountUsdCents,
          amountCents: share.amountCents,
        };
      })
      .filter((row): row is GeneratedCommission => row !== null);

    const commissionInserts = rows.map((row) =>
      db.insert(commissions).values({
        quoteId: id,
        beneficiaryId: row.beneficiaryId,
        kind: row.kind,
        ratePercent: row.rateTenths,
        baseCents: row.baseCents,
        amountCents: row.amountCents,
        status: "due",
      }),
    );

    const auditInsert = db.insert(activities).values({
      actorId,
      action: "commissions.generated",
      entityType: "quote",
      entityId: id,
      meta: { quoteId: id, count: rows.length, actorId },
    });

    // Signature `batch` de Drizzle : tuple **non vide** de `BatchItem<"pg">`.
    // Un tuple commençant par un spread (`[...inserts, audit]`) n'offre aucun
    // élément de position 0 certain → l'audit ouvre le lot (il est présent même
    // quand `rows` est vide ; l'ordre interne est sans effet : exécution
    // atomique unique).
    const batchItems: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
      auditInsert,
      ...commissionInserts,
    ];

    try {
      // 6. Batch ATOMIQUE : toutes les commissions + l'audit partagent la même
      // exécution (pas de `db.transaction()` sur `neon-http`).
      await db.batch(batchItems);
    } catch (error) {
      // FILET 2 — course résiduelle (double appel simultané) : l'index unique
      // `commissions_quote_id_beneficiary_id_kind_idx` lève `23505`.
      if (isUniqueViolation(error)) {
        const raced = await db
          .select({ id: commissions.id })
          .from(commissions)
          .where(eq(commissions.quoteId, id))
          .limit(1);
        if (raced.length > 0) {
          console.warn("[commissions] course détectée sur l'index unique → déjà générées");
          return { ok: false, code: "already_generated" };
        }
        // Violation ailleurs que sur nos clés → erreur d'infra réelle.
        throw error;
      }
      throw error;
    }

    return { ok: true, created: rows.length };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[commissions] échec de génération des commissions", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// markCommissionsPaid — VERSEMENT des lignes « due » (T24 · BK-4).
// ---------------------------------------------------------------------------

/**
 * Marque des lignes de commission comme **versées** (`status → paid`,
 * `paidAt = now()`, `paidBy = actor.id`) — rôle `ceo` uniquement.
 *
 * Étapes :
 * 1. Validation Zod : `ids` = 1 à 100 uuid ; **dédoublonnage** après le
 *    parse (`[...new Set(ids)]`) — un double-clic renvoyant les mêmes ids ne
 *    déclenche jamais deux fois le même update. Tableau > 100 ou malformé →
 *    `invalid`.
 * 2. SELECT `WHERE id IN (…) AND status = 'due'` :
 *    - **aucune des ids en `due`** → `not_found` (sans indiquer lesquelles :
 *      un id déjà `paid` n'est pas distinguable d'un id inconnu) ;
 *    - lignes déjà `paid` : **exclues silencieusement** (absentes du résultat
 *      `due`) — `paidCount` compte réellement les lignes mises à jour ;
 *    - lignes `due` à `beneficiaryId NULL` : présentes au SELECT (elles
 *      existent → pas de `not_found`) mais **exclues silencieusement** du
 *      versement : un montant ne peut être versé sans bénéficiaire —
 *      l'affectation préalable (`beneficiaryId` renseigné) est requise,
 *      fonction de future tâche. Si AUCUNE ligne n'est payable →
 *      `{ ok: true, paidCount: 0 }`.
 * 3. `totalCents` (audit) = somme des montants des lignes **payables** du
 *    SELECT, **avant** update (centimes USD).
 * 4. UPDATE `SET status='paid', paidAt=now(), paidBy=$actor WHERE id IN (…)
 *    AND status='due' AND beneficiaryId IS NOT NULL` — requêtes
 *    **paramétrées** (zéro injection) + verrou de ligne : une ligne `due`
 *    passée `paid` entre le SELECT et l'UPDATE est simplement non retournée
 *    → `paidCount` = lignes réellement mises à jour.
 * 5. Audit `commissions.paid` (`meta: { ids, count, actorId, totalCents }`,
 *    `ids` = lignes réellement versées) — seulement si `paidCount > 0`,
 *    **non fatale** (convention `status.ts`) : le versement est déjà appliqué,
 *    une ligne d'audit manquante ne doit pas faire échouer l'opération.
 *
 * @param input `ids` : uuid des lignes à verser (validés par Zod).
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true, paidCount }` ; sinon `invalid`, `forbidden` ou
 *   `not_found` (aucune des ids n'était en attente de versement).
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée →
 *   500, jamais masquée derrière un code métier.
 */
export async function markCommissionsPaid(
  input: MarkCommissionsPaidInput,
  actor: { id: string; role: Role },
): Promise<MarkCommissionsPaidResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = markPaidInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActor = actorSchema.safeParse({ id: actor?.id, role: actor?.role });
  if (!parsedActor.success) return { ok: false, code: "invalid" };
  // Droit d'écriture : seul le CEO verse des commissions.
  if (parsedActor.data.role !== "ceo") return { ok: false, code: "forbidden" };

  const { id: actorId } = parsedActor.data;
  // Dédoublonnage : le même id envoyé deux fois ne verse qu'une fois.
  const ids = [...new Set(parsed.data.ids)];
  const db = getDb();

  try {
    // 2. Lignes en attente (`due`) parmi les ids fournis.
    const dueRows = await db
      .select({
        id: commissions.id,
        amountCents: commissions.amountCents,
        beneficiaryId: commissions.beneficiaryId,
      })
      .from(commissions)
      .where(and(inArray(commissions.id, ids), eq(commissions.status, "due")));
    if (dueRows.length === 0) return { ok: false, code: "not_found" };

    // Lignes PAYABLES : `beneficiaryId` renseigné (les lignes orphelines sont
    // exclues silencieusement — cf. doc d'étape 2).
    const payableRows = dueRows.filter((row) => row.beneficiaryId !== null);
    if (payableRows.length === 0) return { ok: true, paidCount: 0 };

    // 3. Total avant update (audit) — somme des lignes payables du SELECT.
    const totalCents = payableRows.reduce((sum, row) => sum + row.amountCents, 0);
    const payableIds = payableRows.map((row) => row.id);

    // 4. UPDATE conditionnel (verrou de ligne) — `paidCount` = retours.
    const updated = await db
      .update(commissions)
      .set({ status: "paid", paidAt: sql`now()`, paidBy: actorId })
      .where(
        and(
          inArray(commissions.id, payableIds),
          eq(commissions.status, "due"),
          isNotNull(commissions.beneficiaryId),
        ),
      )
      .returning({ id: commissions.id });
    const paidCount = updated.length;

    // 5. Audit — seulement si quelque chose a réellement été versé.
    if (paidCount > 0) {
      try {
        await db.insert(activities).values({
          actorId,
          action: "commissions.paid",
          entityType: "commission",
          entityId: updated[0].id,
          meta: {
            ids: updated.map((row) => row.id),
            count: paidCount,
            actorId,
            totalCents,
          },
        });
      } catch (error) {
        console.error(
          "[commissions] activité `commissions.paid` non journalisée (versement appliqué)",
          error,
        );
      }
    }

    return { ok: true, paidCount };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[commissions] échec du versement des commissions", error);
    throw error;
  }
}
