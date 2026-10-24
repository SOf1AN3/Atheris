/**
 * Atheris — onglet « Historique » de la fiche prospect (FE-5 · T18).
 *
 * Composant **pur et server** : la page server lit `activities`
 * (`entityType = 'prospect' AND entityId = $id`, tri `createdAt DESC`,
 * LIMIT 50, auteur joint) et passe des entrées **pré-formatées**.
 *
 * ⚠ LIBELLÉS (dict verrouillé — clés manquantes listées en restitution) :
 * aucune clé `activities.*` n'existe dans `src/content/platform/*`. Plutôt
 * que d'inventer une phrase par action, on affiche le **code brut**
 * (`prospect.created`, `status.changed`) en style `micro` — le vocabulaire
 * d'audit, identique en FR et EN — suivi du détail déjà traduit par la page
 * (transition `from → to` via `dict.statuses.prospect`, note de création) et
 * du motif en `danger`.
 */

import type { ReactNode } from "react";

/** Une ligne d'historique, pré-formatée côté serveur. */
export type HistoryEntryView = {
  id: string;
  /** Code brut `activities.action` (ex. `status.changed`). */
  action: string;
  /** Transition composée « De → Vers » (libellés du dict), `null` sinon. */
  transitionLabel: string | null;
  /** Note de création (`activities.meta.note`), `null` si absente. */
  note: string | null;
  /** Motif de disqualification/perdu (`meta.reason`) — affiché en `danger`. */
  reason: string | null;
  /** Nom de l'auteur (`users.name`), `null` pour une action système. */
  actorLabel: string | null;
  /** Date formatée côté serveur (fuseau Africa/Algiers). */
  dateLabel: string;
};

export type HistoryTabProps = {
  entries: HistoryEntryView[];
  /** `dict.common.noData` — état vide (aucun événement journalisé). */
  emptyMessage: string;
};

/** Style « micro » de DESIGN §12.3 : 12px / 500 / uppercase / `faint`. */
const MICRO_CLASSES = "text-[12px] font-medium uppercase tracking-wide text-faint";

/** Un bloc de texte dans la timeline (hérite du ton `muted`/`danger`). */
function EntryText({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "default" | "danger";
}): React.JSX.Element {
  return (
    <p
      className={
        tone === "danger" ? "mt-1 text-sm text-danger" : "mt-1 text-sm text-fg"
      }
    >
      {children}
    </p>
  );
}

export function HistoryTab({ entries, emptyMessage }: HistoryTabProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-6 py-12 text-center text-[15px] text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-6 border-l border-line pl-6">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          {/* Point de timeline : décoratif, l'info est dans le texte. */}
          <span
            aria-hidden="true"
            className="absolute -left-[27px] top-1.5 size-2.5 rounded-full bg-line"
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs tabular-nums text-muted">{entry.dateLabel}</span>
            {/* Code d'audit brut (pas de clé `activities.*` dans le dict). */}
            <span className={MICRO_CLASSES}>{entry.action}</span>
            {entry.actorLabel !== null ? (
              <span className="text-sm text-muted">{entry.actorLabel}</span>
            ) : null}
          </div>
          {entry.transitionLabel !== null ? (
            <EntryText tone="default">{entry.transitionLabel}</EntryText>
          ) : null}
          {entry.note !== null ? <EntryText tone="default">{entry.note}</EntryText> : null}
          {entry.reason !== null ? <EntryText tone="danger">{entry.reason}</EntryText> : null}
        </li>
      ))}
    </ol>
  );
}
