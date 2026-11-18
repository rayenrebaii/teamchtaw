"use client";
import { useId, useRef, useState } from "react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/shared";
import { useCopy } from "@/lib/i18n";
import type { MemberSummary } from "@/types";
import styles from "./mention-input.module.css";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function MentionInput({ value, onChange, members, loading, retry }: {
  value: string;
  onChange: (text: string, mentionIds: string[]) => void;
  members: MemberSummary[];
  loading?: boolean;
  retry?: () => void;
}) {
  const { t } = useCopy();
  const input = useRef<HTMLTextAreaElement>(null);
  const [chosen, setChosen] = useState(new Map<string, string>());
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const match = caret === null ? null : value.slice(0, caret).match(/(?:^|\s)@([^\n@]{0,60})$/u);
  const query = match?.[1];
  const completed = query !== undefined && (query.startsWith("tous ") || [...chosen.values()].some(name => query.startsWith(name + " ")));
  const options = query === undefined || completed ? [] : [
    ...(normalize("tous").includes(normalize(query)) ? [{ id: "all", name: "tous", member: undefined }] : []),
    ...members.filter(member => normalize(`${member.firstName} ${member.lastName}`).includes(normalize(query)))
      .map(member => ({ id: member.id, name: `${member.firstName} ${member.lastName}`, member })),
  ].slice(0, 20);
  const open = query !== undefined && !completed;
  const selected = Math.min(active, Math.max(0, options.length - 1));
  function update(text: string, choices = chosen) {
    onChange(text, [...choices].filter(([, name]) => text.includes("@" + name)).map(([id]) => id));
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || caret === null || query === undefined) return;
    const start = caret - query.length - 1;
    const insertion = "@" + option.name + " ";
    const text = value.slice(0, start) + insertion + value.slice(caret);
    if (text.length > 4000) return;
    const choices = new Map(chosen);
    if (option.member) choices.set(option.id, option.name);
    setChosen(choices);
    update(text, choices); setCaret(null); setActive(0);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  }
  return <div className={styles.wrapper}>
    {open && <div className={styles.popup}>
      <p className={styles.heading}>{t("Mentionner dans ce groupe")}</p>
      <ul id={listId} role="listbox" aria-label={t("Membres à mentionner")}>
        {options.map((option, index) => <li id={`${listId}-${index}`} key={option.id} role="option" aria-selected={index === selected}>
          <button type="button" tabIndex={-1} className={index === selected ? styles.active : ""}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
            <span aria-hidden="true">{option.member ? <Avatar user={option.member} size="small-avatar" /> : <span className="avatar small-avatar"><Users size={18} /></span>}</span>
            <span><strong>@{option.name}</strong>{option.id === "all" && <small>{t("Notifier tous les membres du groupe")}</small>}</span>
          </button>
        </li>)}
      </ul>
      {loading && <p role="status">{t("Chargement des membres…")}</p>}
      {!options.length && !loading && <p>{t("Aucun membre trouvé")}</p>}
      {retry && <button type="button" onClick={retry}>{t("Réessayer")}</button>}
    </div>}
    <textarea ref={input} rows={1} aria-label={t("Votre message")} placeholder={t("Un message pour la team…")} maxLength={4000}
      aria-autocomplete="list" aria-controls={open ? listId : undefined}
      aria-activedescendant={open && options.length ? `${listId}-${selected}` : undefined}
      value={value} onChange={event => { update(event.target.value); setCaret(event.target.selectionStart); setActive(0); }}
      onClick={event => { setCaret(event.currentTarget.selectionStart); setActive(0); }}
      onBlur={event => { if (!event.relatedTarget || !event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setCaret(null); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setCaret(null); return; }
        if (open && options.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length); return;
        }
        if (open && options.length && (event.key === "Enter" || event.key === "Tab")) { event.preventDefault(); choose(selected); return; }
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
      }} />
  </div>;
}
