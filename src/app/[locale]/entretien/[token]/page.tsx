import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { eq } from "drizzle-orm";

import { InterviewForm } from "@/components/recrutement/InterviewForm";
import { Badge } from "@/components/ui/Badge";
import { isValidLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getDb } from "@/lib/db";
import { interviews } from "@/lib/db/schema";
import { getSlotsForWindow, getSlotsForWindowDates } from "@/lib/slots";

/**
 * Fuseau d'ANCRAGE de la fenêtre (PLAN §2.1) : les créneaux proposés sont
 * ceux de l'entreprise, en heure algérienne. Identifiant IANA figé — aucune
 * string UI n'est dérivée de cette constante.
 */
const ANCHOR_TZ = "Africa/Algiers";

/**
 * SEGMENT DYNAMIQUE NON ÉNUMÉRABLE — le root layout pose
 * `export const dynamicParams = false` (valide pour `[locale]`, dont la liste
 * est fixe), et cette valeur **s'hérite** à tous les enfants (Next.js #87738).
 * Un token fait 32 bytes hex : impossible à lister via `generateStaticParams`,
 * on re-déclare donc `true` ICI pour que `/{locale}/entretien/{token}` réponde
 * à la demande au lieu de renvoyer un 404 (override explicite accepté par
 * Next : `app/[language]/detail/page.tsx`, issue #50062).
 */
export const dynamicParams = true;

type EntretienPageProps = {
  params: Promise<{ locale: string; token: string }>;
};

/**
 * `/{locale}/entretien/{token}` — page PUBLIQUE (non authentifiée) de prise
 * de rendez-vous (PLAN §3.1, piste F1).
 *
 * - **Hors groupe `(marketing)`** : ni header ni footer (focus conversion) —
 *   le root layout fournit déjà `lang`, les 3 polices et `MotionConfig`.
 * - **Sécurité anti-énumération (PLAN §Sécurité 1)** : un token inconnu, un
 *   entretien `cancelled` et un entretien `done` rendent EXACTEMENT le même
 *   état 404 générique (`notFoundTitle` / `notFoundMessage`) : jamais de
 *   stack, jamais de détail serveur, jamais de distinction révélée.
 * - **Fenêtre expirée (PLAN Q2)** : la fenêtre J+1→J+3 est figée à la
 *   génération du lien (`createdAt`) ; si plus aucun créneau n'est futur en
 *   `Africa/Algiers`, l'état dédié `expiredTitle` / `expiredMessage` remplace
 *   le formulaire (jamais une grille entièrement désactivée).
 * - `generateMetadata` : titre i18n du dict projet (bloc `interview`, clé
 *   garantie par le type figé `InterviewContent`) ; locale invalide → métadonnées vides.
 */
export async function generateMetadata({
  params,
}: EntretienPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};

  const dict = await getDictionary(locale);
  return {
    title: dict.interview.badge,
    description: dict.interview.description.replace(/\*/g, ""),
  };
}

type LinkStateProps = {
  badge: string;
  title: string;
  message: string;
};

/**
 * Carte d'état plein écran : 404 générique OU lien expiré (PLAN Q2) — même
 * composition (badge + `.h-display` + phrase), deux chaînes du dict, aucun
 * détail serveur.
 */
function InvalidLinkState({
  badge,
  title,
  message,
}: LinkStateProps): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="flex flex-col items-center gap-4 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-9">
        <Badge variant="pill">{badge}</Badge>
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.25rem)] text-fg">
          {title}
        </h1>
        <p className="max-w-[46ch] text-[15px] leading-[1.65] text-muted">
          {message}
        </p>
      </div>
    </div>
  );
}

/**
 * Page serveur : résolution du token en base (Drizzle), puis rendu du
 * formulaire client avec **uniquement** les strings sérialisables du bloc
 * `interview` (jamais le dict complet).
 */
export default async function EntretienPage({
  params,
}: EntretienPageProps): Promise<React.JSX.Element> {
  const { locale, token } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const interview = dict.interview;

  // Lecture minimaliste : `status` + `createdAt` seuls, aucun email ni nom
  // renvoyés au client. Toute erreur inattendue sort du rendu 404 (boundary
  // Next), donc sans stack ni détail non plus.
  const rows = await getDb()
    .select({ status: interviews.status, createdAt: interviews.createdAt })
    .from(interviews)
    .where(eq(interviews.token, token))
    .limit(1);

  const row = rows[0];
  const linkIsValid = row !== undefined && row.status === "pending";

  // Fenêtre J+1→J+3 dérivée du `createdAt` en BASE (PLAN §Sécurité 1) —
  // jamais recalculée ni lue côté client. `string[]` civil algérien → RSC-safe.
  const dates = row !== undefined ? getSlotsForWindowDates(row.createdAt) : [];

  // Lien expiré (PLAN Q2) : comparaison dans `Africa/Algiers` — si PLUS AUCUN
  // créneau de la fenêtre n'est futur, on rend l'état dédié (jamais un
  // formulaire à grille entièrement désactivée).
  const isExpired =
    dates.length > 0 &&
    getSlotsForWindow(dates, ANCHOR_TZ, new Date()).every((slot) => slot.past);

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-ink">
      {/* Ambiance « instrument » voilée à 60 % (pattern `(auth)`) : la
          lecture prime toujours sur la nappe. */}
      <div aria-hidden="true" className="hero-bg">
        <div className="hero-nappe" />
        <div className="floor" />
        <div className="hero-vignette" />
        <div className="absolute inset-0 bg-ink/60" />
      </div>

      {/* Densité AÉRÉE (DESIGN §2.3) + colonne unique, focus conversion. */}
      <main
        id="main"
        className="relative z-10 flex min-h-[100svh] w-full items-center px-[clamp(20px,5vw,56px)] py-[clamp(96px,14vh,176px)]"
      >
        <div className="mx-auto w-full max-w-[1280px]">
          {linkIsValid ? (
            isExpired ? (
              <InvalidLinkState
                badge={interview.badge}
                title={interview.expiredTitle}
                message={interview.expiredMessage}
              />
            ) : (
              <InterviewForm
                token={token}
                dates={dates}
                content={interview}
              />
            )
          ) : (
            <InvalidLinkState
              badge={interview.badge}
              title={interview.notFoundTitle}
              message={interview.notFoundMessage}
            />
          )}
        </div>
      </main>
    </div>
  );
}
