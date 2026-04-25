const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Replace line 565 (0-indexed 564) with a string that has the port
// Using direct string assignment
lines[564] = '    server.listen';

fs.writeFileSync('server.js', lines.join('\n'));

// Verify
const check = fs.readFileSync('server.js', 'utf8').split('\n');
const line565 = check[564];
console.log('Line 565:', JSON.stringify(line565));
console.log('Byte length:', Buffer.byteLength(line565, 'utf8'));
console.log('Contains 3334:', line565.includes('3334'));
console.log('Contains parens:', line565.includes('('));