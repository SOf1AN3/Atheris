/**
 * Atheris — hachage des mots de passe (T03 · PLAN.md §Sécurité).
 *
 * scrypt (Node crypto, zéro dépendance externe) :
 * - salt aléatoire 16 bytes par mot de passe (jamais réutilisé) ;
 * - coût N=16384, r=8, p=1 (recommandations OWASP / RFC 7914), keylen=64 ;
 * - format stocké `salt:hash` en hex (128 + 32 caractères) — le salt est
 *   stocké en clair par nature, il n'est PAS un secret ;
 * - coût mémoire = 128 × N × r = 16 Mo < maxmem par défaut (32 Mo) : aucun
 *   réglage `maxmem` requis.
 *
 * `verifyPassword` utilise `timingSafeEqual` (comparaison constant-time) et
 * renvoie systématiquement `false` sur un format stocké malformé — jamais
 * d'exception, pour que l'appelant (authorize) ne puisse pas être piloté par
 * les erreurs.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/** Paramètre de coût N de scrypt (2^14). */
const SCRYPT_N = 16384;
/** Paramètre de coût r (bloc size). */
const SCRYPT_R = 8;
/** Paramètre de coût p (parallélisme). */
const SCRYPT_P = 1;
/** Longueur de la clé dérivée, en bytes (512 bits). */
const KEY_LEN = 64;
/** Longueur du salt, en bytes (128 bits). */
const SALT_LEN = 16;

/**
 * Wrapper Promise autour de `crypto.scrypt` (callback-based).
 * Les erreurs (params invalides, mémoire insuffisante) rejettent la Promise ;
 * `verifyPassword` les convertit en `false`.
 */
function scryptAsync(plain: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      plain,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
}

/**
 * Hache un mot de passe en clair avec scrypt + salt aléatoire.
 *
 * @param plain Mot de passe en clair (jamais journalisé ni retourné).
 * @returns Le format stocké `"<salt hex>:<hash hex>"` prêt pour la colonne
 * `users.password_hash`.
 *
 * @example
 * const stored = await hashPassword("mon-mdp"); // "3f2a…:9c1b…"
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derivedKey = await scryptAsync(plain, salt);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Vérifie un mot de passe en clair contre un hash stocké (`salt:hash` hex).
 *
 * Toute entrée malformée (`stored` sans `:`, hex invalide, longueur de hash
 * incorrecte) renvoie `false` sans lever d'exception. La comparaison du hash
 * est constant-time (`timingSafeEqual`) ; le salt étant public, le temps de
 * dérivation n'a pas besoin d'être masqué.
 *
 * @param plain Mot de passe en clair soumis par l'utilisateur.
 * @param stored Format attendu `"<salt hex>:<hash hex>"` (colonne
 * `users.password_hash`).
 * @returns `true` si le mot de passe correspond, `false` sinon.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  // Buffer.from tolère un hex tronqué/invalides en silently truncating :
  // le contrôle de longueur est donc le vrai garde-fou de validité.
  if (salt.length === 0 || expected.length !== KEY_LEN) return false;

  let derivedKey: Buffer;
  try {
    derivedKey = await scryptAsync(plain, salt);
  } catch {
    // scrypt a échoué (params corrompus…) : traiter comme un échec de
    // vérification, pas comme une erreur 500 pilotable par le client.
    return false;
  }

  return timingSafeEqual(derivedKey, expected);
}
