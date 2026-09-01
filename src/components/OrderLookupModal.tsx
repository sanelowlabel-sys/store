import React, { useState } from 'react';
import { X, Search, PackageCheck, Truck, CheckCircle2, Calendar, MapPin } from 'lucide-react';
import { Order } from '../types';

interface OrderLookupModalProps {
  isOpen: boolean;
  recentOrders: Order[];
  onClose: () => void;
}

export const OrderLookupModal: React.FC<OrderLookupModalProps> = ({
  isOpen,
  recentOrders,
  onClose
}) => {
  if (!isOpen) return null;

  const [searchId, setSearchId] = useState('');
  const [searchedOrder, setSearchedOrder] = useState<Order | null>(
    recentOrders[0] || null
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchId.trim().toUpperCase();
    const found = recentOrders.find(o => o.id.toUpperCase() === query || o.customer.email.toLowerCase() === query.toLowerCase());
    setSearchedOrder(found || null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden max-h-[90vh] flex flex-col my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Track Order Status
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs">
          
          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Enter Order ID (e.g. ORD-849201) or Email"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-transparent focus:border-red-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold hover:bg-stone-800 transition"
            >
              Lookup
            </button>
          </form>

          {/* Result Order */}
          {searchedOrder ? (
            <div className="space-y-4 p-5 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-700 pb-3">
                <div>
                  <span className="font-bold text-sm text-stone-900 dark:text-stone-100">{searchedOrder.id}</span>
                  <p className="text-[11px] text-stone-400">Placed on {searchedOrder.date}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs">
                  {searchedOrder.status}
                </span>
              </div>

              <div className="flex items-center gap-2 font-semibold text-stone-700 dark:text-stone-300">
                <Truck className="w-4 h-4 text-red-500" />
                <span>Estimated Arrival: {searchedOrder.estimatedDelivery}</span>
              </div>

              {/* Items */}
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold text-stone-400 uppercase">Order Line Items:</span>
                {searchedOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
                    <div className="flex items-center gap-2">
                      <img src={item.product.images[0]} alt="" className="w-8 h-8 object-cover rounded-md" />
                      <span className="font-semibold text-stone-900 dark:text-stone-100">{item.product.name}</span>
                    </div>
                    <span className="font-bold">${item.product.price * item.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-stone-200 dark:border-stone-700 flex justify-between font-bold text-stone-900 dark:text-stone-100">
                <span>Total Amount Paid</span>
                <span>${searchedOrder.total.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-stone-400">
              <p>No recent orders found matching that ID.</p>
              <p className="text-[11px] mt-1">Try completing a test order from your shopping bag!</p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
