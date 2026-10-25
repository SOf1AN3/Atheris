/**
 * Atheris — schéma Drizzle (PostgreSQL / Neon) : 13 tables (T02 · PLAN.md §1.2).
 *
 * Conventions retenues (à confirmer par le Reviewer) :
 *
 * 1. NOMMAGE — constantes TypeScript camelCase, noms SQL snake_case **explicites**
 *    (`prospectBriefs` → table `prospect_briefs`, `passwordHash` → colonne
 *    `password_hash`). Conforme au PLAN.md §1.2 qui décrit le schéma SQL en
 *    snake_case (tables `prospect_briefs` / `client_projects` / `login_attempts`
 *    et colonnes `email_norm`, `source_user_id`, `created_at`…). Les requêtes
 *    Drizzle s'appuient sur les propriétés TS ; une raw SQL éventuelle doit
 *    respecter le snake_case (ex. `WHERE source_user_id = …`, PLAN §Sécurité).
 *
 * 2. TIMESTAMPS — **tous** `timestamptz` (`withTimezone: true`, helper `tstz`) :
 *    stockage UTC (PLAN §edge cases « Fuseau »), rendu Africa/Algiers côté UI.
 *    `createdAt`/`updatedAt` → `defaultNow()` ; `updatedAt` reçoit `$onUpdate`
 *    pour être repositionné par Drizzle à chaque UPDATE.
 *
 * 3. MONTANTS — entiers en **centimes USD** (`*UsdCents`, `amountCents`) :
 *    aucun flottant, aucun `numeric` (pas d'arrondi binaire).
 *
 * 4. TAUX DE COMMISSION — `ratePercent` : integer en **DIXIÈMES de pourcentage**
 *    (100 = 10,0 % ; barème « 12,5 % » → 125). Précision 0,1 %, suffisante pour
 *    le barème à paliers (PLAN §1.3) et sans virgule flottante.
 *
 * 5. CONTRÔLES APPLICATIFS (aucun CHECK en DB, hors périmètre T02) : montants
 *    ≥ 0, `messages.body` ≤ 2000 caractères, `documents.bytes` ≤ 5 Mo, valeurs
 *    de `clientProjects.status` ∈ {`en_livraison`, `clos`} → validation Zod dans
 *    `src/actions/*`.
 *
 * 6. FOREIGN KEYS — `onDelete` explicite : `cascade` pour les objets dépendants
 *    (briefs, jalons, paiements, commissions, messages), `set null` pour
 *    `sourceUserId` et `uploadedBy` (spec T02), `no action` (défaut) partout
 *    ailleurs — y compris les colonnes « auteur » (`createdBy`, `updatedBy`,
 *    `senderId`…) : supprimer physiquement un compte référencé échoue, ce qui
 *    est acceptable ici puisque les comptes sont désactivés, jamais supprimés.
 *    Les choix non évidents sont commentés sous chaque table.
 *
 * 7. CYCLE DE TYPES TS (TS7022 / TS7024) — plusieurs FK pointent vers une
 *    table déclarée PLUS BAS (`users.default_project_id` → `client_projects`,
 *    `quotes.pdf_document_id` → `documents`, et le cycle
 *    users → client_projects → quotes → prospects → users). TypeScript refuse
 *    d'inférer les thunks `() => table.col` à l'intérieur de ce cycle : chaque
 *    thunk porte donc une annotation de retour EXPLICITE `(): PgColumn =>`,
 *    qui casse l'inférence circulaire (le corps n'est contrôlé qu'après
 *    résolution de toutes les déclarations). NE PAS retirer ces annotations
 *    sous peine de voir `tsc --noEmit` échouer.
 *
 * ⚠ RÈGLE DB-PENDING (PLAN.md) : `npm run db:generate` (100 % offline) produit
 * la migration SQL versionnée dans `drizzle/`, mais `npm run db:migrate` n'est
 * PAS lancé tant que `DATABASE_URL` est un placeholder — la vraie migration sera
 * exécutée en fin de plan sur la chaîne Neon réelle.
 */

