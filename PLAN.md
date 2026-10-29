# PLAN.md — Lot 4 : système de notifications du CRM

> **Statut : 🟡 EN ATTENTE DE VALIDATION EXPLICITE** — aucun code avant feu vert.
> Version 1.0 — 29/10/2026 · Lot 3 exécuté et poussé (`cc2d3d6`) → `PLAN.md` réutilisé.
> ⚠ Hors périmètre absolu : `src/remotion/**`, `scripts/*.mjs` (vidéo), `public/fonts/**`, `logo/**`, `package.json`, `.env.local`.

---

## Contexte & besoin métier

Le CRM est **aveugle entre deux visites** : un prospect arrive du formulaire de contact, un candidat dépose son CV, un candidat réserve un entretien, un client écrit dans la messagerie, une commission devient versable — **personne ne le sait sans ouvrir la bonne page**. Il faut un **système de notifications in-app** : compte de non-lues visible en permanence, panneau déroulant, alerte à l'arrivée pendant la consultation.

**Décisions utilisateur (D1–D4)** :
- **D1** — Canaux : **in-app seulement** (cloche + badge + toasts) ; pas d'e-mail digest (les e-mails explicites existent déjà).
- **D2** — Latence : **polling 30–45 s** (pas de SSE en v1), en pause si l'onglet est masqué.
- **D3** — Périmètre : **les 11 événements** demandés (12 types de notifications — « commissions due/payées » compte pour deux).
- **D4** — **Aucune notification pour le rôle `commercial` en v1** : retiré de TOUTES les listes de destinataires (contact, devis signé, messages projet, jalons). Une bascule de cette règle se fera en un seul endroit (la matrice §2.2).

