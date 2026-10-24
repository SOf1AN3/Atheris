"use server";

/**
 * Atheris — Server Actions **documents PDF** (T25 · BK-5 · structure.md §3.3).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé en T09 :
 * jamais de clé ni de message dans ce fichier, traduction côté client) :
 * - `uploadDocument(input, actor)` → `{ ok: true; id: string }` |
 *   `{ ok: false, code: "forbidden" | "not_found" | "invalid" }` ;
 * - `deleteDocument(input, actor)` → `{ ok: true }` |
 *   `{ ok: false, code: "forbidden" | "not_found" | "invalid" }`.
 *
 * AUTORISATION : **CEO seul** sur les deux actions (décision Lead : les PDF
 * viennent du devis externe du CEO) — `actor.role !== "ceo"` → `forbidden`.
 * `actor` est chargé depuis la session **côté serveur** par la page appelante
 * puis revalidé ici (uuid de l'acteur → sinon `invalid`) : les arguments d'une
 * Server Action voyagent dans la requête POST, un acteur forgé n'est jamais
 * accepté.
 *
 * VALIDATION — Zod sur l'entrée puis `validatePdf` (`@/lib/documents`,
 * module pur) : base64 strict, ≤ 5 Mo, magic bytes `%PDF` → sinon `invalid`.
 * Le **propriétaire existe** (JOIN polymorphe : `prospects` si
 * `ownerType="prospect"`, `client_projects` sinon) → sinon `not_found`.
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : **aucun `db.transaction()`**. Chaque
 * action n'a qu'une écriture métier ; l'audit (`activities`) est écrit
 * **séparément et de façon NON FATALE** (un échec d'audit ne fait jamais
 * échouer un upload/suppression réussi).
 *
 * ⚠ DUPLICATION DOCUMENTÉE (refactor fin de plan) : `createQuote` (BK-4,
 * `src/actions/quotes.ts`) embarque son propre `decodePdfBase64` + insert
 * `documents` — fichier FIGÉ hors périmètre ici. `validatePdf` est le helper
 * générique destiné aux tâches ultérieures.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { validatePdf, sanitizeFilename } from "@/lib/documents";
import { getDb } from "@/lib/db";
import {
  activities,
  clientProjects,
  documentKindEnum,
  documentOwnerEnum,
  documents,
  prospects,
  quotes,
} from "@/lib/db/schema";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const ownerTypeSchema = z.enum(documentOwnerEnum.enumValues);
const documentKindSchema = z.enum(documentKindEnum.enumValues);
const actorIdSchema = z.uuid();

const uploadDocumentInputSchema = z.object({
  // Base64 du PDF : garde-fou de taille sur la CHAÎNE (5 Mo décodés ≈
  // 6 990 508 caractères + marge) avant même de décoder — le contrôle exact
  // (octets ≤ 5 Mo + magic bytes) est porté par `validatePdf`.
  base64: z.string().max(7_100_000),
  filename: z.string().trim().min(1).max(200),
  ownerType: ownerTypeSchema,
  ownerId: z.uuid(),
  kind: documentKindSchema,
});

const deleteDocumentInputSchema = z.object({ id: z.uuid() });

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `uploadDocument` (dérivée du schéma Zod). */
export type UploadDocumentInput = z.input<typeof uploadDocumentInputSchema>;

/** Contrat de `uploadDocument` (union discriminée par `ok`). */
export type UploadDocumentResult =
  | { ok: true; id: string }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

/** Entrée de `deleteDocument` (dérivée du schéma Zod). */
export type DeleteDocumentInput = z.input<typeof deleteDocumentInputSchema>;

/** Contrat de `deleteDocument` (union discriminée par `ok`). */
export type DeleteDocumentResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

