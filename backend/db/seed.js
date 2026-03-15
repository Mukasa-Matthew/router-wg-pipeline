/**
 * Seed admin credentials
 * Run: node db/seed.js
 *
 * Admin login: matthew | matthewmukasa50@gmail.com | 0792255955
 * Password: 1100211Matt.
 */
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seed() {
  try {
    const password = '1100211Matt.';
    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = {
      username: 'matthew',
      email: 'matthewmukasa50@gmail.com',
      phone: '0792255955',
      password: hashedPassword,
    };

    // Check if admin already exists
    const [existing] = await db.query(
      'SELECT id FROM admin WHERE username = ? OR email = ? OR phone = ?',
      [admin.username, admin.email, admin.phone]
    );

    if (existing.length > 0) {
      await db.query(
        'UPDATE admin SET password = ?, email = ?, phone = ? WHERE username = ?',
        [hashedPassword, admin.email, admin.phone, admin.username]
      );
      console.log('Admin credentials updated successfully.');
    } else {
      await db.query('INSERT INTO admin (username, email, phone, password) VALUES (?, ?, ?, ?)', [
        admin.username,
        admin.email,
        admin.phone,
        hashedPassword,
      ]);
      console.log('Admin seeded successfully.');
    }

    console.log('\nLogin with any of:');
    console.log('  Username: matthew');
    console.log('  Email: matthewmukasa50@gmail.com');
    console.log('  Phone: 0792255955');
    console.log('  Password: 1100211Matt.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
