/**
 * Initialize database - creates routerhub database and tables
 * Run: node db/init.js
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function init() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
  };

  try {
    const conn = await mysql.createConnection(config);
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await conn.query(schema);
    console.log('Database initialized successfully.');
    await conn.end();
  } catch (err) {
    console.error('Database init failed:', err.message);
    process.exit(1);
  }
}

init();
