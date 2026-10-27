# PLAN-RECRUTEMENT-CEO.md — Gestion des recrutements (espace CEO)

> **Statut : 🟡 EN ATTENTE DE VALIDATION EXPLICITE** — aucun code avant feu vert.
> Version 1.0 — 26/10/2026. Fichier dédié : le `PLAN.md` (Lot 2) est en attente
> de validation et reste **intouché**.
> ⚠ `src/remotion/`, `VIDEO.md`, `package.json`, `scripts/` : **HORS périmètre**.

---

## Contexte & besoin métier

Le CEO veut piloter les recrutements **depuis l'espace connecté** :

1. quand un candidat postule sur `/{locale}/recrutement`, sa candidature
   **apparaît en liste** dans une nouvelle page CEO ;
2. il peut **voir les informations et le dossier** (CV) du candidat ;
3. un bouton **« Inviter à un entretien »** ouvre un email **personnalisé et
   éditable**, dans lequel **un lien de réservation de créneau est généré
   automatiquement** ;
4. un bouton **« Refuser »** envoie au candidat un email l'informant que son
   dossier a été étudié mais n'a pas été retenu.

### Constats d'architecture (analyse du code existant)

- ❌ **Aucune candidature n'est stockée** : `applyToJob()`
  (`src/actions/careers.ts`) n'envoie qu'un e-mail au recruteur avec le CV en
  pièce jointe. Il n'existe donc **aucune liste à afficher** — la persistance
  est le chantier racine du plan.
- ✅ **Le flux d'entretien existe déjà et est éprouvé** :
  `createInterviewLink()` (génération de jeton 32 bytes), la page publique
  `/{locale}/entretien/[token]` (grille 9 h → 16 h heure algérienne, fenêtre
  J+1 → J+3, anti-double-réservation par index unique partiel), le récap
  recruteur, la page CEO `/espace/entretien`. **On le réutilise tel quel.**
- ✅ `sendMail` (Resend, texte + pièces jointes mémoire) et le motif de route
  `/api/documents/[id]` (404 muet, `no-store`) sont disponibles.
- ⚠ Tous les mails partent aujourd'hui vers l'**admin** ; ici le destinataire
  est le **candidat** — l'adresse est relue **en base** côté serveur, jamais
  transmise par le client.

### Décisions arrêtées (réponses utilisateur)

| # | Sujet | Décision |
|---|---|---|
| D1 | Lien de réservation | **Réutiliser `/entretien/[token]`** (aucune nouvelle grille) |
| D2 | Persistance | **Table DB + CV en base** (bytea ≤ 5 Mo, motif `documents`) |
| D3 | Email invitation | **Éditable + template mémorisé** en base |
| D4 | Email refus | **Éditable, sans motif** (pas de champ raison) |
| D5 | Parcours | **Nouveau → Invité → Refusé** (3 statuts) |
| D6 | Offre | **Une seule** (Sales Development Representative) — pas de champ « poste » |
| D7 | Langue email | **Selon la locale de candidature** (mémorisée au dépôt) |
| D8 | Notification admin | **Conservée** (l'e-mail actuel de `applyToJob` reste) |

**Décisions que je prends sans vous déranger** : le lien d'entretien est généré
**au moment de l'envoi** (pas à l'ouverture du modal) pour éviter des liens
orphelins si le CEO annule · un **ré-envoi** d'invitation est possible (un
nouveau lien est généré) · le CV se **télécharge** (PDF : affichage inline ;
DOC/DOCX : `attachment`) · la page s'appelle **`/espace/recrutement`** et
n'apparaît que dans la nav CEO.

---

## Questions / décisions en attente

Aucune — toutes les questions ont été tranchées (D1 → D8).

---

## Contrats inter-pistes (FIGÉS — le Backend et le Frontend partent ensemble)

### Schéma DB (piste Database — `src/lib/db/schema.ts`, en fin de fichier)