**Choix techniques du Lead (sans déranger)** : table dédiée `notifications` (l'audit `activities` n'a ni destinataire ni état « lu ») · écriture **non fatale** via helper `notify()` (motif des audits : jamais faire échouer une action utilisateur) · libellés **100 % dict** (type + `meta` en base, rendu i18n côté client, aucun message stocké) · liens **sans locale** stockés, préfixés côté client (convention `PlatformNavItem.href`) · **pas de page `/notifications`** en v1 : le panneau de la topbar suffit · conservation **30 jours** (purge automatique à l'écriture).

---

## 1. Base de données — **sous-agent Database** (bloquant, en premier)

### 1.1 Table `notifications` — `src/lib/db/schema.ts` + migration `drizzle/0005_*.sql`

```ts
export const notifications = pgTable("notifications", {
  id:           uuid("id").primaryKey().defaultRandom(),
  // Destinataire UNIQUE (pas de ciblage par rôle en base : le rôle est
  // résolu au moment de l'écriture par notify() → jamais de balayage de table).
  recipientId:  uuid("recipient_id").notNull()
                  .references((): PgColumn => users.id, { onDelete: "cascade" }),
  // Type du déclencheur — liste FERMÉE (constante NOTIFICATION_TYPES dans notify.ts).
  type:         text("type").notNull(),
  // Chemin SANS locale ("/espace/prospects/{id}") — le client préfixe (convention nav).
  link:         text("link").notNull(),
  // Contexte de rendu : { actor?, entity?… } — strings brutes, JAMAIS de message traduit.
  meta:         jsonb("meta").$type<Record<string, string>>().notNull().default({}),
  // Anti-doublon d'insertion idempotente (relances) ; NULL = pas de dédup.
  dedupeKey:    text("dedupe_key"),
  readAt:       tstz("read_at"),                       // NULL = non lue
  createdAt:    tstz("created_at").defaultNow().notNull(),
}, (t) => [
  index("notifications_recipient_created_idx").on(t.recipientId, t.createdAt),
  // Compte des non-lues : partiel = petit et rapide.
  index("notifications_recipient_unread_idx").on(t.recipientId).where(sql`read_at IS NULL`),
  // Dédup : insert avec ON CONFLICT DO NOTHING (jamais d'erreur remontée).
  uniqueIndex("notifications_recipient_dedupe_uq").on(t.recipientId, t.dedupeKey)
    .where(sql`dedupe_key IS NOT NULL`),
]);
```

**Migration** : `npm run db:generate` → vérifier le SQL (CREATE TABLE + index). ⚠ `npm run db:migrate` est défaillant sur ce projet (leçons 0003/0004) → **appliquer par script tsx jetable** (mêmes étapes : SELECT du format `drizzle.__drizzle_migrations`, exécution SQL, INSERT journalisé sha256), script supprimé ensuite.

**Fait =** table créée sur Neon ; `\d notifications` conforme ; lignes 0.

---

## 2. API & Backend — **sous-agent Backend**

### 2.1 Helper central — **`src/lib/notify.ts`** (nouveau, serveur uniquement)

```ts
/** Type de notification — liste fermée (12 valeurs). */
export type NotificationType =
  | "contact_received" | "application_created" | "interview_booked"
  | "prospect_status_changed" | "quote_signed" | "project_message"
  | "commission_due" | "commission_paid" | "milestone_validated"
  | "account_activated" | "reminder_due" | "mail_failed";

export type NotifyInput = {
  type: NotificationType;
  /** Chemin sans locale, ex. "/espace/prospects/{id}". */
  link: string;
  /** Contexte de rendu (noms, libellés bruts) — jamais de phrase traduite. */
  meta?: Record<string, string>;
  /** Destinataires DÉJÀ résolus par l'appelant (uuid). */
  recipientIds: string[];
  /** Anti-doublon optionnel (ex. "reminder:{prospectId}:{instantISO}"). */
  dedupeKey?: string;
};

/** Écrit les notifications. JAMAIS fatal : try/catch + console.error. */
export async function notify(input: NotifyInput): Promise<void>;
```

Comportement : filtre `recipientIds` validés (uuid, sans doublon, ≠ vide) → `INSERT … ON CONFLICT DO NOTHING` (batch) → purge opportuniste `DELETE … WHERE created_at < now() - interval '30 days'` (non fatal) → tout dans un `try/catch` global **qui ne rethrow jamais**.

### 2.2 Résolution des destinataires — matrice **dans chaque appelant**, avec règle d'or
> **Ne jamais notifier l'acteur lui-même** (filter `!== actor.id`), et toujours **au moins un destinataire** sinon rien n'est écrit.

| # | Événement (`type`) | Fichier d'appel (action existante) | Destinataires | `link` |
|---|---|---|---|---|
| 1 | `contact_received` | `src/actions/contact.ts` (après insert prospect) | ceo, manager *(commercial exclu — D4)* | `/espace/prospects/{id}` |
| 2 | `application_created` | `src/actions/careers.ts` (après insert candidature) | ceo | `/espace/recrutement` |
| 3 | `interview_booked` | `src/actions/interviews.ts` (`submitInterview` → `ok:true`) | ceo | `/espace/entretien` |
| 4 | `prospect_status_changed` | `src/actions/status.ts` (transition OK, hors cas « signe ») | `prospects.sourceUserId` (≠ acteur) + ceo (si ≠ acteur) | `/espace/prospects/{id}` |
| 5 | `quote_signed` | `src/actions/status.ts` (transition `→ signe`, **remplace** le type 4 pour cette transition : 1 seule notif par action) | owner + ceo + manager (− acteur) *(commercial exclu — D4)* | `/espace/prospects/{id}` |
| 6 | `project_message` | `src/actions/messages.ts` (après insert message) | **acteur = client** → ceo + manager *(commercial exclu — D4)* ; **acteur = interne** → comptes `users.default_project_id = projet` (les clients) (− acteur) | `/espace/projet` (client) / `/espace/prospects/{id}` (interne → lien projet) |
| 7 | `commission_due` | `src/actions/commissions.ts` (génération) | `beneficiaryId` (si ≠ null, ≠ acteur) + ceo (≠ acteur) | `/espace/commissions` |
| 8 | `commission_paid` | `src/actions/commissions.ts` (marquage payé) | `beneficiaryId` (si ≠ null) | `/espace/commissions` |
| 9 | `milestone_validated` | `src/actions/project.ts` (validation de jalon) | ceo, manager (− acteur) *(commercial exclu — D4)* | `/espace/projet` |
| 10 | `account_activated` | `src/actions/invitations.ts` (`activateAccount`, post-batch) | ceo | `/espace/tableau-de-bord` |
| 11 | `mail_failed` | `src/actions/recrutement.ts` (`inviteToInterview`, `recruitCandidate`) + `src/actions/invitations.ts` (`createClientInvitation`, `mailSent:false`) | ceo | contextuel (`/espace/recrutement` ou `/espace/prospects/{id}`) |
| 12 | `reminder_due` | `src/actions/prospects.ts` (`listProspects`, **déclenchement à l'accès** — pas de cron serverless) : pour chaque prospect `nextReminderAt <= now()` sans notif existante (`dedupeKey = "reminder:{id}:{nextReminderAt ISO}"`) → notif **au propriétaire** (`sourceUserId`), sinon au ceo | owner, sinon ceo | `/espace/prospects/{id}` |

Règle d'or d'implémentation : chaque appelleur résout SES uuid (session/lecture DB) **en amont** de `notify()`, avec le filtre anti-acteur. `notify()` ne contient AUCUNE logique métier ni RBAC.

### 2.3 API de lecture — `src/app/api/notifications/route.ts` (nouveau)
`GET` (motif `documents/[id]/route.ts` : `auth()` côté route handler) :
- session absente / `status !== "active"` / rôle invalide → **401** (le hook arrête alors le polling) ;
- sinon `{ ok: true, unreadCount: number, items: NotificationItem[] }` avec les **20 dernières** lignes du connecté (tri `createdAt` desc) :
```ts
type NotificationItem = { id: string; type: NotificationType; link: string;
  meta: Record<string, string>; readAt: string | null; createdAt: string };
```
- requêtes : `count(*) FILTER (WHERE read_at IS NULL)` + select 20 lignes (2 requêtes simples, `notifications_recipient_unread_idx`).

### 2.4 Actions d'écriture — **`src/actions/notifications.ts`** (nouveau, `"use server"`)
```ts
markNotificationsRead(ids: string[])      → { ok: true } | { ok: false; code: "invalid" | "forbidden" }
markAllNotificationsRead()                → { ok: true } | { ok: false; code: "forbidden" }
```
- Zod : `ids` = tableau uuid, 1–50 éléments → sinon `invalid`.
- `UPDATE … SET read_at = now() WHERE recipient_id = me AND id IN (…)` (**jamais** de cible étrangère) ; `markAll` = même filtre sans `id`.
- `ok` par défaut si 0 ligne mise à jour (idempotent).

---

## 3. UI — **sous-agents Frontend** (2 pistes, fichiers disjoints)

### FE-A — Dictionnaires (`src/content/platform/{fr,en,types}.ts`)
Section `notifications` (FR/EN strictement symétriques + type dans `types.ts`) :
- `title` « Notifications »/« Notifications » · `open` (aria-label) « Ouvrir les notifications »/« Open notifications » · `empty` « Aucune nouvelle notification »/« No new notifications » · `markAll` « Tout marquer lu »/« Mark all as read » · `unreadBadge` « {count} non lues »/« {count} unread » · `view` « Voir »/« View » (action des toasts).
- `items` : **12 clés miroir de `NotificationType`** (phrases courtes, FR/EN), placeholders `{{actor}}` et `{{entity}}` (double accolade, remplacés côté client) :
  `contactReceived` « Nouveau contact : {{entity}} » · `applicationCreated` « Nouvelle candidature : {{entity}} » · `interviewBooked` « Entretien réservé : {{entity}} » · `prospectStatusChanged` « {{actor}} a changé le statut de {{entity}} » · `quoteSigned` « Devis signé : {{entity}} » · `projectMessage` « Nouveau message de {{actor}} » · `commissionDue` « Commission à verser : {{entity}} » · `commissionPaid` « Commission versée : {{entity}} » · `milestoneValidated` « Jalon validé : {{entity}} » · `accountActivated` « Compte activé : {{entity}} » · `reminderDue` « Relance due : {{entity}} » · `mailFailed` « E-mail non envoyé : {{entity}} ».
- Le type `NotificationType` est **répété littéralement** dans `types.ts` (`items: Record<NotificationType, string>` — import `type` depuis `@/lib/notify` interdit en frontière RSC ? si import type pur possible, l'utiliser ; sinon littéral figé à aligner dans le contrat).

### FE-B — Cloche, polling, toasts (fichiers : `src/app/[locale]/(app)/layout.tsx`, `src/components/app/AppShell.tsx`, `src/components/app/Topbar.tsx`, **nouveau** `src/components/app/NotificationsBell.tsx`, **nouveau** `src/hooks/useNotifications.ts`)

1. **Chaîne de props** : `layout (app)` lit `dict.notifications` (via `getPlatformDictionary`) → `<AppShell notifications={…}>` → `<Topbar notifications={…}>` → `<NotificationsBell labels={…} />`. Props 100 % sérialisables (motif des labels existants).
2. **`useNotifications` (hook)** —
   - `fetch("/api/notifications")` au montage → `{ unreadCount, items }` ; **état `hydrated`** : le badge n'est rendu qu'après le 1er retour (zéro mismatch d'hydratation).
   - **Polling 35 000 ms** (`setInterval`) : en pause si `document.visibilityState === "hidden"` ; re-fetch immédiat au `visibilitychange` → visible ; `clearInterval`/`clearTimeout` au démontage.
   - **Détection de nouveauté** : `Set` d'id connus initialisée au 1er retour ; aux polls suivants, items **inconnus** avec `createdAt > dateDeMontage` → `toast()` (sonner, déjà monté) : titre rendu depuis le dict + action `view` → `router.push(link localisé)`, puis ajout aux id connus (jamais 2× le même toast).
   - **401/403** → stoppe le polling définitivement (déconnexion).
3. **`NotificationsBell`** —
   - Icône `Bell` de lucide-react + pastille `unreadCount` (cap `9+`) ; `aria-label` = `open`, badge annoncé via `unreadBadge`.
   - Panneau : `DropdownMenu` (composant `src/components/ui/dropdown-menu` existant, NE PAS modifier `ui/**`) → liste des items : titre rendu (`items[type]` avec remplacement `{{actor}}`/`{{entity}}` depuis `meta`, clé absente → `items.unknown`? → repli sur `title` générique du dict `empty`… **non** : clé de repli `notifications.items` inconnu → utiliser la clé `contactReceived`? NON — spécifier : si `type` inconnu, afficher `notifications.title` + date, sans crash), pastille « non lue », `relativeTime` via `Intl.RelativeTimeFormat` (**côté client uniquement**, langue = `locale` du param d'URL — pas de dict), cliquer un item → `markNotificationsRead([id])` + `router.push(link localisé)` ; bas de panneau : bouton `markAll` → `markAllNotificationsRead()` + état local.
   - **Mobile** : cible ≥ 44 px, la topbar doit tenir à **375 px** (hamburger · marque · horloge langue · cloche · avatar) — si encombrement : masquer le switch de langue sous `sm` en faveur de la cloche (décision FE-B à arbitrer visuellement, signalée dans son rapport).
4. **`Topbar`/`AppShell`/`layout`** : transit simple des props, aucun changement de logique existante (Sheet mobile, avatar menu intacts).

---

## 4. Tests — **sous-agent Tester** (fin de module)

⚠ **Les scénarios créent de la donnée** dans la base purgée → **nettoyage obligatoire après les tests** par le Lead (script jetable : désinscription des 1–2 prospects/candidatures de test + leurs notifications, sur identification par email `*.test`/timestamp).

1. **Contact landing** (flux public) : remplir le formulaire de contact → sous ≤ 45 s connecté CEO, la cloche affiche **1 non lue** + toast à l'arrivée → clic = navigation vers la fiche prospect + passage à 0.
2. **Candidature** (formulaire `/fr/recrutement`, e-mail test) → notification CEO « Nouvelle candidature ».
3. **Marquage** : « Tout marquer lu » remet le badge à 0 ; rechargement = toujours 0.
4. **Persistance** : reconnexion (nouvel onglet) → badge recalculé depuis la DB.
5. **Isolation RBAC** : connecté CEO, aucune notification d'un autre destinataire ; API `/api/notifications` en **401** déconnecté ; `markNotificationsRead` avec un id étranger → 0 ligne modifiée (vérif stateless).
6. **Mobile 375 px** : cloche visible, cible ≥ 44 px, topbar sans débordement, panneau utilisable.
7. **Onglet masqué** : `visibilitychange` → pas de requête en arrière-plan (observé réseau), retour = re-fetch immédiat.
8. **i18n** : mêmes items en `/en` (phrases anglaises, relative time EN).

---

## Partition des fichiers (aucun fichier sur deux pistes)

| Fichier | Piste |
|---|---|
| `src/lib/db/schema.ts`, `drizzle/0005_*.sql` + meta | **DB** |
| `src/lib/notify.ts` (nouveau), `src/actions/notifications.ts` (nouveau), `src/app/api/notifications/route.ts` (nouveau) + **câblage** dans `contact.ts`, `careers.ts`, `interviews.ts`, `status.ts`, `messages.ts`, `commissions.ts`, `project.ts`, `invitations.ts`, `prospects.ts`, `recrutement.ts` | **Backend** |
| `src/content/platform/{fr,en,types}.ts` | **FE-A** |
| `src/app/[locale]/(app)/layout.tsx`, `components/app/{AppShell,Topbar}.ts(x)`, `NotificationsBell.tsx` (nouveau), `src/hooks/useNotifications.ts` (nouveau) | **FE-B** |

> `src/components/ui/**` : **lecture seule** pour tous. Aucun fichier n'appartient à deux pistes.

## Contrats inter-pistes (figés)

- **C1** Table `notifications` (§1.1) : colonnes `recipientId/type/link/meta/dedupeKey/readAt/createdAt`.
- **C2** `notify(input)` — `{ type, link, meta?, recipientIds, dedupeKey? }`, jamais fatal, aucun RBAC interne (§2.1).
- **C3** `NotificationType` (12 valeurs, §2.2) — la table `notifications.items` du dict est `Record<NotificationType, string>`.
- **C4** `GET /api/notifications` → **401** | `{ ok: true, unreadCount, items[≤20] }` avec `NotificationItem` (§2.3).
- **C5** `markNotificationsRead(ids)` / `markAllNotificationsRead()` → `{ ok: true } | { ok: false; code: "invalid" | "forbidden" }` (§2.4).
- **C6** Clés dict : `notifications.{title,open,empty,markAll,unreadBadge,view,items.*}` FR/EN (§FE-A) — `{{actor}}`/`{{entity}}` en double accolade.

## Sécurité & edge cases

- **Fuite de données** : API et actions ne lisent/écrivent QUE `recipient_id = moi` (index partiel dédié) ; un id étranger est ignoré (0 ligne), jamais d'erreur détaillée.
- **Anti-spam** : `notify()` non fatal + `ON CONFLICT DO NOTHING` (dedupe) + purge 30 j ; 1 seul toast par item (Set côté client) ; acteur jamais notifié de son propre acte.
- **Hydratation** : badge rendu uniquement après le 1er fetch (état `hydrated`) ; relative time client-only.
- **i18n** : stockage langage-agnostic (type + meta), 0 phrase en base (FR/EN rendus côté client) ; liens sans locale préfixés par le client.
- **Perf** : 2 requêtes par poll (count partiel + 20 lignes), poll en pause onglet masqué, zéro composant serveur re-rendu (pas de `router.refresh()` systématique).
- **Déconnexion / session expirée** : 401 → polling stoppé, badge disparaît.
- **Client portal** : un client ne reçoit que `project_message` (matrice §2.2) — test d'isolation obligatoire.
- **Serverless** : pas de cron (l'événement « relance » est déclenché à l'accès, §2.2 n°12) ; pas de WebSocket/SSE (D2).

## Ordre d'exécution

1. **DB** (bloquant, sérialisé) : table + migration appliquée sur Neon.
2. **Dès que DB rend la main** : **Backend ∥ FE-A ∥ FE-B** (contrats figés, fichiers disjoints).
3. Revue croisée Lead : `npm run lint` · `npx tsc --noEmit` · `npm test` · `npm run build`.
4. **Tester** (E2E, identifiants admin connus) + **nettoyage post-test** de la donnée créée.
5. Commit sérialisé par piste au format Conventional Commits + **push direct** (consentement du 28/10).

## Validation finale

Chaque agent termine par **`AUTO-OK`** (périmètre, TypeScript strict, conventions, i18n symétrique) ; sinon **`AUTO-KO`** + tâche de correction isolée.
