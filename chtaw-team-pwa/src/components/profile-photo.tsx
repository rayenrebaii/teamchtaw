"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./shared";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { useCopy } from "@/lib/i18n";
import { validateImage } from "@/services/uploads.service";
import { profilePhotosService } from "@/services/profile-photos.service";
import { useCommunity } from "@/stores/community";
import type { User } from "@/types";
import styles from "./profile-photo.module.css";
import { Camera } from "lucide-react";

export function PhotoSelection({ file, onChange, user, disabled = false, optional = false, compact = false }: {
  file: File | null; onChange: (file: File | null) => void; user: Pick<User, "firstName" | "lastName"> & Partial<User>; disabled?: boolean; optional?: boolean; compact?: boolean;
}) {
  const { t, error: failure } = useCopy();
  const id = useId();
  const preview = useRef<HTMLImageElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (preview.current) preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; event.target.value = "";
    if (!selected) return;
    try { validateImage(selected); setError(""); onChange(selected); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Image indisponible"); }
  }
  if (compact) return <div className={styles.compact}>
    <div className={styles.compactRow}>
      <button className={styles.photoAction} type="button" disabled={disabled} onClick={() => input.current?.click()} aria-label={t(file ? "Remplacer la photo" : "Ajouter une photo")} aria-describedby={`${id}-help`}>
        <span className={styles.compactPreview}>{file ? <img ref={preview} alt={t("Aperçu de la photo")} /> : <Avatar user={user} />}<span className={styles.camera}><Camera size={12} aria-hidden="true" /></span></span>
        <span><strong>{t(file ? "Remplacer la photo" : "Ajouter une photo")}</strong><small id={`${id}-help`}>{t("Facultatif · 5 Mo maximum")}</small></span>
      </button>
      {file && <button type="button" className={styles.remove} disabled={disabled} onClick={() => { onChange(null); setError(""); }} aria-label={t("Retirer la photo sélectionnée")}>{t("Retirer")}</button>}
    </div>
    <input ref={input} id={id} hidden tabIndex={-1} type="file" aria-label={t("Photo de profil facultative")} accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled} onChange={select} />
    {error && <p role="alert" className="error">{failure(error)}</p>}
  </div>;
  return <div className={styles.selection}>
    <label htmlFor={id}>{t(optional ? "Photo de profil (facultative)" : "Photo de profil")}</label>
    <div className={styles.preview}>{file ? <img ref={preview} alt={t("Aperçu de la photo")} /> : <Avatar user={user} size="large-avatar" />}</div>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled} onChange={select} />
    <small className="muted">{t("JPG, PNG, WebP ou GIF · 5 Mo maximum.")}</small>
    {file && <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => { onChange(null); setError(""); }}>{t("Retirer l’image sélectionnée")}</Button>}
    {error && <p role="alert" className="error">{failure(error)}</p>}
  </div>;
}

export function ProfilePhotoEditor({ user }: { user: User }) {
  const { t, error: failure } = useCopy();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(remove = false) {
    if (busy || (!remove && !file)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = remove ? await profilePhotosService.remove() : await profilePhotosService.save(file!);
      useCommunity.getState().receiveUser(updated);
      setFile(null); setConfirm(false); setMessage(remove ? "Photo supprimée." : "Photo enregistrée.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); }
  }
  return <section className={styles.editor} aria-label={t("Photo de profil")}>
    <PhotoSelection file={file} user={user} disabled={busy} onChange={next => { setFile(next); setError(""); setMessage(""); }} />
    <div className="row wrap">
      {file && <Button disabled={busy} onClick={() => void save()}>{t(busy ? "Envoi de la photo…" : "Enregistrer la photo")}</Button>}
      {user.profilePhotoId && <Button variant="destructive" disabled={busy} onClick={() => { setError(""); setConfirm(true); }}>{t("Supprimer la photo")}</Button>}
    </div>
    {busy && <p role="status">{t("Envoi de la photo…")}</p>}
    {message && <p role="status">{t(message)}</p>}
    {error && !confirm && <p role="alert" className="error">{failure(error)}</p>}
    <Modal open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title={t("Supprimer votre photo de profil ?")}>
      <p>{t("Votre avatar affichera de nouveau vos initiales.")}</p>
      {error && <p role="alert" className="error">{failure(error)}</p>}
      <div className="row wrap"><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>{t("Annuler")}</Button><Button variant="destructive" disabled={busy} onClick={() => void save(true)}>{t("Supprimer")}</Button></div>
    </Modal>
  </section>;
}
