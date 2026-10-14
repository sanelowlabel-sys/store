import type { IncomingMessage, ServerResponse } from 'http';
import { getBaseUrl, isPreviewDeployment } from './_seo';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = req.headers.host || '';
  const isPreview = isPreviewDeployment(host);
  const baseUrl = getBaseUrl();

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

  if (isPreview) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const previewContent = `# Sanelow Merchant Store - Preview Deployment
# Indexing disabled for staging / preview environments
User-agent: *
Disallow: /
`;
    res.statusCode = 200;
    res.end(previewContent);
    return;
  }

  const prodContent = `# Sanelow Merchant Store Robots Configuration
# Intended Production URL: ${baseUrl}

User-agent: *
Allow: /
Disallow: /cart
Disallow: /checkout
Disallow: /account
Disallow: /api/
Disallow: /*?*q=

Sitemap: ${baseUrl}/sitemap.xml
`;

  res.statusCode = 200;
  res.end(prodContent);
}
