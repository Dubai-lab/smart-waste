// Applies supabase/migrations/*.sql in order through the Supabase Management API.
// Tracks applied files in ops.schema_migrations. Usage: node scripts/db-apply.mjs [--sql "select 1"]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: ref } = process.env;
if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF missing in .env');

export async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${body}`);
  return JSON.parse(body);
}

const argIdx = process.argv.indexOf('--sql');
if (argIdx > -1) {
  console.log(JSON.stringify(await sql(process.argv[argIdx + 1]), null, 2));
  process.exit(0);
}

await sql(`create schema if not exists ops;
  create table if not exists ops.schema_migrations (name text primary key, applied_at timestamptz default now());`);
const applied = new Set((await sql('select name from ops.schema_migrations')).map((r) => r.name));
const dir = join(root, 'supabase', 'migrations');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  process.stdout.write(`applying ${file} ... `);
  const body = readFileSync(join(dir, file), 'utf8');
  await sql(`begin;\n${body}\ninsert into ops.schema_migrations(name) values ('${file}');\ncommit;`);
  console.log('ok');
}
console.log('migrations up to date');
