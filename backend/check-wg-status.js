#!/usr/bin/env node
/**
 * One-time diagnostic: simulate what checkAllRoutersStatus does.
 * Run on VPS: cd backend && node check-wg-status.js
 */
const { exec } = require('child_process');
const db = require('./config/database');

function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    const fullCmd = process.platform === 'linux' && cmd.startsWith('wg') ? `sudo ${cmd}` : cmd;
    exec(fullCmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve((stdout || '').trim());
    });
  });
}

async function main() {
  console.log('1. Running: sudo wg show wg0 dump');
  let output;
  try {
    output = await execCmd('wg show wg0 dump');
    console.log('   OK, got output. First 500 chars:', output.slice(0, 500));
  } catch (err) {
    console.error('   FAILED:', err.message);
    process.exit(1);
  }

  console.log('\n2. Parsing peers (like wireguardService does):');
  const lines = output.trim().split('\n').filter(Boolean);
  const peers = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length >= 5) {
      const allowedIps = parts[3] || '';
      const lastHandshake = parts[4] !== '0' ? new Date(parseInt(parts[4], 10) * 1000) : null;
      peers.push({ allowedIps, lastHandshake });
      const minutesAgo = lastHandshake ? ((Date.now() - lastHandshake.getTime()) / 60000).toFixed(1) : 'never';
      console.log(`   - ${allowedIps}: handshake ${minutesAgo} min ago`);
    }
  }

  console.log('\n3. DB routers and expected status:');
  const [routers] = await db.query('SELECT id, name, wg_ip FROM routers WHERE wg_ip IS NOT NULL');
  for (const r of routers) {
    const target = r.wg_ip + '/32';
    const peer = peers.find((p) => p.allowedIps === target || (p.allowedIps && p.allowedIps.includes(r.wg_ip)));
    let status = 'offline';
    if (peer && peer.lastHandshake) {
      const minutesAgo = (Date.now() - peer.lastHandshake.getTime()) / 60000;
      status = minutesAgo < 3 ? 'online' : 'offline';
    }
    console.log(`   - Router ${r.id} (${r.name}) ${r.wg_ip}: ${status}`);
  }

  console.log('\n4. Current status in DB:');
  const [rows] = await db.query('SELECT id, name, wg_ip, status FROM routers ORDER BY id');
  rows.forEach((r) => console.log(`   - ${r.id} ${r.name} ${r.wg_ip}: ${r.status}`));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
