"use server";

/**
 * Atheris — Server Action **candidature /recrutement** (PLAN §2.4).
 *
 * CONTRAT PUBLIC (codes BRUTS — traduits côté client dans
 * `SiteContent.careers.form.errors.*`, aucun message serveur) :
 * ```
 * applyToJob(formData) → { ok: true }
 *   | { ok: false; code: "invalid" | "too_large" | "bad_type" | "rate_limited" | "failed" }
 * ```
 *
 * Traitement : rate-limit 1/60 s/IP (motif `src/actions/contact.ts`) → Zod
 * (prénom, nom, email, message optionnel, locale) → fichier `cv` (**PDF /
 * DOC / DOCX / RTF**, **≤ 5 Mo**, aligné sur `documents.bytes`) → **INSERT en
 * base** (`jobApplications`, source de vérité pour l'espace CEO
 * `/espace/recrutement`) → e-mail vers le destinataire constant avec le CV
 * **en pièce jointe** (notification admin : **non fatal** — la candidature
 * est déjà conservée en base).
 *
 * SÉCURITÉ / EDGE CASES (PLAN §Sécurité 5–6) :
 * - **aucune écriture disque** : le fichier est lu dans un `Buffer` mémoire
 *   et encodé base64 par `sendMail` (aucun chemin, aucun `fs`) ;
 * - contrôle **extension + MIME** (`type` vide = on se fie à l'extension,
 *   cas des navigateurs qui ne renseignent pas `content-type`) ;
 * - nom de fichier sanitisé : basename (séparateurs `/` et `\` retirés →
 *   aucun chemin), caractères hors `[A-Za-z0-9._-]` remplacés par `_`,
 *   longueur bornée ;
 * - destinataire **constant** `admin@sofianeasma.me` imposé par l'appelant
 *   (jamais issu du formulaire) ;
 * - **INSERT avant l'e-mail admin** : jamais de notification orpheline (un
 *   INSERT en échec retourne `failed` sans envoyer de mail) ;
 * - rate-limit : seule une tentative **envoyée** (INSERT tenté — succès ou
 *   échec) consomme le quota — un fichier refusé reste retentable
 *   immédiatement (bouton « réessayer » du formulaire, scénario `too_large`
 *   → correction).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur de l'action (lazy,
 * après tous les contrôles) → `next build` ne lit **jamais** `DATABASE_URL`
 * malgré l'INSERT en base ci-dessous.
 */

import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { activeUserIdsByRoles, notify } from "@/lib/notify";
import { sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/prospect-dedup";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` (effacés à la
// compilation : seules les fonctions async subsistent à l'exécution).
// ---------------------------------------------------------------------------

/** Codes d'échec d'`applyToJob` — traduits côté client, jamais servis en message. */
export type ApplyToJobFailureCode = "invalid" | "too_large" | "bad_type" | "rate_limited" | "failed";

/** Contrat d'`applyToJob` : union discriminée par `ok`. */
export type ApplyToJobResult = { ok: true } | { ok: false; code: ApplyToJobFailureCode };

// ---------------------------------------------------------------------------
// Schéma Zod (v4) — validation systématique AVANT toute lecture de fichier.
// ---------------------------------------------------------------------------

const applySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .pipe(z.email()),
  // Optionnel : borne haute anti-payload (jamais de limite basse — un
  // candidat peut postuler sans mot de passe).
  message: z.string().trim().max(5000).optional(),
  // Locale de la page de dépôt (champ caché `ApplyForm`) — détermine la
  // langue des e-mails envoyés au candidat (invitations / refus). Repli
  // `fr` si absent (ancien formulaire en cache, appel forgé).
  locale: z.enum(["fr", "en"]).optional(),
});

// ---------------------------------------------------------------------------
// Constantes applicatives.
// ---------------------------------------------------------------------------

/** Clés de `FormData` (contrat partagé avec `ApplyForm`). */
const FIELD_FIRST_NAME = "firstName";
const FIELD_LAST_NAME = "lastName";
const FIELD_EMAIL = "email";
const FIELD_MESSAGE = "message";
const FIELD_CV = "cv";
const FIELD_LOCALE = "locale";

/** Destinataire **constant** imposé par l'appelant (jamais issu du form). */
const RECRUITER_EMAIL = "admin@sofianeasma.me";

