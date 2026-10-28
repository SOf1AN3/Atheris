# PLAN.md — Lot 3 : comptes sur invitation · purge · SDR · responsive CRM

> **Statut : 🟡 EN ATTENTE DE VALIDATION EXPLICITE** — aucun code avant feu vert.
> Version 1.0 — 28/10/2026 · Le plan « Lot 2 » est exécuté et committé (`492adb1`) → `PLAN.md` réutilisé.
> ⚠ Vous travaillez en parallèle sur `src/remotion/`, `scripts/*.mjs` (vidéo), `package.json` scripts `video:*`, `logo/`, `public/fonts/` : **hors périmètre, ni lus ni modifiés.**

---

## Contexte & besoin métier

7 demandes, dont **une refonte du cycle de vie des comptes** :

1. **Bouton « Supprimer » sur chaque lien d'entretien** généré (page `/espace/entretien`, CEO).
2. **Purge des données de test** en base : seuls survivent le compte **admin** (`admin@sofianeasma.me`), la **candidature de Meriam Sghaier**, et le profil **Saad Fares Racim** (rôle requalifié **SDR**). *Décision utilisateur : les liens d'entretien ne sont **pas** purgés en DB — il les supprimera lui-même avec le nouveau bouton.*
3. **MYKS Radio retiré de la landing** (mise en commentaire, réversible).
4. **Rôles** : plus aucun « vendeur » — le rôle devient **SDR** (vrai renommage). Rôles finaux : `ceo`, `manager`, `commercial`, `sdr`, `client` (client conservé : indispensable au portail client).
5. **Refonte de la création de comptes** (décisions utilisateur) :
   - **Personne ne peut s'inscrire librement** : `/inscription` disparaît.
   - Un **SDR postule** via `/recrutement` (offre SDR) → entretien → le CEO clique **« Recruter »** → un **e-mail avec lien unique (48 h)** part au candidat → il crée son compte **lui-même, directement actif, sans validation manuelle**, avec le rôle **sdr** assigné **par le lien**.
   - **Client** : à l'accord commercial, le CEO déclenche depuis **la fiche prospect** l'envoi d'un **e-mail avec lien unique (48 h)** → le client crée son compte **client** (rôle assigné par le lien).
   - Aucun autre chemin de création de compte (le compte CEO existe via `bootstrap-admin`).
6. **Responsive CRM** : le CRM n'est pas utilisable au téléphone → **cartes en mobile** (< md) sur toutes les pages d'espace.
7. **Landing mobile** : sur chaque carte projet, le bouton **« Visiter le site » doit être toujours apparent** (pas de hover au doigt).

---

## Questions / décisions tranchées (avec l'utilisateur)

