import type { IncomingMessage, ServerResponse } from 'http';
import { isIP } from 'net';
import {
  SHOPIFY_API_VERSION,
  SERVER_GRAPHQL_OPERATIONS,
  validateOperationVariables,
} from './_operations';

// Exact required store domain
const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';

// Maximum allowed payload size in bytes (64 KB)
const MAX_BODY_SIZE_BYTES = 64 * 1024;

export default async function handler(
  req: IncomingMessage & { body?: any },
  res: ServerResponse
) {
  // Ensure no shared or downstream caching for cart and dynamic queries
  res.setHeader('Cache-Control', 'no-store');

  // Handle preflight if called
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // 1. Enforce POST only
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
    return;
  }

  // 2. Validate Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    res.statusCode = 415;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unsupported Media Type. Content-Type must be application/json.' }));
    return;
  }

  // 3. Enforce 64 KB limit and reject arrays, null and malformed request bodies
  let bodyData: any;

  if (req.body !== undefined) {
    // Handle already-parsed req.body
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Malformed request body: expected a JSON object.' }));
      return;
    }

    try {
      const serialized = JSON.stringify(req.body);
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

    bodyData = req.body;
  } else {
    // Handle streamed request body
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

  // 4. Reject client-supplied GraphQL queries strictly
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

  // 5. Select server-owned operation from fixed map
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

  // 6. Validate operation variables
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

  // 7. Restrict destination: require SHOPIFY_STORE_DOMAIN to equal sx71id-uy.myshopify.com exactly.
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

  // 8. Token validation without prefix guessing
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
          'Shopify Storefront Access Token is not configured on the server. Set SHOPIFY_STOREFRONT_ACCESS_TOKEN (public token) or SHOPIFY_STOREFRONT_PRIVATE_TOKEN (private token) in Vercel Environment Variables.',
        storeDomain: REQUIRED_STORE_DOMAIN,
        configured: false,
      })
    );
    return;
  }

  // 9. Construct upstream Shopify headers
  const shopifyHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (usePrivateToken) {
    shopifyHeaders['Shopify-Storefront-Private-Token'] = activeToken;

    // Buyer IP handling: ONLY from x-vercel-forwarded-for (documented as overwritten by Vercel edge)
    // Never trust client-controlled x-real-ip or generic x-forwarded-for
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

  // 10. Execute upstream request with server-owned query document
  const endpoint = `https://${REQUIRED_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second total timeout

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

    // Keep timeout active while reading response body
    const responseBody = await upstreamResponse.text();

    res.statusCode = upstreamResponse.status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(responseBody);
  } catch (error: any) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        error: 'SHOPIFY_FETCH_FAILED',
        message:
          error?.name === 'AbortError'
            ? 'Shopify request timed out after 12s.'
            : 'Unable to communicate with Shopify Storefront API.',
      })
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
