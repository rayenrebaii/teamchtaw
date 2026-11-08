import { personalAttendance, PersonalQuery, PersonalSession } from "../src/polls/personal-attendance";
const query: PersonalQuery = { page: 1, limit: 20, order: "recommended", timeZone: "Africa/Tunis" };
const now = new Date("2026-10-10T08:00:00Z");
function session(id: string, start: string, final = "EN_ATTENTE", end?: string): PersonalSession {
  return { id, question: id, groupId: "group", groupName: "G1", description: "", status: "OPEN", final, mandatoryAttendance: true, slots: [{ optionId: "slot", label: "Créneau", startsAt: new Date(start), endsAt: end ? new Date(end) : null }], selections: [] };
}
describe("Présences personnelles : temps, statuts et filtres", () => {
  it.each(["2026-10-10T13:00:00Z", "2026-10-11T10:00:00Z", "2027-01-01T10:00:00Z"])("classe la séance future %s sans absence ni séance terminée", (start) => {
    const result = personalAttendance([session("future", start, "ABSENT")], query, now);
    expect(result.items[0]!.attendanceStatus).toBe("UPCOMING");
    expect(result.stats).toEqual({ completed: 0, present: 0, absent: 0, upcoming: 1 });
  });
  it("n’invente pas d’absence pour un statut inconnu passé ou en cours", () => {
    const result = personalAttendance([session("past", "2026-10-01T10:00:00Z", "NON_INSCRIT", "2026-10-01T11:00:00Z"), session("ongoing", "2026-10-10T07:30:00Z", "EN_ATTENTE", "2026-10-10T09:00:00Z")], query, now);
    expect(result.items.map((item) => item.attendanceStatus)).toEqual(["PENDING", "PENDING"]);
    expect(result.stats.completed).toBe(1);
    expect(result.stats.absent).toBe(0);
  });
  it("conserve les validations officielles et exclut les annulations", () => {
    const present = session("present", "2026-10-01T10:00:00Z", "PRESENT", "2026-10-01T11:00:00Z");
    const absent = session("absent", "2026-10-02T10:00:00Z", "ABSENT", "2026-10-02T11:00:00Z");
    const cancelled = { ...session("cancelled", "2026-10-03T10:00:00Z", "ABSENT", "2026-10-03T11:00:00Z"), status: "CANCELLED" };
    const result = personalAttendance([present, absent, cancelled], query, now);
    expect(result.stats).toEqual({ completed: 2, present: 1, absent: 1, upcoming: 0 });
    expect(result.items[0]!.attendanceStatus).toBe("CANCELLED");
  });
  it("utilise le jour dans le fuseau demandé, y compris aux changements de mois", () => {
    const boundary = session("boundary", "2026-10-31T23:30:00Z");
    expect(personalAttendance([boundary], { ...query, from: "2026-11-01", to: "2026-11-01" }, now).total).toBe(1);
    expect(personalAttendance([boundary], { ...query, timeZone: "UTC", from: "2026-11-01" }, now).total).toBe(0);
    expect(personalAttendance([session("newyear", "2026-12-31T23:30:00Z")], { ...query, from: "2027-01-01", to: "2027-01-01" }, now).total).toBe(1);
  });
  it("respecte les décalages horaires d’été et les offsets ISO", () => {
    const slot = session("offset", "2026-10-10T14:00:00+01:00");
    expect(personalAttendance([slot], query, new Date("2026-10-10T12:59:59Z")).items[0]!.attendanceStatus).toBe("UPCOMING");
    expect(personalAttendance([slot], query, new Date("2026-10-10T13:00:00Z")).items[0]!.attendanceStatus).toBe("PENDING");
    expect(personalAttendance([session("dst", "2026-10-25T00:30:00Z")], { ...query, timeZone: "Europe/Paris", from: "2026-10-25", to: "2026-10-25" }, now).total).toBe(1);
  });
  it("ne déduit pas la fin d’une séance quand aucune heure de fin n’existe", () => {
    const result = personalAttendance([session("legacy", "2026-10-01T10:00:00Z", "PRESENT")], query, now);
    expect(result.items[0]!.attendanceStatus).toBe("PRESENT");
    expect(result.stats.completed).toBe(0);
    expect(result.incompleteSchedules).toBe(true);
  });
  it("gère un horaire absent sans utiliser la création du sondage", () => {
    const missing = { ...session("missing", "2026-10-01T10:00:00Z"), slots: [] };
    const result = personalAttendance([missing], query, now);
    expect(result.items[0]!.startsAt).toBeNull();
    expect(result.items[0]!.attendanceStatus).toBe("PENDING");
    expect(result.stats.completed).toBe(0);
  });
  it("trie les futures en ordre croissant et l’historique en ordre décroissant", () => {
    const result = personalAttendance([session("later", "2026-10-15T10:00:00Z"), session("old", "2026-09-01T10:00:00Z"), session("soon", "2026-10-11T10:00:00Z"), session("recent", "2026-10-09T10:00:00Z")], query, now);
    expect(result.items.map((item) => item.id)).toEqual(["soon", "later", "recent", "old"]);
  });
  it("combine statut, groupe et période, déduplique et pagine", () => {
    const first = session("first", "2026-10-11T10:00:00Z"), second = session("second", "2026-10-12T10:00:00Z");
    const result = personalAttendance([first, first, second, { ...first, id: "other", groupId: "other" }], { ...query, status: "UPCOMING", groupId: "group", from: "2026-10-11", to: "2026-10-12", limit: 1, page: 2 }, now);
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(["second"]);
  });
  it("utilise les créneaux choisis pour une séance historique à choix", () => {
    const legacy = { ...session("legacy", "2026-10-01T10:00:00Z"), mandatoryAttendance: false, slots: [{ optionId: "past", label: "old", startsAt: new Date("2026-10-01T10:00:00Z"), endsAt: null }, { optionId: "future", label: "future", startsAt: new Date("2026-10-12T10:00:00Z"), endsAt: null }], selections: [{ optionId: "future" }] };
    expect(personalAttendance([legacy], query, now).items[0]!.attendanceStatus).toBe("UPCOMING");
  });
});
