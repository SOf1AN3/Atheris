"use server";

/**
 * Atheris — Server Actions **vérification d'identité (KYC)** (PLAN-REFONTE
 * L7 · décisions D3 / D7 · hypothèses H4 / H5).
 *
 * CONTRAT PUBLIC (codes BRUTS — traduits côté client dans
 * `content/platform/identity.*` / `verification.*`, aucun message serveur) :
 * ```
 * uploadIdentityDoc(formData)     → { ok: true } | { ok: false; code: "invalid" | "too_large" | "bad_type" | "forbidden" | "failed" }
 * reviewIdentityDoc(input)        → { ok: true } | { ok: false; code: "invalid" | "forbidden" | "not_found" | "conflict" | "failed" }
 * updateIdentityName(input)       → { ok: true } | { ok: false; code: "invalid" | "forbidden" | "not_found" | "conflict" | "failed" }
 * listIdentityDocs()              → { ok: true; items } | { ok: false; code: "forbidden" }
 * ```
 *
 * RÔLES :
 * - dépôt / nom → **`sdr`** seul (motif `activeActor` de `recrutement.ts`) ;
 * - revue / liste → **`ceo`** seul (la page `/espace/verification` applique
 *   la même garde : double filet).
 *
 * ─── INVARIANT `verified_at` (H4 / H5) ─────────────────────────────────────
 * `users.verified_at` n'est POSE que par `reviewIdentityDoc({ decision:
 * "approve" })` — c'est lui qui verrouille le nom et débloque les versements.
 * En sens inverse, **un refus le force à `NULL`** (quel que soit l'état
 * précédent, retrait compris : cf. la règle détaillée sur
 * `reviewIdentityDoc`). Un DÉPÔT ne le touche JAMAIS (un re-upload après
 * approbation ne retire pas la vérification — seul le CEO tranche).
 *
 * ─── neon-http (C3) ─────────────────────────────────────────────────────────
 * Aucun `db.transaction()` : les verrous passent par un **UPDATE conditionnel
 * + `.returning()`** (0 ligne = `conflict`), et l'UPSERT utilise
 * `onConflictDoUpdate` sur `identity_docs.user_id` (UNIQUE — un re-upload
 * ÉCRASE le dossier, D7).
 *
 * ─── Fichiers ───────────────────────────────────────────────────────────────
 * Motif `src/actions/careers.ts` (upload mémoire, whitelist MIME, nom de
 * fichier sanitisé) — aucune écriture disque, octets en `bytea` ≤ 5 Mo.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { activities, identityDocs, users } from "@/lib/db/schema";
import { notify } from "@/lib/notify";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async subsistent à l'exécution).
// ---------------------------------------------------------------------------

/** Statut du dossier — miroir de l'enum `identity_status` (schema.ts). */
export type IdentityDocStatus = "pending" | "approved" | "rejected";

/** Échec d'`uploadIdentityDoc` — codes bruts, traduits côté client. */
export type UploadIdentityDocFailureCode =
  | "invalid"
  | "too_large"
  | "bad_type"
  | "forbidden"
  | "failed";

/** Contrat d'`uploadIdentityDoc`. */
export type UploadIdentityDocResult =
  | { ok: true }
  | { ok: false; code: UploadIdentityDocFailureCode };

/** Décision du CEO — `approve` pose `users.verified_at`, `reject` le force à `null` + motive (D7). */
export type IdentityReviewDecision = "approve" | "reject";

/** Échec de `reviewIdentityDoc` / `updateIdentityName`. */
export type IdentityActionFailureCode =
  | "invalid"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "failed";

/** Contrat de `reviewIdentityDoc`. */
export type ReviewIdentityDocResult =
  | { ok: true }
  | { ok: false; code: IdentityActionFailureCode };

/** Contrat de `updateIdentityName`. */
export type UpdateIdentityNameResult =
  | { ok: true }
  | { ok: false; code: IdentityActionFailureCode };

/**
 * Une ligne de la file de revue CEO — **projection 100 % sérialisable**
 * (frontière RSC) : SANS les octets (`bytes` n'est jamais sélectionné).
 * Les dates sont des ISO 8601, formatées côté serveur par la page.
 */
