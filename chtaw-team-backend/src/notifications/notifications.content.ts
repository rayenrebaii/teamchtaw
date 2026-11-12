export interface NotificationSource {
  type: string;
  groupName: string;
  authorName?: string;
  text?: string;
  photo?: boolean;
  session?: boolean;
  startsAt?: Date | null;
  slot?: string;
  studentName?: string;
  absenceCount?: number;
  title?: string;
  body?: string;
}
export const notificationExcerpt = (value: string, max = 400) => {
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};
export function notificationContent(source: NotificationSource, language = "fr", timeZone = "Africa/Tunis") {
  const en = language === "en";
  const author = source.authorName || (en ? "Member" : "Membre");
  let title = source.title || "Team Chtaw", body = source.body || "";
  if (source.type === "MESSAGE" && source.text !== undefined) {
    title = `${author} · ${source.groupName}`;
    body = source.photo ? "Photo" + (source.text ? ` : ${source.text}` : "") : source.text;
  } else if (source.type === "POLL" && source.text !== undefined) {
    title = `${author} · ${source.groupName}`;
    body = `${source.session ? (en ? "Session poll" : "Sondage de séance") : (en ? "Poll" : "Sondage")} : ${source.text}`;
  } else if (source.type.startsWith("SESSION_") && source.text !== undefined) {
    title = `${source.type === "SESSION_24H" ? (en ? "Session tomorrow" : "Séance demain") : (en ? "Session in 1 hour" : "Séance dans 1 heure")} · ${source.groupName}`;
    body = `${author} · ${source.text}${source.slot ? ` · ${source.slot}` : ""}${source.startsAt ? ` · ${new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(source.startsAt)}` : ""}`;
  } else if (source.type === "ABSENCE_ALERT" && source.studentName) {
    title = `${en ? "Absence report" : "Signalement d’absences"} · ${source.groupName}`;
    body = `${source.studentName} · ${source.absenceCount ?? 3} ${en ? "sessions concerned" : "séances concernées"}`;
  }
  return { title: notificationExcerpt(title, 180), body: notificationExcerpt(body, 480) };
}
