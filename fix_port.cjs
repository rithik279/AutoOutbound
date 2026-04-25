const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');
// Change line 565 (0-indexed: 564) from "    server.listen" to "    server.listen"
const old = '    server.listen';
const newLine = '    server.listen';
lines[564] = newLine;
fs.writeFileSync('server.js', lines.join('\n'));
console.log('Written. Line 565 now:', JSON.stringify(lines[564]));
console.log('Byte length:', Buffer.byteLength(lines[564], 'utf8'));