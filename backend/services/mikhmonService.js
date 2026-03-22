const fs = require('fs');
const path = require('path');

const CONFIG_PATH =
  process.env.MIKHMON_CONFIG_PATH || '/var/www/html/mikhmon/include/config.php';
const BACKUP_DIR = '/var/www/html/mikhmon/include/backups';

function getConfigPath() {
  return process.env.MIKHMON_CONFIG_PATH || '/var/www/html/mikhmon/include/config.php';
}

/**
 * MikHmon password encryption (compatible with MikHmon config)
 */
function encrypt(str, key = 128) {
  const keyStr = key.toString();
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const keyChar = keyStr[i % keyStr.length] || keyStr[0];
    result += String.fromCharCode(char.charCodeAt(0) + keyChar.charCodeAt(0));
  }
  return Buffer.from(result, 'binary').toString('base64');
}

/**
 * Generate unique session name: lowercase, no spaces, no special chars
 * Example: "Conference WiFi" + id 1 → "conference-wifi-1"
 */
function getSessionName(router) {
  const slug = (router.name || 'router')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `${slug || 'router'}-${router.id}`;
}

/**
 * Check if MikHmon session exists for router
 */
function sessionExists(router) {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return false;
    const config = fs.readFileSync(configPath, 'utf8');
    const sessionName = getSessionName(router);
    return config.includes(`$data['${sessionName}']`);
  } catch {
    return false;
  }
}

/**
 * Backup config.php before modifying
 */
function backupConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return;
  const backupPath = path.join(BACKUP_DIR || path.dirname(configPath), `config.${Date.now()}.php.bak`);
  try {
    if (!fs.existsSync(path.dirname(backupPath))) {
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    }
    fs.copyFileSync(configPath, backupPath);
    console.log(`[MikHmon] Backed up config to ${backupPath}`);
  } catch (err) {
    console.warn('[MikHmon] Backup failed:', err.message);
  }
}

/**
 * Add MikHmon session when WireGuard tunnel is confirmed UP
 */
function addMikHmonSession(router) {
  if (process.platform === 'win32') {
    console.log('[MikHmon] Skipped on Windows (config path not available)');
    return;
  }
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    console.warn('[MikHmon] Config file not found:', configPath);
    return;
  }
  if (!router.wg_ip || !router.username || !router.password) {
    console.warn('[MikHmon] Router missing wg_ip, username or password');
    return;
  }

  try {
    backupConfig();
    let config = fs.readFileSync(configPath, 'utf8');
    const sessionName = getSessionName(router);
    const encryptedPassword = encrypt(router.password);
    const hotspotName = (router.name || 'hotspot1').replace(/'/g, "\\'");
    const dnsName = (router.location || '').replace(/'/g, "\\'");

    const sessionBlock = `
$data['${sessionName}'] = array (
  '1'=>'session-name!${router.wg_ip}',
  '2'=>'username@|@${router.username}',
  '3'=>'password#|#${encryptedPassword}',
  '4'=>'hotspot-name%${hotspotName}',
  '5'=>'dns-name^',
  '6'=>'currency&UGX',
  '7'=>'reload*5',
  '8'=>'interface(ether1',
  '9'=>'infolp)0',
  '10'=>'idleto=5',
  '11'=>'livereport@!@enable'
);
`;

    if (config.includes(`$data['${sessionName}']`)) {
      console.log(`[MikHmon] Session ${sessionName} already exists, skipping`);
      return;
    }

    config = config.trimEnd();
    if (!config.endsWith(';') && !config.endsWith('?>')) {
      config += '\n';
    }
    if (config.endsWith('?>')) {
      config = config.slice(0, -2).trimEnd() + sessionBlock + '\n?>';
    } else {
      config += sessionBlock + '\n';
    }

    fs.writeFileSync(configPath, config);
    console.log(`[Router ${router.id}] MikHmon session "${sessionName}" created`);
  } catch (err) {
    console.error('[MikHmon] addMikHmonSession failed:', err.message);
  }
}

/**
 * Remove MikHmon session when router is deleted
 */
function removeMikHmonSession(routerId, routerName) {
  if (process.platform === 'win32') return;
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return;

  try {
    const sessionName = getSessionName({ name: routerName || 'router', id: routerId });
    backupConfig();
    let config = fs.readFileSync(configPath, 'utf8');

    const escaped = sessionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(
      `\\$data\\['${escaped}'\\]\\s*=\\s*array\\s*\\([\\s\\S]*?\\r?\\n\\);\\s*`,
      'g'
    );

    const before = config.length;
    config = config.replace(blockRegex, '');
    if (config.length < before) {
      fs.writeFileSync(configPath, config);
      console.log(`[Router ${routerId}] MikHmon session "${sessionName}" removed`);
    }
  } catch (err) {
    console.error('[MikHmon] removeMikHmonSession failed:', err.message);
  }
}

/**
 * Update hotspot-name in MikHmon session when router name changes.
 * Finds the session block for this routerId (session keys end with "-{routerId}") and updates '4'=>'hotspot-name%...'.
 * This affects what shows on the MikHmon/voucher captive portal login page.
 */
function updateMikHmonHotspotNameBySession(routerId, newName) {
  if (process.platform === 'win32') return;
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return;
  if (!newName || typeof newName !== 'string' || !newName.trim()) return;

  const escapedHotspotName = newName.trim().replace(/'/g, "\\'");
  const idSuffix = `-${routerId}'`;

  try {
    let config = fs.readFileSync(configPath, 'utf8');
    const blockRegex = new RegExp(
      `(\\$data\\['[a-z0-9-]*${idSuffix}\\s*=\\s*array\\s*\\([\\s\\S]*?)'4'=>'hotspot-name%[^']*'([\\s\\S]*?\\);\\s*)`,
      'g'
    );
    const newConfig = config.replace(blockRegex, `$1'4'=>'hotspot-name%${escapedHotspotName}'$2`);
    if (newConfig !== config) {
      backupConfig();
      fs.writeFileSync(configPath, newConfig);
      console.log(`[MikHmon] Updated hotspot name for router ${routerId} to "${newName.trim()}"`);
    }
  } catch (err) {
    console.error('[MikHmon] updateMikHmonHotspotNameBySession failed:', err.message);
  }
}

/**
 * Get MikHmon URL for router session
 */
function getMikHmonUrl(routerId, routerName) {
  const baseUrl = process.env.MIKHMON_URL || `http://${process.env.VPS_IP || '198.199.76.158'}/mikhmon`;
  const sessionName = getSessionName({ name: routerName || 'router', id: routerId });
  return `${baseUrl}/?session=${encodeURIComponent(sessionName)}`;
}

module.exports = {
  addMikHmonSession,
  removeMikHmonSession,
  getMikHmonUrl,
  getSessionName,
  sessionExists,
  updateMikHmonHotspotNameBySession,
};
