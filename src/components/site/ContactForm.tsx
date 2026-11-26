import { useRef, useState, type FormEvent } from "react";
import { Mail, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_SUBJECTS, sendContact, validateContact, type ContactFields } from "@/lib/contact";
import { useSiteCopy } from "@/lib/site-language";
import { SectionTitle } from "./Reveal";

const empty: ContactFields = { name: "", email: "", subject: "", message: "", website: "" };
export function ContactSection() {
  const { t } = useSiteCopy();
  const [fields, setFields] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFields, string>>>({});
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const [failure, setFailure] = useState("");
  const [received, setReceived] = useState(false);
  function change(key: keyof ContactFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setReceived(false);
    setFailure("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current) return;
    const invalid = validateContact(fields);
    setErrors(invalid);
    setFailure("");
    setReceived(false);
    const first = Object.keys(invalid)[0];
    if (first) {
      document.getElementById(`contact-${first}`)?.focus();
      return;
    }
    flight.current = true;
    setBusy(true);
    try {
      await sendContact(fields);
      setReceived(true);
      setFields(empty);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Le message n’a pas pu être envoyé. Votre texte est conservé.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const inputClass =
    "mt-2 w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";
  return (
    <section id="contact" className="py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle
          kicker={t("Contact")}
          title={t("Contacter l’administration")}
          sub={t(
            "Une question sur votre inscription, votre compte ou l’organisation des séances ? Écrivez à l’administrateur de Chtaw Team.",
          )}
        />
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <aside className="rounded-3xl border border-primary/30 bg-primary/5 p-6 md:p-8">
            <Mail className="mb-6 h-9 w-9 text-primary" aria-hidden="true" />
            <h3 className="text-2xl font-bold">{t("Nous sommes à votre écoute")}</h3>
            <p className="mt-4 text-muted-foreground">
              {t(
                "Ce formulaire est accessible sans compte, même si vous ne pouvez pas vous connecter.",
              )}
            </p>
            <p className="mt-4 text-muted-foreground">
              {t(
                "Précisez votre demande sans communiquer votre mot de passe. Vos coordonnées servent uniquement à traiter votre message.",
              )}
            </p>
          </aside>
          <form
            onSubmit={submit}
            noValidate
            aria-busy={busy}
            className="min-w-0 rounded-3xl border bg-card p-6 md:p-8"
          >
            <p className="mb-6 text-sm text-muted-foreground">
              {t("Tous les champs sont obligatoires.")}
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {(
                [
                  ["name", "Nom complet", "text", 120, "name"],
                  ["email", "Adresse e-mail", "email", 254, "email"],
                ] as const
              ).map(([key, label, type, maxLength, autoComplete]) => (
                <div key={key} className="min-w-0">
                  <label htmlFor={`contact-${key}`} className="font-semibold">
                    {t(label)}
                  </label>
                  <input
                    id={`contact-${key}`}
                    name={key}
                    type={type}
                    autoComplete={autoComplete}
                    required
                    maxLength={maxLength}
                    value={fields[key]}
                    disabled={busy}
                    onChange={(event) => change(key, event.target.value)}
                    className={inputClass}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `contact-${key}-error` : undefined}
                  />
                  {errors[key] && (
                    <p id={`contact-${key}-error`} className="mt-2 text-sm text-red-400">
                      {t(errors[key]!)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6">
              <label htmlFor="contact-subject" className="font-semibold">
                {t("Sujet")}
              </label>
              <select
                id="contact-subject"
                name="subject"
                required
                value={fields.subject}
                disabled={busy}
                onChange={(event) => change("subject", event.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.subject)}
                aria-describedby={errors.subject ? "contact-subject-error" : undefined}
              >
                <option value="">{t("Choisissez un sujet.")}</option>
                {CONTACT_SUBJECTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
              {errors.subject && (
                <p id="contact-subject-error" className="mt-2 text-sm text-red-400">
                  {t(errors.subject)}
                </p>
              )}
            </div>
            <div className="mt-6">
              <label htmlFor="contact-message" className="font-semibold">
                {t("Message")}
              </label>
              <textarea
                id="contact-message"
                name="message"
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                value={fields.message}
                disabled={busy}
                onChange={(event) => change("message", event.target.value)}
                className={`${inputClass} resize-y`}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={`contact-message-hint${errors.message ? " contact-message-error" : ""}`}
              />
              <p id="contact-message-hint" className="mt-2 text-sm text-muted-foreground">
                {t("De 10 à 5 000 caractères.")}
              </p>
              {errors.message && (
                <p id="contact-message-error" className="mt-2 text-sm text-red-400">
                  {t(errors.message)}
                </p>
              )}
            </div>
            <div hidden aria-hidden="true">
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={fields.website}
                onChange={(event) => change("website", event.target.value)}
              />
            </div>
            {failure && (
              <p role="alert" className="mt-6 text-red-400">
                {t(failure)}
              </p>
            )}
            {received && (
              <p role="status" className="mt-6 text-green-400">
                {t("Votre message a bien été reçu par l’administration.")}
              </p>
            )}
            <Button
              type="submit"
              variant="sport"
              disabled={busy}
              className="mt-6 h-auto min-h-12 w-full whitespace-normal py-3 sm:w-auto"
            >
              {busy ? (
                <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Mail aria-hidden="true" />
              )}
              {t(busy ? "Envoi en cours…" : "Envoyer le message")}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