**Enum** `application_status` (export `applicationStatusEnum`) :
`"nouveau" | "invite" | "refuse"`.

**Table `job_applications`** (SQL `job_applications`) :

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK defaultRandom |
| `first_name` / `last_name` | text | NOT NULL |
| `email` | text | NOT NULL |
| `email_norm` | text | NOT NULL (convention `*_norm`) |
| `locale` | text | NOT NULL default `'fr'` (`fr`\|`en`, vérifié en Zod) |
| `message` | text | **nullable** (motivation optionnelle) |
| `status` | `application_status` | NOT NULL default `'nouveau'` |
| `cv_filename` / `cv_mime_type` | text | NOT NULL |
| `cv_byte_size` | integer | NOT NULL (≤ 5 Mo, Zod) |
| `cv_bytes` | `bytea` (helper existant) | NOT NULL |
| `interview_id` | uuid | **nullable** → FK `interviews.id`, `no action` |
| `invited_at` / `rejected_at` | tstz | nullable |
| `created_at` / `updated_at` | tstz | defaultNow (+ `$onUpdate`) |

Index : `status` · `created_at` (décroissant) · `email_norm`.
⚠ `interviews` est déclaré **avant** dans le fichier → aucun cycle TS, thunk
`() => PgColumn =>` conforme au JSDoc existant. Table **autopportante côté
candidature** : supprimer l'entretien ne casse pas la candidature (`no action`).

**Table `recruitment_templates`** (SQL `recruitment_templates`) :

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK defaultRandom |
| `kind` | text | NOT NULL (`'invite'`\|`'reject'`, vérifié en Zod — precedent `client_projects.status`) |
| `locale` | text | NOT NULL (`'fr'`\|`'en'`) |
| `subject` / `body` | text | NOT NULL |
| `updated_by` | uuid | nullable → FK `users.id` |
| `created_at` / `updated_at` | tstz | defaultNow (+ `$onUpdate`) |

**Unique index** `(kind, locale)` → upsert au enregistrement du modèle.
Justification text+Zod (et non enum) : le barème de templates évolue sans
migration, cf. commentaire `clientProjects.status`.

### Types publics des Server Actions (piste Backend — `src/actions/recrutement.ts`)

```ts
export type JobApplicationStatus = "nouveau" | "invite" | "refuse";
export type EmailTemplateKind = "invite" | "reject";

export type JobApplicationListItem = {
  id: string; firstName: string; lastName: string; email: string;
  status: JobApplicationStatus; locale: "fr" | "en";
  cvFilename: string; cvByteSize: number;
  createdAt: string;               // ISO 8601 (jamais de Date côté client)
  invitedAt: string | null; rejectedAt: string | null;
  interview: null | { booked: boolean; startsAt: string | null };
};

export type JobApplicationDetail = JobApplicationListItem & {
  message: string | null; cvMimeType: string;
  cvUrl: string;                   // `/api/applications/{id}/cv`
};

export type SendEmailInput = {
  applicationId: string; subject: string; body: string;
  saveTemplate?: boolean;          // coche « enregistrer comme modèle »
};

// listJobApplications()  → { ok: true; items: JobApplicationListItem[] }
//                        | { ok: false; code: "forbidden" }
// getJobApplication(id)  → { ok: true; item: JobApplicationDetail }
//                        | { ok: false; code: "forbidden" | "not_found" }
// getEmailTemplate(kind, locale) → { ok: true; subject: string; body: string }
//                        | { ok: false; code: "forbidden" }
// inviteToInterview(input) → { ok: true; url: string }
//                        | { ok: false; code: "forbidden" | "invalid" | "not_found"
//                                 | "conflict" | "mail_failed" | "failed" }
// rejectApplication(input) → { ok: true; url: "" }   // même union de codes
```

**Placeholders du corps** (remplacés serveur, jamais par le client) :
`{{prenom}}` · `{{nom}}` · `{{lien}}` (invitation seule). Si le CEO retire
`{{lien}}`, l'action **réinjecte l'URL en fin de message** (le lien est
toujours présent — exigence métier). Corps = **texte brut** (mail.ts) : aucune
injection HTML possible.

