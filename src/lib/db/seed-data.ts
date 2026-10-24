/**
 * Atheris — fixtures du seed de démonstration (T12 · DB-PENDING).
 *
 * ⚠ IDENTIFIANTS DE DÉMO UNIQUEMENT (domaine atherisdemo.dev) —
 * JAMAIS charger ces données en production.
 *
 * Fichier 100 % PUR : aucun import DB, aucun import Drizzle, uniquement des
 * types et des tableaux d'objets littéraux. La logique d'insertion vit dans
 * `seed.ts`.
 *
 * Idempotence : chaque entité porte un identifiant FIXE (UUID v4 canoniques,
 * préfixe `0a7e…`), ce qui permet à `seed.ts` de faire des upserts
 * `onConflictDoUpdate(target: id)` : relancer le seed écrase les mêmes lignes
 * au lieu d'en dupliquer.
 *
 * Conventions (schema.ts) :
 * - montants en centimes USD (`*UsdCents`, `baseCents`, `amountCents`) ;
 * - `ratePercent` en DIXIÈMES de pourcentage (100 = 10,0 % · 50 = 5,0 %) ;
 * - instants fournis ici en « jours relatifs » (`*DaysAgo` / `*InDays`) et
 *   convertis en `Date` par `seed.ts` : la démo reste « fraîche » à chaque
 *   exécution, quel que soit le jour.
 *
 * Toutes les formes sont des `type` (pas d'`interface`) : les alias d'objet
 * sont compatibles avec les colonnes `jsonb` typées `Record<string, unknown>`
 * du schéma, ce qu'une `interface` ne serait pas.
 */

// ---------------------------------------------------------------------------
// Types de fixtures (littéraux alignés sur les enums du schéma).
// ---------------------------------------------------------------------------

/** Rôles — miroir de `roleEnum`. */
export type SeedRole = "ceo" | "manager" | "commercial" | "vendeur" | "client";

/** Statuts de compte — miroir de `userStatusEnum`. */
export type SeedUserStatus = "pending" | "active" | "rejected" | "disabled";

/** Sources de prospect — miroir de `prospectSourceEnum`. */
export type SeedProspectSource = "ldg" | "ads" | "landing" | "rayan" | "ceo";

/** Statuts de prospect — miroir de `prospectStatusEnum` (10 valeurs). */
export type SeedProspectStatus =
  | "nouveau"
  | "contacte"
  | "qualifie"
  | "devis_envoye"
  | "signe"
  | "client_actif"
  | "en_livraison"
  | "clos"
  | "perdu"
  | "disqualifie";

/** Statut de devis — miroir de `quoteStatusEnum`. */
export type SeedQuoteStatus = "draft" | "sent" | "signed" | "lost";

/** Type de commission — miroir de `commissionKindEnum`. */
export type SeedCommissionKind = "seller" | "manager";

/** Statut de commission — miroir de `commissionStatusEnum`. */
export type SeedCommissionStatus = "due" | "paid";

/** Clé de jalon — miroir de `milestoneKeyEnum` (les 5 jalons canoniques). */
export type SeedMilestoneKey =
  | "cadrage"
  | "design"
  | "dev"
  | "recette"
  | "mise_en_ligne";

/** Statut de jalon — miroir de `milestoneStatusEnum`. */
export type SeedMilestoneStatus = "en_attente" | "en_cours" | "valide";

/** Bloc JSON de la fiche prospect (jsonb NOT NULL). */
export type SeedBriefBlock = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Identifiants fixes (idempotence des upserts).
// ---------------------------------------------------------------------------

/** UUID fixes des comptes de démo (clés stables pour références croisées). */
export const SEED_USER_IDS = {
  ceo: "0a7e0001-0000-4000-8000-000000000001",
  rayan: "0a7e0001-0000-4000-8000-000000000002",
  vendeur1: "0a7e0001-0000-4000-8000-000000000003",
  vendeur2: "0a7e0001-0000-4000-8000-000000000004",
  commercial1: "0a7e0001-0000-4000-8000-000000000005",
  client: "0a7e0001-0000-4000-8000-000000000006",
} as const;

