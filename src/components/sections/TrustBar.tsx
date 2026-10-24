import type { TrustStat } from "@/content/types";

type TrustBarProps = {
  stats: TrustStat[];
};

export function TrustBar({ stats }: TrustBarProps) {
  return (
    <dl className="flex flex-col gap-6 border-t border-white/15 pt-8 sm:flex-row sm:items-end sm:gap-12 md:gap-16">
      {stats.map((stat) => (
        <div key={stat.label} className="sm:min-w-[10rem]">
          <dt className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.03em] leading-none text-fg">
            {stat.value}
          </dt>
          <dd className="m-0 mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/80">
            {stat.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}
