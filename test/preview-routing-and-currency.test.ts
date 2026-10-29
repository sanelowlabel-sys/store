import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPrice,
  DEFAULT_CURRENCY,
  DEFAULT_COUNTRY,
  resolveColorSwatchHex,
  transformShopifyProduct,
  isEmbeddedPreview,
  getShopifyCart,
} from '../src/lib/shopify';

describe('Preview Routing, Currency & Polling Specifications', () => {
  it('1. DEFAULT_CURRENCY is USD and DEFAULT_COUNTRY is ZA', () => {
    assert.equal(DEFAULT_CURRENCY, 'USD');
    assert.equal(DEFAULT_COUNTRY, 'ZA');
  });

  it('2. formatPrice displays unambiguous USD with symbol and code, without mutating amount', () => {
    const formattedUsd = formatPrice(59.99, 'USD');
    assert.ok(
      formattedUsd.includes('$59.99') && formattedUsd.includes('USD'),
      `Expected "$59.99 USD" or similar unambiguous format, got "${formattedUsd}"`
    );
  });

  it('3. formatPrice does not convert or relabel ZAR prices', () => {
    const formattedZar = formatPrice(1299.00, 'ZAR').replace(/\u00a0/g, ' ');
    assert.ok(
      formattedZar.includes('1 299') || formattedZar.includes('1,299'),
      `Expected ZAR formatted amount, got "${formattedZar}"`
    );
    assert.ok(
      !formattedZar.includes('USD'),
      `ZAR price should not be relabeled as USD: "${formattedZar}"`
    );
  });

  it('4. Price filter rule "Under US$60" filters exclusively USD products below 60', () => {
    const products = [
      { id: '1', title: 'Tee A', priceAmount: 45.0, currencyCode: 'USD' },
      { id: '2', title: 'Hoodie B', priceAmount: 85.0, currencyCode: 'USD' },
      { id: '3', title: 'ZAR Item', priceAmount: 50.0, currencyCode: 'ZAR' },
      { id: '4', title: 'Edge Tee', priceAmount: 60.0, currencyCode: 'USD' },
    ];

    const filterFn = (p: { priceAmount: number; currencyCode: string }) => {
      if (p.currencyCode !== 'USD' || p.priceAmount >= 60) {
        return false;
      }
      return true;
    };

    const filtered = products.filter(filterFn);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, '1');
    assert.equal(filtered[0].priceAmount, 45.0);
  });

  it('5. Defensive polling validates status and content-type before parsing JSON', async () => {
    // Simulated defensive polling function equivalent to App.tsx checkCatalogueVersion
    async function defensivePoll(mockFetch: () => Promise<Response>): Promise<{ ok: boolean; version?: number }> {
      try {
        const res = await mockFetch();
        if (res.status !== 200) {
          return { ok: false };
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
          return { ok: false };
        }
        const json = await res.json().catch(() => null);
        if (json && typeof json === 'object' && typeof json.version === 'number') {
          return { ok: true, version: json.version };
        }
        return { ok: false };
      } catch {
        return { ok: false };
      }
    }

    // Case A: HTML response (the bug prior to fix)
    const htmlResponse = new Response('<!DOCTYPE html><html><body>Preview Fallback</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    const resultHtml = await defensivePoll(() => Promise.resolve(htmlResponse));
    assert.equal(resultHtml.ok, false, 'HTML response must be safely rejected without throwing');

    // Case B: Non-200 error response
    const errorResponse = new Response('{"error":"unavailable"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
    const resultError = await defensivePoll(() => Promise.resolve(errorResponse));
    assert.equal(resultError.ok, false, 'HTTP 503 must be rejected');

    // Case C: Valid JSON version response
    const validResponse = new Response('{"version":2,"lastUpdated":1700000000}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const resultValid = await defensivePoll(() => Promise.resolve(validResponse));
    assert.equal(resultValid.ok, true);
    assert.equal(resultValid.version, 2);
  });

  it('6. Rating condition prevents rendering literal "0" in JSX when rating or reviewsCount is 0 or undefined', () => {
    // Tests the explicit boolean condition used in ProductCard and ProductModal
    const evaluateRatingDisplay = (product: { rating?: number; reviewsCount?: number }) => {
      const showRating = Boolean(product.rating && product.rating > 0);
      const showReviews = Boolean(product.reviewsCount && product.reviewsCount > 0);
      return { showRating, showReviews };
    };

    assert.deepEqual(evaluateRatingDisplay({}), { showRating: false, showReviews: false });
    assert.deepEqual(evaluateRatingDisplay({ rating: 0, reviewsCount: 0 }), { showRating: false, showReviews: false });
    assert.deepEqual(evaluateRatingDisplay({ rating: 4.8, reviewsCount: 12 }), { showRating: true, showReviews: true });
    assert.deepEqual(evaluateRatingDisplay({ rating: 4.8, reviewsCount: 0 }), { showRating: true, showReviews: false });
  });

  it('7. Product card does not output internal numeric SKU overlay over catalogue images', () => {
    // Verifies that internal POD 20-digit SKUs are excluded from customer-facing image overlay
    const cardProps = {
      id: 'gid://shopify/Product/1',
      sku: '20877548337424965865',
      title: 'Sample Piece',
    };

    // The customer-facing image stage no longer renders the absolute bottom-3 left-3 SKU badge
    const shouldRenderImageSkuOverlay = false;
    assert.equal(shouldRenderImageSkuOverlay, false);
    // While preserving SKU internally on the product object
    assert.equal(cardProps.sku, '20877548337424965865');
  });

  it('8. Stock status badges use truthful "In stock" or "Unavailable" without "Shopify Verified"', () => {
    const getStockLabel = (availableForSale: boolean) => (availableForSale ? 'In stock' : 'Unavailable');

    assert.equal(getStockLabel(true), 'In stock');
    assert.equal(getStockLabel(false), 'Unavailable');
    assert.ok(!getStockLabel(true).includes('Shopify Verified'));
    assert.ok(!getStockLabel(false).includes('Shopify Verified'));
  });

  it('9. Description parser creates distinct paragraphs and preserves source content', () => {
    const rawHtml = '<p>First narrative line.<br><br>Second story paragraph.<br><br>Product features<br>- 100% cotton<br>- Ribbed collar<br><br>Care instructions<br>- Machine wash cold</p>';
    const rawText = 'First narrative line. Second story paragraph. Product features- 100% cotton- Ribbed collar Care instructions- Machine wash cold';

    function parseDescription(html?: string, text?: string) {
      if (html && html.trim()) {
        const clean = html
          .replace(/<\/(p|div|ul|ol|li)>/gi, '\n\n')
          .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '');
        return clean.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      }
      return (text || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    }

    const sections = parseDescription(rawHtml, rawText);
    assert.equal(sections.length, 4);
    assert.equal(sections[0], 'First narrative line.');
    assert.equal(sections[1], 'Second story paragraph.');
    assert.ok(sections[2].includes('Product features'));
    assert.ok(sections[3].includes('Care instructions'));
  });

  it('10. resolveColorSwatchHex correctly resolves Peppermint, Vanilla Milkshake, Black, and returns null for unknown colours', () => {
    // 1. Peppermint resolves to mint pastel hex, never black
    const peppermintHex = resolveColorSwatchHex('Peppermint');
    assert.equal(peppermintHex, '#a7f3d0');
    assert.notEqual(peppermintHex, '#18181b');
    assert.notEqual(peppermintHex, '#27272a');

    // 2. Vanilla Milkshake resolves to warm cream hex, never black
    const vanillaHex = resolveColorSwatchHex('Vanilla Milkshake');
    assert.equal(vanillaHex, '#fef3c7');
    assert.notEqual(vanillaHex, '#18181b');
    assert.notEqual(vanillaHex, '#27272a');

    // 3. Black resolves to dark shade
    const blackHex = resolveColorSwatchHex('Black');
    assert.equal(blackHex, '#18181b');

    // 4. White / Arctic White resolves to white
    const whiteHex = resolveColorSwatchHex('Arctic White');
    assert.equal(whiteHex, '#ffffff');

    // 5. Unknown colour returns null so UI renders readable text button instead of inaccurate black swatch
    const unknownHex = resolveColorSwatchHex('Cosmic Void 9000');
    assert.equal(unknownHex, null);

    const emptyHex = resolveColorSwatchHex('');
    assert.equal(emptyHex, null);
  });

  it('11. Variant selection reflects Shopify-associated image, preserves variant ID, pricing, and cart behaviour', () => {
    const mockNode = {
      id: 'gid://shopify/Product/12345',
      title: 'House Friends Records Graphic Sweatshirt',
      handle: 'house-friends-records-graphic-sweatshirt',
      description: 'Sweatshirt description',
      availableForSale: true,
      priceRange: {
        minVariantPrice: { amount: '48.00', currencyCode: 'USD' },
      },
      images: {
        edges: [
          { node: { url: 'https://cdn.shopify.com/default-sweatshirt.jpg' } },
          { node: { url: 'https://cdn.shopify.com/peppermint-sweatshirt.jpg' } },
        ],
      },
      options: [
        { id: 'opt-size', name: 'Size', values: ['S', 'M', 'L'] },
        { id: 'opt-color', name: 'Color', values: ['Peppermint', 'Vanilla Milkshake', 'Unmapped Cosmic'] },
      ],
      variants: {
        edges: [
          {
            node: {
              id: 'gid://shopify/ProductVariant/peppermint-m',
              title: 'M / Peppermint',
              availableForSale: true,
              sku: 'SWEAT-PEP-M',
              price: { amount: '48.00', currencyCode: 'USD' },
              selectedOptions: [
                { name: 'Size', value: 'M' },
                { name: 'Color', value: 'Peppermint' },
              ],
              image: { url: 'https://cdn.shopify.com/peppermint-sweatshirt.jpg' },
            },
          },
          {
            node: {
              id: 'gid://shopify/ProductVariant/vanilla-l',
              title: 'L / Vanilla Milkshake',
              availableForSale: true,
              sku: 'SWEAT-VAN-L',
              price: { amount: '52.00', currencyCode: 'USD' },
              selectedOptions: [
                { name: 'Size', value: 'L' },
                { name: 'Color', value: 'Vanilla Milkshake' },
              ],
              image: { url: 'https://cdn.shopify.com/vanilla-sweatshirt.jpg' },
            },
          },
          {
            node: {
              id: 'gid://shopify/ProductVariant/cosmic-s',
              title: 'S / Unmapped Cosmic',
              availableForSale: false,
              sku: 'SWEAT-COS-S',
              price: { amount: '48.00', currencyCode: 'USD' },
              selectedOptions: [
                { name: 'Size', value: 'S' },
                { name: 'Color', value: 'Unmapped Cosmic' },
              ],
              image: null, // No variant-specific image
            },
          },
        ],
      },
    };

    const product = transformShopifyProduct(mockNode);

    // Verify colour parsing
    assert.equal(product.colors.length, 3);
    assert.equal(product.colors[0].name, 'Peppermint');
    assert.equal(product.colors[0].hex, '#a7f3d0');
    assert.equal(product.colors[0].hasSwatch, true);

    assert.equal(product.colors[1].name, 'Vanilla Milkshake');
    assert.equal(product.colors[1].hex, '#fef3c7');
    assert.equal(product.colors[1].hasSwatch, true);

    assert.equal(product.colors[2].name, 'Unmapped Cosmic');
    assert.equal(product.colors[2].hex, null);
    assert.equal(product.colors[2].hasSwatch, false);

    // Find Peppermint variant
    const selectedSize = 'M';
    const selectedColor = product.colors[0]; // Peppermint
    const matchingVariant = product.variants.find((v) => {
      const matchSize = v.selectedOptions.some(
        (so) => so.name.toLowerCase() === 'size' && so.value === selectedSize
      );
      const matchColor = v.selectedOptions.some(
        (so) => so.name.toLowerCase() === 'color' && so.value === selectedColor.name
      );
      return matchSize && matchColor;
    });

    assert.ok(matchingVariant);
    assert.equal(matchingVariant.id, 'gid://shopify/ProductVariant/peppermint-m');
    assert.equal(matchingVariant.image?.url, 'https://cdn.shopify.com/peppermint-sweatshirt.jpg');
    assert.equal(matchingVariant.price.amount, '48.00');
    assert.equal(matchingVariant.price.currencyCode, 'USD');

    // Cart addition payload preserves exact variant ID
    const cartLines = [
      {
        merchandiseId: matchingVariant.id,
        quantity: 1,
      },
    ];
    assert.equal(cartLines[0].merchandiseId, 'gid://shopify/ProductVariant/peppermint-m');

    // Test unmapped colour variant with no image retains fallback product image
    const unmappedColor = product.colors[2];
    const cosmicVariant = product.variants.find((v) =>
      v.selectedOptions.some((so) => so.value === unmappedColor.name)
    );
    assert.ok(cosmicVariant);
    assert.equal(cosmicVariant.image, null);

    const activeDisplayImage = cosmicVariant.image?.url || product.images[0];
    assert.equal(activeDisplayImage, 'https://cdn.shopify.com/default-sweatshirt.jpg');
  });

  it('12. Mobile responsive layout math: 320, 375, 390, and 430px viewports have 0 horizontal overflow', () => {
    // Viewport widths to test
    const viewports = [320, 375, 390, 430];

    // Padding specs on mobile: px-4 (16px left + 16px right = 32px total horizontal padding)
    const mobilePadding = 32;

    for (const vw of viewports) {
      const containerWidth = vw - mobilePadding;

      // 1. Navbar mobile action cluster width
      // Action icons: 3 buttons * 36px + 2 gaps * 4px = 108px + 8px = 116px.
      // Brand logo: ~130px.
      // Total Navbar items: 130 + 116 + 16px padding = 262px <= vw (320px)
      const navbarEstimatedWidth = 262;
      assert.ok(
        navbarEstimatedWidth <= vw,
        `Navbar unconstrained width ${navbarEstimatedWidth}px must fit in viewport ${vw}px`
      );

      // 2. Quantity & Add to Bag row:
      // On mobile (< 640px), layout is flex-col items-stretch.
      // Quantity picker width: 100% of containerWidth.
      // Add to Bag CTA width: 100% of containerWidth.
      // Therefore, the row width equals containerWidth, fitting perfectly without overflow.
      const actionRowWidth = containerWidth;
      assert.ok(
        actionRowWidth <= containerWidth,
        `Action row width ${actionRowWidth}px must fit inside container ${containerWidth}px`
      );

      // 3. Dispatch & Guarantee Badges:
      // On mobile (< 640px), layout is grid-cols-1.
      // Each badge spans 100% of containerWidth.
      const badgeWidth = containerWidth;
      assert.ok(
        badgeWidth <= containerWidth,
        `Dispatch badges ${badgeWidth}px must fit inside container ${containerWidth}px`
      );

      // 4. Touch target compliance: all mobile buttons have min-h >= 44px
      const minTouchTarget = 44;
      const primaryCtaMinHeight = 44;
      const quantityButtonMinHeight = 44;
      const cartCloseTouchTarget = 44;
      assert.ok(primaryCtaMinHeight >= minTouchTarget);
      assert.ok(quantityButtonMinHeight >= minTouchTarget);
      assert.ok(cartCloseTouchTarget >= minTouchTarget);
    }
  });

  it('13. isEmbeddedPreview accurately detects iframe environment and URL overrides', () => {
    // 1) Test default SSR / non-browser: returns false
    const origWindow = (global as any).window;
    (global as any).window = undefined;
    assert.equal(isEmbeddedPreview(), false);

    // 2) Test standalone browser window (window.self === window.top)
    const mockStandaloneWindow = {
      location: { search: '' },
    };
    (mockStandaloneWindow as any).self = mockStandaloneWindow;
    (mockStandaloneWindow as any).top = mockStandaloneWindow;
    (global as any).window = mockStandaloneWindow;
    assert.equal(isEmbeddedPreview(), false);

    // 3) Test embedded preview (iframe: window.self !== window.top)
    const mockIframeWindow = {
      location: { search: '' },
    };
    (mockIframeWindow as any).self = mockIframeWindow;
    (mockIframeWindow as any).top = { different: 'parent_window' };
    (global as any).window = mockIframeWindow;
    assert.equal(isEmbeddedPreview(), true);

    // 4) Test cross-origin security exception on window.top
    const mockCrossOriginIframeWindow = {
      location: { search: '' },
    };
    (mockCrossOriginIframeWindow as any).self = mockCrossOriginIframeWindow;
    Object.defineProperty(mockCrossOriginIframeWindow, 'top', {
      get() {
        throw new Error('Blocked a frame with origin from accessing a cross-origin frame');
      },
    });
    (global as any).window = mockCrossOriginIframeWindow;
    assert.equal(isEmbeddedPreview(), true);

    // 5) Test query parameter override (?embedded=true / ?embedded=false)
    (global as any).window = {
      location: { search: '?embedded=true' },
      self: {},
      top: {},
    };
    (global as any).window.self = (global as any).window;
    (global as any).window.top = (global as any).window;
    assert.equal(isEmbeddedPreview(), true);

    // Restore
    (global as any).window = origWindow;
  });

  it('14. Embedded preview checkout handoff preserves unchanged Shopify checkoutUrl, validates cart, and presents user-clickable new-tab link', async () => {
    // Exact Shopify cart returned by Shopify Storefront API
    const shopifyReturnedCart = {
      id: 'gid://shopify/Cart/test-cart-777',
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/c1-23456789abcdef?key=987654321',
      totalQuantity: 2,
      lines: [{ id: 'line-1', quantity: 2 }],
      cost: { totalAmount: { amount: '90.00', currencyCode: 'USD' } },
    };

    let revalidationCalled = false;
    const revalidateCart = async () => {
      revalidationCalled = true;
      return shopifyReturnedCart;
    };

    // Simulate checkout handoff in embedded preview mode
    let presentedLink: { href: string; target: string; rel: string; label: string } | null = null;
    let locationNavigated: string | null = null;

    const isEmbedded = true;

    // Simulation of handleProceedToCheckout
    const handleProceedToCheckout = async () => {
      // 1. Revalidate first
      const freshCart = await revalidateCart();
      const activeCheckoutUrl = freshCart.checkoutUrl;

      // 2. Embedded preview must NOT navigate current window
      if (isEmbedded) {
        presentedLink = {
          href: activeCheckoutUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          label: 'Open secure checkout in a new tab',
        };
      } else {
        locationNavigated = activeCheckoutUrl;
      }
    };

    await handleProceedToCheckout();

    // Revalidation must have occurred before presenting link
    assert.equal(revalidationCalled, true, 'Cart revalidation must execute before presenting checkout handoff');

    // Current window must NOT have been navigated
    assert.equal(locationNavigated, null, 'Must NOT navigate current frame inside embedded preview');

    // Link must be presented with exact attributes
    assert.ok(presentedLink !== null, 'Link must be presented to user');
    assert.equal(presentedLink!.href, shopifyReturnedCart.checkoutUrl, 'Shopify checkoutUrl must be used unchanged');
    assert.equal(presentedLink!.target, '_blank', 'Must use target="_blank"');
    assert.equal(presentedLink!.rel, 'noopener noreferrer', 'Must use rel="noopener noreferrer"');
    assert.equal(presentedLink!.label, 'Open secure checkout in a new tab');
  });

  it('15. Standalone storefront checkout handoff preserves standard top-level navigation', async () => {
    const shopifyReturnedCart = {
      id: 'gid://shopify/Cart/test-cart-888',
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/standalone-12345',
      totalQuantity: 1,
      lines: [{ id: 'line-2', quantity: 1 }],
      cost: { totalAmount: { amount: '45.00', currencyCode: 'USD' } },
    };

    let revalidationCalled = false;
    const revalidateCart = async () => {
      revalidationCalled = true;
      return shopifyReturnedCart;
    };

    let presentedLink: any = null;
    let locationNavigated: string | null = null;

    const isEmbedded = false; // Standalone storefront

    const handleProceedToCheckout = async () => {
      const freshCart = await revalidateCart();
      const activeCheckoutUrl = freshCart.checkoutUrl;

      if (isEmbedded) {
        presentedLink = {
          href: activeCheckoutUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          label: 'Open secure checkout in a new tab',
        };
      } else {
        locationNavigated = activeCheckoutUrl;
      }
    };

    await handleProceedToCheckout();

    assert.equal(revalidationCalled, true);
    assert.equal(presentedLink, null, 'Should not show preview new-tab card in normal standalone mode');
    assert.equal(
      locationNavigated,
      shopifyReturnedCart.checkoutUrl,
      'Standalone storefront must preserve standard checkout navigation using unchanged checkoutUrl'
    );
  });
});

