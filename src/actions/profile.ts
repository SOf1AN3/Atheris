"use server";

/**
 * Server Actions de candidature (Sales Partner, T10) et de gestion du profil (T13).
 *
 * Contrat C-5 (signatures FIGÉES, voir Lead) :
 * - `applyAsCandidate(input, ip?)` → `{ ok: true } | { ok: false; code:
 *   "duplicate" | "invalid" }` ;
 * - `updateProfile(input)` → `{ ok: true } | { ok: false; code:
 *   "wrong_password" | "duplicate" | "invalid" }`.
 *
 * CHOIX TECHNIQUES :
 *
 * 1. NORMALISATION EMAIL — `trim().toLowerCase().pipe(z.email())`, **identique**
 *    à `src/actions/auth.ts` : l'index unique `users_email_idx` est sensible à
 *    la casse, on normalise à l'écriture pour garantir le dédoublonnage.
 *
 * 2. ANTI-DOUBLON DOUBLE FILET (`applyAsCandidate`) — (a) SELECT sur l'email
 *    normalisé → `duplicate` ; (b) attrapage de l'erreur d'index unique
 *    PostgreSQL `23505` au moment de l'INSERT (course entre la sélection et
 *    l'insertion) → `duplicate`. Zéro fuite : ni message, ni email renvoyés.
 *
 * 3. HONEYPOT — `companyWebsite` rempli ⇒ **faux succès** (`ok: true` simulé,
 *    AUCUNE insertion) : anti-bot silencieux, indiscernable d'un vrai succès
 *    côté automate.
 *
 * 4. `login_attempts` JAMAIS inséré ici — une candidature n'est pas une
 *    tentative de connexion (table réservée au rate-limit de `authorize`).
 *
 * 5. JOURNAL D'AUDIT — chaque changement de profil réussi écrit une ligne
 *    `activities` (`profile.updated` / `user` / `meta.fields`) pour la traçabilité.
 *
 * 6. AUCUNE SESSION CÔTÉ CLIENT — `updateProfile` récupère elle-même la session
 *    via `auth()` : seul le serveur peut lire `user.id` de façon fiable.
 *
 * Aucune donnée sensible (mot de passe, hash) n'est retournée ni journalisée.
 */

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { activities, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";

// ---------------------------------------------------------------------------
// Types publics (contrat C-5).
// ---------------------------------------------------------------------------

/** Entrée de `applyAsCandidate`. */
export type ApplyCandidateInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
  /**
   * Honeypot anti-bot (champ masqué côté client). S'il est rempli, la
   * candidature reçoit un faux succès silencieux sans insertion en base.
   * Optionnel pour rester compatible avec un appelant qui n'envoie que les
   * 4 champs du contrat minimal `{ name, email, phone, password }`.
   */
  companyWebsite?: string;
};

/** Résultat de `applyAsCandidate`. */
export type ApplyCandidateResult =
  | { ok: true }
  | { ok: false; code: "duplicate" | "invalid" };

/** Entrée de `updateProfile` (tous les champs sont optionnels). */
export type UpdateProfileInput = {
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  phone?: string;
};

/** Résultat de `updateProfile`. */
export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; code: "wrong_password" | "duplicate" | "invalid" };

// ---------------------------------------------------------------------------
// Schémas Zod v4 (validation serveur, sans message — on renvoie des codes).
// ---------------------------------------------------------------------------

const applyCandidateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // Normalisation IDENTIQUE à src/actions/auth.ts (index unique sensible casse).
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().min(6),
  password: z.string().min(8).max(256),
  companyWebsite: z.string().optional(),
});

const updateProfileSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  currentPassword: z.string().min(1).max(256).optional(),
  newPassword: z.string().min(8).max(256).optional(),
  phone: z.string().trim().min(6).optional(),
});

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Détecte une violation d'index unique PostgreSQL (code SQLSTATE `23505`).
 * Aucun `any` ni `as` : l'erreur est lue via `in` puis comparée à `unknown`.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  return error.code === "23505";
}

// ---------------------------------------------------------------------------
// applyAsCandidate — inscription publique (page /inscription).
// ---------------------------------------------------------------------------

