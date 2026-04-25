const fs = require('fs');
const path = 'C:/Users/manmi/GitHub/campaign-v2/src/App.jsx';
const repPath = 'C:/Users/manmi/GitHub/campaign-v2/settings-replacement.txt';

let content = fs.readFileSync(path, 'utf8');
const replacement = fs.readFileSync(repPath, 'utf8');

const start = content.indexOf('// ── SETTINGS ────────────────────────────────────────────────────────────');
const end = content.indexOf('// ── LEVEL 0: PROMPT DISCOVERY ───────────────────────────────────────────');
if (start === -1 || end === -1) { console.error('Could not find boundaries'); process.exit(1); }

content = content.slice(0, start) + replacement + content.slice(end);
fs.writeFileSync(path, content);
console.log('Done. Replaced', end - start, 'chars with', replacement.length, 'chars');