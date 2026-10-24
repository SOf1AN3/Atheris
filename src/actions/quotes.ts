"use server";

/**
 * Atheris — Server Actions **devis** (T21 · BK-4 · structure.md §3.3).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé en T09 :
 * jamais de clé ni de message dans ce fichier, traduction côté client) :
 * - `createQuote(input, actor)` → `{ ok: true; id: string }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" }` ;
 * - `changeQuoteStatus(input, actor)` → `{ ok: true }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "conflict" |
 *   "reason_required" | "invalid" }`.
 *
 * AUTORISATION : **CEO seul** sur les deux actions — `actor.role !== "ceo"` →
 * `forbidden`. `actor` est chargé depuis la session **côté serveur** par la
 * page appelante puis revalidé ici (uuid de l'acteur → sinon `invalid`) :
 * les arguments d'une Server Action voyagent dans la requête POST, un acteur
 * forgé n'est jamais accepté.
 *
 * VERROU OPTIMISTE (concurrence) : `changeQuoteStatus` relit l'état réel du
 * devis, puis exécute `UPDATE quotes SET … WHERE id = $id AND status =
 * $expectedFrom` — 0 ligne (état bougé entre la lecture et l'écriture, ou
 * double-clic) → `conflict`, code seul sans détail.
 *
 * TRANSITIONS ADMISES (graphe local ci-dessous, `signed` = terminal) :
 * `draft→sent`, `draft→lost`, `sent→signed`, `sent→lost`. Toute autre
 * (dont `signed→*`, `lost→*`) → `forbidden`.
 *
 * PROSPECT : la transition annexe n'est jamais forcée — elle n'est écrite
 * QUE si `canChangeStatus("ceo", statutActuel, cible)` l'autorise (graphe
 * figé `@/lib/permissions`) ; sinon le prospect n'est pas touché (documenté
 * sous `changeQuoteStatus`).
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : **aucun `db.transaction()`** →
 * `db.batch([...])` pour les écritures dépendantes (transition prospect +
 * audit). Les deux INSERT de `createQuote` restent séquentiels : le batch ne
 * peut pas chaîner les retours d'une requête à l'autre (les statements sont
 * construits à l'avance, cf. la fonction).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { activities, documents, prospects, quotes, quoteStatusEnum } from "@/lib/db/schema";
import { canChangeStatus, type ProspectStatus, type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const quoteStatusSchema = z.enum(quoteStatusEnum.enumValues);
const actorIdSchema = z.uuid();

/**
 * Montant USD devis : strictement `> 0`, `≤ 10 000 000` et **2 décimales
 * maximum** (un montant à 3 décimales est irréprésentable en centimes →
 * `invalid`, jamais un arrondi silencieux). La précision est vérifiée en
 * comparant `v * 100` à son arrondi (ε = 1e-6 : large marge, l'erreur de
 * représentation binaire de `v * 100` vaut < 2e-7 pour les bornes admises).
 */
const usdAmountSchema = z
  .number()
  .max(10_000_000)
  .refine((value) => Number.isFinite(value) && value > 0)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) <= 1e-6);

const createQuoteInputSchema = z.object({
  prospectId: z.uuid(),
  amountUsd: usdAmountSchema,
  externalRef: z.string().trim().max(100).optional(),
  // Base64 du PDF : garde-fou de taille sur la CHAÎNE (5 Mo décodés ≈
  // 6 990 508 caractères + marge) avant même de décoder — le contrôle exact
  // (octets ≤ 5 Mo + magic bytes) se fait après décodage.
  pdfBytesBase64: z.string().max(7_100_000).optional(),
  pdfFilename: z.string().trim().min(1).max(200).optional(),
});

const changeQuoteStatusInputSchema = z.object({
  quoteId: z.uuid(),
  to: quoteStatusSchema,
  /** État attendu au moment du rechargement (optimistic locking). */
  expectedFrom: quoteStatusSchema,
  // Pas de `.min(3)` ici : ce minimum n'est exigé QUE pour la cible `lost`
  // (code métier `reason_required`), comme `changeProspectStatus`.
  reason: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `createQuote` (dérivée du schéma Zod). */
export type CreateQuoteInput = z.input<typeof createQuoteInputSchema>;

/** Contrat de `createQuote` (union discriminée par `ok`). */
export type CreateQuoteResult =
  | { ok: true; id: string }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

/** Entrée de `changeQuoteStatus` (dérivée du schéma Zod). */
export type ChangeQuoteStatusInput = z.input<typeof changeQuoteStatusInputSchema>;

/** Contrat de `changeQuoteStatus` (union discriminée par `ok`). */
export type ChangeQuoteStatusResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "conflict" | "reason_required" | "invalid" };

// ---------------------------------------------------------------------------
// Règles métier locales.
// ---------------------------------------------------------------------------

/** Statut de devis, dérivé de l'enum Drizzle (source de vérité unique). */
type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];

