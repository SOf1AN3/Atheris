# PLAN.md — Lot 2 : créneaux « heure algérienne » + email + finitions

> **Statut : 🟡 EN ATTENTE DE VALIDATION EXPLICITE** — aucun code avant feu vert.
> Version 1.0 — 25/10/2026 · Référents : `DESIGN.md`, plan précédent (exécuté ✅).
> ⚠ Vous travaillez en parallèle sur `src/remotion/` + `VIDEO.md` + `package.json` :
> **ces fichiers sont HORS périmètre et ne seront ni lus, ni modifiés, ni committés.**

---

## Contexte

6 demandes : email unique sur toute la plateforme · **changement radical des
créneaux d'entretien** (heure de référence = Algérie, affichage = fuseau
candidat, fenêtre J+1→J+3, consignes Meet) · header masqué sur `/recrutement` ·
bouton « visiter le site » au survol des projets · page 404 sur-mesure.

---

## Questions / décisions en attente

| # | Question | Proposition |
|---|---|---|
| **Q1** 🔴 | **Combien de créneaux par jour ?** « 9h à 16h (heure algérienne) » avec des créneaux d'1 h → dernière prise de **15h** (fenêtre 9h–16h = **7 créneaux**) ou prise à **16h** inclusive (**8 créneaux**, fin 17h) ? | **7 créneaux (9h → 15h)** — la journée s'arrête bien à 16h. |
| **Q2** 🟠 | **Fenêtre déjà dépassée** : la fenêtre est fixée à la **génération du lien** (J+1→J+3). Si le candidat ouvre le lien après J+3, plus aucun créneau n'est valide. | Afficher un état **« ce lien a expiré »** dédié (nouvelle clé `interview.expired*`), plutôt qu'une grille entièrement grisée. |
| **Q3** 🟡 | Après validation, « Modifier mon créneau » disparaît (votre demande). Par quoi le remplace-t-on ? | Message de confirmation **sans action de modification** + lien « Fermer » (retour hors page). |

**Décisions que je prends sans vous déranger** : le **footer reste** sur
`/recrutement` (vous n'avez demandé que le header) · **MYKS Radio** (non en
ligne) n'affiche **pas** de bouton « visiter » · le lien du dossier/email reste
uniquement remplacé là où c'est un **email** (le `SITE_URL` des sitemaps/robots,
lui, reste `atherislabs.com` tant que le domaine n'est pas arbitré).

---

## 1. Contenu & contrats — **LEAD** (sérialise les autres pistes)

| # | Tâche | Fichiers | Fait = |
|---|---|---|---|
| 1.1 | **Email** `contact@atherislabs.com` → **`contact@sofianeasma.me`** (valeur + `mailto:`) | `content/fr.ts`, `content/en.ts`, `(marketing)/layout.tsx` (JSON-LD), `components/layout/Footer.tsx` | 0 occurrence d'`atherislabs.com` **en email** (le `SITE_URL` des sitemaps/robots est conservé) |
| 1.2 | **Clés `interview` réécrites** : `hoursNote`/`timezoneHint` remplacés par **2 paragraphes explicatifs** (voir §5) + clé `meetNote` (Google Meet, **5 min avant**, durée **~30 min**) + clés d'expiration `expiredTitle`/`expiredMessage` + `successAction` de confirmation sans modification · FR et EN strictement symétriques | `content/types.ts`, `fr.ts`, `en.ts` | aucun champ manquant (le type rend l'omission non compilable) |
| 1.3 | **URL des projets** : `CaseStudy.url?: string` + `url` sur Dental (`dental-app-beta1.vercel.app`), Papernote (`reviewer-ai-delta.vercel.app/fr`), Delyx (`delyx-delivery.vercel.app`), Tiberium (`tiberium-next.vercel.app`), **absente pour MYKS** | `content/types.ts`, `fr.ts`, `en.ts` | 4 URLs, `?` optionnel |
| 1.4 | Actifs : rien de nouveau | — | — |

