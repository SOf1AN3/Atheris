/**
 * Contrat de contenu typé de la plateforme interne bilingue FR/EN (T06).
 *
 * Type-only : ce module ne produit aucun code exécutable.
 * Il est la source de vérité partagée par `src/content/platform/fr.ts`,
 * `src/content/platform/en.ts`, `src/i18n/platform-dictionaries.ts` et les
 * composants UI de la plateforme (`/espace/*`).
 *
 * Distinct de `src/content/types.ts` (landing, inchangée) : la plateforme a
 * ses propres besoins (statuts CRM, rôles, formulaires) et son propre
 * dictionnaire chargé via `getPlatformDictionary`.
 *
 * DÉRIVATION DES ENUMS — les types `Role`, `ProspectStatus`… sont dérivés des
 * `pgEnum` Drizzle de `src/lib/db/schema.ts` (source de vérité DB unique).
 * L'import est **type-only** (`import type`) : entièrement effacé à la
 * compilation, aucun code Drizzle n'atteint le bundle client — c'est la même
 * technique que `src/types/next-auth.d.ts` (T03), éprouvée par `tsc`.
 *
 * CONVENTION PLACEHOLDERS — certains libellés contiennent des jetons entre
 * accolades (`{year}`, `{done}/{total}`, `{total}`, `{tier}`, `{rate}`)
 * remplacés à l'affichage par un simple `String.replace` ; aucune librairie
 * d'interpolation n'est utilisée.
 *
 * Les noms de champs et de propriétés sont NON NÉGOCIABLES : une clé manquante
 * dans `fr.ts` ou `en.ts` est une erreur TypeScript (annotation / `satisfies`).
 */

import type {
  commissionStatusEnum,
  milestoneKeyEnum,
  prospectStatusEnum,
  quoteStatusEnum,
  roleEnum,
  userStatusEnum,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types dérivés du schéma DB (enums PostgreSQL).
// ---------------------------------------------------------------------------

/** Rôle d'un compte, dérivé de l'enum `role` (schéma Drizzle, T02). */
export type Role = (typeof roleEnum.enumValues)[number];

/** Statut d'un compte, dérivé de l'enum `user_status` (T02). */
export type UserStatus = (typeof userStatusEnum.enumValues)[number];

/** Les 10 états du pipeline, dérivés de l'enum `prospect_status` (T02). */
export type ProspectStatus = (typeof prospectStatusEnum.enumValues)[number];

/** Cycle de vie d'un devis, dérivé de l'enum `quote_status` (T02). */
export type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];

/** État d'une commission, dérivé de l'enum `commission_status` (T02). */
export type CommissionStatus = (typeof commissionStatusEnum.enumValues)[number];

/** Les 5 jalons imposés, dérivés de l'enum `milestone_key` (T02). */
export type MilestoneKey = (typeof milestoneKeyEnum.enumValues)[number];

/**
 * Codes d'échec de connexion (T03). Union locale **en miroir** de
 * `LoginFailureCode` (`src/actions/auth.ts`) — volontairement redéfinie ici
 * pour garder la couche de contenu indépendante des Server Actions ; les deux
 * doivent rester alignés (invalid | rate_limited | pending | rejected).
 */
export type LoginErrorCode = "invalid" | "rate_limited" | "pending" | "rejected";

/** Les 5 blocs de la fiche projet (structure.md §5.1, colonne `prospect_briefs`). */
export type BriefBlockKey = "context" | "need" | "constraints" | "tech" | "followUp";

// ---------------------------------------------------------------------------
// Blocs communs.
// ---------------------------------------------------------------------------

/** Wordmark de la marque : `{ name: "ATHERIS", suffix: "LABS" }`. */
export interface PlatformBrand {
  name: string;
  suffix: string;
}

/** Entrée de navigation de la sidebar — `href` SANS préfixe locale. */
export interface PlatformNavItem {
  label: string;
  /** Chemin relatif type `"/espace/tableau-de-bord"` (le shell ajoute `/fr`·`/en`). */
  href: string;
}

/** Textes partagés : marque, boutons, états vides. */
export interface PlatformCommonContent {
  brand: PlatformBrand;
  save: string;
  cancel: string;
  back: string;
  next: string;
  submit: string;
  loading: string;
  search: string;
  filter: string;
  close: string;
  /** En-tête de colonne « Actions » d'un tableau. */
  actions: string;
  yes: string;
  no: string;
  optional: string;
  required: string;
  /** État vide par défaut d'une liste / table / requête. */
  noData: string;
  /** Libellé du bouton de nouvelle tentative (état erreur). */
  retry: string;
  /** État 404. */
  notFound: string;
}

/** Contenu de la sidebar, structuré par rôle (le shell filtre sur `session.user.role`). */
export interface PlatformNavContent {
  brand: PlatformBrand;
  ceo: PlatformNavItem[];
  manager: PlatformNavItem[];
  commercial: PlatformNavItem[];
  vendeur: PlatformNavItem[];
  client: PlatformNavItem[];
  logout: string;
  /** Lien « Mon profil » (commun à tous les rôles). */
  profile: string;
  /** aria-label du sélecteur de langue. */
  languageSwitcher: string;
  /** aria-label du bouton d'ouverture du menu (mobile). */
  menuOpen: string;
  /** aria-label du bouton de fermeture du menu (mobile). */
  menuClose: string;
}