/** Compte « client » de démo : reçoit `default_project_id` à la fin du seed. */
export const SEED_CLIENT_USER_ID = SEED_USER_IDS.client;

/** UUID fixes des entités hors users/prospects/milestones. */
export const SEED_IDS = {
  brief: "0a7e0003-0000-4000-8000-000000000001",
  quote: "0a7e0004-0000-4000-8000-000000000001",
  payment: "0a7e0005-0000-4000-8000-000000000001",
  commissionSeller: "0a7e0006-0000-4000-8000-000000000001",
  commissionManager: "0a7e0006-0000-4000-8000-000000000002",
  project: "0a7e0007-0000-4000-8000-000000000001",
  message: "0a7e0009-0000-4000-8000-000000000001",
  activity: "0a7e000a-0000-4000-8000-000000000001",
} as const;

/**
 * Décalages temporels (jours) — convertis en `Date` par `seed.ts` à chaque
 * exécution pour garder une démo crédible et « fraîche ».
 */
export const SEED_TIMINGS = {
  /** Devis envoyé au prospect il y a N jours. */
  quoteSentDaysAgo: 21,
  /** Devis signé il y a N jours. */
  quoteSignedDaysAgo: 14,
  /** Échéance de l'acompte il y a N jours. */
  paymentDueDaysAgo: 13,
  /** Acompte réglé il y a N jours → déclenche les commissions. */
  paymentPaidDaysAgo: 13,
  /** Jalon « cadrage » validé par le client il y a N jours. */
  cadrageValidatedDaysAgo: 6,
  /** Message de démo envoyé il y a N jours. */
  messageDaysAgo: 5,
  /** Message lu par le client il y a N jours. */
  messageReadDaysAgo: 4,
  /** Rappel suivant du prospect dans N jours (futur). */
  reminderInDays: 4,
} as const;

// ---------------------------------------------------------------------------
// 1. Comptes de démo — mots de passe en clair UNIQUEMENT pour la démo.
// ---------------------------------------------------------------------------

export type SeedUser = {
  id: string;
  email: string;
  /** Mot de passe en clair de démo — haché par `seed.ts` via scrypt. */
  password: string;
  name: string;
  phone: string | null;
  role: SeedRole;
  status: SeedUserStatus;
};

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: SEED_USER_IDS.ceo,
    email: "ceo@atherisdemo.dev",
    password: "Ceo!Demo2026",
    name: "Sofiane (CEO démo)",
    phone: "+213 550 00 00 01",
    role: "ceo",
    status: "active",
  },
  {
    id: SEED_USER_IDS.rayan,
    email: "rayan@atherisdemo.dev",
    password: "Rayan!Demo2026",
    name: "Rayan (Manager démo)",
    phone: "+213 550 00 00 02",
    role: "manager",
    status: "active",
  },
  {
    id: SEED_USER_IDS.vendeur1,
    email: "vendeur1@atherisdemo.dev",
    password: "Vendeur1!Demo2026",
    name: "Vendeur 1 (démo)",
    phone: "+213 550 00 00 03",
    role: "vendeur",
    status: "active",
  },
  {
    id: SEED_USER_IDS.vendeur2,
    email: "vendeur2@atherisdemo.dev",
    password: "Vendeur1!Demo2026",
    name: "Vendeur 2 (démo)",
    phone: "+213 550 00 00 04",
    role: "vendeur",
    status: "active",
  },
  {
    id: SEED_USER_IDS.commercial1,
    email: "commercial1@atherisdemo.dev",
    password: "Commercial!Demo2026",
    name: "Commercial 1 (démo)",
    phone: "+213 550 00 00 05",
    role: "commercial",
    status: "active",
  },
  {
    id: SEED_CLIENT_USER_ID,
    email: "client@atherisdemo.dev",
    password: "Client!Demo2026",
    name: "Dr Leïla Mansouri (client démo)",
    phone: "+213 555 90 10 20",
    role: "client",
    status: "active",
  },
];

