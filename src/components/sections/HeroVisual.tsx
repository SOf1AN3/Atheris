/**
 * HeroVisual — mockup produit 100% CSS (aucun asset externe).
 * Décoratif : conteneur racine `aria-hidden="true"` (DESIGN.md §4.2, §6.6).
 * Composant SERVEUR sans props.
 */

const CHART_BARS: ReadonlyArray<{ height: string; tone: string }> = [
  { height: "h-[30%]", tone: "bg-white/[0.08]" },
  { height: "h-[45%]", tone: "bg-white/[0.10]" },
  { height: "h-[38%]", tone: "bg-white/[0.09]" },
  { height: "h-[60%]", tone: "bg-white/[0.11]" },
  { height: "h-[52%]", tone: "bg-white/[0.10]" },
  { height: "h-[70%]", tone: "bg-white/[0.12]" },
  { height: "h-[58%]", tone: "bg-white/[0.09]" },
  { height: "h-[80%]", tone: "bg-white/[0.12]" },
  { height: "h-full", tone: "bg-accent" },
  { height: "h-[66%]", tone: "bg-white/[0.10]" },
  { height: "h-[88%]", tone: "bg-white/[0.12]" },
  { height: "h-[54%]", tone: "bg-white/[0.08]" },
];

const SIDEBAR_ITEMS: ReadonlyArray<{ barWidth: string; active: boolean }> = [
  { barWidth: "w-16", active: true },
  { barWidth: "w-20", active: false },
  { barWidth: "w-14", active: false },
  { barWidth: "w-18", active: false },
];

const KPI_CARDS: ReadonlyArray<{ value: string; delta: string }> = [
  { value: "2 481", delta: "+12,4 %" },
  { value: "98,4 %", delta: "+0,8 %" },
  { value: "12,7 k", delta: "+3,1 %" },
];

const TABLE_ROWS: ReadonlyArray<{ dot: string; ref: string }> = [
  { dot: "bg-success", ref: "#4821" },
  { dot: "bg-muted", ref: "#4819" },
  { dot: "bg-faint", ref: "#4817" },
];

export function HeroVisual() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[960px]"
    >
      {/* Dégradé de fond imperceptible (§4.2). */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,rgba(255,255,255,0.03),transparent)]" />
      {/* Wrapper chevauchement : overflow-visible en md pour laisser la frame mobile déborder,
          la fenêtre elle-même garde son overflow-hidden. */}
      <div className="relative">
        {/* ——— Fenêtre Desktop ——— */}
        <div className="flex aspect-[4/3] flex-col overflow-hidden rounded-[24px] border border-white/[0.08] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)] bg-ink-2 md:aspect-[16/10]">
          {/* Barre de titre */}
          <div className="flex h-10 shrink-0 items-center border-b border-white/[0.06] px-4">
            <div className="flex items-center gap-1.5 saturate-[0.85]">
              <span className="size-2.5 rounded-full bg-[#FF5F57]" />
              <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-2.5 rounded-full bg-[#28C840]" />
            </div>
            <div className="mx-auto flex h-6 max-w-[280px] flex-1 items-center justify-center rounded-full bg-white/[0.04] text-[11px] text-faint">
              app.atheris-labs.io/dashboard
            </div>
          </div>
          {/* Corps */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="hidden w-[180px] shrink-0 flex-col gap-1 border-r border-white/[0.06] p-3 md:flex">
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.barWidth}
                  className={`flex h-8 items-center gap-2 rounded-md px-2.5 ${
                    item.active ? "bg-white/[0.06]" : ""
                  }`}
                >
                  {item.active ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                  ) : null}
                  <span
                    className={`h-1.5 rounded bg-white/[0.10] ${item.barWidth} ${
                      item.active ? "bg-white/[0.25]" : ""
                    }`}
                  />
                </div>
              ))}
            </div>
            {/* Zone principale */}
            <div className="min-w-0 flex-1 space-y-3 overflow-hidden p-4">
              <span className="block h-4 w-32 rounded bg-white/[0.15]" />
              {/* Cartes KPI */}
              <div className="grid grid-cols-3 gap-3">
                {KPI_CARDS.map((card) => (
                  <div
                    key={card.value}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
                  >
                    <span className="mb-2 block h-2 w-14 rounded bg-white/[0.08]" />
                    <span className="block text-[20px] font-bold leading-none text-fg">
                      {card.value}
                    </span>
                    <span className="mt-1.5 block text-[11px] font-semibold text-success">
                      {card.delta}
                    </span>
                  </div>
                ))}
              </div>
              {/* Mini-graphique barres (12 barres, 1 seule en accent) */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex h-20 items-end gap-1.5">
                  {CHART_BARS.map((bar, index) => (
                    <span
                      key={`${bar.height}-${index}`}
                      className={`flex-1 rounded-t-[3px] ${bar.height} ${bar.tone}`}
                    />
                  ))}
                </div>
              </div>
              {/* Extrait de tableau */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3">
                {TABLE_ROWS.map((row) => (
                  <div
                    key={row.ref}
                    className="flex items-center gap-3 border-t border-white/[0.06] py-2"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${row.dot}`} />
                    <span className="h-2 w-24 rounded bg-white/[0.10]" />
                    <span className="h-2 w-16 rounded bg-white/[0.10]" />
                    <span className="ml-auto text-[11px] text-faint">{row.ref}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* ——— Frame Mobile ——— */}
        {/* <768px : empilé sous la fenêtre, centré (§4.2 responsive) ;
            ≥768px : chevauche le coin bas-droit (translate ~ +12% x / +16% y). */}
        <div className="mx-auto mt-6 flex aspect-[9/19.5] w-[160px] flex-col overflow-hidden rounded-[24px] border-4 border-line bg-ink-2 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.65)] max-md:scale-[0.98] md:absolute md:-bottom-[10%] md:right-[6%] md:mt-0 md:w-[170px]">
          <div className="mx-auto mt-2 h-2 w-10 shrink-0 rounded-full bg-line" />
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <span className="h-2 w-16 rounded bg-white/[0.15]" />
            <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
              <span className="block h-1.5 w-10 rounded bg-white/[0.08]" />
              <span className="block h-1.5 w-14 rounded bg-white/[0.10]" />
            </div>
            <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
              <span className="block h-1.5 w-12 rounded bg-white/[0.08]" />
              <span className="block h-1.5 w-10 rounded bg-white/[0.10]" />
            </div>
            <div className="mt-auto flex justify-around border-t border-white/[0.06] py-2">
              <span className="size-3.5 rounded bg-white/[0.10]" />
              <span className="size-3.5 rounded bg-accent" />
              <span className="size-3.5 rounded bg-white/[0.10]" />
              <span className="size-3.5 rounded bg-white/[0.10]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
