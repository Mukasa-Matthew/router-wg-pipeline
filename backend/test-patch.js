/**
 * Quick smoke test: verify node-routeros patch is applied (handles !empty)
 */
const fs = require('fs');
const path = require('path');

const channelPath = path.join(__dirname, 'node_modules', 'node-routeros', 'dist', 'Channel.js');
const content = fs.readFileSync(channelPath, 'utf8');

const hasEmpty = content.includes("case '!empty':");
const hasComment = content.includes('RouterOS 7.19+ returns !empty');

if (hasEmpty && hasComment) {
  console.log('✓ Patch applied: Channel.js handles !empty');
  process.exit(0);
} else {
  console.error('✗ Patch missing: run npm install (postinstall applies patch)');
  process.exit(1);
}
