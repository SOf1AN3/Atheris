/**
 * Atheris — matrice RBAC pure (T07 · structure.md §4.2 + PLAN.md §3.2).
 *
 * Module 100 % pur : **aucun import runtime DB ni auth** (les seuls imports
 * sont des `import type` effacés à la compilation) → utilisable partout
 * (Server Actions, Server Components, middleware edge, tests unitaires) sans
 * poids ni dépendance d'environnement.
 *
 * Sources de vérité :
 * - Table des routes d'espace par rôle — structure.md §4.2 / PLAN.md §3.2 §3.2.
 * - Home par rôle (redirection depuis `/espace`) — PLAN.md §3.2 (colonnes vues).
 * - Graphe de transitions de statut (10 états, structure.md §4.1) + plafond
 *   d'action du commercial (`devis_envoye` inclus) — PLAN.md §3.2.
 */

import type { prospectStatusEnum, roleEnum } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types — dérivés des enums Drizzle (source de vérité unique, jamais
// redéclarés : un rôle/statut ajouté en DB fait échouer la compilation ici
// tant que les tables ci-dessous ne sont pas complétées).
// ---------------------------------------------------------------------------

/** Rôle d'un compte, dérivé de l'enum PostgreSQL `role` (schéma Drizzle). */
export type Role = (typeof roleEnum.enumValues)[number];

/** Statut d'un prospect, dérivé de l'enum PostgreSQL `prospect_status`. */
export type ProspectStatus = (typeof prospectStatusEnum.enumValues)[number];

// ---------------------------------------------------------------------------
// Home par rôle (PLAN.md §3.2) — cible de la redirection depuis `/espace`.
// ---------------------------------------------------------------------------

/**
 * Page d'accueil de chaque rôle dans l'espace connecté.
 * `Record<Role, …>` impose l'exhaustivité : tout rôle ajouté en DB doit avoir
 * une home ici (erreur de compilation sinon).
 */
export const HOME_BY_ROLE: Record<Role, string> = {
  ceo: "/espace/tableau-de-bord",
  manager: "/espace/tableau-de-bord",
  commercial: "/espace/tableau-de-bord",
  sdr: "/espace/prospects",
  client: "/espace/projet",
};

// ---------------------------------------------------------------------------
// Accès aux routes d'espace (structure.md §4.2).
// ---------------------------------------------------------------------------

const ALL_ROLES: readonly Role[] = ["ceo", "manager", "commercial", "sdr", "client"];
const INTERNAL_ROLES: readonly Role[] = ["ceo", "manager", "commercial", "sdr"];

/**
 * Matrice route d'espace → rôles admis. Les prefixes sont des suffixes sous
 * `/{locale}/espace` (résolution indépendante de la locale).
 *
 * RÈGLE DE RÉSOLUTION (pas de piège d'ordre) : le match est fait **par
 * segments** — une entrée correspond si le suffixe vaut exactement le prefix
 * ou commence par `prefix + "/"` — et l'entrée retenue est celle dont le
 * prefix est le **plus long** (le plus spécifique). Ainsi `/prospects/nouveau`
 * et `/prospects/[id]` tombent sur leur entrée propre sans dépendre de
 * l'ordre du tableau.
 *
 * Notes :
 * - `/` (soit `/{locale}/espace` nu) : tout rôle authentifié y accède, la
 *   page se re-dirige vers `HOME_BY_ROLE`.
 * - `/prospects` englobe `/prospects/[id]` : le SDR n'y est **pas**
 *   bloqué côté route, le scoping est une règle de **données**
 *   (`WHERE source_user_id = …`, PLAN.md §Sécurité).
 * - `/profil` est commun à tous les rôles (nav de la plateforme T06).
 */
export const ROUTE_ACCESS: ReadonlyArray<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/", roles: ALL_ROLES },
  { prefix: "/profil", roles: ALL_ROLES },
  { prefix: "/tableau-de-bord", roles: INTERNAL_ROLES },
  { prefix: "/prospects", roles: INTERNAL_ROLES },
  { prefix: "/commissions", roles: ["ceo", "manager", "sdr"] },
  { prefix: "/equipe", roles: ["ceo", "manager"] },
  { prefix: "/projet", roles: ["client"] },
  // Recrutement (candidatures CEO) : réservé CEO — miroir de la garde de la
  // page /espace/recrutement et des actions de src/actions/recrutement.ts.
  { prefix: "/recrutement", roles: ["ceo"] },
  // Examen (revue des tests CEO) : réservé CEO — miroir de la garde de la
  // page /espace/examen (parcours zero-interview).
  { prefix: "/examen", roles: ["ceo"] },
];

/** Retire la locale éventuelle et isole le suffixe sous `/espace`. */
function extractEspaceSuffix(pathname: string): string | null {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  // Soit le chemin est nu (`/espace/prospects`), soit préfixé locale
  // (`/fr/espace/prospects`) — le middleware n'envoie que le suffixe localisé.
  const espaceIndex = segments[0] === "espace" ? 0 : segments[1] === "espace" ? 1 : -1;
  if (espaceIndex === -1) return null;
  const rest = segments.slice(espaceIndex + 1);
  return rest.length === 0 ? "/" : `/${rest.join("/")}`;
}

/** Match par frontière de segment : `/prospects` ne capture pas `/projetx`. */
function matchesPrefix(suffix: string, prefix: string): boolean {
  if (prefix === "/") return true;
  return suffix === prefix || suffix.startsWith(`${prefix}/`);
}

/**
 * L'entrée la plus spécifique (prefix le plus long) pour un suffixe d'espace.
 * `null` si aucune route connue — un chemin inconnu sous `/espace` est refusé.
 */
