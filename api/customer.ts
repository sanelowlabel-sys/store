import type { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import {
  getSession,
  isCustomAccountsEnabled,
  hasTesterAccess,
  SHOPIFY_SHOP_ID,
  HOSTED_ACCOUNT_FALLBACK_URL,
} from './auth.js';

export const CUSTOMER_ACCOUNT_API_VERSION = '2026-10';

export const CUSTOMER_GRAPHQL_QUERIES = {
  GetCustomerDashboard: `
    query GetCustomerDashboard {
      customer {
        id
        firstName
        lastName
        displayName
        emailAddress {
          emailAddress
        }
        phoneNumber {
          phoneNumber
        }
        defaultAddress {
          id
          address1
          address2
          city
          province
          zip
          country
          formatted
        }
        orders(first: 10, sortKey: PROCESSED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
              id
              name
              number
              processedAt
              financialStatus
              fulfillmentStatus
              totalPrice {
                amount
                currencyCode
              }
              subtotal {
                amount
                currencyCode
              }
              totalTax {
                amount
                currencyCode
              }
              totalShipping {
                amount
                currencyCode
              }
              lineItems(first: 50) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    id
                    title
                    quantity
                    variantTitle
                    price {
                      amount
                      currencyCode
                    }
                    image {
                      url
                      altText
                    }
                  }
                }
              }
              fulfillments(first: 10) {
                pageInfo {
                  hasNextPage
                }
                edges {
                  node {
                    id
                    status
                    latestShipmentStatus
                    estimatedDeliveryAt
                    trackingInformation {
                      company
                      number
                      url
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

  GetCustomerOrders: `
    query GetCustomerOrders($first: Int, $after: String, $last: Int, $before: String) {
      customer {
        orders(first: $first, after: $after, last: $last, before: $before, sortKey: PROCESSED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
              id
              name
              number
              processedAt
              financialStatus
              fulfillmentStatus
              totalPrice {
                amount
                currencyCode
              }
              subtotal {
                amount
                currencyCode
              }
              totalTax {
                amount
                currencyCode
              }
              totalShipping {
                amount
                currencyCode
              }
              lineItems(first: 50) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    id
                    title
                    quantity
                    variantTitle
                    price {
                      amount
                      currencyCode
                    }
                    image {
                      url
                      altText
                    }
                  }
                }
              }
              fulfillments(first: 10) {
                pageInfo {
                  hasNextPage
                }
                edges {
                  node {
                    id
                    status
                    latestShipmentStatus
                    estimatedDeliveryAt
                    trackingInformation {
                      company
                      number
                      url
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

  GetCustomerOrder: `
    query GetCustomerOrder($id: ID!) {
      order(id: $id) {
        id
        name
        number
        processedAt
        financialStatus
        fulfillmentStatus
        totalPrice {
          amount
          currencyCode
        }
        subtotal {
          amount
          currencyCode
        }
        totalTax {
          amount
          currencyCode
        }
        totalShipping {
          amount
          currencyCode
        }
        lineItems(first: 50) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
              id
              title
              quantity
              variantTitle
              price {
                amount
                currencyCode
              }
              image {
                url
                altText
              }
            }
          }
        }
        fulfillments(first: 20) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
              id
              status
              latestShipmentStatus
              estimatedDeliveryAt
              trackingInformation {
                company
                number
                url
              }
            }
          }
        }
      }
    }
  `,

  GetCustomerProfile: `
    query GetCustomerProfile {
      customer {
        id
        firstName
        lastName
        displayName
        emailAddress {
          emailAddress
        }
        phoneNumber {
          phoneNumber
        }
        defaultAddress {
          id
          address1
          address2
          city
          province
          zip
          country
          formatted
        }
        addresses(first: 10) {
          pageInfo {
            hasNextPage
          }
          edges {
            node {
              id
              address1
              address2
              city
              province
              zip
              country
              formatted
            }
          }
        }
      }
    }
  `,
};

function sanitizeIdentifier(input?: string | null, maxLength = 128): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  if (!/^[a-zA-Z0-9_:\-/#]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeCursor(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 256) return null;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Allow', 'GET');
    res.end(JSON.stringify({ error: 'Method not allowed. Use GET.' }));
    return;
  }

  // 1. Enforce Server-Side Feature Flag or Authorized Tester Access
  const globalEnabled = isCustomAccountsEnabled();
  const testerAccess = await hasTesterAccess(req);
  if (!globalEnabled && !testerAccess) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'FEATURE_DISABLED',
        message: 'Custom customer accounts are currently disabled.',
        hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
      })
    );
    return;
  }

  // 2. Validate Authenticated Session
  const session = await getSession(req, res);
  if (!session || !session.accessToken) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'UNAUTHENTICATED',
        message: 'No active customer account session. Please sign in.',
        hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
      })
    );
    return;
  }

  const parsedUrl = parseUrl(req.url || '', true);
  const action = (parsedUrl.query.action as string) || (parsedUrl.pathname?.split('/').pop()) || 'dashboard';
  const customerApiEndpoint = `https://shopify.com/${SHOPIFY_SHOP_ID}/account/customer/api/${CUSTOMER_ACCOUNT_API_VERSION}/graphql.json`;

  try {
    // ------------------------------------------------------------------------
    // ACTION: ORDER (Customer-authorized direct or paginated order lookup)
    // ------------------------------------------------------------------------
    if (action === 'order') {
      const rawId = parsedUrl.query.id as string;
      const sanitizedId = sanitizeIdentifier(rawId);

      if (!sanitizedId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'INVALID_ORDER_ID', message: 'A valid order identifier is required.' }));
        return;
      }

      // Case A: The identifier is an actual Shopify GraphQL GID
      if (sanitizedId.startsWith('gid://shopify/Order/')) {
        const queryRes = await fetch(customerApiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: session.accessToken,
          },
          body: JSON.stringify({
            query: CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder,
            variables: { id: sanitizedId },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!queryRes.ok) {
          if (queryRes.status === 401) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'SESSION_EXPIRED',
                message: 'Your customer session has expired. Please sign in again.',
                hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
              })
            );
            return;
          }

          console.error('[Customer Account API Order Request Failed]: HTTP', queryRes.status);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'SHOPIFY_API_ERROR',
              message: 'Unable to communicate with Shopify Customer Account API.',
            })
          );
          return;
        }

        const data = await queryRes.json();

        // Handle GraphQL errors honestly without converting to ORDER_NOT_FOUND
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          const firstError = data.errors[0];
          console.error('[Customer Account GraphQL Order Error]:', firstError?.message);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'GRAPHQL_ERROR',
              message: firstError?.message || 'Customer Account API query execution error',
            })
          );
          return;
        }

        const order = data.data?.order;
        if (!order) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'ORDER_NOT_FOUND',
              message: 'Order not found for authenticated customer.',
              incompleteResults: false,
            })
          );
          return;
        }

        const hasMoreLineItems = Boolean(order.lineItems?.pageInfo?.hasNextPage);
        const hasMoreFulfillments = Boolean(order.fulfillments?.pageInfo?.hasNextPage);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            order: {
              ...order,
              hasMoreLineItems,
              hasMoreFulfillments,
            },
            incompleteResults: false,
          })
        );
        return;
      }

      // Case B: The identifier is a human order name/number (e.g. '#SN-1089' or '1089')
      // Execute a customer-authorized paginated search across customer's orders
      let cursor: string | null = null;
      let page = 0;
      const MAX_PAGES = 5; // Search up to 250 orders
      let matchedOrder: any = null;
      let hasMorePages = false;

      while (page < MAX_PAGES) {
        page++;
        const pageRes = await fetch(customerApiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: session.accessToken,
          },
          body: JSON.stringify({
            query: CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrders,
            variables: cursor ? { first: 50, after: cursor } : { first: 50 },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!pageRes.ok) {
          if (pageRes.status === 401) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'SESSION_EXPIRED',
                message: 'Your customer session has expired. Please sign in again.',
                hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
              })
            );
            return;
          }

          console.error('[Customer Account API Paginated Search Failed]: HTTP', pageRes.status);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'SHOPIFY_API_ERROR',
              message: 'Unable to communicate with Shopify Customer Account API.',
            })
          );
          return;
        }

        const pageJson = await pageRes.json();

        if (pageJson.errors && Array.isArray(pageJson.errors) && pageJson.errors.length > 0) {
          const firstError = pageJson.errors[0];
          console.error('[Customer Account GraphQL Search Error]:', firstError?.message);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'GRAPHQL_ERROR',
              message: firstError?.message || 'Customer Account API query execution error',
            })
          );
          return;
        }

        const ordersConnection = pageJson.data?.customer?.orders;
        const edges = ordersConnection?.edges || [];
        const pageInfo = ordersConnection?.pageInfo || {};

        matchedOrder = edges
          .map((e: any) => e.node)
          .find(
            (o: any) =>
              o.id === sanitizedId ||
              o.name === sanitizedId ||
              o.number === Number(sanitizedId) ||
              String(o.number) === sanitizedId.replace(/\D/g, '')
          );

        if (matchedOrder) {
          const hasMoreLineItems = Boolean(matchedOrder.lineItems?.pageInfo?.hasNextPage);
          const hasMoreFulfillments = Boolean(matchedOrder.fulfillments?.pageInfo?.hasNextPage);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              order: {
                ...matchedOrder,
                hasMoreLineItems,
                hasMoreFulfillments,
              },
              incompleteResults: false,
            })
          );
          return;
        }

        hasMorePages = Boolean(pageInfo.hasNextPage);
        if (!hasMorePages || !pageInfo.endCursor) {
          break;
        }
        cursor = pageInfo.endCursor;
      }

      // Not found after paginated search
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'ORDER_NOT_FOUND',
          message: hasMorePages
            ? 'Order not found within the 250 most recent customer orders.'
            : 'Order not found for authenticated customer.',
          incompleteResults: hasMorePages,
        })
      );
      return;
    }

    // ------------------------------------------------------------------------
    // ACTION: DASHBOARD, ORDERS, or PROFILE
    // ------------------------------------------------------------------------
    let query: string;
    let variables: Record<string, any> = {};

    if (action === 'dashboard') {
      query = CUSTOMER_GRAPHQL_QUERIES.GetCustomerDashboard;
    } else if (action === 'orders') {
      query = CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrders;
      const rawCursor = parsedUrl.query.cursor as string;
      const direction = parsedUrl.query.direction as string;
      const cursor = sanitizeCursor(rawCursor);

      if (direction === 'prev' && cursor) {
        variables = { last: 10, before: cursor };
      } else if (cursor) {
        variables = { first: 10, after: cursor };
      } else {
        variables = { first: 10 };
      }
    } else if (action === 'profile') {
      query = CUSTOMER_GRAPHQL_QUERIES.GetCustomerProfile;
    } else {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Unknown customer action: "${action}"` }));
      return;
    }

    const shopifyRes = await fetch(customerApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    });

    if (!shopifyRes.ok) {
      if (shopifyRes.status === 401) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'SESSION_EXPIRED',
            message: 'Your customer session has expired. Please sign in again.',
            hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
          })
        );
        return;
      }

      console.error('[Customer Account API Request Failed]: HTTP', shopifyRes.status);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'SHOPIFY_API_ERROR',
          message: 'Unable to communicate with Shopify Customer Account API.',
        })
      );
      return;
    }

    const data = await shopifyRes.json();

    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      const firstError = data.errors[0];
      console.error('[Customer Account GraphQL Error]:', firstError?.message);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'GRAPHQL_ERROR',
          message: firstError?.message || 'Customer Account API query execution error',
        })
      );
      return;
    }

    // Attach consistent pagination indicators
    const ordersConnection = data.data?.customer?.orders;
    const hasMoreOrders = Boolean(ordersConnection?.pageInfo?.hasNextPage);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ...data,
        hasMoreOrders,
      })
    );
  } catch (err: any) {
    console.error('[Customer Handler Error]: Request processing error');
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Internal server error processing customer request.' }));
    }
  }
}
