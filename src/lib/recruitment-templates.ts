/**
 * Atheris — modèles d'e-mail de recrutement —
 * **module 100 % pur** : aucun import DB ni auth → testable unitairement
 * (`recruitment-templates.test.ts`, zéro connexion) et utilisable tel quel
 * par `src/actions/recrutement.ts` et `src/actions/exams.ts`.
 *
 * CONTRAT :
 * - `DEFAULT_EMAIL_TEMPLATES` — 10 textes figés (5 kinds × fr/en) avec
 *   les placeholders `{{prenom}}`, `{{nom}}` et `{{lien}}` :
 *   `invite` / `reject` envoyés manuellement par le CEO,
 *   `exam_invite` envoyé au dépôt (porte le lien, fenêtre 3 j),
 *   `exam_passed` / `exam_failed` envoyés à la soumission ;
 * - `renderTemplate(body, vars)` — remplacement des placeholders ; le lien
 *   est **toujours** présent dans l'e-mail final (exigence métier : s'il a
 *   disparu du corps, il est réinjecté en fin de message) ;
 * - `absoluteInterviewUrl(relativeUrl)` — absolutisation via `SITE_URL`
 *   (repli `https://atheris-labs.sofianeasma.me`).
 *
 * Le CEO peut personnaliser les textes (table `recruitmentTemplates`, upsert
 * via `src/actions/recrutement.ts`) ; ces valeurs par défaut ne servent que
 * de repli quand aucune personnalisation n'existe.
 */

/** Nature d'un e-mail de recrutement.

`invite` / `reject` sont envoyés MANUELLEMENT par le CEO (modal
`ApplicationEmailModal`). `exam_passed` / `exam_failed` sont envoyés
AUTOMATIQUEMENT à la soumission de l'examen (`src/actions/exams.ts`) — le
candidat a déjà son écran de confirmation, l'e-mail est le double formel qui
lui parvient par écrit. `exam_invite` porte le LIEN du test au candidat
(la page « vous avez 3 jours pour commencer »), envoyé au dépôt. */
export type EmailTemplateKind =
  | "invite"
  | "reject"
  | "exam_passed"
  | "exam_failed"
  | "exam_invite";

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

Merci pour votre candidature au poste de Sales Development Representative chez Atheris Labs.
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

Thank you for your application for the Sales Development Representative position at Atheris
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

  // ── Examen zero-interview : envoyés AUTOMATIQUEMENT à la soumission ────────
  // Pas de `{{lien}}` : le candidat a déjà vu son écran de confirmation,
  // l'e-mail est le double ECRIT de ce qu'il vient de recevoir.
  exam_passed: {
    fr: {
      subject: "Votre test est bien arrivé — Atheris Labs",
      body: `Bonjour {{prenom}},

Votre test de recrutement a bien été reçu. Merci pour le temps que vous y
avez consacré.

Il sera examiné personnellement par notre CEO sous 24 heures. Vous recevrez
la décision finale par e-mail — aucune action n'est nécessaire de votre côté
d'ici là.

Bien à vous,
Sofiane — Atheris Labs`,
    },
    en: {
      subject: "Your assessment has been received — Atheris Labs",
      body: `Bonjour {{prenom}},

Your assessment has been received. Thank you for the time you put into it.

It will be reviewed personally by our CEO within 24 hours. You will receive
the final decision by e-mail — nothing is required from you in the meantime.

Best regards,
The Atheris Labs team`,
    },
  },
  exam_failed: {
    fr: {
      subject: "Résultat de votre test — Atheris Labs",
      body: `Bonjour {{prenom}},

Nous vous remercions pour le temps consacré à votre test de recrutement.

Malheureusement, vos réponses ne correspondent pas au modèle de commission
exigé pour ce poste de Sales Development Representative. Le test est donc
clôturé et nous ne poursuivrons pas votre candidature.

Cette décision est propre à ce modèle particulier et ne remet pas en cause
la qualité de votre profil.

Bien à vous,
Sofiane — Atheris Labs`,
    },
    en: {
      subject: "Assessment result — Atheris Labs",
      body: `Bonjour {{prenom}},

Thank you for the time you spent on your assessment.

Unfortunately, your answers do not match the commission model required for
this Sales Development Representative position. The assessment is therefore
closed and we will not be moving forward with your application.

This decision relates specifically to that model and does not reflect on the
quality of your profile.

Best regards,
The Atheris Labs team`,
    },
  },

  // ── Invitation à passer le test (envoyée au dépôt de la candidature) ─────
  // `{{lien}}` est le LIEN D'EXAMEN (et non d'entretien) — la page « vous
  // avez 3 jours pour commencer ». Il porte sa propre fenêtre de validité.
  exam_invite: {
    fr: {
      subject: "Votre test de recrutement — Atheris Labs",
      body: `Bonjour {{prenom}},

Merci pour votre candidature au poste de Sales Development Representative
chez Atheris Labs.

La prochaine étape est un test en ligne : 4 sections, environ 20 à 25
minutes. Il n'y a pas d'entretien vidéo.

Vous avez 3 JOURS pour le commencer. Passé ce délai, ce lien ne sera plus
valide et nous ne pourrons pas poursuivre votre candidature.

Commencez ici :
{{lien}}

Vos réponses sont enregistrées automatiquement à la fin de chaque section :
une coupure de connexion ne vous fait rien perdre.

Bien à vous,
Sofiane — Atheris Labs`,
    },
    en: {
      subject: "Your assessment — Atheris Labs",
      body: `Bonjour {{prenom}},

Thank you for applying for the Sales Development Representative position at
Atheris Labs.

The next step is an online assessment: 4 sections, about 20 to 25 minutes.
There is no video interview.

You have 3 DAYS to start it. After that this link will no longer be valid
and we will not be able to continue your application.

Start here:
{{lien}}

Your answers are saved automatically at the end of each section: losing your
connection will not cost you your work.

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
  const base =
    process.env.SITE_URL?.trim() || "https://atheris-labs.sofianeasma.me";
  return `${base.replace(/\/+$/, "")}${relativeUrl}`;
}