import {
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums — types SQL exportés tels quels par la migration.
// ---------------------------------------------------------------------------

/** Rôle d'un compte interne ou client. */
export const roleEnum = pgEnum("role", [
  "ceo",
  "manager",
  "commercial",
  "vendeur",
  "client",
]);

/** Statut d'une candidature/compte : pending = inscription non encore validée. */
export const userStatusEnum = pgEnum("user_status", [
  "pending",
  "active",
  "rejected",
  "disabled",
]);

/** Les 10 états du pipeline (structure.md §4.1). */
export const prospectStatusEnum = pgEnum("prospect_status", [
  "nouveau",
  "contacte",
  "qualifie",
  "devis_envoye",
  "signe",
  "client_actif",
  "en_livraison",
  "clos",
  "perdu",
  "disqualifie",
]);

/** Canal d'acquisition d'un prospect (lead = sourceUserId nul pour landing/ads). */
export const prospectSourceEnum = pgEnum("prospect_source", [
  "ldg",
  "ads",
  "landing",
  "rayan",
  "ceo",
]);

/** Cycle de vie d'un devis. */
export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "signed",
  "lost",
]);

/** État d'une ligne de commission (due = à verser). */
export const commissionStatusEnum = pgEnum("commission_status", [
  "due",
  "paid",
]);

/** Bénéficiaire type : vendeur (palier) ou manager (5 % Rayan). */
export const commissionKindEnum = pgEnum("commission_kind", [
  "seller",
  "manager",
]);

/** Les 5 jalons imposés d'une livraison (timeline client). */
export const milestoneKeyEnum = pgEnum("milestone_key", [
  "cadrage",
  "design",
  "dev",
  "recette",
  "mise_en_ligne",
]);

/** État d'un jalon. `en_livraison`/`clos` sont gérés en logique applicative. */
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "en_attente",
  "en_cours",
  "valide",
]);

/** Type de fichier PDF produit par l'application. */
export const documentKindEnum = pgEnum("document_kind", [
  "devis",
  "contrat",
  "facture",
  "livrable",
]);

/** Propriétaire polymorphe d'un document (pas de FK possible → index simple). */
export const documentOwnerEnum = pgEnum("document_owner", [
  "prospect",
  "project",
]);

/**
 * État d'un lien d'entretien (PLAN §1.1) : `pending` = créneau réservé,
 * `cancelled` = annulé (le créneau redevient libre, voir l'index partiel de
 * `interviews`), `done` = entretien réalisé.
 *
 * Nom d'export `interviewStatus` (et non `*Enum`) : c'est le nom figé par le
 * contrat inter-pistes du PLAN §Contrats (`import { interviews, interviewStatus }`).
 */
export const interviewStatus = pgEnum("interview_status", [
  "pending",
  "cancelled",
  "done",
]);

// ---------------------------------------------------------------------------
// Types colonnes utilitaires.
// ---------------------------------------------------------------------------

/**
 * Convention unique T02 : tout instant est `timestamptz` (jamais `timestamp`
 * « sans zone ») pour garantir le stockage UTC sur Neon.
 */
const tstz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Colonne `bytea` — drizzle-orm 0.45.4 n'expose **aucune** colonne native
 * `bytea` dans `pg-core` (vérifié : ni `columns/*`, ni export racine) ;
 * `customType` est la solution officielle. Côté application et driver Neon la
 * valeur est un `Buffer` ; `dataType()` fournit le type DDL des migrations
 * (`"bytes" bytea`).
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** `jsonb NOT NULL DEFAULT '{}'` — objet JSON au départ, jamais `null`. */
const jsonbObject = (name: string) =>
  jsonb(name).$type<Record<string, unknown>>().notNull().default({});

