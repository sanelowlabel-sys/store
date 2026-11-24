import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartDrawer } from '../src/components/CartDrawer';
import {
  CHECKOUT_PREP_MESSAGES,
  createCheckoutPreparationController,
  getCartCheckoutFingerprint,
  revalidateExistingCartForCheckout,
  validateCartForCheckout,
} from '../src/lib/checkout-prep';
import type { ShopifyCart } from '../src/types';

function makeCart(overrides: Partial<ShopifyCart> = {}): ShopifyCart {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/cached-1',
    totalQuantity: 2,
    cost: {
      subtotalAmount: { amount: '90.00', currencyCode: 'USD' },
      totalAmount: { amount: '90.00', currencyCode: 'USD' },
      totalTaxAmount: null,
      totalDutyAmount: null,
    },
    discountCodes: [],
    lines: [
      {
        id: 'gid://shopify/CartLine/line-1',
        quantity: 2,
        cost: {
          amountPerQuantity: { amount: '45.00', currencyCode: 'USD' },
          subtotalAmount: { amount: '90.00', currencyCode: 'USD' },
          totalAmount: { amount: '90.00', currencyCode: 'USD' },
        },
        merchandise: {
          id: 'gid://shopify/ProductVariant/var-1',
          title: 'L / Black',
          availableForSale: true,
          sku: 'SNL-TEE-01',
          selectedOptions: [
            { name: 'Size', value: 'L' },
            { name: 'Color', value: 'Black' },
          ],
          price: { amount: '45.00', currencyCode: 'USD' },
          product: {
            id: 'gid://shopify/Product/prod-1',
            title: 'Sanelow Graphic Tee',
            handle: 'sanelow-graphic-tee',
          },
        },
        discountAllocations: [],
      },
    ],
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Checkout Refresh Failure Handling & Concurrency Safety', () => {
  it('1. Rejected refresh never treats cached cart as success, never navigates, and surfaces retry message', async () => {
    const cachedCart = makeCart();
    let committedCart: ShopifyCart | null = null;

    const revalidateResult = await revalidateExistingCartForCheckout({
      cartId: cachedCart.id,
      fetchCart: async () => {
        throw new Error('Network timeout');
      },
      onCommitCart: (c) => {
        committedCart = c;
      },
    });

    assert.equal(revalidateResult.status, 'failed');
    assert.equal(revalidateResult.cart, null);
    assert.equal(committedCart, null, 'Must not commit any cart when refresh rejects');

    for (const isEmbedded of [false, true]) {
      const controller = createCheckoutPreparationController({
        initialIsOpen: true,
        initialCart: cachedCart,
        initialIsMutationPending: false,
      });
      const navigatedUrls: string[] = [];

      const outcome = await controller.prepareCheckout({
        cart: cachedCart,
        isOpen: true,
        isMutationPending: false,
        isEmbedded,
        refreshCart: async () => {
          throw new Error('Shopify 503');
        },
        navigate: (url) => navigatedUrls.push(url),
      });

      assert.equal(outcome.outcome, 'invalid');
      assert.deepEqual(navigatedUrls, [], `Standalone/embedded (${isEmbedded}) must not navigate on error`);
      const state = controller.getState();
      assert.equal(state.isPreparing, false);
      assert.equal(state.verifiedCheckoutUrl, null);
      assert.equal(state.error, CHECKOUT_PREP_MESSAGES.refreshFailed);
    }
  });

  it('2. Null refresh never falls back to cached cart.checkoutUrl or creates a replacement cart', async () => {
    const cachedCart = makeCart();
    let committedCart: ShopifyCart | null = null;

    const revalidateResult = await revalidateExistingCartForCheckout({
      cartId: cachedCart.id,
      fetchCart: async () => null,
      onCommitCart: (c) => {
        committedCart = c;
      },
    });
    assert.equal(revalidateResult.status, 'failed');
    assert.equal(revalidateResult.cart, null);
    assert.equal(committedCart, null);

    // Missing cartId must fail without creating a replacement cart
    const noIdResult = await revalidateExistingCartForCheckout({
      cartId: null,
      fetchCart: async () => {
        throw new Error('Should not be called without cartId');
      },
    });
    assert.equal(noIdResult.status, 'failed');
    assert.equal(noIdResult.cart, null);

    for (const isEmbedded of [false, true]) {
      const controller = createCheckoutPreparationController({
        initialIsOpen: true,
        initialCart: cachedCart,
      });
      const navigatedUrls: string[] = [];

      const outcome = await controller.prepareCheckout({
        cart: cachedCart,
        isOpen: true,
        isMutationPending: false,
        isEmbedded,
        refreshCart: async () => null,
        navigate: (url) => navigatedUrls.push(url),
      });

      assert.equal(outcome.outcome, 'invalid');
      if (outcome.outcome === 'invalid') {
        assert.equal(outcome.reason, 'null_cart');
      }
      assert.deepEqual(navigatedUrls, []);
      assert.equal(controller.getState().verifiedCheckoutUrl, null);
      assert.equal(controller.getState().error, CHECKOUT_PREP_MESSAGES.refreshFailed);
    }
  });

  it('3. Returned cart without checkoutUrl or without items is rejected and clears any previously prepared link', async () => {
    const cachedCart = makeCart();
    const controller = createCheckoutPreparationController({
      initialIsOpen: true,
      initialCart: cachedCart,
    });

    // First prepare cleanly in embedded mode so a verified link exists
    const freshValid = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/fresh-1',
    });
    const first = await controller.prepareCheckout({
      cart: cachedCart,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: true,
      refreshCart: async () => freshValid,
      navigate: () => {},
    });
    assert.equal(first.outcome, 'prepared_embedded');
    assert.equal(controller.getState().verifiedCheckoutUrl, 'https://sx71id-uy.myshopify.com/cart/c/fresh-1');

    // Sync parent commit of freshValid
    controller.syncContext({ isOpen: true, cart: freshValid, isMutationPending: false });
    assert.equal(controller.getState().verifiedCheckoutUrl, 'https://sx71id-uy.myshopify.com/cart/c/fresh-1');

    // Subsequent re-check returns cart missing checkoutUrl -> must clear link and show error
    const navigatedUrls: string[] = [];
    const missingUrlOutcome = await controller.prepareCheckout({
      cart: freshValid,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: true,
      refreshCart: async () => makeCart({ checkoutUrl: '   ' }),
      navigate: (url) => navigatedUrls.push(url),
    });

    assert.equal(missingUrlOutcome.outcome, 'invalid');
    if (missingUrlOutcome.outcome === 'invalid') {
      assert.equal(missingUrlOutcome.reason, 'missing_checkout_url');
    }
    assert.deepEqual(navigatedUrls, []);
    assert.equal(controller.getState().verifiedCheckoutUrl, null);
    assert.equal(controller.getState().error, CHECKOUT_PREP_MESSAGES.missingCheckoutUrl);

    // Subsequent attempt returns cart without items -> must reject and preserve error even when cart updates to empty
    const emptyFreshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/empty-but-has-url',
      lines: [],
      totalQuantity: 0,
    });
    const emptyOutcome = await controller.prepareCheckout({
      cart: freshValid,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: false,
      refreshCart: async () => emptyFreshCart,
      navigate: (url) => navigatedUrls.push(url),
    });

    assert.equal(emptyOutcome.outcome, 'invalid');
    if (emptyOutcome.outcome === 'invalid') {
      assert.equal(emptyOutcome.reason, 'empty_cart');
    }
    assert.deepEqual(navigatedUrls, []);
    assert.equal(controller.getState().verifiedCheckoutUrl, null);
    assert.equal(controller.getState().error, CHECKOUT_PREP_MESSAGES.emptyCart);

    // If App.tsx commits the empty fresh cart, controller retains the retry error (and still no link)
    controller.syncContext({ isOpen: true, cart: emptyFreshCart, isMutationPending: false });
    assert.equal(controller.getState().verifiedCheckoutUrl, null);
    assert.equal(controller.getState().error, CHECKOUT_PREP_MESSAGES.emptyCart);

    // Also validate totalQuantity: 0 with non-empty lines array fails validation
    const zeroQtyCheck = validateCartForCheckout(makeCart({ totalQuantity: 0 }));
    assert.equal(zeroQtyCheck.valid, false);
  });

  it('4. Successful standalone navigation and embedded preview link use ONLY the fresh checkoutUrl', async () => {
    const cachedCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/stale-cached-url',
    });
    const freshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/fresh-authoritative-url',
    });

    // Standalone
    const standaloneCtrl = createCheckoutPreparationController({
      initialIsOpen: true,
      initialCart: cachedCart,
    });
    const navigatedUrls: string[] = [];
    const standaloneRes = await standaloneCtrl.prepareCheckout({
      cart: cachedCart,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: false,
      refreshCart: async () => freshCart,
      navigate: (url) => navigatedUrls.push(url),
    });
    assert.equal(standaloneRes.outcome, 'navigated_standalone');
    assert.deepEqual(navigatedUrls, ['https://sx71id-uy.myshopify.com/cart/c/fresh-authoritative-url']);
    assert.equal(standaloneCtrl.getState().verifiedCheckoutUrl, null);

    // Embedded preview
    const embeddedCtrl = createCheckoutPreparationController({
      initialIsOpen: true,
      initialCart: cachedCart,
    });
    const embeddedNav: string[] = [];
    const embeddedRes = await embeddedCtrl.prepareCheckout({
      cart: cachedCart,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: true,
      refreshCart: async () => freshCart,
      navigate: (url) => embeddedNav.push(url),
    });
    assert.equal(embeddedRes.outcome, 'prepared_embedded');
    assert.deepEqual(embeddedNav, [], 'Embedded preview must not navigate top frame');
    assert.equal(
      embeddedCtrl.getState().verifiedCheckoutUrl,
      'https://sx71id-uy.myshopify.com/cart/c/fresh-authoritative-url'
    );
  });

  it('5. Duplicate checkout-preparation clicks are prevented while a refresh request is in flight', async () => {
    const cachedCart = makeCart();
    const freshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/fresh-once',
    });
    const controller = createCheckoutPreparationController({
      initialIsOpen: true,
      initialCart: cachedCart,
    });

    const deferred = createDeferred<ShopifyCart | null>();
    let fetchCalls = 0;

    const firstPromise = controller.prepareCheckout({
      cart: cachedCart,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: true,
      refreshCart: async () => {
        fetchCalls += 1;
        return deferred.promise;
      },
      navigate: () => {},
    });

    assert.equal(controller.getState().isPreparing, true);
    assert.equal(controller.canEditCart(), false, 'Cart edits must be blocked while checkout prep is in flight');

    const duplicateOutcome = await controller.prepareCheckout({
      cart: cachedCart,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: true,
      refreshCart: async () => {
        fetchCalls += 1;
        return freshCart;
      },
      navigate: () => {},
    });

    assert.equal(duplicateOutcome.outcome, 'duplicate');
    assert.equal(fetchCalls, 1, 'Duplicate click must not trigger a second refresh request');

    deferred.resolve(freshCart);
    const firstOutcome = await firstPromise;
    assert.equal(firstOutcome.outcome, 'prepared_embedded');
    assert.equal(controller.getState().verifiedCheckoutUrl, freshCart.checkoutUrl);
    assert.equal(controller.canEditCart(), true);
  });

  it('6. Late responses are ignored when bag closes, component unmounts, or cart changes mid-flight (never overwriting newer cart)', async () => {
    const initialCart = makeCart();
    const freshStaleCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/late-stale-url',
    });

    // A) Bag closes while request is in flight
    {
      const ctrl = createCheckoutPreparationController({
        initialIsOpen: true,
        initialCart: initialCart,
      });
      const deferred = createDeferred<ShopifyCart | null>();
      const navCalls: string[] = [];

      const pending = ctrl.prepareCheckout({
        cart: initialCart,
        isOpen: true,
        isMutationPending: false,
        isEmbedded: false,
        refreshCart: () => deferred.promise,
        navigate: (url) => navCalls.push(url),
      });

      ctrl.syncContext({ isOpen: false, cart: initialCart, isMutationPending: false });
      assert.equal(ctrl.getState().isPreparing, false);

      deferred.resolve(freshStaleCart);
      const outcome = await pending;
      assert.ok(outcome.outcome === 'ignored_closed' || outcome.outcome === 'ignored_stale');
      assert.deepEqual(navCalls, []);
      assert.equal(ctrl.getState().verifiedCheckoutUrl, null);
      assert.equal(ctrl.getState().error, null);
    }

    // B) Component unmounts while request is in flight
    {
      const ctrl = createCheckoutPreparationController({
        initialIsOpen: true,
        initialCart: initialCart,
      });
      const deferred = createDeferred<ShopifyCart | null>();
      const navCalls: string[] = [];

      const pending = ctrl.prepareCheckout({
        cart: initialCart,
        isOpen: true,
        isMutationPending: false,
        isEmbedded: true,
        refreshCart: () => deferred.promise,
        navigate: (url) => navCalls.push(url),
      });

      ctrl.unmount();
      deferred.resolve(freshStaleCart);
      const outcome = await pending;
      assert.equal(outcome.outcome, 'ignored_unmounted');
      assert.deepEqual(navCalls, []);
      assert.equal(ctrl.getState().verifiedCheckoutUrl, null);
    }

    // C) Cart changes during in-flight request (e.g. variant/discount/cost updated) AND App epoch check prevents stale commit
    {
      const ctrl = createCheckoutPreparationController({
        initialIsOpen: true,
        initialCart: initialCart,
      });
      const deferred = createDeferred<ShopifyCart | null>();
      const navCalls: string[] = [];

      const pending = ctrl.prepareCheckout({
        cart: initialCart,
        isOpen: true,
        isMutationPending: false,
        isEmbedded: true,
        refreshCart: () => deferred.promise,
        navigate: (url) => navCalls.push(url),
      });

      const updatedCart = makeCart({
        discountCodes: [{ code: 'VIP10', applicable: true }],
        cost: {
          subtotalAmount: { amount: '90.00', currencyCode: 'USD' },
          totalAmount: { amount: '81.00', currencyCode: 'USD' },
        },
      });
      ctrl.syncContext({ isOpen: true, cart: updatedCart, isMutationPending: false });
      assert.equal(ctrl.getState().isPreparing, false);

      deferred.resolve(freshStaleCart);
      const outcome = await pending;
      assert.ok(outcome.outcome === 'ignored_stale' || outcome.outcome === 'ignored_cart_changed');
      assert.deepEqual(navCalls, []);
      assert.equal(ctrl.getState().verifiedCheckoutUrl, null);
      assert.equal(ctrl.getState().error, null);

      // App.tsx revalidateExistingCartForCheckout stale epoch guard
      let epoch = 1;
      const startEpoch = epoch;
      let committed: ShopifyCart | null = null;
      const appDeferred = createDeferred<ShopifyCart | null>();
      const appPending = revalidateExistingCartForCheckout({
        cartId: initialCart.id,
        fetchCart: () => appDeferred.promise,
        isStillCurrent: () => epoch === startEpoch,
        onCommitCart: (c) => {
          committed = c;
        },
      });
      // Mutation occurs while refresh is in flight
      epoch += 1;
      appDeferred.resolve(freshStaleCart);
      const appResult = await appPending;
      assert.equal(appResult.status, 'stale');
      assert.equal(appResult.cart, null);
      assert.equal(committed, null, 'Stale refresh must never overwrite newer cart state');
    }
  });

  it('7. Comprehensive cart fingerprint invalidates prepared link on any line, variant, discount, cost/currency, or URL change', async () => {
    const baseCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/prepared-base',
    });

    const variantsToInvalidate: Array<{ label: string; mutated: ShopifyCart }> = [
      {
        label: 'cart id change',
        mutated: makeCart({ id: 'gid://shopify/Cart/cart-2', checkoutUrl: baseCart.checkoutUrl }),
      },
      {
        label: 'checkoutUrl change',
        mutated: makeCart({ checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/other-url' }),
      },
      {
        label: 'totalQuantity change',
        mutated: makeCart({ totalQuantity: 3, checkoutUrl: baseCart.checkoutUrl }),
      },
      {
        label: 'line merchandise variant change (same qty and count)',
        mutated: {
          ...baseCart,
          lines: [
            {
              ...baseCart.lines[0],
              merchandise: {
                ...baseCart.lines[0].merchandise,
                id: 'gid://shopify/ProductVariant/var-2',
              },
            },
          ],
        },
      },
      {
        label: 'line id change',
        mutated: {
          ...baseCart,
          lines: [{ ...baseCart.lines[0], id: 'gid://shopify/CartLine/line-99' }],
        },
      },
      {
        label: 'line cost change',
        mutated: {
          ...baseCart,
          lines: [
            {
              ...baseCart.lines[0],
              cost: {
                ...baseCart.lines[0].cost,
                totalAmount: { amount: '80.00', currencyCode: 'USD' },
              },
            },
          ],
        },
      },
      {
        label: 'discountCodes added',
        mutated: makeCart({
          checkoutUrl: baseCart.checkoutUrl,
          discountCodes: [{ code: 'DROP10', applicable: true }],
        }),
      },
      {
        label: 'discountCode applicability changed',
        mutated: makeCart({
          checkoutUrl: baseCart.checkoutUrl,
          discountCodes: [{ code: 'DROP10', applicable: false }],
        }),
      },
      {
        label: 'subtotal amount changed',
        mutated: makeCart({
          checkoutUrl: baseCart.checkoutUrl,
          cost: {
            subtotalAmount: { amount: '95.00', currencyCode: 'USD' },
            totalAmount: { amount: '90.00', currencyCode: 'USD' },
          },
        }),
      },
      {
        label: 'total currencyCode changed',
        mutated: makeCart({
          checkoutUrl: baseCart.checkoutUrl,
          cost: {
            subtotalAmount: { amount: '90.00', currencyCode: 'USD' },
            totalAmount: { amount: '1650.00', currencyCode: 'ZAR' },
          },
        }),
      },
    ];

    for (const { label, mutated } of variantsToInvalidate) {
      assert.notEqual(
        getCartCheckoutFingerprint(mutated),
        getCartCheckoutFingerprint(baseCart),
        `Fingerprint must change for: ${label}`
      );

      const ctrl = createCheckoutPreparationController({
        initialIsOpen: true,
        initialCart: baseCart,
      });
      await ctrl.prepareCheckout({
        cart: baseCart,
        isOpen: true,
        isMutationPending: false,
        isEmbedded: true,
        refreshCart: async () => baseCart,
        navigate: () => {},
      });
      assert.equal(ctrl.getState().verifiedCheckoutUrl, baseCart.checkoutUrl);

      ctrl.syncContext({ isOpen: true, cart: mutated, isMutationPending: false });
      assert.equal(
        ctrl.getState().verifiedCheckoutUrl,
        null,
        `Prepared checkout link must invalidate on: ${label}`
      );
    }
  });

  it('8. Pending cart mutation blocks checkout preparation, and mid-flight mutation cancels in-flight prep', async () => {
    const cart = makeCart();
    const ctrl = createCheckoutPreparationController({
      initialIsOpen: true,
      initialCart: cart,
      initialIsMutationPending: true,
    });
    let calls = 0;

    const blocked = await ctrl.prepareCheckout({
      cart,
      isOpen: true,
      isMutationPending: true,
      isEmbedded: true,
      refreshCart: async () => {
        calls += 1;
        return cart;
      },
      navigate: () => {},
    });
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(calls, 0);

    // Clear mutation pending, start prep, then start a mutation mid-flight
    ctrl.syncContext({ isOpen: true, cart, isMutationPending: false });
    const deferred = createDeferred<ShopifyCart | null>();
    const pending = ctrl.prepareCheckout({
      cart,
      isOpen: true,
      isMutationPending: false,
      isEmbedded: true,
      refreshCart: () => deferred.promise,
      navigate: () => {},
    });
    assert.equal(ctrl.canEditCart(), false);

    ctrl.syncContext({ isOpen: true, cart, isMutationPending: true });
    assert.equal(ctrl.getState().isPreparing, false);

    deferred.resolve(cart);
    const outcome = await pending;
    assert.ok(outcome.outcome === 'ignored_mutation' || outcome.outcome === 'ignored_stale');
    assert.equal(ctrl.getState().verifiedCheckoutUrl, null);
  });

  it('9. CartDrawer keeps hooks above early return, disables editing/checkout during mutations, and removes cached/replacement fallbacks', () => {
    const cart = makeCart();

    // Closed render must return empty string without hook errors
    const closedHtml = renderToStaticMarkup(
      React.createElement(CartDrawer, {
        isOpen: false,
        onClose: () => {},
        cart,
        isLoading: false,
        onUpdateQuantity: () => {},
        onRemoveItem: () => {},
        onApplyDiscount: async () => ({ success: false }),
        onBrowseProducts: () => {},
      })
    );
    assert.equal(closedHtml, '');

    // Open render while a cart mutation is pending (`isLoading: true`) must disable checkout, qty, remove, and promo submit
    const loadingHtml = renderToStaticMarkup(
      React.createElement(CartDrawer, {
        isOpen: true,
        onClose: () => {},
        cart,
        isLoading: true,
        onUpdateQuantity: () => {},
        onRemoveItem: () => {},
        onApplyDiscount: async () => ({ success: false }),
        onBrowseProducts: () => {},
      })
    );
    assert.match(loadingHtml, /<button[^>]*id="proceed-to-checkout-btn"[^>]*disabled=""/);
    assert.match(loadingHtml, /<button(?=[^>]*aria-label="Remove item")(?=[^>]*disabled="")[^>]*>/);
    assert.match(loadingHtml, /<input(?=[^>]*placeholder="Shopify discount code")(?=[^>]*disabled="")[^>]*>/);

    // Verify source files removed cached & silent-replacement fallbacks and keep hooks before early return
    const cartDrawerSource = fs.readFileSync(path.resolve('src/components/CartDrawer.tsx'), 'utf-8');
    assert.ok(!cartDrawerSource.includes('getOrCreateShopifyCart'), 'CartDrawer must not import or call getOrCreateShopifyCart');
    assert.ok(!cartDrawerSource.includes('freshCart || cart'), 'CartDrawer must not fall back to cached cart');

    const firstHookIdx = cartDrawerSource.indexOf('useState(');
    const earlyReturnIdx = cartDrawerSource.indexOf('\n  if (!isOpen) {');
    assert.ok(firstHookIdx !== -1 && earlyReturnIdx !== -1);
    assert.ok(cartDrawerSource.includes('controllerRef.current.markClosedImmediately();'));
    assert.ok(
      cartDrawerSource.lastIndexOf('useEffect(') < earlyReturnIdx,
      'All React hooks in CartDrawer must be placed before "if (!isOpen)" early return'
    );

    // App.tsx handleRevalidateCart must delegate to StoreCartCheckoutCoordinator (revalidateExistingCartForCheckout)
    // without getOrCreateShopifyCart or cached-cart fallback, while normal shopping preserves getOrCreateShopifyCart
    const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
    const prepSource = fs.readFileSync(path.resolve('src/lib/checkout-prep.ts'), 'utf-8');
    const revalidateSectionStart = appSource.indexOf('const handleRevalidateCart');
    const revalidateSectionEnd = appSource.indexOf('// Wishlist Actions', revalidateSectionStart);
    const revalidateBody = appSource.slice(revalidateSectionStart, revalidateSectionEnd);
    assert.ok(revalidateBody.includes('revalidateForCheckout'));
    assert.ok(!revalidateBody.includes('getOrCreateShopifyCart'), 'handleRevalidateCart must not silently create replacement cart');
    assert.ok(!revalidateBody.includes('return shopifyCart'), 'handleRevalidateCart must not return cached shopifyCart on failure');
    assert.ok(prepSource.includes('revalidateExistingCartForCheckout'));
    // Normal shopping still preserves getOrCreateShopifyCart
    assert.ok(appSource.includes('const loadCart = useCallback'));
    assert.ok(appSource.includes('getOrCreateCart: getOrCreateShopifyCart'));
  });
});

