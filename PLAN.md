# PLAN.md — Module « Recrutement » (entretien + candidature) + corrections design

> **Statut : 🟡 EN ATTENTE DE VALIDATION EXPLICITE** — aucun code avant feu vert.
> Version 2.0 — 25/10/2026 (l'ancien plan v2 était ✅ VALIDÉ, il est remplacé).
> Référents : `DESIGN.md`, `structure.md` (théorie commerciale), `.gitignore`.

---

## Contexte & besoin métier

**A — Entretien LDG à la volée.** Depuis le tableau de bord, le CEO génère un
lien et l'envoie à un potentiel lead generator. Le lien ouvre un mini-formulaire
(prénom, nom, email) + un agenda des **3 prochains jours**, créneaux d'**1 h de
9 h à 20 h**, affichés **dans le fuseau du candidat**. Il choisit 10 h →
l'entretien est à 10 h **chez lui**, c'est le recruteur qui s'adapte.
Récapitulatif envoyé à **admin@sofianeasma.me**.

**B — Page de recrutement.** Page publique (JD : mission, responsabilités,
profil) servant d'interface de candidature : infos perso + **CV en pièce jointe**,
envoyés au même mail.

**C — Corrections** : chiffres `01…04` (§04) et wordmark du footer **remplis** et
**non sélectionnables** ; curseur pointeur sur les boutons ; favicon perso ;
accès dashboard subtil dans le header ; vrai numéro de portfolio ; rail de la
section 02 **tirable à la souris** ; projets + images repris de **sofianeasma.me**.

---

## Décisions actées (25/10/2026)

| # | Décision | Conséquence technique |
|---|---|---|
| **Q1** | **Resend** pour l'envoi | `src/lib/mail.ts` en HTTP, clé `RESEND_API_KEY` dans `.env.local`. Prérequis test : clé API + destinataire ou domaine vérifié côté Resend. |
| **Q2** | **Je rédige l'offre, vous la relisez** | Offre complète rédigée en **annexe A** (ci-dessous) — à valider dans la validation du plan. FR fourni, EN traduit. |
| **Q3** | Page dédiée **`/espace/entretien`** | Nouvelle page + entrée sidebar : création 1 clic, copie du lien, liste des entretiens. |
| **Q4** | **Catégories multiples** | `category: CaseCategory[]` → Delyx + Papernote + **MYKS Radio** tombent dans `mobile` (Delyx/Papernote aussi dans `web`). 5 cartes : 4 avec image portfolio + MYKS (image indisponible → mockup CSS). |
| **Q5** | **Images téléchargées** depuis `sofianeasma.me` | Testé : les 4 PNG répondent. Redimensionnés ≤ 1600 px, JPEG q88, dans `public/projects/`. |
| **Q6** | **Blanc 20 %** pour les chiffres + wordmark | Remplissage littéral de la couleur de contour, + `user-select: none`. |
| **Q7** | **`/recrutement` : footer uniquement** | Le footer réutilise `nav.items` (partagé avec le header) → nouvelle clé `footer.links` rendue **uniquement** dans le footer. |

**Hypothèses** (modifiables) : créneaux **9 h → 19 h inclus** (11/jour, fenêtre
9 h–20 h) · les 3 jours **incluent aujourd'hui**, heures passées désactivées ·
le mail affiche l'heure du candidat **et** son équivalent `Africa/Algiers` ·
lien **public non authentifié** (sinon le candidat ne peut pas l'ouvrir).

---

## 0. Contenu & actifs — **LEAD** (sérialise toutes les pistes)

*Tous les `src/content/*` appartiennent au Lead : lecture seule pour les agents.*

| # | Tâche | Fichiers | Fait = |
|---|---|---|---|
| 0.1 | **Téléphone** : `+213 555 00 00 00` → **`+213 551 79 73 13`**, `wa.me/213555000000` → **`wa.me/213551797313`** (+ recherche globale d'autres occurrences) | `content/fr.ts:338`, `content/en.ts:337` | FR et EN concordent, `mailto`/`tel`/`wa.me` cohérents |
| 0.2 | **Clé connexion** : `nav.loginLabel` (« Connexion » / « Sign in ») pour le bouton du header | `types.ts`, `fr.ts`, `en.ts` | 0 string en dur dans le composant |
| 0.3 | **`footer.links`** : `[{ label, href: "/{locale}/recrutement" }]` (accès footer seulement, Q7) | `types.ts`, `fr.ts`, `en.ts` | le header n'affiche **pas** cette entrée |
| 0.4 | **Projets ×5 en catégories multiples** : `CaseCategory` inchangé mais `category` devient `CaseCategory[]`. Items : **Dental Clinic SaaS** (web), **Papernote** (web, ai, mobile), **Delyx Delivery** (web, mobile), **Tiberium Consulting** (web), **MYKS Radio** (mobile). Titres/descriptions/tags repris du portfolio. Nouveau champ `image?: string`. | `types.ts` (`category: CaseCategory[]`, `CaseStudy.image?`), `fr.ts`, `en.ts` | les 4 items portfolio portent `image`, MYKS garde `mockup: "radio"` |
| 0.5 | **`MockupKind` + `"delyx"`** (repli si l'image échoue) | `types.ts` | type exhaustif, switch exhaustif côté mockups |
| 0.6 | **Blocs `careers` + `interview`** dans `SiteContent` (copie de l'annexe A + libellés de formulaire/erreurs/succès), FR + EN | `types.ts`, `fr.ts`, `en.ts` | i18n complète, `a11y` complet |
| 0.7 | **Actifs images** : téléchargement 4 PNG → ≤ 1600 px → JPEG q88 | `public/projects/{dental,papernote,delyx,tiberium}.jpg` | chaque fichier < 400 Ko |
| 0.8 | **Favicon** : `icon.svg` monogramme « A » (obsidienne + arête blanche, pas de volt en fond) | création `src/app/icon.svg` | remplace le favicon Next par défaut |

---

## 1. Base de données — sous-agent **Database**

### 1.1 Table `interviews` (`src/lib/db/schema.ts`)

```ts
export const interviewStatus = pgEnum("interview_status", ["pending","cancelled","done"]);

export const interviews = pgTable("interviews", {
  id:         uuid("id").defaultRandom().primaryKey(),
  token:      text("token").notNull().unique(),          // 32 bytes hex
  firstName:  text("first_name").notNull(),
  lastName:   text("last_name").notNull(),
  email:      text("email").notNull(),
  emailNorm:  text("email_norm").notNull(),              // convention *_norm
  startsAt:   timestamp("starts_at", { withTimezone: true }).notNull(), // UTC
  timezone:   text("timezone").notNull(),                // IANA candidat
  localDate:  text("local_date").notNull(),              // AAAA-MM-JJ (tz candidat)
  localHour:  text("local_hour").notNull(),              // HH:mm (tz candidat)
  status:     interviewStatus("status").notNull().default("pending"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // PARTIEL : une annulation libère le créneau.
  uniqueIndex("interviews_pending_starts_at_uq").on(t.startsAt)
    .where(sql`status = 'pending'`),
  index("interviews_created_at_idx").on(t.createdAt),
]);
```

**Fait =** `npm run db:generate` → `drizzle/0001_*.sql` sans toucher aux 13
tables existantes ; conventions du fichier respectées ; `tsc` vert.
⚠ `npm run db:migrate` est lancé **par le Lead, en fin de parcours**, sur la
vraie `DATABASE_URL` — jamais par un sous-agent.

---

## 2. API / Server Actions — sous-agent **Backend**

### 2.1 `src/lib/slots.ts` (nouveau) — logique de créneaux partagée

- `HOURS = 9…19` (11 créneaux × 1 h), `DAYS = 3`.
- `getSlotsForTimezone(tz, now)` → calcul **dans le fuseau du candidat** via
  `Intl.DateTimeFormat` — jamais `Date#getHours()`.
- `isValidSlot({ timezone, localDate, localHour, instant })` → revalidation
  **serveur** de l'instant reçu (anti falsification + **DST** : heure inexistante
  → rejet).
- `toRecruiterTime(instant, "Africa/Algiers")` → pour l'e-mail.

### 2.2 `src/lib/mail.ts` (nouveau) — enveloppe Resend provider-agnostique

```ts
sendMail({ to, subject, text, html?, attachments? }): Promise<{ ok: boolean; error?: string }>
```
Clé lue en env (`RESEND_API_KEY`), **aucune valeur en dur**, `.env.local`
jamais committé. Interface stable si le provider change un jour.

### 2.3 `src/actions/interviews.ts` (nouveau)

- `createInterviewLink()` — **réservé CEO/Rayan** (session + rôle, comme les
  actions existantes) → crée le token (32 bytes), renvoie l'URL.
- `listInterviews()` — entretiens du compte (page `/espace/entretien`).
- `submitInterview(input)` — **public** :

```
→ { ok: true }
→ { ok: false, code: "invalid" | "not_found" | "taken" | "rate_limited" | "failed" }
```
Séquence : rate-limit 1/60 s/IP (motif de `contact.ts`) → Zod → token →
`isValidSlot()` → INSERT (catch du `unique` → `taken`) → `sendMail()`.
**L'e-mail ne peut pas faire échouer la réservation** : INSERT d'abord, échec
mail → `notifiedAt = null` + log, réponse `ok: true`.

### 2.4 `src/actions/careers.ts` (nouveau)

- `applyToJob(formData)` — **public** : Zod (prénom, nom, email, message
  optionnel) + fichier (**PDF/DOC/DOCX/RTF**, **≤ 5 Mo**, aligné sur
  `documents.bytes`), nom sanitisé, **aucune écriture disque** (pièce jointe
  mémoire), rate-limit 1/60 s/IP → mail à `admin@sofianeasma.me`.

**Fait =** `tsc` + `eslint` verts, 0 string UI en dur, codes d'erreur documentés.

---

## 3. UI — 3 sous-agents **Frontend** en parallèle

### 3.1 Piste **F1 — Prise de rendez-vous**

| Fichier | Rôle |
|---|---|
| `src/app/[locale]/entretien/[token]/page.tsx` **(créer)** | Serveur : résolution du token (inconnu → 404 générique, sans fuite), rendu du formulaire. **Hors** `(marketing)` → pas de header/footer (focus conversion). |
| `src/components/recrutement/InterviewForm.tsx` **(créer)** | Client : RHF + Zod, 3 onglets de jours × 11 créneaux, heures passées désactivées, sélection au clic (`radiogroup`), succès M10. |

Fuseau lu via `Intl.DateTimeFormat().resolvedOptions().timeZone`, affiché au
candidat (`timeZoneName: "short"`) pour qu'il **sache** dans quoi il choisit.
A11y : `role="radiogroup"` + `aria-checked`, cibles ≥ 44 px, erreurs `role="alert"`.
Copie : `dict.interview.*` (0.6).

### 3.2 Piste **F2 — Page recrutement**

| Fichier | Rôle |
|---|---|
| `src/app/[locale]/(marketing)/recrutement/page.tsx` **(créer)** | JD complète (annexe A) + `ApplyForm`. Dans `(marketing)` → header/footer/JSON-LD. |
| `src/components/recrutement/ApplyForm.tsx` **(créer)** | Infos perso + input file (drag & drop, `accept` restreint, nom/taille affichés, refus type/taille), soumission `FormData`, succès. |
| `src/app/sitemap.ts` **(modifier)** | Ajout `/{locale}/recrutement`. |

### 3.3 Piste **F3 — Corrections design**

| Fichier | Correction |
|---|---|
| `src/app/globals.css` | `.num` et `.wordmark` : **remplissage blanc 20 %** (Q6) + `user-select:none; -webkit-user-select:none` → feeling image. |
| `src/components/ui/Button.tsx` | `cursor-pointer` dans `BASE_CLASSES` + `disabled:cursor-not-allowed`. *(Cause du bug signalé : Tailwind Preflight ne met plus `cursor: pointer` sur `<button>`.)* |
| `src/app/favicon.ico` | **Suppression** (remplacé par `icon.svg`, 0.8). |
| `src/components/layout/Header.tsx` | Accès dashboard **subtil** : lien `/{locale}/connexion`, style fantôme `.micro`, icône `LogIn` 16 px, desktop **+ pied du menu mobile**. Libellé = `nav.loginLabel` (0.2). |
| `src/components/sections/CaseStudies.tsx` | **Tirage à la souris** du rail : `pointerdown` → `setPointerCapture`, `pointermove` → `scrollLeft -= dx`, **seuil 6 px** pour séparer clic et glisser (clic annulé si déplacé), `cursor: grab/grabbing`. Touch natif, onglets, filtres et a11y intacts. + filtrage adapté à `categories: []`. |
| `src/components/sections/CaseStudyCard.tsx` | `<Image>` (`next/image`) si `study.image`, repli `mockup` sur `onError`. |
| `src/components/sections/CaseStudyMockups.tsx` | Nouveau kind `delyx` (repli cohérent). |

**Fait =** `tsc` + `eslint` verts, a11y préservée, `prefers-reduced-motion` respecté.

---

## 4. Tests — sous-agent **Tester** (fin de module)

- **E2E** : lien d'entretien → remplissage → créneau → succès ; double réservation
  → `taken` ; `/recrutement` → upload PDF → succès ; fichier > 5 Mo → refus ;
  rail : le drag défile **sans** déclencher le clic ; régression landing (0 erreur
  console).
- **Unitaires (vitest)** : `slots.ts` sur 3 fuseaux (`Africa/Algiers`,
  `Europe/Paris`, `America/Los_Angeles`) dont un passage de **changement
  d'heure** ; Zod des 2 actions ; limite de taille de fichier.

---

## Partition des fichiers (obligatoire pour le parallélisme)

| Fichier | Piste |
|---|---|
| `src/content/types.ts` · `fr.ts` · `en.ts` · `public/projects/*` · `src/app/icon.svg` | **LEAD** (§0) — *lecture seule pour les autres* |
| `src/lib/db/schema.ts` · `drizzle/0001_*.sql` | **DB** (§1) |
| `src/lib/slots.ts` · `src/lib/mail.ts` · `src/actions/interviews.ts` · `src/actions/careers.ts` | **Backend** (§2) |
| `src/app/[locale]/entretien/[token]/page.tsx` · `src/components/recrutement/InterviewForm.tsx` | **F1** (§3.1) |
| `src/app/[locale]/(marketing)/recrutement/page.tsx` · `src/components/recrutement/ApplyForm.tsx` · `src/app/sitemap.ts` | **F2** (§3.2) |
| `src/app/globals.css` · `src/components/ui/Button.tsx` · `src/app/favicon.ico` · `src/components/layout/Header.tsx` · `src/components/sections/CaseStudies.tsx` · `src/components/sections/CaseStudyCard.tsx` · `src/components/sections/CaseStudyMockups.tsx` | **F3** (§3.3) |
| `src/**/*.{test,spec}.ts` (nouveaux) | **Tester** (§4) |

**Aucun fichier en double.** `src/content/*` est écrit par le LEAD **avant**
lancement, puis figé.

---

## Sécurité & edge cases

1. **Token** : 32 bytes aléatoires, `unique`, 404 générique → pas d'énumération.
2. **Double réservation** : index unique partiel + code `taken` géré côté UI
   (rechoisir sans recharger).
3. **Fuseau falsifié / DST** : le serveur revalide date + heure dans le tz reçu ;
   heure rendue inexistante par un changement d'heure → rejet.
4. **Mail** : `subject` sanitisé, destinataire **constante** `admin@sofianeasma.me`,
   échec mail ≠ échec réservation.
5. **Upload** : type + extension + **5 Mo**, nom sanitisé, aucun chemin, mémoire.
6. **Rate-limit** 1/60 s/IP sur les deux actions publiques.
7. **i18n** : 0 string en dur ; motion respectée ; focus volt ; cibles ≥ 44 px.
8. **Sans JS** : message explicite sur la page d'entretien (l'agenda vit côté
   client pour lire le fuseau) — jamais un écran blanc.

---

## Contrats inter-pistes (figés ici)

```ts
// §1 → §2
import { interviews, interviewStatus } from "@/lib/db/schema";
type InterviewInsert = typeof interviews.$inferInsert;

// §0 → toutes les pistes (contenu figé)
SiteContent.careers   : { eyebrow, title, intro, blocks[], applyTitle, form{…} }
SiteContent.interview : { badge, title, subtitle, days[], form{…}, success{…}, errors{…} }
SiteContent.footer.links : { label: string; href: string }[]      // Q7
SiteContent.nav.loginLabel : string                                // 0.2
CaseStudy = { … category: CaseCategory[]; image?: string }         // Q4 + 0.4

// §2 → F1
submitInterview({ token, firstName, lastName, email, instant, timezone, localDate, localHour })
  → { ok: true } | { ok: false; code:
      "invalid" | "not_found" | "taken" | "rate_limited" | "failed" }

// §2 → F2
applyToJob(formData: FormData)
  → { ok: true } | { ok: false; code:
      "invalid" | "too_large" | "bad_type" | "rate_limited" | "failed" }
```

---

## Ordre d'exécution

```
Phase 0   LEAD (§0) : contenu FR/EN + images + favicon        [sérialise tout]
   ↓
Phase 1   DB ∥ Backend ∥ F1 ∥ F2 ∥ F3        [contrat-first : 5 pistes simultanées]
   ↓
Phase 2   LEAD : db:generate vérifié → migration sur la vraie DB → npm run build
   ↓
Phase 3   Tester (E2E + unitaires) → AUTO-OK → rapport final
```

**Prérequis avant Phase 3** : `RESEND_API_KEY` dans `.env.local` + destinataire
ou domaine vérifié côté Resend (sans cela, les tests E2E valident le parcours et
la DB, l'envoi réel reste à valider par vous).

---

# Annexe A — Offre d'emploi proposée (§0.6) — ⚠ À RELIRE

> Rédigée **uniquement** à partir de `structure.md` (aucune condition inventée).
> Modifiez-la directement ou dites-moi ce qui change.

**Intitulé** — Lead Generator (Générateur de prospects)
**Format** — Collaborateur indépendant, rémunération à la commission · Remote

**Mission**
Identifier et qualifier des prospects pour Atheris Labs — studio d'ingénierie
logicielle (applications Web, Mobile et Desktop sur-mesure) — et les accompagner
jusqu'au premier échange commercial.

**Responsabilités**
- Prospects actifs par les canaux autorisés (réseaux, prospection ciblée,
  bouche-à-oreille, canaux digitaux encadrés).
- Qualifier le besoin : type de produit, budget, délai, décideur.
- Inscrire le prospect sur la plateforme avec une fiche complète et à jour.
- Assurer le suivi jusqu'au rendez-vous ou à l'envoi du devis.
- Remonter les signaux marché (objections, prix concurrents, attentes récurrentes).

**Profil recherché**
- Expérience en prospection B2B ou génération de leads (appréciée).
- Bonne compréhension des enjeux digitaux des PME.
- Rigueur, autonomie, sens du suivi et fiabilité dans les engagements.
- Français écrit soigné ; anglais ou arabe appréciés.
- Disponibilité régulière, entièrement à distance.

**Rémunération**
Commission **10 % → 20 %** du montant TTC des devis signés, selon le barème
progressif de l'entreprise (paliers sur les clients ayant payé l'acompte).
Aucun salaire fixe. La commission est acquise à l'encaissement du premier
versement.

**Processus de sélection**
1. Candidature (formulaire + CV) · 2. Entretien de 30 minutes (lien de
créneaux) · 3. Validation par le CEO · 4. Accès à la plateforme après
validation manuelle.

---

## Validation finale

1. Chaque tâche cochée + `AUTO-OK` du sous-agent responsable.
2. `npx tsc --noEmit` · `npx eslint` · `npm run build` (28 → 30 pages).
3. Captures Playwright : landing (régression), `/entretien/{token}` desktop +
   390 px, `/recrutement`, `/espace/entretien`, §04 + footer (chiffres remplis).
4. `Tester` en E2E sur les flux A et B, puis rapport final au Lead.
