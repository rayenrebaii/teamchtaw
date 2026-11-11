"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { messagesService } from "@/services/messages.service";
import { pollsService } from "@/services/polls.service";
import { useCopy } from "@/lib/i18n";
import { attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import type { Message, Poll } from "@/types";
import styles from "./message-actions.module.css";

function MessageActionMenu({ id, open: controlledOpen, onOpenChange, onDelete, includePoll }: {
  id: string; open?: boolean; onOpenChange?: (open: boolean) => void;
  onDelete: (target: "message" | "poll") => void; includePoll: boolean;
}) {
  const { t } = useCopy();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const change = onOpenChange ?? setLocalOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const bounds = menu.current.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12)),
      top: Math.max(12, Math.min(anchor.top >= bounds.height + 20 ? anchor.top - bounds.height - 8 : anchor.bottom + 8, window.innerHeight - bounds.height - 12)),
    });
    menu.current.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) change(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        change(false); trigger.current?.focus({ preventScroll: true });
      }
    };
    const dismiss = () => change(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open, change]);
  return <span className={styles.actions} data-message-actions>
    <button id={id} ref={trigger} type="button" className={styles.trigger} aria-label={t("Actions du message")}
      title={t("Actions du message")} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id + "-menu" : undefined}
      onClick={() => change(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); change(true); } }}>
      <MoreHorizontal size={18} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={id + "-menu"} className={styles.menu} role="menu" aria-label={t("Actions du message")}
      style={position} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      <button type="button" role="menuitem" className={styles.item} onClick={() => { change(false); onDelete("message"); }}>
        <Trash2 size={16} aria-hidden="true" />{t("Supprimer le message")}
      </button>
      {includePoll && <button type="button" role="menuitem" className={styles.item} onClick={() => { change(false); onDelete("poll"); }}>
        <Trash2 size={16} aria-hidden="true" />{t("Supprimer le sondage")}
      </button>}
    </div>, document.body)}
  </span>;
}

export function DeleteContent({ poll, message, menuOpen, onMenuOpenChange }: {
  poll?: Poll; message?: Message; menuOpen?: boolean; onMenuOpenChange?: (open: boolean) => void;
}) {
  const store = useCommunity();
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<"message" | "poll">(poll && !message ? "poll" : "message");
  const triggerId = useId();
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const allowed = actor?.role === "ADMIN" || (!!poll && actor?.role === "COLLABORATOR" && poll.authorId === actor.id);
  if (!allowed || (!poll && !message)) return null;
  const deletingPoll = target === "poll";
  const contextual = !!message && actor?.role === "ADMIN";
  const label = t(deletingPoll ? "Supprimer le sondage" : "Supprimer le message");
  return <>
    {contextual ? <MessageActionMenu id={triggerId} open={menuOpen} onOpenChange={onMenuOpenChange} includePoll={!!poll} onDelete={(action) => { setTarget(action); setOpen(true); }} /> :
    <Button id={triggerId} size="sm" variant="destructive" aria-label={poll ? `${label} : ${poll.question}` : label} onClick={() => setOpen(true)}>
      <Trash2 size={14} aria-hidden="true" />{label}
    </Button>}
    {open && <Modal open title={label} onClose={() => {
      if (!busy) { setOpen(false); requestAnimationFrame(() => document.getElementById(triggerId)?.focus()); }
    }}>
      {deletingPoll && poll && <p><strong>{poll.question}</strong></p>}
      <p>{t(deletingPoll && poll?.type === "SESSION"
        ? "Suppression possible jusqu’à deux heures avant le premier créneau, ou après la fin de tous les créneaux et la validation de toutes les présences. Les présences, absences et leur historique seront conservés."
        : deletingPoll ? "Le sondage et ses votes seront définitivement supprimés." : "Ce message sera définitivement supprimé pour tous les membres du groupe.")}</p>
      <div className="row wrap">
        <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>{t("Annuler")}</Button>
        <Button variant="destructive" disabled={busy} onClick={async () => {
          if (busy) return;
          setBusy(true);
          const ok = await attempt(async () => {
            if (deletingPoll && poll) { await pollsService.remove(poll.id); store.removePoll(poll.id); }
            else if (message) { await messagesService.remove(message.groupId, message.id); store.removeMessage(message.id); }
          }, t(deletingPoll ? "Sondage supprimé." : "Message supprimé."));
          setBusy(false);
          if (ok) setOpen(false);
        }}>{t(busy ? "Suppression…" : "Confirmer la suppression")}</Button>
      </div>
    </Modal>}
  </>;
}
