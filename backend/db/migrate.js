/**
 * Migration for existing databases - adds new columns and router_stats table
 * Run: node db/migrate.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'routerhub',
  });

  async function addIndexes(connection) {
    const indexes = [
      'CREATE INDEX idx_vouchers_router_id ON vouchers(router_id)',
      'CREATE INDEX idx_vouchers_exported ON vouchers(router_id, exported)',
      'CREATE INDEX idx_vouchers_profile ON vouchers(router_id, profile)',
      'CREATE INDEX idx_vouchers_username ON vouchers(username)',
      'CREATE INDEX idx_routers_status ON routers(status)',
      'CREATE INDEX idx_routers_wg_ip ON routers(wg_ip)',
      'CREATE INDEX idx_revenue_router_date ON revenue(router_id, date)',
      'CREATE INDEX idx_revenue_router_created ON revenue(router_id, created_at)',
      'CREATE INDEX idx_profiles_router_id ON hotspot_profiles(router_id)',
      'CREATE INDEX idx_profiles_active ON hotspot_profiles(router_id, is_active)',
      'CREATE INDEX idx_wg_peers_router_id ON wireguard_peers(router_id)',
    ];
    for (const sql of indexes) {
      try {
        await connection.query(sql);
        console.log('OK:', sql.substring(0, 55) + '...');
      } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_DUP_INDEX') {
          console.log('Skip (exists):', sql.substring(0, 45) + '...');
        } else {
          console.warn('Index:', e.message);
        }
      }
    }
  }

  const run = async (sql, ignoreError) => {
    try {
      await conn.query(sql);
      console.log('OK:', sql.substring(0, 60) + '...');
    } catch (err) {
      const skipCodes = [
        'ER_DUP_FIELDNAME',
        'ER_TABLE_EXISTS_ERROR',
        'ER_DUP_KEYNAME',
        'ER_DUP_INDEX',
        'ER_CANT_DROP_FIELD_OR_KEY',
      ];
      if (ignoreError && skipCodes.includes(err.code)) {
        console.log('Skip (exists):', sql.substring(0, 50) + '...');
      } else {
        throw err;
      }
    }
  };

  try {
    // Hotspot profiles table (NEW)
    await run(
      `CREATE TABLE IF NOT EXISTS hotspot_profiles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        router_id INT NOT NULL,
        profile_name VARCHAR(100) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        validity VARCHAR(50) NOT NULL,
        validity_seconds INT NOT NULL DEFAULT 0,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        shared_users INT NOT NULL DEFAULT 1,
        rate_limit VARCHAR(50),
        session_timeout VARCHAR(50),
        idle_timeout VARCHAR(50),
        currency VARCHAR(10) DEFAULT 'UGX',
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE,
        UNIQUE KEY unique_profile_per_router (router_id, profile_name)
      )`,
      true
    );

    // Existing table fixes
    await run('ALTER TABLE routers ADD COLUMN initial_ip VARCHAR(50) AFTER lan_ip', true);
    try {
      await conn.query('ALTER TABLE routers ADD CONSTRAINT unique_wg_ip UNIQUE (wg_ip)');
      console.log('OK: unique_wg_ip constraint added');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_INDEX') throw e;
      console.log('Skip (exists): unique_wg_ip');
    }
    await run('ALTER TABLE vouchers ADD COLUMN exported_at DATETIME AFTER exported', true);
    await run(
      "ALTER TABLE routers MODIFY COLUMN status ENUM('online','offline','tunnel_failed') DEFAULT 'offline'",
      true
    );
    await run(
      `CREATE TABLE IF NOT EXISTS router_stats (
        router_id INT PRIMARY KEY,
        cpu_load INT DEFAULT 0,
        memory_used BIGINT DEFAULT 0,
        memory_total BIGINT DEFAULT 0,
        uptime VARCHAR(100),
        updated_at DATETIME,
        FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE
      )`,
      true
    );
    await run('ALTER TABLE routers ADD COLUMN webfig_port INT AFTER wg_ip', true);
    await run('ALTER TABLE routers ADD COLUMN winbox_port INT AFTER webfig_port', true);
    try {
      const [res] = await conn.query('UPDATE routers SET webfig_port = 8085 WHERE id = 1');
      if (res && res.affectedRows > 0) console.log('OK: Conference WiFi (id=1) set to webfig_port 8085');
    } catch (e) {
      console.log('Skip: Conference WiFi port update (id=1 may not exist)');
    }
    try {
      const [res] = await conn.query('UPDATE routers SET winbox_port = 8291 WHERE id = 1');
      if (res && res.affectedRows > 0) console.log('OK: Conference WiFi (id=1) set to winbox_port 8291');
    } catch (e) {
      console.log('Skip: Conference WiFi winbox port update (id=1 may not exist)');
    }

    await addIndexes(conn);
    console.log('Migration complete.');
  } finally {
    await conn.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
