# PLAN.md — Plateforme ATHERIS LABS (v2 — exécution parallélisée)

> **Statut : ✅ VALIDÉ (v1.1) — repris en v2 pour le nouveau modèle d'exécution.**
> Version 2.0 — 24/10/2026 · Compagnons : `structure.md` (théorie), `DESIGN.md` (design), `TACHES.md` (détail exécutable T01→T36).

---

## Contexte & besoin métier

**ATHERIS LABS** = studio de développement multi-plateformes boosté à l'IA, à délais courts. Croissance portée par une force de vente à la commission (LDG + manager Rayan) et bientôt la pub.

**Objectif v1 de la plateforme** : transformer un prospect en client payant — pipeline commercial, **devis / paiements / commissions** (barème progressif, plafond 25 %), et un **portail client** (jalons, documents, factures, messagerie). La landing existante est livrée et **ne doit pas régresser**.

### Modèle d'exécution (v2 — nouveau)

- **Pas d'agent Reviewer** : chaque sous-agent **s'auto-valide** et termine sa réponse par **`AUTO-OK`** ou **`AUTO-KO`** (+ liste exacte des correctifs). `AUTO-KO` → le Lead renvoie une tâche corrigée isolée.
- Le Lead lance les sous-agents **`Database` / `Backend` / `Frontend` en arrière-plan**, en **un seul tour** pour lancer simultanément.
- **Partition stricte des fichiers** (§Partition) : aucun fichier dans deux pistes simultanément. Une tâche partagée = elle est **sérialisée** ou remise à **une seule piste**.
- **Contrats inter-pistes figés** (§Contrats) : les pistes codent **contre le contrat**, pas contre le code des autres.
- Micro-commit Conventional Commits (français) après chaque `AUTO-OK`, **jamais de push**.
- 2 `AUTO-KO` identiques sur la même tâche → escalade utilisateur.

### Décisions validées (inchangées)

| Sujet | Décision |
|---|---|
| Base | **Neon (Postgres)** + **Drizzle ORM** + `jose` (JWT edge) |
| UI | **shadcn/ui** thématisé `DESIGN.md` (landing = composants maison conservés, pile double assumée T04) |
| Langue | **FR + EN plateforme** (dictionnaires dédiés T06) |
| Paiements | **Saisie manuelle CEO** (zéro Stripe v1) |
| Devis | **Hors plateforme + PDF joint** |
| Barème | 0-4 → 10 % · 5-9 → 12,5 % · 10-19 → 15 % · 20+ → 20 % (vendeur) |
| Plafond | **25 % max/deal** (vendeur + 5 % Rayan) → CEO ≥ 75 % |
| Rayan | 5 % fixes tout deal + part vendeur (barème) sur ses propres prospects |
| Candidatures | **CEO seul** valide ; Rayan = lecture seule |
| Attribution | Anti-doublon strict (email/téléphone), canal d'origine prioritaire, Ads = commission type LDG |
| Commissions | Déclencheur = signé **ET** acompte encaissé ; **aucun clawback** |
| Formulaire landing | **Câblé au CRM** (T34, validé) |
| Portail client | **Périmètre initial** |

### ⚠ Règle DB-PENDING (accord utilisateur)

`DATABASE_URL` fourni **à la fin du plan** (`.env.local` = placeholder). Conséquences :
- Les pistes **écrivent et auto-valident** normalement (typecheck/lint/build).
- **Reportées** à l'arrivée de la chaîne Neon (liste `DB-PENDING`) : application des migrations, seed réel, requêtes DB réelles, E2E complet.
- `DB-PENDING` : **T12** (seed exécuté), **T36** (E2E complet avec comptes réels), toutes les vérifications runtime impliquant `getDb()`.

---

## 1. Base de données (DB) → sous-agent `Database`

