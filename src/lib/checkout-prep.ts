import type { ShopifyCart } from '../types';

export const CHECKOUT_PREP_MESSAGES = {
  refreshFailed:
    'Unable to refresh your bag with Shopify. Please review your bag and try again.',
  emptyCart:
    'Your bag has no items available for checkout. Please review your bag and try again.',
  missingCheckoutUrl:
    'Unable to prepare your Shopify checkout link right now. Please try again.',
} as const;

export function getCartCheckoutFingerprint(cart: ShopifyCart | null | undefined): string {
  if (!cart) return '';

  const lines = Array.isArray(cart.lines)
    ? cart.lines.map((line) => ({
        id: line.id || '',
        quantity: typeof line.quantity === 'number' ? line.quantity : 0,
        merchandiseId: line.merchandise?.id || '',
        subtotalAmount: line.cost?.subtotalAmount?.amount || '',
        subtotalCurrency: line.cost?.subtotalAmount?.currencyCode || '',
        totalAmount: line.cost?.totalAmount?.amount || '',
        totalCurrency: line.cost?.totalAmount?.currencyCode || '',
        discountAllocations: Array.isArray(line.discountAllocations)
          ? line.discountAllocations.map((alloc) => ({
              amount: alloc.discountedAmount?.amount || '',
              currencyCode: alloc.discountedAmount?.currencyCode || '',
            }))
          : [],
      }))
    : [];

  const discountCodes = Array.isArray(cart.discountCodes)
    ? cart.discountCodes.map((d) => ({
        code: d.code || '',
        applicable: Boolean(d.applicable),
      }))
    : [];

  return JSON.stringify({
    id: cart.id || '',
    checkoutUrl: typeof cart.checkoutUrl === 'string' ? cart.checkoutUrl.trim() : '',
    totalQuantity: typeof cart.totalQuantity === 'number' ? cart.totalQuantity : 0,
    subtotalAmount: cart.cost?.subtotalAmount?.amount || '',
    subtotalCurrency: cart.cost?.subtotalAmount?.currencyCode || '',
    totalAmount: cart.cost?.totalAmount?.amount || '',
    totalCurrency: cart.cost?.totalAmount?.currencyCode || '',
    totalTaxAmount: cart.cost?.totalTaxAmount?.amount || '',
    totalTaxCurrency: cart.cost?.totalTaxAmount?.currencyCode || '',
    totalDutyAmount: cart.cost?.totalDutyAmount?.amount || '',
    totalDutyCurrency: cart.cost?.totalDutyAmount?.currencyCode || '',
    discountCodes,
    lines,
  });
}

export type CheckoutCartValidationResult =
  | {
      valid: true;
      cart: ShopifyCart;
      checkoutUrl: string;
    }
  | {
      valid: false;
      reason: 'null_cart' | 'empty_cart' | 'missing_checkout_url';
      message: string;
    };

export function validateCartForCheckout(
  cart: ShopifyCart | null | undefined
): CheckoutCartValidationResult {
  if (!cart) {
    return {
      valid: false,
      reason: 'null_cart',
      message: CHECKOUT_PREP_MESSAGES.refreshFailed,
    };
  }

  const lines = Array.isArray(cart.lines) ? cart.lines : [];
  const totalQuantity = typeof cart.totalQuantity === 'number' ? cart.totalQuantity : 0;
  if (lines.length === 0 || totalQuantity <= 0) {
    return {
      valid: false,
      reason: 'empty_cart',
      message: CHECKOUT_PREP_MESSAGES.emptyCart,
    };
  }

  const checkoutUrl = typeof cart.checkoutUrl === 'string' ? cart.checkoutUrl.trim() : '';
  if (!checkoutUrl) {
    return {
      valid: false,
      reason: 'missing_checkout_url',
      message: CHECKOUT_PREP_MESSAGES.missingCheckoutUrl,
    };
  }

  return {
    valid: true,
    cart,
    checkoutUrl,
  };
}

export interface RevalidateExistingCartOptions {
  cartId: string | null | undefined;
  fetchCart: (cartId: string) => Promise<ShopifyCart | null>;
  isMutationPending?: () => boolean;
  isStillCurrent?: () => boolean;
  onCommitCart?: (cart: ShopifyCart) => void;
}

export interface RevalidateExistingCartResult {
  status: 'success' | 'failed' | 'stale' | 'blocked';
  cart: ShopifyCart | null;
}

