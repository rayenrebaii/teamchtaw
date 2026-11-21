"use client";
import { useEffect, useId, useRef, useState } from "react";
import { studentSchoolsService } from "@/services/student-schools.service";
import type { Establishment } from "@/services/establishments.service";
import { useCopy } from "@/lib/i18n";
import { Button } from "./ui/button";

export function SchoolPicker({ value, onChange, proposed = "", onPropose, allowOther = false, disabled = false, variant = "default", validationError = "" }: {
  value: string; onChange: (id: string) => void; proposed?: string; onPropose?: (name: string) => void; allowOther?: boolean; disabled?: boolean; variant?: "default" | "registration"; validationError?: string;
}) {
  const { t: translated, error: translatedFailure } = useCopy();
  const registration = variant === "registration";
  const t = translated;
  const failure = translatedFailure;
  const id = useId();
  const fields = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; items: Establishment[]; error?: string }>();
  useEffect(() => {
    let active = true;
    studentSchoolsService.official().then(items => { if (active) setResult({ revision, items }); }).catch(reason => { if (active) setResult({ revision, items: [], error: reason instanceof Error ? reason.message : "Chargement impossible." }); });
    return () => { active = false; };
  }, [revision]);
  const loading = result?.revision !== revision;
  useEffect(() => {
    if (validationError && !loading) fields.current?.querySelector<HTMLElement>(value === "OTHER" ? "input" : "select")?.focus();
  }, [validationError, loading, value]);
  const items = result?.items ?? [];
  const visible = items.filter(item => item.id === value || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="form-stack" ref={fields}>
    {!registration && <><label htmlFor={`${id}-search`}>{t("Rechercher un établissement")}</label>
    <input id={`${id}-search`} type="search" value={query} maxLength={120} disabled={disabled || loading} onChange={event => setQuery(event.target.value)} placeholder={t("Nom du lycée")} />
    </>}
    <label htmlFor={`${id}-select`}>{t(registration ? "Lycée" : "Établissement / Lycée")}</label>
    <select id={`${id}-select`} required value={value} title={items.find(item => item.id === value)?.name} aria-invalid={validationError && value !== "OTHER" ? true : undefined} aria-describedby={validationError ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)} disabled={disabled || loading}>
      <option value="" disabled>{t(registration ? "Choisissez votre lycée" : "Choisissez votre établissement")}</option>
      {visible.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      {allowOther && <option value="OTHER">{t(registration ? "Autre — mon lycée n’est pas dans la liste" : "Autre — mon établissement n’est pas dans la liste")}</option>}
    </select>
    {loading && <p role="status">{t("Chargement des établissements…")}</p>}
    {result?.error && <p role="alert" className="error">{failure(result.error)} <Button type="button" variant="secondary" size="sm" onClick={() => setRevision(revision + 1)}>{t("Réessayer")}</Button></p>}
    {!loading && !result?.error && !items.length && <p className="small muted">{t("Aucun établissement officiel disponible.")}</p>}
    {!loading && !result?.error && items.length > 0 && !visible.length && <p className="small muted">{t("Aucun établissement ne correspond à votre recherche.")}</p>}
    {value === "OTHER" && allowOther && <>
      <label htmlFor={`${id}-proposed`}>{t(registration ? "Nom de votre lycée" : "Nom du lycée proposé")}</label>
      <input id={`${id}-proposed`} required maxLength={120} value={proposed} disabled={disabled} aria-invalid={validationError ? true : undefined} aria-describedby={validationError ? `${id}-error` : undefined} onChange={event => onPropose?.(event.target.value)} />
      <p className="small muted">{t("Votre proposition sera examinée séparément par l’administrateur.")}</p>
    </>}
    {validationError && <p id={`${id}-error`} role="alert" className="error">{t(validationError)}</p>}
  </div>;
}
