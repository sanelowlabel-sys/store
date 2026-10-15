import type { IncomingMessage, ServerResponse } from 'http';

export const DEFAULT_SITE_URL = 'https://shop.sanelowmusiclabel.co.za';

export function getBaseUrl(): string {
  const envUrl = process.env.SITE_URL || process.env.VITE_SITE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_SITE_URL;
}

export function isPreviewDeployment(host?: string): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development';
  }

  if (host) {
    const cleanHost = host.toLowerCase().split(':')[0];
    if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
      return true;
    }
    if (cleanHost.includes('-git-') || cleanHost.includes('preview') || cleanHost.includes('ais-dev')) {
      return true;
    }
  }

  return false;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
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
  } catch (err: any) {
    console.error('[Robots Handler Error]:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('User-agent: *\nDisallow: /\n');
    }
  }
}
