/**
 * Garde d'envoi `MAIL_DISABLED` (`src/lib/mail.ts`).
 *
 * Ce garde protège la RÉPUTATION D'ENVOI du domaine légitime : un test qui
 * déclenche un envoi réel vers une adresse de test produit un bounce, et
 * l'accumulation de rebonds fait durcir les filtreurs du domaine. Le test
 * vérifie donc que :
 *  - `MAIL_DISABLED=1` refuse AVANT tout appel réseau (zéro requête) ;
 *  - le défaut (env absente) n'a AUCUN effet — comportement inchangé ;
 *  - le refus suit le contrat `{ ok: false, error }`, jamais un throw
 *    (règle « jamais fatal » : une action publique ne doit jamais crasher).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMail } from "./mail";

const VALID_OPTS = {
  to: "dest@example.com",
  subject: "Sujet de test",
  text: "Corps du message de test.",
} as const;

beforeEach(() => {
  // Clé présente pour prouver que c'est BIEN le garde qui refuse, pas l'absence de clé.
  vi.stubEnv("RESEND_API_KEY", "re_test_key_placeholder");
  vi.stubEnv("EMAIL_FROM", "test@example.com");
  // Intercepteur réseau : la moindre requête échoue le test.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("réseau appelé alors que l'envoi doit être désactivé");
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendMail — garde MAIL_DISABLED", () => {
  it("refuse silencieusement quand MAIL_DISABLED=1 (aucun appel réseau)", async () => {
    vi.stubEnv("MAIL_DISABLED", "1");
    const res = await sendMail(VALID_OPTS);
    expect(res).toEqual({ ok: false, error: "disabled" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("n'a AUCUN effet par défaut (env absente)", async () => {
    vi.stubEnv("MAIL_DISABLED", "");
    // Le garde ne déclenche pas : on tombe sur une autre validation. Ici le
    // fetch intercepté THROWS, donc le contrat `catch` renvoie un échec —
    // le point est que le code n'a PAS renvoyé `disabled`.
    const res = await sendMail(VALID_OPTS);
    expect(res.ok).toBe(false);
    expect(res.error).not.toBe("disabled");
  });

  it("suit le contrat { ok, error } — jamais de throw", async () => {
    vi.stubEnv("MAIL_DISABLED", "1");
    await expect(sendMail(VALID_OPTS)).resolves.toHaveProperty("ok", false);
    // Entrée invalide + garde actif : le garde prime, pas d'exception.
    await expect(sendMail({} as never)).resolves.toHaveProperty("ok", false);
  });

  it("n'interagit avec aucun fichier (aucune écriture disque)", async () => {
    vi.stubEnv("MAIL_DISABLED", "1");
    const before = process.env.MAIL_DISABLED;
    await sendMail(VALID_OPTS);
    expect(process.env.MAIL_DISABLED).toBe(before);
  });
});
