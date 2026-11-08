import { MembersPanel } from "@/components/admin/requests-panel";
import type { RequestFilters } from "@/features/requests";
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus: RequestFilters["status"] = status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? status : "ALL";
  return <div className="admin-page"><MembersPanel key={initialStatus} initialStatus={initialStatus} /></div>;
}
