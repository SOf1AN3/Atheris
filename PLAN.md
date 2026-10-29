# PLAN.md — Lot 5 : lien Google Meet envoyé automatiquement à la réservation d'entretien

> **Statut : 🟡 EN ATTENTE DE VALIDATION EXPLICITE** — aucun code avant feu vert.
> Version 1.0 — 29/10/2026 · Lot 4 exécuté et poussé (`af3bfbe`) → `PLAN.md` réutilisé.
> ⚠ Hors périmètre absolu : `src/remotion/**`, `scripts/*.mjs` (vidéo), `public/fonts/**`, `logo/**`, `package.json`, `.env.local` (lecture/écriture de la SEULE variable `MEET_LINK` autorisée à l'exécution).

---

## Contexte & besoin métier

Quand un candidat **réserve son créneau**, l'e-mail récap actuel lui dit *« rejoignez le Google Meet 5 minutes avant »* (`interview.meetNote`) mais **ne contient aucun lien**. Objectif : à la réservation, le candidat reçoit **automatiquement un lien Google Meet utilisable**, et le voit aussi :
1. dans **l'e-mail récap** (envoyé à la réservation), 2. sur **sa page de confirmation** (après validation du créneau), 3. dans **la liste des entretiens côté CEO** (sur les lignes réservées).

**Décisions utilisateur (D1–D2)** :
- **D1** — Méthode : **lien Meet unique permanent** (option A). Pas d'API Google : le CEO crée un lien réutilisable dans Google Meet, il est stocké en variable d'env `MEET_LINK`. Le créneau étant **unique en base** (index unique partiel du Lot 2), aucune double réservation simultanée n'est possible — un seul salon partagé est cohérent.
- **D2** — Affichage : **e-mail + page candidat + liste CEO**.

**Décisions du Lead (sans déranger)** : variable nommée `MEET_LINK` · **jamais bloquant** (absente/invalidée → les 3 surfaces se comportent comme aujourd'hui, `console.warn` une seule fois) · **validation de forme** (`https://meet.google.com/…` uniquement, sinon considérée absente — évite d'afficher un brouillon en prod) · **aucune modification de la DB** (aucune migration) · l'e-mail récap n'est envoyé **qu'une fois** (à la réservation, règle existante — pas de renvoi à l'annulation, hors périmètre) · le lien n'apparaît que sur les lignes **réservées non annulées**.

## Prérequis (vous, avant l'exécution)
Créer le lien : **meet.google.com → Nouvelle réunion → « Obtenir un lien de réunion »** (ou `meet.google.com/new`), puis me le fournir (ou le mettre vous-même dans `.env.local` sous `MEET_LINK=…`). Il faudra aussi l'ajouter dans **Vercel → Environment Variables** pour la prod.

---

## 1. Cœur partagé — **sous-agent Backend** (fichiers : `src/lib/meet.ts` **nouveau**, `src/actions/interviews.ts`)

### 1.1 Helper `src/lib/meet.ts` (serveur uniquement, ~30 lignes)
```ts
/** Lien Meet permanent (env MEET_LINK) — null si absent/invalidé. Jamais bloquant. */
export function getMeetLink(): string | null;
```
- Lit `process.env.MEET_LINK`, `trim()` ; si vide → `null`. Si elle ne commence pas par `https://meet.google.com/` → `null` + `console.warn` **une seule fois** (flag module : `MEET_LINK absent ou invalide — les e-mails/pages omettront le lien`).
- JSDoc : pourquoi pas d'API Google (D1), règle « jamais bloquant », serveur-only (interdit côté client — l'URL n'est injectée que via props sérialisables).
- Aucun import DB/auth : module pur.

### 1.2 Injection dans l'e-mail récap — `src/actions/interviews.ts`
Dans `submitInterview` (zone d'envoi du récap, ~L311-333 où `meetNote` compose le corps) :
- Si `getMeetLink()` non nul → **ajoute un paragraphe final** au corps : `dict.interview.meetLink` avec remplacement de `{{link}}` (voir contrat C2) — au format URL cliquable dans l'e-mail (texte brut suffisant : l'URL seule sur sa ligne).
- Si null → corps **identique à aujourd'hui** (aucun changement visible).
- **Échec Resend inchangé** : écriture d'abord, `notifiedAt = null`, jamais d'échec de réservation (règle du Lot 2).

