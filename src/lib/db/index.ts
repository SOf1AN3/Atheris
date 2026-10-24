import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// ---------------------------------------------------------------------------
// ⚠ NON-RÉGRESSION — CLIENT DB SERVEUR UNIQUEMENT
// Ce module doit être importé UNIQUEMENT côté serveur : Server Components,
// Route Handlers (`src/app/api/*`), Server Actions (`src/actions/*`).
// Il est INTERDIT de l'importer (directement ou via un fichier intermédiaire)
// dans un composant `"use client"` : `neon()` lirait `process.env` dans le
// bundle navigateur et casserait le build/le runtime.
// ---------------------------------------------------------------------------

/** Type public du client Drizzle (résultat de `getDb()`). */
export type Database = ReturnType<typeof createClient>;

/**
 * Retourne le client Drizzle (Neon HTTP) — **lazy** : aucune lecture de
 * `DATABASE_URL` ni aucune connexion DB au chargement du module, uniquement à
 * l'appel. Cela garantit que `next build` (aucun import exécuté côté module)
 * et les pages sans DB ne cassent jamais faute d'env réelle.
 *
 * Le type de retour est déduit par le compilateur (jamais `any`) ; `Database`
 * est déclaré juste en dessous pour éviter un cycle `ReturnType` ↔ annotation.
 *
 * @throws Error si `DATABASE_URL` est absent ou encore positionné sur le
 * placeholder du `.env.local` de dev.
 */
export function getDb(): Database {
  const url = process.env.DATABASE_URL;

  if (!url || url.includes("placeholder")) {
    throw new Error("DATABASE_URL manquant ou placeholder — voir .env.local");
  }

  // Memoïsation paresseuse : un seul client par process serveur (évite de
  // réinstancier `neon()` + `drizzle()` à chaque appel/Server Action).
  cached ??= createClient(url);
  return cached;
}

/** Client unique conservé entre les appels de `getDb()` (module scope). */
let cached: Database | undefined;

/**
 * Constructeur privé : séparé de `getDb()` pour que `Database` (déduit via
 * `ReturnType`) ne référence pas `getDb` lui-même — sinon cycle de types.
 */
function createClient(url: string) {
  const sql = neon(url);
  return drizzle({ client: sql, schema });
}
