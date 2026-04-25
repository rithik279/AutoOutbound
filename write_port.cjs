const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Line 565 needs to have port 3334 added
// Currently: '    server.listen' (17 bytes)
// Need: '    server.listen' (22 bytes)

// Try constructing the exact string needed
const port = '3334';
lines[564] = '    server.listen';

fs.writeFileSync('server.js', lines.join('\n'));

// Verify byte-by-byte
const check = fs.readFileSync('server.js', 'utf8').split('\n');
console.log('Line 565:', check[564]);
console.log('Bytes:', Buffer.byteLength(check[564]));