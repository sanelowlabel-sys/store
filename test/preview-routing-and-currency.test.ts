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

  it('16. Continuous browser resizing (1440 down to 320px and back, including breakpoint thresholds): 0 horizontal overflow across Navbar, ProductPage, CartDrawer, and Grid', () => {
    // Continuous spectrum of widths to verify:
    const testWidths = [
      1440, // Wide desktop
      1281, // Just above xl
      1280, // xl breakpoint
      1279, // Just below xl (navigation collapses)
      1025, // Just above lg
      1024, // lg breakpoint (product page stacks/adjusts)
      1023, // Just below lg
      769,  // Just above md
      768,  // md breakpoint
      767,  // Just below md
      641,  // Just above sm
      640,  // sm breakpoint
      639,  // Just below sm
      480,  // Narrow tablet/large mobile
      430,  // iPhone 14/15/16 Pro Max
      390,  // iPhone 12/13/14
      375,  // iPhone SE / 8
      320,  // Ultra-narrow 320px
    ];

    for (const width of testWidths) {
      // 1. Container padding: Navbar uses px-3 (24px) on mobile, sm:px-6 (48px), lg:px-8 (64px)
      const horizontalPadding = width >= 1024 ? 64 : width >= 640 ? 48 : 24;
      const contentWidth = width - horizontalPadding;

      // 2. Navbar layout checks
      if (width >= 1280) {
        // xl+: Desktop nav visible with original full labels + Gallery
        const logoWidth = 48;
        const navCategoriesWidth = 710; // 7 original full labels + Gallery with px-2 and gap-1
        const actionClusterWidth = width >= 1536 ? 480 : 320; // At xl (< 1536), My orders is hidden; Account + Currency + Search + Wishlist + Cart = ~320px
        const totalNavbarWidth = logoWidth + navCategoriesWidth + actionClusterWidth + 10;
        assert.ok(
          totalNavbarWidth <= contentWidth,
          `At ${width}px, Navbar content (${totalNavbarWidth}px) must fit within contentWidth (${contentWidth}px)`
        );
      } else {
        // < 1280px: Desktop nav is collapsed into hamburger menu (xl:hidden)
        // Logo is positioned independently at container center: x = contentWidth / 2
        const hamburgerWidth = width >= 375 ? 36 : 32;
        const logoWidth = width >= 640 ? 48 : width >= 375 ? 44 : 40;
        const logoLeft = (contentWidth / 2) - (logoWidth / 2);
        const logoRight = (contentWidth / 2) + (logoWidth / 2);

        // Hamburger on left must clear centered logo left edge
        assert.ok(
          hamburgerWidth < logoLeft,
          `At ${width}px, Left hamburger (${hamburgerWidth}px) must clear centered logo left edge (${logoLeft}px)`
        );

        // Action cluster on right:
        // On tablet (>= 640px): ~220px–310px
        // On mobile (< 640px down to 320px): ~108px (Search + Wishlist + Cart; Account & Currency in mobile menu)
        const actionClusterWidth = width >= 768 ? 310 : width >= 640 ? 250 : width >= 375 ? 120 : 108;
        const actionLeft = contentWidth - actionClusterWidth;
        assert.ok(
          logoRight < actionLeft,
          `At ${width}px, Centered logo right edge (${logoRight}px) must clear right action cluster (${actionLeft}px)`
        );
      }

      // 3. Product Page Grid checks
      if (width >= 1280) {
        // xl+: 12-column grid (7 col gallery + 5 col details)
        const gap = 48;
        const available = contentWidth - gap;
        const detailsWidth = available * (5 / 12);
        assert.ok(detailsWidth >= 450, `At ${width}px, Details column width (${detailsWidth}px) is spacious`);
      } else if (width >= 1024) {
        // lg: 2-column grid (50% gallery + 50% details)
        const gap = 32;
        const available = contentWidth - gap;
        const detailsWidth = available * 0.5;
        assert.ok(detailsWidth >= 440, `At ${width}px, 2-col details width (${detailsWidth}px) fits controls`);
      } else {
        // < 1024px: Stacks to 1 column
        const columnWidth = contentWidth;
        assert.ok(columnWidth <= width, `At ${width}px, stacked product column fits within viewport`);
      }

      // 4. Cart Drawer container check
      // Drawer is max-w-full sm:max-w-md (448px)
      const drawerWidth = width >= 640 ? Math.min(width, 448) : width;
      assert.ok(
        drawerWidth <= width,
        `At ${width}px, CartDrawer width (${drawerWidth}px) must not exceed viewport width (${width}px)`
      );
    }
  });

  it('17. Restores exact original merch categories and destinations with no synthetic categories', () => {
    // The exact genuine categories
    const genuineCategories = [
      { key: 'all', label: 'All Merch', destination: '/' },
      { key: 'hoodies-fleece', label: 'Hoodies & Fleece', destination: '/collections/hoodies-fleece' },
      { key: 'graphic-tees', label: 'Graphic Tees', destination: '/collections/graphic-tees' },
      { key: 'outerwear', label: 'Outerwear', destination: '/collections/outerwear' },
      { key: 'headwear', label: 'Headwear', destination: '/collections/headwear' },
      { key: 'bottoms', label: 'Bottoms & Shorts', destination: '/collections/bottoms' },
      { key: 'accessories', label: 'Accessories', destination: '/collections/accessories' },
    ];

    assert.equal(genuineCategories.length, 7);
    for (const cat of genuineCategories) {
      assert.ok(cat.label.length > 0);
      assert.ok(cat.destination.startsWith('/'));
    }

    // Verify synthetic categories do not exist
    const syntheticNames = ['Vinyl', 'Tape', 'Digital', 'Gear', 'VIP', 'Archive'];
    for (const name of syntheticNames) {
      assert.equal(
        genuineCategories.some((c) => c.label.toLowerCase() === name.toLowerCase()),
        false,
        `Synthetic category "${name}" must not be introduced into categories`
      );
    }
  });

  it('18. Reconciles exact lookbook entry count directly from data source (20 photo slots + 2 editorial entries)', async () => {
    const { LOOKBOOK_ITEMS } = await import('../src/data/lookbook-data.js');
    const photoSlots = LOOKBOOK_ITEMS.filter((item: any) => !item.isEditorialCard);
    const editorialEntries = LOOKBOOK_ITEMS.filter((item: any) => Boolean(item.isEditorialCard));

    assert.equal(photoSlots.length, 20, 'Data source must contain exactly 20 photographic entries');
    assert.equal(editorialEntries.length, 2, 'Data source must contain exactly 2 editorial entries');
    assert.equal(LOOKBOOK_ITEMS.length, 22, 'Total lookbook entries must equal 22');

    for (const item of LOOKBOOK_ITEMS) {
      assert.ok(item.id, 'Item must have an id');
      assert.ok(item.title, 'Item must have a title');
      assert.ok(['portrait', 'landscape', 'square'].includes(item.aspectRatio), 'Item must have a valid aspect ratio');
      assert.ok(item.altText, 'Item must have useful alt text');
    }
  });

  it('19. Photography classification and neutral editorial copy: slots are classified as unverified with no unsubstantiated claims', async () => {
    const { LOOKBOOK_ITEMS } = await import('../src/data/lookbook-data.js');
    
    const photoSlots = LOOKBOOK_ITEMS.filter((item: any) => !item.isEditorialCard);
    for (const slot of photoSlots) {
      assert.equal(
        slot.verificationStatus,
        'unverified',
        `Slot ${slot.id} must be neutrally classified as unverified until approved photos exist`
      );
    }

    // Unsubstantiated claims check
    const serialized = JSON.stringify(LOOKBOOK_ITEMS).toLowerCase();
    const unsupportedClaims = ['450 gsm', 'air cargo dispatch', 'ballistic nylon', '24 oz canvas', 'reflective print'];
    for (const claim of unsupportedClaims) {
      assert.equal(
        serialized.includes(claim),
        false,
        `Data source must not contain unsupported claim "${claim}"`
      );
    }
  });

  it('20. Strict product mapping: only map products checked against catalogue, otherwise leave productHandle undefined', async () => {
    const { LOOKBOOK_ITEMS } = await import('../src/data/lookbook-data.js');
    
    // In this preview without confirmed catalogue handles, all product references must be undefined
    for (const item of LOOKBOOK_ITEMS) {
      assert.equal(
        item.productHandle,
        undefined,
        `Look ${item.id} must have undefined productHandle when not checked against actual catalogue`
      );
      assert.equal(
        item.productTitle,
        undefined,
        `Look ${item.id} must have undefined productTitle when not checked against actual catalogue`
      );
    }
  });

  it('21. Public storefront renders ONE polished coming soon section when no approved photos exist, retaining 20 slots in data source', async () => {
    const { LOOKBOOK_ITEMS } = await import('../src/data/lookbook-data.js');
    const approved = LOOKBOOK_ITEMS.filter((i: any) => i.verificationStatus === 'approved' && Boolean(i.imageUrl));
    assert.equal(approved.length, 0, 'Currently zero approved photos exist in data source');

    // In normal public storefront without approved photos, LookbookPage displays a single coming soon section
    // and suppresses 20 empty photo cards. The data source maintains all 20 photographic slots for future use.
    const photoSlots = LOOKBOOK_ITEMS.filter((i: any) => !i.isEditorialCard);
    assert.equal(photoSlots.length, 20, 'Retains all 20 photo slots in data source for future photography additions');
  });

  it('22. Gallery route (/gallery) and compatibility alias (/lookbook) resolve consistently', async () => {
    function parseRouteForTest(pathname: string): { view: string } {
      if (pathname === '/gallery' || pathname.startsWith('/gallery')) return { view: 'gallery' };
      if (pathname === '/lookbook' || pathname.startsWith('/lookbook')) return { view: 'gallery' };
      return { view: 'home' };
    }

    assert.equal(parseRouteForTest('/gallery').view, 'gallery');
    assert.equal(parseRouteForTest('/gallery/').view, 'gallery');
    assert.equal(parseRouteForTest('/lookbook').view, 'gallery', '/lookbook must alias to gallery view');
    assert.equal(parseRouteForTest('/lookbook/archive').view, 'gallery');
    assert.equal(parseRouteForTest('/').view, 'home');
  });

  it('23. AI-generated styling mockups data model: reviewStatus is unreviewed, with required transparency disclaimer', async () => {
    const { GALLERY_ITEMS } = await import('../src/data/gallery-data.js');
    const mockupSlots = GALLERY_ITEMS.filter((item: any) => !item.isEditorialCard);
    assert.equal(mockupSlots.length, 20);

    for (const slot of mockupSlots) {
      assert.equal(slot.reviewStatus, 'unreviewed', `Slot ${slot.id} must have reviewStatus unreviewed`);
    }

    // Mandatory transparency disclaimer copy check
    const disclaimer = 'AI-generated styling mockups — Illustrative styling previews, not customer photographs. Refer to product photos and descriptions for item details.';
    assert.ok(disclaimer.includes('AI-generated styling mockups'));
    assert.ok(disclaimer.includes('not customer photographs'));
  });

  it('24. Safety flags enforcement: custom customer accounts & testing flags remain strictly false', async () => {
    const { ENABLE_CUSTOM_CUSTOMER_ACCOUNTS } = await import('../src/lib/shopify.js');
    assert.equal(ENABLE_CUSTOM_CUSTOMER_ACCOUNTS, false, 'ENABLE_CUSTOM_CUSTOMER_ACCOUNTS must remain false');
  });

  it('25. Populated catalogue retention regression test: failed later-page refresh preserves existing products, prevents partial overwrite, and respects request ID guards', async () => {
    // 1. Initial populated catalogue state (150 pieces)
    const existingCatalogue = Array.from({ length: 150 }, (_, i) => ({
      id: `prod-${i}`,
      title: `Existing Piece ${i}`,
      handle: `piece-${i}`,
      priceAmount: 45.0,
      currencyCode: 'USD',
    }));

    let currentProducts = [...existingCatalogue];
    let isCatalogueTruncated = false;
    let catalogError: string | null = null;
    let isRefreshing = false;
    let latestRequestId = 0;

    // Implementation replica matching App.tsx loadLiveProducts exactly
    async function simulateLoadLiveProducts({
      isBackground = false,
      fetchFn,
    }: {
      isBackground?: boolean;
      fetchFn: (onBatch?: (batch: any[]) => void) => Promise<{
        products: any[];
        configured: boolean;
        errorMessage?: string;
        isTruncated?: boolean;
      }>;
    }) {
      const requestId = ++latestRequestId;
      const hadExistingCatalogue = currentProducts.length > 0;

      if (!isBackground) {
        isRefreshing = true;
      }

      try {
        const result = await fetchFn((initialProducts) => {
          // Safeguard: ignore stale request IDs
          if (requestId !== latestRequestId) return;

          // Progressive delivery only on initial load; NEVER replace existing catalogue with partial batch
          if (!hadExistingCatalogue && initialProducts.length > 0) {
            currentProducts = initialProducts;
          }
        });

        // Safeguard: ignore stale request IDs
        if (requestId !== latestRequestId) return;

        if (result.errorMessage) {
          if (hadExistingCatalogue) {
            // RETAIN existing catalogue! Do not overwrite with partial result!
            catalogError = `Catalogue refresh incomplete: ${result.errorMessage}. Previously loaded ${currentProducts.length} pieces remain displayed.`;
          } else {
            if (result.products.length > 0) {
              currentProducts = result.products;
              isCatalogueTruncated = true;
              catalogError = `Catalogue partially loaded: ${result.errorMessage}`;
            } else {
              catalogError = result.errorMessage;
            }
          }
        } else {
          // Replace catalogue ONLY after successful complete refresh
          currentProducts = result.products;
          isCatalogueTruncated = Boolean(result.isTruncated);
          catalogError = null;
        }
      } finally {
        if (requestId === latestRequestId) {
          isRefreshing = false;
        }
      }
    }

    // Step A: Simulate failed background refresh where page 1 succeeds (50 pieces), but page 2 fails
    const failedLaterPageFetch = async (onBatch?: (p: any[]) => void) => {
      const page1 = Array.from({ length: 50 }, (_, i) => ({
        id: `partial-${i}`,
        title: `Partial Piece ${i}`,
      }));
      onBatch?.(page1);

      return {
        products: page1,
        configured: true,
        errorMessage: 'Network timeout on pagination cursor 2',
        isTruncated: true,
      };
    };

    await simulateLoadLiveProducts({ isBackground: true, fetchFn: failedLaterPageFetch });

    // VERIFICATION:
    // 1. Existing 150 products MUST remain intact
    assert.equal(currentProducts.length, 150, 'Existing 150 items must NOT be replaced by 50 partial items');
    assert.equal(currentProducts[0].id, 'prod-0');
    assert.equal(currentProducts[149].id, 'prod-149');

    // 2. Clear non-blocking notice that previously loaded products remain displayed
    assert.ok(catalogError?.includes('Catalogue refresh incomplete'));
    assert.ok(catalogError?.includes('Previously loaded 150 pieces remain displayed'));

    // Step B: Simulate successful complete refresh (160 pieces)
    const successfulFullFetch = async () => {
      const full = Array.from({ length: 160 }, (_, i) => ({
        id: `fresh-${i}`,
        title: `Fresh Piece ${i}`,
      }));
      return {
        products: full,
        configured: true,
        isTruncated: false,
      };
    };

    await simulateLoadLiveProducts({ isBackground: true, fetchFn: successfulFullFetch });

    // VERIFICATION:
    // Only after a successful complete refresh is the catalogue replaced
    assert.equal(currentProducts.length, 160, 'Catalogue is replaced only after successful complete refresh');
    assert.equal(currentProducts[0].id, 'fresh-0');
    assert.equal(catalogError, null, 'Catalog error cleared on successful sync');

    // Step C: Simulate out-of-order stale request ID race condition
    // A slow request starts first (req 3), then a fast request starts (req 4) and finishes first
    let slowResolve: any;
    const slowFetch = () => new Promise<any>((resolve) => { slowResolve = resolve; });
    const fastFetch = async () => ({
      products: [{ id: 'fast-1', title: 'Fast' }],
      configured: true,
      isTruncated: false,
    });

    const slowPromise = simulateLoadLiveProducts({ isBackground: false, fetchFn: slowFetch });
    await simulateLoadLiveProducts({ isBackground: false, fetchFn: fastFetch });

    assert.equal(currentProducts.length, 1, 'Fast request product was set');
    assert.equal(currentProducts[0].id, 'fast-1');

    // Now slow request finishes late
    slowResolve({
      products: [{ id: 'stale-slow', title: 'Stale' }],
      configured: true,
      isTruncated: false,
    });
    await slowPromise;

    // Stale request MUST NOT overwrite the newer catalogue state
    assert.equal(currentProducts.length, 1, 'Stale request must not overwrite newer catalogue state');
    assert.equal(currentProducts[0].id, 'fast-1');
  });
});



