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
  ctaLabel: string;
  /** Libellé COMPACT du CTA — barre 1024–1279px (spec header v2.1 H4). */
  ctaShort: string;
  /** Accès dashboard — lien SUBTIL du header, jamais dans `items`. */
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
    fileRequired: string;
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
  notFound: NotFoundContent;
  interview: InterviewContent;
  footer: FooterContent;
  seo: SeoMeta;
}
