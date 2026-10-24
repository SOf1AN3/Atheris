"use server";

/**
 * Atheris — Server Actions **cœur CEO** (FE-8 · T21/T22/T24) : wrappers.
 *
 * SÉCURITÉ DU VIEWER — **MÊME MODÈLE QUE `src/actions/vendor.ts` (FE-7)** :
 * les contrats figés de `@/actions/quotes`, `@/actions/payments` et
 * `@/actions/commissions` attendent un `actor { id, role }` que seul un
 * composant **serveur** peut fournir en toute confiance, or les arguments
 * d'une Server Action voyagent dans la requête POST : un client malveillant
 * pourrait forger `{ id: <uuid>, role: "ceo" }` pour contourner le RBAC.
 *
 * → ICI, l'acteur est **toujours reconstruit côté serveur** depuis la session
 * Auth.js (`auth()`) : aucun identifiant ni rôle ne transite par le client.
 * Les composants UI (QuoteCreateDialog, DealsTab, PaymentPanel,
 * CommissionQueue) n'importent **que** ces wrappers, jamais les actions
 * figées directement — elles restent appelables uniquement depuis le serveur.
 *
 * ZÉRO DUPLICATION DE LOGIQUE MÉTIER : validation Zod, graphe des statuts,
 * verrous optimistes, déclencheur de commissions et audit restent intégralement
 * dans les fichiers `src/actions/{quotes,payments,commissions}.ts` (figés) —
 * ce fichier ne fait que « signer » chaque appel avec l'identité serveur.
 * Double filet : un compte sans session, non `active` ou de rôle non `ceo`
 * reçoit `forbidden` ICI avant tout accès DB, et les actions figées
 * re-valident elles-mêmes `role !== "ceo"` → `forbidden`.
 *
 * DB-PENDING : aucun import de `@/lib/db` ; `auth()` n'est appelé qu'au
 * runtime de l'action — `next build` ne touche jamais `DATABASE_URL`.
 */

import { markCommissionsPaid } from "@/actions/commissions";
import type {
  MarkCommissionsPaidInput,
  MarkCommissionsPaidResult,
} from "@/actions/commissions";
import { createPayment, markPaymentPaid } from "@/actions/payments";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  MarkPaymentPaidInput,
  MarkPaymentPaidResult,
} from "@/actions/payments";
import { changeQuoteStatus, createQuote } from "@/actions/quotes";
import type {
  ChangeQuoteStatusInput,
  ChangeQuoteStatusResult,
  CreateQuoteInput,
  CreateQuoteResult,
} from "@/actions/quotes";
import { auth } from "@/auth";
import type { Role } from "@/lib/permissions";

/**
 * Identité serveur reconstruite depuis la session — **jamais** montée du
 * client. `null` = aucune session OU compte non `active` (même garde que
 * `vendor.ts`), converti en `forbidden` par chaque wrapper.
 */
async function activeActor(): Promise<{ id: string; role: Role } | null> {
  const session = await auth();
  if (!session || session.user.status !== "active") return null;
  return { id: session.user.id, role: session.user.role };
}

/**
 * Crée un devis AU NOM du compte CEO connecté.
 *
 * @returns Contrat `createQuote` inchangé : `{ ok: true; id }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" }`.
 */
export async function ceoCreateQuote(
  input: CreateQuoteInput,
): Promise<CreateQuoteResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };
  return createQuote(input, actor);
}

/**
 * Transitionne un devis AU NOM du compte CEO connecté.
 *
 * @returns Contrat `changeQuoteStatus` inchangé (codes bruts i18nalisés
 *   côté client).
 */
export async function ceoChangeQuoteStatus(
  input: ChangeQuoteStatusInput,
): Promise<ChangeQuoteStatusResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };
  return changeQuoteStatus(input, actor);
}

/**
 * Ajoute une échéance d'échéancier AU NOM du compte CEO connecté.
 *
 * @returns Contrat `createPayment` inchangé.
 */
export async function ceoCreatePayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };
  return createPayment(input, actor);
}

/**
 * Encaisse une échéance AU NOM du compte CEO connecté (déclencheur de
 * commissions — le compteur renvoyé est celui du contrat figé).
 *
 * @returns Contrat `markPaymentPaid` inchangé :
 *   `{ ok: true; commissionsGenerated }` | code d'échec brut.
 */
export async function ceoMarkPaymentPaid(
  input: MarkPaymentPaidInput,
): Promise<MarkPaymentPaidResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };
  return markPaymentPaid(input, actor);
}

/**
 * Verse un lot de commissions AU NOM du compte CEO connecté.
 *
 * @returns Contrat `markCommissionsPaid` inchangé :
 *   `{ ok: true; paidCount }` | code d'échec brut.
 */
export async function ceoMarkCommissionsPaid(
  input: MarkCommissionsPaidInput,
): Promise<MarkCommissionsPaidResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };
  return markCommissionsPaid(input, actor);
}
