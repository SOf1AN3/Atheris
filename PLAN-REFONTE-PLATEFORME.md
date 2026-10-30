# PLAN-REFONTE-PLATEFORME.md

> Refonte globale — parcours SDR. Document **exécutable par un contexte frais**.
> `PLAN.md` reste le référentiel historique — ne pas l'écraser.

---

## 0. ÉTAT ACTUEL

**Terminé et poussé :**

| Lot | Commit | Contenu |
|---|---|---|
| Plan | — | ce document |
| **L1** | `2ace1be` | Schema : `users.verified_at` + `identity_rejection_reason`, tables `payout_details` / `identity_docs` / `contract_consents`, `exam_sessions.expires_at`. **Migration 0008 appliquée en prod** (postflight ✓) |
| **L2** | `0f3a31d` | Écran **Start** + fenêtre 3 j + `beginExam` + modèle `exam_invite`. E2E **13/13** |

### ✅ AUCUNE AUTRE MIGRATION N'EST NÉCESSAIRE

Vérifié sur la base réelle : `users.verified_at`, `identity_rejection_reason`,
`exam_sessions.expires_at` présentes ; `payout_details`, `identity_docs`,
`contract_consents` créées. **Les lots L3→L11 n'ont aucun ajout de schéma.**
⇒ Ne lancez **jamais** `db:generate` / `db:migrate` sans nouvel arbitrage client.

**État local** : `main` à jour, arbre propre. Serveur de prod (`next start`)
sur `127.0.0.1:3000`.

---

## 1. ⚠️ CONTRAINTES NON NÉGOCIABLES (leçons payées)

Ces règles ont causé des bugs réels. Elles sont **dans le code et les tests**,
mais un contexte frais doit les connaître AVANT d'écrire.

### C1 — Directive `"use server"` + **uniquement** des exports async
Un fichier de Server Actions privé de la directive n'est **pas** transformé :
il est bundlé **côté navigateur**. Conséquences réelles observées :
- `process.env.DATABASE_URL` = `undefined` → 0 ligne écrite, échec silencieux ;
- le driver DB fuyait dans le bundle public (**472 kB → 172 kB** après fix).
- **`tsc` ne détecte PAS cette contrainte** — seul `next build` échoue.

