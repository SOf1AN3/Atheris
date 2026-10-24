/**
 * Atheris — helpers **purs** de documents PDF (T25 · BK-5).
 *
 * Module 100 % pur : aucune import DB ni auth (Buffer + fonctions natives
 * uniquement) → utilisable depuis les Server Actions, les Route Handlers et
 * les tests unitaires, sans accès à `DATABASE_URL`.
 *
 * RÔLE : ce module est le **générique** des PDF de la plateforme (upload puis
 * téléchargement via `/api/documents/[id]`). ⚠ Duplication assumée et
 * documentée : `createQuote` (BK-4, `src/actions/quotes.ts`) possède SON
 * propre décodeur `decodePdfBase64` — refactor à réaliser en fin de plan
 * (décision Lead), ce fichier n'est PAS modifié pour autant.
 *
 * Garde-fous :
 * - `validatePdf` — base64 strict, taille ≤ 5 Mo, magic bytes `%PDF` ;
 * - `sanitizeFilename` — anti-path traversal + extension `.pdf` forcée ;
 * - `documentDisposition` — en-tête RFC 5987 (fallback ASCII sûr contre les
 *   injections d'en-tête : aucun CR/LF ni guillemet dans le fallback).
 */

/** Limite octets d'un PDF stocké : 5 Mo (contrainte applicative `documents.byte_size`). */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/**
 * Résultat d'une validation de PDF : octets prêts à stocker, ou **code brut**
 * de refus (jamais de message — la traduction vit côté client, T09).
 *
 * - `invalid_base64` — charset base64 illisible (ou décodage en échec) ;
 * - `empty` — rien après décodage (fichier vide) ;
 * - `too_large` — plus de 5 Mo ;
 * - `not_pdf` — les 4 premiers octets ne valent pas `%PDF`.
 */
export type PdfValidation =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "not_pdf" | "too_large" | "empty" | "invalid_base64" };

/** Magic bytes PDF : les 4 premiers octets décodés doivent valoir `%PDF`. */
const PDF_MAGIC = "%PDF";

/**
 * Décode et contrôle un PDF encodé en base64 — **avant** toute persistance.
 *
 * Contrôles, dans l'ordre :
 * 1. charset base64 strict (un `Buffer.from` « tolérant » tronquerait
 *    silencieusement la chaîne) → `invalid_base64` ;
 * 2. décodage (exception défensive) → `invalid_base64` ;
 * 3. octets vides → `empty` ;
 * 4. octets > `MAX_DOCUMENT_BYTES` (5 Mo) → `too_large` ;
 * 5. magic bytes `%PDF` sur les 4 premiers octets → sinon `not_pdf`.
 *
 * @param base64 Base64 **pur** — un préfixe `data:…;base64,` doit être retiré
 *   par l'appelant (il est rejeté en `invalid_base64`).
 * @returns Les octets du PDF, ou la raison du refus (code brut).
 *
 * @example
 * const v = validatePdf(base64);
 * if (!v.ok) return { ok: false, code: "invalid" };
 * // v.bytes : Buffer ≤ 5 Mo commencé par "%PDF"
 */
export function validatePdf(base64: string): PdfValidation {
  // 1. Charset strict — whitespace admis (retournes de ligne JSON/HTTP).
  const clean = base64.replace(/\s+/g, "");
  if (clean.length > 0 && !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    return { ok: false, reason: "invalid_base64" };
  }

  // 2. Décodage — `Buffer.from` ne lève presque jamais, d'où le try/catch.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(clean, "base64");
  } catch {
    return { ok: false, reason: "invalid_base64" };
  }

  // 3. Vide (chaîne vide ou décodage sans octet).
  if (bytes.length === 0) return { ok: false, reason: "empty" };

  // 4. Plafond 5 Mo — contrôle EXACT (la chaîne peut être longue sans être
  //    un fichier valide : la limite se juge sur les octets décodés).
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: "too_large" };

  // 5. Magic bytes PDF.
  if (bytes.subarray(0, 4).toString("latin1") !== PDF_MAGIC) {
    return { ok: false, reason: "not_pdf" };
  }

  return { ok: true, bytes };
}

