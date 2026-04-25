const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');
// The Gmail auth-start server.listen is on a line by itself with no port
// The Microsoft auth-start server.listen has port
// We need to add port 3334 to the Gmail one
// Find the pattern: in Gmail auth, line before "server.listen" ends with "})"
// and the next line is just "server.listen" (no port, no comma)
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'server.listen' && i > 560) {
    lines[i] = '    server.listen';
  }
}
fs.writeFileSync('server.js', lines.join('\n'));
console.log('Fixed');
// Verify
const newLines = fs.readFileSync('server.js', 'utf8').split('\n');
for (let i = 0; i < newLines.length; i++) {
  if (newLines[i].includes('server.listen')) {
    console.log(i+1, newLines[i].trim());
  }
}