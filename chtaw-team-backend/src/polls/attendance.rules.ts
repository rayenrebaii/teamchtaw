export type FinalAttendance = "NON_INSCRIT" | "EN_ATTENTE" | "PRESENT" | "ABSENT";
export function finalAttendance(statuses: readonly string[]): FinalAttendance {
  if (!statuses.length) return "NON_INSCRIT";
  if (statuses.includes("PRESENT")) return "PRESENT";
  if (statuses.every((status) => status === "ABSENT")) return "ABSENT";
  return "EN_ATTENTE";
}
