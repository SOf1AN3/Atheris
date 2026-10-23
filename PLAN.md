# PLAN.md — Landing Page Premium « ATHERIS LABS »

> **Statut : EN ATTENTE DE VALIDATION UTILISATEUR** — aucune ligne de code applicatif ne sera écrite avant le feu vert explicite.
> Version : 1.0 — 23/10/2026
> Projet : `C:\Users\Sofiane\Desktop\ATHERIS` (dossier vide, greenfield)

---

## Contexte & besoin métier

**Objectif** : créer la landing page de conversion B2B d'une agence d'ingénierie logicielle premium (**ATHERIS LABS**) spécialisée dans les produits digitaux sur-mesure (Web, Mobile, Desktop). La page doit projeter une image d'**autorité, d'élite et de rigueur** (direction artistique type Apple product page) et transformer les visiteurs en **demandes de devis qualifiées**.

**Fondamental** : ce n'est pas une « belle page », c'est un **actif commercial**. Chaque section sert un maillon de la chaîne de conversion : *Crédibilité → Preuve → Méthode → Confiance → Action*.

### Décisions validées par l'utilisateur
| Point | Décision |
|---|---|
| Marque | **ATHERIS LABS** — monogramme « A » SVG minimaliste |
| Stack | Next.js 15 (App Router, RSC) + Tailwind CSS v4 + TypeScript strict |
| Langue | **Bilingue FR / EN** — URLs `/fr` et `/en`, FR par défaut |
| Formulaire | **Frontend uniquement** — validation locale, état succès simulé, ZÉRO backend/DB |
| Animations | **Framer Motion** (retenue « Apple » : reveals sobres, jamais de glow néon) |
| Contenu | **Placeholder fictif** mais crédible, centralisé dans `src/content/` (remplacement ultérieur isolé) |

