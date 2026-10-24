import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// ---------------------------------------------------------------------------
// Chargement des variables d'environnement
//
// Choix : `dotenv` explicite (devDependency) plutôt que le chargement automatique
// de drizzle-kit, qui ne lit pas `.env.local`. Next.js lit `.env.local` de façon
// native, mais drizzle-kit s'exécute en CLI hors de Next : on reproduit donc la
// même priorité que Next, à savoir `.env.local` puis `.env`.
// `dotenv.config()` ne surcharge jamais une variable déjà définie, donc
// `.env.local` prime sur `.env` (et sur l'environnement shell).
// Aucune valeur n'est écrite en dur ici : `DATABASE_URL` reste uniquement dans
// `.env.local` (ignoré par git).
// ---------------------------------------------------------------------------
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;

// `generate` est une opération 100 % offline (diff schéma ↔ fichiers SQL) :
// elle doit rester exécutable sur un clone/CI sans `.env.local`. Les commandes
// qui contactent réellement la base (`migrate`, `push`, `studio`, `pull`)
// exigent l'env, sinon leur échec serait silencieux.
const needsDatabase = ["migrate", "push", "studio", "pull"].some((cmd) =>
  process.argv.includes(cmd),
);

if (needsDatabase && !url) {
  // Ce fichier n'est exécuté que par la CLI drizzle-kit (jamais par Next.js) :
  // une erreur au chargement ici n'affecte ni `next build` ni le runtime.
  throw new Error(
    "DATABASE_URL manquant — définir `.env.local` (voir PLAN.md, règle DB-PENDING)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  // strict : confirmation requise avant tout `push` destructif.
  // verbose : impression des statements SQL exécutés.
  strict: true,
  verbose: true,
  dbCredentials: {
    // `url` peut être absent uniquement pour `generate` (offline) — les
    // commandes contactant la base ont été bloquées plus haut par le `throw`.
    url: url ?? "",
  },
});
