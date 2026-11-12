import { notificationContent, notificationExcerpt } from "../src/notifications/notifications.content";
describe("Notification source previews", () => {
  it("shows the sender, group and actual message instead of a generic notice", () => {
    expect(notificationContent({ type: "MESSAGE", groupName: "G1", authorName: "Nadia Team", text: "Bonjour\nà tous !" })).toEqual({ title: "Nadia Team · G1", body: "Bonjour à tous !" });
  });
  it.each(["fr", "en"])("identifies a session poll and preserves its question in %s", (language) => {
    const copy = notificationContent({ type: "POLL", groupName: "G1", authorName: "Coach", session: true, text: "Entraînement mardi" }, language);
    expect(copy.title).toBe("Coach · G1"); expect(copy.body).toContain("Entraînement mardi");
    expect(copy.body).toContain(language === "en" ? "Session poll" : "Sondage de séance");
  });
  it("identifies a photo and its caption", () => {
    expect(notificationContent({ type: "MESSAGE", groupName: "G1", photo: true, text: "Notre équipe" }).body).toBe("Photo : Notre équipe");
  });
  it("includes the organizer, session, slot and start time in reminders", () => {
    const copy = notificationContent({ type: "SESSION_1H", groupName: "G1", authorName: "Coach", text: "Danse", slot: "Matin", startsAt: new Date("2099-01-02T10:00:00Z") }, "fr");
    expect(copy.title).toContain("dans 1 heure");
    for (const value of ["Coach", "Danse", "Matin", "11:00"]) expect(copy.body).toContain(value);
  });
  it("bounds payload sizes and collapses whitespace", () => {
    expect(notificationExcerpt(" a\n\t b ")).toBe("a b");
    const copy = notificationContent({ type: "MESSAGE", authorName: "X".repeat(200), groupName: "G".repeat(100), text: "T".repeat(4000) });
    expect(copy.title.length).toBeLessThanOrEqual(180); expect(copy.body.length).toBeLessThanOrEqual(480);
  });
});
