import React, { useState, useEffect } from 'react';
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
  Clock,
  CheckCircle2,
  AlertTriangle,
  Mail,
  MapPin,
  Calendar,
  Layers,
  ChevronLeft,
} from 'lucide-react';
import {
  CustomerProfile,
  CustomerAccountOrder,
  CustomerSession,
} from '../types';
import {
  fetchCustomerSession,
  fetchCustomerDashboardData,
  fetchCustomerOrdersList,
  fetchCustomerProfileData,
  logoutCustomer,
  formatPrice,
  SHOPIFY_CUSTOMER_ACCOUNT_URL,
  ENABLE_CUSTOM_CUSTOMER_ACCOUNTS,
} from '../lib/shopify';

export type DashboardTab = 'overview' | 'orders' | 'order-detail' | 'profile';

interface CustomerDashboardProps {
  initialTab?: DashboardTab;
  initialOrderId?: string;
  onNavigateHome: () => void;
  currency?: string;
}

export function CustomerDashboard({
  initialTab = 'overview',
  initialOrderId,
  onNavigateHome,
  currency = 'USD',
}: CustomerDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId || null);

  const [session, setSession] = useState<CustomerSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // Dashboard Data State
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<CustomerAccountOrder[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Pagination for Orders tab
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [startCursor, setStartCursor] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [isPaginating, setIsPaginating] = useState(false);

  // 1. Check Session & Configuration
  useEffect(() => {
    let isMounted = true;
    async function initSession() {
      setIsSessionLoading(true);
      try {
        const sess = await fetchCustomerSession();
        if (isMounted) {
          setSession(sess);
          if (sess.authenticated) {
            loadDashboard();
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setDataError(err?.message || 'Failed to initialize session.');
        }
      } finally {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      }
    }
    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Update tab if initialTab prop changes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    if (initialOrderId) setSelectedOrderId(initialOrderId);
  }, [initialTab, initialOrderId]);

  // Load Dashboard Data
  async function loadDashboard() {
    setIsDataLoading(true);
    setDataError(null);
    setSessionExpired(false);
    try {
      const res = await fetchCustomerDashboardData();
      if (res.sessionExpired) {
        setSessionExpired(true);
        setSession((prev) => (prev ? { ...prev, authenticated: false } : null));
        return;
      }
      if (res.error) {
        setDataError(res.error);
      } else {
        setProfile(res.profile);
        setOrders(res.orders);
      }
    } catch (err: any) {
      setDataError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setIsDataLoading(false);
    }
  }

  // Load Paginated Orders
  async function loadOrdersPage(cursor?: string, direction?: 'next' | 'prev') {
    setIsPaginating(true);
    try {
      const res = await fetchCustomerOrdersList(cursor, direction);
      if (res.sessionExpired) {
        setSessionExpired(true);
        setSession((prev) => (prev ? { ...prev, authenticated: false } : null));
        return;
      }
      if (res.error) {
        setDataError(res.error);
      } else {
        setOrders(res.orders);
        setHasNextPage(res.pageInfo.hasNextPage);
        setHasPrevPage(res.pageInfo.hasPreviousPage);
        setStartCursor(res.pageInfo.startCursor || null);
        setEndCursor(res.pageInfo.endCursor || null);
      }
    } catch (err: any) {
      setDataError(err?.message || 'Failed to page orders.');
    } finally {
      setIsPaginating(false);
    }
  }

  // Handle Logout
  async function handleLogout() {
    const res = await logoutCustomer();
    if (res.logoutUrl) {
      window.location.href = res.logoutUrl;
    } else {
      window.location.reload();
    }
  }

  // Find active order for detail view
  const activeOrder = selectedOrderId
    ? orders.find((o) => o.id === selectedOrderId || o.name === selectedOrderId || String(o.number) === selectedOrderId)
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
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[11px] font-mono uppercase font-bold tracking-widest text-[#64748b]">
              Customer Account Access
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
              Shopify Customer Portal
            </h1>
            <p className="text-sm text-[#64748b] leading-relaxed max-w-2xl">
              Customer accounts for Sanelow Merchant Store are managed directly on Shopify’s secure hosted infrastructure.
              Sign in with passwordless one-time verification codes sent to your email to view order history, fulfillment milestones, and delivery tracking.
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
                <span>Real-Time Courier Tracking</span>
              </div>
              <p className="text-xs text-[#64748b] leading-relaxed">
                Live parcel tracking numbers and courier links appear automatically as fulfillments are dispatched from the atelier.
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

          <div className="pt-4 border-t border-[#e2e8f0] text-[11px] text-[#64748b] font-mono">
            Direct Merchant Domain: sx71id-uy.myshopify.com • Store ID: 79461089448
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE C: Unauthenticated or Session Expired
  // --------------------------------------------------------------------------
  if (!session?.authenticated || sessionExpired) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 md:py-24 font-sans">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 md:p-10 shadow-xs text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-xs">
            <User className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
              {sessionExpired ? 'Session Expired' : 'Customer Account Sign In'}
            </h1>
            <p className="text-xs md:text-sm text-[#64748b] max-w-md mx-auto leading-relaxed">
              {sessionExpired
                ? 'Your secure customer session has expired. Sign in again to view your order history and tracked shipments.'
                : 'Sign in with your Shopify Customer Account to view order history, fulfillment status, and tracked parcel shipments.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-left space-y-2 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a] font-mono uppercase">
              <ShieldCheck className="w-4 h-4 text-red-600" />
              <span>Secure Shopify-Hosted Identity</span>
            </div>
            <p className="text-[12px] text-[#64748b] leading-relaxed">
              We authenticate via Shopify’s official Customer Account API using email one-time passcodes (no passwords stored).
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/api/auth?action=login&returnTo=/account"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-red-600 hover:bg-[#b91c1c] text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <span>Sign In with Shopify</span>
              <ChevronRight className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onNavigateHome}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
            >
              <span>Continue Shopping</span>
            </button>
          </div>

          <div className="pt-4 border-t border-[#e2e8f0]">
            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#64748b] hover:text-[#0f172a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
            >
              <span>Having trouble? Open Shopify Hosted Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE D: Authenticated Dashboard (Overview, Orders, Order Details, Profile)
  // --------------------------------------------------------------------------
  const customerDisplayName = profile?.displayName || session.customer?.name || 'Sanelow Collector';
  const customerEmail = profile?.emailAddress?.emailAddress || session.customer?.email || '';

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen border-t border-[#e2e8f0] font-sans">
      {/* Top Banner Header */}
      <div className="bg-[#0f172a] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  Verified Customer Session
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-heading font-extrabold uppercase tracking-tight">
                {customerDisplayName}
              </h1>
              {customerEmail && (
                <p className="text-xs text-slate-400 font-mono">{customerEmail}</p>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onNavigateHome}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider transition-colors border border-slate-800 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Shop Catalogue</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 text-xs font-semibold uppercase tracking-wider transition-colors border border-red-900/30 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Account Shell with Sidebar & Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Navigation Sidebar */}
          <aside className="lg:col-span-1 space-y-4">
            <nav className="bg-white border border-[#e2e8f0] rounded-2xl p-2 shadow-xs flex flex-row lg:flex-col gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  setSelectedOrderId(null);
                }}
                className={`flex-1 lg:flex-none flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                  activeTab === 'overview' && !selectedOrderId
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Overview</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('orders');
                  setSelectedOrderId(null);
                  loadOrdersPage();
                }}
                className={`flex-1 lg:flex-none flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                  activeTab === 'orders' || selectedOrderId
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4" />
                  <span>My Orders</span>
                </div>
                {orders.length > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      activeTab === 'orders' ? 'bg-slate-800 text-white' : 'bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]'
                    }`}
                  >
                    {orders.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('profile');
                  setSelectedOrderId(null);
                  fetchCustomerProfileData().then((res) => {
                    if (res.profile) setProfile(res.profile);
                  });
                }}
                className={`flex-1 lg:flex-none flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                  activeTab === 'profile'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Profile & Addresses</span>
              </button>
            </nav>

            {/* Hosted Fallback Card */}
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold font-mono uppercase text-[#0f172a]">
                <ShieldCheck className="w-4 h-4 text-red-600" />
                <span>Shopify Hosted Portal</span>
              </div>
              <p className="text-[11px] text-[#64748b] leading-relaxed">
                Direct access to manage communication preferences, payment methods, and global shipping addresses.
              </p>
              <a
                href={hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              >
                <span>Open Hosted Account</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="lg:col-span-3 space-y-6">
            {/* Error Banner */}
            {dataError && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold uppercase tracking-wide">Customer Account Service Message</p>
                  <p>{dataError}</p>
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {isDataLoading && (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center shadow-sm">
                <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
                  Loading verified account records...
                </p>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 1: OVERVIEW */}
            {/* ------------------------------------------------------------- */}
            {!isDataLoading && activeTab === 'overview' && !selectedOrderId && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1 hover:border-red-600 transition-colors">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#64748b]">
                      Total Orders Placed
                    </span>
                    <p className="text-2xl font-heading font-extrabold text-[#0f172a]">{orders.length}</p>
                    <span className="text-[11px] text-[#64748b]">Via Shopify Checkout</span>
                  </div>

                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1 hover:border-red-600 transition-colors">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#64748b]">
                      Latest Order Status
                    </span>
                    {orders.length > 0 ? (
                      <div>
                        <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {orders[0].financialStatus}
                        </span>
                        <span className="ml-2 inline-block px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                          {orders[0].fulfillmentStatus}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-[#64748b]">No Orders Yet</p>
                    )}
                    <span className="text-[11px] text-[#64748b]">Independent Payment & Fulfillment</span>
                  </div>

                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-xs space-y-1 hover:border-red-600 transition-colors">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#64748b]">
                      Destination Country
                    </span>
                    <p className="text-2xl font-heading font-extrabold text-[#0f172a]">
                      {profile?.defaultAddress?.country || 'South Africa (ZA)'}
                    </p>
                    <span className="text-[11px] text-[#64748b]">Official Atelier Dispatch</span>
                  </div>
                </div>

                {/* Recent Orders List */}
                <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-4">
                    <div>
                      <h2 className="text-base font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
                        Recent Official Orders
                      </h2>
                      <p className="text-xs text-[#64748b]">
                        Orders processed through live Shopify Level-1 PCI Checkout
                      </p>
                    </div>

                    {orders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('orders')}
                        className="text-xs font-semibold uppercase tracking-wider text-red-600 hover:text-[#b91c1c] flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                      >
                        <span>View All</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {orders.length === 0 ? (
                    <div className="py-12 text-center space-y-4">
                      <div className="w-12 h-12 mx-auto rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b]">
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#0f172a] uppercase tracking-wide">
                          No order history found
                        </p>
                        <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                          You haven’t completed any purchases with this account yet. Check out our seasonal drops.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onNavigateHome}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Continue Shopping</span>
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#e2e8f0]">
                      {orders.slice(0, 3).map((order) => (
                        <div
                          key={order.id}
                          className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-[#0f172a]">
                                {order.name}
                              </span>
                              <span className="text-xs text-zinc-400">•</span>
                              <span className="text-xs text-zinc-500">
                                {new Date(order.processedAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-zinc-100 text-zinc-700">
                                Payment: {order.financialStatus}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                  order.fulfillmentStatus === 'FULFILLED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                Fulfillment: {order.fulfillmentStatus}
                              </span>
                              <span className="text-xs font-bold text-zinc-900 font-mono">
                                {formatPrice(order.totalPrice.amount, order.totalPrice.currencyCode)}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderId(order.id);
                              setActiveTab('order-detail');
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-xs font-semibold uppercase tracking-wider transition-colors self-start sm:self-auto cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                          >
                            <span>Details & Tracking</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 2: ORDERS & PAGINATED HISTORY */}
            {/* ------------------------------------------------------------- */}
            {!isDataLoading && activeTab === 'orders' && !selectedOrderId && (
              <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-xs space-y-6">
                <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
                      Order History & Parcel Tracking
                    </h2>
                    <p className="text-xs text-[#64748b]">
                      Real-time records directly from Shopify Customer Account API
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadOrdersPage()}
                    className="inline-flex items-center gap-1.5 text-xs text-[#64748b] hover:text-[#0f172a] font-mono transition-colors self-start cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPaginating ? 'animate-spin text-red-600' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="py-16 text-center space-y-4">
                    <div className="w-14 h-14 mx-auto rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b] shadow-xs">
                      <ShoppingBag className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-[#0f172a]">
                        No orders registered to this account
                      </h3>
                      <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                        Once you place an order using this email, official line items and courier tracking will appear here automatically.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onNavigateHome}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Continue Shopping</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className="border border-[#e2e8f0] rounded-2xl p-5 bg-[#f8fafc] hover:border-red-600 transition-colors space-y-4 shadow-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-zinc-900 font-mono">
                              {order.name}
                            </span>
                            <span className="text-xs text-zinc-400">•</span>
                            <span className="text-xs text-zinc-500 font-mono">
                              {new Date(order.processedAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900 font-mono">
                              {formatPrice(order.totalPrice.amount, order.totalPrice.currencyCode)}
                            </span>
                          </div>
                        </div>

                        {/* Order items preview & status pills */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 overflow-x-auto py-1">
                            {order.lineItems.slice(0, 4).map((item) => (
                              <div
                                key={item.id}
                                className="w-12 h-12 rounded-lg bg-zinc-100 border border-zinc-200 overflow-hidden shrink-0 relative"
                                title={item.title}
                              >
                                {item.image?.url ? (
                                  <img
                                    src={item.image.url}
                                    alt={item.image.altText || item.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 font-mono">
                                    MERCH
                                  </div>
                                )}
                                {item.quantity > 1 && (
                                  <span className="absolute bottom-0 right-0 px-1 text-[9px] font-mono font-bold bg-black text-white rounded-tl">
                                    x{item.quantity}
                                  </span>
                                )}
                              </div>
                            ))}
                            {order.lineItems.length > 4 && (
                              <span className="text-xs text-zinc-400 font-mono">
                                +{order.lineItems.length - 4} more
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase bg-zinc-100 text-zinc-700 border border-zinc-200">
                              Payment: {order.financialStatus}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase border ${
                                order.fulfillmentStatus === 'FULFILLED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              Fulfillment: {order.fulfillmentStatus}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setActiveTab('order-detail');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                              <span>View</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Shipment Tracking Snapshot if present */}
                        {order.fulfillments.some((f) => f.trackingInformation && f.trackingInformation.length > 0) && (
                          <div className="pt-2 border-t border-zinc-100 flex items-center gap-2 text-xs text-zinc-600 font-mono">
                            <Truck className="w-3.5 h-3.5 text-red-600" />
                            <span>Courier shipment tracking recorded on this order</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Pagination Controls */}
                    {(hasNextPage || hasPrevPage) && (
                      <div className="pt-4 flex items-center justify-between border-t border-zinc-100">
                        <button
                          type="button"
                          disabled={!hasPrevPage || isPaginating}
                          onClick={() => startCursor && loadOrdersPage(startCursor, 'prev')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white text-[#0f172a] text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafc] cursor-pointer focus-ring shadow-2xs"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Previous</span>
                        </button>

                        <span className="text-xs text-[#64748b] font-mono">Page Navigation</span>

                        <button
                          type="button"
                          disabled={!hasNextPage || isPaginating}
                          onClick={() => endCursor && loadOrdersPage(endCursor, 'next')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#e2e8f0] bg-white text-[#0f172a] text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafc] cursor-pointer focus-ring shadow-2xs"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 3: INDIVIDUAL ORDER DETAILS & SHIPMENT TRACKING */}
            {/* ------------------------------------------------------------- */}
            {!isDataLoading && (activeTab === 'order-detail' || selectedOrderId) && (
              <div className="space-y-6">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrderId(null);
                    setActiveTab('orders');
                  }}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer focus-ring rounded-lg px-2 py-1 -ml-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Orders</span>
                </button>

                {!activeOrder ? (
                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 text-center space-y-3 shadow-xs">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <h3 className="text-sm font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
                      Order Record Not Found
                    </h3>
                    <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                      The requested order could not be located in your customer account history.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('orders')}
                      className="px-4 py-2 bg-[#0f172a] hover:bg-black text-white text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer focus-ring"
                    >
                      Return to Orders List
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 md:p-8 shadow-xs space-y-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-6">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
                            Order {activeOrder.name}
                          </h2>
                          <span className="text-xs font-mono text-[#64748b]">
                            (ID: {activeOrder.id.split('/').pop()})
                          </span>
                        </div>
                        <p className="text-xs text-[#64748b] font-mono mt-1">
                          Processed At:{' '}
                          {new Date(activeOrder.processedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-md text-xs font-mono font-bold uppercase bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0]">
                          Payment: {activeOrder.financialStatus}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-md text-xs font-mono font-bold uppercase border ${
                            activeOrder.fulfillmentStatus === 'FULFILLED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          Fulfillment: {activeOrder.fulfillmentStatus}
                        </span>
                      </div>
                    </div>

                    {/* Shipment & Courier Tracking Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-red-600" />
                        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0f172a]">
                          Shipment & Dispatch Milestones
                        </h3>
                      </div>

                      {activeOrder.fulfillments.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#64748b] space-y-1">
                          <p className="font-bold text-[#0f172a]">Awaiting Fulfillment & Courier Dispatch</p>
                          <p>
                            Your piece is being prepared by our production atelier. Once courier waybills and tracking are generated in Shopify, courier updates will appear here automatically.
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
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold uppercase text-[#0f172a]">
                                    Package {idx + 1}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                    {f.status}
                                  </span>
                                  {f.latestShipmentStatus && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      {f.latestShipmentStatus.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </div>

                                {f.estimatedDeliveryAt && (
                                  <span className="text-xs font-mono text-[#64748b]">
                                    Est. Delivery: {new Date(f.estimatedDeliveryAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>

                              {/* Tracking Links */}
                              {f.trackingInformation && f.trackingInformation.length > 0 ? (
                                <div className="space-y-2">
                                  {f.trackingInformation.map((track, tIdx) => (
                                    <div
                                      key={tIdx}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white rounded-lg border border-[#e2e8f0]"
                                    >
                                      <div>
                                        <p className="text-xs font-bold text-[#0f172a]">
                                          {track.company || 'Courier Partner'}
                                        </p>
                                        <p className="text-xs font-mono text-[#64748b]">
                                          Tracking #: {track.number || 'Available at courier'}
                                        </p>
                                      </div>

                                      {track.url ? (
                                        <a
                                          href={track.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-[#b91c1c] active:bg-red-800 text-white text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer self-start sm:self-auto focus-ring"
                                        >
                                          <span>Track Courier</span>
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
                                  Package is prepared. Tracking link will sync once scanned by the courier.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Order Line Items */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0f172a] border-b border-[#e2e8f0] pb-2">
                        Purchased Pieces ({activeOrder.lineItems.length})
                      </h3>

                      <div className="divide-y divide-[#e2e8f0]">
                        {activeOrder.lineItems.map((item) => (
                          <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] overflow-hidden shrink-0">
                                {item.image?.url ? (
                                  <img
                                    src={item.image.url}
                                    alt={item.image.altText || item.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-[#64748b] font-mono">
                                    PIECE
                                  </div>
                                )}
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs font-bold text-[#0f172a]">{item.title}</p>
                                {item.variantTitle && (
                                  <p className="text-[11px] text-[#64748b] font-mono">
                                    Variant: {item.variantTitle}
                                  </p>
                                )}
                                <p className="text-[11px] text-[#64748b] font-mono">
                                  Quantity: {item.quantity}
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-xs font-bold font-mono text-[#0f172a]">
                                {item.price ? formatPrice(item.price.amount, item.price.currencyCode) : '—'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financial Cost Breakdown */}
                    <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-5 space-y-2 max-w-sm ml-auto text-xs font-mono">
                      {activeOrder.subtotal && (
                        <div className="flex justify-between text-[#64748b]">
                          <span>Subtotal:</span>
                          <span>{formatPrice(activeOrder.subtotal.amount, activeOrder.subtotal.currencyCode)}</span>
                        </div>
                      )}
                      {activeOrder.totalShipping && (
                        <div className="flex justify-between text-[#64748b]">
                          <span>Shipping:</span>
                          <span>{formatPrice(activeOrder.totalShipping.amount, activeOrder.totalShipping.currencyCode)}</span>
                        </div>
                      )}
                      {activeOrder.totalTax && (
                        <div className="flex justify-between text-[#64748b]">
                          <span>Tax:</span>
                          <span>{formatPrice(activeOrder.totalTax.amount, activeOrder.totalTax.currencyCode)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-[#e2e8f0] flex justify-between font-bold text-sm text-[#0f172a]">
                        <span>Total:</span>
                        <span>{formatPrice(activeOrder.totalPrice.amount, activeOrder.totalPrice.currencyCode)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUB-VIEW 4: PROFILE INFORMATION & ADDRESSES */}
            {/* ------------------------------------------------------------- */}
            {!isDataLoading && activeTab === 'profile' && !selectedOrderId && (
              <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                <div className="border-b border-[#e2e8f0] pb-4">
                  <h2 className="text-lg font-heading font-extrabold uppercase tracking-tight text-[#0f172a]">
                    Profile & Shipping Records
                  </h2>
                  <p className="text-xs text-[#64748b]">
                    Verified Customer Account details securely synchronized with Shopify
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Identity Card */}
                  <div className="p-5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold font-mono uppercase text-[#0f172a]">
                      <User className="w-4 h-4 text-red-600" />
                      <span>Customer Identity</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] font-mono text-[#64748b] uppercase">Full Name</span>
                        <p className="font-bold text-[#0f172a]">{customerDisplayName}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-[#64748b] uppercase">Primary Email</span>
                        <p className="font-mono text-[#0f172a]">{customerEmail || '—'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-[#64748b] uppercase">Phone</span>
                        <p className="font-mono text-[#0f172a]">
                          {profile?.phoneNumber?.phoneNumber || 'Not provided'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Default Shipping Address */}
                  <div className="p-5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold font-mono uppercase text-[#0f172a]">
                      <MapPin className="w-4 h-4 text-red-600" />
                      <span>Default Delivery Address</span>
                    </div>

                    {profile?.defaultAddress ? (
                      <div className="text-xs text-[#0f172a] leading-relaxed font-mono">
                        {profile.defaultAddress.formatted && profile.defaultAddress.formatted.length > 0 ? (
                          profile.defaultAddress.formatted.map((line, idx) => <p key={idx}>{line}</p>)
                        ) : (
                          <>
                            <p>{profile.defaultAddress.address1}</p>
                            {profile.defaultAddress.address2 && <p>{profile.defaultAddress.address2}</p>}
                            <p>
                              {profile.defaultAddress.city}, {profile.defaultAddress.province}{' '}
                              {profile.defaultAddress.zip}
                            </p>
                            <p>{profile.defaultAddress.country}</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#64748b]">
                        No default delivery address recorded on this account yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] flex items-start gap-3 text-[#0f172a]">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold font-heading uppercase tracking-wide text-[#0f172a]">Customer Account Profile Protection</p>
                    <p className="text-[#64748b]">
                      To safeguard delivery addresses against unauthorized alterations, profile and contact modifications are executed via the authenticated Shopify portal.
                    </p>
                    <a
                      href={hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-red-600 hover:text-[#b91c1c] font-bold hover:underline pt-1 focus-ring rounded"
                    >
                      <span>Edit profile in Shopify Hosted Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