// ============================================================================
// Mounted React UI Integration Tests (CartDrawer + StoreCartCheckoutCoordinator)
// ============================================================================

interface MockDomListenerEntry {
  fn: (ev: any) => void;
  capture: boolean;
}

class MockNode {
  parentNode: MockNode | null = null;
  childNodes: MockNode[] = [];
  nodeType: number;
  listeners: Record<string, MockDomListenerEntry[]> = {};
  ownerDocument: MockDocument;

  constructor(nodeType: number, ownerDocument: MockDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
  }

  get parentElement(): MockElement | null {
    return this.parentNode instanceof MockElement ? this.parentNode : null;
  }

  get children(): MockElement[] {
    return this.childNodes.filter((c): c is MockElement => c instanceof MockElement);
  }

  get isConnected(): boolean {
    let cur: MockNode | null = this;
    while (cur) {
      if (cur === this.ownerDocument) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  get firstChild(): MockNode | null {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): MockNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]
      : null;
  }

  appendChild(child: MockNode): MockNode {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child: MockNode, ref: MockNode | null): MockNode {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    if (!ref) {
      this.childNodes.push(child);
      return child;
    }
    const idx = this.childNodes.indexOf(ref);
    if (idx === -1) {
      this.childNodes.push(child);
    } else {
      this.childNodes.splice(idx, 0, child);
    }
    return child;
  }

