import { expect, it } from "vitest";
import { attendanceCsv } from "./attendance-export";
import type { Roster } from "@/services/attendance.service";

it("exports selected slots in Tunis time and escapes spreadsheet formulas, quotes and separators", () => {
  const roster = { question: '=HYPERLINK("unsafe")', group: { name: "G;1" }, slots: [
    { id: "chosen", label: "Selected", startsAt: "2026-11-24T23:30:00Z", students: [{ user: { firstName: "+formula", lastName: 'A"B', email: "a@example.invalid" }, attendance: "NON_VERIFIE", final: "EN_ATTENTE" }] },
    { id: "other", label: "Unselected", startsAt: "2026-11-24T23:30:00Z", students: [] },
  ] } as Roster;
  const csv = attendanceCsv([{ roster, optionIds: ["chosen"] }], "fr-FR", key => key);
  expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
  expect(csv).toContain('"G;1"');
  expect(csv).toContain('"\'+formula"');
  expect(csv).toContain('"A""B"');
  expect(csv).toContain("25/11/2026 00:30");
  expect(csv).not.toContain("Unselected");
  expect(() => attendanceCsv([{ roster, optionIds: ["missing"] }], "fr-FR", key => key)).toThrow();
});
