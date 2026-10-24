import type { PlatformContent } from "@/content/platform/types";

/**
 * Internal platform content — English (US) version.
 *
 * conforms to the `PlatformContent` contract (no key added, none omitted).
 * Business-native copy — mirrors the French keys, not their wording.
 */
export const en = {
  common: {
    brand: {
      name: "ATHERIS",
      suffix: "LABS",
    },
    save: "Save",
    cancel: "Cancel",
    back: "Back",
    next: "Next",
    submit: "Submit",
    loading: "Loading…",
    search: "Search",
    filter: "Filter",
    close: "Close",
    actions: "Actions",
    yes: "Yes",
    no: "No",
    optional: "Optional",
    required: "Required",
    noData: "No data to display.",
    retry: "Try again",
    notFound: "The page you requested could not be found.",
  },

  nav: {
    brand: {
      name: "ATHERIS",
      suffix: "LABS",
    },
    ceo: [
      { label: "Dashboard", href: "/espace/tableau-de-bord" },
      { label: "Pipeline", href: "/espace/prospects" },
      { label: "Commissions", href: "/espace/commissions" },
      { label: "Team", href: "/espace/equipe" },
    ],
    manager: [
      { label: "Dashboard", href: "/espace/tableau-de-bord" },
      { label: "Pipeline", href: "/espace/prospects" },
      { label: "Commissions", href: "/espace/commissions" },
      { label: "Team", href: "/espace/equipe" },
    ],
    commercial: [
      { label: "Dashboard", href: "/espace/tableau-de-bord" },
      { label: "Pipeline", href: "/espace/prospects" },
    ],
    vendeur: [
      { label: "Dashboard", href: "/espace/tableau-de-bord" },
      { label: "My prospects", href: "/espace/prospects" },
      { label: "My earnings", href: "/espace/commissions" },
    ],
    client: [{ label: "My project", href: "/espace/projet" }],
    logout: "Sign out",
    profile: "My profile",
    languageSwitcher: "Change language",
    menuOpen: "Open menu",
    menuClose: "Close menu",
  },

  auth: {
    login: {
      title: "Sign in",
      subtitle: "Access your ATHERIS LABS workspace.",
      emailLabel: "Email address",
      passwordLabel: "Password",
      submit: "Sign in",
      submitLoading: "Signing in…",
      forgotNote: "Forgot your password? Contact your administrator.",
      signupLink: "Apply for platform access",
      errors: {
        invalid: "Incorrect email or password.",
        rate_limited: "Too many sign-in attempts. Please try again in a few minutes.",
        pending: "Your account is awaiting admin approval.",
        rejected: "Your application was rejected. Contact an administrator for details.",
        generic: "Something went wrong. Please try again.",
      },
    },
    signup: {
      title: "Apply",
      subtitle:
        "The ATHERIS LABS platform is open by application. Every request is reviewed within two business days.",
      nameLabel: "Full name",
      emailLabel: "Email address",
      phoneLabel: "Phone",
      passwordLabel: "Password",
      passwordConfirmLabel: "Confirm password",
      passwordRules:
        "At least 12 characters, including an uppercase letter, a digit, and a special character.",
      consentLabel: "I agree to have this information used to review my application.",
      submit: "Submit application",
      successTitle: "Application received",
      successBody:
        "Your application has been recorded. An administrator will review it within two business days.",
      alreadyHaveAccount: "Already have an account? Sign in.",
      duplicateEmail: "An account already exists with this email address.",
    },
    validation: {
      emailInvalid: "Enter a valid email address.",
      phoneInvalid: "Enter a valid phone number.",
      required: "This field is required.",
      passwordMismatch: "The two passwords do not match.",
      passwordWeak: "The password does not meet the requirements above.",
      tooShort: (min: number) => `Enter at least ${min} characters.`,
      tooLong: (max: number) => `Enter at most ${max} characters.`,
    },
  },

  statuses: {
    prospect: {
      nouveau: "New",
      contacte: "Contacted",
      qualifie: "Qualified",
      devis_envoye: "Quote sent",
      signe: "Signed",
      client_actif: "Active client",
      en_livraison: "In delivery",
      clos: "Closed",
      perdu: "Lost",
      disqualifie: "Disqualified",
    },
    quote: {
      draft: "Draft",
      sent: "Sent",
      signed: "Signed",
      lost: "Lost",
    },
    commission: {
      due: "Due",
      paid: "Paid",
    },
    milestone: {
      cadrage: "Scoping",
      design: "Design",
      dev: "Development",
      recette: "Acceptance",
      mise_en_ligne: "Go-live",
    },
    role: {
      ceo: "CEO",
      manager: "Manager",
      commercial: "Sales rep",
      vendeur: "Business developer",
      client: "Client",
    },
    userStatus: {
      pending: "Pending",
      active: "Active",
      rejected: "Rejected",
      disabled: "Disabled",
    },
  },

  pipeline: {
    columns: {
      name: "Name",
      company: "Company",
      status: "Status",
      source: "Source",
      lastActivity: "Last activity",
      reminder: "Reminder",
    },
    filters: {
      allStatuses: "All statuses",
      searchPlaceholder: "Search by name or company…",
      clearFilters: "Reset",
    },
    messages: {
      created: "The prospect has been added to the pipeline.",
      duplicate: "A prospect with the same email or phone already exists.",
      createdToast: "Prospect added.",
    },
  },

  prospect: {
    tabs: {
      identity: "Identity",
      brief: "Brief",
      deals: "Deals",
      history: "History",
    },
    labels: {
      email: "Email",
      phone: "Phone",
      company: "Company",
      source: "Source",
      owner: "Owner",
      createdAt: "Added on",
    },
    actions: {
      changeStatus: "Change status",
      reasonRequired: "A reason is required to change this status.",
      reasonLabel: "Reason",
      confirmChange: "Confirm this status change?",
      lockedByRole: "Your role does not allow changing this prospect’s status.",
    },
  },

  brief: {
    title: "Project brief assistant",
    steps: {
      context: {
        label: "Context",
        description: "The business problem and the type of product under consideration.",
      },
      need: {
        label: "Needs",
        description: "Scope, priority features, and target users.",
      },
      constraints: {
        label: "Constraints",
        description: "Timeline, budget, decision makers, and references.",
      },
      tech: {
        label: "Technical",
        description: "Required technologies, integrations, hosting, and security.",
      },
      followUp: {
        label: "Follow-up",
        description: "Next step, follow-up date, and discussion notes.",
      },
    },
    gauge: {
      blocksDone: "{done}/{total}",
      readyForQuote: "Brief complete. This prospect is ready for a quote.",
    },
    fields: {
      context: {
        businessProblem: "Business problem",
        productType: "Product type",
      },
      need: {
        scope: "Scope and priority features",
        targetUsers: "Target users",
      },
      constraints: {
        deadline: "Desired timeline",
        budget: "Approved budget",
        decisionMakers: "Decision makers",
        references: "References",
      },
      tech: {
        forcedTech: "Required technologies",
        integrations: "Integrations",
        hosting: "Hosting",
        security: "Security requirements",
      },
      followUp: {
        nextStep: "Next step",
        reminderDate: "Follow-up date",
        notes: "Discussion notes",
      },
    },
  },

  dashboard: {
    kpi: "Key metrics",
    actionQueues: "Action queues",
    recentActivity: "Recent activity",
    perEmployee: {
      title: "By employee",
      funnel: "Funnel",
      activity: "Activity",
      profitability: "Profitability",
    },
    queues: {
      pendingApplications: "Pending applications",
      quotesNoAnswer: "Quotes awaiting reply",
      commissionsDue: "Commissions due",
      remindersToday: "Reminders due today",
    },
  },

  commissions: {
    queue: "Commissions to pay",
    history: "Payment history",
    markPaid: "Mark as paid",
    markPaidLot: "Pay selection",
    lotConfirm: "Pay a total of {total}?",
    noBeneficiary: "This quote has no identified beneficiary.",
    rate: "Rate",
    amount: "Amount",
    base: "Base amount",
    generatedAt: "Generated on",
    paidAt: "Paid on",
    pending: "Due",
    paid: "Paid",
    noClawbackWarning: "A paid commission is never clawed back.",
    myEarnings: "My earnings",
    tier: {
      label: "Tier",
      current: "Current tier",
      nextTier: "Next tier: {tier} at {rate}",
    },
  },

  client: {
    projectTitle: "Your project",
    milestones: "Milestones",
    validateStep: "Validate this step",
    validateConfirm: "Confirm the validation of this milestone?",
    documents: "Documents",
    invoices: "Invoices",
    messages: "Messages",
    messagePlaceholder: "Write to the team…",
    send: "Send",
    unread: "Unread",
    paid: "Paid",
    due: "Due",
    totalPaid: "Total paid",
    remaining: "Remaining balance",
    emptyDocuments: "No documents available yet.",
    emptyMessages: "No messages yet.",
  },

  applications: {
    title: "Applications",
    approve: "Approve",
    reject: "Reject",
    rejectReason: "Rejection reason",
    approveConfirm: "Approve this application and activate the account?",
    empty: "No pending applications.",
    statusLabel: "Status",
  },

  profile: {
    title: "My profile",
    nameReadonlyHint: "Your name is set at account creation and cannot be changed.",
    email: "Email address",
    phone: "Phone",
    passwordSection: "Password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    saveEmail: "Save email address",
    savePhone: "Save phone",
    savePassword: "Update password",
    emailSaved: "Email address updated.",
    phoneSaved: "Phone updated.",
    passwordSaved: "Password updated.",
  },

  footer: {
    copyright: "© {year} ATHERIS LABS. All rights reserved.",
  },

  seo: {
    login: {
      title: "Sign in | ATHERIS LABS",
      description:
        "Sign in to your ATHERIS LABS workspace: pipeline, quotes, commissions, and project tracking.",
    },
    signup: {
      title: "Apply | ATHERIS LABS",
      description:
        "Apply to join the ATHERIS LABS platform and get your own workspace.",
    },
    dashboard: {
      title: "Workspace | ATHERIS LABS",
      description:
        "Run your ATHERIS LABS activity: sales pipeline, quotes, and commissions.",
    },
  },
} satisfies PlatformContent;
