/**
 * Atheris — schéma Drizzle (PostgreSQL / Neon) : 22 tables (T02 · PLAN.md §1.2 ;
 * enrichi Lot recrutement : `job_applications` + `recruitment_templates` ;
 * enrichi Lot 4 CRM : `notifications` ;
 * enrichi pipeline zero-interview : `exam_sessions` + `exam_answers` ;
 * enrichi refonte plateforme : `payout_details` + `identity_docs` +
 * `contract_consents`, colonnes KYC sur `users`, `exam_sessions.expires_at`).
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
  "sdr",
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

/** Bénéficiaire type : sdr (palier) ou manager (5 % Rayan). */
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

/** Statut d'une candidature à un poste (recrutement CEO). */
export const applicationStatusEnum = pgEnum("application_status", [
  "nouveau",
  "invite",
  "refuse",
  "recrute",
  // ── Pipeline zero-interview (examen en ligne) ─────────────────────────────
  // AJOUT PUR : aucun UPDATE de reprise n'est généré — les candidatures
  // antérieures conservent leurs statuts `nouveau`/`invite` et leur parcours
  // par entretien restent intacts (`interviewId`, `inviteToInterview`).
  // `exam_pending`  = lien d'examen généré, non encore soumis.
  // `exam_submitted`= soumis, en attente de revue CEO (file « < 24 h »).
  // `exam_failed`   = section 4 (modèle de commission) refusée → éliminatoire,
  //                   rejet automatique sans revue (un « non » ne s'améliore
  //                   pas en relisant).
  "exam_pending",
  "exam_submitted",
  "exam_failed",
]);

/**
 * Cycle de vie d'une session d'examen.
 *
 * `in_progress` = ouverte, réponses en cours d'écriture (autosauvegarde par
 * section, cf. Lot 2) ; `submitted` = verrouillée, en attente de décision CEO.
 * Il n'existe pas d'état « expired » : une session non soumise reste relisible
 * par son jeton tant que le CEO n'a pas tranché la candidature.
 */
export const examStatusEnum = pgEnum("exam_status", [
  "in_progress",
  "submitted",
]);

/**
 * Mode de paiement choisi par le SDR (page Profil, section « Moyens de
 * paiement »).
 *
 * Trois variantes, chacune avec SON jeu de champs dans `payout_details` —
 * c'est pourquoi il n'y a pas d'enum « un champ par variante tous
 * nullable » sans arbitrage : les colonnes sont regroupées par bloc et
 * l'atomicité (un bloc rempli, les autres vides) est assurée en Zod, pas
 * par une contrainte CHECK (convention n° 5 de l'en-tête).
 */
export const payoutMethodEnum = pgEnum("payout_method", [
  "wise",
  "paypal",
  "bank",
]);

/**
 * État du dossier de vérification d'identité (KYC).
 *
 * `pending`  = pièce déposée, en attente du CEO ;
 * `approved` = pièce validée (`users.verified_at` posé à ce moment) ;
 * `rejected` = refusée — le SDR est notifié avec le motif
 *              (`users.identity_rejection_reason`) et peut re-uploader,
 *              ce qui repasse la ligne en `pending`.
 */
