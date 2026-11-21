"use client";
import { useCopy } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoSelection } from "@/components/profile-photo";
import { SchoolPicker } from "@/components/school-picker";
import { useCommunity } from "@/stores/community";
import { firebaseEnabled } from "@/services/firebase";
import { notificationLoginDestination } from "@/features/notification-navigation";
import { PasswordInput } from "./password-input";
import { registrationSchema, registrationServerError, type RegistrationValues } from "./registration-validation";
import styles from "./registration-wizard.module.css";

const steps = ["Identité", "Lycée", "Compte"];
type FocusTarget = keyof RegistrationValues | "school" | "proposed";

export function RegistrationWizard({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const { t, error: failure } = useCopy();
  const router = useRouter();
  const store = useCommunity();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState("next");
  const [photo, setPhoto] = useState<File | null>(null);
  const [school, setSchool] = useState("");
  const [proposed, setProposed] = useState("");
  const [schoolError, setSchoolError] = useState("");
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const moved = useRef(false);
  const focusTarget = useRef<FocusTarget | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const schoolPanel = useRef<HTMLDivElement>(null);
  const { register: field, control, trigger, handleSubmit, setFocus, setError, formState: { errors } } = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema), mode: "onChange", shouldUnregister: false, shouldFocusError: false,
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", password: "", confirm: "" },
  });
  const [firstName, lastName] = useWatch({ control, name: ["firstName", "lastName"] });
  const phoneField = field("phone");

  function focusError(target: FocusTarget) {
    if (target === "school" || target === "proposed") schoolPanel.current?.querySelector<HTMLElement>(target === "school" ? "select" : "input")?.focus();
    else setFocus(target);
  }
  useEffect(() => {
    if (!moved.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = setTimeout(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView?.({ block: "nearest" });
      const target = focusTarget.current;
      if (target === "school" || target === "proposed") schoolPanel.current?.querySelector<HTMLElement>(target === "school" ? "select" : "input")?.focus();
      else if (target) setFocus(target);
      focusTarget.current = undefined;
    }, reduced ? 0 : 190);
    return () => clearTimeout(timer);
  }, [step, setFocus]);

  function move(next: number, target?: FocusTarget) {
    if (next === step) { if (target) focusError(target); return; }
    moved.current = true; focusTarget.current = target;
    setDirection(next > step ? "next" : "back"); setStep(next);
  }
  function validateSchool() {
    const select = schoolPanel.current?.querySelector("select");
    const message = !school || (select && (select.disabled || !select.value)) ? "Choisissez votre lycée." : school === "OTHER" && !proposed.trim() ? "Le nom de votre lycée est obligatoire." : proposed.trim().length > 120 && school === "OTHER" ? "120 caractères maximum." : "";
    setSchoolError(message);
    if (message) { if (step !== 1) move(1, school === "OTHER" ? "proposed" : "school"); else focusError(school === "OTHER" ? "proposed" : "school"); }
    return !message;
  }
  async function next() {
    if (busy) return;
    if (step === 0 && await trigger(["firstName", "lastName"], { shouldFocus: true })) move(1);
    else if (step === 1 && validateSchool()) move(2);
  }
  async function create(values: RegistrationValues) {
    if (lock.current || !validateSchool()) return;
    lock.current = true; setBusy(true); setServerError(""); onBusyChange(true);
    try {
      const user = await store.register({
        firstName: values.firstName, lastName: values.lastName, email: values.email, password: values.password,
        phone: `+216${values.phone}`,
        ...(school === "OTHER" ? { proposedEstablishmentName: proposed.trim() } : { establishmentId: school }),
      }, photo ?? undefined);
      router.push(notificationLoginDestination(user, window.location.search));
    } catch (reason) {
      const issue = registrationServerError(reason instanceof Error ? reason.message : "Inscription impossible. Veuillez réessayer.");
      if (issue.school) setSchoolError(issue.message);
      else if (issue.field) setError(issue.field, { type: "server", message: issue.message });
      else setServerError(issue.message);
      move(issue.step, issue.school ? school === "OTHER" ? "proposed" : "school" : issue.field);
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    return handleSubmit(create, invalid => {
      if (invalid.firstName || invalid.lastName) move(0, invalid.firstName ? "firstName" : "lastName");
      else {
        const first = (["email", "phone", "password", "confirm"] as const).find(name => invalid[name]);
        if (first) move(2, first);
      }
    })(event);
  }
  function error(name: keyof RegistrationValues) {
    return errors[name] ? <small id={`register-${name}-error`} className="error" role="alert">{errors[name]?.message && t(errors[name].message)}</small> : null;
  }
  return <div className={styles.wizard}>
    <ol className={styles.steps} aria-label={t("Étapes de l’inscription")}>
      {steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} data-complete={index < step || undefined}>
        <span className={styles.number}>{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span><span>{t(label)}{index < step && <span className={styles.srOnly}>{t(" — terminée")}</span>}</span>
      </li>)}
    </ol>
    <form noValidate aria-busy={busy} onSubmit={event => { if (step < 2) { event.preventDefault(); void next(); } else void submit(event); }}>
      <div className={styles.viewport}>
        <section key={step} className={styles.stage} data-direction={direction} aria-labelledby="registration-step-heading" data-registration-step={step + 1}>
          <h3 id="registration-step-heading" ref={heading} tabIndex={-1}>{t(["Votre identité", "Votre lycée", "Votre compte"][step])}</h3>
          {step === 0 && <>
            <div className="form-grid">
              {(["firstName", "lastName"] as const).map(name => <div key={name}><label>
                {name === "firstName" ? t("Prénom") : t("Nom")}
                <input autoComplete={name === "firstName" ? "given-name" : "family-name"} required maxLength={60} disabled={busy} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `register-${name}-error` : undefined} {...field(name)} />
              </label>{error(name)}</div>)}
            </div>
            <PhotoSelection compact optional file={photo} onChange={setPhoto} user={{ firstName, lastName }} disabled={busy} />
          </>}
          {step === 1 && <div ref={schoolPanel}>
            <SchoolPicker variant="registration" value={school} onChange={value => { setSchool(value); setSchoolError(""); }} proposed={proposed} onPropose={value => { setProposed(value); setSchoolError(""); }} allowOther disabled={busy} validationError={schoolError} />
          </div>}
          {step === 2 && <>
            <div><label>{t("Adresse email")}<input type="email" autoComplete="email" placeholder={t("vous@exemple.com")} required disabled={busy} aria-invalid={!!errors.email} aria-describedby={errors.email ? "register-email-error" : undefined} {...field("email")} /></label>{error("email")}</div>
            <div>
              <label htmlFor="auth-phone">{t("Numéro de téléphone")}</label>
              <div className="phone-input"><span>+216</span><input id="auth-phone" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[0-9]{8}" maxLength={8} placeholder="20 123 456" disabled={busy} aria-invalid={!!errors.phone} aria-describedby={`register-phone-help${errors.phone ? " register-phone-error" : ""}`} {...phoneField} onChange={event => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 8); void phoneField.onChange(event); }} /></div>
              <small id="register-phone-help" className="muted">{t("8 chiffres, après l’indicatif +216.")}</small>{error("phone")}
            </div>
            <div>
              <label htmlFor="auth-password">{t("Mot de passe")}</label>
              <PasswordInput id="auth-password" autoComplete="new-password" required disabled={busy} aria-invalid={!!errors.password} aria-describedby={errors.password ? "register-password-error" : "register-password-help"} {...field("password")} />
              {!errors.password && <small id="register-password-help" className="muted">{t("Au moins 12 caractères.")}</small>}{error("password")}
            </div>
            <div>
              <label htmlFor="auth-confirm">{t("Confirmer le mot de passe")}</label>
              <PasswordInput id="auth-confirm" autoComplete="new-password" required disabled={busy} aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? "register-confirm-error" : undefined} {...field("confirm")} />{error("confirm")}
            </div>
            {serverError && <p className="error" role="alert">{failure(serverError)}</p>}
            <p className={styles.note}><ShieldCheck size={15} aria-hidden="true" />{firebaseEnabled ? t("Confirmez votre e-mail, puis attendez la validation de votre compte par l’administrateur.") : t("Votre compte sera validé par l’administrateur avant l’accès à la communauté.")}</p>
          </>}
        </section>
      </div>
      <div className={styles.actions}>
        {step > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => move(step - 1)}><ArrowLeft size={16} aria-hidden="true" />{t("Retour")}</Button>}
        {step < 2 ? <Button key="next" type="button" disabled={busy} onClick={event => { event.preventDefault(); void next(); }}>{t("Suivant")}<ArrowRight size={16} aria-hidden="true" /></Button> : <Button key="create" type="submit" disabled={busy}>{busy ? t("Création en cours…") : t("Créer mon compte")}<ArrowRight size={16} aria-hidden="true" /></Button>}
      </div>
    </form>
    <p className={styles.signin}>{t("Déjà membre ?")}{" "}<Link href="/login">{t("Se connecter")}</Link></p>
  </div>;
}