  removeChild(child: MockNode): MockNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      if (this.ownerDocument && child.contains(this.ownerDocument.activeElement)) {
        this.ownerDocument.activeElement = this.ownerDocument.body;
      }
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  contains(other: MockNode | null): boolean {
    let cur: MockNode | null = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  addEventListener(type: string, fn: (ev: any) => void, capture = false) {
    (this.listeners[type] ||= []).push({ fn, capture: Boolean(capture) });
  }

  removeEventListener(type: string, fn: (ev: any) => void, capture = false) {
    const arr = this.listeners[type];
    if (!arr) return;
    this.listeners[type] = arr.filter(
      (entry) => !(entry.fn === fn && entry.capture === Boolean(capture))
    );
  }
}

class MockTextNode extends MockNode {
  private _text: string;
  constructor(text: string, ownerDocument: MockDocument) {
    super(3, ownerDocument);
    this._text = String(text);
  }
  get nodeValue(): string {
    return this._text;
  }
  set nodeValue(val: string) {
    this._text = String(val ?? '');
  }
  get data(): string {
    return this._text;
  }
  set data(val: string) {
    this._text = String(val ?? '');
  }
  get textContent(): string {
    return this._text;
  }
  set textContent(val: string) {
    this._text = String(val ?? '');
  }
}

class MockElement extends MockNode {
  tagName: string;
  nodeName: string;
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  oninput: ((ev: any) => void) | null = null;
  private _disabled = false;
  private _inert = false;
  private _value = '';

  constructor(tagName: string, ownerDocument: MockDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    if (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA') {
      (this as any).selectionStart = 0;
      (this as any).selectionEnd = 0;
    }
  }

  get id(): string {
    return this.attributes.id || '';
  }
  set id(v: string) {
    this.attributes.id = v;
  }

  get href(): string {
    return this.attributes.href || '';
  }
  set href(v: string) {
    this.attributes.href = v;
  }

  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(v: boolean) {
    this._disabled = Boolean(v);
    if (this._disabled) {
      this.attributes.disabled = '';
    } else {
      delete this.attributes.disabled;
    }
  }

  get inert(): boolean {
    return this._inert || this.hasAttribute('inert');
  }
  set inert(v: boolean) {
    this._inert = Boolean(v);
    if (this._inert) {
      this.attributes.inert = '';
    } else {
      delete this.attributes.inert;
    }
  }

