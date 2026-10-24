import { ImageResponse } from "next/og";

import { getDictionary } from "@/i18n/dictionaries";
import { isValidLocale, type Locale } from "@/i18n/config";

/** Taille standard OpenGraph. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ATHERIS LABS — Studio d’Ingénierie Logicielle";
/** Locales SSG : l'image est pré-générée à la build (une par locale). */
export const dynamic = "force-static";

type Params = { locale: string };

/** Coupe proprement une chaîne à `max` caractères (aucune donnée tronquée brutalement). */
function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * OpenGraph image générée (`next/og`), une par locale via le segment `[locale]` :
 * servie sur `/fr/opengraph-image` et `/en/opengraph-image`.
 * Design EXACT §8 de DESIGN.md : fond `#0A0C10`, halo radial hero, monogramme,
 * titre blanc, filet `#242936`, baseline `#94A3B8`. Zéro photo, zéro dégradé coloré.
 * Police système (aucune dépendance ni fichier de police ajouté).
 */
export default async function Image({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale } = await params;
  const validLocale: Locale = isValidLocale(locale) ? locale : "fr";
  const dict = await getDictionary(validLocale);

  const title = truncate(dict.seo.title, 46);
  const subtitle = truncate(dict.hero.subtitle, 160);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          backgroundColor: "#0A0C10",
          color: "#FFFFFF",
          fontFamily: "Inter, Arial, sans-serif",
          position: "relative",
        }}
      >
        {/* Halo radial subtil identique au hero. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.10), transparent 70%)",
          }}
        />

        {/* Haut : monogramme + mot-marque. */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #242936",
              borderRadius: 14,
              fontSize: 30,
              fontWeight: 800,
              color: "#FFFFFF",
            }}
          >
            A
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: "#FFFFFF",
            }}
          >
            ATHERIS LABS
          </div>
        </div>

        {/* Centre : titre, filet, baseline. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 900,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "#FFFFFF",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </div>

          <div
            style={{
              height: 1,
              backgroundColor: "#242936",
              marginTop: 36,
              marginBottom: 28,
              width: 100,
            }}
          />

          <div
            style={{
              fontSize: 24,
              lineHeight: 1.4,
              color: "#94A3B8",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Espace flexible en bas pour ancrer le bloc titre au centre. */}
        <div style={{ display: "flex", height: 24 }} />
      </div>
    ),
    { ...size },
  );
}
