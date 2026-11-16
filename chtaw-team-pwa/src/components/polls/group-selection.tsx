"use client";
import type { Group } from "@/types";
import styles from "./group-selection.module.css";

export function GroupSelection({ groups, value, onChange, fixedId }: {
  groups: Group[]; value: string[]; onChange: (ids: string[]) => void; fixedId?: string;
}) {
  return <div className={styles.selection}>{groups.map(group => <label className={styles.choice} key={group.id}>
    <input type="checkbox" checked={value.includes(group.id)} disabled={group.id === fixedId}
      onChange={event => onChange(event.target.checked ? [...value, group.id] : value.filter(id => id !== group.id))} />
    <span>{group.name}</span>
  </label>)}</div>;
}
