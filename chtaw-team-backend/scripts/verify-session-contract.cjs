// Real local HTTP + PostgreSQL verification. Never prints credentials or user profiles.
require("dotenv").config({ quiet: true });
const { Client, types } = require("pg");
// Prisma stores DateTime as UTC in timestamp-without-time-zone columns.
// pg's default parser otherwise interprets these values in the machine's local zone.
types.setTypeParser(1114, (value) => new Date(value.replace(" ", "T") + "Z"));
const { randomUUID } = require("node:crypto");
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/chtaw")
    throw Error("Verification is restricted to local database chtaw.");
  const base = `http://127.0.0.1:${process.env.PORT || 3002}/api/v1`;
  const probe = process.argv.includes("--probe");
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    }),
  });
  if (!login.ok) throw Error(`Local admin login failed (${login.status}). No credentials printed.`);
  const auth = await login.json();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.accessToken}`,
  };
  try {
    const groupsResponse = await fetch(`${base}/groups`, { headers });
    if (!groupsResponse.ok) throw Error(`Group read failed (${groupsResponse.status})`);
    const groups = await groupsResponse.json();
    let group = groups.find((g) => g.name.trim().toLowerCase() === "g1");
    let deadline = new Date("2026-11-08T18:12:00+01:00");
    let start = new Date("2026-11-10T20:00:00+01:00");
    let end = new Date("2026-11-10T22:00:00+01:00");
    let adjusted = false;
    while (deadline <= new Date()) {
      deadline = new Date(+deadline + 7 * 86400000);
      start = new Date(+start + 7 * 86400000);
      end = new Date(+end + 7 * 86400000);
      adjusted = true;
    }
    const payload = {
      question: "seance 1",
      type: "SESSION",
      status: "OPEN",
      singleChoice: false,
      mandatoryAttendance: true,
      endsAt: deadline.toISOString(),
      options: ["mardi"],
      startsAt: [start.toISOString()],
      slotEndsAt: [end.toISOString()],
    };
    if (probe) {
      // Unknown field guarantees this diagnostic cannot create any data, even on an up-to-date backend.
      const result = await fetch(
        `${base}/groups/${group?.id || groups[0]?.id || randomUUID()}/polls`,
        { method: "POST", headers, body: JSON.stringify({ ...payload, contractProbe: true }) },
      );
      console.log(
        JSON.stringify({ probe: true, status: result.status, response: await result.json() }),
      );
      return;
    }
    if (!group) {
      const created = await fetch(`${base}/groups`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "G1" }),
      });
      if (!created.ok) throw Error(`G1 creation failed (${created.status})`);
      group = await created.json();
    }
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await db.connect();
      const previous = await db.query(
        'SELECT p.id FROM "Poll" p JOIN "PollOption" o ON o."pollId"=p.id WHERE p."groupId"=$1 AND p.question=$2 AND p."mandatoryAttendance"=true AND p."endsAt"=$3 AND o."startsAt"=$4 AND o."endsAt"=$5 LIMIT 1',
        [
          group.id,
          payload.question,
          deadline.toISOString(),
          start.toISOString(),
          end.toISOString(),
        ],
      );
      let id = previous.rows[0]?.id;
      let status = 200;
      if (!id) {
        const result = await fetch(`${base}/groups/${group.id}/polls`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        status = result.status;
        const body = await result.json();
        if (!result.ok) throw Error(`Session rejected (${status}): ${JSON.stringify(body)}`);
        id = body.id;
      }
      const persisted = await db.query(
        'SELECT p.id,p.question,p."mandatoryAttendance",p."endsAt" AS deadline,o.label,o."startsAt",o."endsAt" FROM "Poll" p JOIN "PollOption" o ON o."pollId"=p.id WHERE p.id=$1',
        [id],
      );
      const row = persisted.rows[0];
      if (
        !row ||
        !row.mandatoryAttendance ||
        +row.deadline !== +deadline ||
        +row.startsAt !== +start ||
        +row.endsAt !== +end
      )
        throw Error("Persisted scenario differs from requested dates.");
      const snapshot = await db.query(
        'SELECT count(*)::int AS count FROM "SessionParticipant" WHERE "pollId"=$1',
        [id],
      );
      console.log(
        JSON.stringify({
          status,
          reused: previous.rowCount > 0,
          group: group.name,
          adjustedDates: adjusted,
          persisted: row,
          concernedStudents: snapshot.rows[0].count,
        }),
      );
    } finally {
      await db.end();
    }
  } finally {
    await fetch(`${base}/auth/logout`, { method: "POST", headers }).catch(() => {});
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
