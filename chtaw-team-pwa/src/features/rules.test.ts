import { describe, it, expect } from "vitest";
import { seed } from "@/mocks/seed";
import { access, review, membership, post, vote, publishPoll } from "./rules";
describe("Validation des comptes", () => {
  it("réserve la validation à un administrateur approuvé", () => {
    const d = seed();
    expect(() => review(d, d.users[1], "u13", "APPROVED")).toThrow();
    expect(() => review(d, d.users[13], "u13", "APPROVED")).toThrow();
  });
  it("ajoute un compte approuvé au général, sans accès aux groupes privés", () => {
    const d = seed();
    const next = review(d, d.users[0], "u13", "APPROVED");
    expect(next.users[13].status).toBe("APPROVED");
    expect(next.groups[0].memberIds).toContain("u13");
    expect(next.groups[1].memberIds).not.toContain("u13");
    expect(() => review(next, next.users[0], "u13", "APPROVED")).toThrow();
  });
  it("refuse une demande sans donner accès aux conversations", () => {
    const d = seed();
    const next = review(d, d.users[0], "u13", "REJECTED");
    expect(next.users[13].status).toBe("REJECTED");
    expect(() => access(next.users[13], next.groups[0])).toThrow();
  });
});
describe("Appartenance aux groupes", () => {
  it("permet une affectation puis un retrait sans doublon", () => {
    const d = seed();
    const a = membership(d, d.users[0], "weekend", "u1", true);
    const b = membership(a, a.users[0], "weekend", "u1", true);
    expect(b.groups[3].memberIds.filter((id) => id === "u1")).toHaveLength(1);
    expect(() => access(b.users[1], b.groups[3])).not.toThrow();
    const c = membership(b, b.users[0], "weekend", "u1", false);
    expect(() => access(c.users[1], c.groups[3])).toThrow();
  });
  it("protège le groupe système et interdit les comptes non approuvés", () => {
    const d = seed();
    expect(() => membership(d, d.users[0], "general", "u1", false)).toThrow();
    expect(() => membership(d, d.users[0], "running", "u13", true)).toThrow();
    expect(() => membership(d, d.users[1], "running", "u2", false)).toThrow();
  });
});
describe("Publications", () => {
  it("autorise le texte pour un membre du groupe", () => {
    const d = seed();
    expect(
      post(d, d.users[1], {
        id: "test",
        groupId: "running",
        authorId: "u1",
        kind: "text",
        text: "Bonjour",
        createdAt: new Date().toISOString(),
      }).messages,
    ).toHaveLength(d.messages.length + 1);
  });
  it("interdit les photos et sondages aux membres ordinaires", () => {
    const d = seed();
    for (const kind of ["photo", "poll"] as const)
      expect(() =>
        post(d, d.users[1], {
          id: "test",
          groupId: "general",
          authorId: "u1",
          kind,
          text: "",
          createdAt: new Date().toISOString(),
        }),
      ).toThrow();
    expect(() => publishPoll(d, d.users[1], d.polls[0])).toThrow();
  });
  it("refuse un message hors groupe et un expéditeur usurpé", () => {
    const d = seed();
    expect(() =>
      post(d, d.users[1], {
        id: "test",
        groupId: "weekend",
        authorId: "u1",
        kind: "text",
        text: "Bonjour",
        createdAt: "",
      }),
    ).toThrow();
    expect(() =>
      post(d, d.users[1], {
        id: "test",
        groupId: "general",
        authorId: "u0",
        kind: "text",
        text: "Bonjour",
        createdAt: "",
      }),
    ).toThrow();
  });
  it("autorise une photo admin et valide les options du sondage", () => {
    const d = seed();
    expect(
      post(d, d.users[0], {
        id: "test",
        groupId: "general",
        authorId: "u0",
        kind: "photo",
        text: "Sortie",
        photoUrl: "/test.png",
        createdAt: "",
      }).messages,
    ).toHaveLength(d.messages.length + 1);
    expect(() =>
      publishPoll(d, d.users[0], { ...d.polls[0], options: [{ id: "a", label: "Oui" }] }),
    ).toThrow();
  });
});
describe("Votes", () => {
  it("enregistre un vote unique et refuse la seconde participation", () => {
    const d = seed();
    const next = vote(d, d.users[1], d.polls[0].id, ["b"]);
    expect(next.polls[0].votes).toHaveLength(4);
    expect(() => vote(next, next.users[1], d.polls[0].id, ["a"])).toThrow();
  });
  it("refuse les options inconnues, les choix multiples et les non membres", () => {
    const d = seed();
    expect(() => vote(d, d.users[1], d.polls[0].id, ["unknown"])).toThrow();
    expect(() => vote(d, d.users[1], d.polls[0].id, ["a", "b"])).toThrow();
    expect(() => vote(d, d.users[1], d.polls[3].id, ["a"])).toThrow();
  });
  it("ferme un sondage à sa date de fin", () => {
    const d = seed();
    d.polls[0].endsAt = "2020-01-01T00:00:00Z";
    expect(() => vote(d, d.users[1], d.polls[0].id, ["a"])).toThrow();
  });
  it("autorise plusieurs choix dans une seule participation si configuré", () => {
    const d = seed();
    d.polls[0].singleChoice = false;
    const next = vote(d, d.users[1], d.polls[0].id, ["a", "b"]);
    expect(next.polls[0].votes.at(-1)?.optionIds).toEqual(["a", "b"]);
    expect(() => vote(next, next.users[1], d.polls[0].id, ["c"])).toThrow();
  });
});
