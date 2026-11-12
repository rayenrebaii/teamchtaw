import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotifications } from "./notifications";
import { notificationsService, type AppNotification } from "@/services/notifications.service";
const item = (id: string): AppNotification => ({ id, groupId: "g", groupName: "Group", type: "MESSAGE", title: id, body: "", entityId: "m", optionId: null, createdAt: "2026-11-05T12:00:00Z", readAt: null });
const page = (id: string) => ({ items: [item(id)], unreadCount: 1, nextCursor: null });
beforeEach(() => { useNotifications.getState().reset(); vi.restoreAllMocks(); });
describe("Notification account isolation", () => {
  it("ignores a response from the previous account", async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    vi.spyOn(notificationsService, "list").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    useNotifications.getState().reset("a"); const request = useNotifications.getState().sync();
    useNotifications.getState().reset("b"); finish(page("private-a")); await request;
    expect(useNotifications.getState()).toMatchObject({ owner: "b", items: [], unreadCount: 0 });
  });
  it("never lets an older concurrent response replace the latest unread count", async () => {
    let first!: (value: ReturnType<typeof page>) => void;
    vi.spyOn(notificationsService, "list").mockImplementationOnce(() => new Promise((resolve) => { first = resolve; })).mockResolvedValueOnce({ items: [], unreadCount: 0, nextCursor: null });
    useNotifications.getState().reset("a");
    const older = useNotifications.getState().sync(); await useNotifications.getState().sync();
    first(page("old")); await older;
    expect(useNotifications.getState()).toMatchObject({ items: [], unreadCount: 0, loading: false });
  });
  it("deduplicates paginated results and updates read state", async () => {
    vi.spyOn(notificationsService, "list").mockResolvedValueOnce({ ...page("a"), nextCursor: "a" }).mockResolvedValueOnce({ items: [{ ...item("a"), readAt: "2026-11-05T13:00:00Z" }, item("b")], unreadCount: 1, nextCursor: null });
    useNotifications.getState().reset("a"); await useNotifications.getState().sync(); await useNotifications.getState().sync(true);
    expect(useNotifications.getState().items).toHaveLength(2);
    expect(useNotifications.getState().items[0]!.readAt).toBeTruthy();
    expect(notificationsService.list).toHaveBeenLastCalledWith("a", "fr");
  });
  it("preserves the displayed history on a network error", async () => {
    vi.spyOn(notificationsService, "list").mockResolvedValueOnce(page("a")).mockRejectedValueOnce(Error("offline"));
    useNotifications.getState().reset("a"); await useNotifications.getState().sync(); await useNotifications.getState().sync();
    expect(useNotifications.getState().items).toHaveLength(1);
    expect(useNotifications.getState()).toMatchObject({ error: "offline", loading: false });
    useNotifications.getState().reset(); expect(useNotifications.getState().items).toEqual([]);
  });
  it("does not restore a consumed notification from an older in-flight refresh", async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    vi.spyOn(notificationsService, "list").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    useNotifications.getState().reset("a");
    useNotifications.setState({ items: [item("opened")], unreadCount: 1 });
    const refreshing = useNotifications.getState().sync();
    useNotifications.getState().consumed("opened", 0);
    finish(page("opened")); await refreshing;
    expect(useNotifications.getState()).toMatchObject({ items: [], unreadCount: 0, nextCursor: null, loading: false });
  });
});