/**
 * Graphe des transitions de devis (T21, figé) : `signed` et `lost` sont
 * terminaux (aucune sortie — un devis signé ou perdu ne se réécrit pas).
 */
const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent", "lost"],
  sent: ["signed", "lost"],
  signed: [],
  lost: [],
};

/** Statuts de prospect pour lesquels un devis peut être ouvert (documenté). */
const QUOTE_PROSPECT_STATUSES: readonly ProspectStatus[] = ["qualifie", "devis_envoye", "signe"];

/** Limite octets du PDF : 5 Mo (contrainte applicative `documents.byte_size`). */
const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Magic bytes PDF : les 4 premiers octets décodés doivent valoir `%PDF`. */
const PDF_MAGIC = "%PDF";

/**
 * Décode un PDF base64 et le contrôle **avant** tout insert :
 * - charset base64 strict (sinon `Buffer.from` tronque silencieusement) ;
 * - octets décodés non vides et ≤ 5 Mo ;
 * - magic bytes `%PDF` sur les 4 premiers octets.
 *
 * @returns Les octets du PDF, ou `null` si l'un des contrôles échoue
 *   (→ `invalid` côté action).
 */
function decodePdfBase64(base64: string): Buffer | null {
  const clean = base64.replace(/\s+/g, "");
  if (clean.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  const bytes = Buffer.from(clean, "base64");
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) return null;
  if (bytes.subarray(0, 4).toString("latin1") !== PDF_MAGIC) return null;
  return bytes;
}

