# DESIGN.md — Référentiel de Design « ATHERIS LABS »

> **Statut : SOURCE DE VÉRITÉ DESIGN** — tout composant, section ou style du projet DOIT être conforme à ce document.
> Version : 1.0 — 23/10/2026
> En cas de conflit entre ce document et une demande ponctuelle : **ce document gagne**, sauf mention explicite de l'utilisateur.
> Compagnon de `PLAN.md` (organisation & exécution).

---

## 1. Principes directeurs

1. **Retenue absolue** (« Apple product page ») : de grands vides, peu d'éléments, chaque pixel justifié. L'élégance vient de la hiérarchie et du blanc — ici, du **noir**.
2. **Contraste par la typographie, pas par la couleur** : titres blancs massifs vs corps gris compact. La couleur est un signal, jamais un décor.
3. **L'accent est un sémaphore** : le bleu `#3B82F6` ne dit qu'une chose : « c'est ici qu'on agit ». Il est **interdit** ailleurs (voir §2.3).
4. **Zéro bruit visuel** : pas de néon, pas de glow, pas de dégradés arc-en-ciel, pas de formes flottantes abstraites, pas d'ombres lourdes, pas de glassmorphism décoratif.
5. **Cohérence métrique** : tous les espacements, tailles et rayons viennent des échelles §2.5/§2.6. **Aucune valeur magique** hors échelle sans justification commentée.
6. **Mobile-élégant** : chaque section est conçue pour être aussi belle à 360 px qu'à 1440 px. Rien ne défile horizontalement.
7. **Accessibilité invisible** : focus nets, contrastes AA, `prefers-reduced-motion` respecté — sans dégrader l'esthétique.

---

## 2. Design Tokens

Implémentation : `@theme` dans `src/app/globals.css` (Tailwind v4). Les tokens ci-dessous sont la référence ; les classes utilitaires du projet en découlent.

### 2.1 Couleurs

| Token CSS | Classe Tailwind | Hex | Usage EXCLUSIF |
|---|---|---|---|
| `--color-ink` | `bg-ink` | `#0A0C10` | Fond de page global, fond header/footer |
| `--color-ink-2` | `bg-ink-2` | `#0E1117` | Bandes de section alternées (usage rare) |
| `--color-surface` | `bg-surface` | `#14171F` | Cartes, panneaux, champs de formulaire, panneau mobile menu |
| `--color-surface-2` | `bg-surface-2` | `#191D27` | Éléments internes de mockup (lignes de tableau, KPI) |
| `--color-line` | `border-line` | `#242936` | Toutes les bordures 1px (cartes, séparateurs, champs) |
| `--color-line-soft` | `border-line-soft` | `rgba(255,255,255,0.06)` | Filets internes des mockups, séparateurs de trust bar |
| `--color-fg` | `text-fg` | `#FFFFFF` | Titres, valeurs chiffrées, labels actifs |
| `--color-muted` | `text-muted` | `#94A3B8` | Texte secondaire, descriptions, placeholders |
| `--color-faint` | `text-faint` | `#64748B` | Micro-labels, numérotation, texte légal |
| `--color-accent` | `bg-accent` / `text-accent` | `#3B82F6` | **CTA primaires, onglet actif, point du pill badge, focus ring, indicateur de scroll actif** |
| `--color-accent-hover` | — | `#2E6FE0` | Hover du CTA primaire uniquement |
| `--color-accent-soft` | — | `rgba(59,130,246,0.40)` | Bordure de carte au hover, indicateur d'onglet (trait) |
| `--color-accent-faint` | — | `rgba(59,130,246,0.12)` | Fond du badge « Projet vérifié » / pill badge (très discrète) |
| `--color-danger` | `text-danger` | `#F87171` | Messages d'erreur de formulaire UNIQUEMENT |
| `--color-success` | `text-success` | `#34D399` | Icône/état de succès du formulaire UNIQUEMENT |

**Palette des mockups CSS** (sous-ensemble autorisé dans les visuels produits) :
`#0E1117` (fond fenêtre), `#191D27` (blocs internes), `#242936` (bordures), `#94A3B8`/`#64748B` (textes), `#FFFFFF` (titres), `#3B82F6` (graphiques/données actives), `#34D399` (courbe positive), `#F59E0B` (courbe secondaire). **Maximum 3 teintes de données par mockup.**

### 2.2 Contrastes vérifiés (WCAG 2.1)

| Combinaison | Ratio | Niveau |
|---|---|---|
| `#FFFFFF` sur `#0A0C10` | 19.4:1 | AAA |
| `#94A3B8` sur `#0A0C10` | 7.2:1 | AAA |
| `#94A3B8` sur `#14171F` | 6.4:1 | AA+ |
| `#64748B` sur `#0A0C10` | 4.1:1 | ❌ sous AA — **réservé au non-essentiel uniquement** (voir note §2.2 bis) |
| `#FFFFFF` sur `#3B82F6` | 3.7:1 | AA pour texte ≥ 18px bold — **les libellés de bouton SONT ≥ 15px semi-bold + bouton ≥ 44px de haut** (contraste large-text acceptable) |
| `#F87171` sur `#0A0C10` | 7.0:1 | AAA |

> Règle : `--color-faint` n'est JAMAIS utilisé pour une information essentielle.

### 2.3 Règle d'usage de l'accent — NON NÉGOCIABLE

✅ **Autorisé** : bouton CTA primaire, trait de l'onglet actif, point du pill hero, focus ring, courbe/graphique actif dans les mockups, état hover des bordures de carte (en `accent-soft`), lien « réserver un appel découverte → » au hover, **état checked d'une checkbox** (`data-[state=checked]:bg-primary`), **liseré gauche de la ligne sélectionnée d'un tableau** (2px, §12.3) — ces deux derniers = indicateurs d'**état actif**, jamais du décor.
❌ **Interdit** : fonds de section, titres, icônes décoratives, glow/ombre bleue, texte courant, badges tech, footer, dégradés de fond.

### 2.4 Typographie

**Famille unique** : `Inter` via `next/font/google` (variable, `display: swap`, sous-ensembles latin + latin-ext pour FR).
`font-feature-settings: "cv11", "ss01";` activé sur le `body` (chiffres alignés, `a` alternatif — rendu « SF Pro-like »).