→ `src/actions/use-server.test.ts` vérifie les 22 fichiers (directive, position,
absence d'export sync). **Ne pas supprimer ce test.**

### C2 — Aucune string en dur
Tout libellé passe par `src/content/*` (landing) ou `src/content/platform/*`
(plateforme). Les Server Actions retournent des **codes bruts** (`"forbidden"`,
`"invalid"`…), la traduction est côté client.

### C3 — neon-http : pas de transaction
Aucun `db.transaction()`. Pour des écritures groupées : `db.batch()` avec
annotation **`BatchItem<"pg">` explicite** (motif de `notify.ts`) — sinon
`map()` ne produit pas le tuple attendu.
Pour l'idempotence / les verrous : **UPDATE conditionnel + `.returning()`** —
0 ligne = `conflict`. Motif : `decideApplication`, `beginExam`, `submitExam`.

### C4 — Jetons publics
`randomBytes(32).toString("hex")` → motif `/^[a-f0-9]{64}$/`, colonne
`UNIQUE` ⇒ **404 générique sans énumération**. Routes publiques : **jamais
401/403**, toujours 404 muet.

### C5 — DB de PRODUCTION
Migrer uniquement sur **feu vert explicite du client**. Procédure imposée :
`scripts/preflight-l1.mjs` (lecture seule) → `npm run db:migrate` →
postflight (tables/colonnes/comptes intacts).

### C6 — Ne jamais envoyer de mail depuis un test
`atherislabs.com` appartient à un **tiers** (MX réel). Les tests utilisent
`@example.com` (RFC 2606). Pour couper tout envoi : **`MAIL_DISABLED=1`**
(env, refus silencieux avant appel réseau, aucun effet par défaut).

### C7 — Tests E2E : `127.0.0.1`, PAS `localhost`
Un serveur **Nuxt d'un autre projet** est sur `::1:3000`. `localhost` le
rejoint et renvoie 404 à tort. Toujours `http://127.0.0.1:3000`.

### C8 — Nettoyage des lignes de test
Tout script E2E crée des lignes en base **de prod**. Nettoyage en `finally`
+ **vérification** du nettoyage. Filtre sur un domaine réservé (`example.com`).
Modèle : `scripts/e2e-exam-ui.mjs`, `scripts/verify-*.mjs`.

### C9 — Vérifier par le navigateur, pas seulement par `tsc`
`tsc` + `eslint` + `next build` passent alors que le produit est cassé
(cas `recommended` affiché au candidat, message d'erreur trompeur).
**Tout comportement visible se prouve par E2E Playwright.**

---

## 2. DÉCISIONS ARBITRÉES PAR LE CLIENT

| # | Décision |
|---|---|
| **D1** | **Barème progressif 10 → 20 % est autoritaire**, aucun plancher 20 $. Aucune modification de `commission.ts`, ni de la section 4 de l'examen, ni du PDF. |
| **D2** | Suppression entretien : **code + UI supprimés, table conservée**. |
| **D3** | Pièce d'identité : **upload de fichier** (pas de caméra). |
| **D4** | Coordonnées bancaires : **stockées en clair, masquées à l'affichage**. |
| **D5** | Contrat : **page privée SDR, consentement horodaté**, non bloquant. |
| **D6** | Après 3 j : **lien invalide, pas de recrutement**. |
| **D7** | Pièce refusée : **notification + motif + re-upload**. |
| **D8** | Colonne `statut` de la liste candidatures → **pastille « Vérifié »**. |

## 3. HYPOTHÈSES (corrigeables, non arbitrées)

- **H1** — fenêtre 3 j depuis la **candidature** (implémenté dans L2).
- **H2** — `started_at` repoussé au clic Start (implémenté dans L2).
- **H3** — « Archivés » = **filtre** groupant `recrute` + `refuse` +
  `exam_failed` — **pas un statut** (zéro migration).
- **H4** — commission gelée : `commissions.paid` exige `users.verified_at`.
- **H5** — nom verrouillé par la pose de `verified_at`.
- **H6** — contrat non bloquant, requis pour le 1ᵉʳ virement.
- **H7** — « rester connecté » = `maxAge` 30 j (JWT Auth.js).
- **H8** — anti-copie = `user-select: none` : **frein, pas protection**.
  Ne jamais présenter comme une sécurité.

---

## 4. CONTRATS INTER-PISTES

**Menu / routes** — 3 endroits à synchroniser pour TOUTE nouvelle page plateforme :
1. `src/content/platform/{fr,en}.ts` → `nav.ceo[]` : `{ label, href }`
2. `src/components/app/Sidebar.tsx` → `NAV_ICONS` : `href` → icône Lucide
3. `src/lib/permissions.ts` → tableau `{ prefix, roles }`
   (existant : `{ prefix: "/entretien", roles: ["ceo"] }`, `{ prefix: "/recrutement", roles: ["ceo"] }`)

**Route à créer en commun** : `/{locale}/espace/examen` (page revue CEO).
→ La piste A crée la page ; **la piste B ajoute l'entrée de menu + l'icône +
la permission**, sous contrat sur ce chemin exact. C'est le seul lien entre
les deux pistes de la vague 1.

**i18n — point critique de parallélisation :**
- `src/content/{types,en,fr}.ts` (landing) — contendants : A, D
- `src/content/platform/{types,en,fr}.ts` (plateforme) — contendants : A, C, E, F

→ **Règle : un seul agent écrit dans un fichier i18n à la fois.** C'est
pourquoi les vagues sont découpées comme ci-dessous, et pourquoi les pistes
soustractive (B) sont tenues de **n'ajouter AUCUNE clé**.

---

## 5. VAGUES — PROPRIÉTÉ DES FICHIERS

**Règle d'or : aucun fichier n'appartient à deux agents d'une même vague.**
Si deux tâches touchent le même fichier, elles sont dans des vagues distinctes.

### VAGUE 1 — parallèle (2 agents, fichiers strictement disjoints)

#### Piston A — Examen : UX + interface CEO (**L3 + L4**)
**Fichiers OWNED :**
- `src/components/recrutement/ExamForm.tsx`
- `src/components/recrutement/ExamStart.tsx`
- `src/actions/exams.ts`
- **NOUVEAU** `src/app/[locale]/(app)/espace/examen/**` (page + détail)
- **NOUVEAU** composant de revue (ex. `src/components/app/ExamReviewPanel.tsx`)
- `src/content/{types,en,fr}.ts` (clés `exam*`)
- `src/content/platform/{types,en,fr}.ts` (clés revue + entrée menu `nav.ceo`)

**Tâches :**
- **L3a** — Bouton *Previous* : retirer la flèche de droite (seule `←`).
- **L3b** — Anti-copie : `user-select: none` (et `-webkit-user-select`) sur les
  **énoncés** des questions (pas sur les champs : on doit pouvoir écrire).
  Commenter honnêtement que c'est un frein, pas une protection (H8).
- **L3c** — Relecture de l'écran de confirmation 24 h (wording conforme à
  l'engagement « revue sous 24 h »).
- **L4a** — Page `/espace/examen` : liste des candidats **en cours** puis
  **soumis** (filtre H3 : `recrute`/`refuse`/`exam_failed` = archivés).
- **L4b** — Clic sur un candidat → ses **réponses par section** (réutiliser
  le rendu construit dans `ApplicationsPanel`, extraire-le plutôt que dupliquer).
- **L4c** — En fin de réponses : boutons **Recruter** / **Refuser** avec
  **popup de confirmation** (un clic ne doit jamais recruter/refuser par erreur).
- **L4d** — Après décision : le candidat passe en **Archivés** (H3 — filtrage,
  pas de statut nouveau).
- **L4e** — Menu + icône + permission pour `/espace/examen`.

**Interdits :** ne pas toucher `ApplicationsPanel.tsx`, `recrutement.ts`,
`permissions.ts`, `Sidebar.tsx` (⇒ ceux de B). **Ne pas écrire dans `content/*` autre que le bloc `exam`.**

---

#### Piston B — Retrait entretien + nettoyage recrutement (**L5 + L6**)
**Fichiers OWNED :**
- `src/components/app/ApplicationsPanel.tsx`
- `src/app/[locale]/(app)/espace/recrutement/page.tsx`
- `src/actions/recrutement.ts`
- `src/lib/recruitment-templates.ts` (+ `.test.ts`)
- `src/lib/permissions.ts`
- `src/components/app/Sidebar.tsx`
- **SUPPRESSION** :
  - `src/app/[locale]/(app)/espace/entretien/**`
  - `src/app/[locale]/entretien/[token]/page.tsx`
  - `src/components/app/InterviewLinks.tsx`
  - `src/actions/interviews.ts`
  - `src/lib/meet.ts`
  - `src/lib/slots.ts` + `src/lib/slots.test.ts`

**Tâches :**
- **L6** — Supprimer intégralement le parcours entretien (routes, composants,
  actions, libs, tests) et toutes leurs références.
  - **La table `interviews` RESTE** dans `schema.ts` (D2) — **ne pas toucher
    `src/lib/db/schema.ts`**, ni la colonne `job_applications.interview_id`.
  - Retirer `{ prefix: "/entretien", roles: ["ceo"] }` de `permissions.ts`.
  - Retirer l'item `nav.ceo` `"/espace/entretien"` et l'icône `NAV_ICONS["/espace/entretien"]`.
  - Retirer `inviteToInterview` de `recrutement.ts` + son import `createInterviewLink`.
  - Retirer la branche `kind: "invite"` du modal et le bouton correspondant.
  - `absoluteInterviewUrl` + le modèle `invite` : retirer aussi (ils ne servent
    plus qu'à l'entretien), et corriger `recruitment-templates.test.ts`.
- **L5a** — Retirer les boutons **Recruter** / **Refuser** de la page
  recrutement (ils vivent désormais en L4).
- **L5b** — Retirer la **colonne créneaux** (`slots`/`booked`) de la liste.
- **L5c** — **D8** : la colonne `statut` devient une **pastille « Vérifié »**
  (`users.verified_at != null`). Attention : `status` **reste en base** (pilote
  le RBAC du middleware) — seul l'affichage change.
- **Ajouter l'entrée de menu `/espace/examen`** (contrat §4 : `nav.ceo` +
  `NAV_ICONS` + `permissions.ts`) — chemin exact `"/espace/examen"`.

**Contrainte ABSOLUE (parallélisme) :** cette piste **n'ajoute AUCUNE clé
i18n**. Elle retire et réutilise les libellés existants. Si une clé semble
indispensable, **la noter dans un commentaire de restitution** — le Lead
l'ajoutera dans une passe i18n sérialisée.

---

### VAGUE 2 — parallèle (2 agents, fichiers disjoints)

#### Piston C — Connexion (**L10**)
**OWNED :** `src/components/app/LoginForm.tsx`,
`src/app/[locale]/(auth)/connexion/page.tsx`, `src/actions/auth.ts`,
**NOUVEAU** route/action de réinitialisation, `src/content/platform/*`.

- « Rester connecté » : `maxAge` 30 j sur le JWT Auth.js (H7).
- **Mot de passe oublié** : flux complet — email → jeton → page de
  réinitialisation → nouveau mot de passe. Il n'existe **aucun** flux aujourd'hui
  (un simple texte « Contact your administrator » = `forgotNote`).
- Réutiliser `sendMail` + `recruitmentTemplates` (motif existant), jamais de
  string en dur, `MAIL_DISABLED` respecté.

#### Piston D — Page contrat (**L11**)
**OWNED :** **NOUVEAU** page de contrat, **NOUVEAU** action de consentement,
`src/content/{types,en,fr}.ts` (**pas** `platform/*` — c'est le fichier de C).

- Page **privée SDR** (dans `(app)/espace/…`), **non bloquante** (D5/D6).
- **9 clauses rédigées sur le barème PROGRESSIF 10→20 %** (D1) — pas de
  « 10 % + plancher 20 $ ». Reformulation fournie en §6.
- Case à cocher obligatoire → `contract_consents` : horodatage,
  **IP lue côté serveur** (jamais depuis le payload), version figée,
  copie par e-mail (best effort).

---

### VAGUE 3 — séquentiel (fichiers partagés ⇒ pas de parallélisme)

#### Piston E — KYC + Profil (**L7 → L8**, dans cet ordre)
**OWNED :** `src/components/app/ProfileForms.tsx`,
`src/app/[locale]/(app)/espace/profil/page.tsx`, **NOUVELLES** actions,
`src/content/platform/*`.

- **L7** — upload de pièce (motif CV existant, bytea ≤ 5 Mo), visu CEO,
  **Vérifier** / **Refuser avec motif** → `users.verified_at` +
  `identity_rejection_reason` + `identity_docs` + notification + re-upload.
- **L8** — Profil en **3 sections** : *Infos personnelles* /
  *Vérification d'identité* / *Moyen de paiement*.
  - **Largeur** : les champs prennent toute la largeur → colonne contrainte
    (ex. `max-w-[560px]`), c'est explicitement signalé comme moche.
  - Nom modifiable **tant que `verified_at` est nul**, verrouillé ensuite (H5).
  - **Payout Settings** : Wise / PayPal / Banque (SWIFT-IBAN), badges
    *No payout method configured* / *Payout method ready*, **masquage**
    (`*** 4821`, `a***o@…`) — masquage = affichage, pas protection (D4).

#### Piston F — Équipe (**L9**) — **après E**
**OWNED :** `src/app/[locale]/(app)/espace/equipe/page.tsx`,
`src/actions/dashboard.ts`, `src/content/platform/*`.

- Clic sur un membre → ses **coordonnées bancaires** (dépend de `payout_details`,
  créé par L8 ⇒ **d'où l'ordre E → F**).
- Pastille **« Vérifié »** remplaçant la colonne `statut`.

---

## 6. FORMULATION DU CONTRAT (D1 — à rédiger telle quelle)

> **Modalités de rémunération** : commission **progressive** calculée sur le
> nombre cumulé de clients payants — **10 %** (0–4 clients), **12,5 %** (5–9),
> **15 %** (10–19), **20 %** (20 et plus). Le taux applicable à un deal est
> **figé** au moment où l'acompte est encaissé et ne rétroagit jamais.
> **Aucun plafond** de gains.

---

## 7. PROTOCOLE DE VÉRIFICATION & COMMIT

**Par agent, avant de rendre :**
1. `npx tsc --noEmit`
2. `npx eslint <fichiers>`
3. `npm test` (142 tests actuels — ne jamais en perdre)
4. `npm run build` (34 pages — **seul moyen de voir les erreurs C1**)
5. Si comportement visible → **E2E Playwright sur `127.0.0.1:3000`**

**Commits : uniquement le Lead, sérialisés** (jamais deux `git add`/`commit`
en parallèle — course sur l'index). Message Conventional Commits en français.

**Ordre des vagues :** 1 (A ∥ B) → 2 (C ∥ D) → 3 (E → F).
Après chaque vague : Lead fait tsc + tests + build + revue des fichiers touchés,
puis commit.
