import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { isIP } from 'net';
import { defineConfig, Plugin } from 'vite';
import {
  SHOPIFY_API_VERSION,
  SERVER_GRAPHQL_OPERATIONS,
  validateOperationVariables,
} from './api/shopify';

const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';
const MAX_BODY_SIZE_BYTES = 64 * 1024;

// Dev proxy plugin for /api/shopify during local Vite development
function shopifyDevServerPlugin(): Plugin {
  return {
    name: 'shopify-dev-server-proxy',
    configureServer(server) {
      server.middlewares.use('/api/shopify', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
          return;
        }

        const contentType = req.headers['content-type'] || '';
        if (!contentType.toLowerCase().includes('application/json')) {
          res.statusCode = 415;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Unsupported Media Type. Content-Type must be application/json.' }));
          return;
        }

        let bodyData: any;
        const reqAny = req as any;
        if (reqAny.body !== undefined) {
          if (typeof reqAny.body !== 'object' || reqAny.body === null || Array.isArray(reqAny.body)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Malformed request body: expected a JSON object.' }));
            return;
          }
          try {
            const serialized = JSON.stringify(reqAny.body);
            if (Buffer.byteLength(serialized, 'utf-8') > MAX_BODY_SIZE_BYTES) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Payload Too Large: maximum allowed body size is 64 KB.' }));
              return;
            }
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Unable to serialize request body.' }));
            return;
          }
          bodyData = reqAny.body;
        } else {
          try {
            let totalBytes = 0;
            const buffers: Buffer[] = [];
            for await (const chunk of req) {
              const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
              totalBytes += buf.length;
              if (totalBytes > MAX_BODY_SIZE_BYTES) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Payload Too Large: maximum allowed body size is 64 KB.' }));
                return;
              }
              buffers.push(buf);
            }
            const raw = Buffer.concat(buffers).toString('utf-8');
            if (!raw.trim()) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Empty request body.' }));
              return;
            }
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Malformed request body: expected a JSON object.' }));
              return;
            }
            bodyData = parsed;
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON request body.' }));
            return;
          }
        }

        // Reject arbitrary client-supplied GraphQL queries
        if ('query' in bodyData) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'ARBITRARY_GRAPHQL_REJECTED',
              message: 'Client-supplied GraphQL query strings are not permitted. Send { operation, variables } instead.',
            })
          );
          return;
        }

        const operation = bodyData.operation;
        if (typeof operation !== 'string' || !operation.trim()) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'A valid "operation" string is required.' }));
          return;
        }

        const serverQuery = SERVER_GRAPHQL_OPERATIONS[operation];
        if (!serverQuery) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'UNKNOWN_OPERATION',
              message: `Unknown storefront operation: "${operation}".`,
            })
          );
          return;
        }

        const validation = validateOperationVariables(operation, bodyData.variables);
        if (!validation.valid) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'INVALID_VARIABLES',
              message: validation.error || 'Invalid variables for operation.',
            })
          );
          return;
        }

        const sanitizedVariables = validation.sanitizedVariables || {};

        const rawDomain = (
          process.env.SHOPIFY_STORE_DOMAIN || REQUIRED_STORE_DOMAIN
        ).trim();

        if (rawDomain !== REQUIRED_STORE_DOMAIN) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'INVALID_STORE_DOMAIN',
              message: `Configuration error: SHOPIFY_STORE_DOMAIN must equal "${REQUIRED_STORE_DOMAIN}" exactly. Received "${rawDomain}".`,
            })
          );
          return;
        }

        const privateToken = (
          process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN || ''
        ).trim();

        const publicToken = (
          process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || ''
        ).trim();

        if (
          privateToken.startsWith('shpat_') ||
          privateToken.startsWith('shpca_') ||
          publicToken.startsWith('shpat_') ||
          publicToken.startsWith('shpca_')
        ) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'ADMIN_TOKEN_NOT_SUPPORTED',
              message:
                'Admin API tokens (starting with shpat_ or shpca_) cannot be used with the Storefront API. Please use a Storefront API token created from the Shopify Headless sales channel.',
            })
          );
          return;
        }

        let usePrivateToken = false;
        let activeToken = '';

        if (privateToken) {
          usePrivateToken = true;
          activeToken = privateToken;
        } else if (publicToken) {
          usePrivateToken = false;
          activeToken = publicToken;
        } else {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'SHOPIFY_STOREFRONT_TOKEN_MISSING',
              message:
                'Shopify Storefront Access Token is not configured. Set SHOPIFY_STOREFRONT_ACCESS_TOKEN or SHOPIFY_STOREFRONT_PRIVATE_TOKEN in your environment or .env file.',
              storeDomain: REQUIRED_STORE_DOMAIN,
              configured: false,
            })
          );
          return;
        }

        const shopifyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };

        if (usePrivateToken) {
          shopifyHeaders['Shopify-Storefront-Private-Token'] = activeToken;
          const vercelForwardedFor = req.headers['x-vercel-forwarded-for'];
          if (typeof vercelForwardedFor === 'string' && vercelForwardedFor.trim()) {
            const candidateIp = vercelForwardedFor.split(',')[0].trim();
            if (isIP(candidateIp) !== 0) {
              shopifyHeaders['Shopify-Storefront-Buyer-IP'] = candidateIp;
            }
          }
        } else {
          shopifyHeaders['X-Shopify-Storefront-Access-Token'] = activeToken;
        }

        const endpoint = `https://${REQUIRED_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
          const upstreamResponse = await fetch(endpoint, {
            method: 'POST',
            headers: shopifyHeaders,
            body: JSON.stringify({
              query: serverQuery,
              variables: sanitizedVariables,
            }),
            signal: controller.signal,
          });

          const responseBody = await upstreamResponse.text();

          res.statusCode = upstreamResponse.status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(responseBody);
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              error: 'SHOPIFY_DEV_PROXY_FAILED',
              message:
                err?.name === 'AbortError'
                  ? 'Shopify request timed out after 12s.'
                  : 'Failed to proxy request to Shopify Storefront API.',
            })
          );
        } finally {
          clearTimeout(timeoutId);
        }
      });

      server.middlewares.use('/sitemap.xml', async (req, res) => {
        try {
          const sitemapModule = await import('./api/sitemap');
          await sitemapModule.default(req as any, res as any);
        } catch {
          res.statusCode = 500;
          res.end('Error generating sitemap');
        }
      });

      server.middlewares.use('/robots.txt', async (req, res) => {
        try {
          const robotsModule = await import('./api/robots');
          await robotsModule.default(req as any, res as any);
        } catch {
          res.statusCode = 500;
          res.end('Error generating robots.txt');
        }
      });

      server.middlewares.use('/api/auth', async (req, res) => {
        try {
          const authModule = await import('./api/auth');
          await authModule.default(req as any, res as any);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Error in auth endpoint' }));
        }
      });

      server.middlewares.use('/api/customer', async (req, res) => {
        try {
          const custModule = await import('./api/customer');
          await custModule.default(req as any, res as any);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Error in customer endpoint' }));
        }
      });

      const handleWebhook = async (req: any, res: any) => {
        try {
          const webhookModule = await import('./api/webhook');
          await webhookModule.default(req, res);
        } catch (err: any) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Error in webhook endpoint' }));
          }
        }
      };

      server.middlewares.use('/api/webhooks/shopify', handleWebhook);
      server.middlewares.use('/api/webhook', handleWebhook);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), shopifyDevServerPlugin()],
    define: {
      'process.env.SHOPIFY_CUSTOMER_ACCOUNT_URL': JSON.stringify(
        process.env.SHOPIFY_CUSTOMER_ACCOUNT_URL || process.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_URL || ''
      ),
      'process.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_URL': JSON.stringify(
        process.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_URL || process.env.SHOPIFY_CUSTOMER_ACCOUNT_URL || ''
      ),
      'process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS': JSON.stringify(
        process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || process.env.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || 'false'
      ),
      'process.env.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS': JSON.stringify(
        process.env.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || 'false'
      ),
      'process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID': JSON.stringify(
        process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || process.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || ''
      ),
      'process.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID': JSON.stringify(
        process.env.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || ''
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
