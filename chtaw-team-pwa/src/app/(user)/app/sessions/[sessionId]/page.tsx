import { SessionDetail } from "@/components/notifications/session-detail";
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <SessionDetail key={sessionId} sessionId={sessionId} />;
}
