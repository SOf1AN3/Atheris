/**
 * Atheris — helper central d'écriture des notifications IN-APP
 * (Lot 4 · PLAN.md §2.1 · contrat inter-pistes C2).
 *
 * ⚠ MODULE **SERVEUR UNIQUEMENT**, mais SANS directive `"use server"` :
 * ce n'est ni une Server Action, ni un module appelable depuis le navigateur.
 * Il importe `getDb()` (`neon()` lit `process.env`) → **il est INTERDIT de
 * l'importer (directement ou via un fichier intermédiaire) depuis un
 * composant `"use client"`** : cela casserait le bundle client. Seuls des
 * Server Actions / Route Handlers / Server Components doivent l'importer.
 *
 * CONTRAT PUBLIC :
 * ```ts
 * notify(input: NotifyInput): Promise<void>
 * ```
 * `NotifyInput = { type, link, meta?, recipientIds, dedupeKey? }`.
 *
 * DOCTRINE « JAMAIS FATAL » (motif des audits `activities`) — `notify()` ne
 * peut JAMAIS faire échouer l'action qui la déclenche :
 * - une entrée invalide (type hors liste fermée, lien non local, uuid
 *   malformé) → **retour silencieux** (aucune écriture, aucun throw) ;
 * - `recipientIds` : chaque id est validé par Zod (`z.uuid()`), dédupliqué,
 *   liste vide après filtrage → retour silencieux ;
 * - toute erreur DB → `console.error` + **ZÉRO rethrow** (try/catch global
 *   qui n'a aucune branche `throw`) ;
 * - purge opportunistique > 30 j : requête séparée NON FATALE (un échec de
 *   purge n'annule jamais l'écriture déjà faite).
 *
 * DÉDUPLICATION — index UNIQUE PARTIEL
 * `notifications_recipient_dedupe_uq (recipient_id, dedupe_key) WHERE
 * dedupe_key IS NOT NULL` :
 * - `dedupeKey` fourni → un INSERT par destinataire dans **un `db.batch()`
 *   (neon-http : aucun `db.transaction()`)**, chacun avec
 *   **`.onConflictDoNothing()` SANS `target`** — choix assumé : Drizzle
 *   exige pour un `target` un index/couche d'arbitrage exact, or l'index est
 *   PARTIEL (`WHERE dedupe_key IS NOT NULL`) et l'inférence d'arbitre sur un
 *   index partiel est fragile (Postgres peut rejeter la cible). Sans `target`,
 *   `ON CONFLICT DO NOTHING` global accepte tout conflit : ici le seul
 *   index unique autre que la PK est celui de dédup, donc le comportement
 *   recherché est exact (ligne déjà présente → ignorée, jamais d'erreur) ;
 * - `dedupeKey` absente → insertion simple en une seule requête (aucun
 *   conflit possible, la colonne est `NULL` et les `NULL` sont distincts).
 *
 * AUCUNE LOGIQUE MÉTIER NI RBAC ICI (PLAN §2.2) : `notify()` ne filtre ni
 * rôle, ni statut, ni acteur — chaque appelant résout SES uuid (avec le
 * filtre anti-acteur « jamais notifier l'auteur de l'acte ») en amont.
 * Seul le helper `activeUserIdsByRoles` ci-dessous factorise le SELECT
 * répété dans ~8 appelants (`role IN (…) AND status = 'active'`) — son
 * résultat reste à filtrer contre l'acteur par l'appelant (règle d'or D4 :
 * la liste des rôles ne contient JAMAIS `commercial`).
 */

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { isRole, type Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types publics — liste FERMÉE des 12 événements (PLAN §2.2 · contrat C3).
// ---------------------------------------------------------------------------

/**
 * Type de notification — les 12 valeurs fermées (le runtime `z.enum` est
 * dérivé de ce tableau : source de vérité unique, toute valeur ajoutée ici
 * fait échouer la compilation du `Record<NotificationType, …>` côté dict).
 */
const NOTIFICATION_TYPES = [
  "contact_received",
  "application_created",
  "interview_booked",
  "prospect_status_changed",
  "quote_signed",
  "project_message",
  "commission_due",
  "commission_paid",
  "milestone_validated",
  "account_activated",
  "reminder_due",
  "mail_failed",
] as const;

/** Type de notification — liste fermée (12 valeurs). */
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotifyInput = {
  type: NotificationType;
  /** Chemin sans locale, ex. "/espace/prospects/{id}". */
  link: string;
  /** Contexte de rendu (noms, libellés bruts) — jamais de phrase traduite. */
  meta?: Record<string, string>;
  /** Destinataires DÉJÀ résolus par l'appelant (uuid). */
  recipientIds: string[];
  /** Anti-doublon optionnel (ex. "reminder:{prospectId}:{instantISO}"). */
  dedupeKey?: string;
};

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT toute requête.
// ---------------------------------------------------------------------------

/** uuid strict — un id malformé est filtré (il ne fait pas échouer le lot). */
const uuidSchema = z.uuid();

/**
 * Enveloppe de l'entrée : `recipientIds` accepte des chaînes quelconques pour
 * être filtrées uuid par uuid (un id invalide est retiré, les autres passent).
 */
const notifyEnvelopeSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  // Chemin SANS locale : commence toujours par "/" (convention nav).
  link: z.string().trim().min(1).max(1024).refine((value) => value.startsWith("/")),
  meta: z.record(z.string().max(64), z.string().max(500)).optional(),
  recipientIds: z.array(z.unknown()),
  dedupeKey: z.string().min(1).max(255).optional(),
});

