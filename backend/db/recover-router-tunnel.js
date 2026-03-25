/**
 * Restore RouterHub DB rows for routers whose WireGuard peers ALREADY exist on the VPS.
 * Does NOT add/remove wg0 peers or change keys — only INSERT into `routers` + `wireguard_peers`.
 *
 * Usage on the VPS:
 *   cd /var/www/html/routerhub/backend
 *   cp db/routers-recovery.example.json db/routers-recovery.json
 *   nano db/routers-recovery.json   # fill wg_private_key, username, password, names
 *   node db/recover-router-tunnel.js db/routers-recovery.json
 *   pm2 restart routerhub --update-env
 *
 * Private key: MikroTik → Interfaces → WireGuard (e.g. wg-vps) → copy Private key
 * Public key must match: wg show wg0 (peer line) for that wg_ip.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const mysql = require('mysql2/promise');
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
  const jsonPath = path.resolve(process.argv[2] || path.join(__dirname, 'routers-recovery.json'));
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

    for (const r of list) {
      const name = requireNonEmpty(r.name, 'name');
      const wg_ip = requireNonEmpty(r.wg_ip, 'wg_ip');
      const wg_public_key = requireNonEmpty(r.wg_public_key, 'wg_public_key');
      const wg_private_key = requireNonEmpty(r.wg_private_key, 'wg_private_key');
      const username = requireNonEmpty(r.username, 'username');
      const password = requireNonEmpty(r.password, 'password');

      const api_port = parseInt(r.api_port, 10) || 8728;
      const location = r.location != null ? String(r.location) : '';
      const lan_ip = (r.lan_ip && String(r.lan_ip).trim()) || wg_ip;

      if (used.has(wg_ip)) {
        console.warn(`Skip (already in DB): ${name} ${wg_ip}`);
        continue;
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

      if (doTest) {
        const ok = await testTcp(wg_ip, api_port);
        console.log(`    TCP ${wg_ip}:${api_port} -> ${ok ? 'open' : 'closed/filtered'}`);
      }
    }

    console.log('\nDone. Restart API: pm2 restart routerhub --update-env');
    console.log('Optional: RECOVER_TEST_TCP=1 node db/recover-router-tunnel.js ... to probe API port.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