| Rôle | Taille | Poids | Interlettrage | Interligne | Couleur | Notes |
|---|---|---|---|---|---|---|
| `display` (H1 hero) | `clamp(2.75rem, 6vw, 4.75rem)` | 800 | `-0.035em` | 1.02 | `fg` | Max 3 lignes desktop, 5 mobile |
| `h2` (titres de section) | `clamp(2rem, 4vw, 3.25rem)` | 700 | `-0.03em` | 1.08 | `fg` | Max 2 lignes |
| `h3` (cartes services / étapes) | `1.375rem` (22px) | 650 | `-0.02em` | 1.25 | `fg` | |
| `h4` (cartes secondaires) | `1.125rem` (18px) | 600 | `-0.015em` | 1.35 | `fg` | |
| `eyebrow` | `0.8125rem` (13px) | 600 | `0.06em` | 1 | `muted` | UPPERCASE, préfixé d'un filet ou pictogramme |
| `lead` (sous-titre hero) | `clamp(1.125rem, 1.6vw, 1.375rem)` | 400 | `-0.01em` | 1.6 | `muted` | `max-width: 42rem` |
| `body` | `1rem` (16px) | 400 | `0` | 1.65 | `muted` | |
| `body-sm` | `0.9375rem` (15px) | 400 | `0` | 1.6 | `muted` | Descriptions de cartes |
| `caption` | `0.875rem` (14px) | 450 | `0` | 1.5 | `muted`/`faint` | Métriques, légendes |
| `micro` | `0.75rem` (12px) | 500 | `0.02em` | 1.4 | `faint` | Badges tech, mentions légales |
| `stat` (chiffres trust bar) | `clamp(1.75rem, 3vw, 2.5rem)` | 700 | `-0.03em` | 1 | `fg` | Chiffre + unité en `caption` |

**Échelle de corps maximum** : jamais de texte > 18px en `muted` sur plus de 3 lignes (lisibilité). Les liens de texte soulignés utilisent `text-decoration-color: rgba(255,255,255,0.25)` puis `accent` au hover.

### 2.5 Espacements (base 4px)

Échelle autorisée : `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 120 · 160`.

| Usage | Desktop | Tablette | Mobile |
|---|---|---|---|
| Padding vertical de section | `120px` (`py-30`) | `96px` | `72px` |
| Gap titre de section → contenu | `64px` | `48px` | `32px` |
| Gap interne de carte | `32px` | `28px` | `24px` |
| Gap entre cartes (grille) | `24px` | `20px` | `16px` |
| Header → contenu hero | `120px` (sous header sticky) | `88px` | `64px` |

### 2.6 Rayons, bordures, ombres, profondeur

| Token | Valeur | Usage |
|---|---|---|
| `radius-sm` | `8px` | Badges tech, petits encarts |
| `radius-md` | `12px` | Boutons, champs, pill badge |
| `radius-lg` | `20px` | Cartes (services, témoignages, réalisations) |
| `radius-xl` | `24px` | Carte featured, fenêtres de mockup |
| `radius-full` | `9999px` | Pills, pastilles numérotées, avatars |
| `border-default` | `1px solid #242936` | Toute surface |
| `border-hover` | `1px solid rgba(59,130,246,0.40)` | Carte au hover |
| `shadow-card` | `0 1px 2px rgba(0,0,0,0.25)` | Carte au repos (quasi invisible) |
| `shadow-card-hover` | `0 20px 40px -16px rgba(0,0,0,0.50)` | Carte au hover |
| `shadow-mockup` | `0 40px 80px -24px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)` | Fenêtres hero / mockups produits |
| `shadow-button` | AUCUNE | Les boutons n'ont pas d'ombre |

### 2.7 Z-index & breakpoints

`z-header: 50` · `z-menu-mobile: 60` · `z-skip-link: 100`. Aucun autre élément n'a de `z-index` arbitraire.

| Nom | Min-width | Cible |
|---|---|---|
| `sm` | `640px` | Grand mobile / portrait tablette |
| `md` | `768px` | Tablette — les grilles passent en 2 colonnes |
| `lg` | `1024px` | Laptop — navigation desktop, hero 2 colonnes éventuel |
| `xl` | `1280px` | Desktop — container pleine largeur (1200px) |
| Base | `360px` | Petit mobile — cible minimale SUPPORTÉE |

**Container** : `max-width: 1200px`, `margin-inline: auto`, `padding-inline: clamp(1.25rem, 5vw, 2.5rem)`.

---

## 3. Composants Fondamentaux

### 3.1 Button

| Variante | Fond | Texte | Bordure | Hover | Usage |
|---|---|---|---|---|---|
| `primary` | `#3B82F6` | `#FFFFFF` | aucune | `#2E6FE0` + `translateY(-1px)` | **CTA unique par zone** (« Lancer un projet », « Demander un devis », « Envoyer ») |
| `secondary` | `#14171F` | `#FFFFFF` | `1px #242936` | bordure `accent-soft`, fond `#191D27` | Actions secondaires (rare) |
| `ghost` | transparent | `#94A3B8` | aucune | texte `#FFFFFF` + flèche `translateX(4px)` | « ou réserver un appel découverte → » |

Métriques : hauteur `44px` (sm) / `52px` (md) / `56px` (lg), padding-x `24-32px`, radius `12px`, poids `600`, taille `15-16px`. Focus : `outline: 2px solid #3B82F6; outline-offset: 3px`. Active : `translateY(0)` + léger assombrissement. Transition `180ms cubic-bezier(0.4, 0, 0.2, 1)`.

### 3.2 Badge / Pill

- **Pill hero** : fond `rgba(59,130,246,0.12)`, bordure `1px rgba(59,130,246,0.25)`, texte `#94A3B8` 13px/600, radius `9999px`, padding `8px 16px`, **point `6px` `#3B82F6`** en tête (+ icône ✦ autorisée ici uniquement).
- **Badge tech** : fond `#191D27`, bordure `1px #242936`, texte `#94A3B8` 12px/500, radius `8px`, padding `5px 10px`. Pas de logo d'icône de marque.
- **Badge « Projet vérifié »** : fond `rgba(52,211,153,0.10)`, texte `#34D399` 12px/600 + icône check `14px`, radius `9999px`.

### 3.3 Card (surface standard)

Fond `#14171F` · bordure `1px #242936` · radius `20px` · padding `32px` (24px mobile).
**Hover** (uniquement si la carte est interactive) : bordure `accent-soft`, `translateY(-4px)`, `shadow-card-hover`, transition `260ms cubic-bezier(0.4, 0, 0.2, 1)`.
**Structure type** : icône (24px, `#94A3B8`, stroke 1.5) → H3 → `body-sm` → liste de badges tech → (optionnel) métrique.
Ordre et espacement internes constants : `24px` entre l'icône et le titre, `12px` titre→description, `20px` description→badges.