/**
 * Inscrit une candidature (rôle `vendeur`, statut `pending`).
 *
 * Rôle réservé : la page est publique, **aucune session requise**. Si une
 * session existe déjà → `invalid` (pas de double candidature connectée).
 *
 * @returns `{ ok: true }` si la candidature est enregistrée (ou faux succès
 * honeypot), sinon `{ ok: false, code }`. Les erreurs d'infrastructure sont
 * journalisées côté serveur puis présentées comme `invalid` (aucune fuite).
 */
export async function applyAsCandidate(
  input: ApplyCandidateInput,
  // Paramètre réservé au contrat C-5 (audit IP futur) : volontairement inutilisé.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ip?: string,
): Promise<ApplyCandidateResult> {
  const session = await auth();
  if (session) return { ok: false, code: "invalid" };

  const parsed = applyCandidateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const { name, email, phone, password, companyWebsite } = parsed.data;

  // Honeypot : faux succès silencieux, aucune insertion (anti-bot).
  if (companyWebsite !== undefined && companyWebsite.trim() !== "") {
    return { ok: true };
  }

  try {
    const db = getDb();

    // Filet 1 : sélection sur l'email normalisé (doublon manifeste).
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return { ok: false, code: "duplicate" };

    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      name,
      phone,
      passwordHash,
      role: "vendeur",
      status: "pending",
    });

    return { ok: true };
  } catch (error) {
    // Filet 2 : course sélection→insertion interceptée par l'index unique.
    if (isUniqueViolation(error)) return { ok: false, code: "duplicate" };
    console.error("[profile] Erreur pendant la candidature", error);
    return { ok: false, code: "invalid" };
  }
}

// ---------------------------------------------------------------------------
// updateProfile — edition email / téléphone / mot de passe (espace connecté).
// ---------------------------------------------------------------------------

/**
 * Met à jour le profil du compte connecté. Le **nom n'est jamais modifiable**
 * (aucun champ). Récupère la session elle-même via `auth()` : le composant
 * appelant est un client sans accès à `user.id`.
 *
 * - `newPassword` fourni → `currentPassword` requis ; faux → `wrong_password`,
 *   sinon `password_hash` mis à jour.
 * - `email` fourni → normalisé + unicité vérifiée (`duplicate` si pris par un
 *   autre compte : `WHERE email = $1 AND id != $me`).
 * - `phone` fourni → mis à jour.
 * - Aucun changement → `{ ok: true }` vide (choix UX : pas d'erreur pour un
 *   submit sans modification).
 *
 * @returns `{ ok: true }` si tout est OK, sinon `{ ok: false, code }`.
 */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const session = await auth();
  if (!session || session.user.status !== "active") {
    return { ok: false, code: "invalid" };
  }

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const { email, currentPassword, newPassword, phone } = parsed.data;
  const me = session.user.id;

  const hasEmail = email !== undefined;
  const hasPhone = phone !== undefined;
  const hasPassword = newPassword !== undefined;

  if (!hasEmail && !hasPhone && !hasPassword) return { ok: true };

  try {
    const db = getDb();
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, me))
      .limit(1);
    if (!row) return { ok: false, code: "invalid" };

    // Changement de mot de passe → mot de passe actuel requis + vérifié.
    if (hasPassword) {
      if (!currentPassword) return { ok: false, code: "invalid" };
      const valid = await verifyPassword(currentPassword, row.passwordHash);
      if (!valid) return { ok: false, code: "wrong_password" };
    }

    // Email : unicité sur l'email normalisé, exclusion du compte courant.
    const emailChanged = hasEmail && email !== undefined && email !== row.email;
    if (emailChanged && email !== undefined) {
      const [dup] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, me)))
        .limit(1);
      if (dup) return { ok: false, code: "duplicate" };
    }

    const values: { email?: string; phone?: string; passwordHash?: string } =
      {};
    const fields: string[] = [];

    if (emailChanged && email !== undefined) {
      values.email = email;
      fields.push("email");
    }
    if (hasPhone && phone !== undefined) {
      values.phone = phone;
      fields.push("phone");
    }
    if (hasPassword && newPassword !== undefined) {
      values.passwordHash = await hashPassword(newPassword);
      fields.push("password");
    }

    if (fields.length > 0) {
      await db.update(users).set(values).where(eq(users.id, me));
      await db.insert(activities).values({
        actorId: me,
        action: "profile.updated",
        entityType: "user",
        entityId: me,
        meta: { fields },
      });
    }

    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "duplicate" };
    console.error("[profile] Erreur lors de la mise à jour du profil", error);
    return { ok: false, code: "invalid" };
  }
}