**Fait =** `grep meetLink src/actions/interviews.ts` présent · le corps sans variable d'env est strictement identique à l'actuel.

---

## 2. Dictionnaire — **sous-agent FE-Dict** (fichiers : `src/content/fr.ts`, `src/content/en.ts`, `src/content/types.ts`)

Section `interview` (contenu **marketing**, PAS `content/platform/`) — ajouter, FR/EN symétriques + type :
- `meetLink: string` — FR « Rejoindre l'entretien Google Meet : {{link}} » / EN “Join the Google Meet interview: {{link}}” (placeholder **double accolade**).
- `meetCta: string` — libellé du bouton/lien côté candidat : FR « Ouvrir Google Meet » / EN “Open Google Meet”.
- `meetBadge: string` — libellé court côté CEO (liste) : FR « Google Meet » / EN “Google Meet” (identique FR/EN, simple label).

Ne modifier **aucune clé existante** (`meetNote` reste tel quel).

**Fait =** `tsc` OK (type `InterviewContent` porte les 3 clés) · FR/EN symétriques.

---

## 3. Page candidat — **sous-agent FE-Cand** (fichiers : `src/app/[locale]/entretien/[token]/page.tsx`, `src/components/recrutement/InterviewForm.tsx`)

- Page server : `const meetLink = getMeetLink()` (import `@/lib/meet`) → transmis en prop au formulaire (**uniquement** après réservation côté client — prop `meetLink: string | null` sérialisable, zéro env côté client).
- `InterviewForm.tsx` : dans le **bloc de succès** (« Entretien réservé. »), si `meetLink !== null` → un **bouton/lien** `labels.meetCta` vers le lien (`target="_blank" rel="noopener noreferrer"`, cible ≥ 44 px, style secondaire du repo, précédé du texte `labels.meetLink` avec URL ou bouton direct — choix UI assumé : **bouton + URL visible en texte petit sous le bouton**, utile si le candidat est sur mobile sans Meet installé).
- Aucune modification de la logique de réservation/validation (Zod, créneaux) — **stRICTEMENT** l'affichage.

**Fait =** réserver un créneau en dev affiche le bouton · sans `MEET_LINK`, le bloc success est identique à aujourd'hui.

---

## 4. Liste CEO — **sous-agent FE-CEO** (fichiers : `src/app/[locale]/(app)/espace/entretien/page.tsx`, `src/components/app/InterviewLinks.tsx`)

- Page server : `meetLink = getMeetLink()` → prop `meetLink: string | null` au composant.
- `InterviewLinks.tsx` : sur chaque ligne **`row.booked === true` ET `row.status !== "cancelled"`** → petit lien « Google Meet » (`labels.meetBadge`) à côté du créneau (`slotLabel`, bloc `dl`), `target="_blank"`, cible ≥ 44 px, style hairline existant. Lignes non réservées/annulées : **inchangées**.
- Zéro modification du mécanisme de suppression/nom de lien (Lot 3 bis).

**Fait =** une ligne réservée affiche le lien, une ligne « en attente » non.

---

## 5. Tests — **sous-agent Tester** (fin de module, identifiants admin fournis)

⚠ Les scénarios créent 1 lien d'entretien + 1 réservation de test (e-mail réel vers une adresse `@test.dev` **autorisée** par le domaine vérifié) → **nettoyage Lead après coup** (suppression via le bouton Supprimer + purge de la réservation).

