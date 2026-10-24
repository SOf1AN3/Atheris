# TACHES.md — Détail d'exécution des tâches (plateforme ATHERIS LABS)

> **Compagnon de `PLAN.md`** — chaque tâche y est numérotée `T01`…`T36`.
> **Règles générales pour l'exécutant** :
> 1. Une tâche à la fois, **prompt isolé** (2-3 fichiers maximum par tâche).
> 2. TypeScript strict : zéro `any`, zéro `@ts-ignore`, `import type` pour les types.
> 3. Tout texte visible vient de `src/content/platform/{fr,en}.ts` (jamais en dur dans le JSX).
> 4. Respecter `DESIGN.md` (tokens, radius, contrastes) — en cas de doute : **la variante la plus sobre**.
> 5. Chaque tâche est relue par le `Reviewer` puis **commitée** (`Conventional Commits`, français) avant la suivante.
> 6. Ne jamais modifier les fichiers d'une tâche déjà validée sans le signaler au Lead.

---

## PHASE A — Fondations techniques

### T01 — Connecter Neon + Drizzle ORM au projet
- **Agent** : Backend · **Dépendances** : aucune
- **Fichiers** : `drizzle.config.ts` (nouveau), `src/lib/db/index.ts` (nouveau), `.env.local` (local, ignoré par git), `package.json`
- **Étapes** :
  1. Créer un projet Neon, récupérer `DATABASE_URL` (ne pas committer la clé).
  2. Installer : `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`.
  3. Écrire `drizzle.config.ts` (dialect `postgresql`, `schema: "./src/lib/db/schema.ts"`, `out: "./drizzle"`).
  4. Écrire `src/lib/db/index.ts` : client Drizzle exporté (`drizzle(process.env.DATABASE_URL)`).
  5. Ajouter les scripts `db:generate`, `db:migrate`, `db:studio` dans `package.json`.
  6. Ajouter `DATABASE_URL` et `AUTH_SECRET` à `.gitignore` (`.env*` déjà couvert ? vérifier).
- **Critère « fait »** : `npm run db:migrate` s'exécute sans erreur (0 table pour l'instant) ; `db:studio` ouvre l'interface.

### T02 — Créer les 13 tables du schéma + migration initiale
- **Agent** : Backend · **Dépendances** : T01
- **Fichiers** : `src/lib/db/schema.ts` (nouveau), `drizzle/` (généré)
- **Étapes** :
  1. Écrire les tables (pg-core) dans cet ordre : `users`, `prospects`, `prospect_briefs`, `quotes`, `payments`, `commissions`, `client_projects`, `milestones`, `documents`, `invitations`, `activities`, `messages`, `login_attempts` — colonnes exactes du tableau §1.2 du `PLAN.md`.
  2. Enums (pgEnum) : `role` (`ceo`,`manager`,`commercial`,`vendeur`,`client`), `user_status` (`pending`,`active`,`rejected`,`disabled`), `prospect_status` (10 statuts), `source` (`ldg`,`ads`,`landing`,`rayan`,`ceo`), `quote_status` (`draft`,`sent`,`signed`,`lost`), `commission_status` (`due`,`paid`), `commission_kind` (`seller`,`manager`).
  3. Clés étrangères : `prospects.source_user_id → users`, `quotes.prospect_id`, `payments.quote_id`, `commissions.quote_id + beneficiary_id`, `milestones.project_id`, `messages.project_id`, etc.
  4. **Index uniques critiques** : `users.email` ; `prospects.email_norm` ; `prospects.phone_norm` ; `commissions (quote_id, beneficiary_id, kind)` ; `invitations.token`.
  5. Montants en **integer (cents)**, dates en `timestamp` UTC.
  6. `npm run db:generate` puis `db:migrate`.
- **Critère « fait »** : les 13 tables existent dans Neon (vérif SQL) ; relancer la migration ne casse rien.

### T03 — Installer Auth.js v5 : sessions, rôles, hachage scrypt
- **Agent** : Backend · **Dépendances** : T02
- **Fichiers** : `src/auth.ts` (nouveau), `src/auth.config.ts` (nouveau), `src/lib/password.ts` (nouveau), `src/actions/auth.ts` (nouveau), `src/types/next-auth.d.ts` (nouveau)
- **Étapes** :
  1. Installer `next-auth@beta`.
  2. `lib/password.ts` : `hashPassword()` / `verifyPassword()` via `crypto.scryptSync` (16 bytes salt aléatoire, format `salt$hash`, `timingSafeEqual`).
  3. `auth.ts` : provider **Credentials** (email + mot de passe → lecture `users` → vérif scrypt → refus si `status ≠ active`), strategy **JWT**, callbacks `jwt`/`session` qui injectent `id`, `role`, `name`.
  4. Étendre les types NextAuth (`role: Role`, `id: string`).
  5. `actions/auth.ts` : `login()` (avec **compteur `login_attempts`** : ≥5 échecs/15 min/email → message « Trop de tentatives, réessayez dans 15 min »), `logout()`.
  6. En cas de `status = pending|rejected` → message d'erreur dédié (« candidature en attente » / « candidature refusée »).
- **Critère « fait »** : un compte `active` se connecte et reçoit un cookie de session portant le rôle ; un compte `pending` est refusé avec le bon message ; le mot de passe n'est **jamais** stocké en clair (vérifier la colonne).

