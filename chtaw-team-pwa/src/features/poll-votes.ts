import type { Group, Poll, User } from "@/types";

export function pollVoteLists(poll: Poll, group: Group | undefined, users: User[]) {
  const choices = poll.options.map((option) => ({
    ...option,
    voterIds: [...new Set(poll.votes.filter((vote) => vote.optionIds.includes(option.id)).map((vote) => vote.userId))],
  }));
  const voted = new Set(choices.flatMap((choice) => choice.voterIds));
  const members = new Set(group?.memberIds);
  const nonVoters = group ? users.filter((user) =>
    members.has(user.id) && user.status === "APPROVED" &&
    (poll.type !== "SESSION" || user.role === "USER") && !voted.has(user.id),
  ) : null;
  return { choices, voterCount: voted.size, nonVoters };
}
