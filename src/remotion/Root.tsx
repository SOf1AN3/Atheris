import React from "react";
import { Composition } from "remotion";
import { Ad } from "./Ad";
import { GlobalAd } from "./GlobalAd";
import { VO_TIMELINE as VO1 } from "./data/voice";
import { VO_TIMELINE as VO2 } from "./data/voice2";
import { FPS, HEIGHT, WIDTH } from "./theme";

/**
 * Points d'entrée des deux films.
 * Rendu :
 *   npx remotion render src/remotion/index.ts AtherisAd     out/atheris-ad.mp4
 *   npx remotion render src/remotion/index.ts AtherisGlobal out/atheris-global.mp4
 *
 * La durée de chaque composition vient de SA timeline de voix off : on ne
 * fige jamais un nombre de frames à la main.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AtherisAd"
        component={Ad}
        durationInFrames={VO1.totalFrames}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />
      <Composition
        id="AtherisGlobal"
        component={GlobalAd}
        durationInFrames={VO2.totalFrames}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />
    </>
  );
};