### T04 — Installer shadcn/ui et le thématiser selon DESIGN.md (+ palette statuts)
- **Agent** : Frontend · **Dépendances** : aucune (parallélisable avec T01-T03)
- **Fichiers** : `components.json` (généré), `src/app/globals.css`, `src/components/ui/*` (shadcn), `DESIGN.md`
- **Étapes** :
  1. `npx shadcn@latest init` (dark, Zinc, CSS variables, base path `@/components/ui`, alias `@/*`).
  2. Installer les composants : `button`, `input`, `label`, `textarea`, `select`, `table`, `card`, `badge`, `tabs`, `dialog`, `dropdown-menu`, `avatar`, `separator`, `skeleton`, `form` (react-hook-form + zod, déjà présents), `sonner` (toasts), `tooltip`, `sheet` (menu mobile).
  3. **Mapper les variables shadcn sur les tokens existants** (dans `globals.css`, ne pas toucher au `@theme` de la landing) : `--background:#0A0C10`, `--card:#14171F`, `--border:#242936`, `--primary:#3B82F6`, `--primary-foreground:#FFFFFF`, `--muted-foreground:#94A3B8`, `--destructive:#F87171`, radius `12px`.
  4. Vérifier que la landing n'a **aucune** régression visuelle (composants landing = tokens originaux).
  5. **`DESIGN.md`** : ajouter une section « §12 Palette des statuts de plateforme » (10 statuts → couleurs : gris/bleu discret/bleu/ambre `#F59E0B`/vert `#34D399`/rouge `#F87171`) + règles sidebar/tableau. Commit `docs(design)` (validation utilisateur).
- **Critère « fait »** : `npm run build` OK ; les composants shadcn rendent dark conforme ; landing identique avant/après ; `DESIGN.md` versionné.

### T05 — Restructurer les routes en groupes sans casser la landing
- **Agent** : Frontend · **Dépendances** : T04
- **Fichiers** : `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/opengraph-image.tsx` → déplacés
- **Étapes** :
  1. Créer `src/app/[locale]/(marketing)/` : y déplacer `page.tsx` et `opengraph-image.tsx`.
  2. Créer `src/app/[locale]/(marketing)/layout.tsx` qui reçoit le `Header`, le `Footer`, le JSON-LD et le skip-link (sortis du layout racine).
  3. Le **layout racine** garde uniquement : `<html lang>`, fonts Inter, `MotionConfig`, `<body>`, et `import "../globals.css"`.
  4. Créer `src/app/[locale]/(auth)/layout.tsx` (carte centrée sur fond ink, monogramme « A », **pas de header/footer**) avec placeholder `page.tsx` « Connexion » (le style fin viendra en T09).
  5. Créer `src/app/[locale]/(app)/layout.tsx` placeholder (children seulement, noindex — le shell complet en T08).
  6. Vérifier `generateStaticParams`/`dynamicParams` racine toujours valables ; les groupes n'affectent **pas** les URLs.
- **Critère « fait »** : `/fr`, `/en`, `/fr#contact`, sitemap, OG image, JSON-LD **identiques** (E2E rapide Playwright sur la landing) ; `/fr/connexion` rend la carte placeholder.