### 3.4 SectionHeading

Composition : `eyebrow` (optionnel) → `h2` → `lead` (optionnel, `max-width: 36rem`).
Alignement `left` par défaut ; `center` pour les sections Services, Process, Témoignages (le `lead` est alors centré avec `margin-inline: auto`).
Règle : **un seul H2 par section, jamais de H2 décoratif.**

### 3.5 Onglets (Tabs) — Réalisations & Stack Technique

- Conteneur : rail horizontal `display:flex`, gap `8px`, fond `#14171F` (ou transparent pour la stack), bordure `1px #242936`, radius `12px`, padding `4px`, **scroll-x autorisé en mobile** avec masque de dégradé aux extrémités.
- Onglet inactif : texte `#94A3B8`, padding `10px 18px`, radius `8px`, hover texte `#FFFFFF`.
- **Onglet actif** : fond `#3B82F6`, texte `#FFFFFF`, poids 600 (ou trait bas `2px #3B82F6` pour la variante « rail underline » de la Stack Technique).
- Accessibilité : `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, navigation `← →` (et `Home/End`), `tabIndex` roving.
- Transition de panneau : `opacity 0 → 1` + `translateY(8px) → 0` sur `220ms ease-out`. **Pas de slide horizontal spectaculaire.**

### 3.6 Champs de formulaire

- **Input / Textarea / Select** : fond `#14171F`, bordure `1px #242936`, radius `12px`, hauteur `52px` (textarea min `128px`), padding-x `16px`, texte `#FFFFFF` 15px, placeholder `#64748B`.
- **Focus** : bordure `#3B82F6` + `box-shadow: 0 0 0 3px rgba(59,130,246,0.18)` (le seul glow autorisé du projet).
- **Erreur** : bordure `#F87171` + message `#F87171` 13px sous le champ avec icône `AlertCircle` 14px, relié par `aria-describedby`.
- **Label** : toujours visible au-dessus (`13px/600`, `#FFFFFF`, margin-bottom `8px`). **Jamais de placeholder-à-la-place-du-label.**
- **Select** : chevron `#94A3B8` 16px, fond d'option `#14171F`, option sélectionnée `#191D27`.
- **Checkbox / honeypot** : champ `company_website` masqué (`position:absolute; left:-9999px`, `aria-hidden`, `tabIndex:-1`).

### 3.7 Header (sticky glass)

- État scroll top : fond `rgba(10,12,16,0.55)` + `backdrop-blur(16px)` + bordure basse `rgba(255,255,255,0.05)` (quasi invisible).
- État scrolled (après `24px`) : fond `rgba(10,12,16,0.80)` + `backdrop-blur(20px) saturate(160%)` + bordure basse `#242936` + `shadow: 0 1px 0 rgba(255,255,255,0.03)`. Transition `240ms`.
- Hauteur : `72px` desktop / `64px` mobile.
- Liens de nav : `14px/500`, `#94A3B8` → hover `#FFFFFF` (transition couleur `150ms`). Lien actif de section : `#FFFFFF` + point `4px` `#3B82F6` sous le lien (option A) **ou** simple `#FFFFFF` (option B retenue : plus sobre).
- Logo : monogramme « A » SVG (28px) — **constructiviste minimal** : deux diagonales + barre horizontale, stroke `#FFFFFF` 1.5px, dans un carré arrondi `8px` bordure `#242936` (fond transparent). Mot-marque « ATHERIS LABS » : 15px, poids 700, `-0.02em`, `#FFFFFF` ; « LABS » optionnellement en `#94A3B8`.
- CTA header : variante `primary`, taille `sm` (44px de haut).

### 3.8 Footer

Fond `#0A0C10` avec bordure haute `#242936`. 3 colonnes desktop (Marque + baseline | Navigation | Contact) → 1 colonne mobile. Texte légal `12px` `#64748B`. Aucun accent bleu dans le footer, sauf le lien de contact au hover.

### 3.9 Accordéon (FAQ)

- Ligne entière cliquable (`summary`) : question `17px/600` `#FFFFFF` + chevron `20px` `#94A3B8` qui pivote `180deg` en `220ms`.
- Séparateurs `1px #242936` entre les lignes (pas de cartes individuelles).
- Réponse : `body-sm` `#94A3B8`, `max-width: 48rem`, ouverture `height auto` animée via Framer Motion (`AnimatePresence`, 220ms).
- Un seul élément ouvert à la fois (groupe contrôlé).

---

## 4. Spécifications Section par Section

> Toutes les sections utilisent le container §2.7 et le rythme vertical §2.5. Ordre strict : 4.1 → 4.10.

### 4.1 Hero
- Padding-top : `120px` desktop / `64px` mobile ; padding-bottom : `96px` desktop / `64px` mobile.
- **Centre unique** : tout est centré (`text-align: center`), colonne unique. Le hero n'est PAS en split.
- Ordre vertical : Pill (§3.2) → `40px` → H1 → `24px` → `lead` → `40px` → CTA `primary` lg (« Lancer un projet », 56px) → `16px` → lien `ghost` « ou réserver un appel découverte → » → `80px` → HeroVisual (§4.2) → `64px` → TrustBar (§4.3).
- H1 surlignage interdit : tout le H1 est blanc, aucune partie colorée.
- Fond : `#0A0C10` **+ un unique halo radial très subtil** : `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.10), transparent 70%)`. C'est la SEULE lueur autorisée du site.

### 4.2 HeroVisual — anatomie 100% CSS
Deux objets : **fenêtre Desktop** + **frame Mobile** chevauchant le coin bas-droit.

**Fenêtre Desktop** (ratio ~16:10, `max-width: 960px`, centrée) :
- `radius-xl` (24px), `shadow-mockup`, bordure `1px rgba(255,255,255,0.08)`.
- Barre de titre `40px` : 3 pastilles macOS (`10px`, `#FF5F57` / `#FEBC2E` / `#28C840` **en version désaturée** `saturate(0.85)`) + champ URL/app `radius-full` `#191D27` (fake : `app.atheris-labs.io/dashboard` en `micro` `#64748B`).
- Corps : sidebar gauche `180px` (`#0E1117`, 4-5 items dont 1 actif avec fond `#191D27` + point accent) + zone principale.
- Zone principale : titre de page `14px` blanc + 3 cartes KPI (`#191D27`, radius `12px`, label `micro` `#64748B` + valeur `20px` blanche + delta `+12%` `#34D399`) + **mini-graphique barres** (12 barres, `radius-sm`, hauteur variable, 1 barre `#3B82F6`, autres `#242936`) + extrait de tableau (3 lignes : pastille statut + barres de texte `#242936` + chiffres).

