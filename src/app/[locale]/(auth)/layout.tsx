import { notFound } from "next/navigation";

import { isValidLocale } from "@/i18n/config";

type AuthLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Layout du groupe `(auth)` : page centrée sans header ni footer.
 * Carte unique sur fond `bg-ink`, monogramme constructiviste + mot-marque.
 * (Formulaires réels câblés en T09.)
 */
export default async function AuthLayout({
  children,
  params,
}: AuthLayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        {/* Monogramme constructiviste « A » : 2 diagonales + barre horizontale. */}
        <div
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#242936]"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4.5 19.5L12 4.5L19.5 19.5"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.25 14H15.75"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-[15px] font-bold tracking-[-0.02em] text-fg">
          ATHERIS <span className="text-muted">LABS</span>
        </p>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8">
        {children}
      </div>
    </div>
  );
}
