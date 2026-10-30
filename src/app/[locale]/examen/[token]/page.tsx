import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { eq } from "drizzle-orm";

import { ExamForm } from "@/components/recrutement/ExamForm";
import { Badge } from "@/components/ui/Badge";
import { isValidLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { ExamContent } from "@/content/types";
import { getDb } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";
import { EXAM_TOKEN_PATTERN, EXAM_SECTIONS } from "@/lib/exam";

/**
 * SEGMENT DYNAMIQUE NON ENUMERABLE — le root layout pose
 * `export const dynamicParams = false` (valide pour `[locale]`, dont la liste
 * est fixe), et cette valeur **s'hérite** à tous les enfants (Next.js #87738).
 * Un jeton fait 32 bytes hex : impossible à lister via `generateStaticParams`,
 * on re-déclare donc `true` ICI pour que `/{locale}/examen/{token}` réponde à
 * la demande au lieu de renvoyer un 404 (override accepté par Next).
 */
export const dynamicParams = true;

type ExamenPageProps = {
  params: Promise<{ locale: string; token: string }>;
};

/**
 * `/{locale}/examen/{token}` — page PUBLIQUE (non authentifiée) du parcours
 * d'examen zero-interview.
 *
 * - **Hors groupe `(marketing)`** : ni header ni footer (focus total sur le
 *   test) — le root layout fournit déjà `lang`, les 3 polices et
 *   `MotionConfig`.
 * - **Anti-enumération (motif strict de `entretien/[token]`)** : un jeton
 *   inconnu, un jeton malformé et une session déjà soumise rendent des états
 *   404 / dédiés SANS détail serveur, sans stack, sans confirmer l'existence
 *   d'une candidature.
 * - **Lecture minimale** : seul `status` + `locale` transitent vers le client.
 *   Aucun nom, aucun email de candidature ne quitte le serveur.
 */
export async function generateMetadata({
  params,
}: ExamenPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};

  const dict = await getDictionary(locale);
  return {
    title: dict.exam.badge,
    description: dict.exam.description.replace(/\*/g, ""),
    // Jamais indexée : contenu de recrutement personnel.
    robots: { index: false, follow: false },
  };
}

/** Décompose un titre du dict en ses deux voix (DESIGN §2.2.1) : les
 *  marqueurs `*…*` deviennent un `<span class="voix">` serif — sans cette
 *  découpe les astérisques seraient rendus littéralement. */
function accentParts(text: string): React.JSX.Element {
  const parts = text.split("*");
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="voix">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Carte d'état plein écran — jeton invalide OU déjà soumis. */
function ExamState({
  badge,
  title,
  message,
}: {
  badge: string;
  title: string;
  message: string;
}): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="flex flex-col items-center gap-4 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-9">
        <Badge variant="pill">{badge}</Badge>
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.25rem)] text-fg">
          {accentParts(title)}
        </h1>
        <p className="max-w-[46ch] text-[15px] leading-[1.65] text-muted">{message}</p>
      </div>
    </div>
  );
}

/**
 * Rendu de la page d'examen.
 *
 * Trois états possibles, sans distinction révélée au-delà de ce qu'elle
 * apporte au candidat :
 * - session `in_progress` → le formulaire ;
 * - session `submitted`   → état dédié « déjà soumis » (le lien a SERVI, ce
 *   n'est pas une erreur : le candidat mérite de le savoir) ;
 * - absente / malformée   → 404 générique.
 */
export default async function ExamenPage({
  params,
}: ExamenPageProps): Promise<React.JSX.Element> {
  const { locale, token } = await params;
  if (!isValidLocale(locale)) notFound();
  const loc = locale as Locale;

  const dict = await getDictionary(loc);
  const content: ExamContent = dict.exam;

  // Garde de forme AVANT toute requête : un jeton malformé ne touche jamais
  // la base (404 immédiat, zéro requête DB).
  if (!EXAM_TOKEN_PATTERN.test(token)) notFound();

  // Lecture minimale — `status` et `locale` seulement.
  const rows = await getDb()
    .select({ status: examSessions.status, locale: examSessions.locale })
    .from(examSessions)
    .where(eq(examSessions.token, token))
    .limit(1);

  const row = rows[0];

  // Session absente → 404 générique (aucune distinction « inconnu »).
  if (row === undefined) notFound();

  if (row.status === "submitted") {
    return (
      <div className="relative min-h-[100svh] overflow-hidden bg-ink">
        <div aria-hidden="true" className="hero-bg">
          <div className="hero-nappe" />
          <div className="floor" />
          <div className="hero-vignette" />
          <div className="absolute inset-0 bg-ink/60" />
        </div>
        <main
          id="main"
          className="relative z-10 flex min-h-[100svh] w-full items-center px-[clamp(20px,5vw,56px)] py-[clamp(96px,14vh,176px)]"
        >
          <ExamState
            badge={content.badge}
            title={content.submittedTitle}
            message={content.submittedMessage}
          />
        </main>
      </div>
    );
  }

  if (row.status !== "in_progress") notFound();

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-ink">
      {/* Ambiance « instrument voilée » à 60 % — la lecture prime. */}
      <div aria-hidden="true" className="hero-bg">
        <div className="hero-nappe" />
        <div className="floor" />
        <div className="hero-vignette" />
        <div className="absolute inset-0 bg-ink/60" />
      </div>

      <main
        id="main"
        className="relative z-10 w-full px-[clamp(20px,5vw,56px)] py-[clamp(40px,7vh,72px)]"
      >
        <div className="mx-auto w-full max-w-[860px]">
          <ExamForm token={token} locale={loc} content={content} />
        </div>
      </main>
    </div>
  );
}

/** Réexport utile au formulaire client (source de vérité unique du barème). */
export { EXAM_SECTIONS };
