"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { firebaseAuth, firebaseEnabled } from "@/services/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
export function AccountAction({ forgot = false }: { forgot?: boolean }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const value = window.location.hash.slice(1);
    // Read once, then immediately remove the secret from browser history.
    if (value) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      queueMicrotask(() => setToken(value));
    }
  }, []);
  return <main className="auth-main" style={{ minHeight: "100dvh" }}><div className="auth-form form-stack">
    <h1>{forgot ? "Mot de passe oublié" : firebaseEnabled ? "Activer mon invitation" : "Définir mon mot de passe"}</h1>
    {firebaseEnabled && !forgot && !done && <p>Après avoir défini votre mot de passe sur l’écran Firebase, confirmez votre adresse et ce mot de passe pour activer votre espace collaborateur.</p>}
    {done ? <p role="status">{forgot ? "Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation." : firebaseEnabled ? "Votre compte collaborateur est activé. Vous pouvez vous connecter." : "Mot de passe enregistré. Vous pouvez vous connecter."}</p> : <form className="form-stack" onSubmit={async (event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
      try {
        if (firebaseEnabled && !forgot) {
          const auth = firebaseAuth();
          try {
            const credential = await signInWithEmailAndPassword(auth, String(form.get("email")).trim().toLowerCase(), String(form.get("password")));
            await api.request("/auth/account-links/activate-firebase", { method: "POST", body: JSON.stringify({ token, idToken: await credential.user.getIdToken(true) }) }, false);
          } finally { await signOut(auth); }
        } else {
          if (!forgot && form.get("password") !== form.get("confirm")) throw Error("Les deux mots de passe doivent être identiques.");
          await api.request(`/auth/account-links/${forgot ? "forgot" : "redeem"}`, { method: "POST", body: JSON.stringify(forgot ? { email: form.get("email") } : { token, password: form.get("password") }) }, false);
        }
        setDone(true); setToken("");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
      finally { setBusy(false); }
    }}>
      {forgot ? <label>E-mail<input type="email" name="email" autoComplete="email" required maxLength={254} /></label> : <>
        {!token && <p role="alert">Lien absent ou expiré. Demandez un nouveau lien ; pour une invitation, contactez l’administrateur.</p>}
        {firebaseEnabled && <label>E-mail<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>}
        <label>{firebaseEnabled ? "Mot de passe choisi dans Firebase" : "Nouveau mot de passe"}<input type="password" name="password" autoComplete={firebaseEnabled ? "current-password" : "new-password"} required minLength={12} maxLength={128} /></label>
        {!firebaseEnabled && <label>Confirmer le mot de passe<input type="password" name="confirm" autoComplete="new-password" required minLength={12} maxLength={128} /></label>}
      </>}
      <Button type="submit" disabled={busy || (!forgot && !token)}>{busy ? "Traitement…" : forgot ? "Demander un lien" : firebaseEnabled ? "Activer mon compte collaborateur" : "Enregistrer le mot de passe"}</Button>
    </form>}
    {error && <p role="alert" className="error">{error}</p>}
    <Link href="/login">Se connecter</Link><Link href="/forgot-password">Demander un nouveau lien</Link>
  </div></main>;
}
