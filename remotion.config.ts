import { Config } from "@remotion/cli/config";

// Configuration du rendu de la publicité ATHERIS (voir VIDEO.md).
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
// Le dev server Next.js occupe déjà le port 3000 — on isole le bundler Remotion.
Config.setPort(3210);
