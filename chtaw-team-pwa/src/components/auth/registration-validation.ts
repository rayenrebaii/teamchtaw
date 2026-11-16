import { z } from "zod";

export const registrationSchema = z.object({
  firstName: z.string().trim().min(2, "Au moins 2 caractères.").max(60, "60 caractères maximum."),
  lastName: z.string().trim().min(2, "Au moins 2 caractères.").max(60, "60 caractères maximum."),
  email: z.email("Adresse email invalide."),
  phone: z.string().regex(/^\d{8}$/, "Saisissez un numéro tunisien de 8 chiffres (+216)."),
  password: z.string().min(12, "Au moins 12 caractères.").max(128, "128 caractères maximum."),
  confirm: z.string(),
}).refine(values => values.password === values.confirm, { path: ["confirm"], message: "Les mots de passe ne correspondent pas." });
export type RegistrationValues = z.infer<typeof registrationSchema>;

export function registrationServerError(message: string): { step: number; field?: keyof RegistrationValues; school?: boolean; message: string } {
  if (/établissement|lycée|establishment/i.test(message)) return {
    step: 1, school: true,
    message: /proposedEstablishmentName/.test(message) ? "Vérifiez le nom de votre lycée (120 caractères maximum)." : /establishmentId/.test(message) ? "Ce lycée n’est plus disponible. Choisissez un autre lycée." : message,
  };
  if (/firstName|prénom/i.test(message)) return { step: 0, field: "firstName", message: /firstName/.test(message) ? "Vérifiez votre prénom." : message };
  if (/lastName/i.test(message)) return { step: 0, field: "lastName", message: "Vérifiez votre nom." };
  if (/phone|téléphone|numéro/i.test(message)) return { step: 2, field: "phone", message: "Saisissez un numéro tunisien de 8 chiffres (+216)." };
  if (/email|e-mail/i.test(message)) return { step: 2, field: "email", message };
  return { step: 2, message };
}
