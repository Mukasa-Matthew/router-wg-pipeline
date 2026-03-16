const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../config/database');

const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

/**
 * Execute shell command (wg only available on Linux, uses sudo)
 */
function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    const fullCmd =
      isLinux && cmd.startsWith('wg') ? `sudo ${cmd}` : cmd;
    exec(fullCmd, (error, stdout, stderr) => {
      if (error) {
        if (!isLinux) resolve('');
        else reject(error);
      } else {
        resolve((stdout || '').trim());
      }
    });
  });
}

/**
 * Execute command with sudo (for Apache, ufw, systemctl - Linux only)
 */
function execCmdSudo(cmd) {
  return new Promise((resolve, reject) => {
    const fullCmd = isLinux ? `sudo ${cmd}` : cmd;
    exec(fullCmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve((stdout || '').trim());
    });
  });
}

/**
 * Generate WireGuard keypair (requires wg CLI - Linux only)
 */
async function generateKeypair() {
  if (isWindows) {
    throw new Error('Adding routers with WireGuard requires Linux. Run the backend on your VPS to add routers.');
  }
  const privateKey = await execCmd('wg genkey');
  const publicKey = await execCmd(`echo "${privateKey.trim()}" | wg pubkey`);
  return {
    privateKey: privateKey.trim(),
    publicKey: publicKey.trim(),
  };
}

/**
 * Get next available WireGuard IP from 10.10.0.x
 * VPS is 10.10.0.1, first router is 10.10.0.2, etc.
 */
async function getNextAvailableIP() {
  const [rows] = await db.query(
    'SELECT wg_ip FROM routers WHERE wg_ip IS NOT NULL ORDER BY id'
  );
  const usedIPs = (rows || [])
    .map((r) => parseInt((r.wg_ip || '').split('.')[3], 10))
    .filter((n) => !isNaN(n));
  let next = 2;
  while (usedIPs.includes(next)) next++;
  if (next > 254) throw new Error('Maximum routers reached (253)');
  const subnet = process.env.WG_SUBNET || '10.10.0';
  return `${subnet}.${next}`;
}

/**
 * Add peer to VPS WireGuard (live + persist to wg0.conf)
 * Note: Requires root/sudo on Linux. On Windows, this will fail - handle gracefully.
 */
async function addPeerToVPS(publicKey, wgIp) {
  try {
    await execCmd(`wg set wg0 peer ${publicKey} allowed-ips ${wgIp}/32`);
  } catch (err) {
    console.warn('Live wg set failed (may not be on Linux with wg0):', err.message);
  }

  const confPath =
    process.platform === 'win32' ? null : process.env.WG_CONFIG_PATH || '/etc/wireguard/wg0.conf';
  if (confPath && fs.existsSync(path.dirname(confPath))) {
    const peerConfig = `\n[Peer]\nPublicKey = ${publicKey}\nAllowedIPs = ${wgIp}/32\n`;
    fs.appendFileSync(confPath, peerConfig);
  }
}

/**
 * Remove peer from VPS (running config + wg0.conf)
 */
async function removePeerFromVPS(publicKey) {
  try {
    await execCmd(`wg set wg0 peer ${publicKey} remove`);
  } catch (err) {
    console.warn('Remove peer failed:', err.message);
  }
  if (!isWindows) await removePeerFromConfig(publicKey);
}

/**
 * Get all tunnel statuses from wg show (Linux only; returns [] on Windows)
 * wg dump format: public_key, psk, endpoint, allowed_ips, latest_handshake, tx_bytes, rx_bytes
 */
async function getTunnelStatus() {
  if (isWindows) return [];
  try {
    const output = await execCmd('wg show wg0 dump');
    const lines = output.trim().split('\n').filter(Boolean);
    const peers = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length >= 5) {
        peers.push({
          publicKey: parts[0],
          allowedIps: parts[3] || '',
          lastHandshake: parts[4] !== '0' ? new Date(parseInt(parts[4], 10) * 1000) : null,
          bytesSent: parseInt(parts[5] || 0, 10),
          bytesReceived: parseInt(parts[6] || 0, 10),
        });
      }
    }
    return peers;
  } catch {
    return [];
  }
}

/**
 * Verify WireGuard tunnel actually established (handshake within last 3 min)
 */
async function verifyTunnel(wgIp, maxAttempts = 10) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const status = await getTunnelStatus();
    const target = wgIp + '/32';
    const peer = status.find((p) => p.allowedIps === target || p.allowedIps.startsWith(wgIp));
    if (peer && peer.lastHandshake) {
      return { success: true, handshake: peer.lastHandshake };
    }
  }
  return { success: false };
}

/**
 * Get next available WebFig port (8085, 8086, 8087, ...)
 */
async function getNextWebfigPort() {
  const [rows] = await db.query(
    'SELECT webfig_port FROM routers WHERE webfig_port IS NOT NULL ORDER BY webfig_port'
  );
  const usedPorts = (rows || []).map((r) => r.webfig_port).filter((p) => p != null);
  let next = 8085;
  while (usedPorts.includes(next)) next++;
  return next;
}

