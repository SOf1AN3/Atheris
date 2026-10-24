/**
 * Atheris — onglet « Devis & paiements » de la fiche prospect (FE-5 · T18).
 *
 * Composant **pur et server** : les devis et leur échéancier sont lus par la
 * page server (`quotes` + `payments`, jointure sur `quotes.prospect_id`) puis
 * passés **pré-formatés** (montants USD, statuts, dates) — aucune requête ni
 * formatage dans ce fichier.
 *
 * LECTURE SEULE ASSUMÉE : aucun bouton de création/édition ici (FE-8 ajoutera
 * l'encaissement), aucun lien sortant.
 *
 * LIBELLÉS (dict verrouillé) : montant = valeur seule déjà présente dans
 * l'en-tête (pas de redite `<dt>`) ; statut = badge localisé
 * `dict.statuses.quote[status]` ; dates = texte `muted` sans libellé (aucune
 * clé `prospect.deals.*` n'existe — listée en restitution) ; statut
 * d'encaissement = `dict.client.paid` / `dict.client.due` (repli sémantique
 * documenté, faute de clé `prospect.deals.paid|upcoming`).
 */

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { Badge } from "@/components/ui/Badge";

/** Une échéance d'un devis, pré-formatée côté serveur. */
export type DealPaymentView = {
  id: string;
  /** `payments.label` (« Acompte », « Échéance 1 »…). */
  label: string;
  /** Montant formaté en USD (`Intl.NumberFormat`, server). */
  amountLabel: string;
  /** Échéance formatée, `null` si absente. */
  dueLabel: string | null;
  /** Date de paiement formatée, `null` si non encaissée. */
  paidLabel: string | null;
  isPaid: boolean;
};

/** Un devis du prospect, pré-formaté côté serveur. */
export type DealQuoteView = {
  id: string;
  /** Montant formaté en USD. */
  amountLabel: string;
  /** `dict.statuses.quote[status]` (libellé localisé, server). */
  statusLabel: string;
  /** Date pertinente au statut (envoi ou signature), `null` si aucune. */
  dateLabel: string | null;
  payments: DealPaymentView[];
};

/** Libellés i18n résolus côté serveur. */
export type DealsTabLabels = {
  /** `dict.common.noData` — état vide (⚠ clé dédiée manquante, voir en-tête). */
  empty: string;
  /** `dict.client.paid` — badge « encaissée » (variante `verified` = succès). */
  paid: string;
  /** `dict.client.due` — badge « à venir ». */
  upcoming: string;
};

export type DealsTabProps = {
  quotes: DealQuoteView[];
  labels: DealsTabLabels;
};

/** Ligne de méta discrète d'une échéance : échéance puis encaissement (`·`). */
function paymentMeta(payment: DealPaymentView): string {
  if (payment.dueLabel !== null && payment.paidLabel !== null) {
    return `${payment.dueLabel} · ${payment.paidLabel}`;
  }
  return payment.paidLabel ?? payment.dueLabel ?? "—";
}

/** Un conteneur d'état vide / d'information sobre (même format que la page). */
function Panel({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      {children}
    </div>
  );
}

export function DealsTab({ quotes, labels }: DealsTabProps): React.JSX.Element {
  // --- État vide : aucun devis rattaché au prospect -----------------------
  if (quotes.length === 0) {
    return (
      <Panel>
        <Inbox aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
        <p className="text-[15px] font-semibold text-fg">{labels.empty}</p>
      </Panel>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {quotes.map((quote) => (
        <li
          key={quote.id}
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
        >
          {/* En-tête du devis : montant + badge statut (libellé du dict). */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-bold tabular-nums text-fg">{quote.amountLabel}</p>
            <Badge variant="tech">{quote.statusLabel}</Badge>
          </div>
          {quote.dateLabel !== null ? (
            <p className="text-xs tabular-nums text-muted">{quote.dateLabel}</p>
          ) : null}

          {/* Échéancier (lecture seule — création/encaissement = FE-8). */}
          {quote.payments.length > 0 ? (
            <ul className="mt-1 flex flex-col divide-y divide-line border-t border-line">
              {quote.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-fg">{payment.label}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {paymentMeta(payment)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-fg">
                      {payment.amountLabel}
                    </span>
                    {/* `verified` = fond vert + coche (état « payé » = succès). */}
                    <Badge variant={payment.isPaid ? "verified" : "tech"}>
                      {payment.isPaid ? labels.paid : labels.upcoming}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
