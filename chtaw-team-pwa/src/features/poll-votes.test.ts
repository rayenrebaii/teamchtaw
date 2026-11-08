import { expect, it } from "vitest";
import { pollVoteLists } from "./poll-votes";
import type { Group, Poll, User } from "@/types";
const user = (id: string, status: User["status"] = "APPROVED"): User => ({ id, firstName: id, lastName: "Team", email: `${id}@test.invalid`, role: "USER", status, joinedAt: "2026-01-01T00:00:00Z", bio: "" });
const group: Group = { id: "group", name: "G1", description: "", color: "#be9af5", isGeneral: false, memberIds: ["multi", "empty", "waiting", "none"] };
const poll: Poll = { id: "poll", groupId: group.id, authorId: "admin", question: "Question", singleChoice: false,
  options: [{ id: "a", label: "Choix A" }, { id: "b", label: "Choix B" }, { id: "c", label: "Choix C" }],
  votes: [{ userId: "multi", optionIds: ["a", "b"] }, { userId: "multi", optionIds: ["a"] }, { userId: "empty", optionIds: [] }, { userId: "former", optionIds: ["b"] }] };
it("groups real voters by choice, deduplicates them and finds only current approved group members without a choice", () => {
  const result = pollVoteLists(poll, group, [user("multi"), user("empty"), user("none"), user("waiting", "PENDING"), user("outsider"), user("former")]);
  expect(result.choices.map((choice) => choice.voterIds)).toEqual([["multi"], ["multi", "former"], []]);
  expect(result.voterCount).toBe(2);
  expect(result.nonVoters?.map((member) => member.id)).toEqual(["empty", "none"]);
});
it("does not invent a non-voter list when the group is unavailable", () => {
  expect(pollVoteLists(poll, undefined, [user("outsider")]).nonVoters).toBeNull();
});
it("lists all group members as non-voters when nobody has voted", () => {
  expect(pollVoteLists({ ...poll, votes: [] }, group, [user("multi"), user("none")]).nonVoters?.map((member) => member.id)).toEqual(["multi", "none"]);
});
it("includes administrators for ordinary polls and excludes them from session polls where they cannot vote", () => {
  const admin = { ...user("admin"), role: "ADMIN" as const };
  const members = { ...group, memberIds: [admin.id, "none"] };
  expect(pollVoteLists({ ...poll, type: "ORDINARY" }, members, [admin, user("none")]).nonVoters?.map((member) => member.id)).toEqual(["admin", "none"]);
  expect(pollVoteLists({ ...poll, type: "SESSION" }, members, [admin, user("none")]).nonVoters?.map((member) => member.id)).toEqual(["none"]);
});
