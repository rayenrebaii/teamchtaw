// Read-only migration inventory. Prints aggregate counts, never identities or hashes.
import { readFile } from "node:fs/promises";
import pg from "pg";

const args = process.argv.slice(2);
const index = args.indexOf("--url-file");
if (index < 0 || !args[index + 1]) throw Error("Provide --url-file with a private connection file.");
const connectionString = (await readFile(args[index + 1], "utf8")).replace(/^\uFEFF/, "").trim();
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
try {
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL statement_timeout = '15s'");
  const accounts = (await db.query('SELECT role, status, count(*)::int AS count FROM "User" GROUP BY role, status ORDER BY role, status')).rows;
  const hashes = (await db.query(`SELECT CASE WHEN "passwordHash" LIKE '$argon2id$%' THEN 'argon2id' WHEN "passwordHash" LIKE '$argon2i$%' THEN 'argon2i' ELSE 'other' END AS algorithm, count(*)::int AS count FROM "User" GROUP BY 1 ORDER BY 1`)).rows;
  const duplicates = (await db.query('SELECT count(*)::int AS count FROM (SELECT lower(trim(email)) FROM "User" GROUP BY 1 HAVING count(*) > 1) duplicates')).rows[0].count;
  const sessions = (await db.query('SELECT count(*)::int AS active FROM "RefreshSession" WHERE "revokedAt" IS NULL AND "expiresAt" > now()')).rows[0];
  const data = {};
  for (const table of ["User", "Group", "GroupMember", "Message", "Poll", "PollVote", "SessionParticipant", "SessionMark", "AdmissionDecision"]) {
    data[table] = (await db.query(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count;
  }
  const authColumns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND (column_name ILIKE '%firebase%' OR column_name ILIKE '%google%' OR column_name ILIKE '%verified%') ORDER BY column_name")).rows.map((row) => row.column_name);
  await db.query("COMMIT");
  console.log(JSON.stringify({ accounts, hashes, normalizedEmailDuplicates: duplicates, sessions, data, authColumns }, null, 2));
} catch (error) {
  console.error("Read-only authentication inventory failed; no credentials or account details printed.");
  console.error(JSON.stringify({ code: error?.code ?? error?.name ?? "unknown" }));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}
