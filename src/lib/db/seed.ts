/**
 * Atheris — script de seed de démonstration, idempotent (T12 · DB-PENDING).
 *
 * ⚠ IDENTIFIANTS DE DÉMO UNIQUEMENT (domaine atherisdemo.dev) —
 * JAMAIS EXÉCUTER EN PRODUCTION.
 *
 * Trois garde-fous testables SANS base :
 *  0. `ALLOW_DEMO_SEED !== "1"` → NEUTRALISATION par défaut (Lot 3) : exit 0
 *     silencieux, aucune écriture, aucun import DB résolu ;
 *  1. `SEED_DEMO !== "1"` → refus explicite, aucune connexion tentée ;
 *  2. `DATABASE_URL` absente ou contenant « placeholder » → refus DB-PENDING
 *     (message clair tant que l'URL du `.env.local` n'est pas renseignée).
 *
 * Idempotence : chaque entité porte un identifiant FIXE (`seed-data.ts`) et
 * chaque insert est un upsert `onConflictDoUpdate(target: id)` → relançable à
 * l'identique sans duplication ni accumulation.
 *
 * ATOMICITÉ — `db.batch([...])` et non `db.transaction()` : le driver
 * `drizzle-orm/neon-http` (installé, v0.45.4) lève
 * « No transactions support in neon-http driver » sur `.transaction()`.
 * `db.batch()` repose en revanche sur l'endpoint « transaction » de Neon :
 * toutes les requêtes du lot partagent UNE transaction serveur (rollback
 * global en cas d'échec) — c'est l'équivalent transactionnel disponible.
 *
 * Lazy : `getDb()` est appelé UNIQUEMENT dans `main()`, jamais au top-level →
 * `next build` ne lit jamais `DATABASE_URL` ni la DB.
 *
 * Usage : `SEED_DEMO=1 npm run db:seed` (après avoir chargé `.env.local`).
 */

import { eq, sql } from "drizzle-orm";
import { config as loadEnv } from "dotenv";

