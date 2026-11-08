import { AttendanceWorkspace } from "@/components/admin/attendance-workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pollId?: string }>;
}) {
  const { pollId } = await searchParams;
  return (
    <div className="admin-page">
      <AttendanceWorkspace key={pollId ?? "all"} initialPollId={pollId} />
    </div>
  );
}
