import { describe, expect, it, vi } from "vitest";
import { addSelectedGroupMembers } from "./group-creation";
import type { Group, User } from "@/types";

const user = (
  id: string,
  status: User["status"] = "APPROVED",
  role: User["role"] = "USER",
): User => ({
  id,
  status,
  role,
  firstName: id,
  lastName: "Test",
  email: `${id}@example.test`,
  bio: "",
  joinedAt: "2026-11-04T10:00:00",
});
const group: Group = {
  id: "group",
  name: "Course",
  description: "",
  color: "#aabbcc",
  isGeneral: false,
  memberIds: ["admin"],
};

describe("Membres sélectionnés lors de la création d’un groupe", () => {
  it("ajoute seulement les utilisateurs approuvés sélectionnés et laisse les admins automatiques", async () => {
    const add = vi.fn(async (_id: string, id: string) => ({
      ...group,
      memberIds: [...group.memberIds, id],
    }));
    const receive = vi.fn();
    const result = await addSelectedGroupMembers(
      group,
      [
        user("member"),
        user("other"),
        user("pending", "PENDING"),
        user("rejected", "REJECTED"),
        user("admin", "APPROVED", "ADMIN"),
      ],
      ["member", "member", "pending", "rejected", "admin"],
      add,
      receive,
    );
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("group", "member");
    expect(result.memberIds).toEqual(["admin", "member"]);
    expect(receive).toHaveBeenCalledWith(result);
  });
  it("conserve les ajouts réussis et reprend uniquement les membres manquants après un échec", async () => {
    let current = group;
    const receive = (updated: Group) => {
      current = updated;
    };
    const add = vi.fn(async (_id: string, id: string) => {
      if (id === "second") throw Error("Connexion interrompue");
      return { ...current, memberIds: [...current.memberIds, id] };
    });
    const users = [user("first"), user("second")];
    await expect(
      addSelectedGroupMembers(current, users, ["first", "second"], add, receive),
    ).rejects.toThrow("Connexion interrompue");
    expect(current.memberIds).toEqual(["admin", "first"]);
    const retry = vi.fn(async (_id: string, id: string) => ({
      ...current,
      memberIds: [...current.memberIds, id],
    }));
    const result = await addSelectedGroupMembers(
      current,
      users,
      ["first", "second"],
      retry,
      receive,
    );
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith("group", "second");
    expect(result.memberIds).toEqual(["admin", "first", "second"]);
  });
  it("permet une création sans membre supplémentaire", async () => {
    const add = vi.fn();
    expect(await addSelectedGroupMembers(group, [user("member")], [], add, vi.fn())).toEqual(group);
    expect(add).not.toHaveBeenCalled();
  });
});
