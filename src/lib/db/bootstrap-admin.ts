/**
 * Atheris — script de création du compte administrateur (CEO) initial.
 *
 * POURÇOI CE SCRIPT — la plateforme n'a AUCUNE source naturelle de compte
 * `ceo` :
 *   - les migrations (`drizzle/*.sql`) n'insèrent aucune ligne ;
 *   - l'inscription publique (`applyAsCandidate`) ne crée que des comptes
 *     `vendeur` en statut `pending` — et **seul un CEO** peut les approuver
 *     (`src/actions/applications.ts`) ;
 *   - les invitations client sont réservées au CEO (`src/actions/invitations.ts`).
 * Sans un premier CEO actif, personne ne peut donc créer ni valider un compte
 * (boucle fermée). Ce script casse la boucle — il est à exécuter UNE fois.
 *
 * ≠ `seed.ts` : **aucune donnée de démo** (un seul compte, aucun prospect,
 * devis ou projet). Il ne demande pas `SEED_DEMO=1` (intention différente) mais
 * impose les mêmes garde-fous DB.
 *
 * GARDE-FOUS :
 *  1. `DATABASE_URL` absente ou contenant « placeholder » → refus explicite ;
 *  2. mot de passe fourni via `ADMIN_PASSWORD` uniquement (jamais dans le
 *     dépôt, jamais en clair dans la ligne de commande ni dans les journaux) ;
 *  3. robustesse conforme à la règle affichée côté inscription
 *     (`auth.signup.passwordRules` : 12 car. + majuscule + chiffre + spécial),
 *     strictement supérieure au plancher Zod de `authorize` (8 car.) ;
 *  4. AUCUNE élévation de privilège silencieuse : un compte existant de rôle
 *     ≠ `ceo` n'est promu que si `ADMIN_PROMOTE=1` est explicite ;
 *  5. AUCUN reset de mot de passe par défaut : `ADMIN_RESET_PASSWORD=1` requis
 *     pour réinitialiser le mot de passe d'un compte déjà existant.
 *
 * Idempotent : relançable à l'identique (le compte existant n'est ni dupliqué
 * ni réécrit sans les drapeaux explicites ci-dessus).
 *
 * Écrit une trace d'audit `admin.bootstrapped` (`actorId: NULL` = action
 * système), NON FATALE — jamais le mot de passe ni le hash dans le journal.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur de `main()` →
 * `next build` ne lit jamais `DATABASE_URL`.
 *
 * Usage :
 *   $env:ADMIN_PASSWORD="…"; npm run db:bootstrap-admin
 * Variables : `ADMIN_EMAIL` (défaut : admin@sofianeasma.me), `ADMIN_NAME`,
 * `ADMIN_PHONE`, `ADMIN_PROMOTE=1`, `ADMIN_RESET_PASSWORD=1`.
 */

import { eq } from "drizzle-orm";
import { config as loadEnv } from "dotenv";

import { getDb } from "@/lib/db";
import { activities, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";

/** Email administrateur par défaut (surchargeable via `ADMIN_EMAIL`). */
const DEFAULT_ADMIN_EMAIL = "admin@sofianeasma.me";

/** Nom par défaut du compte administrateur (surchargeable via `ADMIN_NAME`). */
const DEFAULT_ADMIN_NAME = "Administrateur Atheris";

/**
 * Règle de robustesse imposée — identique à `auth.signup.passwordRules` :
 * 12 caractères minimum, une majuscule, un chiffre et un caractère spécial.
 */
const PASSWORD_RULES =
  "12 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.";

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Forme normalisée d'un email (règle métier : minuscules, comme partout). */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Contrôle la robustesse d'un mot de passe ; renvoie la liste des manques. */
function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push("au moins 12 caractères");
  if (!/[A-Z]/u.test(password)) issues.push("une majuscule");
  if (!/[0-9]/u.test(password)) issues.push("un chiffre");
  if (!/[^A-Za-z0-9]/u.test(password)) issues.push("un caractère spécial");
  return issues;
}

/**
 * Exige le mot de passe d'administration (variable d'environnement, jamais en
 * argument de ligne de commande — il apparaîtrait dans l'historique du shell).
 *
 * @param password valeur de `ADMIN_PASSWORD` (potentiellement absente).
 * @returns le mot de passe validé.
 * @throws avec le message complet des règles si absent ou trop faible.
 */
function requirePassword(password: string | undefined): string {
  if (password === undefined || password.length === 0) {
    throw new Error(
      "ADMIN_PASSWORD manquant — ex. PowerShell : " +
        '$env:ADMIN_PASSWORD="…"; npm run db:bootstrap-admin ' +
        `(règles : ${PASSWORD_RULES}).`,
    );
  }
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    throw new Error(
      `ADMIN_PASSWORD trop faible (il manque ${issues.join(", ")}) — règles : ${PASSWORD_RULES}.`,
    );
  }
  return password;
}

