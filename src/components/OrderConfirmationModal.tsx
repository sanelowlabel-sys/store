import React from 'react';
import { 
  CheckCircle2, 
  Package, 
  Truck, 
  MapPin, 
  Calendar, 
  Printer, 
  X, 
  ShoppingBag,
  ArrowRight
} from 'lucide-react';
import { Order } from '../types';

interface OrderConfirmationModalProps {
  order: Order | null;
  onClose: () => void;
  onContinueShopping: () => void;
}

export const OrderConfirmationModal: React.FC<OrderConfirmationModalProps> = ({
  order,
  onClose,
  onContinueShopping
}) => {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden max-h-[90vh] flex flex-col my-auto">
        
        {/* Header Success Badge */}
        <div className="bg-stone-900 dark:bg-stone-950 text-white p-6 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-stone-800 text-stone-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            Order Confirmed &bull; {order.id}
          </span>
          <h2 className="text-2xl font-serif font-bold text-white mt-1">
            Thank You, {order.customer.fullName.split(' ')[0]}!
          </h2>
          <p className="text-xs text-stone-400 max-w-md mx-auto mt-1">
            A confirmation receipt has been sent to <strong className="text-stone-200">{order.customer.email}</strong>.
          </p>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-6 text-xs text-stone-700 dark:text-stone-300">
          
          {/* Tracker Timeline */}
          <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between font-semibold mb-3">
              <span className="text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-red-500" />
                Estimated Express Delivery: {order.estimatedDelivery}
              </span>
              <span className="text-red-600 dark:text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-full text-[11px]">
                {order.status}
              </span>
            </div>

            {/* Steps indicator */}
            <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t border-stone-200 dark:border-stone-700">
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto"></div>
                <span className="font-bold text-[10px] text-stone-900 dark:text-stone-100">Order Placed</span>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-red-500 mx-auto animate-pulse"></div>
                <span className="font-bold text-[10px] text-red-600 dark:text-red-400">Processing</span>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-stone-300 dark:bg-stone-700 mx-auto"></div>
                <span className="text-[10px] text-stone-400">Shipped</span>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-stone-300 dark:bg-stone-700 mx-auto"></div>
                <span className="text-[10px] text-stone-400">Delivered</span>
              </div>
            </div>
          </div>

          {/* Purchased Items List */}
          <div>
            <h4 className="font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider mb-3">
              Purchased Items ({order.items.length})
            </h4>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
              {order.items.map((item) => (
                <div key={item.id} className="p-3 flex items-center gap-3 bg-white dark:bg-stone-900">
                  <img src={item.product.images[0]} alt="" className="w-12 h-12 object-cover rounded-lg bg-stone-100" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-stone-900 dark:text-stone-100 truncate">{item.product.name}</p>
                    <p className="text-[11px] text-stone-400">Qty: {item.quantity} &bull; ${item.product.price} each</p>
                  </div>
                  <span className="font-bold text-stone-900 dark:text-stone-100">${item.product.price * item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address & Totals Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800 space-y-1">
              <span className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                Shipping Address
              </span>
              <p className="font-semibold text-stone-800 dark:text-stone-200">{order.customer.fullName}</p>
              <p className="text-stone-500">{order.customer.address}</p>
              <p className="text-stone-500">{order.customer.city}, {order.customer.state} {order.customer.zipCode}</p>
              <p className="text-stone-500">{order.customer.country}</p>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800 space-y-1.5">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>-${order.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Express Shipping</span>
                <span>{order.shipping === 0 ? 'FREE' : `$${order.shipping.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Tax</span>
                <span>${order.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-stone-900 dark:text-stone-100 pt-2 border-t border-stone-200 dark:border-stone-700">
                <span>Total Paid</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-semibold text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>

            <button
              onClick={onContinueShopping}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-semibold text-xs hover:bg-stone-800 transition shadow-md cursor-pointer"
            >
              <span>Back to Store Collection</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
