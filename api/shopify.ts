import type { IncomingMessage, ServerResponse } from 'http';
import { isIP } from 'net';

// Pinned Stable Shopify Storefront API Version (Quarterly stable release)
export const SHOPIFY_API_VERSION = '2026-10';

// Exact required store domain
export const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';

// Maximum allowed payload size in bytes (64 KB)
export const MAX_BODY_SIZE_BYTES = 64 * 1024;

export const CART_FRAGMENT = `
  id
  checkoutUrl
  totalQuantity
  cost {
    totalAmount {
      amount
      currencyCode
    }
    subtotalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
    totalDutyAmount {
      amount
      currencyCode
    }
  }
  discountCodes {
    code
    applicable
  }
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        cost {
          totalAmount {
            amount
            currencyCode
          }
          subtotalAmount {
            amount
            currencyCode
          }
          amountPerQuantity {
            amount
            currencyCode
          }
          compareAtAmountPerQuantity {
            amount
            currencyCode
          }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            sku
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            product {
              id
              title
              handle
            }
          }
        }
        discountAllocations {
          discountedAmount {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

export const SERVER_GRAPHQL_OPERATIONS: Record<string, string> = {
  GetProducts: `
    query GetProducts($first: Int!) @inContext(country: ZA) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
            descriptionHtml
            availableForSale
            productType
            tags
            vendor
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            compareAtPriceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            options {
              id
              name
              values
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  sku
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                  image {
                    url
                    altText
                  }
                }
              }
            }
            collections(first: 5) {
              edges {
                node {
                  id
                  title
                  handle
                }
              }
            }
          }
        }
      }
    }
  `,

  GetProductByHandle: `
    query GetProductByHandle($handle: String!) @inContext(country: ZA) {
      product(handle: $handle) {
        id
        title
        handle
        description
        descriptionHtml
        availableForSale
        productType
        tags
        vendor
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 10) {
          edges {
            node {
              url
              altText
              width
              height
            }
          }
        }
        options {
          id
          name
          values
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              availableForSale
              sku
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
              selectedOptions {
                name
                value
              }
              image {
                url
                altText
              }
            }
          }
        }
        collections(first: 5) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
        seo {
          title
          description
        }
      }
    }
  `,

  GetCollections: `
    query GetCollections($first: Int!) @inContext(country: ZA) {
      collections(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
            descriptionHtml
            image {
              url
              altText
            }
            products(first: 50) {
              edges {
                node {
                  id
                  title
                  handle
                  availableForSale
                  priceRange {
                    minVariantPrice {
                      amount
                      currencyCode
                    }
                  }
                  images(first: 2) {
                    edges {
                      node {
                        url
                        altText
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  GetCollectionByHandle: `
    query GetCollectionByHandle($handle: String!) @inContext(country: ZA) {
      collection(handle: $handle) {
        id
        title
        handle
        description
        descriptionHtml
        image {
          url
          altText
        }
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              description
              availableForSale
              productType
              tags
              vendor
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
                maxVariantPrice {
                  amount
                  currencyCode
                }
              }
              compareAtPriceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 10) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              options {
                id
                name
                values
              }
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    availableForSale
                    sku
                    price {
                      amount
                      currencyCode
                    }
                    compareAtPrice {
                      amount
                      currencyCode
                    }
                    selectedOptions {
                      name
                      value
                    }
                    image {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  GetCart: `
    query GetCart($cartId: ID!) @inContext(country: ZA) {
      cart(id: $cartId) {
        ${CART_FRAGMENT}
      }
    }
  `,

  CartCreate: `
    mutation CartCreate($input: CartInput!) @inContext(country: ZA) {
      cartCreate(input: $input) {
        cart {
          ${CART_FRAGMENT}
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  CartLinesAdd: `
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) @inContext(country: ZA) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          ${CART_FRAGMENT}
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  CartLinesUpdate: `
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) @inContext(country: ZA) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          ${CART_FRAGMENT}
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  CartLinesRemove: `
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) @inContext(country: ZA) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          ${CART_FRAGMENT}
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  CartDiscountCodesUpdate: `
    mutation CartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) @inContext(country: ZA) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart {
          ${CART_FRAGMENT}
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
};

export interface ValidationResult {
  valid: boolean;
  sanitizedVariables?: Record<string, unknown>;
  error?: string;
}

// Strict variable validators for each allowed operation
export function validateOperationVariables(
  operation: string,
  rawVariables: unknown
): ValidationResult {
  if (rawVariables !== undefined && (typeof rawVariables !== 'object' || rawVariables === null || Array.isArray(rawVariables))) {
    return { valid: false, error: 'Variables must be a valid JSON object.' };
  }

  const vars = (rawVariables || {}) as Record<string, any>;

  switch (operation) {
    case 'GetProducts': {
      const first = vars.first === undefined ? 50 : vars.first;
      if (typeof first !== 'number' || !Number.isInteger(first) || first < 1 || first > 100) {
        return { valid: false, error: 'GetProducts "first" must be an integer between 1 and 100.' };
      }
      return { valid: true, sanitizedVariables: { first } };
    }

    case 'GetProductByHandle': {
      if (typeof vars.handle !== 'string' || !vars.handle.trim() || vars.handle.length > 255) {
        return { valid: false, error: 'GetProductByHandle requires a valid non-empty "handle" string.' };
      }
      const trimmed = vars.handle.trim();
      if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
        return { valid: false, error: 'GetProductByHandle "handle" contains invalid characters.' };
      }
      return { valid: true, sanitizedVariables: { handle: trimmed } };
    }

    case 'GetCollections': {
      const first = vars.first === undefined ? 50 : vars.first;
      if (typeof first !== 'number' || !Number.isInteger(first) || first < 1 || first > 100) {
        return { valid: false, error: 'GetCollections "first" must be an integer between 1 and 100.' };
      }
      return { valid: true, sanitizedVariables: { first } };
    }

    case 'GetCollectionByHandle': {
      if (typeof vars.handle !== 'string' || !vars.handle.trim() || vars.handle.length > 255) {
        return { valid: false, error: 'GetCollectionByHandle requires a valid non-empty "handle" string.' };
      }
      const trimmed = vars.handle.trim();
      if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
        return { valid: false, error: 'GetCollectionByHandle "handle" contains invalid characters.' };
      }
      return { valid: true, sanitizedVariables: { handle: trimmed } };
    }

    case 'GetCart': {
      if (typeof vars.cartId !== 'string' || !vars.cartId.trim() || vars.cartId.length > 255) {
        return { valid: false, error: 'GetCart requires a valid non-empty "cartId" string.' };
      }
      return { valid: true, sanitizedVariables: { cartId: vars.cartId.trim() } };
    }

    case 'CartCreate': {
      if (typeof vars.input !== 'object' || vars.input === null || Array.isArray(vars.input)) {
        return { valid: false, error: 'CartCreate requires an "input" object.' };
      }
      const input = vars.input;
      const sanitizedInput: Record<string, any> = {};

      // Buyer identity country code
      if (input.buyerIdentity) {
        if (typeof input.buyerIdentity !== 'object' || input.buyerIdentity === null) {
          return { valid: false, error: 'CartCreate buyerIdentity must be an object.' };
        }
        const countryCode = String(input.buyerIdentity.countryCode || '').trim().toUpperCase();
        if (countryCode !== 'ZA') {
          return { valid: false, error: 'CartCreate buyerIdentity countryCode must be "ZA".' };
        }
        sanitizedInput.buyerIdentity = { countryCode: 'ZA' };
      } else {
        sanitizedInput.buyerIdentity = { countryCode: 'ZA' };
      }

      // Optional initial lines
      if (input.lines !== undefined) {
        if (!Array.isArray(input.lines) || input.lines.length > 50) {
          return { valid: false, error: 'CartCreate lines must be an array of at most 50 items.' };
        }
        sanitizedInput.lines = [];
        for (const line of input.lines) {
          if (typeof line !== 'object' || line === null) {
            return { valid: false, error: 'CartCreate line items must be objects.' };
          }
          if (typeof line.merchandiseId !== 'string' || !line.merchandiseId.trim()) {
            return { valid: false, error: 'CartCreate merchandiseId must be a non-empty string.' };
          }
          const quantity = line.quantity;
          if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
            return { valid: false, error: 'CartCreate line quantity must be an integer between 1 and 100.' };
          }
          sanitizedInput.lines.push({
            merchandiseId: line.merchandiseId.trim(),
            quantity,
          });
        }
      }

      return { valid: true, sanitizedVariables: { input: sanitizedInput } };
    }

    case 'CartLinesAdd': {
      if (typeof vars.cartId !== 'string' || !vars.cartId.trim()) {
        return { valid: false, error: 'CartLinesAdd requires a non-empty "cartId" string.' };
      }
      if (!Array.isArray(vars.lines) || vars.lines.length === 0 || vars.lines.length > 50) {
        return { valid: false, error: 'CartLinesAdd "lines" must be a non-empty array with at most 50 items.' };
      }
      const sanitizedLines = [];
      for (const line of vars.lines) {
        if (typeof line !== 'object' || line === null) {
          return { valid: false, error: 'CartLinesAdd line items must be objects.' };
        }
        if (typeof line.merchandiseId !== 'string' || !line.merchandiseId.trim()) {
          return { valid: false, error: 'CartLinesAdd line merchandiseId must be a non-empty string.' };
        }
        const quantity = line.quantity;
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          return { valid: false, error: 'CartLinesAdd line quantity must be an integer between 1 and 100.' };
        }
        sanitizedLines.push({
          merchandiseId: line.merchandiseId.trim(),
          quantity,
        });
      }
      return {
        valid: true,
        sanitizedVariables: { cartId: vars.cartId.trim(), lines: sanitizedLines },
      };
    }

    case 'CartLinesUpdate': {
      if (typeof vars.cartId !== 'string' || !vars.cartId.trim()) {
        return { valid: false, error: 'CartLinesUpdate requires a non-empty "cartId" string.' };
      }
      if (!Array.isArray(vars.lines) || vars.lines.length === 0 || vars.lines.length > 50) {
        return { valid: false, error: 'CartLinesUpdate "lines" must be a non-empty array with at most 50 items.' };
      }
      const sanitizedLines = [];
      for (const line of vars.lines) {
        if (typeof line !== 'object' || line === null) {
          return { valid: false, error: 'CartLinesUpdate line items must be objects.' };
        }
        if (typeof line.id !== 'string' || !line.id.trim()) {
          return { valid: false, error: 'CartLinesUpdate line id must be a non-empty string.' };
        }
        const quantity = line.quantity;
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
          return { valid: false, error: 'CartLinesUpdate line quantity must be an integer between 0 and 100.' };
        }
        sanitizedLines.push({
          id: line.id.trim(),
          quantity,
        });
      }
      return {
        valid: true,
        sanitizedVariables: { cartId: vars.cartId.trim(), lines: sanitizedLines },
      };
    }

    case 'CartLinesRemove': {
      if (typeof vars.cartId !== 'string' || !vars.cartId.trim()) {
        return { valid: false, error: 'CartLinesRemove requires a non-empty "cartId" string.' };
      }
      if (!Array.isArray(vars.lineIds) || vars.lineIds.length === 0 || vars.lineIds.length > 50) {
        return { valid: false, error: 'CartLinesRemove "lineIds" must be a non-empty array with at most 50 IDs.' };
      }
      const sanitizedLineIds: string[] = [];
      for (const id of vars.lineIds) {
        if (typeof id !== 'string' || !id.trim()) {
          return { valid: false, error: 'CartLinesRemove lineId must be a non-empty string.' };
        }
        sanitizedLineIds.push(id.trim());
      }
      return {
        valid: true,
        sanitizedVariables: { cartId: vars.cartId.trim(), lineIds: sanitizedLineIds },
      };
    }

    case 'CartDiscountCodesUpdate': {
      if (typeof vars.cartId !== 'string' || !vars.cartId.trim()) {
        return { valid: false, error: 'CartDiscountCodesUpdate requires a non-empty "cartId" string.' };
      }
      const codes = vars.discountCodes;
      if (codes !== undefined) {
        if (!Array.isArray(codes) || codes.length > 10) {
          return { valid: false, error: 'CartDiscountCodesUpdate discountCodes must be an array of at most 10 strings.' };
        }
        for (const code of codes) {
          if (typeof code !== 'string' || code.length > 50) {
            return { valid: false, error: 'Each discount code must be a string with maximum length of 50.' };
          }
        }
      }
      return {
        valid: true,
        sanitizedVariables: {
          cartId: vars.cartId.trim(),
          discountCodes: codes || [],
        },
      };
    }

    default:
      return { valid: false, error: `Unrecognized storefront operation: "${operation}".` };
  }
}

/**
 * Self-contained Serverless handler for Shopify Storefront API proxying.
 * Designed to have zero relative file dependencies so that Vercel serverless packaging
 * and Node ESM module resolution can never trigger FUNCTION_INVOCATION_FAILED.
 */
export default async function handler(
  req: IncomingMessage & { body?: any },
  res: ServerResponse
) {
  try {
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
      // Handle req.body if it was delivered as a string
      if (typeof req.body === 'string') {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON string in request body.' }));
          return;
        }
      }

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
    } catch (fetchError: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          error: 'SHOPIFY_FETCH_FAILED',
          message:
            fetchError?.name === 'AbortError'
              ? 'Shopify request timed out after 12s.'
              : 'Unable to communicate with Shopify Storefront API.',
        })
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (fatalError: any) {
    // Catch-all to prevent unhandled runtime exception crashing the serverless container
    console.error('[Shopify Proxy Fatal Handler Error]:', fatalError);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: fatalError?.message || 'An unexpected server error occurred in the Shopify proxy.',
        })
      );
    }
  }
}