// ---------------------------------------------------------------------------
// uploadDocument — dépôt d'un PDF (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Dépose un PDF dans `documents` (rôle `ceo` uniquement).
 *
 * Étapes :
 * 1. Validation Zod (base64 ≤ ~7,1 M car., nom ≤ 200 car., enum
 *    `ownerType`/`kind`, uuid) → `invalid` ; acteur forgé → `invalid` ;
 *    rôle ≠ `ceo` → `forbidden` (**décision Lead** : upload = CEO seul, les
 *    PDF proviennent du devis externe du CEO).
 * 2. `validatePdf` (base64 strict, ≤ 5 Mo, magic bytes `%PDF`) → sinon
 *    `invalid` (aucun octet écrit).
 * 3. Propriétaire polymorphe **existe** : `prospects` si
 *    `ownerType="prospect"`, `client_projects` sinon → sinon `not_found`.
 * 4. Insert `documents` : `filename` passé par `sanitizeFilename` (anti-path,
 *    extension `.pdf` forcée), `mimeType="application/pdf"`, `byteSize` =
 *    octets réels, `bytes` = `Buffer`, `uploadedBy` = acteur.
 * 5. Audit `document.uploaded` — **non fatal** et **jamais le contenu du
 *    fichier** (uniquement métadonnées : type/ids/taille/nom).
 *
 * @param input `base64`, `filename`, `ownerType`, `ownerId`, `kind`.
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true; id }` ; sinon `invalid`, `not_found` ou `forbidden`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée →
 *   500, jamais masquée derrière un code métier.
 */
export async function uploadDocument(
  input: UploadDocumentInput,
  actor: { id: string; role: Role },
): Promise<UploadDocumentResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = uploadDocumentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { base64, filename, ownerType, ownerId, kind } = parsed.data;

  // 2. Contrôle du PDF (module pur, aucun accès DB).
  const validation = validatePdf(base64);
  if (!validation.ok) return { ok: false, code: "invalid" };
  const bytes = validation.bytes;

  // Nom sûr avant toute écriture (audit compris).
  const storedFilename = sanitizeFilename(filename);

  const db = getDb();

  try {
    // 3. Propriétaire polymorphe requis (JOIN selon `ownerType`).
    if (ownerType === "prospect") {
      const owners = await db
        .select({ id: prospects.id })
        .from(prospects)
        .where(eq(prospects.id, ownerId))
        .limit(1);
      if (owners[0] === undefined) return { ok: false, code: "not_found" };
    } else {
      const owners = await db
        .select({ id: clientProjects.id })
        .from(clientProjects)
        .where(eq(clientProjects.id, ownerId))
        .limit(1);
      if (owners[0] === undefined) return { ok: false, code: "not_found" };
    }

    // 4. Insert du conteneur PDF.
    const inserted = await db
      .insert(documents)
      .values({
        ownerType,
        ownerId,
        kind,
        filename: storedFilename,
        mimeType: "application/pdf",
        byteSize: bytes.length,
        bytes,
        uploadedBy: actorId,
      })
      .returning({ id: documents.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error("insert documents sans retour");

    // 5. Audit NON FATAL — métadonnées seulement, jamais le contenu du
    //    fichier (les octets ne quittent jamais cette ligne de code).
    try {
      await db.insert(activities).values({
        actorId,
        action: "document.uploaded",
        entityType: "document",
        entityId: id,
        meta: { ownerType, ownerId, kind, byteSize: bytes.length, filename: storedFilename },
      });
    } catch (error) {
      console.error(
        "[documents] activité `document.uploaded` non journalisée (upload appliqué)",
        error,
      );
    }

    return { ok: true, id };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[documents] échec d'upload du document", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// deleteDocument — suppression d'un PDF (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Supprime physiquement un document (rôle `ceo` uniquement).
 *
 * Étapes :
 * 1. Validation Zod (uuid) → `invalid` ; acteur forgé → `invalid` ; rôle ≠
 *    `ceo` → `forbidden` (**décision Lead** : delete = CEO seul).
 * 2. Document existe → sinon `not_found`.
 * 3. **Jamais de suppression silencieuse d'un PDF de devis** : si un
 *    `quotes.pdf_document_id` pointe encore vers lui (FK `no action`,
 *    spec T02 — « le PDF d'un devis ne disparaît pas tant que le devis n'est
 *    pas mis à jour ») → `invalid` (refus propre plutôt qu'une erreur 500
 *    du contrainte FK).
 * 4. DELETE conditionné à l'`id` (0 ligne = suppression concurrente) →
 *    `not_found`.
 * 5. Audit `document.deleted` — **non fatal**, métadonnées seulement.
 *
 * @param input `id` du document.
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true }` ; sinon `invalid`, `not_found` ou `forbidden`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function deleteDocument(
  input: DeleteDocumentInput,
  actor: { id: string; role: Role },
): Promise<DeleteDocumentResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = deleteDocumentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { id } = parsed.data;
  const db = getDb();

  try {
    // 2. Document requis — métadonnées relues pour l'audit.
    const existing = await db
      .select({
        ownerType: documents.ownerType,
        ownerId: documents.ownerId,
        filename: documents.filename,
      })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    const stored = existing[0];
    if (stored === undefined) return { ok: false, code: "not_found" };

    // 3. PDF encore référencé par un devis (FK `no action`) → refus propre.
    const referenced = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.pdfDocumentId, id))
      .limit(1);
    if (referenced[0] !== undefined) return { ok: false, code: "invalid" };

    // 4. Suppression physique (0 ligne = course concurrente → `not_found`).
    const deleted = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning({ id: documents.id });
    if (deleted.length === 0) return { ok: false, code: "not_found" };

    // 5. Audit NON FATAL — métadonnées seulement, jamais le contenu.
    try {
      await db.insert(activities).values({
        actorId,
        action: "document.deleted",
        entityType: "document",
        entityId: id,
        meta: {
          ownerType: stored.ownerType,
          ownerId: stored.ownerId,
          filename: stored.filename,
        },
      });
    } catch (error) {
      console.error(
        "[documents] activité `document.deleted` non journalisée (suppression appliquée)",
        error,
      );
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500 (jamais un code
    // métier mensonger sur un échec réel de suppression).
    console.error("[documents] échec de suppression du document", error);
    throw error;
  }
}