/** Taille maximale du CV : 5 Mo (aligné sur la contrainte `documents.bytes`). */
const MAX_CV_BYTES = 5 * 1024 * 1024;

/** Extensions admises → type MIME canonique. */
const CV_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
};

/** `Content-Type` admis (certains navigateurs varient sur RTF/DOC). */
const CV_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
  "application/x-rtf",
]);

/** Rate-limit : 1 tentative acceptée par IP et par fenêtre de 60 s. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_SENDS = 1;
/** Entretien de la Map : purge au-delà de cette taille, purge totale après. */
const RATE_MAP_PRUNE_SIZE = 1000;
const RATE_MAP_CLEAR_SIZE = 10_000;

// ---------------------------------------------------------------------------
// Rate-limit (Map module-scope — BEST EFFORT, miroir du motif contact.ts,
// quota indépendant de celui des autres actions publiques).
// ---------------------------------------------------------------------------

/** ip → horodatages (ms) des envois acceptés encore dans la fenêtre. */
const rateSends = new Map<string, number[]>();

/** `true` si l'IP a déjà atteint la jauge dans la fenêtre glissante. */
function isRateLimited(ip: string, now: number): boolean {
  const hits = rateSends.get(ip);
  if (hits === undefined) return false;

  const recent = hits.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length === 0) {
    rateSends.delete(ip);
    return false;
  }
  rateSends.set(ip, recent);
  return recent.length >= RATE_MAX_SENDS;
}

/** Consigne un envoi accepté + entretien borné de la Map (fuite contrôlée). */
function recordRateSend(ip: string, now: number): void {
  if (rateSends.size > RATE_MAP_PRUNE_SIZE) {
    for (const [key, hits] of rateSends) {
      if (hits.every((timestamp) => now - timestamp >= RATE_WINDOW_MS)) {
        rateSends.delete(key);
      }
    }
    // Dernier recours : au-delà du plafond, la jauge repart à zéro.
    if (rateSends.size > RATE_MAP_CLEAR_SIZE) rateSends.clear();
  }
  rateSends.set(ip, [...(rateSends.get(ip) ?? []), now]);
}

/**
 * IP visiteur : en-têtes serveur d'abord (non falsifiable côté client),
 * repli `"unknown"` (dev sans proxy / hors requête). Miroir du pattern de
 * `src/actions/contact.ts`.
 */
