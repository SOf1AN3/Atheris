import type { ReactNode } from "react";

import { Check } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { AboutContent } from "@/content/types";

// DESIGN §3.2 (M2) — stagger 80ms par priorité (0 / 80 / 160ms).
const ITEM_DELAY_STEP = 0.08;

// Halo volt-dim (rgba(204,255,74,0.12), DESIGN §2.1) — le token `--color-volt-dim`
// n'est pas porté par `globals.css` : on reprend le motif arbitraire déjà utilisé
// par `Badge` / `Button` / `Contact` pour un signal volt localisé.
const GUARANTEE_ICON_HALO = "bg-[rgba(204,255,74,0.12)]";

/** Index interne `01 / 03` — sérigraphie mono décorative (aria-hidden). */
function itemIndexLabel(position: number, total: number): string {
  return `${String(position + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
}

type AboutProps = {
  about: AboutContent;
};

/**
 * Section « À propos » (`05`) — densité NORMALE (DESIGN §2.3), insérée entre
 * Process (« spectacle ») et Témoignages (« aérée ») : la variation de rythme
 * est voulue.
 *
 * Composition 12 colonnes asymétrique (jamais `align="center"`) :
 * - col 5 : encart GARANTIE `rounded-[20px] border-line-2 bg-surface p-7`,
 *   porteur de l'UNIQUE signal volt de la section (une icône check volt) ;
 * - col 7 : les 3 `priorities` en liste FILETÉE (`border-t` par item +
 *   `border-b` de fermeture) — rupture de rythme assumée face aux 4 cartes
 *   de Services.
 *
 * Le titre porte le marqueur `*startup*` : `SectionHeading` le découpe et le
 * rend en voix serif (§2.2.1). Aucune string en dur — tout vient du dict
 * `about`. Composant serveur — l'animation est portée par `Reveal` (client),
 * sans `useReducedMotion` local.
 */
export function About({ about }: AboutProps): ReactNode {
  const total = about.priorities.length;

  return (
    // DESIGN: `id="a-propos"` = ancre stable (même convention que les sections
    // voisines). Densité NORMALE (§2.3) : `clamp(80px, 10vh, 128px)`.
    <section
      id="a-propos"
      aria-labelledby="about-title"
      className="py-[clamp(80px,10vh,128px)]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* En-tête : index `05` + filet + titre 2 voix + description. */}
        <SectionHeading
          index="05"
          align="left"
          headingId="about-title"
          eyebrow={about.eyebrow}
          title={about.title}
          description={about.description}
        />

        {/* Grille 12 col asymétrique 5 / 7, gap-14 (56px). */}
        <div className="mt-12 grid grid-cols-1 gap-14 md:mt-16 lg:grid-cols-12">
          {/* Colonne GAUCHE — encart garantie (signal volt unique). */}
          <Reveal className="lg:col-span-5">
            <div className="rounded-[20px] border border-line-2 bg-surface p-7">
              <span
                aria-hidden="true"
                className={`flex size-11 items-center justify-center rounded-full ${GUARANTEE_ICON_HALO}`}
              >
                <Check className="size-5 text-volt" strokeWidth={2.25} />
              </span>
              <h3 className="h-display mt-6 text-[19px] text-fg">
                {about.guaranteeTitle}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.6] text-muted">
                {about.guaranteeDescription}
              </p>
            </div>
          </Reveal>

          {/* Colonne DROITE — les 3 priorités en liste filetée (pas de cartes). */}
          <ul className="m-0 list-none p-0 lg:col-span-7">
            {about.priorities.map((priority, index) => (
              <Reveal
                key={priority.id}
                as="li"
                // DESIGN M2 — stagger 80ms par item.
                delay={index * ITEM_DELAY_STEP}
                className="border-t border-line py-6 last:border-b"
              >
                <div className="flex gap-5">
                  <span
                    aria-hidden="true"
                    className="micro mt-[3px] shrink-0 text-faint"
                  >
                    {itemIndexLabel(index, total)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold text-fg">
                      {priority.title}
                    </p>
                    <p className="mt-2 text-[15px] leading-[1.6] text-muted">
                      {priority.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
