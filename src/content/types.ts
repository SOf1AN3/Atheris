/**
 * Contrat de contenu typé de la landing page bilingue FR/EN.
 *
 * Type-only : ce module ne produit aucun code exécutable.
 * Il est la source de vérité partagée par `src/content/fr.ts`,
 * `src/content/en.ts` et tous les composants UI.
 *
 * Les noms de champs et de propriétés sont NON NÉGOCIABLES.
 */

/** Icône décorative associée à un service. */
export type ServiceIcon = "globe" | "smartphone" | "monitor" | "cloud";

/** Icône décorative associée à un canal de contact. */
export type ChannelIcon = "mail" | "whatsapp" | "pin";

/** Catégorie d'une étude de cas (filtre). */
export type CaseCategory = "web" | "mobile" | "ai";

/** Identifiant d'un groupe de la stack technique. */
export type TechGroupId = "frontend" | "backend" | "mobile" | "cloud";

/** Variante d'illustration (mockup) utilisée par une étude de cas. */
export type MockupKind =
  | "clinic"
  | "papernote"
  | "radio"
  | "tiberium"
  | "delyx";

/** Wordmark de la marque : ex. `{ name: "ATHERIS", suffix: "LABS" }`. */
export interface Brand {
  name: string;
  suffix: string;
}

/** Entrée de navigation vers une ancre de page. */
export interface NavItem {
  label: string;
  /** Ancre interne, ex. `"#services"`. */
  href: string;
}

/** Textes d'accessibilité (lecteurs d'écran, aria-label). */
export interface A11yStrings {
  skipToContent: string;
  openMenu: string;
  closeMenu: string;
  /** ex. `"Passer à l'anglais"`. */
  switchLocale: string;
  /** aria-label du groupe d'onglets filtres. */
  filtersLabel: string;
  /** aria-label du switcher de stack technique. */
  stackTabsLabel: string;
}

/** Contenu de la barre de navigation. */
export interface NavContent {
  brand: Brand;
  /** 4 items : Services, Réalisations, Technologies, Méthode. */
  items: NavItem[];
  /** Accès dashboard — SEUL aplat volt du header (bouton « Connexion »),
   *  jamais dans `items`. */
  loginLabel: string;
}

/** Statistique de preuve sociale (chiffre + libellé). */
export interface TrustStat {
  value: string;
  label: string;
}

/** Contenu de la section héros (hero). */
export interface HeroContent {
  /** H1. */
  title: string;
  /** Sous-titre H2 visuel. */
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  secondaryCtaHref: string;
  /** Exactement 3 stats. */
  trustStats: TrustStat[];
}

/** Un service proposé. */
export interface ServiceItem {
  id: string;
  icon: ServiceIcon;
  title: string;
  description: string;
  /** Badges tech (3-6). */
  tags: string[];
}

/** Contenu de la section « Services ». */
export interface ServicesContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Exactement 4 items. */
  items: ServiceItem[];
}

/** Une étude de cas (réalisation). */
export interface CaseStudy {
  id: string;
  /** Catégories MULTIPLIES : un projet peut être web + mobile + ai. */
  categories: CaseCategory[];
  /** `true` UNIQUEMENT pour la carte 1. */
  featured: boolean;
  mockup: MockupKind;
  /** Visuel reel du portfolio. Absent -> repli sur `mockup`. */
  image?: string;
  /** URL publique du projet. Absente -> aucun bouton « visiter ». */
  url?: string;
  /** Absent si aucun chiffre fiable n'est a afficher. */
  title: string;
  description: string;
  /** 2-4 tags. */
  tags: string[];
}

/** Contenu de la section « Réalisations ». */
export interface CasesContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Libellé du bouton « visiter » révélé au survol d'une carte. */
  visitLabel: string;
  filters: { all: string; web: string; mobile: string; ai: string };
  /** 4 items (portfolio) — MYKS Radio retiré sur demande (commenté dans fr.ts/en.ts). */
  items: CaseStudy[];
}

/** Un outil/technologie au sein d'un groupe. */
export interface TechGroupItem {
  name: string;
  /** Micro-catégorie affichée sous le nom. */
  hint: string;
}

/** Un groupe de la stack technique. */
export interface TechGroup {
  id: TechGroupId;
  label: string;
  items: TechGroupItem[];
}

/** Contenu de la section « Technologies ». */
export interface TechStackContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Exactement 4 groupes, 6-8 items chacun. */
  groups: TechGroup[];
}

