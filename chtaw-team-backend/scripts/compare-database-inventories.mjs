import { readFile, writeFile } from "node:fs/promises";
const [sourceFile, targetFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw Error("Usage: compare-database-inventories source.json target.json report.json");
const source = JSON.parse(await readFile(sourceFile, "utf8"));
const target = JSON.parse(await readFile(targetFile, "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// PostgreSQL 18 deparses casts on array elements differently from 17.
const normalize = (text) => text.replace(/::character varying|::text\[\]|::text/g, "").replace(/[()\s]/g, "");
const constraints = source.constraints.every((a) => {
  const b = target.constraints.find((v) => v.table_name === a.table_name && v.conname === a.conname);
  return b && normalize(a.definition) === normalize(b.definition);
});
const extraConstraints = target.constraints.filter((a) => !source.constraints.some((b) => a.table_name === b.table_name && a.conname === b.conname));
const checks = {
  rowsAndChecksums: same(source.records, target.records),
  columns: !!source.columns && same(source.columns, target.columns),
  indexes: same(source.indexes, target.indexes),
  originalConstraints: constraints,
  additionalConstraintsAreNotNull: extraConstraints.every((c) => c.definition.startsWith("NOT NULL ")),
  triggers: same(source.triggers, target.triggers),
  extensions: same(source.extensions, target.extensions),
};
const report = {
  verifiedAt: new Date().toISOString(), sourceVersion: source.version, targetVersion: target.version,
  tables: source.records.length, rows: source.records.reduce((n, r) => n + r.count, 0),
  sourceConstraints: source.constraints.length, extraNotNullConstraints: extraConstraints.length,
  checks, passed: Object.values(checks).every(Boolean),
};
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