export const identityStatusEnum = pgEnum("identity_status", [
  "pending",
  "approved",
  "rejected",
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
    // ── Vérification d'identité (KYC, pipeline SDR) ─────────────────────────
    // `verifiedAt` : instant où le CEO a validé la pièce, `null` = non
    // vérifié. C'est LE signal unique de vérification, et il sert à la fois à :
    //   1. bloquer le versement des commissions — une ligne `commissions`
    //      n'est versable que si cette colonne est renseignée ;
    //   2. verrouiller le nom du profil — pas de second booléen : un seul
    //      signal, une seule source de vérité.
    verifiedAt: tstz("verified_at"),
    // Raison du dernier refus de pièce, affichée dans la notification du SDR
    // (il peut re-uploader). Écrasée à chaque nouveau refus ; `NULL` = jamais
    // refusé. Stockée sur le compte plutôt que dans l'historique : le SDR ne
    // consulte que sa DERNIÈRE situation.
    identityRejectionReason: text("identity_rejection_reason"),
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
    // de référence est supprimé (les scoping sdr passent par cette colonne).
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
    // NULL = « deal sans bénéficiaire » (lead Ads/Sales Development Representative orphelin) → file CEO avec
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
    // Rôle cible du destinataire (miroir de `roleEnum`) — NOT NULL : toute
    // invitation porte un rôle (client portail, sdr recrutement…).
    role: roleEnum("role").notNull(),
    // `no action` (hors périmètre `cascade` de la spec T02) : une invitation
    // ne doit pas être détruite silencieusement avec son projet — point à
    // confirmer auprès du Lead/Reviewer. Nullable : les invitations de
    // recrutement (sdr) ne portent pas de projet.
    projectId: uuid("project_id").references((): PgColumn => clientProjects.id),
    // Candidature liée (invitation d'entretien depuis le pipeline recrutement)
    // — nullable. FK « déclarée vers le bas » : `jobApplications` est déclaré
    // plus bas dans le fichier, l'annotation `(): PgColumn =>` casse le cycle
    // de types (note 7 en tête de fichier).
    applicationId: uuid("application_id").references(
      (): PgColumn => jobApplications.id,
    ),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdBy: uuid("created_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_idx").on(t.token),
    index("invitations_email_idx").on(t.email),
    // Anti-abus / anti-doublon : une seule invitation NON UTILISÉE par
    // (email, rôle) — les invitations consommées (used_at NOT NULL) ne
    // contraint plus rien (index partiel).
    index("invitations_email_role_unused_idx")
      .on(t.email, t.role)
      .where(sql`used_at IS NULL`),
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
// 14. interviews — lien d'entretien Sales Development Representative (PLAN §1.1). Table autopportante :
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
    // Étiquette affichée au CEO (nom du candidat si lien issu d'une
    // candidature, texte libre si création manuelle). Rien à voir avec les
    // colonnes de réservation.
    label: text("label"),
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

// ---------------------------------------------------------------------------
// 15. job_applications — candidature à un poste (recrutement CEO).
//     CV stocké en bytea ≤ 5 Mo (validation Zod applicative, motif `documents`).
// ---------------------------------------------------------------------------

export const jobApplications = pgTable(
  "job_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    // Forme normalisée (minuscules) — convention `*_norm` du fichier.
    emailNorm: text("email_norm").notNull(),
    // Langue de la page de dépôt : détermine la langue des emails envoyés au
    // candidat (modèles `recruitment_templates` ci-dessous).
    locale: text("locale").notNull().default("fr"),
    // Motivation optionnelle saisie au dépôt.
    message: text("message"),
    status: applicationStatusEnum("status").notNull().default("nouveau"),
    // CV stocké en bytea ≤ 5 Mo (validation Zod applicative, motif
    // `documents`) : métadonnées en colonnes, flux brut en `cvBytes`.
    //
    // FACULTATIF (décision business) : les 4 colonnes sont `nullable` et
    // binaire — soit le quartet est TOUS renseigné, soit aucun ne l'est.
    // Un CV à 5 Mo imposé était un frein à la conversion dès lors que la
    // qualification passe par l'examen en ligne ; le CV redevient une
    // pièce d'appui, pas un sésame. Le contrat applicatif (Zod, dans
    // `src/actions/careers.ts`) fait respecter cette atomicité : aucune
    // contrainte CHECK en DB (convention n° 5 de l'en-tête).
    cvFilename: text("cv_filename"),
    cvMimeType: text("cv_mime_type"),
    cvByteSize: integer("cv_byte_size"),
    cvBytes: bytea("cv_bytes"),
    // `interview_id` nullable = lien d'entretien créé à l'invitation.
    // `no action` (défaut, comme les colonnes « auteur ») : supprimer un
    // entretien ne détruit pas la candidature.
    interviewId: uuid("interview_id").references((): PgColumn => interviews.id),
    invitedAt: tstz("invited_at"),
    rejectedAt: tstz("rejected_at"),
    // Instant du recrutement (statut basculé en `recrute`) — nullable, pas de
    // default : renseigné uniquement lors du passage à `recrute`.
    recruitedAt: tstz("recruited_at"),
    createdAt: tstz("created_at").defaultNow().notNull(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("job_applications_status_idx").on(t.status),
    index("job_applications_created_at_idx").on(t.createdAt),
    index("job_applications_email_norm_idx").on(t.emailNorm),
  ],
);

// ---------------------------------------------------------------------------
// 16. recruitment_templates — modèles d'e-mails de recrutement (invitation /
//     refus) mémorisés par le CEO — upsert sur (kind, locale).
// ---------------------------------------------------------------------------

export const recruitmentTemplates = pgTable(
  "recruitment_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Texte brut (pas d'enum) : valeurs 'invite' | 'reject' vérifiées en Zod
    // (motif `client_projects.status` : text + Zod plutôt qu'enum pour éviter
    // une migration à chaque évolution).
    kind: text("kind").notNull(),
    // Variante linguistique 'fr' | 'en' (Zod).
    locale: text("locale").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    updatedBy: uuid("updated_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow().notNull(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("recruitment_templates_kind_locale_idx").on(t.kind, t.locale),
  ],
);

// ---------------------------------------------------------------------------
// 17. notifications — notifications IN-APP par destinataire (Lot 4 · CRM).
//     Écrites par `src/lib/notify.ts` (appel « non fatal » : un échec d'écriture
//     ne casse jamais l'action métier qui la déclenche).
//
//     • `link`   — chemin SANS locale (ex. `/crm/prospects/<id>`), la locale est
//                  ajoutée au rendu côté client.
//     • `meta`   — UNIQUEMENT le contexte de rendu (ids, noms, statuts…), JAMAIS
//                  de phrase pré-traduite : la phrase est construite côté UI à
//                  partir de `type` + `meta` (i18n).
//     • `type`   — code stable du type d'événement (ex. « status.changed »).
//     • `dedupeKey` — clé d'idempotence optionnelle : l'index unique partiel
//                  ci-dessous empêche le double-posting pour un même
//                  (destinataire, événement métier) — NULL autorise plusieurs
//                  lignes.
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // cascade : pas de notification survivant à la suppression du compte.
    recipientId: uuid("recipient_id")
      .references((): PgColumn => users.id, { onDelete: "cascade" })
      .notNull(),
    // Code stable du type d'événement (text brut, pas d'enum : Zod applicatif).
    type: text("type").notNull(),
    // Lien SANS locale — la locale est ajoutée au rendu côté client.
    link: text("link").notNull(),
    // Contexte de rendu (ids, noms, statuts…) — JAMAIS de phrase traduite
    // (i18n côté UI à partir de `type` + `meta`).
    meta: jsonb("meta").$type<Record<string, string>>().notNull().default({}),
    // Clé d'idempotence optionnelle (anti double-posting, index unique partiel).
    dedupeKey: text("dedupe_key"),
    // NULL = non lue.
    readAt: tstz("read_at"),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notifications_recipient_created_idx").on(t.recipientId, t.createdAt),
    index("notifications_recipient_unread_idx")
      .on(t.recipientId)
      .where(sql`read_at IS NULL`),
    uniqueIndex("notifications_recipient_dedupe_uq")
      .on(t.recipientId, t.dedupeKey)
      .where(sql`dedupe_key IS NOT NULL`),
  ],
);

