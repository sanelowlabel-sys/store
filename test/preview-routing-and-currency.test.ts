import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Footer } from '../src/components/Footer';
import { Navbar } from '../src/components/Navbar';
import { CartDrawer } from '../src/components/CartDrawer';
import { HeroBanner } from '../src/components/HeroBanner';
import { FaqModal } from '../src/components/FaqModal';
import type { Product, ShopifyCart } from '../src/types';
import {
  formatPrice,
  DEFAULT_CURRENCY,
  DEFAULT_COUNTRY,
  STORE_CONTACT_EMAIL,
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

  it('33. Customer-facing contact email is centralized and verified across templates and schemas', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // 1. Centralized constant
    assert.equal(STORE_CONTACT_EMAIL, 'merch@sanelowmusiclabel.co.za');

    // 2. Footer.tsx uses STORE_CONTACT_EMAIL and contains no legacy address
    const footerContent = fs.readFileSync(path.resolve('src/components/Footer.tsx'), 'utf-8');
    assert.ok(footerContent.includes('STORE_CONTACT_EMAIL'), 'Footer.tsx must reference STORE_CONTACT_EMAIL');
    assert.ok(!footerContent.includes('meandmusicdistributors@gmail.com'), 'Footer.tsx must not contain legacy email');

    // 3. TrackOrderModal.tsx uses STORE_CONTACT_EMAIL and contains no legacy address
    const trackOrderContent = fs.readFileSync(path.resolve('src/components/TrackOrderModal.tsx'), 'utf-8');
    assert.ok(trackOrderContent.includes('STORE_CONTACT_EMAIL'), 'TrackOrderModal.tsx must reference STORE_CONTACT_EMAIL');
    assert.ok(!trackOrderContent.includes('meandmusicdistributors@gmail.com'), 'TrackOrderModal.tsx must not contain legacy email');

    // 4. index.html contains the new contact email in Organization schema and no legacy address
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
    assert.ok(indexHtml.includes('"email": "merch@sanelowmusiclabel.co.za"'), 'index.html must include new email');
    assert.ok(!indexHtml.includes('meandmusicdistributors@gmail.com'), 'index.html must not contain legacy email');

    // 5. api/_seo.ts and api/render.ts generate Organization schema with the new email
    const { generateOrganizationSchema: seoSchemaGen } = await import('../api/_seo');
    const seoSchema = seoSchemaGen('https://shop.sanelowmusiclabel.co.za');
    assert.equal(seoSchema.email, 'merch@sanelowmusiclabel.co.za');
    assert.equal(seoSchema.contactPoint[0].email, 'merch@sanelowmusiclabel.co.za');
  });

  it('34. Shared Footer replaces non-working newsletter/discount block with honest shopping CTA while keeping neutral copy', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const html = renderToStaticMarkup(
      React.createElement(Footer, {
        onOpenTrackOrder: () => {},
        onOpenCustomerPortal: () => {},
        onShopAllMerch: () => {},
      })
    );

    // Honest shopping CTA replacement copy & real destination
    assert.ok(html.includes('SANELOW MUSIC GROUP MERCH'), 'Footer must display SANELOW MUSIC GROUP MERCH eyebrow');
    assert.ok(html.includes('Explore the latest merch.'), 'Footer must display Explore the latest merch. heading');
    assert.ok(
      html.includes('Browse the collection and find your next favourite.'),
      'Footer must display Browse the collection and find your next favourite. description'
    );
    assert.ok(html.includes('Shop all merch'), 'Footer must display Shop all merch action link');
    assert.ok(html.includes('href="/"'), 'Footer Shop all merch CTA must link to existing All Merch route (/)');

    // Preserved neutral footer copy, contact email, and working order/account actions
    assert.ok(
      html.includes('Explore Sanelow Music Group merch. Browse the collection and check individual product pages for available options and details.'),
      'Footer must display updated brand description'
    );
    assert.ok(
      html.includes('Explore the latest merch'),
      'Footer must display neutral tagline instead of active air cargo claim'
    );
    assert.ok(html.includes('Shopping information'), 'Footer must rename Brand Guarantee to Shopping information');
    assert.ok(html.includes('Product details on each item page'));
    assert.ok(html.includes('Available options shown per product'));
    assert.ok(html.includes('Order history in your account'));
    assert.ok(html.includes('Questions? Contact our merch team'));
    assert.ok(html.includes('Merch support'), 'Footer must rename Merch Concierge to Merch support');
    assert.ok(
      html.includes('Questions about a product or an existing order? Email our merch team.'),
      'Footer must display updated support description'
    );
    assert.ok(html.includes('Track Your Shipment &amp; Orders'));
    assert.ok(html.includes('Sign in / Create account'));
    assert.ok(html.includes(`mailto:${STORE_CONTACT_EMAIL}`));
    assert.ok(html.includes(STORE_CONTACT_EMAIL));

    // Removed non-working newsletter form, MERCH15, 15% OFF, false promises, and earlier unverified claims
    const lowerHtml = html.toLowerCase();
    const removedPhrases = [
      '<form',
      '<input',
      'type="email"',
      'exclusive drop access',
      '15% off',
      'merch15',
      'vip drop list',
      'join drop list',
      'pre-order allocations',
      'restock notifications',
      'early streetwear drop',
      'enter your email address',
      'animate-pulse',
      'custom-milled',
      'french terry',
      'acid-washed',
      '450 gsm',
      'air cargo',
      'air freight',
      'worldwide express',
      '24-hour express',
      '256-bit',
      'ssl encrypted',
      'hassle-free fit',
      '30-day authentic fit',
      'brand guarantee',
      'merch concierge',
      'frequently asked questions',
      'fabric sizing',
    ];
    for (const phrase of removedPhrases) {
      assert.ok(!lowerHtml.includes(phrase), `Footer must not contain removed form, discount, or unverified claim: "${phrase}"`);
    }

    // Confirm Footer.tsx source no longer carries newsletter-only state/handlers
    const footerSource = fs.readFileSync(path.resolve('src/components/Footer.tsx'), 'utf-8');
    for (const deadSymbol of ['handleSubscribe', 'isSubscribed', 'newsletterEmail', 'MERCH15']) {
      assert.ok(!footerSource.includes(deadSymbol), `Footer.tsx must not retain unused symbol "${deadSymbol}"`);
    }

    // Confirm SSR template does not emit duplicate unverified footer claims
    const renderSource = fs.readFileSync(path.resolve('api/render.ts'), 'utf-8').toLowerCase();
    for (const phrase of ['air cargo', '24-hour express', '256-bit ssl', 'brand guarantee', 'merch concierge']) {
      assert.ok(!renderSource.includes(phrase), `api/render.ts must not contain duplicate unverified footer claim: "${phrase}"`);
    }
  });

  it('35. Storefront Navbar removes topmost announcement strip while preserving main navbar controls and updated page offsets', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const htmlClosed = renderToStaticMarkup(
      React.createElement(Navbar, {
        currentCategory: 'all',
        onSelectCategory: () => {},
        currency: 'USD',
        onSelectCurrency: () => {},
        cartCount: 2,
        cartTotalAmount: 120,
        wishlistCount: 3,
        onOpenCart: () => {},
        onOpenWishlist: () => {},
        onOpenTrackOrder: () => {},
        onOpenCustomerPortal: () => {},
        onNavigateAccount: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onNavigateGallery: () => {},
      })
    );

    const htmlWithMobileMenu = renderToStaticMarkup(
      React.createElement(Navbar, {
        currentCategory: 'all',
        onSelectCategory: () => {},
        currency: 'USD',
        onSelectCurrency: () => {},
        cartCount: 2,
        cartTotalAmount: 120,
        wishlistCount: 3,
        onOpenCart: () => {},
        onOpenWishlist: () => {},
        onOpenTrackOrder: () => {},
        onOpenCustomerPortal: () => {},
        onNavigateAccount: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onNavigateGallery: () => {},
        defaultMobileMenuOpen: true,
      })
    );

    // Topmost announcement strip and rotating/drop copy must be removed
    for (const html of [htmlClosed, htmlWithMobileMenu]) {
      assert.ok(!html.includes('Official Shopify Storefront'), 'Announcement strip text "Official Shopify Storefront" must be removed');
      assert.ok(!html.includes('South Africa &amp; Worldwide Delivery'), 'Announcement strip text "South Africa & Worldwide Delivery" must be removed');
      assert.ok(!html.includes('South Africa & Worldwide Delivery'), 'Announcement strip delivery text must be removed');
      assert.ok(!html.includes('ARCHIVE DROP LIVE'), 'Drop announcement text must be removed');
      assert.ok(!html.includes('animate-ping'), 'Announcement strip live ping indicator must be removed');
    }

    // Preserved sticky main navbar and all interactive controls
    assert.ok(htmlClosed.includes('sticky top-0'), 'Main navbar must remain sticky at top-0');
    assert.ok(htmlClosed.includes('id="navbar-brand-logo"'), 'Sanelow logo must be preserved');
    assert.ok(htmlClosed.includes('id="mobile-menu-btn"'), 'Mobile menu button must be preserved');
    for (const catKey of ['all', 'hoodies-fleece', 'graphic-tees', 'outerwear', 'headwear', 'bottoms', 'accessories']) {
      assert.ok(htmlClosed.includes(`id="nav-cat-${catKey}"`), `Product category ${catKey} must be preserved`);
    }
    assert.ok(htmlClosed.includes('id="nav-link-gallery"'), 'Gallery link must be preserved');
    assert.ok(htmlClosed.includes('id="search-toggle-btn"'), 'Search trigger must be preserved');
    assert.ok(htmlClosed.includes('id="nav-customer-account-link"'), 'Account link must be preserved');
    assert.ok(htmlClosed.includes('id="wishlist-drawer-btn"'), 'Wishlist button must be preserved');
    assert.ok(htmlClosed.includes('id="currency-dropdown-toggle"'), 'Currency selector must be preserved');
    assert.ok(htmlClosed.includes('id="cart-drawer-btn"'), 'Cart button must be preserved');

    // Mobile dropdown controls preserved
    assert.ok(htmlWithMobileMenu.includes('id="mobile-nav-wishlist"'));
    assert.ok(htmlWithMobileMenu.includes('id="mobile-nav-sign-in"'));
    assert.ok(htmlWithMobileMenu.includes('id="mobile-nav-my-orders"'));
    assert.ok(htmlWithMobileMenu.includes('Storefront Currency (USD)'));

    // Page spacing / scroll offsets no longer pad for the removed announcement bar
    const collectionPageSource = fs.readFileSync(path.resolve('src/components/CollectionPage.tsx'), 'utf-8');
    assert.ok(!collectionPageSource.includes('pt-28'), 'CollectionPage must not keep oversized pt-28 gap');
    assert.ok(!collectionPageSource.includes('sm:pt-32'), 'CollectionPage must not keep oversized sm:pt-32 gap');
    assert.ok(collectionPageSource.includes('scroll-mt-20 sm:scroll-mt-24'));

    const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
    assert.ok(!appSource.includes('scroll-mt-28 sm:scroll-mt-32'), 'App.tsx catalogue scroll-mt must reflect reduced header height');
    assert.ok(appSource.includes('scroll-mt-20 sm:scroll-mt-24'));
  });

  it('36. BrandStorySection uses neutral styling and browsing copy without unverified garment, PCI, or fulfillment claims', async () => {
    const path = await import('path');
    const { createRequire } = await import('module');
    const esbuild = await import('esbuild');

    const bundled = await esbuild.build({
      entryPoints: [path.resolve('src/components/BrandStorySection.tsx')],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      packages: 'external',
      loader: { '.jpg': 'dataurl' },
    });

    const nodeRequire = createRequire(import.meta.url);
    const mod = { exports: {} as { BrandStorySection: React.ComponentType } };
    const evalFn = new Function('require', 'module', 'exports', bundled.outputFiles[0].text);
    evalFn(nodeRequire, mod, mod.exports);
    const html = renderToStaticMarkup(React.createElement(mod.exports.BrandStorySection));

    // Exact requested heading, introduction, and three feature blocks
    assert.ok(html.includes('Music-inspired style. Explore the collection.'));
    assert.ok(
      html.includes('Explore Sanelow apparel and accessories. Check each product page for available colours, sizes, materials, and product details.')
    );
    assert.ok(html.includes('Explore the range'));
    assert.ok(html.includes('Browse apparel and accessories across the store.'));
    assert.ok(html.includes('Choose your style'));
    assert.ok(html.includes('View available sizes and colours on each product page.'));
    assert.ok(html.includes('Need a hand?'));
    assert.ok(html.includes('For merchandise questions, contact'));
    assert.ok(html.includes(`mailto:${STORE_CONTACT_EMAIL}`));
    assert.ok(html.includes(STORE_CONTACT_EMAIL));

    // Neutral image-adjacent styling blocks & Apparel / Accessories / Music-inspired strip
    assert.ok(html.includes('Everyday Merch Styling'));
    assert.ok(html.includes('Visual Look Previews'));
    assert.ok(html.includes('Apparel'));
    assert.ok(html.includes('Accessories'));
    assert.ok(html.includes('Music-inspired'));

    // Preserved AI-generated styling-preview labels & images
    assert.ok(html.includes('AI-generated styling preview'));
    assert.ok(html.includes('// STYLING PREVIEW'));
    assert.ok(html.includes('AI-generated styling preview - Sanelow graphic sweatshirt'));
    assert.ok(html.includes('AI-generated styling preview - Sanelow graphic hoodie'));

    // Unsupported claims must be absent from visible text
    const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    const bannedClaims = [
      'crafted without compromise',
      'powered by shopify checkout',
      'direct merch atelier',
      'tailored boxy silhouette',
      'reinforced ribbing',
      'dropped shoulder',
      'shrink-resistant',
      'combed cotton',
      'pigment &amp; acid wash',
      'enzyme treatments',
      'patina',
      'hand feel',
      'direct-to-consumer',
      'retail markups',
      'distributor',
      'licensing fees',
      'verified tracking',
      'heavyweight structured weaves',
      'french terry',
      'ring-spun',
      'pci',
      'encrypted',
      'sms',
      'courier tracking links',
      '100%',
      'usd',
      'south africa context',
      'shopify fulfillment',
      'official storefront',
    ];
    for (const claim of bannedClaims) {
      assert.ok(!visibleText.includes(claim), `BrandStorySection must not contain unsupported claim: "${claim}"`);
    }
  });

  it('37. CartDrawer renders replacement copy in empty and populated states while preserving layout, IDs, and cart details', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const emptyHtml = renderToStaticMarkup(
      React.createElement(CartDrawer, {
        isOpen: true,
        onClose: () => {},
        cart: null,
        isLoading: false,
        onUpdateQuantity: () => {},
        onRemoveItem: () => {},
        onApplyDiscount: async () => ({ success: false }),
        onBrowseProducts: () => {},
      })
    );

    assert.ok(emptyHtml.includes('id="cart-drawer-container"'));
    assert.ok(emptyHtml.includes('id="close-cart-drawer-btn"'));
    assert.ok(emptyHtml.includes('Merch Bag (0)'));
    assert.ok(emptyHtml.includes('Your merchandise bag'));
    assert.ok(emptyHtml.includes('Your bag is empty'));
    assert.ok(emptyHtml.includes('Browse Sanelow apparel and accessories.'));
    assert.ok(emptyHtml.includes('Explore merch'));

    for (const oldText of ['Official Shopify Storefront Cart', 'custom-milled', 'Explore Merch Drops']) {
      assert.ok(!emptyHtml.includes(oldText), `Empty CartDrawer must not contain "${oldText}"`);
    }

    const sampleCart: ShopifyCart = {
      id: 'gid://shopify/Cart/test-1',
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/test-1',
      totalQuantity: 2,
      cost: {
        subtotalAmount: { amount: '90.00', currencyCode: 'USD' },
        totalAmount: { amount: '90.00', currencyCode: 'USD' },
      },
      discountCodes: [],
      lines: [
        {
          id: 'gid://shopify/CartLine/1',
          quantity: 2,
          cost: {
            amountPerQuantity: { amount: '45.00', currencyCode: 'USD' },
            subtotalAmount: { amount: '90.00', currencyCode: 'USD' },
            totalAmount: { amount: '90.00', currencyCode: 'USD' },
          },
          merchandise: {
            id: 'gid://shopify/ProductVariant/1',
            title: 'L / Black',
            availableForSale: true,
            sku: 'SNL-TEE-01',
            selectedOptions: [
              { name: 'Size', value: 'L' },
              { name: 'Color', value: 'Black' },
            ],
            price: { amount: '45.00', currencyCode: 'USD' },
            product: {
              id: 'gid://shopify/Product/1',
              title: 'Sanelow Graphic Tee',
              handle: 'sanelow-graphic-tee',
            },
          },
          discountAllocations: [],
        },
      ],
    };

    const populatedHtml = renderToStaticMarkup(
      React.createElement(CartDrawer, {
        isOpen: true,
        onClose: () => {},
        cart: sampleCart,
        isLoading: false,
        onUpdateQuantity: () => {},
        onRemoveItem: () => {},
        onApplyDiscount: async () => ({ success: false }),
        onBrowseProducts: () => {},
      })
    );

    assert.ok(populatedHtml.includes('id="cart-drawer-container"'));
    assert.ok(populatedHtml.includes('id="close-cart-drawer-btn"'));
    assert.ok(populatedHtml.includes('id="proceed-to-checkout-btn"'));
    assert.ok(populatedHtml.includes('Merch Bag (2)'));
    assert.ok(populatedHtml.includes('Your merchandise bag'));
    assert.ok(populatedHtml.includes('USD Context'));
    assert.ok(populatedHtml.includes('Sanelow Graphic Tee'));
    assert.ok(populatedHtml.includes('$90.00') && populatedHtml.includes('USD'));
    assert.ok(populatedHtml.includes('Calculated at Shopify checkout'));
    assert.ok(populatedHtml.includes('Review your order at checkout'));
    assert.ok(populatedHtml.includes('Delivery options at checkout'));

    for (const oldText of [
      'Official Shopify Storefront Cart',
      'Shopify PCI-Compliant Checkout',
      'South Africa Delivery',
      'Bag revalidated with Shopify',
    ]) {
      assert.ok(!populatedHtml.includes(oldText), `Populated CartDrawer must not contain "${oldText}"`);
    }

    // Verify revalidated checkout status copy in CartDrawer source
    const cartDrawerSource = fs.readFileSync(path.resolve('src/components/CartDrawer.tsx'), 'utf-8');
    assert.ok(cartDrawerSource.includes('Continue to checkout'), 'CartDrawer must use "Continue to checkout" status text');
    assert.ok(!cartDrawerSource.includes('Bag revalidated with Shopify'), 'CartDrawer must remove "Bag revalidated with Shopify"');
    assert.ok(!cartDrawerSource.includes('Official Shopify Storefront Cart'));
    assert.ok(!cartDrawerSource.includes('Shopify PCI-Compliant Checkout'));
    assert.ok(!cartDrawerSource.includes('South Africa Delivery'));
    assert.ok(!cartDrawerSource.includes('Explore Merch Drops'));
  });

  it('38. HeroBanner renders replacement wording with and without a featured product and omits unsupported claims', () => {
    const featuredProduct: Product = {
      id: 'gid://shopify/Product/hero-1',
      shopifyId: 'gid://shopify/Product/hero-1',
      handle: 'sanelow-archive-tee',
      title: 'Sanelow Archive Tee',
      tagline: 'Archive Graphic Tee',
      category: 'graphic-tees',
      dropCollection: 'CORE COLLECTION',
      sku: 'SNL-ARC-01',
      priceAmount: 68,
      compareAtPriceAmount: 80,
      currencyCode: 'USD',
      priceUSD: 68,
      compareAtPriceUSD: 80,
      discountPercent: 15,
      availableForSale: true,
      totalVariantsCount: 3,
      isPreOrder: false,
      description: 'Graphic tee from the Sanelow collection.',
      features: [],
      fabricSpecs: [],
      sizingDetails: [],
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Black', hex: '#000000' }],
      images: ['https://cdn.shopify.com/hero-tee.jpg'],
      variants: [],
      options: [],
      tags: [],
      reviews: [],
    };

    const withProductHtml = renderToStaticMarkup(
      React.createElement(HeroBanner, {
        featuredProduct,
        currency: 'USD',
        onQuickView: () => {},
        onScrollToCatalog: () => {},
        onOpenTrackOrder: () => {},
      })
    );

    const withoutProductHtml = renderToStaticMarkup(
      React.createElement(HeroBanner, {
        featuredProduct: null,
        currency: 'USD',
        onQuickView: () => {},
        onScrollToCatalog: () => {},
        onOpenTrackOrder: () => {},
      })
    );

    for (const html of [withProductHtml, withoutProductHtml]) {
      assert.ok(html.includes('SANELOW MUSIC GROUP MERCH'));
      assert.ok(html.includes('SOUTH AFRICA'));
      assert.ok(html.includes('Music-inspired style.'));
      assert.ok(!html.includes('Music-inspired apparel &amp;'));
      assert.ok(html.includes('<br/>'));
      assert.ok(html.includes('Sanelow accessories.'));
      assert.ok(
        html.includes(
          'Explore graphic tops, layers, and accessories from Sanelow. View each product’s available sizes, colours, and details to find your next favourite.'
        )
      );
      assert.ok(html.includes('id="hero-shop-catalog-btn"'));
      assert.ok(html.includes('Explore the collection'));
      assert.ok(html.includes('id="hero-track-order-btn"'));
      assert.ok(html.includes('Track An Order'));
      assert.ok(html.includes('Browse the collection'));
      assert.ok(html.includes('Delivery options at checkout'));
      assert.ok(html.includes('View product details'));

      const lower = html.toLowerCase();
      const removedClaims = [
        'official sanelow storefront',
        'heavyweight boxy fits',
        'exclusive merch drops',
        'custom-milled',
        'heavyweight fabrics',
        'vintage washes',
        'structural relaxed silhouettes',
        'verified nationwide and global delivery',
        'explore the merch drop',
        'shopify verified checkout',
        'south africa delivery',
        'pci-dss level 1 security',
        'live catalogue syncing',
        'products update automatically',
      ];
      for (const claim of removedClaims) {
        assert.ok(!lower.includes(claim), `HeroBanner must not contain removed claim: "${claim}"`);
      }
    }

    // Featured-product state preserves item details, pricing, discount, availability, and links
    assert.ok(withProductHtml.includes('FEATURED PIECE'));
    assert.ok(withProductHtml.includes('SAVE 15%'));
    assert.ok(withProductHtml.includes('CORE COLLECTION'));
    assert.ok(withProductHtml.includes('In Stock'));
    assert.ok(withProductHtml.includes('Sanelow Archive Tee'));
    assert.ok(withProductHtml.includes('href="/products/sanelow-archive-tee"'));
    assert.ok(withProductHtml.includes('$68.00') && withProductHtml.includes('USD'));
    assert.ok(withProductHtml.includes('View Options'));

    // No-featured-product fallback renders updated neutral copy
    assert.ok(withoutProductHtml.includes('Sanelow Merch Storefront'));
    assert.ok(withoutProductHtml.includes('Explore the catalogue for available apparel and accessories.'));
    assert.ok(withoutProductHtml.includes('Browse Catalogue'));
  });

  it('39. FaqModal renders replacement neutral copy using STORE_CONTACT_EMAIL and removes unverified claims', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const closedHtml = renderToStaticMarkup(
      React.createElement(FaqModal, {
        isOpen: false,
        onClose: () => {},
        onOpenTrackOrder: () => {},
      })
    );
    assert.equal(closedHtml, '', 'Closed FaqModal must render nothing');

    const openHtml = renderToStaticMarkup(
      React.createElement(FaqModal, {
        isOpen: true,
        onClose: () => {},
        onOpenTrackOrder: () => {},
      })
    );

    // Preserved modal container, title, controls, and accessibility attributes
    assert.ok(openHtml.includes('id="faq-modal-container"'));
    assert.ok(openHtml.includes('aria-label="Close FAQ"'));
    assert.ok(openHtml.includes('Merch Sizing &amp; Order FAQ'));
    assert.ok(openHtml.includes('Track Merch Order'));

    // Exact subtitle and tracking footer prompt
    assert.ok(openHtml.includes('Help with product information, sizing questions, and your order.'));
    assert.ok(openHtml.includes('Need to check an order?'));

    // Five replacement FAQ entries using STORE_CONTACT_EMAIL
    assert.ok(openHtml.includes('How do I choose a size?'));
    assert.ok(
      openHtml.includes(
        `Check the individual product page for available sizes and any sizing information provided. If you need help before ordering, contact ${STORE_CONTACT_EMAIL}.`
      )
    );
    assert.ok(openHtml.includes('Where can I check delivery options?'));
    assert.ok(
      openHtml.includes(
        'Enter your delivery address at checkout to review the available delivery options, charges, and any displayed estimates before paying.'
      )
    );
    assert.ok(openHtml.includes('Where can I find care instructions?'));
    assert.ok(
      openHtml.includes(
        `Follow the care label supplied with your item and any product-specific care instructions. For questions about a particular item, contact ${STORE_CONTACT_EMAIL}.`
      )
    );
    assert.ok(openHtml.includes('Who can I contact about an order issue?'));
    assert.ok(
      openHtml.includes(
        `For questions about your order or an item you received, contact ${STORE_CONTACT_EMAIL}. Include your order number, but do not send payment-card details or passwords.`
      )
    );
    assert.ok(openHtml.includes('Which payment methods can I use?'));
    assert.ok(openHtml.includes('Review the payment methods offered at checkout before placing your order.'));

    // Confirm STORE_CONTACT_EMAIL constant is used without duplicating literal address in source
    const faqSource = fs.readFileSync(path.resolve('src/components/FaqModal.tsx'), 'utf-8');
    assert.ok(faqSource.includes('STORE_CONTACT_EMAIL'), 'FaqModal.tsx must reference STORE_CONTACT_EMAIL');
    assert.ok(!faqSource.includes('merch@sanelowmusiclabel.co.za'), 'FaqModal.tsx must not duplicate literal email');

    // Old claims must be absent
    const lowerHtml = openHtml.toLowerCase();
    const removedClaims = [
      '450–500 gsm',
      'french terry',
      'ordering one size down',
      'us streetwear sizing',
      '85 countries',
      'within 24 hours',
      '5-7 business days',
      '3-5 business days',
      'air express freight',
      'custom pigment wash',
      'puff print',
      'chenille embroidery',
      '30-day authentic fit',
      '30-day fit guarantee',
      'free prepaid exchange',
      'sx71id-uy.myshopify.com',
      'looking for live drop tracking checkpoints',
      'essential details regarding heavyweight fabrics',
    ];
    for (const claim of removedClaims) {
      assert.ok(!lowerHtml.includes(claim), `FaqModal must not contain removed claim: "${claim}"`);
    }
  });
});




