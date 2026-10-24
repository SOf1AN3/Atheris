# PLAN.md — Plateforme ATHERIS LABS (CRM, commissions & portail client)

> **Statut : ✅ VALIDÉ par l'utilisateur le 24/10/2026 (feu vert accordé)** — exécution séquentielle autorisée.
> Version 1.1 — 24/10/2026 · Remplace l'ancien plan (landing page, livrée).
> **Compagnons obligatoires** : `structure.md` (théorie métier), `DESIGN.md` (charte design), **`TACHES.md` (détail exécutable des tâches)**.

---

## Contexte & besoin métier

**ATHERIS LABS** est une agence de développement multi-plateformes (Web, Mobile, Desktop) boostée à l'IA, à délais courts. Sa croissance repose sur une équipe de vente à la commission (Lead Generators + manager) et bientôt sur de la pub.

**Objectif de cette v1** : construire la **plateforme interne** qui transforme un prospect en client payant, en gérant automatiquement le pipeline commercial, les **devis, paiements et commissions** (barème progressif, plafond 25 %), et en donnant au **client un portail de suivi** (jalons, documents, factures, messagerie).

**Landing existante est livrée et ne doit pas régresser.** La plateforme s'ajoute à côté, avec le même design (`DESIGN.md`) et la même exigence i18n.

### Décisions validées par l'utilisateur

| Sujet | Décision |
|---|---|
| Base | **Neon (Postgres)** + **Drizzle ORM** |
| UI | **shadcn/ui** thématisé sur les tokens `DESIGN.md` (ink `#0A0C10`, surface `#14171F`, line `#242936`, accent `#3B82F6`) |
| Langue plateforme | **FR + EN dès la v1** (dictionnaires dédiés, distincts de la landing) |
| Paiements | **Saisie manuelle par le CEO** — zéro intégration Stripe en v1 |
| Devis | **Hors plateforme** (outil externe du CEO) + **PDF joint** au dossier + statuts gérés sur la plateforme |
| Barème vendeur | Paliers par cumul de clients payés : **0-4 → 10 % · 5-9 → 12,5 % · 10-19 → 15 % · 20+ → 20 %** |
| Plafond | **25 % max par deal** (part vendeur + 5 % manager Rayan confondus) → part CEO garantie ≥ 75 % |
| Rayan | **5 % fixes sur chaque deal** + part vendeur (barème) sur les prospects qu'il génère lui-même |
| Attribution | Dédoublonnage strict à l'ajout (email/téléphone) ; **le canal d'origine l'emporte** ; leads Ads = commission type LDG |
| Commissions | Déclencheur = devis signé **ET** acompte encaissé ; **aucune commission si non-signature** ; **aucun clawback** |
| Portail client | **Dans le périmètre initial** (invitation, jalons, documents, factures, messagerie) |
| Candidatures | Validation des inscriptions par le **CEO seul** — Rayan n'a **que la lecture** de la file |
| Formulaire landing | **Câblé au CRM** (T34 activé) : la landing crée des prospects source `landing` |

### Améliorations proposées des structures de pages (retenu dans ce plan)

1. **Séparation marketing / application par route groups** — la landing garde Header/Footer dans un groupe `(marketing)` ; l'espace connecté a son propre shell (sidebar + topbar) sans casser les URLs `/fr`, `/en`.
2. **Détail prospect en page + onglets** (et non en modale) : URL partageable, retour navigateur propre, utilisable sur mobile.
3. **Un seul composant « pipeline » réutilisé** par CEO / Manager / Commercial / Vendeur, avec colonnes et actions configurées par rôle → moins de code, UX homogène.
4. **Filtres dans l'URL** (statut, recherche, relance) : les vues se partagent et survivent au refresh.
5. **Dashboards = files d'action, pas des stats mortes** : le CEO voit en premier « 2 inscriptions à valider, 3 devis à envoyer, 4 commissions à payer ».
6. **Fiche projet en assistant 5 étapes** avec jauge de complétion (données partielles sauvegardées à chaque étape) plutôt qu'un formulaire géant.
7. **Espace vendeur pensé mobile** : ajout de prospect en 1 écran (3 champs), liste en cartes.
8. **Raison obligatoire** pour les statuts terminaux *Perdu / Disqualifié* → statistiques fiables.
9. **File « commission sans bénéficiaire »** côté CEO (ex. lead Ads sans responsable) — cas non prévu dans le brief initial.
10. **Toutes les pages d'espace en `noindex`**, et les statuts/couleurs de badge ajoutés au `DESIGN.md` avant usage (le `DESIGN.md` prime et doit être versionné `docs(design)`).

