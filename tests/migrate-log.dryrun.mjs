// Dry run of the log migration (POST /api/admin/migrate-log) on a JSON backup of the workspace.
//   node tests/migrate-log.dryrun.mjs "<db_state backup ….json>"
// The backup is only read. The same functions the endpoint uses run in local mode against a
// temporary folder: first the dry run (counts only), then a real run into that folder and a
// second run, to show what the live run would write, strip and write again (0).
// Nothing touches R2 or the live site; the temporary folder is deleted at the end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node tests/migrate-log.dryrun.mjs "<backup.json>"');
  process.exit(2);
}
const text = fs.readFileSync(file, 'utf8');
const parsed = JSON.parse(text);
const doc = parsed && Array.isArray(parsed.users) ? parsed : parsed.state; // a bare document or { state }
if (!doc || !Array.isArray(doc.users)) { console.error('Not a workspace document'); process.exit(2); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-migrate-dryrun-'));
process.env.LOCAL_DATA_DIR = dir;
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[k];
fs.writeFileSync(path.join(dir, 'db_state.json'), JSON.stringify(doc));

const { migrateEntries, stripDoc } = await import('../api/_lib/log.js');
const { runMigration } = await import('../api/_lib/logApi.js');

const show = (label, c) => console.log(`${label.padEnd(26)} found ${c.found} (log ${c.foundLog}, activity ${c.foundActivity}) · written ${c.written} · already present ${c.alreadyPresent} · conflicts ${c.conflicts}${c.stripped != null ? ` · stripped ${c.stripped}` : ''}`);

try {
  console.log(`Backup: ${path.basename(file)} (${Buffer.byteLength(text)} bytes)`);
  const dry = await migrateEntries(doc, { dryRun: true });
  const { doc: stripped, stripped: n } = stripDoc(doc);
  show('Dry run (would write)', dry);
  console.log(`${''.padEnd(26)} document ${Buffer.byteLength(JSON.stringify(doc))} → ${Buffer.byteLength(JSON.stringify(stripped))} bytes after stripping ${n} entries`);
  const first = await runMigration();
  show('Real run, temp folder', first.body);
  const second = await runMigration();
  show('Second run', second.body);
  const again = await migrateEntries(doc);
  show('Backup migrated again', again);
  const ok = dry.conflicts === 0 && first.status === 200 && first.body.written === dry.found && second.body.written === 0 && again.written === 0;
  console.log(ok ? 'OK: idempotent, nothing written twice' : 'CHECK: see the counts above');
  process.exitCode = ok ? 0 : 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
