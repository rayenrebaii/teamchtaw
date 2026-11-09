import { isSignedOut } from "./session-control";
import { api, ApiError, type TokenResponse } from "./api-client";
import type { User } from "@/types";
import { firebaseAuth, firebaseEnabled, emailActionSettings } from "./firebase";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut } from "firebase/auth";
export const authService = {
  async login(email: string, password: string) {
    if (!firebaseEnabled) return api.login<TokenResponse & { user: User }>(email, password);
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth(), email.trim().toLowerCase(), password);
      return await api.firebaseLogin<TokenResponse & { user: User }>(await credential.user.getIdToken(true));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, "Connexion impossible. Vérifiez vos identifiants ou utilisez Mot de passe oublié.");
    }
  },
  async register(input: Pick<User, "email" | "firstName" | "lastName"> & { password: string }) {
    if (!firebaseEnabled) return api.request<User>("/auth/register", { method: "POST", body: JSON.stringify(input) }, false);
    let credential;
    try { credential = await createUserWithEmailAndPassword(firebaseAuth(), input.email.trim().toLowerCase(), input.password); }
    catch {
      // Resume an interrupted registration only after proving the Firebase password.
      try { credential = await signInWithEmailAndPassword(firebaseAuth(), input.email.trim().toLowerCase(), input.password); }
      catch { throw new ApiError(400, "Inscription indisponible. Essayez de vous connecter ou contactez l’administrateur."); }
    }
    const result = await api.firebaseLogin<TokenResponse & { user: User }>(await credential.user.getIdToken(true), input);
    try { await sendEmailVerification(credential.user, emailActionSettings()); }
    catch { throw new ApiError(503, "Compte créé, mais l’e-mail n’a pas pu être envoyé. Connectez-vous pour demander un nouveau lien."); }
    return result.user;
  },
  me: () => api.request<User>("/auth/me"),
  async logout() {
    try { await api.logout(); }
    finally { if (firebaseEnabled) await signOut(firebaseAuth()); }
  },
  async restore() {
    if (isSignedOut()) {
      await api.revokeBrowserSession().catch(() => undefined);
      throw new ApiError(401, "Session fermée sur cet appareil.");
    }
    await api.refresh();
    return this.me();
  },
};