// ---------------------------------------------------------------------------
// 2. Prospects — 6 lignes réparties sur le pipeline.
//    4 portés par vendeur1, 1 lead « ads » et 1 lead « landing » sans
//    bénéficiaire (source_user_id NULL → gestion « sans bénéficiaire »).
//    `emailNorm`/`phoneNorm` sont les formes normalisées ANTI-DOUBLON
//    (lowercase ; `+213`/`00213` → `0` ; chiffres uniquement) : `seed.ts`
//    recontrôle leur cohérence avant insertion.
// ---------------------------------------------------------------------------

export type SeedProspect = {
  id: string;
  fullName: string;
  company: string | null;
  email: string;
  phone: string;
  /** Forme normalisée de `email` (lowercase) — UNIQUE en DB. */
  emailNorm: string;
  /** Forme normalisée de `phone` (0 + chiffres) — UNIQUE en DB. */
  phoneNorm: string;
  source: SeedProspectSource;
  /** Compte porteur du lead ; NULL = lead « sans bénéficiaire ». */
  sourceUserId: string | null;
  status: SeedProspectStatus;
  disqualifyReason: string | null;
  /** Rappel suivant dans N jours (futur) ; null = aucun rappel. */
  nextReminderInDays: number | null;
};

export const SEED_PROSPECTS: readonly SeedProspect[] = [
  {
    id: "0a7e0002-0000-4000-8000-000000000001",
    fullName: "Karim Benali",
    company: "Hotel Atlas",
    email: "karim.benali@hotelatlas.dz",
    phone: "+213 661 23 45 67",
    emailNorm: "karim.benali@hotelatlas.dz",
    phoneNorm: "0661234567",
    source: "ads",
    sourceUserId: null,
    status: "nouveau",
    disqualifyReason: null,
    nextReminderInDays: null,
  },
  {
    id: "0a7e0002-0000-4000-8000-000000000002",
    fullName: "Amina Cherif",
    company: "Cabinet Cherif & Associés",
    email: "amina.cherif@cabinet-cherif.dz",
    phone: "0770 11 22 33",
    emailNorm: "amina.cherif@cabinet-cherif.dz",
    phoneNorm: "0770112233",
    source: "landing",
    sourceUserId: null,
    status: "contacte",
    disqualifyReason: null,
    nextReminderInDays: 4,
  },
  {
    id: "0a7e0002-0000-4000-8000-000000000003",
    fullName: "Yacine Haddad",
    company: "MarketPlus",
    email: "yacine.haddad@marketplus.dz",
    phone: "+213 550 44 55 66",
    emailNorm: "yacine.haddad@marketplus.dz",
    phoneNorm: "0550445566",
    source: "ldg",
    sourceUserId: SEED_USER_IDS.vendeur1,
    status: "qualifie",
    disqualifyReason: null,
    nextReminderInDays: null,
  },
  {
    id: "0a7e0002-0000-4000-8000-000000000004",
    fullName: "Nadia Boumediene",
    company: "TransLog DZ",
    email: "nadia.boumediene@translog-dz.com",
    phone: "00213 698 77 88 99",
    emailNorm: "nadia.boumediene@translog-dz.com",
    phoneNorm: "0698778899",
    source: "ldg",
    sourceUserId: SEED_USER_IDS.vendeur1,
    status: "devis_envoye",
    disqualifyReason: null,
    nextReminderInDays: 4,
  },
  {
    // Devis signé → projet ouvert → prospect basculé « client_actif ».
    id: "0a7e0002-0000-4000-8000-000000000005",
    fullName: "Dr Leïla Mansouri",
    company: "Clinique El Wafa",
    email: "leila.mansouri@clinique-elwafa.dz",
    phone: "+213 555 90 10 20",
    emailNorm: "leila.mansouri@clinique-elwafa.dz",
    phoneNorm: "0555901020",
    source: "ldg",
    sourceUserId: SEED_USER_IDS.vendeur1,
    status: "client_actif",
    disqualifyReason: null,
    nextReminderInDays: null,
  },
  {
    id: "0a7e0002-0000-4000-8000-000000000006",
    fullName: "Rachid Ouali",
    company: "ZenTech",
    email: "rachid.ouuali@zentech.dz",
    phone: "+213 662 33 44 55",
    emailNorm: "rachid.ouuali@zentech.dz",
    phoneNorm: "0662334455",
    source: "ldg",
    sourceUserId: SEED_USER_IDS.vendeur1,
    status: "perdu",
    disqualifyReason: "Budget insuffisant — solution reportée au prochain exercice",
    nextReminderInDays: null,
  },
];

