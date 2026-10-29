"use client";

/**
 * Cloche de notifications de la topbar (PLAN §FE-B · Lot 4) : compteur
 * « non lues » + panneau déroulant des 20 dernières notifications, avec toasts
 * de nouveauté.
 *
 * Toute la logique de fetch/polling vit dans `useNotifications` — ce composant
 * ne fait que **rendre** l'état et **formater** les libellés :
 *
 * - **Phrase** = `labels.items[type] ?? labels.unknown`, avec remplacement
 *   **global** de `{{actor}}` / `{{entity}}` depuis `item.meta` ; une valeur
 *   absente de `meta` est remplacée par `""` puis les espaces doubles sont
 *   nettoyés (`"a  b"` → `"a b"`), jamais de placeholder résiduel.
 * - **Date relative** = `Intl.RelativeTimeFormat(locale, { numeric: "auto" })`
 *   calculée côté client (secondes / minutes / heures / jours) — AUCUNE clé de
 *   dict pour les dates, et recalculée à chaque ouverture du panneau.
 * - **Badge** : rendu **uniquement** si `hydrated === true` et `count > 0`
 *   (zéro mismatch d'hydratation, cf. hook) ; compteur plafonné à `9+`.
 *   ACCESSIBILITÉ : la pastille visuelle est `aria-hidden` (décorative) et le
 *   compte exact est annoncé par un équivalent `sr-only` portant
 *   `labels.unreadBadge` — résultat auditif « Cloche, 3 non lues », correct
 *   sémantiquement là qu'un `aria-label` posé sur un `<span>` neutre serait
 *   ignoré par les lecteurs d'écran.
 * - **Lien** : `item.link` est stocké **sans** locale → `prefixLocale()` préfixe
 *   `/${locale}` (restitue tel si un préfixe de locale est déjà présent).
 */

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  NotificationType,
  NotificationsContent,
} from "@/content/platform/types";
import { locales, type Locale } from "@/i18n/config";
import {
  useNotifications,
  type NotificationItem,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

/**
 * Libellés du panneau de notifications reçus en prop (`dict.notifications`).
 *
 * Alias du contrat dict livré (`NotificationsContent`) : **source de vérité
 * unique**, aucune structure dupliquée. Réutilisé par `AppShell` / `Topbar`
 * pour la chaîne de props.
 */
export type NotificationsLabels = NotificationsContent;

export type NotificationsBellProps = {
  /** Libellés du panneau — `dict.notifications`. */
  labels: NotificationsLabels;
  locale: Locale;
};

/** Préfixe de locale en tête de chemin (`/fr…`, `/en…`). */
const LOCALE_PREFIX = new RegExp(`^/(${locales.join("|")})(/|$)`);

/** Nombre max d'items rendus dans le panneau (l'API sert déjà les 20 derniers). */
const MAX_VISIBLE_ITEMS = 20;

/**
 * Ajoute `/${locale}` en tête d'un lien stocké **sans** locale
 * (`"/espace/prospects/x"` → `"/fr/espace/prospects/x"`). Un lien déjà préfixé
 * par une locale connue est restitué tel quel (idempotent).
 */
function prefixLocale(link: string, locale: Locale): string {
  if (LOCALE_PREFIX.test(link)) {
    return link;
  }
  return `/${locale}${link.startsWith("/") ? link : `/${link}`}`;
}

/**
 * Clés `NotificationType` connues côté client (miroir de l'union du dict) —
 * sert de type guard pour indexer `labels.items` sans `any` ni cast.
 */
const NOTIFICATION_TYPE_KEYS: readonly string[] = [
  "contact_received",
  "application_created",
  "interview_booked",
  "prospect_status_changed",
  "quote_signed",
  "project_message",
  "commission_due",
  "commission_paid",
  "milestone_validated",
  "account_activated",
  "reminder_due",
  "mail_failed",
];

/** Rétrécit une string vers une clé de `labels.items` (repli `unknown` sinon). */
function isNotificationType(value: string): value is NotificationType {
  return NOTIFICATION_TYPE_KEYS.includes(value);
}

/**
 * Assemble la phrase affichable d'une notification : gabarin du dict, puis
 * `{{actor}}` / `{{entity}}` remplacés **globalement** depuis `meta` (valeur
 * absente → `""`), nettoyage des espaces multiples en fin de chaîne.
 */
function renderPhrase(
  labels: NotificationsLabels,
  item: NotificationItem,
): string {
  const template = isNotificationType(item.type)
    ? labels.items[item.type]
    : labels.unknown;
  return template
    .replaceAll("{{actor}}", item.meta.actor ?? "")
    .replaceAll("{{entity}}", item.meta.entity ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Label accessible du badge « non lues » — `{{count}}` remplacé. */
function unreadBadgeLabel(labels: NotificationsLabels, count: number): string {
  return labels.unreadBadge.replace("{{count}}", String(count));
}

/**
 * Date relative via `Intl.RelativeTimeFormat` (aucune dict), arrondie vers
 * l'unité la plus pertinente : secondes (< 1 min) / minutes (< 1 h) /
 * heures (< 1 j) / jours. `now` est fourni en state pour recalculer à chaque
 * ouverture du panneau sans re-render permanent.
 */
function formatRelativeTime(
  iso: string,
  locale: Locale,
  now: number,
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const deltaMs = then - now;
  const absMs = Math.abs(deltaMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (absMs < 60_000) {
    return rtf.format(Math.round(deltaMs / 1000), "second");
  }
  if (absMs < 3_600_000) {
    return rtf.format(Math.round(deltaMs / 60_000), "minute");
  }
  if (absMs < 86_400_000) {
    return rtf.format(Math.round(deltaMs / 3_600_000), "hour");
  }
  return rtf.format(Math.round(deltaMs / 86_400_000), "day");
}

export function NotificationsBell({
  labels,
  locale,
}: NotificationsBellProps): ReactNode {
  const router = useRouter();

  /** Horloge de rendu des dates relatives : rafraîchie à chaque ouverture. */
  const [now, setNow] = useState<number>(() => Date.now());

  /**
   * Nouvelle notification détectée par le polling → toast sonner (déjà monté
   * par `AppShell`) avec action « Voir » qui mène à la page concernée.
   */
  const handleNew = useCallback(
    (item: NotificationItem): void => {
      toast(renderPhrase(labels, item), {
        action: {
          label: labels.view,
          onClick: () => router.push(prefixLocale(item.link, locale)),
        },
      });
    },
    [labels, locale, router],
  );

  const { hydrated, unreadCount, items, markAll, markRead } =
    useNotifications(handleNew);

  /**
   * L'horloge de rendu suit les ARRIVÉES : `setNow` n'était rafraîchie qu'à
   * l'ouverture du panneau, si bien qu'une notification créée pendant que le
   * panneau restait ouvert s'affichait en FUTUR (« dans 9 minutes » au lieu de
   * « il y a 9 minutes » — constaté en E2E). Le changement de l'item le plus
   * récent (arrivée ou premier rendu) repositionne `now` immédiatement.
   */
  const latestId = items[0]?.id ?? null;
  useEffect(() => {
    setNow(Date.now());
  }, [latestId]);

  /** Clic sur un item : marquage lecture (si non lu) + navigation. Radix ferme
   *  le menu automatiquement à la sélection (`onSelect`). */
  const handleSelect = useCallback(
    (item: NotificationItem): void => {
      if (item.readAt === null) {
        void markRead(item.id);
      }
      router.push(prefixLocale(item.link, locale));
    },
    [locale, markRead, router],
  );

  return (
    <DropdownMenu
      onOpenChange={(open): void => {
        if (open) {
          setNow(Date.now());
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={labels.open}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.04] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          {/* Cible tactile 44 px (h-11 × w-11), DESIGN §2.7. */}
          <Bell aria-hidden="true" className="h-5 w-5" />
          {hydrated && unreadCount > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-ink"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
              {/* Compte exact annoncé (voir JSDoc de module). */}
              <span className="sr-only">
                {unreadBadgeLabel(labels, unreadCount)}
              </span>
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        // Panneau = carte (§2.4) : rayon 20px, filet `line`. Largeur bornée
        // par le viewport pour tenir à 375 px (`calc(100vw - 2rem)`).
        className="w-[min(22rem,calc(100vw-2rem))] rounded-[20px] border-line"
      >
        <DropdownMenuLabel className="px-3 py-2 text-sm text-fg">
          {labels.title}
        </DropdownMenuLabel>
        {unreadCount > 0 ? (
          <DropdownMenuItem
            className="mx-1 min-h-11 text-[13px] font-semibold text-muted hover:bg-surface-2 focus:bg-surface-2"
            onSelect={() => void markAll()}
          >
            {labels.markAll}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            {labels.empty}
          </p>
        ) : (
          items.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="min-h-11 items-start gap-2 rounded-xl px-3 py-2 hover:bg-surface-2 focus:bg-surface-2"
              onSelect={() => handleSelect(item)}
            >
              {/* Pastille « non lue » — décorative, la distinction est aussi
                  portée par le gras (la couleur seule ne suffit pas). */}
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[7px] h-2 w-2 shrink-0 rounded-full",
                  item.readAt === null ? "bg-accent" : "bg-transparent",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-sm leading-snug",
                    item.readAt === null
                      ? "font-semibold text-fg"
                      : "text-muted",
                  )}
                >
                  {renderPhrase(labels, item)}
                </span>
                <span className="text-xs text-muted">
                  {formatRelativeTime(item.createdAt, locale, now)}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
