/**
 * Atheris — route Auth.js v5 (T03).
 *
 * Obligatoire : elle sert les endpoints `/api/auth/*` (session, callback,
 * signout…). C'est le SEUL fichier API créé par T03 — aucun autre endpoint.
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
