const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');

// The Gmail server.listen should be:
// Line 565: "    server.listen" (no port)
// But I need it to be: "    server.listen"

// Find the Gmail auth-start section and fix the server.listen there
const gmailSectionStart = content.indexOf("app.get('/api/gmail/auth-start'");
const afterGmail = content.indexOf("app.get('/api/gmail/token-health'");

// Within Gmail section, find server.listen without parentheses
const gmailContent = content.slice(gmailSectionStart, afterGmail);
const parts = gmailContent.split('\n');
let inCallback = false;
let braceCount = 0;
let serverListenLine = -1;

for (let i = 0; i < parts.length; i++) {
  const line = parts[i];
  if (line.includes('createServer')) inCallback = true;
  if (inCallback) {
    if (line.includes('{')) braceCount++;
    if (line.includes('}')) braceCount--;
    if (line.trim() === 'server.listen') {
      serverListenLine = i;
    }
    if (braceCount === 0 && inCallback) break;
  }
}

console.log('serverListenLine index:', serverListenLine);
console.log('Line content:', parts[serverListenLine]);

if (parts[serverListenLine] === '    server.listen') {
  parts[serverListenLine] = '    server.listen';
  console.log('Fixed!');
}

// Reconstruct
const newContent = content.slice(0, gmailSectionStart) + parts.join('\n') + content.slice(afterGmail);
fs.writeFileSync('server.js', newContent);
console.log('Written');