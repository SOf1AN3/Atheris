import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";

// ---------------------------------------------------------------------------
// Props (sérialisables : variant discriminé, labels et dates résolus
// server-side — composant PUR, aucun état, rendu depuis la page server puis
// passé en `children` aux onglets, pattern FE-5).
// ---------------------------------------------------------------------------

/** Une ligne de la liste Documents (déjà formatée côté serveur). */
export type DocListItem = {
  id: string;
  /** `statuses.document.*` si la clé existe, sinon micro-label bilingue. */
  kindLabel: string;
  filename: string;
  /** Taille formatée (`ko` / `Mo`) côté serveur. */
  sizeLabel: string;
  /** `createdAt` formaté côté serveur (`Africa/Algiers`). */
  dateLabel: string;
  /** `/api/documents/{id}` — téléchargement par cookies (BK-5, sans locale). */
  href: string;
};

/** Une ligne de l'échéancier (déjà formatée côté serveur). */
export type InvoiceListItem = {
  id: string;
  /** Libellé de l'échéance (« Acompte », « Échéance 1 »…). */
  label: string;
  /** Montant USD formaté côté serveur. */
  amountLabel: string;
  /** Échéance formatée côté serveur ; `null` → « — ». */
  dueLabel: string | null;
  /** `paidAt !== null` — badge `client.paid` / `client.due`. */
  isPaid: boolean;
};

/** Totaux de l'échéancier (libellés déjà formatés côté serveur). */
export type InvoiceTotals = {
  totalPaidLabel: string;
  remainingLabel: string;
};

/** Libellés i18n requis, tous en chaînes (sérialisables). */
export type DocListLabels = {
  /** `client.emptyDocuments` — état vide Documents. */
  emptyDocuments: string;
  /** `common.noData` — état vide Factures. */
  noData: string;
  /** `client.paid` — badge échéance réglée. */
  paid: string;
  /** `client.due` — badge échéance à venir. */
  due: string;
  /** `client.totalPaid` — libellé du total encaissé. */
  totalPaid: string;
  /** `client.remaining` — libellé du reste à payer. */
  remaining: string;
};

type DocListProps =
  | {
      variant: "documents";
      items: DocListItem[];
      labels: DocListLabels;
    }
  | {
      variant: "invoices";
      items: InvoiceListItem[];
      totals: InvoiceTotals;
      labels: DocListLabels;
    };

/** Grille commune des lignes desktop (masque les colonnes mobiles). */
const DESKTOP_ROW_CLASSES =
  "hidden md:grid md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4";

/**
 * Liste Documents / Factures du portail client (FE-9 · T28).
 *
 * - **Documents** : chaque ligne est un `<a>` vers la route de téléchargement
 *   (session par cookies — `GET /api/documents/[id]`, BK-5), nouvel onglet +
 *   `rel="noopener noreferrer"`.
 * - **Factures** : échéancier (badge payé / à venir) + totaux.
 * - **Mobile** : cartes empilées (`md:hidden`), zéro scroll horizontal ; la
 *   variante desktop est `hidden md:*` (une seule variante lue par le flux
 *   d'accessibilité grâce à `aria-hidden` absent — les deux existent mais la
 *   cachette CSS retire la non-visible du flux visuel ; le href unique reste
 *   cliquable sur mobile via la carte).
 */
export function DocList(props: DocListProps): ReactNode {
  if (props.variant === "documents") {
    const { items, labels } = props;

    if (items.length === 0) {
      return (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[15px] text-muted">
          {labels.emptyDocuments}
        </p>
      );
    }

    return (
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-line bg-surface px-4 py-3 transition-colors duration-150 hover:border-[rgba(59,130,246,0.4)] hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              {/* Mobile : carte empilée. */}
              <div className="flex flex-col gap-1 md:hidden">
                <div className="flex items-center gap-2">
                  <Badge variant="tech">{item.kindLabel}</Badge>
                  <span className="truncate text-[15px] font-semibold text-fg">
                    {item.filename}
                  </span>
                </div>
                <span className="text-[13px] text-muted">
                  {item.sizeLabel} · {item.dateLabel}
                </span>
              </div>

              {/* Desktop : une ligne, 3 colonnes. */}
              <div className={DESKTOP_ROW_CLASSES}>
                <div className="flex min-w-0 items-center gap-3">
                  <Badge variant="tech">{item.kindLabel}</Badge>
                  <span className="truncate text-[15px] font-semibold text-fg">
                    {item.filename}
                  </span>
                </div>
                <span className="text-[13px] text-muted">{item.sizeLabel}</span>
                <span className="text-[13px] text-muted">{item.dateLabel}</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  const { items, totals, labels } = props;

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[15px] text-muted">
        {labels.noData}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-line bg-surface px-4 py-3"
          >
            {/* Mobile : carte empilée. */}
            <div className="flex flex-col gap-1 md:hidden">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-fg">{item.label}</span>
                <span
                  className={
                    item.isPaid
                      ? "text-[13px] font-semibold text-success"
                      : "text-[13px] font-medium text-muted"
                  }
                >
                  {item.isPaid ? labels.paid : labels.due}
                </span>
              </div>
              <span className="text-[15px] font-semibold text-fg">{item.amountLabel}</span>
              <span className="text-[13px] text-muted">
                {item.dueLabel ?? "—"}
              </span>
            </div>

            {/* Desktop : une ligne, 3 colonnes + badge de statut. */}
            <div className={DESKTOP_ROW_CLASSES}>
              <span className="truncate text-[15px] font-semibold text-fg">
                {item.label}
              </span>
              <span className="text-[15px] font-semibold text-fg">
                {item.amountLabel}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-muted">{item.dueLabel ?? "—"}</span>
                <span
                  className={
                    item.isPaid
                      ? "text-[13px] font-semibold text-success"
                      : "text-[13px] font-medium text-muted"
                  }
                >
                  {item.isPaid ? labels.paid : labels.due}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Totaux (toujours visibles, toutes tailles d'écran). */}
      <div className="grid gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
          <span className="text-[13px] text-muted">{labels.totalPaid}</span>
          <span className="text-[15px] font-semibold text-success">
            {totals.totalPaidLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
          <span className="text-[13px] text-muted">{labels.remaining}</span>
          <span className="text-[15px] font-semibold text-fg">
            {totals.remainingLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
