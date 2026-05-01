const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');
const lines = c.split('\n');

// Fix lines 569-572 in gmail auth-start
// Current (broken):
// 569:     })
// 570:     server.on('error', ...)
// 571:     server.listen(3334, ...)
// 572:   })
// 573:   res.send(...)
// 574: })

// Target (correct - no outer callback):
// 569:     })
// 570:     server.on('error', ...)
// 571:     server.listen(3334, ...)
// 572:   res.send(...)
// 573: })

lines[572] = "  res.send(`<html><body><script>window.location=\"${authUrl}\"</script><p>Opening Google sign-in…</p></body></html>`)";

fs.writeFileSync('server.js', lines.join('\n'));
console.log('done');
