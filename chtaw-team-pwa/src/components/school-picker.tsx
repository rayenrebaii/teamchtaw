"use client";
import { useEffect, useId, useState } from "react";
import { studentSchoolsService } from "@/services/student-schools.service";
import type { Establishment } from "@/services/establishments.service";
import { useCopy } from "@/lib/i18n";
import { Button } from "./ui/button";

export function SchoolPicker({ value, onChange, proposed = "", onPropose, allowOther = false, disabled = false }: {
  value: string; onChange: (id: string) => void; proposed?: string; onPropose?: (name: string) => void; allowOther?: boolean; disabled?: boolean;
}) {
  const { t, error: failure } = useCopy();
  const id = useId();
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; items: Establishment[]; error?: string }>();
  useEffect(() => {
    let active = true;
    studentSchoolsService.official().then(items => { if (active) setResult({ revision, items }); }).catch(reason => { if (active) setResult({ revision, items: [], error: reason instanceof Error ? reason.message : "Chargement impossible." }); });
    return () => { active = false; };
  }, [revision]);
  const loading = result?.revision !== revision;
  const items = result?.items ?? [];
  const visible = items.filter(item => item.id === value || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="form-stack">
    <label htmlFor={`${id}-search`}>{t("Rechercher un établissement")}</label>
    <input id={`${id}-search`} type="search" value={query} maxLength={120} disabled={disabled || loading} onChange={event => setQuery(event.target.value)} placeholder={t("Nom du lycée")} />
    <label htmlFor={`${id}-select`}>{t("Établissement / Lycée")}</label>
    <select id={`${id}-select`} required value={value} onChange={event => onChange(event.target.value)} disabled={disabled || loading}>
      <option value="" disabled>{t("Choisissez votre établissement")}</option>
      {visible.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      {allowOther && <option value="OTHER">{t("Autre — mon établissement n’est pas dans la liste")}</option>}
    </select>
    {loading && <p role="status">{t("Chargement des établissements…")}</p>}
    {result?.error && <p role="alert" className="error">{failure(result.error)} <Button type="button" variant="secondary" size="sm" onClick={() => setRevision(revision + 1)}>{t("Réessayer")}</Button></p>}
    {!loading && !result?.error && !items.length && <p className="small muted">{t("Aucun établissement officiel disponible.")}</p>}
    {!loading && !result?.error && items.length > 0 && !visible.length && <p className="small muted">{t("Aucun établissement ne correspond à votre recherche.")}</p>}
    {value === "OTHER" && allowOther && <>
      <label htmlFor={`${id}-proposed`}>{t("Nom du lycée proposé")}</label>
      <input id={`${id}-proposed`} required maxLength={120} value={proposed} disabled={disabled} onChange={event => onPropose?.(event.target.value)} />
      <p className="small muted">{t("Votre proposition sera examinée séparément par l’administrateur.")}</p>
    </>}
  </div>;
}
