export type Role = "ADMIN" | "USER" | "COLLABORATOR";
export type Status = "PENDING" | "APPROVED" | "REJECTED";
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  status: Status;
  emailVerified?: boolean;
  disabledAt?: string | null;
  activatedAt?: string | null;
  joinedAt: string;
  bio: string;
}
export interface AuthSession {
  userId: string;
  mode: "demo" | "real";
}
export interface Group {
  id: string;
  name: string;
  description: string;
  image?: string;
  color: string;
  isGeneral: boolean;
  memberIds: string[];
}
export interface GroupMember {
  groupId: string;
  userId: string;
  joinedAt: string;
}
export interface PollOption {
  id: string;
  label: string;
  startsAt?: string | null;
  endsAt?: string | null;
}
export interface PollVote {
  userId: string;
  optionIds: string[];
}
export interface Poll {
  id: string;
  groupId: string;
  authorId: string;
  question: string;
  type?: "ORDINARY" | "SESSION";
  status?: "OPEN" | "CLOSED" | "CANCELLED";
  description?: string;
  attendanceLockedAt?: string | null;
  mandatoryAttendance?: boolean;
  createdAt?: string;
  options: PollOption[];
  votes: PollVote[];
  singleChoice: boolean;
  endsAt?: string;
}
export interface Message {
  author?: MemberSummary;
  id: string;
  groupId: string;
  authorId: string;
  kind: "text" | "photo" | "poll" | "system";
  text: string;
  createdAt: string;
  photoUrl?: string;
  pollId?: string;
  poll?: Poll;
}
export interface PhotoMessage extends Message {
  kind: "photo";
  photoUrl: string;
}
export interface Notification {
  id: string;
  userId: string;
  text: string;
  read: boolean;
  createdAt: string;
}
export interface DemoData {
  users: User[];
  groups: Group[];
  messages: Message[];
  polls: Poll[];
}
export type MemberSummary = Pick<User, "id" | "firstName" | "lastName" | "bio" | "role">;
export interface DashboardStats {
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  groups: number;
  messages: number;
  polls: number;
}
