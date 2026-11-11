// Prints the current 6-digit code for the demo MFA accounts
// (ali.alsaadi, zainab.alobaidi, laith.alobaidi) – a stand-in for the phone app.
// Usage: npm run totp            or   npm run totp -- <BASE32_SECRET>
const totp = require('../src/services/totp');
const { DEMO_MFA_SECRET } = require('../src/db/seed');

const secret = process.argv[2] || DEMO_MFA_SECRET;
const period = 30;
const remaining = period - (Math.floor(Date.now() / 1000) % period);
console.log(`TOTP code: ${totp.generate(secret)}   (valid for ${remaining}s)`);