/** Une étape du processus (méthode). */
export interface ProcessStep {
  /** `"01"` .. `"04"`. */
  n: string;
  title: string;
  description: string;
}

/** Contenu de la section « Méthode ». */
export interface ProcessContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Exactement 4 étapes. */
  steps: ProcessStep[];
}

/** Un témoignage client. */
export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  /** Wordmark typographique. */
  company: string;
  /** 1-2 lettres pour l'avatar. */
  initials: string;
  /** ex. `"Projet vérifié"`. */
  verifiedLabel: string;
}

/** Contenu de la section « Témoignages ». */
export interface TestimonialsContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Exactement 3 témoignages. */
  items: Testimonial[];
}

/** Une question fréquente. */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

/** Contenu de la section FAQ. */
export interface FaqContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Exactement 5 questions. */
  items: FaqItem[];
}

/** Un canal de contact direct. */
export interface ContactChannel {
  id: "email" | "whatsapp" | "location";
  icon: ChannelIcon;
  /** Micro-label. */
  label: string;
  /** Valeur affichée. */
  value: string;
  /** `mailto:` / `wa.me`, ou `null` pour la localisation. */
  href: string | null;
}

/** Chaînes du formulaire de contact. */
export interface ContactFormStrings {
  nameLabel: string;
  emailLabel: string;
  typeLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  /** 5 options, `value` en snake_case. */
  typeOptions: { value: string; label: string }[];
  submitLabel: string;
  /** ex. `"Réponse sous 24h ouvrées · Vos informations restent confidentielles"`. */
  note: string;
  errors: {
    nameRequired: string;
    nameMin: string;
    emailRequired: string;
    emailInvalid: string;
    typeRequired: string;
    messageRequired: string;
    messageMin: string;
  };
  successTitle: string;
  successMessage: string;
  /** ex. `"Envoyer une autre demande"`. */
  successAction: string;
}

/** Contenu de la section « Contact ». */
export interface ContactContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Exactement 3 canaux. */
  channels: ContactChannel[];
  form: ContactFormStrings;
}

/** Contenu du pied de page. */
export interface FooterContent {
  tagline: string;
  navLabel: string;
  contactLabel: string;
  /** ex. `"Tous droits réservés."`. */
  rights: string;
  /** ex. `"Mentions légales"`. */
  legal: string;
  /** Liens PROPREMENT pied de page (jamais rendus par le header). */
  links: NavItem[];
}

/** Métadonnées SEO. */
export interface SeoMeta {
  title: string;
  description: string;
  keywords: string[];
}


/** Un bloc de l'offre d'emploi (heading + puces). */
export interface CareersSection {
  id: string;
  heading: string;
  bullets: string[];
}

/** Chaînes du formulaire de candidature (pièce jointe CV). */
export interface CareersFormStrings {
  firstNameLabel: string;
  lastNameLabel: string;
  emailLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  fileLabel: string;
  fileHint: string;
  submitLabel: string;
  note: string;
  errors: {
    firstNameRequired: string;
    lastNameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    fileTooLarge: string;
    fileBadType: string;
    generic: string;
  };
  successTitle: string;
  successMessage: string;
  successAction: string;
}

/** Contenu de la page /recrutement. */
export interface CareersContent {
  eyebrow: string;
  title: string;
  description: string;
  role: string;
  /** 3 meta : contrat, rémunération, remote. */
  meta: string[];
  intro: string;
  sections: CareersSection[];
  applyTitle: string;
  applyDescription: string;
  form: CareersFormStrings;
}

/** Une fiche d'information du kit SDR (document, audience, format…). */
export interface SdrKitFact {
  label: string;
  value: string;
}

/**
 * Contenu de la page `/[locale]/sdr-onboarding-kit` (téléchargement du PDF).
 *
 * Le document lui-même est **intégralement en anglais** et n'est pas traduit :
 * ce bloc ne porte que le chrome de la page (titre, description, actions).
 * `languageNote` rend cette limite explicite côté UI, pour ne jamais laisser
 * croire qu'une version FR existe.
 */