// ---------------------------------------------------------------------------
// 3. Fiche brief du prospect « qualifie » — 3 blocs sur 5 remplis.
// ---------------------------------------------------------------------------

export type SeedBrief = {
  id: string;
  prospectId: string;
  /** 3 blocs remplis (contexte / besoin / contraintes). */
  blockContext: SeedBriefBlock;
  blockNeed: SeedBriefBlock;
  blockConstraints: SeedBriefBlock;
  completedBlocks: number;
  /** Compte ayant saisi la fiche (vendeur1). */
  updatedBy: string;
};

export const SEED_BRIEF: SeedBrief = {
  id: SEED_IDS.brief,
  prospectId: "0a7e0002-0000-4000-8000-000000000003", // Yacine Haddad (qualifie)
  blockContext: {
    secteur: "E-commerce B2B",
    situation:
      "Boutique en ligne vieillissante, gestion manuelle des stocks et des commandes",
    marche: "Grossistes et revendeurs en Algérie",
  },
  blockNeed: {
    objectifs: [
      "Refonte du catalogue produit",
      "Back-office de gestion des commandes",
      "Paiement CIB / Edahabia",
    ],
    livrablePrincipal: "Plateforme web + tableau de bord administrateur",
  },
  blockConstraints: {
    budgetUsd: "4 000 – 6 000",
    echeance: "Livraison avant fin du 2ᵉ trimestre",
    contraintes: ["Multi-langue FR / AR", "Hébergement local"],
  },
  completedBlocks: 3,
  updatedBy: SEED_USER_IDS.vendeur1,
};

// ---------------------------------------------------------------------------
// 4. Devis signé (prospect « client_actif ») — 2 500 USD.
// ---------------------------------------------------------------------------

export type SeedQuote = {
  id: string;
  prospectId: string;
  amountUsdCents: number;
  externalRef: string | null;
  status: SeedQuoteStatus;
  createdBy: string;
};

export const SEED_QUOTE: SeedQuote = {
  id: SEED_IDS.quote,
  prospectId: "0a7e0002-0000-4000-8000-000000000005", // Dr Mansouri (client_actif)
  amountUsdCents: 250_000, // 2 500 USD
  externalRef: "DEV-2026-0001",
  status: "signed",
  createdBy: SEED_USER_IDS.vendeur1,
};

// ---------------------------------------------------------------------------
// 5. Acompte payé (déclencheur des commissions).
// ---------------------------------------------------------------------------

export type SeedPayment = {
  id: string;
  quoteId: string;
  label: string;
  amountUsdCents: number;
  method: string | null;
  createdBy: string;
};

export const SEED_PAYMENT: SeedPayment = {
  id: SEED_IDS.payment,
  quoteId: SEED_IDS.quote,
  label: "Acompte",
  amountUsdCents: 75_000, // 750 USD
  method: "Virement bancaire",
  createdBy: SEED_USER_IDS.vendeur1,
};

// ---------------------------------------------------------------------------
// 6. Commissions générées par l'acompte — lignes écrites MANUELLEMENT ici
//    (la logique métier viendra plus tard, hors périmètre de ce seed).
//    `ratePercent` en DIXIÈMES : 100 = 10,0 % · 50 = 5,0 %.
// ---------------------------------------------------------------------------