---

## Questions / décisions en attente

1. ~~Formulaire contact landing~~ → **VALIDÉ** : T34 est **dans le périmètre** (le formulaire crée un prospect source `landing`, sans bénéficiaire → file de commissions CEO).
2. ~~Validation des candidatures~~ → **VALIDÉ** : **CEO seul**, Rayan lecture seule (T11 vs T31).
3. ~~Paliers~~ → **VALIDÉ** : 0-4 / 5-9 / 10-19 / 20+ confirmés.
4. **Stockage des PDF** : solution retenue = **fichiers en base (bytea), 5 Mo max, servis par route handler authentifiée** (zéro service externe). Migration Vercel Blob notée en phase 2 si le volume grandit.
5. Non bloquants : domaine de prod, email/WhatsApp réels, contenu réel des espaces, `DATABASE_URL` Neon + `AUTH_SECRET` (à fournir en .env.local).

> **⚠ Règle d'exécution liée au `DATABASE_URL` (accord utilisateur)** : la chaîne Neon sera fournie **à la fin du plan**. En attendant, `.env.local` contient un placeholder : les tâches DB (T01, T02…) sont **écrites et relues normalement**, `drizzle-kit generate` (génération des fichiers de migration, sans connexion) est vérifié, mais **l'application des migrations sur Neon et toute requête DB réelle sont reportées** à la rubrique « Validation finale » (liste `DB-PENDING` ci-dessous) avant le passage de `Tester` (T36).
>
> **`DB-PENDING`** : T01 (vrai `db:migrate`), T02 (13 tables en base), T12 (seed), T14/T15 (anti-doublon réel, transitions réelles), T23 (génération commission réelle), T36 (E2E complet).

---

## 0. Architecture cible & conventions

### Arborescence (ajouts et déplacements)

```
src/
├── middleware.ts                  # locale (existant) + garde grossière des routes d'espace
├── auth.ts                        # config Auth.js v5 (credentials, JWT 7j, rôles)
├── lib/
│   ├── db/
│   │   ├── index.ts               # client Drizzle (Neon)
│   │   └── schema.ts              # 13 tables (§1.2)
│   ├── permissions.ts             # rôle → routes + actions autorisées (source de vérité RBAC)
│   ├── commission.ts              # barème progressif + plafond 25 % (pur, testé)
│   ├── prospect-dedup.ts          # normalisation email/téléphone
│   └── password.ts                # scrypt (Node crypto, zéro dépendance native)
├── actions/                       # Server Actions (une par domaine, "use server")
│   ├── auth.ts · profile.ts · prospects.ts · status.ts
│   ├── quotes.ts · payments.ts · commissions.ts
│   ├── invitations.ts · project.ts · messages.ts
├── content/platform/
│   ├── types.ts · fr.ts · en.ts   # dictionnaires de la plateforme (≠ landing)
├── app/[locale]/
│   ├── layout.tsx                 # racine : <html>, fonts, MotionConfig (Header/Footer sortis)
│   ├── (marketing)/               # landing : layout Header+Footer+JSON-LD, page, opengraph-image
│   ├── (auth)/                    # layout carte centrée (pas de header)
│   │   ├── connexion/page.tsx · inscription/page.tsx
│   ├── (app)/                     # layout shell (sidebar+topbar+garde rôle) — tout en noindex
│   │   ├── layout.tsx · page.tsx  # page = redirection vers l'espace du rôle
│   │   ├── tableau-de-bord/page.tsx
│   │   ├── prospects/page.tsx · prospects/nouveau/page.tsx · prospects/[id]/page.tsx
│   │   ├── commissions/page.tsx · equipe/page.tsx · projet/page.tsx · profil/page.tsx
├── components/app/                # shell, StatusBadge, ProspectTable, FilterBar, StatCard,
│                                  # EmptyState, ProspectWizard, MilestoneTimeline, AuditLog…
```

### Conventions

