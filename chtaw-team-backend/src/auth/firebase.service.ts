import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";

@Injectable()
export class FirebaseIdentity {
  constructor(private config: ConfigService) {}
  get enabled() { return this.config.get<string>("AUTH_PROVIDER") === "firebase"; }
  async createCollaborator(uid: string, email: string) {
    // Never adopt an existing Firebase identity by email.
    await (await this.client()).createUser({ uid, email, emailVerified: false });
  }
  async setPassword(uid: string | null, password: string, verifyEmail: boolean) {
    if (!uid) throw new UnauthorizedException("Identité Firebase absente.");
    const client = await this.client();
    await client.updateUser(uid, { password, ...(verifyEmail ? { emailVerified: true } : {}) });
    await client.revokeRefreshTokens(uid);
  }
  async sendPasswordReset(email: string, continueUrl: string) {
    await this.emailRequest("sendOobCode", { requestType: "PASSWORD_RESET", email, continueUrl });
    return { sent: true, provider: "firebase" as const };
  }
  async activateInvitation(uid: string | null, email: string, idToken: string, issuedAt: Date) {
    if (!uid) throw new BadRequestException("Identité Firebase absente.");
    const token = await this.verify(idToken);
    const identity = await this.session(token.uid, token.auth_time);
    if (token.uid !== uid || token.email?.trim().toLowerCase() !== email ||
      identity.email?.trim().toLowerCase() !== email || token.auth_time < Math.floor(issuedAt.getTime() / 1000))
      throw new BadRequestException("Compte indisponible.");
    // The independently checked, unexpired application nonce was sent only in
    // Firebase's email. Combined with a fresh, matching password identity it
    // proves invitation ownership; a client emailVerified flag grants nothing.
    await (await this.client()).updateUser(uid, { emailVerified: true });
    await (await this.client()).revokeRefreshTokens(uid);
  }
  private async emailRequest(action: "sendOobCode" | "resetPassword", body: object): Promise<{ email?: string; requestType?: string }> {
    let response: Response;
    try {
      const emulator = this.config.get<string>("FIREBASE_AUTH_EMULATOR_HOST");
      if (emulator && (this.config.get("NODE_ENV") !== "test" || !/^127\.0\.0\.1:\d+$/.test(emulator))) throw Error("Unsafe emulator configuration");
      const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
      response = await fetch(`${base}/v1/accounts:${action}?key=${encodeURIComponent(this.config.getOrThrow<string>("FIREBASE_WEB_API_KEY"))}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Locale": "fr" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new ServiceUnavailableException("Service d’e-mail Firebase indisponible."); }
    if (!response.ok) throw new BadRequestException("Action Firebase impossible. Le lien peut être invalide ou expiré.");
    return response.json() as Promise<{ email?: string; requestType?: string }>;
  }
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
