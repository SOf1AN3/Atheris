import type { SiteContent } from "@/content/types";

/**
 * Contenu bilingue de la landing page — version française.
 *
 * Conforme au contrat `SiteContent` (aucun champ ajouté ni omis).
 * Typographie française — espace insécable (`\u00A0`) avant la ponctuation
 * double (deux-points, point-virgule, point d’interrogation et exclamatif).
 */
export const fr: SiteContent = {
  a11y: {
    skipToContent: "Aller au contenu principal",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    switchLocale: "Passer à l’anglais",
    filtersLabel: "Filtrer les réalisations",
    stackTabsLabel: "Changer de catégorie de technologies",
  },

  nav: {
    brand: {
      name: "ATHERIS",
      suffix: "LABS",
    },
    items: [
      { label: "Services", href: "#services" },
      { label: "Réalisations", href: "#realisations" },
      { label: "Technologies", href: "#technologies" },
      { label: "Méthode", href: "#methode" },
    ],
    ctaLabel: "Demander un devis",
  },

  hero: {
    badge: "✦ Studio d’Ingénierie Logicielle & Design Web",
    title: "Nous concevons et développons des produits digitaux sur-mesure.",
    subtitle:
      "Applications Web, Mobile & Desktop à forte valeur ajoutée. Architectures scalables, code d’excellence et design d’interface haut de gamme.",
    primaryCta: "Lancer un projet",
    secondaryCta: "ou réserver un appel découverte →",
    secondaryCtaHref: "#contact",
    trustStats: [
      { value: "+20", label: "Produits livrés" },
      { value: "100%", label: "Code propriétaire & scalable" },
      { value: "A → Z", label: "Accompagnement complet" },
    ],
  },

  services: {
    eyebrow: "Expertise",
    title: "Pôles d’Expertise",
    description:
      "De la conception à la mise en production, nous couvrons l’ensemble du cycle de vie de vos produits digitaux.",
    items: [
      {
        id: "web",
        icon: "globe",
        title: "Applications Web & Plateformes SaaS",
        description:
          "Nous concevons des applications web et plateformes SaaS multi-tenants destinées aux entreprises\u00A0: tableaux de bord, portails clients et outils internes à fort enjeu métier.",
        tags: ["Next.js", "React", "Node.js", "PostgreSQL", "Multi-tenant"],
      },
      {
        id: "mobile",
        icon: "smartphone",
        title: "Applications Mobiles iOS & Android",
        description:
          "Deux plateformes natives, iOS et Android, pensées pour l’usage quotidien\u00A0: interfaces fluides, performances soignées et publication accompagnée sur les stores.",
        tags: ["Flutter", "React Native", "UI/UX mobile-first", "Publication Stores"],
      },
      {
        id: "desktop",
        icon: "monitor",
        title: "Logiciels Desktop Métier & Multi-Plateformes",
        description:
          "Des logiciels métier multi-plateformes, conçus pour s’intégrer à vos processus internes et pour offrir une expérience stable sous Windows, macOS et Linux.",
        tags: ["Electron", "Flutter Desktop", "Windows", "macOS", "Linux"],
      },
      {
        id: "cloud",
        icon: "cloud",
        title: "Modernisation, Refonte & Cloud",
        description:
          "Nous modernisons vos existants\u00A0: audit de performance, refonte d’architecture, migration cloud et mise en production avec une montée en charge maîtrisée.",
        tags: ["Audit de performance", "Core Web Vitals", "API REST/GraphQL", "Scaling"],
      },
    ],
  },

  cases: {
    eyebrow: "Portfolio",
    title: "Projets & Réalisations",
    description:
      "Une sélection de produits digitaux livrés en production, du SaaS métier aux applications temps réel.",
    filters: {
      all: "Tous",
      web: "Web & SaaS",
      mobile: "Mobile",
      ai: "IA & Médias",
    },
    items: [
      {
        id: "clinique",
        category: "web",
        featured: true,
        mockup: "clinic",
        title: "SaaS de Gestion Clinique",
        description:
          "Plateforme SaaS complète de gestion médicale\u00A0: agendas, dossiers patients, facturation et statistiques cabinet, déclinée en multi-tenant sur Next.js et PostgreSQL.",
        tags: ["Next.js", "PostgreSQL", "Multi-tenant", "Stripe"],
        metric: { value: "+100h", label: "économisées / an / cabinet" },
      },
      {
        id: "papernote",
        category: "ai",
        featured: false,
        mockup: "papernote",
        title: "Papernote AI",
        description:
          "Plateforme SaaS d’analyse et de synthèse de documents académiques par IA\u00A0: ingestion, indexation vectorielle et restitutions structurées en quelques secondes.",
        tags: ["Next.js", "OpenAI", "Vector DB", "PostgreSQL"],
        metric: { value: "8s", label: "de synthèse par document" },
      },
      {
        id: "myks-radio",
        category: "mobile",
        featured: false,
        mockup: "radio",
        title: "MYKS Radio",
        description:
          "Infrastructure web et mobile de streaming audio temps réel, avec dashboard de gestion personnalisé et applications iOS et Android diffusant les flux en HLS.",
        tags: ["React Native", "WebSockets", "Node.js", "HLS"],
        metric: { value: "3 plateformes", label: "web, iOS et Android" },
      },
      {
        id: "tiberium",
        category: "web",
        featured: false,
        mockup: "tiberium",
        title: "Tiberium Enterprise",
        description:
          "Solution web de consulting intégrant une messagerie temps réel sécurisée via WebSockets, avec notifications, historique persistant et mise à l’échelle Redis.",
        tags: ["Next.js", "WebSockets", "Redis", "TypeScript"],
        metric: { value: "<100ms", label: "de latence de livraison" },
      },
    ],
  },

  techStack: {
    eyebrow: "Technologies",
    title: "Stack Technique Maîtrisée",
    description:
      "Des technologies éprouvées, choisies selon votre contexte et maintenues dans la durée.",
    groups: [
      {
        id: "frontend",
        label: "Frontend & Interfaces",
        items: [
          { name: "Next.js", hint: "Framework" },
          { name: "React", hint: "Bibliothèque" },
          { name: "TypeScript", hint: "Langage" },
          { name: "Tailwind CSS", hint: "Styles utilitaires" },
          { name: "Framer Motion", hint: "Animations" },
          { name: "Vue.js", hint: "Framework" },
          { name: "React Query", hint: "Données client" },
        ],
      },
      {
        id: "backend",
        label: "Backend & Données",
        items: [
          { name: "Node.js", hint: "Runtime" },
          { name: "PostgreSQL", hint: "Base de données" },
          { name: "Prisma", hint: "ORM" },
          { name: "Redis", hint: "Cache" },
          { name: "GraphQL", hint: "API" },
          { name: "REST API", hint: "API" },
          { name: "MongoDB", hint: "Base de données" },
        ],
      },
      {
        id: "mobile",
        label: "Mobile & Desktop",
        items: [
          { name: "Flutter", hint: "Framework" },
          { name: "React Native", hint: "Framework" },
          { name: "Electron", hint: "Desktop" },
          { name: "Flutter Desktop", hint: "Desktop" },
          { name: "Kotlin", hint: "Android" },
          { name: "Swift", hint: "iOS" },
          { name: "Expo", hint: "Outillage" },
        ],
      },
      {
        id: "cloud",
        label: "Cloud & DevOps",
        items: [
          { name: "Docker", hint: "Conteneurs" },
          { name: "Vercel", hint: "Hébergement" },
          { name: "AWS", hint: "Cloud" },
          { name: "GitHub Actions", hint: "Intégration continue" },
          { name: "Nginx", hint: "Serveur web" },
          { name: "Terraform", hint: "Infrastructure" },
          { name: "Cloudflare", hint: "CDN" },
        ],
      },
    ],
  },

  process: {
    eyebrow: "Méthode",
    title: "Notre Processus de Développement",
    description:
      "Un cadre éprouvé qui sécurise les délais, le budget et la qualité livrée à chaque étape.",
    steps: [
      {
        n: "01",
        title: "Cadrage & Spécifications",
        description:
          "Nous formalisons vos objectifs, vos utilisateurs et le périmètre fonctionnel dans un document de spécifications partagé.",
      },
      {
        n: "02",
        title: "Architecture & Design UI/UX",
        description:
          "Nous structurons l’architecture technique et concevons des maquettes haute-fidélité à valider avant la première ligne de code.",
      },
      {
        n: "03",
        title: "Développement Agile & Sprints",
        description:
          "Le produit avance par itérations courtes, avec démonstrations régulières, intégration continue et recette à chaque sprint.",
      },
      {
        n: "04",
        title: "Déploiement & Support Continu",
        description:
          "Nous assurons la mise en production, la supervision de la stabilité et les évolutions du produit après le lancement.",
      },
    ],
  },

  testimonials: {
    eyebrow: "Témoignages",
    title: "Ils nous font confiance",
    description:
      "Des dirigeants qui nous ont confié la conception et le développement de leurs produits.",
    items: [
      {
        id: "ahcen-b",
        quote:
          "L’équipe a livré un outil qui nous fait gagner plus de 100 heures par an et par cabinet. Le sérieux du code et la qualité des échanges nous ont mis en confiance tout au long du projet.",
        name: "Ahcen B.",
        role: "Fondateur — Clinique Dentaire",
        company: "CLINIQUE+",
        initials: "AB",
        verifiedLabel: "Projet vérifié",
      },
      {
        id: "karim-o",
        quote:
          "La messagerie temps réel a été livrée dans les délais annoncés, sans incident en production. Les points d’avancement étaient clairs et la qualité technique répond à nos exigences.",
        name: "Karim O.",
        role: "CEO — Tiberium",
        company: "TIBERIUM",
        initials: "KO",
        verifiedLabel: "Projet vérifié",
      },
      {
        id: "yacine-m",
        quote:
          "Le design de l’interface est à la hauteur de l’ambition du produit, et l’accompagnement est resté réactif jusqu’au lancement. Nous avions un partenaire impliqué, pas un simple prestataire.",
        name: "Yacine M.",
        role: "Fondateur — Papernote AI",
        company: "PAPERNOTE",
        initials: "YM",
        verifiedLabel: "Projet vérifié",
      },
    ],
  },

  faq: {
    eyebrow: "FAQ",
    title: "Questions fréquentes",
    description:
      "Les points qui reviennent le plus souvent avant le démarrage d’un projet avec nous.",
    items: [
      {
        id: "delais",
        question: "Quels sont les délais de livraison\u00A0?",
        answer:
          "Un projet type se déroule sur 6 à 12 semaines selon sa complexité et le nombre d’écrans. Nous fixons un calendrier dès le cadrage et le réajustons à chaque jalon validé.",
      },
      {
        id: "budget",
        question: "Comment est structuré le budget\u00A0?",
        answer:
          "Chaque projet fait l’objet d’un devis détaillé, au forfait sur périmètre ou en régie pour les besoins évolutifs. Nous construisons ensuite un cadre budgétaire indicatif, ajusté à vos priorités.",
      },
      {
        id: "propriete",
        question: "Qui possède le code source\u00A0?",
        answer:
          "Vous en êtes propriétaire à 100\u00A0%. Le code, les dépôts et tous les livrables vous sont transférés à la livraison, sans dépendance à notre équipe.",
      },
      {
        id: "maintenance",
        question: "Assurez-vous la maintenance après mise en ligne\u00A0?",
        answer:
          "Oui. Nous proposons des contrats de support couvrant la supervision, les correctifs et les évolutions, avec des engagements de délai définis ensemble.",
      },
      {
        id: "confidentialite",
        question: "Travaillez-vous sous NDA\u00A0?",
        answer:
          "Oui, systématiquement si vous le souhaitez. Un accord de confidentialité est signé avant tout échange technique ou financier relatif à votre projet.",
      },
    ],
  },

  contact: {
    eyebrow: "Contact",
    title: "Concrétisons votre projet",
    description:
      "Décrivez-nous votre besoin\u00A0: nous revenons vers vous sous 24h ouvrées avec une première lecture et la suite à donner.",
    channels: [
      {
        id: "email",
        icon: "mail",
        label: "Email professionnel",
        value: "contact@atherislabs.com",
        href: "mailto:contact@atherislabs.com",
      },
      {
        id: "whatsapp",
        icon: "whatsapp",
        label: "WhatsApp Entreprise",
        value: "+213 555 00 00 00",
        href: "https://wa.me/213555000000",
      },
      {
        id: "location",
        icon: "pin",
        label: "Localisation",
        value: "Remote & Algérie",
        href: null,
      },
    ],
    form: {
      nameLabel: "Nom / Entreprise",
      emailLabel: "Email",
      typeLabel: "Type de projet",
      messageLabel: "Message",
      messagePlaceholder: "Décrivez brièvement votre projet, vos objectifs et vos délais…",
      typeOptions: [
        { value: "web_saas", label: "Application Web / SaaS" },
        { value: "mobile", label: "Application Mobile" },
        { value: "desktop", label: "Logiciel Desktop" },
        { value: "cloud", label: "Modernisation & Cloud" },
        { value: "other", label: "Autre besoin" },
      ],
      submitLabel: "Envoyer la demande de devis",
      note: "Réponse sous 24h ouvrées · Vos informations restent confidentielles",
      errors: {
        nameRequired: "Merci d’indiquer votre nom ou celui de votre entreprise.",
        nameMin: "Merci de renseigner au moins 2 caractères.",
        emailRequired: "Merci d’indiquer votre adresse email.",
        emailInvalid: "Merci de saisir une adresse email valide.",
        typeRequired: "Merci de sélectionner le type de projet.",
        messageRequired: "Merci de décrire brièvement votre projet.",
        messageMin: "Merci de fournir un message d’au moins 20 caractères.",
      },
      successTitle: "Merci\u00A0!",
      successMessage: "Votre demande a bien été préparée. Nous revenons vers vous sous 24h ouvrées.",
      successAction: "Envoyer une autre demande",
    },
  },

  footer: {
    tagline: "Ingénierie logicielle et design web\u00A0: des produits digitaux conçus pour durer.",
    navLabel: "Navigation",
    contactLabel: "Contact",
    rights: "Tous droits réservés.",
    legal: "Mentions légales",
  },

  seo: {
    title: "ATHERIS LABS — Studio d’Ingénierie Logicielle & Produits Digitaux sur-Mesure",
    description:
      "ATHERIS LABS conçoit des produits digitaux sur-mesure\u00A0: applications Web, Mobile & Desktop à forte valeur ajoutée, architectures scalables et code d’excellence.",
    keywords: [
      "agence web",
      "développement application sur-mesure",
      "studio logiciel",
      "développement application mobile",
      "agence développement logiciel",
      "refonte site web",
      "application SaaS B2B",
      "développement logiciel desktop",
    ],
  },
} satisfies SiteContent;
