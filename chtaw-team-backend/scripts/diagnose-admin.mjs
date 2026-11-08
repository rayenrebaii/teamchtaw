import "dotenv/config";
import pg from "pg";
import { JwtService } from "@nestjs/jwt";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const migrations = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
  console.log(JSON.stringify({ appliedMigrations: migrations.rows.map((row) => row.migration_name) }));
  const columns = await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='PollOption' AND column_name='notificationUpdatedAt') OR table_name='AdmissionDecision')");
  console.log(JSON.stringify({ notificationScheduleColumn: columns.rows.some((row) => row.table_name === "PollOption"), admissionHistoryTable: columns.rows.some((row) => row.table_name === "AdmissionDecision") }));
  const sessions = await client.query('SELECT s.id, s."userId" FROM "RefreshSession" s JOIN "User" u ON u.id=s."userId" WHERE u.role=\'ADMIN\' AND u.status=\'APPROVED\' AND s."revokedAt" IS NULL AND s."expiresAt">CURRENT_TIMESTAMP ORDER BY s."createdAt" DESC LIMIT 1');
  const session = sessions.rows[0];
  if (!session) { console.log("No active administrator session available for read-only HTTP diagnostics."); }
  else {
    const token = await new JwtService().signAsync({ sub: session.userId, sid: session.id, typ: "access" }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: 120, issuer: "chtaw-team", audience: "chtaw-pwa" });
    for (const path of ["/users?limit=100", "/groups", "/polls?limit=100", "/admin/stats", "/notifications?limit=20"]) {
      try {
        const response = await fetch("http://127.0.0.1:3002/api/v1" + path, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
        const body = await response.json();
        console.log(JSON.stringify({ path, status: response.status, count: Array.isArray(body) ? body.length : body.items?.length, ...(response.ok ? {} : { message: body.message, requestId: body.requestId }) }));
      } catch (error) { console.log(JSON.stringify({ path, error: error.name })); }
    }
  }
} finally { await client.end(); }