// ---------------------------------------------------------------------------
// 1. users — comptes (rôles + statut de candidature).
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    role: roleEnum("role").notNull(),
    status: userStatusEnum("status").notNull().default("pending"),
    // Compte « porteur » du projet : renseigné côté client après invitation.
    // (La FK est déclarée en extraConfig ci-dessous.)
    defaultProjectId: uuid("default_project_id"),
    createdAt: tstz("created_at").defaultNow(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    // FK « déclarée vers le bas » : `clientProjects` n'existe pas encore à ce
    // point du module. `foreignKey()` en extraConfig est évalué paresseusement
    // par Drizzle (au moment de produire le SQL) : le cycle d'exécution
    // users → client_projects → quotes → prospects → users est donc résolu —
    // la ligne de partage est le type de retour EXPLICITE `(): PgColumn =>`
    // posé sur chaque thunk `.references()` du fichier (voir note « cycle TS »
    // en tête de fichier).
    // `onDelete` non spécifié → `no action` (spec T02 : `set null` réservé à
    // `sourceUserId`/`uploadedBy`). Conséquence assumée : supprimer un projet
    // référencé comme projet par défaut d'un compte échoue (jamais de projet
    // supprimé en base, la clôture est applicative via `client_projects.status`).
    foreignKey({
      columns: [t.defaultProjectId],
      foreignColumns: [clientProjects.id],
    }),
  ],
);

// ---------------------------------------------------------------------------
// 2. prospects — pipeline commercial (dédoublonnage sur emailNorm/phoneNorm).
// ---------------------------------------------------------------------------

export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    company: text("company"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    // Formes normalisées (minuscules/chiffres) : UNIQUE = anti-doublon DB.
    emailNorm: text("email_norm").notNull(),
    phoneNorm: text("phone_norm").notNull(),
    source: prospectSourceEnum("source").notNull().default("ldg"),
    // Lead `landing`/`ads` sans bénéficiaire → NULL + `set null` si le compte
    // de référence est supprimé (les scoping vendeur passent par cette colonne).
    sourceUserId: uuid("source_user_id").references((): PgColumn => users.id, {
      onDelete: "set null",
    }),
    status: prospectStatusEnum("status").notNull().default("nouveau"),
    disqualifyReason: text("disqualify_reason"),
    nextReminderAt: tstz("next_reminder_at"),
    createdAt: tstz("created_at").defaultNow(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("prospects_email_norm_idx").on(t.emailNorm),
    uniqueIndex("prospects_phone_norm_idx").on(t.phoneNorm),
    index("prospects_status_idx").on(t.status),
    index("prospects_source_user_id_idx").on(t.sourceUserId),
  ],
);

// ---------------------------------------------------------------------------
// 3. prospect_briefs — fiche projet 5 blocs, liaison 1-1 avec le prospect.
// ---------------------------------------------------------------------------

