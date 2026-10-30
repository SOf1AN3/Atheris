# PLAN-REFONTE-PLATEFORME.md

> Refonte globale — parcours SDR (examen, KYC, profil, contrat, connexions).
> Document de travail du Lead. `PLAN.md` reste le référentiel historique.

## Décisions arbitrées (client)

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Barème progressif 10 → 20 % est autoritaire**, aucun plancher de 20 $ | Aucune modification de `commission.ts`. Le contrat sera rédigé dessus. |
| D2 | Suppression entretien : **code + UI supprimés, table conservée** | Aucune migration destructrice, réversible par git. |
| D3 | Pièce d'identité : **upload de fichier** (pas de caméra) | Réutilise le motif CV existant (bytea + métadonnées). |
| D4 | Coordonnées bancaires : **stockées en clair, masquées à l'affichage** | Le masquage est de l'affichage, pas une protection — assumé. |
| D5 | Contrat : **page privée SDR, consentement horodaté**, non bloquant | Le 1ᵉʳ virement exige le consentement (lien avec D6). |
| D6 | Après 3 j : **lien invalide, plus de recrutement** | `expiresAt` sur la session ; `generateExamLink` doit pouvoir régénérer. |
| D7 | Pièce refusée : **notification + motif + re-upload possible** | `identity_docs.status/rejectionReason` + notification + nouvel upload. |
| D8 | La colonne **statut** de la liste des candidatures devient une **pastille « Vérifié »** | Le `status` reste en base (pilote le RBAC) ; seul l'affichage change. |

## Hypothèses (non arbitrées, corrigeables)

- **H1** — la fenêtre 3 j court depuis la **candidature** (`created_at`), pas depuis le clic Start.
- **H2** — `startedAt` est **repoussé au clic Start** : sinon le chrono affiché ment (il compterait depuis le dépôt).
- **H3** — « Archivés » = **filtre** groupant `recrute` + `refuse` + `exam_failed`, pas un statut (zéro migration destructrice).
- **H4** — commission **gelée** : lignes créées, mais `paid` exige `users.verified_at IS NOT NULL`.
- **H5** — nom **verrouillé** par la pose de `verified_at` (pas un second booléen).
- **H6** — contrat **non bloquant**, mais requis pour le 1ᵉʳ virement.
- **H7** — « rester connecté » = `maxAge` 30 j sur le JWT Auth.js.
- **H8** — anti-copie = `user-select: none` : **frein au copier-coller, pas une protection réelle.**

## Lots

| Lot | Contenu | Migration | Bloque |
|---|---|---|---|
| **L1** | `users.verified_at` / `name_locked_at` · table `payout_details` · table `identity_docs` · table `contract_consents` · `exam_sessions.expires_at` | **oui** (ajout pur) | tout |
| **L2** | Page d'attente examen + bouton **Start** · email `exam_invite` (lien 3 j) · `expires_at` | — | L3, L4 |
| **L3** | *Previous* : flèche gauche seule · `user-select: none` sur les questions · relecture écran 24 h | — | — |
| **L4** | **`/espace/examen`** : en cours / soumis / archivés · clic → réponses · **Recruter / Refuser + popup de confirmation** | — | L5 |
| **L5** | Recrutement : retrait *Recruter*/*Refuser* + colonne créneaux · **email d'examen pour les anciens candidats** | — | — |
| **L6** | Suppression entretien : `/espace/entretien`, `InterviewLinks`, `interviews.ts`, `meet.ts`, `slots.ts`, leurs tests, route publique (**table conservée**) | — | — |
| **L7** | KYC : upload pièce SDR · visu CEO + **Vérifier** / **Refuser avec motif** · notification + re-upload · `verified_at` | — | L8, L9 |
| **L8** | Profil 3 sections · largeur des champs · nom verrouillé après vérif · **Payout Settings** (Wise/PayPal/Bank, badges, masquage) | — | L9 |
| **L9** | Équipe : clic membre → coordonnées bancaires · pastille **Vérifié** remplaçant la colonne statut | — | — |
| **L10** | Connexion : « rester connecté » · **mot de passe oublié** (email → jeton → page) | — | — |
| **L11** | Contrat : page privée SDR, **9 clauses sur le barème progressif**, case + horodatage + IP + copie email | — | L7 (D6) |

## Risques / points de vigilance

1. **PII sensible en base** : pièce d'identité et IBAN en clair (D3/D4). Aucun chiffrement — assumé, mais à réévaluer si le volume de SDR croît.
2. **Suppression entretien** : `job_applications.interview_id` garde une FK vers `interviews`. La table reste, donc la FK reste valide — aucune donnée perdue.
3. **`startedAt` repoussé au Start** : les sessions déjà créées conservent leur `started_at` de création. Un correctif de données est nécessaire (ou réinitialisation à la migration).
4. **Anti-copie faible** (H8) : ne jamais présenter `user-select: none` comme une protection.
5. **Notification SDR** : nécessite un compte `users` — les candidats **avant** embauche n'en ont pas. Pour D7 (pièce refusée), le destinataire est un SDR **déjà embauché**, donc OK.
