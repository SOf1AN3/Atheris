"use server";

/**
 * Atheris — Server Action **moyen de paiement du SDR** (PLAN-REFONTE L8 ·
 * décision D4).
 *
 * CONTRAT PUBLIC (codes BRUTS — traduits côté client dans
 * `content/platform/payout.*`, aucun message serveur) :
 * ```
 * savePayoutMethod(input) → { ok: true } | { ok: false; code: "invalid" | "forbidden" | "failed" }
 * ```
 *
 * RÔLE : **`sdr`** seul (motif `activeActor` de `recrutement.ts`).
 *
 * ─── « Un seul bloc rempli » (motif du schéma, Zod applicatif) ──────────────
 * `payout_details` est UNIQUE par compte : une union discriminée par `method`
 * valide le bloc correspondant et REMPLACE la ligne entière. Les colonnes des
 * autres méthodes sont remises à `null` à l'écriture (UPSERT) — jamais de
 * reliquat d'une méthode précédente (un IBAN Wise ne survit pas à un
 * basculement PayPal).
 *
 * ─── D4 — stockage en clair, masquage à l'affichage ─────────────────────────
 * Les valeurs sont stockées **en clair** (arbitrage client D4 : le CEO doit
 * pouvoir lire l'IBAN pour virer, et le tri reste simple). Le masquage
 * (`•••• 4821`, `a•••o@domaine.tld`) est appliqué à l'AFFICHAGE uniquement,
 * côté serveur de la page profil — **ce n'est pas une protection** : un accès
 * direct à la base donne les coordonnées lisibles. Assumé et documenté.
 *
 * neon-http (C3) : aucun `db.transaction()` — UPSERT `onConflictDoUpdate`
 * sur `user_id` UNIQUE.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { payoutDetails } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type`.
// ---------------------------------------------------------------------------

/** Méthode de versement — miroir de l'enum `payout_method` (schema.ts). */
export type PayoutMethod = "wise" | "paypal" | "bank";

/**
 * Entrée de `savePayoutMethod` — champs OPTIONNELS en TS (l'union Zod impose
 * le bloc correspondant à la méthode choisie : un champ manquant = `invalid`).
 */
export type SavePayoutInput = {
  method: PayoutMethod;
  accountEmail?: string;
  currency?: string;
  holderName?: string;
  bankName?: string;
  iban?: string;
  swiftBic?: string;
};

/** Résultat de `savePayoutMethod`. */
export type SavePayoutResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "forbidden" | "failed" };

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — union discriminée : un SEUL bloc de champs est exigé.
// ---------------------------------------------------------------------------

const accountEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email());

/** Devise ISO 4217 en majuscules (USD / EUR / GBP…). */
const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

/** IBAN : espaces retirés puis normalisé majuscules, 8 à 34 alphanumériques. */
const ibanSchema = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{8,34}$/));

/** BIC/SWIFT : 8 alphanumériques, ou 11 avec le suffixe de branche. */
const bicSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/);

const wiseSchema = z.object({
  method: z.literal("wise"),
  accountEmail: accountEmailSchema,
  currency: currencySchema,
});

const paypalSchema = z.object({
  method: z.literal("paypal"),
  accountEmail: accountEmailSchema,
});

const bankSchema = z.object({
  method: z.literal("bank"),
  holderName: z.string().trim().min(1).max(120),
  bankName: z.string().trim().min(1).max(120),
  iban: ibanSchema,
  swiftBic: bicSchema,
});

const payoutSchema = z.discriminatedUnion("method", [
  wiseSchema,
  paypalSchema,
  bankSchema,
]);

/** Ligne normalisée à écrire — TOUTES les colonnes posées (ou `null`). */
type PayoutRow = {
  method: PayoutMethod;
  accountEmail: string | null;
  currency: string | null;
  holderName: string | null;
  bankName: string | null;
  iban: string | null;
  swiftBic: string | null;
};

// ---------------------------------------------------------------------------
// savePayoutMethod.
// ---------------------------------------------------------------------------

/**
 * Enregistre le moyen de versement du compte SDR connecté (remplacement
 * complet de la ligne précédente).
 *
 * Traitement : garde `sdr` → union Zod (bloc unique selon `method`) →
 * **UPSERT** `payout_details` sur `user_id` UNIQUE. Lecture du moyen courant
 * côté serveur (`profil/page.tsx`, SELECT direct) : jamais de valeur sensible
 * retournée à l'ici.
 *
 * @param input `{ method: "wise" | "paypal" | "bank", …champs de la méthode }`.
 * @returns `{ ok: true }` si la ligne est écrite ; sinon code brut.
 * @throws Erreur d'infra DB non interceptée — propagée → 500.
 */
export async function savePayoutMethod(
  input: SavePayoutInput,
): Promise<SavePayoutResult> {
  const session = await auth();
  if (!session || session.user.status !== "active") {
    return { ok: false, code: "forbidden" };
  }
  if (session.user.role !== "sdr") return { ok: false, code: "forbidden" };
  const me = session.user.id;

  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const data = parsed.data;

  // Bloc complet : les colonnes hors méthode sont explicitement `null` (jamais
  // de reliquat — voir en-tête).
  const row: PayoutRow =
    data.method === "wise"
      ? {
          method: "wise",
          accountEmail: data.accountEmail,
          currency: data.currency,
          holderName: null,
          bankName: null,
          iban: null,
          swiftBic: null,
        }
      : data.method === "paypal"
        ? {
            method: "paypal",
            accountEmail: data.accountEmail,
            currency: null,
            holderName: null,
            bankName: null,
            iban: null,
            swiftBic: null,
          }
        : {
            method: "bank",
            accountEmail: null,
            currency: null,
            holderName: data.holderName,
            bankName: data.bankName,
            iban: data.iban,
            swiftBic: data.swiftBic,
          };

  const db = getDb();
  try {
    await db
      .insert(payoutDetails)
      .values({ userId: me, ...row })
      .onConflictDoUpdate({
        target: payoutDetails.userId,
        set: { ...row, updatedAt: sql`now()` },
      });
    return { ok: true };
  } catch (error) {
    console.error("[payout] enregistrement du moyen de paiement impossible", error);
    return { ok: false, code: "failed" };
  }
}
