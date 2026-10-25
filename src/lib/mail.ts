/**
 * Atheris — enveloppe d'envoi d'e-mail (PLAN §2.2 · Q1 « Resend ») —
 * **provider-agnostique et sans aucune dépendance npm** : appel `fetch`
 * direct sur l'API Resend, zéro SDK.
 *
 * CONTRAT (interface stable si le provider change un jour) :
 * ```ts
 * sendMail({ to, subject, text, html?, attachments? })
 *   → { ok: true } | { ok: false; error?: string }
 * ```
 *
 * SÉCURITÉ :
 * - **aucune valeur en dur** : clé `RESEND_API_KEY` et expéditeur
 *   `EMAIL_FROM` lus dans l'env (`.env.local`, jamais committé) — seule
 *   l'adresse d'expéditeur de repli `onboarding@resend.dev` (domaine de
 *   test Resend) est littérale ;
 * - **jamais d'exception** : toute panne (clé absente, réseau, refus API)
 *   remonte en `{ ok: false, error }` — un envoi d'e-mail ne doit jamais
 *   faire crasher une Server Action publique (PLAN §Sécurité 4) ;
 * - `subject` **sanitisé** : contrôle + CR/LF supprimés (anti injection
 *   d'en-tête SMTP) et `:` retiré après le premier jeton ;
 * - le destinataire est imposé par l'**appelant** (les actions passent la
 *   constante `admin@sofianeasma.me` — jamais une valeur issue du
 *   formulaire utilisateur) ; ce module se contente de refuser une adresse
 *   malformée.
 *
 * ATTACHMENTS : `Buffer` **en mémoire**, encodé base64 (aucune écriture
 * disque — voir `src/actions/careers.ts`), `mime_type` déduit de l'extension.
 */

/** Pièce jointe mémoire (aucun chemin, aucun fichier sur disque). */
export type MailAttachment = {
  filename: string;
  content: Buffer;
};

/** Paramètres d'un envoi. `to` est imposé par l'appelant, jamais par le client. */
export type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

/** Résultat : `error` est un **code** (jamais un message utilisateur). */
export type SendMailResult = {
  ok: boolean;
  error?: string;
};

/** Corps JSON envoyé à Resend (`to` accepté en tableau). */
type ResendPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; mime_type: string }[];
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Repli d'expéditeur : domaine de test Resend (email délivrable en dev). */
const DEFAULT_FROM = "ATHERIS LABS <onboarding@resend.dev>";

/** Délai maximal d'appel HTTP — un envoi bloqué ne tient pas l'action. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Borne de longueur de sujet (RFC 5322 : en-tête borné, pas de dilution). */
const SUBJECT_MAX = 200;

/** Adresse minimale « local@domaine.tld » (le reste est validé par Resend). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Extensions admises → type MIME (couvre le CV + les pièces jointes usuelles). */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  html: "text/html",
  zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Repli universel quand l'extension est inconnue. */
const FALLBACK_MIME = "application/octet-stream";

/**
 * Sanitisation du sujet (anti injection d'en-tête, PLAN §Sécurité 4) :
 * 1. tous les caractères de contrôle (dont CR/LF, source de l'injection
 *    `Subject: …\r\nBcc: …`) remplacés puis espaces condensés ;
 * 2. tout `:` survenant **après le premier jeton** retiré (un deux-points en
 *    tête d'en-tête réécrit le champ) ;
 * 3. troncature à `SUBJECT_MAX`.
 *
 * Les sujets produits par les actions (`… — …`) ne portent aucun `:` après le
 * premier jeton : `10:00` est d'ailleurs écrit `10h00` côté action.
 */