export type IdentityDocListItem = {
  userId: string;
  memberName: string;
  email: string;
  role: Role;
  /** `users.verified_at` — pastille « Vérifié » (D8) indépendante du statut. */
  verifiedAt: string | null;
  /** Dernier motif de refus porté sur le compte (`null` si jamais refusé). */
  rejectionReason: string | null;
  status: IdentityDocStatus;
  filename: string;
  mimeType: string;
  byteSize: number;
  /** Dépôt courant — remis à `now()` à chaque re-upload (dossier écrasé). */
  createdAt: string;
  /** Décision du CEO — `null` tant que non examiné. */
  reviewedAt: string | null;
};

// ---------------------------------------------------------------------------
// Schémas Zod v4 (validation serveur, sans message — on renvoie des codes).
// ---------------------------------------------------------------------------

const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });

/**
 * Décision de revue — union discriminée : le motif est **obligatoire** pour
 * un refus (D7 : le SDR est notifié AVEC le motif) et ignoré pour une
 * validation. Borné à 300 caractères (le motif voyage dans `meta.entity` de
 * la notification, limitée à 500 — cf. `notify.ts`).
 */
const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ userId: z.uuid(), decision: z.literal("approve") }),
  z.object({
    userId: z.uuid(),
    decision: z.literal("reject"),
    reason: z.string().trim().min(10).max(300),
  }),
]);

// ---------------------------------------------------------------------------
// Constantes applicatives (motif `careers.ts`).
// ---------------------------------------------------------------------------

/** Taille maximale de la pièce : 5 Mo (motif CV, aligné `bytea`). */
const MAX_DOC_BYTES = 5 * 1024 * 1024;

/** Clé de `FormData` du champ fichier (contrat partagé avec le formulaire). */
const FIELD_DOC = "document";

/** Extensions admises → type MIME canonique (D3 : images + PDF, pas de caméra). */
const DOC_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** `Content-Type` admis (liste blanche stricte, miroir `CV_MIME_TYPES`). */
const DOC_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// ---------------------------------------------------------------------------
// Aides privées.
// ---------------------------------------------------------------------------

/**
 * Session Auth.js reconstruite **côté serveur** (motif `activeActor` de
 * `recrutement.ts`) — aucun identifiant ni rôle ne transite par le client.
 *
 * @param role Rôle exigé (`"sdr"` pour le dépôt, `"ceo"` pour la revue).
 * @returns `null` si aucune session, compte non `active`, ou rôle exigé absent.
 */
async function activeActorOfRole(
  role: Role,
): Promise<{ id: string; role: Role } | null> {
  const session = await auth();
  if (!session || session.user.status !== "active") return null;
  if (session.user.role !== role) return null;
  return { id: session.user.id, role: session.user.role };
}

/** Structure minimale d'un fichier de `FormData` (motif `careers.ts`). */
type UploadedFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

/**
 * Garde structurelle sur l'entrée `document` : refus d'une valeur absente,
 * d'une chaîne (champ texte posté à la place) ou d'un objet sans API fichier.
 *
 * @returns Le fichier, ou `null` (→ code `invalid`).
 */
function readUpload(entry: FormDataEntryValue | null): UploadedFile | null {
  if (typeof entry !== "object" || entry === null) return null;
  const candidate = entry as Partial<UploadedFile>;
  if (typeof candidate.name !== "string") return null;
  if (typeof candidate.size !== "number" || !Number.isFinite(candidate.size)) {
    return null;
  }
  if (typeof candidate.type !== "string") return null;
  if (typeof candidate.arrayBuffer !== "function") return null;
  if (candidate.size <= 0) return null;
  return candidate as UploadedFile;
}

/**
 * Extension du fichier, **après extraction du basename** et en minuscules
 * (motif `careers.ts`).
 *
 * @returns `""` si le nom ne porte pas d'extension exploitable.
 */
function extensionOf(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Nom de fichier sanitisé (motif `careers.ts` : aucun chemin, caractères
 * exotiques → `_`, extension **reconstruite depuis la liste blanche**).
 */
function sanitizeFilename(rawName: string, extension: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const suffix = extension.length > 0 ? `.${extension}` : "";
  const stem =
    suffix.length > 0 && base.toLowerCase().endsWith(suffix)
      ? base.slice(0, -suffix.length)
      : base;

  const cleaned = stem
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[.\-_]+/, "")
    .slice(0, 80)
    .replace(/[.\-_]+$/, "");

  return `${cleaned.length > 0 ? cleaned : "identite"}${suffix}`;
}

