/**
 * Atheris — métadonnées visuelles des 10 statuts de prospect (FE-4 · T16).
 *
 * Module 100 % **pur** (aucun import runtime) : les classes Tailwind sont des
 * littéraux — utilisable depuis un Server Component ou un Client Component
 * sans coût.
 *
 * Source de vérité des couleurs : `DESIGN.md` §12.2 (tableau « Palette des 10
 * statuts »), lui-même arbitré en revue T04 pour garantir AA (4,5:1) sur le
 * fond réel (teinte à 12 % posée sur `#14171F`) :
 * - fond   = couleur pleine @ **12 %** ;
 * - bordure= couleur pleine @ **25 %** (règle du pill §3.2) ;
 * - texte  = couleur pleine (sauf `qualifie`/`en_livraison` : `#FFFFFF`, le
 *   bleu plein échouerait à 4,2:1 et §2.3 réserve le bleu-texte aux CTA).
 *
 * Le **libellé** (i18n) n'est PAS ici : il vit dans `dict.statuses.prospect`
 * et est résolu côté serveur puis passé en prop (`label` de `StatusBadge`) —
 * ce module ne porte que le habillage.
 */

import type { ProspectStatus } from "@/lib/permissions";

/** Habillage d'un badge statut (classes Tailwind arbitraires, §12.2). */
export type StatusMeta = {
  /** `text-*` — couleur pleine du statut. */
  text: string;
  /** `bg-*` — teinte pleine à 12 % sur `#14171F`. */
  bg: string;
  /** `border-*` — teinte pleine à 25 %. */
  border: string;
};

/**
 * Couleurs des 10 badges — **au pixel** de `DESIGN.md` §12.2.
 * `Record<ProspectStatus, …>` exhaustif : tout statut ajouté à l'enum DB
 * fait échouer la compilation tant que sa couleur n'est pas arbitrée ici.
 */
export const PROSPECT_STATUS_META: Record<ProspectStatus, StatusMeta> = {
  // DESIGN §12.2 — famille neutre (gris `#94A3B8`, 5,8:1).
  nouveau: {
    text: "text-[#94A3B8]",
    bg: "bg-[rgba(148,163,184,0.12)]",
    border: "border-[rgba(148,163,184,0.25)]",
  },
  contacte: {
    text: "text-[#94A3B8]",
    bg: "bg-[rgba(148,163,184,0.12)]",
    border: "border-[rgba(148,163,184,0.25)]",
  },
  clos: {
    text: "text-[#94A3B8]",
    bg: "bg-[rgba(148,163,184,0.12)]",
    border: "border-[rgba(148,163,184,0.25)]",
  },
  // DESIGN §12.2 — famille « actif pipeline » (fond bleu accent-faint,
  // texte blanc : 15,5:1 — arbitrage n°2 du §12.2).
  qualifie: {
    text: "text-white",
    bg: "bg-[rgba(143,166,200,0.14)]",
    border: "border-[rgba(143,166,200,0.30)]",
  },
  en_livraison: {
    text: "text-white",
    bg: "bg-[rgba(143,166,200,0.14)]",
    border: "border-[rgba(143,166,200,0.30)]",
  },
  // DESIGN §12.2 — ambre `#F59E0B` (6,9:1, palette mockups §2.1).
  devis_envoye: {
    text: "text-[#F59E0B]",
    bg: "bg-[rgba(245,158,11,0.12)]",
    border: "border-[rgba(245,158,11,0.25)]",
  },
  // DESIGN §12.2 — famille vert `#34D399` (7,4:1).
  signe: {
    text: "text-[#34D399]",
    bg: "bg-[rgba(52,211,153,0.12)]",
    border: "border-[rgba(52,211,153,0.25)]",
  },
  client_actif: {
    text: "text-[#34D399]",
    bg: "bg-[rgba(52,211,153,0.12)]",
    border: "border-[rgba(52,211,153,0.25)]",
  },
  // DESIGN §12.2 — famille rouge `#F87171` (5,5:1) ; `disqualifie` = même
  // rouge que `perdu` (arbitrage n°5 : la distinction porte sur le libellé).
  perdu: {
    text: "text-[#F87171]",
    bg: "bg-[rgba(248,113,113,0.12)]",
    border: "border-[rgba(248,113,113,0.25)]",
  },
  disqualifie: {
    text: "text-[#F87171]",
    bg: "bg-[rgba(248,113,113,0.12)]",
    border: "border-[rgba(248,113,113,0.25)]",
  },
};

/**
 * Ordre d'affichage des statuts (filtres + pensée pipeline) : le linéaire
 * `nouveau → … → clos` puis les deux terminaux négatifs — aligné sur le
 * graphe `TRANSITIONS` de `@/lib/permissions` (structure.md §4.1).
 * `readonly` : ni indexé ni muté côté client.
 */
export const STATUS_ORDER: readonly ProspectStatus[] = [
  "nouveau",
  "contacte",
  "qualifie",
  "devis_envoye",
  "signe",
  "client_actif",
  "en_livraison",
  "clos",
  "perdu",
  "disqualifie",
];
