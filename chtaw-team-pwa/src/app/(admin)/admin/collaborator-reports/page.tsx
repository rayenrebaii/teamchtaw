import { OrganizerReports } from "@/components/collaborators";
export default async function Page({ searchParams }: { searchParams: Promise<{ alert?: string }> }) {
  const { alert } = await searchParams;
  return <OrganizerReports key={alert} initialAlertId={typeof alert === "string" && /^[a-f0-9-]{36}$/i.test(alert) ? alert : undefined} />;
}