export type SeedCommission = {
  id: string;
  quoteId: string;
  beneficiaryId: string;
  kind: SeedCommissionKind;
  ratePercent: number;
  baseCents: number;
  amountCents: number;
  status: SeedCommissionStatus;
};

export const SEED_COMMISSIONS: readonly SeedCommission[] = [
  {
    id: SEED_IDS.commissionSeller,
    quoteId: SEED_IDS.quote,
    beneficiaryId: SEED_USER_IDS.vendeur1,
    kind: "seller",
    ratePercent: 100, // 10,0 %
    baseCents: 250_000,
    amountCents: 25_000, // 250 USD
    status: "due",
  },
  {
    id: SEED_IDS.commissionManager,
    quoteId: SEED_IDS.quote,
    beneficiaryId: SEED_USER_IDS.rayan,
    kind: "manager",
    ratePercent: 50, // 5,0 %
    baseCents: 250_000,
    amountCents: 12_500, // 125 USD
    status: "due",
  },
];

// ---------------------------------------------------------------------------
// 7. Projet client + les 5 jalons.
// ---------------------------------------------------------------------------

export type SeedProject = {
  id: string;
  quoteId: string;
  name: string;
  status: string; // {en_livraison, clos} vérifié en Zod applicatif
};

export const SEED_PROJECT: SeedProject = {
  id: SEED_IDS.project,
  quoteId: SEED_IDS.quote,
  name: "SaaS Clinique Démo",
  status: "en_livraison",
};

export type SeedMilestone = {
  id: string;
  projectId: string;
  order: number;
  key: SeedMilestoneKey;
  status: SeedMilestoneStatus;
  /** Clé du compte valideur ; null = non validé. */
  validatedByKey: "client" | null;
};

export const SEED_MILESTONES: readonly SeedMilestone[] = [
  {
    id: "0a7e0008-0000-4000-8000-000000000001",
    projectId: SEED_IDS.project,
    order: 1,
    key: "cadrage",
    status: "valide",
    validatedByKey: "client",
  },
  {
    id: "0a7e0008-0000-4000-8000-000000000002",
    projectId: SEED_IDS.project,
    order: 2,
    key: "design",
    status: "en_cours",
    validatedByKey: null,
  },
  {
    id: "0a7e0008-0000-4000-8000-000000000003",
    projectId: SEED_IDS.project,
    order: 3,
    key: "dev",
    status: "en_attente",
    validatedByKey: null,
  },
  {
    id: "0a7e0008-0000-4000-8000-000000000004",
    projectId: SEED_IDS.project,
    order: 4,
    key: "recette",
    status: "en_attente",
    validatedByKey: null,
  },
  {
    id: "0a7e0008-0000-4000-8000-000000000005",
    projectId: SEED_IDS.project,
    order: 5,
    key: "mise_en_ligne",
    status: "en_attente",
    validatedByKey: null,
  },
];

// ---------------------------------------------------------------------------
// 8. Messagerie projet + trace d'audit.
// ---------------------------------------------------------------------------

export type SeedMessage = {
  id: string;
  projectId: string;
  senderId: string;
  body: string;
};

export const SEED_MESSAGE: SeedMessage = {
  id: SEED_IDS.message,
  projectId: SEED_IDS.project,
  senderId: SEED_USER_IDS.rayan,
  body: "Bonjour Leïla, le cadrage est validé. Le design démarre cette semaine : vous recevrez la maquette pour validation dans votre espace.",
};

export type SeedActivity = {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: SeedBriefBlock;
};

export const SEED_ACTIVITY: SeedActivity = {
  id: SEED_IDS.activity,
  actorId: SEED_USER_IDS.ceo,
  action: "seed.demo",
  entityType: "system",
  entityId: SEED_IDS.project,
  meta: {
    note: "Jeu de données de démonstration — fictif, jamais en production",
  },
};
