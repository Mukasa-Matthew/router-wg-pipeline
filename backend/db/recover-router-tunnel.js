/**
 * Restore RouterHub DB rows for routers whose WireGuard peers ALREADY exist on the VPS.
 * Does NOT add/remove wg0 peers or change keys — only INSERT into `routers` + `wireguard_peers`.
 *
 * Usage on the VPS:
 *   cd /var/www/html/routerhub/backend
 *   cp db/routers-recovery.example.json db/routers-recovery.json
 *   nano db/routers-recovery.json   # real API user/password; wg_public_key from: sudo wg show wg0
 *   node db/recover-router-tunnel.js db/routers-recovery.json --fetch-keys
 *   pm2 restart routerhub --update-env
 *
 * --fetch-keys: pull wg_private_key from each router via API (run on VPS; needs API on 10.10.0.x).
 * In JSON use "wg_private_key": "PULL_VIA_API" and/or "fetch_private_key": true on that object.
 * Vouchers/profiles/revenue need a MySQL backup to restore.
 *
 * You can list every site in routers-recovery.json; wg_ips already in `routers` are skipped — only missing rows are INSERTed.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const mysql = require('mysql2/promise');
const { fetchWireGuardPrivateKey, shouldFetchPrivateKey } = require('./wgKeyFetch');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function requireNonEmpty(v, field) {
  if (v == null || String(v).trim() === '') {
    throw new Error(`Missing required field: ${field}`);
  }
  return String(v).trim();
}

function testTcp(host, port, ms = 4000) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(ms, () => {
      try {
        s.destroy();
      } catch (_) {}
      resolve(false);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--fetch-keys' && a !== '--plan-only');
  const fetchKeys = process.argv.includes('--fetch-keys');
  const planOnly = process.argv.includes('--plan-only');
  const jsonPath = path.resolve(argv[0] || path.join(__dirname, 'routers-recovery.json'));
  if (!fs.existsSync(jsonPath)) {
    console.error('File not found:', jsonPath);
    console.error('Copy db/routers-recovery.example.json to db/routers-recovery.json and edit it.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const list = raw.routers;
  if (!Array.isArray(list) || list.length === 0) {
    console.error('JSON must contain a non-empty "routers" array.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'routerhub',
    multipleStatements: false,
  });

  const doTest = String(process.env.RECOVER_TEST_TCP || '').trim() === '1' || raw.test_tcp === true;

  try {
    const [existing] = await conn.query('SELECT wg_ip FROM routers WHERE wg_ip IS NOT NULL');
    const used = new Set((existing || []).map((r) => r.wg_ip));

    const planSkip = [];
    const planInsert = [];
    for (const r of list) {
      const wip = r.wg_ip != null ? String(r.wg_ip).trim() : '';
      if (!wip) continue;
      const label = (r.name != null && String(r.name).trim()) || wip;
      if (used.has(wip)) planSkip.push(`${wip} (${label})`);
      else planInsert.push(`${wip} (${label})`);
    }
    console.log('--- Recovery plan (vs routers.wg_ip) ---');
    if (planSkip.length) console.log(`Skip (already in database): ${planSkip.join(', ')}`);
    if (planInsert.length) console.log(`Will INSERT (missing): ${planInsert.join(', ')}`);
    else console.log('Nothing to insert — every wg_ip in this file is already in the database.');
    console.log('---\n');
    if (planOnly) {
      console.log('--plan-only: no changes made.');
      return;
    }

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of list) {
      const name = requireNonEmpty(r.name, 'name');
      const wg_ip = requireNonEmpty(r.wg_ip, 'wg_ip');
      const wg_public_key = requireNonEmpty(r.wg_public_key, 'wg_public_key');
      const username = requireNonEmpty(r.username, 'username');
      const password = requireNonEmpty(r.password, 'password');
      const api_port = parseInt(r.api_port, 10) || 8728;
      const location = r.location != null ? String(r.location) : '';
      const lan_ip = (r.lan_ip && String(r.lan_ip).trim()) || wg_ip;

      try {
        if (used.has(wg_ip)) {
          skipped += 1;
          console.warn(`Skip (already in DB): ${name} ${wg_ip}`);
          continue;
        }

        let wg_private_key = (r.wg_private_key && String(r.wg_private_key).trim()) || '';
        if (shouldFetchPrivateKey(r, wg_private_key)) {
          if (!fetchKeys) {
            throw new Error(
              `Router "${name}" (${wg_ip}): set wg_private_key or use PULL_VIA_API + run with --fetch-keys (API on ${wg_ip}:8728).`
            );
          }
          console.log(`Fetching WG private key via API: ${wg_ip} (${name})...`);
          wg_private_key = await fetchWireGuardPrivateKey(
            wg_ip,
            username,
            password,
            api_port,
            wg_public_key
          );
          console.log(`  OK`);
        }

        const [result] = await conn.query(
          `INSERT INTO routers (
          name, location, lan_ip, initial_ip, api_port, username, password,
          wg_ip, wg_public_key, wg_private_key, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline')`,
          [
            name,
            location,
            lan_ip,
            lan_ip,
            api_port,
            username,
            password,
            wg_ip,
            wg_public_key,
            wg_private_key,
          ]
        );
        const routerId = result.insertId;
        used.add(wg_ip);

        await conn.query(
          `INSERT INTO wireguard_peers (router_id, public_key, private_key, wg_ip, status) VALUES (?, ?, ?, ?, 'disconnected')`,
          [routerId, wg_public_key, wg_private_key, wg_ip]
        );

        console.log(`OK: id=${routerId} name="${name}" wg_ip=${wg_ip}`);
        inserted += 1;

        if (doTest) {
          const ok = await testTcp(wg_ip, api_port);
          console.log(`    TCP ${wg_ip}:${api_port} -> ${ok ? 'open' : 'closed/filtered'}`);
        }
      } catch (err) {
        failed += 1;
        const msg = err?.message || String(err);
        console.error(`FAIL: ${name} (${wg_ip}) — ${msg}`);
      }
    }

    console.log(`\nSummary: inserted=${inserted}, skipped=${skipped}, failed=${failed}`);
    console.log('Done. Restart API: pm2 restart routerhub --update-env');
    console.log('Optional: RECOVER_TEST_TCP=1 node db/recover-router-tunnel.js ... to probe API port.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
