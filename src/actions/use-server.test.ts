/**
 * Non-régression — DIRECTION `"/use server"` OBLIGATOIRE dans `src/actions/*`.
 *
 * Pourquoi ce test existe :
 * un fichier de Server Actions privé de la directive n'est PAS transformé en
 * action par Next : il reste un module ordinaire. Importé depuis un composant
 * `"use client"`, TOUT son implémenté est alors bundlé côté NAVIGATEUR.
 * Deux conséquences, toutes deux graves et toutes silencieuses :
 *
 *  1. fuite du code serveur dans le bundle public (driver DB, logique métier) ;
 *  2. `process.env.DATABASE_URL` est `undefined` dans le navigateur → chaque
 *     appel échoue à l'exécution, avec un message d'erreur qui ne dit RIEN de
 *     la cause réelle (« DATABASE_URL manquant » alors que la base est joignable).
 *
 * C'est exactement le défaut qu'a connu `src/actions/exams.ts` : 0 ligne écrite
 * malgré un parcours UI qui naviguait parfaitement, et un `console.error` qui
 * apparaissait dans la console du navigateur — signature du code exécuté au
 * mauvais endroit. Les tests unitaires du module pur ne pouvaient pas le voir,
 * seuls des tests de bout en bout l'ont intercepté.
 *
 * Le test vérifie donc que CHAQUE fichier de `src/actions/` commence (après
 * les commentaires et blancs) par la directive.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ACTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "actions");

/** Premier contenu non vide, commentaires de bloc `/** ... *\/` ignorés. */
function firstSignificantLine(source: string): string {
  const stripped = source
    // Commentaires de bloc (non greédy, y compris multilignes).
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Commentaires de ligne.
    .replace(/\/\/.*$/gm, "");
  return stripped.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
}

describe("src/actions — directive \"use server\"", () => {
  it("chaque fichier d'action commence par \"use server\";", async () => {
    // Les fichiers `*.test.ts` sont exclus : ils ne sont PAS des actions,
    // ils n'ont pas (à juste titre) la directive — c'est le cas de ce fichier.
    const files = (await readdir(ACTIONS_DIR)).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    // Garde anti-faux positif : le dossier ne doit pas être vide de sens.
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(join(ACTIONS_DIR, file), "utf8");
      const first = firstSignificantLine(source);
      if (!/^["']use server["'];/.test(first)) {
        offenders.push(`${file} → ${first.slice(0, 60)}`);
      }
    }

    expect(
      offenders,
      `Fichier(s) privé(s) de la directive "use server" — leur implémenté serait ` +
        `bundlé côté client (fuite de code serveur + échec à l'exécution) :\n` +
        offenders.map((o) => `  • ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("la directive est bien la PREMIÈRE instruction (avant tout import)", async () => {
    const files = (await readdir(ACTIONS_DIR)).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    for (const file of files) {
      const source = await readFile(join(ACTIONS_DIR, file), "utf8");
      const first = firstSignificantLine(source);
      expect(first, `${file} : la directive doit précéder les imports`).toMatch(
        /^["']use server["'];/,
      );
    }
  });

  /**
   * Contrainte RSC distincte, et NON couverte par `tsc` : un fichier
   * `"use server"` ne peut exporter QUE des fonctions async.
   *
   * Une constante ou un helper sync exporté de là ne produit AUCUNE erreur de
   * type — seulement une erreur au `next build`. Vérifier la directive ne
   * suffit donc pas : `exams.ts` l'avait tout en plantant le build sur
   * `examRelativeUrl` (sync) et `export { EXAM_SECTIONS }`.
   */
  it("n'exporte que des fonctions async (contrainte RSC, invisible par tsc)", async () => {
    const files = (await readdir(ACTIONS_DIR)).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    // Export de valeur non fonction : `export const` / `export { … }` /
    // `export <ident>` sans `async`. Les `export type` sont autorisés
    // (effacés à la compilation) et ne sont pas concernés.
    const forbidden = [
      /^\s*export\s+const\s/m,
      /^\s*export\s+(?:let|var|class|enum)\s/m,
      /^\s*export\s*\{(?!\s*\}\s*from)/m,
      /^\s*export\s+default\s/m,
    ];
    // `export function` sans `async` → refusé aussi.
    const syncFn = /^\s*export\s+function\s/m;

    const offenders: string[] = [];
    for (const file of files) {
      const source = (await readFile(join(ACTIONS_DIR, file), "utf8")).replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      for (const pattern of forbidden) {
        if (pattern.test(source)) offenders.push(`${file} → ${pattern.source}`);
      }
      const syncFns = source.match(syncFn) ?? [];
      if (syncFns.length > 0) offenders.push(`${file} → ${syncFns.length} export(s) function SANS async`);
    }

    expect(
      offenders,
      `Ces exports cassent le build RSC (mais PAS tsc) :\n` +
        offenders.map((o) => `  • ${o}`).join("\n"),
    ).toEqual([]);
  });
});
