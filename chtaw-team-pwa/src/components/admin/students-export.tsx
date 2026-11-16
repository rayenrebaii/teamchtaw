"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/services/api-client";
import { currentLanguage, useCopy } from "@/lib/i18n";
import { Button } from "../ui/button";

export function StudentsExport() {
  const { t, error: failure } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function download() {
    if (busy) return;
    setBusy(true); setError(""); setDone(false);
    try {
      const file = await api.blob(`/admin/students/export?language=${currentLanguage()}`, "Export impossible. Veuillez réessayer.");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url; link.download = "chtaw-team-students.xlsx";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Export impossible. Veuillez réessayer."); }
    finally { setBusy(false); }
  }
  return <div className="form-stack">
    <Button disabled={busy} variant="secondary" title={t("Exporter tous les étudiants au format Excel")} onClick={() => void download()}>
      <Download size={16} aria-hidden="true" />{t(busy ? "Export en cours…" : "Exporter")}
    </Button>
    {error && <p role="alert" className="small error">{failure(error)}</p>}
    {done && <p role="status" className="small muted">{t("Export téléchargé.")}</p>}
  </div>;
}