export interface SdrKitContent {
  /** Porte un accent `*…*` rendu en voix serif (convention §2.2.1). */
  eyebrow: string;
  title: string;
  description: string;
  /** Pastilles mono du bandeau document (version, classification…). */
  meta: string[];
  intro: string;
  /** Intitulé du bouton de téléchargement principal. */
  downloadLabel: string;
  /** Nom du fichier, affiché tel quel (identique dans les deux locales). */
  fileName: string;
  /** Note de langue : le PDF est en anglais. */
  languageNote: string;
  /** Titre du bloc « ce que contient le kit ». */
  includesTitle: string;
  /** Sections listées du PDF (libellés courts). */
  includes: string[];
  /** Encart final : rappel de diffusion. */
  confidentialTitle: string;
  confidentialDescription: string;
  facts: SdrKitFact[];
}

/** Chaînes du formulaire d'entretien (créneaux). */
export interface InterviewFormStrings {
  firstNameLabel: string;
  lastNameLabel: string;
  emailLabel: string;
  slotLabel: string;
  submitLabel: string;
  note: string;
  errors: {
    firstNameRequired: string;
    lastNameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    slotRequired: string;
    slotTaken: string;
    rateLimited: string;
    generic: string;
  };
  successTitle: string;
  successMessage: string;
  successAction: string;
}

/** Contenu de la page /entretien/{token}. */
export interface InterviewContent {
  badge: string;
  title: string;
  description: string;
  /** Paragraphe 1/3 — heure de référence de l'entreprise + affichage local. */
  noteReferenceTz: string;
  /** Paragraphe 2/3 — le décalage ne décale PAS les horaires de travail. */
  noteNoNightWork: string;
  /** Paragraphe 3/3 — Google Meet 5 min avant, ~30 min, créneau non modifiable. */
  noteMeetDay: string;
  /** Phrase d'appel avec le lien Meet, placeholder `{{link}}` remplacé au rendu. */
  meetLink: string;
  /** Libellé du bouton d'ouverture de la réunion Google Meet. */
  meetCta: string;
  /** Badge/étiquette identifiant la plateforme Google Meet. */
  meetBadge: string;
  /** Fenêtre J+1→J+3 déjà dépassée (liée à la génération du lien). */
  expiredTitle: string;
  expiredMessage: string;
  stepProfile: string;
  stepSlot: string;
  notFoundTitle: string;
  notFoundMessage: string;
  /** Bloc <noscript> : l'agenda se calcule côté client (fuseau du navigateur). */
  javascriptRequired: string;
  form: InterviewFormStrings;
}

/** Une clause du contrat de partenariat SDR — titre + corps (4-8 lignes). */
export interface ContractClause {
  id: string;
  title: string;
  body: string;
}

/**
 * Contenu de la page `/[locale]/espace/contrat` (consentement au contrat de
 * partenariat SDR — L11, D5/D6).
 *
 * Le texte des 9 clauses vit ICI (source de vérité FR/EN partagée par la page
 * et par la copie e-mail serveur) : la clause `remuneration` porte le barème
 * progressif AUTORITAIRE (D1 — 10 → 20 %, aucun plancher monétaire).
 */
export interface ContractContent {
  /** Titre de page (H1 + metadata). */
  title: string;
  /** Introduction — rappel du caractère non bloquant du consentement (D5). */
  intro: string;
  /** Note légale : la consultation n'est jamais bloquée (D5/H6). */
  nonBlockingNote: string;
  /** Version du contrat accepté — `{{version}}` remplacé côté serveur. */
  versionLabel: string;
  /** Titre de la section des clauses. */
  clausesTitle: string;
  /** Exactement 9 clauses — texte contractuel, identique serveur/client. */
  clauses: ContractClause[];
  /** Case à cocher obligatoire avant validation. */
  checkboxLabel: string;
  acceptLabel: string;
  acceptingLabel: string;
  /** Succès — toast `role="status"` avant re-rendu serveur. */
  successMessage: string;
  /** État « déjà accepté » (rendu serveur) — `{{date}}` = horodatage formaté. */
  acceptedTitle: string;
  acceptedMessage: string;
  /** Copie e-mail envoyée — affiché seulement si `emailSentAt` est renseigné. */
  emailCopyNote: string;
  /** Échec de la lecture de l'état (bloc sobre, aucun détail technique). */
  loadFailed: string;
  /** Codes bruts des Server Actions → messages traduits côté client (C2). */
  errors: {
    invalid: string;
    forbidden: string;
    failed: string;
  };
  /** Copie contractuelle e-mail (textes SERVEUR — jamais rendus en UI). */
  mail: {
    /** Sujet — jamais de `:` après le premier jeton (sanitisé par `sendMail`). */
    subject: string;
    greeting: string;
    intro: string;
    versionLabel: string;
    acceptedAtLabel: string;
    closing: string;
  };
}