// ---------------------------------------------------------------------------
// Authentification (connexion + candidature).
// ---------------------------------------------------------------------------

/** Messages d'échec de login, indexés sur les codes de `LoginErrorCode` (T03). */
export interface LoginErrorsContent {
  invalid: string;
  rate_limited: string;
  pending: string;
  rejected: string;
  /** Repli pour tout code inattendu. */
  generic: string;
}

/** Page de connexion. */
export interface LoginContent {
  title: string;
  subtitle: string;
  emailLabel: string;
  passwordLabel: string;
  submit: string;
  submitLoading: string;
  /** Note discrète sous le formulaire (rôle de l'admin sur les mots de passe). */
  forgotNote: string;
  /** Lien vers la page de candidature, affiché sous le formulaire. */
  signupLink: string;
  errors: LoginErrorsContent;
}

/** Page de candidature (inscription sur sélection du CEO). */
export interface SignupContent {
  title: string;
  subtitle: string;
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  passwordLabel: string;
  passwordConfirmLabel: string;
  /** Règles affichées sous le champ mot de passe. */
  passwordRules: string;
  consentLabel: string;
  submit: string;
  successTitle: string;
  successBody: string;
  /** Lien « déjà un compte ? » affiché après succès et sous le formulaire. */
  alreadyHaveAccount: string;
  /** Erreur serveur : compte déjà enregistré (email unique en DB). */
  duplicateEmail: string;
}

/** Messages d'erreur de validation Zod réutilisés dans les formulaires. */
export interface ValidationContent {
  emailInvalid: string;
  phoneInvalid: string;
  required: string;
  passwordMismatch: string;
  passwordWeak: string;
  /** `{min}` = nombre de caractères minimum requis. */
  tooShort: (min: number) => string;
  /** `{max}` = nombre de caractères maximum autorisé. */
  tooLong: (max: number) => string;
}

/** Contenu authentification racine. */
export interface AuthContent {
  login: LoginContent;
  signup: SignupContent;
  validation: ValidationContent;
}

// ---------------------------------------------------------------------------
// Statuts (libellés — les couleurs restent en CSS, DESIGN.md §12.2).
// ---------------------------------------------------------------------------

/** Libellés de tous les enums métier, indexés sur les valeurs DB. */
export interface StatusesContent {
  prospect: Record<ProspectStatus, string>;
  quote: Record<QuoteStatus, string>;
  commission: Record<CommissionStatus, string>;
  milestone: Record<MilestoneKey, string>;
  role: Record<Role, string>;
  userStatus: Record<UserStatus, string>;
}

// ---------------------------------------------------------------------------
// Pipeline commercial (tableau + filtres + messages).
// ---------------------------------------------------------------------------

/** Contenu de la page pipeline. */
export interface PipelineContent {
  columns: {
    name: string;
    company: string;
    status: string;
    source: string;
    lastActivity: string;
    reminder: string;
  };
  filters: {
    /** Option « tous les statuts » du sélecteur de filtre. */
    allStatuses: string;
    searchPlaceholder: string;
    clearFilters: string;
    /** Compteur de résultats (placeholder `{count}` = nombre de lignes). */
    resultCount: string;
  };
  messages: {
    /** Message inline après création réussie. */
    created: string;
    /** Erreur serveur : doublon email/phone normalisés (index uniques T02). */
    duplicate: string;
    /** Toast de confirmation après création. */
    createdToast: string;
    /** Badge texte de relance dépassée (a11y : la couleur seule ne suffit pas). */
    reminderOverdue: string;
  };
}

// ---------------------------------------------------------------------------
// Fiche prospect (page détail).
// ---------------------------------------------------------------------------

/** Contenu de la page détail d'un prospect. */
export interface ProspectContent {
  tabs: {
    identity: string;
    brief: string;
    deals: string;
    history: string;
  };
  labels: {
    email: string;
    phone: string;
    company: string;
    source: string;
    /** Bénéficiaire du prospect (`prospects.sourceUserId`). */
    owner: string;
    createdAt: string;
  };
  actions: {
    changeStatus: string;
    /** Avertissement : motif obligatoire (ex. passage à `disqualifie`). */
    reasonRequired: string;
    reasonLabel: string;
    confirmChange: string;
    /** Refus d'action si le rôle connecté n'a pas les droits. */
    lockedByRole: string;
  };
}

// ---------------------------------------------------------------------------
// Assistant fiche projet (5 blocs, structure.md §5.1).
// ---------------------------------------------------------------------------

/** Une étape de l'assistant (libellé + description courte). */
export interface BriefStep {
  label: string;
  description: string;
}

