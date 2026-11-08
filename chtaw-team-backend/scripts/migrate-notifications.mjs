import "dotenv/config";
import pg from "pg";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const allowed = "202611050002_notifications";
  const newTables = new Set(["Notification", "NotificationPreference", "NotificationEvent", "PushSubscription", "PushDelivery", "SessionReminderDelivery", "_prisma_migrations"]);
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename).filter((name) => !newTables.has(name));
  const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
  async function snapshot() {
    const result = {};
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      for (const table of tables) {
        const rows = await client.query('SELECT (to_jsonb(t) - \'notificationUpdatedAt\')::text AS row FROM ' + quote(table) + ' t ORDER BY (to_jsonb(t) - \'notificationUpdatedAt\')::text');
        result[table] = { count: rows.rowCount, hash: createHash("sha256").update(rows.rows.map((row) => row.row).join("\n")).digest("hex") };
      }
    } finally { await client.query("COMMIT"); }
    return result;
  }
  const before = await snapshot();
  const applied = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
  const { readdirSync } = await import("node:fs");
  const pending = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory() && !applied.rows.some((row) => row.migration_name === entry.name)).map((entry) => entry.name);
  if (pending.some((name) => name !== allowed)) throw Error("Unexpected pending migrations: manual inspection required.");
  if (pending.length) {
    const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit", env: process.env });
    if (migration.status !== 0) throw Error("Migration deployment failed.");
  }
  const after = await snapshot();
  const changed = tables.filter((table) => before[table].hash !== after[table].hash);
  console.log(JSON.stringify({ migration: allowed, appliedNow: pending.length === 1, existingTablesVerified: tables.length, existingRows: Object.values(before).reduce((sum, table) => sum + table.count, 0), existingDataUnchanged: changed.length === 0, changedTables: changed }));
  if (changed.length) process.exitCode = 2;
} finally { await client.end(); }