// ---------------------------------------------------------------------------
// 18. exam_sessions — session d'examen en ligne d'une candidature
//     (pipeline zero-interview). Table AUTOPOPORTE côté utilisateur : le jeton
//     est PUBLIC et ouvert par un candidat anonyme, exactement comme
//     `interviews` (table 14) — aucun compte, aucune session.
//
//     Le rattachement à la candidature se fait par `applicationId` (FK), mais
//     l'accès ne passe JAMAIS par cette FK côté public : la route
//     `/[locale]/examen/[token]` ne connaît QUE le jeton, d'où l'UNIQUE.
// ---------------------------------------------------------------------------

/**
 * Une session d'examen par candidature, créée automatiquement au dépôt du
 * formulaire (`applyToJob`) — pas d'intervention CEO, c'est tout l'intérêt du
 * zero-interview.
 *
 * - **Jeton** : 32 bytes hex (`randomBytes(32).toString("hex")`), même gabarit
 *   que `interviews.token` — `UNIQUE` ⇒ 404 générique, aucune énumération
 *   possible d'identifiants valides.
 * - **Autosauvegarde par section** : le candidat ne soumet PAS tout à la fin.
 *   Chaque section est persistée à sa validation (Lot 2), donc `in_progress`
 *   est un état LONG et fréquent — un coup de réseau n'efface rien. Sur mobile
 *   avec réseau instable, c'est la différence entre « candidature perdue » et
 *   « candidature conservée ».
 * - **Pas d'expiration verrouillée en DB** : une session non soumise reste
 *   relisible par son jeton. La fermeture du parcours relève d'une décision
 *   CEO (statut candidature), pas d'un cron — évite un état « zombie » où le
 *   candidat ne peut plus reprendre et le CEO ne sait pas pourquoi.
 */
