import type { PlatformContent } from "@/content/platform/types";

/**
 * Contenu bilingue de la plateforme interne — version française.
 *
 * Conforme au contrat `PlatformContent` (aucun champ ajouté ni omis).
 * Ton B2B premium — vouvoiement sobre, sans emoji ni exclamatif (cohérent
 * avec la landing) ; vocabulaire métier : prospect, devis, commission, palier.
 * Vocabulaire métier : prospect, devis, commission, palier, encaissement,
 * relance. Typographie française — espace insécable (` `) avant la
 * ponctuation double.
 */
export const fr: PlatformContent = {
  common: {
    brand: {
      name: "ATHERIS",
      suffix: "LABS",
    },
    save: "Enregistrer",
    cancel: "Annuler",
    back: "Retour",
    next: "Suivant",
    submit: "Envoyer",
    loading: "Chargement…",
    search: "Rechercher",
    filter: "Filtrer",
    close: "Fermer",
    actions: "Actions",
    yes: "Oui",
    no: "Non",
    optional: "Facultatif",
    required: "Obligatoire",
    noData: "Aucune donnée à afficher.",
    retry: "Réessayer",
    notFound: "La page demandée est introuvable.",
  },

  nav: {
    brand: {
      name: "ATHERIS",
      suffix: "LABS",
    },
    ceo: [
      { label: "Tableau de bord", href: "/espace/tableau-de-bord" },
      { label: "Pipeline", href: "/espace/prospects" },
      { label: "Commissions", href: "/espace/commissions" },
      { label: "Équipe", href: "/espace/equipe" },
    ],
    manager: [
      { label: "Tableau de bord", href: "/espace/tableau-de-bord" },
      { label: "Pipeline", href: "/espace/prospects" },
      { label: "Commissions", href: "/espace/commissions" },
      { label: "Équipe", href: "/espace/equipe" },
    ],
    commercial: [
      { label: "Tableau de bord", href: "/espace/tableau-de-bord" },
      { label: "Pipeline", href: "/espace/prospects" },
    ],
    vendeur: [
      { label: "Tableau de bord", href: "/espace/tableau-de-bord" },
      { label: "Mes prospects", href: "/espace/prospects" },
      { label: "Mes gains", href: "/espace/commissions" },
    ],
    client: [{ label: "Mon projet", href: "/espace/projet" }],
    logout: "Déconnexion",
    profile: "Mon profil",
    languageSwitcher: "Changer de langue",
    menuOpen: "Ouvrir le menu",
    menuClose: "Fermer le menu",
  },

  auth: {
    login: {
      title: "Connexion",
      subtitle: "Accédez à votre espace ATHERIS LABS.",
      emailLabel: "Adresse email",
      passwordLabel: "Mot de passe",
      submit: "Se connecter",
      submitLoading: "Connexion en cours…",
      forgotNote: "Mot de passe oublié ? Contactez votre administrateur.",
      signupLink: "Candidatez pour obtenir un accès",
      errors: {
        invalid: "Adresse email ou mot de passe incorrect.",
        rate_limited: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
        pending: "Votre compte est en attente de validation par un administrateur.",
        rejected:
          "Votre candidature a été refusée. Contactez un administrateur pour plus d’informations.",
        generic: "Une erreur est survenue. Veuillez réessayer.",
      },
    },
    signup: {
      title: "Candidature",
      subtitle:
        "La plateforme ATHERIS LABS est ouverte sur candidature. Chaque demande est examinée sous 48 heures ouvrées.",
      nameLabel: "Nom complet",
      emailLabel: "Adresse email",
      phoneLabel: "Téléphone",
      passwordLabel: "Mot de passe",
      passwordConfirmLabel: "Confirmation du mot de passe",
      passwordRules:
        "12 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.",
      consentLabel:
        "J’accepte que ces informations soient utilisées pour l’étude de ma candidature.",
      submit: "Envoyer ma candidature",
      successTitle: "Candidature transmise",
      successBody:
        "Votre candidature a bien été enregistrée. Un administrateur l’examinera sous 48 heures ouvrées.",
      alreadyHaveAccount: "Vous avez déjà un compte ? Connectez-vous.",
      duplicateEmail: "Un compte est déjà enregistré avec cette adresse email.",
    },
    validation: {
      emailInvalid: "Adresse email invalide.",
      phoneInvalid: "Numéro de téléphone invalide.",
      required: "Ce champ est obligatoire.",
      passwordMismatch: "Les deux mots de passe ne correspondent pas.",
      passwordWeak: "Le mot de passe ne respecte pas les règles indiquées.",
      tooShort: (min: number) => `Saisissez au moins ${min} caractères.`,
      tooLong: (max: number) => `Saisissez au maximum ${max} caractères.`,
    },
  },

  statuses: {
    prospect: {
      nouveau: "Nouveau",
      contacte: "Contacté",
      qualifie: "Qualifié",
      devis_envoye: "Devis envoyé",
      signe: "Signé",
      client_actif: "Client actif",
      en_livraison: "En livraison",
      clos: "Clos",
      perdu: "Perdu",
      disqualifie: "Disqualifié",
    },
    quote: {
      draft: "Brouillon",
      sent: "Envoyé",
      signed: "Signé",
      lost: "Perdu",
    },
    commission: {
      due: "À verser",
      paid: "Versée",
    },
    milestone: {
      cadrage: "Cadrage",
      design: "Design",
      dev: "Développement",
      recette: "Recette",
      mise_en_ligne: "Mise en ligne",
    },
    role: {
      ceo: "CEO",
      manager: "Manager",
      commercial: "Commercial",
      vendeur: "Vendeur",
      client: "Client",
    },
    userStatus: {
      pending: "En attente",
      active: "Actif",
      rejected: "Refusé",
      disabled: "Désactivé",
    },
  },

  pipeline: {
    columns: {
      name: "Nom",
      company: "Entreprise",
      status: "Statut",
      source: "Source",
      lastActivity: "Dernière activité",
      reminder: "Relance",
    },
    filters: {
      allStatuses: "Tous les statuts",
      searchPlaceholder: "Rechercher un nom, une entreprise…",
      clearFilters: "Réinitialiser",
    },
    messages: {
      created: "Le prospect a bien été ajouté au pipeline.",
      duplicate: "Un prospect avec la même adresse email ou le même téléphone existe déjà.",
      createdToast: "Prospect ajouté.",
    },
  },

  prospect: {
    tabs: {
      identity: "Identité",
      brief: "Fiche projet",
      deals: "Devis",
      history: "Historique",
    },
    labels: {
      email: "Email",
      phone: "Téléphone",
      company: "Entreprise",
      source: "Source",
      owner: "Responsable",
      createdAt: "Ajouté le",
    },
    actions: {
      changeStatus: "Changer de statut",
      reasonRequired: "Un motif est requis pour ce changement de statut.",
      reasonLabel: "Motif",
      confirmChange: "Confirmer ce changement de statut ?",
      lockedByRole: "Votre rôle ne permet pas de modifier le statut de ce prospect.",
    },
  },

  brief: {
    title: "Assistant fiche projet",
    steps: {
      context: {
        label: "Contexte",
        description: "Le problème business et le type de produit envisagé.",
      },
      need: {
        label: "Besoin",
        description: "Périmètre, fonctionnalités prioritaires et utilisateurs cibles.",
      },
      constraints: {
        label: "Contraintes",
        description: "Délai, budget, décideurs et références.",
      },
      tech: {
        label: "Technique",
        description: "Technologies imposées, intégrations, hébergement et sécurité.",
      },
      followUp: {
        label: "Suivi",
        description: "Prochaine étape, date de relance et notes d’échange.",
      },
    },
    gauge: {
      blocksDone: "{done}/{total}",
      readyForQuote: "Brief complet. Le prospect est prêt pour un devis.",
    },
    fields: {
      context: {
        businessProblem: "Problème business",
        productType: "Type de produit",
      },
      need: {
        scope: "Périmètre et fonctionnalités prioritaires",
        targetUsers: "Utilisateurs cibles",
      },
      constraints: {
        deadline: "Délai souhaité",
        budget: "Budget validé",
        decisionMakers: "Décideurs",
        references: "Références",
      },
      tech: {
        forcedTech: "Technologies imposées",
        integrations: "Intégrations",
        hosting: "Hébergement",
        security: "Exigences de sécurité",
      },
      followUp: {
        nextStep: "Prochaine étape",
        reminderDate: "Date de relance",
        notes: "Notes d’échange",
      },
    },
  },

  dashboard: {
    kpi: "Indicateurs clés",
    actionQueues: "Files d’action",
    recentActivity: "Activité récente",
    perEmployee: {
      title: "Par employé",
      funnel: "Funnel",
      activity: "Activité",
      profitability: "Rentabilité",
    },
    queues: {
      pendingApplications: "Candidatures en attente",
      quotesNoAnswer: "Devis sans réponse",
      commissionsDue: "Commissions à verser",
      remindersToday: "Relances du jour",
    },
  },

  commissions: {
    queue: "Commissions à verser",
    history: "Historique des encaissements",
    markPaid: "Marquer comme versée",
    markPaidLot: "Verser la sélection",
    lotConfirm: "Verser un montant total de {total} ?",
    noBeneficiary: "Ce devis n’a pas de bénéficiaire identifié.",
    rate: "Taux",
    amount: "Montant",
    base: "Base de calcul",
    generatedAt: "Générée le",
    paidAt: "Versée le",
    pending: "À verser",
    paid: "Versée",
    noClawbackWarning: "Une commission versée n’est jamais récupérée.",
    myEarnings: "Mes gains",
    tier: {
      label: "Palier",
      current: "Palier actuel",
      nextTier: "Palier suivant : {tier} à {rate}",
    },
  },

  client: {
    projectTitle: "Votre projet",
    milestones: "Jalons",
    validateStep: "Valider cette étape",
    validateConfirm: "Confirmer la validation de ce jalon ?",
    documents: "Documents",
    invoices: "Factures",
    messages: "Messagerie",
    messagePlaceholder: "Écrivez à l’équipe…",
    send: "Envoyer",
    unread: "Non lus",
    paid: "Payée",
    due: "À régler",
    totalPaid: "Total payé",
    remaining: "Reste à payer",
    emptyDocuments: "Aucun document disponible pour le moment.",
    emptyMessages: "Aucun message pour le moment.",
  },

  applications: {
    title: "Candidatures",
    approve: "Approuver",
    reject: "Refuser",
    rejectReason: "Motif du refus",
    approveConfirm: "Approuver cette candidature et activer le compte ?",
    empty: "Aucune candidature en attente.",
    statusLabel: "Statut",
  },

  profile: {
    title: "Mon profil",
    nameReadonlyHint: "Le nom est défini à la création du compte et ne peut pas être modifié.",
    email: "Adresse email",
    phone: "Téléphone",
    passwordSection: "Mot de passe",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le nouveau mot de passe",
    saveEmail: "Enregistrer l’adresse email",
    savePhone: "Enregistrer le téléphone",
    savePassword: "Mettre à jour le mot de passe",
    emailSaved: "Adresse email mise à jour.",
    phoneSaved: "Téléphone mis à jour.",
    passwordSaved: "Mot de passe mis à jour.",
  },

  footer: {
    copyright: "© {year} ATHERIS LABS. Tous droits réservés.",
  },

  seo: {
    login: {
      title: "Connexion | ATHERIS LABS",
      description:
        "Connectez-vous à votre espace ATHERIS LABS : pipeline, devis, commissions et suivi de projet.",
    },
    signup: {
      title: "Candidature | ATHERIS LABS",
      description:
        "Candidatez pour rejoindre la plateforme ATHERIS LABS et accéder à votre espace dédié.",
    },
    dashboard: {
      title: "Espace | ATHERIS LABS",
      description:
        "Pilotage de l’activité ATHERIS LABS : pipeline commercial, devis et commissions.",
    },
  },
};
