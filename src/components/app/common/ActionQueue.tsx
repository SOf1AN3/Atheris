"use client";

/**
 * Atheris — file d'action des tableaux de bord (FE-10 · T30 · PLAN.md §3.2).
 *
 * Composant CLIENT **léger** : aucun accès au dictionnaire — `label` et
 * `hint` sont résolus côté serveur par la page et transmis en props
 * sérialisables ; `href` est déjà préfixé par la locale
 * (`/${locale}/espace/…`, convention `Sidebar`).
 *
 * Rendu : une liste de liens, chacun avec son compteur en badge (le nombre
 * reste dans le flux d'annonce — jamais masqué au lecteur d'écran). Le lien
 * entier est la cible tactile (`focus-visible` bleu §2.3).
 *
 * État vide : **rien** (ni section, ni message) — `items.length === 0` →
 * `null`. Le bloc titre est porté par le dashboard appelant, qui affiche
 * alors son propre état vide (`common.noData`).
 */

import Link from "next/link";

export type ActionQueueItem = {
  /** Clé stable (identifiant de la file). */
  id: string;
  /** Libellé résolu server (`dict.dashboard.queues.*` ou repli listé). */
  label: string;
  /** Compteur affiché en badge. */
  count: number;
  /** Lien vers la page filtrée, préfixé par la locale. */
  href: string;
  /** Sous-ligne facultative (ex. commissions orphelines), résolue server. */
  hint?: string;
};

export type ActionQueueProps = {
  items: ActionQueueItem[];
};

export function ActionQueue({ items }: ActionQueueProps): React.JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="group flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 transition-colors duration-150 hover:border-line-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-fg">{item.label}</span>
              {item.hint !== undefined ? (
                <span className="text-xs text-muted">{item.hint}</span>
              ) : null}
            </span>
            <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold tabular-nums text-fg">
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
