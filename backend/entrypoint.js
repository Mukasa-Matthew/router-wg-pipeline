#!/usr/bin/env node
/**
 * Docker entrypoint: wait for MySQL, init DB, seed, then start server
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const maxAttempts = 30;
const delayMs = 2000;

async function waitForMysql() {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const conn = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASS,
        connectTimeout: 5000,
      });
      await conn.ping();
      await conn.end();
      console.log('MySQL is ready.');
      return;
    } catch (err) {
      console.log(`Waiting for MySQL... (${i}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('MySQL did not become ready in time.');
}

async function main() {
  await waitForMysql();

  console.log('Initializing database...');
  execSync('node db/init.js', { stdio: 'inherit' });

  console.log('Running migrations...');
  try {
    execSync('node db/migrate.js', { stdio: 'inherit' });
  } catch (e) {
    // Migrate may fail on fresh DB (columns exist) - continue
  }

  console.log('Seeding admin...');
  execSync('node db/seed.js', { stdio: 'inherit' });

  console.log('Starting RouterHub API...');
  require('./server.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