export const examSessions = pgTable(
  "exam_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Jeton d'accès public (32 bytes hex) — UNIQUE ⇒ 404 générique.
    token: text("token").notNull().unique(),
    // Lien vers la candidature. `no action` (défaut) : supprimer une session
    // ne doit jamais pouvoir détruire une candidature, et l'inverse non plus.
    applicationId: uuid("application_id").references(
      (): PgColumn => jobApplications.id,
    ),
    status: examStatusEnum("status").notNull().default("in_progress"),
    // Variante linguistique du parcours ('fr' | 'en', Zod) — détermine la
    // langue des questions ET de l'e-mail de décision (miroir de
    // `jobApplications.locale`, recopiée pour éviter un JOIN sur le jeton).
    locale: text("locale").notNull().default("fr"),
    // Instant d'ouverture. `submittedAt` nullable = jamais soumis.
    //
    // ⚠ Le Start du candidat REPOSE cette valeur (UPDATE conditionnel) :
    // la colonne est renseignée à la création pour satisfaire le
    // `defaultNow()`, mais le CHRONO affiché doit compter depuis le clic
    // Start, pas depuis le dépôt de la candidature — sinon un candidat qui
    // attend 2 jours avant de commencer afficherait « 48 h d'examen ».
    // `expiresAt` (ci-dessous) est indépendant : il court depuis la
    // candidature (H1).
    startedAt: tstz("started_at").defaultNow().notNull(),
    submittedAt: tstz("submitted_at"),
    // Fin de validité du lien, calculée à la CREATION (candidature + 3 j,
    // H1). Une session dont `now() > expires_at` n'est plus ouvrable : le
    // jeton renvoie un 404 dédié et le CEO peut en régénérer un via
    // `generateExamLink`. `NULL` = sans limite (sessions héritées).
    expiresAt: tstz("expires_at"),
    // Durée mesurée en secondes (indicatif, jamais bloquant) : sert au CEO à
    // repérer un examen anormalement rapide (copier-coller) ou interminable.
    // Entier, jamais de flottant (convention n° 3).
    elapsedSeconds: integer("elapsed_seconds"),
    createdAt: tstz("created_at").defaultNow().notNull(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("exam_sessions_application_id_idx").on(t.applicationId),
    index("exam_sessions_status_idx").on(t.status),
    // File de revue CEO : les examens à traiter, triés par heure de soumission.
    // PARTIEL — ne indexe que les sessions réellement en attente ; une session
    // déjà tranchée ne pollue pas la file.
    index("exam_sessions_submitted_pending_idx")
      .on(t.submittedAt)
      .where(sql`status = 'submitted'`),
  ],
);

// ---------------------------------------------------------------------------
// 19. exam_answers — réponses à l'examen, une ligne par question.
//     `cascade` : une réponse ne survivant PAS à sa session (objet dépendant,
//     convention n° 6).
// ---------------------------------------------------------------------------

/**
 * Une réponse par `(sessionId, questionId)` — l'index unique ci-dessous rend
 * l'autosauvegarde **idempotente** : re-sauvegarder la même question écrase
 * sa propre ligne au lieu d'en empiler une deuxième.
 *
 * - `section` — 1 à 4 (Zod applicatif, pas de CHECK en DB, convention n° 5).
 * - `questionId` — **clé stable de la question dans le barème**, pas un
 *   index de position : si une question est réordonnée ou injectée plus tard,
 *   les réponses déjà stockées restent interprétables. C'est ce qui rend la
 *   question 4 (éliminatoire) retrouvable même si le formulaire évolue.
 * - `answer` — texte libre pour les sections 1–3 ; pour la section 4 binaire,
 *   la valeur normalisée `"yes"` / `"no"` (décision d'élimination en Lot 2).
 */
