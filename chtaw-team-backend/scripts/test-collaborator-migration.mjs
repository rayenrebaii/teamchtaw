import safety from "./test-safety.cjs";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

safety.assertTestContext();
const source = safety.assertDatabase(process.env.TEST_DATABASE_URL, process.env.ISOLATED_TEST_DATABASE);
const name = process.env.ISOLATED_TEST_DATABASE;
const db = new pg.Client({ connectionString: source.href }); await db.connect();
try {
  const migrations = (await readdir("prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
  const latest = "202611100001_collaborator_organizers";
  const organizerIndex = migrations.indexOf(latest);
  assert.ok(organizerIndex >= 0);
  for (const migration of migrations.slice(0, organizerIndex)) await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
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
      const rows = await db.query(`SELECT to_jsonb(t) - 'activatedAt' - 'disabledAt' - 'capacity' AS row FROM "${table}" t ORDER BY (to_jsonb(t) - 'activatedAt' - 'disabledAt' - 'capacity')::text`);
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
  const capacityMigration = "20261116120000_session_capacity";
  for (const migration of migrations.slice(organizerIndex + 1).filter((value) => value !== capacityMigration))
    await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  // A real pre-migration multiple ballot and its attendance must survive byte-for-byte.
  const historical = (await db.query('SELECT id,"pollId" FROM "PollVote" LIMIT 1')).rows[0];
  const extra = randomUUID();
  await db.query('INSERT INTO "PollOption" (id,"pollId",label,position) VALUES ($1,$2,\'Second historical slot\',1)', [extra, historical.pollId]);
  await db.query('INSERT INTO "PollVoteOption" ("voteId","optionId","pollId",attendance) VALUES ($1,$2,$3,\'PRESENT\')', [historical.id, extra, historical.pollId]);
  const beforeCapacity = await snapshots();
  await db.query(await readFile(`prisma/migrations/${capacityMigration}/migration.sql`, "utf8"));
  assert.deepEqual(await snapshots(), beforeCapacity);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM "PollOption" WHERE capacity IS NOT NULL')).rows[0].total, 0);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM "PollVoteOption" WHERE "voteId"=$1', [historical.id])).rows[0].total, 2);
  await assert.rejects(db.query('UPDATE "PollOption" SET capacity=0 WHERE id=$1', [extra]), { code: "23514" });
  console.log("Session capacity migration: historical ballots, attendance and counters preserved; positive capacity constraint verified.");
  console.log(JSON.stringify({ database: name, preservedTables: tables.length, assertions: 7, result: "passed", adminA: 3, adminB: 2, alerts: 1 }));
} finally { await db.end(); }
