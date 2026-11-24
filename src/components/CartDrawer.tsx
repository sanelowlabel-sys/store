import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Trash2,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Tag,
  Check,
  Truck,
  Lock,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ShopifyCart } from '../types';
import {
  formatPrice,
  isEmbeddedPreview,
  getShopifyCart,
} from '../lib/shopify';
import {
  CheckoutPreparationController,
  CheckoutPrepState,
  createCheckoutPreparationController,
} from '../lib/checkout-prep';
import { acquireOverlayRestrictions } from '../lib/overlay-restrictions';

interface MoneyValue {
  amount?: string | number | null;
  currencyCode?: string | null;
}

interface ParsedMoney {
  formatted: string;
  currencyCode: string;
  normalizedDecimal: string;
}

function normalizeDecimalString(raw: string): string {
  const [intPartRaw, fracPartRaw = ''] = raw.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const fracPart = fracPartRaw.replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

const SUPPORTED_CURRENCIES: Set<string> | null =
  typeof (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf === 'function'
    ? new Set(
        (Intl as { supportedValuesOf: (key: string) => string[] })
          .supportedValuesOf('currency')
          .map((code) => code.toUpperCase())
      )
    : null;

function parseCartMoney(money: MoneyValue | null | undefined): ParsedMoney | null {
  if (!money || typeof money !== 'object') return null;

  const rawCurrency =
    typeof money.currencyCode === 'string' ? money.currencyCode.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(rawCurrency)) {
    return null;
  }
  if (SUPPORTED_CURRENCIES && !SUPPORTED_CURRENCIES.has(rawCurrency)) {
    return null;
  }

  let amountStr = '';
  let numericAmount = NaN;

  if (typeof money.amount === 'number') {
    if (!Number.isFinite(money.amount) || money.amount < 0) return null;
    numericAmount = money.amount;
    amountStr = money.amount.toString();
  } else if (typeof money.amount === 'string') {
    const trimmed = money.amount.trim();
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
    numericAmount = Number(trimmed);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return null;
    amountStr = trimmed;
  } else {
    return null;
  }

  return {
    formatted: formatPrice(numericAmount, rawCurrency),
    currencyCode: rawCurrency,
    normalizedDecimal: normalizeDecimalString(amountStr),
  };
}

function isElementHiddenOrInert(el: HTMLElement, stopAt?: HTMLElement | null): boolean {
  let cur: HTMLElement | null = el;
  while (cur && cur !== stopAt) {
    if (
      cur.hasAttribute?.('hidden') ||
      cur.getAttribute?.('aria-hidden') === 'true' ||
      cur.hasAttribute?.('inert') ||
      (cur as unknown as { inert?: boolean }).inert === true ||
      cur.style?.display === 'none' ||
      cur.style?.visibility === 'hidden'
    ) {
      return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

function isTabbableElement(el: HTMLElement, container: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.hasAttribute?.('disabled')) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' && el.getAttribute?.('type') === 'hidden') return false;
  const tabIndexAttr = el.getAttribute?.('tabindex');
  if (tabIndexAttr !== null && tabIndexAttr !== undefined) {
    const parsed = Number(tabIndexAttr);
    if (!Number.isFinite(parsed) || parsed < 0) return false;
  } else {
    const isNativelyTabbable =
      tag === 'BUTTON' ||
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      (tag === 'A' && el.hasAttribute?.('href'));
    if (!isNativelyTabbable) return false;
  }
  return !isElementHiddenOrInert(el, container);
}

function getTabbableElements(container: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] =
    typeof container.querySelectorAll === 'function'
      ? (Array.from(
          container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')
        ) as HTMLElement[])
      : (() => {
          const collected: HTMLElement[] = [];
          const walk = (node: Node) => {
            const children = (node as HTMLElement).children
              ? Array.from((node as HTMLElement).children)
              : Array.from(node.childNodes || []);
            for (const child of children) {
              if (child.nodeType === 1) {
                collected.push(child as HTMLElement);
                walk(child);
              }
            }
          };
          walk(container);
          return collected;
        })();

  return candidates.filter((el) => isTabbableElement(el, container));
}

function isUsableFocusRestoreTarget(el: HTMLElement, drawerEl: HTMLElement): boolean {
  if (!el || typeof el.focus !== 'function') return false;
  if (typeof document === 'undefined') return false;
  if (el === document.body || el === document.documentElement) return false;
  if (drawerEl.contains(el)) return false;
  if ('isConnected' in el && el.isConnected === false) return false;
  if (document.body && typeof document.body.contains === 'function' && !document.body.contains(el)) {
    return false;
  }
  if ((el as HTMLButtonElement).disabled || el.hasAttribute?.('disabled')) return false;
  if (isElementHiddenOrInert(el)) return false;
  return true;
}

function findClosestDialog(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const role = cur.getAttribute?.('role');
    if (role === 'dialog' || role === 'alertdialog') return cur;
    cur = cur.parentElement;
  }
  return null;
}

function isCartDrawerTopmostModal(drawerEl: HTMLElement): boolean {
  if (typeof document === 'undefined') return true;
  const activeEl = document.activeElement as HTMLElement | null;
  const activeDialog = findClosestDialog(activeEl);
  if (activeDialog && activeDialog !== drawerEl) {
    return false;
  }
  if (typeof document.querySelectorAll === 'function') {
    const modals = Array.from(
      document.querySelectorAll('[role="dialog"][aria-modal="true"]')
    ) as HTMLElement[];
    if (modals.length > 0 && modals[modals.length - 1] !== drawerEl && modals.includes(drawerEl)) {
      return false;
    }
  }
  return true;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: ShopifyCart | null;
  isLoading: boolean;
  cartMutationEpoch?: number;
  lastRefreshCommitToken?: number | null;
  getIsMutationPending?: () => boolean;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemoveItem: (lineId: string) => void;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; message?: string }>;
  onBrowseProducts: () => void;
  onRevalidateCart?: (refreshToken?: number) => Promise<ShopifyCart | null>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  isLoading,
  cartMutationEpoch = 0,
  lastRefreshCommitToken = null,
  getIsMutationPending,
  onUpdateQuantity,
  onRemoveItem,
  onApplyDiscount,
  onBrowseProducts,
  onRevalidateCart,
}) => {
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const controllerRef = useRef<CheckoutPreparationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createCheckoutPreparationController({
      initialIsOpen: isOpen,
      initialCart: cart,
      initialIsMutationPending: isLoading,
      initialMutationEpoch: cartMutationEpoch,
    });
  }

  const [prepState, setPrepState] = useState<CheckoutPrepState>(() =>
    controllerRef.current!.getState()
  );

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleCloseDrawer = useCallback(() => {
    controllerRef.current?.invalidateForClose();
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.mount();
    const unsubscribe = controller.subscribe(setPrepState);
    return () => {
      unsubscribe();
      controller.unmount();
    };
  }, []);

  // Synchronize drawer open state, comprehensive cart fingerprint, mutation epoch, and correlated refresh commits
  useEffect(() => {
    controllerRef.current?.syncContext({
      isOpen,
      cart,
      isMutationPending: isLoading || isApplyingPromo,
      mutationEpoch: cartMutationEpoch,
      refreshCommitToken: lastRefreshCommitToken,
    });
    if (!isOpen) {
      setPromoError('');
    }
  }, [isOpen, cart, isLoading, isApplyingPromo, cartMutationEpoch, lastRefreshCommitToken]);

  // Modal dialog focus management, scoped Escape, Tab containment, and background isolation
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const drawerEl = drawerRef.current;
    const overlayEl = overlayRef.current;
    if (!drawerEl || !overlayEl) return;

    const activeBeforeOpen = document.activeElement as HTMLElement | null;
    if (
      activeBeforeOpen &&
      activeBeforeOpen !== document.body &&
      activeBeforeOpen !== document.documentElement &&
      !drawerEl.contains(activeBeforeOpen)
    ) {
      previousFocusRef.current = activeBeforeOpen;
    }

    const restrictionsHandle = acquireOverlayRestrictions({
      overlayEl,
      doc: document,
      lockScroll: true,
      ownerLabel: 'cart-drawer',
    });

    const moveInitialFocus = () => {
      const closeBtn = closeButtonRef.current;
      if (closeBtn && !closeBtn.disabled && !isElementHiddenOrInert(closeBtn, drawerEl)) {
        closeBtn.focus();
        return;
      }
      const tabbables = getTabbableElements(drawerEl);
      if (tabbables.length > 0) {
        tabbables[0].focus();
        return;
      }
      drawerEl.focus();
    };
    moveInitialFocus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        (e as unknown as { isComposing?: boolean }).isComposing ||
        e.keyCode === 229
      ) {
        return;
      }
      if (!isCartDrawerTopmostModal(drawerEl)) {
        return;
      }

      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        const activeEl = document.activeElement as HTMLElement | null;
        const targetDialog = findClosestDialog(target);
        if (targetDialog && targetDialog !== drawerEl) {
          return;
        }
        if (
          target &&
          !overlayEl.contains(target) &&
          target !== document.body &&
          target !== document.documentElement
        ) {
          return;
        }
        if (
          target?.getAttribute?.('aria-expanded') === 'true' ||
          activeEl?.getAttribute?.('aria-expanded') === 'true'
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleCloseDrawer();
        return;
      }

      if (e.key === 'Tab') {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const tabbables = getTabbableElements(drawerEl);
        if (tabbables.length === 0) {
          e.preventDefault();
          drawerEl.focus();
          return;
        }

        const activeEl = document.activeElement as HTMLElement | null;
        const first = tabbables[0];
        const last = tabbables[tabbables.length - 1];

        if (!activeEl || !drawerEl.contains(activeEl)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }

        if (e.shiftKey) {
          if (activeEl === first || activeEl === drawerEl) {
            e.preventDefault();
            last.focus();
          }
        } else if (activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (drawerEl.contains(target)) return;
      if (!isCartDrawerTopmostModal(drawerEl)) return;
      const targetDialog = findClosestDialog(target);
      if (targetDialog && targetDialog !== drawerEl) return;
      moveInitialFocus();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);

      restrictionsHandle.release();

      const opener = previousFocusRef.current;
      previousFocusRef.current = null;
      if (opener && isUsableFocusRestoreTarget(opener, drawerEl)) {
        opener.focus();
      }
    };
  }, [isOpen, handleCloseDrawer]);

  if (!isOpen) {
    controllerRef.current.markClosedImmediately();
    return null;
  }

  const isLiveMutationPending = isLoading || isApplyingPromo || Boolean(getIsMutationPending?.());
  const isRevalidating = prepState.isPreparing;
  const revalidationError = prepState.error;
  const isCartLockedForCheckoutPrep = isRevalidating || isLiveMutationPending;
  const verifiedCheckoutUrl = controllerRef.current.canFollowPreparedLink({
    isOpen,
    isMutationPending: isLiveMutationPending,
    mutationEpoch: cartMutationEpoch,
  })
    ? prepState.verifiedCheckoutUrl
    : null;

  const lines = cart?.lines || [];
  const totalQuantity = cart?.totalQuantity || 0;
  const headerCurrencyCode =
    (
      cart?.cost?.totalAmount?.currencyCode ||
      cart?.cost?.subtotalAmount?.currencyCode ||
      'USD'
    )
      .trim()
      .toUpperCase() || 'USD';

  const subtotalMoney = parseCartMoney(cart?.cost?.subtotalAmount);
  const totalMoney = parseCartMoney(cart?.cost?.totalAmount);
  const hasSameCurrencyEstimateDifference = Boolean(
    subtotalMoney &&
      totalMoney &&
      subtotalMoney.currencyCode === totalMoney.currencyCode &&
      subtotalMoney.normalizedDecimal !== totalMoney.normalizedDecimal
  );

  const discountCodes = cart?.discountCodes || [];
  const applicableCodes = discountCodes.filter((d) => d.applicable);

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLiveMutationPending || !controllerRef.current?.canEditCart()) return;
    setPromoError('');
    controllerRef.current.invalidateForMutationStart();
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    setIsApplyingPromo(true);
    try {
      const result = await onApplyDiscount(code);
      if (result.success) {
        setPromoInput('');
      } else {
        setPromoError(result.message || 'Discount code not applicable or expired in Shopify.');
      }
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleItemQuantityChange = (lineId: string, qty: number) => {
    if (isLiveMutationPending || !controllerRef.current?.canEditCart()) return;
    controllerRef.current.invalidateForMutationStart();
    onUpdateQuantity(lineId, qty);
  };

  const handleItemRemove = (lineId: string) => {
    if (isLiveMutationPending || !controllerRef.current?.canEditCart()) return;
    controllerRef.current.invalidateForMutationStart();
    onRemoveItem(lineId);
  };

  const handleProceedToCheckout = async () => {
    const controller = controllerRef.current;
    if (!controller) return;

    await controller.prepareCheckout({
      cart,
      isOpen,
      isMutationPending: isLoading || isApplyingPromo || Boolean(getIsMutationPending?.()),
      mutationEpoch: cartMutationEpoch,
      isEmbedded: isEmbeddedPreview(),
      refreshCart: async (cartId, refreshToken) => {
        if (onRevalidateCart) {
          return await onRevalidateCart(refreshToken);
        }
        return await getShopifyCart(cartId);
      },
      navigate: (checkoutUrl) => {
        window.location.href = checkoutUrl;
      },
    });
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-hidden"
    >
      <div
        ref={drawerRef}
        id="cart-drawer-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-heading"
        tabIndex={-1}
        className="w-full max-w-full sm:max-w-md h-full max-h-screen bg-white border-l border-[#e2e8f0] text-[#0f172a] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 font-sans min-h-0 focus:outline-none"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#e2e8f0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-red-600" />
            <h2
              id="cart-drawer-heading"
              className="text-base font-heading font-extrabold text-[#0f172a] uppercase tracking-wider"
            >
              Merch Bag ({totalQuantity})
            </h2>
            {isLoading && <Loader2 className="w-3.5 h-3.5 text-[#64748b] animate-spin" />}
          </div>
          <button
            ref={closeButtonRef}
            id="close-cart-drawer-btn"
            onClick={handleCloseDrawer}
            className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 touch-manipulation"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real Shopify Order Context Notice */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs font-mono text-[#64748b] flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5 text-[#0f172a]">
            <Truck className="w-3.5 h-3.5 text-red-600" />
            <span>Your merchandise bag</span>
          </span>
          <span className="text-[11px] font-bold text-red-600 uppercase">
            {headerCurrencyCode} Context
          </span>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b] shadow-xs">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-heading font-extrabold text-[#0f172a]">Your bag is empty</h3>
                <p className="text-xs text-[#64748b] mt-1 max-w-xs leading-relaxed">
                  Browse Sanelow apparel and accessories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleCloseDrawer();
                  onBrowseProducts();
                }}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              >
                Explore merch
              </button>
              {revalidationError && (
                <div
                  id="cart-checkout-error"
                  role="alert"
                  aria-live="assertive"
                  className="w-full max-w-xs p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2 text-left"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{revalidationError}</span>
                </div>
              )}
            </div>
          ) : (
            lines.map((line) => {
              const merchandise = line.merchandise;
              const product = merchandise.product;
              const unitMoney = parseCartMoney(merchandise?.price);
              const lineTotalMoney = parseCartMoney(line.cost?.totalAmount);
              const imageUrl =
                merchandise.image?.url ||
                'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=400&q=80';

              return (
                <div
                  key={line.id}
                  className="p-3 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] hover:border-red-600 transition-colors flex gap-3.5 relative group shadow-xs"
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-24 rounded-xl overflow-hidden bg-white shrink-0 border border-[#e2e8f0]">
                    <img
                      src={imageUrl}
                      alt={merchandise.title || product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-heading font-bold text-[#0f172a] line-clamp-1">
                          {product.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => handleItemRemove(line.id)}
                          disabled={isCartLockedForCheckoutPrep}
                          className="text-[#64748b] hover:text-red-600 p-0.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Selected Options Pills */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {merchandise.selectedOptions.map((opt) => (
                          <span
                            key={opt.name}
                            className="px-1.5 py-0.5 rounded bg-white border border-[#e2e8f0] text-[#0f172a] text-[10px] font-mono font-medium shadow-xs"
                          >
                            {opt.name}: <strong>{opt.value}</strong>
                          </span>
                        ))}
                        {merchandise.sku && (
                          <span className="px-1.5 py-0.5 rounded bg-white border border-[#e2e8f0] text-[#64748b] text-[10px] font-mono truncate max-w-full">
                            {merchandise.sku}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity + Real Shopify Line Total */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e2e8f0]">
                      <div className="flex items-center rounded-lg bg-white border border-[#e2e8f0] overflow-hidden shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleItemQuantityChange(line.id, Math.max(0, line.quantity - 1))}
                          className="px-2 py-0.5 text-xs text-[#64748b] hover:text-[#0f172a] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                          disabled={isCartLockedForCheckoutPrep}
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-mono font-bold text-[#0f172a]">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleItemQuantityChange(line.id, line.quantity + 1)}
                          className="px-2 py-0.5 text-xs text-[#64748b] hover:text-[#0f172a] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                          disabled={isCartLockedForCheckoutPrep}
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-red-600">
                          {lineTotalMoney ? lineTotalMoney.formatted : 'Unavailable'}
                        </div>
                        {line.quantity > 1 && (
                          <div className="text-[10px] font-mono text-[#64748b]">
                            {unitMoney ? `${unitMoney.formatted} each` : 'Unavailable'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Checkout & Promo */}
        {lines.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-[#e2e8f0] bg-white space-y-3 shrink-0 overflow-y-auto max-h-[50vh] sm:max-h-none">
            {/* Promo Code Input (Validated by Shopify) */}
            <form onSubmit={handleApplyPromo} className="space-y-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748b]" />
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Shopify discount code"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#0f172a] placeholder-[#64748b] focus:outline-none focus:border-red-600 uppercase font-mono shadow-xs focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
                    disabled={isCartLockedForCheckoutPrep}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCartLockedForCheckoutPrep || !promoInput.trim()}
                  className="px-3 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold font-mono uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                >
                  {isApplyingPromo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Apply</span>}
                </button>
              </div>

              {promoError && (
                <p className="text-[11px] text-red-600 font-mono flex items-center gap-1 pt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{promoError}</span>
                </p>
              )}

              {applicableCodes.map((d) => (
                <div
                  key={d.code}
                  className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800"
                >
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Shopify Code <strong>{d.code}</strong> Applied
                  </span>
                </div>
              ))}
            </form>

            {/* Calculations from Shopify Cart */}
            <div className="space-y-1.5 text-xs font-mono text-[#64748b] pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="shrink-0">Subtotal</span>
                <span className="text-[#0f172a] font-semibold text-right break-words">
                  {subtotalMoney ? subtotalMoney.formatted : 'Unavailable'}
                </span>
              </div>
              <p className="w-full text-[11px] leading-relaxed text-[#64748b] whitespace-normal break-words">
                Review shipping, taxes, discounts, and the final amount at checkout.
              </p>
              <div className="flex items-baseline justify-between gap-2 text-sm font-bold text-[#0f172a] pt-2 border-t border-[#e2e8f0]">
                <span className="shrink-0">Estimated Total</span>
                <span className="text-base font-mono font-bold text-red-600 text-right break-words">
                  {totalMoney ? totalMoney.formatted : 'Unavailable'}
                </span>
              </div>
              <div className="space-y-1 w-full text-[11px] leading-relaxed text-[#64748b] whitespace-normal break-words">
                <p>This estimate reflects the current cart and may change at checkout.</p>
                {hasSameCurrencyEstimateDifference && (
                  <p>
                    The current estimate differs from the subtotal. Review the breakdown at checkout.
                  </p>
                )}
              </div>
            </div>

            {/* Direct Redirect or Embedded Preview Link to Shopify Checkout */}
            {verifiedCheckoutUrl ? (
              <div className="space-y-2">
                <a
                  id="open-secure-checkout-btn"
                  href={verifiedCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    const mutationNowPending =
                      isLoading || isApplyingPromo || Boolean(getIsMutationPending?.());
                    if (
                      mutationNowPending ||
                      isRevalidating ||
                      !controllerRef.current?.canFollowPreparedLink({
                        isOpen,
                        isMutationPending: mutationNowPending,
                        mutationEpoch: cartMutationEpoch,
                      })
                    ) {
                      e.preventDefault();
                      if (mutationNowPending) {
                        controllerRef.current?.invalidateForMutationStart();
                      }
                    }
                  }}
                  className="w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none touch-manipulation text-center"
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Open secure checkout in a new tab</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </a>
                <div className="flex items-center justify-between px-1 text-[11px] text-[#64748b]">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> Continue to checkout
                  </span>
                  <button
                    type="button"
                    onClick={() => controllerRef.current?.clearPrepared()}
                    disabled={isCartLockedForCheckoutPrep}
                    className="text-[#64748b] hover:text-[#0f172a] underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Re-check bag
                  </button>
                </div>
              </div>
            ) : (
              <button
                id="proceed-to-checkout-btn"
                type="button"
                onClick={handleProceedToCheckout}
                disabled={isCartLockedForCheckoutPrep || !cart?.id || !cart?.checkoutUrl}
                className="w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none touch-manipulation"
              >
                {isRevalidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Bag with Shopify...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Proceed to Secure Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {revalidationError && (
              <div
                id="cart-checkout-error"
                role="alert"
                aria-live="assertive"
                className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{revalidationError}</span>
              </div>
            )}

            {/* Trust Seals */}
            <div className="flex items-center justify-center gap-3 pt-1 text-[11px] font-mono text-[#64748b]">
              <span className="flex items-center gap-1 text-[#64748b]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Review your order at checkout
              </span>
              <span>•</span>
              <span className="text-[#64748b]">Delivery options at checkout</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