function findBestMatch(suffix: string): { prefix: string; roles: readonly Role[] } | null {
  let best: { prefix: string; roles: readonly Role[] } | null = null;
  for (const entry of ROUTE_ACCESS) {
    if (!matchesPrefix(suffix, entry.prefix)) continue;
    if (best === null || entry.prefix.length > best.prefix.length) {
      best = entry;
    }
  }
  return best;
}

/**
 * Garde d'accès à une route d'espace (structure.md §4.2).
 *
 * @param pathname - Suffixe localisé (`/fr/espace/prospects`), chemin nu
 *   (`/espace/prospects`) ou suffixe d'espace (`/prospects`) — les trois
 *   formes sont acceptées.
 * @param role - Rôle du compte (depuis la session ou le JWT).
 * @returns `false` si le chemin n'est pas une route d'espace connue, ou si le
 *   rôle n'est pas admis sur cette route.
 */
export function isRouteAllowed(pathname: string, role: Role): boolean {
  const suffix = extractEspaceSuffix(pathname);
  if (suffix === null) return false;
  const best = findBestMatch(suffix);
  if (best === null) return false;
  return best.roles.includes(role);
}

/** Garde grossière middleware : `true` pour tout chemin sous `/espace`. */
export function isEspacePath(pathname: string): boolean {
  return extractEspaceSuffix(pathname) !== null;
}

// ---------------------------------------------------------------------------
// Transitions de statut du pipeline (structure.md §4.1 · §4.2, PLAN.md §3.2).
// ---------------------------------------------------------------------------

/**
 * Graphe complet des 10 statuts — applicable au **CEO seul** (toutes
 * transitions) et utilisé comme référence des tests.
 *
 * Propriétés du graphe : linéaire `nouveau → … → clos` avec, à chaque étape
 * précoce, une sortie négative (`perdu` / `disqualifie`) ; `clos`, `perdu` et
 * `disqualifie` sont terminaux.
 */
export const TRANSITIONS: Record<ProspectStatus, readonly ProspectStatus[]> = {
  nouveau: ["contacte", "disqualifie"],
  contacte: ["qualifie", "disqualifie"],
  qualifie: ["devis_envoye", "perdu", "disqualifie"],
  devis_envoye: ["signe", "perdu"],
  signe: ["client_actif", "perdu"],
  client_actif: ["en_livraison"],
  en_livraison: ["clos"],
  clos: [],
  perdu: [],
  disqualifie: [],
};

/**
 * Sous-ensemble du graphe pour **commercial et manager** (plafond d'action :
 * jusqu'à `devis_envoye` inclus — PLAN.md §3.2) :
 * - linéaire `nouveau → contacte → qualifie → devis_envoye` ;
 * - sorties négatives : `nouveau`/`contacte` → `disqualifie`, `qualifie` →
 *   `perdu` ou `disqualifie` ;
 * - **interdit** : `devis_envoye → signe|perdu`, `signe → client_actif`,
 *   `client_actif → *`, `en_livraison`, `clos` (CEO uniquement).
 */
const SALES_REP_TRANSITIONS: Record<ProspectStatus, readonly ProspectStatus[]> = {
  nouveau: ["contacte", "disqualifie"],
  contacte: ["qualifie", "disqualifie"],
  qualifie: ["devis_envoye", "perdu", "disqualifie"],
  devis_envoye: [],
  signe: [],
  client_actif: [],
  en_livraison: [],
  clos: [],
  perdu: [],
  disqualifie: [],
};

/**
 * Une transition de statut est-elle autorisée pour ce rôle ?
 *
 * - `ceo` : tout le graphe `TRANSITIONS` ;
 * - `manager` / `commercial` : plafond `SALES_REP_TRANSITIONS` (le manager a
 *   les mêmes droits commerciaux que le commercial — validation des
 *   candidatures = CEO seul, mais aucune route dédiée en T07) ;
 * - `sdr` : lecture seule, **jamais** de transition ;
 * - `client` : jamais.
 *
 * (structure.md §4.2 · PLAN.md §3.2 — la vérification doit aussi être refaite
 * dans chaque Server Action écriture, seule la table ci-dessous fait foi.)
 */
export function canChangeStatus(role: Role, from: ProspectStatus, to: ProspectStatus): boolean {
  switch (role) {
    case "ceo":
      return TRANSITIONS[from].includes(to);
    case "manager":
    case "commercial":
      return SALES_REP_TRANSITIONS[from].includes(to);
    case "sdr":
    case "client":
      return false;
  }
}

/**
 * Statut terminal du pipeline : aucune transition n'en sort et une raison est
 * **obligatoire** pour l'y faire entrer (`perdu` / `disqualifie`).
 */
export function isTerminalStatus(status: ProspectStatus): boolean {
  return status === "perdu" || status === "disqualifie";
}

/**
 * Ce rôle voit-il **tous** les prospects (pipeline complet) ?
 * - `true` : ceo, manager, commercial ;
 * - `false` : sdr (les siens uniquement, scoping `source_user_id`),
 *   client (aucun accès pipeline).
 */
export function canViewAllProspects(role: Role): boolean {
  return role === "ceo" || role === "manager" || role === "commercial";
}

// ---------------------------------------------------------------------------
// Guard runtime de rôle — utilisé notamment par le middleware (le JWT signé
// peut provenir d'un ancien schéma : on revalide les valeurs avant usage).
// ---------------------------------------------------------------------------

// Dérivé de `HOME_BY_ROLE` (déjà `Record<Role, …>` exhaustif) : impossible de
// dévier d'un rôle ajouté au schéma, sans redéclaration en dur.
const ROLE_VALUES: readonly string[] = Object.keys(HOME_BY_ROLE);

/** Type guard runtime : la valeur est-elle un rôle connu du schéma ? */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLE_VALUES.includes(value);
}
