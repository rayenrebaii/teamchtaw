import { SessionPollsScreen } from "@/components/admin/attendance-panel";
export default async function Page({ searchParams }: { searchParams: Promise<{ create?: string }> }) { const query = await searchParams; return <div className="admin-page"><h1>Mes sondages de séance</h1><SessionPollsScreen pollsOnly createSession={query.create === "session"} /></div>; }
