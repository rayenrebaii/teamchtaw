import { AdminScreen } from "@/components/admin/admin-screen";
export default async function Page({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const { create } = await searchParams;
  return <AdminScreen key={create ?? "list"} page="polls" createSession={create === "session"} />;
}
