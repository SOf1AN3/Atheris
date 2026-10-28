"use server";

/**
 * Atheris — Server Actions **invitations de compte** (T26 · BK-5 ·
 * structure.md §3.3 · Lot 3 : générique client + sdr).
 *
 * CONTRAT (codes bruts uniquement — dictionnaire i18n verrouillé en T09 :
 * jamais de clé ni de message dans ce fichier, traduction côté client) :
 * - `createClientInvitation(input, actor)` →
 *   `{ ok: true; token: string; expiresAt: number; mailSent: boolean }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" }` ;
 * - `activateAccount(input, ip?)` → `{ ok: true }` |
 *   `{ ok: false; code: "invalid" | "expired" | "used" | "duplicate" }`.
 *
 * AUTORISATION :
 * - `createClientInvitation` = **CEO seul** (`actor.role !== "ceo"` →
 *   `forbidden`), acteur revalidé par Zod (uuid → sinon `invalid`) ;
 * - `activateAccount` = action **PUBLIQUE** (aucune session requise) : elle
 *   est protégée par l'unicité du jeton, sa durée de vie (48 h), le refus de
 *   tout takeover d'email (`duplicate`) et le rôle cible de l'invitation
 *   (seuls `sdr` et `client` sont activables).
 *
 * JETON : `randomBytes(32)` hex (256 bits d'entropie) — pour l'invitation
 * client, il est **renvoyé en clair** une seule fois (le CEO le copie
 * manuellement) ET envoyé par e-mail au destinataire (Lot 3) ; pour
 * l'invitation `sdr` (recrutement), l'e-mail est envoyé par
 * `src/actions/recrutement.ts`. Un jeton n'est **jamais** journalisé (audits
 * `invitation.created` / `invitation.activated` sans token).
 * `expiresAt` = maintenant + 48 h, retourné en millisecondes Unix.
 *
 * RÉUTILISATION (décision documentée) : une invitation **non utilisée**
 * déjà existante pour le couple (email normalisé, rôle[, projet pour le
 * client]) est **réutilisée** avec simple refresh de `expiresAt` — aucune
 * ligne orpheline ni jeton parallèle à distribuer (l'ancien lien reste
 * valable jusqu'à sa nouvelle expiration).
 *
 * ⚠ ATOMICITÉ — driver `neon-http` : **aucun `db.transaction()`** →
 * `db.batch([...])` pour les écritures dépendantes de l'activation (insert
 * `users` + marque `invitations.used_at`). L'audit est écrit ensuite, de
 * façon NON FATALE.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy),
 * jamais au top-level → `next build` ne lit jamais `DATABASE_URL`.
 */

import { randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { locales } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import { activities, clientProjects, invitations, prospects, quotes, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { hashPassword } from "@/lib/password";
import { absoluteInterviewUrl } from "@/lib/recruitment-templates";
import type { ProspectStatus, Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Constantes.
// ---------------------------------------------------------------------------

/** Durée de vie d'une invitation (48 h, spec T26). */
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

/** Statuts de prospect ouvrant l'accès au portail client (décision T26). */
const INVITABLE_PROSPECT_STATUSES: readonly ProspectStatus[] = [
  "client_actif",
  "en_livraison",
];

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const actorIdSchema = z.uuid();

const createInvitationInputSchema = z.object({
  prospectId: z.uuid(),
  // Normalisation (trim + minuscules) déclarative : l'index `users_email_idx`
  // est sensible à la casse, la forme stockée doit être unique.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(2).max(120),
  // Locale de l'e-mail d'invitation (Lot 3) — dict plateforme ciblé.
  locale: z.enum(locales),
});

const activateInvitationInputSchema = z.object({
  // Jeton hex strict : 64 caractères minuscules (sortie de `randomBytes`).
  token: z.string().regex(/^[0-9a-f]{64}$/u),
  name: z.string().trim().min(2).max(120),
  // Identique au plafond de `authorize` (src/auth.ts).
  password: z.string().min(8).max(256),
});

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async sont exportées à l'exécution,
// comme exigé par `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `createClientInvitation` (dérivée du schéma Zod). */
export type CreateClientInvitationInput = z.input<typeof createInvitationInputSchema>;

/** Contrat de `createClientInvitation` (union discriminée par `ok`). */
export type CreateClientInvitationResult =
  | { ok: true; token: string; expiresAt: number; mailSent: boolean }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" };

/** Entrée de `activateAccount` (dérivée du schéma Zod). */
export type ActivateAccountInput = z.input<typeof activateInvitationInputSchema>;

/** Contrat de `activateAccount` (union discriminée par `ok`). */
export type ActivateAccountResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "expired" | "used" | "duplicate" };

/** TEMPoraire : alias de types — supprimé par la vague Frontend B. */
export type ActivateClientAccountInput = ActivateAccountInput;

/** TEMPoraire : alias de types — supprimé par la vague Frontend B. */
export type ActivateClientAccountResult = ActivateAccountResult;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Détecte une violation d'index unique PostgreSQL (code SQLSTATE `23505`).
 * Aucun `any` ni `as` : l'erreur est lue via `in` puis comparée à `unknown`
 * (convention `src/actions/profile.ts`).
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  return error.code === "23505";
}

// ---------------------------------------------------------------------------
// createClientInvitation — émission d'un lien d'espace client (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Crée (ou réactive) l'invitation d'accès au portail client.
 *
 * Étapes :
 * 1. Validation Zod (uuid, email normalisé, nom ≥ 2 car., locale) →
 *    `invalid` ; acteur forgé → `invalid` ; rôle ≠ `ceo` → `forbidden`
 *    (**décision Lead** : création = CEO seul).
 * 2. Prospect existe → sinon `not_found`.
 * 3. Statut prospect ∈ {`client_actif`, `en_livraison`} → sinon `invalid`
 *    (un prospect de pipeline non signé n'a pas d'espace client).
 * 4. **Projet lié obligatoire** : `client_projects JOIN quotes ON
 *    quotes.id = client_projects.quote_id WHERE quotes.prospect_id = $1` →
 *    sinon `invalid` (pas de projet = pas d'espace client ; le seed en a
 *    créé un pour la démo).
 * 5. Invitation **non utilisée** déjà existante pour (email, rôle `client`,
 *    projet) → **réutilisée** : `expiresAt` rafraîchi, même jeton renvoyé
 *    (décision documentée en tête de fichier). Sinon insert avec
 *    `randomBytes(32)`, `role: "client"`.
 * 6. E-mail d'invitation (Lot 3) au destinataire avec
 *    `dict.auth.invitation.email.client.{subject,body}` (placeholders
 *    `{{name}}` et `{{link}}` = URL **absolue** du lien d'activation) —
 *    échec → `mailSent: false` (**non fatal** : l'action reste `ok: true`,
 *    le CEO dispose du jeton en clair pour une remise manuelle).
 * 7. Audit `invitation.created` — **non fatal**, **jamais le token**.
 *
 * @param input `prospectId`, `email` (normalisé), `name` (nom du prospect —
 *   non persisté : `invitations` n'a pas de colonne nom, il est consigné dans
 *   l'audit ; le nom du compte se saisit à l'activation), `locale` (langue
 *   de l'e-mail).
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true, token, expiresAt, mailSent }` (jeton en clair +
 *   échéance en ms) ; sinon `invalid`, `not_found` ou `forbidden`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function createClientInvitation(
  input: CreateClientInvitationInput,
  actor: { id: string; role: Role },
): Promise<CreateClientInvitationResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = createInvitationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const parsedActorId = actorIdSchema.safeParse(actor?.id);
  if (!parsedActorId.success) return { ok: false, code: "invalid" };
  // CEO seul : tout autre rôle (JWT forgé compris) → `forbidden`.
  if (actor.role !== "ceo") return { ok: false, code: "forbidden" };

  const actorId = parsedActorId.data;
  const { prospectId, email, name, locale } = parsed.data;
  const db = getDb();

  try {
    // 2. Prospect requis.
    const prospectRows = await db
      .select({ status: prospects.status })
      .from(prospects)
      .where(eq(prospects.id, prospectId))
      .limit(1);
    const prospect = prospectRows[0];
    if (prospect === undefined) return { ok: false, code: "not_found" };

    // 3. Statut ouvrant l'espace client.
    if (!INVITABLE_PROSPECT_STATUSES.includes(prospect.status)) {
      return { ok: false, code: "invalid" };
    }

    // 4. Projet de livraison lié au prospect (le plus récent si plusieurs).
    const projectRows = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .innerJoin(quotes, eq(clientProjects.quoteId, quotes.id))
      .where(eq(quotes.prospectId, prospectId))
      .orderBy(desc(clientProjects.createdAt))
      .limit(1);
    const project = projectRows[0];
    if (project === undefined) return { ok: false, code: "invalid" };

    const expiresAtMs = Date.now() + INVITATION_TTL_MS;
    const expiresAt = new Date(expiresAtMs);

    // 5. Invitation non utilisée existante (email + rôle client + projet) →
    //    refresh.
    const existingRows = await db
      .select({ id: invitations.id, token: invitations.token })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.role, "client"),
          eq(invitations.projectId, project.id),
          isNull(invitations.usedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt))
      .limit(1);
    const existing = existingRows[0];

    let token: string;
    let invitationId: string;
    let reused = false;

    if (existing !== undefined) {
      // Réutilisation : seul `expiresAt` est rafraîchi (même jeton).
      token = existing.token;
      invitationId = existing.id;
      reused = true;
      await db
        .update(invitations)
        .set({ expiresAt })
        .where(eq(invitations.id, existing.id));
    } else {
      // Nouveau jeton : 32 octets aléatoires → 64 caractères hex.
      token = randomBytes(32).toString("hex");
      const inserted = await db
        .insert(invitations)
        .values({
          email,
          token,
          role: "client",
          projectId: project.id,
          expiresAt,
          createdBy: actorId,
        })
        .returning({ id: invitations.id });
      invitationId = inserted[0]?.id;
      if (invitationId === undefined) throw new Error("insert invitations sans retour");
    }

    // 6. E-mail d'invitation — **NON FATAL** : un échec Resend ne fait pas
    //    échouer l'action (le jeton est renvoyé au CEO en clair pour une
    //    remise manuelle). Enveloppe try/catch : même une exception
    //    inattendue ici laisserait la réponse en `{ ok: true, mailSent: false }`.
    let mailSent = false;
    try {
      const dict = await getPlatformDictionary(locale);
      const rawSubject = dict.auth.invitation.email.client.subject;
      const body = dict.auth.invitation.email.client.body;
      const lien = absoluteInterviewUrl(`/${locale}/invitation/${token}`);
      const subject = rawSubject.replaceAll("{{name}}", name).replaceAll("{{link}}", lien);
      const text = body.replaceAll("{{name}}", name).replaceAll("{{link}}", lien);
      const mail = await sendMail({ to: email, subject, text });
      if (mail.ok) {
        mailSent = true;
      } else {
        console.error(
          "[invitations] e-mail d'invitation non envoyé (invitation conservée)",
          mail.error,
        );
      }
    } catch (error) {
      console.error(
        "[invitations] e-mail d'invitation interrompu (invitation conservée)",
        error,
      );
    }

    // 7. Audit NON FATAL — **jamais le token** (métadonnées seulement).
    try {
      await db.insert(activities).values({
        actorId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: invitationId,
        meta: { email, name, prospectId, projectId: project.id, reused, expiresAtMs },
      });
    } catch (error) {
      console.error(
        "[invitations] activité `invitation.created` non journalisée (invitation émise)",
        error,
      );
    }

    // Jeton renvoyé EN CLAIR une fois (copie manuelle par le CEO) +
    // échéance en millisecondes Unix + succès d'envoi de l'e-mail.
    return { ok: true, token, expiresAt: expiresAtMs, mailSent };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500 (jamais un code
    // métier mensonger, jamais le jeton dans le journal).
    console.error("[invitations] échec de création de l'invitation", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// activateAccount — consommation du lien (public, client + sdr).
// ---------------------------------------------------------------------------

/**
 * Active le compte lié à une invitation (aucune session requise) — rôles
 * cibles `client` (portail) et `sdr` (recrutement, Lot 3).
 *
 * Étapes :
 * 1. Zod : jeton hex 64 car., nom ≥ 2 car., mot de passe ≥ 8 car. →
 *    `invalid`.
 * 2. Invitation inconnue → `invalid` (jeton absent : aucun détail).
 * 3. Rôle cible de l'invitation ∉ {`sdr`, `client`} → `invalid` (une
 *   invitation interne `ceo`/`manager`/`commercial` n'est jamais
 *   activable publiquement).
 * 4. Déjà consommée (`usedAt`) → `used`.
 * 5. Expirée (`expiresAt` dépassé) → `expired`.
 * 6. Email **déjà enregistré** → `duplicate` (**aucun takeover** : on ne
 *   rattache jamais un nouveau mot de passe à un compte existant).
 * 7. Invitation `client` **sans projet** (`projectId` nul — corruption ou
 *   ligne héritée) → `invalid` : un compte client sans projet n'aurait
 *   aucun espace.
 * 8. `hashPassword` (scrypt) puis **un seul `db.batch`** : insert `users`
 *    (`role` = rôle de l'invitation, `status: "active"`, `default_project_id`
 *    = projet de l'invitation pour `client` / `null` pour `sdr`) + UPDATE
 *    `used_at`. Course sur l'email unique → `23505` → `duplicate`.
 * 9. Audit `invitation.activated` — non fatal, **jamais le token ni le
 *    hash** ; `ip` (optionnelle) consignée en `meta` si fournie.
 *
 * ZÉRO FUIT : ni le hash, ni le mot de passe ne sont retournés, journalisés
 * ou stockés ailleurs que `users.password_hash`.
 *
 * @param input `token`, `name` (nom du compte créé), `password` (≥ 8 car.).
 * @param ip IP du navigateur (optionnelle) — audit uniquement.
 * @returns `{ ok: true }` ; sinon `invalid`, `used`, `expired` ou `duplicate`.
 * @throws Erreur d'infra (DB indisponible…) — journalisée puis propagée → 500.
 */
export async function activateAccount(
  input: ActivateAccountInput,
  ip?: string,
): Promise<ActivateAccountResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = activateInvitationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const { token, name, password } = parsed.data;
  // IP : saisie manuelle (paramètre hors schéma), tronquée à la longueur
  // maximale d'une adresse IPv6 — jamais de valeur hors format.
  const ipMeta =
    typeof ip === "string" && ip.trim().length > 0 ? ip.trim().slice(0, 45) : null;

  const db = getDb();

  try {
    // 2. Jeton → invitation.
    const invitationRows = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        projectId: invitations.projectId,
        expiresAt: invitations.expiresAt,
        usedAt: invitations.usedAt,
      })
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);
    const invitation = invitationRows[0];
    if (invitation === undefined) return { ok: false, code: "invalid" };

    // 3. Rôle cible : seuls `sdr` et `client` sont activables publiquement
    //    (invitation interne → `invalid`, aucun détail).
    if (invitation.role !== "sdr" && invitation.role !== "client") {
      return { ok: false, code: "invalid" };
    }

    // 4. Déjà consommée (avant l'échéance : l'ordre des contrôles est
    //    stable pour que le même lien ne renvoie jamais deux codes).
    if (invitation.usedAt !== null) return { ok: false, code: "used" };

    // 5. Échéance dépassée.
    if (invitation.expiresAt.getTime() <= Date.now()) return { ok: false, code: "expired" };

    // 6. Email déjà pourvu d'un compte → aucun takeover (ni mise à jour du
    //    mot de passe, ni changement de rôle sur un compte existant).
    const email = invitation.email.trim().toLowerCase();
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingUsers[0] !== undefined) return { ok: false, code: "duplicate" };

    // 7. Portail client : projet de livraison OBLIGATOIRE (colonne nullable
    //    depuis la migration 0003 — les invitations `sdr` n'en ont pas).
    if (invitation.role === "client" && invitation.projectId === null) {
      return { ok: false, code: "invalid" };
    }

    // 8. Hachage AVANT le lot (le hash n'est jamais conservé ailleurs que
    //    dans la ligne `users` insérée).
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const batchItems: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
      db.insert(users).values({
        email,
        name,
        passwordHash,
        // Rôle cible de l'invitation (`client` ou `sdr` — contrôlé §3).
        role: invitation.role,
        status: "active",
        // Seul le portail client a un projet de livraison ; un compte SDR
        // n'en a pas (`null`).
        defaultProjectId: invitation.role === "client" ? invitation.projectId : null,
      }),
      // Garde d'unicité : l'invitation n'est marquée utilisée que si elle
      // l'est encore (course éventuelle avec une seconde activation).
      db
        .update(invitations)
        .set({ usedAt: now })
        .where(and(eq(invitations.id, invitation.id), isNull(invitations.usedAt))),
    ];
    try {
      await db.batch(batchItems);
    } catch (error) {
      // Course sélection→insertion interceptée par l'index unique
      // `users_email_idx` → même code `duplicate` (aucun détail).
      if (isUniqueViolation(error)) return { ok: false, code: "duplicate" };
      throw error;
    }

    // 9. Audit NON FATAL — jamais de token, ni de hash, ni de mot de passe.
    try {
      await db.insert(activities).values({
        action: "invitation.activated",
        entityType: "invitation",
        entityId: invitation.id,
        meta: {
          email,
          role: invitation.role,
          projectId: invitation.projectId,
          ...(ipMeta !== null ? { ip: ipMeta } : {}),
        },
      });
    } catch (error) {
      console.error(
        "[invitations] activité `invitation.activated` non journalisée (compte créé)",
        error,
      );
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra : journalisée puis propagée → 500 (le hash et le mot
    // de passe ne figurent jamais dans le journal).
    console.error("[invitations] échec d'activation du compte", error);
    throw error;
  }
}

/**
 * TEMPoraire : simple délégation vers `activateAccount` — l'ancien nom est
 * encore appelé par `src/components/app/client/ActivateForm.tsx` (migration
 * portée par la vague Frontend B).
 * TEMPoraire : supprimé par la vague Frontend B.
 */
export async function activateClientAccount(
  input: ActivateAccountInput,
  ip?: string,
): Promise<ActivateAccountResult> {
  return activateAccount(input, ip);
}
