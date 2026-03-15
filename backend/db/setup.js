/**
 * Run db init then seed
 * Usage: node db/setup.js
 */
const { execSync } = require('child_process');
const path = require('path');

try {
  execSync('node db/init.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  execSync('node db/seed.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  console.log('\nSetup complete.');
} catch (err) {
  process.exit(1);
}
