import { AdminScreen } from "@/components/admin/admin-screen";
export default async function Page({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <AdminScreen page="groups" groupId={groupId} />;
}