import { getDb } from "@/lib/db";
import {
  activities,
  clientProjects,
  commissions,
  messages,
  milestones,
  payments,
  prospectBriefs,
  prospects,
  quotes,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";

import {
  SEED_ACTIVITY,
  SEED_BRIEF,
  SEED_CLIENT_USER_ID,
  SEED_COMMISSIONS,
  SEED_MILESTONES,
  SEED_MESSAGE,
  SEED_PAYMENT,
  SEED_PROSPECTS,
  SEED_PROJECT,
  SEED_QUOTE,
  SEED_TIMINGS,
  SEED_USERS,
} from "./seed-data";

const DAY_MS = 86_400_000;

/** Date UTC il y a `days` jours (dates de démo toujours « fraîches »). */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** Date UTC dans `days` jours (rappels planifiés). */
function inDays(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

/** Forme normalisée d'un email (règle métier : minuscules). */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Forme normalisée d'un téléphone (règle métier anti-doublon) :
 * `+213` / `00213` → `0`, puis chiffres uniquement.
 */
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00213")) return `0${digits.slice(5)}`;
  if (digits.startsWith("213")) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * Auto-contrôle des fixtures : les colonnes `email_norm` / `phone_norm`
 * (UNIQUE en DB) doivent correspondre à la règle métier appliquée aux formes
 * brutes — sinon les fixtures ont dérivé, on stoppe avant toute insertion.
 */
function assertFixtureNorms(): void {
  for (const p of SEED_PROSPECTS) {
    if (normalizeEmail(p.email) !== p.emailNorm) {
      throw new Error(
        `Fixture incohérente : emailNorm « ${p.emailNorm} » ≠ normalisation de « ${p.email} »`,
      );
    }
    if (normalizePhone(p.phone) !== p.phoneNorm) {
      throw new Error(
        `Fixture incohérente : phoneNorm « ${p.phoneNorm} » ≠ normalisation de « ${p.phone} »`,
      );
    }
  }
}

async function main(): Promise<void> {
  // Garde-fou 0 — LE SEED DE DÉMO EST NEUTRALISÉ (Lot 3) : aucune écriture en
  // base sans activation EXPLICITE `ALLOW_DEMO_SEED=1`. Le comportement par
  // défaut est un exit silencieux (code 0), pas une erreur : relancer le seed
  // par inattention (script, CI, commande npm) ne casse rien et n'écrit rien.
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    console.warn(
      "[seed] NEUTRALISÉ — aucune donnée de démo insérée. " +
        "Pour réactiver explicitement : ALLOW_DEMO_SEED=1 SEED_DEMO=1 npm run db:seed " +
        "(jamais en production).",
    );
    process.exit(0);
  }

  // Le script tourne hors Next.js : charger `.env.local` (dotenv ne
  // surcharge jamais une variable déjà présente dans l'environnement).
  loadEnv({ path: ".env.local" });

  // Garde-fou 1 — intention explicite requise (jamais en production).
  if (process.env.SEED_DEMO !== "1") {
    throw new Error(
      "Seed refusé : SEED_DEMO=1 requis (ex. SEED_DEMO=1 npm run db:seed) — jeu de démonstration, jamais en production.",
    );
  }

  // Garde-fou 2 — DB-PENDING : aucune connexion tant que l'URL est factice.
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("placeholder")) {
    throw new Error(
      "seed impossible : DATABASE_URL placeholder (DB-PENDING) — renseigner une URL Neon réelle dans .env.local puis relancer.",
    );
  }

  assertFixtureNorms();

  // Hachage scrypt des mots de passe de démo (parallélisé, ~7 comptes).
  console.log("[seed] garde-fous OK — hachage des mots de passe…");
  const userRows = await Promise.all(
    SEED_USERS.map(async (u) => ({
      id: u.id,
      email: u.email,
      passwordHash: await hashPassword(u.password),
      name: u.name,
      phone: u.phone,
      role: u.role,
      status: u.status,
      // Le projet par défaut du client est posé APRÈS le projet (FK) : voir
      // l'UPDATE en fin de lot ci-dessous.
      defaultProjectId: null,
    })),
  );

  // Client Drizzle lazy — aucune lecture de `DATABASE_URL` au top-level.
  const db = getDb();

  console.log("[seed] insertion du lot (transaction Neon via batch)…");
  await db.batch([
    // 1. users — upsert sur l'ID fixe (le hash est re-calculé à chaque run).
    db.insert(users)
      .values(userRows)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`excluded.email`,
          passwordHash: sql`excluded.password_hash`,
          name: sql`excluded.name`,
          phone: sql`excluded.phone`,
          role: sql`excluded.role`,
          status: sql`excluded.status`,
        },
      }),

    // 2. prospects — répartis sur le pipeline, normes d'anti-doublon contrôlées.
    db.insert(prospects)
      .values(
        SEED_PROSPECTS.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          company: p.company,
          email: p.email,
          phone: p.phone,
          emailNorm: p.emailNorm,
          phoneNorm: p.phoneNorm,
          source: p.source,
          sourceUserId: p.sourceUserId,
          status: p.status,
          disqualifyReason: p.disqualifyReason,
          nextReminderAt: p.nextReminderInDays === null ? null : inDays(p.nextReminderInDays),
        })),
      )
      .onConflictDoUpdate({
        target: prospects.id,
        set: {
          fullName: sql`excluded.full_name`,
          company: sql`excluded.company`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          emailNorm: sql`excluded.email_norm`,
          phoneNorm: sql`excluded.phone_norm`,
          source: sql`excluded.source`,
          sourceUserId: sql`excluded.source_user_id`,
          status: sql`excluded.status`,
          disqualifyReason: sql`excluded.disqualify_reason`,
          nextReminderAt: sql`excluded.next_reminder_at`,
        },
      }),

    // 3. prospect_briefs — fiche 3/5 du prospect « qualifie » (1-1, cible la
    //    colonne UNIQUE `prospect_id`).
    db.insert(prospectBriefs)
      .values({
        id: SEED_BRIEF.id,
        prospectId: SEED_BRIEF.prospectId,
        blockContext: SEED_BRIEF.blockContext,
        blockNeed: SEED_BRIEF.blockNeed,
        blockConstraints: SEED_BRIEF.blockConstraints,
        completedBlocks: SEED_BRIEF.completedBlocks,
        updatedBy: SEED_BRIEF.updatedBy,
      })
      .onConflictDoUpdate({
        target: prospectBriefs.prospectId,
        set: {
          blockContext: SEED_BRIEF.blockContext,
          blockNeed: SEED_BRIEF.blockNeed,
          blockConstraints: SEED_BRIEF.blockConstraints,
          completedBlocks: SEED_BRIEF.completedBlocks,
          updatedBy: SEED_BRIEF.updatedBy,
        },
      }),

    // 4. quotes — 1 devis signé (2 500 USD) sur le prospect « client_actif ».
    db.insert(quotes)
      .values({
        id: SEED_QUOTE.id,
        prospectId: SEED_QUOTE.prospectId,
        amountUsdCents: SEED_QUOTE.amountUsdCents,
        externalRef: SEED_QUOTE.externalRef,
        status: SEED_QUOTE.status,
        sentAt: daysAgo(SEED_TIMINGS.quoteSentDaysAgo),
        signedAt: daysAgo(SEED_TIMINGS.quoteSignedDaysAgo),
        createdBy: SEED_QUOTE.createdBy,
      })
      .onConflictDoUpdate({
        target: quotes.id,
        set: {
          prospectId: SEED_QUOTE.prospectId,
          amountUsdCents: SEED_QUOTE.amountUsdCents,
          externalRef: SEED_QUOTE.externalRef,
          status: SEED_QUOTE.status,
          sentAt: sql`excluded.sent_at`,
          signedAt: sql`excluded.signed_at`,
          createdBy: SEED_QUOTE.createdBy,
        },
      }),

    // 5. payments — acompte réglé : c'est lui qui déclenche les commissions.
    db.insert(payments)
      .values({
        id: SEED_PAYMENT.id,
        quoteId: SEED_PAYMENT.quoteId,
        label: SEED_PAYMENT.label,
        amountUsdCents: SEED_PAYMENT.amountUsdCents,
        dueAt: daysAgo(SEED_TIMINGS.paymentDueDaysAgo),
        paidAt: daysAgo(SEED_TIMINGS.paymentPaidDaysAgo),
        method: SEED_PAYMENT.method,
        createdBy: SEED_PAYMENT.createdBy,
      })
      .onConflictDoUpdate({
        target: payments.id,
        set: {
          quoteId: SEED_PAYMENT.quoteId,
          label: SEED_PAYMENT.label,
          amountUsdCents: SEED_PAYMENT.amountUsdCents,
          dueAt: sql`excluded.due_at`,
          paidAt: sql`excluded.paid_at`,
          method: SEED_PAYMENT.method,
          createdBy: SEED_PAYMENT.createdBy,
        },
      }),

    // 6a. commissions — sdr1 : 10 % (ratePercent = 100 dixièmes).
    db.insert(commissions)
      .values({
        id: SEED_COMMISSIONS[0].id,
        quoteId: SEED_COMMISSIONS[0].quoteId,
        beneficiaryId: SEED_COMMISSIONS[0].beneficiaryId,
        kind: SEED_COMMISSIONS[0].kind,
        ratePercent: SEED_COMMISSIONS[0].ratePercent,
        baseCents: SEED_COMMISSIONS[0].baseCents,
        amountCents: SEED_COMMISSIONS[0].amountCents,
        status: SEED_COMMISSIONS[0].status,
      })
      .onConflictDoUpdate({
        target: commissions.id,
        set: {
          ratePercent: SEED_COMMISSIONS[0].ratePercent,
          baseCents: SEED_COMMISSIONS[0].baseCents,
          amountCents: SEED_COMMISSIONS[0].amountCents,
          status: SEED_COMMISSIONS[0].status,
        },
      }),

    // 6b. commissions — Rayan : 5 % (ratePercent = 50 dixièmes).
    db.insert(commissions)
      .values({
        id: SEED_COMMISSIONS[1].id,
        quoteId: SEED_COMMISSIONS[1].quoteId,
        beneficiaryId: SEED_COMMISSIONS[1].beneficiaryId,
        kind: SEED_COMMISSIONS[1].kind,
        ratePercent: SEED_COMMISSIONS[1].ratePercent,
        baseCents: SEED_COMMISSIONS[1].baseCents,
        amountCents: SEED_COMMISSIONS[1].amountCents,
        status: SEED_COMMISSIONS[1].status,
      })
      .onConflictDoUpdate({
        target: commissions.id,
        set: {
          ratePercent: SEED_COMMISSIONS[1].ratePercent,
          baseCents: SEED_COMMISSIONS[1].baseCents,
          amountCents: SEED_COMMISSIONS[1].amountCents,
          status: SEED_COMMISSIONS[1].status,
        },
      }),

    // 7. client_projects — livraison du devis signé (1-1 via `quote_id` UNIQUE).
    db.insert(clientProjects)
      .values({
        id: SEED_PROJECT.id,
        quoteId: SEED_PROJECT.quoteId,
        name: SEED_PROJECT.name,
        status: SEED_PROJECT.status,
      })
      .onConflictDoUpdate({
        target: clientProjects.id,
        set: {
          name: SEED_PROJECT.name,
          status: SEED_PROJECT.status,
        },
      }),

    // 8. milestones — les 5 jalons (cadrage validé, design en cours, 3 en
    //    attente). Cible l'unique (project_id, key) ; `excluded.*` porte les
    //    valeurs propres à chaque ligne du lot.
    db.insert(milestones)
      .values(
        SEED_MILESTONES.map((m) => ({
          id: m.id,
          projectId: m.projectId,
          order: m.order,
          key: m.key,
          status: m.status,
          validatedAt: m.validatedByKey === null ? null : daysAgo(SEED_TIMINGS.cadrageValidatedDaysAgo),
          validatedBy: m.validatedByKey === "client" ? SEED_CLIENT_USER_ID : null,
        })),
      )
      .onConflictDoUpdate({
        target: [milestones.projectId, milestones.key],
        set: {
          order: sql`excluded.order`,
          status: sql`excluded.status`,
          validatedAt: sql`excluded.validated_at`,
          validatedBy: sql`excluded.validated_by`,
        },
      }),

    // 9. users → projet par défaut du compte CLIENT (post-projet, la FK
    //    `default_project_id` → `client_projects.id` exige l'ordre ci-dessus).
    db.update(users)
      .set({ defaultProjectId: SEED_PROJECT.id })
      .where(eq(users.id, SEED_CLIENT_USER_ID)),

    // 10. messages — 1 message de démo dans le projet.
    db.insert(messages)
      .values({
        id: SEED_MESSAGE.id,
        projectId: SEED_MESSAGE.projectId,
        senderId: SEED_MESSAGE.senderId,
        body: SEED_MESSAGE.body,
        createdAt: daysAgo(SEED_TIMINGS.messageDaysAgo),
        readAt: daysAgo(SEED_TIMINGS.messageReadDaysAgo),
      })
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          senderId: SEED_MESSAGE.senderId,
          body: SEED_MESSAGE.body,
          createdAt: sql`excluded.created_at`,
          readAt: sql`excluded.read_at`,
        },
      }),

    // 11. activities — trace d'audit du seed (actor = CEO démo).
    db.insert(activities)
      .values({
        id: SEED_ACTIVITY.id,
        actorId: SEED_ACTIVITY.actorId,
        action: SEED_ACTIVITY.action,
        entityType: SEED_ACTIVITY.entityType,
        entityId: SEED_ACTIVITY.entityId,
        meta: SEED_ACTIVITY.meta,
        createdAt: daysAgo(SEED_TIMINGS.messageDaysAgo),
      })
      .onConflictDoUpdate({
        target: activities.id,
        set: {
          actorId: SEED_ACTIVITY.actorId,
          action: SEED_ACTIVITY.action,
          entityType: SEED_ACTIVITY.entityType,
          entityId: SEED_ACTIVITY.entityId,
          meta: SEED_ACTIVITY.meta,
        },
      }),
  ]);

  console.log(
    `[seed] ${SEED_USERS.length} comptes · ${SEED_PROSPECTS.length} prospects · ` +
      "1 brief (3/5) · 1 devis signé · 1 acompte · 2 commissions · " +
      "1 projet + 5 jalons · 1 message · 1 activité",
  );
  console.log("[seed] terminé — idempotent, relançable à l'identique.");
}

// `main()` est lancée ici mais `getDb()` n'est appelé qu'à l'intérieur :
// l'import du module (build) n'ouvre jamais de connexion.
main().catch((error: unknown) => {
  console.error(
    "[seed] ÉCHEC —",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
