import type { Roster } from "@/services/attendance.service";
import { attendanceLabels } from "./session-polls";

export function attendanceCsv(lists: { roster: Roster; optionIds: string[] }[], locale: string, t: (key: string) => string) {
  const rows: string[][] = [["Séance", "Groupe", "Horaire", "Date et horaire", "Prénom", "Nom", "E-mail", "Pointage", "État"].map(t)];
  for (const { roster, optionIds } of lists) {
    for (const id of optionIds) {
      const slot = roster.slots.find(item => item.id === id);
      if (!slot) throw Error("Un horaire sélectionné n’est plus disponible. Actualisez la liste.");
      const prefix = [roster.question, roster.groups?.map(group => group.name).join(" · ") || roster.group.name, slot.label,
        slot.startsAt ? new Date(slot.startsAt).toLocaleString(locale, { timeZone: "Africa/Tunis", dateStyle: "short", timeStyle: "short" }) : ""];
      if (!slot.students.length) rows.push([...prefix, "", "", "", t("Aucun inscrit"), ""]);
      for (const student of slot.students) rows.push([...prefix, student.user.firstName, student.user.lastName, student.user.email,
        t(attendanceLabels[student.attendance] || student.attendance), t(attendanceLabels[student.final] || student.final)]);
    }
  }
  const cell = (value: string) => {
    // Spreadsheet applications must interpret user-controlled values as text.
    const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n");
}