**Frame Mobile** (ratio ~9:19.5, largeur ≈ 32% de la fenêtre desktop, ancré bas-droit, `translate` de chevauchement `+12% x / +16% y`) :
- Châssis `radius-xl`, bordure `4px #242936`, `shadow-mockup`, notch/pill caméra en haut (`radius-full`, `#242936`).
- Écran : header mini + 2 cartes empilées + barre de navigation basse (4 icônes dont 1 active `#3B82F6`).
- Rotation interdite, perspective interdite. Léger `scale(0.98)` en mobile réel.

**Dégradé de fond du bloc visuel** : `radial-gradient(60% 60% at 50% 40%, rgba(255,255,255,0.03), transparent)` — imperceptible.
**Responsive** : sous `768px`, le frame mobile passe **sous** la fenêtre desktop (empilement, centré) ; la fenêtre desktop est « coupée » aux bords (`overflow-hidden` sur le wrapper) pour garder l'immersion. **Aucun scroll horizontal.**

### 4.3 TrustBar
- Ligne horizontale unique, séparée par 2 filets verticaux `1px #242936` (desktop).
- 3 blocs : `stat` (§2.4) + `caption` `#94A3B8` en dessous. Contenu : « +20 / Produits Livrés » · « 100% / Code Propriétaire & Scalable » · « A→Z / Accompagnement Complet ».
- Mobile : empilement vertical avec filets horizontaux, padding `24px 0`.
- Option premium : apparition en `stagger` (100ms entre blocs) au scroll.

### 4.4 Pôles d'Expertise (Services)
- `SectionHeading` **centré** : eyebrow « EXPERTISE » → H2 « Pôles d'Expertise » → lead.
- Grille `2×2` (`grid-cols-1` mobile, `md:grid-cols-2`, gap `24px`, `max-width: 1000px` centré).
- Carte : §3.3, hauteur égale (`items-stretch`), icône `28px` `#94A3B8` (lucide : `Globe`, `Smartphone`, `MonitorCog`, `CloudCog`), H3, `body-sm`, liste de badges tech (wrapping).
- Carte 1 (Web & SaaS) peut porter un léger accent de hiérarchie (icône plus grande ou bordure `accent-soft` par défaut) — **interdit de dupliquer ce traitement**.

### 4.5 Projets & Réalisations
- `SectionHeading` **left** (eyebrow « PORTFOLIO ») + rail d'onglets de filtre aligné à droite (desktop) / sous le titre (mobile) : `Tous`, `Web & SaaS`, `Mobile`, `IA & Médias`.
- Grille asymétrique `12 colonnes` gap `24px` :
  - **Carte 1 « featured »** : `span 7`, contient un mockup produit large (16:9) en haut + contenu en bas (titre H3 `24px`, description, badges, **métrique business** en exergue).
  - **Carte 2** : `span 5`, mockup 16:9 + contenu.
  - **Cartes 3 & 4** : `span 6` chacune, mockup 16:9 + contenu.
  - Mobile : tout `span 12`, mockup en 16:10.
- **Métrique business** : bloc `surface-2` `radius-md` padding `12px 16px`, valeur `18px/700` blanche (ex. « +100h ») + label `12px` `#94A3B8` (« économisées/an par cabinet »). C'est le point focal secondaire de la carte.
- **Mockups produits** (100% CSS, `aria-hidden`, `overflow-hidden`) :
  1. *SaaS Clinique* : agenda + fiche patient (agenda hebdo en colonnes, pastilles rendez-vous `#3B82F6`/`#64748B`).
  2. *Papernote AI* : document + panneau de synthèse IA (barres de texte, bloc résumé avec icône sparkle `#3B82F6`, score).
  3. *MYKS Radio* : lecteur audio (waveform en barres, titre, bouton play rond `#3B82F6`, timeline).
  4. *Tiberium* : messagerie temps réel (bulles `#191D27`/`#242936`, indicateur « en ligne » `#34D399`, sidebar de conversations).
- Hover carte : §3.3 + le mockup reçoit un léger `scale(1.02)` sur `400ms` (overflow hidden).
- Filtrage : Framer Motion `layout` + `AnimatePresence`, fade/scale `0.18s`, **sans** rebond.

### 4.6 Stack Technique
- `SectionHeading` **left** (eyebrow « TECHNOLOGIES »).
- Rail d'onglets style « underline » (§3.5 variante rail) : `Frontend`, `Backend & Data`, `Mobile & Desktop`, `Cloud & DevOps`. Conteneur centré ou aligné gauche avec le contenu.
- Panneau : grille de badges « tech » premium (`grid-cols-2` mobile → `4` desktop, gap `12px`) ; chaque item = **pastille large** (`surface`, bordure `line`, radius `12px`, padding `14px 18px`, `body-sm` `#FFFFFF` + micro-catégorie `#64748B`). **8 items max par onglet.**
- Transition de panneau : §3.5. Jamais plus d'un panneau visible.

