import type { TrustStat } from "@/content/types";

type TrustBarProps = {
  stats: TrustStat[];
};

export function TrustBar({ stats }: TrustBarProps) {
  return (
    <div className="mx-auto grid max-w-[1000px] grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col items-center gap-2 px-6 py-6 md:py-6"
        >
          <span className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-[-0.03em] text-fg">
            {stat.value}
          </span>
          <span className="text-sm text-muted">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