| # | Sujet | Décision |
|---|---|---|
| D1 | Rôle `client` | **Conservé** (portail client) — les rôles assignables par lien = `sdr` + `client`. |
| D2 | `vendeur` → `sdr` | **Vrai renommage** : enum PG + ~50 refs code. Saad devient `sdr` par la migration. |
| D3 | Compte « Sofiane ASMA » | **Supprimé** (purge). |
| D4 | Liens d'entretien | **Non purgés** — suppression manuelle via le nouveau bouton. Modèle d'e-mail de recrutement (`recruitment_templates`) **conservé**. Script `db:seed` **neutralisé** (garde `ALLOW_DEMO_SEED`). |
| D5 | Responsive | **Cartes en mobile** (pas de scroll horizontal). |
| D6 | Lien client | Déclenché **sur la fiche prospect** (statut `client_actif`/`en_livraison` + projet signé, invariant de l'action existante). |

**Décisions prises sans déranger** : statut de candidature `recrute` ajouté (le bouton « Recruter » disparaît après usage) · l'e-mail échoue → le lien reste copiable manuellement dans l'UI (repli v1) · le bouton « Recruter » est proposé dès qu'une candidature n'est ni `refuse` ni `recrute` · jeton d'invitation = `randomBytes(32)` hex, **e-mail jamais modifiable** à l'activation (anti-takeover, motif `invitations.ts`).

---

## 1. Base de données — **sous-agent Database** (bloquant, exécuté en premier)

### 1.1 Purge des données de test — `scripts/purge-test-data.ts` (créé, exécuté, conservé)
Script `tsx` idempotent, lit `.env.local`, imprime un récapitulatif. **À conserver** (rejouable).

**À CONSERVER (UUID figés)** :
- `users` : `dfeaf925-…3881` (Administrateur Atheris, ceo) · `18ae2e5d-…6d4b` (Saad Fares racim)
- `job_applications` : `9447aa7f-…5010` (Meriam Sghaier, nouveau)
- `recruitment_templates` : **toutes les lignes conservées** (1 actuellement)

**À SUPPRIMER (tout le reste)** : 9 `users` (6 démo seed + E2E Candidat Final + Design Review + Sofiane ASMA), 2 `job_applications` (TestE2E, English Candidate), 18 `interviews`, 11 `prospects` (+ cascade `prospect_briefs`), 4 `quotes` (+ cascade `payments`, `commissions`), 1 `client_projects` (+ cascade `milestones`), 3 `messages`, 26 `activities`, 5 `login_attempts`, `invitations`/`documents` (déjà vides).

**Ordre FK imposé** (colonnes `no action`) :
1. `UPDATE users SET default_project_id = NULL` (FK → `client_projects`, sinon blocage à l'étape 5)
2. `DELETE activities` (actor_id `no action`)
3. `DELETE invitations` · `DELETE messages` (sender_id `no action`)
4. `DELETE client_projects` (quote_id `no action` côté projet ; cascade → `milestones`)
5. `DELETE quotes` (cascade → `payments`, `commissions`)
6. `DELETE prospects` (cascade → `prospect_briefs` ; `source_user_id` = `set null`)
7. `DELETE job_applications WHERE id NOT IN ('9447aa7f-…')`
8. `DELETE interviews` (toutes — 18 lignes de test ; la candidature Meriam n'en référence aucune)
9. `DELETE users WHERE id NOT IN ('dfeaf925-…', '18ae2e5d-…')`
10. `DELETE login_attempts`

**Fait =** script exécuté, `SELECT` de contrôle : 2 users, 1 job_application, 0 prospect/quote/project/interview/activity.

### 1.2 Migration schéma — `src/lib/db/schema.ts` + `drizzle/0003_*.sql`
| Changement | Détail |
|---|---|
| `roleEnum` | `["ceo","manager","commercial","vendeur","client"]` → `["ceo","manager","commercial","sdr","client"]` |
| `applicationStatusEnum` | + `"recrute"` |
| `jobApplications` | + `recruitedAt: tstz("recruited_at")` (null) |
| `invitations` | + `role: roleEnum("role").notNull()` · `projectId` devient **nullable** · + `applicationId: uuid("application_id").references(() => jobApplications.id)` (null pour client) · index `(email, role)` partiel `used_at IS NULL` pour la réutilisation |

⚠ **Renommage d'enum** : drizzle-kit ne produit pas fiablement `ALTER TYPE … RENAME VALUE`. Le SQL de `drizzle/0003_*.sql` est produit par `db:generate` puis **ajusté à la main** si besoin, avec la séquence transactionnelle sûre :
```sql
ALTER TYPE "role" RENAME TO "role_old";
CREATE TYPE "role" AS ENUM ('ceo','manager','commercial','sdr','client');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "role"
  USING (CASE "role_old"::text WHEN 'vendeur' THEN 'sdr' ELSE "role_old"::text END)::"role";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ceo';
DROP TYPE "role_old";
```
Puis les changements simples (`application_status` + `recrute` par `ALTER TYPE … ADD VALUE`, colonne `recruited_at`, colonnes `invitations`). **Exécuter `npm run db:migrate` sur la vraie chaîne Neon** (env réel en place).

**Fait =** migration appliquée ; `SELECT enum_range(NULL::role)` = `ceo,manager,commercial,sdr,client` ; Saad = `sdr`.

### 1.3 Neutralisation du seed — `src/lib/db/seed.ts`
Garde en tête de `main()` : `if (process.env.ALLOW_DEMO_SEED !== "1") { console.warn(…); process.exit(0); }`. `src/lib/db/seed-data.ts` : `SeedRole` aligné sur le nouvel enum (`sdr`).

**Fait =** `npm run db:seed` refuse poliment sans toucher la DB.

---

## 2. API / Server Actions — **sous-agent Backend**

### 2.1 Renommage global `vendeur` → `sdr` (sauf `src/content/**`, voir piste Frontend-A)
Fichiers : `src/lib/permissions.ts` (`HOME_BY_ROLE`, `ALL_ROLES`, `INTERNAL_ROLES`, `canChangeStatus`, `canViewAllProspects`) · `src/actions/prospects.ts` · `src/actions/dashboard.ts` (`EMPLOYEE_ROLES`, `SALES_REP_TRANSITIONS`…) · `src/actions/project.ts` · `src/actions/status.ts` · `src/actions/messages.ts` · `src/actions/profile.ts` (insert `role: "sdr"` — fonction retirée au §2.4, ne pas double-travailler) · `src/actions/vendor.ts` · `src/actions/commissions.ts` (commentaires) · `src/lib/commission.ts` · `src/auth.ts` (si référence) · tests `*.test.ts` (grep `vendeur`).

**Fait =** `grep -r "vendeur" src/ scripts/ *.ts` → **zéro occurrence** (hors migrations SQL historiques) · `npx tsc --noEmit` OK · `npm test` OK.

### 2.2 Suppression d'un lien d'entretien — `src/actions/interviews.ts`
```ts
export type DeleteInterviewLinkResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "failed" };
export async function deleteInterviewLink(id: string): Promise<DeleteInterviewLinkResult>
```
- Zod uuid → sinon `invalid`/`not_found` ; **CEO seul** (miroir `createInterviewLink`).
- Si `job_applications.interview_id` référence la ligne → d'abord `UPDATE job_applications SET interview_id = NULL WHERE interview_id = $id` (le driver `neon-http` n'a **pas** de `db.transaction()` : deux statements séquentiels), puis `DELETE interviews WHERE id = $id`.
- Audit `interview.deleted` non fatal, jamais le token.

**Fait =** action présente, `tsc` OK, appel refusé pour tout rôle non-CEO.

### 2.3 Recrutement d'un candidat — `src/actions/recrutement.ts`
```ts
export type RecruitCandidateResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" | "mail_failed" | "failed" };
export async function recruitCandidate(
  input: { applicationId: string; locale: Locale },
  actor: { id: string; role: Role },
): Promise<RecruitCandidateResult>
```
Séquence (motif `inviteToInterview`) : Zod → **CEO seul** → candidature existe, `status ∈ {nouveau, invite}` sinon `invalid` → invitation **réutilisée** si ligne `(email, role='sdr', used_at IS NULL)` sinon insert (`randomBytes(32)`, `expiresAt = +48 h`, `applicationId`, `projectId: NULL`) → `sendMail` (FR/EN via dict, lien absolu `${SITE_URL}/{locale}/invitation/{token}` — suivre l'usage existant de `SITE_URL` dans `recrutement.ts`) → échec mail = **`mail_failed` SANS UPDATE de statut** (le CEO peut réessayer) → `UPDATE job_applications SET status='recrute', recruited_at=now()` + audit non fatal.

**Fait =** recruter une candidature `invite` crée une invitation `sdr` + bascule `recrute` ; e-mail journalisé en dev.

### 2.4 Activation généralisée + invitations client par e-mail — `src/actions/invitations.ts`
- `createClientInvitation(input, actor)` : `input` gagne **`locale: Locale`** ; succès devient `{ ok: true; token: string; expiresAt: number; mailSent: boolean }` (insert/réutilisation **inchangés** + `role: "client"` + `sendMail` FR/EN ; échec mail → `mailSent: false`, jeton retourné pour copie manuelle).
- `activateClientAccount` → **`activateAccount`** (contrat inchangé : `{ ok: true } | { ok: false; code: "invalid" | "expired" | "used" | "duplicate" }`) : le **rôle vient de la ligne d'invitation** ; `role='client'` → exige `projectId` non nul (`defaultProjectId`), `role='sdr'` → sans projet ; `status: "active"` direct. Zod d'entrée : restreindre `role ∈ {sdr, client}` à la lecture (une ligne `ceo` ne doit jamais pouvoir être activée).

**Fait =** un jeton `sdr` crée un compte SDR actif ; un jeton `client` crée un compte client rattaché à son projet ; un jeton expiré → `expired`.

### 2.5 Suppression de l'inscription libre — `src/actions/profile.ts`
Retirer `applyAsCandidate` (+ types `ApplyCandidateInput/Result` associés). Laisser `updateProfile` intact.

**Fait =** plus aucune fonction d'inscription publique ; `tsc` OK.

---

## 3. UI — **sous-agents Frontend** (4 pistes, fichiers disjoints)

### FE-A — Dictionnaires & types (contenu uniquement)
Fichiers : `src/content/platform/fr.ts`, `src/content/platform/en.ts`, `src/content/platform/types.ts`.
- `statuses.role` : `vendeur` → `sdr` (libellé « SDR » FR/EN).
- Section des recrutements (celle portant `inviteAction`) : + `recruitAction`, `recruiting`, `recruitSuccess`, `recruitError`, + libellé de statut `recrute` (FR « Recruté » / EN « Hired »).
- `interviews` : + `delete`, `deleting`, `deleteConfirm` (FR/EN symétriques).
- `auth.invitation` : + `email: { sdr: { subject, body }, client: { subject, body } }` (placeholders `{{name}}`, `{{link}}` ; corps FR/EN rédigés, ton factuel) ; revoir `title` pour qu'il vaille « créer votre compte » (plus spécifique « client »).
- `types.ts` : types de ces clés ajoutés (le type rend toute omission non compilable).

**Fait =** `tsc --noEmit` OK (un dict incomplet casse la compilation).

### FE-B — Recrutement, activation, désinscription
Fichiers : `src/components/app/ApplicationsPanel.tsx`, `src/components/app/client/ActivateForm.tsx`, `src/app/[locale]/(auth)/invitation/[token]/page.tsx`, `src/app/[locale]/(auth)/inscription/` ( **dossier supprimé** ), `src/components/app/LoginForm.tsx`.
- **ApplicationsPanel** : bouton **« Recruter »** par ligne (`recruitAction`), désactivé pendant l'appel, retour `role="status"`/`role="alert"` (`recruitSuccess`/`recruitError`), `router.refresh()` ; masqué si `status ∈ {refuse, recrute}` ; **passe responsive carte < md** (liste actuelle en `<table>` : cards label/valeur sous `md`, tableau conservé ≥ md).
- **ActivateForm** : appel `activateAccount` (plus `activateClientAccount`), libellés génériques (dict `auth.invitation`), e-mail du destinataire **pré-affiché en lecture seule** si exposable — sinon conservé tel quel (le jeton porte l'e-mail, aucune saisie d'e-mail).
- **`/inscription` supprimé** + lien `LoginForm` → **retiré** (le CTA de connexion pointe vers `/connexion` seul ; vérifier les autres références : aucune connue hors `LoginForm`).

**Fait =** flow complet recruter→e-mail→activation SDR jouable ; `/fr/inscription` → 404.

### FE-C — Landing (MYKS + bouton mobile)
Fichiers : `src/content/fr.ts`, `src/content/en.ts`, `src/content/types.ts`, `src/components/sections/CaseStudyCard.tsx`.
- Item `myks-radio` **mis en commentaire** (FR + EN) ; JSDoc `types.ts` « 5 items » → « 4 items ».
- Bouton « Visiter le site » : classes passent à `opacity-100 translate-y-0 md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0 md:group-focus-within:opacity-100 md:group-focus-within:translate-y-0` → **toujours visible < md**, révélé au survol/focus ≥ md (place déjà réservée, aucun saut).

**Fait =** 4 cartes en FR et EN ; à 375 px le bouton est visible sans interaction.

### FE-D — Responsive CRM : pipeline & prospects
Fichiers : `src/components/app/PipelineTable.tsx`, `src/components/app/FilterBar.tsx`, `src/app/[locale]/(app)/espace/prospects/page.tsx`, `…/prospects/nouveau/page.tsx`, `…/prospects/[id]/page.tsx`, `…/prospects/[id]/fiche/page.tsx` (+ éventuels composants enfants de `src/components/app/vendor/` et `src/components/app/prospect/` rencontrés).
- **Règle responsive unique** : `< md` → chaque ligne devient une **carte** (libellé `.micro` + valeur, empilée, `min-h` confortable, cibles ≥ 44 px) ; `≥ md` → tableau actuel **inchangé** (`hidden md:table` + `md:hidden` pour les cards).
- **Fiche prospect** : + carte **« Envoyer le lien d'accès client »** (visible si statut `client_actif`/`en_livraison`) : bouton d'envoi, état `sending`, retour `recruitSuccess`-like (`mailSent: false` → afficher le lien copiable, repli v1), appelle `createClientInvitation` avec `locale`.
- `FilterBar` : chips scrollables/étiquetées, champs pleine largeur en mobile.
- Formulaires (nouveau prospect, fiche) : `grid-cols-1` en mobile, boutons pleine largeur.

**Fait =** à 375 px, aucune coupure horizontale, pipeline lisible en cartes.

### FE-E — Responsive CRM : dashboard, équipe, commissions, portail, shell
Fichiers : `src/app/[locale]/(app)/espace/tableau-de-bord/page.tsx`, `…/espace/equipe/page.tsx`, `…/espace/commissions/page.tsx`, `…/espace/projet/page.tsx`, `…/espace/profil/page.tsx`, `src/components/app/commission/CommissionQueue.tsx`, `src/components/app/ProfileForms.tsx`, `src/components/app/AppShell.tsx`, `src/components/app/Topbar.tsx` (vérification seule).
- Même règle `< md` cartes / `≥ md` tableau pour les 4 tableaux restants (dashboard, équipe, commissions queue, classements).
- `AppShell` : `main` → `p-4 sm:p-6 lg:p-8` ; grilles `gap-4 sm:gap-6`.
- Topbar : déjà un `Sheet` mobile — **vérifier** uniquement (libellés, cibles).

**Fait =** toutes les pages `/espace/*` visitables à 375 px sans scroll horizontal.

---

## 4. Tests — **sous-agent Tester** (fin de module)

1. Purge vérifiée (2 users, 1 candidature, tables vides) · seed neutralisé.
2. `/fr/inscription` → 404 ; aucun lien vers elle.
3. E2E recrutement : candidature SDR → entretien → « Recruter » → e-mail (dev log) → `/invitation/{token}` → compte `sdr` actif → connexion.
4. E2E client : fiche prospect éligible → envoi → activation → compte `client` rattaché au projet.
5. Lien d'entretien : bouton supprimer + confirmation → ligne disparue ; un lien référencé par une candidature est détaché puis supprimé.
6. Landing : 4 cartes, MYKS absent, bouton « Visiter » visible à 375 px.
7. Responsive : passes mobile 375 px sur `/espace/*` (tableau-de-bord, prospects, équipe, commissions, entretien, recrutement, profil, projet).
8. Rôles : `statuses.role` affiche « SDR » ; aucun « vendeur » en UI.
> ⚠ Identifiants admin à fournir par l'utilisateur au moment du test ; à défaut, tests publics + rapports.

---

## Partition des fichiers (aucun fichier sur deux pistes)

| Fichier | Piste |
|---|---|
| `scripts/purge-test-data.ts` (créé), `src/lib/db/schema.ts`, `drizzle/0003_*.sql`, `src/lib/db/seed.ts`, `src/lib/db/seed-data.ts` | **DB** |
| `src/actions/interviews.ts`, `src/actions/recrutement.ts`, `src/actions/invitations.ts`, `src/actions/profile.ts`, `src/lib/permissions.ts`, `src/actions/{prospects,dashboard,project,status,messages,vendor,commissions}.ts`, `src/lib/commission.ts`, `src/auth.ts`, tests `*.test.ts` | **Backend** |
| `src/content/platform/{fr,en,types}.ts` | **FE-A** |
| `src/components/app/ApplicationsPanel.tsx`, `src/components/app/client/ActivateForm.tsx`, `src/app/[locale]/(auth)/invitation/[token]/page.tsx`, `src/app/[locale]/(auth)/inscription/**` (suppr.), `src/components/app/LoginForm.tsx` | **FE-B** |
| `src/content/{fr,en}.ts`, `src/content/types.ts`, `src/components/sections/CaseStudyCard.tsx` | **FE-C** |
| `PipelineTable.tsx`, `FilterBar.tsx`, `espace/prospects/**`, composants vendor/prospect rencontrés | **FE-D** |
| `espace/{tableau-de-bord,equipe,commissions,projet,profil}/**`, `commission/CommissionQueue.tsx`, `ProfileForms.tsx`, `AppShell.tsx` (+ lecture `Topbar.tsx`) | **FE-E** |

> Hors périmètre absolu : `src/remotion/**`, `scripts/*.mjs` (vidéo), `public/fonts/**`, `logo/**`, `package.json` (sauf si `db:seed` exige un flag — non retenu).

## Contrats inter-pistes (figés — les agents ne les modifient pas)

- **C1** `deleteInterviewLink(id)` → `{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "failed" | "invalid" }` (§2.2).
- **C2** Schéma : `invitations.{role, projectId?, applicationId?}`, `job_applications.recruited_at`, enum `role = ceo|manager|commercial|sdr|client`, `application_status + recrute` (§1.2).
- **C3** `recruitCandidate({ applicationId, locale }, actor)` → `{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "invalid" | "mail_failed" | "failed" }` (§2.3).
- **C4** `activateAccount({ token, name, password }, ip?)` → `{ ok: true } | { ok: false; code: "invalid" | "expired" | "used" | "duplicate" }` (§2.4).
- **C5** `createClientInvitation({ prospectId, email, name, locale }, actor)` → `{ ok: true; token; expiresAt; mailSent } | { ok: false; code: "forbidden" | "not_found" | "invalid" }` (§2.4).
- **C6** Clés dict (FR/EN symétriques) : `interviews.{delete,deleting,deleteConfirm}`, recrutement `{recruitAction,recruiting,recruitSuccess,recruitError,status.recrute}`, `statuses.role.sdr`, `auth.invitation.email.{sdr,client}.{subject,body}` (§FE-A).
- **C7** `Role` reste dérivé de l'enum (`src/lib/permissions.ts`) : toute trace `vendeur` restante casse la compilation.

## Sécurité & edge cases

- **Anti-takeover** : l'activation lit l'e-mail **uniquement** dans la ligne d'invitation ; jamais de saisie d'e-mail ; email déjà pourvu → `duplicate`.
- **Jeton** : 256 bits, 48 h, usage unique (`used_at` + garde `IS NULL` à l'update), jamais journalisé.
- **RBAC** : `recruitCandidate` / `createClientInvitation` / `deleteInterviewLink` = **CEO seul**, acteur revalidé par Zod (motif `invitations.ts`). `ROUTE_ACCESS` inchangée.
- **Purge** : script idempotent, UUID de conservation **hardcodés**, ordre FK explicite (§1.1), `default_project_id` nullé avant suppression des projets.
- **Migration enum** : séquence `RENAME TYPE` + `CREATE` + `USING CASE` (§1.2) — jamais de simple `RENAME VALUE` (bloquant hors transaction chez Drizzle).
- **Sessions JWT** : un ancien JWT portant `vendeur` devient invalide (`isRole`) → reconnexion forcée (attendu, 2 comptes survivants).
- **Échec e-mail** : jamais bloquant pour l'utilisateur final — repli « copier le lien » côté CEO (`mailSent` / `mail_failed`).
- **`neon-http`** : aucun `db.transaction()` — écritures dépendantes en `db.batch` ou séquentielles (motif existant).
- **i18n** : FR/EN strictement symétriques ; aucun message serveur en clair (codes bruts uniquement).
- **Mobile** : cibles ≥ 44 px, aucun `overflow-x`, `prefers-reduced-motion` déjà global.

## Ordre d'exécution

1. **DB** (bloquant, sérialisé) : purge → migration → seed guard → vérifications SQL.
2. **En parallèle, dès que DB rend la main** : **Backend** ∥ **FE-A** ∥ **FE-C** (fichiers disjoints).
3. **Dès que Backend + FE-A ont rendu main** : **FE-B** ∥ **FE-D** ∥ **FE-E**.
4. Revue croisée Lead : `grep -r "vendeur" src` = 0 · `npm run lint` · `npx tsc --noEmit` · `npm test` · `npm run build`.
5. **Tester** (E2E Playwright, identifiants admin à fournir).

## Validation finale (auto-revues)

Chaque agent termine par **`AUTO-OK`** (périmètre respecté, TypeScript strict, conventions du repo, zéro fichier hors partition) ; sinon **`AUTO-KO`** + tâche de correction isolée. Chaque tâche `AUTO-OK` est commitée sérialisément au format Conventional Commits (`feat(db): …`, `feat(api): …`, `feat(ui): …`, `fix(mobile): …`…).
