import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isValidLocale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";

type AuthLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Métadonnées **par défaut** de la zone `(auth)` : chaque page (connexion,
 * inscription…) peut les surcharger via son propre `generateMetadata` (Next
 * fusionne : le champ défini par l'enfant gagne). Aucun `generateMetadata` au
 * root (T05) : pas de conflit.
 */
export async function generateMetadata({
  params,
}: Pick<AuthLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    return {};
  }
  const dict = await getPlatformDictionary(locale);
  return {
    title: `${dict.common.brand.name} ${dict.common.brand.suffix}`,
  };
}

/** Courbe UNIQUE du système (DESIGN §3.1) — aucun rebond, aucun spring. */
const MOTION = "duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]";

/** Monogramme constructiviste « A » : 2 diagonales + barre horizontale. */
function Monogram({
  className,
  strokeWidth,
}: {
  className: string;
  strokeWidth: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 19.5L12 4.5L19.5 19.5" />
      <path d="M8.25 14H15.75" />
    </svg>
  );
}

/**
 * Layout du groupe `(auth)` — composition **asymétrique** façon console
 * d'instrument (DESIGN §2.5) :
 * - calque d'ambiance `hero-bg` **atténué** par une voile `bg-ink/60` : la
 *   colonne de formulaire reste parfaitement lisible ;
 * - en-tête : lien marque (monogramme + mot-marque) vers la landing `/{locale}` ;
 * - colonne visuelle à gauche (filets décoratifs `aria-hidden`, aucun contenu
 *   marketing nouveau) / colonne formulaire à droite `lg:col-span-5`,
 *   empilée en mobile ;
 * - landmark a11y unique `#main` conservé (cible du skip-link).
 */
export default async function AuthLayout({
  children,
  params,
}: AuthLayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const dict = await getPlatformDictionary(locale);
  const brandName = dict.common.brand.name;
  const brandSuffix = dict.common.brand.suffix;

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-ink">
      {/* Ambiance instrument, voilée à 60 % : jamais au détriment de la lecture. */}
      <div aria-hidden="true" className="hero-bg">
        <div className="hero-nappe" />
        <div className="floor" />
        <div className="hero-vignette" />
        <div className="absolute inset-0 bg-ink/60" />
      </div>

      {/* En-tête : marque → retour landing (aucune string en dur, dict only). */}
      <header className="relative z-10 w-full px-[clamp(20px,5vw,56px)] pt-6 md:pt-8">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between">
          <Link
            href={`/${locale}`}
            className="group inline-flex min-h-11 items-center gap-3 rounded-full pr-3"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full border border-line-2 bg-white/[0.03] transition-colors ${MOTION} group-hover:border-line-3`}
            >
              <Monogram className="size-6" strokeWidth="1.5" />
            </span>
            <span className="text-[15px] font-bold tracking-[-0.02em] text-fg">
              {brandName}{" "}
              <span
                className={`text-muted transition-colors ${MOTION} group-hover:text-fg-2`}
              >
                {brandSuffix}
              </span>
            </span>
          </Link>
        </div>
      </header>

      {/* Colonne formulaire (droite) + colonne visuelle (gauche, décorative). */}
      <main
        id="main"
        className="relative z-10 flex w-full flex-1 items-center px-[clamp(20px,5vw,56px)] py-10 md:py-14"
      >
        <div className="mx-auto grid w-full max-w-[1280px] gap-10 lg:grid-cols-12 lg:items-center lg:gap-14">
          {/* Aucune phrase disponible dans le dict → colonne visuelle = marque
              + filets décoratifs uniquement (aucun texte marketing). */}
          <div
            aria-hidden="true"
            className="hidden lg:col-span-7 lg:flex lg:flex-col lg:gap-7"
          >
            <span className="h-px w-full bg-line-2" />
            <div className="flex items-end gap-8">
              <Monogram
                className="h-[200px] w-[200px] shrink-0 text-fg/[0.16]"
                strokeWidth="0.6"
              />
              <div className="flex flex-1 flex-col gap-5 pb-2">
                <span className="h-px w-full bg-line" />
                <span className="h-px w-4/5 bg-line" />
                <span className="h-px w-3/5 bg-line" />
                <span className="h-px w-1/2 bg-line" />
              </div>
            </div>
            <span className="h-px w-full bg-line" />
          </div>

          <div className="lg:col-span-5">{children}</div>
        </div>
      </main>
    </div>
  );
}
