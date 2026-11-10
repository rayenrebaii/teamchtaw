import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const source = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(source.hostname)) throw Error("This verification runs only on local PostgreSQL.");
const name = "chtaw_test_" + randomBytes(6).toString("hex");
const control = new pg.Client({ connectionString: source.href }); await control.connect();
try { await control.query(`CREATE DATABASE "${name}"`); } finally { await control.end(); }
source.pathname = "/" + name;
const db = new pg.Client({ connectionString: source.href }); await db.connect();
try {
  const migrations = (await readdir("prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
  const latest = migrations.pop();
  assert.equal(latest, "202611100001_collaborator_organizers");
  for (const migration of migrations) await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  const [adminA, adminB, student, group] = Array.from({ length: 4 }, randomUUID);
  for (const [id, role] of [[adminA, "ADMIN"], [adminB, "ADMIN"], [student, "USER"]]) await db.query(
    'INSERT INTO "User" (id,email,"passwordHash","firstName","lastName",role,status,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,\'APPROVED\',now())',
    [id, `${id}@migration.invalid`, "non-login-fixture", "Migration", "Fixture", role]);
  await db.query('INSERT INTO "Group" (id,name,"updatedAt") VALUES ($1,\'Migration\',now())', [group]);
  for (const owner of [adminA, adminA, adminA, adminB, adminB]) {
    const [poll, option, vote] = Array.from({ length: 3 }, randomUUID);
    await db.query('INSERT INTO "Poll" (id,"groupId","authorId",question,type) VALUES ($1,$2,$3,\'Historical\',\'SESSION\')', [poll, group, owner]);
    await db.query('INSERT INTO "PollOption" (id,"pollId",label,position) VALUES ($1,$2,\'Slot\',0)', [option, poll]);
    await db.query('INSERT INTO "PollVote" (id,"pollId","userId") VALUES ($1,$2,$3)', [vote, poll, student]);
    await db.query('INSERT INTO "PollVoteOption" ("voteId","optionId","pollId",attendance) VALUES ($1,$2,$3,\'ABSENT\')', [vote, option, poll]);
  }
  await db.query('INSERT INTO "AbsenceState" ("userId",total,generation) VALUES ($1,5,1)', [student]);
  await db.query('INSERT INTO "AbsenceAlert" (id,"userId",generation,"groupName") VALUES ($1,$2,1,\'Historical\')', [randomUUID(), student]);
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  // Compare all pre-existing columns, including User before additive columns.
  const snapshots = async () => {
    const result = {};
    for (const table of tables) {
      const rows = await db.query(`SELECT to_jsonb(t) - 'activatedAt' - 'disabledAt' AS row FROM "${table}" t ORDER BY (to_jsonb(t) - 'activatedAt' - 'disabledAt')::text`);
      result[table] = rows.rows;
    }
    return result;
  };
  const before = await snapshots();
  await db.query("BEGIN");
  try { await db.query(await readFile(`prisma/migrations/${latest}/migration.sql`, "utf8")); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; }
  assert.deepEqual(await snapshots(), before);
  const states = (await db.query('SELECT "organizerId",total FROM "OrganizerAbsenceState" WHERE "userId"=$1', [student])).rows;
  assert.equal(states.find((row) => row.organizerId === adminA)?.total, 3);
  assert.equal(states.find((row) => row.organizerId === adminB)?.total, 2);
  const alerts = (await db.query('SELECT "organizerId","pollIds" FROM "OrganizerAbsenceAlert"')).rows;
  assert.equal(alerts.length, 1); assert.equal(alerts[0].organizerId, adminA); assert.equal(alerts[0].pollIds.length, 3);
  console.log(JSON.stringify({ database: name, preservedTables: tables.length, assertions: 7, result: "passed", adminA: 3, adminB: 2, alerts: 1 }));
} finally { await db.end(); }