### T06 — Créer la couche i18n de la plateforme
- **Agent** : Frontend · **Dépendances** : T05
- **Fichiers** : `src/content/platform/types.ts`, `src/content/platform/fr.ts`, `src/content/platform/en.ts`, `src/i18n/platform-dictionaries.ts`
- **Étapes** :
  1. `types.ts` : type `PlatformContent` couvrant **tous** les libellés de la plateforme : nav sidebar (par rôle), pages (connexion, inscription, profil), statuts (10), colonnes de table, formulaires + messages d'erreur Zod, dashboards, portail client (jalons, documents, factures, messages), communes (enregistrer, annuler, aucune donnée…).
  2. `fr.ts` / `en.ts` avec `satisfies PlatformContent` (l'EN est une traduction business native, pas littérale).
  3. `platform-dictionaries.ts` : loader typé paresseux par locale (mécanisme identique à `src/i18n/dictionaries.ts` existant).
  4. Statuts : `statusLabels: Record<ProspectStatus, string>`.
- **Critère « fait »** : `tsc --noEmit` passe ; clé manquante = erreur de type ; zéro string FR/EN en dur ajoutée ailleurs.

### T07 — Écrire la matrice RBAC + middleware de garde
- **Agent** : Backend · **Dépendances** : T03, T06
- **Fichiers** : `src/lib/permissions.ts` (nouveau), `src/middleware.ts` (existant, enrichi)
- **Étapes** :
  1. `permissions.ts` : `HOME_BY_ROLE` (CEO→`/tableau-de-bord`, manager→`/tableau-de-bord`, commercial→`/tableau-de-bord`, vendeur→`/prospects`, client→`/projet`), `ROUTE_ACCESS` (map route prefix → rôles, ex. `/equipe` = ceo+manager, `/commissions` = ceo+vendeur, `/projet` = client), `canChangeStatus(fromRole, toStatus)` (matrice `structure.md` §4.2 : commercial plafonné à `devis_envoye`, vendeur **lecture seule**, CEO tout), `requireRole()` helper.
  2. `middleware.ts` : après la logique locale existante, si le chemin correspond à `/[locale]/espace/*` **et** que le cookie de session est absent → redirection 307 vers `/[locale]/connexion?callbackUrl=…`. **Garde grossière seulement** (pas de DB en edge) — le vrai contrôle est en layout + Server Actions.
  3. Inverser sur `/connexion` et `/inscription` : déjà connecté → redirection vers son `HOME_BY_ROLE`.
- **Critère « fait »** : `/fr/espace/prospects` sans cookie → connexion ; Test de non-régression locale : la landing ne redirige jamais (vérifier les cas `/`, `/xx`).

### T08 — Construire le shell de l'espace connecté
- **Agent** : Frontend · **Dépendances** : T06, T07
- **Fichiers** : `src/app/[locale]/(app)/layout.tsx`, `src/components/app/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `src/app/[locale]/(app)/page.tsx`
- **Étapes** :
  1. Layout `(app)` : `export const dynamic = "force-dynamic"` ; session serveur via `auth()` ; **403/redirect** si rôle non autorisé pour la route courante (via `ROUTE_ACCESS`) ; `robots: { index: false, follow: false }`.
  2. `Sidebar` : items filtrés par rôle (tableau ci-dessous), item actif = fond `surface-2` + point/accent `#3B82F6` (règle accent DESIGN.md §2.3), logo monogramme en haut, collapse mobile en `Sheet` (menu hamburger, focus trap, `Escape`, verrou scroll — cf. DESIGN.md §4.11).
  3. `Topbar` : switch FR/EN (conserve le chemin), menu avatar (profil, déconnexion), hauteur 64-72px, sticky glass léger cohérent avec le header landing.
  4. `(app)/page.tsx` : `redirect(HOME_BY_ROLE[session.role])`.
  5. Items par rôle : **CEO** tableau-de-bord · prospects · commissions · équipe · profil — **Manager** tableau-de-bord · prospects · commissions (équipe) · équipe · profil — **Commercial** tableau-de-bord · prospects · profil — **Vendeur** prospects · nouveau prospect · gains · profil — **Client** projet · profil.
- **Critère « fait »** : chaque rôle ne voit **que** ses items ; cliquer un item interdit (URL forcée) → redirection ; mobile 360px utilisable.

### T09 — Page de connexion (FR/EN)
- **Agent** : Frontend · **Dépendances** : T03, T06, T08
- **Fichiers** : `src/app/[locale]/(auth)/connexion/page.tsx`, `src/components/app/ LoginForm.tsx`
- **Étapes** :
  1. Formulaire React Hook Form + Zod (`email` valide, `password` min 8) ; labels réels ; erreurs `aria-invalid` + `aria-describedby` (DESIGN.md §3.6).
  2. Soumission → Server Action `login()` → redirection `callbackUrl` ou `HOME_BY_ROLE` ; erreurs i18n : identifiants invalides / compte en attente / compte refusé / blocage 15 min.
  3. États : idle → submitting (bouton `opacity-70`, désactivé) → erreur/succès ; toast `sonner` si erreur serveur.
  4. Lien « Pas encore de compte ? Candidater comme Lead Generator » → `/inscription`.
- **Critère « fait »** : connexion OK pour les 5 rôles en FR et EN ; messages d'erreur testés (mauvais MDP, pending, rate-limit) ; clavier + lecteur d'écran OK.

### T10 — Page d'inscription (candidature LDG) → compte en attente
- **Agent** : Frontend · **Dépendances** : T03, T06
- **Fichiers** : `src/app/[locale]/(auth)/inscription/page.tsx`, `src/actions/profile.ts` (création), `src/components/app/CandidateForm.tsx`
- **Étapes** :
  1. Champs : **nom complet** (figé après création), email, téléphone, mot de passe + confirmation (règles affichées), case d'acceptation « je comprends que ma candidature est validée manuellement ».
  2. Server Action `applyAsCandidate()` : validation Zod stricte, **anti-doublon email** (409 « un compte existe déjà »), création `users` avec `role='vendeur'`, `status='pending'`, `source` du compte non définie ici.
  3. Écran de confirmation : « Votre candidature a été transmise. Vous recevrez l'accès après validation. » (pas d'email en v1 → le CEO génère manuellement l'accès ; le texte doit rester honnête).
  4. Honeypot `company_website` (cohérent avec la landing).
- **Critère « fait »** : le compte apparaît dans la file de validation CEO avec `pending` ; double email refusé ; zéro accès avant validation.

### T11 — Espace CEO : valider ou refuser les candidatures
- **Agent** : Frontend · **Dépendances** : T10, T08
- **Fichiers** : `src/app/[locale]/(app)/equipe/page.tsx` (section candidatures), `src/actions/profile.ts` (décision)
- **Étapes** :
  1. Liste des `users.status='pending'` : nom, email, téléphone, date de candidature.
  2. Actions : **Approufer** (→ `active`) / **Refuser** (→ `rejected` + **motif obligatoire**, stocké dans `activities`), chacune avec `ConfirmDialog`.
  3. Déjà décidé → affichage du statut + date + motif (journal).
  4. Le même écran listera les vendeurs actifs avec leurs stats (branché en T30/T31 — structurez les composants pour le réutiliser).
- **Critère « fait »** : un candidat approuvé peut se connecter immédiatement (T09) ; un refusé est bloqué avec message ; décision journalisée.

### T12 — Script de seed : comptes de base + données de démo
- **Agent** : Backend · **Dépendances** : T02, T03
- **Fichiers** : `src/lib/db/seed.ts` (nouveau), script `db:seed` dans `package.json`
- **Étapes** :
  1. Créer idempotent (upsert sur email) : **CEO** (email, MDP fort, `role='ceo'`, `active`), **Rayan** (`role='manager'`), 2 vendeurs de démo, 1 commercial, 1 client de démo.
  2. Données de démo : 6 prospects répartis sur les 10 statuts, 1 fiche projet remplie, 1 devis `signed`, 1 acompte payé → **vérifier que les commissions générées existent et sont correctes** (moteur T23 branché, sinon insérer les lignes attendues comme assert de plus tard).
  3. Ne jamais tourner en production sans confirmation (garder `SEED_DEMO=1` en env).
- **Critère « fait »** : `npm run db:seed` ×2 ne duplique rien ; on peut se connecter avec chaque compte de démo.

### T13 — Page profil unifiée (tous rôles)
- **Agent** : Frontend · **Dépendances** : T06, T08
- **Fichiers** : `src/app/[locale]/(app)/profil/page.tsx`, `src/actions/profile.ts`
- **Étapes** :
  1. 3 blocs : **Email** (changement + confirmation mot de passe actuel), **Téléphone**, **Mot de passe** (actuel + nouveau ×2, règle affichée). **Nom en lecture seule** (« le nom n'est pas modifiable »).
  2. Server Action `updateProfile()` : Zod, vérif mot de passe pour email/MDP, anti-doublon email, `activities` à chaque changement.
  3. Changement d'email → garde-fou : l'ancien email ne doit plus être réutilisable, le nouveau doit être unique.
  4. Section « Rôle et statut » en lecture seule.
- **Critère « fait »** : les 3 modifications fonctionnent pour les 5 rôles ; mauvais mot de passe → erreur propre ; nom non éditable.

---

## PHASE B — Cœur du pipeline

### T14 — Ajout de prospect avec anti-doublon (serveur)
- **Agent** : Backend · **Dépendances** : T02, T07
- **Fichiers** : `src/lib/prospect-dedup.ts`, `src/actions/prospects.ts`
- **Étapes** :
  1. `normalizeEmail()` (trim + minuscules) et `normalizePhone()` (strip espaces/`+`/tirets, `+213`/`00213`/`213` → `0`, chiffres seulement) + tests unitaires (vitest) : 6 cas limites (format algérien, international, vide).
  2. `createProspect()` : Zod (`full_name` min 2, `company` optionnel, `email` valide, `phone` min 6, honeypot) ; `source_user_id = moi`, `source` selon le rôle (vendeur→`ldg`, manager/commercial→`rayan`…sauf si prospect Ads), `status='nouveau'`.
  3. **Avant insert** : SELECT sur `email_norm` OU `phone_norm` → si trouvé, réponse `{ error: 'duplicate', existing: { name, status, owner } }` (sans ficher les coordonnées complètes si le propriétaire est un autre vendeur).
  4. **Filet final** : attraper l'erreur d'index unique (course) → même message.
  5. Écrire dans `activities` (`action='prospect.created'`).
- **Critère « fait »** : doublon exact ET doublon `+213…`/`0…` refusés (tests verts) ; ajout valide OK et journalisé.

### T15 — Machine à états des 10 statuts + raison obligatoire + audit
- **Agent** : Backend · **Dépendances** : T07, T14
- **Fichiers** : `src/actions/status.ts`, extension `src/lib/permissions.ts`
- **Étapes** :
  1. Table de transitions : `nouveau→contacte|disqualifie`, `contacte→qualifie|disqualifie`, `qualifie→devis_envoye|perdu|disqualifie`, `devis_envoye→signe|perdu`, `signe→client_actif|perdu` (perte avant acompte), `client_actif→en_livraison`, `en_livraison→clos`. **Interdire tout retour arrière** sauf `perdu`/`disqualifie` depuis les états actifs.
  2. Autorisations par rôle (matrice T07) : vendeur **aucun droit d'écriture** ; commercial jusqu'à `devis_envoye` ; CEO/commercial peuvent marquer `perdu`/`disqualifie` ; `devis_envoye`→`signe` et `signe`→`client_actif` = **CEO seul**.
  3. `changeProspectStatus({id, to, expectedFrom, reason?})` : **transaction** `UPDATE … WHERE id AND status = expectedFrom` → 0 ligne = conflit (« ce prospect a changé, rechargez ») ; `reason` **obligatoire** si `perdu`/`disqualifie` (Zod superRefine).
  4. Écriture `activities` (`from`, `to`, `reason`, `actor`).
- **Critère « fait »** : chaque transition interdite → 403/erreur ; raison manquante sur statut terminal → refus ; double clic concurrent → message de rechargement, pas d'état corrompu.

### T16 — Composant PipelineTable réutilisable (filtres URL + badges)
- **Agent** : Frontend · **Dépendances** : T06, T15
- **Fichiers** : `src/components/app/PipelineTable.tsx`, `StatusBadge.tsx`, `FilterBar.tsx`, `src/lib/status-meta.ts`
- **Étapes** :
  1. `StatusBadge` : couleur par statut selon `DESIGN.md` §12, `micro` 12px, contraste AA vérifié.
  2. `FilterBar` : chips de statut multi-sélection + champ recherche (nom/entreprise/email) + tri date — **état écrit dans l'URL** (`useSearchParams`, debounce 300 ms) ; les filtres survivent au refresh et se partagent.
  3. `ProspectTable` (shadcn `Table`) : colonnes Nom · Entreprise · Statut · Source · Dernière activité · (Relance si droits) ; lignes cliquables → `/prospects/[id]` ; **colonnes et actions rendues selon le rôle** (props `capabilities`).
  4. Mobile < 768 px : passage en cartes (pas de scroll horizontal), tap targets ≥ 44 px.
  5. États : skeleton au chargement, `EmptyState` avec CTA contextual (vendeur → « Ajouter un prospect »).
- **Critère « fait »** : 1 composant sert les 4 rôles ; filtres dans l'URL testés (refresh conserve) ; 360 px sans overflow.

### T17 — Pages liste prospects scopées par rôle
- **Agent** : Frontend · **Dépendances** : T16
- **Fichiers** : `src/app/[locale]/(app)/prospects/page.tsx`, `src/actions/prospects.ts` (lecture)
- **Étapes** :
  1. `listProspects(filters, viewer)` : **scoping serveur** — vendeur → `source_user_id = moi` ; CEO/manager/commercial → tous ; client → **jamais** (403).
  2. Server component pour les données, `PipelineTable` en client pour les filtres.
  3. Compteur par statut au-dessus de la table (adapté au périmètre du rôle).
  4. Lien « Ajouter » visible seulement si droits d'écriture.
- **Critère « fait »** : un vendeur n'apparaît **jamais** dans les résultats d'un autre (test 2 comptes) ; filtres + pagination (20/page) OK.

### T18 — Page détail prospect en 4 onglets
- **Agent** : Frontend · **Dépendances** : T17, T15
- **Fichiers** : `src/app/[locale]/(app)/prospects/[id]/page.tsx`, `components/app/prospect/` (`IdentityTab`, `BriefTab`, `DealsTab`, `HistoryTab`, `StatusActions.tsx`)
- **Étapes** :
  1. En-tête : nom, entreprise, **StatusBadge + sélecteur de transition** (options = transitions autorisées pour mon rôle ; sinon statut en lecture seule avec info-bulle « Réservé au CEO »), créateur/source/date.
  2. Onglet **Identité** : coordonnées (avec `mailto:`/`tel:`), propriétaire.
  3. Onglet **Fiche** : récap des 5 blocs (lien « Éditer » → assistant T19) + jauge de complétion.
  4. Onglet **Devis & paiements** : devis liés (montant TTC USD, statut, PDF si présent), échéancier, boutons CEO (créer devis / encaisser — désactivés pour les autres rôles avec libellé explicite).
  5. Onglet **Historique** : timeline `activities` (action, auteur, date, raison si statut).
  6. 404 propre si prospect inexistant / non accessible au rôle.
- **Critère « fait »** : le sélecteur n'expose que les transitions légales par rôle ; historique complet ; 404/cloisonnement testés.

### T19 — Assistant fiche projet en 5 étapes
- **Agent** : Frontend · **Dépendances** : T18, T06
- **Fichiers** : `src/app/[locale]/(app)/prospects/[id]/fiche/page.tsx`, `components/app/prospect/BriefWizard.tsx` (+ 5 `*Step.tsx`), `src/actions/prospects.ts` (upsert brief)
- **Étapes** :
  1. 5 étapes = les 5 blocs de `structure.md` §5.1 : **Prospect/Contexte** (nom, entreprise, poste, canal) · **Besoin** (problème, type produit, périmètre, utilisateurs) · **Contraintes** (délai, budget 4 tranches, décideurs, références) · **Technique** (tech imposées, intégrations, hébergement, sécurité) · **Suivi** (prochaine étape + date de relance, notes).
  2. Champs : un composant `Field` réutilisé (label toujours visible, erreur `aria-describedby` — DESIGN.md §3.6) ; select `type de produit` aligné sur les catégories de la landing (Web & SaaS / Mobile / Desktop / Modernisation & Cloud / Autre).
  3. **Sauvegarde par étape** (`saveBriefBlock()` Zod par bloc → table `prospect_briefs`) + jauge « 3/5 blocs renseignés » ; retour à l'étape précédente sans perte.
  4. À 5/5 : marque `completed_blocks`, badge « Prêt pour devis » sur la page détail (état `qualifié` atteint côté commercial).
- **Critère « fait »** : quitter en cours de route ne perd rien ; jauge cohérente ; étapes navigables au clavier.

### T20 — Espace vendeur mobile-first (ajout 1 écran + gains)
- **Agent** : Frontend · **Dépendances** : T14, T16
- **Fichiers** : `src/app/[locale]/(app)/prospects/nouveau/page.tsx`, `src/app/[locale]/(app)/commissions/page.tsx` (vue vendeur), `components/app/vendor/` (`AddProspectForm`, `TierGauge`, `EarningsLedger`)
- **Étapes** :
  1. **Ajout** : 1 formulaire court (nom/entreprise, email, téléphone, note optionnelle) en pleine largeur, gros champs (48px), bouton plein écran ; succès → toast + lien « Voir le prospect » ; doublon → message clair (T14).
  2. La liste du vendeur réutilise `PipelineTable` en **mode cartes** par défaut sur mobile.
  3. **`TierGauge`** : jauge « Clients payés : 3/5 → prochain palier 12,5 % » (paliers 0-4/5-9/10-19/20+, plafond 25 %) — données via `src/lib/commission.ts` (`getTier()`), texte i18n.
  4. **`EarningsLedger`** : tableau Mes gains = `commissions` où `beneficiary_id = moi` (montant, deal, statut `due`/`paid`, date) + totaux (en attente / versé).
- **Critère « fait »** : ajout utilisable à 360 px en une vue ; jauge correcte aux 4 paliers ; ledger = montants exacts.

---

## PHASE C — Devis, encaissements, commissions

### T21 — Espace CEO : création de devis (USD TTC + PDF) et statuts
- **Agent** : Frontend · **Dépendances** : T18, T25
- **Fichiers** : `src/app/[locale]/(app)/prospects/[id]/devis/page.tsx` (ou dialog dans l'onglet Devis), `src/actions/quotes.ts`
- **Étapes** :
  1. Formulaire : montant **USD TTC** (saisie décimale → stockage cents via helper `toCents()`), référence externe de l'outil de devis (texte libre), **upload PDF** (type/ taille — helper T25), statut initial `draft`.
  2. Transitions CEO uniquement : `draft → sent` (« Devis envoyé »), `sent → signed` (« Signé »), `sent → lost` (motif obligatoire → rétrograde aussi le prospect `perdu`).
  3. `signed` → **bascule le prospect en `signe`** (T15) dans la même transaction.
  4. Zone rouge : rappel « Pas de clawback : commission définitive dès l'acompte » affiché avant `signed`.
- **Critère « fait »** : un devis `signed` met le prospect à `signé` ; rôle non-CEO refusé ; PDF illisible sans droits (T25).

### T22 — Encaissements CEO (acompte + échéances, saisie manuelle)
- **Agent** : Frontend · **Dépendances** : T21
- **Fichiers** : `src/app/[locale]/(app)/prospects/[id]/encaissements/page.tsx` (ou onglet), `src/actions/payments.ts`
- **Étapes** :
  1. Créer des échéances (`label`: Acompte, Échéance 1…, montant, `due_at`) sur un devis `sent`/`signed`.
  2. « Marquer payé » (CEO) : champs `paid_at` (aujourd'hui par défaut), méthode (Virement/PayPal/CIB/Autre), note → **transaction** : `payments.paid_at` + si label = acompte et prospect `signe` → **appel du moteur de commissions (T23)** + prospect → `client_actif` + `activities`.
  3. Confirmation explicite avant déclencheur : « Encaisser 1 500 USD ? Cette action générera les commissions (barème en vigueur). »
  4. Déclencheur **idempotent** : si les commissions du devis existent déjà → rien (contrainte unique).
- **Critère « fait »** : 1er encaissement → commissions générées + prospect `client_actif` ; 2e clic → aucune doublon ; non-CEO refusé.

### T23 — Moteur de commissions + tests unitaires
- **Agent** : Backend · **Dépendances** : T02, T12
- **Fichiers** : `src/lib/commission.ts` (pur), `src/lib/commission.test.ts`, `src/actions/commissions.ts` (génération)
- **Étapes** :
  1. `getTier(paidCount)` → `{ rate: 10 | 12.5 | 15 | 20 }` pour 0-4 / 5-9 / 10-19 / 20+.
  2. `computeDealShares({ dealCents, sellerRate, managerRate = 5 })` → lignes seller + manager avec **arrondi au centime** ; garde-fou : si `sellerRate + managerRate > 25` → **capped à 25 %** (seller rate réduit) ; assert part CEO ≥ 75 %.
  3. `generateCommissionsForQuote(quoteId, db)` **en transaction** : `paidCount` = deals du vendeur déjà `client_actif` (avant ce deal) → `getTier()` → snapshot `rate_percent` figé ; lignes `seller` (`beneficiary = source_user_id`) et `manager` (`beneficiary = manager`, Rayan). Cas **sans bénéficiaire** (`source_user_id` null, ex. Ads) → ligne créée avec `beneficiary_id` null (column nullable) + flag `needs_assignment`.
  4. Rayan comme **vendeur** : il reçoit les deux lignes (seller au barème + manager 5 %) → garde-fou 25 % appliquée.
  5. Tests vitest (≥ 10 cas) : paliers, arrondis, plafond, Rayan vendeur, sans bénéficiaire, idempotence, deal à 0 cent, très gros deal.
- **Critère « fait »** : `npx vitest run` vert ; couverture des cas ci-dessus ; aucune écriture DB dans les fonctions pures.

### T24 — Espace CEO : file de versement des commissions (individuel + lot)
- **Agent** : Frontend · **Dépendances** : T23, T21
- **Fichiers** : `src/app/[locale]/(app)/commissions/page.tsx`, `components/app/commission/` (`CommissionQueue`, `CommissionHistory`), `src/actions/commissions.ts` (versement)
- **Étapes** :
  1. **File `due`** : checkbox multi-sélection, colonnes Bénéficiaire · Deal · Base TTC · Taux (snapshot) · Montant · Générée le · badge « Sans bénéficiaire » (action d'affectation à un vendeur).
  2. Actions : « Marquer versée » **individuelle ou en lot** (`ConfirmDialog` avec total) → `status='paid'`, `paid_at`, `paid_by`, `activities`.
  3. Rappel non-blocking avant versement : « Pas de clawback — versement définitif ».
  4. **Historique `paid`** avec filtres (bénéficiaire, période) + totaux.
  5. Stats mini-têtes : total dû / versé / nombre de deals concernés.
- **Critère « fait »** : lot de 3 → 3 lignes `paid` cohérentes + total exact ; bannière sans-bénéficiaire visible ; rôle non-CEO refusé.

### T25 — Stockage & téléchargement sécurisé des PDF
- **Agent** : Backend · **Dépendances** : T02
- **Fichiers** : `src/lib/documents.ts`, `src/actions/documents.ts`, `src/app/api/documents/[id]/route.ts`
- **Étapes** :
  1. `uploadDocument(file, ownerType, ownerId, kind)` : type MIME **`application/pdf`** (magic bytes `%PDF` vérifiés, pas seulement l'extension), taille ≤ 5 Mo, nom aléatoire stocké, `uploaded_by`.
  2. Stockage `bytes` en base (bytea) — noter en commentaire la migration Vercel Blob (phase 2).
  3. `GET /api/documents/[id]` : session requise + **droit vérifié** (le document appartient à un prospect/projet accessible au rôle — un vendeur étranger ou un autre client → 403), `Content-Type: application/pdf`, `Content-Disposition: attachment`.
  4. Chiffrement/anti-hotlink non requis en v1 (zone privée authentifiée) — documenter.
- **Critère « fait »** : upload JPG → refusé ; 6 Mo → refusé ; URL sans session → 403 ; droit d'un autre vendeur → 403 ; PDF valide téléchargeable par le bon rôle.

---

## PHASE D — Portail client

### T26 — Invitations client (lien 48 h) + activation
- **Agent** : Backend · **Dépendances** : T03, T21
- **Fichiers** : `src/actions/invitations.ts`, `src/app/[locale]/(app)/invitation/page.tsx` (génération CEO), `src/app/[locale]/(auth)/invitation/[token]/page.tsx` (activation publique)
- **Étapes** :
  1. CEO : sur un prospect `client_actif` → « Générer l'accès client » : email + nom → crée `users` (`role='client'`, `status='active'`) + `invitations` (token 32 bytes hex, `expires_at = +48 h`), affiche le **lien à copier** (pas d'email en v1 — afficher honnêtement « envoyez ce lien au client »).
  2. Page publique `/invitation/[token]` : token invalide/expiré/utilisé → écran d'erreur propre ; valide → choix du mot de passe (scrypt) → `used_at` rempli → connexion auto → `/espace/projet`.
  3. Le client est lié au `client_projects` du devis signé (colonnes `project_id` sur `users` ou table de lien — choisir `users.default_project_id`).
  4. Toute génération/réutilisation → `activities`.
- **Critère « fait »** : lien expiré refusé, réutilisation refusée, activation → accès au **bon** projet uniquement.

### T27 — Portail client : timeline des 5 jalons + validation en 1 clic
- **Agent** : Frontend · **Dépendances** : T26, T02
- **Fichiers** : `src/app/[locale]/(app)/projet/page.tsx`, `components/app/client/MilestoneTimeline.tsx`, `src/actions/project.ts`
- **Étapes** :
  1. Hero : nom du projet, **timeline horizontale** (desktop) / verticale (mobile) des 5 jalons (`Cadrage → Design → Développement → Recette → Mise en ligne`) réutilisant le pattern visuel du §4.7 PROCESS de la landing : pastilles numérotées, filet `line`, étape courante accent, étapes faites `success`, à venir `muted`.
  2. Chaque étape : titre, statut, description (i18n), et si `en_cours` → **bouton « Valider cette étape »** (client) → `project.ts:validateMilestone()` : uniquement si `milestone.project_id = mon projet` → `validated_at/by`, avance `en_cours` vers la suivante.
  3. Cases terminales : premier jalon ne peut être validé que si `project.status = en_livraison` ; dernière validation → propose au CEO de clore (bouton CEO ailleurs).
  4. Accompagnement : bloc « Factures à jour » résumé + dernier message (liens vers onglets).
- **Critère « fait »** : un client ne valide que **ses** jalons ; séquence non sautable ; timeline lisible à 360 px.

### T28 — Portail client : onglets Documents & Factures
- **Agent** : Frontend · **Dépendances** : T25, T26
- **Fichiers** : `src/app/[locale]/(app)/projet/page.tsx` (onglets), `components/app/client/DocumentsPanel.tsx`, `InvoicesPanel.tsx`, `src/actions/project.ts` (lecture)
- **Étapes** :
  1. **Documents** : liste des `documents` du projet + du prospect (devis signé, contrat, livrables), icône, nom, date, taille → téléchargement via `/api/documents/[id]` (T25). Upload côté client pour pièces du brief ? **Non en v1** (lire seulement + messagerie).
  2. **Factures** : échéancier `payments` du devis (label, montant, échéance, statut payé/à venir) — lecture seule pour le client ; total payé / restant.
  3. États vides i18n (« Aucun document pour le moment »).
- **Critère « fait »** : le client ne voit que les documents/factures de **son** projet (test cross-client → 403) ; téléchargement OK.

### T29 — Portail client : messagerie projet
- **Agent** : Frontend · **Dépendances** : T26, T06
- **Fichiers** : `src/app/[locale]/(app)/projet/page.tsx` (onglet), `components/app/client/Thread.tsx`, `MessageForm.tsx`, `src/actions/messages.ts`
- **Étapes** :
  1. `postMessage({ projectId, body })` : Zod (min 1, max 2000), appartenance au projet vérifiée (client = son projet ; CEO/commercial = tout projet).
  2. Fil chronologique : bulles `surface`/`surface-2` par rôle (client = à gauche, équipe = à droite — ou alternance sobre), avatar typographique (règle DESIGN.md §4.8), date `Africa/Algiers`.
  3. **Accusé de lecture** : `read_at` rempli quand l'autre rôle ouvre l'onglet (mise à jour 1 fois, idempotente) + pastille « non lu ».
  4. Pas de temps réel en v1 : rechargement + note honnête ; `revalidatePath` après envoi.
- **Critère « fait »** : l'envoi s'affiche, le compte adverse voit la pastille, un client d'un autre projet reçoit 403.

---

## PHASE E — Dashboards & pilotage

### T30 — Dashboard CEO : KPIs + files d'action + stats par employé
- **Agent** : Frontend · **Dépendances** : T11, T17, T24, T12
- **Fichiers** : `src/app/[locale]/(app)/tableau-de-bord/page.tsx`, `components/app/dashboards/CeoDashboard.tsx`, `src/actions/dashboard.ts`
- **Étapes** :
  1. **Ordre d'affichage = ordre d'action** : 1) **Files d'action** : « N candidatures à valider » (→ équipe), « N devis envoyés sans réponse depuis 7 j » (→ prospects), « N commissions dues » (→ commissions), « N relances prévues aujourd'hui ». 2) **KPIs** : CA encaissé (mois), pipeline en valeur (somme des devis `sent`), taux de conversion (`nouveau→client_actif`), commissions dues/versées. 3) **Activité récente** (5 dernières `activities`).
  2. **Stats par employé** (tableau dépliable par ligne) : colonnes = Funnel (ajoutés · qualifiés · signés · conversion %) | Activité (relances faites, dernières connexions — source `activities`/`login_attempts` agrégés) | Rentabilité (CA généré · commissions coûtées · **marge = CA − commissions**).
  3. Agrégats SQL côté serveur (`sql` Drizzle), une seule requête optimisée par bloc.
  4. Fuseau `Africa/Algiers`, montants USD formatés (`Intl.NumberFormat`).
- **Critère « fait »** : les 3 blocs remplis avec la donnée seed ; clic sur une file d'action → bonne page avec filtre pré-appliqué ; conversion jamais NaN (division par zéro → `—`).

### T31 — Espace Manager (Rayan) : classement LDG + commissions de l'équipe
- **Agent** : Frontend · **Dépendances** : T30, T24
- **Fichiers** : `src/app/[locale]/(app)/equipe/page.tsx` (vue manager), `components/app/dashboards/ManagerDashboard.tsx`, `src/actions/dashboard.ts`
- **Étapes** :
  1. **Classement des vendeurs** : rang, nom, prospects ajoutés, qualifiés, signés, taux de conversion, palier courant, commissions dues/versées — tri par conversion.
  2. **Commissions de l'équipe** : vue `due`/`paid` filtrée bénéficiaire (lecture seule : seul le CEO verse — bouton absent, pas juste désactivé).
  3. Partagé avec CEO : composants réutilisés de T11 (candidatures + stats vendeurs) — mais Rayan n'a **QUE LA LECTURE** de la file des candidatures : **aucun bouton Approuver/Refuser n'est rendu pour le rôle manager** (validation = CEO seul, décision utilisateur). Seul le CEO tranche, et `activities` enregistre qui a tranché.
  4. Rayan **voit aussi les actions commerciales** (accès double confirmé) : mêmes entrées sidebar que `commercial`.
- **Critère « fait »** : classement exact vs seed ; aucun bouton de versement côté manager ; sidebar = commercial + équipe + commissions lecture.

### T32 — Dashboards Commercial et Vendeur
- **Agent** : Frontend · **Dépendances** : T16, T20
- **Fichiers** : `src/app/[locale]/(app)/tableau-de-bord/page.tsx` (branches rôles), `components/app/dashboards/CommercialDashboard.tsx`, `VendorDashboard.tsx`
- **Étapes** :
  1. **Commercial** : « Relances du jour » (prospects `next_reminder_at` ≤ aujourd'hui, priorité aux `devis_envoye`), « Fiches incomplètes » (jauge < 5/5), derniers prospects assignés → chaque carte ouvre la page détail avec filtre.
  2. **Vendeur** : `TierGauge` en tête, « Mes prospects » (derniers 5 + statuts), « Mes gains » résumé (due/paid), CTA « Ajouter un prospect » toujours visible.
  3. **Client** : le `tableau-de-bord` client redirige vers `/projet` (pas de dashboard dédié).
  4. Zéro donnée hors périmètre du rôle (le serveur ne renvoie que ce que le rôle a le droit de voir).
- **Critère « fait »** : 3 rôles → 3 rendus distincts et complets ; cross-check des données vs pages existantes.

### T33 — Passe a11y + responsive + états (toute la plateforme)
- **Agent** : Frontend · **Dépendances** : toutes les tâches UI
- **Fichiers** : composants app concernés, `src/app/globals.css` (ajustements ciblés)
- **Étapes** :
  1. **Checklist DESIGN.md §6** appliquée à chaque page : un `h1`/page, landmarks, labels réels, focus visible `#3B82F6` 2px/offset 3, cibles ≥ 44 px, contrastes AA, `prefers-reduced-motion`.
  2. **Responsive** : 360 / 768 / 1440 — **aucun scroll horizontal** ; tableaux → cartes sous 768 px ; sidebar → Sheet mobile.
  3. **États systématiques** : skeleton (chargement), `EmptyState` avec CTA (vide), message d'erreur + retry (échec), optimistic désactivé (pas d'état fantôme).
  4. Hiérarchie de titres et `aria` des onglets/dialogues (rôle `tablist` si onglets).
- **Critère « fait »** : audit clavier complet des 5 espaces sans piège ; captures 360/1440 comparables ; build sans warning a11y.

### T34 — Câbler le formulaire contact de la landing (validé au périmètre)
- **Agent** : Backend · **Dépendances** : T14
- **Fichiers** : `src/actions/contact.ts`, `src/components/sections/Contact.tsx` (adaptation minimale)
- **Étapes** :
  1. Server Action `submitContact()` : même schéma Zod que `src/lib/form-schema.ts` **existant** + honeypot déjà présent → `createProspect({ source: 'landing', source_user_id: null })` (anti-doublon partagé T14).
  2. `Contact.tsx` : passer du succès simulé à l'appel de l'action (garder le même écran de succès, i18n intact, état `pending` propre).
  3. Les leads landing apparaissent dans le pipeline CEO avec badge « Landing » et **commission sans bénéficiaire** (file T24).
  4. Validation des entrées + rate-limit léger (3/heure/IP via `login_attempts` réutilisé ou table dédiée).
- **Critère « fait »** : un message de la landing crée un prospect sans doublon ; FR/EN inchangés ; formulaire reste accessible ; **landing non régressée (E2E)**.

### T35 — Qualité statique : lint + tsc + build
- **Agent** : Backend · **Dépendances** : T33 (et T34 si retenu)
- **Fichiers** : correctifs ciblés uniquement
- **Étapes** :
  1. `npm run lint` → 0 erreur ; `npx tsc --noEmit` → 0 erreur ; `npm run build --turbopack` → succès sans warning.
  2. Vérifier : zéro `any`/`@ts-ignore` ajouté, zéro string i18n en dur dans les pages app, zéro `console.log` résiduel, `.env*` non committé (`git status`).
  3. Vérifier la non-régression landing (build + rendu `/fr` `/en`).
- **Critère « fait »** : les 3 commandes vertes + `git status` propre.

### T36 — Validation E2E par rôle (Playwright) + non-régression landing
- **Agent** : Tester · **Dépendances** : T35
- **Étapes & parcours** (sans modification de code, rapport détaillé) :
  1. **Landing** : `/fr` et `/en` se chargent, header/hero/sections/FAQ/formulaire OK (régression zéro), responsive 360/768/1440.
  2. **Connexion** : les 5 rôles → chacun atterrit sur SON home ; compte `pending` refusé ; rate-limit après 5 échecs.
  3. **Vendeur** : ajout OK → doublon refusé (message) → liste et carte mobile OK → gains/jauge cohérents ; **tentative d'accès à `/equipe` → redirection**.
  4. **Commercial** : fiche 5 étapes → jauge 5/5 → passage `qualifie→devis_envoye` OK → tentative `signe` → **refusée**.
  5. **CEO** : devis (montant + PDF) → `signed` → encaissement acompte → **commissions générées avec le bon barème** → versement en lot → historique ; validation d'une candidature ; stats employé affichées.
  6. **Client** : activation par invitation → timeline → validation d'étape → documents/factures visibles → message envoyé et accusé reçu ; **accès à un autre projet → 403**.
  7. **i18n** : passage FR↔EN sur 3 pages app sans texte manquant.
- **Critère « fait »** : rapport `VALIDÉ` ou liste de correctifs précis (fichier + état attendu vs observé).
