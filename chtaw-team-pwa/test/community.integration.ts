import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { io, type Socket } from "socket.io-client";
import { api, ApiClient } from "@/services/api-client";
import { useCommunity } from "@/stores/community";
import { RealtimeService } from "@/services/realtime.service";
import { UploadsService } from "@/services/uploads.service";
import { groupsService } from "@/services/groups.service";
import { pollsService } from "@/services/polls.service";
import { attendanceService, type Roster, type StudentHistory } from "@/services/attendance.service";
import type { User, Group, Message, Poll } from "@/types";
const nativeFetch = globalThis.fetch.bind(globalThis);
function browserFetch() {
  const cookies = new Map<string, string>();
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Origin", "http://127.0.0.1:3001");
    const url = new URL(String(input));
    if (url.pathname.startsWith("/api/v1/auth") && cookies.size)
      headers.set("Cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const result = await nativeFetch(input, { ...init, headers });
    for (const value of result.headers.getSetCookie()) {
      const part = value.split(";")[0]!;
      const index = part.indexOf("=");
      const key = part.slice(0, index);
      const token = part.slice(index + 1);
      if (token) cookies.set(key, token);
      else cookies.delete(key);
    }
    return result;
  };
  return { fetcher, cookies };
}
async function until(check: () => boolean) {
  const end = Date.now() + 10000;
  while (!check()) {
    if (Date.now() > end) throw Error("État réel attendu non reçu.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
describe("Frontend réel → NestJS → PostgreSQL → Socket.IO", () => {
  const base = "http://127.0.0.1:3102/api/v1";
  const memberBrowser = browserFetch();
  const adminBrowser = browserFetch();
  const admin = new ApiClient(base, adminBrowser.fetcher);
  const password = "Chtaw-E2E-Only-Password-2026!";
  const email = `member-${crypto.randomUUID()}@integration.test`;
  let member: User;
  let general: Group;
  let privateGroup: Group;
  let otherGroup: Group;
  let realtime: RealtimeService;
  let adminSocket: Socket;
  let poll: Poll;
  let photo: Message;
  let off = () => {};
  let expired = () => {};
  let reconnects = 0;
  const state = () => useCommunity.getState();
  beforeAll(async () => {
    const health = await nativeFetch("http://127.0.0.1:3102/api/v1/health");
    if (!health.ok)
      throw Error("Démarrer le serveur dédié scripts/start-integration.ts sur chtaw_test.");
    vi.stubGlobal("fetch", memberBrowser.fetcher);
    vi.stubGlobal("BroadcastChannel", undefined);
    expired = api.onExpired(() => state().clear());
    await admin.login("e2e-admin@chtaw.test", password);
    general = (await admin.request<Group[]>("/groups")).find((g) => g.isGeneral)!;
  });
  afterAll(async () => {
    off();
    expired();
    realtime?.stop();
    adminSocket?.disconnect();
    await admin.logout().catch(() => {});
    state().clear();
    vi.unstubAllGlobals();
  });
  it("inscrit via les services frontend et affiche un compte réellement en attente", async () => {
    member = await state().register({
      email,
      password,
      firstName: "Membre",
      lastName: "Intégration",
    });
    expect(member.status).toBe("PENDING");
    expect(state().session?.mode).toBe("real");
    expect(state().groups).toEqual([]);
    await expect(groupsService.list()).rejects.toMatchObject({ status: 403 });
  });
  it("connecte la session en attente aux notifications et ouvre le général après approbation", async () => {
    realtime = new RealtimeService(
      {
        message: (m) => state().receiveMessage(m),
        poll: (p) => state().receivePoll(p),
        group: (g) => state().receiveGroup(g),
        removed: (id) => state().removeGroup(id),
        membership: () => {
          void state().sync();
        },
        reviewed: () => {
          void state().sync();
        },
        reconnected: async () => {
          reconnects++;
          await state().catchUp();
        },
        status: (connection) => useCommunity.setState({ connection }),
      },
      "http://127.0.0.1:3102",
    );
    off = useCommunity.subscribe((next, previous) => {
      if (next.groups.map((g) => g.id).join() !== previous.groups.map((g) => g.id).join())
        realtime.setGroups(next.groups.map((g) => g.id));
    });
    realtime.start();
    await until(() => state().connection === "online");
    await admin.request(`/approvals/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROVED" }),
    });
    await until(() => state().groups.some((g) => g.id === general.id));
    expect(state().users.find((u) => u.id === member.id)?.status).toBe("APPROVED");
    await state().loadHistory(general.id);
    expect(state().history[general.id]?.loaded).toBe(true);
  });
  it("affecte un membre à un groupe privé et refuse un autre groupe", async () => {
    privateGroup = await admin.request<Group>("/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Intégration " + crypto.randomUUID() }),
    });
    otherGroup = await admin.request<Group>("/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Autre groupe " + crypto.randomUUID() }),
    });
    await expect(groupsService.get(privateGroup.id)).rejects.toMatchObject({ status: 403 });
    await admin.request(`/groups/${privateGroup.id}/members/${member.id}`, { method: "PUT" });
    await until(() => state().groups.some((g) => g.id === privateGroup.id));
    await state().loadHistory(privateGroup.id);
    await expect(groupsService.get(otherGroup.id)).rejects.toMatchObject({ status: 403 });
  });
  it("échange des messages entre deux sessions et fusionne HTTP et Socket.IO sans doublon", async () => {
    adminSocket = io("http://127.0.0.1:3102/community", {
      auth: { token: await admin.accessToken() },
      transports: ["websocket"],
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      adminSocket.once("session:ready", resolve);
      adminSocket.once("connect_error", reject);
    });
    await adminSocket.timeout(5000).emitWithAck("group:join", { groupId: privateGroup.id });
    const received = new Promise<Message>((resolve) =>
      adminSocket.once("message:created", resolve),
    );
    await state().post(privateGroup.id, "Bonjour depuis le frontend");
    const sent = await received;
    expect(sent.author?.firstName).toBe("Membre");
    expect(sent.author).not.toHaveProperty("email");
    await until(() => state().messages.some((m) => m.id === sent.id));
    expect(state().messages.filter((m) => m.id === sent.id)).toHaveLength(1);
    const reply = await admin.request<Message>(`/groups/${privateGroup.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "Réponse administrateur" }),
    });
    await until(() => state().messages.some((m) => m.id === reply.id));
  });
  it("charge un historique réel sur plusieurs pages", async () => {
    for (let i = 0; i < 31; i++)
      await admin.request(`/groups/${privateGroup.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: "Historique " + i }),
      });
    useCommunity.setState({ messages: [], history: {} });
    await state().loadHistory(privateGroup.id);
    expect(state().messages).toHaveLength(30);
    expect(state().history[privateGroup.id]?.nextCursor).toBeTruthy();
    await state().loadHistory(privateGroup.id, true);
    expect(state().messages).toHaveLength(33);
    expect(new Set(state().messages.map((m) => m.id)).size).toBe(33);
  });
  it("téléverse une vraie image admin et contrôle le téléchargement privé", async () => {
    const png = Uint8Array.from(await sharp({ create: { width: 12, height: 12, channels: 3, background: "#aabbcc" } }).png().toBuffer());
    const file = new File([png], "pixel.png", { type: "image/png" });
    await expect(
      new UploadsService().photo(privateGroup.id, file, "Interdit"),
    ).rejects.toMatchObject({ status: 403 });
    photo = await new UploadsService(admin).photo(privateGroup.id, file, "Photo de test");
    await until(() => state().messages.some((m) => m.id === photo.id));
    const blob = await api.blob(photo.photoUrl!.slice("/api/v1".length));
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBeGreaterThan(0);
  });
  it("crée un sondage, transmet le vote et reçoit les résultats en direct", async () => {
    poll = await admin.request<Poll>(`/groups/${privateGroup.id}/polls`, {
      method: "POST",
      body: JSON.stringify({
        question: "Quel jour ?",
        options: ["Samedi", "Dimanche"],
        singleChoice: true,
      }),
    });
    await until(() => state().polls.some((p) => p.id === poll.id));
    const update = new Promise<Poll>((resolve) => adminSocket.once("poll:updated", resolve));
    await state().vote(poll.id, [poll.options[0]!.id]);
    expect((await update).votes.some((v) => v.userId === member.id)).toBe(true);
    expect(state().polls.find((p) => p.id === poll.id)?.votes).toHaveLength(1);
    await expect(state().vote(poll.id, [poll.options[1]!.id])).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      pollsService.create(privateGroup.id, {
        question: "Interdit ?",
        options: ["Oui", "Non"],
        singleChoice: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("inscrit plusieurs horaires, modifie le vote et relit les présences réelles après restauration", async () => {
    const group = await admin.request<Group>("/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Séances " + crypto.randomUUID() }),
    });
    await admin.request(`/groups/${group.id}/members/${member.id}`, { method: "PUT" });
    await state().sync();
    const session = await admin.request<Poll>(`/groups/${group.id}/polls`, {
      method: "POST",
      body: JSON.stringify({
        question: "Séance de mathématiques",
        description: "Choisir vos disponibilités",
        type: "SESSION",
        mandatoryAttendance: false,
        status: "OPEN",
        singleChoice: false,
        endsAt: "2099-01-01T10:00:00.000Z",
        options: ["Lundi", "Mardi", "Mercredi"],
        startsAt: [
          "2099-01-02T10:00:00.000Z",
          "2099-01-03T10:00:00.000Z",
          "2099-01-04T10:00:00.000Z",
        ],
      }),
    });
    await state().sync();
    await state().vote(session.id, [session.options[0]!.id, session.options[1]!.id]);
    await state().vote(session.id, [session.options[0]!.id, session.options[2]!.id], true);
    expect(
      state()
        .polls.find((p) => p.id === session.id)
        ?.votes[0]?.optionIds.sort(),
    ).toEqual([session.options[0]!.id, session.options[2]!.id].sort());
    await expect(attendanceService.roster(session.id)).rejects.toMatchObject({ status: 403 });
    const roster = await admin.request<Roster>(`/polls/${session.id}/attendance`);
    expect(roster.slots[1]!.students).toHaveLength(0);
    await admin.request(`/polls/${session.id}/attendance`, {
      method: "PUT",
      body: JSON.stringify({
        entries: [
          { userId: member.id, optionId: session.options[0]!.id, status: "PRESENT", version: 0 },
          { userId: member.id, optionId: session.options[2]!.id, status: "ABSENT", version: 0 },
        ],
      }),
    });
    const history = await attendanceService.history();
    expect(history.sessions.find((p) => p.id === session.id)?.final).toBe("PRESENT");
    state().clear();
    await state().restore();
    const reloaded: StudentHistory = await attendanceService.history();
    expect(reloaded.sessions.find((p) => p.id === session.id)?.final).toBe("PRESENT");
    await expect(state().vote(session.id, [session.options[1]!.id], true)).rejects.toMatchObject({
      status: 409,
    });
    // Restore the open chat fixture after simulating a page refresh in this test.
    await state().loadHistory(privateGroup.id);
  });
  it("reconnecte automatiquement le transport Socket.IO", async () => {
    const before = reconnects;
    realtime.reconnect();
    await until(() => reconnects > before && state().connection === "online");
    const message = await admin.request<Message>(`/groups/${privateGroup.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "Après reconnexion automatique" }),
    });
    await until(() => state().messages.some((m) => m.id === message.id));
  });
  it("rattrape plus d’une page de messages après une coupure prolongée", async () => {
    realtime.stop();
    const missed: Message[] = [];
    for (let i = 0; i < 32; i++)
      missed.push(
        await admin.request<Message>(`/groups/${privateGroup.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: "Pendant la coupure " + i }),
        }),
      );
    const before = reconnects;
    realtime.start();
    await until(() => reconnects > before && state().connection === "online");
    expect(missed.every((m) => state().messages.some((known) => known.id === m.id))).toBe(true);
  });
  it("restaure la session après perte de la mémoire JavaScript, sans mot de passe", async () => {
    realtime.stop();
    const oldCookie = [...memberBrowser.cookies.values()][0];
    state().clear();
    await state().restore();
    expect(state().session?.userId).toBe(member.id);
    expect([...memberBrowser.cookies.values()][0]).not.toBe(oldCookie);
    expect(state().messages).toEqual([]);
    await state().loadHistory(privateGroup.id);
    expect(state().messages.length).toBeGreaterThan(0);
    realtime.setGroups(state().groups.map((g) => g.id));
    realtime.start();
    await until(() => state().connection === "online");
  });
  it("retire le groupe et les messages du store et refuse les médias privés", async () => {
    await admin.request(`/groups/${privateGroup.id}/members/${member.id}`, { method: "DELETE" });
    await until(() => !state().groups.some((g) => g.id === privateGroup.id));
    expect(state().messages.some((m) => m.groupId === privateGroup.id)).toBe(false);
    await expect(api.blob(photo.photoUrl!.slice("/api/v1".length))).rejects.toMatchObject({
      status: 403,
    });
  });
  it("déconnecte puis reconnecte réellement le membre", async () => {
    realtime.stop();
    await state().logout();
    expect(memberBrowser.cookies.size).toBe(0);
    expect(state().session).toBeNull();
    await state().restore();
    expect(state().session).toBeNull();
    await state().login(email, password);
    expect(state().session?.userId).toBe(member.id);
  });
  it("raccorde aussi les actions admin du store et les statistiques du dashboard", async () => {
    await state().logout();
    await state().login("e2e-admin@chtaw.test", password);
    expect(state().stats?.totalUsers).toBeGreaterThan(1);
    const group = await state().saveGroup({
      id: crypto.randomUUID(),
      name: "Créé par le store",
      description: "Données réelles",
      color: "#aabbcc",
      isGeneral: false,
      memberIds: [],
    });
    expect(state().groups.some((g) => g.id === group.id)).toBe(true);
    await state().deleteGroup(group.id);
    expect(state().groups.some((g) => g.id === group.id)).toBe(false);
    const mandatoryGroup = await state().saveGroup({
      id: crypto.randomUUID(),
      name: "Suivi obligatoire réel",
      description: "",
      color: "#aabbcc",
      isGeneral: false,
      memberIds: [],
    });
    await state().membership(mandatoryGroup.id, member.id, true);
    const mandatoryInput = {
      question: "Séance obligatoire sans vote",
      description: "",
      type: "SESSION" as const,
      status: "OPEN" as const,
      mandatoryAttendance: true,
      singleChoice: false as const,
      endsAt: "2099-01-01T10:00:00.000Z",
      options: ["Matin", "Après-midi"],
      startsAt: ["2099-01-02T09:00:00.000Z", "2099-01-02T14:00:00.000Z"],
      slotEndsAt: ["2099-01-02T11:00:00.000Z", "2099-01-02T16:00:00.000Z"],
    };
    const mandatory = await attendanceService.create(mandatoryGroup.id, mandatoryInput);
    expect(mandatory.mandatoryAttendance).toBe(true);
    const before = await attendanceService.roster(mandatory.id);
    const first = before.slots[0]!;
    const candidate = first.students.find((s) => s.user.id === member.id)!;
    expect(candidate.voted).toBe(false);
    const pointed = await attendanceService.save(mandatory.id, [
      {
        userId: member.id,
        optionId: first.id,
        status: "PRESENT",
        version: candidate.version,
        participantVersion: candidate.participantVersion,
      },
    ]);
    expect(pointed.slots[1]!.students.find((s) => s.user.id === member.id)!.final).toBe("PRESENT");
    expect(
      (await attendanceService.history(member.id)).sessions.find((s) => s.id === mandatory.id)
        ?.final,
    ).toBe("PRESENT");
    expect((await attendanceService.sessions({ pollId: mandatory.id })).items[0]?.present).toBe(1);
    expect((await attendanceService.reports({ pollId: mandatory.id })).total).toBe(0);
    await expect(
      attendanceService.save(mandatory.id, [
        {
          userId: member.id,
          optionId: first.id,
          status: "ABSENT",
          version: candidate.version,
          participantVersion: candidate.participantVersion,
        },
      ]),
    ).rejects.toMatchObject({ status: 409 });
    await attendanceService.update(mandatory.id, { ...mandatoryInput, status: "CANCELLED" });
    expect(
      (await attendanceService.history(member.id)).sessions.find((s) => s.id === mandatory.id)
        ?.final,
    ).toBe("ANNULE");
    await state().logout();
    await admin.request(`/groups/${privateGroup.id}`, { method: "DELETE" });
    await admin.request(`/groups/${otherGroup.id}`, { method: "DELETE" });
  });
});
