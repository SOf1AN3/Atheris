# PLAN-404.md — Page 404 « design system réellement appliqué »

> **Statut : ✅ EXÉCUTÉ ET VALIDÉ** (feu vert Q1 = option A, Q2 = « débrouille-toi »).
> Version 1.1 — 30/10/2026 · `PLAN.md` (Lot 5 Meet) déjà en attente de validation → plan dédié ici.
>
> **Écarts d'exécution par rapport à la v1.0** :
> 1. La simple règle « ajouter `[locale]/not-found.tsx` » **ne suffit pas** : Next ne rend ce
>    fichier que si `notFound()` est appelé **dans** le segment ; une URL non appariée tombait
>    toujours sur le not-found racine (nu). Ajout du **catch-all déclencheur**
>    `src/app/[locale]/[...missing]/page.tsx` → `notFound()` (solution documentée Next.js /
>    discussions #50518, #48609).
> 2. `[locale]/not-found.tsx` est un **wrapper client distinct** (et non un simple
>    `export { default } from`) : le ré-export brut partageait la référence React du
>    not-found racine et le boundary imbriqué rendait un shell `__next_error__`.
> 3. **500 `next/font/google` sur `/fr` (Q2)** : corrigé en 2/2 tentatives par purge de
>    `.next` + `node_modules/.cache` (cache Turbopack corrompu). Aucun fichier touché.
> 4. **Limite connue (bug amont Next.js #99793/#100596, PR #98583)** : le HTML **serveur**
>    du 404 est un shell `__next_error__` ; le contenu design apparaît à l'hydratation
>    (identique pour TOUS les `notFound()` préexistants du projet). Statut HTTP **404** réel,
>    `noindex` présent. Corrigé en amont par Next, hors de notre main.
>
> **Livrable** : commit `315beb1` — 2 fichiers créés, 0 fichier existant modifié,
> 0 string/type/DB touché.

---

## Contexte & besoin métier

Demande : *« crée la page 404 not found avec le même design system que le projet »*.

**Constat d'audit (Phase 1, aucune modification effectuée)** :

1. La page 404 **existe déjà** — `src/app/not-found.tsx` (commit `492adb1`), avec le bon contenu
   FR/EN (`notFound.*` dans `src/content/fr.ts` / `en.ts`, type `NotFoundContent` dans
   `src/content/types.ts`), les bons composants (`Badge` pill, `Button` primary/ghost) et le
   motif « titre à deux voix » (`.voix`).
2. **Mais elle ne reçoit AUCUN design system** (vérifié par Playwright sur
   `http://localhost:3000/fr/zzz-page-inexistante` — HTTP 404 bien renvoyé) :
   - `document.documentElement` → `<html>` **sans `lang`, sans classes de polices** ;
   - `document.styleSheets.length` = 1 (aucun CSS projet), `link[rel=stylesheet]` = 0 ;
   - `body` → `background: transparent`, `color: black`, `font-family: "Times New Roman"` ;
   - `.hero-bg` présent mais **invisible** (tokens `bg-ink`/`text-fg` inexistants) ;
   - `.grain` **absent**.

**Cause racine** : le seul layout racine du projet fournit `<html>` + `globals.css` + les 3
variables de polices + `.grain`, et il vit dans **`src/app/[locale]/layout.tsx`**
(`import "../globals.css"`, `Inter_Tight` / `Instrument_Serif` / `JetBrains_Mono`).
Or `src/app/not-found.tsx` se trouve **au-dessus** de `[locale]` : Next le rend dans la
racine `app/` (il n'y a même pas de `src/app/layout.tsx`), donc **hors** du layout → zéro
CSS, zéro police, zéro token. La page « existe » mais est affichée en HTML nu.

Toute requête est d'abord localisée par le middleware (`src/middleware.ts` → 307 vers
`/{locale}…`), donc **pratiquement tous les 404 atterrissent sous `/{locale}/…`** : il suffit
d'exposer un `not-found` **dans** le segment `[locale]` pour que le design system s'applique.

**Effet de bord détecté (hors périmètre, à signaler)** : en dev, `/fr` et `/fr/connexion`
répondent **500** — `next/font/google` échoue (`Module not found: Can't resolve
'@vercel/turbopack-next/internal/font/google/font'`, Turbopack + réseau/polices Google).
C'est **antérieur** à cette demande (aucun fichier n'a été modifié) et indépendant de la 404.

## Questions / décisions en attente

- **Q1** — Périmètre : je propose l'option **A** ci-dessous (1 fichier nouveau + 1 fichier
  transformé en ré-export). Alternatives B/C décrites plus bas. *Votre choix ?*