// ---------------------------------------------------------------------------
// uploadIdentityDoc — dépôt de la pièce (profil SDR, L7a).
// ---------------------------------------------------------------------------

/**
 * Dépose (ou REMPLACE) la pièce d'identité du compte connecté.
 *
 * Traitement : garde `sdr` → fichier `document` (images JPG/PNG/WebP ou PDF,
 * ≤ 5 Mo, nom sanitisé) → **UPSERT** `identity_docs` sur `user_id` UNIQUE
 * (`onConflictDoUpdate`) avec `status = "pending"`, `reviewed_at` /
 * `reviewed_by` remis à `null` → `users.identity_rejection_reason = null`
 * (le refus antérieur est levé par le nouveau dépôt — D7).
 *
 * `users.verified_at` **n'est jamais posé ici** : seul le CEO le pose à
 * l'approbation (H4/H5). Un dépôt après approbation ne retire donc PAS la
 * vérification.
 *
 * Écritures séquentielles (neon-http, pas de transaction) : un échec de la
 * seconde requête après réussite de la première fait retourner `failed` — un
 * re-essai est sans effet secondaire (l'UPSERT est idempotent).
 *
 * @param formData Champ fichier sous la clé `document`.
 * @returns `{ ok: true }` si la pièce est en base ; sinon code brut.
 * @throws Erreur d'infra DB non interceptée — propagée → 500.
 */
