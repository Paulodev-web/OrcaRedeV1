import fs from 'node:fs';

const envPath = '.env.production.local';
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  process.env[k] = v;
}

const jobId = process.argv[2];
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch('https://orcaredeteste.vercel.app/api/process-pdfs/continue', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ job_id: jobId }),
});

console.log('status', res.status);
console.log(await res.text());