  get tabIndex(): number {
    if (this.hasAttribute('tabindex')) {
      const parsed = Number(this.attributes.tabindex);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (
      this.tagName === 'BUTTON' ||
      this.tagName === 'INPUT' ||
      this.tagName === 'SELECT' ||
      this.tagName === 'TEXTAREA' ||
      (this.tagName === 'A' && this.hasAttribute('href'))
    ) {
      return 0;
    }
    return -1;
  }
  set tabIndex(v: number) {
    this.setAttribute('tabindex', String(v));
  }

  get value(): string {
    return this._value;
  }
  set value(v: string) {
    this._value = String(v ?? '');
  }

  get className(): string {
    return this.attributes.class || '';
  }
  set className(v: string) {
    this.attributes.class = v;
  }

  get textContent(): string {
    return this.childNodes.map((c: any) => c.textContent ?? '').join('');
  }
  set textContent(v: string) {
    this.childNodes = v ? [new MockTextNode(v, this.ownerDocument)] : [];
  }

  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  setAttribute(name: string, val: unknown) {
    const strVal = String(val);
    this.attributes[name] = strVal;
    if (name === 'disabled') {
      this._disabled = true;
    } else if (name === 'inert') {
      this._inert = true;
    }
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
    if (name === 'disabled') {
      this._disabled = false;
    } else if (name === 'inert') {
      this._inert = false;
    }
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  closest(selector: string): MockElement | null {
    const parts = selector.split(',').map((s) => s.trim());
    let cur: MockElement | null = this;
    while (cur) {
      if (parts.some((p) => matchesSimpleSelector(cur!, p))) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const parts = selector.split(',').map((s) => s.trim());
    return findElements(this, (el) => parts.some((p) => matchesSimpleSelector(el, p)));
  }

  focus() {
    if (!this.isConnected) return;
    if (this.disabled || this.hasAttribute('disabled')) return;
    let cur: MockElement | null = this;
    while (cur) {
      if (
        cur.inert ||
        cur.hasAttribute('inert') ||
        cur.hasAttribute('hidden') ||
        cur.style.display === 'none' ||
        cur.style.visibility === 'hidden'
      ) {
        return;
      }
      cur = cur.parentElement;
    }
    const isFocusable =
      this.tagName === 'BUTTON' ||
      this.tagName === 'INPUT' ||
      this.tagName === 'SELECT' ||
      this.tagName === 'TEXTAREA' ||
      (this.tagName === 'A' && this.hasAttribute('href')) ||
      this.hasAttribute('tabindex');
    if (!isFocusable) return;
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement = this;
    this.dispatchEvent({ type: 'focusin', bubbles: true, cancelable: false });
    this.dispatchEvent({ type: 'focus', bubbles: false, cancelable: false });
  }

  dispatchEvent(ev: {
    type: string;
    key?: string;
    keyCode?: number;
    shiftKey?: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    isComposing?: boolean;
    target?: any;
    currentTarget?: any;
    bubbles?: boolean;
    cancelable?: boolean;
    defaultPrevented?: boolean;
    propagationStopped?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
    stopImmediatePropagation?: () => void;
  }): boolean {
    ev.target = ev.target || this;
    if (ev.bubbles === undefined) ev.bubbles = true;
    if (ev.cancelable === undefined) ev.cancelable = true;
    ev.defaultPrevented = false;
    ev.propagationStopped = false;
    ev.preventDefault = () => {
      if (ev.cancelable) ev.defaultPrevented = true;
    };
    ev.stopPropagation = () => {
      ev.propagationStopped = true;
    };
    ev.stopImmediatePropagation = () => {
      ev.propagationStopped = true;
    };

    const pathNodes: MockNode[] = [];
    let cur: MockNode | null = this;
    while (cur) {
      pathNodes.push(cur);
      cur = cur.parentNode;
    }
    if (pathNodes[pathNodes.length - 1] !== (this.ownerDocument as unknown as MockNode)) {
      pathNodes.push(this.ownerDocument as unknown as MockNode);
    }

    for (let i = pathNodes.length - 1; i >= 0; i--) {
      if (ev.propagationStopped) break;
      const node = pathNodes[i];
      const handlers = (node.listeners[ev.type] || []).filter((h) => h.capture);
      for (const h of handlers) {
        ev.currentTarget = node;
        h.fn(ev);
      }
    }

    for (let i = 0; i < pathNodes.length; i++) {
      if (ev.propagationStopped) break;
      if (i > 0 && !ev.bubbles) break;
      const node = pathNodes[i];
      const handlers = (node.listeners[ev.type] || []).filter((h) => !h.capture);
      for (const h of handlers) {
        ev.currentTarget = node;
        h.fn(ev);
      }
    }

    if (
      ev.bubbles &&
      !ev.propagationStopped &&
      this.ownerDocument?.defaultView &&
      typeof this.ownerDocument.defaultView.dispatchEvent === 'function'
    ) {
      this.ownerDocument.defaultView.dispatchEvent(ev);
    }

    return !ev.defaultPrevented;
  }
}

function matchesSimpleSelector(el: MockElement, selector: string): boolean {
  if (selector === 'a[href]') return el.tagName === 'A' && el.hasAttribute('href');
  if (selector === 'button') return el.tagName === 'BUTTON';
  if (selector === 'input') return el.tagName === 'INPUT';
  if (selector === 'select') return el.tagName === 'SELECT';
  if (selector === 'textarea') return el.tagName === 'TEXTAREA';
  if (selector === '[tabindex]') return el.hasAttribute('tabindex');
  if (selector === '[role="dialog"]') return el.getAttribute('role') === 'dialog';
  if (selector === '[role="alertdialog"]') return el.getAttribute('role') === 'alertdialog';
  if (selector === '[role="dialog"][aria-modal="true"]') {
    return el.getAttribute('role') === 'dialog' && el.getAttribute('aria-modal') === 'true';
  }
  return false;
}

class MockDocument extends MockNode {
  documentElement: MockElement;
  body: MockElement;
  defaultView: any = null;
  activeElement: MockElement;
  oninput: ((ev: any) => void) | null = null;

  constructor() {
    super(9, undefined as unknown as MockDocument);
    this.ownerDocument = this;
    this.documentElement = new MockElement('html', this);
    this.body = new MockElement('body', this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }

  createElement(tag: string) {
    return new MockElement(tag, this);
  }
  createElementNS(_ns: string, tag: string) {
    return new MockElement(tag, this);
  }
  createTextNode(text: string) {
    return new MockTextNode(text, this);
  }
  createComment(text: string) {
    return new MockTextNode(text, this);
  }
  querySelectorAll(selector: string): MockElement[] {
    return this.documentElement.querySelectorAll(selector);
  }
}

function findElements(root: MockNode, predicate: (el: MockElement) => boolean): MockElement[] {
  const results: MockElement[] = [];
  for (const child of root.childNodes) {
    if (child instanceof MockElement) {
      if (predicate(child)) results.push(child);
      results.push(...findElements(child, predicate));
    }
  }
  return results;
}

function getDocumentTabbableElements(doc: MockDocument): MockElement[] {
  return doc.body
    .querySelectorAll('a[href], button, input, select, textarea, [tabindex]')
    .filter((el) => {
      if (el.disabled || el.hasAttribute('disabled')) return false;
      if (el.tagName === 'INPUT' && el.getAttribute('type') === 'hidden') return false;
      if (el.tabIndex < 0) return false;
      let cur: MockElement | null = el;
      while (cur) {
        if (
          cur.inert ||
          cur.hasAttribute('inert') ||
          cur.hasAttribute('hidden') ||
          cur.style.display === 'none' ||
          cur.style.visibility === 'hidden'
        ) {
          return false;
        }
        cur = cur.parentElement;
      }
      return true;
    });
}

async function setupMountedUiTest(options: {
  initialCart: ShopifyCart;
  isEmbedded: boolean;
  initialOpen?: boolean;
  strictMode?: boolean;
  fetchCart: (cartId: string) => Promise<ShopifyCart | null>;
  addLines?: (
    cartId: string,
    lines: Array<{ merchandiseId: string; quantity: number }>
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  updateLine?: (
    cartId: string,
    lineId: string,
    quantity: number
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  removeLine?: (
    cartId: string,
    lineId: string
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  applyDiscount?: (
    cartId: string,
    discountCodes: string[]
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  onParentRender?: () => void;
  wrapRevalidate?: (
    run: (refreshToken?: number) => Promise<ShopifyCart | null>,
    refreshToken?: number
  ) => Promise<ShopifyCart | null>;
  renderBackground?: (controls: { openCart: () => void; closeCart: () => void }) => React.ReactNode;
  beforeInitialRender?: (doc: MockDocument, win: any) => void;
}) {
  const prevWindow = (globalThis as any).window;
  const prevDocument = (globalThis as any).document;
  const prevActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  const doc = new MockDocument();
  const rootEl = doc.createElement('div');
  doc.body.appendChild(rootEl);

  const navigatedUrls: string[] = [];
  const winListeners: Record<string, Array<(ev: any) => void>> = {};
  const win: any = {
    document: doc,
    HTMLIFrameElement: class {},
    __MOCK_EMBEDDED_PREVIEW__: options.isEmbedded,
    getSelection: () => ({
      anchorNode: null,
      anchorOffset: 0,
      focusNode: null,
      focusOffset: 0,
      rangeCount: 0,
      removeAllRanges: () => {},
    }),
    location: {
      _href: 'https://merch.sanelowmusiclabel.co.za/',
      get href() {
        return this._href;
      },
      set href(val: string) {
        this._href = val;
        navigatedUrls.push(val);
      },
    },
    addEventListener: (type: string, fn: (ev: any) => void) => {
      (winListeners[type] ||= []).push(fn);
    },
    removeEventListener: (type: string, fn: (ev: any) => void) => {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter((f) => f !== fn);
    },
    dispatchEvent: (ev: any) => {
      const list = winListeners[ev.type] || [];
      for (const fn of list) {
        if (ev.propagationStopped) break;
        fn(ev);
      }
    },
  };
  doc.defaultView = win;

  (globalThis as any).window = win;
  (globalThis as any).document = doc;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  options.beforeInitialRender?.(doc, win);

  const { createStoreCartCheckoutCoordinator } = await import('../src/lib/checkout-prep');
  const { createRoot } = await import('react-dom/client');

  const coordinator = createStoreCartCheckoutCoordinator({
    initialCart: options.initialCart,
    fetchCart: options.fetchCart,
    getOrCreateCart: async () => options.initialCart,
    addLines: options.addLines || (async () => ({ cart: null })),
    updateLine: options.updateLine || (async () => ({ cart: null })),
    removeLine: options.removeLine || (async () => ({ cart: null })),
    applyDiscount: options.applyDiscount || (async () => ({ cart: null })),
  });

  let setExternalCartProp: ((cart: ShopifyCart | null, token?: number | null) => void) | null =
    null;
  let setOpenState: ((open: boolean) => void) | null = null;
  let currentIsOpen = options.initialOpen ?? true;
  let externalCartOverride: { active: boolean; cart: ShopifyCart | null; token: number | null } = {
    active: false,
    cart: null,
    token: null,
  };

  function HarnessParent() {
    const [cartState, setCartState] = React.useState(() => coordinator.getState());
    const [isOpen, setIsOpen] = React.useState(options.initialOpen ?? true);
    const [overrideTick, setOverrideTick] = React.useState(0);
    currentIsOpen = isOpen;

    React.useEffect(() => {
      setCartState(coordinator.getState());
      const unsub = coordinator.subscribe((next) => setCartState({ ...next }));
      return unsub;
    }, []);

    setExternalCartProp = (cart, token = null) => {
      externalCartOverride = { active: true, cart, token };
      setOverrideTick((t) => t + 1);
    };
    setOpenState = setIsOpen;

    options.onParentRender?.();

    const activeCart = externalCartOverride.active ? externalCartOverride.cart : cartState.cart;
    const activeToken = externalCartOverride.active
      ? externalCartOverride.token
      : cartState.lastRefreshCommitToken;

    return React.createElement(
      React.Fragment,
      null,
      options.renderBackground?.({
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
      }),
      React.createElement(CartDrawer, {
        key: `drawer-${overrideTick >= 0 ? 'stable' : 'stable'}`,
        isOpen,
        onClose: () => setIsOpen(false),
        cart: activeCart,
        isLoading: cartState.isLoading,
        cartMutationEpoch: cartState.mutationEpoch,
        lastRefreshCommitToken: activeToken,
        getIsMutationPending: () => coordinator.isMutationPending(),
        onUpdateQuantity: (lineId, qty) => {
          void coordinator.updateQuantity(lineId, qty);
        },
        onRemoveItem: (lineId) => {
          void coordinator.removeItem(lineId);
        },
        onApplyDiscount: (code) => coordinator.applyDiscount(code),
        onBrowseProducts: () => setIsOpen(false),
        onRevalidateCart: (refreshToken) =>
          options.wrapRevalidate
            ? options.wrapRevalidate(
                (tok) => coordinator.revalidateForCheckout(tok),
                refreshToken
              )
            : coordinator.revalidateForCheckout(refreshToken),
      })
    );
  }

  const root = createRoot(rootEl as unknown as Element);
  const appElement = options.strictMode
    ? React.createElement(React.StrictMode, null, React.createElement(HarnessParent))
    : React.createElement(HarnessParent);

  await React.act(async () => {
    root.render(appElement);
  });

  const getById = (id: string) =>
    findElements(doc.body, (el) => el.id === id)[0] ?? null;

  const getByAriaLabel = (label: string) =>
    findElements(rootEl, (el) => el.getAttribute('aria-label') === label)[0] ?? null;

  const getButtonsByText = (text: string) =>
    findElements(
      rootEl,
      (el) => el.tagName === 'BUTTON' && el.textContent.trim() === text
    );

  const click = async (el: MockElement) => {
    let defaultPrevented = false;
    await React.act(async () => {
      el.focus();
      const notPrevented = el.dispatchEvent({
        type: 'click',
        bubbles: true,
        cancelable: true,
      });
      defaultPrevented = !notPrevented;
    });
    return { defaultPrevented };
  };

  const pressKey = async (
    key: string,
    opts?: {
      target?: MockElement;
      shiftKey?: boolean;
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      isComposing?: boolean;
    }
  ) => {
    let defaultPrevented = false;
    let propagationStopped = false;
    await React.act(async () => {
      const dispatchTarget = opts?.target || doc.activeElement || doc.body;
      const ev: any = {
        type: 'keydown',
        key,
        shiftKey: Boolean(opts?.shiftKey),
        altKey: Boolean(opts?.altKey),
        ctrlKey: Boolean(opts?.ctrlKey),
        metaKey: Boolean(opts?.metaKey),
        isComposing: Boolean(opts?.isComposing),
        bubbles: true,
        cancelable: true,
      };
      const notPrevented = dispatchTarget.dispatchEvent(ev);
      defaultPrevented = !notPrevented;
      propagationStopped = Boolean(ev.propagationStopped);

      // Simulate native browser Tab advancement when keydown was NOT prevented
      if (key === 'Tab' && !defaultPrevented) {
        const tabbables = getDocumentTabbableElements(doc);
        if (tabbables.length > 0) {
          const curIdx = tabbables.indexOf(doc.activeElement);
          if (opts?.shiftKey) {
            const prevIdx = curIdx <= 0 ? tabbables.length - 1 : curIdx - 1;
            tabbables[prevIdx].focus();
          } else {
            const nextIdx = curIdx === -1 || curIdx + 1 >= tabbables.length ? 0 : curIdx + 1;
            tabbables[nextIdx].focus();
          }
        }
      }
    });
    return { defaultPrevented, propagationStopped };
  };

  let isUnmounted = false;
  const unmount = async () => {
    if (isUnmounted) return;
    isUnmounted = true;
    await React.act(async () => {
      root.unmount();
    });
  };

  const cleanup = async () => {
    await unmount();
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
  };

  return {
    coordinator,
    doc,
    rootEl,
    navigatedUrls,
    win,
    isOpen: () => currentIsOpen,
    getById,
    getByAriaLabel,
    getButtonsByText,
    click,
    pressKey,
    unmount,
    setOpen: async (open: boolean) => {
      await React.act(async () => {
        setOpenState?.(open);
      });
    },
    setOpenWithoutFlush: (open: boolean) => {
      setOpenState?.(open);
    },
    setExternalCart: async (cart: ShopifyCart | null, token: number | null = null) => {
      await React.act(async () => {
        setExternalCartProp?.(cart, token);
      });
    },
    cleanup,
  };
}

describe('Real Mounted UI Checkout Coordination Regressions', () => {
  it('10. Accepts fresh cart committed to parent BEFORE preparation promise finishes (standalone + embedded)', async () => {
    const cachedCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/cached-before-commit',
    });
    const freshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/fresh-price-and-lines-updated',
      totalQuantity: 3,
      cost: {
        subtotalAmount: { amount: '135.00', currencyCode: 'USD' },
        totalAmount: { amount: '135.00', currencyCode: 'USD' },
      },
      lines: [
        {
          ...cachedCart.lines[0],
          quantity: 3,
          cost: {
            amountPerQuantity: { amount: '45.00', currencyCode: 'USD' },
            subtotalAmount: { amount: '135.00', currencyCode: 'USD' },
            totalAmount: { amount: '135.00', currencyCode: 'USD' },
          },
        },
      ],
    });

    for (const isEmbedded of [false, true]) {
      const fetchDeferred = createDeferred<ShopifyCart | null>();
      const releasePrepPromise = createDeferred<void>();
      let renderedWithFreshCartWhilePreparing = false;
      let harnessRef: Awaited<ReturnType<typeof setupMountedUiTest>> | null = null;

      const harness = await setupMountedUiTest({
        initialCart: cachedCart,
        isEmbedded,
        fetchCart: () => fetchDeferred.promise,
        wrapRevalidate: async (run, refreshToken) => {
          const result = await run(refreshToken);
          // Pause before returning from onRevalidateCart so parent React state + useEffect(syncContext)
          // deterministically commit freshCart BEFORE prepareCheckout's await finishes!
          await releasePrepPromise.promise;
          return result;
        },
        onParentRender: () => {
          if (harnessRef?.coordinator.getState().cart?.checkoutUrl === freshCart.checkoutUrl) {
            renderedWithFreshCartWhilePreparing = true;
          }
        },
      });
      harnessRef = harness;

      try {
        const proceedBtn = harness.getById('proceed-to-checkout-btn');
        assert.ok(proceedBtn, 'Proceed button must be mounted');

        // Start checkout prep by clicking real UI button
        await React.act(async () => {
          proceedBtn.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
        });

        // Resolve fetchCart so coordinator commits freshCart to parent, and flush React render + syncContext
        // BEFORE releasing prepareCheckout's awaited promise
        await React.act(async () => {
          fetchDeferred.resolve(freshCart);
          await Promise.resolve();
          await Promise.resolve();
        });

        assert.equal(
          renderedWithFreshCartWhilePreparing,
          true,
          'Parent must have committed and rendered freshCart before prepareCheckout promise finishes'
        );
        // Verify CartDrawer still shows verifying state (was NOT invalidated as an external cart change)
        const midFlightBtn = harness.getById('proceed-to-checkout-btn');
        assert.ok(
          midFlightBtn && midFlightBtn.textContent.includes('Verifying Bag with Shopify'),
          'Correlated parent commit mid-flight must NOT cancel checkout preparation'
        );

        // Now allow prepareCheckout's awaited promise to finish
        await React.act(async () => {
          releasePrepPromise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });

        if (isEmbedded) {
          const link = harness.getById('open-secure-checkout-btn');
          assert.ok(
            link,
            'Embedded checkout link must stay visible when parent commits matching freshCart before prep promise finishes'
          );
          assert.equal(link.href, freshCart.checkoutUrl);
          assert.deepEqual(harness.navigatedUrls, []);
          assert.ok(harness.rootEl.textContent.includes('$135.00 USD'));
        } else {
          assert.deepEqual(
            harness.navigatedUrls,
            [freshCart.checkoutUrl],
            'Standalone mode must navigate strictly to freshCart.checkoutUrl even after parent commit'
          );
        }
      } finally {
        await harness.cleanup();
      }
    }
  });

  it('11. Rejects genuinely unrelated cart changes/mutations during checkout preparation without weakening fingerprint checks', async () => {
    const initialCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/initial-url',
    });
    const addedCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/added-cart-url',
      totalQuantity: 3,
      cost: {
        subtotalAmount: { amount: '135.00', currencyCode: 'USD' },
        totalAmount: { amount: '135.00', currencyCode: 'USD' },
      },
    });
    const staleRefreshResult = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/stale-refresh-url',
    });

    // Subcase A: Coordinator mutation (addToCart) begins while fetchCart is in flight
    {
      const fetchDeferred = createDeferred<ShopifyCart | null>();
      const addDeferred = createDeferred<{ cart: ShopifyCart | null }>();
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: false,
        fetchCart: () => fetchDeferred.promise,
        addLines: () => addDeferred.promise,
      });

