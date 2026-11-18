import { afterEach, expect, it, vi } from "vitest";
import { useCommunity } from "./community";
import { authService } from "@/services/auth.service";
import { usersService } from "@/services/users.service";
import { pollsService } from "@/services/polls.service";
import { groupsService } from "@/services/groups.service";
import type { User } from "@/types";

afterEach(() => { window.history.replaceState(null, "", "/"); vi.restoreAllMocks(); useCommunity.getState().clear(); });
it("keeps the analytical route light and restores full page data when leaving it", async () => {
  const admin: User = { id: "admin", role: "ADMIN", firstName: "Admin", lastName: "Test", email: "admin@test.invalid", status: "APPROVED", joinedAt: "2026-01-01", bio: "" };
  useCommunity.setState({ users: [admin], session: { userId: admin.id, mode: "real" } });
  vi.spyOn(authService, "me").mockResolvedValue(admin);
  const users = vi.spyOn(usersService, "all").mockResolvedValue([admin]);
  const polls = vi.spyOn(pollsService, "all").mockResolvedValue([]);
  const groups = vi.spyOn(groupsService, "list").mockResolvedValue([]);
  vi.spyOn(usersService, "stats").mockResolvedValue({ totalUsers: 1, approvedUsers: 1, pendingUsers: 0, groups: 0, messages: 0, polls: 0 });
  window.history.replaceState(null, "", "/admin");
  await useCommunity.getState().sync();
  expect(users).not.toHaveBeenCalled(); expect(polls).not.toHaveBeenCalled(); expect(groups).not.toHaveBeenCalled();
  window.history.replaceState(null, "", "/login");
  await useCommunity.getState().sync();
  expect(users).not.toHaveBeenCalled(); expect(polls).not.toHaveBeenCalled();
  window.history.replaceState(null, "", "/admin/polls");
  await useCommunity.getState().sync();
  expect(users).toHaveBeenCalledOnce(); expect(polls).toHaveBeenCalledOnce(); expect(groups).toHaveBeenCalledOnce();
});
