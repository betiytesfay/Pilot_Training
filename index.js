const { execSync } = require('child_process');

try {
  console.log('🔄 Checking GitHub for updates...');
  execSync('git pull origin main', { stdio: 'inherit' });
  console.log('✅ Updated to latest code from GitHub!');
} catch (err) {
  console.log('ℹ️ Pull skipped:', err.message);
}

require('./src/bot.js');
