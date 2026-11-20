import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  ShoppingBag,
  Package,
  Truck,
  ExternalLink,
  ShieldCheck,
  LogOut,
  ChevronRight,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  AlertTriangle,
  MapPin,
  Layers,
  ChevronLeft,
  Heart,
  Search,
  Trash2,
  Info,
  HelpCircle,
} from 'lucide-react';
import {
  CustomerProfile,
  CustomerAccountOrder,
  CustomerOrdersPage,
  CustomerSession,
  Product,
} from '../types';
import {
  fetchCustomerSession,
  fetchCustomerDashboardData,
  fetchCustomerOrdersList,
  fetchCustomerProfileData,
  logoutCustomer,
  createLogoutAttemptId,
  formatPrice,
  SHOPIFY_CUSTOMER_ACCOUNT_URL,
  ENABLE_CUSTOM_CUSTOMER_ACCOUNTS,
} from '../lib/shopify';

export type DashboardTab = 'overview' | 'orders' | 'order-detail' | 'saved' | 'profile';
export type OrderStatusFilter = 'all' | 'fulfilled' | 'unfulfilled';

export interface OrderTrackingLink {
  company: string;
  number: string | null;
  url: string;
}

/**
 * Extract only genuine courier tracking links returned by the Shopify Customer Account API.
 * Never invents URLs or tracking milestones.
 */
export function getOrderTrackingLinks(order: CustomerAccountOrder): OrderTrackingLink[] {
  const links: OrderTrackingLink[] = [];
  for (const fulfillment of order.fulfillments || []) {
    for (const track of fulfillment.trackingInformation || []) {
      const url = typeof track.url === 'string' ? track.url.trim() : '';
      if (!url) continue;
      links.push({
        company: (typeof track.company === 'string' && track.company.trim()) || 'Courier tracking',
        number: typeof track.number === 'string' && track.number.trim() ? track.number.trim() : null,
        url,
      });
    }
  }
  return links;
}

/**
 * Filter currently loaded orders on the active page by search query and fulfillment status.
 * Search matches order number/name, item titles, variant titles, or courier tracking numbers/names.
 */
export function filterLoadedOrders(
  orders: CustomerAccountOrder[],
  searchQuery: string,
  statusFilter: OrderStatusFilter
): CustomerAccountOrder[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return orders.filter((order) => {
    const normalizedStatus = (order.fulfillmentStatus || '').trim().toUpperCase();
    if (statusFilter === 'fulfilled' && normalizedStatus !== 'FULFILLED') {
      return false;
    }
    if (statusFilter === 'unfulfilled' && normalizedStatus === 'FULFILLED') {
      return false;
    }

    if (!normalizedQuery) return true;

    const matchesOrderName =
      (order.name || '').toLowerCase().includes(normalizedQuery) ||
      (order.number !== undefined && order.number !== null && String(order.number).toLowerCase().includes(normalizedQuery));

    if (matchesOrderName) return true;

    const matchesLineItem = (order.lineItems || []).some(
      (item) =>
        (item.title || '').toLowerCase().includes(normalizedQuery) ||
        (item.variantTitle || '').toLowerCase().includes(normalizedQuery)
    );
    if (matchesLineItem) return true;

    const matchesTracking = (order.fulfillments || []).some((f) =>
      (f.trackingInformation || []).some(
        (t) =>
          (t.number || '').toLowerCase().includes(normalizedQuery) ||
          (t.company || '').toLowerCase().includes(normalizedQuery)
      )
    );
    return matchesTracking;
  });
}

function formatFulfillmentLabel(status: string): string {
  return (status || 'UNKNOWN').replace(/_/g, ' ');
}

function formatOrderDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================================
// Authoritative Dashboard Session & Orders Data Controller
// ============================================================================

export interface DashboardDataState {
  activeTab: DashboardTab;
  selectedOrderId: string | null;
  session: CustomerSession | null;
  isSessionLoading: boolean;
  profile: CustomerProfile | null;
  orders: CustomerAccountOrder[];
  isDataLoading: boolean;
  isPaginating: boolean;
  hasAttemptedOrdersLoad: boolean;
  hasOrdersPagination: boolean;
  dataError: string | null;
  sessionExpired: boolean;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface DashboardApiDependencies {
  fetchSession: () => Promise<CustomerSession>;
  fetchDashboardData: () => Promise<{
    profile: CustomerProfile | null;
    orders: CustomerAccountOrder[];
    error?: string;
    sessionExpired?: boolean;
  }>;
  fetchOrdersList: (
    cursor?: string,
    direction?: 'next' | 'prev'
  ) => Promise<CustomerOrdersPage & { error?: string; sessionExpired?: boolean }>;
  fetchProfileData: () => Promise<{
    profile: CustomerProfile | null;
    error?: string;
    sessionExpired?: boolean;
  }>;
}

export function createInitialDashboardState(
  initialTab: DashboardTab = 'overview',
  initialOrderId?: string
): DashboardDataState {
  return {
    activeTab: initialTab,
    selectedOrderId: initialOrderId || null,
    session: null,
    isSessionLoading: true,
    profile: null,
    orders: [],
    isDataLoading: false,
    isPaginating: false,
    hasAttemptedOrdersLoad: false,
    hasOrdersPagination: false,
    dataError: null,
    sessionExpired: false,
    hasNextPage: false,
    hasPrevPage: false,
    startCursor: null,
    endCursor: null,
  };
}

export class CustomerDashboardController {
  private state: DashboardDataState;
  private deps: DashboardApiDependencies;
  private listeners = new Set<(state: DashboardDataState) => void>();
  private sessionRequestId = 0;
  private ordersRequestId = 0;
  private profileRequestId = 0;
  private inFlightOrdersKey: string | null = null;
  private inFlightOrdersPromise: Promise<void> | null = null;
  private inFlightProfilePromise: Promise<void> | null = null;
  private disposed = false;

  constructor(
    deps: DashboardApiDependencies,
    initialTab: DashboardTab = 'overview',
    initialOrderId?: string
  ) {
    this.deps = deps;
    this.state = createInitialDashboardState(initialTab, initialOrderId);
  }

  getState(): DashboardDataState {
    return this.state;
  }

