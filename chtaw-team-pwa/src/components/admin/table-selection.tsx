"use client";
import { useState, type ReactNode } from "react";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import styles from "./bulk-actions.module.css";

export function useTableSelection(scope: string) {
  const [state, setState] = useState({ scope, ids: [] as string[] });
  if (state.scope !== scope) setState({ scope, ids: [] });
  const ids = state.scope === scope ? state.ids : [];
  const toggle = (targets: string[], checked: boolean) => setState(previous => ({ scope,
    ids: checked ? [...new Set([...(previous.scope === scope ? previous.ids : []), ...targets])]
      : previous.ids.filter(id => !targets.includes(id)),
  }));
  return { ids, toggle, clear: () => setState({ scope, ids: [] }) };
}

export function PageSelection({ ids, selected, label, disabled, onChange }: {
  ids: string[]; selected: string[]; label: string; disabled?: boolean; onChange: (ids: string[], checked: boolean) => void;
}) {
  const count = ids.filter(id => selected.includes(id)).length;
  return <label className={styles.pageSelection}>
    <input className={styles.selection} type="checkbox" checked={!!ids.length && count === ids.length}
      ref={node => { if (node) node.indeterminate = count > 0 && count < ids.length; }}
      disabled={disabled || !ids.length} onChange={event => onChange(ids, event.target.checked)} />{label}
  </label>;
}

export function SelectionToolbar({ count, clear, busy = false, children }: { count: number; clear: () => void; busy?: boolean; children?: ReactNode }) {
  const { t } = useCopy();
  return <div className={styles.toolbar}>
    <div className="row between wrap">
      <strong role="status">{t("{count} sélectionné(s)", { count })}</strong>
      <div className="row wrap">{children}<Button size="sm" variant="ghost" disabled={busy || !count} onClick={clear}>{t("Effacer la sélection")}</Button></div>
    </div>
    <p className="small muted">{t("La sélection est conservée entre les pages et effacée lors d’un changement de filtre.")}</p>
  </div>;
}
