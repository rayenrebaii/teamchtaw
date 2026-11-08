import { readFile, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

// Dedicated to the already inspected and explicitly approved target.
const root = new URL("../../.deployment-private/", import.meta.url);
const archive = await readFile(new URL("chtaw-before-neon-20261108.dump", root));
if (createHash("sha256").update(archive).digest("hex") !== "94e74b34ac9b1613753b80387e1f361c733a07fbc801af77dffc202189718957")
  throw Error("Backup integrity mismatch; restore refused.");
const connectionString = (await readFile(new URL("neon-direct.txt", root), "utf8")).trim();
const url = new URL(connectionString);
if (!url.hostname.endsWith(".neon.tech")) throw Error("Expected approved Neon target.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if (rows.length) throw Error("Target is not empty; restore refused.");
} finally { await client.end(); }
const log = await open(new URL("neon-restore.log", root), "wx");
const values = {
  PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE: "verify-full", PGSSLROOTCERT: "system", PGCHANNELBINDING: "require",
};
try {
  const args = ["exec", ...Object.keys(values).flatMap((key) => ["--env", key]),
    "chtaw-team-backend-postgres-1", "pg_restore", "--dbname", values.PGDATABASE,
    "--no-owner", "--no-acl", "--single-transaction", "--exit-on-error",
    "/tmp/chtaw-before-neon-20261108.dump"];
  const code = await new Promise((resolve, reject) => {
    const child = spawn("docker", args, { env: { ...process.env, ...values }, stdio: ["ignore", log.fd, log.fd] });
    child.on("error", reject); child.on("exit", resolve);
  });
  if (code !== 0) throw Error("Restore failed and rolled back. Inspect the private restore log.");
  console.log("Approved Neon restore completed in one transaction. Local data and backup retained.");
} finally { await log.close(); }
