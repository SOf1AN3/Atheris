"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { clientMarkThreadRead, clientPostMessage } from "@/actions/client";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props (sérialisables : labels résolus server-side, dates pré-formatées,
// `currentUserId` = uuid string du client connecté — jamais un objet Date).
// ---------------------------------------------------------------------------

/** Un message du fil, adapté depuis `MessageItem` (frontière RSC). */
export type ThreadMessageView = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  /** `statuses.role[senderRole]` résolu côté serveur. */
  senderRoleLabel: string;
  /** `createdAt` formaté côté serveur (`Africa/Algiers`). */
  createdAtLabel: string;
  /** `readAt === null` — pastille « Non lus » (le serveur ne marque que les reçus). */
  unread: boolean;
};

/** Libellés i18n requis, tous en chaînes (sérialisables). */
export type ThreadLabels = {
  /** `client.messages` — titre de section (visuellement caché sous l'onglet). */
  title: string;
  /** `client.messagePlaceholder` — placeholder du Textarea. */
  placeholder: string;
  /** `client.send` — bouton d'envoi. */
  send: string;
  /** `common.loading` — libellé pendant l'envoi. */
  loading: string;
  /** `client.emptyMessages` — état vide du fil. */
  empty: string;
  /** `common.retry` — toast d'échec d'envoi. */
  retry: string;
  /** `client.unread` — pastille de message non lu. */
  unread: string;
};

type ThreadProps = {
  projectId: string;
  currentUserId: string;
  messages: ThreadMessageView[];
  labels: ThreadLabels;
};

/** Longueur maximale du corps d'un message (miroir du Zod serveur : 2000). */
const MAX_BODY_LENGTH = 2000;

/** Initiales typographiques d'un expéditeur (DESIGN §4.8). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts[1]?.charAt(0) ?? "";
  const result = `${first}${second}`.toUpperCase();
  return result.length > 0 ? result : "?";
}

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

export function Thread({
  projectId,
  currentUserId,
  messages,
  labels,
}: ThreadProps): ReactNode {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Ref de la fin du fil : recentrage après envoi (jamais avant le mount).
  const endRef = useRef<HTMLDivElement | null>(null);
  const hasSentRef = useRef(false);

  // Marquage en lecture à l'ouverture de l'onglet (fire-and-forget :
  // idempotent, aucun toast ni état d'erreur — un échec silencieux laisse les
  // pastilles visibles, comportement correct).
  useEffect(() => {
    void clientMarkThreadRead({ projectId }).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (hasSentRef.current) {
      hasSentRef.current = false;
      endRef.current?.scrollIntoView({ block: "nearest" });
    }
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || isSending) return;

    setIsSending(true);
    try {
      const result = await clientPostMessage({ projectId, body });
      if (result.ok) {
        setDraft("");
        hasSentRef.current = true;
        // Re-fetch RSC : le message apparaît (et repasse « lu » côté autre).
        router.refresh();
        return;
      }
      toast.error(labels.retry);
    } catch {
      // Erreur d'infra (action propagée en 500) : message générique.
      toast.error(labels.retry);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section aria-labelledby="thread-title" className="flex flex-col gap-4">
      <h2 id="thread-title" className="sr-only">
        {labels.title}
      </h2>

      {messages.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[15px] text-muted">
          {labels.empty}
        </p>
      ) : (
        <ol className="flex max-h-[480px] flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-4">
          {messages.map((message) => {
            const isMine = message.senderId === currentUserId;
            return (
              <li
                key={message.id}
                className={cn("flex items-start gap-3", isMine && "flex-row-reverse")}
              >
                {/* Avatar typographique (initiales) — décoratif au regard du
                    lecteur d'écran, le nom est déjà porté par le texte. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold",
                    isMine
                      ? "border-line bg-surface-2 text-muted"
                      : "border-line bg-surface text-fg",
                  )}
                >
                  {initialsOf(message.senderName)}
                </span>

                <div
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1 rounded-xl border border-line px-4 py-3 md:max-w-[70%]",
                    isMine ? "items-end bg-surface-2" : "items-start bg-surface",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="font-semibold text-fg">{message.senderName}</span>
                    <span className="text-muted">{message.senderRoleLabel}</span>
                    {/* DESIGN §6.5 : faint (4,1:1) interdit sur la date du
                        message (info) → muted. */}
                    <span className="text-muted">{message.createdAtLabel}</span>
                    {/* Pastille « Non lus » : messages REÇUS non encore lus. */}
                    {message.unread ? (
                      <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                        {labels.unread}
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">
                    {message.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={endRef} aria-hidden="true" />

      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <label htmlFor="thread-body" className="sr-only">
          {labels.placeholder}
        </label>
        <Textarea
          id="thread-body"
          value={draft}
          maxLength={MAX_BODY_LENGTH}
          placeholder={labels.placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isSending || draft.trim().length === 0}
          >
            {isSending ? labels.loading : labels.send}
          </Button>
        </div>
      </form>
    </section>
  );
}