### Améliorations proposées et retenues (hors brief initial)
- **A — SEO technique** : métadonnées par locale, OpenGraph/Twitter, JSON-LD (`Organization` + `Service` + `FAQPage`), `sitemap.xml`, `robots.txt`, image OG générée.
- **B — Accessibilité WCAG 2.1 AA** : contrastes vérifiés (gris `#94A3B8` sur `#0A0C10` ≈ 7:1 ✅), focus visibles, navigation clavier des onglets (`role="tablist"`), `prefers-reduced-motion` respecté.
- **C — Section FAQ** (5 questions : délais, budget, propriété du code, maintenance, confidentialité) → levier de conversion + riche snippet Google.
- **D — Performance** : `next/font` (Inter auto-hébergée, 0 requête tierce), SVG inline, mockups 100% CSS, RSC par défaut. Cible Lighthouse ≥ 95.
- **E — Robustesse formulaire** : honeypot anti-bot (pré-câblé), validation Zod stricte, messages d'erreur i18n, aucun état de chargement mort.
- **F — Micro-interactions sobres** : reveal au scroll, hover des cartes (bordure `#3B82F6` à 40% d'opacité), transitions d'onglets fluides.
- **G — Architecture maintenable** : contenu 100% découplé du JSX, composants sectionnés et typés, tokens de design centralisés.

### Améliorations volontairement reportées (hors périmètre actuel)
- Backend d'envoi du formulaire (Resend / stockage DB) — décision utilisateur « frontend only ».
- Blog, pages services dédiées, portfolio détaillé, animations 3D/WebGL, analytics (à discuter : Plausible vs Vercel Analytics).

---

## Questions / décisions en attente

**Aucune question bloquante restante.** Points à fournir par l'utilisateur *après* le développement (non bloquants) :
1. Contenu réel définitif (noms clients, métriques, témoignages, email/WhatsApp, logos) → remplacement dans `src/content/fr.ts` et `src/content/en.ts`.
2. Adresse email de réception et numéro WhatsApp réels.
3. Choix du domaine de production (impacte les métadonnées `metadataBase`).

---

## 0. Architecture cible & conventions

### Arborescence
```
ATHERIS/
├── PLAN.md
├── package.json / tsconfig.json / next.config.ts / postcss.config.mjs / .gitignore
├── src/
│   ├── middleware.ts                 # Détection & redirection de locale
│   ├── app/
│   │   ├── globals.css               # Tokens Tailwind v4 (@theme) + styles de base
│   │   ├── robots.ts
│   │   ├── sitemap.ts
│   │   └── [locale]/
│   │       ├── layout.tsx            # <html lang>, fonts, métadonnées, JSON-LD
│   │       ├── page.tsx              # Assemblage des sections
│   │       └── opengraph-image.tsx   # OG image générée (next/og)
│   ├── i18n/
│   │   ├── config.ts                 # Locales supportées, défaut, helpers
│   │   └── dictionaries.ts           # Chargement typé des dictionnaires
│   ├── content/
│   │   ├── types.ts                  # Types du contenu (Source de vérité)
│   │   ├── fr.ts                     # Contenu FR (placeholder)
│   │   └── en.ts                     # Contenu EN (placeholder)
│   ├── lib/
│   │   ├── utils.ts                  # cn() helper
│   │   └── form-schema.ts            # Schéma Zod du formulaire
│   └── components/
│       ├── ui/                       # Button, Badge, Pill, SectionHeading, Card
│       ├── motion/                   # Reveal, FadeIn (wrappers Framer Motion)
│       ├── layout/                   # Header, Footer, LocaleSwitcher
│       └── sections/                 # Hero, HeroVisual, TrustBar, Services,
│                                     # CaseStudies, TechStack, Process,
│                                     # Testimonials, Faq, Contact
```

### Design tokens (Tailwind v4 `@theme` dans `globals.css`)
| Token | Valeur | Usage |
|---|---|---|
| `--color-ink` | `#0A0C10` | Fond principal (matte charcoal) |
| `--color-surface` | `#14171F` | Cartes / surfaces |
| `--color-line` | `#242936` | Bordures 1px |
| `--color-fg` | `#FFFFFF` | Titres / texte primaire |
| `--color-muted` | `#94A3B8` | Texte secondaire |
| `--color-accent` | `#3B82F6` | **EXCLUSIVEMENT** CTA primaires + onglet actif |
| Police | Inter (`next/font/google`) | Sans-serif précision |

**Règle d'or couleur** : l'accent `#3B82F6` n'apparaît QUE sur les boutons CTA primaires, l'indicateur d'onglet actif, le point du pill badge et les focus rings. Nulle part ailleurs.

### Conventions
- TypeScript **strict**, `import type` obligatoire pour les types.
- Composants serveur par défaut ; `"use client"` uniquement si interaction (onglets, formulaire, animations).
- Tout le contenu textuel vient de `src/content/[locale].ts` — **aucune string hardcodée dans le JSX** (hors aria-labels techniques).
- Tous les composants exportés et typés (`Props` explicites).
- Pas de `any`, pas de `@ts-ignore`, pas de CSS inline (sauf valeur dynamique calculée).
- Dépendances runtime : `next`, `react`, `tailwindcss`, `framer-motion`, `zod`, `react-hook-form`, `@hookform/resolvers`, `clsx`, `tailwind-merge`, `lucide-react` (icônes tree-shakées).

---

## 1. Fondations & Architecture

### 1.1 Scaffold du projet — `Backend`
**Fichiers** : `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `src/app/globals.css`
**Actions** :
1. `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes` (dossier courant vide).
2. Installer : `framer-motion zod react-hook-form @hookform/resolvers clsx tailwind-merge lucide-react`.
3. Définir les design tokens dans `globals.css` (`@theme` Tailwind v4) + reset sombre (`color-scheme: dark`), styles de base (scroll doux avec `prefers-reduced-motion`, sélection de texte `#3B82F6`, focus ring visible).
4. `git init` + `.gitignore` (node_modules, .next, .env*, etc.).
**Dépendances** : aucune.
**Critère « fait »** : `npm run build` passe sans erreur ; tokens visibles dans le CSS compilé ; `git status` propre après commit initial.

### 1.2 Helpers & configuration i18n — `Backend`
**Fichiers** : `src/i18n/config.ts`, `src/i18n/dictionaries.ts`, `src/lib/utils.ts`, `src/middleware.ts`
**Actions** :
1. `config.ts` : `locales = ['fr','en'] as const`, `defaultLocale = 'fr'`, type `Locale`, helper `isValidLocale`.
2. `dictionaries.ts` : loader typé paresseux (`Record<Locale, () => Promise<Dictionary>>`) avec type `Dictionary` importé depuis `content/types`.
3. `utils.ts` : `cn()` (clsx + tailwind-merge).
4. `middleware.ts` : matcher excluant assets statiques, détection `Accept-Language`, redirection `/` → `/fr` (défaut), validation de la locale dans l'URL.
**Dépendances** : 1.1.
**Critère « fait »** : `/` redirige vers `/fr`, `/xx` renvoie 404 propre, typage `Dictionary` compilé.

---

## 2. Contenu & Internationalisation

### 2.1 Types du contenu — `Backend`
**Fichiers** : `src/content/types.ts`
**Actions** : définir les types de la source de vérité : `SiteContent` (nav, hero, trustBar, services, cases, techStack, process, testimonials, faq, contact, footer, seo), avec `ServiceItem`, `CaseStudy` (avec `category: 'web' | 'mobile' | 'ai'`), `TechCategory`, `ProcessStep`, `Testimonial`, `FaqItem`, `ContactInfo`, `SeoMeta`.
**Dépendances** : 1.2.
**Critère « fait »** : tous les types exportés, aucune `any`, structure capable d'accueillir les 8 sections + SEO.

### 2.2 Contenu FR placeholder — `Frontend`
**Fichiers** : `src/content/fr.ts`
**Actions** : rédiger l'intégralité du contenu FR (ton B2B premium, « nous », orienté valeur business) conforme à la structure `SiteContent` : badge hero, H1/H2, CTA, 3 stats, 4 services, 4 réalisations (SaaS Clinique / Papernote AI / MYKS Radio / Tiberium Enterprise) avec badges tech + métrique business, 4 catégories de stack (~7-8 tech chacune), 4 étapes de process, 3 témoignages (dont Ahcen B. et Karim O.), 5 FAQ, coordonnées (email / WhatsApp / « Remote & Algérie »), footer + SEO (title, description, mots-clés).
**Dépendances** : 2.1.
**Critère « fait »** : `fr.ts` satisfait strictement `SiteContent`, zéro string manquante, `satisfies SiteContent` utilisé.

### 2.3 Contenu EN placeholder — `Frontend`
**Fichiers** : `src/content/en.ts`
**Actions** : traduction professionnelle EN (pas de traduction littérale : ton natif business), mêmes clés, mêmes métriques.
**Dépendances** : 2.1 (parallélisable conceptuellement, mais exécutée séquentiellement après 2.2).
**Critère « fait »** : `en.ts` satisfait strictement `SiteContent`.

---

## 3. UI — Composants partagés

### 3.1 Primitives UI — `Frontend`
**Fichiers** : `src/components/ui/Button.tsx`, `src/components/ui/Badge.tsx`, `src/components/ui/SectionHeading.tsx`
**Actions** :
- `Button` : variantes `primary` (fond `#3B82F6`, texte blanc, hover légèrement plus clair) / `ghost` (texte + flèche) / `secondary` (surface + bordure) ; tailles `sm|md|lg` ; polymorphe `as` pour les liens ; focus ring AA.
- `Badge` : pill avec bordure `#242936`, texte `#94A3B8`, variante `dot` (point bleu `#3B82F6`).
- `SectionHeading` : titre H2 blanc + eyebrow optionnel + description `#94A3B8`, alignement `left|center`, hiérarchie typo (clamp 2.5rem→3.5rem titres).
**Dépendances** : 1.1.
**Critère « fait »** : composants sans état, typés, rendu conforme à la palette imposée.

### 3.2 Wrappers d'animation — `Frontend`
**Fichiers** : `src/components/motion/Reveal.tsx`, `src/components/motion/FadeIn.tsx`
**Actions** : wrappers Framer Motion (whileInView, `viewport={{ once: true }}`), respect de `useReducedMotion()` (désactive tout si `prefers-reduced-motion: reduce`), props `delay`, `y`, `duration` avec valeurs par défaut **sobres** (y: 16px, 0.5s, ease out).
**Dépendances** : 1.1.
**Critère « fait »** : aucune animation rebondissante ou lumineuse ; désactivation propre en reduced-motion.

### 3.3 Header, LocaleSwitcher & Footer — `Frontend`
**Fichiers** : `src/components/layout/Header.tsx`, `src/components/layout/LocaleSwitcher.tsx`, `src/components/layout/Footer.tsx`
**Actions** :
- `Header` : sticky glass (`backdrop-blur-xl`, fond `rgba(10,12,16,.72)`, bordure basse 1px `#242936`) ; gauche logo monogramme « A » SVG + « ATHERIS LABS » ; centre liens (Services, Réalisations, Technologies, Méthode) avec **scroll ancre doux** + état actif ; droite `LocaleSwitcher` + CTA « Demander un devis ». Menu mobile : bouton hamburger → panneau plein écran animé.
- `LocaleSwitcher` : bascule FR/EN (`usePathname` pour conserver l'ancre), accessible `aria-label`.
- `Footer` : colonne logo + baseline, liens de navigation, contact, mentions légales (placeholder `#`), copyright dynamique (année), respect strict du dark mode.
**Dépendances** : 2.2, 3.1.
**Critère « fait »** : navigation clavier complète, header transparent → verre au scroll, menu mobile utilisable à 360px de large.

---

## 4. UI — Sections de la page

### 4.1 Hero + visuel + trust bar — `Frontend`
**Fichiers** : `src/components/sections/Hero.tsx`, `src/components/sections/HeroVisual.tsx`, `src/components/sections/TrustBar.tsx`
**Actions** :
- `Hero` : pill badge « ✦ Studio d'Ingénierie Logicielle & Design Web » (point bleu), H1 `clamp(2.75rem, 6vw, 4.75rem)` bold tracking serré, sous-titre `#94A3B8` max-width 640px, CTA « Lancer un projet » + lien discret « ou réserver un appel découverte → », hiérarchie verticale généreuse (py 8-10rem).
- `HeroVisual` : **100% CSS/Tailwind** — fenêtre desktop (barre de titre macOS, sidebar, cartes KPI, mini-graphique barres, tableau) **chevauchée** d'un cadre mobile (notch, bottom nav) en bas à droite. Dégradé radial très subtil derrière. Aucune forme flottante, aucune image externe. Responsive : le mockup mobile passe sous la fenêtre desktop en mobile.
- `TrustBar` : 3 stats en ligne horizontale séparées par des filets 1px (« +20 Produits Livrés » | « 100% Code Propriétaire & Scalable » | « Accompagnement A à Z »), passage en colonne < 640px.
**Dépendances** : 3.1, 3.2.
**Critère « fait »** : rendu identique à la direction artistique imposée, mockup sans image raster, lisibilité du H1 vérifiée.

### 4.2 Pôles d'Expertise (grille 2×2) — `Frontend`
**Fichiers** : `src/components/sections/Services.tsx`
**Actions** : titre de section + 4 cartes (`#14171F`, bordure 1px `#242936`, radius 20px, padding 32px) : icône lucide, titre, description, liste de badges tech. Hover : bordure `rgba(59,130,246,0.4)`, translation `-4px`, ombre très légère. Grille `md:grid-cols-2`, gap 20px.
**Dépendances** : 3.1, 3.2.
**Critère « fait »** : 4 cartes équilibrées en hauteur, hover subtil, aucune couleur accent sur le repos.

### 4.3 Projets & Réalisations (filtres) — `Frontend`
**Fichiers** : `src/components/sections/CaseStudies.tsx`, `src/components/sections/CaseStudyCard.tsx`
**Actions** :
- Onglets de filtre `[Tous][Web & SaaS][Mobile][IA & Médias]` : `role="tablist"`, navigation flèches clavier, onglet actif = fond `#3B82F6` + texte blanc (seul usage accent autorisé ici).
- Grille asymétrique : carte 1 « large featured » (2 colonnes, mockup produit CSS) + cartes 2/3/4 standard. Chaque carte : **mockup produit 100% CSS** (mini-dashboard / mini-app selon le projet), badges tech, **métrique business** en évidence (ex. « +100h économisées/an par cabinet »).
- Filtrage animé Framer Motion (`layout`, fade/scale 0.2s) sans reflow brutal.
**Dépendances** : 3.1, 3.2, 4.2 (styles cohérents).
**Critère « fait »** : filtres fonctionnels et accessibles, métriques visibles en un coup d'œil, zéro image externe.

### 4.4 Stack Technique (onglets) — `Frontend`
**Fichiers** : `src/components/sections/TechStack.tsx`
**Actions** : composant client à switcher horizontal `[Frontend][Backend & Data][Mobile & Desktop][Cloud & DevOps]` (soulignement/indicateur animé `#3B82F6`), zone de contenu = grille de badges tech propres (8 max par onglet), transitions douces entre panneaux, accessibilité `tablist/tab/tabpanel`.
**Dépendances** : 3.1, 3.2.
**Critère « fait »** : jamais d'« icon wall » surchargée, un seul panneau visible, clavier OK.

### 4.5 Notre Processus (4 étapes) — `Frontend`
**Fichiers** : `src/components/sections/Process.tsx`
**Actions** : ligne de progression horizontale (filet 1px `#242936`, pastilles numérotées `01→04`) : Cadrage & Spécifications → Architecture & Design UI/UX → Développement Agile & Sprints → Déploiement & Support Continu. Chaque étape : numéro, titre, description courte. Adaptation verticale en mobile (timeline verticale).
**Dépendances** : 3.1, 3.2.
**Critère « fait »** : timeline lisible et alignée en desktop, verticale propre en mobile.

### 4.6 Témoignages — `Frontend`
**Fichiers** : `src/components/sections/Testimonials.tsx`
**Actions** : 3 cartes citation (guillemet discret, texte, logo client placeholder typographique, nom + rôle, badge « Projet vérifié » avec icône check). Grille `md:grid-cols-3`. Témoignages placeholder : Ahcen B. (Fondateur Clinique Dentaire), Karim O. (CEO Tiberium), + un troisième.
**Dépendances** : 3.1, 3.2.
**Critère « fait »** : 3 cartes homogènes, badges visibles, contenu typé.

### 4.7 FAQ — `Frontend`
**Fichiers** : `src/components/sections/Faq.tsx`
**Actions** : accordéon accessible (`<details>/<summary>` stylé ou composant contrôlé avec `aria-expanded`), 5 questions (délais, budget, propriété du code, maintenance, confidentialité/NDA), animation d'ouverture discrète, un seul élément ouvert à la fois.
**Dépendances** : 3.1, 3.2.
**Critère « fait »** : utilisable au clavier, contenu prêt pour le JSON-LD `FAQPage`.

### 4.8 Contact & demande de devis — `Frontend`
**Fichiers** : `src/components/sections/Contact.tsx`, `src/lib/form-schema.ts`
**Actions** :
- Split section : **gauche** « Concrétisons votre projet » + liens directs (Email professionnel, WhatsApp entreprise, Localisation : Remote & Algérie) avec icônes ; **droite** formulaire minimaliste 4 champs : Nom / Entreprise, Email, Type de projet (select : Web & SaaS / Mobile / Desktop / Modernisation & Cloud / Autre), Message (textarea).
- `form-schema.ts` : schéma Zod (nom min 2, email `z.string().email()`, type de projet enum, message min 10 max 2000) + messages d'erreur **i18n passés en paramètre**.
- React Hook Form + `@hookform/resolvers/zod`, champs avec labels réels, états d'erreur (bordure rouge douce + `aria-invalid` + `aria-describedby`).
- **Frontend only** : à la soumission → validation → état de succès local animé (« Merci, votre demande a bien été préparée. ») ; **aucun appel réseau**. Champ honeypot `company_website` masqué (pré-câblé pour le futur backend).
- CTA accent `#3B82F6` pleine largeur.
**Dépendances** : 3.1, 3.2, 2.2.
**Critère « fait »** : validation fonctionnelle FR+EN, aucun envoi réseau, honeypot invisible visuellement et au lecteur d'écran (`aria-hidden` + tabindex -1).

### 4.9 Assemblage de la page — `Frontend`
**Fichiers** : `src/app/[locale]/page.tsx`, `src/app/[locale]/layout.tsx`
**Actions** :
- `layout.tsx` : `<html lang={locale}>`, `next/font` Inter, `generateMetadata` (title/description/openGraph/twitter alternates de langue), JSON-LD (`Organization` + `Service` + `FAQPage`) injecté via `<script type="application/ld+json">`, header + footer.
- `page.tsx` : assemblage RSC des 10 sections dans l'ordre, `generateStaticParams` pour `/fr` et `/en`.
**Dépendances** : toutes les sections 4.1 → 4.8.
**Critère « fait »** : les deux locales se rendent en SSG, aucune erreur d'hydratation.

---

## 5. SEO, Performance & Accessibilité

### 5.1 Métadonnées, sitemap & robots — `Backend`
**Fichiers** : `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/[locale]/opengraph-image.tsx`
**Actions** : sitemap bilingue, robots pointant vers le sitemap, image OG générée via `next/og` (fond `#0A0C10`, monogramme + nom + accroche, dimensions 1200×630).
**Dépendances** : 4.9.
**Critère « fait »** : `/sitemap.xml` et `/robots.txt` servis, OG image rendue en build.

### 5.2 Passe accessibilité & performance — `Frontend`
**Fichiers** : `src/app/globals.css` (ajustements), composants concernés
**Actions** : vérification contrastes (AA), ordre de tabulation, `skip-link`, focus ring cohérent, `prefers-reduced-motion` global, `aria-*` des onglets/accordéon, images/mockups décoratifs `aria-hidden`, hiérarchie H1 unique → H2 → H3.
**Dépendances** : 4.9.
**Critère « fait »** : audit manuel clavier + lecteur d'écran OK, build sans warning.

---

## 6. Qualité & Tests

### 6.1 Qualité statique — `Backend`
**Fichiers** : `.eslintrc`/`eslint.config.mjs` (déjà fourni par scaffold), `package.json` (scripts)
**Actions** : `npm run lint` sans erreur, `npx tsc --noEmit` sans erreur, `npm run build` de production sans erreur ni warning.
**Dépendances** : 5.2.
**Critère « fait »** : les 3 commandes passent.

### 6.2 Validation E2E — `Tester`
**Actions** : parcours navigateur (MCP Playwright) sur `npm run dev` : chargement `/fr` et `/en`, navigation ancres, filtres réalisations, onglets stack, accordéon FAQ, soumission formulaire (erreurs + succès), responsive 360px / 768px / 1440px, capture d'écran de contrôle.
**Dépendances** : 6.1.
**Critère « fait »** : rapport Tester = VALIDÉ, ou liste de correctifs précis.

---

## Sécurité & edge cases à couvrir

| Risque | Mesure |
|---|---|
| Injection XSS via contenu futur | Tout le contenu passe par React (échappement natif) ; JSON-LD sérialisé avec `JSON.stringify` dans un `<script>` avec remplacement des `<` (`\u003c`) pour éviter la clôture de balise |
| Spam de formulaire | Champ honeypot + validation stricte (prêt pour rate-limit serveur lors du futur câblage) |
| Formulaire sans backend | Aucun envoi réseau explicite + message utilisateur honnête (« demande préparée »), documenté dans le code |
| Locale invalide dans l'URL (`/de`) | Middleware → 404 propre ou redirection `/fr` |
| Hydration mismatch (année copyright, `matchMedia`) | Valeurs dynamiques lues côté client uniquement après montage, ou rendues via SSG |
| `prefers-reduced-motion` | Toutes les animations Framer Motion neutralisées via `useReducedMotion` |
| Overflow mobile (mockups larges, tableaux) | Mockups en `overflow-hidden` + échelle responsive, tests à 360px |
| Accessibilité des onglets | `role="tablist"`, `aria-selected`, flèches clavier, `tabIndex` géré |
| Contraste texte gris | `#94A3B8` sur `#0A0C10` ≈ 7:1 (AAA) ; vérifié sur surface `#14171F` (≈ 6.4:1, AA) |
| Liens externes futurs (`target="_blank"`) | `rel="noopener noreferrer"` obligatoire |

---

## Ordre d'exécution (séquentiel)

| # | Tâche | Agent | Validation |
|---|---|---|---|
| 1 | 1.1 Scaffold + tokens | Backend | Reviewer → commit `chore(scaffold)` |
| 2 | 1.2 i18n config + middleware + utils | Backend | Reviewer → commit `feat(i18n)` |
| 3 | 2.1 Types du contenu | Backend | Reviewer → commit `feat(content)` |
| 4 | 2.2 Contenu FR | Frontend | Reviewer → commit `docs(content)` |
| 5 | 2.3 Contenu EN | Frontend | Reviewer → commit `docs(content)` |
| 6 | 3.1 Primitives UI | Frontend | Reviewer → commit `feat(ui)` |
| 7 | 3.2 Wrappers animation | Frontend | Reviewer → commit `feat(motion)` |
| 8 | 3.3 Header + LocaleSwitcher + Footer | Frontend | Reviewer → commit `feat(layout)` |
| 9 | 4.1 Hero + HeroVisual + TrustBar | Frontend | Reviewer → commit `feat(hero)` |
| 10 | 4.2 Services | Frontend | Reviewer → commit `feat(services)` |
| 11 | 4.3 Réalisations (filtres + cartes) | Frontend | Reviewer → commit `feat(cases)` |
| 12 | 4.4 Stack technique | Frontend | Reviewer → commit `feat(tech-stack)` |
| 13 | 4.5 Processus | Frontend | Reviewer → commit `feat(process)` |
| 14 | 4.6 Témoignages | Frontend | Reviewer → commit `feat(testimonials)` |
| 15 | 4.7 FAQ | Frontend | Reviewer → commit `feat(faq)` |
| 16 | 4.8 Contact + schéma Zod | Frontend | Reviewer → commit `feat(contact)` |
| 17 | 4.9 Assemblage layout + page | Frontend | Reviewer → commit `feat(page)` |
| 18 | 5.1 SEO (sitemap, robots, OG) | Backend | Reviewer → commit `feat(seo)` |
| 19 | 5.2 Passe a11y & perf | Frontend | Reviewer → commit `fix(a11y)` |
| 20 | 6.1 Qualité statique (lint/tsc/build) | Backend | Vérification Lead |
| 21 | 6.2 Validation E2E | Tester | Rapport final |

**Règles d'exécution** : une tâche à la fois, prompt isolé (2-3 fichiers), `Reviewer` systématique après chaque tâche Frontend/Backend, micro-commit Conventional Commits en français après `APPROUVE`, **aucun `git push`**. En cas de `REJETE`, correction puis revue ; après 2 échecs identiques → escalade utilisateur.

---

## Validation finale (Reviewer → Tester)
1. Chaque tâche ci-dessus cochée + commitée.
2. `Reviewer` : dernier diff complet conforme (typage strict, pas de string hardcodée, palette respectée, a11y).
3. `Tester` : parcours E2E FR/EN + responsive + formulaire → rapport.
4. Synthèse utilisateur : fichiers créés, statut revue/tests, et **ce qu'il reste à fournir** (contenu réel, email/WhatsApp, domaine).