export const examAnswers = pgTable(
  "exam_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references((): PgColumn => examSessions.id, { onDelete: "cascade" })
      .notNull(),
    section: integer("section").notNull(),
    questionId: text("question_id").notNull(),
    answer: text("answer").notNull(),
    createdAt: tstz("created_at").defaultNow().notNull(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Idempotence de l'autosauvegarde par section.
    uniqueIndex("exam_answers_session_question_uq").on(t.sessionId, t.questionId),
    index("exam_answers_session_id_idx").on(t.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// 20. payout_details — moyen de paiement du SDR (page Profil, §« Payout »).
//     UNE ligne par compte, `user_id` UNIQUE : un SDR a UN mode principal.
// ---------------------------------------------------------------------------

/**
 * Coordonnées de versement d'un SDR, pour trois variantes :
 *
 * - `wise`   → `accountEmail` + `currency` (USD / EUR / GBP…) ;
 * - `paypal` → `accountEmail` ;
 * - `bank`   → `holderName` + `bankName` + `iban` + `swiftBic`.
 *
 * ─── Arbitrage stockage (D4 du plan) ────────────────────────────────────────
 * Les valeurs sont stockées **en clair** en base et **masquées à l'affichage**
 * (`*** 4821`, `a***o@gmail.com`). Le masquage est de l'AFFICHAGE, pas une
 * protection : un accès direct à la base donne les coordonnées lisibles.
 * C'est assumé et documenté — à réévaluer si le volume de SDR croît.
 *
 * L'atomicité « un seul bloc rempli » est assurée en Zod applicatif (motif
 * `client_projects.status`) : aucune contrainte CHECK en DB (convention n° 5).
 *
 * Pas de chiffrement au repos : requêtes de tri et d'affichage simplifiées,
 * et le destinataire légitime (CEO) doit pouvoir lire l'IBAN pour virer.
 */
export const payoutDetails = pgTable(
  "payout_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references((): PgColumn => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    method: payoutMethodEnum("method").notNull(),
    // ── Wise / PayPal ────────────────────────────────────────────────────
    accountEmail: text("account_email"),
    // Devise de réception préférée (Wise) — code ISO 4217 en majuscules.
    currency: text("currency"),
    // ── Virement bancaire (SWIFT / IBAN) ─────────────────────────────────
    // Doit correspondre à la pièce d'identité (contrôle applicatif).
    holderName: text("holder_name"),
    bankName: text("bank_name"),
    iban: text("iban"),
    swiftBic: text("swift_bic"),
    createdAt: tstz("created_at").defaultNow().notNull(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("payout_details_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// 21. identity_docs — pièce d'identité (KYC, §Vérification d'identité).
//     UNE ligne par compte, `user_id` UNIQUE : un re-upload ÉCRASE le
//     dossier (D7 — le SDR peut recommencer après un refus).
// ---------------------------------------------------------------------------

/**
 * Dossier de vérification d'identité d'un SDR.
 *
 * - Les octets suivent le motif `documents`/`jobApplications` (bytea ≤ 5 Mo,
 *   métadonnées en colonnes, aucune écriture disque).
 * - `status` pilote le cycle : `pending` → (`approved` | `rejected`). Un
 *   re-upload repasse la ligne en `pending` et vide `rejectionReason`.
 * - `users.verifiedAt` est posé UNIQUEMENT à l'approbation — c'est lui qui
 *   débloque les versements, pas ce statut. Ce statut n'est qu'un repère de
 *   file d'attente pour le CEO.
 *
 * ⚠ PII SENSIBLE : pièce d'identité en clair en base (D3/D3-bis). Assumé,
 * à réévaluer en cas de volume.
 */
export const identityDocs = pgTable(
  "identity_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references((): PgColumn => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    bytes: bytea("bytes").notNull(),
    status: identityStatusEnum("status").notNull().default("pending"),
    // Instant de la décision du CEO — `NULL` tant que non examiné.
    reviewedAt: tstz("reviewed_at"),
    // CEO ayant tranché (l'audience est restreinte à `ceo`, mais l'acte est
    // journalisé : la colonne n'est jamais déduite du contexte).
    reviewedBy: uuid("reviewed_by").references((): PgColumn => users.id),
    createdAt: tstz("created_at").defaultNow().notNull(),
    updatedAt: tstz("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("identity_docs_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// 22. contract_consents — preuve de consentement au contrat de partenariat.
// ---------------------------------------------------------------------------

/**
 * Acceptation d'une VERSION du contrat de partenariat.
 *
 * Une ligne par (compte, version) — `unique(userId, contractVersion)`. Si le
 * contrat évolue, la version suivante produit une NOUVELLE ligne : l'ancien
 * consentement reste intact comme preuve de ce qui avait été accepté, et le
 * premier virement exige une ligne à jour.
 *
 * Colonnes exigées par le contrat (D5) : horodatage, adresse IP, envoi
 * automatique d'une copie. `emailSentAt` est `NULL` si l'envoi a échoué —
 * le consentement reste valable (il est prouvé par `acceptedAt` + `ipAddress`),
 * la copie est un service, pas une condition de validité.
 */
export const contractConsents = pgTable(
  "contract_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references((): PgColumn => users.id, { onDelete: "cascade" })
      .notNull(),
    // Version figée du texte accepté (ex. `2026-10-v1`) — jamais « latest » :
    // la preuve doit pouvoir dire QUEL texte a été coché.
    contractVersion: text("contract_version").notNull(),
    acceptedAt: tstz("accepted_at").defaultNow().notNull(),
    // Adresse IP au moment du clic — saisie côté SERVEUR (jamais depuis le
    // payload : un champ envoyé par le client ne prouve rien).
    ipAddress: text("ip_address"),
    emailSentAt: tstz("email_sent_at"),
    createdAt: tstz("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Un seul consentement par version et par compte.
    uniqueIndex("contract_consents_user_version_uq").on(t.userId, t.contractVersion),
    index("contract_consents_user_id_idx").on(t.userId),
  ],
);