/**
 * Create Apache virtual host to proxy WebFig for a router
 * WebFig runs on MikroTik port 8291 (Winbox) or 80/443 - typically 80 for web
 * MikroTik WebFig uses port 80 or 8291. User spec says port 85.
 */
async function createWebfigProxy(wgIp, port) {
  if (!isLinux) {
    console.warn('WebFig proxy creation skipped (not Linux)');
    return { port };
  }
  const config = `
Listen ${port}
<VirtualHost *:${port}>
    ProxyPreserveHost Off
    ProxyPass / http://${wgIp}:85/
    ProxyPassReverse / http://${wgIp}:85/
</VirtualHost>
`;
  const tmpPath = path.join(os.tmpdir(), `webfig-${port}.conf`);
  const configPath = `/etc/apache2/sites-available/webfig-${port}.conf`;
  fs.writeFileSync(tmpPath, config.trim());
  await execCmdSudo(`cp ${tmpPath} ${configPath} && rm -f ${tmpPath}`);
  await execCmdSudo(`a2ensite webfig-${port}`);
  try {
    await execCmdSudo(`ufw allow ${port}/tcp`);
  } catch (e) {
    console.warn('ufw allow failed (may need manual rule):', e.message);
  }
  await execCmdSudo('systemctl reload apache2');
  return { port };
}

/**
 * Create Nginx stream proxy for Winbox (port 8291 on MikroTik)
 * VPS listens on 8290+routerId, proxies to wgIp:8291
 */
async function createWinboxProxy(wgIp, routerIndex) {
  if (!isLinux) {
    console.warn('Winbox proxy creation skipped (not Linux)');
    return { winbox_port: 8290 + routerIndex };
  }
  const port = 8290 + routerIndex;
  const config = `server {
    listen ${port};
    proxy_pass ${wgIp}:8291;
    proxy_connect_timeout 10s;
    proxy_timeout 300s;
}
`;
  const tmpPath = path.join(os.tmpdir(), `winbox-router${routerIndex}.conf`);
  const configPath = `/etc/nginx/stream.d/winbox-router${routerIndex}.conf`;
  fs.writeFileSync(tmpPath, config.trim());
  await execCmdSudo(`mkdir -p /etc/nginx/stream.d && cp ${tmpPath} ${configPath} && rm -f ${tmpPath}`);
  try {
    await execCmdSudo(`ufw allow ${port}/tcp`);
  } catch (e) {
    console.warn('ufw allow failed (may need manual rule):', e.message);
  }
  await execCmdSudo('systemctl reload nginx');
  return { winbox_port: port };
}

/**
 * Remove Nginx Winbox stream proxy
 */
async function removeWinboxProxy(routerIndex) {
  if (!isLinux || !routerIndex) return;
  const port = 8290 + routerIndex;
  try {
    await execCmdSudo(`rm -f /etc/nginx/stream.d/winbox-router${routerIndex}.conf`);
    await execCmdSudo(`ufw delete allow ${port}/tcp`);
  } catch (e) {
    console.warn('removeWinboxProxy:', e.message);
  }
  try {
    await execCmdSudo('systemctl reload nginx');
  } catch (e) {
    console.warn('nginx reload failed:', e.message);
  }
}

/**
 * Remove WebFig Apache virtual host
 */
async function removeWebfigProxy(port) {
  if (!isLinux || !port) return;
  try {
    await execCmdSudo(`a2dissite webfig-${port}`);
  } catch (e) {
    console.warn('a2dissite failed:', e.message);
  }
  try {
    await execCmdSudo(`ufw delete allow ${port}/tcp`);
  } catch (e) {
    console.warn('ufw delete failed:', e.message);
  }
  const configPath = `/etc/apache2/sites-available/webfig-${port}.conf`;
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
  await execCmdSudo('systemctl reload apache2');
}

/**
 * Remove peer from wg0.conf file
 */
async function removePeerFromConfig(publicKey) {
  const configPath =
    process.env.WG_CONFIG_PATH || '/etc/wireguard/wg0.conf';
  if (!fs.existsSync(configPath)) return;
  const config = fs.readFileSync(configPath, 'utf8');
  const escaped = publicKey.replace(/[+/=]/g, '\\$&');
  const peerRegex = new RegExp(
    `\\[Peer\\]\\nPublicKey = ${escaped}\\nAllowedIPs = [^\\n]+\\n?`,
    'g'
  );
  const newConfig = config.replace(peerRegex, '');
  fs.writeFileSync(configPath, newConfig);
}

module.exports = {
  generateKeypair,
  getNextAvailableIP,
  addPeerToVPS,
  removePeerFromVPS,
  removePeerFromConfig,
  getTunnelStatus,
  verifyTunnel,
  getNextWebfigPort,
  createWebfigProxy,
  removeWebfigProxy,
  createWinboxProxy,
  removeWinboxProxy,
};
