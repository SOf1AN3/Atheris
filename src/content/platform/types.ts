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
  documentKindEnum,
  interviewStatus,
  milestoneKeyEnum,
  milestoneStatusEnum,
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

/** Statut d'un entretien, dérivé de l'enum `interview_status` (PLAN §1.1). */
export type InterviewStatus = (typeof interviewStatus.enumValues)[number];

/** Les 5 jalons imposés, dérivés de l'enum `milestone_key` (T02). */
export type MilestoneKey = (typeof milestoneKeyEnum.enumValues)[number];

/** État d'un jalon, dérivé de l'enum `milestone_status` (T02). */
export type MilestoneStatus = (typeof milestoneStatusEnum.enumValues)[number];

/** Type de document PDF, dérivé de l'enum `document_kind` (T02). */
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];

/**
 * Codes d'échec de connexion (T03). Union locale **en miroir** de
 * `LoginFailureCode` (`src/actions/auth.ts`) — volontairement redéfinie ici
 * pour garder la couche de contenu indépendante des Server Actions ; les deux
 * doivent rester alignés (invalid | rate_limited | pending | rejected).
 */
export type LoginErrorCode =
  | "invalid"
  | "rate_limited"
  | "pending"
  | "rejected"
  /** Erreur de configuration du service auth côté serveur (pas une faute client). */
  | "config";

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
  /** Rôle `sdr` — aligné sur l'enum `role` de la DB (renommé dans le Lot 3). */
  sdr: PlatformNavItem[];
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
  /** Service auth mal configuré côté serveur (ex. secret absent) — n'accuse
   *  jamais l'utilisateur, la réessayer n'aidera pas mais reste honnête. */
  config: string;
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

/** Textes de l'e-mail d'invitation à la création de compte. */
export interface InvitationEmailContent {
  /** Objet de l'e-mail. */
  subject: string;
  /**
   * Corps de l'e-mail — placeholders littéraux `{{name}}` et `{{link}}`,
   * remplacés côté serveur avant envoi (voir convention plus haut).
   */
  body: string;
}

/** Page d'activation d'un lien d'invitation (compte `sdr` ou `client`). */
export interface InvitationContent {
  title: string;
  /** Phrase descriptive sous le titre (générique, tous rôles). */
  description: string;
  submit: string;
  successTitle: string;
  successBody: string;
  /** Jeton expiré (`expiresAt` dépassé). */
  expired: string;
  /** Lien déjà consommé (`usedAt` renseigné). */
  used: string;
  /** Jeton inconnu ou invalide (aucun détail). */
  invalid: string;
  /** Email déjà pourvu d'un compte (refus de takeover). */
  duplicate: string;
  /** Textes des e-mails d'invitation, par rôle destinataire. */
  email: {
    sdr: InvitationEmailContent;
    client: InvitationEmailContent;
  };
}

/**
 * Contenu du flux « mot de passe oublié » (L10 · VAGUE 2) — jeton stateless
 * signé HMAC, valable 30 minutes, aucune table (voir `src/actions/
 * password-reset.ts` pour les limites documentées).
 */
export interface PasswordResetContent {
  /** Page `/{locale}/mot-de-passe-oublie` : demande par e-mail. */
  forgot: {
    title: string;
    subtitle: string;
    emailLabel: string;
    submit: string;
    submitLoading: string;
    /** Message après soumission — TOUJOURS le même, même compte inconnu (C4). */
    success: string;
    /** Libellé du lien « mot de passe oublié ? » sous le formulaire de
     *  connexion (remplace l'ancien texte mort `login.forgotNote`). */
    linkLabel: string;
  };
  /** Page `/{locale}/reinitialisation?token=…` : choix du nouveau mot de passe. */
  reset: {
    title: string;
    subtitle: string;
    passwordLabel: string;
    passwordConfirmLabel: string;
    submit: string;
    submitLoading: string;
    successTitle: string;
    successBody: string;
    /** Lien de CTA après succès → `/{locale}/connexion` (libellé `login.submit`). */
    signIn: string;
    /** Jeton absent, expiré ou invalide — un SEUL message, aucun détail (C4). */
    invalidToken: string;
    /** Repli pour tout code inattendu + erreur réseau → `login.errors.generic`. */
    errorGeneric: string;
    /** Service de réinitialisation inopérant côté serveur → `login.errors.config`. */
    errorService: string;
  };
  /** Textes de l'e-mail de réinitialisation. */
  email: {
    /** Objet de l'e-mail. */
    subject: string;
    /** Corps — placeholder littéral `{{link}}` remplacé côté serveur avant envoi. */
    body: string;
  };
}