1. **Absence de variable** (si `MEET_LINK` non posé au moment du test) : vérifier que les 3 surfaces sont identiques à aujourd'hui (test bascule : après pose de la variable, reprendre au point 2).
2. **Réservation complète** : CEO crée un lien d'entretien (avec nom de lien) → onglet anonyme `/{locale}/entretien/{token}` → réservation d'un créneau avec email `meet-test@…` → **écran de succès : bouton Meet présent + URL affichée**.
3. **Liste CEO** : la ligne apparaît « Réservé » **avec** le lien Google Meet (clic → ouvre Meet).
4. **E-mail** : vérification via l'API Resend (GET /emails, lecture seule) que le récap contient l'URL Meet — ou, à défaut, `notifiedAt` non nul + log serveur.
5. **i18n** : même parcours en `/en` (libellés EN).
6. **Fallback** : avec `MEET_LINK` retirée (ou invalidée) → succès/liste/e-mail **sans** lien, zéro erreur console (warning serveur unique).
7. **Nettoyage** : suppression du lien de test (bouton Supprimer) + purge des réservations/lignes de test créées.

---

## Partition des fichiers (aucun fichier sur deux pistes)

| Fichier | Piste |
|---|---|
| `src/lib/meet.ts` (nouveau), `src/actions/interviews.ts` | **Backend** |
| `src/content/{fr,en,types}.ts` | **FE-Dict** |
| `src/app/[locale]/entretien/[token]/page.tsx`, `src/components/recrutement/InterviewForm.tsx` | **FE-Cand** |
| `src/app/[locale]/(app)/espace/entretien/page.tsx`, `src/components/app/InterviewLinks.tsx` | **FE-CEO** |
| `.env.local` (variable `MEET_LINK` seulement) | **Lead** |

> `src/components/ui/**` : lecture seule. Aucune DB, aucune migration, aucun changement RBAC.

## Contrats inter-pistes (figés)

- **C1** `getMeetLink(): string | null` depuis `@/lib/meet` — `https://meet.google.com/…` seulement, jamais throw, warn unique si absente/invalidée.
- **C2** Clés dict `interview.{meetLink ({{link}}), meetCta, meetBadge}` FR/EN + type (§2).
- **C3** Props sérialisables : `meetLink: string | null` transmis **server → client** par les deux pages (jamais d'env en client).
- **C4** Règle d'affichage : candidat = bloc succès seulement après réservation ; CEO = `booked && status !== "cancelled"`.
- **C5** E-mail : paragraphe ajouté **uniquement** si `getMeetLink() !== null`, corps strictement identique sinon.

## Sécurité & edge cases
- **Jamais bloquant** : env absente/invalidée = comportement 100 % actuel ; échec Resend inchangé (`notifiedAt = null`).
- **Pas d'env côté client** : le lien n'est injecté que via props serveur sérialisables.
- **Forme validée** avant affichage (anti-brutage d'une variable d'env mal saisie).
- **Affichage ciblé** : réservé + non annulé uniquement (pas de lien sur les liens libres ni annulés).
- **i18n** : aucune phrase en dur (FR/EN symétriques) ; l'URL est une donnée, pas du texte traduit.
- **A11y/mobile** : cibles ≥ 44 px, URL lisible telle quelle (repli copie manuelle si Meet non installé).
- **Hors périmètre** : e-mail d'annulation par le CEO · renvoi de récap · modification de créneau (interdite depuis le Lot 2) · API Google (voir D1, upgrade futur).

## Ordre d'exécution
1. **Prérequis** : vous me fournissez `MEET_LINK` (ou la posez dans `.env.local`).
2. **4 pistes en parallèle** (contrats figés, fichiers disjoints) : Backend ∥ FE-Dict ∥ FE-Cand ∥ FE-CEO.
3. Revue Lead : `npm run lint` · `npx tsc --noEmit` · `npm test` · `npm run build` (serveur dev **arrêté** pendant le build — leçon du Lot 4).
4. **Tester** (E2E §5) + nettoyage Lead.
5. Commits sérialisés Conventional Commits + **push direct** (consentement du 28/10) + rappel Vercel (`MEET_LINK` à ajouter).

## Validation finale
Chaque agent : **`AUTO-OK`** (périmètre, TypeScript strict, i18n symétrique, zéro env côté client) ; sinon **`AUTO-KO`** + tâche corrigée isolée.