/** Contenu de la page 404 (route inconnue). */
export interface NotFoundContent {
  code: string;
  /** Peut porter un accent `*…*` rendu en voix serif. */
  title: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
}

/** Une priorité de l'entreprise (section « À propos »). */
export interface AboutPriority {
  id: string;
  title: string;
  description: string;
}

/** Contenu de la section « À propos » (nouvelle startup algérienne). */
export interface AboutContent {
  eyebrow: string;
  /** Peut porter un accent `*…*` rendu en voix serif. */
  title: string;
  description: string;
  /** Exactement 3 priorités. */
  priorities: AboutPriority[];
  /** Garantie de satisfaction — encart distinct. */
  guaranteeTitle: string;
  guaranteeDescription: string;
}

/** Contenu de la page `/[locale]/examen/[token]` (parcours du candidat).

Le CHROME est localisé (FR/EN) ; les questions elles-mêmes viennent du barème
`src/lib/exam.ts` — source de vérité unique partagée serveur/client, jamais
dupliquée ici. */
export interface ExamContent {
  /** Badge pill en tête de page. */
  badge: string;
  /** Peut porter un accent `*…*` rendu en voix serif. */
  title: string;
  description: string;
  /** État « lien invalide » (jeton inconnu ou déjà soumis). */
  notFoundTitle: string;
  notFoundMessage: string;
  /** État « déjà soumis » — distinct du 404 : le lien a servi, pas perdu.
   *  Même engagement contractuel que `successMessage` : revue « sous 24 h ». */
  submittedTitle: string;
  submittedMessage: string;
  /** Rappel de durée et de caractère non bloquant du chrono. */
  durationNote: string;
  /** Consigne d'autosauvegarde affichée en tête de parcours. */
  autosaveNote: string;
  /** Progression : « Section 2 sur 4 ». */
  progressLabel: string;
  nextSectionLabel: string;
  previousSectionLabel: string;
  submitLabel: string;
  submittingLabel: string;
  /** Libellé d'état d'autosauvegarde (in-progress). */
  savingLabel: string;
  savedLabel: string;
  saveFailedLabel: string;
  /** Message d'erreur générique (code brut traduit côté client). */
  errorLabel: string;
  /** Message affiché lorsqu'une soumission est incomplète — distinct du
   *  message réseau : la cause n'est PAS la connexion, ce sont des questions
   *  sans réponse. */
  incompleteLabel: string;
  /** Repère « question vide » affiché sous CHAQUE champ manquant. */
  missingAnswerLabel: string;
  /** Écran de confirmation après soumission. Le wording est CONTRACTUEL :
   *  il annonce la revue « sous 24 h » et ne promet JAMAIS un délai inférieur. */
  successTitle: string;
  successMessage: string;
  /** Écran « section 4 refusée » — échec éliminatoire. */
  failedTitle: string;
  failedMessage: string;
  /** Mention légale : réponse revue par le CEO sous 24 h. */
  reviewNote: string;
  /** ── Écran « vous avez un examen à passer » (avant le Start) ────────── */
  /** Titre de l'écran d'accueil du test. */
  readyTitle: string;
  /** Description : ce qui va se passer (4 sections, pas d'entretien vidéo). */
  readyDescription: string;
  /** Bouton « Commencer ». */
  startLabel: string;
  /** Libellé pendant l'appel serveur. */
  startingLabel: string;
  /** Rappel de la fenêtre de 3 jours. */
  validityNote: string;
  /** État « lien expiré » (D6) : plus de recrutement possible. */
  expiredTitle: string;
  expiredMessage: string;
}

/** Racine du contenu de la landing page (FR ou EN). */
export interface SiteContent {
  a11y: A11yStrings;
  nav: NavContent;
  hero: HeroContent;
  services: ServicesContent;
  cases: CasesContent;
  techStack: TechStackContent;
  process: ProcessContent;
  testimonials: TestimonialsContent;
  faq: FaqContent;
  contact: ContactContent;
  about: AboutContent;
  careers: CareersContent;
  sdrKit: SdrKitContent;
  exam: ExamContent;
  contract: ContractContent;
  notFound: NotFoundContent;
  interview: InterviewContent;
  footer: FooterContent;
  seo: SeoMeta;
}
