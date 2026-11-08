import { describe, expect, it } from "vitest";
import {
  defaultRequestFilters,
  filterRequests,
  isValidRequestPeriod,
  requestDay,
} from "./requests";
import type { Group, User } from "@/types";

const users: User[] = [
  {
    id: "a",
    firstName: "Amine",
    lastName: "Ben Ali",
    email: "amine@example.test",
    joinedAt: "2026-10-01T10:00:00",
    status: "PENDING",
    role: "USER",
    bio: "",
  },
  {
    id: "b",
    firstName: "Sara",
    lastName: "Mansour",
    email: "sara@example.test",
    joinedAt: "2026-10-02T23:59:59",
    status: "APPROVED",
    role: "USER",
    bio: "",
  },
  {
    id: "c",
    firstName: "Ali",
    lastName: "Mansour",
    email: "ali@example.test",
    joinedAt: "2026-10-03T00:00:00",
    status: "REJECTED",
    role: "USER",
    bio: "",
  },
];
const filters = { ...defaultRequestFilters, status: "ALL" as const };
describe("Recherche et filtres des demandes", () => {
  it("recherche le prénom, le nom et le nom complet sans tenir compte de la casse", () => {
    expect(filterRequests(users, { ...filters, search: "AMINE" }).map((u) => u.id)).toEqual(["a"]);
    expect(filterRequests(users, { ...filters, search: "mansour" })).toHaveLength(2);
    expect(
      filterRequests(users, { ...filters, search: " BEN ALI Amine " }).map((u) => u.id),
    ).toEqual(["a"]);
  });
  it("recherche par email", () => {
    expect(
      filterRequests(users, { ...filters, search: "SARA@EXAMPLE.TEST" }).map((u) => u.id),
    ).toEqual(["b"]);
  });
  it("inclut la totalité du jour exact et les bornes de l’intervalle", () => {
    expect(
      filterRequests(users, { ...filters, start: "2026-10-02", end: "2026-10-02" }).map(
        (u) => u.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterRequests(users, { ...filters, start: "2026-10-01", end: "2026-10-02" }).map(
        (u) => u.id,
      ),
    ).toEqual(["b", "a"]);
    expect(requestDay("2026-10-02T23:59:59")).toBe("2026-10-02");
  });
  it("combine recherche, statut et dates et accepte une borne unique", () => {
    expect(
      filterRequests(users, {
        ...filters,
        search: "mansour",
        status: "APPROVED",
        start: "2026-10-02",
        end: "2026-10-03",
      }).map((u) => u.id),
    ).toEqual(["b"]);
    expect(filterRequests(users, { ...filters, start: "2026-10-03" }).map((u) => u.id)).toEqual([
      "c",
    ]);
    expect(filterRequests(users, { ...filters, end: "2026-10-01" }).map((u) => u.id)).toEqual([
      "a",
    ]);
  });
  it("trie par création dans les deux sens sans modifier les données", () => {
    expect(filterRequests(users, filters).map((u) => u.id)).toEqual(["c", "b", "a"]);
    expect(filterRequests(users, { ...filters, order: "oldest" }).map((u) => u.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(users.map((u) => u.id)).toEqual(["a", "b", "c"]);
    expect(filterRequests(users, { ...filters, search: "inconnu" })).toEqual([]);
  });
  it("combine groupe, statut, recherche et période sans dupliquer les membres", () => {
    const groups: Group[] = [
      {
        id: "running",
        name: "Running",
        description: "",
        color: "#aabbcc",
        isGeneral: false,
        memberIds: ["a", "b"],
      },
      {
        id: "general",
        name: "Général",
        description: "",
        color: "#aabbcc",
        isGeneral: true,
        memberIds: ["a", "b", "c"],
      },
    ];
    expect(
      filterRequests(users, { ...filters, groupId: "running" }, groups).map((u) => u.id),
    ).toEqual(["b", "a"]);
    expect(
      filterRequests(
        users,
        {
          ...filters,
          groupId: "running",
          status: "APPROVED",
          search: "sara",
          start: "2026-10-02",
          end: "2026-10-02",
        },
        groups,
      ).map((u) => u.id),
    ).toEqual(["b"]);
    expect(filterRequests(users, { ...filters, groupId: "missing" }, groups)).toEqual([]);
    expect(filterRequests(users, { ...filters, groupId: "general" }, groups)).toHaveLength(3);
  });
  it("valide les périodes ouvertes ou sur une journée et refuse les bornes inversées", () => {
    expect(isValidRequestPeriod("", "")).toBe(true);
    expect(isValidRequestPeriod("2026-10-02", "")).toBe(true);
    expect(isValidRequestPeriod("", "2026-10-02")).toBe(true);
    expect(isValidRequestPeriod("2026-10-02", "2026-10-02")).toBe(true);
    expect(isValidRequestPeriod("2026-10-03", "2026-10-02")).toBe(false);
    expect(filterRequests(users, { ...filters, start: "2026-10-03", end: "2026-10-02" })).toEqual(
      [],
    );
  });
  it("restaure le filtre initial des demandes en attente", () => {
    expect(filterRequests(users, { ...defaultRequestFilters }).map((u) => u.id)).toEqual(["a"]);
  });
});
it("déduplique les comptes sans compter plusieurs affectations", () => {
  expect(filterRequests([...users, users[0]!], filters)).toHaveLength(3);
});

