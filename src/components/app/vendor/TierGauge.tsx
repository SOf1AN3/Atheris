/**
 * Atheris — jauge de palier vendeur (FE-7 · T20 · DESIGN.md §2.3).
 *
 * Composant **pur** (aucun `"use client"`, aucun hook, zéro import DB/i18n) :
 * toutes les props sont sérialisables et les libellés sont résolus côté
 * serveur par `espace/commissions/page.tsx` (frontière RSC intacte).
 *
 * Barre : `h-1.5 rounded-full bg-surface` (piste) + remplissage `bg-accent`
 * — l'accent est ici l'**état actif** (palier en cours) et non un CTA.
 * Largeur : `min(paidCount / nextTierAt, 1) * 100 %` (plafonnée à 100 %),
 * `100 %` quand le palier maximum (20+) est atteint (`nextTierAt === null`).
 *
 * Accessibilité : la barre porte `role="progressbar"` avec
 * `aria-valuenow/min/max` + `aria-valuetext` — la couleur seule ne dit rien
 * (WCAG 1.4.1) : le taux du palier courant est toujours rendu en texte.
 */

export type TierGaugeProps = {
  /** Deals déjà convertis (`aria-valuenow` + remplissage de la jauge). */
  paidCount: number;
  /** Seuil du prochain palier (5 | 10 | 20) — `null` si palier max (20+). */
  nextTierAt: number | null;
  /** `dict.commissions.tier.label` — titre/aria du bloc, résolu server. */
  title: string;
  /** `dict.commissions.tier.current` (« Palier actuel »), résolu server. */
  currentLabel: string;
  /** Taux du palier actuel déjà formaté (« 12,5 % »), résolu server. */
  currentRateLabel: string;
  /**
   * `dict.commissions.tier.nextTier` **déjà résolu** server-side
   * (`{tier}`/`{rate}` remplacés). Si un `{}` subsistait malgré tout
   * (dict évolué), un `.replace` de repli est appliqué ci-dessous.
   */
  nextTierLabel: string;
  /** Taux du prochain palier déjà formaté — valeur de repli `{rate}`. */
  nextRateLabel: string;
};

export function TierGauge({
  paidCount,
  nextTierAt,
  title,
  currentLabel,
  currentRateLabel,
  nextTierLabel,
  nextRateLabel,
}: TierGaugeProps) {
  const isMaxTier = nextTierAt === null;

  // Largeur de remplissage — bornée à [0 ; 100] %, jamais NaN.
  const fillPercent = isMaxTier
    ? 100
    : Math.min(Math.max(paidCount / Math.max(nextTierAt, 1), 0), 1) * 100;

  // Filet i18n : le label vient déjà résolu du server, mais si un `{}`
  // subsistait encore, on substitue localement (valeurs déterministes).
  const resolvedNextLabel = isMaxTier
    ? null
    : nextTierLabel.replace("{tier}", String(nextTierAt)).replace("{rate}", nextRateLabel);

  const valueText = isMaxTier
    ? currentRateLabel
    : `${paidCount} / ${nextTierAt} — ${currentRateLabel}`;

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 md:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* Palier actuel — texte porteur d'information (jamais la couleur seule). */}
        <p className="text-[13px] font-semibold text-muted">
          {currentLabel}
          <span className="ml-2 text-lg font-bold tabular-nums text-fg">
            {currentRateLabel}
          </span>
        </p>
        {/* Prochain palier (masqué au palier maximum). */}
        <p className="text-[13px] font-medium text-faint">{resolvedNextLabel}</p>
      </div>

      {/* Jauge — piste `surface`, remplissage `accent` (= état actif). */}
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={isMaxTier ? Math.max(paidCount, 1) : nextTierAt}
        aria-valuenow={paidCount}
        aria-valuetext={valueText}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </section>
  );
}
