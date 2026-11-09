"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { applyActionCode, confirmPasswordReset, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, verifyPasswordResetCode } from "firebase/auth";
import { firebaseAuth, firebaseEnabled, emailActionSettings } from "@/services/firebase";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useCommunity } from "@/stores/community";
import { destination } from "@/lib/utils";

export function FirebaseActions({ screen }: { screen: "verify" | "forgot" | "action" }) {
  const params = useSearchParams();
  const router = useRouter();
  const store = useCommunity();
  const user = store.users.find((item) => item.id === store.session?.userId);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [nextSend, setNextSend] = useState(0);
  const mode = params.get("mode");
  const code = params.get("oobCode");
  const reset = screen === "action" && mode === "resetPassword";
  const invalid = screen === "action" && (!code || !["verifyEmail", "resetPassword"].includes(mode ?? ""));
  const title = done ? (reset ? "Mot de passe modifié." : screen === "forgot" ? "Consultez votre messagerie." : "Adresse e-mail confirmée.")
    : screen === "verify" ? "Vérifiez votre adresse e-mail."
    : screen === "forgot" ? "Mot de passe oublié ?"
    : reset ? "Choisissez un nouveau mot de passe." : "Confirmez votre adresse e-mail.";
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); }
    catch { setMessage("Opération impossible. Le lien peut être invalide ou expiré. Demandez un nouveau lien ou réessayez plus tard."); }
    finally { setBusy(false); setPassword(""); setConfirm(""); }
  }
  return <main className="auth-main" style={{ minHeight: "100dvh" }}>
    <Link href="/login" aria-label="Team Chtaw"><BrandLogo /></Link>
    <div className="auth-form">
      <h1>{title}</h1>
      {!firebaseEnabled ? <p>Ce service n’est pas encore activé.</p> : <>
        {screen === "verify" && <p>Votre compte reste soumis à l’approbation de l’administrateur, même après confirmation de votre adresse. Si vous n’avez pas reçu l’e-mail, demandez un nouveau lien.</p>}
        {done && screen !== "forgot" && <p>{reset ? "Reconnectez-vous avec votre nouveau mot de passe. L’approbation du compte reste inchangée." : "Votre adresse est vérifiée. L’accès à l’application reste soumis à l’approbation de l’administrateur."}</p>}
        {invalid && <p role="alert">Lien invalide ou incomplet. Demandez un nouveau lien.</p>}
        {!done && !invalid && <form className="form-stack" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            if (screen === "forgot") {
              if (Date.now() < nextSend) { setMessage("Patientez une minute avant une nouvelle demande."); return; }
              setNextSend(Date.now() + 60000);
              // Firebase enumeration protection must also be enabled in the project.
              try { await sendPasswordResetEmail(firebaseAuth(), email.trim().toLowerCase(), emailActionSettings()); } catch { /* Same public response for unknown addresses, quota and delivery errors. */ }
              setMessage("Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation. En cas d’absence, vérifiez les indésirables et réessayez plus tard.");
              setDone(true);
            } else if (screen === "verify") {
              if (Date.now() < nextSend) { setMessage("Patientez une minute avant une nouvelle demande."); return; }
              const auth = firebaseAuth();
              const identity = auth.currentUser ?? (await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)).user;
              await identity.reload();
              if (identity.emailVerified) { await store.sync(); setDone(true); return; }
              await sendEmailVerification(identity, emailActionSettings());
              setNextSend(Date.now() + 60000);
              setMessage("E-mail envoyé. Vérifiez aussi vos indésirables.");
            } else if (reset) {
              if (password.length < 12 || password !== confirm) { setMessage("Utilisez au moins 12 caractères et deux mots de passe identiques."); return; }
              await verifyPasswordResetCode(firebaseAuth(), code!);
              await confirmPasswordReset(firebaseAuth(), code!, password);
              await store.logout().catch(() => undefined);
              setDone(true);
            } else {
              await applyActionCode(firebaseAuth(), code!);
              setDone(true);
            }
          });
        }}>
          {(screen === "forgot" || screen === "verify") && <label>Adresse e-mail{screen === "verify" ? " (si votre session Firebase est fermée)" : ""}<input type="email" autoComplete="email" required={screen === "forgot"} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
          {(screen === "verify" || reset) && <label>{reset ? "Nouveau mot de passe" : "Mot de passe (si votre session Firebase est fermée)"}<input type="password" autoComplete={reset ? "new-password" : "current-password"} minLength={12} maxLength={128} required={reset} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
          {reset && <label>Confirmer le mot de passe<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>}
          <Button disabled={busy} type="submit">{busy ? "Traitement en cours…" : screen === "verify" ? "Renvoyer l’e-mail de vérification" : screen === "forgot" ? "Demander un lien" : reset ? "Enregistrer le mot de passe" : "Confirmer mon adresse"}</Button>
        </form>}
        {screen === "verify" && user && <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await store.sync(); const current = useCommunity.getState().users.find((item) => item.id === user.id); if (current?.emailVerified) router.replace(destination(current)); else setMessage("Votre adresse n’est pas encore confirmée."); })}>J’ai confirmé mon adresse</Button>}
      </>}
      {message && <p role="status">{message}</p>}
      <p><Link href="/login">Se connecter</Link> · <Link href="/forgot-password">Demander un nouveau lien de réinitialisation</Link></p>
      <p><Link href="/verify-email">Demander un nouveau lien de vérification</Link></p>
    </div>
  </main>;
}
