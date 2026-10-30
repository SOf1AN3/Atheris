import type { SiteContent } from "@/content/types";

/**
 * Bilingual landing page content — English version.
 *
 * Conforms to the `SiteContent` contract (no field added or omitted).
 * Same ids, anchors and cardinalities as `fr.ts`.
 */
export const en: SiteContent = {
  a11y: {
    skipToContent: "Skip to content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    switchLocale: "Switch to French",
    filtersLabel: "Filter case studies",
    stackTabsLabel: "Change technology category",
  },

  nav: {
    brand: {
      name: "ATHERIS",
      suffix: "LABS",
    },
    items: [
      { label: "Services", href: "#services" },
      { label: "Work", href: "#realisations" },
      { label: "Technologies", href: "#technologies" },
      { label: "Process", href: "#methode" },
    ],
    ctaLabel: "Request a quote",
    ctaShort: "Quote",
    loginLabel: "Sign in",
  },

  hero: {
    title: "We design and build *custom digital products*.",
    subtitle:
      "Web, Mobile & Desktop applications with high added value. Scalable architectures, excellent code, and premium interface design.",
    primaryCta: "Start a project",
    secondaryCta: "or book a discovery call",
    secondaryCtaHref: "#contact",
    trustStats: [
      { value: "+20", label: "Products delivered" },
      { value: "100%", label: "Proprietary & scalable code" },
      { value: "A → Z", label: "End-to-end support" },
    ],
  },

  services: {
    eyebrow: "Expertise",
    title: "Areas of *Expertise*",
    description:
      "From first concept to production, we cover the full lifecycle of your digital products.",
    items: [
      {
        id: "web",
        icon: "globe",
        title: "Web Applications & SaaS Platforms",
        description:
          "We build web applications and multi-tenant SaaS platforms for businesses: dashboards, customer portals and business-critical internal tools.",
        tags: ["Next.js", "React", "Node.js", "PostgreSQL", "Multi-tenant"],
      },
      {
        id: "mobile",
        icon: "smartphone",
        title: "iOS & Android Mobile Apps",
        description:
          "Two native platforms, iOS and Android, designed for everyday use: smooth interfaces, careful performance and guided store publishing.",
        tags: ["Flutter", "React Native", "UI/UX mobile-first", "App Store Publishing"],
      },
      {
        id: "desktop",
        icon: "monitor",
        title: "Cross-Platform Business Desktop Software",
        description:
          "Cross-platform business software built to fit your internal processes and deliver a stable experience on Windows, macOS and Linux.",
        tags: ["Electron", "Flutter Desktop", "Windows", "macOS", "Linux"],
      },
      {
        id: "cloud",
        icon: "cloud",
        title: "Modernization, Redesign & Cloud",
        description:
          "We modernize what you already run: performance audits, architecture redesign, cloud migration and a production launch that scales smoothly.",
        tags: ["Performance Audit", "Core Web Vitals", "API REST/GraphQL", "Scaling"],
      },
    ],
  },

  cases: {
    eyebrow: "Portfolio",
    title: "Projects & *Case Studies*",
    description:
      "A selection of digital products shipped to production, from business SaaS to real-time applications.",
    visitLabel: "Visit the website",
    filters: {
      all: "All",
      web: "Web & SaaS",
      mobile: "Mobile",
      ai: "AI & Media",
    },
    items: [
      {
        id: "clinique",
        categories: ["web"],
        featured: true,
        mockup: "clinic",
        image: "projects/dental.jpg",
        url: "https://dental-app-beta1.vercel.app/",
        title: "Dental Clinic Management SaaS",
        description:
          "A complete SaaS platform for dental practice management: online booking, digital patient records and automated billing, deployed multi-tenant on Next.js and PostgreSQL.",
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
          "An AI-powered SaaS tool for accelerated review, comparative analysis and synthesis of complex academic publications and theses.",
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
          "A motorbike delivery platform across Algeria: customers describe their errand, pick their courier, follow the route live by geolocation and pay on arrival.",
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
          "A consulting platform with secure real-time messaging over WebSockets, notifications, persistent history and Redis-backed scaling.",
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
      //     "A web and mobile infrastructure for real-time audio streaming, with a custom management dashboard and iOS and Android apps broadcasting HLS feeds.",
      //   tags: ["React Native", "WebSockets", "Node.js", "HLS"],
      // },
    ],
  },

  techStack: {
    eyebrow: "Technologies",
    title: "Technologies we *work with*",
    description:
      "Proven technologies, chosen for your context and maintained over time.",
    groups: [
      {
        id: "frontend",
        label: "Frontend",
        items: [
          { name: "Next.js", hint: "Framework" },
          { name: "React", hint: "Library" },
          { name: "TypeScript", hint: "Language" },
          { name: "Tailwind CSS", hint: "Utility styles" },
          { name: "Framer Motion", hint: "Animations" },
          { name: "Vue.js", hint: "Framework" },
          { name: "React Query", hint: "Client data" },
        ],
      },
      {
        id: "backend",
        label: "Backend & Data",
        items: [
          { name: "Node.js", hint: "Runtime" },
          { name: "PostgreSQL", hint: "Database" },
          { name: "Prisma", hint: "ORM" },
          { name: "Redis", hint: "Cache" },
          { name: "GraphQL", hint: "API" },
          { name: "REST API", hint: "API" },
          { name: "MongoDB", hint: "Database" },
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
          { name: "Expo", hint: "Tooling" },
        ],
      },
      {
        id: "cloud",
        label: "Cloud & DevOps",
        items: [
          { name: "Docker", hint: "Containers" },
          { name: "Vercel", hint: "Hosting" },
          { name: "AWS", hint: "Cloud" },
          { name: "GitHub Actions", hint: "Continuous integration" },
          { name: "Nginx", hint: "Web server" },
          { name: "Terraform", hint: "Infrastructure" },
          { name: "Cloudflare", hint: "CDN" },
        ],
      },
    ],
  },

  process: {
    eyebrow: "Process",
    title: "Our development *process*",
    description:
      "A proven framework that protects timelines, budget and quality at every stage.",
    steps: [
      {
        n: "01",
        title: "Discovery & Specifications",
        description:
          "We turn your goals, users and functional scope into a shared specification document.",
      },
      {
        n: "02",
        title: "Architecture & UI/UX Design",
        description:
          "We structure the technical architecture and craft high-fidelity mockups to validate before the first line of code.",
      },
      {
        n: "03",
        title: "Agile Development & Sprints",
        description:
          "The product moves forward in short iterations, with regular demos, continuous integration and acceptance testing at each sprint.",
      },
      {
        n: "04",
        title: "Deployment & Ongoing Support",
        description:
          "We handle the production launch, monitor stability and keep evolving the product after release.",
      },
    ],
  },

  testimonials: {
    eyebrow: "Testimonials",
    title: "Trusted by *Founders*",
    description:
      "Founders who entrusted us with the design and development of their products.",
    items: [
      {
        id: "ahcen-b",
        quote:
          "The team delivered a tool that saves us more than 100 hours a year for each practice. The seriousness of the code and the quality of the communication kept us confident throughout the project.",
        name: "Ahcen B.",
        role: "Founder — Dental Clinic",
        company: "CLINIQUE+",
        initials: "AB",
        verifiedLabel: "Verified project",
      },
      {
        id: "karim-o",
        quote:
          "The real-time messaging system was delivered on schedule, with no production incidents. Progress updates were clear and the technical quality meets our standards.",
        name: "Karim O.",
        role: "CEO — Tiberium",
        company: "TIBERIUM",
        initials: "KO",
        verifiedLabel: "Verified project",
      },
      {
        id: "yacine-m",
        quote:
          "The interface design matches the ambition of the product, and the support stayed responsive all the way to launch. We had an invested partner, not just a service provider.",
        name: "Yacine M.",
        role: "Founder — Papernote AI",
        company: "PAPERNOTE",
        initials: "YM",
        verifiedLabel: "Verified project",
      },
    ],
  },

  faq: {
    eyebrow: "FAQ",
    title: "Frequently asked *questions*",
    description:
      "The questions we hear most often before starting a project with us.",
    items: [
      {
        id: "delais",
        question: "What are your delivery timelines?",
        answer:
          "A typical project runs 6 to 12 weeks depending on its complexity and the number of screens. We set a schedule at discovery and adjust it at every validated milestone.",
      },
      {
        id: "budget",
        question: "How is the budget structured?",
        answer:
          "Every project gets a detailed quote, either fixed-price on a defined scope or time-and-materials for evolving needs. We then build an indicative budget framework, aligned with your priorities.",
      },
      {
        id: "propriete",
        question: "Who owns the source code?",
        answer:
          "You own it 100%. The code, the repositories and all deliverables are transferred to you at delivery, with no dependency on our team.",
      },
      {
        id: "maintenance",
        question: "Do you provide maintenance after launch?",
        answer:
          "Yes. We offer support contracts covering monitoring, fixes and new features, with turnaround commitments defined together.",
      },
      {
        id: "confidentialite",
        question: "Do you work under NDA?",
        answer:
          "Yes, always when you ask for it. A confidentiality agreement is signed before any technical or financial discussion about your project.",
      },
    ],
  },

  contact: {
    eyebrow: "Contact",
    title: "Let's bring your project *to life*",
    description:
      "Tell us about your needs: we get back to you within one business day with an initial read and the recommended next steps.",
    channels: [
      {
        id: "email",
        icon: "mail",
        label: "Business Email",
        value: "contact@sofianeasma.me",
        href: "mailto:contact@sofianeasma.me",
      },
      {
        id: "whatsapp",
        icon: "whatsapp",
        label: "Business WhatsApp",
        value: "+213 551 79 73 13",
        href: "https://wa.me/213551797313",
      },
      {
        id: "location",
        icon: "pin",
        label: "Location",
        value: "Remote & Algeria",
        href: null,
      },
    ],
    form: {
      nameLabel: "Name / Company",
      emailLabel: "Email",
      typeLabel: "Project Type",
      messageLabel: "Message",
      messagePlaceholder: "Briefly describe your project, your goals and your timeline…",
      typeOptions: [
        { value: "web_saas", label: "Web App / SaaS" },
        { value: "mobile", label: "Mobile App" },
        { value: "desktop", label: "Desktop Software" },
        { value: "cloud", label: "Modernization & Cloud" },
        { value: "other", label: "Other Need" },
      ],
      submitLabel: "Send quote request",
      note: "Reply within one business day · Your information stays confidential",
      errors: {
        nameRequired: "Please enter your name or your company name.",
        nameMin: "Please enter at least 2 characters.",
        emailRequired: "Please enter your email address.",
        emailInvalid: "Please enter a valid email address.",
        typeRequired: "Please select a project type.",
        messageRequired: "Please briefly describe your project.",
        messageMin: "Please provide a message of at least 20 characters.",
      },
      successTitle: "Thank you.",
      successMessage: "Your request has been prepared. We will get back to you within one business day.",
      successAction: "Send another request",
    },
  },

  about: {
    eyebrow: "About us",
    title: "An Algerian *startup*",
    description:
      "Atheris Labs is a new startup based in Algeria. We design and build custom digital products end to end, with the standards of a team determined to get everything right.",
    priorities: [
      {
        id: "rapidite",
        title: "Speed of execution",
        description:
          "Short cycles, regular demos and a mastered production release: you watch the product move forward, not just the calendar.",
      },
      {
        id: "securite",
        title: "Security",
        description:
          "Code 100% yours, sound engineering practices and strict confidentiality: your data and your scope are protected at every step.",
      },
      {
        id: "perfectionnisme",
        title: "Perfectionism",
        description:
          "Interface, performance, code and deliverables are combed through before validation. The detail that makes the difference is never left to chance.",
      },
    ],
    guaranteeTitle: "Your plan, built down to the last detail",
    guaranteeDescription:
      "We guarantee client satisfaction: the plan discussed and approved with you is delivered exactly as agreed \u2014 down to the last detail, not an approximation.",
  },

  careers: {
    eyebrow: "Careers",
    title: "Join the *team*",
    description:
      "We are hiring Sales Development Representatives to grow our client portfolio — no prior experience required, fully remote.",
    role: "Sales Development Representative",
    meta: ["Independent contractor", "Commission-based", "100% remote"],
    intro:
      "Identify, qualify and prioritize prospects for Atheris Labs — a software engineering studio building custom Web, Mobile and Desktop applications — and prepare each opportunity for the first sales conversation.",
    sections: [
      {
        id: "missions",
        heading: "Your responsibilities",
        bullets: [
          "Research and target qualified SME prospects through LinkedIn, email and controlled digital channels.",
          "Run outbound prospecting: outreach sequences, systematic follow-ups and personalization.",
          "Qualify every opportunity: product type, budget, timeline and decision maker.",
          "Register the prospect on the platform with a complete, up-to-date profile.",
          "Book and follow up on sales meetings through to the quote.",
          "Report market feedback: objections, competitor pricing, recurring expectations.",
        ],
      },
      {
        id: "profil",
        heading: "Profile",
        bullets: [
          "Experience in sales development, B2B prospecting or lead generation is appreciated; motivated candidates without experience are equally welcome — strong interpersonal skills and a genuine desire to learn are enough.",
          "Willingness to learn outbound tools (LinkedIn Sales Navigator, sequencers, CRM).",
          "Solid understanding of SME digital challenges.",
          "Rigour, autonomy, follow-through and reliability in your commitments.",
          "Excellent written French; English or Arabic is a plus.",
          "Regular availability, fully remote.",
        ],
      },
      {
        id: "remuneration",
        heading: "Compensation",
        bullets: [
          "10% to 20% commission on the VAT-inclusive amount of signed quotes, on a progressive scale.",
          "Tiers counted on clients who paid the deposit, never retroactive.",
          "No fixed salary; commission earned once the first payment is received.",
        ],
      },
      {
        id: "process",
        heading: "Selection process",
        bullets: [
          "Application: the form. The CV is optional.",
          "An online assessment: 4 sections, about 20 to 25 minutes.",
          "Review by the CEO within 24 hours, then platform access (manual validation).",
        ],
      },
    ],
    applyTitle: "Apply",
    applyDescription:
      "Fill in your details — the CV is optional. We get back to you within 24 business hours.",
    form: {
      firstNameLabel: "First name",
      lastNameLabel: "Last name",
      emailLabel: "Email",
      messageLabel: "Message (optional)",
      messagePlaceholder: "Tell us a bit about yourself…",
      fileLabel: "CV — optional (PDF, DOC or DOCX)",
      fileHint: "5 MB max.",
      submitLabel: "Send my application",
      note: "Your information is strictly confidential.",
      errors: {
        firstNameRequired: "Please enter your first name.",
        lastNameRequired: "Please enter your last name.",
        emailRequired: "Please enter your email address.",
        emailInvalid: "Please enter a valid email address.",
        fileTooLarge: "The file exceeds the 5 MB limit.",
        fileBadType: "Accepted formats: PDF, DOC or DOCX.",
        generic: "Sending failed. Please try again in a moment.",
      },
      successTitle: "Application sent.",
      successMessage:
        "Your file has been submitted. We get back to you within 24 business hours.",
      successAction: "Send another application",
    },
  },

  interview: {
    badge: "Interview \u00B7 Atheris Labs",
    title: "Book your *interview*",
    description:
      "Pick the slot that suits you: 1 hour, at your own local time.",
    noteReferenceTz:
      "Our slots are set in Algerian time (9 AM \u2013 4 PM) and are automatically displayed in YOUR local time: you pick an hour that suits you, where you live.",
    noteNoNightWork:
      "This time difference does not change your working hours: the only time it matters is for the interview itself.",
    noteMeetDay:
      "On the day: join the Google Meet 5 minutes before your chosen time. The interview lasts about 30 minutes. Once confirmed, the slot can no longer be changed.",
    meetLink: "Join the Google Meet interview: {{link}}",
    meetCta: "Open Google Meet",
    meetBadge: "Google Meet",
    expiredTitle: "This link has expired",
    expiredMessage:
      "The booking window for this interview is over. Please contact your recruiter for a new link.",
    stepProfile: "Your details",
    stepSlot: "Your slot",
    notFoundTitle: "Invalid link",
    notFoundMessage:
      "This interview link no longer exists or has been cancelled. Please contact your recruiter.",
    javascriptRequired:
      "This scheduler requires JavaScript: please enable it in your browser to pick a slot.",
    form: {
      firstNameLabel: "First name",
      lastNameLabel: "Last name",
      emailLabel: "Email",
      slotLabel: "Preferred slot",
      submitLabel: "Confirm my slot",
      note: "A confirmation will be sent to you by email.",
      errors: {
        firstNameRequired: "Please enter your first name.",
        lastNameRequired: "Please enter your last name.",
        emailRequired: "Please enter your email address.",
        emailInvalid: "Please enter a valid email address.",
        slotRequired: "Please select a slot.",
        slotTaken: "This slot was just taken. Please pick another one.",
        rateLimited: "Too many attempts. Please try again in a minute.",
        generic: "Sending failed. Please try again in a moment.",
      },
      successTitle: "Interview booked.",
      successMessage:
        "Your slot is confirmed and can no longer be changed. A summary has been sent to you by email.",
      successAction: "Close",
    },
  },

  sdrKit: {
    eyebrow: "Internal documentation",
    title: "The SDR *Onboarding* Kit",
    description:
      "Everything a Sales Development Representative needs to represent Atheris Labs, qualify the right buyers and start earning commission - available as a single downloadable PDF.",
    meta: ["12 pages", "English", "PDF \u00B7 1.5 MB", "Version 1.0"],
    intro:
      "This is the working reference for commission-based SDRs joining Atheris Labs. It covers who we are, who to target, how the progressive commission works, how outreach is run end to end, and the standards that protect your access to the studio.",
    downloadLabel: "Download the kit (PDF)",
    fileName: "SDR-Onboarding-Kit.pdf",
    languageNote: "The document is written entirely in English.",
    includesTitle: "What the kit covers",
    includes: [
      "Introduction and the Atheris Labs mission",
      "Buyer persona and target profiles",
      "Progressive commission structure (10% to 20%)",
      "Operational process and autonomy",
      "Golden rules and getting started",
    ],
    confidentialTitle: "Internal - Confidential",
    confidentialDescription:
      "This document is for authorised Atheris Labs sales partners. Do not redistribute it outside the studio or publish it publicly.",
    facts: [
      { label: "Commission", value: "10% - 20%" },
      { label: "Project value", value: "$500 - $4,500" },
      { label: "Engagement", value: "Independent contractor" },
      { label: "Earnings", value: "Uncapped" },
    ],
  },

  exam: {
    badge: "Online assessment",
    title: "Your SDR *assessment*",
    description:
      "Four short sections, around 20 to 25 minutes. Your answers are saved as you go - nothing is lost if your connection drops.",
    notFoundTitle: "This link is not *valid*",
    notFoundMessage:
      "The link may have expired or already been used. Contact Atheris LABS to get a new one.",
    submittedTitle: "This assessment is already *submitted*",
    submittedMessage:
      "Each link can be used once. Your answers are with our team - you will hear back by email.",
    durationNote: "About 20-25 minutes. The timer is indicative and never blocks you.",
    autosaveNote: "Your answers are saved automatically at the end of each section.",
    progressLabel: "Section {{n}} of {{total}}",
    nextSectionLabel: "Next section",
    previousSectionLabel: "Previous section",
    submitLabel: "Submit my assessment",
    submittingLabel: "Submitting...",
    savingLabel: "Saving...",
    savedLabel: "Saved",
    saveFailedLabel: "Could not save - check your connection",
    errorLabel: "Something went wrong. Please try again.",
    successTitle: "Assessment *submitted*",
    successMessage:
      "Thank you. Your answers have been received and will be reviewed personally by our CEO within 24 hours. You will receive an email with the decision.",
    failedTitle: "Assessment *not passed*",
    failedMessage:
      "Unfortunately your answers do not match the commission model required for this role, so the assessment is closed. Thank you for your time.",
    reviewNote: "Reviewed personally by the CEO within 24 hours - you will get the decision by email.",
  },

  notFound: {
    code: "404 \u00B7 Not found",
    title: "This page does not *exist*",
    description:
      "The link may have changed or the address contains a typo. Let's get you back on track.",
    primaryCta: "Back to home",
    secondaryCta: "View our work",
  },

  footer: {
    tagline: "Software engineering and web design: digital products built to last.",
    navLabel: "Navigation",
    links: [{ label: "Careers", href: "/en/recrutement" }],
    contactLabel: "Contact",
    rights: "All rights reserved.",
    legal: "Legal Notice",
  },

  seo: {
    title: "ATHERIS LABS — Software Engineering & Custom Digital Products",
    description:
      "ATHERIS LABS designs and builds custom digital products: high-value Web, Mobile & Desktop applications with scalable architectures and excellent code.",
    keywords: [
      "web agency",
      "custom software development",
      "software studio",
      "mobile app development",
      "software development agency",
      "website redesign",
      "B2B SaaS application",
      "desktop software development",
    ],
  },
} satisfies SiteContent;