/** Contenu authentification racine. */
export interface AuthContent {
  login: LoginContent;
  signup: SignupContent;
  validation: ValidationContent;
  invitation: InvitationContent;
  passwordReset: PasswordResetContent;
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
  /** États d'un jalon (enum `milestone_status`, T02). */
  milestoneStatus: Record<MilestoneStatus, string>;
  /** Types de document PDF (enum `document_kind`, T02). */
  document: Record<DocumentKind, string>;
  role: Record<Role, string>;
  userStatus: Record<UserStatus, string>;
}

// ---------------------------------------------------------------------------
// Pipeline commercial (tableau + filtres + messages).
// ---------------------------------------------------------------------------

/** Contenu de la page pipeline. */
export interface PipelineContent {
  /** Libellé du CTA de création (« Nouveau prospect »). */
  newProspect: string;
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
    /** Texte placeholder de l'onglet Fiche avant construction du brief. */
    briefPlaceholder: string;
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
    /** Dernière modification de la fiche (`prospects.updatedAt`). */
    updatedAt: string;
  };
  /** États de la liste / pipeline. */
  list: {
    /** Description de l'état vide de la liste prospect. */
    empty: string;
  };
  /** Libellés des champs du formulaire de création (FE-7). */
  fields: {
    /** Nom complet ou raison sociale. */
    fullName: string;
    /** Note libre jointe à la création. */
    note: string;
  };
  actions: {
    changeStatus: string;
    /** Avertissement : motif obligatoire (ex. passage à `disqualifie`). */
    reasonRequired: string;
    reasonLabel: string;
    confirmChange: string;
    /** Refus d'action si le rôle connecté n'a pas les droits. */
    lockedByRole: string;
    /** Toast de succès après un changement de statut — `{status}` = libellé du nouveau statut. */
    statusChanged: string;
    /** Toast « rechargé » quand l'état est obsolète (conflit de version). */
    conflict: string;
  };
  /** Onglet Devis & paiements (FE-8). */
  deals: {
    /** CTA de création d'un devis (CEO). */
    createQuote: string;
    /** Champ référence externe optionnelle du devis. */
    externalRef: string;
    /** Champ PDF joint au devis. */
    pdf: string;
    /** Erreur sous le champ montant. */
    amountInvalid: string;
    /** Erreur sous le champ PDF (5 Mo, `%PDF`). */
    pdfInvalid: string;
    /** CTA d'ajout d'une échéance de paiement. */
    addPayment: string;
    /** Champ libellé d'une échéance (« Acompte »…). */
    paymentLabel: string;
    /** Champ date d'échéance. */
    paymentDue: string;
    /** Bouton d'encaissement d'une échéance. */
    markPaid: string;
    /** Bouton de transition `draft→sent` d'un devis. */
    markSent: string;
    /** État vide : aucun devis rattaché au prospect. */
    empty: string;
    /** Badge d'échéance encaissée. */
    paid: string;
    /** Badge d'échéance à venir. */
    upcoming: string;
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
  /** Toast de confirmation après enregistrement d'un bloc. */
  savedToast: string;
  /** Bandeau « lecture seule » (rôle sans droit d'écriture). */
  readOnlyNotice: string;
  /** Bouton « Précédent » (recule d'une étape dans l'assistant). */
  previous: string;
  /** Lien accessible de retour vers la fiche prospect. */
  backToProspect: string;
  /** Libellé du bouton pendant l'enregistrement. */
  saving: string;
  /** Carte « Envoyer le lien d'accès client » (fiche prospect, CEO seul). */
  clientAccess: {
    /** Titre de la carte (au-dessus du bouton d'envoi). */
    title: string;
    /** Phrase d'explication : lien e-mail, 48 h, création sans validation. */
    description: string;
    /** Libellé du bouton d'envoi. */
    send: string;
    /** Libellé du bouton pendant l'appel serveur. */
    sending: string;
    /** Accusé de réception après envoi de l'e-mail. */
    success: string;
    /** Avertissement si l'e-mail n'a pas pu être envoyé (repli copie). */
    mailFallback: string;
  };
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
  /** Titre de page (`<h1>`) du tableau de bord. */
  title: string;
  kpi: string;
  /** Libellés des indicateurs clés (KPI). */
  kpis: {
    /** CA encaissé. */
    collected: string;
    /** Valeur du pipeline. */
    pipeline: string;
    /** Taux de conversion. */
    conversion: string;
    /** Sous-ligne pipeline — `{count}` = devis en attente. */
    quotesSent: string;
  };
  /** Agrégats de la vue manager. */
  totals: {
    /** Sous-ligne totaux — `{count}` = nombre de versements. */
    paidCount: string;
  };
  /** Colonnes du classement SDR (manager). */
  ranking: {
    /** Rang d'affichage (1 = tête). */
    rank: string;
    /** Prospects ajoutés. */
    added: string;
    /** Devis rattachés. */
    deals: string;
    /** Taux de conversion. */
    conversion: string;
  };
  actionQueues: string;
  recentActivity: string;
  perEmployee: {
    /** Titre du bloc « stats par employé » (CEO). */
    title: string;
    /** Colonnes du funnel. */
    funnel: string;
    activity: string;
    profitability: string;
    /** Prospects ajoutés. */
    added: string;
    /** Prospects qualifiés. */
    qualified: string;
    /** Deals signés. */
    signed: string;
    /** Taux de conversion. */
    conversion: string;
    /** Changements de statut. */
    changes: string;
    /** CA généré. */
    generated: string;
    /** Coût des commissions. */
    cost: string;
    /** Marge. */
    margin: string;
  };
  /** Libellés des files d'action (chaque file pointe vers sa page). */
  queues: {
    pendingApplications: string;
    quotesNoAnswer: string;
    commissionsDue: string;
    remindersToday: string;
    /** Fiches projet incomplètes (dashboard commercial). */
    incompleteBriefs: string;
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
  /** Titre de l'espace gains du sdr. */
  myEarnings: string;
  /** Colonne « Réf deal » (uuid court du devis). */
  dealRef: string;
  /** Colonne « Bénéficiaire ». */
  beneficiary: string;
  /** Colonne « Deal » (nom du prospect + montant). */
  deal: string;
  /** Compteur de sélection — `{count}` = lignes sélectionnées. */
  selectedCount: string;
  /** Toast après versement groupé ou unitaire. */
  paidToast: string;
  /** Rappel affiché avant le 1ᵉʳ encaissement (déclencheur des commissions). */
  generatesWarning: string;
  /** Toast explicite après génération — `{count}` = commissions générées. */
  generatedCount: string;
  tier: {
    label: string;
    current: string;
    /** `{tier}` = libellé du prochain palier, `{rate}` = taux associé. */
    nextTier: string;
  };
}

// ---------------------------------------------------------------------------
// Entretiens (liens de réservation — espace CEO, PLAN Q3).
// ---------------------------------------------------------------------------

/** Libellés des 3 états de la table `interviews` (enum `interview_status`). */
export type InterviewStatusLabels = Record<InterviewStatus, string>;

/**
 * Codes d'échec de `createInterviewLink`, **traduits localement** : le serveur
 * ne renvoie jamais de message, uniquement un code (contrat §2.3).
 */
export interface InterviewLinkErrors {
  /** Session absente, compte non `active` ou rôle non `ceo`. */
  forbidden: string;
  /** Locale refusée par la validation serveur. */
  invalid: string;
  /** Repli : échec d'infra (collision d'index, base indisponible). */
  failed: string;
}

/** Contenu de la page « Entretiens » (`/espace/entretien`, CEO seul). */
export interface InterviewsContent {
  /** Titre de la page (`<h1>` + métadonnées). */
  title: string;
  /** Description courte sous le titre. */
  intro: string;
  /** Titre du bloc de création (carte haute). */
  createTitle: string;
  /** Aide permanente sous le titre de création. */
  createHint: string;
  /** Libellé du bouton de création (unique aplat volt de la page). */
  create: string;
  /** Libellé du bouton pendant l'appel serveur. */
  creating: string;
  /** Champ facultatif « Nom du lien » du formulaire de création. */
  linkName: string;
  /** Placeholder du champ facultatif « Nom du lien ». */
  linkNamePlaceholder: string;
  /** Titre du bloc « lien fraîchement créé ». */
  linkTitle: string;
  /** Label visible + `aria-label` du champ URL. */
  linkLabel: string;
  /** Bouton de copie (résultat de création + chaque ligne réservable). */
  copy: string;
  /** Retour visuel et `aria-live` après une copie réussie (1,5 s). */
  copied: string;
  /** Retour `aria-live` si l'API Clipboard échoue (champ sélectionné). */
  copyFallback: string;
  /** Lien direct vers la page publique `/{locale}/entretien/{token}`. */
  openLink: string;
  /** Bouton de suppression d'un lien d'entretien. */
  delete: string;
  /** Libellé du bouton pendant l'appel serveur de suppression. */
  deleting: string;
  /** Confirmation avant suppression définitive (dialogue irréversible). */
  deleteConfirm: string;
  /** Titre de la liste. */
  listTitle: string;
  /** État vide : phrase principale. */
  empty: string;
  /** État vide : phrase secondaire sous l'icône. */
  emptyHint: string;
  /** Badge « Réservé » d'une ligne déjà pourvue d'un créneau. */
  booked: string;
  /** Texte de remplacement d'une ligne pas encore réservée. */
  notBooked: string;
  /** Badge identifiant la plateforme Google Meet (page CEO). */
  meetBadge: string;
  /** Note sous le titre de la liste : fuseau d'affichage (`Africa/Algiers`). */
  timezoneNote: string;
  /** Micro-labels des blocs d'information de chaque ligne. */
  columns: {
    created: string;
    slot: string;
    candidate: string;
    link: string;
  };
  /** Statuts de la table `interviews`. */
  status: InterviewStatusLabels;
  /** Codes de `createInterviewLink` traduits côté client. */
  errors: InterviewLinkErrors;
}

// ---------------------------------------------------------------------------
// Notifications in-app (cloche topbar, PLAN §FE-A Lot 4).
// ---------------------------------------------------------------------------

/**
 * Les 12 types de notifications, **miroir exact** de l'union `NotificationType`
 * de `src/lib/notify.ts` (source de vérité des `type` écrits en DB). Volontairement
 * redéfinie ici pour garder la couche contenu indépendante du module serveur ;
 * les deux doivent rester alignés.
 */
export type NotificationType =
  | "contact_received"
  | "application_created"
  | "interview_booked"
  | "prospect_status_changed"
  | "quote_signed"
  | "project_message"
  | "commission_due"
  | "commission_paid"
  | "milestone_validated"
  | "account_activated"
  | "reminder_due"
  | "mail_failed";

/**
 * Contenu du panneau de notifications in-app.
 *
 * CONVENTION PLACEHOLDERS — double accolade (`{{actor}}`, `{{entity}}`,
 * `{{count}}`), distincte des `{single}` de la landing : le `type` brut et le
 * `meta` (`{ actor, entity, … }`, strings brutes) viennent de l'API, la phrase
 * est assemblée côté client par simple `String.replace`.
 */
export interface NotificationsContent {
  /** Titre du panneau déroulant. */
  title: string;
  /** `aria-label` du bouton cloche de la topbar. */
  open: string;
  /** État vide : aucune notification non lue. */
  empty: string;
  /** Bouton « tout marquer lu ». */
  markAll: string;
  /** Badge du compteur de non-lues — `{{count}}` = nombre de notifications non lues (forme plurielle par défaut). */
  unreadBadge: string;
  /** Libellé de l'action « Voir » (toasts de notification). */
  view: string;
  /** Phrase par type de notification — `{{actor}}` = nom de l'auteur, `{{entity}}` = libellé de l'entité concernée. */
  items: Record<NotificationType, string>;
  /** Repli affiché si le `type` renvoyé par l'API est inconnu côté client. */
  unknown: string;
}

// ---------------------------------------------------------------------------
// Recrutement (candidatures /recrutement — espace CEO).
// ---------------------------------------------------------------------------

/**
 * Codes d'échec des actions de recrutement (traduits côté client, jamais
 * servis en message par le serveur — miroir de `inviteToInterview` /
 * `rejectApplication` dans `src/actions/recrutement.ts`).
 */
export interface RecruitmentErrors {
  /** Session absente, compte non `active` ou rôle non `ceo`. */
  forbidden: string;
  /** Saisie refusée par la validation serveur (objet / message vides…). */
  invalid: string;
  /** Identifiant de candidature inconnu. */
  notFound: string;
  /** La candidature a déjà été invitée ou refusée (transition figée). */
  conflict: string;
  /** Envoi e-mail échoué — aucune modification n'a été appliquée. */
  mailFailed: string;
  /** Repli : échec d'infra (base indisponible). */
  failed: string;
}

/** Statuts d'une candidature, dérivés de l'enum `job_application_status`.

Le type est dérivé de l'enum Drizzle (`import type` entièrement effacé à la
compilation — ce module reste type-only). Source de vérité UNIQUE : la
précédente union ré-enumerée en dur ici désynchronisait cette page des 3
statuts du pipeline zero-interview et cassait `tsc`. */
import type { applicationStatusEnum } from "@/lib/db/schema";

export type JobApplicationStatus =
  (typeof applicationStatusEnum.enumValues)[number];

/** Contenu de la page « Recrutement » (/espace/recrutement, CEO seul). */
export interface RecruitmentContent {
  title: string;
  intro: string;
  listTitle: string;
  empty: string;
  emptyHint: string;
  columns: {
    candidate: string;
    status: string;
    appliedAt: string;
    slot: string;
    actions: string;
  };
  status: Record<JobApplicationStatus, string>;
  filterLabel: string;
  filterAll: string;
  timezoneNote: string;
  booked: string;
  notBooked: string;
  openDetail: string;
  closeDetail: string;
  detailTitle: string;
  messageLabel: string;
  noMessage: string;
  emailLabel: string;
  cvDownload: string;
  invitedAtLabel: string;
  rejectedAtLabel: string;
  inviteAction: string;
  rejectAction: string;
  /** CTA « Recruter » — envoie le lien de création de compte au candidat. */
  recruitAction: string;
  /** Libellé du bouton pendant l'appel serveur de recrutement. */
  recruiting: string;
  /** Toast de succès : le lien de recrutement a été envoyé par e-mail. */
  recruitSuccess: string;
  /** Erreur : envoi du lien de recrutement impossible. */
  recruitError: string;
  unavailable: string;
  /** ── Revue de l'examen (pipeline zero-interview) ─────────────────────── */
  /** Titre du bloc de réponses dans le dossier candidat. */
  examTitle: string;
  /** Aucune session d'examen (candidature antérieure au pipeline). */
  examAbsent: string;
  /** Session créée mais non soumise (candidat en cours). */
  examInProgress: string;
  /** En-tête « durée mesurée » — indicative, jamais bloquante. */
  examDurationLabel: string;
  /** En-tête « soumis le » (horodatage, fuseau du CEO). */
  examSubmittedLabel: string;
  /** Alerte au-delà de l'engagement public de revue sous 24 h. */
  examOverdue: string;
  /** Mention tranquille : dans les délais. */
  examWithinDeadline: string;
  /** Réponses vides (session créée, aucune écriture). */
  examNoAnswers: string;
  /** Format « section 2 sur 4 » (index de section dans la revue). */
  examSectionLabel: string;
  /** ── Génération de lien d'examen (remplace « inviter à un entretien ») ── */
  /** CTA : générer le lien de test pour cette candidature. */
  generateExamAction: string;
  /** Libellé pendant l'appel serveur. */
  generatingExam: string;
  /** Champ affichant l'URL à copier, une fois générée. */
  examLinkLabel: string;
  /** Bouton de copie du lien. */
  copyLink: string;
  /** Confirmation de copie. */
  linkCopied: string;
  /** Échec de génération. */
  generateExamError: string;
  /** Conflit : test déjà soumis, ou candidature à statut terminal. */
  generateExamConflict: string;
  /** Mention lorsqu'un lien existait déjà (non recréé). */
  examLinkExisting: string;
  /** ── Revue : repère de réponse attendue (QCM) ─────────────────────────── */
  /** En-tête « réponse attendue » — affiché au SEUL CEO (jamais au candidat). */
  examExpectedLabel: string;
  /** Le choix du candidat correspond à la réponse attendue. */
  examMatches: string;
  /** Le choix du candidat diffère de la réponse attendue. */
  examDiffers: string;
  /** Message affiché lorsqu'une soumission est incomplète (questions vides). */
  examIncomplete: string;
  modal: {
    inviteTitle: string;
    rejectTitle: string;
    subjectLabel: string;
    bodyLabel: string;
    bodyHint: string;
    saveTemplateLabel: string;
    send: string;
    sending: string;
    cancel: string;
    successInvite: string;
    successReject: string;
    loadError: string;
    errors: RecruitmentErrors;
  };
}

// ---------------------------------------------------------------------------
// Revue d'examen (/espace/examen — page CEO du pipeline zero-interview).
// ---------------------------------------------------------------------------

/**
 * Codes d'échec traduits côté client — les Server Actions ne renvoient que
 * des codes BRUTS (`forbidden`, `invalid`…), jamais un message (C2).
 *
 * Couvre les deux actions utilisées par la page : `listExamReviewSessions` /
 * `getExamReviewSession` (`forbidden`, `not_found`, `failed`) et
 * `recruitCandidate` (`invalid`, `mail_failed`…).
 */
export interface ExamReviewErrors {
  /** Session absente, compte non `active` ou rôle non `ceo`. */
  forbidden: string;
  /** Saisie refusée par la validation serveur, ou transition non autorisée. */
  invalid: string;
  /** Id de session malformé, inconnu, ou candidature disparue. */
  notFound: string;
  /** La candidature a déjà été tranchée (décision concurrente / idempotence). */
  conflict: string;
  /** Envoi d'e-mail échoué — aucune modification n'a été appliquée. */
  mailFailed: string;
  /** Repli : échec d'infra (base indisponible). */
  failed: string;
}

/** Libellés d'une popup de confirmation (annulation + validation EXPLICITES). */
export interface ExamReviewConfirmContent {
  title: string;
  message: string;
  cancel: string;
  confirm: string;
}

/** Contenu de la page « Examen » (/espace/examen, CEO seul). */
export interface ExamReviewContent {
  /** Titre de page (H1 + `metadata.title`). */
  title: string;
  /** Chapeau court expliquant le tri et le filtre d'archives (H3). */
  intro: string;
  /** Titre de section « En cours » (sessions non soumises, triées en tête). */
  inProgressTitle: string;
  /** Titre de section « Soumis » (file de revue « < 24 h »). */
  submittedTitle: string;
  /** Aide sous l'état vide (`common.noData`). */
  emptyHint: string;
  /** Libellés de champs des lignes de la liste et du détail. */
  columns: {
    email: string;
    status: string;
    startedAt: string;
    submittedAt: string;
    duration: string;
  };
  /** Pastilles de statut de la SESSION d'examen. */
  sessionStatus: {
    inProgress: string;
    submitted: string;
  };
  /** Bouton « Voir les réponses » / « Masquer les réponses ». */
  openDetail: string;
  closeDetail: string;
  /** Titre du bloc de réponses déplié. */
  detailTitle: string;
  /** En-tête « statut de la candidature » (détail). */
  applicationStatusLabel: string;
  /** En-tête « ouvert le » (détail). */
  startedAtLabel: string;
  /** En-tête « soumis le » (détail). */
  submittedAtLabel: string;
  /** En-tête « lien valable jusqu'au » (détail). */
  expiresAtLabel: string;
  /** En-tête « durée mesurée » — indicative, jamais bloquante. */
  durationLabel: string;
  /** Format « Section {{n}} » avant le titre de section du barème. */
  sectionLabel: string;
  /** Aucune réponse enregistrée pour cette question. */
  noAnswers: string;
  /** Pastille « question éliminatoire » (section 4). */
  eliminatoryLabel: string;
  /** En-tête « réponse attendue » — affiché au SEUL CEO (règle `exam.ts`). */
  expectedAnswer: string;
  /** Le choix du candidat correspond à la réponse attendue. */
  answerMatches: string;
  /** Le choix du candidat diffère de la réponse attendue. */
  answerDiffers: string;
  /** Délai respecté : soumission de moins de 24 h, non encore tranchée. */
  withinDeadline: string;
  /** Délai de revue de 24 h dépassé. */
  overdue: string;
  /** CTA « Recruter ». */
  recruitAction: string;
  /** Libellé du bouton pendant l'appel `recruitCandidate`. */
  recruiting: string;
  /** Toast de succès (`role="status"`). */
  recruitSuccess: string;
  /** CTA « Refuser » (ouvre le modal d'e-mail `kind="reject"`). */
  rejectAction: string;
  /** Popup de confirmation — un clic ne recrute JAMAIS directement. */
  confirmRecruit: ExamReviewConfirmContent;
  /** Popup de confirmation — un clic ne refuse JAMAIS directement. */
  confirmReject: ExamReviewConfirmContent;
  /** Codes retour traduits (jamais de message servi par le serveur). */
  errors: ExamReviewErrors;
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
  /** État vide : aucun projet actif rattaché au compte client. */
  emptyProject: string;
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
  /** Libellé de la colonne « Rôle ». */
  role: string;
  /** Aide au motif de refus (minimum de caractères). */
  rejectReasonHint: string;
  /** Refus d'action (rôle sans droit d'écriture). */
  forbidden: string;
}

// ---------------------------------------------------------------------------
// Journal d'audit (activités).
// ---------------------------------------------------------------------------

/**
 * Phrases du journal d'audit, indexées sur les `action` écrites par les
 * Server Actions (`src/actions/*`). Chaque phrase est un gabarin remplacé à
 * l'affichage via `String.replace` — `{actor}` = nom de l'auteur, `{from}` /
 * `{to}` = libellés de statut localisés. `unknown` sert de repli pour toute
 * action inconnue.
 */
export interface ActivitiesContent {
  /** `{actor}`, `{from}`, `{to}` — transition de statut d'un prospect. */
  statusChanged: string;
  /** `{actor}` — création d'un prospect depuis le pipeline. */
  prospectCreated: string;
  /** `{actor}` — changement de statut d'un devis. */
  quoteStatusChanged: string;
  /** `{actor}` — encaissement d'une échéance. */
  paymentPaid: string;
  /** `{actor}` — génération des commissions d'un devis. */
  commissionsGenerated: string;
  /** `{actor}` — versement de commissions. */
  commissionsPaid: string;
  /** `{actor}` — mise à jour de la fiche projet. */
  briefUpdated: string;
  /** `{actor}` — validation d'un jalon. */
  milestoneValidated: string;
  /** `{actor}` — clôture d'un projet client. */
  projectClosed: string;
  /** `{actor}` — émission d'une invitation client. */
  invitationCreated: string;
  /** Activation d'un compte client via invitation (sans auteur). */
  invitationActivated: string;
  /** `{actor}` — décision sur une candidature. */
  applicationDecided: string;
  /** `{actor}` — mise à jour du profil. */
  profileUpdated: string;
  /** `{actor}` — dépôt d'un document. */
  documentUploaded: string;
  /** `{actor}` — suppression d'un document. */
  documentDeleted: string;
  /** Prospect créé depuis le formulaire de contact (visiteur anonyme). */
  contactReceived: string;
  /** Chargement du jeu de données de démonstration. */
  seedDemo: string;
  /** Repli pour toute action inconnue. */
  unknown: string;
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
  /** Page publique d'activation d'une invitation client. */
  invitation: PlatformSeoMeta;
  /** Pages du flux « mot de passe oublié » (demande puis réinitialisation). */
  passwordReset: {
    forgot: PlatformSeoMeta;
    reset: PlatformSeoMeta;
  };
  /** Page projet du portail client. */
  clientPortal: PlatformSeoMeta;
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
  interviews: InterviewsContent;
  /** Notifications in-app (cloche topbar, PLAN §FE-A Lot 4). */
  notifications: NotificationsContent;
  /** Page « Recrutement » (candidatures /recrutement, CEO seul). */
  recruitment: RecruitmentContent;
  /** Page « Examen » (revue des sessions d'examen, CEO seul). */
  examReview: ExamReviewContent;
  client: ClientContent;
  applications: ApplicationsContent;
  activities: ActivitiesContent;
  profile: ProfileContent;
  footer: PlatformFooterContent;
  seo: PlatformSeoContent;
}
