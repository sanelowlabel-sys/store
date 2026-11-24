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
    const earlyReturnIdx = cartDrawerSource.indexOf('if (!isOpen) {');
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
  private _disabled = false;
  private _value = '';

  constructor(tagName: string, ownerDocument: MockDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
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

  setAttribute(name: string, val: unknown) {
    const strVal = String(val);
    this.attributes[name] = strVal;
    if (name === 'disabled') {
      this._disabled = true;
    }
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
    if (name === 'disabled') {
      this._disabled = false;
    }
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  dispatchEvent(ev: {
    type: string;
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
      ev.defaultPrevented = true;
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

    return !ev.defaultPrevented;
  }
}

class MockDocument extends MockNode {
  documentElement: MockElement;
  body: MockElement;
  defaultView: any = null;

  constructor() {
    super(9, undefined as unknown as MockDocument);
    this.ownerDocument = this;
    this.documentElement = new MockElement('html', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.body);
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

async function setupMountedUiTest(options: {
  initialCart: ShopifyCart;
  isEmbedded: boolean;
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
}) {
  const prevWindow = (globalThis as any).window;
  const prevDocument = (globalThis as any).document;
  const prevActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  const doc = new MockDocument();
  const rootEl = doc.createElement('div');
  doc.body.appendChild(rootEl);

  const navigatedUrls: string[] = [];
  const win: any = {
    document: doc,
    HTMLIFrameElement: class {},
    __MOCK_EMBEDDED_PREVIEW__: options.isEmbedded,
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
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  doc.defaultView = win;

  (globalThis as any).window = win;
  (globalThis as any).document = doc;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const { createCheckoutPreparationController: _unused, createStoreCartCheckoutCoordinator } =
    await import('../src/lib/checkout-prep');
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
  let externalCartOverride: { active: boolean; cart: ShopifyCart | null; token: number | null } = {
    active: false,
    cart: null,
    token: null,
  };

  function HarnessParent() {
    const [cartState, setCartState] = React.useState(() => coordinator.getState());
    const [isOpen, setIsOpen] = React.useState(true);
    const [overrideTick, setOverrideTick] = React.useState(0);

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

    return React.createElement(CartDrawer, {
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
    });
  }

  const root = createRoot(rootEl as unknown as Element);
  await React.act(async () => {
    root.render(React.createElement(HarnessParent));
  });

  const getById = (id: string) =>
    findElements(rootEl, (el) => el.id === id)[0] ?? null;

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
      const notPrevented = el.dispatchEvent({
        type: 'click',
        bubbles: true,
        cancelable: true,
      });
      defaultPrevented = !notPrevented;
    });
    return { defaultPrevented };
  };

  const cleanup = async () => {
    await React.act(async () => {
      root.unmount();
    });
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
  };

  return {
    coordinator,
    rootEl,
    navigatedUrls,
    win,
    getById,
    getByAriaLabel,
    getButtonsByText,
    click,
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

