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
  },

  hero: {
    badge: "✦ Software Engineering & Web Design Studio",
    title: "We design and build custom digital products.",
    subtitle:
      "Web, Mobile & Desktop applications with high added value. Scalable architectures, excellent code, and premium interface design.",
    primaryCta: "Start a project",
    secondaryCta: "or book a discovery call →",
    secondaryCtaHref: "#contact",
    trustStats: [
      { value: "+20", label: "Products delivered" },
      { value: "100%", label: "Proprietary & scalable code" },
      { value: "A → Z", label: "End-to-end support" },
    ],
  },

  services: {
    eyebrow: "Expertise",
    title: "Areas of Expertise",
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
    title: "Projects & Case Studies",
    description:
      "A selection of digital products shipped to production, from business SaaS to real-time applications.",
    filters: {
      all: "All",
      web: "Web & SaaS",
      mobile: "Mobile",
      ai: "AI & Media",
    },
    items: [
      {
        id: "clinique",
        category: "web",
        featured: true,
        mockup: "clinic",
        title: "Clinic Management SaaS",
        description:
          "A complete SaaS platform for medical practice management: scheduling, patient records, billing and practice analytics, deployed multi-tenant on Next.js and PostgreSQL.",
        tags: ["Next.js", "PostgreSQL", "Multi-tenant", "Stripe"],
        metric: { value: "+100h", label: "saved per year, per practice" },
      },
      {
        id: "papernote",
        category: "ai",
        featured: false,
        mockup: "papernote",
        title: "Papernote AI",
        description:
          "A SaaS platform that analyzes and summarizes academic documents with AI: ingestion, vector indexing and structured outputs in seconds.",
        tags: ["Next.js", "OpenAI", "Vector DB", "PostgreSQL"],
        metric: { value: "8\u00A0s", label: "to summarize a document" },
      },
      {
        id: "myks-radio",
        category: "mobile",
        featured: false,
        mockup: "radio",
        title: "MYKS Radio",
        description:
          "A web and mobile infrastructure for real-time audio streaming, with a custom management dashboard and iOS and Android apps broadcasting HLS feeds.",
        tags: ["React Native", "WebSockets", "Node.js", "HLS"],
        metric: { value: "3 platforms", label: "web, iOS and Android" },
      },
      {
        id: "tiberium",
        category: "web",
        featured: false,
        mockup: "tiberium",
        title: "Tiberium Enterprise",
        description:
          "A consulting web platform with secure real-time messaging over WebSockets, including notifications, persistent history and Redis-backed scaling.",
        tags: ["Next.js", "WebSockets", "Redis", "TypeScript"],
        metric: { value: "<\u00A0100\u00A0ms", label: "delivery latency" },
      },
    ],
  },

  techStack: {
    eyebrow: "Technologies",
    title: "Technologies We Work With",
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
    title: "Our Development Process",
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
    title: "Trusted by Founders",
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
    title: "Frequently Asked Questions",
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
    title: "Let's bring your project to life",
    description:
      "Tell us about your needs: we get back to you within one business day with an initial read and the recommended next steps.",
    channels: [
      {
        id: "email",
        icon: "mail",
        label: "Business Email",
        value: "contact@atherislabs.com",
        href: "mailto:contact@atherislabs.com",
      },
      {
        id: "whatsapp",
        icon: "whatsapp",
        label: "Business WhatsApp",
        value: "+213 555 00 00 00",
        href: "https://wa.me/213555000000",
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

  footer: {
    tagline: "Software engineering and web design: digital products built to last.",
    navLabel: "Navigation",
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
