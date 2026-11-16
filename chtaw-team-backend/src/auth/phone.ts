export function normalizeTunisianPhone(value: unknown) {
  if (typeof value !== "string") return value;
  const phone = value.replace(/[\s()\-]/g, "");
  if (/^\d{8}$/.test(phone)) return `+216${phone}`;
  if (/^00216\d{8}$/.test(phone)) return `+${phone.slice(2)}`;
  return phone;
}
