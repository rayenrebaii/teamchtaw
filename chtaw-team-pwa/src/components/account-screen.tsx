"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, Ban, ArrowRight, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCommunity } from "@/stores/community";
import { destination } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, attempt } from "@/components/shared";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";
import { BrandLogo } from "@/components/brand-logo";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { AttendanceHistory } from "@/components/admin/attendance-panel";
import { useCopy } from "@/lib/i18n";
import { usePreferences, type ThemePreference, type Language } from "@/stores/preferences";
const schema = z.object({
  firstName: z.string().trim().min(2, "Au moins 2 caractères.").max(60, "60 caractères maximum."),
  lastName: z.string().trim().min(2, "Au moins 2 caractères.").max(60, "60 caractères maximum."),
  bio: z.string().trim().max(250, "250 caractères maximum."),
});
export function ProfileScreen() {
  const [attendance, setAttendance] = useState(false);
  const store = useCommunity();
  const { t, locale, error } = useCopy();
  const user = store.users.find((member) => member.id === store.session?.userId);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user?.firstName, lastName: user?.lastName, bio: user?.bio },
  });
  if (!user) return null;
  return (
    <div className="account-page student-profile">
      <span className="eyebrow">{t("UN VISAGE DANS LE COLLECTIF")}</span>
      <h1>
        {t("Mon profil")}
        <span className="title-dot" aria-hidden="true">
          .
        </span>
      </h1>
      <section className="panel">
        <div className="row wrap">
          <Avatar user={user} size="large-avatar" />
          <div>
            <h2>
              {user.firstName} {user.lastName}
            </h2>
            <p className="muted">{user.email}</p>
            <span className="badge approved">
              <ShieldCheck size={13} />
              {t("Membre approuvé")}
            </span>
          </div>
        </div>
        <dl className="profile-facts">
          <div>
            <dt>{t("Email")}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{t("Rôle")}</dt>
            <dd>{user.role === "ADMIN" ? t("Administrateur") : t("Étudiant")}</dd>
          </div>
          <div>
            <dt>{t("Adhésion")}</dt>
            <dd>{user.status === "APPROVED" ? t("Membre approuvé") : t("En attente")}</dd>
          </div>
          <div>
            <dt>{t("Inscription")}</dt>
            <dd>{new Date(user.joinedAt).toLocaleDateString(locale)}</dd>
          </div>
          <div>
            <dt>{t("Mes groupes")}</dt>
            <dd>
              {store.groups
                .filter((group) => group.memberIds.includes(user.id))
                .map((group) => group.name)
                .join(", ") || t("Aucun groupe")}
            </dd>
          </div>
        </dl>
        <form
          className="form-stack"
          onSubmit={handleSubmit((values) =>
            attempt(() => store.profile(values), "Profil enregistré"),
          )}
        >
          {(["firstName", "lastName", "bio"] as const).map((name) => (
            <label key={name}>
              {name === "firstName"
                ? t("Prénom")
                : name === "lastName"
                  ? t("Nom")
                  : t("Quelques mots sur vous")}
              {name === "bio" ? (
                <textarea maxLength={250} {...register(name)} />
              ) : (
                <input
                  maxLength={60}
                  autoComplete={name === "firstName" ? "given-name" : "family-name"}
                  {...register(name)}
                />
              )}
              {errors[name]?.message && (
                <small className="error" role="alert">
                  {error(errors[name]!.message!)}
                </small>
              )}
            </label>
          ))}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("Enregistrement…") : t("Enregistrer mes modifications")}
          </Button>
        </form>
      </section>
      {user.role === "USER" ? (
        <Button variant="secondary" asChild>
          <Link href="/app/attendance">{t("Mon historique de présence")}</Link>
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setAttendance(true)}>
          Mon historique de présence
        </Button>
      )}
      {attendance && <AttendanceHistory onClose={() => setAttendance(false)} />}
    </div>
  );
}
export function SettingsScreen() {
  const store = useCommunity();
  const { t } = useCopy();
  const preferences = usePreferences();
  return (
    <div className="account-page student-settings">
      <span className="eyebrow">{t("À VOTRE FAÇON")}</span>
      <h1>
        {t("Paramètres")}
        <span className="title-dot" aria-hidden="true">
          .
        </span>
      </h1>
      <section className="panel">
        <h2>{t("Apparence")}</h2>
        <p className="muted">{t("Votre préférence reste appliquée à la réouverture.")}</p>
        <label>
          {t("Choisir le thème")}
          <select
            value={preferences.theme}
            onChange={(event) => preferences.setTheme(event.target.value as ThemePreference)}
          >
            <option value="dark">{t("Thème sombre")}</option>
            <option value="light">{t("Thème clair")}</option>
            <option value="system">{t("Thème système")}</option>
          </select>
        </label>
      </section>
      <section className="panel">
        <h2>{t("Langue")}</h2>
        <label>
          {t("Choisir la langue")}
          <select
            value={preferences.language}
            onChange={(event) => preferences.setLanguage(event.target.value as Language)}
          >
            <option value="fr">{t("Français (FR)")}</option>
            <option value="en">{t("English (EN)")}</option>
          </select>
        </label>
        <p className="muted">
          {t(
            "La langue concerne l’interface ; les messages et les noms des groupes restent inchangés.",
          )}
        </p>
      </section>
      <section className="panel">
        <h2>{t("Installer Chtaw Team")}</h2>
        <p className="muted">
          {t("Installez Chtaw Team sur votre appareil pour y accéder rapidement.")}
        </p>
        <InstallPWAButton showStatus />
      </section>
      <NotificationSettings />
      <section className="panel">
        <h2>{t("Votre communauté en direct")}</h2>
        <p className="muted">
          {store.connection === "online"
            ? t("La messagerie est connectée.")
            : t("La messagerie tente de se reconnecter.")}{" "}
          {t(
            "Vos conversations et identifiants ne sont pas enregistrés dans le stockage local de l’application.",
          )}
        </p>
      </section>
    </div>
  );
}
export function ApprovalScreen({ rejected = false }: { rejected?: boolean }) {
  const store = useCommunity();
  const user = store.users.find((u) => u.id === store.session?.userId);
  const router = useRouter();
  useEffect(() => {
    if (!user) router.replace("/login");
    else if (
      user.status === "APPROVED" ||
      (rejected && user.status !== "REJECTED") ||
      (!rejected && user.status !== "PENDING")
    )
      router.replace(destination(user));
  }, [user, rejected, router]);
  if (!user) return null;
  return (
    <div className="approval-page">
      <div className="panel">
        <BrandLogo />
        <div className="approval-icon">{rejected ? <Ban size={34} /> : <Clock3 size={34} />}</div>
        <span className="eyebrow">{rejected ? "DEMANDE NON RETENUE" : "PRESQUE DANS LA TEAM"}</span>
        <h1>
          {rejected ? "Votre demande a été refusée." : "Un peu de patience, la team se prépare."}
        </h1>
        <p>
          {rejected
            ? "Votre compte n’a pas été approuvé par l’administrateur. L’accès à la messagerie reste indisponible."
            : "Votre compte a été créé avec succès. Il est actuellement en attente de validation par l’administrateur."}
        </p>
        <div className="approval-detail">
          <strong>
            {user.firstName} {user.lastName}
          </strong>
          <span>{user.email}</span>
        </div>
        <p className="small muted">
          Votre statut est actualisé automatiquement. Vous pourrez rejoindre la conversation dès la
          validation de votre compte.
        </p>
        <Button
          variant="secondary"
          onClick={() =>
            attempt(async () => {
              await store.logout();
              router.push("/login");
            })
          }
        >
          Se déconnecter
          <ArrowRight size={16} />
        </Button>
        <Link href="/login" className="small">
          Écran de connexion
        </Link>
      </div>
    </div>
  );
}
