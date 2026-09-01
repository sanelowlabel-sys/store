import React, { useState } from 'react';
import { 
  X, 
  Lock, 
  CreditCard, 
  CheckCircle2, 
  ShieldCheck, 
  Wand2,
  Truck,
  ArrowRight
} from 'lucide-react';
import { CartItem, CustomerInfo, Order } from '../types';

interface CheckoutModalProps {
  isOpen: boolean;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  grandTotal: number;
  appliedPromo: string | null;
  onClose: () => void;
  onCompleteOrder: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  items,
  subtotal,
  discount,
  shipping,
  tax,
  grandTotal,
  appliedPromo,
  onClose,
  onCompleteOrder
}) => {
  if (!isOpen) return null;

  const [customer, setCustomer] = useState<CustomerInfo>({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States'
  });

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'applepay' | 'paypal'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Quick Autofill Demo Data for Seamless User Testing
  const handleAutofillDemo = () => {
    setCustomer({
      fullName: 'Sarah Jenkins',
      email: 'sarah.jenkins@example.com',
      phone: '+1 (555) 234-5678',
      address: '742 Evergreen Terrace',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94107',
      country: 'United States'
    });
    setCardNumber('4242 •••• •••• 4242');
    setCardExpiry('12/28');
    setCardCvc('888');
  };

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      const newOrder: Order = {
        id: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
        items: [...items],
        subtotal,
        discount,
        tax,
        shipping,
        total: grandTotal,
        promoCode: appliedPromo || undefined,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'Processing',
        customer,
        paymentMethod: paymentMethod === 'card' ? 'Visa ending in 4242' : paymentMethod === 'applepay' ? 'Apple Pay' : 'PayPal',
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };

      setIsProcessing(false);
      onCompleteOrder(newOrder);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden max-h-[90vh] flex flex-col my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800/80 bg-stone-50 dark:bg-stone-800/50">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 font-serif">
              Secure Encrypted Checkout
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAutofillDemo}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 font-semibold text-xs hover:bg-red-500/20 transition cursor-pointer"
              title="Fill sample customer address"
            >
              <Wand2 className="w-3.5 h-3.5 text-red-500" />
              <span>Autofill Demo</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Form Body */}
        <form onSubmit={handleSubmitOrder} className="overflow-y-auto p-6 sm:p-8 space-y-6">
          
          {/* Shipping Address Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-red-500" />
              <span>1. Shipping Information</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={customer.fullName}
                  onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })}
                  placeholder="Sarah Jenkins"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-red-500 text-stone-900 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  placeholder="sarah@example.com"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-red-500 text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  placeholder="742 Evergreen Terrace, Apt 4B"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-red-500 text-stone-900 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">City</label>
                <input
                  type="text"
                  required
                  value={customer.city}
                  onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                  placeholder="San Francisco"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-red-500 text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">State / Prov</label>
                  <input
                    type="text"
                    required
                    value={customer.state}
                    onChange={(e) => setCustomer({ ...customer, state: e.target.value })}
                    placeholder="CA"
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-red-500 text-stone-900 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">ZIP / Postal</label>
                  <input
                    type="text"
                    required
                    value={customer.zipCode}
                    onChange={(e) => setCustomer({ ...customer, zipCode: e.target.value })}
                    placeholder="94107"
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-red-500 text-stone-900 dark:text-stone-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Section */}
          <div className="space-y-3 pt-4 border-t border-stone-100 dark:border-stone-800">
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-red-500" />
              <span>2. Payment Method</span>
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'border-red-500 bg-red-500/10 text-stone-900 dark:text-stone-100'
                    : 'border-stone-200 dark:border-stone-800 text-stone-500 hover:bg-stone-50'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Credit Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('applepay')}
                className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
                  paymentMethod === 'applepay'
                    ? 'border-red-500 bg-red-500/10 text-stone-900 dark:text-stone-100'
                    : 'border-stone-200 dark:border-stone-800 text-stone-500 hover:bg-stone-50'
                }`}
              >
                <span className="font-bold text-sm">Pay</span>
                <span>Apple Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('paypal')}
                className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
                  paymentMethod === 'paypal'
                    ? 'border-red-500 bg-red-500/10 text-stone-900 dark:text-stone-100'
                    : 'border-stone-200 dark:border-stone-800 text-stone-500 hover:bg-stone-50'
                }`}
              >
                <span className="font-bold italic text-sky-600">PayPal</span>
                <span>Express</span>
              </button>
            </div>

            {paymentMethod === 'card' && (
              <div className="grid grid-cols-3 gap-3 text-xs p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">Card Number</label>
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4242 4242 4242 4242"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">Expiration (MM/YY)</label>
                  <input
                    type="text"
                    required
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="12/28"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">CVC / CWW</label>
                  <input
                    type="text"
                    required
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                    placeholder="888"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Summary Footer */}
          <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-stone-400">Total Due Today</span>
              <p className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-serif">
                ${grandTotal.toFixed(2)}
              </p>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white font-semibold text-sm transition shadow-xl cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-stone-400 border-t-transparent animate-spin"></span>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Complete Order</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