export const prospectBriefs = pgTable(
  "prospect_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 1-1 : contrainte UNIQUE + cascade (la fiche n'existe pas sans son
    // prospect).
    prospectId: uuid("prospect_id")
      .references((): PgColumn => prospects.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    // 5 blocs de l'assistant fiche (commercial), complétés pas à pas.
    blockContext: jsonbObject("block_context"),
    blockNeed: jsonbObject("block_need"),
    blockConstraints: jsonbObject("block_constraints"),
    blockTech: jsonbObject("block_tech"),
    blockFollowUp: jsonbObject("block_follow_up"),
    completedBlocks: integer("completed_blocks").notNull().default(0),
    updatedBy: uuid("updated_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
);

// ---------------------------------------------------------------------------
// 4. quotes — devis (montants en centimes USD, statuts draft→sent→signed/lost).
// ---------------------------------------------------------------------------

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // `no action` : un devis rattaché à un prospect ne peut pas disparaître en
    // supprimant silencieusement le prospect (archivage applicatif à la place).
    prospectId: uuid("prospect_id")
      .references((): PgColumn => prospects.id)
      .notNull(),
    amountUsdCents: integer("amount_usd_cents").notNull(), // ≥ 0 (Zod)
    externalRef: text("external_ref"),
    status: quoteStatusEnum("status").notNull().default("draft"),
    // Référence « déclarée vers le bas » vers `documents` (résolue
    // paresseusement). `no action` (spec T02) : le PDF d'un devis ne peut pas
    // disparaître sans que le devis soit mis à jour au préalable — pas de
    // détachement silencieux d'un devis signé.
    pdfDocumentId: uuid("pdf_document_id").references((): PgColumn => documents.id),
    sentAt: tstz("sent_at"),
    signedAt: tstz("signed_at"),
    createdBy: uuid("created_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("quotes_prospect_id_idx").on(t.prospectId)],
);

// ---------------------------------------------------------------------------
// 5. payments — échéancier d'un devis (acompte / échéances).
// ---------------------------------------------------------------------------

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // cascade : l'échéancier appartient au devis, il n'a aucun sens seul.
    quoteId: uuid("quote_id")
      .references((): PgColumn => quotes.id, { onDelete: "cascade" })
      .notNull(),
    label: text("label").notNull(), // « Acompte », « Échéance 1 »…
    amountUsdCents: integer("amount_usd_cents").notNull(), // ≥ 0 (Zod)
    dueAt: tstz("due_at"),
    paidAt: tstz("paid_at"),
    method: text("method"),
    note: text("note"),
    createdBy: uuid("created_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [index("payments_quote_id_idx").on(t.quoteId)],
);

// ---------------------------------------------------------------------------
// 6. commissions — barème figé (snapshot) à la génération, anti-double via
//    l'index unique (quote_id, beneficiary_id, kind).
// ---------------------------------------------------------------------------

export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // cascade : une commission n'existe que par son devis.
    quoteId: uuid("quote_id")
      .references((): PgColumn => quotes.id, { onDelete: "cascade" })
      .notNull(),
    // NULL = « deal sans bénéficiaire » (lead Ads/Sales Partner orphelin) → file CEO avec
    // bannière. L'index unique ci-dessous traite les NULL comme distincts :
    // deux lignes sans bénéficiaire coexistent, l'idempotence reste garantie
    // dès qu'un bénéficiaire est identifié.
    beneficiaryId: uuid("beneficiary_id").references((): PgColumn => users.id),
    kind: commissionKindEnum("kind").notNull(),
    // Taux SNAPSHOT au déclenchement, en DIXIÈMES de pourcentage :
    // 100 = 10,0 % · 125 = 12,5 % · 130 = 13,0 % (jamais rétroactif, PLAN §1.3).
    ratePercent: integer("rate_percent").notNull(),
    baseCents: integer("base_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: commissionStatusEnum("status").notNull().default("due"),
    paidAt: tstz("paid_at"),
    paidBy: uuid("paid_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [
    // Anti-double-génération (idempotence au double clic / double paiement).
    uniqueIndex("commissions_quote_id_beneficiary_id_kind_idx").on(
      t.quoteId,
      t.beneficiaryId,
      t.kind,
    ),
    index("commissions_beneficiary_id_idx").on(t.beneficiaryId),
    index("commissions_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// 7. client_projects — livraison (1-1 avec un devis signé).
// ---------------------------------------------------------------------------

export const clientProjects = pgTable(
  "client_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // UNIQUE : un projet par devis ; `no action` : on ne supprime pas un devis
    // qui porte déjà une livraison en cours (clôture applicative à la place).
    quoteId: uuid("quote_id")
      .references((): PgColumn => quotes.id)
      .notNull()
      .unique(),
    name: text("name").notNull(),
    // Texte brut (pas d'enum) : valeurs {en_livraison, clos} vérifiées en Zod —
    // un enum SQL figerait une évolution métier derrière une migration.
    status: text("status").notNull().default("en_livraison"),
    createdAt: tstz("created_at").defaultNow(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
);

// ---------------------------------------------------------------------------
// 8. milestones — les 5 jalons d'un projet (timeline client).
// ---------------------------------------------------------------------------

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // cascade : les jalons n'ont pas de raison de survivre à leur projet.
    projectId: uuid("project_id")
      .references((): PgColumn => clientProjects.id, { onDelete: "cascade" })
      .notNull(),
    order: integer("order").notNull(), // 1 à 5 (Zod)
    key: milestoneKeyEnum("key").notNull(),
    status: milestoneStatusEnum("status").notNull().default("en_attente"),
    validatedAt: tstz("validated_at"),
    validatedBy: uuid("validated_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [
    // Anti-doublon métier : un jalon-clé par projet.
    uniqueIndex("milestones_project_id_key_idx").on(t.projectId, t.key),
    // Ordre canonique (cadrage → design → dev → recette → mise_en_ligne).
    uniqueIndex("milestones_project_id_order_idx").on(t.projectId, t.order),
  ],
);

// ---------------------------------------------------------------------------
// 9. documents — conteneurs PDF (bytes en mémoire, ≤ 5 Mo, jamais en /public).
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: documentOwnerEnum("owner_type").notNull(),
    // Propriétaire POLYMORPHE (prospect ou projet) : impossible à référencer en
    // FK → colonne uuid nue + index composite (owner_type, owner_id) ci-dessous.
    ownerId: uuid("owner_id").notNull(),
    kind: documentKindEnum("kind").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    byteSize: integer("byte_size").notNull(), // ≤ 5 Mo (Zod + route handler)
    bytes: bytea("bytes").notNull(),
    // Spec T02 : `set null` — conserver le fichier même si le compte est
    // supprimé (l'audit et les PDF signés ne doivent pas disparaître).
    uploadedBy: uuid("uploaded_by").references((): PgColumn => users.id, {
      onDelete: "set null",
    }),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [index("documents_owner_idx").on(t.ownerType, t.ownerId)],
);

// ---------------------------------------------------------------------------
// 10. invitations — lien d'accès au portail client (48 h, jeton unique).
// ---------------------------------------------------------------------------

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    token: text("token").notNull(),
    // `no action` (hors périmètre `cascade` de la spec T02) : une invitation
    // ne doit pas être détruite silencieusement avec son projet — point à
    // confirmer auprès du Lead/Reviewer.
    projectId: uuid("project_id")
      .references((): PgColumn => clientProjects.id)
      .notNull(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdBy: uuid("created_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_idx").on(t.token),
    index("invitations_email_idx").on(t.email),
  ],
);

// ---------------------------------------------------------------------------
// 11. activities — journal d'audit (écrit par chaque Server Action).
// ---------------------------------------------------------------------------

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = action système (cron, seed) ; `no action` : jamais d'audit orphelin.
    actorId: uuid("actor_id").references((): PgColumn => users.id),
    action: text("action").notNull(), // ex. « prospect.created », « status.changed »
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    // `from` / `to` / `reason` pour les changements de statut (Zod applicatif).
    meta: jsonbObject("meta"),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [
    index("activities_entity_idx").on(t.entityType, t.entityId),
    index("activities_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// 12. messages — messagerie projet (client ↔ équipe).
// ---------------------------------------------------------------------------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // cascade : pas de conversation sans projet.
    projectId: uuid("project_id")
      .references((): PgColumn => clientProjects.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references((): PgColumn => users.id)
      .notNull(),
    body: text("body").notNull(), // ≤ 2000 caractères (Zod)
    readAt: tstz("read_at"),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [index("messages_project_id_idx").on(t.projectId)],
);

// ---------------------------------------------------------------------------
// 13. login_attempts — base du rate-limit connexion (5 échecs / 15 min).
// ---------------------------------------------------------------------------

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ip: text("ip"),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [
    // Lecture « count des échecs récents pour (email, ip) » : index composite.
    index("login_attempts_email_created_at_idx").on(t.email, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// 14. interviews — lien d'entretien Sales Partner (PLAN §1.1). Table autopportante :
//     aucune FK vers `users`/`prospects` (le lien est PUBLIC et ouvert par un
//     candidat anonyme ; le rattachement éventuel se fait côté applicatif).
// ---------------------------------------------------------------------------

/**
 * Entretien planifié via un lien à usage unique (token 32 bytes hex).
 *
 * - **Stockage UTC** : `startsAt`/`notifiedAt`/`createdAt` sont tous
 *   `timestamptz` (helper `tstz`, convention n° 2 de l'en-tête) — l'instant
 *   absolu du créneau est stocké en UTC, quel que soit le fuseau du candidat ;
 *   le rendu « heure locale du candidat » (`localDate`/`localHour` en text) et
 *   le fuseau IANA (`timezone`) sont conservés tels que choisis côté client et
 *   **revalidés serveur** (anti-falsification + DST, PLAN §Sécurité 3) avant
 *   l'INSERT. `localDate`/`localHour` sont donc des valeurs de présentation,
 *   pas une source de vérité temporelle.
 * - **Index unique PARTIEL** `interviews_pending_starts_at_uq` : il ne
 *   contraint que les lignes **réellement réservées**, c'est-à-dire
 *   `status = 'pending' AND email_norm <> ''`. Cette double condition est
 *   indispensable :
 *   1. `email_norm <> ''` — une ligne est créée **avant** la réservation
 *      (le lien est pré-généré : `emailNorm = ""` marque « pas encore
 *      réservé », `startsAt` y porte une sentinelle = instant de création).
 *      Sans cette clause, deux liens créés dans la même milliseconde se
 *      heurteraient déjà à l'index, et la sentinelle d'une ligne libre
 *      pourrait entrer en collision avec un créneau réservé ailleurs.
 *   2. `status = 'pending'` — une annulation (`cancelled`) ou un entretien
 *      `done` **libère** le créneau ; un unique non partiel bloquerait
 *      définitivement son réemploi.
 *   Le conflit d'index n'a donc lieu QUE sur une double réservation du même
 *   créneau : il est intercepté par le backend et renvoyé en code `taken`
 *   (PLAN §2.3).
 */
export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Jeton d'accès public (32 bytes hex) : UNIQUE = 404 générique sans
    // énumération possible (PLAN §Sécurité 1).
    token: text("token").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    // Forme normalisée (minuscules) — convention `*_norm` du fichier.
    emailNorm: text("email_norm").notNull(),
    // Instant absolu du créneau, en UTC. Fenêtre de référence : 9 h → 16 h
    // HEURE ALGÉRIENNE (7 prises de 1 h, `ANCHOR_TZ` de `lib/slots.ts`),
    // affichées au candidat dans SON fuseau (`timezone` ci-dessous).
    startsAt: tstz("starts_at").notNull(),
    // Fuseau IANA du candidat au moment de la réservation.
    timezone: text("timezone").notNull(),
    localDate: text("local_date").notNull(), // AAAA-MM-JJ (tz candidat)
    localHour: text("local_hour").notNull(), // HH:mm (tz candidat)
    status: interviewStatus("status").notNull().default("pending"),
    // NULL = e-mail Récap non envoyé (échec Resend ≠ échec réservation, §2.3).
    notifiedAt: tstz("notified_at"),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [
    // PARTIEL : voir le JSDoc ci-dessus — réservations en cours UNIQUEMENT.
    uniqueIndex("interviews_pending_starts_at_uq")
      .on(t.startsAt)
      .where(sql`status = 'pending' AND email_norm <> ''`),
    index("interviews_created_at_idx").on(t.createdAt),
  ],
);
