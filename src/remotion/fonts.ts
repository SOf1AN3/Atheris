/**
 * Les 3 voix typographiques du système (§2.2) : Inter Tight (structure),
 * Instrument Serif italic (émotion), JetBrains Mono (donnée).
 * On ne charge QUE les graisses/sous-ensembles utilisés — évite ~300 requêtes
 * et garantit un rendu déterministe.
 */
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

const interTight = loadInterTight("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});
// Deux appels : la voix émotion n'existe qu'en italique, on charge aussi le normal
// pour les valeurs éditoriales (« A → Z »).
loadInstrumentSerif("normal", { weights: ["400"], subsets: ["latin"], ignoreTooManyRequestsWarning: true });
const instrumentSerifItalic = loadInstrumentSerif("italic", {
  weights: ["400"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});
const jetbrainsMono = loadJetBrainsMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export const structure = interTight.fontFamily;
export const emotion = instrumentSerifItalic.fontFamily;
export const mono = jetbrainsMono.fontFamily;
