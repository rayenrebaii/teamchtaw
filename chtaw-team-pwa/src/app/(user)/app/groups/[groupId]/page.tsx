import { ChatScreen } from "@/components/chat/chat-screen";
export default async function Page({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ message?: string; poll?: string }> }) {
  const { groupId } = await params;
  const query = await searchParams;
  return <ChatScreen key={groupId} groupId={groupId} focusMessage={typeof query.message === "string" ? query.message : undefined} focusPoll={typeof query.poll === "string" ? query.poll : undefined} />;
}
