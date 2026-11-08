import "dotenv/config";
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const connectionString = args.includes("--url-file")
  ? (await readFile(option("--url-file"), "utf8")).replace(/^\uFEFF/, "").trim()
  : process.env.DATABASE_URL;
if (!connectionString || !args.includes("--output")) throw Error("Database URL and --output are required.");
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 30000 });
try {
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL TIME ZONE 'UTC'");
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const records = [];
  for (const { tablename } of tables) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    const { rows: [row] } = await db.query(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS checksum FROM public.${name} t`);
    records.push({ table: tablename, ...row });
  }
  const extensions = (await db.query("SELECT extname, extversion FROM pg_extension ORDER BY extname")).rows;
  const columns = (await db.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const indexes = (await db.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  const constraints = (await db.query("SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname, con.conname")).rows;
  const triggers = (await db.query("SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table, trigger_name, event_manipulation")).rows;
  const version = (await db.query("SHOW server_version")).rows[0].server_version;
  await db.query("COMMIT");
  await writeFile(option("--output"), JSON.stringify({ version, records, columns, indexes, constraints, triggers, extensions }, null, 2));
  console.log(JSON.stringify({ version, tables: records.length, rows: records.reduce((n, r) => n + r.count, 0), output: option("--output") }));
} catch {
  console.error("Database inventory failed; no credentials or database contents are printed.");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}