### Route CV (piste Backend — `src/app/api/applications/[id]/cv/route.ts`)

`GET` — CEO **seul**, **404 muet** pour tout refus (miroir strict de
`/api/documents/[id]` : session, `status === 'active'`, `role === 'ceo'`),
`Cache-Control: private, no-store`, MIME relu depuis la DB, `inline` pour
`application/pdf`, `attachment` sinon.

---

## 1. Base de données — sous-agent **Database**

Fichiers : **`src/lib/db/schema.ts`** (modifier — append en fin de fichier),
**`drizzle/*`** (généré).

1. Ajouter `applicationStatusEnum`, la table `job_applications` et la table
   `recruitment_templates` **exactement selon le contrat ci-dessus**, avec les
   conventions du fichier (tstz, `*_norm`, thunks `(): PgColumn =>`, commentaires
   FR).
2. `npm run db:generate` (100 % offline) → migration `drizzle/0002_*.sql`.
   ⚠ **DB-PENDING** : `npm run db:migrate` **n'est PAS lancé**
   (`DATABASE_URL` = placeholder), comme pour les lots précédents.

**Fait =** `tsc --noEmit` 0 erreur · migration générée et versionnée.

## 2. Actions & sécurité — sous-agent **Backend**

Fichiers :
- **`src/lib/recruitment-templates.ts`** (créer) + **`src/lib/recruitment-templates.test.ts`** (créer)
- **`src/actions/recrutement.ts`** (créer)
- **`src/actions/careers.ts`** (modifier)
- **`src/app/api/applications/[id]/cv/route.ts`** (créer)
- **`src/lib/permissions.ts`** (modifier : **une ligne**)

1. **`lib/recruitment-templates.ts`** (module **pur**, testable sans DB) :
   - `EMAIL_TEMPLATES` : defaults FR/EN × invite/reject (textes figés §« Textes
     par défaut » ci-dessous) ;
   - `renderTemplate(body, { prenom, nom, lien? })` : remplacement des 3
     placeholders, réinjection finale de `lien` s'il a été retiré ;
   - `saveTemplate` helper d'upsert Drizzle `(kind, locale)` ;
   - tests vitest : remplacement, réinjection, `{{nom}}` inconnu laissé tel quel.