/**
 * Nettoie un nom de fichier **avant** stockage en base (`documents.filename`).
 *
 * Règles :
 * - **anti-path** : seul le dernier segment est conservé (aucun `/` ni `\` ne
 *   survit → ni `../`, ni chemin absolu Windows/Unix) ;
 * - **charset** : lettres, chiffres, `.`, `-`, `_` uniquement — tout le reste
 *   (espaces, accents, emoji, caractères de contrôle) → `_` ;
 * - **anti-`..`** : les séries de points sont réduites à un point simple et
 *   les points de tête/queue retirés (pas de fichier caché) ;
 * - **extension forcée `.pdf`** : une éventuelle extension existante est
 *   retirée puis `.pdf` ré-ajouté (fonction idempotente) ;
 * - **≤ 100 caractères** au total (`.pdf` compris), jamais vide (repli
 *   `document.pdf`).
 *
 * @param name Nom de fichier d'origine (peu importe ce qu'il contient).
 * @returns Un nom de fichier sûr, toujours terminé par `.pdf`.
 *
 * @example
 * sanitizeFilename("../../etc/passwd");   // "passwd.pdf"
 * sanitizeFilename("Devis Rayan v2.docx"); // "Devis_Rayan_v2.pdf"
 */
export function sanitizeFilename(name: string): string {
  // Anti-path : on ne garde que le dernier segment (séparateur / ou \).
  const lastSegment = name.split(/[\\/]/).pop() ?? "";

  // Charset autorisé → tout le reste remplacement par "_" (séparateurs de
  // mots conservés visuellement : "mon fichier" → "mon_fichier").
  const cleaned = lastSegment
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".") // ".." → "." (anti-traversal)
    .replace(/^\.+/, "") // points de tête (fichiers cachés)
    .replace(/\.+$/, ""); // points de queue

  // Extension retirée si un point sépare un corps non vide ("v2.1" → "v2").
  const dotIndex = cleaned.lastIndexOf(".");
  const stem = dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned;

  // Coupe à 96 car. + ".pdf" = 100 car. max, points de queue retirés (une
  // troncature peut retomber sur un point), repli si tout a disparu.
  const truncated = stem.slice(0, 100 - ".pdf".length).replace(/\.+$/, "");
  const base = truncated.length > 0 ? truncated : "document";
  return `${base}.pdf`;
}

/**
 * Construit l'en-tête `Content-Disposition` d'un téléchargement (RFC 6266 +
 * RFC 5987) :
 * - `filename="…"` : fallback ASCII (tous les octets hors 7 bits → `_`, les
 *   guillemets/antislash exclus, CR/LF supprimés → **aucune injection
 *   d'en-tête** possible) ;
 * - `filename*=UTF-8''…` : nom réel percent-encodé (les caractères `'`, `*`,
 *   `(`, `)`, `!` sont interdits dans `attr-char` et encodés à la main).
 *
 * @param filename Nom déjà passé par `sanitizeFilename` (défense en profondeur
 *   : fonction utilisable avec n'importe quelle chaîne).
 * @returns La valeur complète de l'en-tête `Content-Disposition`.
 *
 * @example
 * documentDisposition("Devis_Rayan.pdf");
 * // 'attachment; filename="Devis_Rayan.pdf"; filename*=UTF-8''Devis_Rayan.pdf'
 */
export function documentDisposition(filename: string): string {
  // Repli : jamais d'en-tête vide (RFC 6266 exige un nom non vide).
  const source = filename.length > 0 ? filename : "document.pdf";

  // Fallback ASCII : contrôle (CR/LF) puis hors 7 bits → "_", guillemet et
  // antislash retirés (séparateur de champs et échappement interdits).
  const ascii = source
    .replace(/[\u0000-\u001F\u007F]/g, "_")
    .replace(/[^\u0020-\u007E]/g, "_")
    .replace(/["\\]/g, "_");

  // RFC 5987 : percent-encoding UTF-8, puis encodage manuel des caractères
  // `!'()*` que `encodeURIComponent` laisse passer mais qu'`attr-char` refuse.
  const encoded = encodeURIComponent(source).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