  subscribe(listener: (state: DashboardDataState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private setState(updater: Partial<DashboardDataState> | ((prev: DashboardDataState) => DashboardDataState)): void {
    if (this.disposed) return;
    this.state = typeof updater === 'function' ? updater(this.state) : { ...this.state, ...updater };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  async initialize(targetTab?: DashboardTab): Promise<void> {
    const reqId = ++this.sessionRequestId;
    if (targetTab !== undefined && targetTab !== this.state.activeTab) {
      this.setState({ activeTab: targetTab });
    }

    this.setState({
      isSessionLoading: true,
      dataError: null,
    });

    try {
      const sess = await this.deps.fetchSession();
      if (this.disposed || reqId !== this.sessionRequestId) return;

      this.setState({
        session: sess,
        isSessionLoading: false,
      });

      if (sess.authenticated) {
        const effectiveTab = this.state.activeTab;
        if (effectiveTab === 'orders' || effectiveTab === 'order-detail') {
          await Promise.all([this.loadOrdersPage(), this.loadProfile()]);
        } else {
          await this.loadDashboard();
        }
      }
    } catch (err: any) {
      if (this.disposed || reqId !== this.sessionRequestId) return;
      this.setState({
        isSessionLoading: false,
        dataError: err?.message || 'Failed to initialize session.',
      });
    }
  }

  async loadDashboard(): Promise<void> {
    const reqId = ++this.ordersRequestId;
    this.profileRequestId++;
    this.inFlightOrdersKey = null;
    this.inFlightOrdersPromise = null;

    const retainingOrders = this.state.orders.length > 0;
    this.setState({
      isDataLoading: !retainingOrders,
      isPaginating: retainingOrders,
      dataError: null,
      sessionExpired: false,
    });

    try {
      const res = await this.deps.fetchDashboardData();
      if (this.disposed || reqId !== this.ordersRequestId) return;

      if (res.sessionExpired) {
        this.setState((prev) => ({
          ...prev,
          sessionExpired: true,
          session: prev.session ? { ...prev.session, authenticated: false } : null,
          isDataLoading: false,
          isPaginating: false,
        }));
        return;
      }

      if (res.error) {
        this.setState({
          dataError: res.error,
          hasAttemptedOrdersLoad: true,
          isDataLoading: false,
          isPaginating: false,
        });
      } else {
        this.setState({
          profile: res.profile,
          orders: res.orders,
          hasAttemptedOrdersLoad: true,
          hasOrdersPagination: false,
          hasNextPage: false,
          hasPrevPage: false,
          startCursor: null,
          endCursor: null,
          isDataLoading: false,
          isPaginating: false,
        });
      }
    } catch (err: any) {
      if (this.disposed || reqId !== this.ordersRequestId) return;
      this.setState({
        dataError: err?.message || 'Failed to load dashboard data.',
        hasAttemptedOrdersLoad: true,
        isDataLoading: false,
        isPaginating: false,
      });
    }
  }

  loadOrdersPage(cursor?: string, direction?: 'next' | 'prev'): Promise<void> {
    const requestKey = `${cursor ?? ''}|${direction ?? ''}`;
    if (this.inFlightOrdersPromise && this.inFlightOrdersKey === requestKey) {
      return this.inFlightOrdersPromise;
    }

    const reqId = ++this.ordersRequestId;
    const retainingOrders = this.state.orders.length > 0;

    this.setState({
      isDataLoading: !retainingOrders,
      isPaginating: retainingOrders,
      dataError: null,
      sessionExpired: false,
    });

    const promise = (async () => {
      try {
        const res = await this.deps.fetchOrdersList(cursor, direction);
        if (this.disposed || reqId !== this.ordersRequestId) return;

        if (res.sessionExpired) {
          this.setState((prev) => ({
            ...prev,
            sessionExpired: true,
            session: prev.session ? { ...prev.session, authenticated: false } : null,
            isDataLoading: false,
            isPaginating: false,
          }));
          return;
        }

        if (res.error) {
          this.setState({
            dataError: res.error,
            hasAttemptedOrdersLoad: true,
            isDataLoading: false,
            isPaginating: false,
          });
        } else {
          this.setState({
            orders: res.orders,
            hasNextPage: Boolean(res.pageInfo?.hasNextPage),
            hasPrevPage: Boolean(res.pageInfo?.hasPreviousPage),
            startCursor: res.pageInfo?.startCursor || null,
            endCursor: res.pageInfo?.endCursor || null,
            hasOrdersPagination: true,
            hasAttemptedOrdersLoad: true,
            isDataLoading: false,
            isPaginating: false,
          });
        }
      } catch (err: any) {
        if (this.disposed || reqId !== this.ordersRequestId) return;
        this.setState({
          dataError: err?.message || 'Failed to load orders.',
          hasAttemptedOrdersLoad: true,
          isDataLoading: false,
          isPaginating: false,
        });
      } finally {
        if (this.inFlightOrdersPromise === promise) {
          this.inFlightOrdersPromise = null;
          this.inFlightOrdersKey = null;
        }
      }
    })();

    this.inFlightOrdersKey = requestKey;
    this.inFlightOrdersPromise = promise;
    return promise;
  }

  loadProfile(): Promise<void> {
    if (this.inFlightProfilePromise) {
      return this.inFlightProfilePromise;
    }

    const reqId = ++this.profileRequestId;
    const promise = (async () => {
      try {
        const res = await this.deps.fetchProfileData();
        if (this.disposed || reqId !== this.profileRequestId) return;

        if (res.sessionExpired) {
          this.setState((prev) => ({
            ...prev,
            sessionExpired: true,
            session: prev.session ? { ...prev.session, authenticated: false } : null,
          }));
          return;
        }
        if (res.profile) {
          this.setState({ profile: res.profile });
        }
      } catch {
        // Profile refresh failure falls back to existing profile/session data without wiping orders
      } finally {
        if (this.inFlightProfilePromise === promise) {
          this.inFlightProfilePromise = null;
        }
      }
    })();

    this.inFlightProfilePromise = promise;
    return promise;
  }

  selectTab(tab: DashboardTab): void {
    this.setState({
      activeTab: tab,
      selectedOrderId: null,
    });

    if (
      (tab === 'orders' || tab === 'order-detail') &&
      this.state.session?.authenticated &&
      !this.state.hasOrdersPagination &&
      !this.state.isDataLoading &&
      !this.state.isPaginating
    ) {
      void this.loadOrdersPage();
    } else if (tab === 'profile' && this.state.session?.authenticated) {
      void this.loadProfile();
    }
  }

  syncRouteProps(initialTab?: DashboardTab, initialOrderId?: string): void {
    const nextTab = initialTab ?? this.state.activeTab;
    const nextOrderId = initialOrderId ?? null;
    if (nextTab === this.state.activeTab && nextOrderId === this.state.selectedOrderId) {
      return;
    }

    this.setState({
      activeTab: nextTab,
      selectedOrderId: nextOrderId,
    });

    if (
      (nextTab === 'orders' || nextTab === 'order-detail') &&
      this.state.session?.authenticated &&
      !this.state.hasOrdersPagination &&
      !this.state.isDataLoading &&
      !this.state.isPaginating
    ) {
      void this.loadOrdersPage();
    }
  }

  selectOrder(orderId: string): void {
    this.setState({
      selectedOrderId: orderId,
      activeTab: 'order-detail',
    });
  }

  clearSelectedOrder(): void {
    this.setState({
      selectedOrderId: null,
      activeTab: 'orders',
    });
  }

  markSessionUnauthenticated(): void {
    this.setState((prev) => ({
      ...prev,
      sessionExpired: true,
      session: prev.session ? { ...prev.session, authenticated: false } : null,
    }));
  }
}

export function createCustomerDashboardController(
  deps: DashboardApiDependencies,
  initialTab: DashboardTab = 'overview',
  initialOrderId?: string
): CustomerDashboardController {
  return new CustomerDashboardController(deps, initialTab, initialOrderId);
}

export interface ControllerRefObject<T> {
  current: T | null;
}

export interface CustomerDashboardLifecycleOptions {
  controllerRef: ControllerRefObject<CustomerDashboardController>;
  deps: DashboardApiDependencies;
  getRoute: () => { initialTab: DashboardTab; initialOrderId?: string };
  onStateChange: (state: DashboardDataState) => void;
}

/**
 * Authoritative mount/cleanup lifecycle for CustomerDashboard's controller.
 * Creates a fresh controller per effect setup so React <StrictMode> setup -> cleanup -> setup
 * never reuses a disposed controller, while cleanup disposes only its own instance.
 */
export function bindCustomerDashboardLifecycle({
  controllerRef,
  deps,
  getRoute,
  onStateChange,
}: CustomerDashboardLifecycleOptions): () => void {
  const { initialTab, initialOrderId } = getRoute();
  const controller = createCustomerDashboardController(deps, initialTab, initialOrderId);
  controllerRef.current = controller;

  const unsubscribe = controller.subscribe(onStateChange);
  onStateChange(controller.getState());
  void controller.initialize(initialTab);

  return () => {
    unsubscribe();
    controller.dispose();
    if (controllerRef.current === controller) {
      controllerRef.current = null;
    }
  };
}

export interface ExecuteDashboardLogoutOptions {
  activeLogoutAttemptRef: { current: string | null };
  isLoggingOut: boolean;
  setIsLoggingOut: (value: boolean) => void;
  setLogoutError: (value: string | null) => void;
  performLogout?: () => Promise<{ success: boolean; logoutUrl?: string; error?: string }>;
  createAttemptId?: () => string;
  eventTarget?: Pick<EventTarget, 'dispatchEvent'>;
  onRedirect?: (logoutUrl?: string) => void;
}

/**
 * Production CustomerDashboard logout runner that creates a non-sensitive logoutAttemptId
 * and correlates customer-logout-started, customer-logout-completed, and customer-logout-failed events.
 */
export async function executeDashboardLogout(options: ExecuteDashboardLogoutOptions): Promise<string | null> {
  if (options.isLoggingOut) return null;
  const createId = options.createAttemptId ?? createLogoutAttemptId;
  const attemptId = createId();
  options.activeLogoutAttemptRef.current = attemptId;
  options.setIsLoggingOut(true);
  options.setLogoutError(null);

  const target = options.eventTarget ?? (typeof window !== 'undefined' ? window : undefined);
  target?.dispatchEvent(
    new CustomEvent('customer-logout-started', { detail: { logoutAttemptId: attemptId } })
  );

  const performLogout = options.performLogout ?? logoutCustomer;
  try {
    const res = await performLogout();
    if (res.success) {
      options.activeLogoutAttemptRef.current = null;
      target?.dispatchEvent(
        new CustomEvent('customer-logout-completed', { detail: { logoutAttemptId: attemptId } })
      );
      if (options.onRedirect) {
        options.onRedirect(res.logoutUrl);
      } else if (typeof window !== 'undefined') {
        if (res.logoutUrl) {
          window.location.href = res.logoutUrl;
        } else {
          window.location.reload();
        }
      }
    } else {
      options.setIsLoggingOut(false);
      options.setLogoutError(res.error || 'Failed to sign out. Please try again.');
      target?.dispatchEvent(
        new CustomEvent('customer-logout-failed', {
          detail: { error: res.error, logoutAttemptId: attemptId },
        })
      );
    }
  } catch (err: any) {
    options.setIsLoggingOut(false);
    options.setLogoutError(err?.message || 'Network error during sign out.');
    target?.dispatchEvent(
      new CustomEvent('customer-logout-failed', {
        detail: { error: err?.message, logoutAttemptId: attemptId },
      })
    );
  }
  return attemptId;
}

export interface ExecuteDashboardResumeSessionOptions {
  activeLogoutAttemptRef: { current: string | null };
  setLogoutError: (value: string | null) => void;
  setIsLoggingOut: (value: boolean) => void;
  controller: CustomerDashboardController | null;
  eventTarget?: Pick<EventTarget, 'dispatchEvent'>;
}

/**
 * Production CustomerDashboard recovery runner that propagates the correlated logoutAttemptId
 * on customer-logout-recovered and reloads the active dashboard view.
 */
export function executeDashboardResumeSession(options: ExecuteDashboardResumeSessionOptions): string | null {
  const attemptId = options.activeLogoutAttemptRef.current;
  options.activeLogoutAttemptRef.current = null;
  options.setLogoutError(null);
  options.setIsLoggingOut(false);

  const target = options.eventTarget ?? (typeof window !== 'undefined' ? window : undefined);
  target?.dispatchEvent(
    new CustomEvent(
      'customer-logout-recovered',
      attemptId ? { detail: { logoutAttemptId: attemptId } } : undefined
    )
  );

  const controller = options.controller;
  if (controller) {
    const currentTab = controller.getState().activeTab;
    if (currentTab === 'orders' || currentTab === 'order-detail') {
      void controller.loadOrdersPage();
      void controller.loadProfile();
    } else {
      void controller.loadDashboard();
    }
  }
  return attemptId;
}

const GENERIC_SIGNED_OUT_AUTH_ERROR = 'Sign in could not be completed. Please try again.';

const KNOWN_AUTH_ERROR_MESSAGES = new Map<string, string>([
  ['access_denied', 'Sign in was cancelled or denied. You can try signing in again below.'],
  ['token_exchange_failed', 'Unable to complete sign in with Shopify. Please try again.'],
  ['invalid_token_payload', 'We could not verify your Shopify sign-in response. Please try again.'],
  ['tester_session_revoked', 'Your tester access session ended. Re-verify tester access or sign in again.'],
]);

/**
 * Resolves a safe, user-facing authentication error message for the signed-out view
 * from either controller dataError or URL query auth_error codes returned by /api/auth.
 * Uses a Map so inherited Object.prototype keys (e.g. "__proto__", "constructor", "toString")
 * always resolve to the generic fallback message.
 */
export function resolveSignedOutAuthErrorMessage(
  authErrorCode?: string | null,
  fallbackError?: string | null
): string | null {
  const code = typeof authErrorCode === 'string' ? authErrorCode.trim() : '';
  if (code) {
    return KNOWN_AUTH_ERROR_MESSAGES.get(code) ?? GENERIC_SIGNED_OUT_AUTH_ERROR;
  }
  const cleanFallback = typeof fallbackError === 'string' ? fallbackError.trim() : '';
  return cleanFallback || null;
}

/**
 * Prevents duplicate sign-in navigation requests on rapid repeated clicks while preserving
 * modifier/middle-click browser behavior.
 */
export function guardSignInNavigationClick(params: {
  event: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    button?: number;
    preventDefault: () => void;
  };
  isSigningInRef: { current: boolean };
  isSigningInState: boolean;
  setIsSigningIn: (value: boolean) => void;
}): boolean {
  const { event, isSigningInRef, isSigningInState, setIsSigningIn } = params;
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (event.button !== undefined && event.button !== 0)
  ) {
    return false;
  }
  if (isSigningInRef.current || isSigningInState) {
    event.preventDefault();
    return false;
  }
  isSigningInRef.current = true;
  setIsSigningIn(true);
  return true;
}

export interface CustomerDashboardSignedOutViewProps {
  sessionExpired?: boolean;
  authError?: string | null;
  hostedUrl: string;
  loginHref?: string;
  isSigningIn?: boolean;
  onStartSignIn?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onNavigateHome: () => void;
}

export function CustomerDashboardSignedOutView({
  sessionExpired = false,
  authError = null,
  hostedUrl,
  loginHref = '/api/auth?action=login&returnTo=/account',
  isSigningIn = false,
  onStartSignIn,
  onNavigateHome,
}: CustomerDashboardSignedOutViewProps) {
  return (
    <div className="w-full bg-[#f8fafc] border-t border-[#e2e8f0] font-sans text-[#0f172a]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch rounded-2xl overflow-hidden border border-[#e2e8f0] bg-white shadow-sm">
          {/* Dark Navy Brand Panel */}
          <section
            aria-label="Sanelow Merch customer space"
            className="lg:col-span-6 bg-[#0f172a] text-white p-6 sm:p-10 lg:p-12 flex flex-col justify-between gap-8 lg:gap-12 min-w-0"
          >
            <div className="space-y-6 lg:space-y-8 min-w-0">
              {/* Brand Lockup */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden border border-slate-700 bg-black shrink-0">
                  <img
                    src="/sanelow-logo.jpg"
                    alt="Sanelow"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-heading font-bold tracking-tight text-white">
                    Sanelow Merch
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    Customer account
                  </p>
                </div>
              </div>

              {/* Headline & Supporting Copy */}
              <div className="space-y-3 sm:space-y-4">
                <h1 className="text-3xl sm:text-4xl lg:text-[2.625rem] font-heading font-extrabold tracking-tight text-white leading-[1.1] text-balance">
                  Your merch. Your space.
                </h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
                  Access your orders and keep your favourite merch close.
                </p>
              </div>
            </div>

            {/* Quiet Hairline Footer on Brand Panel */}
            <div className="pt-5 sm:pt-6 border-t border-slate-800 space-y-2 min-w-0">
              <p className="text-xs text-slate-300 leading-relaxed">
                Saved items stay in this browser and are separated by account.
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Orders <span aria-hidden="true">·</span> Saved items <span aria-hidden="true">·</span> Profile
              </p>
            </div>
          </section>

          {/* Clean Light Sign-In Panel */}
          <section
            aria-labelledby="customer-signin-heading"
            className="lg:col-span-6 bg-white p-6 sm:p-10 lg:p-12 flex flex-col justify-between gap-8 min-w-0"
          >
            <div className="space-y-6 min-w-0">
              <div className="space-y-2">
                <p className="text-[11px] font-mono font-semibold text-[#DC2626] tracking-wide">
                  Account sign in
                </p>
                <h2
                  id="customer-signin-heading"
                  className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-[#0f172a]"
                >
                  Welcome back.
                </h2>
                <p className="text-sm text-[#475569] leading-relaxed">
                  Sign in with your Shopify account to view your orders and profile details.
                </p>
              </div>

              {(sessionExpired || authError) && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3"
                >
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1 text-xs leading-relaxed min-w-0">
                    <p className="font-semibold text-red-950">
                      {sessionExpired ? 'Session expired' : 'Sign in error'}
                    </p>
                    <p className="text-red-800">
                      {authError ||
                        'Your session expired. Sign in again to access your customer account.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-1">
                <a
                  href={loginHref}
                  onClick={onStartSignIn}
                  aria-disabled={isSigningIn ? 'true' : undefined}
                  aria-busy={isSigningIn ? 'true' : undefined}
                  className={`w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-[#DC2626] hover:bg-[#b91c1c] text-white rounded-xl text-sm font-semibold tracking-wide transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 motion-reduce:transition-none ${
                    isSigningIn ? 'opacity-75 pointer-events-none cursor-wait' : 'cursor-pointer'
                  }`}
                >
                  {isSigningIn ? (
                    <>
                      <RefreshCw
                        className="w-4 h-4 animate-spin motion-reduce:animate-none shrink-0"
                        aria-hidden="true"
                      />
                      <span>Redirecting to Shopify…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in with Shopify</span>
                      <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                    </>
                  )}
                </a>

                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] rounded-xl text-sm font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  <ArrowLeft className="w-4 h-4 text-[#64748b] shrink-0" aria-hidden="true" />
                  <span>Continue shopping</span>
                </button>
              </div>
            </div>

            <div className="pt-5 border-t border-[#e2e8f0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748b]">
              <span>Need help accessing your account?</span>
              <a
                href={hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-[#475569] hover:text-[#0f172a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded px-1 whitespace-nowrap shrink-0 motion-reduce:transition-none"
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Account help</span>
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export interface CustomerDashboardProps {
  initialTab?: DashboardTab;
  initialOrderId?: string;
  onNavigateHome: () => void;
  currency?: string;
  savedItems?: Product[];
  isSavedItemsDisabled?: boolean;
  isSessionVerifying?: boolean;
  onToggleSavedItem?: (product: Product) => void;
  onAddToCartFromSaved?: (product: Product) => void;
  onViewSavedProduct?: (product: Product) => void;
  onRetrySession?: () => void;
}

export interface CustomerDashboardAuthenticatedViewProps {
  activeTab: DashboardTab;
  selectedOrderId: string | null;
  customerDisplayName: string;
  customerEmail: string;
  profile: CustomerProfile | null;
  orders: CustomerAccountOrder[];
  activeOrder: CustomerAccountOrder | null;
  isDataLoading: boolean;
  isPaginating: boolean;
  hasAttemptedOrdersLoad?: boolean;
  dataError: string | null;
  isLoggingOut: boolean;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
  orderSearch: string;
  orderStatusFilter: OrderStatusFilter;
  hostedUrl: string;
  currency: string;
  savedItems: Product[];
  isSavedItemsDisabled: boolean;
  isSessionVerifying?: boolean;
  onSelectTab: (tab: DashboardTab) => void;
  onSelectOrder: (orderId: string) => void;
  onClearSelectedOrder: () => void;
  onOrderSearchChange: (value: string) => void;
  onOrderStatusFilterChange: (filter: OrderStatusFilter) => void;
  onResetOrderFilters: () => void;
  onRefreshDashboard: () => void;
  onLoadOrdersPage: (cursor?: string, direction?: 'next' | 'prev') => void;
  onNavigateHome: () => void;
  onLogout: () => void;
  onToggleSavedItem?: (product: Product) => void;
  onAddToCartFromSaved?: (product: Product) => void;
  onViewSavedProduct?: (product: Product) => void;
  onRetrySession?: () => void;
}

export function CustomerDashboardAuthenticatedView({
  activeTab,
  selectedOrderId,
  customerDisplayName,
  customerEmail,
  profile,
  orders,
  activeOrder,
  isDataLoading,
  isPaginating,
  hasAttemptedOrdersLoad = true,
  dataError,
  isLoggingOut,
  hasNextPage,
  hasPrevPage,
  startCursor,
  endCursor,
  orderSearch,
  orderStatusFilter,
  hostedUrl,
  currency,
  savedItems,
  isSavedItemsDisabled,
  isSessionVerifying = false,
  onSelectTab,
  onSelectOrder,
  onClearSelectedOrder,
  onOrderSearchChange,
  onOrderStatusFilterChange,
  onResetOrderFilters,
  onRefreshDashboard,
  onLoadOrdersPage,
  onNavigateHome,
  onLogout,
  onToggleSavedItem,
  onAddToCartFromSaved,
  onViewSavedProduct,
  onRetrySession,
}: CustomerDashboardAuthenticatedViewProps) {
  const isWaitingForOrders = orders.length === 0 && (isDataLoading || isPaginating || !hasAttemptedOrdersLoad);
  const ordersLoadFailed = !isWaitingForOrders && Boolean(dataError && orders.length === 0);

  const filteredOrders = useMemo(
    () => filterLoadedOrders(orders, orderSearch, orderStatusFilter),
    [orders, orderSearch, orderStatusFilter]
  );

  const isOrdersSection = activeTab === 'orders' || activeTab === 'order-detail' || Boolean(selectedOrderId);

  // Deduplicate saved addresses vs defaultAddress for clean read-only display
  const additionalAddresses = useMemo(() => {
    const list = profile?.addresses || [];
    if (!profile?.defaultAddress?.id) return list;
    return list.filter((addr) => addr.id !== profile.defaultAddress?.id);
  }, [profile]);

  const navItems: Array<{
    id: Exclude<DashboardTab, 'order-detail'>;
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    badge?: number;
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Layers className="w-4 h-4 shrink-0" />,
      isActive: activeTab === 'overview' && !selectedOrderId,
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: <Package className="w-4 h-4 shrink-0" />,
      isActive: isOrdersSection,
      badge: !isWaitingForOrders && !ordersLoadFailed && orders.length > 0 ? orders.length : undefined,
    },
    {
      id: 'saved',
      label: 'Saved items',
      icon: <Heart className="w-4 h-4 shrink-0" />,
      isActive: activeTab === 'saved' && !selectedOrderId,
      badge: !isSavedItemsDisabled && savedItems.length > 0 ? savedItems.length : undefined,
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: <User className="w-4 h-4 shrink-0" />,
      isActive: activeTab === 'profile' && !selectedOrderId,
    },
  ];

  const isSavedViewOnlyLoading = activeTab === 'saved' && !selectedOrderId;
  const shouldShowMainBlockingLoader = isWaitingForOrders && !isSavedViewOnlyLoading && activeTab !== 'profile';

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen border-t border-[#e2e8f0] font-sans text-[#0f172a]">
      {/* Top Account Banner */}
      <header className="bg-[#0f172a] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-700 bg-black shrink-0">
                <img
                  src="/sanelow-logo.jpg"
                  alt="Sanelow"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
                  Customer Account
                </p>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-heading font-extrabold tracking-tight text-white truncate">
                  {customerDisplayName}
                </h1>
                {customerEmail && (
                  <p className="text-xs text-slate-400 font-mono truncate">{customerEmail}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onNavigateHome}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold uppercase tracking-wider transition-colors border border-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Shop merch</span>
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a] motion-reduce:transition-none disabled:opacity-50"
              >
                <LogOut className={`w-4 h-4 ${isLoggingOut ? 'animate-spin' : ''}`} />
                <span>{isLoggingOut ? 'Signing Out...' : 'Sign out'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Desktop Sidebar & Accessible Mobile Section Navigation */}
          <aside className="lg:col-span-3 space-y-4">
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-2 lg:p-3">
              <nav aria-label="Account sections" className="flex flex-row lg:flex-col gap-1 overflow-x-auto">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={item.isActive ? 'page' : undefined}
                    onClick={() => onSelectTab(item.id)}
                    className={`flex-1 lg:flex-none flex items-center justify-between gap-2.5 min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                      item.isActive
                        ? 'bg-[#0f172a] text-white'
                        : 'text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={item.isActive ? 'text-red-500' : 'text-[#64748b]'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
                          item.isActive
                            ? 'bg-slate-800 text-slate-200'
                            : 'bg-[#f8fafc] text-[#475569] border border-[#e2e8f0]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              {/* Secondary Account Actions */}
              <div className="mt-2 pt-2 lg:mt-3 lg:pt-3 border-t border-[#e2e8f0] flex flex-wrap items-center justify-between gap-2 px-2">
                <a
                  href={hostedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[36px] text-xs text-[#64748b] hover:text-[#0f172a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                >
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Account help</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={onLogout}
                  className="hidden lg:inline-flex items-center gap-1.5 min-h-[36px] text-xs font-medium text-[#64748b] hover:text-red-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1 disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Panel */}
          <main className="lg:col-span-9 space-y-6 min-w-0">
            {/* Error Banner when existing orders are retained */}
            {dataError && orders.length > 0 && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-800">
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-red-900">Account request issue</p>
                    <p>{dataError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (isOrdersSection ? onLoadOrdersPage() : onRefreshDashboard())}
                  className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Loading State (prevents false empty state when orders are still fetching) */}
            {shouldShowMainBlockingLoader && (
              <div
                role="status"
                aria-live="polite"
                className="bg-white border border-[#e2e8f0] rounded-2xl p-12 text-center"
              >
                <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-mono uppercase tracking-widest text-[#64748b]">
                  Loading your account details...
                </p>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 1: ACCOUNT OVERVIEW */}
            {/* ------------------------------------------------------------- */}
            {!shouldShowMainBlockingLoader && activeTab === 'overview' && !selectedOrderId && (
              <div className="space-y-6">
                {/* Welcome & Quick Actions */}
                <section className="bg-white border border-[#e2e8f0] rounded-2xl p-6 space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-lg font-heading font-extrabold tracking-tight text-[#0f172a]">
                      Welcome back, {customerDisplayName}
                    </h2>
                    <p className="text-sm text-[#64748b]">
                      Review your orders, open courier tracking when available, check saved items in this browser, or view your profile details.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectTab('orders')}
                      className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <Package className="w-4 h-4 text-red-500" />
                      <span>View orders</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectTab('saved')}
                      className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <Heart className="w-4 h-4 text-red-600" />
                      <span>Saved items</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectTab('profile')}
                      className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <User className="w-4 h-4 text-[#475569]" />
                      <span>Profile</span>
                    </button>

                    <button
                      type="button"
                      onClick={onNavigateHome}
                      className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <ShoppingBag className="w-4 h-4 text-red-600" />
                      <span>Shop merch</span>
                    </button>
                  </div>
                </section>

                {/* Truthful Summary Cards (Explicitly Loaded-Page Scoped) */}
                <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748b]">
                      Orders shown
                    </span>
                    <p className="text-2xl font-heading font-extrabold text-[#0f172a] tabular-nums">
                      {ordersLoadFailed ? '—' : orders.length}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      {ordersLoadFailed
                        ? 'Unable to load orders'
                        : hasNextPage || hasPrevPage
                        ? 'Loaded on current page'
                        : 'On currently loaded page'}
                    </p>
                  </div>

                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748b]">
                      First order on loaded page
                    </span>
                    {ordersLoadFailed ? (
                      <>
                        <p className="text-sm font-heading font-bold text-red-700">Unavailable</p>
                        <p className="text-xs text-[#64748b]">Order request failed</p>
                      </>
                    ) : orders.length > 0 ? (
                      <>
                        <p className="text-sm font-heading font-bold text-[#0f172a]">
                          {orders[0].name} · {formatFulfillmentLabel(orders[0].fulfillmentStatus)}
                        </p>
                        <p className="text-xs text-[#64748b] font-mono tabular-nums">
                          {formatOrderDate(orders[0].processedAt)} · {orders[0].financialStatus}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-heading font-bold text-[#475569]">No orders yet</p>
                        <p className="text-xs text-[#64748b]">Orders appear after checkout</p>
                      </>
                    )}
                  </div>

                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748b]">
                      Saved items
                    </span>
                    <p className="text-2xl font-heading font-extrabold text-[#0f172a] tabular-nums">
                      {isSavedItemsDisabled ? '—' : savedItems.length}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      {isSavedItemsDisabled
                        ? isSessionVerifying
                          ? 'Verifying account…'
                          : 'Session unresolved'
                        : 'Saved in this browser'}
                    </p>
                  </div>
                </section>

                {/* Loaded Orders Preview Section */}
                <section className="bg-white border border-[#e2e8f0] rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-4 gap-3">
                    <div>
                      <h2 className="text-base font-heading font-extrabold tracking-tight text-[#0f172a]">
                        Orders on loaded page
                      </h2>
                      <p className="text-xs text-[#64748b]">
                        Showing up to 3 orders from the currently loaded page.
                      </p>
                    </div>

                    {orders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onSelectTab('orders')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-[#b91c1c] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                      >
                        <span>View orders</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {isPaginating && orders.length > 0 && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="px-3.5 py-2 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs font-mono text-[#475569] flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-600 shrink-0" />
                      <span>Refreshing orders...</span>
                    </div>
                  )}

                  {ordersLoadFailed ? (
                    <div className="py-10 text-center space-y-4">
                      <div className="w-12 h-12 mx-auto rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-heading font-bold text-[#0f172a]">
                          Unable to load orders
                        </p>
                        <p className="text-xs text-[#64748b] max-w-md mx-auto">
                          {dataError}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={onRefreshDashboard}
                          className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 bg-red-600 hover:bg-[#b91c1c] text-white rounded-xl text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                        <button
                          type="button"
                          onClick={onNavigateHome}
                          className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] rounded-xl text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <span>Shop merch</span>
                        </button>
                      </div>
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="py-10 text-center space-y-4">
                      <div className="w-12 h-12 mx-auto rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b]">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-heading font-bold text-[#0f172a]">
                          No orders yet
                        </p>
                        <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                          Orders completed with your account email will show here once synced.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onNavigateHome}
                        className="inline-flex items-center gap-2 min-h-[40px] px-5 py-2 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Shop merch</span>
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#e2e8f0]">
                      {orders.slice(0, 3).map((order) => {
                        const trackingLinks = getOrderTrackingLinks(order);
                        return (
                          <div
                            key={order.id}
                            className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <span className="text-sm font-mono font-bold text-[#0f172a] tabular-nums">
                                  {order.name}
                                </span>
                                <span className="text-xs text-[#94a3b8]">·</span>
                                <span className="text-xs text-[#64748b] font-mono tabular-nums">
                                  {formatOrderDate(order.processedAt)}
                                </span>
                                <span className="text-xs text-[#94a3b8]">·</span>
                                <span className="text-xs font-mono font-semibold text-[#0f172a] tabular-nums">
                                  {formatPrice(order.totalPrice.amount, order.totalPrice.currencyCode)}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span
                                  className={`font-mono font-semibold uppercase ${
                                    order.fulfillmentStatus === 'FULFILLED'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {formatFulfillmentLabel(order.fulfillmentStatus)}
                                </span>
                                <span className="text-[#cbd5e1]">/</span>
                                <span className="text-[#64748b] font-mono uppercase">
                                  {order.financialStatus}
                                </span>
                                {trackingLinks.length > 0 && (
                                  <>
                                    <span className="text-[#cbd5e1]">/</span>
                                    <a
                                      href={trackingLinks[0].url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 font-medium text-red-600 hover:text-[#b91c1c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                                    >
                                      <span>Track ({trackingLinks[0].company})</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onSelectOrder(order.id)}
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                            >
                              <span>Details & tracking</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 2: ORDERS & LOADED-PAGE SEARCH / FILTERS */}
            {/* ------------------------------------------------------------- */}
            {!shouldShowMainBlockingLoader && activeTab === 'orders' && !selectedOrderId && (
              <section
                aria-busy={isPaginating ? 'true' : undefined}
                className="bg-white border border-[#e2e8f0] rounded-2xl p-6 space-y-6"
              >
                <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-heading font-extrabold tracking-tight text-[#0f172a]">
                      Orders
                    </h2>
                    <p className="text-xs text-[#64748b]">
                      Loaded-page view: search and status filters apply to the orders currently loaded on this page.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isPaginating}
                    onClick={() => onLoadOrdersPage()}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-xs text-[#475569] hover:text-[#0f172a] font-mono transition-colors self-start cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPaginating ? 'animate-spin text-red-600' : ''}`} />
                    <span>{isPaginating ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>

                {isPaginating && orders.length > 0 && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="px-3.5 py-2.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs font-mono text-[#475569] flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-600 shrink-0" />
                    <span>Refreshing orders...</span>
                  </div>
                )}

                {ordersLoadFailed ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-heading font-bold text-[#0f172a]">
                        Unable to load orders
                      </h3>
                      <p className="text-xs text-[#64748b] max-w-md mx-auto">
                        {dataError}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => onLoadOrdersPage()}
                        className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 bg-red-600 hover:bg-[#b91c1c] text-white rounded-xl text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={onNavigateHome}
                        className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] rounded-xl text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      >
                        <span>Shop merch</span>
                      </button>
                    </div>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b]">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-heading font-bold text-[#0f172a]">
                        No orders yet
                      </h3>
                      <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                        Once you complete a purchase with this email, order details and tracking will appear here.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onNavigateHome}
                      className="inline-flex items-center gap-2 min-h-[40px] px-5 py-2 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Shop merch</span>
                    </button>
                  </div>
                ) : (
                  <div className={`space-y-5 ${isPaginating ? 'opacity-75 transition-opacity' : ''}`}>
                    {/* Search & Fulfillment Status Filters */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={orderSearch}
                          onChange={(e) => onOrderSearchChange(e.target.value)}
                          placeholder="Search loaded orders by #, item, or tracking #"
                          aria-label="Search loaded orders"
                          className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] focus:bg-white text-xs text-[#0f172a] placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                        />
                      </div>

                      <div
                        role="group"
                        aria-label="Filter loaded orders by fulfillment status"
                        className="inline-flex flex-wrap items-center gap-1.5"
                      >
                        {(
                          [
                            { id: 'all', label: 'All' },
                            { id: 'fulfilled', label: 'Fulfilled' },
                            { id: 'unfulfilled', label: 'Not fully fulfilled' },
                          ] as Array<{ id: OrderStatusFilter; label: string }>
                        ).map((filterOption) => {
                          const isSelected = orderStatusFilter === filterOption.id;
                          return (
                            <button
                              key={filterOption.id}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => onOrderStatusFilterChange(filterOption.id)}
                              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                                isSelected
                                  ? 'bg-[#0f172a] text-white'
                                  : 'bg-[#f8fafc] text-[#475569] border border-[#e2e8f0] hover:text-[#0f172a]'
                              }`}
                            >
                              {filterOption.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <p className="text-xs font-mono text-[#64748b] tabular-nums">
                      Showing {filteredOrders.length} of {orders.length} loaded{' '}
                      {orders.length === 1 ? 'order' : 'orders'} on this page.
                    </p>

                    {filteredOrders.length === 0 ? (
                      <div className="py-10 text-center space-y-3 border border-dashed border-[#e2e8f0] rounded-xl bg-[#f8fafc]">
                        <p className="text-sm font-heading font-bold text-[#0f172a]">
                          No loaded orders match your filters
                        </p>
                        <p className="text-xs text-[#64748b]">
                          Try clearing your search or switching the fulfillment status filter.
                        </p>
                        <button
                          type="button"
                          onClick={onResetOrderFilters}
                          className="inline-flex items-center justify-center min-h-[38px] px-4 py-1.5 rounded-xl bg-white border border-[#e2e8f0] text-xs font-semibold text-[#0f172a] hover:bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          Reset filters
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredOrders.map((order) => {
                          const trackingLinks = getOrderTrackingLinks(order);
                          return (
                            <article
                              key={order.id}
                              className="border border-[#e2e8f0] rounded-xl p-5 bg-[#f8fafc] hover:border-[#cbd5e1] transition-colors space-y-4"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className="text-sm font-heading font-extrabold text-[#0f172a] font-mono tabular-nums">
                                    {order.name}
                                  </span>
                                  {typeof order.number === 'number' && !order.name.includes(String(order.number)) && (
                                    <span className="text-xs font-mono text-[#64748b] tabular-nums">
                                      #{order.number}
                                    </span>
                                  )}
                                  <span className="text-xs text-[#94a3b8]">·</span>
                                  <span className="text-xs text-[#64748b] font-mono tabular-nums">
                                    {formatOrderDate(order.processedAt)}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                  <span
                                    className={`text-xs font-mono font-semibold uppercase ${
                                      order.fulfillmentStatus === 'FULFILLED'
                                        ? 'text-emerald-700'
                                        : 'text-amber-700'
                                    }`}
                                  >
                                    {formatFulfillmentLabel(order.fulfillmentStatus)}
                                  </span>
                                  <span className="text-xs text-[#cbd5e1]">·</span>
                                  <span className="text-sm font-mono font-bold text-[#0f172a] tabular-nums">
                                    {formatPrice(order.totalPrice.amount, order.totalPrice.currencyCode)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0 overflow-x-auto py-0.5">
                                  {order.lineItems.slice(0, 4).map((item) => (
                                    <div
                                      key={item.id}
                                      className="w-12 h-12 rounded-lg bg-white border border-[#e2e8f0] overflow-hidden shrink-0 relative"
                                      title={item.title}
                                    >
                                      {item.image?.url ? (
                                        <img
                                          src={item.image.url}
                                          alt={item.image.altText || item.title}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#64748b] font-mono">
                                          MERCH
                                        </div>
                                      )}
                                      {item.quantity > 1 && (
                                        <span className="absolute bottom-0 right-0 px-1 text-[9px] font-mono font-bold bg-[#0f172a] text-white rounded-tl tabular-nums">
                                          x{item.quantity}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-[#0f172a] truncate">
                                      {order.lineItems[0]?.title || 'Order items'}
                                      {order.lineItems.length > 1
                                        ? ` + ${order.lineItems.length - 1} more`
                                        : ''}
                                    </p>
                                    <p className="text-[11px] font-mono text-[#64748b] uppercase">
                                      Payment: {order.financialStatus}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  {trackingLinks.map((track, idx) => (
                                    <a
                                      key={`${order.id}-track-${idx}`}
                                      href={track.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                                    >
                                      <Truck className="w-3.5 h-3.5" />
                                      <span>
                                        {track.number ? `Track ${track.number}` : `Track (${track.company})`}
                                      </span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ))}

                                  <button
                                    type="button"
                                    onClick={() => onSelectOrder(order.id)}
                                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                                  >
                                    <span>View details</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {(hasNextPage || hasPrevPage) && (
                      <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0]">
                        <button
                          type="button"
                          disabled={!hasPrevPage || isPaginating}
                          onClick={() => startCursor && onLoadOrdersPage(startCursor, 'prev')}
                          className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white text-[#0f172a] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafc] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Previous</span>
                        </button>

                        <button
                          type="button"
                          disabled={!hasNextPage || isPaginating}
                          onClick={() => endCursor && onLoadOrdersPage(endCursor, 'next')}
                          className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white text-[#0f172a] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafc] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 3: INDIVIDUAL ORDER DETAILS & COURIER TRACKING */}
            {/* ------------------------------------------------------------- */}
            {!shouldShowMainBlockingLoader && (activeTab === 'order-detail' || Boolean(selectedOrderId)) && (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={onClearSelectedOrder}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded-lg px-2 py-1.5 -ml-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to orders</span>
                </button>

                {!activeOrder ? (
                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <h3 className="text-sm font-heading font-extrabold text-[#0f172a]">
                      Order record not found
                    </h3>
                    <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                      The requested order could not be located on the currently loaded page.
                    </p>
                    <button
                      type="button"
                      onClick={onClearSelectedOrder}
                      className="px-4 py-2 bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      Return to orders
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 md:p-8 space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-6">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-xl font-heading font-extrabold tracking-tight text-[#0f172a]">
                            Order {activeOrder.name}
                          </h2>
                          <span className="text-xs font-mono text-[#64748b]">
                            ID: {activeOrder.id.split('/').pop()}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748b] font-mono mt-1 tabular-nums">
                          Placed{' '}
                          {new Date(activeOrder.processedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono uppercase">
                        <span className="text-[#475569] font-semibold">
                          Payment: {activeOrder.financialStatus}
                        </span>
                        <span className="text-[#cbd5e1]">/</span>
                        <span
                          className={`font-semibold ${
                            activeOrder.fulfillmentStatus === 'FULFILLED'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          Fulfillment: {formatFulfillmentLabel(activeOrder.fulfillmentStatus)}
                        </span>
                      </div>
                    </div>

                    {/* Courier Tracking Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-red-600" />
                        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0f172a]">
                          Shipment & Tracking
                        </h3>
                      </div>

                      {activeOrder.fulfillments.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#64748b]">
                          <p className="font-semibold text-[#0f172a]">
                            No tracking information is available for this order yet.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeOrder.fulfillments.map((f, idx) => (
                            <div
                              key={f.id || idx}
                              className="p-5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs font-mono uppercase">
                                  <span className="font-bold text-[#0f172a]">
                                    Package {idx + 1}
                                  </span>
                                  <span className="text-[#cbd5e1]">·</span>
                                  <span className="font-semibold text-[#475569]">
                                    {f.status}
                                  </span>
                                  {f.latestShipmentStatus && (
                                    <>
                                      <span className="text-[#cbd5e1]">·</span>
                                      <span className="font-semibold text-emerald-700">
                                        {f.latestShipmentStatus.replace(/_/g, ' ')}
                                      </span>
                                    </>
                                  )}
                                </div>

                                {f.estimatedDeliveryAt && (
                                  <span className="text-xs font-mono text-[#64748b] tabular-nums">
                                    Est. delivery: {formatOrderDate(f.estimatedDeliveryAt)}
                                  </span>
                                )}
                              </div>

                              {f.trackingInformation && f.trackingInformation.length > 0 ? (
                                <div className="space-y-2">
                                  {f.trackingInformation.map((track, tIdx) => (
                                    <div
                                      key={tIdx}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white rounded-lg border border-[#e2e8f0]"
                                    >
                                      <div>
                                        <p className="text-xs font-bold text-[#0f172a]">
                                          {track.company || 'Courier'}
                                        </p>
                                        <p className="text-xs font-mono text-[#64748b] tabular-nums">
                                          Tracking #: {track.number || 'Not listed'}
                                        </p>
                                      </div>

                                      {track.url ? (
                                        <a
                                          href={track.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer self-start sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                                        >
                                          <span>Track courier</span>
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      ) : (
                                        <span className="text-[11px] text-[#64748b] font-mono">
                                          Tracking URL not provided by carrier
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-[#64748b]">
                                  No tracking information is available for this fulfillment yet.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Line Items */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0f172a] border-b border-[#e2e8f0] pb-2">
                        Items ({activeOrder.lineItems.length})
                      </h3>

                      <div className="divide-y divide-[#e2e8f0]">
                        {activeOrder.lineItems.map((item) => (
                          <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-14 h-14 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] overflow-hidden shrink-0">
                                {item.image?.url ? (
                                  <img
                                    src={item.image.url}
                                    alt={item.image.altText || item.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-[#64748b] font-mono">
                                    MERCH
                                  </div>
                                )}
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <p className="text-xs font-bold text-[#0f172a] truncate">{item.title}</p>
                                {item.variantTitle && (
                                  <p className="text-[11px] text-[#64748b] font-mono truncate">
                                    Variant: {item.variantTitle}
                                  </p>
                                )}
                                <p className="text-[11px] text-[#64748b] font-mono tabular-nums">
                                  Qty: {item.quantity}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold font-mono text-[#0f172a] tabular-nums">
                                {item.price ? formatPrice(item.price.amount, item.price.currencyCode) : '—'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-5 space-y-2 max-w-sm ml-auto text-xs font-mono tabular-nums">
                      {activeOrder.subtotal && (
                        <div className="flex justify-between text-[#64748b]">
                          <span>Subtotal</span>
                          <span>{formatPrice(activeOrder.subtotal.amount, activeOrder.subtotal.currencyCode)}</span>
                        </div>
                      )}
                      {activeOrder.totalShipping && (
                        <div className="flex justify-between text-[#64748b]">
                          <span>Shipping</span>
                          <span>{formatPrice(activeOrder.totalShipping.amount, activeOrder.totalShipping.currencyCode)}</span>
                        </div>
                      )}
                      {activeOrder.totalTax && (
                        <div className="flex justify-between text-[#64748b]">
                          <span>Tax</span>
                          <span>{formatPrice(activeOrder.totalTax.amount, activeOrder.totalTax.currencyCode)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-[#e2e8f0] flex justify-between font-bold text-sm text-[#0f172a]">
                        <span>Total</span>
                        <span>{formatPrice(activeOrder.totalPrice.amount, activeOrder.totalPrice.currencyCode)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 4: SAVED ITEMS (BROWSER-LOCAL, AUTHORITATIVE WISHLIST) */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'saved' && !selectedOrderId && (
              <section className="bg-white border border-[#e2e8f0] rounded-2xl p-6 space-y-5">
                <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-heading font-extrabold tracking-tight text-[#0f172a]">
                      Saved items ({isSavedItemsDisabled ? '—' : savedItems.length})
                    </h2>
                    <p className="text-xs text-[#64748b]">
                      Bookmarked pieces for your active session scope.
                    </p>
                  </div>
                </div>

                {/* Truthful browser-local disclosure */}
                <div className="px-4 py-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#475569] flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-[#64748b] shrink-0 mt-0.5" />
                  <span>
                    Saved in this browser on this device only. Saved items are isolated to your signed-in account in this browser and are not synced across devices.
                  </span>
                </div>

                {isSavedItemsDisabled ? (
                  isSessionVerifying ? (
                    <div className="py-10 text-center space-y-4">
                      <div className="w-12 h-12 mx-auto rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#475569]">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-heading font-bold text-[#0f172a]">
                          Verifying account…
                        </h3>
                        <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                          Checking your customer identity. Saved items remain hidden until your session is confirmed.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center space-y-4">
                      <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                        <Info className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-heading font-bold text-[#0f172a]">
                          Session Unresolved
                        </h3>
                        <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                          Your customer session could not be verified. Saved items remain hidden until your account identity is confirmed.
                        </p>
                      </div>
                      {onRetrySession && (
                        <button
                          type="button"
                          onClick={onRetrySession}
                          className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Verification</span>
                        </button>
                      )}
                    </div>
                  )
                ) : savedItems.length === 0 ? (
                  <div className="py-10 text-center space-y-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b]">
                      <Heart className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-heading font-bold text-[#0f172a]">
                        No saved items yet
                      </h3>
                      <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                        Use the heart button on any merch piece to keep a shortlist in this browser.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onNavigateHome}
                      className="inline-flex items-center gap-2 min-h-[40px] px-5 py-2 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Shop merch</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {savedItems.map((prod) => {
                      const productHref = prod.handle ? `/products/${prod.handle}` : undefined;
                      const imageInner = prod.images?.[0] ? (
                        <img
                          src={prod.images[0]}
                          alt={prod.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-mono text-[#64748b]">
                          MERCH
                        </div>
                      );

                      return (
                        <article
                          key={prod.id}
                          className="border border-[#e2e8f0] rounded-xl overflow-hidden bg-[#f8fafc] flex flex-col justify-between"
                        >
                          <div>
                            {productHref ? (
                              <a
                                href={productHref}
                                aria-label={`View ${prod.title}`}
                                onClick={(e) => {
                                  if (onViewSavedProduct) {
                                    e.preventDefault();
                                    onViewSavedProduct(prod);
                                  }
                                }}
                                className="block aspect-[4/3] bg-white border-b border-[#e2e8f0] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600"
                              >
                                {imageInner}
                              </a>
                            ) : onViewSavedProduct ? (
                              <button
                                type="button"
                                aria-label={`View ${prod.title}`}
                                onClick={() => onViewSavedProduct(prod)}
                                className="block w-full aspect-[4/3] bg-white border-b border-[#e2e8f0] overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600"
                              >
                                {imageInner}
                              </button>
                            ) : (
                              <div className="aspect-[4/3] bg-white border-b border-[#e2e8f0] overflow-hidden">
                                {imageInner}
                              </div>
                            )}

                            <div className="p-4 space-y-1.5">
                              {prod.dropCollection && (
                                <p className="text-[11px] font-mono text-[#64748b] truncate">
                                  {prod.dropCollection}
                                </p>
                              )}
                              <h3 className="text-sm font-heading font-bold text-[#0f172a] line-clamp-2">
                                {productHref ? (
                                  <a
                                    href={productHref}
                                    onClick={(e) => {
                                      if (onViewSavedProduct) {
                                        e.preventDefault();
                                        onViewSavedProduct(prod);
                                      }
                                    }}
                                    className="inline-block text-left hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                                  >
                                    {prod.title}
                                  </a>
                                ) : onViewSavedProduct ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewSavedProduct(prod)}
                                    className="inline-block text-left hover:text-red-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                                  >
                                    {prod.title}
                                  </button>
                                ) : (
                                  <span>{prod.title}</span>
                                )}
                              </h3>
                              <p className="text-xs font-mono font-bold text-red-600 tabular-nums">
                                {formatPrice(prod.priceAmount, prod.currencyCode || currency)}
                              </p>
                            </div>
                          </div>

                          <div className="p-4 pt-0 flex items-center gap-2">
                            {onAddToCartFromSaved && (
                              <button
                                type="button"
                                onClick={() => onAddToCartFromSaved(prod)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                <span>Select options</span>
                              </button>
                            )}

                            {onToggleSavedItem && (
                              <button
                                type="button"
                                onClick={() => onToggleSavedItem(prod)}
                                aria-label={`Remove ${prod.title} from saved items`}
                                className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] p-2 rounded-xl bg-white hover:bg-red-50 text-[#64748b] hover:text-red-600 border border-[#e2e8f0] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 5: READ-ONLY PROFILE & ADDRESSES */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'profile' && !selectedOrderId && (
              <section className="bg-white border border-[#e2e8f0] rounded-2xl p-6 md:p-8 space-y-6">
                <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-heading font-extrabold tracking-tight text-[#0f172a]">
                      Profile & Addresses
                    </h2>
                    <p className="text-xs text-[#64748b]">
                      Read-only details returned by your Shopify Customer Account.
                    </p>
                  </div>
                  <a
                    href={hostedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-[#b91c1c] hover:underline self-start sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                  >
                    <span>Manage on Shopify</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-[#0f172a]">
                      <User className="w-4 h-4 text-red-600" />
                      <span>Account identity</span>
                    </div>

                    <dl className="space-y-2.5 text-xs">
                      <div>
                        <dt className="text-[11px] font-mono text-[#64748b] uppercase">Name</dt>
                        <dd className="font-semibold text-[#0f172a] mt-0.5">{customerDisplayName}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-mono text-[#64748b] uppercase">Email</dt>
                        <dd className="font-mono text-[#0f172a] mt-0.5">{customerEmail || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-mono text-[#64748b] uppercase">Phone</dt>
                        <dd className="font-mono text-[#0f172a] mt-0.5 tabular-nums">
                          {profile?.phoneNumber?.phoneNumber || 'Not provided'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="p-5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-[#0f172a]">
                      <MapPin className="w-4 h-4 text-red-600" />
                      <span>Default address</span>
                    </div>

                    {profile?.defaultAddress ? (
                      <div className="text-xs text-[#0f172a] leading-relaxed font-mono space-y-0.5">
                        {profile.defaultAddress.formatted && profile.defaultAddress.formatted.length > 0 ? (
                          profile.defaultAddress.formatted.map((line, idx) => <p key={idx}>{line}</p>)
                        ) : (
                          <>
                            {profile.defaultAddress.address1 && <p>{profile.defaultAddress.address1}</p>}
                            {profile.defaultAddress.address2 && <p>{profile.defaultAddress.address2}</p>}
                            {(profile.defaultAddress.city || profile.defaultAddress.province || profile.defaultAddress.zip) && (
                              <p>
                                {[profile.defaultAddress.city, profile.defaultAddress.province, profile.defaultAddress.zip]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            )}
                            {profile.defaultAddress.country && <p>{profile.defaultAddress.country}</p>}
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#64748b]">
                        No default address is saved on your Shopify account yet.
                      </p>
                    )}
                  </div>
                </div>

                {additionalAddresses.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0f172a]">
                      Additional saved addresses ({additionalAddresses.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {additionalAddresses.map((addr) => (
                        <div
                          key={addr.id}
                          className="p-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-xs font-mono text-[#0f172a] leading-relaxed space-y-0.5"
                        >
                          {addr.formatted && addr.formatted.length > 0 ? (
                            addr.formatted.map((line, idx) => <p key={idx}>{line}</p>)
                          ) : (
                            <>
                              {addr.address1 && <p>{addr.address1}</p>}
                              {addr.address2 && <p>{addr.address2}</p>}
                              {(addr.city || addr.province || addr.zip) && (
                                <p>{[addr.city, addr.province, addr.zip].filter(Boolean).join(', ')}</p>
                              )}
                              {addr.country && <p>{addr.country}</p>}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-[#64748b] pt-2 border-t border-[#e2e8f0]">
                  Profile and shipping address edits are handled in your hosted Shopify account.{' '}
                  <a
                    href={hostedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-[#b91c1c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                  >
                    <span>Account help</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export function CustomerDashboard({
  initialTab = 'overview',
  initialOrderId,
  onNavigateHome,
  currency = 'USD',
  savedItems = [],
  isSavedItemsDisabled = false,
  isSessionVerifying = false,
  onToggleSavedItem,
  onAddToCartFromSaved,
  onViewSavedProduct,
  onRetrySession,
}: CustomerDashboardProps) {
  const controllerRef = useRef<CustomerDashboardController | null>(null);
  const latestRouteRef = useRef<{ initialTab: DashboardTab; initialOrderId?: string }>({
    initialTab,
    initialOrderId,
  });
  latestRouteRef.current = { initialTab, initialOrderId };

  const [dashState, setDashState] = useState<DashboardDataState>(() =>
    createInitialDashboardState(initialTab, initialOrderId)
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const activeLogoutAttemptIdRef = useRef<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const isSigningInRef = useRef(false);

  // Order list search / filter state (client-side over loaded page)
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>('all');

  useEffect(() => {
    const handlePageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        isSigningInRef.current = false;
        setIsSigningIn(false);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    return bindCustomerDashboardLifecycle({
      controllerRef,
      deps: {
        fetchSession: fetchCustomerSession,
        fetchDashboardData: fetchCustomerDashboardData,
        fetchOrdersList: fetchCustomerOrdersList,
        fetchProfileData: fetchCustomerProfileData,
      },
      getRoute: () => latestRouteRef.current,
      onStateChange: setDashState,
    });
  }, []);

  // Keep controller synced when parent route props change after mount
  useEffect(() => {
    controllerRef.current?.syncRouteProps(initialTab, initialOrderId);
  }, [initialTab, initialOrderId]);

  function handleStartSignIn(e: React.MouseEvent<HTMLAnchorElement>) {
    guardSignInNavigationClick({
      event: e,
      isSigningInRef,
      isSigningInState: isSigningIn,
      setIsSigningIn,
    });
  }

  // Handle Logout
  async function handleLogout() {
    await executeDashboardLogout({
      activeLogoutAttemptRef: activeLogoutAttemptIdRef,
      isLoggingOut,
      setIsLoggingOut,
      setLogoutError,
    });
  }

  function handleResumeSession() {
    executeDashboardResumeSession({
      activeLogoutAttemptRef: activeLogoutAttemptIdRef,
      setLogoutError,
      setIsLoggingOut,
      controller: controllerRef.current,
    });
  }

  const {
    activeTab,
    selectedOrderId,
    session,
    isSessionLoading,
    profile,
    orders,
    isDataLoading,
    isPaginating,
    hasAttemptedOrdersLoad,
    dataError,
    sessionExpired,
    hasNextPage,
    hasPrevPage,
    startCursor,
    endCursor,
  } = dashState;

  // Find active order for detail view
  const activeOrder = selectedOrderId
    ? orders.find((o) => o.id === selectedOrderId || o.name === selectedOrderId || String(o.number) === selectedOrderId) || null
    : null;

  // Fallback Hosted Account URL
  const hostedUrl = session?.hostedFallbackUrl || SHOPIFY_CUSTOMER_ACCOUNT_URL || 'https://shopify.com/79461089448/account';

  // --------------------------------------------------------------------------
  // STATE A: Initial Session Loading
  // --------------------------------------------------------------------------
  if (isSessionLoading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 bg-zinc-50 border-y border-zinc-200">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Verifying Customer Authentication...
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE B: Custom Integration Disabled or Client Not Configured
  // --------------------------------------------------------------------------
  const isCustomIntegrationActive = ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || Boolean(session?.enabled) || Boolean(session?.isTester);
  if (!isCustomIntegrationActive || !session?.configured) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20 font-sans">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 md:p-10 shadow-xs space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono uppercase font-bold tracking-widest text-[#64748b]">
              Customer Account Access
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
              Shopify Customer Portal
            </h1>
            <p className="text-sm text-[#64748b] leading-relaxed max-w-2xl">
              Customer accounts for Sanelow Merch are managed on Shopify’s hosted infrastructure.
              Sign in with one-time verification codes sent to your email to view order history and available courier tracking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a] font-mono uppercase">
                <ShieldCheck className="w-4 h-4 text-red-600" />
                <span>Passwordless Verification</span>
              </div>
              <p className="text-xs text-[#64748b] leading-relaxed">
                Shopify sends a 6-digit one-time code to your checkout email. No passwords or separate registration databases.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a] font-mono uppercase">
                <Truck className="w-4 h-4 text-red-600" />
                <span>Courier Tracking Links</span>
              </div>
              <p className="text-xs text-[#64748b] leading-relaxed">
                Tracking numbers and courier links appear automatically once your order fulfillment is updated in Shopify.
              </p>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-[#b91c1c] text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <span>Access Shopify Account Portal</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Continue Shopping</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE C: Unauthenticated or Session Expired
  // --------------------------------------------------------------------------
  if (!session?.authenticated || sessionExpired) {
    const authErrorCode =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('auth_error')
        : null;
    const signedOutError = resolveSignedOutAuthErrorMessage(authErrorCode, dataError);

    return (
      <CustomerDashboardSignedOutView
        sessionExpired={sessionExpired}
        authError={signedOutError}
        hostedUrl={hostedUrl}
        isSigningIn={isSigningIn}
        onStartSignIn={handleStartSignIn}
        onNavigateHome={onNavigateHome}
      />
    );
  }

  // --------------------------------------------------------------------------
  // STATE C.1: Logout In Progress
  // --------------------------------------------------------------------------
  if (isLoggingOut && !logoutError) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 bg-zinc-50 border-y border-zinc-200 font-sans">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-600">
          Signing Out Securely...
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE C.2: Logout Error Recovery View
  // --------------------------------------------------------------------------
  if (logoutError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 md:py-24 font-sans">
        <div className="bg-white border border-red-200 rounded-2xl p-6 md:p-10 shadow-xs text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shadow-xs">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
              Sign Out Incomplete
            </h1>
            <p className="text-xs md:text-sm text-[#64748b] max-w-md mx-auto leading-relaxed">
              We encountered an issue terminating your customer session. To protect your account security, dashboard access is locked until sign out succeeds or you explicitly resume your session.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-red-50/50 border border-red-200 text-left space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-red-900 font-mono uppercase">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Error Details</span>
            </div>
            <p className="text-xs text-red-700 font-mono break-all">{logoutError}</p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-red-600 hover:bg-[#b91c1c] text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoggingOut ? 'animate-spin' : ''}`} />
              <span>{isLoggingOut ? 'Retrying Sign Out...' : 'Retry Sign Out'}</span>
            </button>

            <button
              type="button"
              disabled={isLoggingOut}
              onClick={handleResumeSession}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
            >
              <span>Resume Session</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE D: Authenticated Dashboard
  // --------------------------------------------------------------------------
  const customerDisplayName = profile?.displayName || session.customer?.name || 'Sanelow Customer';
  const customerEmail = profile?.emailAddress?.emailAddress || session.customer?.email || '';

  return (
    <CustomerDashboardAuthenticatedView
      activeTab={activeTab}
      selectedOrderId={selectedOrderId}
      customerDisplayName={customerDisplayName}
      customerEmail={customerEmail}
      profile={profile}
      orders={orders}
      activeOrder={activeOrder}
      isDataLoading={isDataLoading}
      isPaginating={isPaginating}
      hasAttemptedOrdersLoad={hasAttemptedOrdersLoad}
      dataError={dataError}
      isLoggingOut={isLoggingOut}
      hasNextPage={hasNextPage}
      hasPrevPage={hasPrevPage}
      startCursor={startCursor}
      endCursor={endCursor}
      orderSearch={orderSearch}
      orderStatusFilter={orderStatusFilter}
      hostedUrl={hostedUrl}
      currency={currency}
      savedItems={savedItems}
      isSavedItemsDisabled={isSavedItemsDisabled}
      isSessionVerifying={isSessionVerifying}
      onSelectTab={(tab) => controllerRef.current?.selectTab(tab)}
      onSelectOrder={(orderId) => controllerRef.current?.selectOrder(orderId)}
      onClearSelectedOrder={() => controllerRef.current?.clearSelectedOrder()}
      onOrderSearchChange={setOrderSearch}
      onOrderStatusFilterChange={setOrderStatusFilter}
      onResetOrderFilters={() => {
        setOrderSearch('');
        setOrderStatusFilter('all');
      }}
      onRefreshDashboard={() => void controllerRef.current?.loadDashboard()}
      onLoadOrdersPage={(cursor, direction) => void controllerRef.current?.loadOrdersPage(cursor, direction)}
      onNavigateHome={onNavigateHome}
      onLogout={handleLogout}
      onToggleSavedItem={onToggleSavedItem}
      onAddToCartFromSaved={onAddToCartFromSaved}
      onViewSavedProduct={onViewSavedProduct}
      onRetrySession={onRetrySession}
    />
  );
}