/** Trace d'audit NON FATALE — jamais le mot de passe ni le hash. */
async function audit(
  action: string,
  entityId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(activities).values({
      actorId: null, // action système (convention : cron, seed)
      action,
      entityType: "user",
      entityId,
      meta,
    });
  } catch (error) {
    console.error(`[bootstrap-admin] activité \`${action}\` non journalisée`, error);
  }
}

// ---------------------------------------------------------------------------
// main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Le script tourne hors Next.js : charger `.env.local` (dotenv ne
  // surcharge jamais une variable déjà présente dans l'environnement).
  loadEnv({ path: ".env.local" });

  // Garde-fou 1 — DB-PENDING : aucune connexion tant que l'URL est factice.
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("placeholder")) {
    throw new Error(
      "bootstrap impossible : DATABASE_URL placeholder (DB-PENDING) — renseigner une URL réelle dans .env.local puis relancer.",
    );
  }

  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL);
  const name = (process.env.ADMIN_NAME ?? DEFAULT_ADMIN_NAME).trim();
  const phone = process.env.ADMIN_PHONE?.trim() || null;
  const promote = process.env.ADMIN_PROMOTE === "1";
  const reset = process.env.ADMIN_RESET_PASSWORD === "1";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error(`ADMIN_EMAIL invalide : « ${email} ».`);
  }
  if (name.length < 2) {
    throw new Error("ADMIN_NAME trop court (2 caractères minimum).");
  }

  console.log(`[bootstrap-admin] cible : ${email}`);

  const db = getDb();

  // ---------------------------------------------------------------------------
  // Cas 1 — le compte existe déjà : jamais dupliqué.
  // ---------------------------------------------------------------------------
  const [existing] = await db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing !== undefined) {
    if (existing.role !== "ceo") {
      if (!promote) {
        throw new Error(
          `Le compte ${email} existe avec le rôle « ${existing.role} » : refus de promotion silencieuse. ` +
            "Re-lancer avec ADMIN_PROMOTE=1 pour le passer en CEO (action explicite), " +
            "ou choisir un autre email via ADMIN_EMAIL.",
        );
      }
      await db
        .update(users)
        .set({ role: "ceo", status: "active" })
        .where(eq(users.id, existing.id));
      console.log(
        `[bootstrap-admin] compte promu : rôle ${existing.role} → ceo, statut → active.`,
      );
    } else if (existing.status !== "active") {
      await db.update(users).set({ status: "active" }).where(eq(users.id, existing.id));
      console.log(
        `[bootstrap-admin] statut ${existing.status} → active (compte CEO réactivé).`,
      );
    } else {
      console.log("[bootstrap-admin] compte CEO déjà actif — aucune écriture.");
    }

    if (reset) {
      const password = requirePassword(process.env.ADMIN_PASSWORD);
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, existing.id));
      console.log("[bootstrap-admin] mot de passe réinitialisé (ADMIN_RESET_PASSWORD=1).");
    } else if (existing.role !== "ceo" || existing.status !== "active") {
      console.log(
        "[bootstrap-admin] astuce : ADMIN_RESET_PASSWORD=1 permet de réinitialiser son mot de passe.",
      );
    }

    await audit("admin.bootstrapped", existing.id, {
      email,
      outcome: "existing",
      promoted: promote && existing.role !== "ceo",
      passwordReset: reset,
    });
    console.log(`[bootstrap-admin] terminé — compte prêt : ${email}`);
    return;
  }

  // ---------------------------------------------------------------------------
  // Cas 2 — création du compte administrateur.
  // ---------------------------------------------------------------------------
  const password = requirePassword(process.env.ADMIN_PASSWORD);
  const passwordHash = await hashPassword(password);

  const inserted = await db
    .insert(users)
    .values({
      email,
      name,
      phone,
      passwordHash,
      role: "ceo",
      status: "active",
    })
    .returning({ id: users.id });

  const id = inserted[0]?.id;
  if (id === undefined) throw new Error("insert users sans retour d'identifiant.");

  await audit("admin.bootstrapped", id, { email, name, outcome: "created" });

  console.log(`[bootstrap-admin] compte CEO créé : ${email} (${name}) — statut active.`);
  console.log("[bootstrap-admin] terminé — le compte peut maintenant valider les candidatures.");
}

// `main()` est lancée ici mais `getDb()` n'est appelé qu'à l'intérieur :
// l'import du module (build) n'ouvre jamais de connexion.
main().catch((error: unknown) => {
  console.error(
    "[bootstrap-admin] ÉCHEC —",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
