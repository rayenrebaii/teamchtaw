"use client";
import { useCopy } from "@/lib/i18n";
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
  const { t } = useCopy();
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
        <Link href="/login" className="brand" aria-label={t("Team Chtaw - Accueil")}><BrandLogo /></Link>
        <div className="story-main">
          <span className="eyebrow"><span className="live-dot" />{t("UNE TEAM. UNE ÉNERGIE.")}</span>
          <h1>{t("Plus qu’une équipe.")}<br />{t("Un ")}<em>{t("mouvement.")}</em></h1>
          <p>{t("Les conversations qui motivent.")}<br />{t("Les moments qui rassemblent.")}<br />{t("Votre communauté, toujours avec vous.")}</p>
          <div className="story-art">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <span className="art-number">TC.</span><div className="floating-note">{t("↗ Ensemble, on va plus loin.")}</div>
          </div>
          <span className="small">{t("Une communauté. Des liens pour de vrai.")}</span>
        </div>
        <span className="small muted">{t("TEAM CHTAW © 2026 · L’ESPRIT D’ÉQUIPE, PARTOUT.")}</span>
      </aside>
      <main className={"auth-main " + backgroundStyles.panel}>
        <AuthBackground />
        <Link href="/login" className="mobile-auth-brand" aria-label={t("Team Chtaw - Accueil")}><BrandLogo /></Link>
        <span className="demo-label">{t("ESPACE COMMUNAUTAIRE · CONNEXION SÉCURISÉE")}</span>
        <div className={"auth-form" + (register ? " " + registrationStyles.registrationForm : "")}>
          <span className="eyebrow">{t("BIENVENUE DANS LA TEAM")}</span>
          <h2>{register ? t("L’aventure commence ici.") : t("Heureux de vous retrouver.")}</h2>
          {register ? <RegistrationWizard onBusyChange={setRegistrationBusy} /> : <>
            <p className="muted">{t("Connectez-vous pour retrouver votre communauté.")}</p>
            <form className="form-stack" onSubmit={handleSubmit(v => attempt(async () => {
              try {
                const user = await store.login(v.email, v.password, remember);
                router.push(notificationLoginDestination(user, window.location.search));
              } finally { resetField("password"); resetField("confirm"); }
            }))}>
              <label>{t("Adresse email")}<input type="email" autoComplete="email" placeholder={t("vous@exemple.com")} {...field("email")} /><small className="error">{errors.email?.message && t(errors.email.message)}</small></label>
              <div>
                <label htmlFor="auth-password">{t("Mot de passe")}</label>
                <PasswordInput id="auth-password" autoComplete="current-password" placeholder={t("Au moins 12 caractères")} {...field("password")} />
                <small className="error">{errors.password?.message && t(errors.password.message)}</small>
              </div>
              <label className="check-label"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />{t("Rester connecté")}</label>
              <Button disabled={isSubmitting} type="submit">{isSubmitting ? t("Connexion en cours…") : t("Se connecter")}<ArrowRight size={17} /></Button>
            </form>
            {firebaseEnabled && <p><Link href="/forgot-password">{t("Mot de passe oublié ?")}</Link></p>}
            <p className="small muted">{t("Pas encore dans la team ?")}{" "}<Link href="/register">{t("Créer un compte")}</Link></p>
            <div className="demo-panel">
              <div className="row"><ShieldCheck size={20} /><strong>{t("Un espace réservé à votre communauté")}</strong></div>
              <p className="small muted">{t("Les nouveaux comptes sont validés par l’administrateur avant d’accéder aux conversations.")}</p>
            </div>
          </>}
        </div>
      </main>
    </div>
  );
}