// ---------------------------------------------------------------------------
// createQuote — ouverture d'un devis (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Crée un devis `draft` rattaché à un prospect (rôle `ceo` uniquement).
 *
 * Étapes :
 * 1. Validation Zod (montant > 0, ≤ 10 000 000, **2 décimales max**) →
 *    `invalid` ; acteur forgé → `invalid` ; rôle ≠ `ceo` → `forbidden`.
 * 2. SELECT prospect → absent → `not_found` ; statut hors
 *    {`qualifie`, `devis_envoye`, `signe`} → `invalid` (**décision** : un
 *    devis ne s'ouvre qu'à partir de `qualifie` — un lead `nouveau`/
 *    `contacte` non qualifié ou déjà clos (`perdu`, `disqualifie`,
 *    `client_actif`…) est refusé ; `signe` reste admis pour un devis de
 *    renégociation sur un prospect déjà gagné).
 * 3. Montant converti `Math.round(amountUsd * 100)` → centimes USD (jamais de
 *    flottant en base, convention T02).
 * 4. PDF optionnel : décodage base64 + magic bytes `%PDF` + ≤ 5 Mo (sinon
 *    `invalid`) → **insert `documents` d'abord** (`ownerType="prospect"`,
 *    `kind="devis"`), puis insert `quotes` avec `pdfDocumentId`.
 *
 * ORDRE DOCUMENTÉ (2 requêtes séquentielles) : `db.batch` ne peut pas
 * chaîner les retours (le SQL de chaque statement est construit avant
 * exécution — l'id du document doit précéder l'insert du devis). Si l'insert
 * du devis échoue ensuite, le document reste **orphelin** : inoffensif
 * (owner polymorphe sans FK, jamais servi sans devis correspondant).
 *
 * @param input `prospectId`, `amountUsd`, `externalRef?`, PDF base64 + nom.
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true; id }` ; sinon `invalid`, `not_found` ou `forbidden`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée →
 *   500, jamais masquée derrière un code métier.
 */
export async function createQuote(
  input: CreateQuoteInput,
  actor: { id: string; role: Role },
): Promise<CreateQuoteResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = createQuoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { prospectId, amountUsd, externalRef, pdfBytesBase64, pdfFilename } = parsed.data;
  const amountUsdCents = Math.round(amountUsd * 100);
  const db = getDb();

  try {
    // 2. Prospect requis + statut autorisé (documenté ci-dessus).
    const prospectRows = await db
      .select({ status: prospects.status })
      .from(prospects)
      .where(eq(prospects.id, prospectId))
      .limit(1);
    const prospect = prospectRows[0];
    if (prospect === undefined) return { ok: false, code: "not_found" };
    if (!QUOTE_PROSPECT_STATUSES.includes(prospect.status)) return { ok: false, code: "invalid" };

    // 4. PDF optionnel — contrôle strict AVANT stockage.
    let pdfDocumentId: string | null = null;
    if (pdfBytesBase64 !== undefined) {
      const bytes = decodePdfBase64(pdfBytesBase64);
      if (bytes === null) return { ok: false, code: "invalid" };

      const insertedDocs = await db
        .insert(documents)
        .values({
          ownerType: "prospect",
          ownerId: prospectId,
          kind: "devis",
          filename: pdfFilename ?? "devis.pdf",
          mimeType: "application/pdf",
          byteSize: bytes.length,
          bytes,
          uploadedBy: actorId,
        })
        .returning({ id: documents.id });
      pdfDocumentId = insertedDocs[0]?.id ?? null;
      if (pdfDocumentId === null) throw new Error("insert documents sans retour");
    }

    // 3 + 4 (fin) — insert du devis : `status="draft"`, montant en centimes.
    const insertedQuotes = await db
      .insert(quotes)
      .values({
        prospectId,
        amountUsdCents,
        externalRef: externalRef !== undefined && externalRef.length > 0 ? externalRef : null,
        status: "draft",
        pdfDocumentId,
        createdBy: actorId,
      })
      .returning({ id: quotes.id });
    const id = insertedQuotes[0]?.id;
    if (id === undefined) throw new Error("insert devis sans retour");

    return { ok: true, id };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[quotes] échec de création du devis", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// changeQuoteStatus — machine à états du devis + concurrence.
// ---------------------------------------------------------------------------

/**
 * Change le statut d'un devis (rôle `ceo` uniquement).
 *
 * Étapes :
 * 1. Validation Zod → `invalid` ; acteur forgé → `invalid` ; rôle ≠ `ceo` →
 *    `forbidden`.
 * 2. SELECT devis JOIN prospect → devis absent → `not_found` ; état réel ≠
 *    `expectedFrom` → `conflict` (vue obsolète, rechargement).
 * 3. Graphe `QUOTE_TRANSITIONS` : transition interdite (dont toute sortie de
 *    `signed`, statut terminal) → `forbidden`.
 * 4. Cible `lost` : `reason` obligatoire ≥ 3 caractères après trim → sinon
 *    `reason_required` ; raison trop courte fournie sur une transition non
 *    `lost` → `invalid` (miroir de `changeProspectStatus`).
 * 5. UPDATE **conditionnel** (optimistic locking) : `WHERE id AND status =
 *    expectedFrom` + `sentAt = now()` sur `draft→sent`, `signedAt = now()` sur
 *    `sent→signed` (0 ligne → `conflict`).
 * 6. Transition annexe du prospect, **après** confirmation de l'UPDATE :
 *    - `sent→signed` → cible `signe` ;
 *    - `*→lost` → cible `perdu` (la raison n'est **jamais** persistée sur le
 *      prospect : `perdu` n'a pas de colonne de raison → elle ne vit que dans
 *      l'audit, « raison dans l'audit seulement ») ;
 *    - dans les deux cas : **uniquement si** `canChangeStatus("ceo",
 *      statutActuelProspect, cible)` — sinon le prospect n'est pas touché
 *      (ex. prospect déjà `client_actif`/`en_livraison`, ou déjà `signe` pour
 *      une cible `signe`) : la transition annexe est un confort, jamais une
 *      contrainte de transition du devis.
 * 7. Transition prospect + audit `quote.status_changed` groupés en un seul
 *    `db.batch([...])` (driver `neon-http`, pas de transaction). **Ce lot
 *    n'est lancé qu'APRÈS** l'UPDATE confirmé : un batch contenant l'audit
 *    dès la phase 1 écrirait une ligne d'audit mensongère sur un `conflict`.
 *
 * @param input `quoteId`, `to`, `expectedFrom` (état lu) et `reason?`.
 * @param actor `{ id, role }` chargé depuis la session par l'appelant
 *   (revalidé ici).
 * @returns `{ ok: true }` ; sinon `invalid`, `forbidden`, `not_found`,
 *   `reason_required` ou `conflict` (état a changé → recharger).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function changeQuoteStatus(
  input: ChangeQuoteStatusInput,
  actor: { id: string; role: Role },
): Promise<ChangeQuoteStatusResult> {
  // 1. Validation Zod de l'entrée.
  const parsed = changeQuoteStatusInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { quoteId, to, expectedFrom } = parsed.data;
  // Raison absente OU chaîne vide (trim) = non fournie.
  const reason =
    parsed.data.reason !== undefined && parsed.data.reason.length > 0
      ? parsed.data.reason
      : undefined;

  const db = getDb();

  try {
    // 2. Devis + prospect (la transition annexe dépend du statut prospect).
    const rows = await db
      .select({
        status: quotes.status,
        prospectId: quotes.prospectId,
        prospectStatus: prospects.status,
      })
      .from(quotes)
      .innerJoin(prospects, eq(quotes.prospectId, prospects.id))
      .where(eq(quotes.id, quoteId))
      .limit(1);
    const quote = rows[0];
    if (quote === undefined) return { ok: false, code: "not_found" };
    // Vue obsolète : l'état réel a bougé depuis le rechargement.
    if (quote.status !== expectedFrom) return { ok: false, code: "conflict" };

    // 3. Graphe des devis (figé) — couvre le terminal `signed`.
    if (!QUOTE_TRANSITIONS[quote.status].includes(to)) return { ok: false, code: "forbidden" };

    // 4. Raison : obligatoire ≥ 3 car. pour `lost` uniquement.
    if (to === "lost") {
      if (reason === undefined || reason.length < 3) return { ok: false, code: "reason_required" };
    } else if (reason !== undefined && reason.length < 3) {
      return { ok: false, code: "invalid" };
    }

    // 5. UPDATE garanti (optimistic locking) — requête UNIQUE, atomique par
    //    nature (verrou de ligne PostgreSQL).
    const now = sql`now()`;
    const updated = await db
      .update(quotes)
      .set({
        status: to,
        updatedAt: now,
        ...(to === "sent" ? { sentAt: now } : {}),
        ...(to === "signed" ? { signedAt: now } : {}),
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.status, expectedFrom)))
      .returning({ id: quotes.id });
    if (updated.length === 0) return { ok: false, code: "conflict" };

    // 6. Transition annexe du prospect — conditionnelle au graphe (documenté).
    const prospectTarget: ProspectStatus | null =
      to === "signed" ? "signe" : to === "lost" ? "perdu" : null;
    let prospectUpdate: BatchItem<"pg"> | null = null;
    if (prospectTarget !== null && canChangeStatus("ceo", quote.prospectStatus, prospectTarget)) {
      prospectUpdate = db
        .update(prospects)
        .set({ status: prospectTarget, updatedAt: now })
        // Double garde : cible correcte ET état non modifié depuis la lecture.
        .where(and(eq(prospects.id, quote.prospectId), eq(prospects.status, quote.prospectStatus)));
    }

    // 7. Audit — `meta: { from, to, reason?, prospectId }` (contrat T21).
    const auditInsert = db.insert(activities).values({
      actorId,
      action: "quote.status_changed",
      entityType: "quote",
      entityId: quoteId,
      meta: {
        from: expectedFrom,
        to,
        prospectId: quote.prospectId,
        ...(reason !== undefined ? { reason } : {}),
      },
    });

    if (prospectUpdate === null) {
      // Seul l'audit reste : NON FATALE (convention `status.ts`) — le statut
      // du devis est déjà juste, une ligne d'audit manquante ne doit pas
      // faire échouer une transition réussie (le client retenterait →
      // `conflict`).
      try {
        await auditInsert;
      } catch (error) {
        console.error(
          "[quotes] activité `quote.status_changed` non journalisée (transition appliquée)",
          error,
        );
      }
    } else {
      // Transition prospect (écriture métier) + audit groupés en un SEUL
      // `db.batch` (le driver `neon-http` n'offre aucun `db.transaction()`).
      const batchItems: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [prospectUpdate, auditInsert];
      try {
        await db.batch(batchItems);
      } catch (error) {
        // Le devis est déjà transitionné : on remonte l'erreur d'infra (500)
        // plutôt que de masquer un échec de transition prospect — le
        // rechargement affiche l'état réel (`signed`/`lost`).
        console.error("[quotes] échec du lot transition-prospect + audit", error);
        throw error;
      }
    }

    return { ok: true };
  } catch (error) {
    console.error("[quotes] échec de changement de statut du devis", error);
    throw error;
  }
}
