/**
 * Atheris — augmentations de types Auth.js v5 (T03).
 *
 * MÉCANIQUE (vérifiée empiriquement avec `tsc` sur next-auth@5.0.0-beta.32) :
 * les interfaces vivent dans `@auth/core/types` (Session/User) et
 * `@auth/core/jwt` (JWT) ; `next-auth` ne les re-exporte que. Or l'augmentation
 * d'un module re-exporteur ne fusionne PAS systématiquement avec la
 * déclaration d'origine (constaté pour `User` et `JWT`, contrairement à
 * `Session`). On déclare donc chaque interface aux DEUX endroits, avec des
 * propriétés strictement identiques :
 * - si les deux spécificateurs résolvent vers la même interface → fusion
 *   identique autorisée par TS (pas de TS2717) ;
 * - s'ils restent distincts → chaque « vue » du type est complète.
 *
 * `Role` et `UserStatus` sont **dérivés du schéma Drizzle** (`roleEnum` /
 * `userStatusEnum`) : source de vérité unique, aucune redéclaration qui
 * pourrait dériver si un rôle est ajouté en DB.
 */

import type { DefaultSession } from "next-auth";
import type { roleEnum, userStatusEnum } from "@/lib/db/schema";

/** Rôle d'un compte, dérivé de l'enum PostgreSQL `role` (schéma Drizzle). */
export type Role = (typeof roleEnum.enumValues)[number];

/** Statut d'un compte, dérivé de l'enum PostgreSQL `user_status`. */
export type UserStatus = (typeof userStatusEnum.enumValues)[number];

/** Shape enrichie de `session.user` — identique dans les 2 blocs Session. */
type SessionUser = {
  /** uuid `users.id`, injecté par le callback `session` (src/auth.ts). */
  id: string;
  /** Rôle DB, injecté au login — requis pour les gardes de rôle (T07+). */
  role: Role;
  /** Statut DB — requis par la re-vérification `active` en T07. */
  status: UserStatus;
  /** Nom du compte, toujours présent en DB (`users.name NOT NULL`). */
  name: string;
} & DefaultSession["user"];

declare module "next-auth" {
  interface Session {
    /** Enrichi de id/role/name par le callback `session` — voir SessionUser. */
    user: SessionUser;
  }

  interface User {
    /** uuid `users.id`, injecté par le callback `jwt` au login. */
    id: string;
    /** Rôle DB, injecté au login — requis pour les gardes de rôle (T07+). */
    role: Role;
    /** Statut DB (`active` garanti par `authorize`). */
    status: UserStatus;
  }
}

declare module "@auth/core/types" {
  interface Session {
    /** Enrichi de id/role/name par le callback `session` — voir SessionUser. */
    user: SessionUser;
  }

  interface User {
    /** uuid `users.id`, injecté par le callback `jwt` au login. */
    id: string;
    /** Rôle DB, injecté au login — requis pour les gardes de rôle (T07+). */
    role: Role;
    /** Statut DB (`active` garanti par `authorize`). */
    status: UserStatus;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** uuid `users.id` (alias explicite de `sub`, lisible côté middleware). */
    id: string;
    /** Rôle DB copié du `user` vérifié à la création du jeton. */
    role: Role;
    /** Statut DB copié du `user` vérifié (ex. re-vérifier `active`). */
    status: UserStatus;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    /** uuid `users.id` (alias explicite de `sub`, lisible côté middleware). */
    id: string;
    /** Rôle DB copié du `user` vérifié à la création du jeton. */
    role: Role;
    /** Statut DB copié du `user` vérifié (ex. re-vérifier `active`). */
    status: UserStatus;
  }
}