function sanitizeSubject(raw: string): string {
  if (typeof raw !== "string") return "Atheris Labs";
  const cleaned = raw
    // `\p{Cc}` = caractères de contrôle ASCII/C1 (dont CR et LF) — écriture
    // par propriété Unicode pour ne pas déclencher `no-control-regex`.
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "Atheris Labs";

  const firstSpace = cleaned.indexOf(" ");
  if (firstSpace === -1) return cleaned.slice(0, SUBJECT_MAX);

  const head = cleaned.slice(0, firstSpace);
  const tail = cleaned
    .slice(firstSpace + 1)
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const subject = tail.length > 0 ? `${head} ${tail}` : head;
  return subject.slice(0, SUBJECT_MAX);
}

/** Type MIME déduit de l'extension (minuscules, sans le point). */
function mimeTypeFor(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return FALLBACK_MIME;
  return MIME_BY_EXTENSION[filename.slice(dot + 1).toLowerCase()] ?? FALLBACK_MIME;
}

/**
 * Convertit les pièces jointes au format Resend (base64 + `mime_type`).
 *
 * @returns `null` si une entrée est malformée (nom vide / contenu non
 *   `Buffer`) — l'envoi est alors refusé plutôt que d'être corrompu.
 */
function toResendAttachments(
  attachments: MailAttachment[],
): NonNullable<ResendPayload["attachments"]> | null {
  const out: NonNullable<ResendPayload["attachments"]> = [];
  for (const attachment of attachments) {
    if (typeof attachment?.filename !== "string" || attachment.filename.trim().length === 0) {
      return null;
    }
    if (!Buffer.isBuffer(attachment.content)) return null;
    out.push({
      filename: attachment.filename,
      content: attachment.content.toString("base64"),
      mime_type: mimeTypeFor(attachment.filename),
    });
  }
  return out;
}

/**
 * Envoie un e-mail via Resend — **ne lève jamais d'exception**.
 *
 * @param opts `to` (destinataire imposé par l'appelant), `subject`
 *   (sanitisé), `text` (obligatoire), `html` et `attachments` (optionnels).
 * @returns `{ ok: true }` si Resend a accepté la requête (2xx). Sinon
 *   `{ ok: false, error }` avec un **code** parmi :
 *   `missing_api_key` · `invalid_recipient` · `invalid_body` ·
 *   `invalid_attachment` · `api_error` (refus HTTP de Resend) ·
 *   `network_error` (timeout / coupure).
 */
export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  try {
    if (typeof opts !== "object" || opts === null) {
      return { ok: false, error: "invalid_body" };
    }

    // 1. Clé absente → refus silencieux (aucun crash d'action publique).
    const apiKey = process.env.RESEND_API_KEY;
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return { ok: false, error: "missing_api_key" };
    }

    // 2. Destinataire : forme d'adresse uniquement (l'action impose la
    //    constante, ce garde-fou refuse toute valeur forgée/illisible).
    const { to, subject, text, html, attachments } = opts;
    if (typeof to !== "string" || !EMAIL_PATTERN.test(to.trim())) {
      return { ok: false, error: "invalid_recipient" };
    }
    if (typeof text !== "string" || text.length === 0) {
      return { ok: false, error: "invalid_body" };
    }

    const payload: ResendPayload = {
      from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
      to: [to.trim()],
      subject: sanitizeSubject(subject),
      text,
    };
    if (typeof html === "string" && html.length > 0) payload.html = html;

    if (attachments !== undefined && attachments.length > 0) {
      const resendAttachments = toResendAttachments(attachments);
      if (resendAttachments === null) return { ok: false, error: "invalid_attachment" };
      payload.attachments = resendAttachments;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Corps Resend borné : utile au journal serveur, jamais exposé au client.
      const detail = await response.text().catch(() => "");
      console.error("[mail] Resend a refusé l'envoi", {
        status: response.status,
        detail: detail.slice(0, 500),
      });
      return { ok: false, error: "api_error" };
    }

    return { ok: true };
  } catch (error) {
    // Réseau / timeout / JSON illisible : journalisé, jamais propagé.
    console.error("[mail] échec d'envoi (réseau ou délai dépassé)", error);
    return { ok: false, error: "network_error" };
  }
}
