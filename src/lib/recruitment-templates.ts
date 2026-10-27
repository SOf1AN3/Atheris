/**
 * Atheris — modèles d'e-mail de recrutement (invite / reject) —
 * **module 100 % pur** : aucun import DB ni auth → testable unitairement
 * (`recruitment-templates.test.ts`, zéro connexion) et utilisable tel quel
 * par `src/actions/recrutement.ts`.
 *
 * CONTRAT :
 * - `DEFAULT_EMAIL_TEMPLATES` — 4 textes figés (invite/reject × fr/en) avec
 *   les placeholders `{{prenom}}`, `{{nom}}` et `{{lien}}` ;
 * - `renderTemplate(body, vars)` — remplacement des placeholders ; le lien
 *   est **toujours** présent dans l'e-mail final (exigence métier : s'il a
 *   disparu du corps, il est réinjecté en fin de message) ;
 * - `absoluteInterviewUrl(relativeUrl)` — absolutisation via `SITE_URL`
 *   (repli `https://atherislabs.com`).
 *
 * Le CEO peut personnaliser les textes (table `recruitmentTemplates`, upsert
 * via `src/actions/recrutement.ts`) ; ces valeurs par défaut ne servent que
 * de repli quand aucune personnalisation n'existe.
 */

/** Nature d'un e-mail de recrutement : invitation à un entretien, ou refus. */
export type EmailTemplateKind = "invite" | "reject";

/** Locales admises (aligné sur `@/i18n/config`). */
export type TemplateLocale = "fr" | "en";

/** Un modèle : sujet + corps, avec placeholders `{{prenom}}`/`{{nom}}`/`{{lien}}`. */
export type EmailTemplate = { subject: string; body: string };

/**
 * Modèles par défaut — textes métier FIGÉS (repli de
 * `recruitmentTemplates`, jamais affichés tels quels : `renderTemplate`
 * les rend avant envoi).
 */
export const DEFAULT_EMAIL_TEMPLATES: Record<
  EmailTemplateKind,
  Record<TemplateLocale, EmailTemplate>
> = {
  invite: {
    fr: {
      subject: "Invitation à un entretien — Atheris Labs",
      body: `Bonjour {{prenom}},

Merci pour votre candidature au poste de Sales Partner chez Atheris Labs.
Nous avons étudié votre dossier avec attention et souhaitons échanger avec
vous lors d'un entretien en visioconférence (Google Meet, environ 30 minutes).

Choisissez le créneau qui vous convient le mieux — les horaires sont
affichés dans votre fuseau horaire :
{{lien}}

Ce lien est valable pour les trois prochains jours.

Bien à vous,
Sofiane — Atheris Labs`,
    },
    en: {
      subject: "Interview invitation — Atheris Labs",
      body: `Bonjour {{prenom}},

Thank you for your application for the Sales Partner position at Atheris
Labs. We have reviewed your profile with care and would like to meet you
during an online interview (Google Meet, about 30 minutes).

Pick the slot that suits you best — the times are shown in your own time
zone:
{{lien}}

This link is valid for the next three days.

Best regards,
The Atheris Labs team`,
    },
  },
  reject: {
    fr: {
      subject: "Votre candidature chez Atheris Labs",
      body: `Bonjour {{prenom}},

Nous vous remercions pour l'intérêt que vous portez à Atheris Labs et pour
le temps consacré à votre candidature.

Après étude attentive de votre dossier, nous ne poursuivrons pas votre
candidature pour ce poste. Cette décision ne remet pas en cause la qualité
de votre profil : notre sélection a été particulièrement contrastée.

Nous conservons votre candidature et reviendrons vers vous si une
opportunité plus adéquate se présente.

Bien à vous,
Sofiane — Atheris Labs`,
    },
    en: {
      subject: "Your application with Atheris Labs",
      body: `Bonjour {{prenom}},

Thank you for your interest in Atheris Labs and for the time you spent on
your application.

After careful consideration, we will not be moving forward with your
application for this position. This decision does not reflect on the
quality of your profile: our selection process was particularly
competitive.

We are keeping your application on file and will get back to you if a more
suitable opportunity arises.

Best regards,
The Atheris Labs team`,
    },
  },
};

/**
 * Remplace les placeholders d'un modèle par les valeurs du candidat.
 *
 * - `{{prenom}}` et `{{nom}}` sont remplacés **partout** dans le corps ;
 * - `{{lien}}` est remplacé par `vars.lien` si fourni — **et si `lien` est
 *   fourni mais que `{{lien}}` n'apparaît plus dans le corps, l'URL est
 *   réinjectée en fin de message** (exigence métier : le lien est TOUJOURS
 *   présent dans l'e-mail final, y compris sur un modèle personnalisé
 *   dont le CEO aurait supprimé le placeholder) ;
 * - si `lien` n'est **pas** fourni, `{{lien}}` est laissé tel quel (jamais
 *   de lien forgé) ;
 * - tout autre placeholder inconnu (`{{ville}}`…) est laissé intact.
 *
 * @example renderTemplate("Bonjour {{prenom}}", { prenom: "Ada", nom: "Lovelace" })
 * // → "Bonjour Ada"
 */
export function renderTemplate(
  body: string,
  vars: { prenom: string; nom: string; lien?: string },
): string {
  let out = body.replaceAll("{{prenom}}", vars.prenom).replaceAll("{{nom}}", vars.nom);

  if (vars.lien !== undefined) {
    if (out.includes("{{lien}}")) {
      out = out.replaceAll("{{lien}}", vars.lien);
    } else {
      // Placeholder supprimé du modèle personnalisé : le lien est réinjecté
      // en fin de message (saut de ligne + URL seule).
      out = `${out}\n${vars.lien}`;
    }
  }

  return out;
}

/**
 * Absolutise l'URL relative d'un lien d'entretien (`/{locale}/entretien/…`)
 * à partir de `SITE_URL` (repli domaine production).
 *
 * @example absoluteInterviewUrl("/fr/entretien/abc") // SITE_URL="https://x.com/"
 * // → "https://x.com/fr/entretien/abc"
 */
export function absoluteInterviewUrl(relativeUrl: string): string {
  const base = process.env.SITE_URL?.trim() || "https://atherislabs.com";
  return `${base.replace(/\/+$/, "")}${relativeUrl}`;
}
