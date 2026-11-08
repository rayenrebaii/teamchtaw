import { api } from "./api-client";
import type { Poll, User } from "@/types";
export type AttendanceStatus = "NON_VERIFIE" | "PRESENT" | "ABSENT";
export type FinalStatus =
  "NON_INSCRIT" | "EN_ATTENTE" | "PRESENT" | "ABSENT" | "ANNULE" | "NON_CONCERNE";
export interface SessionInput {
  question: string;
  description: string;
  type: "SESSION";
  status: "OPEN" | "CLOSED" | "CANCELLED";
  singleChoice: false;
  endsAt: string;
  options: string[];
  startsAt: string[];
  mandatoryAttendance?: boolean;
  slotEndsAt?: string[];
}
export interface AttendanceEntry {
  userId: string;
  optionId: string;
  status: AttendanceStatus;
  version: number;
  participantVersion?: number;
}
export interface Roster {
  id: string;
  question: string;
  status: string;
  group: { id: string; name: string };
  attendanceLockedAt: string | null;
  mandatoryAttendance?: boolean;
  finished?: boolean;
  participants?: { user: User; included: boolean; version: number; final: FinalStatus }[];
  slots: {
    id: string;
    label: string;
    startsAt: string;
    endsAt?: string | null;
    students: {
      user: User;
      attendance: AttendanceStatus;
      version: number;
      absences: number;
      final: FinalStatus;
      participantVersion?: number;
      voted?: boolean;
      hasVoted?: boolean;
    }[];
  }[];
}
export interface AbsenceAlert {
  id: string;
  userId: string;
  generation: number;
  groupName: string;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  user?: User & { absenceState: { total: number } | null };
}
export interface StudentHistory {
  user: User;
  presences: number;
  absences: number;
  alerts: AbsenceAlert[];
  sessions: {
    id: string;
    question: string;
    groupName: string;
    status: string;
    createdAt: string;
    final: FinalStatus;
    mandatoryAttendance?: boolean;
    globalEdits?: {
      id: string;
      action: string;
      before: string;
      after: string;
      createdAt: string;
      actor: { firstName: string; lastName: string };
    }[];
    selections: {
      optionId: string;
      label: string;
      startsAt: string;
      endsAt?: string | null;
      attendance: AttendanceStatus;
      version: number;
      edits: {
        id: string;
        before: AttendanceStatus;
        after: AttendanceStatus;
        createdAt: string;
        actor: { firstName: string; lastName: string };
      }[];
    }[];
  }[];
}
export interface AttendanceSession {
  id: string;
  question: string;
  group: { id: string; name: string };
  status: string;
  phase: "UPCOMING" | "ONGOING" | "FINISHED" | "CANCELLED" | "LEGACY";
  mandatoryAttendance: boolean;
  options: Poll["options"];
  lastEnd: string | null;
  concerned: number;
  present: number;
  toVerify: number;
}
export interface AttendanceReport {
  pollId: string;
  user: User;
  question: string;
  group: { id: string; name: string };
  options: Poll["options"];
  votedOptionIds: string[];
  marks: { optionId: string; attendance: AttendanceStatus; version: number }[];
  version: number;
  final: FinalStatus;
  openedAt: string;
  resolvedAt: string | null;
  lastEnd: string;
}
export interface AttendanceOverview {
  items: {
    user: User;
    groups: string[];
    presences: number;
    absences: number;
    totalAbsences: number;
    pending: number;
  }[];
  total: number;
  stats: {
    sessions: number;
    students: number;
    presences: number;
    absences: number;
    threshold: number;
    unreadAlerts: number;
  };
}
export interface PersonalAttendancePage {
  user: User;
  stats: { completed: number; present: number; absent: number; upcoming: number };
  groups: { id: string; name: string }[];
  items: (StudentHistory["sessions"][number] & {
    groupId: string; description: string;
    slots: { optionId: string; label: string; startsAt: string | null; endsAt: string | null }[];
    startsAt: string | null; endsAt: string | null; completed: boolean; scheduleComplete: boolean;
    attendanceStatus: "UPCOMING" | "PRESENT" | "ABSENT" | "PENDING" | "CANCELLED";
  })[];
  total: number; page: number; limit: number; timeZone: string; incompleteSchedules: boolean;
}
export const attendanceService = {
  mine: (filters: Record<string, string>) => api.request<PersonalAttendancePage>("/attendance/me?" + new URLSearchParams(Object.entries(filters).filter(([, value]) => value))),
  sessions: (filters: Record<string, string>) =>
    api.request<{ items: AttendanceSession[]; total: number }>(
      `/admin/attendance/sessions?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v))}`,
    ),
  reports: (filters: Record<string, string>) =>
    api.request<{ items: AttendanceReport[]; total: number }>(
      `/admin/attendance/reports?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v))}`,
    ),
  confirmAbsence: (id: string, userId: string, version: number) =>
    api.request<Roster>(
      `/polls/${encodeURIComponent(id)}/attendance/absence/${encodeURIComponent(userId)}`,
      { method: "PUT", body: JSON.stringify({ version }) },
    ),
  participant: (id: string, userId: string, included: boolean, version: number) =>
    api.request<Roster>(
      `/polls/${encodeURIComponent(id)}/attendance/participants/${encodeURIComponent(userId)}`,
      { method: "PUT", body: JSON.stringify({ included, version }) },
    ),
  create: (groupId: string, input: SessionInput) =>
    api.request<Poll>(`/groups/${encodeURIComponent(groupId)}/polls`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: SessionInput) =>
    api.request<Poll>(`/polls/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  removeSlot: (id: string, optionId: string) => api.request<Poll>(`/polls/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}`, { method: "DELETE" }),
  remove: (id: string) => api.request<void>(`/polls/${encodeURIComponent(id)}`, { method: "DELETE" }),
  roster: (id: string) => api.request<Roster>(`/polls/${encodeURIComponent(id)}/attendance`),
  save: (id: string, entries: AttendanceEntry[]) =>
    api.request<Roster>(`/polls/${encodeURIComponent(id)}/attendance`, {
      method: "PUT",
      body: JSON.stringify({ entries }),
    }),
  overview: (filters: Record<string, string>) =>
    api.request<AttendanceOverview>(
      `/admin/attendance?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`,
    ),
  history: (userId?: string) =>
    api.request<StudentHistory>(
      userId ? `/users/${encodeURIComponent(userId)}/attendance` : "/attendance/me",
    ),
  alerts: () => api.request<AbsenceAlert[]>("/admin/absence-alerts"),
  read: (id: string) =>
    api.request(`/admin/absence-alerts/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
};