/**
 * Refreshes an existing Shopify cart exclusively for checkout preparation.
 * Never creates a replacement cart and never treats a cached cart as a
 * successful refresh when Shopify returns null or throws.
 */
export async function revalidateExistingCartForCheckout(
  options: RevalidateExistingCartOptions
): Promise<RevalidateExistingCartResult> {
  const { cartId, fetchCart, isMutationPending, isStillCurrent, onCommitCart } = options;

  if (isMutationPending && isMutationPending()) {
    return { status: 'blocked', cart: null };
  }

  const normalizedCartId = typeof cartId === 'string' ? cartId.trim() : '';
  if (!normalizedCartId) {
    return { status: 'failed', cart: null };
  }

  try {
    const freshCart = await fetchCart(normalizedCartId);

    if ((isMutationPending && isMutationPending()) || (isStillCurrent && !isStillCurrent())) {
      return { status: 'stale', cart: null };
    }

    if (!freshCart) {
      return { status: 'failed', cart: null };
    }

    onCommitCart?.(freshCart);
    return { status: 'success', cart: freshCart };
  } catch {
    return { status: 'failed', cart: null };
  }
}

// ============================================================================
// Parent Store Cart & Checkout Coordinator (used by App.tsx & tests)
// ============================================================================

export interface StoreCartState {
  cart: ShopifyCart | null;
  isLoading: boolean;
  isRevalidating: boolean;
  mutationEpoch: number;
  lastRefreshCommitToken: number | null;
}

export type StoreCartListener = (state: StoreCartState) => void;

