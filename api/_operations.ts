// Server-owned GraphQL documents for Shopify Storefront API
// Pinned Stable Version: 2026-10 (Current supported stable release)
export const SHOPIFY_API_VERSION = '2026-10';

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
    query GetProducts($first: Int!, $after: String) @inContext(country: ZA) {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
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
            variants(first: 100) {
              pageInfo {
                hasNextPage
                endCursor
              }
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
            collections(first: 10) {
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
    query GetProductByHandle($handle: String!, $variantsCursor: String) @inContext(country: ZA) {
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
        variants(first: 250, after: $variantsCursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
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
        collections(first: 10) {
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
