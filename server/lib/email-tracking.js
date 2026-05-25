/**
 * server/lib/email-tracking.js
 *
 * Transforms a plain-text email body into tracked HTML:
 *   1. Converts newlines to <br> tags
 *   2. Rewrites http/https links to tracking redirect URLs
 *   3. Appends a 1×1 tracking pixel
 *
 * Used by both Gmail and Outlook send paths.
 *
 * Exports:
 *   buildTrackedHtml(body, trackingId) → string (HTML)
 *   buildTrackingPixelUrl(trackingId)  → string (URL)
 */

const BASE_URL = process.env.API_BASE_URL || 'https://autooutbound.onrender.com'

/**
 * Encode a URL to base64url for use as a path segment.
 */
function encodeUrl(url) {
  return Buffer.from(url, 'utf-8').toString('base64url')
}

/**
 * Rewrite all http/https URLs in text to tracking redirect URLs.
 */
function rewriteLinks(text, trackingId) {
  return text.replace(/https?:\/\/[^\s"'<>)]+/g, (url) => {
    const linkId = encodeUrl(url)
    return `${BASE_URL}/api/track/click/${trackingId}/${linkId}`
  })
}

/**
 * Convert plain text to simple HTML, rewrite links, append tracking pixel.
 *
 * @param {string} body       - Plain text email body
 * @param {string} trackingId - UUID from the Email record
 * @returns {string}          - Full HTML string ready to send
 */
export function buildTrackedHtml(body, trackingId) {
  // Escape HTML special chars in body text (but not in URLs we're about to rewrite)
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Rewrite links (operate on escaped text — URLs shouldn't contain < > &)
  const withLinks = rewriteLinks(escaped, trackingId)

  // Convert newlines to <br>
  const withBreaks = withLinks.replace(/\n/g, '<br>\n')

  // Tracking pixel URL
  const pixelUrl = `${BASE_URL}/api/track/open/${trackingId}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222;">
<p>${withBreaks}</p>
<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0;" alt="">
</body>
</html>`
}
