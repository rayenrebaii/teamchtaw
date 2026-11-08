import type {
  AuthSession,
  DemoData,
  Group,
  GroupMember,
  Message,
  Notification,
  Poll,
  PollVote,
  User,
} from "@/types";
/** Future adapters must enforce authorization and membership on the server. */
export interface AuthService {
  login(email: string, password: string): Promise<AuthSession>;
  register(
    input: Pick<User, "email" | "firstName" | "lastName"> & { password: string },
  ): Promise<User>;
  logout(): Promise<void>;
  me(): Promise<User>;
}
export interface CommunityService {
  snapshot(): Promise<DemoData>;
  review(userId: string, status: "APPROVED" | "REJECTED"): Promise<User>;
  saveGroup(group: Group): Promise<Group>;
  deleteGroup(groupId: string): Promise<void>;
  setMembership(member: GroupMember, add: boolean): Promise<void>;
  send(message: Message): Promise<Message>;
  createPoll(poll: Poll): Promise<Poll>;
  vote(pollId: string, vote: PollVote): Promise<Poll>;
  updateProfile(input: Pick<User, "firstName" | "lastName" | "bio">): Promise<User>;
  notifications(): Promise<Notification[]>;
}
export interface RealtimeEvents {
  "message:created": Message;
  "poll:updated": Poll;
  "group:updated": Group;
  "user:reviewed": User;
  "notification:created": Notification;
}
export interface RealtimeTransport {
  connect(session: AuthSession): Promise<void>;
  disconnect(): void;
  joinGroup(groupId: string): Promise<void>;
  leaveGroup(groupId: string): void;
  on<K extends keyof RealtimeEvents>(
    event: K,
    callback: (payload: RealtimeEvents[K]) => void,
  ): () => void;
}
