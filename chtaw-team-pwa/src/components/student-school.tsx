"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { User } from "@/types";
import { useCopy } from "@/lib/i18n";
import { SchoolPicker } from "./school-picker";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { studentSchoolsService } from "@/services/student-schools.service";
import { useCommunity } from "@/stores/community";

export function StudentSchool({ user, editable = false }: { user: User; editable?: boolean }) {
  const { t, error: failure } = useCopy();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(user.establishmentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (user.role !== "USER") return null;
  const proposal = user.establishmentSuggestion;
  return <div className="student-school">
    <p className="small"><strong>{t("Établissement / Lycée")} : </strong>{user.establishment?.name ?? proposal?.name ?? t("Non renseigné")}</p>
    {!user.establishment && proposal && <p className="tiny muted">{t(proposal.status === "PENDING" ? "Établissement proposé · En attente de validation" : proposal.status === "REJECTED" ? "Établissement déclaré non validé" : "Établissement à réaffecter")}</p>}
    {editable && <Button size="sm" variant="secondary" onClick={() => { setValue(user.establishmentId ?? ""); setError(""); setSaved(false); setOpen(true); }}><Pencil size={14} aria-hidden="true" />{t("Modifier l’établissement")}</Button>}
    {saved && <p role="status" className="small">{t("Établissement affecté.")}</p>}
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title={t("Modifier l’établissement")}>
      <p>{user.firstName} {user.lastName}</p>
      <form className="form-stack" onSubmit={async event => {
        event.preventDefault(); if (!value || busy) return;
        setBusy(true); setError("");
        try { useCommunity.getState().receiveUser(await studentSchoolsService.assign(user.id, value)); setSaved(true); setOpen(false); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
        finally { setBusy(false); }
      }}>
        <SchoolPicker value={value} onChange={setValue} disabled={busy} />
        {error && <p role="alert" className="error">{failure(error)}</p>}
        <Button disabled={busy || !value} type="submit">{t(busy ? "Enregistrement…" : "Enregistrer")}</Button>
      </form>
    </Modal>
  </div>;
}
