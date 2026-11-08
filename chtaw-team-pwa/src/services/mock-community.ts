import { useDemo } from "@/stores/demo";
import type { CommunityService } from "./contracts";
/** Browser-only adapter. Replace this implementation with a NestJS HTTP adapter. */
export const mockCommunityService: CommunityService = {
  async snapshot() {
    const { users, groups, messages, polls } = useDemo.getState();
    return { users, groups, messages, polls };
  },
  async review(id, status) {
    useDemo.getState().review(id, status);
    return useDemo.getState().users.find((u) => u.id === id)!;
  },
  async saveGroup(group) {
    useDemo.getState().saveGroup(group);
    return useDemo.getState().groups.find((g) => g.id === group.id)!;
  },
  async deleteGroup(id) {
    useDemo.getState().deleteGroup(id);
  },
  async setMembership(member, add) {
    useDemo.getState().membership(member.groupId, member.userId, add);
  },
  async send(message) {
    useDemo.getState().post(message);
    return message;
  },
  async createPoll(poll) {
    useDemo.getState().publishPoll(poll);
    return poll;
  },
  async vote(id, vote) {
    if (vote.userId !== useDemo.getState().session?.userId) throw Error("Participant invalide.");
    useDemo.getState().vote(id, vote.optionIds);
    return useDemo.getState().polls.find((p) => p.id === id)!;
  },
  async updateProfile(input) {
    useDemo.getState().profile(input);
    const s = useDemo.getState();
    return s.users.find((u) => u.id === s.session?.userId)!;
  },
  async notifications() {
    return [];
  },
};