/** Contenu de l'assistant fiche projet. */
export interface BriefContent {
  title: string;
  steps: Record<BriefBlockKey, BriefStep>;
  gauge: {
    /** ex. `"{done}/{total}"` → « 3/5 » — `{done}`/`{total}` remplacés à l'affichage. */
    blocksDone: string;
    /** Message affiché quand les 5 blocs sont renseignés. */
    readyForQuote: string;
  };
  /** Libellés des champs saisis dans chaque bloc. */
  fields: {
    context: {
      businessProblem: string;
      productType: string;
    };
    need: {
      scope: string;
      targetUsers: string;
    };
    constraints: {
      deadline: string;
      budget: string;
      decisionMakers: string;
      references: string;
    };
    tech: {
      forcedTech: string;
      integrations: string;
      hosting: string;
      security: string;
    };
    followUp: {
      nextStep: string;
      reminderDate: string;
      notes: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Tableau de bord.
// ---------------------------------------------------------------------------

/** Contenu des dashboards (titres de blocs + files d'action). */
export interface DashboardContent {
  kpi: string;
  actionQueues: string;
  recentActivity: string;
  perEmployee: {
    /** Titre du bloc « stats par employé » (CEO). */
    title: string;
    /** Colonnes du funnel. */
    funnel: string;
    activity: string;
    profitability: string;
  };
  /** Libellés des files d'action (chaque file pointe vers sa page). */
  queues: {
    pendingApplications: string;
    quotesNoAnswer: string;
    commissionsDue: string;
    remindersToday: string;
  };
}

// ---------------------------------------------------------------------------
// Commissions (barème à paliers).
// ---------------------------------------------------------------------------

/** Contenu de la page commissions. */
export interface CommissionsContent {
  queue: string;
  history: string;
  markPaid: string;
  /** Versement groupé des lignes sélectionnées. */
  markPaidLot: string;
  /** `{total}` = montant total de la sélection. */
  lotConfirm: string;
  /** Bannière : devis signé sans bénéficiaire identifié. */
  noBeneficiary: string;
  rate: string;
  amount: string;
  base: string;
  generatedAt: string;
  paidAt: string;
  pending: string;
  paid: string;
  /** Avertissement métier : pas de récupération sur commission versée. */
  noClawbackWarning: string;
  /** Titre de l'espace gains du vendeur. */
  myEarnings: string;
  tier: {
    label: string;
    current: string;
    /** `{tier}` = libellé du prochain palier, `{rate}` = taux associé. */
    nextTier: string;
  };
}

// ---------------------------------------------------------------------------
// Portail client.
// ---------------------------------------------------------------------------

/** Contenu du portail client (suivi de projet). */
export interface ClientContent {
  projectTitle: string;
  /** Titre de la timeline des 5 jalons (libellés dans `statuses.milestone`). */
  milestones: string;
  validateStep: string;
  validateConfirm: string;
  documents: string;
  invoices: string;
  messages: string;
  messagePlaceholder: string;
  send: string;
  /** Compteur de messages non lus. */
  unread: string;
  /** Statut d'une facture. */
  paid: string;
  due: string;
  totalPaid: string;
  remaining: string;
  emptyDocuments: string;
  emptyMessages: string;
}

// ---------------------------------------------------------------------------
// Candidatures (espace CEO).
// ---------------------------------------------------------------------------

/** Contenu de la page de gestion des candidatures. */
export interface ApplicationsContent {
  title: string;
  approve: string;
  reject: string;
  rejectReason: string;
  approveConfirm: string;
  /** État vide : aucune candidature en attente. */
  empty: string;
  /** Libellé de la colonne statut. */
  statusLabel: string;
}

// ---------------------------------------------------------------------------
// Profil.
// ---------------------------------------------------------------------------

/** Contenu de la page profil (nom lecture seule, email, téléphone, mot de passe). */
export interface ProfileContent {
  title: string;
  nameReadonlyHint: string;
  email: string;
  phone: string;
  passwordSection: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  saveEmail: string;
  savePhone: string;
  savePassword: string;
  /** Toasts de confirmation. */
  emailSaved: string;
  phoneSaved: string;
  passwordSaved: string;
}

// ---------------------------------------------------------------------------
// Pied de page + SEO.
// ---------------------------------------------------------------------------

/** Contenu du pied de page de la plateforme. */
export interface PlatformFooterContent {
  /** `{year}` = année courante injectée à l'affichage. */
  copyright: string;
}

/** Métadonnées SEO d'une page plateforme. */
export interface PlatformSeoMeta {
  title: string;
  description: string;
}

/** Métadonnées SEO des pages plateforme. */
export interface PlatformSeoContent {
  login: PlatformSeoMeta;
  signup: PlatformSeoMeta;
  dashboard: PlatformSeoMeta;
}

// ---------------------------------------------------------------------------
// Racine.
// ---------------------------------------------------------------------------

/** Racine du dictionnaire de la plateforme (FR ou EN). */
export interface PlatformContent {
  common: PlatformCommonContent;
  nav: PlatformNavContent;
  auth: AuthContent;
  statuses: StatusesContent;
  pipeline: PipelineContent;
  prospect: ProspectContent;
  brief: BriefContent;
  dashboard: DashboardContent;
  commissions: CommissionsContent;
  client: ClientContent;
  applications: ApplicationsContent;
  profile: ProfileContent;
  footer: PlatformFooterContent;
  seo: PlatformSeoContent;
}