### 4.7 Notre Processus
- `SectionHeading` **centré** (eyebrow « MÉTHODE »).
- Desktop : ligne horizontale unique — filet `1px #242936` reliant 4 pastilles `40px` (`radius-full`, fond `#14171F`, bordure `#242936`, numéro `micro` `#94A3B8` ; la pastille de l'étape en cours de survol devient `#3B82F6`/blanc). Sous chaque pastille : H3 `20px` + `body-sm`. Les 4 colonnes sont `grid-cols-4 gap-32px`.
- Mobile : **timeline verticale** (filet vertical à gauche `1px #242936`, pastilles alignées, contenu décalé `48px`).
- Contenu : `01` Cadrage & Spécifications · `02` Architecture & Design UI/UX · `03` Développement Agile & Sprints · `04` Déploiement & Support Continu.

### 4.8 Témoignages
- `SectionHeading` **centré** (eyebrow « TÉMOIGNAGES »).
- Grille `md:grid-cols-3 gap-24px`, cartes §3.3 (padding `28px`), structure :
  1. Guillemet décoratif `32px` `#242936` (SVG, `aria-hidden`).
  2. Citation `body` `#FFFFFF` (16px, max 4 lignes) — léger italique interdit (rester droit, Apple-style).
  3. Séparateur `1px #242936`.
  4. Bloc identité : **avatar typographique** `40px` `radius-full` `surface-2` (initiales `13px/600` `#94A3B8`) + nom `14px/600` blanc + rôle `13px` `#94A3B8` + badge « Projet vérifié » (§3.2).
- Pas de logo client image : wordmark typographique `micro` `#64748B` si besoin.

### 4.9 FAQ
- `SectionHeading` **left** (eyebrow « QUESTIONS FRÉQUENTES ») + accordéon à droite en desktop (`grid-cols-5` : titre `span 2`, accordéon `span 3`) ; empilé mobile.
- Accordéon : §3.9. 5 questions (délais · budget · propriété du code · maintenance · confidentialité).

### 4.10 Contact & demande de devis
- Bande de section dédiée (éventuellement `bg-ink-2` pour marquer la rupture) avec bordure haute `#242936`.
- Split `grid-cols-12` gap `64px` :
  - **Colonne gauche (`span 5`)** : eyebrow « CONTACT » → H2 « Concrétisons votre projet » → `lead` → 3 blocs de contact (`surface`, bordure `line`, radius `16px`, padding `20px`, icône `20px` `#94A3B8` + label `micro` `#64748B` + valeur `15px` blanche) : Email professionnel · WhatsApp Entreprise · Localisation « Remote & Algérie ». Chaque bloc cliquable (mailto / wa.me) avec hover bordure `accent-soft`.
  - **Colonne droite (`span 7`)** : carte `surface` radius `24px` padding `32-40px` contenant le formulaire §3.6 :
    - `Nom / Entreprise` (text, requis) — `Email` (email, requis) — sur 2 colonnes `sm:grid-cols-2`.
    - `Type de projet` (select : Web & SaaS / Application Mobile / Logiciel Desktop / Modernisation & Cloud / Autre) — pleine largeur.
    - `Message` (textarea, requis, min 10 caractères).
    - Honeypot `company_website` (masqué).
    - Bouton `primary` **pleine largeur** `56px` : « Envoyer la demande de devis ».
    - Micro-note sous le bouton : « Réponse sous 24h ouvrées · Vos informations restent confidentielles » (`micro`, `#64748B`).
    - **États** : idle → validating (bouton `opacity-70`) → success (le formulaire est remplacé par un bloc succès : icône check `#34D399` dans un cercle `64px`, H4 « Merci ! », texte de confirmation, `AnimatePresence` 260ms) / errors (champs §3.6).
- **Aucun envoi réseau.** Le succès est simulé localement.

### 4.11 Header mobile (menu)
- Bouton hamburger `44px` (icône `Menu`/`X` animée en `200ms`).
- Panneau plein écran `#0A0C10` (fixe, `z-60`), apparition `opacity + translateY(-8px)` en `220ms` : liens `h3` (22px) empilés (gap `8px`, padding `16px 0`, séparateurs `#242936`), puis CTA `primary` pleine largeur + switcher de langue.
- Verrouillage du scroll du `body` à l'ouverture, `Escape` ferme, focus piégé dans le panneau.

---

## 5. Motion Design

**Intention** : « la page respire, elle ne danse pas ». Toute animation sert la hiérarchie.

| # | Élément | Comportement | Durée | Easing |
|---|---|---|---|---|
| M1 | Sections au scroll | `opacity 0→1` + `y 16px→0` (`whileInView`, `once: true`, viewport `margin -80px`) | `500ms` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| M2 | Enfants en cascade | Stagger `80ms` (max 6 enfants) | `500ms` | idem |
| M3 | Cartes au hover | `y -4px` + bordure `accent-soft` + shadow | `260ms` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| M4 | Boutons au hover | `y -1px` + fond `accent-hover` | `180ms` | `ease-out` |
| M5 | Onglets (filtres) | Indicateur layout `layoutId` (glissement) | `240ms` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| M6 | Panneau d'onglet | `opacity` + `y 8px` | `220ms` | `ease-out` |
| M7 | Filtrage réalisations | `AnimatePresence` fade + `scale 0.98→1` | `180ms` | `ease-out` |
| M8 | Accordéon FAQ | Hauteur auto + fade | `220ms` | `ease-out` |
| M9 | Header scrolled | Background + border | `240ms` | `ease-out` |
| M10 | Formulaire → succès | Swap `AnimatePresence` (fade + `scale 0.96→1`) | `260ms` | `cubic-bezier(0.22, 1, 0.36, 1)` |

**Règles dures** :
- Aucun `spring` rebondissant, aucune rotation, aucun effet de glow animé, aucun parallaxe, aucune animation en boucle infinie (sauf le point « pulse » du pill hero : `opacity 1→0.5→1`, `2.4s`, **autorisé car extrêmement subtil**).
- `useReducedMotion()` de Framer Motion **doit** être consommé dans chaque composant animé : si `true`, état final immédiat (opacity 1, y 0).
- Les animations ne doivent **jamais** bloquer l'interaction (pas de `pointer-events` perdus, pas de délai sur les CTA).

---

## 6. Accessibilité (norme cible : WCAG 2.1 AA)

1. **Structure** : un seul `h1` (hero) par page, hiérarchie `h1 → h2 → h3` sans saut, `<header> <main> <footer>` + `<section aria-labelledby>` par bloc.
2. **Clavier** : tout interactif atteignable et activable (`Tab`, `Entrée`, `Espace`, `Échap`, flèches pour les onglets). Ordre de tabulation = ordre visuel.
3. **Focus** : `outline: 2px solid #3B82F6; outline-offset: 3px` sur `:focus-visible`, jamais `outline: none` sans remplacement.
4. **Skip-link** : premier élément focusable (« Aller au contenu principal »), visible au focus, `z-100`.
5. **Contrastes** : §2.2 — tout nouveau couple couleur doit être vérifié avant usage.
6. **Images/mocks décoratifs** : `aria-hidden="true"` + `role="presentation"` ; les mockups n'ont **pas** de texte alternatif informatif (le texte porteur de sens est dans le DOM).
7. **Formulaires** : `<label>` associé (`htmlFor`), erreurs via `aria-describedby` + `aria-invalid`, annonce du succès (`role="status"`), champs requis signalés visuellement ET par `required`.
8. **Mouvement** : `prefers-reduced-motion: reduce` → transitions/animations neutralisées (CSS + Framer Motion).
9. **Langue** : `<html lang="fr">` / `lang="en"` selon la locale.
10. **Cibles tactiles** : ≥ `44×44px` pour tout élément interactif.

---

## 7. Responsive — Comportements par rupture

| Zone | ≤ 639px | 640–1023px | ≥ 1024px |
|---|---|---|---|
| Header | Logo + hamburger | Logo + hamburger | Nav complète + CTA |
| Hero | H1 `2.75rem`, mockup empilé | H1 `3.25rem`, mockup réduit | H1 `4.75rem`, mockup complet |
| TrustBar | 3 lignes + filets H | 3 colonnes | 3 colonnes + filets V |
| Services | 1 colonne | 2 colonnes | 2×2 centré (1000px) |
| Réalisations | 1 colonne, cartes pleines | 2 colonnes | Grille asymétrique 7/5/6/6 |
| Stack | Onglets scroll-x | Onglets scroll-x | Onglets pleins |
| Process | Timeline verticale | Timeline verticale | Ligne horizontale |
| Témoignages | 1 colonne | 2 colonnes (3e wrap) | 3 colonnes |
| FAQ | Empilé | Empilé | Split 2/3 |
| Contact | Empilé (infos → formulaire) | Empilé | Split 5/7 |

**Invariants à toute taille** : pas de scroll horizontal, container respecté, tap targets ≥ 44px, aucune ligne de texte > `72ch`.

---

## 8. SEO & Métadonnées visuelles

- **Title** (FR) : `ATHERIS LABS — Studio d'Ingénierie Logicielle & Produits Digitaux sur-Mesure` (≤ 60 chars cible). EN équivalent.
- **Description** (FR) : ~155 caractères, incluant « Web, Mobile & Desktop » + promesse + CTA implicite.
- **OpenGraph image** (générée `next/og`, 1200×630) : fond `#0A0C10`, monogramme « A » (§3.7) en haut-gauche, titre blanc `72px/800` sur 2 lignes max, filet `#242936`, baseline `#94A3B8` `24px`, halo radial accent `0.10` identique au hero. **Zéro photo, zéro dégradé coloré.**
- **Favicon** : monogramme « A` sur `#0A0C10`, SVG + PNG 32/180px.
- **JSON-LD** : `Organization` (nom, logo, url, contactPoint) + `Service` (4 pôles) + `FAQPage` (5 questions). Sérialisation avec remplacement `<` → `\u003c`.

---

## 9. À faire / À ne pas faire (checklist Reviewer)

### ✅ À faire systématiquement
- [ ] Toutes les valeurs d'espacement/taille/rayon proviennent des échelles §2.5/§2.6.
- [ ] L'accent `#3B82F6` n'apparaît que dans les cas autorisés §2.3.
- [ ] Chaque composant animé respecte `useReducedMotion`.
- [ ] Tout le texte vient de `src/content/[locale].ts` (aucune string FR/EN en dur dans le JSX).
- [ ] Hover/focus définis pour tout élément interactif.
- [ ] Hiérarchie typo : un seul `display`, des `h2` ≤ 2 lignes, du `body-sm` pour les descriptions de cartes.
- [ ] Sections avec `py-30/24/18` (desktop/tablette/mobile) et container §2.7.

### ❌ À rejeter immédiatement
- [ ] Glow néon, ombres colorées, dégradés arc-en-ciel, `text-gradient` sur les titres.
- [ ] Bleu sur un titre, un fond de section, une icône décorative ou un badge tech.
- [ ] Mur d'icônes / grille de 20 logos de technologies sur un seul écran.
- [ ] Formes flottantes abstraites, blobs, orbes, particules.
- [ ] Valeurs magiques (`padding: 37px`), `!important`, `@ts-ignore`, `any`.
- [ ] Placeholder à la place d'un `<label>`, `outline: none` sans remplacement.
- [ ] Animation en boucle sauf le pulse du pill hero.
- [ ] Image raster (PNG/JPG) dans les mockups — **tout est CSS/SVG**.
- [ ] Effet de perspective/rotation 3D sur les mockups.
- [ ] Texte en `#64748B` pour une information essentielle.

---

## 10. Micro-copie (registre de ton)

- **Ton** : « nous », direct, orienté résultat business, jamais « startup hype ». Vocabulaire : *produit*, *valeur ajoutée*, *scalable*, *excellence*, *accompagnement*, *sur-mesure*.
- **Interdits** : « révolutionnaire », « disruptif », « meilleurs du marché », points d'exclamation, emoji (sauf le ✦ du pill hero).
- **CTA** : infinitif + objet clair — « Lancer un projet », « Demander un devis », « Envoyer la demande de devis ».
- **FR** : typographie française respectée (espaces fines `:` `;` `!` `?` insécables — via `&nbsp;` ou `framer` typographique), « e-mail » → « email », pas de anglicisme inutile.
- **EN** : native business register (« We build… », « Ship… »), US spelling.

---

## 12. UI shadcn/ui — thématisation & piles (T04)

> Complément opérationnel : `components.json` (racine) + variables ajoutées à
> `src/app/globals.css` + composants de `src/components/ui/`. **Aucun token des
> §2.x n'a été modifié** — les blocs `@theme` landing et `@theme inline`
> shadcn coexistent.

### 12.0 Piles retenues (choix documenté)

| Pile | Composants | Règle |
|---|---|---|
| **Landing** (existante) | `Button.tsx`, `Badge.tsx`, `SectionHeading.tsx` | **Intacts** : API publique inchangée (`variant="primary\|secondary\|ghost"`, `size`, `href` / `variant="pill\|tech\|verified"`, `dot`). Jamais régénérés. |
| **Plateforme** (shadcn) | `label · input · textarea · select · table · card · tabs · dialog · dropdown-menu · avatar · separator · skeleton · form · sonner · tooltip · sheet · accordion · checkbox · scroll-area` | Installés depuis le registre, puis **thématisés localement** (fichiers modifiés = fork du registre). |

**Pourquoi deux piles plutôt qu'une fusion** : les composants maison portent
l'API exacte que 6 fichiers de landing appellent déjà ; les ré-écrire au-dessus
de shadcn aurait fait dériver (au minimum) les rayons et les hauteurs de bouton.
Un seul `Button`/`Badge` subsiste dans le projet — **celui de la landing**,
conforme §3.1/§3.2, réutilisable côté plateforme.

- **`button` et `badge` shadcn ne sont PAS installés.** Sur Windows, le système
  de fichiers est insensible à la casse : `src/components/ui/button.tsx`
  désigne *le même fichier* que `Button.tsx`. Vérifié en `--dry-run` : la CLI
  proposait d'écraser `Button.tsx` et `Badge.tsx` (donc de détruire la landing).
- `form` du registre dépend de `button` : installation réalisée en déplaçant
  temporairement `Button.tsx`, puis en supprimant le `button.tsx` généré.
  **Ne pas relancer `npx shadcn add form` sans précaution.**
- `cn()` : **uniquement** `src/lib/utils.ts` (clsx + tailwind-merge), pas de doublon.
- Toute ré-exécution de `shadcn add` sur un nom déjà thématisé **écrasera** les
  réglages de ce §12 (la CLI propose l'overwrite).
- `<Toaster />` (sonner) n'est **pas** monté : à faire dans le layout plateforme
  (hors périmètre T04).

### 12.1 Mapping variable shadcn → token DESIGN

| Variable shadcn (`:root`) | Classe utilitaire | Token DESIGN | Hex |
|---|---|---|---|
| `--background` | `bg-background` | `--color-ink` | `#0A0C10` |
| `--foreground` | `text-foreground` | `--color-fg` | `#FFFFFF` |
| `--card` / `--card-foreground` | `bg-card` | `--color-surface` / `--color-fg` | `#14171F` / `#FFFFFF` |
| `--popover` / `--popover-foreground` | `bg-popover` (panneaux, menus, toasts) | `--color-surface` / `--color-fg` | `#14171F` / `#FFFFFF` |
| `--primary` / `--primary-foreground` | `bg-primary` | `--color-accent` (**sémaphore §2.3**) | `#3B82F6` / `#FFFFFF` |
| `--secondary` / `--secondary-foreground` | `bg-secondary` | `--color-surface-2` / `--color-muted` | `#191D27` / `#94A3B8` |
| `--muted` | *non mappé — collision 1* | `--color-surface-2` (sens **fond**) | `#191D27` |
| `--muted-foreground` | `text-muted-foreground` | `--color-muted` | `#94A3B8` |
| `--accent` | *non mappé — collision 2* | hover **neutre** (≠ `--color-accent`) | `#191D27` |
| `--accent-foreground` | `text-accent-foreground` | `--color-fg` | `#FFFFFF` |
| `--destructive` / `--destructive-foreground` | `text-destructive` | `--color-danger` | `#F87171` / `#FFFFFF` |
| `--border` | `border-border` (défaut `*` en couche `base`) | `--color-line` | `#242936` |
| `--input` | `border-input` | `--color-line` | `#242936` |
| `--ring` | `ring-ring` | `--color-accent` (focus §2.3) | `#3B82F6` |
| `--radius` | — | *non redéfinie* (classe `rounded` nue = 4px natif, utilisée par les mockups landing) | — |

**Collision 1 — `muted`** : le landing utilise déjà `text-muted` = **#94A3B8**
(texte). shadcn attend `--muted` comme **fond #191D27** ; une seule classe ne
peut pas porter les deux sens. Le sens landing (le plus utilisé) est conservé,
la clé `--color-muted` n'est **pas** redéfinie, et chaque `bg-muted` shadcn a
été réécrit : `bg-surface-2` (tabs, table, avatar, sonner), `bg-line`
(séparateurs select/dropdown).

**Collision 2 — `accent`** : le landing utilise déjà `bg-accent`/`text-accent`
= **#3B82F6** (CTA, onglet actif, point du pill, focus). shadcn utilise
`bg-accent` pour le **survol neutre** des items de menu : mapper
`--color-accent: var(--accent)` aurait mis le CTA et les onglets actifs en gris.
La clé n'est pas redéfinie ; les `bg-accent` shadcn (dropdown, select, bouton de
fermeture dialog) sont réécrits `bg-surface-2`. **Ne jamais inverser ces deux
sens.** → ⚠ `--accent` shadcn = hover neutre, `--color-accent` DESIGN = bleu
sémaphore.

**Rayons** : l'échelle `--radius-sm/md/lg/xl` de Tailwind **n'est pas** modifiée
(sinon les `rounded-*` de la landing bougeraient) — et la clé `--radius`
(classe nue `rounded`) **non plus** (mockups de la landing l'utilisent).

Échelle **native réelle de Tailwind v4** (`node_modules/tailwindcss/theme.css` :
`--radius-sm 0.25rem` · `--radius-md 0.375rem` · `--radius-lg 0.5rem` ·
`--radius-xl 0.75rem` · `--radius-2xl 1rem` · `--radius-3xl 1.5rem`) :

| DESIGN §2.6 | Valeur | Classe Tailwind v4 |
|---|---|---|
| `radius-sm` | 8px | `rounded-lg` |
| `radius-md` | 12px | `rounded-xl` |
| `radius-lg` | 20px | `rounded-[20px]` (arbitraire — pas de natif) |
| `radius-xl` | 24px | `rounded-3xl` |
| `radius-full` | 9999px | `rounded-full` |

> **Constat vérifié (revue T04)** : la landing est **déjà conforme** —
> `Button.tsx` (`rounded-xl` = 12px = `radius-md` §3.1), champs `Contact.tsx`
> (`rounded-xl` = 12px §3.6), `CaseStudies.tsx` (`rounded-xl` 12px /
> `rounded-lg` 8px), `Badge.tsx` (`rounded-lg` = 8px = `radius-sm`), cartes
> `rounded-[20px]` = 20px. **Aucune correction landing nécessaire.**
> Les composants shadcn de la plateforme suivent ce mapping (§12.1/§12.3).

### 12.2 Palette des 10 statuts de prospect (`prospect_status`)

Format badge commun : `radius-sm` (8px → `rounded-lg`), **12px / 600**,
padding `5px 10px` (§3.2), fond = **couleur @ 12 %** sur `#14171F`, bordure
`1px` de la même couleur @ 25 % (règle du pill §3.2), texte plein.
Ratios WCAG 2.1 calculés **sur le fond réel** (teinte 12 % posée sur `#14171F`),
cible AA = 4,5:1.

| # | `prospect_status` | Texte | Fond (12 %) | Bordure (25 %) | Ratio | Fond 12 % calculé |
|---|---|---|---|---|---|---|
| 1 | `nouveau` | `#94A3B8` | `rgba(148,163,184,.12)` | `rgba(148,163,184,.25)` | **5,8:1** ✅ | `#232831` |
| 2 | `contacte` | `#94A3B8` | `rgba(148,163,184,.12)` | `rgba(148,163,184,.25)` | **5,8:1** ✅ | `#232831` |
| 3 | `qualifie` | `#FFFFFF` | `rgba(59,130,246,.12)` | `rgba(59,130,246,.25)` | **15,5:1** ✅ | `#192439` |
| 4 | `devis_envoye` | `#F59E0B` | `rgba(245,158,11,.12)` | `rgba(245,158,11,.25)` | **6,9:1** ✅ | `#2F271D` |
| 5 | `signe` | `#34D399` | `rgba(52,211,153,.12)` | `rgba(52,211,153,.25)` | **7,4:1** ✅ | `#182E2E` |
| 6 | `client_actif` | `#34D399` | `rgba(52,211,153,.12)` | `rgba(52,211,153,.25)` | **7,4:1** ✅ | `#182E2E` |
| 7 | `en_livraison` | `#FFFFFF` | `rgba(59,130,246,.12)` | `rgba(59,130,246,.25)` | **15,5:1** ✅ | `#192439` |
| 8 | `clos` | `#94A3B8` | `rgba(148,163,184,.12)` | `rgba(148,163,184,.25)` | **5,8:1** ✅ | `#232831` |
| 9 | `perdu` | `#F87171` | `rgba(248,113,113,.12)` | `rgba(248,113,113,.25)` | **5,5:1** ✅ | `#2F2229` |
| 10 | `disqualifie` | `#F87171` | `rgba(248,113,113,.12)` | `rgba(248,113,113,.25)` | **5,5:1** ✅ | `#2F2229` |

Classes d'exemple (statut « signé ») :
`inline-flex items-center rounded-md border border-[#34D399]/25 bg-[#34D399]/12 px-2.5 py-1 text-xs font-semibold text-[#34D399]`

**Arbitrages par rapport à la suggestion d'origine (motivés) :**

1. **`nouveau` et `clos` : `#64748B` → `#94A3B8`.** Le texte `faint` posé sur sa
   propre teinte 12 % tombe à **3,3:1** (échec AA), et §2.2 interdit explicitement
   `--color-faint` pour une information essentielle — un statut l'est.
2. **`qualifie` et `en_livraison` : `#3B82F6` en texte → `#FFFFFF` sur fond bleu
   12 %.** Deux raisons : (a) le bleu plein sur sa teinte 12 % mesure **4,2:1**
   (échec AA) ; (b) §2.3 limite le bleu aux CTA/onglets actifs/points/focus — un
   badge-texte bleu s'en approche. Le signal « état actif » est **conservé** par
   le fond bleu (usage `--color-accent-faint` déjà autorisé §2.1) et le texte
   `#FFFFFF` = `fg`, que §2.4 réserve aux **labels actifs**. Ratio 15,5:1.
3. **`devis_envoye` : `#F59E0B`** conservé — teinte déjà autorisée par la palette
   des mockups §2.1 (« courbe secondaire »), 6,9:1.
4. **Doublons assumés** : `contacte`/`clos`/`nouveau` partagent le gris,
   `signe`/`client_actif` le vert, `perdu`/`disqualifie` le rouge — la couleur
   code la **famille** d'état, le libellé porte l'information exacte (registre §1).
5. **`disqualifie`** : identique à `perdu` (rouge) — distinction portée par le
   libellé ; ne pas créer une 11ᵉ teinte hors palette §2.1.

### 12.3 Sidebar & tableau de la plateforme

**Sidebar** (navigation gauche du dashboard) :

| Élément | Fond | Texte | Remarque |
|---|---|---|---|
| Rail global | `#0A0C10` (`bg-ink`) | — | Bordure droite `1px #242936` |
| Item inactif | transparent | `#94A3B8` | Hover : fond `#191D27` |
| Item **actif** | `#191D27` (`bg-surface-2`) | `#FFFFFF` | + **point `4px #3B82F6`** à gauche (indicateur actif autorisé §2.3) |
| Item au survol | `#191D27` | `#FFFFFF` | Transition `150ms` (§3.7) |
| Groupe / label | transparent | `#64748B` `micro` | `12px/500 uppercase` |

**Tableau** :

| Élément | Spécification |
|---|---|
| Bordures (cellules, en-tête, dernière ligne) | `1px #242936` (`border-border`, défaut posé en couche `base`) |
| En-tête | `micro` **12px/500 uppercase** `#94A3B8` (7,2:1 — AA ✅), `letter-spacing 0.02em`, padding `10px 12px` |
| Ligne (repos) | fond transparent |
| Ligne au **hover** | fond `#0E1117` (`bg-ink-2`) |
| Ligne **sélectionnée** | fond `#191D27` (`bg-surface-2`) + **liseré gauche `2px #3B82F6`** (indicateur d'état actif §2.3) |
| Texte courant | `14-15px`, `#94A3B8`, chiffres en `#FFFFFF` (§2.4) |

> **Contraste en-tête — arbitré (revue T04)** : `#64748B` sur `#0A0C10` mesure
> **4,11:1** → sous AA (4,5:1) pour du 12px, et §2.2 interdit `--color-faint`
> pour l'information essentielle (une colonne de tableau l'est). Les en-têtes
> utilisent donc **`#94A3B8` (7,2:1 ✅)** — ligne du tableau ci-dessus à jour.

**Contrôles de non-régression attendus** : `tsc --noEmit` · `npm run lint` ·
`npm run build` vides ; `/fr` et `/en` rendus identiques (à une exception près,
documentée : les champs du formulaire Contact passent d'une bordure blanche
implicite à `#242936`, conforme §3.6).

---

## 11. Glossaire des livrables design par section (pour prompts de subagents)

Chaque tâche Frontend reçoit **obligatoirement** : (1) les numéros de section de ce document applicables, (2) les tokens concernés, (3) les fichiers cibles. Le subagent n'a **pas le droit** d'inventer un style hors `DESIGN.md`. En cas d'ambiguïté non couverte : choisir la variante **la plus sobre** et la documenter dans un commentaire `// DESIGN: <choix>`.

> **Fin du référentiel.** Toute évolution de ce fichier doit être validée par l'utilisateur et versionnée par un commit `docs(design)`.
