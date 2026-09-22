import React, { useState } from 'react';
import {
  X,
  CheckCircle,
  CreditCard,
  Truck,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Lock,
  MapPin,
  PackageCheck,
  Clock,
  Sparkles,
} from 'lucide-react';
import { CartItem, CurrencyCode } from '../types';
import { formatPrice } from '../data/products';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: CurrencyCode;
  promoCode?: string;
  discountPercent?: number;
  onOrderSuccess: (orderId: string, trackingNumber: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  promoCode,
  discountPercent = 0,
  onOrderSuccess,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<'shipping' | 'payment' | 'confirmation'>('shipping');
  const [formData, setFormData] = useState({
    fullName: 'Alex Johnson',
    email: 'alex.johnson@example.com',
    phone: '+1 (555) 234-8901',
    street: '742 Evergreen Terrace',
    apartment: 'Apt 4B',
    city: 'Springfield',
    province: 'Oregon',
    postalCode: '97477',
    country: 'United States',
    shippingMethod: 'standard_tracked',
    paymentMethod: 'card',
    cardNumber: '4242 •••• •••• 4242',
    cardExpiry: '11/28',
    cardCvc: '884',
  });

  const [orderNumber, setOrderNumber] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Subtotal calculation
  const rawSubtotalUSD = items.reduce((acc, item) => {
    const unitPrice = item.appliedDiscountPercent
      ? item.product.priceUSD * (1 - item.appliedDiscountPercent / 100)
      : item.product.priceUSD;
    return acc + unitPrice * item.quantity;
  }, 0);

  const discountAmountUSD = (rawSubtotalUSD * discountPercent) / 100;
  const isFreeStandard = rawSubtotalUSD >= 45;

  const shippingCostUSD =
    formData.shippingMethod === 'express_insured'
      ? isFreeStandard
        ? 4.99
        : 8.99
      : isFreeStandard
      ? 0
      : 4.99;

  const totalUSD = rawSubtotalUSD - discountAmountUSD + shippingCostUSD;

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      const generatedOrderId = `SNLW-${Math.floor(1000 + Math.random() * 9000)}`;
      const generatedTracking = `TRK-${Math.floor(10000000 + Math.random() * 90000000)}-EXP`;
      setOrderNumber(generatedOrderId);
      setTrackingNumber(generatedTracking);
      setIsProcessing(false);
      setStep('confirmation');
      onOrderSuccess(generatedOrderId, generatedTracking);
    }, 1100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        id="checkout-modal-container"
        className="relative w-full max-w-4xl rounded-2xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col text-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-600" />
            <span className="text-xs font-mono uppercase text-zinc-600 font-bold">
              256-Bit SSL Encrypted Direct Checkout
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-200 transition-colors cursor-pointer"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 sm:p-8">
          {step === 'confirmation' ? (
            /* Order Confirmed Screen */
            <div className="max-w-lg mx-auto py-8 text-center space-y-6 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div>
                <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-mono font-bold uppercase">
                  Payment Verified • Drop Order Placed
                </span>
                <h2 className="text-2xl font-black text-black mt-3">
                  Thank you for securing your merch!
                </h2>
                <p className="text-xs text-zinc-600 mt-1.5 leading-relaxed">
                  We've sent an order dispatch confirmation to <strong className="text-black">{formData.email}</strong> with your real-time tracking checkpoints.
                </p>
              </div>

              {/* Order Info Card */}
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 text-left space-y-3 text-xs font-mono">
                <div className="flex justify-between border-b border-zinc-200 pb-2">
                  <span className="text-zinc-500">Order Number:</span>
                  <span className="text-black font-bold">{orderNumber}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 pb-2">
                  <span className="text-zinc-500">Tracking Code:</span>
                  <span className="text-red-600 font-bold">{trackingNumber}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 pb-2">
                  <span className="text-zinc-500">Courier Service:</span>
                  <span className="text-black font-medium">Priority Air Cargo Express</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 pb-2">
                  <span className="text-zinc-500">Estimated Delivery:</span>
                  <span className="text-black font-bold">3 - 5 Business Days</span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-bold">
                  <span className="text-black">Amount Charged:</span>
                  <span className="text-red-600 font-black font-mono">
                    {formatPrice(totalUSD, currency)}
                  </span>
                </div>
              </div>

              {/* Next steps info */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 space-y-1 text-left">
                <div className="font-bold text-black flex items-center gap-1.5 font-mono">
                  <PackageCheck className="w-4 h-4 text-red-600" />
                  <span>Fulfillment Status: In Queue for Fabric Inspection</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Your apparel pieces are scheduled for individual garment QC and sealed packaging. Tracking SMS notifications will be dispatched to {formData.phone}.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                >
                  Return to Merch Catalog
                </button>
              </div>
            </div>
          ) : (
            /* Checkout Form with Order Summary */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Form Fields */}
              <div className="lg:col-span-7 space-y-6">
                {/* Step tabs */}
                <div className="flex items-center gap-4 text-xs font-mono border-b border-zinc-200 pb-3">
                  <button
                    type="button"
                    onClick={() => setStep('shipping')}
                    className={`flex items-center gap-2 cursor-pointer ${
                      step === 'shipping' ? 'text-red-600 font-bold' : 'text-zinc-500 hover:text-black'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        step === 'shipping' ? 'bg-red-600 text-white' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      1
                    </span>
                    <span>Shipping Address</span>
                  </button>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                  <button
                    type="button"
                    onClick={() => setStep('payment')}
                    className={`flex items-center gap-2 cursor-pointer ${
                      step === 'payment' ? 'text-red-600 font-bold' : 'text-zinc-500 hover:text-black'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        step === 'payment' ? 'bg-red-600 text-white' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      2
                    </span>
                    <span>Payment & Place Order</span>
                  </button>
                </div>

                {step === 'shipping' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-black font-mono uppercase tracking-wider flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-red-600" />
                      <span>Contact & Delivery Address</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Full Name</label>
                        <input
                          type="text"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Email (For Tracking)</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Mobile Phone (SMS Tracking)</label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Country</label>
                        <select
                          value={formData.country}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                        >
                          <option value="United States">United States</option>
                          <option value="United Kingdom">United Kingdom</option>
                          <option value="Canada">Canada</option>
                          <option value="Australia">Australia</option>
                          <option value="South Africa">South Africa</option>
                          <option value="Germany">Germany</option>
                          <option value="France">France</option>
                          <option value="Japan">Japan</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">City</label>
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">State / Prov</label>
                        <input
                          type="text"
                          value={formData.province}
                          onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Postal Code</label>
                        <input
                          type="text"
                          value={formData.postalCode}
                          onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black focus:outline-none focus:border-red-600 focus:bg-white"
                          required
                        />
                      </div>
                    </div>

                    {/* Shipping Method Selection */}
                    <div className="pt-2 space-y-2">
                      <label className="block text-xs font-mono font-bold uppercase text-black">
                        Select Delivery Tier:
                      </label>
                      <div className="grid grid-cols-1 gap-2">
                        <label
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            formData.shippingMethod === 'standard_tracked'
                              ? 'bg-red-50/70 border-red-600'
                              : 'bg-white border-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="shippingMethod"
                              checked={formData.shippingMethod === 'standard_tracked'}
                              onChange={() =>
                                setFormData({ ...formData, shippingMethod: 'standard_tracked' })
                              }
                              className="text-red-600 focus:ring-red-500"
                            />
                            <div>
                              <div className="text-xs font-bold text-black">Standard Tracked Air Shipping</div>
                              <div className="text-[11px] text-zinc-500">Dispatched in 24h • 5-7 Business Days</div>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-red-600">
                            {isFreeStandard ? 'COMPLIMENTARY' : formatPrice(4.99, currency)}
                          </span>
                        </label>

                        <label
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            formData.shippingMethod === 'express_insured'
                              ? 'bg-red-50/70 border-red-600'
                              : 'bg-white border-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="shippingMethod"
                              checked={formData.shippingMethod === 'express_insured'}
                              onChange={() =>
                                setFormData({ ...formData, shippingMethod: 'express_insured' })
                              }
                              className="text-red-600 focus:ring-red-500"
                            />
                            <div>
                              <div className="text-xs font-bold text-black flex items-center gap-1.5">
                                <span>Priority Express Air + Damage Warranty</span>
                                <span className="px-1.5 py-0.2 rounded bg-black text-white text-[9px] font-black uppercase">
                                  Priority
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-500">Priority Hub Dispatch • 3-5 Business Days</div>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-black">
                            {isFreeStandard ? formatPrice(4.99, currency) : formatPrice(8.99, currency)}
                          </span>
                        </label>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setStep('payment')}
                      className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 mt-4 cursor-pointer"
                    >
                      <span>Continue to Payment</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {step === 'payment' && (
                  <form onSubmit={handlePlaceOrder} className="space-y-4">
                    <h3 className="text-sm font-black text-black font-mono uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-red-600" />
                      <span>Payment Method</span>
                    </h3>

                    {/* Payment methods */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'card', label: 'Credit Card', icon: '💳' },
                        { id: 'paypal', label: 'PayPal', icon: '🅿️' },
                        { id: 'apple_pay', label: 'Apple Pay', icon: '🍎' },
                        { id: 'instant_eft', label: 'Instant EFT', icon: '⚡' },
                      ].map((pm) => (
                        <button
                          key={pm.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, paymentMethod: pm.id })}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            formData.paymentMethod === pm.id
                              ? 'bg-red-50 border-red-600 text-red-600 font-bold'
                              : 'bg-white border-zinc-200 text-zinc-600 hover:text-black'
                          }`}
                        >
                          <div className="text-lg">{pm.icon}</div>
                          <div className="text-[11px] font-mono mt-1">{pm.label}</div>
                        </button>
                      ))}
                    </div>

                    {/* Credit Card Inputs */}
                    {formData.paymentMethod === 'card' && (
                      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Card Number</label>
                          <input
                            type="text"
                            value={formData.cardNumber}
                            onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs text-black font-mono focus:outline-none focus:border-red-600"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Expiry Date</label>
                            <input
                              type="text"
                              value={formData.cardExpiry}
                              onChange={(e) => setFormData({ ...formData, cardExpiry: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs text-black font-mono focus:outline-none focus:border-red-600"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">CVC / CVV</label>
                            <input
                              type="password"
                              value={formData.cardCvc}
                              onChange={(e) => setFormData({ ...formData, cardCvc: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs text-black font-mono focus:outline-none focus:border-red-600"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {formData.paymentMethod !== 'card' && (
                      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 text-center space-y-1">
                        <p>Safe tokenized authentication will trigger automatically.</p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setStep('shipping')}
                        className="px-4 py-3.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-black text-xs font-bold uppercase transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="submit"
                        disabled={isProcessing}
                        className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                      >
                        {isProcessing ? (
                          <span>Processing Drop Allocation...</span>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>Authorize & Place Order • {formatPrice(totalUSD, currency)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Right Column: Order Summary */}
              <div className="lg:col-span-5">
                <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-4">
                  <h3 className="text-xs font-mono font-bold uppercase text-black">
                    Order Summary ({items.length} Items)
                  </h3>

                  <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                    {items.map((item) => {
                      const unitPrice = item.appliedDiscountPercent
                        ? item.product.priceUSD * (1 - item.appliedDiscountPercent / 100)
                        : item.product.priceUSD;

                      return (
                        <div key={item.id} className="flex gap-3 text-xs">
                          <div className="w-12 h-14 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                            <img
                              src={item.product.images[0]}
                              alt={item.product.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-black line-clamp-1">{item.product.title}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Size: {item.selectedSize || 'M'} • SKU: {item.product.sku}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Qty: {item.quantity}
                            </div>
                          </div>
                          <div className="font-mono text-red-600 font-bold">
                            {formatPrice(unitPrice * item.quantity, currency)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Calculations */}
                  <div className="border-t border-zinc-200 pt-3 space-y-1.5 text-xs font-mono text-zinc-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="text-black">{formatPrice(rawSubtotalUSD, currency)}</span>
                    </div>
                    {discountAmountUSD > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Coupon ({promoCode})</span>
                        <span>-{formatPrice(discountAmountUSD, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span className="text-red-600 font-bold">
                        {shippingCostUSD === 0 ? 'COMPLIMENTARY' : formatPrice(shippingCostUSD, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-black pt-2 border-t border-zinc-200">
                      <span>Total</span>
                      <span className="text-base text-red-600 font-mono font-black">
                        {formatPrice(totalUSD, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Trust guarantees */}
                  <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1.5 text-[11px] text-zinc-500">
                    <div className="flex items-center gap-1.5 text-red-600 font-mono font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>30-Day Authentic Fit Guarantee</span>
                    </div>
                    <p className="text-[10px] leading-relaxed">
                      If sizing or fabric drape is not satisfactory, exchange seamlessly with prepaid return labels.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