export async function uploadIdentityDoc(
  formData: FormData,
): Promise<UploadIdentityDocResult> {
  // Garde d'entrée : un appel forgé peut transmettre n'importe quoi à la
  // place du `FormData` — refus net avant tout accès aux méthodes.
  if (
    typeof formData !== "object" ||
    formData === null ||
    typeof formData.get !== "function"
  ) {
    return { ok: false, code: "invalid" };
  }

  const actor = await activeActorOfRole("sdr");
  if (actor === null) return { ok: false, code: "forbidden" };

  const file = readUpload(formData.get(FIELD_DOC));
  if (file === null) return { ok: false, code: "invalid" };
  if (file.size > MAX_DOC_BYTES) return { ok: false, code: "too_large" };

  const extension = extensionOf(file.name);
  const declaredMime = DOC_EXTENSIONS[extension];
  if (declaredMime === undefined) return { ok: false, code: "bad_type" };

  const providedMime = file.type.split(";")[0].trim().toLowerCase();
  if (providedMime.length > 0 && !DOC_MIME_TYPES.has(providedMime)) {
    return { ok: false, code: "bad_type" };
  }

  // Lecture en MÉMOIRE (aucune écriture disque, aucun chemin).
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    console.error("[identity] lecture de la pièce impossible", error);
    return { ok: false, code: "failed" };
  }
  if (bytes.length === 0) return { ok: false, code: "invalid" };
  // Re-contrôle sur les octets réellement lus (taille déclarée non foiable).
  if (bytes.length > MAX_DOC_BYTES) return { ok: false, code: "too_large" };

  const filename = sanitizeFilename(file.name, extension);
  const mimeType = DOC_MIME_TYPES.has(providedMime) ? providedMime : declaredMime;

  const db = getDb();
  try {
    // 1. UPSERT — `user_id` UNIQUE : un re-upload ÉCRASE le dossier (D7) et
    //    repasse la ligne en attente de revue. `createdAt` est remis à `now()` :
    //    la ligne représente le dossier COURANT, sa date de dépôt est celle du
    //    dernier envoi (choix assumé — aucun historique n'est conservé).
    await db
      .insert(identityDocs)
      .values({
        userId: actor.id,
        filename,
        mimeType,
        byteSize: bytes.length,
        bytes,
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
      })
      .onConflictDoUpdate({
        target: identityDocs.userId,
        set: {
          filename,
          mimeType,
          byteSize: bytes.length,
          bytes,
          status: "pending",
          reviewedAt: null,
          reviewedBy: null,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      });

    // 2. Le refus antérieur est levé par le nouveau dépôt (D7). `verified_at`
    //    n'est JAMAIS touché ici.
    await db
      .update(users)
      .set({ identityRejectionReason: null, updatedAt: sql`now()` })
      .where(eq(users.id, actor.id));

    return { ok: true };
  } catch (error) {
    console.error("[identity] dépôt de la pièce impossible", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// reviewIdentityDoc — décision du CEO (L7b).
// ---------------------------------------------------------------------------

/**
 * Tranche un dossier de vérification (CEO seul).
 *
 * ─── Idempotence (choix assumé) ─────────────────────────────────────────────
 * - même sens sur une ligne déjà tranchée → **succès muet** (aucune écriture,
 *   aucun `reviewed_at` ré-écrit) : un double-clic ou une requête rejouée ne
 *   change rien ;
 * - **exception auto-réparatrice (approbation)** : une validation alors que
 *   la ligne est déjà `approved` mais que `users.verified_at` est resté nul
 *   (échec DB partielle historique) ré-écrit `verified_at` — jamais de dossier
 *   « validé » sans la vérification qui en découle (H4) ;
 * - **exception auto-réparatrice (refus)** : un refus alors que la ligne est
 *   déjà `rejected` mais que l'état du compte est incohérent (`verified_at`
 *   non nul, ou motif non conservé par un échec partiel) ré-écrit le compte —
 *   voir la règle ci-dessous ;
 * - **changement de sens autorisé** (correction CEO) : valider une pièce
 *   refusée, ou refuser une pièce validée, ré-écrit la ligne ET le compte.
 *
 * ─── Règle `verified_at` (arbitrage Lead) ───────────────────────────────────
 * **Le refus force `users.verified_at = NULL`, quel que soit l'état
 * précédent** (retrait compris). C'est la seule porte d'incohérence : une
 * correction *approbation → refus* ne doit JAMAIS laisser le compte « Vérifié »
 * avec une pièce refusée — nom verrouillé (H5) et versements débloqués (H4) à
 * tort. L'approbation reste la seule décision qui POSE `verified_at`.
 *
 * ─── Verrou (C3) ────────────────────────────────────────────────────────────
 * L'UPDATE de `identity_docs` est **conditionnée au statut lu** : 0 ligne
 * signifie qu'un autre CEO a tranché entre-temps → `conflict`.
 *
 * ─── neon-http : 2 UPDATE, AUCUNE transaction ───────────────────────────────
 * Écritures séquentielles commentées : (1) `identity_docs` — conditionnée et
 * `.returning()` (verrou `conflict`) ; (2) `users` — sûre et idempotente
 * (`WHERE id = …`, toujours applicable après 1). Si 2 échoue après 1, on
 * retourne `failed` : un re-essai converge (la ligne est déjà du bon sens →
 * branche auto-réparatrice → réécriture du compte), sans jamais de
 * `db.transaction()` (interdit en neon-http, C3).
 *
 * @param input `{ userId, decision: "approve" }` ou `{ userId, decision:
 *   "reject", reason }` (motif obligatoire, 10 à 300 caractères — D7).
 * @returns `{ ok: true }` (y compris succès muet), ou code brut.
 * @throws Erreur d'infra DB non interceptée — propagée → 500.
 */
export async function reviewIdentityDoc(input: {
  userId: string;
  decision: IdentityReviewDecision;
  reason?: string;
}): Promise<ReviewIdentityDocResult> {
  const actor = await activeActorOfRole("ceo");
  if (actor === null) return { ok: false, code: "forbidden" };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { userId, decision } = parsed.data;
  const reason = decision === "reject" ? parsed.data.reason : undefined;

  const db = getDb();

  // 1. Compte cible — doit exister et être un SDR (une pièce n'existe que
  //    dans le pipeline SDR ; toute autre cible = `not_found`, sans requête
  //    supplémentaire ni confirmation d'existence). `verifiedAt` +
  //    `rejectionReason` pilotent les branches auto-réparatrices ci-dessous.
  let target:
    | {
        id: string;
        name: string;
        role: Role;
        verifiedAt: Date | null;
        rejectionReason: string | null;
      }
    | undefined;
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        verifiedAt: users.verifiedAt,
        rejectionReason: users.identityRejectionReason,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    target = rows[0];
  } catch (error) {
    console.error("[identity] lecture du compte cible impossible", error);
    throw error;
  }
  if (target === undefined || target.role !== "sdr") {
    return { ok: false, code: "not_found" };
  }

  // 2. Dossier — doit exister.
  let doc: { status: IdentityDocStatus } | undefined;
  try {
    const rows = await db
      .select({ status: identityDocs.status })
      .from(identityDocs)
      .where(eq(identityDocs.userId, userId))
      .limit(1);
    doc = rows[0];
  } catch (error) {
    console.error("[identity] lecture du dossier impossible", error);
    throw error;
  }
  if (doc === undefined) return { ok: false, code: "not_found" };

  // 3. Succès muet si le même sens a déjà prévalu (voir en-tête).
  if (decision === "approve" && doc.status === "approved") {
    if (target.verifiedAt !== null) return { ok: true };
    // Auto-réparation : dossier validé mais vérification absente → on la pose.
  } else if (decision === "reject" && doc.status === "rejected") {
    // Succès muet si le refus est DÉJÀ intégralement appliqué. Sinon
    // auto-réparation : `verified_at` non nul (correction laissée incohérente)
    // ou motif non conservé (échec partiel d'un refus antérieur) → on retombe
    // sur le chemin d'écriture qui garantit la règle du refus.
    if (target.verifiedAt === null && target.rejectionReason !== null) {
      return { ok: true };
    }
  }

  try {
    // 4. UPDATE 1/2 — `identity_docs` (neon-http : 2 écritures séquentielles,
    //    JAMAIS `db.transaction()`, C3). Verrou C3 : UPDATE conditionnel au
    //    statut lu + `.returning()` → 0 ligne = tranché concurremment
    //    entre-temps → `conflict`. La condition porte sur le statut LU (pas
    //    sur `pending`) : un changement de sens (correction CEO) est donc
    //    accepté, et les branches auto-réparatrices ré-écrivent la même ligne.
    const locked = await db
      .update(identityDocs)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        reviewedAt: sql`now()`,
        reviewedBy: actor.id,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(identityDocs.userId, userId), eq(identityDocs.status, doc.status)),
      )
      .returning({ id: identityDocs.id });
    if (locked.length === 0) return { ok: false, code: "conflict" };

    // 5. UPDATE 2/2 — `users`, **sûre et idempotente** (aucune condition
    //    d'état : toujours applicable après 1, donc un re-essai converge) :
    //    - approbation → `verified_at = now()` posé (H4/H5), motif rangé ;
    //    - **refus → `verified_at = NULL` FORCÉ (retrait compris) + motif** :
    //      c'est la règle du refus (voir en-tête) et la seule garantie contre
    //      la correction *approbation → refus*. Échec ici après réussite de 1
    //      → `failed` + re-essai convergent (branche auto-réparatrice).
    if (decision === "approve") {
      await db
        .update(users)
        .set({
          verifiedAt: sql`now()`,
          identityRejectionReason: null,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, userId));
    } else {
      await db
        .update(users)
        .set({
          verifiedAt: null,
          identityRejectionReason: reason ?? null,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, userId));
    }

    // 6. Audit (NON FATAL) — `reviewed_by` / `reviewed_at` portent déjà la
    //    trace ; la ligne d'activité la rend visible dans le journal.
    try {
      await db.insert(activities).values({
        actorId: actor.id,
        action: "identity.reviewed",
        entityType: "user",
        entityId: userId,
        meta: { decision },
      });
    } catch (error) {
      console.error("[identity] audit non écrit (non fatal)", error);
    }

    // 7. Notification au SDR (NON FATAL — motif `notify.ts`, jamais fatal) :
    //    le dépôt de pièce notifie sur `/espace/profil` où le statut et le
    //    motif sont affichés. NOTE honnête : la liste fermée des 12 types de
    //    `notify.ts` ne comporte PAS de type KYC ; on réutilise
    //    `account_activated` (« Compte activé : … » = la vérification est
    //    posée) pour une validation et `reminder_due` (« Relance due : … » =
    //    une action est requise de votre côté) pour un refus, le motif
    //    voyageant dans `entity`. Un type dédié exigerait d'ouvrir la liste
    //    fermée (notify.ts + NotificationsBell + dict) — hors périmètre E.
    await notify({
      type: decision === "approve" ? "account_activated" : "reminder_due",
      link: "/espace/profil",
      meta: {
        // Borné à 500 caractères : au-delà, `notify` refuse silencieusement
        // l'entrée (limite du schéma) et le SDR perdrait la notification.
        entity: (
          decision === "approve"
            ? target.name
            : `${target.name} — ${reason ?? ""}`.trim()
        ).slice(0, 500),
      },
      recipientIds: [userId],
    });

    return { ok: true };
  } catch (error) {
    console.error("[identity] décision de revue impossible", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// updateIdentityName — nom verrouillé par la vérification (H5, L8).
// ---------------------------------------------------------------------------

/**
 * Met à jour le nom du compte SDR connecté **tant que `verified_at` est nul**.
 *
 * Verrou applicatif + DB : la clause `WHERE … AND verified_at IS NULL` fait
 * que la condition est appliquée même si deux requêtes concurrentes passent
 * côte à côte (UPDATE conditionnel, C3). 0 ligne → `conflict` si le compte
 * existe (verrou H5 effectif), `not_found` sinon.
 *
 * @param input `{ name }` — 1 à 100 caractères après `trim()`.
 * @returns `{ ok: true }` si le nom est en base ; sinon code brut.
 * @throws Erreur d'infra DB non interceptée — propagée → 500.
 */
export async function updateIdentityName(
  input: { name: string },
): Promise<UpdateIdentityNameResult> {
  const actor = await activeActorOfRole("sdr");
  if (actor === null) return { ok: false, code: "forbidden" };

  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { name } = parsed.data;

  const db = getDb();
  try {
    const updated = await db
      .update(users)
      .set({ name, updatedAt: sql`now()` })
      .where(
        and(
          eq(users.id, actor.id),
          eq(users.role, "sdr"),
          isNull(users.verifiedAt),
        ),
      )
      .returning({ id: users.id });
    if (updated.length === 0) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, actor.id))
        .limit(1);
      return rows.length === 0
        ? { ok: false, code: "not_found" }
        : { ok: false, code: "conflict" };
    }

    // Audit (NON FATAL) — même action que `profile.ts` pour un seul journal.
    try {
      await db.insert(activities).values({
        actorId: actor.id,
        action: "profile.updated",
        entityType: "user",
        entityId: actor.id,
        meta: { fields: ["name"] },
      });
    } catch (error) {
      console.error("[identity] audit non écrit (non fatal)", error);
    }

    return { ok: true };
  } catch (error) {
    console.error("[identity] mise à jour du nom impossible", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// listIdentityDocs — file de revue CEO (page /espace/verification).
// ---------------------------------------------------------------------------

/**
 * Liste les dossiers de vérification (CEO seul), **sans les octets** (`bytes`
 * n'est jamais sélectionné : plusieurs Mo ne transitent jamais par une action),
 * les `pending` d'abord, puis par dépôt décroissant.
 *
 * SÉCURITÉ : session `active` + rôle `ceo` requis (PII : nom, e-mail, pièce).
 *
 * @returns `{ ok: true; items }` ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function listIdentityDocs(): Promise<
  { ok: true; items: IdentityDocListItem[] } | { ok: false; code: "forbidden" }
> {
  const actor = await activeActorOfRole("ceo");
  if (actor === null) return { ok: false, code: "forbidden" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        userId: identityDocs.userId,
        memberName: users.name,
        email: users.email,
        role: users.role,
        verifiedAt: users.verifiedAt,
        rejectionReason: users.identityRejectionReason,
        status: identityDocs.status,
        filename: identityDocs.filename,
        mimeType: identityDocs.mimeType,
        byteSize: identityDocs.byteSize,
        createdAt: identityDocs.createdAt,
        reviewedAt: identityDocs.reviewedAt,
      })
      .from(identityDocs)
      .innerJoin(users, eq(users.id, identityDocs.userId))
      .orderBy(
        sql`case ${identityDocs.status} when 'pending' then 0 else 1 end`,
        desc(identityDocs.createdAt),
      )
      .limit(200);

    return {
      ok: true,
      items: rows.map((row) => ({
        userId: row.userId,
        memberName: row.memberName.trim(),
        email: row.email.trim(),
        role: row.role,
        verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
        rejectionReason: row.rejectionReason,
        status: row.status,
        filename: row.filename,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt === null ? null : row.reviewedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[identity] échec de la liste des dossiers", error);
    throw error;
  }
}
