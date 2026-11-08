"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { attempt } from "@/components/shared";
import { destination } from "@/lib/utils";
const schema = z
  .object({
    firstName: z.string().trim().min(2, "Au moins 2 caractères.").max(60),
    lastName: z.string().trim().min(2, "Au moins 2 caractères.").max(60),
    email: z.email("Adresse email invalide."),
    password: z.string().min(12, "Au moins 12 caractères.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Les mots de passe ne correspondent pas.",
  });
type Values = z.infer<typeof schema>;
const loginSchema = z.object({
  email: z.email("Adresse email invalide."),
  password: z.string().min(12, "Au moins 12 caractères.").max(128),
  firstName: z.string(),
  lastName: z.string(),
  confirm: z.string(),
});
export function AuthScreen({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const store = useCommunity();
  const currentUser = store.users.find((u) => u.id === store.session?.userId);
  useEffect(() => {
    if (currentUser) router.replace(destination(currentUser));
  }, [currentUser, router]);
  const {
    register: field,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(register ? schema : loginSchema),
    defaultValues: { firstName: "", lastName: "", confirm: "", email: "", password: "" },
  });
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link href="/login" className="brand" aria-label="Team Chtaw - Accueil">
          <BrandLogo />
        </Link>
        <div className="story-main">
          <span className="eyebrow">
            <span className="live-dot" /> UNE TEAM. UNE ÉNERGIE.
          </span>
          <h1>
            Plus qu’une équipe.
            <br />
            Un <em>mouvement.</em>
          </h1>
          <p>
            Les conversations qui motivent.
            <br />
            Les moments qui rassemblent.
            <br />
            Votre communauté, toujours avec vous.
          </p>
          <div className="story-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="art-number">TC.</span>
            <div className="floating-note">↗ Ensemble, on va plus loin.</div>
          </div>
          <span className="small">Une communauté. Des liens pour de vrai.</span>
        </div>
        <span className="small muted">TEAM CHTAW © 2026 · L’ESPRIT D’ÉQUIPE, PARTOUT.</span>
      </aside>
      <main className="auth-main">
        <Link href="/login" className="mobile-auth-brand" aria-label="Team Chtaw - Accueil">
          <BrandLogo />
        </Link>
        <span className="demo-label">ESPACE COMMUNAUTAIRE · CONNEXION SÉCURISÉE</span>
        <div className="auth-form">
          <span className="eyebrow">BIENVENUE DANS LA TEAM</span>
          <h2>{register ? "L’aventure commence ici." : "Heureux de vous retrouver."}</h2>
          <p className="muted">
            {register
              ? "Créez votre compte. Notre administrateur validera votre inscription."
              : "Connectez-vous pour retrouver votre communauté."}
          </p>
          <form
            className="form-stack"
            onSubmit={handleSubmit((v) =>
              attempt(async () => {
                try {
                  const user = register
                    ? await store.register({
                        firstName: v.firstName,
                        lastName: v.lastName,
                        email: v.email,
                        password: v.password,
                      })
                    : await store.login(v.email, v.password);
                  router.push(destination(user));
                } finally {
                  resetField("password");
                  resetField("confirm");
                }
              }),
            )}
          >
            {register && (
              <div className="form-grid">
                {(["firstName", "lastName"] as const).map((name) => (
                  <label key={name}>
                    {name === "firstName" ? "Prénom" : "Nom"}
                    <input
                      autoComplete={name === "firstName" ? "given-name" : "family-name"}
                      {...field(name)}
                    />
                    <small className="error">{errors[name]?.message}</small>
                  </label>
                ))}
              </div>
            )}
            <label>
              Adresse email
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                {...field("email")}
              />
              <small className="error">{errors.email?.message}</small>
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="Au moins 12 caractères"
                {...field("password")}
              />
              <small className="error">{errors.password?.message}</small>
            </label>
            {register && (
              <label>
                Confirmer le mot de passe
                <input type="password" autoComplete="new-password" {...field("confirm")} />
                <small className="error">{errors.confirm?.message}</small>
              </label>
            )}
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Connexion en cours…"
                : register
                  ? "Créer mon compte"
                  : "Se connecter"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="small muted">
            {register ? "Déjà membre ?" : "Pas encore dans la team ?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Se connecter" : "Créer un compte"}
            </Link>
          </p>
          <div className="demo-panel">
            <div className="row">
              <ShieldCheck size={20} />
              <strong>Un espace réservé à votre communauté</strong>
            </div>
            <p className="small muted">
              Les nouveaux comptes sont validés par l’administrateur avant d’accéder aux
              conversations.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