export interface StoreCartCoordinatorDeps {
  fetchCart: (cartId: string) => Promise<ShopifyCart | null>;
  getOrCreateCart: () => Promise<ShopifyCart | null>;
  addLines: (
    cartId: string,
    lines: Array<{ merchandiseId: string; quantity: number }>
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  updateLine: (
    cartId: string,
    lineId: string,
    quantity: number
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  removeLine: (
    cartId: string,
    lineId: string
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  applyDiscount: (
    cartId: string,
    discountCodes: string[]
  ) => Promise<{ cart: ShopifyCart | null; userErrors?: Array<{ message?: string }> }>;
  onNotify?: (message: string) => void;
  initialCart?: ShopifyCart | null;
}

export interface StoreCartCheckoutCoordinator {
  getState: () => StoreCartState;
  subscribe: (listener: StoreCartListener) => () => void;
  setOnNotify: (onNotify: (message: string) => void) => void;
  isMutationPending: () => boolean;
  loadCart: () => Promise<ShopifyCart | null>;
  addToCart: (params: {
    productTitle: string;
    variantId: string;
    variantTitle: string;
    quantity?: number;
  }) => Promise<ShopifyCart | null>;
  updateQuantity: (lineId: string, quantity: number) => Promise<ShopifyCart | null>;
  removeItem: (lineId: string) => Promise<ShopifyCart | null>;
  applyDiscount: (code: string) => Promise<{ success: boolean; message?: string }>;
  revalidateForCheckout: (refreshToken?: number) => Promise<ShopifyCart | null>;
}

export function createStoreCartCheckoutCoordinator(
  deps: StoreCartCoordinatorDeps
): StoreCartCheckoutCoordinator {
  let state: StoreCartState = {
    cart: deps.initialCart ?? null,
    isLoading: false,
    isRevalidating: false,
    mutationEpoch: 0,
    lastRefreshCommitToken: null,
  };

  let onNotify = deps.onNotify;
  let activeMutationCount = 0;
  let latestRevalidateSeq = 0;
  const listeners = new Set<StoreCartListener>();

  const emit = () => {
    listeners.forEach((listener) => listener(state));
  };

  const beginMutation = (): number => {
    activeMutationCount += 1;
    state = {
      ...state,
      isLoading: true,
      mutationEpoch: state.mutationEpoch + 1,
      lastRefreshCommitToken: null,
    };
    emit();
    return state.mutationEpoch;
  };

  const commitMutationCart = (nextCart: ShopifyCart) => {
    state = {
      ...state,
      cart: nextCart,
      mutationEpoch: state.mutationEpoch + 1,
      lastRefreshCommitToken: null,
    };
    emit();
  };

  const endMutation = () => {
    activeMutationCount = Math.max(0, activeMutationCount - 1);
    state = {
      ...state,
      isLoading: activeMutationCount > 0,
    };
    emit();
  };

  return {
    getState: () => state,

    subscribe: (listener: StoreCartListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setOnNotify: (nextOnNotify: (message: string) => void) => {
      onNotify = nextOnNotify;
    },

    isMutationPending: () => activeMutationCount > 0,

    loadCart: async () => {
      const startEpoch = beginMutation();
      try {
        const cart = await deps.getOrCreateCart();
        if (cart && state.mutationEpoch === startEpoch) {
          commitMutationCart(cart);
          return cart;
        }
        return null;
      } catch {
        return null;
      } finally {
        endMutation();
      }
    },

    addToCart: async ({ productTitle, variantId, variantTitle, quantity = 1 }) => {
      beginMutation();
      try {
        let currentCart = state.cart;
        if (!currentCart) {
          currentCart = await deps.getOrCreateCart();
          if (currentCart) {
            commitMutationCart(currentCart);
          }
        }

        if (!currentCart) {
          onNotify?.('Unable to initialize cart. Please check your connection.');
          return null;
        }

        const { cart, userErrors } = await deps.addLines(currentCart.id, [
          { merchandiseId: variantId, quantity },
        ]);

        if (userErrors && userErrors.length > 0) {
          onNotify?.(userErrors[0].message || 'Could not add variant to bag');
          return null;
        }

        if (cart) {
          commitMutationCart(cart);
          onNotify?.(`Added ${quantity}x "${productTitle}" (${variantTitle}) to your bag`);
          return cart;
        }

        return null;
      } catch {
        onNotify?.('Error communicating with Shopify Cart');
        return null;
      } finally {
        endMutation();
      }
    },

    updateQuantity: async (lineId: string, quantity: number) => {
      const currentCart = state.cart;
      if (!currentCart || state.isRevalidating) return null;
      beginMutation();
      try {
        if (quantity <= 0) {
          const { cart } = await deps.removeLine(currentCart.id, lineId);
          if (cart) {
            commitMutationCart(cart);
            return cart;
          }
        } else {
          const { cart } = await deps.updateLine(currentCart.id, lineId, quantity);
          if (cart) {
            commitMutationCart(cart);
            return cart;
          }
        }
        return null;
      } catch {
        onNotify?.('Error updating item in bag');
        return null;
      } finally {
        endMutation();
      }
    },

    removeItem: async (lineId: string) => {
      const currentCart = state.cart;
      if (!currentCart || state.isRevalidating) return null;
      beginMutation();
      try {
        const { cart } = await deps.removeLine(currentCart.id, lineId);
        if (cart) {
          commitMutationCart(cart);
          onNotify?.('Item removed from bag');
          return cart;
        }
        return null;
      } catch {
        onNotify?.('Error removing item from bag');
        return null;
      } finally {
        endMutation();
      }
    },

    applyDiscount: async (code: string) => {
      const currentCart = state.cart;
      if (!currentCart) return { success: false, message: 'Cart not initialized' };
      if (state.isRevalidating) {
        return { success: false, message: 'Please wait for checkout verification to finish.' };
      }
      beginMutation();
      try {
        const { cart, userErrors } = await deps.applyDiscount(currentCart.id, [code]);
        if (userErrors && userErrors.length > 0) {
          return { success: false, message: userErrors[0].message };
        }
        if (cart) {
          commitMutationCart(cart);
          const applied = cart.discountCodes.some(
            (d) => d.code.toUpperCase() === code.toUpperCase() && d.applicable
          );
          if (applied) {
            onNotify?.(`Shopify discount ${code} applied successfully!`);
            return { success: true };
          }
          return { success: false, message: 'Code is not valid for items in your cart.' };
        }
        return { success: false, message: 'Could not apply code' };
      } catch {
        return { success: false, message: 'Error checking code with Shopify' };
      } finally {
        endMutation();
      }
    },

    revalidateForCheckout: async (refreshToken?: number): Promise<ShopifyCart | null> => {
      if (state.isRevalidating || activeMutationCount > 0) {
        return null;
      }

      const startEpoch = state.mutationEpoch;
      const revalidateSeq = ++latestRevalidateSeq;
      const targetCartId = state.cart?.id;

      state = {
        ...state,
        isRevalidating: true,
      };
      emit();

      try {
        const result = await revalidateExistingCartForCheckout({
          cartId: targetCartId,
          fetchCart: deps.fetchCart,
          isMutationPending: () => activeMutationCount > 0,
          isStillCurrent: () =>
            state.mutationEpoch === startEpoch && latestRevalidateSeq === revalidateSeq,
          onCommitCart: (freshCart) => {
            state = {
              ...state,
              cart: freshCart,
              lastRefreshCommitToken: refreshToken ?? revalidateSeq,
            };
            emit();
          },
        });

        return result.status === 'success' ? result.cart : null;
      } finally {
        if (latestRevalidateSeq === revalidateSeq) {
          state = {
            ...state,
            isRevalidating: false,
          };
          emit();
        }
      }
    },
  };
}

// ============================================================================
// CartDrawer Checkout Preparation Controller
// ============================================================================

export interface CheckoutPrepState {
  isPreparing: boolean;
  verifiedCheckoutUrl: string | null;
  error: string | null;
  preparedFingerprint: string | null;
  errorFingerprint: string | null;
  preparedMutationEpoch: number | null;
}

export type CheckoutPrepListener = (state: CheckoutPrepState) => void;

export type PrepareCheckoutOutcome =
  | { outcome: 'navigated_standalone'; checkoutUrl: string }
  | { outcome: 'prepared_embedded'; checkoutUrl: string }
  | {
      outcome: 'invalid';
      reason: 'null_cart' | 'empty_cart' | 'missing_checkout_url' | 'refresh_error';
      message: string;
    }
  | { outcome: 'duplicate' }
  | { outcome: 'blocked' }
  | { outcome: 'ignored_unmounted' }
  | { outcome: 'ignored_closed' }
  | { outcome: 'ignored_stale' }
  | { outcome: 'ignored_mutation' }
  | { outcome: 'ignored_cart_changed' };

export interface CheckoutPrepContext {
  isOpen: boolean;
  cart: ShopifyCart | null | undefined;
  isMutationPending: boolean;
  mutationEpoch?: number;
  refreshCommitToken?: number | null;
}

export interface PrepareCheckoutParams {
  cart: ShopifyCart | null | undefined;
  isOpen: boolean;
  isMutationPending: boolean;
  mutationEpoch?: number;
  isEmbedded: boolean;
  refreshCart: (cartId: string, refreshToken: number) => Promise<ShopifyCart | null>;
  navigate: (checkoutUrl: string) => void;
}

export interface CheckoutPreparationController {
  getState: () => CheckoutPrepState;
  subscribe: (listener: CheckoutPrepListener) => () => void;
  mount: () => void;
  unmount: () => void;
  syncContext: (context: CheckoutPrepContext) => void;
  clearPrepared: () => void;
  invalidateForClose: () => void;
  markClosedImmediately: () => void;
  invalidateForMutationStart: () => void;
  canEditCart: () => boolean;
  canFollowPreparedLink: (context: {
    isOpen: boolean;
    isMutationPending: boolean;
    mutationEpoch?: number;
  }) => boolean;
  prepareCheckout: (params: PrepareCheckoutParams) => Promise<PrepareCheckoutOutcome>;
}

const INITIAL_PREP_STATE: CheckoutPrepState = {
  isPreparing: false,
  verifiedCheckoutUrl: null,
  error: null,
  preparedFingerprint: null,
  errorFingerprint: null,
  preparedMutationEpoch: null,
};

function statesEqual(a: CheckoutPrepState, b: CheckoutPrepState): boolean {
  return (
    a.isPreparing === b.isPreparing &&
    a.verifiedCheckoutUrl === b.verifiedCheckoutUrl &&
    a.error === b.error &&
    a.preparedFingerprint === b.preparedFingerprint &&
    a.errorFingerprint === b.errorFingerprint &&
    a.preparedMutationEpoch === b.preparedMutationEpoch
  );
}

export function createCheckoutPreparationController(initialContext?: {
  initialIsOpen?: boolean;
  initialCart?: ShopifyCart | null;
  initialIsMutationPending?: boolean;
  initialMutationEpoch?: number;
}): CheckoutPreparationController {
  let state: CheckoutPrepState = { ...INITIAL_PREP_STATE };
  let mounted = true;
  let currentIsOpen = Boolean(initialContext?.initialIsOpen);
  let currentFingerprint = getCartCheckoutFingerprint(initialContext?.initialCart);
  let currentMutationPending = Boolean(initialContext?.initialIsMutationPending);
  let currentMutationEpoch = initialContext?.initialMutationEpoch ?? 0;
  let activeRequestId = 0;
  let inFlightStartMutationEpoch: number | null = null;
  let inFlightRequestId: number | null = null;

  const listeners = new Set<CheckoutPrepListener>();

  const setState = (next: CheckoutPrepState) => {
    if (statesEqual(state, next)) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  };

  const resetAndInvalidate = () => {
    activeRequestId += 1;
    inFlightStartMutationEpoch = null;
    inFlightRequestId = null;
    setState({ ...INITIAL_PREP_STATE });
  };

  return {
    getState: () => state,

    subscribe: (listener: CheckoutPrepListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    mount: () => {
      mounted = true;
    },

    unmount: () => {
      mounted = false;
      activeRequestId += 1;
      inFlightStartMutationEpoch = null;
      inFlightRequestId = null;
      setState({
        ...state,
        isPreparing: false,
      });
    },

    invalidateForClose: () => {
      currentIsOpen = false;
      resetAndInvalidate();
    },

    markClosedImmediately: () => {
      if (currentIsOpen || inFlightRequestId !== null || state.isPreparing) {
        currentIsOpen = false;
        activeRequestId += 1;
        inFlightStartMutationEpoch = null;
        inFlightRequestId = null;
      }
    },

    invalidateForMutationStart: () => {
      resetAndInvalidate();
    },

    syncContext: ({
      isOpen,
      cart,
      isMutationPending,
      mutationEpoch = 0,
      refreshCommitToken = null,
    }) => {
      const nextFingerprint = getCartCheckoutFingerprint(cart);
      const prevFingerprint = currentFingerprint;
      const prevMutationEpoch = currentMutationEpoch;

      currentIsOpen = isOpen;
      currentFingerprint = nextFingerprint;
      currentMutationPending = isMutationPending;
      currentMutationEpoch = mutationEpoch;

      if (!isOpen) {
        resetAndInvalidate();
        return;
      }

      if (state.isPreparing && (inFlightRequestId === null || inFlightRequestId !== activeRequestId)) {
        resetAndInvalidate();
        return;
      }

      // Any active mutation immediately invalidates both an in-flight prep and any already prepared link
      if (isMutationPending) {
        resetAndInvalidate();
        return;
      }

      // Any mutation epoch change invalidates both an in-flight prep and any already prepared link
      if (mutationEpoch !== prevMutationEpoch) {
        resetAndInvalidate();
        return;
      }

      if (nextFingerprint !== prevFingerprint) {
        // 1. Correlated parent commit of fresh cart from THIS in-flight checkout refresh request
        if (
          state.isPreparing &&
          inFlightRequestId !== null &&
          inFlightRequestId === activeRequestId &&
          inFlightStartMutationEpoch !== null &&
          mutationEpoch === inFlightStartMutationEpoch &&
          refreshCommitToken !== null &&
          refreshCommitToken === inFlightRequestId
        ) {
          return;
        }

        // 2. Parent commit matching the exact snapshot freshly prepared by this controller
        if (
          nextFingerprint &&
          nextFingerprint === state.preparedFingerprint &&
          state.verifiedCheckoutUrl &&
          (state.preparedMutationEpoch === null || mutationEpoch === state.preparedMutationEpoch)
        ) {
          return;
        }

        // 3. Parent commit matching the invalid/empty snapshot rejected by this controller
        if (nextFingerprint === state.errorFingerprint && state.error) {
          if (state.verifiedCheckoutUrl !== null || state.isPreparing) {
            setState({
              ...state,
              isPreparing: false,
              verifiedCheckoutUrl: null,
              preparedFingerprint: null,
              preparedMutationEpoch: null,
            });
          }
          return;
        }

        // 4. Unrelated cart change: invalidate prepared link, error, and any in-flight request
        resetAndInvalidate();
      }
    },

    clearPrepared: () => {
      setState({
        ...state,
        verifiedCheckoutUrl: null,
        preparedFingerprint: null,
        error: null,
        errorFingerprint: null,
        preparedMutationEpoch: null,
      });
    },

    canEditCart: () => !state.isPreparing,

    canFollowPreparedLink: ({ isOpen, isMutationPending, mutationEpoch = 0 }) => {
      if (!mounted || !isOpen || !currentIsOpen) return false;
      if (isMutationPending || currentMutationPending) return false;
      if (state.isPreparing) return false;
      if (!state.verifiedCheckoutUrl) return false;
      if (state.preparedMutationEpoch !== null && mutationEpoch !== state.preparedMutationEpoch) {
        return false;
      }
      return true;
    },

    prepareCheckout: async ({
      cart,
      isOpen,
      isMutationPending,
      mutationEpoch = 0,
      isEmbedded,
      refreshCart,
      navigate,
    }): Promise<PrepareCheckoutOutcome> => {
      if (state.isPreparing) {
        return { outcome: 'duplicate' };
      }

      if (!mounted || !isOpen || isMutationPending) {
        return { outcome: 'blocked' };
      }

      const startFingerprint = getCartCheckoutFingerprint(cart);
      const startMutationEpoch = mutationEpoch;
      currentIsOpen = isOpen;
      currentFingerprint = startFingerprint;
      currentMutationPending = isMutationPending;
      currentMutationEpoch = mutationEpoch;

      const cartId = typeof cart?.id === 'string' ? cart.id.trim() : '';
      if (!cartId) {
        setState({
          isPreparing: false,
          verifiedCheckoutUrl: null,
          preparedFingerprint: null,
          error: CHECKOUT_PREP_MESSAGES.refreshFailed,
          errorFingerprint: startFingerprint,
          preparedMutationEpoch: null,
        });
        return {
          outcome: 'invalid',
          reason: 'null_cart',
          message: CHECKOUT_PREP_MESSAGES.refreshFailed,
        };
      }

      const requestId = ++activeRequestId;
      inFlightStartMutationEpoch = startMutationEpoch;
      inFlightRequestId = requestId;

      setState({
        isPreparing: true,
        verifiedCheckoutUrl: null,
        preparedFingerprint: null,
        error: null,
        errorFingerprint: null,
        preparedMutationEpoch: null,
      });

      let freshCart: ShopifyCart | null = null;
      let threwError = false;
      try {
        freshCart = await refreshCart(cartId, requestId);
      } catch {
        threwError = true;
        freshCart = null;
      }

      if (inFlightRequestId === requestId) {
        inFlightRequestId = null;
        inFlightStartMutationEpoch = null;
      }

      if (!mounted) {
        return { outcome: 'ignored_unmounted' };
      }

      if (!currentIsOpen) {
        return { outcome: 'ignored_closed' };
      }

      if (requestId !== activeRequestId) {
        return { outcome: 'ignored_stale' };
      }

      if (currentMutationPending || currentMutationEpoch !== startMutationEpoch) {
        resetAndInvalidate();
        return { outcome: 'ignored_mutation' };
      }

      const freshFingerprint = getCartCheckoutFingerprint(freshCart);
      if (
        currentFingerprint !== startFingerprint &&
        (!freshCart || currentFingerprint !== freshFingerprint)
      ) {
        resetAndInvalidate();
        return { outcome: 'ignored_cart_changed' };
      }

      const validation = validateCartForCheckout(freshCart);
      if (validation.valid === false) {
        const failed = validation as Extract<CheckoutCartValidationResult, { valid: false }>;
        const message = threwError ? CHECKOUT_PREP_MESSAGES.refreshFailed : failed.message;
        const reason = threwError ? 'refresh_error' : failed.reason;
        setState({
          isPreparing: false,
          verifiedCheckoutUrl: null,
          preparedFingerprint: null,
          error: message,
          errorFingerprint: freshCart ? freshFingerprint : startFingerprint,
          preparedMutationEpoch: null,
        });
        return {
          outcome: 'invalid',
          reason,
          message,
        };
      }

      const freshCheckoutUrl = validation.checkoutUrl;

      if (isEmbedded) {
        setState({
          isPreparing: false,
          verifiedCheckoutUrl: freshCheckoutUrl,
          preparedFingerprint: freshFingerprint,
          error: null,
          errorFingerprint: null,
          preparedMutationEpoch: currentMutationEpoch,
        });
        return {
          outcome: 'prepared_embedded',
          checkoutUrl: freshCheckoutUrl,
        };
      }

      setState({
        isPreparing: false,
        verifiedCheckoutUrl: null,
        preparedFingerprint: freshFingerprint,
        error: null,
        errorFingerprint: null,
        preparedMutationEpoch: currentMutationEpoch,
      });
      navigate(freshCheckoutUrl);
      return {
        outcome: 'navigated_standalone',
        checkoutUrl: freshCheckoutUrl,
      };
    },
  };
}
