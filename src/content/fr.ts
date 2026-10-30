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
    ctaShort: "Devis",
    loginLabel: "Connexion",
  },

  hero: {
    title: "Nous concevons et développons des produits digitaux *sur-mesure*.",
    subtitle:
      "Applications Web, Mobile & Desktop à forte valeur ajoutée. Architectures scalables, code d’excellence et design d’interface haut de gamme.",
    primaryCta: "Lancer un projet",
    secondaryCta: "ou réserver un appel découverte",
    secondaryCtaHref: "#contact",
    trustStats: [
      { value: "+20", label: "Produits livrés" },
      { value: "100%", label: "Code propriétaire & scalable" },
      { value: "A → Z", label: "Accompagnement complet" },
    ],
  },

  services: {
    eyebrow: "Expertise",
    title: "Pôles d’*Expertise*",
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
    title: "Projets & *Réalisations*",
    description:
      "Une sélection de produits digitaux livrés en production, du SaaS métier aux applications temps réel.",
    visitLabel: "Visiter le site",
    filters: {
      all: "Tous",
      web: "Web & SaaS",
      mobile: "Mobile",
      ai: "IA & Médias",
    },
    items: [
      {
        id: "clinique",
        categories: ["web"],
        featured: true,
        mockup: "clinic",
        image: "projects/dental.jpg",
        url: "https://dental-app-beta1.vercel.app/",
        title: "SaaS de Gestion Clinique",
        description:
          "Plateforme SaaS complète de gestion médicale\u00A0: agendas, dossiers patients, facturation et statistiques cabinet, déclinée en multi-tenant sur Next.js et PostgreSQL.",
        tags: ["Next.js", "PostgreSQL", "Multi-tenant", "Stripe"],
      },
      {
        id: "papernote",
        categories: ["web", "ai", "mobile"],
        featured: false,
        mockup: "papernote",
        image: "projects/papernote.jpg",
        url: "https://reviewer-ai-delta.vercel.app/fr",
        title: "Papernote",
        description:
          "Plateforme SaaS d'analyse et de synthèse de documents académiques par IA\u00A0: ingestion, indexation vectorielle et restitutions structurées en quelques secondes.",
        tags: ["Next.js", "OpenAI", "Vector DB", "PostgreSQL"],
      },
      {
        id: "delyx",
        categories: ["web", "mobile"],
        featured: false,
        mockup: "delyx",
        image: "projects/delyx.jpg",
        url: "https://delyx-delivery.vercel.app/",
        title: "Delyx Delivery",
        description:
          "Plateforme de livraison à moto à travers l'Algérie\u00A0: le client décrit sa course, choisit son livreur, suit le trajet en direct par géolocalisation et paie à la livraison.",
        tags: ["Next.js", "PostgreSQL", "TypeScript", "Tailwind CSS"],
      },
      {
        id: "tiberium",
        categories: ["web"],
        featured: false,
        mockup: "tiberium",
        image: "projects/tiberium.jpg",
        url: "https://tiberium-next.vercel.app/",
        title: "Tiberium Consulting",
        description:
          "Plateforme de consulting avec messagerie temps réel sécurisée via WebSockets, notifications, historique persistant et mise à l'échelle Redis.",
        tags: ["MongoDB", "Express", "React", "Node.js", "Socket.io"],
      },
      // RETIRÉ SUR DEMANDE (28/10/2026) : MYKS Radio hors ligne — réactiver en supprimant les commentaires.
      // {
      //   id: "myks-radio",
      //   categories: ["mobile"],
      //   featured: false,
      //   mockup: "radio",
      //   title: "MYKS Radio",
      //   description:
      //     "Infrastructure web et mobile de streaming audio temps réel, avec dashboard de gestion personnalisé et applications iOS et Android diffusant les flux en HLS.",
      //   tags: ["React Native", "WebSockets", "Node.js", "HLS"],
      // },
    ],
  },

  techStack: {
    eyebrow: "Technologies",
    title: "*Stack* technique maîtrisée",
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
    title: "Notre processus de *développement*",
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
    title: "Ils nous font *confiance*",
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
    title: "Questions *fréquentes*",
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
    title: "Concrétisons *votre projet*",
    description:
      "Décrivez-nous votre besoin\u00A0: nous revenons vers vous sous 24h ouvrées avec une première lecture et la suite à donner.",
    channels: [
      {
        id: "email",
        icon: "mail",
        label: "Email professionnel",
        value: "contact@sofianeasma.me",
        href: "mailto:contact@sofianeasma.me",
      },
      {
        id: "whatsapp",
        icon: "whatsapp",
        label: "WhatsApp Entreprise",
        value: "+213 551 79 73 13",
        href: "https://wa.me/213551797313",
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
      successTitle: "Merci\u00A0de votre demande.",
      successMessage: "Votre demande a bien été préparée. Nous revenons vers vous sous 24h ouvrées.",
      successAction: "Envoyer une autre demande",
    },
  },

  about: {
    eyebrow: "\u00C0 propos",
    title: "Une *startup* alg\u00E9rienne",
    description:
      "Atheris Labs est une nouvelle startup bas\u00E9e en Alg\u00E9rie. Nous concevons et d\u00E9veloppons des produits digitaux sur-m\u00E9sure, de A \u00E0 Z, avec l'exigence d'une \u00E9quipe qui veut tout faire juste.",
    priorities: [
      {
        id: "rapidite",
        title: "Rapidit\u00E9 d'ex\u00E9cution",
        description:
          "Des cycles courts, des d\u00E9monstrations r\u00E9guli\u00E8res et une mise en production ma\u00Eetr\u00EEs\u00E9e : vous voyez avancer le produit, pas seulement le calendrier.",
      },
      {
        id: "securite",
        title: "S\u00E9curit\u00E9",
        description:
          "Code 100 % \u00E0 votre propri\u00E9t\u00E9, bonnes pratiques d'ing\u00E9nierie et confidentialit\u00E9 stricte\u00A0: vos donn\u00E9es et votre p\u00E9rim\u00E8tre sont prot\u00E9g\u00E9s \u00E0 chaque \u00E9tape.",
      },
      {
        id: "perfectionnisme",
        title: "Perfectionnisme",
        description:
          "Interface, performance, code et livrables sont repass\u00E9s au peigne fin avant validation. Le d\u00E9tail qui g\u00Ee\u00EEnhe n'est jamais laiss\u00E9 au hasard.",
      },
    ],
    guaranteeTitle: "Votre plan, r\u00E9alis\u00E9 au d\u00E9tail pr\u00E8s",
    guaranteeDescription:
      "Nous garantissons la satisfaction du client\u00A0: le plan discut\u00E9 et valid\u00E9 avec vous est livr\u00E9 exactement, au d\u00E9tail pr\u00E8s \u2014 pas une approximation, pas une version approch\u00E9e.",
  },

  careers: {
    eyebrow: "Recrutement",
    title: "Rejoignez *l'équipe*",
    description:
      "Nous recrutons des Sales Development Representatives pour développer notre portefeuille clients — aucune expérience préalable exigée, à distance.",
    role: "Sales Development Representative",
    meta: ["Collaborateur indépendant", "Rémunération à la commission", "100 % remote"],
    intro:
      "Identifiez, qualifiez et priorisez des prospects pour Atheris Labs\u00A0— studio d'ingénierie logicielle (applications Web, Mobile et Desktop sur-mesure) — et préparez chaque opportunité jusqu'au rendez-vous commercial.",
    sections: [
      {
        id: "missions",
        heading: "Vos responsabilités",
        bullets: [
          "Rechercher et cibler des prospects PME qualifiés via LinkedIn, l'email et les canaux digitaux encadrés.",
          "Mener la prospection sortante (outbound)\u00A0: séquences de prise de contact, relances systématiques et personnalisation.",
          "Qualifier chaque opportunité\u00A0: type de produit, budget, délai et décideur.",
          "Inscrire le prospect sur la plateforme avec une fiche complète et à jour.",
          "Réserver et assurer le suivi des rendez-vous commerciaux jusqu'à l'envoi du devis.",
          "Remonter les signaux marché\u00A0: objections, prix concurrents, attentes récurrentes.",
        ],
      },
      {
        id: "profil",
        heading: "Profil recherché",
        bullets: [
          "Expérience en Sales Development, en prospection B2B ou en génération de leads appréciée\u00A0; les candidats motivés sans expérience sont également les bienvenus \u2014 une solide aisance relationnelle et une réelle envie d'apprendre suffisent.",
          "Volonté d'apprendre les outils d'outbound (LinkedIn Sales Navigator, séquenceurs, CRM).",
          "Bonne compréhension des enjeux digitaux des PME.",
          "Rigueur, autonomie, sens du suivi et fiabilité dans vos engagements.",
          "Français écrit soigné\u00A0; anglais ou arabe appréciés.",
          "Disponibilité régulière, entièrement à distance.",
        ],
      },
      {
        id: "remuneration",
        heading: "Rémunération",
        bullets: [
          "Commission de 10 % à 20 % du montant TTC des devis signés, selon le barème progressif.",
          "Paliers comptés sur les clients ayant payé l'acompte, jamais rétroactifs.",
          "Aucun salaire fixe\u00A0; commission acquise à l'encaissement du premier versement.",
        ],
      },
      {
        id: "process",
        heading: "Processus de sélection",
        bullets: [
          "Candidature\u00A0: formulaire et CV.",
          "Entretien de 30 minutes, au créneau de votre choix.",
          "Validation par le CEO, puis accès à la plateforme (validation manuelle).",
        ],
      },
    ],
    applyTitle: "Candidature",
    applyDescription:
      "Renseignez vos coordonnées (le CV est facultatif)\u00A0: nous revenons vers vous sous 24 h ouvrées.",
    form: {
      firstNameLabel: "Prénom",
      lastNameLabel: "Nom",
      emailLabel: "Email",
      messageLabel: "Message (optionnel)",
      messagePlaceholder: "Quelques mots sur vous…",
      fileLabel: "CV — optionnel (PDF, DOC ou DOCX)",
      fileHint: "5 Mo maximum.",
      submitLabel: "Envoyer ma candidature",
      note: "Vos informations restent strictement confidentielles.",
      errors: {
        firstNameRequired: "Merci d'indiquer votre prénom.",
        lastNameRequired: "Merci d'indiquer votre nom.",
        emailRequired: "Merci d'indiquer votre adresse email.",
        emailInvalid: "Merci de saisir une adresse email valide.",
        fileTooLarge: "Le fichier dépasse la limite de 5 Mo.",
        fileBadType: "Format accepté\u00A0: PDF, DOC ou DOCX.",
        generic: "L'envoi a échoué. Merci de réessayer dans un instant.",
      },
      successTitle: "Candidature envoyée.",
      successMessage:
        "Votre dossier a bien été transmis. Nous revenons vers vous sous 24 h ouvrées.",
      successAction: "Envoyer une autre candidature",
    },
  },

  interview: {
    badge: "Entretien \u00B7 Atheris Labs",
    title: "R\u00E9servez votre *entretien*",
    description:
      "Choisissez le cr\u00E9neau qui vous convient\u00A0: 1 heure, \u00E0 l'heure locale de votre fuseau.",
    noteReferenceTz:
      "Nos cr\u00E9neaux sont d\u00E9finis en heure alg\u00E9rienne (9 h \u2013 16 h). Ils sont automatiquement affich\u00E9s \u00E0 VOTRE heure locale\u00A0: vous choisissez une heure qui vous convient, chez vous.",
    noteNoNightWork:
      "Ce d\u00E9calage ne change rien \u00E0 vos horaires de travail\u00A0: la seule fois o\u00F9 il compte, c'est pour l'entretien lui-m\u00EAme.",
    noteMeetDay:
      "Le jour J\u00A0: rejoignez le Google Meet 5 minutes avant l'heure choisie. L'entretien dure en moyenne 30 minutes. Une fois valid\u00E9, le cr\u00E9neau n'est plus modifiable.",
    meetLink: "Rejoindre l'entretien Google Meet\u00A0: {{link}}",
    meetCta: "Ouvrir Google Meet",
    meetBadge: "Google Meet",
    expiredTitle: "Ce lien a expir\u00E9",
    expiredMessage:
      "La p\u00E9riode de r\u00E9servation de cet entretien est termin\u00E9e. Contactez votre recruteur pour obtenir un nouveau lien.",
    stepProfile: "Vos informations",
    stepSlot: "Votre cr\u00E9neau",
    notFoundTitle: "Lien invalide",
    notFoundMessage:
      "Ce lien d'entretien n'existe plus ou a \u00E9t\u00E9 annul\u00E9. Contactez votre recruteur.",
    javascriptRequired:
      "Cet agenda n\u00E9cessite JavaScript\u00A0: activez-le dans votre navigateur pour choisir un cr\u00E9neau.",
    form: {
      firstNameLabel: "Pr\u00E9nom",
      lastNameLabel: "Nom",
      emailLabel: "Email",
      slotLabel: "Cr\u00E9neau souhait\u00E9",
      submitLabel: "Confirmer mon cr\u00E9neau",
      note: "Une confirmation vous sera envoy\u00E9e par email.",
      errors: {
        firstNameRequired: "Merci d'indiquer votre pr\u00E9nom.",
        lastNameRequired: "Merci d'indiquer votre nom.",
        emailRequired: "Merci d'indiquer votre adresse email.",
        emailInvalid: "Merci de saisir une adresse email valide.",
        slotRequired: "Merci de s\u00E9lectionner un cr\u00E9neau.",
        slotTaken: "Ce cr\u00E9neau vient d'\u00EAtre pris. Choisissez-en un autre.",
        rateLimited: "Trop de tentatives. Merci de r\u00E9essayer dans une minute.",
        generic: "L'envoi a \u00E9chou\u00E9. Merci de r\u00E9essayer dans un instant.",
      },
      successTitle: "Entretien r\u00E9serv\u00E9.",
      successMessage:
        "Votre cr\u00E9neau est confirm\u00E9 et ne peut plus \u00EAtre modifi\u00E9. Un r\u00E9capitulatif vous a \u00E9t\u00E9 envoy\u00E9 par email.",
      successAction: "Fermer",
    },
  },

  sdrKit: {
    eyebrow: "Documentation interne",
    title: "Le kit d'onboarding *SDR*",
    description:
      "Tout ce dont un Sales Development Representative a besoin pour repr\u00E9senter Atheris LABS, qualifier les bons prospects et commencer \u00E0 gagner des commissions \u2014 disponible en PDF \u00E0 t\u00E9l\u00E9charger.",
    meta: ["12 pages", "Anglais", "PDF \u00B7 1,5 Mo", "Version 1.0"],
    intro:
      "Cette documentation est la r\u00E9f\u00E9rence de travail des SDR \u00E0 commission qui rejoignent Atheris LABS. Elle d\u00E9crit qui nous sommes, \u00E0 qui s'adresser, comment fonctionne la commission progressive, comment se d\u00E9roule la prospection de bout en bout, et les standards qui prot\u00E8gent votre acc\u00E8s au studio.",
    downloadLabel: "T\u00E9l\u00E9charger le kit (PDF)",
    fileName: "SDR-Onboarding-Kit.pdf",
    languageNote: "Le document est \u00E9crit enti\u00E8rement en anglais.",
    includesTitle: "Ce que contient le kit",
    includes: [
      "Introduction et mission d'Atheris LABS",
      "Persona acheteur et profils cibles",
      "Structure de commission progressive (10 % \u00E0 20 %)",
      "Processus op\u00E9rationnel et autonomie",
      "R\u00E8gles d'or et prise de poste",
    ],
    confidentialTitle: "Interne - confidentiel",
    confidentialDescription:
      "Ce document est destin\u00E9 aux partenaires commerciaux autoris\u00E9s d'Atheris LABS. Ne le redistribuez pas en dehors du studio et ne le publiez pas.",
    facts: [
      { label: "Commission", value: "10 % \u2013 20 %" },
      { label: "Valeur du projet", value: "500 $ \u2013 4 500 $" },
      { label: "Statut", value: "Entrepreneur ind\u00E9pendant" },
      { label: "Gains", value: "Sans plafond" },
    ],
  },

  notFound: {
    code: "404 \u00B7 Page introuvable",
    title: "Cette page n'existe *pas*",
    description:
      "Le lien a peut-\u00EAtre chang\u00E9 ou l'adresse comporte une faute. Revenons sur le bon chemin.",
    primaryCta: "Retour \u00E0 l'accueil",
    secondaryCta: "Voir les r\u00E9alisations",
  },

  footer: {
    tagline: "Ingénierie logicielle et design web\u00A0: des produits digitaux conçus pour durer.",
    navLabel: "Navigation",
    links: [{ label: "Recrutement", href: "/fr/recrutement" }],
    contactLabel: "Contact",
    rights: "Tous droits réservés.",
    legal: "Mentions légales",
  },

  seo: {
    title: "ATHERIS LABS — Studio d’Ingénierie Logicielle & Produits Digitaux sur-mesure",
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