## 2. Logique créneaux — sous-agent **Backend**

Fichiers : **`src/lib/slots.ts`** (modifier), **`src/lib/slots.test.ts`** (réécrire),
**`src/actions/interviews.ts`** (adaptation de l'appel).

**Nouveau modèle** — l'heure de référence est celle de **l'entreprise** :

```
HOURS    = [9 … 15]        // 7 prises, fenêtre 9h–16h Africa/Algiers   (Q1)
DAYS     = 3               // J+1, J+2, J+3 APRÈS la génération du lien
ANCHOR_TZ = "Africa/Algiers"
```

- `getSlotsForWindow(dates, timezone, now)` :
  1. pour chaque date civile **algérienne** (fournie par la page, dérivée du
     `createdAt` du lien) × `HOURS` → instant UTC via `Africa/Algiers`
     (UTC+1 toute l'année, pas de DST — mais calculé via `Intl`, jamais en dur) ;
  2. conversion dans le **fuseau du candidat** → `localDate`/`localHour` affichés
     (ex. Philippines `+7` : 09:00 Algérie → **16:00**) ;
  3. `past` si l'instant est déjà passé.
  → `[]` si tz inconnue ou fenêtre illisible (défaut sûr, conservé).
- `isValidSlot(ref, dates, now)` : la signature gagne `dates` (la fenêtre vient
  de la **ligne en base**, jamais du client) — anti-falsification conservée.
- `getSlotsForWindowDates(createdAt)` : dérive les 3 dates civiles algériennes
  depuis `createdAt` du lien (utilisable côté page ET côté action).
- `toRecruiterTime` **inchangé** (déjà `Africa/Algiers` en second).
- **Tests** : les 28 tests existants sont **réécrits** pour les nouvelles
  règles — 7 × 3 = 21 créneaux, fenêtre J+1→J+3, offset Philippines `+7`
  vérifié au pixel, décalage Amériques (date qui recule d'un jour), et les
  gardes DST/forge conservées.

**Fait =** `npm run test` vert (les 64 tests doivent repasser) · `tsc` 0.

## 3. Entretien (UI) — sous-agent **F1**

Fichiers : **`src/app/[locale]/entretien/[token]/page.tsx`**,
**`src/components/recrutement/InterviewForm.tsx`**.

1. La **page** lit `createdAt` du lien et lui transmet les 3 dates algériennes
   (`getSlotsForWindowDates`) + `expired` (fenêtre entièrement passée → état
   `expiredTitle/Expired`, **avant** le formulaire).
2. Le **formulaire** calcule l'agenda à partir de ces dates (plus de « aujourd'hui
   côté candidat ») : 3 onglets jours × 7 créneaux, heures déjà passées
   désactivées, fuseau du candidat affiché.
3. **`cursor-pointer`** sur les boutons de créneau actifs (bug signalé) — garder
   `cursor-not-allowed` sur les désactivés.
4. Succès : **suppression de « Modifier mon créneau »** → confirmation seule
   (+ lien « Fermer » si Q3 validé).
5. Nouveaux paragraphes explicatifs en `.micro`/`text-[13px]` (clés 1.2), avec
   le rappel **Google Meet 5 min avant · ~30 min**.
6. Aucune string en dur · a11y `radiogroup` conservée · courbe unique.

## 4. Finitions — sous-agent **F3**

Fichiers : **`src/components/sections/CaseStudyCard.tsx`**,
**`src/components/sections/CaseStudies.tsx`** · **`src/components/layout/Header.tsx`**
· **`src/app/not-found.tsx`** (créer).

1. **Bouton « Visiter le site »** au survol d'une carte projet :
   ancré en bas de la carte, révélé par `group-hover` **ET** `group-focus-within`
   (jamais accessible au clavier seulement au survol), `rel="noopener noreferrer"`
   + `target="_blank"`, style fantôme + flèche, **masqué si `study.url` absent**
   (MYKS). Le révélé ne doit pas faire sauter la métrique (zone réservée).
2. **Header masqué sur `/recrutement`** : dans `Header` (client, `usePathname`),
   retour `null` quand le chemin se termine par `/recrutement`. Zéro impact sur
   la landing (offset `-mt-16` du Hero) et le skip-link reste fourni par le layout.
3. **Page 404** `src/app/not-found.tsx` : rendue **dans le layout locale**
   (vérifié : `<html>` présent sur `/fr/page-inexistante`) → polices + tokens.
   Composition : `micro` « 404 · PAGE INTROUVABLE », titre `.h-display` avec voix
   serif, phrase courte, CTA volt « Retour à l'accueil » + lien fantôme
   « Voir les réalisations », ambiance `.hero-bg` voilée, densité `100svh`.
   Clés : **à ajouter par le LEAD** (1.2) → `a11y`/`notFound` FR+EN.

## 5. Textes des 2 nouveaux paragraphes (§1.2 — à valider)

> **Fuseau de référence.** Les créneaux proposés sont ceux de l'entreprise,
> en heure algérienne (9h–16h). Ils sont **automatiquement affichés à votre
> heure locale** : vous choisissez une heure qui vous convient, chez vous.
>
> **Pas de travail de nuit.** Ce décalage ne change rien à vos horaires de
> travail : la seule fois où il compte, c'est pour l'entretien lui-même.
>
> **Le jour J.** Rejoignez le Google Meet **5 minutes avant** l'heure choisie.
> L'entretien dure **en moyenne 30 minutes**. Une fois validé, le créneau n'est
> **plus modifiable**.

(EN symétrique.)

---

## Partition des fichiers

| Fichier | Piste |
|---|---|
| `content/{types,fr,en}.ts` · `(marketing)/layout.tsx` · `components/layout/Footer.tsx` | **LEAD** (§1) |
| `lib/slots.ts` · `lib/slots.test.ts` · `actions/interviews.ts` | **Backend** (§2) |
| `app/[locale]/entretien/[token]/page.tsx` · `components/recrutement/InterviewForm.tsx` | **F1** (§3) |
| `sections/CaseStudyCard.tsx` · `sections/CaseStudies.tsx` · `layout/Header.tsx` · `app/not-found.tsx` | **F3** (§4) |
| `src/content/platform/*` · `src/remotion/**` · `VIDEO.md` · `package.json` · `scripts/` · `public/audio/` | **INTOUCHÉS** |

**Aucun fichier partagé.** LEAD écrit le contenu **avant** le lancement, puis il fige.

## Sécurité & edge cases

1. Fenêtre figée à la génération → **jamais** de fenêtre lue côté client.
2. Lien expiré → état dédié, jamais une grille toute désactivée.
3. Offset négatif (Amériques) : la date locale du candidat peut être le **jour
   précédent** → l'onglet doit l'afficher correctement (testé en unitaire).
4. Email : destinataire inchangé (`admin@sofianeasma.me`), seul l'affichage
   public change.
5. `target="_blank"` → `rel="noopener noreferrer"` partout.
6. a11y : bouton 404 et bouton « visiter » ≥ 44 px, focus volt, `group-focus-within`.

## Ordre d'exécution

```
1) LEAD (§1) — contenu figé
2) Backend ∥ F1 ∥ F3            [contrat : dates = string[] YYYY-MM-DD algériennes]
3) LEAD : tsc · npm test · npm run build
4) E2E maison : créneaux PH/+7, fenêtre J+1→J+3, expiration, cursor, header masqué,
   bouton visite, 404, email
```

## Validation finale

`tsc 0` · `vitest` vert (tests réécrits) · `next build` · captures Playwright
(agenda en fuseau décalé, 404, `/recrutement` sans header, carte projet au survol)
· grep email : **0** `atherislabs.com` en adresse email.
