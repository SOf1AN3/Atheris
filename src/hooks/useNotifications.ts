"use client";

/**
 * Hook client des notifications in-app (PLAN §FE-B · Lot 4) : compteur non-lues
 * + 20 dernières notifications, avec polling en arrière-plan et signalement des
 * nouveautés (toasts).
 *
 * ### Contrat consommé
 * - `GET /api/notifications` → `401` (déconnecté) ou
 *   `{ ok: true, unreadCount: number, items: NotificationItem[] }`
 *   (20 dernières, tri décroissant).
 * - `src/actions/notifications.ts` : `markAllNotificationsRead()` /
 *   `markNotificationsRead(ids)`.
 *
 * ### Cycle de vie (choix assumés, détaillés)
 * - **Fetch initial au montage** : `hydrated` ne passe à `true` qu'après le
 *   premier retour réseau `ok` (ou `401`/`403`). Tant que `hydrated === false`
 *   le badge ne doit **pas** être rendu → zéro mismatch d'hydratation RSC/client.
 *   Une erreur réseau laisse `hydrated` à `false` : le prochain poll réessaie,
 *   aucun badge mensonger n'est affiché entre-temps.
 * - **Polling 35 s** (`setInterval`) : en pause si l'onglet est masqué
 *   (`document.visibilityState === "hidden"` → l'intervalle est détruit) et
 *   relancé avec un **re-fetch immédiat** au retour (`visibilitychange` →
 *   `visible`). Nettoyage complet au démontage (intervalle + listener).
 * - **`401` / `403`** : polling arrêté **définitivement** (`status: "stopped"`),
 *   compteur et items remis à zéro — la session est expirée, re-demander ne
 *   servirait à rien.
 * - **Nouveautés (toasts)** : un `Set` d'id est initialisé au **premier** retour
 *   (aucun toast sur l'historique déjà existant) ; aux polls suivants, un item
 *   inconnu du `Set` ET postérieur à la date de montage déclenche
 *   `onNew(item)` — puis il rejoint le `Set` : jamais deux fois le même toast.
 * - **Mutations locales** : `markAll()` / `markRead(id)` appellent les Server
 *   Actions puis mettent à jour l'état **localement** (compteur + `readAt`),
 *   sans re-fetch obligatoire. Un échec serveur est silencieux (le poll suivant
 *   resynchronise).
 * - **Sécurité** : toute erreur réseau non-401/403 est silencieuse (on réessaiera
 *   au prochain poll) ; aucun `console`.
 *
 * ### Pourquoi pas `locale` en paramètre ?
 * Ni l'endpoint ni les actions ne prennent la locale, et tout le formatage
 * (phrases du dict, dates relatives `Intl.RelativeTimeFormat`) est décidé par
 * le composant qui rend les items (`NotificationsBell`). La locale n'apporterait
 * ici que du bruit : elle est portée par le composant, pas par le hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/actions/notifications";

// ---------------------------------------------------------------------------
// Contrat (`GET /api/notifications`).
// ---------------------------------------------------------------------------

/** Une notification telle que renvoyée par l'API (miroir du contrat backend). */
export type NotificationItem = {
  id: string;
  type: string;
  link: string;
  /** Métadonnées brutes de rendu (`actor`, `entity`, …), toutes des strings. */
  meta: Record<string, string>;
  /** Date de lecture ISO, `null` tant que non lue. */
  readAt: string | null;
  /** Date de création ISO. */
  createdAt: string;
};

/** Corps utile du retour `ok` de l'API (`ok` lui-même est ignoré). */
export type NotificationsResponse = {
  unreadCount: number;
  items: NotificationItem[];
};

/** État du service notifications pour la session courante. */
export type NotificationsStatus =
  /** Session invalide (`401`/`403`) : polling arrêté définitivement. */
  | "stopped"
  /** Mode nominal : fetch initial passé, polling actif (ou en pause d'onglet). */
  | "live";

export type UseNotificationsResult = {
  /**
   * `true` dès le premier retour réseau traité (succès **ou** 401/403).
   * Tant que `false`, `items`/`unreadCount` sont vides et le badge ne doit pas
   * être rendu (garde-fou anti mismatch d'hydratation).
   */
  hydrated: boolean;
  status: NotificationsStatus;
  /** Compteur serveur, mis à localement après `markAll`/`markRead` (jamais < 0). */
  unreadCount: number;
  /** 20 dernières notifications, tri décroissant (ordre serveur conservé). */
  items: NotificationItem[];
  /** Marque **toutes** les notifications comme lues (action + état local). */
  markAll: () => Promise<void>;
  /** Marque une notification comme lue (action + état local). */
  markRead: (id: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Garde de forme (le front n'a pas de schéma Zod pour cette route : on ne fait
// que confirmer la forme du contrat avant de la typer, sans `any` ni cast).
// ---------------------------------------------------------------------------

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isNotificationItem(value: unknown): value is NotificationItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "type" in value &&
    typeof value.type === "string" &&
    "link" in value &&
    typeof value.link === "string" &&
    "meta" in value &&
    isRecordOfStrings(value.meta) &&
    "readAt" in value &&
    (value.readAt === null || typeof value.readAt === "string") &&
    "createdAt" in value &&
    typeof value.createdAt === "string"
  );
}

function isNotificationsResponse(
  value: unknown,
): value is NotificationsResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "unreadCount" in value &&
    typeof value.unreadCount === "number" &&
    "items" in value &&
    Array.isArray(value.items) &&
    value.items.every((entry: unknown) => isNotificationItem(entry))
  );
}

