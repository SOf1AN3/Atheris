import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getMyContractConsent } from "@/actions/contract";
import { auth } from "@/auth";
import { ContractPanel, type ContractPanelLabels } from "@/components/app/ContractPanel";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { getDictionary } from "@/i18n/dictionaries";
import { isValidLocale, type Locale } from "@/i18n/config";
import { isRole } from "@/lib/permissions";

// Session + lecture DB au rendu : jamais statique (voir `getDb()` — la page
// n'est jamais pré-rendue au build, aucun `DATABASE_URL` lu à ce moment).
export const dynamic = "force-dynamic";

/**
 * Atheris — page « Contrat de partenariat » (espace SDR · L11, D5/D6).
 *
 * ─── RÔLE ──────────────────────────────────────────────────────────────────
 * **SDR seul** : `acceptContract` / `getMyContractConsent` sont réservés `sdr`
 * côté serveur, la page applique la même garde en miroir (le middleware ne
 * couvre pas toujours ce suffixe : la garde de la page est LE premier filet,
 * doublée de la revalidation du rôle dans chaque action).
 *
 * ─── SENS (D5) ─────────────────────────────────────────────────────────────
 * Page **non bloquante** : elle se consulte librement, le consentement est
 * volontaire, AUCUNE autre route n'en dérive (H6 : requis pour le 1ᵉʳ
 * virement — enforcement hors périmètre de cette vague).
 * Si une ligne `contract_consents` existe déjà pour la version courante, la
 * page affiche l'état horodaté et le formulaire est absent ; sinon elle
 * présente les 9 clauses + la case à cocher obligatoire.
 *
 * ─── ERREURS ───────────────────────────────────────────────────────────────
 * `{ ok: false }` → `console.error` + bloc sobre `common.retry` (aucun détail
 * technique en UI) ; l'erreur d'infra non interceptée par l'action est
 * propagée → 500 (jamais présentée comme « contrat non accepté »).
 */

/** Bloc d'erreur sobre — `common.retry`, aucun détail technique en UI. */
function errorBlock(retryLabel: string): React.JSX.Element {
  return (
    <div
      role="alert"
      className="max-w-[720px] rounded-[20px] border border-line bg-surface px-6 py-12 text-center"
    >
      <p className="text-[15px] font-semibold text-fg">{retryLabel}</p>
    </div>
  );
}

/**
 * Format de date/heure UNIQUE côté serveur : la DB stocke des ISO 8601 UTC,
 * l'affichage est demandé en `Africa/Algiers` (fuseau de l'espace, spec T02) —
 * miroir exact de `/espace/recrutement` (aucun `Date` côté client).
 */
function formatDateTime(value: string, locale: Locale): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(date);
}

type ContratPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: ContratPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return { title: dict.contract.title };
}

export default async function ContratPage({
  params,
}: ContratPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Garde défensive (le middleware + le layout `(app)` font déjà le même job).
  const session = await auth();
  if (!session || session.user.status !== "active" || !isRole(session.user.role)) {
    redirect(`/${locale}/connexion`);
  }

  // RBAC route : `/espace/contrat` est réservé au SDR — les actions
  // refuseraient de toute façon, mais la page ne montre aucun vestige.
  if (session.user.role !== "sdr") notFound();

  const dict = await getDictionary(locale);
  const { contract } = dict;

  const consentResult = await getMyContractConsent();

  // Libellés résolus ICI (frontière RSC : uniquement des strings au client,
  // y compris les codes d'erreur traduits — jamais de message serveur).
  const labels: ContractPanelLabels = {
    checkboxLabel: contract.checkboxLabel,
    acceptLabel: contract.acceptLabel,
    acceptingLabel: contract.acceptingLabel,
    successMessage: contract.successMessage,
    errors: contract.errors,
  };

  let consentBlock: React.JSX.Element;
  if (!consentResult.ok) {
    console.error("[contrat] échec de la lecture du consentement", consentResult.code);
    consentBlock = errorBlock(contract.loadFailed);
  } else if (consentResult.consent.acceptedAt !== null) {
    // Date formatée SANS `Date` côté client (miroir recrutement) — repli « — »
    // si l'horodatage est illisible (motif `toRow` de /espace/recrutement).
    const acceptedLabel =
      formatDateTime(consentResult.consent.acceptedAt, locale) ?? "—";
    // Déjà accepté : état horodaté, formulaire absent (jamais de double
    // acceptation proposée — l'action est de toute façon idempotente).
    consentBlock = (
      <div
        role="status"
        className="flex max-w-[720px] flex-col gap-4 rounded-[20px] border border-accent/35 bg-accent/10 p-7"
      >
        <Badge variant="verified">{contract.acceptedTitle}</Badge>
        <p className="text-[15px] leading-[1.65] text-fg">
          {contract.acceptedMessage.replace("{{date}}", acceptedLabel)}
        </p>
        {consentResult.consent.emailSent ? (
          <p className="text-[13px] leading-[1.6] text-muted">{contract.emailCopyNote}</p>
        ) : null}
        <p className="micro text-fg-2">
          {contract.versionLabel.replace("{{version}}", consentResult.consent.version)}
        </p>
      </div>
    );
  } else {
    // Pas encore accepté : case à cocher obligatoire + bouton.
    consentBlock = <ContractPanel labels={labels} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="h-display text-[clamp(1.75rem,3vw,2.5rem)] text-fg">
          {contract.title}
        </h1>
        <p className="max-w-[68ch] text-[15px] leading-[1.65] text-muted">
          {contract.intro}
        </p>
        <p className="max-w-[68ch] text-[13px] leading-[1.6] text-faint">
          {contract.nonBlockingNote}
        </p>
      </div>

      <Reveal>
        <div className="flex flex-col gap-6">
          {/* Les 9 clauses — colonne contrainte, rendues côté serveur
              (texte contractuel, aucun état client). */}
          <section
            aria-labelledby="contract-clauses-title"
            className="flex max-w-[720px] flex-col gap-4"
          >
            <h2
              id="contract-clauses-title"
              className="h-display text-[clamp(1.15rem,2vw,1.35rem)] text-fg"
            >
              {contract.clausesTitle}
            </h2>
            <ol className="flex flex-col gap-4">
              {contract.clauses.map((clause, index) => (
                <li
                  key={clause.id}
                  className="rounded-[20px] border border-line bg-surface px-6 py-5"
                >
                  <div className="flex items-baseline gap-3">
                    <span aria-hidden="true" className="micro text-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-[16px] font-semibold leading-[1.3] text-fg">
                      {clause.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-[15px] leading-[1.65] text-muted">
                    {clause.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* État du consentement : accepté (horodaté) / formulaire / erreur. */}
          {consentBlock}
        </div>
      </Reveal>
    </div>
  );
}
