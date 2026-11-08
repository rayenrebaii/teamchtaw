import "reflect-metadata";
import { finalAttendance } from "../src/polls/attendance.rules";
import { validatePoll } from "../src/polls/polls.validation";
import { CreatePollDto } from "../src/polls/polls.dto";
import {
  allSessionSlotsAbsent,
  mandatoryFinal,
  sessionFinished,
} from "../src/polls/attendance.reconcile";
import { MandatoryAttendanceService } from "../src/polls/mandatory-attendance.service";
import { PrismaService } from "../src/prisma/prisma.module";
import { AccessService } from "../src/common/access";
import { DomainEvents } from "../src/common/events";

describe("Détection automatique sans administrateur connecté", () => {
  it("déclenche une reprise au démarrage, travaille toutes les minutes et s’arrête proprement", async () => {
    jest.useFakeTimers();
    const service = new MandatoryAttendanceService(
      {} as PrismaService,
      {} as AccessService,
      {} as DomainEvents,
    );
    const detection = jest.spyOn(service, "processDueSessions").mockResolvedValue();
    try {
      service.onModuleInit();
      expect(detection).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60000);
      expect(detection).toHaveBeenCalledTimes(2);
      await service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(60000);
      expect(detection).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Présences obligatoires : vote et absence distincts", () => {
  it("lit le résultat global confirmé et fait primer une présence", () => {
    expect(
      mandatoryFinal({
        absenceConfirmedAt: null,
        marks: [{ attendance: "ABSENT" }, { attendance: "ABSENT" }],
      }),
    ).toBe("EN_ATTENTE");
    expect(mandatoryFinal({ absenceConfirmedAt: null, marks: [] })).toBe("EN_ATTENTE");
    expect(
      mandatoryFinal({ absenceConfirmedAt: new Date(), marks: [{ attendance: "PRESENT" }] }),
    ).toBe("PRESENT");
    expect(mandatoryFinal({ absenceConfirmedAt: new Date(), marks: [] })).toBe("ABSENT");
    expect(mandatoryFinal({ included: false, absenceConfirmedAt: new Date(), marks: [] })).toBe(
      "NON_CONCERNE",
    );
  });
  it("exige un pointage absent explicite pour chaque créneau réel de la séance", () => {
    const options = [{ id: "a" }, { id: "b" }];
    expect(allSessionSlotsAbsent(options, [{ optionId: "a", attendance: "ABSENT" }])).toBe(false);
    expect(
      allSessionSlotsAbsent(options, [
        { optionId: "a", attendance: "ABSENT" },
        { optionId: "b", attendance: "NON_VERIFIE" },
      ]),
    ).toBe(false);
    expect(
      allSessionSlotsAbsent(options, [
        { optionId: "a", attendance: "ABSENT" },
        { optionId: "b", attendance: "PRESENT" },
      ]),
    ).toBe(false);
    expect(
      allSessionSlotsAbsent(options, [
        { optionId: "a", attendance: "ABSENT" },
        { optionId: "b", attendance: "ABSENT" },
      ]),
    ).toBe(true);
    expect(
      allSessionSlotsAbsent(options, [
        { optionId: "a", attendance: "ABSENT" },
        { optionId: "other", attendance: "ABSENT" },
      ]),
    ).toBe(false);
    expect(allSessionSlotsAbsent([], [])).toBe(false);
  });
  it("attend la fin du dernier créneau et n’invente pas une fin pour une ancienne séance", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(
      sessionFinished(
        [
          { endsAt: new Date("2026-11-04T11:00:00Z") },
          { endsAt: new Date("2026-11-04T13:00:00Z") },
        ],
        now,
      ),
    ).toBe(false);
    expect(sessionFinished([{ endsAt: now }], now)).toBe(true);
    expect(sessionFinished([{ endsAt: null }], now)).toBe(false);
    expect(sessionFinished([], now)).toBe(false);
  });
});
describe("Résultat final d’une séance pour N horaires", () => {
  it.each([1, 2, 3, 5, 10, 100])("compte une seule absence pour %i horaires absents", (count) => {
    expect(finalAttendance(Array(count).fill("ABSENT"))).toBe("ABSENT");
  });
  it.each([0, 1, 2, 4, 9])(
    "une présence à la position %i prime sur toutes les absences",
    (position) => {
      const statuses = Array(10).fill("ABSENT");
      statuses[position] = "PRESENT";
      expect(finalAttendance(statuses)).toBe("PRESENT");
    },
  );
  it("garde un pointage partiel en attente, mais une présence confirmée suffit", () => {
    expect(finalAttendance(["ABSENT", "ABSENT", "NON_VERIFIE"])).toBe("EN_ATTENTE");
    expect(finalAttendance(["PRESENT", "NON_VERIFIE", "NON_VERIFIE"])).toBe("PRESENT");
    expect(finalAttendance(["PRESENT", "PRESENT"])).toBe("PRESENT");
  });
  it("ne pénalise pas un étudiant sans vote", () =>
    expect(finalAttendance([])).toBe("NON_INSCRIT"));
});
describe("Validation des sondages", () => {
  const input: CreatePollDto = {
    type: "SESSION",
    mandatoryAttendance: false,
    question: "Maths",
    options: ["Lundi"],
    singleChoice: false,
    endsAt: "2099-01-01T10:00:00Z",
    startsAt: ["2099-01-02T10:00:00Z"],
  };
  it("exige les fins réelles des nouvelles séances obligatoires", () => {
    expect(() => validatePoll({ ...input, mandatoryAttendance: true })).toThrow();
    expect(() =>
      validatePoll({ ...input, mandatoryAttendance: true, slotEndsAt: [input.startsAt![0]!] }),
    ).toThrow();
    expect(() =>
      validatePoll({ ...input, mandatoryAttendance: true, slotEndsAt: ["2099-01-02T12:00:00Z"] }),
    ).not.toThrow();
  });
  it("autorise une séance avec un horaire et préserve le minimum des sondages ordinaires", () => {
    expect(() => validatePoll(input)).not.toThrow();
    expect(() => validatePoll({ ...input, type: "ORDINARY", startsAt: undefined })).toThrow();
  });
  it("refuse les horaires incomplets, dupliqués ou antérieurs à la clôture", () => {
    expect(() => validatePoll({ ...input, startsAt: [] })).toThrow();
    expect(() =>
      validatePoll({
        ...input,
        options: ["Un", "Deux"],
        startsAt: [input.startsAt![0]!, input.startsAt![0]!],
      }),
    ).toThrow();
    expect(() => validatePoll({ ...input, startsAt: [input.endsAt!] })).toThrow();
    expect(() => validatePoll({ ...input, singleChoice: true })).toThrow();
  });
});
