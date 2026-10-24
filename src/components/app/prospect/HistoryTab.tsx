/**
 * Atheris — onglet « Historique » de la fiche prospect (FE-5 · T18).
 *
 * Composant **pur et server** : la page server lit `activities`
 * (`entityType = 'prospect' AND entityId = $id`, tri `createdAt DESC`,
 * LIMIT 50, auteur joint) et passe des entrées **pré-formatées**.
 *
 * LIBELLÉS (100 % dict) : chaque ligne affiche la phrase `dict.activities.*`
 * correspondant au code `activities.action` de la DB (`status.changed` →
 * `activities.statusChanged`), **résolue côté serveur** avec les jetons
 * `{actor}` / `{from}` / `{to}` déjà remplacés (repli `activities.unknown`)
 * — auteur et transition sont donc portés par la phrase elle-même, suivis
 * de la note de création et du motif en `danger`.
 */

import type { ReactNode } from "react";

/** Une ligne d'historique, pré-formatée côté serveur. */
export type HistoryEntryView = {
  id: string;
  /** Phrase du journal (`dict.activities.*` + jetons remplacés server). */
  actionLabel: string;
  /** Note de création (`activities.meta.note`), `null` si absente. */
  note: string | null;
  /** Motif de disqualification/perdu (`meta.reason`) — affiché en `danger`. */
  reason: string | null;
  /** Date formatée côté serveur (fuseau Africa/Algiers). */
  dateLabel: string;
};

export type HistoryTabProps = {
  entries: HistoryEntryView[];
  /** `dict.common.noData` — état vide (aucun événement journalisé). */
  emptyMessage: string;
};

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
            {/* Phrase du journal (`dict.activities.*`, résolue server). */}
            <span className="text-sm text-fg">{entry.actionLabel}</span>
          </div>
          {entry.note !== null ? <EntryText tone="default">{entry.note}</EntryText> : null}
          {entry.reason !== null ? <EntryText tone="danger">{entry.reason}</EntryText> : null}
        </li>
      ))}
    </ol>
  );
}