**Statut : T01/T02 LIVRÉS** (connexion Drizzle commitée `f813768`, 13 tables + migration `0000` commitée `4d1da83`). Le schéma est **figé** (voir §Contrats) — toute évolution passe par une tâche `Database` dédiée + `db:generate`.

### DB-1 (T12) — Seed de démarrage (script non exécuté tant que placeholder)
- **Fichiers** : `src/lib/db/seed.ts` (nouveau), `package.json` (script `db:seed`).
- Idempotent (upsert email) : CEO, Rayan (manager), 2 vendeurs, 1 commercial, 1 client de démo + 6 prospects répartis sur les 10 statuts + 1 fiche projet + 1 devis `signed` + 1 acompte payé.
- Env `SEED_DEMO=1` obligatoire (jamais en prod sans confirmation).
- **Critère AUTO-OK** : script écrit, `tsc` vert, **non exécuté** (DB-PENDING), `npm run db:seed ×2` documenté comme idempotent.

### DB-2 (fin de plan) — Application réelle des migrations (DB-PENDING)
- `npm run db:migrate` sur la vraie chaîne + vérif des 13 tables + seed → **tâche finale d'ouverture des gates** avant T36.

---

## 2. API Routes / Server Actions → sous-agent `Backend`

**Statut : T03 (auth) LIVRÉ** (`f9c1371`) · **T07 RBAC : `src/lib/permissions.ts` LIVRÉ (figé, contrat), `src/middleware.ts` RESTE À FAIRE.**

### BK-1 (T07 fin) — Middleware de garde edge
- **Fichiers** : `src/middleware.ts` **uniquement**.
- Étendre la logique locale existante (ne pas casser) : (a) `/{locale}/espace/*` sans cookie → 307 `/{locale}/connexion?callbackUrl=` ; (b) JWT `authjs.session-token` **vérifié avec `jose`** (`AUTH_SECRET`) — `status !== "active"` ou rôle invalide (`isRole`) → hors espace ; (c) `isRouteAllowed(suffix, role)` false → redirect `HOME_BY_ROLE[role]` ; (d) `/{locale}/connexion|inscription` avec session valide → redirect home rôle.
- **Critère AUTO-OK** : 3 scénarios dev vérifiés (`/fr/espace` sans cookie → connexion ; `/fr/connexion` sans cookie → 200 ; `/` → `/fr`), build edge OK, zéro import lourd.

### BK-2 (T14+T15) — Cœur prospects : anti-doublon + machine à états + audit
- **Fichiers** : `src/lib/prospect-dedup.ts` (+ `src/lib/prospect-dedup.test.ts`), `src/actions/prospects.ts`, `src/actions/status.ts`.
- `normalizeEmail` (trim/minuscules) + `normalizePhone` (`+213`/`00213`/`213` → `0`, chiffres) ; `createProspect()` : Zod + SELECT préalable sur `email_norm`/`phone_norm` → `{ error: "duplicate" }` + filet index unique ; journal `activities`.
- `changeProspectStatus({ id, to, expectedFrom, reason? })` : `canChangeStatus(role, …)` + **transaction** `UPDATE … WHERE status = expectedFrom` (0 ligne = conflit) + `reason` obligatoire si `isTerminalStatus(to)` + `activities`.
- **Critère AUTO-OK** : tests dedup verts (≥6 cas), tsc/lint/build verts.