- TypeScript **strict**, `import type`, zéro `any`, zéro `@ts-ignore`.
- **Toute mutation passe par une Server Action** avec validation **Zod** + vérification de rôle **côté serveur** (le middleware ne fait qu'une garde grossière).
- Montants en **cents (entier)**, devise **USD uniquement** ; dates en **UTC** stockées, affichage `Africa/Algiers`.
- Tout texte visible vient de `src/content/platform/{fr,en}.ts` (comme la landing).
- Mots de passe : **scrypt** (Node crypto), format `salt:hash`, comparaison à temps constant.
- Composants serveur par défaut ; `"use client"` seulement pour les formulaires/filtres/tableaux interactifs.

---

## 1. Base de données (DB)

### 1.1 Mise en place — `Backend`

**Fichiers** : `drizzle.config.ts`, `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `.env.local` (`DATABASE_URL`, `AUTH_SECRET`), `package.json` (scripts `db:generate` / `db:migrate` / `db:seed`).
**Dépendances** : `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`.
**Critère « fait »** : `npm run db:migrate` crée les 13 tables sur Neon ; un `SELECT` de contrôle renvoie des lignes.

### 1.2 Schéma (13 tables) — `Backend`

| Table | Rôle | Champs clés |
|---|---|---|
| `users` | comptes | `email` unique, `password_hash`, `name`, `phone`, `role` (`ceo`/`manager`/`commercial`/`vendeur`/`client`), `status` (`pending`/`active`/`rejected`/`disabled`), `created_at` |
| `prospects` | pipeline | `full_name`, `company`, `email`, `phone`, **`email_norm` + `phone_norm` uniques** (dédoublonnage), `source` (`ldg`/`ads`/`landing`/`rayan`/`ceo`), `source_user_id`, `status` (10 statuts §structure.md), `disqualify_reason`, `next_reminder_at` |
| `prospect_briefs` | fiche projet 1-1 | 5 blocs (identité/contexte, besoin, contraintes, technique, suivi) + `completed_blocks` |
| `quotes` | devis | `prospect_id`, `amount_usd_cents`, `status` (`draft`/`sent`/`signed`/`lost`), `pdf_document_id`, `sent_at`, `signed_at`, `created_by` |
| `payments` | encaissements | `quote_id`, `label` (acompte/échéance), `amount_usd_cents`, `due_at`, `paid_at`, `method`, `created_by` |
| `commissions` | barème | `quote_id`, `beneficiary_id`, `kind` (`seller`/`manager`), `rate_percent` (snapshot), `base_cents`, `amount_cents`, `status` (`due`/`paid`), `paid_at` — **unique (`quote_id`,`beneficiary_id`,`kind`)** = anti-double-génération |
| `client_projects` | livraison | `quote_id`, `name`, `status` (`en_livraison`/`clos`) |
| `milestones` | 5 jalons | `project_id`, `order`, `key` (`cadrage`/`design`/`dev`/`recette`/`mise_en_ligne`), `status`, `validated_at`, `validated_by` |
| `documents` | PDF | `owner_type` (`prospect`/`project`), `owner_id`, `kind` (`devis`/`contrat`/`facture`/`livrable`), `filename`, `bytes` (bytea ≤ 5 Mo), `mime`, `uploaded_by` |
| `invitations` | portail client | `email`, `token` unique, `project_id`, `expires_at`, `used_at` |
| `activities` | journal/audit | `actor_id`, `action`, `entity_type`, `entity_id`, `meta` jsonb |
| `messages` | messagerie projet | `project_id`, `sender_id`, `body`, `read_at` |
| `login_attempts` | rate-limit | `email`, `ip`, `created_at` (≥ 5 échecs / 15 min → blocage) |

### 1.3 Règles métier encodées — `Backend`

- **Dédoublonnage** : normaliser (`email` → minuscules/trim ; `phone` → chiffres, `+213`/`00213` → `0`) puis contrainte unique → l'ajout d'un doublon **échoue côté DB**, message « prospect déjà existant ».
- **Machine à états** : les 10 statuts de `structure.md` §4.1 avec transitions autorisées par rôle (`src/lib/permissions.ts`), appliquées dans une transaction avec contrôle du statut attendu (anti-course).
- **Commissions** : à l'enregistrement d'un paiement **acompte** marqué payé → génère une ligne `seller` (taux du palier du vendeur **au moment du déclencheur**, figé en snapshot) + une ligne `manager` 5 % (Rayan), **si `beneficiary_id` nul → ligne créée avec bannière « sans bénéficiaire »** dans la file CEO. Contrainte unique = idempotence.
- **Paliers** : cumul des deals du vendeur ayant atteint `client_actif` **avant** ce deal (jamais rétroactif).

---

## 2. API Routes / Server Actions

### 2.1 Actions par domaine — `Backend`

| Fichier | Actions | Rôles autorisés |
|---|---|---|
| `actions/auth.ts` | connexion, déconnexion, rate-limit | public |
| `actions/profile.ts` | changer email / téléphone / mot de passe (**pas le nom**) | tout rôle authentifié |
| `actions/prospects.ts` | ajouter (anti-doublon), lire (scopé par rôle), filtrer | vendeur+ (ajout), lecture selon rôle |
| `actions/status.ts` | changer de statut + **raison obligatoire** si `perdu`/`disqualifie` | matrice §structure.md 4.2 |
| `actions/quotes.ts` | créer devis (montant TTC + PDF), statuts `draft→sent→signed/lost` | CEO uniquement |
| `actions/payments.ts` | enregistrer acompte/échéance, marquer payé → **déclenche commissions** | CEO uniquement |
| `actions/commissions.ts` | marquer payée(s) (individuel ou lot), historique | CEO uniquement |
| `actions/invitations.ts` | générer lien client (48 h), révoquer | CEO uniquement |
| `actions/project.ts` | valider un jalon, messages de projet | client (ses jalons) + CEO/commercial |
| `actions/audit.ts` | écriture systématique dans `activities` | interne |

### 2.2 Garde d'accès — `Backend`

- **Middleware** : présence du cookie de session sur `/[locale]/espace/*` et `/[locale]/connexion` (redirection propre) — garde *grossière*.
- **Layout `(app)`** : `auth()` serveur → rôle → redirige vers la page d'accueil du rôle.
- **Chaque Server Action** : `requireRole(...)` + `zod` + vérification d'appartenance (un vendeur ne lit/modifie que **ses** prospects ; un client ne lit que **son** projet).
- Toute la zone `(app)` : `robots: { index: false }`.

---

## 3. UI Components

### 3.1 Shell & primitives — `Frontend`

- **Shadcn/ui installé et re-thématisé** : mapping `background→ink`, `card→surface`, `border→line`, `primary→accent #3B82F6`, `destructive→#F87171`, `muted-foreground→#94A3B8` (radius 12/20 px conformes §2.6 DESIGN.md).
- **Ajout au `DESIGN.md`** (commit `docs(design)`, validation utilisateur) : palette des **statuts de badge** — `Nouveau` gris · `Contacté` bleu discret · `Qualifié` bleu · `Devis envoyé` ambre `#F59E0B` · `Signé` vert `#34D399` · `Perdu`/`Disqualifié` rouge `#F87171` + règles sidebar/tableau (fond `ink-2`, lignes `line`, hover `surface-2`, accent = sélection active uniquement).
- `AppShell` (sidebar par rôle + topbar : profil, switch FR/EN), `StatusBadge`, `ProspectTable`, `FilterBar` (état dans l'URL), `StatCard`, `EmptyState` (avec CTA), `ConfirmDialog`.

### 3.2 Pages par espace — `Frontend`

| Espace | Pages | Contenu clé |
|---|---|---|
| `(auth)` | `connexion`, `inscription` | formulaire Zod + RHF, erreurs i18n, inscription = **candidature en attente** |
| CEO | `tableau-de-bord`, `prospects`, `prospects/[id]`, `commissions`, `equipe`, `profil` | **files d'action** + KPIs ; détail = onglets (Identité · Fiche · Devis & paiements · Historique) ; file de versement en **lot** ; stats par employé (funnel + activité + rentabilité) ; journal d'audit |
| Manager | mêmes routes, vues scopées | classement des LDG, commissions de l'équipe, **lecture seule** des candidatures (validation = CEO seul), actions commerciales complètes |
| Commercial | `tableau-de-bord`, `prospects`, `prospects/[id]`, `profil` | pipeline complet, **assistant fiche projet 5 étapes**, relances du jour, plafond : actions jusqu'à `devis_envoye` |
| Vendeur | `tableau-de-bord`, `prospects`, `prospects/nouveau`, `commissions` (= mes gains), `profil` | **mobile-first** : ajout 1 écran, liste en cartes, **jauge de palier** (« 3/5 → 12,5 % »), ledger gains (en attente/versées) |
| Client | `projet`, `profil` | **timeline de 5 jalons en héros** + bouton « Valider cette étape », onglets Documents / Factures / Messagerie |

### 3.3 Intégration landing — `Frontend`

- Déplacement de `page.tsx` + `opengraph-image.tsx` + layout Header/Footer/JSON-LD dans `(marketing)` **sans changer les URLs** ; `sitemap.ts`/`robots.ts` inchangés.
- Ajout d'un lien **« Connexion »** discret dans le header landing (FR/EN) et « Espace client » dans le footer.

---

## 4. Tests

- **Unitaires (vitest)** : `lib/commission.ts` (paliers, plafond 25 %, idempotence, Rayan vendeur), `lib/prospect-dedup.ts` (normalisation), transitions de statut.
- **Statique** : `npm run lint` · `npx tsc --noEmit` · `npm run build` sans erreur.
- **E2E (Tester, Playwright)** : connexion par rôle, ajout anti-doublon, déclenchement commission à l'acompte, lot de versement, validation de jalon côté client, FR/EN, responsive 360/768/1440, non-régression de la landing.

---

## Sécurité & edge cases à couvrir

| Risque | Mesure |
|---|---|
| Escalade de rôle (client qui lit le pipeline) | RBAC `permissions.ts` vérifié **dans chaque Server Action** + tests E2E par rôle |
| Doublon de prospect en écriture concurrente | index unique `email_norm`/`phone_norm` → message propre |
| Double génération de commission (double clic/paiement) | contrainte unique `(quote_id, beneficiary_id, kind)` |
| Deal sans bénéficiaire (Ads sans responsable) | statut `due` + bannière « sans bénéficiaire » dans la file CEO |
| Commission sur deal annulé | **pas de clawback** (choix assumé) → note dans l'écran CEO avant paiement |
| Force brute connexion | table `login_attempts` : 5 échecs / 15 min par email+IP |
| Fichier malveillant | type/extension/taille vérifiés (PDF, ≤ 5 Mo), nom aléatoire, **téléchargement par route handler authentifiée** (jamais en public) |
| Statut modifié en double (2 onglets) | transaction avec `WHERE status = attendu` → erreur « recharger » |
| Course sur changement de statut | idem, + `activities` journalise l'auteur |
| Fuite de données entre vendeurs | scoping systématique `WHERE source_user_id = moi` |
| PII (coordonnées prospects) | accès scopé, `noindex`, pas d'export en v1 |
| Invitation client expirée/réutilisée | `expires_at` 48 h + `used_at` |
| Fuseau | stockage UTC, rendu `Africa/Algiers` (pas de comparaison de dates côté client) |

---

## Ordre d'exécution (séquentiel — détail dans `TACHES.md`)

| # | Tâche (titre explicite) | Agent | TACHES.md |
|---|---|---|---|
| 1 | T01 — Connecter Neon + Drizzle et créer la base locale/migrée | Backend | T01 |
| 2 | T02 — Créer les 13 tables du schéma (users, prospects, devis, paiements, commissions, jalons, documents…) + migration | Backend | T02 |
| 3 | T03 — Installer Auth.js v5 : connexion credentials, sessions JWT 7j, hachage scrypt | Backend | T03 |
| 4 | T04 — Installer shadcn/ui et mapper son thème sur les tokens DESIGN.md + ajouter la palette des statuts au DESIGN.md | Frontend | T04 |
| 5 | T05 — Restructurer les routes en groupes (marketing)/(auth)/(app) sans casser la landing `/fr` et `/en` | Frontend | T05 |
| 6 | T06 — Créer la couche i18n de la plateforme (types + dictionnaires FR/EN) | Frontend | T06 |
| 7 | T07 — Écrire la matrice RBAC (`permissions.ts`) et le middleware de garde des routes d'espace | Backend | T07 |
| 8 | T08 — Construire le shell de l'espace (sidebar par rôle, topbar, redirection rôle, noindex) | Frontend | T08 |
| 9 | T09 — Page de connexion (FR/EN) avec erreurs i18n et blocage après 5 échecs | Frontend | T09 |
| 10 | T10 — Page d'inscription candidature LDG → compte en attente de validation | Frontend | T10 |
| 11 | T11 — Espace CEO : valider ou refuser les candidatures (avec motif) | Frontend | T11 |
| 12 | T12 — Script de seed : comptes CEO + Rayan + prospects de démonstration | Backend | T12 |
| 13 | T13 — Page profil unifiée (email, téléphone, mot de passe — nom figé) | Frontend | T13 |
| 14 | T14 — Action serveur d'ajout de prospect avec anti-doublon (normalisation + index unique) | Backend | T14 |
| 15 | T15 — Machine à états des 10 statuts + journal d'audit (`activities`) + raison obligatoire sur statut terminal | Backend | T15 |
| 16 | T16 — Composant PipelineTable réutilisable (filtres URL, badges, colonnes/actions par rôle) | Frontend | T16 |
| 17 | T17 — Pages liste prospects scopées par rôle (vendeur : les siens, autres : tous) | Frontend | T17 |
| 18 | T18 — Page détail prospect en 4 onglets (Identité, Fiche, Devis & paiements, Historique) | Frontend | T18 |
| 19 | T19 — Assistant fiche projet en 5 étapes avec jauge de complétion | Frontend | T19 |
| 20 | T20 — Espace vendeur mobile-first : ajout 1 écran, liste en cartes, jauge de palier, ledger « mes gains » | Frontend | T20 |
| 21 | T21 — Espace CEO : création de devis (montant USD TTC + PDF joint) et avancement de ses statuts | Frontend | T21 |
| 22 | T22 — Encaissements CEO : acompte + échéances (saisie manuelle) avec confirmation explicite | Frontend | T22 |
| 23 | T23 — Moteur de commissions (barème progressif, plafond 25 %, snapshots, idempotence) + tests unitaires | Backend | T23 |
| 24 | T24 — Espace CEO : file de versement des commissions (individuel ou en lot) + historique | Frontend | T24 |
| 25 | T25 — Stockage & téléchargement sécurisé des PDF (devis, contrats, factures, livrables) | Backend | T25 |
| 26 | T26 — Portail client : invitations (lien 48 h) et activation du compte | Backend | T26 |
| 27 | T27 — Portail client : timeline des 5 jalons + validation d'étape en 1 clic | Frontend | T27 |
| 28 | T28 — Portail client : onglets Documents & Factures | Frontend | T28 |
| 29 | T29 — Portail client : messagerie projet avec accusé de lecture | Frontend | T29 |
| 30 | T30 — Dashboard CEO : KPIs globaux + 3 files d'action + stats par employé (funnel/activité/rentabilité) | Frontend | T30 |
| 31 | T31 — Espace Manager (Rayan) : classement des LDG + historique des commissions de l'équipe | Frontend | T31 |
| 32 | T32 — Dashboards Commercial (relances du jour) et Vendeur (palier + prospects) | Frontend | T32 |
| 33 | T33 — Passe a11y + responsive 360/768/1440 + états vides/chargement/erreur sur toute la plateforme | Frontend | T33 |
| 34 | T34 — Câbler le formulaire contact de la landing → prospect source `landing` (validé) | Backend | T34 |
| 35 | T35 — Qualité statique : lint + tsc + build production sans erreur | Backend | T35 |
| 36 | T36 — Validation E2E par rôle (Playwright) + non-régression de la landing | Tester | T36 |

**Règles d'exécution** : une tâche à la fois, prompt isolé (2-3 fichiers), `Reviewer` après chaque tâche Frontend/Backend, micro-commit Conventional Commits en français après `APPROUVE`, **aucun `git push`**. `REJETE` → correction puis revue ; 2 échecs identiques → escalade utilisateur.

---

## Validation finale (Reviewer → Tester)

1. Les 36 tâches (T01→T36) cochées et commitées.
2. `Reviewer` : diff complet conforme (RBAC serveur, zéro `any`, palette DESIGN.md, i18n FR/EN, landing non régressée).
3. `Tester` : E2E des 5 rôles + responsive + non-régression landing → rapport.
4. Synthèse utilisateur : fichiers créés, statut revues/tests, points restants (domaine, contenu réel, décision T34).
