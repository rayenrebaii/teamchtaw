import { NotificationsPage } from "@/components/notifications/notification-center";
export default async function Page({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  return <NotificationsPage openId={typeof open === "string" ? open : undefined} />;
}