### BK-3 (T23) — Moteur de commissions + tests
- **Fichiers** : `src/lib/commission.ts` (pur), `src/lib/commission.test.ts`, `src/actions/commissions.ts` (génération).
- `getTier(paidCount)` (10|125|150|200 en **dixièmes** — convention schéma), `computeDealShares()` (garde-fou 25 % cumul, arrondi centime, assert CEO ≥ 75 %), `generateCommissionsForQuote()` en transaction (snapshot taux, lignes seller + manager 5 %, **cas sans bénéficiaire** → `beneficiary_id: null`, **idempotent** via contrainte unique + SELECT préalable car l'index unique traite les NULL comme distincts).
- Tests vitest ≥ 10 cas (paliers, arrondis, plafond, Rayan vendeur, sans bénéficiaire, idempotence, gros deal).
- **Critère AUTO-OK** : `npx vitest run` vert (installe `vitest` en devDep si absent), fonctions pures sans DB.

### BK-4 (T21+T22+T24 actions) — Devis, encaissements, versements (server-side)
- **Fichiers** : `src/actions/quotes.ts`, `src/actions/payments.ts`, `src/actions/commissions.ts` (versement — à **sérialiser** avec BK-3 sur ce fichier : BK-3 d'abord, BK-4 ensuite, ou fusion en une tâche si plus simple).
- CEO seul : `createQuote` (cents, `toCents()`), statuts `draft→sent→signed|lost` (lost = motif + rétrograde prospect), `markPaymentPaid` (acompte → **appel `generateCommissionsForQuote`** + prospect `client_actif`, idempotent), `markCommissionsPaid` (individuel/lot, `paid_by`).
- **Critère AUTO-OK** : transitions refusées hors CEO, tsc/lint/build verts.

### BK-5 (T25+T26) — Documents PDF + invitations client
- **Fichiers** : `src/lib/documents.ts`, `src/actions/documents.ts`, `src/app/api/documents/[id]/route.ts`, `src/actions/invitations.ts`.
- Upload : MIME **`application/pdf`** (magic bytes `%PDF`), ≤ 5 Mo, stockage **bytea** (migration Vercel Blob notée) ; `GET /api/documents/[id]` : session + **droit vérifié** (owner accessible au rôle), 403 sinon, `Content-Disposition: attachment`.
- Invitations : token 32 B hex, 48 h, `used_at` ; activation = choix mdp (scrypt) → compte `client` actif lié au projet.
- **Critère AUTO-OK** : rejet JPG/6 Mo, 403 sans session et cross-client (logique écrite + tsc vert ; runtime = DB-PENDING).

### BK-6 (T27+T29 actions) — Jalons & messagerie (server-side)
- **Fichiers** : `src/actions/project.ts`, `src/actions/messages.ts`.
- `validateMilestone()` (appartenance au projet du client), `postMessage()` (Zod ≤ 2000, appartenance), `read_at` idempotent.
- **Critère AUTO-OK** : scoping vérifié par construction, tsc/lint/build verts.

### BK-7 (T30-T32 actions) — Agrégats dashboards
- **Fichiers** : `src/actions/dashboard.ts`.
- Agrégats SQL : stats globales CEO, files d'action, stats par employé (funnel/activité/rentabilité), classement vendeurs, relances du jour, ledger gains.
- **Critère AUTO-OK** : requêtes agrégées écrites, division par zéro → `null` (jamais NaN), tsc vert.

### BK-8 (T34) — Câblage formulaire contact → CRM
- **Fichiers** : `src/actions/contact.ts` (**Backend**) + `src/components/sections/Contact.tsx` (**Frontend — sérialisé : dernière tâche, après toute tâche Frontend touchant la landing**).
- `submitContact()` : schéma `src/lib/form-schema.ts` existant + honeypot → `createProspect({ source: "landing", source_user_id: null })`, rate-limit 3/h/IP.
- **Critère AUTO-OK** : landing non régressée (E2E ciblé), FR/EN intacts.

---

## 3. UI Components → sous-agent `Frontend`

**Statut : T04 (shadcn + DESIGN §12) LIVRÉ** (`b396d8f`) · **T05 (route groups) LIVRÉ** (`246a869`) · **T06 (dictionnaires i18n) LIVRÉ** (`11eecdc`) · T08-T33 + T10/T11/T13 pages = à faire.

> Rappel T05 : **jamais de `(app)/page.tsx`** (conflit de chemin avec la landing) — les pages vivent sous `(app)/espace/…`. Placeholders actuels : `(auth)/connexion/page.tsx`, `(app)/espace/page.tsx`.

### FE-1 (T08) — Shell de l'espace connecté
- **Fichiers** : `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/(app)/espace/page.tsx`, `src/components/app/{AppShell,Sidebar,Topbar}.tsx`, `src/content/platform/{fr,en}.ts` (ajustements aria/nav si besoin).
- `auth()` serveur → `isRouteAllowed` par route → `redirect(HOME_BY_ROLE[role])` ; sidebar = `dict.nav[role]` (hrefs T06 figés) ; topbar : switch FR/EN (conserve chemin), menu profil/déconnexion ; mobile `Sheet` (focus trap, `Escape`, verrou scroll — DESIGN §4.11) ; noindex conservé.
- **Critère AUTO-OK** : chaque rôle ne voit que ses items, URL forcée interdite → redirection, 360 px utilisable, tsc/lint/build verts.

### FE-2 (T09) — Page connexion (FR/EN)
- **Fichiers** : `src/app/[locale]/(auth)/connexion/page.tsx`, `src/components/app/LoginForm.tsx`, `src/content/platform/{fr,en}.ts` (clés `auth.login` si compléments), `(auth)/layout.tsx` (+ `generateMetadata` + `<main>` — mineur T05).
- RHF + Zod, `useActionState` → `login()` (T03), codes i18n (`invalid`/`rate_limited`/`pending`/`rejected`/`generic`), états idle/submitting/erreur, lien inscription, `callbackUrl`.
- **Critère AUTO-OK** : 4 erreurs différenciées testables (logique), focus/labels AA, tsc/lint/build verts.

### FE-3 (T10+T13) — Inscription candidature + profil unifié
- **Fichiers** : `src/app/[locale]/(auth)/inscription/page.tsx`, `src/components/app/CandidateForm.tsx`, `src/app/[locale]/(app)/espace/profil/page.tsx`, `src/components/app/ProfileForms.tsx`, `src/actions/profile.ts` (**Backend** — créée ici si BK-1 libère, sinon Frontend écrit la page contre le contrat BK-profile ci-dessous).
- Inscription : nom figé, email normalisé (consigne T02/T03), mdp + confirmation, honeypot, écran « candidature transmise » honnête. Profil : email/téléphone/mdp (confirm actuel), nom lecture seule.
- **Contrat action (figé)** : `applyAsCandidate(input) → { ok: true } | { ok: false; code: "duplicate" | "invalid" }` ; `updateProfile(input) → { ok: true } | { ok: false; code: "wrong_password" | "duplicate" | "invalid" }`.
- **Critère AUTO-OK** : tsc/lint/build verts, i18n FR/EN, AA.

### FE-4 (T16) — PipelineTable (composant clé réutilisé)
- **Fichiers** : `src/components/app/{PipelineTable,StatusBadge,FilterBar}.tsx`, `src/lib/status-meta.ts` (couleurs depuis `DESIGN.md` §12.2).
- Filtres **dans l'URL** (`useSearchParams`, debounce 300 ms), colonnes/actions selon `capabilities` (props), badge statut AA, mobile → cartes, skeleton + `EmptyState` avec CTA.
- **Critère AUTO-OK** : 1 composant pour 4 rôles, filtres survivent au refresh, 360 px sans overflow.

### FE-5 (T17+T18) — Liste scopée + détail 4 onglets
- **Fichiers** : `src/app/[locale]/(app)/espace/prospects/page.tsx`, `…/prospects/[id]/page.tsx`, `src/components/app/prospect/*` (`IdentityTab`, `BriefTab`, `DealsTab`, `HistoryTab`, `StatusActions`).
- Contrat lecture (figé) : `listProspects(filters, viewer)` (scoping serveur vendeur) ; détail : sélecteur de transitions = options issues de `canChangeStatus(role, from, to)`, 404 propre.
- **Critère AUTO-OK** : transitions illégales absentes de l'UI **et** refusées côté serveur (double filet), tsc/lint/build verts.

### FE-6 (T19) — Assistant fiche projet 5 étapes
- **Fichiers** : `…/prospects/[id]/fiche/page.tsx`, `src/components/app/prospect/BriefWizard.tsx` (+ 5 `*Step.tsx`), `src/actions/prospects.ts` (upsert brief — **sérialisé** avec BK-2 sur ce fichier).
- Sauvegarde par bloc (contrat `saveBriefBlock(prospectId, blockKey, data)`), jauge X/5, « Prêt pour devis » à 5/5.
- **Critère AUTO-OK** : quitter sans perte, navigation clavier, tsc/lint/build verts.

### FE-7 (T20+T32) — Espace vendeur mobile-first + dashboards Commercial/Vendeur
- **Fichiers** : `…/espace/prospects/nouveau/page.tsx`, `src/components/app/vendor/{AddProspectForm,TierGauge,EarningsLedger}.tsx`, `…/espace/tableau-de-bord/page.tsx` (+ branches rôles), `src/components/app/dashboards/{CommercialDashboard,VendorDashboard}.tsx`.
- Contrat gains (figé) : `getMyEarnings()` → `{ pendingCents, paidCents, items[], tier: { paidCount, rateTenths, nextTierAt } }`.
- **Critère AUTO-OK** : ajout 1 écran à 360 px, jauge conforme aux 4 paliers, dashboards distincts par rôle.

### FE-8 (T21+T22+T24 UI) — Cœur CEO : devis, encaissements, file de commissions
- **Fichiers** : `…/prospects/[id]/page.tsx` (onglet Devis étendu — **sérialisé** avec FE-5), `src/app/[locale]/(app)/espace/commissions/page.tsx`, `src/components/app/commission/{CommissionQueue,CommissionHistory}.tsx`.
- Rappel no-clawback avant chaque déclencheur, versement en **lot** avec `ConfirmDialog` total, bannière « sans bénéficiaire », stats têtes.
- **Critère AUTO-OK** : lot cohérent, rôle non-CEO sans bouton, tsc/lint/build verts.

### FE-9 (T26 UI + T27 + T28 + T29 UI) — Portail client complet
- **Fichiers** : `…/espace/projet/page.tsx` (timeline + onglets), `src/components/app/client/{MilestoneTimeline,DocumentsPanel,InvoicesPanel,Thread,MessageForm}.tsx`, `…/espace/invitation/[token]/page.tsx` (activation publique — sous `(auth)`).
- Timeline = pattern §4.7 landing (pastilles/filet), « Valider cette étape » si `en_cours`, docs/factures lecture seule, messagerie avec accusé.
- **Critère AUTO-OK** : scoping client par construction, séquence non sautable, 360 px OK.

### FE-10 (T11+T30+T31) — Espace équipe (candidatures + stats employé) + dashboards CEO/Manager
- **Fichiers** : `…/espace/equipe/page.tsx`, `…/espace/tableau-de-bord/page.tsx` (**sérialisé** avec FE-7 sur ce fichier — FE-7 d'abord), `src/components/app/dashboards/{CeoDashboard,ManagerDashboard}.tsx`, `src/components/app/applications/{ApplicationList,ApplicationCard}.tsx`.
- Ordre d'affichage CEO : **files d'action** → KPIs → activité ; stats employé dépliables (funnel/activité/rentabilité) ; manager : classement vendeurs + commissions équipe **lecture seule** (aucun bouton de versement, pas même désactivé) + candidatures lecture seule (**CEO seul** approuve/refuse).
- **Critère AUTO-OK** : manager sans action de versement/validation, clic file d'action → bonne page filtrée, tsc/lint/build verts.

### FE-11 (T33) — Passe a11y + responsive + états (toute plateforme)
- **Fichiers** : composants/pages app concernés + `globals.css` (ajustements ciblés).
- Checklist DESIGN §6 appliquée partout, 360/768/1440 sans overflow, skeleton/EmptyState/erreur systématiques, hiérarchie H1.
- **Critère AUTO-OK** : audit clavier 5 espaces sans piège, build sans warning.

---

## 4. Tests → sous-agent `Tester` (fin de module)

- **T36 (fin de plan, après gates DB-PENDING)** : parcours E2E par rôle via MCP Playwright sur `npm run dev` — landing `/fr`+`/en` (non-régression), 5 connexions rôles, anti-doublon, fiche 5 étapes, devis→acompte→**commissions au bon barème**→versement lot, invitation client→jalons→messagerie, cross-client 403, i18n FR↔EN, responsive 360/768/1440. → rapport `VALIDÉ` ou liste de correctifs précis.
- **T35 (préalable)** : lint + `tsc --noEmit` + build production verts (piste Backend).

---

## Partition des fichiers (obligatoire pour le parallélisme)

| Fichier | Piste |
|---|---|
| `src/lib/db/seed.ts`, `package.json` (script db:seed) | **Database** |
| `src/lib/db/schema.ts` | **Database** (figé — évolution = tâche dédiée) |
| `src/middleware.ts` | **Backend** |
| `src/lib/prospect-dedup.ts` (+test), `src/lib/commission.ts` (+test) | **Backend** |
| `src/actions/*.ts` (auth/profile/prospects/status/quotes/payments/commissions/invitations/project/messages/dashboard/contact) | **Backend** |
| `src/lib/documents.ts`, `src/app/api/documents/[id]/route.ts` | **Backend** |
| `src/app/[locale]/(app)/**`, `src/app/[locale]/(auth)/**`, `src/components/app/**` | **Frontend** |
| `src/content/platform/{fr,en,types}.ts` | **Frontend** (Backend n'y touche jamais) |
| `src/components/sections/Contact.tsx` | **Frontend** (tâche BK-8, sérialisée en fin de plan) |
| `src/lib/permissions.ts` | **FIGÉ** (livré T07) — aucune piste n'y touche sans tâche dédiée |
| `src/auth.ts`, `src/lib/password.ts`, `src/actions/auth.ts`, `src/types/next-auth.d.ts` | **FIGÉS** (T03) — sauf tâche dédiée |
| `src/lib/db/index.ts`, `drizzle.config.ts`, `drizzle/**` | **FIGÉS** (T01/T02) |
| Landing `(marketing)/**`, `src/i18n/dictionaries.ts`, `src/content/{fr,en,types}.ts`, `globals.css` (hors ajustements ciblés T33), `sitemap.ts`, `robots.ts` | **INTERDITS** (hors périmètre) |

**Collisions gérées (sérialisation explicite)** :
1. `src/actions/prospects.ts` : **BK-2** (création) → **FE-6** (upsert brief) — jamais en même temps.
2. `src/actions/commissions.ts` : **BK-3** (génération) → **BK-4** (versement) — une seule tâche Backend à la fois.
3. `…/espace/tableau-de-bord/page.tsx` : **FE-7** → **FE-10**.
4. `…/prospects/[id]/page.tsx` : **FE-5** → **FE-8**.
5. `src/components/sections/Contact.tsx` : **BK-8** = dernière tâche du plan (après toute Frontend).

---

## Sécurité & edge cases à couvrir

| Risque | Mesure (piste) |
|---|---|
| Escalade de rôle | RBAC serveur dans **chaque** Server Action (`canChangeStatus`, scoping) — Backend |
| Middleware edge = garde grossière seulement | Le layout `(app)` + les actions revalident — Frontend/Backend |
| JWT corrompu/ancien schéma | `isRole()` + `jwtVerify` complet (`jose`) — Backend |
| Doublon prospect en course | index unique + SELECT préalable + message propre — Backend |
| Double génération de commission (double clic) | contrainte unique **+ SELECT préalable** (NULL distincts dans l'index) — Backend |
| Deal sans bénéficiaire (Ads/Landing) | `beneficiary_id: null` + bannière CEO — Backend/Frontend |
| Commission sur annulation | **pas de clawback** (choix assumé) → rappel UI avant paiement — Frontend |
| Fichier malveillant | magic bytes `%PDF` + ≤ 5 Mo + route d'upload authentifiée + download à droit vérifié — Backend |
| Force brute login | `login_attempts` 5/15 min (T03, livré) | 
| Statut modifié en double | `UPDATE … WHERE status = expectedFrom` → erreur « recharger » — Backend |
| Fuite entre vendeurs | `WHERE source_user_id = moi` côté serveur — Backend |
| Invitation expirée/réutilisée | `expires_at` 48 h + `used_at` — Backend |
| PII prospects | scoping + `noindex` + pas d'export v1 — transversal |
| Fuseau | UTC en DB, rendu `Africa/Algiers` — Frontend |
| Landing non régressée | fichiers interdits + E2E ciblé fin de plan — transversal |

---

## Contrats inter-pistes (schéma DB + types partagés, figés ici)

> Les pistes codent contre ces contrats. **Toute divergence = AUTO-KO.**

### C-1 — Schéma DB (T02, figé) — `src/lib/db/schema.ts`
13 tables : `users`, `prospects`, `prospect_briefs`, `quotes`, `payments`, `commissions`, `client_projects`, `milestones`, `documents`, `invitations`, `activities`, `messages`, `login_attempts`. Enums : `role` (5), `user_status` (4), `prospect_status` (10 : `nouveau…disqualifie`), `prospect_source` (5), `quote_status` (4), `commission_status` (2), `commission_kind` (2), `milestone_key` (5), `milestone_status` (3), `document_kind` (4), `document_owner` (2).
**Conventions** : timestamps `timestamptz` (helper `tstz`) · `ratePercent` en **dixièmes** (100 = 10,0 %) · montants en **cents** · `commissions` unique `(quote_id, beneficiary_id, kind)` · `email_norm`/`phone_norm` uniques · SQL snake_case explicite · `bytes` = `bytea` customType.

### C-2 — Permissions (T07, **livré, figé**) — `src/lib/permissions.ts`
Exports : `Role`, `ProspectStatus` (dérivés schéma), `HOME_BY_ROLE`, `ROUTE_ACCESS`, `isRouteAllowed(pathname, role)`, `isEspacePath(pathname)`, `TRANSITIONS`, `canChangeStatus(role, from, to)`, `isTerminalStatus(status)`, `canViewAllProspects(role)`, `isRole(value)`.

### C-3 — Auth (T03, figé)
`@/auth` → `auth()`, `login(input) → { ok: true } | { ok: false; code: "invalid"|"rate_limited"|"pending"|"rejected" }`, `logout()`. Session : `session.user = { id, role, name, status }`. `@/lib/password` → `hashPassword`, `verifyPassword`.

### C-4 — Dictionnaire (T06, figé, extensible)
`getPlatformDictionary(locale) → PlatformContent` — sections : `common`, `nav` (hrefs **figés** : ceo/manager `tableau-de-bord|prospects|commissions|equipe`, commercial `tableau-de-bord|prospects`, vendeur `tableau-de-bord|prospects|commissions`, client `projet`), `auth`, `statuses` (10+4+2+5+5+4), `pipeline`, `prospect`, `brief`, `dashboard`, `commissions`, `client`, `applications`, `profile`, `footer`, `seo`. Toute clé manquante = erreur TS. **Ajouts possibles par Frontend ; retraits = AUTO-KO.**

### C-5 — Contrats d'actions à venir (signatures figées, impl Backend, conso Frontend)
```
applyAsCandidate(input)                     → { ok: true } | { ok: false; code: "duplicate"|"invalid" }
updateProfile(input)                        → { ok: true } | { ok: false; code: "wrong_password"|"duplicate"|"invalid" }
createProspect(input, viewer)               → { ok: true; id: string } | { ok: false; code: "duplicate"|"forbidden"|"invalid" }
changeProspectStatus(input, viewer)         → { ok: true } | { ok: false; code: "conflict"|"forbidden"|"reason_required"|"invalid" }
listProspects(filters, viewer)              → { items: ProspectListItem[]; total: number }
saveBriefBlock(prospectId, blockKey, data)  → { ok: true; completedBlocks: number } | { ok: false; code: … }
markCommissionsPaid(ids[], actorId)         → { ok: true; paidCount: number } | { ok: false; code: … }
getMyEarnings(viewer)                       → { pendingCents, paidCents, items[], tier: { paidCount, rateTenths, nextTierAt } }
```
Codes d'erreur **en clair** (jamais de message) — l'i18n est côté Frontend.

### C-6 — Barème (T23, figé : `src/lib/commission.ts`)
`getTier(paidCount) → 100 | 125 | 150 | 200` (dixièmes) pour 0-4 / 5-9 / 10-19 / 20+ · manager = 50 dixièmes · garde-fou cumul 250 · part CEO ≥ 75 % · palier **snapshot** à la génération · deal antérieur `client_actif` avant ce deal.

---

## Ordre d'exécution (parallèle, par lots)

**Lot 0 — LIVRÉ** : T01 (DB), T02 (schéma), T03 (auth), T04 (shadcn), T05 (route groups), T06 (i18n) · T07 partiel (`permissions.ts` ✅).

**Lot 1** *(lancement simultané, fichiers disjoints)* :
- `Backend` **BK-1** (middleware) ∥ `Frontend` **FE-1** (shell) ∥ `Database` **DB-1** (seed).

**Lot 2** *(après BK-1, qui libère le terrain de garde)* :
- `Backend` **BK-2** (dedup + statuts) ∥ `Frontend` **FE-2** (connexion) et **FE-3** (inscription + profil).

**Lot 3** :
- `Backend` **BK-3** (moteur commissions) ∥ `Frontend` **FE-4** (PipelineTable).

**Lot 4** :
- `Backend` **BK-4** (devis/acompte/versement) ∥ `Frontend` **FE-5** (liste + détail) puis **FE-6** (brief wizard, après BK-2 sur `actions/prospects.ts`).

**Lot 5** :
- `Backend` **BK-5** (documents + invitations) ∥ `Frontend` **FE-7** (vendeur + dashboards bas).

**Lot 6** :
- `Backend` **BK-6** (jalons + messages) ∥ `Frontend` **FE-8** (UI CEO, après FE-5) puis **FE-9** (portail client, après BK-5/BK-6).

**Lot 7** :
- `Backend` **BK-7** (agrégats) ∥ `Frontend` **FE-10** (équipe + dashboards CEO/Manager, après FE-7).

**Lot 8** *(sérialisés, fin de module)* :
- `Frontend` **FE-11** (passe a11y) → `Backend` **T35** (qualité statique) → `Backend` **BK-8** (câblage Contact — dernière) → `Database` **DB-2** (migrations réelles + seed : **gates DB-PENDING**, nécessite la chaîne Neon) → `Tester` **T36** (E2E complet).

---

## Validation finale (auto-revue → Tester)

1. Chaque tâche cochée `AUTO-OK` et commitée (micro-commit Conventional Commits FR).
2. **Auto-revue Lead** (remplace l'ancien Reviewer) : dernier diff conforme — RBAC serveur dans chaque action, zéro `any`, palette `DESIGN.md`, i18n FR/EN, partition respectée, landing intacte.
3. **Gates DB-PENDING** : `DATABASE_URL` fourni → `db:migrate` + `db:seed` + smoke login réel.
4. `Tester` (T36) : E2E des 5 rôles + responsive + non-régression landing → rapport.
5. Synthèse utilisateur : fichiers créés, statut auto-revues/tests, points restants.