async function resolveVisitorIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
  } catch {
    // headers() indisponible (hors requête, tests) : repli silencieux.
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Aides pures (upload).
// ---------------------------------------------------------------------------

/** Structure minimale d'un fichier de `FormData` (aucune dépendance `fs`). */
type UploadedFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

/**
 * Garde structurelle sur l'entrée `cv` : refus d'une valeur absente, d'une
 * chaîne (champ texte posté à la place) ou d'un objet sans API fichier.
 *
 * @returns Le fichier, ou `null` (→ code `invalid`).
 */
function readUpload(entry: FormDataEntryValue | null): UploadedFile | null {
  if (typeof entry !== "object" || entry === null) return null;
  const candidate = entry as Partial<UploadedFile>;
  if (typeof candidate.name !== "string") return null;
  if (typeof candidate.size !== "number" || !Number.isFinite(candidate.size)) return null;
  if (typeof candidate.type !== "string") return null;
  if (typeof candidate.arrayBuffer !== "function") return null;
  if (candidate.size <= 0) return null;
  return candidate as UploadedFile;
}

/** Valeur texte d'un champ (`undefined` si absent ou non-textuel). */
function textOf(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Extension du fichier, **après extraction du basename** (un nom de chemin
 * `x/cv.pdf` ne doit pas être lu à l'envers) et en minuscules.
 *
 * @returns `""` si le nom ne porte pas d'extension exploitable.
 */
function extensionOf(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Nom de pièce jointe sanitisé (aucun chemin, caractères exotiques → `_`) :
 * la partie avant l'extension est bornée à 80 caractères, l'extension est
 * **reconstruite depuis la liste blanche** (jamais reprise telle quelle).
 */
function sanitizeFilename(rawName: string, extension: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const suffix = extension.length > 0 ? `.${extension}` : "";
  const stem = suffix.length > 0 && base.toLowerCase().endsWith(suffix) ? base.slice(0, -suffix.length) : base;

  const cleaned = stem
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[.\-_]+/, "")
    .slice(0, 80)
    .replace(/[.\-_]+$/, "");

  return `${cleaned.length > 0 ? cleaned : "cv"}${suffix}`;
}

/** Récapitulatif interne en français — CV en pièce jointe côté `sendMail`. */
function buildApplicationText(args: {
  firstName: string;
  lastName: string;
  email: string;
  message: string | undefined;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): string {
  const message =
    args.message !== undefined && args.message.length > 0 ? args.message : "(aucun message)";
  const sizeKo = Math.max(1, Math.round(args.sizeBytes / 1024));
  return [
    "Bonjour,",
    "",
    "Une nouvelle candidature a été déposée sur la page /recrutement (Atheris Labs).",
    "",
    `Prénom : ${args.firstName}`,
    `Nom : ${args.lastName}`,
    `Email : ${args.email}`,
    `Message : ${message}`,
    `CV en pièce jointe : ${args.filename} (${args.mimeType} · ${sizeKo} Ko)`,
    `Déposée le : ${new Date().toISOString()}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// applyToJob — soumission publique de candidature (CV en pièce jointe).
// ---------------------------------------------------------------------------

/**
 * Corps du traitement : Zod → fichier → e-mail. Séparé de l'action pour que
 * le quota ne soit consommé qu'après connaissance du résultat.
 */
async function processApplication(formData: FormData): Promise<ApplyToJobResult> {
  // 1. `message` : une valeur non-textuelle (fichier posté dans le champ)
  //    est un payload inattendu → refus net plutôt qu'ignoré silencieusement.
  const messageEntry = formData.get(FIELD_MESSAGE);
  if (messageEntry !== null && typeof messageEntry !== "string") {
    return { ok: false, code: "invalid" };
  }

  // 2. Validation Zod des champs texte — avant toute lecture de fichier.
  //    `locale` : valeur du champ caché (repli `fr` si absente).
  const parsed = applySchema.safeParse({
    firstName: textOf(formData, FIELD_FIRST_NAME),
    lastName: textOf(formData, FIELD_LAST_NAME),
    email: textOf(formData, FIELD_EMAIL),
    message: messageEntry === null ? undefined : messageEntry,
    locale: textOf(formData, FIELD_LOCALE) ?? undefined,
  });
  if (!parsed.success) return { ok: false, code: "invalid" };

  // 3. Fichier : présence, taille, puis type (ordre = coût croissant : le
  //    buffer n'est lu qu'une fois tous les contrôles passés).
  const file = readUpload(formData.get(FIELD_CV));
  if (file === null) return { ok: false, code: "invalid" };
  if (file.size > MAX_CV_BYTES) return { ok: false, code: "too_large" };

  const extension = extensionOf(file.name);
  const declaredMime = CV_EXTENSIONS[extension];
  if (declaredMime === undefined) return { ok: false, code: "bad_type" };

  const providedMime = file.type.split(";")[0].trim().toLowerCase();
  if (providedMime.length > 0 && !CV_MIME_TYPES.has(providedMime)) {
    return { ok: false, code: "bad_type" };
  }

  // 4. Lecture en MÉMOIRE (aucune écriture disque, aucun chemin).
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    console.error("[careers] lecture du CV impossible", error);
    return { ok: false, code: "failed" };
  }
  if (bytes.length === 0) return { ok: false, code: "invalid" };
  // Re-contrôle sur les octets réellement lus (taille déclarée non foiable).
  if (bytes.length > MAX_CV_BYTES) return { ok: false, code: "too_large" };

  const filename = sanitizeFilename(file.name, extension);
  const mimeType = CV_MIME_TYPES.has(providedMime) ? providedMime : declaredMime;

  // 5. Persistance — INSERT dans `jobApplications` (source de vérité pour
  //    l'espace CEO). L'INSERT est placé AVANT l'e-mail admin : une
  //    candidature non stockée ne doit pas déclencher de notification
  //    orpheline. Le rate-limit n'est consommé qu'après ce point.
  const { firstName, lastName, email, message, locale } = parsed.data;
  const db = getDb();
  try {
    await db.insert(jobApplications).values({
      firstName,
      lastName,
      email,
      emailNorm: normalizeEmail(email),
      locale: locale ?? "fr",
      message: message !== undefined && message.length > 0 ? message : null,
      status: "nouveau",
      cvFilename: filename,
      cvMimeType: mimeType,
      cvByteSize: bytes.length,
      cvBytes: bytes,
    });
  } catch (error) {
    // Échec DB : aucun e-mail admin envoyé, code `failed` — le candidat
    // peut réessayer immédiatement (pas de consommation de quota).
    console.error("[careers] candidature non enregistrée en base", error);
    return { ok: false, code: "failed" };
  }

  // 5-bis. Notification `application_created` — NON FATALE, écrite APRÈS
  // l'INSERT réussi (notify() ne throw jamais : la candidature est déjà en
  // base, un échec d'écriture ne change rien). Destinataires : comptes
  // **actifs** `ceo` (aucun acteur à exclure : dépôt public anonyme).
  await notify({
    type: "application_created",
    link: "/espace/recrutement",
    meta: { entity: `${firstName} ${lastName}`.trim() },
    recipientIds: await activeUserIdsByRoles(["ceo"]),
  });

  // 6. E-mail admin — BEST EFFORT (PLAN-RECRUTEMENT-CEO, D8) : la
  //    candidature est en base, c'est la source de vérité. Un échec
  //    Resend est journalisé mais ne fait PAS échouer la candidature.
  const mail = await sendMail({
    to: RECRUITER_EMAIL,
    subject: `Candidature Sales Development Representative — ${firstName} ${lastName}`,
    text: buildApplicationText({
      firstName,
      lastName,
      email,
      message,
      filename,
      mimeType,
      sizeBytes: bytes.length,
    }),
    attachments: [{ filename, content: bytes }],
  });

  if (!mail.ok) {
    // Échec Resend — NON FATAL (voir §6) : la candidature est déjà en base.
    // Journalisé côté serveur uniquement, réponse `ok: true`.
    console.error(
      "[careers] candidature enregistrée mais e-mail admin non envoyé",
      mail.error,
    );
  }

  return { ok: true };
}

/**
 * Dépose une candidature publique (page `/{locale}/recrutement`).
 *
 * Traitement : rate-limit → Zod (prénom, nom, email, message?, locale?) →
 * fichier `cv` (PDF/DOC/DOCX/RTF, ≤ 5 Mo) → **INSERT dans `jobApplications`**
 * (source de vérité pour l'espace CEO) → e-mail admin (best effort : un échec
 * Resend ne fait jamais échouer la candidature déjà stockée).
 *
 * @param formData Champs `firstName`, `lastName`, `email`, `message?`,
 *   `locale?` et le fichier sous la clé `cv` (PDF/DOC/DOCX/RTF, ≤ 5 Mo).
 * @returns `{ ok: true }` si la candidature est **en base** (l'e-mail admin
 *   est best effort) ; sinon `invalid` (champs ou fichier absente /
 *   malformée), `too_large` (> 5 Mo), `bad_type` (extension ou MIME hors
 *   liste blanche), `rate_limited` (1 tentative envoyée / 60 s / IP) ou
 *   `failed` (lecture impossible / INSERT refusé). Codes bruts uniquement.
 */
export async function applyToJob(formData: FormData): Promise<ApplyToJobResult> {
  // 0. Garde d'entrée : un appel forgé peut transmettre n'importe quoi à la
  //    place du `FormData` — refus net avant tout accès aux méthodes.
  if (typeof formData !== "object" || formData === null || typeof formData.get !== "function") {
    return { ok: false, code: "invalid" };
  }

  // 1. Rate-limit — vérifié AVANT tout traitement (l'IP vient des en-têtes
  //    serveur, jamais du client).
  const now = Date.now();
  const ip = await resolveVisitorIp();
  if (isRateLimited(ip, now)) return { ok: false, code: "rate_limited" };

  // 2 → 5 : Zod → fichier → e-mail.
  const result = await processApplication(formData);

  // Consommation du quota : seules les tentatives qui ont réellement produit
  // un envoi (succès ou échec provider) comptent — un fichier refusé reste
  // corrigible et retirable sans attendre la fenêtre de 60 s.
  if (result.ok || result.code === "failed") recordRateSend(ip, now);
  return result;
}