- **Q2** — Le 500 « polices Google » sur `/fr` en dev : **hors périmètre** de ce lot
  (je m'arrête après 2 tentatives si je dois le traiter). *Voulez-vous un lot séparé ?*

---

## Options (décision Q1)

| Option | Fichiers | Avantage | Inconvénient |
|---|---|---|---|
| **A (recommandée)** — ajouter `src/app/[locale]/not-found.tsx` qui **ré-exporte** le composant existant | 1 nouveau + 1 édité | Le 404 est rendu dans `[locale]/layout.tsx` → `<html lang>`, polices, `globals.css`, tokens, `.grain` ** automatiquement ** ; contenu/strings inchangés ; risque quasi nul | Le 404 racine (URL sans locale, quasi inexistant car le middleware redirige) reste nu |
| B — déplacer le layout racine dans `src/app/layout.tsx` et alléger `[locale]/layout.tsx` | 2 fichiers (refactor layout) | Couvre aussi le 404 racine | Refactor risqué : `import "../globals.css"`, variables de polices, `MotionConfig`, `grain`, `dynamicParams=false`, `generateStaticParams` — touche **toutes** les pages |
| C — `redirect(`/${locale}/…`)` vers une route 404 dédiée | 3+ fichiers | — | Fausse URL en barre d'adresse, boucle potentielle, HTTP 200/307 au lieu de 404 → **rejetée** |

---

## 1. DB — aucun impact

Aucune table, migration, type ORM. **Piste DB non lancée.**

---

## 2. Backend / Routes — **sous-agent Backend** (1 tâche)

### 2.1 `src/app/[locale]/not-found.tsx` — **nouveau**
- Composant **serveur** minimal : ré-exporte le contenu de la page existante.
  `export { default } from "../not-found";` **ou**, si le bundler exige un composant local,
  un composant qui rend `<NotFound />` importé depuis `@/app/not-found`.
- JSDoc expliquant la **cause racine** : seul `[locale]/layout.tsx` fournit `<html>` +
  `globals.css` + polices, donc le `not-found` doit vivre **dans** ce segment pour hériter
  du design system (DESIGN §2.x / PLAN §4.3).
- **Aucune string ajoutée** : badge/titre/description/CTA viennent déjà de `notFound.*`
  (FR/EN gelés).
- **Fait =** `curl -I http://localhost:3000/fr/inexistant` → **404** ET le HTML contient
  `<html lang="fr" …>` + `.grain` + liens CSS projet.

### 2.2 `src/app/not-found.tsx` — **édité uniquement si nécessaire**
- Si 2.1 est un simple re-export : **ne pas toucher** au fichier (il reste le filet racine).
- Sinon : extraire la logique dans `src/app/not-found.tsx` (déjà en place) et ne changer
  que la signature d'import. **Interdiction** de modifier les strings ou le JSX visuel.

---

## 3. UI / Design system — **sous-agent Frontend** (1 tâche)

### 3.1 Contrôle de conformité `src/app/not-found.tsx` (lecture + micro-ajustement si besoin)
- Vérifier que la page utilise bien : `bg-ink`, `hero-bg`/`hero-nappe`/`floor`/`hero-vignette`,
  `Badge variant="pill"`, `h-display` + `TitleVoice` (`.voix`), `text-muted`, `Button`
  `primary`/`ghost` `size="lg"`, `micro`, grain hérité du layout.
- **Un seul `<h1>`**, `aria-hidden` sur les couches décoratives, cibles ≥ 44 px (déjà conformes).
- **Fait =** aucun nouveau hex/spacing hors tokens `globals.css`.

---

## 4. Tests — **sous-agent Tester** (fin de module)

- `GET /fr/page-qui-nexiste-pas` → 404 · `GET /en/nope` → 404 ·
  `GET /fr/invalide` via `notFound()` (route RBAC existante, ex. `/fr/espace/prospects/xxx` sans session → redirection, donc plutôt un cas RBAC dédié).
- Playwright : screenshot 404 FR + 404 EN → vérifier fond `#06070A`, titre serif italique
  sur « pas »/« exist », badge volt, absence de scroll horizontal, contraste ≥ 7:1.
- Régression : `/fr` (200 ou 500 **identique à l'avant-lot** — le 500 polices est connu/hors périmètre).

---

## Partition des fichiers

| Fichier | Piste |
|---|---|
| `src/app/[locale]/not-found.tsx` | Backend |
| `src/app/not-found.tsx` | Backend (2.2, conditionnel) / Frontend (3.1 contrôle) — **sérialisés** : Backend d'abord, Frontend ensuite |
| `src/content/{fr,en,types}.ts` | **aucun** (contenu gelé) |
| `src/app/[locale]/layout.tsx` | **aucun** (hors périmètre, option B refusée) |

## Contrats inter-pistes

- **Aucun nouveau type, aucune string.** Contrat existant inchangé :
  `NotFoundContent { code; title; description; primaryCta; secondaryCta }` (accent `*…*` autorisé sur `title`).
- Le 404 hérite de `[locale]/layout.tsx` : `<html lang={locale}>`, variables
  `--font-inter-tight` / `--font-instrument` / `--font-jetbrains`, `.grain`, `MotionConfig`.

## Ordre d'exécution

1. Backend (2.1, puis 2.2 si nécessaire) → commit `feat(ui): 404 herite du layout racine [locale]`
2. Frontend (3.1 contrôle, seulement si fichier touché) → commit sérialisé
3. Tester (E2E Playwright)

## Validation finale

Relecture AUTO-OK par sous-agent → vérification Lead du HTML 404 (`<html lang>`, CSS chargé,
`.grain`, contraste) → rapport synthétique + aucun `git push`.