2. **`actions/recrutement.ts`** — gabarit **identique à `interviews.ts`** :
   `activeActor()` interne (session `auth()` + `status active` + rôle `ceo`,
   aucun id/role côté client) · Zod v4 sur chaque entrée · codes bruts ·
   `getDb()` lazy (DB-PENDING).
   - `listJobApplications` : **sans** `cv_bytes` (projection minimale), JOIN
     `interviews` via `interview_id` → `interview: { booked, startsAt }`,
     tri `created_at` DESC, plafond 200 (miroir `LIST_LIMIT`).
   - `getJobApplication` : même garde + `message` + `cvMimeType` + `cvUrl`
     (jamais les octets — ils passent par la route).
   - `getEmailTemplate(kind, locale)` : ligne en base, sinon **default** du
     module (l'UI est pré-remplie dès le premier envoi).
   - `inviteToInterview(input)` :
     1. Zod (uuid, subject 1–200, body 1–10 000) + acteur CEO ;
     2. lecture de la candidature → `not_found` si absente, `conflict` si
        `status = 'refuse'` ;
     3. `createInterviewLink(locale de la candidature)` (réutilisation du flux
        existant : jeton 32 bytes, ligne `interviews` sentinelle) → URL
        **absolue** via `SITE_URL` (const type `sitemap.ts` :
        `process.env.SITE_URL?.trim() || "https://atherislabs.com"`) ;
     4. `renderTemplate(body, …)` puis `sendMail({ to: candidat.email lu EN
        BASE, subject, text })` → échec = `mail_failed` (**aucun** changement de
        statut, le CEO peut réessayer) ;
     5. UPDATE **conditionnelle** `WHERE id = … AND status <> 'refuse'` :
        `status='invite'`, `interview_id`, `invited_at=now()` ;
     6. si `saveTemplate` → upsert `recruitment_templates` (non fatal) ;
     7. audit `application.invited` dans `activities` (non fatal).
   - `rejectApplication(input)` : miroir — pas de lien, états admis `nouveau`
     **et** `invite` (refus après entretien), `conflict` si déjà `refuse`,
     envoi puis UPDATE conditionnelle (`status='refuse'`, `rejected_at`),
     audit `application.rejected`.
   - **Ordre invariable** : e-mail d'abord, écriture ensuite (un échec Resend
     ne doit jamais figer un statut qu'on ne peut plus débloquer).
3. **`actions/careers.ts`** (évolution du contrat public, **rétro-compatible**) :
   - nouveau champ `locale` dans le `FormData` (`z.enum(["fr","en"])`, défaut
     `fr`) ;
   - **après** tous les contrôles fichier et **avant** l'e-mail admin : INSERT
     dans `job_applications` (octets réels, `email_norm` via
     `normalizeEmail`, MIME canonique, filename sanitisé — logique déjà
     présente) ;
   - INSERT en échec → `failed` (aucun mail admin : jamais de notification
     orpheline) ; e-mail admin en échec → **`ok: true` quand même** (la
     candidature est en base, c'est la source de vérité ; l'échec est journalisé)
     — **changement assumé** par rapport au comportement actuel ;
   - rate-limit **inchangé** (1 tentative envoyée / 60 s / IP).
4. **`api/applications/[id]/cv/route.ts`** : miroir de `documents/[id]`
   (404 muet partout, `z.uuid()` sur l'id, `no-store`).
5. **`lib/permissions.ts`** : ajouter
   `{ prefix: "/recrutement", roles: ["ceo"] }` dans `ROUTE_ACCESS` (+ note de
   commentaire miroir de l'entrée `/entretien`).

**Fait =** `tsc --noEmit` 0 · `npm run test` vert (nouveaux tests templates) ·
aucune string i18n dans les actions (codes bruts uniquement).

## 3. UI CEO — sous-agent **Frontend**

Fichiers :
- **`src/app/[locale]/(app)/espace/recrutement/page.tsx`** (créer)
- **`src/components/app/ApplicationsPanel.tsx`** (créer, client)
- **`src/components/app/ApplicationEmailModal.tsx`** (créer, client)
- **`src/components/recrutement/ApplyForm.tsx`** (modifier : **un champ caché**)
- **`src/content/platform/types.ts`** · **`fr.ts`** · **`en.ts`** (modifier)

1. **Page** — miroir structurel de `espace/entretien/page.tsx` :
   `dynamic = "force-dynamic"` · garde session/role **+ `role !== 'ceo'` →
   `notFound()`** · `generateMetadata` sur `dict.recruitment.title` ·
   `listJobApplication`s() → projection `InterviewRow`-like · dates formatées
   **ici** (`Intl`, `Africa/Algiers`, motif `entretien/page.tsx`) ·
   `{ ok:false }` → bloc `common.retry`.
2. **`ApplicationsPanel`** (client) — liste type tableau (motif
   `InterviewLinks`) : candidat · email · statut (badge) · date de dépôt ·
   créneau réservé (si `interview.booked`) · **filtre par statut** ·
   **état vide** dédié. Chaque ligne : bouton « Dossier » (ouvre le détail),
   « Inviter » (ligne `nouveau`/`invite`), « Refuser » (ligne `nouveau`/`invite`).
   **Détail** (panneau dépliable ou drawer) : prénom/nom/email (mailto),
   message de motivation, date, statut, **lien de téléchargement du CV**
   (`cvUrl`, `target="_blank"` + `rel="noopener noreferrer"`).
3. **`ApplicationEmailModal`** (client) — **un seul composant réutilisé** pour
   invitation et refus :
   - au montage : `getEmailTemplate(kind, localeDeLaCandidature)` → objet +
     corps pré-remplis (champs éditables librement) ;
   - aide sous le corps : rappel des placeholders
     (`{{prenom}}` · `{{nom}}` · `{{lien}}`) — pour le refus, seul `{{lien}}`
     est inexistant (non affiché) ;
   - coche **« Enregistrer comme modèle par défaut »** (`saveTemplate`) ;
   - envoi → `inviteToInterview` / `rejectApplication` · succès : toast + fermeture
     + rafraîchissement de la ligne (statut, `invitedAt`) · échec : message
     traduit par code (`mail_failed` = « e-mail non envoyé, aucune modification
     appliquée — réessayez ») ;
   - courbe **unique** du projet, `aria-modal`, focus piégé, `Esc` pour fermer,
     bouton ≥ 44 px, aucun string en dur.
4. **`ApplyForm`** : champ caché `<input type="hidden" name="locale">` alimenté
   par la prop `locale` déjà présente (aucun autre changement — le formulaire
   public reste identique).
5. **Contenu** (`content/platform/*`) : section `recruitment` (title, intro,
   columns, statuses `{nouveau,invite,refuse}`, empty states, libellés modal,
   erreurs par code) **FR/EN strictement symétriques** + entrée de nav
   `{ label: "Recrutement", href: "/espace/recrutement" }` dans `nav.ceo`
   (FR **et** EN) — absent des autres rôles.

**Fait =** `tsc --noEmit` 0 · `next build` vert · zéro string en dur · a11y
(liste sémantique, badges lisibles sans couleur seule, labels de champs).

## 4. Validation E2E — sous-agent **Tester** (fin de module)

1. Dépôt public : `/{fr,en}/recrutement` → candidature en base + mail admin
   reçu + apparaît dans `/espace/recrutement` (badge « Nouveau »).
2. Garde : `/espace/recrutement` en `manager` → 404 · sans session → redirection
   connexion · route CV en `manager`/anonyme → **404** (jamais 403).
3. Invitation : ouvrir le modal → modèle pré-rempli FR (candidature FR) ·
   éditer · envoyer → e-mail candidat reçu **avec le lien absolu** ·
   clic candidat sur le lien → grille `/entretien/[token]` fonctionnelle ·
   statut « Invité » + créneau affiché une fois réservé.
4. `{{lien}}` supprimé manuellement → réinjecté en fin de corps.
5. Refus : envoyer → e-mail candidat reçu · statut « Refusé » · boutons
   désactivés ensuite · ré-invitation refusée (`conflict`).
6. Ré-envoi d'invitation : un **second** lien fonctionnel, `interview_id`
   mis à jour.
7. `npm run test` vert · `tsc` 0 · `next build` vert.

---

## Partition des fichiers (obligatoire pour le parallélisme)

| Fichier | Piste |
|---|---|
| `src/lib/db/schema.ts` · `drizzle/0002_*.sql` | **Database** |
| `src/lib/recruitment-templates{,.test}.ts` · `src/actions/recrutement.ts` · `src/actions/careers.ts` · `src/app/api/applications/[id]/cv/route.ts` · `src/lib/permissions.ts` | **Backend** |
| `src/app/[locale]/(app)/espace/recrutement/page.tsx` · `src/components/app/ApplicationsPanel.tsx` · `src/components/app/ApplicationEmailModal.tsx` · `src/components/recrutement/ApplyForm.tsx` · `src/content/platform/{types,fr,en}.ts` | **Frontend** |
| `src/app/[locale]/entretien/**` · `src/actions/interviews.ts` · `src/lib/slots*.ts` · `src/actions/applications.ts` (décision de comptes) · `(marketing)/**` · `src/remotion/**` · `VIDEO.md` · `package.json` · `scripts/` | **INTOUCHÉS** |

**Aucun fichier partagé entre pistes.** Le Frontend importe les types du
Backend via le contrat figé ci-dessus (compilation finale).

## Sécurité & edge cases

1. **CV en base** : ≤ 5 Mo recontrôlé sur les octets réels ; jamais de chemin,
   jamais de `/public` ; servi uniquement par la route CEO (404 muet).
2. **Destinataire candidat** : toujours relu **en base** dans l'action — un
   `applicationId` forgé ne peut pas rediriger un e-mail.
3. **Idempotence** : UPDATE conditionnelle sur `status` (verrou de ligne) ;
   double-clic → `conflict`, jamais deux statuts contradictoires.
4. **Échec Resend** : aucun changement de statut (e-mail d'abord, écriture
   ensuite) → réessai possible immédiatement.
5. **Lien orphelin** : généré à l'envoi ; un e-mail raté laisse une ligne
   `interviews` sentinelle non réservée — bénin ( même état qu'un lien créé
   manuellement sur `/espace/entretien`).
6. **Locale** : capturée au dépôt (champ caché), validée par Zod, jamais
   reçue du client lors des envois (relue en base).
7. **Injection** : corps e-mail en texte brut ; subject sanitisé par `mail.ts`.
8. **Payload** : `cv_bytes` **jamais** sélectionné dans la liste ; seul le
   détail renvoie `cvUrl`.
9. **Fuseau** : stockage UTC, affichage `Africa/Algiers` côté page (motif
   existant, pas de `Date` côté client).
10. **Anciennes candidatures** : inexistantes en base (tout partait par mail) —
    rien à migrer, la liste démarre vide à la mise en production.

## Textes par défaut des templates (§ Backend 1 — figés)

**invite · FR** — objet : `Invitation à un entretien — Atheris Labs`
```
Bonjour {{prenom}},

Merci pour votre candidature au poste de Sales Development Representative chez Atheris Labs.
Nous avons étudié votre dossier avec attention et souhaitons échanger avec
vous lors d'un entretien en visioconférence (Google Meet, environ 30 minutes).

Choisissez le créneau qui vous convient le mieux — les horaires sont
affichés dans votre fuseau horaire :
{{lien}}

Ce lien est valable pour les trois prochains jours.

Bien à vous,
Sofiane — Atheris Labs
```

**invite · EN** — objet : `Interview invitation — Atheris Labs` (même corps,
traduit symétriquement).

**reject · FR** — objet : `Votre candidature chez Atheris Labs`
```
Bonjour {{prenom}},

Nous vous remercions pour l'intérêt que vous portez à Atheris Labs et pour
le temps consacré à votre candidature.

Après étude attentive de votre dossier, nous ne poursuivrons pas votre
candidature pour ce poste. Cette décision ne remet pas en cause la qualité
de votre profil : notre sélection a été particulièrement contrastée.

Nous conservons votre candidature et reviendrons vers vous si une
opportunité plus adéquate se présente.

Bien à vous,
Sofiane — Atheris Labs
```

**reject · EN** — objet : `Your application with Atheris Labs` (traduit
symétriquement).
(Les defaults sont écrits **dans le code** du module de templates — le dictionnaire
plateforme ne porte que l'UI.)

## Ordre d'exécution

```
1) LEAD : contrat figé (ce document)
2) Database ∥ Backend ∥ Frontend        [contrats figés ci-dessus]
3) LEAD : tsc · npm test · npm run build
4) Tester : E2E (§4)
```

## Validation finale

`tsc --noEmit` 0 · `vitest` vert · `next build` · captures Playwright
(liste CEO, modal invitation pré-rempli, e-mail candidat avec lien absolu,
grille `/entretien/[token]` ouverte depuis l'e-mail, e-mail de refus, route CV
en 404 pour un non-CEO) · migration `drizzle/0002` versionnée (**appliquée
ultérieurement sur Neon** — DB-PENDING).
