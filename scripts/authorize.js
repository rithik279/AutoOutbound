// Run once to authorize via Microsoft Graph:
//   node scripts/authorize.js <YOUR_CLIENT_ID>
//
// It prints a URL + code — open the URL in a browser, sign in with
// manmit.singh@live.com, enter the code. Done. Tokens saved to .tokens.json.

import msal from '@azure/msal-node'
import { writeFileSync } from 'fs'

const CLIENT_ID = process.argv[2]
if (!CLIENT_ID) {
  console.error('Usage: node scripts/authorize.js <YOUR_CLIENT_ID>')
  console.error('Get the client ID from portal.azure.com → App registrations → your app → Overview')
  process.exit(1)
}

const cachePlugin = {
  beforeCacheAccess: async () => {},
  afterCacheAccess: async (ctx) => {
    if (ctx.cacheHasChanged) {
      writeFileSync('.tokens.json', ctx.tokenCache.serialize())
    }
  }
}

const app = new msal.PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: 'https://login.microsoftonline.com/consumers'
  },
  cache: { cachePlugin }
})

console.log('\nStarting Microsoft authorization...\n')

const result = await app.acquireTokenByDeviceCode({
  scopes: ['https://graph.microsoft.com/Mail.Send', 'offline_access'],
  deviceCodeCallback: (res) => console.log(res.message)
})

// Also save the client ID so the server knows which app to use
const tokens = JSON.parse(require('fs').readFileSync('.tokens.json', 'utf8'))
writeFileSync('.tokens.json', JSON.stringify({ ...tokens, clientId: CLIENT_ID }, null, 2))

console.log(`\n✓ Authorized as ${result.account.username}`)
console.log('✓ Tokens saved to .tokens.json — server is ready to send emails\n')