// ---------------------------------------------------------------------------
// notify — écriture non fatal des notifications.
// ---------------------------------------------------------------------------

/**
 * Écrit les notifications IN-APP pour chaque destinataire valide.
 *
 * @param input `{ type, link, meta?, recipientIds, dedupeKey? }` — `link`
 *   est un chemin **sans locale** (le client préfixe), `meta` un contexte de
 *   rendu en strings brutes (jamais de phrase traduite), `recipientIds` des
 *   uuid déjà résolus par l'appelant (rôle/statut/acteur gérés EN AMONT).
 * @returns `Promise<void>` — **toujours**, quelle que soit la situation :
 *   entrée invalide (retour silencieux), liste vide (retour silencieux),
 *   erreur DB (journalisée). **ZÉRO throw** (try/catch global sans rethrow).
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    // 1. Validation de l'enveloppe — échec → retour silencieux (jamais fatal).
    const parsed = notifyEnvelopeSchema.safeParse(input);
    if (!parsed.success) {
      console.error("[notify] entrée invalide — écriture ignorée (non fatal)");
      return;
    }

    const { type, link, meta, dedupeKey } = parsed.data;

    // 2. Destinataires : uuid validés un à un, dédupliqués, ≠ vide.
    const recipientIds = [
      ...new Set(
        parsed.data.recipientIds.flatMap((value) => {
          const result = uuidSchema.safeParse(value);
          return result.success ? [result.data] : [];
        }),
      ),
    ];
    if (recipientIds.length === 0) return;

    const db = getDb();
    const payload = { type, link, meta: meta ?? {}, dedupeKey: dedupeKey ?? null };

    // 3. Écriture.
    if (dedupeKey !== undefined) {
      // Dédup fournie → un INSERT par destinataire dans UN `db.batch`
      // (neon-http : pas de transaction), `.onConflictDoNothing()` sans
      // `target` (index PARTIEL : voir en-tête, choix assumé).
      const statements = recipientIds.map((recipientId) =>
        db.insert(notifications).values({ ...payload, recipientId }),
      );
      const items: BatchItem<"pg">[] = statements.map((statement): BatchItem<"pg"> =>
        statement.onConflictDoNothing(),
      );
      // Tuple non vide garanti : `recipientIds.length > 0` (contrôle §2).
      const [first, ...rest] = items;
      if (first === undefined) return;
      await db.batch([first, ...rest]);
    } else {
      // Pas de dédup → insertion simple en une seule requête multi-lignes.
      await db
        .insert(notifications)
        .values(recipientIds.map((recipientId) => ({ ...payload, recipientId })));
    }

    // 4. Purge opportunistique (> 30 jours) — NON FATALE : un échec de purge
    //    n'annule jamais l'écriture qui vient de réussir.
    try {
      await db
        .delete(notifications)
        .where(lt(notifications.createdAt, sql`now() - interval '30 days'`));
    } catch (error) {
      console.error("[notify] purge des notifications > 30 j impossible (non fatal)", error);
    }
  } catch (error) {
    // Try/catch global : JAMAIS de rethrow (une notification ne fait jamais
    // échouer l'action métier qui la déclenche — PLAN §2.1).
    console.error("[notify] échec d'écriture des notifications (non fatal)", error);
  }
}

// ---------------------------------------------------------------------------
// Résolution de destinataires — SELECT facteurisé (choix assumé, voir en-tête).
// ---------------------------------------------------------------------------

/**
 * Ids des comptes **actifs** dont le rôle appartient à `roles`
 * (`SELECT id FROM users WHERE role IN (…) AND status = 'active'`).
 *
 * Factorisation assumée : ce SELECT revient dans ~8 appelants de la matrice
 * §2.2 (contact, careers, interviews, status, messages, commissions, project,
 * invitations, recrutement, prospects). Le filtre **anti-acteur** reste du
 * ressort de l'appelant (règle d'or : `filter((id) => id !== actor.id)`), et
 * la liste `roles` ne contient **JAMAIS `commercial`** en v1 (décision D4) :
 * c'est ici que se fait la bascule future en un seul endroit.
 *
 * @param roles Rôles recherchés (invalides ignorés — filet `isRole`).
 * @returns Les uuid correspondants, **`[]` en cas d'échec DB** (non fatal :
 *   l'appelant n'attend que des destinataires, jamais une erreur).
 */
export async function activeUserIdsByRoles(roles: readonly Role[]): Promise<string[]> {
  try {
    const validRoles = [...new Set(roles.filter((role): role is Role => isRole(role)))];
    if (validRoles.length === 0) return [];

    const db = getDb();
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, validRoles), eq(users.status, "active")));
    return rows.map((row) => row.id);
  } catch (error) {
    console.error("[notify] résolution des destinataires impossible (non fatal)", error);
    return [];
  }
}
