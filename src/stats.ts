/**
 * Reads back what analytics.ts writes, via the Analytics Engine SQL API, and
 * serves it as JSON or a small HTML page.
 *
 * Configuration (all three required, or /stats returns 404):
 *   CF_ACCOUNT_ID       Cloudflare account id
 *   CF_ANALYTICS_TOKEN  API token with Account Analytics: Read
 *   STATS_TOKEN         shared secret callers send as `Authorization: Bearer …`
 *
 * Usage numbers are not public by default: with STATS_TOKEN unset the endpoint
 * does not exist at all.
 */

const DATASET = 'openmm_mcp';
const SQL_API = 'https://api.cloudflare.com/client/v4/accounts';

interface StatsEnv {
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  STATS_TOKEN?: string;
  // The worker's env carries far more than this; accept it whole.
  [key: string]: unknown;
}

interface SqlRow {
  [column: string]: string | number;
}

async function query(env: StatsEnv, sql: string): Promise<SqlRow[]> {
  const response = await fetch(`${SQL_API}/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: sql,
  });

  if (!response.ok) {
    throw new Error(`Analytics query failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { data?: SqlRow[] };
  return body.data ?? [];
}

/**
 * `_sample_interval` is Analytics Engine's sampling weight. Summing it rather
 * than counting rows is what makes the totals correct once sampling kicks in at
 * volume — plain count() undercounts.
 */
const CALLS = 'SUM(_sample_interval) AS calls';

export interface Stats {
  window: string;
  totals: SqlRow[];
  tools: SqlRow[];
  clients: SqlRow[];
  methods: SqlRow[];
  daily: SqlRow[];
}

export async function collectStats(env: StatsEnv, days: number): Promise<Stats> {
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

  const [totals, tools, clients, methods, daily] = await Promise.all([
    query(
      env,
      `SELECT ${CALLS},
              SUM(IF(blob4 = 'error', _sample_interval, 0)) AS errors,
              quantileWeighted(0.5)(double1, _sample_interval) AS p50_ms,
              quantileWeighted(0.95)(double1, _sample_interval) AS p95_ms
       FROM ${DATASET} WHERE ${since}`
    ),
    query(
      env,
      `SELECT blob2 AS tool, ${CALLS}
       FROM ${DATASET} WHERE ${since} AND blob2 != ''
       GROUP BY tool ORDER BY calls DESC LIMIT 50`
    ),
    query(
      env,
      `SELECT blob3 AS client, ${CALLS}
       FROM ${DATASET} WHERE ${since}
       GROUP BY client ORDER BY calls DESC LIMIT 25`
    ),
    query(
      env,
      `SELECT blob1 AS method, ${CALLS}
       FROM ${DATASET} WHERE ${since}
       GROUP BY method ORDER BY calls DESC LIMIT 25`
    ),
    query(
      env,
      `SELECT toDate(timestamp) AS day, ${CALLS}
       FROM ${DATASET} WHERE ${since}
       GROUP BY day ORDER BY day`
    ),
  ]);

  return { window: `${days}d`, totals, tools, clients, methods, daily };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
  );
}

function table(title: string, rows: SqlRow[], keyColumn: string): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(String(row[keyColumn] ?? ''))}</td><td>${Number(row.calls ?? 0).toLocaleString()}</td></tr>`
    )
    .join('');
  return `<h2>${escapeHtml(title)}</h2><table><tr><th>${escapeHtml(keyColumn)}</th><th>calls</th></tr>${body || '<tr><td colspan="2">no data yet</td></tr>'}</table>`;
}

export function renderStatsHtml(stats: Stats): string {
  const t = stats.totals[0] ?? {};
  const calls = Number(t.calls ?? 0);
  const errors = Number(t.errors ?? 0);

  return `<!doctype html><meta charset="utf-8"><title>OpenMM MCP usage</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:52rem;color:#1a1a2e}
  h1{font-size:1.4rem;margin:0} .sub{color:#666;margin:.2rem 0 1.5rem}
  .cards{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem}
  .card{border:1px solid #e3e3ea;border-radius:8px;padding:.8rem 1.2rem;min-width:8rem}
  .card b{display:block;font-size:1.6rem}
  table{border-collapse:collapse;width:100%;margin-bottom:1.5rem}
  th,td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid #eee}
  th{color:#666;font-weight:600}
  h2{font-size:1rem;margin:1.5rem 0 .4rem}
</style>
<h1>OpenMM MCP usage</h1>
<p class="sub">last ${escapeHtml(stats.window)} · from Workers Analytics Engine</p>
<div class="cards">
  <div class="card"><b>${calls.toLocaleString()}</b>calls</div>
  <div class="card"><b>${errors.toLocaleString()}</b>errors</div>
  <div class="card"><b>${Math.round(Number(t.p50_ms ?? 0))} ms</b>p50 latency</div>
  <div class="card"><b>${Math.round(Number(t.p95_ms ?? 0))} ms</b>p95 latency</div>
</div>
${table('Tools', stats.tools, 'tool')}
${table('Clients', stats.clients, 'client')}
${table('Methods', stats.methods, 'method')}
${table('Daily', stats.daily, 'day')}`;
}

/**
 * Handle GET /stats. Returns `undefined` when the endpoint is not configured,
 * so the caller can fall through to its 404.
 */
export async function handleStats(request: Request, env: StatsEnv): Promise<Response | undefined> {
  if (!env.STATS_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return undefined;

  if (request.headers.get('Authorization') !== `Bearer ${env.STATS_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '7', 10) || 7, 1), 90);

  try {
    const stats = await collectStats(env, days);
    return url.searchParams.get('format') === 'html'
      ? new Response(renderStatsHtml(stats), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      : new Response(JSON.stringify(stats, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
