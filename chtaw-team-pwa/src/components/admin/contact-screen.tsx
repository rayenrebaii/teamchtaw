"use client";
import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { contactService, type ContactSummary, type ContactRequest } from "@/services/contact.service";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

const subjects: Record<string, string> = { registration: "Inscription au service", approval: "Validation du compte", login: "Problème de connexion", sessions: "Séances et groupes", other: "Autre demande" };
export function ContactScreen() {
  const { t, locale } = useCopy();
  const [items, setItems] = useState<ContactSummary[]>([]);
  const [selected, setSelected] = useState<ContactRequest | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const flight = useRef(true);
  async function load(cursor?: string) {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError("");
    try {
      const rows = await contactService.list(cursor);
      setItems(current => cursor ? [...current, ...rows] : rows); setMore(rows.length === 50); setLoaded(true);
    } catch { setError("Impossible de charger les demandes. Réessayez."); }
    finally { flight.current = false; setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    void contactService.list().then(rows => {
      if (active) { setItems(rows); setMore(rows.length === 50); setLoaded(true); }
    }).catch(() => { if (active) setError("Impossible de charger les demandes. Réessayez."); })
      .finally(() => { if (active) { flight.current = false; setBusy(false); } });
    return () => { active = false; };
  }, []);
  async function open(id: string) {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError("");
    try { setSelected(await contactService.get(id)); }
    catch { setError("Impossible de charger les demandes. Réessayez."); }
    finally { flight.current = false; setBusy(false); }
  }
  async function mark() {
    if (!selected || flight.current) return;
    flight.current = true; setBusy(true); setError("");
    try {
      const updated = await contactService.update(selected.id, selected.status === "NEW" ? "PROCESSED" : "NEW");
      setSelected(updated); setItems(current => current.map(row => row.id === updated.id ? updated : row));
    } catch { setError("Impossible de modifier la demande. Réessayez."); }
    finally { flight.current = false; setBusy(false); }
  }
  return <div className="admin-page">
    <header className="page-heading"><div><span className="eyebrow">{t("ESPACE ADMIN · CONTACT")}</span><h1>{t("Demandes du site vitrine")}</h1><p className="muted">{t("Consultez les messages des visiteurs et répondez par e-mail.")}</p></div><Button disabled={busy} onClick={() => void load()}>{t("Actualiser")}</Button></header>
    {error && !selected && <p role="alert">{t(error)}</p>}
    {busy && <p role="status">{t("Chargement…")}</p>}
    {loaded && !items.length && <p>{t("Aucune demande reçue.")}</p>}
    <div className="grid gap-4" aria-busy={busy}>
      {items.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => void open(item.id)} className="panel" style={{ textAlign: "start", overflowWrap: "anywhere" }}>
        <div className="row between wrap"><strong>{item.name}</strong><span>{t(item.status === "NEW" ? "À traiter" : "Traitée")}</span></div>
        <p>{t(subjects[item.subject] ?? "Autre demande")}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time>
      </button>)}
    </div>
    {more && <Button disabled={busy} onClick={() => void load(items.at(-1)?.id)}>{t("Charger la suite")}</Button>}
    <Modal open={Boolean(selected)} onClose={() => { if (!busy) { setSelected(null); setError(""); } }} title={t("Demande de contact")}>
      {selected && <div style={{ overflowWrap: "anywhere" }}>
        <h3>{selected.name}</h3><p>{t(subjects[selected.subject] ?? "Autre demande")}</p><p>{selected.email}</p>
        <time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleString(locale)}</time>
        <p style={{ whiteSpace: "pre-wrap", marginBlock: "1rem" }}>{selected.message}</p>
        <p>{t(selected.status === "NEW" ? "À traiter" : "Traitée")}</p>
        {error && <p role="alert">{t(error)}</p>}
        <div className="row wrap"><a className="button" href={`mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(`Chtaw Team — ${t(subjects[selected.subject] ?? "Autre demande")}`)}`}>{t("Répondre par e-mail")}</a><Button disabled={busy} onClick={() => void mark()}>{t(selected.status === "NEW" ? "Marquer comme traitée" : "Rouvrir la demande")}</Button></div>
      </div>}
    </Modal>
  </div>;
}