      try {
        const proceedBtn = harness.getById('proceed-to-checkout-btn')!;
        await React.act(async () => {
          proceedBtn.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
        });

        // Start an unrelated cart mutation via the real parent coordinator mid-flight
        let addPromise!: Promise<ShopifyCart | null>;
        await React.act(async () => {
          addPromise = harness.coordinator.addToCart({
            productTitle: 'Sanelow Graphic Tee',
            variantId: initialCart.lines[0].merchandise.id,
            variantTitle: 'L / Black',
            quantity: 1,
          });
        });

        // Resolve both: stale checkout refresh must NOT overwrite addedCart or navigate
        await React.act(async () => {
          addDeferred.resolve({ cart: addedCart });
          await addPromise;
          fetchDeferred.resolve(staleRefreshResult);
          await Promise.resolve();
          await Promise.resolve();
        });

        assert.deepEqual(harness.navigatedUrls, [], 'Late checkout refresh must not navigate after mutation');
        assert.equal(harness.coordinator.getState().cart?.checkoutUrl, addedCart.checkoutUrl);
        assert.equal(harness.getById('open-secure-checkout-btn'), null);
      } finally {
        await harness.cleanup();
      }
    }

    // Subcase B: Unrelated external cart prop change (without correlated refreshCommitToken) during embedded prep
    {
      const fetchDeferred = createDeferred<ShopifyCart | null>();
      const externalMutatedCart = makeCart({
        checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/external-mutated',
        discountCodes: [{ code: 'EXTERNAL', applicable: true }],
      });
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: true,
        fetchCart: () => fetchDeferred.promise,
      });

      try {
        const proceedBtn = harness.getById('proceed-to-checkout-btn')!;
        await React.act(async () => {
          proceedBtn.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
        });

        // External unrelated cart arrives without correlated refresh token
        await harness.setExternalCart(externalMutatedCart, null);

        await React.act(async () => {
          fetchDeferred.resolve(staleRefreshResult);
          await Promise.resolve();
          await Promise.resolve();
        });

        assert.equal(
          harness.getById('open-secure-checkout-btn'),
          null,
          'Unrelated external cart change mid-flight must invalidate stale embedded checkout link'
        );
      } finally {
        await harness.cleanup();
      }
    }
  });

  it('12. Mutation beginning after an embedded link is prepared immediately invalidates it and prevents following it while pending', async () => {
    const initialCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/cached-before-embed',
    });
    const freshEmbeddedCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/prepared-embedded-valid',
    });
    const updatedAfterQtyCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/updated-qty-3',
      totalQuantity: 3,
      cost: {
        subtotalAmount: { amount: '135.00', currencyCode: 'USD' },
        totalAmount: { amount: '135.00', currencyCode: 'USD' },
      },
    });

    // Subcase A: External coordinator mutation starts AFTER embedded link is prepared
    // Verify BOTH pre-render click prevention AND post-render immediate removal (even if mutation fails!)
    {
      const addDeferred = createDeferred<{ cart: ShopifyCart | null }>();
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: true,
        fetchCart: async () => freshEmbeddedCart,
        addLines: () => addDeferred.promise,
      });

      try {
        await harness.click(harness.getById('proceed-to-checkout-btn')!);
        const link = harness.getById('open-secure-checkout-btn');
        assert.ok(link, 'Prepared embedded link should be rendered');
        assert.equal(link.href, freshEmbeddedCart.checkoutUrl);

        // Start coordinator mutation WITHOUT flushing React yet, and attempt to follow the link immediately!
        let addPromise!: Promise<ShopifyCart | null>;
        let clickPreventedBeforeRender = false;
        await React.act(async () => {
          addPromise = harness.coordinator.addToCart({
            productTitle: 'Sanelow Graphic Tee',
            variantId: initialCart.lines[0].merchandise.id,
            variantTitle: 'L / Black',
            quantity: 1,
          });
          // Simulate user clicking the already-rendered <a> before React commits the loading state
          const notPrevented = link.dispatchEvent({
            type: 'click',
            bubbles: true,
            cancelable: true,
          });
          clickPreventedBeforeRender = !notPrevented;
        });

        assert.equal(
          clickPreventedBeforeRender,
          true,
          'Clicking prepared checkout link while a mutation is pending must call preventDefault()'
        );
        assert.equal(
          harness.getById('open-secure-checkout-btn'),
          null,
          'Prepared link must be immediately removed once mutation state renders'
        );

        // Even if the mutation rejects/fails (so cart contents stay identical), prepared link must stay invalidated
        await React.act(async () => {
          addDeferred.reject(new Error('Network error'));
          await addPromise;
        });
        assert.equal(
          harness.getById('open-secure-checkout-btn'),
          null,
          'Prepared link must remain invalidated after failed mutation due to mutationEpoch advance'
        );
      } finally {
        await harness.cleanup();
      }
    }

    // Subcase B: Quantity '+' mutation clicked inside CartDrawer after embedded link is prepared
    {
      const updateDeferred = createDeferred<{ cart: ShopifyCart | null }>();
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: true,
        fetchCart: async () => freshEmbeddedCart,
        updateLine: () => updateDeferred.promise,
      });

      try {
        await harness.click(harness.getById('proceed-to-checkout-btn')!);
        assert.ok(harness.getById('open-secure-checkout-btn'));

        const plusBtn = harness.getButtonsByText('+')[0];
        assert.ok(plusBtn, 'Quantity + button must exist');
        await harness.click(plusBtn);

        assert.equal(
          harness.getById('open-secure-checkout-btn'),
          null,
          'Prepared link must disappear immediately when quantity mutation begins'
        );

        await React.act(async () => {
          updateDeferred.resolve({ cart: updatedAfterQtyCart });
          await Promise.resolve();
        });
        assert.equal(harness.getById('open-secure-checkout-btn'), null);
      } finally {
        await harness.cleanup();
      }
    }
  });

  it('13. Closing the bag invalidates an in-flight checkout attempt immediately without waiting for a later effect', async () => {
    const initialCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/cached-close-test',
    });
    const lateFreshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/late-should-never-navigate',
    });

    // Subcase A: User clicks #close-cart-drawer-btn while refresh is in flight
    {
      const fetchDeferred = createDeferred<ShopifyCart | null>();
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: false,
        fetchCart: () => fetchDeferred.promise,
      });

      try {
        await React.act(async () => {
          harness.getById('proceed-to-checkout-btn')!.dispatchEvent({
            type: 'click',
            bubbles: true,
            cancelable: true,
          });
        });

        await React.act(async () => {
          harness.getById('close-cart-drawer-btn')!.dispatchEvent({
            type: 'click',
            bubbles: true,
            cancelable: true,
          });
          // Resolve immediately in the same close flow before post-close effects
          fetchDeferred.resolve(lateFreshCart);
          await Promise.resolve();
          await Promise.resolve();
        });

        assert.deepEqual(
          harness.navigatedUrls,
          [],
          'Closing drawer via close button must immediately block late navigation'
        );
      } finally {
        await harness.cleanup();
      }
    }

    // Subcase B: Parent closes CartDrawer via isOpen=false during render, and fetchCart resolves
    // right after render BEFORE effects run (and rapid reopen must not stick in loading state)
    {
      const fetchDeferred = createDeferred<ShopifyCart | null>();
      let resolveDuringClosedRender = false;
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: false,
        fetchCart: () => fetchDeferred.promise,
        onParentRender: () => {
          if (resolveDuringClosedRender) {
            resolveDuringClosedRender = false;
            // Resolves synchronously after CartDrawer(!isOpen) executes markClosedImmediately(),
            // BEFORE any useEffect runs!
            queueMicrotask(() => {
              fetchDeferred.resolve(lateFreshCart);
            });
          }
        },
      });

      try {
        await React.act(async () => {
          harness.getById('proceed-to-checkout-btn')!.dispatchEvent({
            type: 'click',
            bubbles: true,
            cancelable: true,
          });
        });

        resolveDuringClosedRender = true;
        await harness.setOpen(false);
        await new Promise((r) => setTimeout(r, 0));

        assert.deepEqual(
          harness.navigatedUrls,
          [],
          'Closing drawer via isOpen=false render must invalidate attempt before useEffect runs'
        );

        // Reopening must show a clean ready button, not a stuck preparing spinner
        await harness.setOpen(true);
        const proceedBtn = harness.getById('proceed-to-checkout-btn');
        assert.ok(proceedBtn);
        assert.ok(!proceedBtn.textContent.includes('Verifying Bag with Shopify'));
      } finally {
        await harness.cleanup();
      }
    }
  });
});

