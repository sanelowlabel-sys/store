import React, { useState } from 'react';
import {
  X,
  User,
  ShoppingBag,
  PackageCheck,
  TrendingUp,
  Heart,
  MapPin,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Award,
  Sparkles,
  Layers,
  FileText,
  Printer,
  ChevronRight,
  Mail,
  Lock,
  ArrowRight,
} from 'lucide-react';
import {
  CustomerUser,
  CustomerOrderRecord,
  Product,
  CurrencyCode,
  MerchSize,
  SavedAddress,
} from '../types';
import { formatPrice } from '../data/products';

interface CustomerPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CustomerUser | null;
  onLogin: (user: CustomerUser) => void;
  onLogout: () => void;
  orders: CustomerOrderRecord[];
  savedProducts: Product[];
  currency: CurrencyCode;
  onOpenTrackingModal: (orderId: string) => void;
  onAddToCart: (product: Product, size: MerchSize) => void;
  onToggleWishlist: (product: Product) => void;
}

export const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout,
  orders,
  savedProducts,
  currency,
  onOpenTrackingModal,
  onAddToCart,
  onToggleWishlist,
}) => {
  if (!isOpen) return null;

  // Auth Form State (when logged out)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupSize, setSignupSize] = useState<MerchSize>('L');

  // Logged-in Navigation Tab
  const [activeTab, setActiveTab] = useState<'orders' | 'analytics' | 'saved' | 'profile'>('orders');
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<CustomerOrderRecord | null>(null);
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  // Address preset add form
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [newAddressStreet, setNewAddressStreet] = useState('');
  const [newAddressCity, setNewAddressCity] = useState('');
  const [newAddressState, setNewAddressState] = useState('');
  const [newAddressZip, setNewAddressZip] = useState('');
  const [newAddressCountry, setNewAddressCountry] = useState('United States');

  // Handle Demo Quick Login
  const handleQuickDemoLogin = (email = 'meandmusicdistributors@gmail.com') => {
    onLogin({
      id: 'usr_meandmusic',
      name: 'Me and Music Studio',
      email: email,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      tier: 'VIP Member',
      loyaltyPoints: 850,
      totalOrders: orders.length,
      sizePreferences: { top: 'L', bottom: 'M', headwear: 'M' },
      joinedDate: 'Member since May 2025',
      savedAddresses: [
        {
          id: 'addr_1',
          label: 'Studio Logistics HQ (Default)',
          fullName: 'Me and Music Distributors',
          street: '142 Mercer Street, Suite 4B',
          apartment: 'Attn: Production Team',
          city: 'New York',
          provinceOrState: 'NY',
          postalCode: '10012',
          country: 'United States',
          isDefault: true,
        },
        {
          id: 'addr_2',
          label: 'EU Creative Lab',
          fullName: 'Sanelow Creative Dept',
          street: 'Kaiser-Wilhelm-Ring 27',
          city: 'Cologne',
          provinceOrState: 'NRW',
          postalCode: '50672',
          country: 'Germany',
          isDefault: false,
        },
      ],
    });
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) return;
    handleQuickDemoLogin(loginEmail);
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail) return;
    onLogin({
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      name: signupName || 'Merch Collector',
      email: signupEmail,
      tier: 'Streetwear Insider',
      loyaltyPoints: 100, // Welcome bonus
      totalOrders: 0,
      sizePreferences: { top: signupSize, bottom: 'M', headwear: 'M' },
      joinedDate: 'Member since Today',
      savedAddresses: [],
    });
  };

  const handleCopyTracking = (tracking: string) => {
    navigator.clipboard.writeText(tracking);
    setCopiedTracking(tracking);
    setTimeout(() => setCopiedTracking(null), 2000);
  };

  // Calculate analytics
  const totalItemsOwned = orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, i) => itemSum + i.quantity, 0);
  }, 0);

  const totalSpendUSD = orders.reduce((sum, order) => sum + order.totalUSD, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div
        id="customer-portal-modal"
        className="relative w-full max-w-4xl rounded-2xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col text-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-black text-sm tracking-tight shadow-sm">
              S
            </div>
            <div>
              <span className="text-xs font-mono font-bold tracking-widest text-red-600 uppercase block">
                Sanelow Portal
              </span>
              <h2 className="text-base sm:text-lg font-black text-black">
                {currentUser ? 'Customer Account Dashboard' : 'Member Sign In & Access'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close portal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 lg:p-8">
          {!currentUser ? (
            /* Log In & Sign Up Interface */
            <div className="max-w-md mx-auto space-y-6 py-4">
              {/* Tab Switcher */}
              <div className="flex rounded-xl bg-zinc-100 p-1 border border-zinc-200">
                <button
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    authMode === 'login'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-500 hover:text-black'
                  }`}
                >
                  Log In
                </button>
                <button
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    authMode === 'signup'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-500 hover:text-black'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* 1-Click Fast Demo Sign In */}
              <div className="p-4 rounded-2xl bg-red-50/60 border border-red-100 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-red-600" />
                    Instant Demo Login
                  </div>
                  <p className="text-[11px] text-zinc-600">
                    Sign in with pre-seeded order history and VIP perks.
                  </p>
                </div>
                <button
                  onClick={() => handleQuickDemoLogin()}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shrink-0 shadow-sm cursor-pointer"
                >
                  1-Click Access
                </button>
              </div>

              {authMode === 'login' ? (
                /* Login Form */
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="you@domain.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none text-sm transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => alert('Password reset link sent to demo email.')}
                        className="text-[11px] text-red-600 hover:underline font-medium"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none text-sm transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-black hover:bg-zinc-800 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Sign In to Member Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* Sign Up Form */
                <form onSubmit={handleSignupSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Alex Rivera"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="alex@domain.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Minimum 8 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Primary Merch Size Preference
                    </label>
                    <div className="flex gap-2">
                      {(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as MerchSize[]).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSignupSize(sz)}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                            signupSize === sz
                              ? 'bg-red-600 text-white border-red-600 shadow-sm'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Create Account & Claim 100 PTS</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Social Auth Integration Placeholders */}
              <div className="pt-4 border-t border-zinc-100">
                <div className="text-center text-[11px] font-mono text-zinc-400 uppercase mb-3">
                  Or continue with
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    onClick={() => handleQuickDemoLogin()}
                    className="py-2.5 px-3 rounded-xl border border-zinc-200 hover:border-black hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="font-bold text-red-600">G</span> Google
                  </button>
                  <button
                    onClick={() => handleQuickDemoLogin()}
                    className="py-2.5 px-3 rounded-xl border border-zinc-200 hover:border-black hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="font-bold"></span> Apple
                  </button>
                  <button
                    onClick={() => handleQuickDemoLogin()}
                    className="py-2.5 px-3 rounded-xl border border-zinc-200 hover:border-black hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="font-bold text-indigo-600">S</span> Shop
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Logged-In Customer Account Dashboard */
            <div className="space-y-6">
              {/* User Profile Bar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-red-600 shrink-0 bg-zinc-200">
                    <img
                      src={
                        currentUser.avatarUrl ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
                      }
                      alt={currentUser.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-black">{currentUser.name}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider">
                        {currentUser.tier}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{currentUser.email}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{currentUser.joinedDate}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="text-right hidden sm:block pr-3 border-r border-zinc-200">
                    <span className="text-[10px] uppercase font-mono text-zinc-400 block">
                      Rewards Balance
                    </span>
                    <span className="text-sm font-black text-red-600">
                      {currentUser.loyaltyPoints} PTS
                    </span>
                  </div>
                  <button
                    onClick={onLogout}
                    className="px-3.5 py-2 rounded-xl border border-zinc-200 hover:border-red-600 hover:text-red-600 text-xs font-bold text-zinc-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-zinc-200 gap-2 sm:gap-6 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'orders'
                      ? 'border-red-600 text-red-600'
                      : 'border-transparent text-zinc-500 hover:text-black'
                  }`}
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>Order Tracking & History</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 text-[10px] text-zinc-600">
                    {orders.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'analytics'
                      ? 'border-red-600 text-red-600'
                      : 'border-transparent text-zinc-500 hover:text-black'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Customer Analytics</span>
                </button>

                <button
                  onClick={() => setActiveTab('saved')}
                  className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'saved'
                      ? 'border-red-600 text-red-600'
                      : 'border-transparent text-zinc-500 hover:text-black'
                  }`}
                >
                  <Heart className="w-4 h-4" />
                  <span>Saved Merch / Wishlist</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 text-[10px] text-zinc-600">
                    {savedProducts.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('profile')}
                  className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'profile'
                      ? 'border-red-600 text-red-600'
                      : 'border-transparent text-zinc-500 hover:text-black'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>Addresses & Sizing</span>
                </button>
              </div>

              {/* Tab Content */}

              {/* 1. Order Tracking & History */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  {orders.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 space-y-3">
                      <ShoppingBag className="w-10 h-10 mx-auto text-zinc-300" />
                      <p className="text-sm font-medium">No orders recorded yet.</p>
                    </div>
                  ) : (
                    orders.map((order) => {
                      const statusColor =
                        order.status === 'Delivered'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : order.status === 'In Transit'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200';

                      return (
                        <div
                          key={order.id}
                          className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 space-y-4 hover:border-zinc-400 transition-all shadow-sm"
                        >
                          {/* Order Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-bold text-black">
                                #{order.id}
                              </span>
                              <span className="text-xs text-zinc-400">•</span>
                              <span className="text-xs text-zinc-500">{order.date}</span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${statusColor}`}
                              >
                                {order.status}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedReceiptOrder(order)}
                                className="text-xs font-bold text-zinc-600 hover:text-black flex items-center gap-1 cursor-pointer px-2 py-1 rounded hover:bg-zinc-100 transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Receipt</span>
                              </button>
                              <button
                                onClick={() => onOpenTrackingModal(order.id)}
                                className="px-3 py-1 rounded-lg bg-black hover:bg-red-600 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Live Tracking</span>
                              </button>
                            </div>
                          </div>

                          {/* Tracking Number & Carrier */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-zinc-50 p-2.5 rounded-xl">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-zinc-500">Waybill:</span>
                              <span className="font-mono font-bold text-black">
                                {order.trackingNumber}
                              </span>
                              <button
                                onClick={() => handleCopyTracking(order.trackingNumber)}
                                className="text-zinc-400 hover:text-black p-0.5 rounded cursor-pointer"
                                title="Copy tracking number"
                              >
                                {copiedTracking === order.trackingNumber ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <div className="text-zinc-500 font-mono text-[11px]">
                              Carrier: <span className="text-black font-semibold">{order.carrier}</span> • Est: {order.estimatedDelivery}
                            </div>
                          </div>

                          {/* Items Grid */}
                          <div className="divide-y divide-zinc-100">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="py-2.5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-14 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                                    <img
                                      src={item.product.images[0]}
                                      alt={item.product.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div>
                                    <h4 className="text-xs sm:text-sm font-bold text-black line-clamp-1">
                                      {item.product.title}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[10px] font-bold">
                                        {item.size}
                                      </span>
                                      <span>•</span>
                                      <span className="text-[11px]">{item.color}</span>
                                      <span>•</span>
                                      <span className="text-[11px]">Qty: {item.quantity}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-xs sm:text-sm font-black text-black">
                                    {formatPrice(item.priceUSD * item.quantity, currency)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Total */}
                          <div className="pt-2 border-t border-zinc-100 flex justify-between items-center text-xs">
                            <span className="text-zinc-500">Total Charged</span>
                            <span className="text-sm font-black text-red-600">
                              {formatPrice(order.totalUSD, currency)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* 2. Customer Analytics Summary */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">
                        Total Orders
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-black">
                        {orders.length}
                      </div>
                      <p className="text-[10px] text-zinc-400">Lifetime verified</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">
                        Merch Owned
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-red-600">
                        {totalItemsOwned} pcs
                      </div>
                      <p className="text-[10px] text-zinc-400">Archived in wardrobe</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">
                        Loyalty Points
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-black">
                        {currentUser.loyaltyPoints}
                      </div>
                      <p className="text-[10px] text-emerald-600 font-semibold">$25 Credit Ready</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">
                        Total Investment
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-black">
                        {formatPrice(totalSpendUSD, currency)}
                      </div>
                      <p className="text-[10px] text-zinc-400">Direct merchant billing</p>
                    </div>
                  </div>

                  {/* Tier Progress Card */}
                  <div className="p-5 rounded-2xl bg-black text-white space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-red-500" />
                        <span className="font-bold text-sm">Sanelow VIP Loyalty Status</span>
                      </div>
                      <span className="text-xs font-mono text-zinc-400">Next: Diamond Club (1000 PTS)</span>
                    </div>

                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-red-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (currentUser.loyaltyPoints / 1000) * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-xs text-zinc-400">
                      <span>Tier Perks: Free Global Express Shipping • 1-Hour Early Drop Access</span>
                      <span className="text-red-400 font-bold">150 PTS to unlock</span>
                    </div>
                  </div>

                  {/* Saved Address Presets Quick-View */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-black text-black">Active Shipping Presets</h4>
                      <button
                        onClick={() => setActiveTab('profile')}
                        className="text-xs font-bold text-red-600 hover:underline"
                      >
                        Manage Presets
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentUser.savedAddresses.map((addr) => (
                        <div
                          key={addr.id}
                          className="p-4 rounded-xl border border-zinc-200 bg-white text-xs space-y-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-black">{addr.label}</span>
                            {addr.isDefault && (
                              <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-600">{addr.fullName}</p>
                          <p className="text-zinc-500">
                            {addr.street} {addr.apartment && `• ${addr.apartment}`}
                          </p>
                          <p className="text-zinc-500">
                            {addr.city}, {addr.provinceOrState} {addr.postalCode} • {addr.country}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Saved Merch / Wishlist */}
              {activeTab === 'saved' && (
                <div className="space-y-4">
                  {savedProducts.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 space-y-3">
                      <Heart className="w-10 h-10 mx-auto text-zinc-300" />
                      <p className="text-sm font-medium">Your saved merch archive is empty.</p>
                      <p className="text-xs text-zinc-500">
                        Tap the heart icon on any apparel item to bookmark it for later.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="rounded-2xl border border-zinc-200 bg-white p-3 space-y-3 flex flex-col justify-between"
                        >
                          <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-zinc-100">
                            <img
                              src={prod.images[0]}
                              alt={prod.title}
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => onToggleWishlist(prod)}
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow text-red-600 flex items-center justify-center hover:scale-105 transition-transform"
                            >
                              <Heart className="w-4 h-4 fill-red-600" />
                            </button>
                            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono uppercase font-bold">
                              {prod.sku}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-black line-clamp-1">
                              {prod.title}
                            </h4>
                            <div className="text-xs font-black text-red-600">
                              {formatPrice(prod.priceUSD, currency)}
                            </div>
                          </div>

                          <button
                            onClick={() => onAddToCart(prod, currentUser.sizePreferences.top)}
                            className="w-full py-2 rounded-xl bg-black hover:bg-red-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Quick Add ({currentUser.sizePreferences.top})</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Sizing & Address Settings */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  {/* Sizing Preferences */}
                  <div className="p-5 rounded-2xl border border-zinc-200 bg-zinc-50/70 space-y-4">
                    <h4 className="text-sm font-black text-black">
                      Merch Fit & Sizing Profile
                    </h4>
                    <p className="text-xs text-zinc-500">
                      We pre-select your preferred sizes for instantaneous checkout and size advisory.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                          Tops & Hoodies Size
                        </label>
                        <div className="flex gap-1.5">
                          {(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as MerchSize[]).map((sz) => (
                            <button
                              key={sz}
                              onClick={() => {
                                onLogin({
                                  ...currentUser,
                                  sizePreferences: { ...currentUser.sizePreferences, top: sz },
                                });
                              }}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                currentUser.sizePreferences.top === sz
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                          Bottoms & Shorts Size
                        </label>
                        <div className="flex gap-1.5">
                          {(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as MerchSize[]).map((sz) => (
                            <button
                              key={sz}
                              onClick={() => {
                                onLogin({
                                  ...currentUser,
                                  sizePreferences: { ...currentUser.sizePreferences, bottom: sz },
                                });
                              }}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                currentUser.sizePreferences.bottom === sz
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Saved Addresses */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-black text-black">Saved Delivery Locations</h4>
                      <button
                        onClick={() => setShowAddAddress(!showAddAddress)}
                        className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                      >
                        {showAddAddress ? 'Cancel' : '+ Add New Address'}
                      </button>
                    </div>

                    {showAddAddress && (
                      <div className="p-4 rounded-2xl border border-red-200 bg-red-50/40 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="Preset Label (e.g. Home, Studio)"
                            value={newAddressLabel}
                            onChange={(e) => setNewAddressLabel(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs outline-none focus:border-red-600"
                          />
                          <input
                            type="text"
                            placeholder="Street Address"
                            value={newAddressStreet}
                            onChange={(e) => setNewAddressStreet(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs outline-none focus:border-red-600"
                          />
                          <input
                            type="text"
                            placeholder="City"
                            value={newAddressCity}
                            onChange={(e) => setNewAddressCity(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs outline-none focus:border-red-600"
                          />
                          <input
                            type="text"
                            placeholder="State / Province"
                            value={newAddressState}
                            onChange={(e) => setNewAddressState(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs outline-none focus:border-red-600"
                          />
                          <input
                            type="text"
                            placeholder="Postal / Zip Code"
                            value={newAddressZip}
                            onChange={(e) => setNewAddressZip(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs outline-none focus:border-red-600"
                          />
                          <input
                            type="text"
                            placeholder="Country"
                            value={newAddressCountry}
                            onChange={(e) => setNewAddressCountry(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs outline-none focus:border-red-600"
                          />
                        </div>

                        <button
                          onClick={() => {
                            if (!newAddressStreet || !newAddressCity) return;
                            const newAddr: SavedAddress = {
                              id: 'addr_' + Date.now(),
                              label: newAddressLabel || 'Delivery Preset',
                              fullName: currentUser.name,
                              street: newAddressStreet,
                              city: newAddressCity,
                              provinceOrState: newAddressState,
                              postalCode: newAddressZip,
                              country: newAddressCountry,
                              isDefault: currentUser.savedAddresses.length === 0,
                            };
                            onLogin({
                              ...currentUser,
                              savedAddresses: [...currentUser.savedAddresses, newAddr],
                            });
                            setShowAddAddress(false);
                            setNewAddressLabel('');
                            setNewAddressStreet('');
                            setNewAddressCity('');
                            setNewAddressState('');
                            setNewAddressZip('');
                          }}
                          className="px-4 py-2 rounded-xl bg-black text-white text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          Save Address Preset
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      {currentUser.savedAddresses.map((addr) => (
                        <div
                          key={addr.id}
                          className="p-3.5 rounded-xl border border-zinc-200 bg-white flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-black">{addr.label}</span>
                              {addr.isDefault && (
                                <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-500 mt-0.5">
                              {addr.street} • {addr.city}, {addr.provinceOrState} {addr.postalCode} • {addr.country}
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              onLogin({
                                ...currentUser,
                                savedAddresses: currentUser.savedAddresses.filter(
                                  (a) => a.id !== addr.id
                                ),
                              });
                            }}
                            className="text-zinc-400 hover:text-red-600 text-xs font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Printable Digital Receipt Modal (if selected) */}
        {selectedReceiptOrder && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
              className="bg-white border border-zinc-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-4 border-b border-zinc-200">
                <div>
                  <div className="text-xs font-mono uppercase text-red-600 font-bold">
                    Official Merch Receipt
                  </div>
                  <h3 className="text-lg font-black text-black">
                    Receipt #{selectedReceiptOrder.receiptNumber}
                  </h3>
                  <p className="text-xs text-zinc-400">Order ID: {selectedReceiptOrder.id}</p>
                </div>
                <button
                  onClick={() => setSelectedReceiptOrder(null)}
                  className="p-1 text-zinc-400 hover:text-black cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-zinc-500">
                  <span>Billing Date</span>
                  <span className="font-semibold text-black">{selectedReceiptOrder.date}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Merchant</span>
                  <span className="font-semibold text-black">Sanelow Direct Merchant Logistics</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Delivery Address</span>
                  <span className="font-semibold text-black text-right max-w-xs">
                    {selectedReceiptOrder.shippingAddress.fullName},{' '}
                    {selectedReceiptOrder.shippingAddress.street},{' '}
                    {selectedReceiptOrder.shippingAddress.city},{' '}
                    {selectedReceiptOrder.shippingAddress.country}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="border-t border-b border-zinc-100 py-3 space-y-2">
                {selectedReceiptOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <div>
                      <span className="font-bold text-black">{it.product.title}</span>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        Size: {it.size} • Color: {it.color} • Qty: {it.quantity}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-black">
                      {formatPrice(it.priceUSD * it.quantity, currency)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm font-black">
                <span>Total Captured</span>
                <span className="text-red-600">
                  {formatPrice(selectedReceiptOrder.totalUSD, currency)}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 hover:border-black text-xs font-bold text-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  onClick={() => setSelectedReceiptOrder(null)}
                  className="flex-1 py-2.5 rounded-xl bg-black text-white hover:bg-zinc-800 text-xs font-bold cursor-pointer transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
