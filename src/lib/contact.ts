import { CONTACT_API_URL } from "./site";

export const CONTACT_SUBJECTS = [
  ["registration", "Inscription"],
  ["approval", "Validation du compte"],
  ["login", "Problème de connexion"],
  ["sessions", "Séances et groupes"],
  ["other", "Autre demande"],
] as const;
export type ContactFields = {
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string;
};
export function validateContact(fields: ContactFields) {
  const errors: Partial<Record<keyof ContactFields, string>> = {};
  if (fields.name.trim().length < 2 || fields.name.trim().length > 120)
    errors.name = "Indiquez un nom de 2 à 120 caractères.";
  if (fields.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()))
    errors.email = "Indiquez une adresse e-mail valide.";
  if (!CONTACT_SUBJECTS.some(([value]) => value === fields.subject))
    errors.subject = "Choisissez un sujet.";
  if (fields.message.trim().length < 10 || fields.message.trim().length > 5000)
    errors.message = "Votre message doit contenir de 10 à 5 000 caractères.";
  return errors;
}
export async function sendContact(fields: ContactFields) {
  if (!CONTACT_API_URL)
    throw new Error("Le formulaire est temporairement indisponible. Veuillez réessayer plus tard.");
  let response: Response;
  try {
    response = await fetch(CONTACT_API_URL, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...fields,
        name: fields.name.trim(),
        email: fields.email.trim(),
        message: fields.message.trim(),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Connexion impossible. Votre texte est conservé ; réessayez.");
  }
  if (response.status === 429)
    throw new Error("Trop de demandes. Patientez 15 minutes avant de réessayer.");
  if (response.status === 400)
    throw new Error("Vérifiez vos champs : la demande a été refusée par le serveur.");
  if (!response.ok) throw new Error("Le message n’a pas pu être envoyé. Votre texte est conservé.");
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    /* Invalid acknowledgements are failures. */
  }
  if (!result || typeof result !== "object" || !("received" in result) || result.received !== true)
    throw new Error("Le serveur n’a pas confirmé la réception. Votre texte est conservé.");
}