describe('Mounted UI CartDrawer Keyboard & Dialog Accessibility', () => {
  it('14. Provides modal dialog semantics tied to visible heading, isolates background, moves initial focus, and traps Tab / Shift+Tab inside drawer', async () => {
    const cart = makeCart();
    const harness = await setupMountedUiTest({
      initialCart: cart,
      isEmbedded: false,
      fetchCart: async () => cart,
      renderBackground: () =>
        React.createElement(
          'main',
          { id: 'bg-main-content' },
          React.createElement('button', { id: 'bg-shop-btn', type: 'button' }, 'Shop Merch'),
          React.createElement('a', { id: 'bg-footer-link', href: '/faq' }, 'FAQ')
        ),
    });

    try {
      const dialog = harness.getById('cart-drawer-container');
      const heading = harness.getById('cart-drawer-heading');
      const closeBtn = harness.getById('close-cart-drawer-btn');
      const bgMain = harness.getById('bg-main-content');
      const bgBtn = harness.getById('bg-shop-btn');

      assert.ok(dialog && heading && closeBtn && bgMain && bgBtn);
      assert.equal(dialog.getAttribute('role'), 'dialog');
      assert.equal(dialog.getAttribute('aria-modal'), 'true');
      assert.equal(dialog.getAttribute('aria-labelledby'), heading.id);
      assert.equal(heading.textContent.trim(), 'Merch Bag (2)');

      // Initial focus moves into the drawer onto the close button
      assert.ok(
        harness.doc.activeElement === closeBtn,
        `Expected initial focus on closeBtn, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );

      // Background content is isolated from keyboard & screen readers
      assert.equal(bgMain.hasAttribute('inert'), true);
      assert.equal(bgMain.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // Forward Tab cycles through drawer controls and wraps from last control back to closeBtn
      const seenIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        await harness.pressKey('Tab');
        assert.ok(
          dialog.contains(harness.doc.activeElement),
          'Forward Tab must keep focus strictly inside CartDrawer'
        );
        assert.ok(harness.doc.activeElement !== bgBtn, 'Focus must not land on background button');
        seenIds.push(harness.doc.activeElement.id || harness.doc.activeElement.textContent.trim());
      }
      // Last control is proceed-to-checkout-btn -> next Tab wraps to closeBtn
      assert.equal(harness.doc.activeElement.id, 'proceed-to-checkout-btn');
      const wrapForward = await harness.pressKey('Tab');
      assert.equal(wrapForward.defaultPrevented, true);
      assert.ok(
        harness.doc.activeElement === closeBtn,
        `Expected forward Tab wrap to closeBtn, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );

      // Reverse Shift+Tab from closeBtn wraps to last focusable control (#proceed-to-checkout-btn)
      const wrapReverse = await harness.pressKey('Tab', { shiftKey: true });
      assert.equal(wrapReverse.defaultPrevented, true);
      assert.equal(harness.doc.activeElement.id, 'proceed-to-checkout-btn');

      // Programmatic focus attempting to land on background while open is redirected back inside drawer
      bgMain.inert = false;
      bgMain.removeAttribute('inert');
      bgBtn.focus();
      assert.ok(
        dialog.contains(harness.doc.activeElement),
        'Focusin guard must keep stray background focus inside open drawer'
      );
    } finally {
      await harness.cleanup();
    }
  });

  it('15. Escape closes bag via shared close handler and synchronously invalidates checkout (never navigates or restores link on late response)', async () => {
    const initialCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/cached-esc',
    });
    const freshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/fresh-after-esc-must-not-run',
    });

    // Subcase A: Standalone & Embedded in-flight checkout invalidated immediately on Escape
    for (const isEmbedded of [false, true]) {
      const fetchDeferred = createDeferred<ShopifyCart | null>();
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded,
        fetchCart: () => fetchDeferred.promise,
      });

      try {
        await React.act(async () => {
          harness.getById('proceed-to-checkout-btn')!.dispatchEvent({
            type: 'click',
            bubbles: true,
            cancelable: true,
          });
        });

        // Close via Escape while refresh is in flight
        const escResult = await harness.pressKey('Escape');
        assert.equal(escResult.defaultPrevented, true);
        assert.equal(harness.isOpen(), false);
        assert.equal(harness.getById('cart-drawer-container'), null);

        // Late checkout response arrives after Escape
        await React.act(async () => {
          fetchDeferred.resolve(freshCart);
          await Promise.resolve();
          await Promise.resolve();
        });

        assert.deepEqual(
          harness.navigatedUrls,
          [],
          'Checkout response arriving after Escape must never navigate'
        );

        // Reopening must not surface a stale prepared link
        await harness.setOpen(true);
        assert.equal(
          harness.getById('open-secure-checkout-btn'),
          null,
          'Reopening after Escape-invalidated checkout must not restore a prepared link'
        );
      } finally {
        await harness.cleanup();
      }
    }

    // Subcase B: Escape after an embedded checkout link was already prepared clears it
    {
      const harness = await setupMountedUiTest({
        initialCart,
        isEmbedded: true,
        fetchCart: async () => freshCart,
      });

      try {
        await harness.click(harness.getById('proceed-to-checkout-btn')!);
        assert.ok(harness.getById('open-secure-checkout-btn'));

        await harness.pressKey('Escape');
        assert.equal(harness.isOpen(), false);

        await harness.setOpen(true);
        assert.equal(
          harness.getById('open-secure-checkout-btn'),
          null,
          'Prepared link must be cleared when closed via Escape'
        );
      } finally {
        await harness.cleanup();
      }
    }
  });

  it('16. Scopes Escape to active CartDrawer so it does not close unrelated overlays, leak to underlying window listeners, or interfere with form controls', async () => {
    const cart = makeCart();
    let windowEscapeCount = 0;

    const harness = await setupMountedUiTest({
      initialCart: cart,
      isEmbedded: false,
      fetchCart: async () => cart,
      beforeInitialRender: (_doc, win) => {
        win.addEventListener('keydown', (e: any) => {
          if (e.key === 'Escape') windowEscapeCount += 1;
        });
      },
      renderBackground: () =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement('input', { id: 'external-search-input', type: 'text' }),
          React.createElement(
            'div',
            { id: 'unrelated-modal', role: 'dialog', 'aria-modal': 'true' },
            React.createElement('input', { id: 'unrelated-modal-input', type: 'text' })
          )
        ),
    });

    try {
      // Because #unrelated-modal has role="dialog" & aria-modal="true", let's verify active focus inside it prevents CartDrawer from stealing Escape
      const unrelatedInput = harness.getById('unrelated-modal-input')!;
      await React.act(async () => {
        unrelatedInput.focus();
      });
      await harness.pressKey('Escape', { target: unrelatedInput });
      assert.equal(
        harness.isOpen(),
        true,
        'Escape dispatched inside an unrelated modal dialog must not close CartDrawer'
      );

      // Move focus back into CartDrawer's promo input
      const promoInput = harness.doc.body
        .querySelectorAll('input')
        .find((i) => i.getAttribute('placeholder') === 'Shopify discount code')!;
      assert.ok(promoInput);

      // Remove unrelated modal so CartDrawer is topmost active modal
      const unrelatedModal = harness.getById('unrelated-modal')!;
      unrelatedModal.parentNode!.removeChild(unrelatedModal);

      // Escape during IME composition (isComposing: true) must NOT close CartDrawer
      await React.act(async () => {
        promoInput.focus();
      });
      await harness.pressKey('Escape', { target: promoInput, isComposing: true });
      assert.equal(
        harness.isOpen(),
        true,
        'Escape during IME composition on form input must not close CartDrawer'
      );

      // Escape on an external non-modal form input must NOT close CartDrawer
      const externalInput = harness.getById('external-search-input')!;
      await harness.pressKey('Escape', { target: externalInput });
      assert.equal(
        harness.isOpen(),
        true,
        'Escape targeted at a non-drawer form control must not close CartDrawer'
      );

      // Escape on an aria-expanded="true" control inside CartDrawer must NOT close CartDrawer
      promoInput.setAttribute('aria-expanded', 'true');
      await harness.pressKey('Escape', { target: promoInput });
      assert.equal(
        harness.isOpen(),
        true,
        'Escape on an expanded popup/combobox control must not close CartDrawer'
      );
      promoInput.removeAttribute('aria-expanded');

      // Normal Escape inside CartDrawer closes CartDrawer and stops propagation from reaching window listeners
      const escapesBeforeClose = windowEscapeCount;
      await harness.pressKey('Escape', { target: promoInput });
      assert.equal(harness.isOpen(), false);
      assert.equal(
        windowEscapeCount,
        escapesBeforeClose,
        'Handled Escape inside CartDrawer must stopPropagation so underlying window overlays do not also react'
      );
    } finally {
      await harness.cleanup();
    }
  });

  it('17. Restores focus to opener button on close when connected & usable, and skips disconnected/disabled openers', async () => {
    const cart = makeCart();
    const harness = await setupMountedUiTest({
      initialCart: cart,
      isEmbedded: false,
      initialOpen: false,
      fetchCart: async () => cart,
      renderBackground: ({ openCart }) =>
        React.createElement(
          'header',
          { id: 'app-header' },
          React.createElement(
            'button',
            { id: 'open-cart-trigger', type: 'button', onClick: openCart },
            'Open Bag'
          )
        ),
    });

    try {
      const opener = harness.getById('open-cart-trigger')!;
      const header = harness.getById('app-header')!;

      // Open via keyboard/click from focused opener
      await harness.click(opener);
      assert.equal(harness.isOpen(), true);
      assert.ok(
        harness.doc.activeElement === harness.getById('close-cart-drawer-btn'),
        `Expected focus on close button, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );
      assert.equal(header.hasAttribute('inert'), true);

      // Close via Escape -> background inert removed first, then focus returns to opener
      await harness.pressKey('Escape');
      assert.equal(harness.isOpen(), false);
      assert.equal(header.hasAttribute('inert'), false);
      assert.ok(
        harness.doc.activeElement === opener,
        `Expected focus restored to opener after Escape, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );

      // Open again, then click '×' -> focus also returns to opener
      await harness.click(opener);
      await harness.click(harness.getById('close-cart-drawer-btn')!);
      assert.ok(
        harness.doc.activeElement === opener,
        `Expected focus restored to opener after close click, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );

      // Open again, then mark opener disabled before closing -> focus must NOT return to disabled opener
      await harness.click(opener);
      opener.disabled = true;
      await harness.pressKey('Escape');
      assert.equal(harness.isOpen(), false);
      assert.ok(harness.doc.activeElement !== opener, 'Must not restore focus to disabled opener');

      // Re-enable, open again, then disconnect opener before closing -> must not focus disconnected node
      opener.disabled = false;
      await harness.click(opener);
      opener.parentNode!.removeChild(opener);
      await harness.pressKey('Escape');
      assert.equal(harness.isOpen(), false);
      assert.ok(harness.doc.activeElement !== opener, 'Must not restore focus to disconnected opener');
    } finally {
      await harness.cleanup();
    }
  });

  it('18. Cleans up listeners and background restrictions on close/unmount while preserving restrictions owned by other overlays', async () => {
    const cart = makeCart();
    const harness = await setupMountedUiTest({
      initialCart: cart,
      isEmbedded: false,
      initialOpen: false,
      fetchCart: async () => cart,
      beforeInitialRender: (doc) => {
        doc.body.style.overflow = 'hidden';
      },
      renderBackground: () =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement('main', { id: 'normal-bg' }, 'Main Store'),
          React.createElement(
            'aside',
            { id: 'pre-hidden-overlay-bg', 'aria-hidden': 'true' },
            'Already Hidden'
          ),
          React.createElement(
            'section',
            { id: 'explicit-visible-bg', 'aria-hidden': 'false' },
            'Explicit Visible'
          )
        ),
    });

    try {
      const normalBg = harness.getById('normal-bg')!;
      const preHiddenBg = harness.getById('pre-hidden-overlay-bg')!;
      const explicitVisibleBg = harness.getById('explicit-visible-bg')!;

      // Mark pre-hidden element as inert prior to opening CartDrawer (e.g. owned by another overlay)
      preHiddenBg.inert = true;
      preHiddenBg.setAttribute('inert', '');

      // Open CartDrawer -> normalBg and explicitVisibleBg become restricted; pre-hidden keeps its state
      await harness.setOpen(true);
      assert.equal(normalBg.hasAttribute('inert'), true);
      assert.equal(normalBg.getAttribute('aria-hidden'), 'true');
      assert.equal(explicitVisibleBg.getAttribute('aria-hidden'), 'true');
      assert.equal((harness.doc.listeners.keydown || []).length, 1);
      assert.equal((harness.doc.listeners.focusin || []).length, 1);

      // Close CartDrawer -> normalBg restored, explicitVisibleBg restores 'false', pre-hidden & body overflow preserved!
      await harness.setOpen(false);
      assert.equal(normalBg.hasAttribute('inert'), false);
      assert.equal(normalBg.getAttribute('aria-hidden'), null);
      assert.equal(explicitVisibleBg.getAttribute('aria-hidden'), 'false');
      assert.equal(preHiddenBg.hasAttribute('inert'), true);
      assert.equal(preHiddenBg.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');
      assert.equal((harness.doc.listeners.keydown || []).length, 0);
      assert.equal((harness.doc.listeners.focusin || []).length, 0);

      // Now test body overflow 'clip' preservation and cleanup on direct UNMOUNT while open
      harness.doc.body.style.overflow = 'clip';
      await harness.setOpen(true);
      assert.equal(harness.doc.body.style.overflow, 'hidden');
      assert.equal(normalBg.hasAttribute('inert'), true);

      await harness.unmount();
      assert.equal(harness.doc.body.style.overflow, 'clip');
      assert.equal(normalBg.hasAttribute('inert'), false);
      assert.equal(normalBg.getAttribute('aria-hidden'), null);
      assert.equal(preHiddenBg.hasAttribute('inert'), true);
      assert.equal(preHiddenBg.getAttribute('aria-hidden'), 'true');
      assert.equal((harness.doc.listeners.keydown || []).length, 0);
      assert.equal((harness.doc.listeners.focusin || []).length, 0);
    } finally {
      await harness.cleanup();
    }
  });

  it('19. Works cleanly under React.StrictMode double setup/cleanup without duplicating listeners or losing focus/restoration', async () => {
    const initialCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/strict-cached',
    });
    const freshCart = makeCart({
      checkoutUrl: 'https://sx71id-uy.myshopify.com/cart/c/strict-late-should-not-nav',
    });
    const fetchDeferred = createDeferred<ShopifyCart | null>();

    const harness = await setupMountedUiTest({
      initialCart,
      isEmbedded: false,
      initialOpen: false,
      strictMode: true,
      fetchCart: () => fetchDeferred.promise,
      renderBackground: ({ openCart }) =>
        React.createElement(
          'div',
          { id: 'strict-bg-shell' },
          React.createElement(
            'button',
            { id: 'strict-opener-btn', type: 'button', onClick: openCart },
            'Open Bag'
          )
        ),
    });

    try {
      const opener = harness.getById('strict-opener-btn')!;
      const bgShell = harness.getById('strict-bg-shell')!;

      // Open drawer under StrictMode (runs setup -> cleanup -> setup)
      await harness.click(opener);
      assert.equal(harness.isOpen(), true);
      assert.ok(
        harness.doc.activeElement === harness.getById('close-cart-drawer-btn'),
        `Expected focus on close button under StrictMode, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );
      assert.equal(bgShell.hasAttribute('inert'), true);
      assert.equal(bgShell.getAttribute('aria-hidden'), 'true');
      assert.equal(
        (harness.doc.listeners.keydown || []).length,
        1,
        'StrictMode must not leak duplicate keydown listeners'
      );
      assert.equal(
        (harness.doc.listeners.focusin || []).length,
        1,
        'StrictMode must not leak duplicate focusin listeners'
      );

      // Start checkout refresh, then press Escape -> closes, invalidates request, restores background & opener focus
      await React.act(async () => {
        harness.getById('proceed-to-checkout-btn')!.dispatchEvent({
          type: 'click',
          bubbles: true,
          cancelable: true,
        });
      });

      await harness.pressKey('Escape');
      assert.equal(harness.isOpen(), false);
      assert.equal(bgShell.hasAttribute('inert'), false);
      assert.equal(bgShell.getAttribute('aria-hidden'), null);
      assert.equal((harness.doc.listeners.keydown || []).length, 0);
      assert.equal((harness.doc.listeners.focusin || []).length, 0);
      assert.ok(
        harness.doc.activeElement === opener,
        `Expected focus restored to opener under StrictMode, got ${harness.doc.activeElement?.tagName}#${harness.doc.activeElement?.id}`
      );

      // Late checkout resolution after Escape under StrictMode must still not navigate
      await React.act(async () => {
        fetchDeferred.resolve(freshCart);
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.deepEqual(harness.navigatedUrls, []);
    } finally {
      await harness.cleanup();
    }
  });

  it('20. Overlapping overlay acquiring restrictions after CartDrawer opens keeps background restricted and scroll locked when CartDrawer closes or unmounts first', async () => {
    const { acquireOverlayRestrictions } = await import('../src/lib/overlay-restrictions');
    const { createRoot } = await import('react-dom/client');

    const cart = makeCart();
    let setSecondaryOpen: ((open: boolean) => void) | null = null;

    function SecondaryOverlay({ open }: { open: boolean }) {
      const overlayRef = React.useRef<HTMLDivElement | null>(null);
      React.useEffect(() => {
        if (!open || !overlayRef.current) return;
        const handle = acquireOverlayRestrictions({
          overlayEl: overlayRef.current,
          doc: document,
          lockScroll: true,
          ownerLabel: 'secondary-overlay',
        });
        return () => {
          handle.release();
        };
      }, [open]);

      if (!open) return null;
      return React.createElement(
        'div',
        { ref: overlayRef, id: 'secondary-overlay-backdrop' },
        React.createElement(
          'div',
          { id: 'secondary-overlay-dialog', role: 'dialog', 'aria-modal': 'true' },
          'Secondary Overlay'
        )
      );
    }

    function SecondaryHost() {
      const [open, setOpen] = React.useState(false);
      setSecondaryOpen = setOpen;
      return React.createElement(SecondaryOverlay, { open });
    }

    const harness = await setupMountedUiTest({
      initialCart: cart,
      isEmbedded: false,
      initialOpen: false,
      fetchCart: async () => cart,
      beforeInitialRender: (doc) => {
        doc.body.style.overflow = 'clip';
      },
      renderBackground: ({ openCart }) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            'main',
            { id: 'overlap-bg-main' },
            React.createElement(
              'button',
              { id: 'overlap-opener-btn', type: 'button', onClick: openCart },
              'Open Cart'
            )
          ),
          React.createElement(
            'section',
            { id: 'overlap-explicit-visible', 'aria-hidden': 'false' },
            'Explicitly Visible'
          ),
          React.createElement(
            'aside',
            { id: 'overlap-pre-restricted', 'aria-hidden': 'true' },
            'Pre-restricted'
          ),
          React.createElement(SecondaryHost)
        ),
    });

    try {
      const bgMain = harness.getById('overlap-bg-main')!;
      const opener = harness.getById('overlap-opener-btn')!;
      const explicitVisible = harness.getById('overlap-explicit-visible')!;
      const preRestricted = harness.getById('overlap-pre-restricted')!;
      preRestricted.inert = true;
      preRestricted.setAttribute('inert', '');

      // 1. Open CartDrawer from opener -> CartDrawer acquires restrictions first
      await harness.click(opener);
      assert.equal(harness.isOpen(), true);
      assert.equal(bgMain.hasAttribute('inert'), true);
      assert.equal(bgMain.getAttribute('aria-hidden'), 'true');
      assert.equal(explicitVisible.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // 2. While CartDrawer is open, another overlay opens and acquires overlapping restrictions
      await React.act(async () => {
        setSecondaryOpen?.(true);
      });
      assert.ok(harness.getById('secondary-overlay-dialog'));
      assert.equal(bgMain.hasAttribute('inert'), true);
      assert.equal(bgMain.getAttribute('aria-hidden'), 'true');
      assert.equal(explicitVisible.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // 3. CartDrawer closes FIRST while secondary overlay remains open
      await harness.click(harness.getById('close-cart-drawer-btn')!);
      assert.equal(harness.isOpen(), false);
      assert.equal(harness.getById('cart-drawer-container'), null);

      // Background MUST remain restricted and scrolling MUST remain locked!
      assert.equal(bgMain.hasAttribute('inert'), true, 'Background must stay inert while secondary overlay owns it');
      assert.equal(
        bgMain.getAttribute('aria-hidden'),
        'true',
        'Background must stay aria-hidden while secondary overlay owns it'
      );
      assert.equal(
        explicitVisible.hasAttribute('inert'),
        true,
        'Explicit-visible section must stay inert while secondary overlay owns it'
      );
      assert.equal(
        explicitVisible.getAttribute('aria-hidden'),
        'true',
        'Explicit-visible section must NOT revert to "false" while secondary overlay owns it'
      );
      assert.equal(
        harness.doc.body.style.overflow,
        'hidden',
        'Body scroll must stay locked while secondary overlay owns it'
      );
      assert.ok(
        harness.doc.activeElement !== opener,
        'CartDrawer must not restore focus into still-inert background while secondary overlay is active'
      );

      // 4. Secondary overlay closes SECOND -> original attributes and 'clip' overflow must now be restored!
      await React.act(async () => {
        setSecondaryOpen?.(false);
      });
      assert.equal(bgMain.hasAttribute('inert'), false);
      assert.equal(bgMain.getAttribute('aria-hidden'), null);
      assert.equal(explicitVisible.hasAttribute('inert'), false);
      assert.equal(explicitVisible.getAttribute('aria-hidden'), 'false');
      assert.equal(preRestricted.hasAttribute('inert'), true);
      assert.equal(preRestricted.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'clip');

      // 5. Also verify direct CartDrawer UNMOUNT while secondary overlay remains open
      const stageEl = harness.doc.createElement('div');
      const stageBgEl = harness.doc.createElement('main');
      const stageVisibleEl = harness.doc.createElement('section');
      stageVisibleEl.setAttribute('aria-hidden', 'false');
      const cartMountEl = harness.doc.createElement('div');
      const secondaryMountEl = harness.doc.createElement('div');
      stageEl.appendChild(stageBgEl);
      stageEl.appendChild(stageVisibleEl);
      stageEl.appendChild(cartMountEl);
      stageEl.appendChild(secondaryMountEl);
      harness.doc.body.appendChild(stageEl);

      const cartRoot = createRoot(cartMountEl as unknown as Element);
      const secondaryRoot = createRoot(secondaryMountEl as unknown as Element);

      await React.act(async () => {
        cartRoot.render(
          React.createElement(CartDrawer, {
            isOpen: true,
            onClose: () => {},
            cart,
            isLoading: false,
            onUpdateQuantity: () => {},
            onRemoveItem: () => {},
            onApplyDiscount: async () => ({ success: false }),
            onBrowseProducts: () => {},
          })
        );
      });
      await React.act(async () => {
        secondaryRoot.render(React.createElement(SecondaryOverlay, { open: true }));
      });
      assert.equal(stageBgEl.hasAttribute('inert'), true);
      assert.equal(stageBgEl.getAttribute('aria-hidden'), 'true');
      assert.equal(stageVisibleEl.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // Unmount CartDrawer's entire React root first while SecondaryOverlay stays mounted
      await React.act(async () => {
        cartRoot.unmount();
      });
      assert.equal(stageBgEl.hasAttribute('inert'), true);
      assert.equal(stageBgEl.getAttribute('aria-hidden'), 'true');
      assert.equal(stageVisibleEl.hasAttribute('inert'), true);
      assert.equal(stageVisibleEl.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // Unmount SecondaryOverlay -> all original restrictions restored cleanly
      await React.act(async () => {
        secondaryRoot.unmount();
      });
      assert.equal(stageBgEl.hasAttribute('inert'), false);
      assert.equal(stageBgEl.getAttribute('aria-hidden'), null);
      assert.equal(stageVisibleEl.hasAttribute('inert'), false);
      assert.equal(stageVisibleEl.getAttribute('aria-hidden'), 'false');
      assert.equal(harness.doc.body.style.overflow, 'clip');
    } finally {
      await harness.cleanup();
    }
  });

  it('21. Partial overlapping ownership releases unshared targets immediately, preserves shared ones, and handles idempotent releases', async () => {
    const { acquireInertRestriction, acquireBodyScrollLock } = await import(
      '../src/lib/overlay-restrictions'
    );

    const cart = makeCart();
    const harness = await setupMountedUiTest({
      initialCart: cart,
      isEmbedded: false,
      initialOpen: true,
      fetchCart: async () => cart,
      beforeInitialRender: (doc) => {
        doc.body.style.overflow = 'auto';
      },
      renderBackground: () =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement('main', { id: 'partial-main' }, 'Main'),
          React.createElement('footer', { id: 'partial-footer', 'aria-hidden': 'false' }, 'Footer')
        ),
    });

    try {
      const mainEl = harness.getById('partial-main')!;
      const footerEl = harness.getById('partial-footer')!;

      assert.equal(mainEl.hasAttribute('inert'), true);
      assert.equal(mainEl.getAttribute('aria-hidden'), 'true');
      assert.equal(footerEl.hasAttribute('inert'), true);
      assert.equal(footerEl.getAttribute('aria-hidden'), 'true');
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // Secondary owner acquires ONLY inert on mainEl and scroll lock on body (not footerEl or aria-hidden)
      const secondaryInert = acquireInertRestriction(mainEl as unknown as HTMLElement);
      const secondaryScroll = acquireBodyScrollLock(harness.doc.body as unknown as HTMLElement);

      // CartDrawer closes first
      await harness.setOpen(false);

      // Unshared restrictions (footerEl & mainEl's aria-hidden) are released immediately
      assert.equal(footerEl.hasAttribute('inert'), false);
      assert.equal(footerEl.getAttribute('aria-hidden'), 'false');
      assert.equal(mainEl.getAttribute('aria-hidden'), null);

      // Shared restrictions (mainEl inert & body scroll lock) stay held by secondary owner
      assert.equal(mainEl.hasAttribute('inert'), true);
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      // Releasing secondary handles twice is idempotent and restores remaining restrictions
      secondaryInert.release();
      secondaryInert.release();
      assert.equal(mainEl.hasAttribute('inert'), false);
      assert.equal(harness.doc.body.style.overflow, 'hidden');

      secondaryScroll.release();
      secondaryScroll.release();
      assert.equal(harness.doc.body.style.overflow, 'auto');
    } finally {
      await harness.cleanup();
    }
  });
});



