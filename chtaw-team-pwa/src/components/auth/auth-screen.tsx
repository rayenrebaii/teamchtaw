"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { attempt } from "@/components/shared";
import { notificationLoginDestination } from "@/features/notification-navigation";
import { firebaseEnabled } from "@/services/firebase";
import { PasswordInput } from "./password-input";
import { AuthBackground } from "./auth-background";
import { RegistrationWizard } from "./registration-wizard";
import backgroundStyles from "./auth-background.module.css";
import registrationStyles from "./registration-wizard.module.css";

const loginSchema = z.object({
  email: z.email("Adresse email invalide."),
  password: z.string().min(12, "Au moins 12 caractères.").max(128),
  firstName: z.string(), lastName: z.string(), confirm: z.string(),
});
type Values = z.infer<typeof loginSchema>;

export function AuthScreen({ register = false }: { register?: boolean }) {
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const router = useRouter();
  const store = useCommunity();
  const currentUser = store.users.find(u => u.id === store.session?.userId);
  useEffect(() => {
    if (currentUser && !registrationBusy) router.replace(notificationLoginDestination(currentUser, window.location.search));
  }, [currentUser, router, registrationBusy]);
  const { register: field, handleSubmit, resetField, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { firstName: "", lastName: "", confirm: "", email: "", password: "" },
  });
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link href="/login" className="brand" aria-label="Team Chtaw - Accueil"><BrandLogo /></Link>
        <div className="story-main">
          <span className="eyebrow"><span className="live-dot" /> UNE TEAM. UNE ÉNERGIE.</span>
          <h1>Plus qu’une équipe.<br />Un <em>mouvement.</em></h1>
          <p>Les conversations qui motivent.<br />Les moments qui rassemblent.<br />Votre communauté, toujours avec vous.</p>
          <div className="story-art">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <span className="art-number">TC.</span><div className="floating-note">↗ Ensemble, on va plus loin.</div>
          </div>
          <span className="small">Une communauté. Des liens pour de vrai.</span>
        </div>
        <span className="small muted">TEAM CHTAW © 2026 · L’ESPRIT D’ÉQUIPE, PARTOUT.</span>
      </aside>
      <main className={"auth-main " + backgroundStyles.panel}>
        <AuthBackground />
        <Link href="/login" className="mobile-auth-brand" aria-label="Team Chtaw - Accueil"><BrandLogo /></Link>
        <span className="demo-label">ESPACE COMMUNAUTAIRE · CONNEXION SÉCURISÉE</span>
        <div className={"auth-form" + (register ? " " + registrationStyles.registrationForm : "")}>
          <span className="eyebrow">BIENVENUE DANS LA TEAM</span>
          <h2>{register ? "L’aventure commence ici." : "Heureux de vous retrouver."}</h2>
          {register ? <RegistrationWizard onBusyChange={setRegistrationBusy} /> : <>
            <p className="muted">Connectez-vous pour retrouver votre communauté.</p>
            <form className="form-stack" onSubmit={handleSubmit(v => attempt(async () => {
              try {
                const user = await store.login(v.email, v.password, remember);
                router.push(notificationLoginDestination(user, window.location.search));
              } finally { resetField("password"); resetField("confirm"); }
            }))}>
              <label>Adresse email<input type="email" autoComplete="email" placeholder="vous@exemple.com" {...field("email")} /><small className="error">{errors.email?.message}</small></label>
              <div>
                <label htmlFor="auth-password">Mot de passe</label>
                <PasswordInput id="auth-password" autoComplete="current-password" placeholder="Au moins 12 caractères" {...field("password")} />
                <small className="error">{errors.password?.message}</small>
              </div>
              <label className="check-label"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Rester connecté</label>
              <Button disabled={isSubmitting} type="submit">{isSubmitting ? "Connexion en cours…" : "Se connecter"}<ArrowRight size={17} /></Button>
            </form>
            {firebaseEnabled && <p><Link href="/forgot-password">Mot de passe oublié ?</Link></p>}
            <p className="small muted">Pas encore dans la team ?{" "}<Link href="/register">Créer un compte</Link></p>
            <div className="demo-panel">
              <div className="row"><ShieldCheck size={20} /><strong>Un espace réservé à votre communauté</strong></div>
              <p className="small muted">Les nouveaux comptes sont validés par l’administrateur avant d’accéder aux conversations.</p>
            </div>
          </>}
        </div>
      </main>
    </div>
  );
}
