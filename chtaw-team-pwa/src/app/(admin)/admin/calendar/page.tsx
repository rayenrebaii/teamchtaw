import { AdminCalendar } from "@/components/admin/admin-calendar";

export default async function Page({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  return <AdminCalendar key={typeof week === "string" ? week : "current"} initialWeek={typeof week === "string" ? week : ""} />;
}