// ---------------------------------------------------------------------------
// Fetch.
// ---------------------------------------------------------------------------

/** `35 000 ms` — cadence de rafraîchissement du compteur (Lot 4). */
const POLL_INTERVAL_MS = 35_000;

type Snapshot = { items: NotificationItem[]; unreadCount: number };

type FetchOutcome =
  | { kind: "ok"; snapshot: Snapshot }
  /** `401` ou `403` : session expirée / refusée. */
  | { kind: "unauthorized" }
  /** Erreur réseau, statut inattendu ou corps illisible → retry au poll suivant. */
  | { kind: "error" };

async function fetchSnapshot(): Promise<FetchOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/notifications", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "error" };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "unauthorized" };
  }
  if (!response.ok) {
    return { kind: "error" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "error" };
  }
  if (!isNotificationsResponse(payload)) {
    return { kind: "error" };
  }

  return {
    kind: "ok",
    snapshot: {
      items: payload.items,
      unreadCount: Math.max(0, payload.unreadCount),
    },
  };
}

// ---------------------------------------------------------------------------
// Hook.
// ---------------------------------------------------------------------------

/**
 * État + actions des notifications de l'espace connecté (voir JSDoc de module
 * pour le cycle de vie complet).
 *
 * @param onNew Invoquée pour chaque notification **nouvelle** (postérieure au
 *   montage, jamais vue auparavant). Stockée dans une ref : son identité peut
 *   changer d'un render à l'autre sans jamais réinitialiser le polling ni le
 *   `Set` de nouveautés.
 */
export function useNotifications(
  onNew?: (item: NotificationItem) => void,
): UseNotificationsResult {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<NotificationsStatus>("live");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    items: [],
    unreadCount: 0,
  });

  /** Callback de nouveauté la plus récente (pattern « latest ref »). */
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  /** Id déjà vus depuis le premier retour — `null` = pas encore initialisé. */
  const seenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    /** Date de montage (ms) : toute notif plus récente est une nouveauté. */
    const mountedAt = Date.now();

    let disposed = false;
    /** `401`/`403` reçu : plus aucun fetch. */
    let unauthorized = false;
    let timer: number | undefined;

    /** Applique un snapshot + déclenche `onNew` pour les items inconnus. */
    const applySnapshot = (next: Snapshot): void => {
      const seen = seenIdsRef.current;
      if (seen === null) {
        // Premier retour : on reference l'existant SANS toaster.
        seenIdsRef.current = new Set(next.items.map((item) => item.id));
      } else {
        for (const item of next.items) {
          if (seen.has(item.id)) {
            continue;
          }
          seen.add(item.id);
          const createdMs = new Date(item.createdAt).getTime();
          if (!Number.isNaN(createdMs) && createdMs > mountedAt) {
            onNewRef.current?.(item);
          }
        }
      }
      setSnapshot(next);
    };

    const stop = (): void => {
      unauthorized = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
      setStatus("stopped");
      setSnapshot({ items: [], unreadCount: 0 });
      setHydrated(true);
    };

    const load = async (): Promise<void> => {
      if (unauthorized) {
        return;
      }
      const outcome = await fetchSnapshot();
      if (disposed || unauthorized) {
        return;
      }
      if (outcome.kind === "unauthorized") {
        stop();
        return;
      }
      if (outcome.kind === "error") {
        // Silencieux : on réessaiera au prochain tick (prochain poll /
        // prochain retour d'onglet visible).
        return;
      }
      applySnapshot(outcome.snapshot);
      setHydrated(true);
      setStatus("live");
    };

    const schedule = (): void => {
      if (unauthorized) {
        return;
      }
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      timer = window.setInterval(() => {
        void load();
      }, POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = (): void => {
      if (disposed || unauthorized) {
        return;
      }
      if (document.visibilityState === "hidden") {
        // Onglet masqué : on détruit l'intervalle (zéro requête inutile).
        if (timer !== undefined) {
          window.clearInterval(timer);
          timer = undefined;
        }
        return;
      }
      // Retour au premier plan : re-fetch immédiat + redémarrage du rythme.
      void load();
      schedule();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible") {
      schedule();
    }
    void load();

    return () => {
      disposed = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const markAll = useCallback(async (): Promise<void> => {
    const result = await markAllNotificationsRead();
    if (!result.ok) {
      return;
    }
    const readAtIso = new Date().toISOString();
    setSnapshot((prev) => ({
      unreadCount: 0,
      items: prev.items.map((item) =>
        item.readAt === null ? { ...item, readAt: readAtIso } : item,
      ),
    }));
  }, []);

  const markRead = useCallback(async (id: string): Promise<void> => {
    const result = await markNotificationsRead([id]);
    if (!result.ok) {
      return;
    }
    const readAtIso = new Date().toISOString();
    setSnapshot((prev) => {
      const target = prev.items.find((item) => item.id === id);
      // Déjà lu ou inconnu (hors fenêtre des 20) : rien à changer côté local.
      if (!target || target.readAt !== null) {
        return prev;
      }
      return {
        unreadCount: Math.max(0, prev.unreadCount - 1),
        items: prev.items.map((item) =>
          item.id === id ? { ...item, readAt: readAtIso } : item,
        ),
      };
    });
  }, []);

  return {
    hydrated,
    status,
    unreadCount: snapshot.unreadCount,
    items: snapshot.items,
    markAll,
    markRead,
  };
}
