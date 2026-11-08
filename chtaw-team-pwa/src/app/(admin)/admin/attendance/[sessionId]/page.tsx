import type { Metadata } from "next";
import { AttendanceRosterPage } from "@/components/admin/attendance-roster";
export const metadata: Metadata = { title: "Pointage des présences" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ slot?: string }>;
}) {
  const { sessionId } = await params;
  const { slot } = await searchParams;
  return (
    <div className="admin-page attendance-page">
      <AttendanceRosterPage key={sessionId} pollId={sessionId} initialSlotId={slot} />
    </div>
  );
}
