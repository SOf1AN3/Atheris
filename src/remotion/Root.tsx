import React from "react";
import { Composition } from "remotion";
import { Ad } from "./Ad";
import { DURATION, FPS, HEIGHT, WIDTH } from "./theme";

/**
 * Point d'entrée Remotion.
 * Rendu : `npx remotion render src/remotion/index.ts AtherisAd out/atheris-ad.mp4`
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AtherisAd"
      component={Ad}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{}}
    />
  );
};
