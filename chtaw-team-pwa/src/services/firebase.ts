"use client";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";

export const firebaseEnabled = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "firebase";
export function firebaseAuth() {
  if (!firebaseEnabled) throw Error("Firebase n’est pas encore activé.");
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (Object.values(config).some((value) => !value)) throw Error("Configuration Firebase incomplète.");
  const existing = getApps().find((app) => app.name === "chtaw-pwa-auth");
  if (existing) return getAuth(existing);
  const app = initializeApp(config, "chtaw-pwa-auth");
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  auth.languageCode = "fr";
  return auth;
}
export function emailActionSettings() {
  return { url: `${window.location.origin}/login`, handleCodeInApp: false };
}
