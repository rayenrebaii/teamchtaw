import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";

@Injectable()
export class FirebaseIdentity {
  constructor(private config: ConfigService) {}
  get enabled() { return this.config.get<string>("AUTH_PROVIDER") === "firebase"; }
  async passwordLogin(email: string, password: string): Promise<string> {
    // Compatibility for installed PWAs during rollout; credentials are checked by Firebase only.
    try {
      const key = this.config.getOrThrow<string>("FIREBASE_WEB_API_KEY");
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error();
      const result = await response.json() as { idToken?: string };
      if (!result.idToken) throw Error();
      return result.idToken;
    } catch { throw new UnauthorizedException("Email ou mot de passe Firebase incorrect."); }
  }
  private async client(): Promise<Auth> {
    if (!this.enabled) throw new UnauthorizedException("Firebase n’est pas activé.");
    const name = "chtaw-auth";
    const app = getApps().find((item) => item.name === name) ?? initializeApp({
      credential: cert({
        projectId: this.config.getOrThrow<string>("FIREBASE_PROJECT_ID"),
        clientEmail: this.config.getOrThrow<string>("FIREBASE_CLIENT_EMAIL"),
        privateKey: this.config.getOrThrow<string>("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    }, name);
    const { getAuth } = await import("firebase-admin/auth");
    return getAuth(app);
  }
  async verify(raw: string): Promise<DecodedIdToken> {
    try {
      const token = await (await this.client()).verifyIdToken(raw, true);
      if (!token.email || token.firebase.sign_in_provider !== "password") throw Error();
      return token;
    } catch { throw new UnauthorizedException("Identité Firebase invalide ou expirée."); }
  }
  async session(uid: string | null | undefined, authTime: number | null | undefined) {
    if (!uid || authTime == null) throw new UnauthorizedException("Reconnectez-vous avec Firebase.");
    try {
      const user = await (await this.client()).getUser(uid);
      const validAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) / 1000 : 0;
      if (user.disabled || authTime < validAfter) throw Error();
      return user;
    } catch { throw new UnauthorizedException("Session Firebase révoquée ou indisponible."); }
  }
}
