import React, { useState } from 'react';
import { X, Search, PackageCheck, Truck, ShieldCheck, MapPin, CheckCircle2, Clock } from 'lucide-react';
import { SAMPLE_TRACKING_ORDERS } from '../data/products';
import { OrderTrackResult } from '../types';

interface TrackOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTrackingNumber?: string;
}

export const TrackOrderModal: React.FC<TrackOrderModalProps> = ({
  isOpen,
  onClose,
  defaultTrackingNumber = '',
}) => {
  const [searchInput, setSearchInput] = useState(defaultTrackingNumber || 'SNLW-8492');
  const [activeTracking, setActiveTracking] = useState<OrderTrackResult | null>(
    SAMPLE_TRACKING_ORDERS['SNLW-8492']
  );

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim().toUpperCase();
    if (!query) return;

    if (SAMPLE_TRACKING_ORDERS[query]) {
      setActiveTracking(SAMPLE_TRACKING_ORDERS[query]);
    } else {
      // Dynamic fallback
      setActiveTracking({
        orderId: query.startsWith('SNLW-') ? query : `SNLW-${query}`,
        trackingNumber: `TRK-${Math.floor(10000000 + Math.random() * 90000000)}-EXP`,
        carrier: 'Global Priority Air Express Cargo',
        estimatedDelivery: 'In 2 - 4 business days',
        statusText: 'In Transit — Customs Cleared',
        origin: 'Direct Merch Logistics Hub',
        destination: 'Regional Delivery Facility',
        items: [
          {
            title: 'Verified Merch Drop Package',
            image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=300&q=80',
            quantity: 1,
            size: 'L',
          },
        ],
        timeline: [
          {
            title: 'Order Verified & Fabric Packed',
            date: '2 days ago',
            completed: true,
            current: false,
            location: 'Sanelow Central Fulfillment Hub',
            description: 'Item passed garment quality inspection and heat-sealed in dust bag.',
          },
          {
            title: 'Dispatched via Air Courier Express',
            date: '1 day ago',
            completed: true,
            current: false,
            location: 'Air Cargo International Gateway',
            description: 'Air freight manifest cleared and loaded onto scheduled priority flight.',
          },
          {
            title: 'Arrived at Destination Airport Facility',
            date: 'Today, 06:12 AM',
            completed: true,
            current: true,
            location: 'Regional Sorting Facility',
            description: 'Inbound sorting completed. Transferred to final courier dispatch.',
          },
          {
            title: 'Out for Final Delivery',
            date: 'Estimated Tomorrow',
            completed: false,
            current: false,
            location: 'Recipient Address',
            description: 'Courier route assigned. Tracking will ping on departure.',
          },
        ],
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-zinc-200 text-black shadow-2xl p-6 sm:p-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-black">
              Merch Shipment Tracker
            </h2>
            <p className="text-xs text-zinc-500">
              Track your limited drop or pre-order with real-time international courier checkpoints.
            </p>
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter Order # (e.g. SNLW-8492) or Tracking Code"
              className="w-full pl-10 pr-28 py-3 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-red-600 focus:bg-white transition-colors font-mono uppercase"
            />
            <button
              type="submit"
              className="absolute right-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
            >
              Track
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-500 font-mono">
            <span>Try sample order:</span>
            <button
              type="button"
              onClick={() => {
                setSearchInput('SNLW-8492');
                setActiveTracking(SAMPLE_TRACKING_ORDERS['SNLW-8492']);
              }}
              className="text-red-600 font-bold hover:underline cursor-pointer"
            >
              SNLW-8492
            </button>
            <span>or</span>
            <button
              type="button"
              onClick={() => {
                setSearchInput('SNLW-9014');
                setActiveTracking(SAMPLE_TRACKING_ORDERS['SNLW-9014']);
              }}
              className="text-red-600 font-bold hover:underline cursor-pointer"
            >
              SNLW-9014
            </button>
          </div>
        </form>

        {/* Active Tracking Content */}
        {activeTracking ? (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-mono font-bold uppercase">
                    {activeTracking.statusText}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    Order {activeTracking.orderId}
                  </span>
                </div>
                <div className="text-xs text-zinc-700 font-mono mt-1">
                  Carrier: <strong className="text-black">{activeTracking.carrier}</strong>
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  Tracking #: <span className="text-red-600 font-bold">{activeTracking.trackingNumber}</span>
                </div>
              </div>

              <div className="sm:text-right border-t sm:border-t-0 border-zinc-200 pt-2 sm:pt-0">
                <span className="text-[11px] text-zinc-500 font-mono block">Estimated Arrival</span>
                <span className="text-sm font-black font-mono flex items-center sm:justify-end gap-1.5 text-black">
                  <Clock className="w-3.5 h-3.5 text-red-600" />
                  {activeTracking.estimatedDelivery}
                </span>
              </div>
            </div>

            {/* Step-by-Step Delivery Timeline */}
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-4 font-bold flex items-center gap-1.5">
                <PackageCheck className="w-4 h-4 text-red-600" />
                <span>Shipment Journey Milestones</span>
              </h3>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
                {activeTracking.timeline.map((step, idx) => {
                  return (
                    <div key={idx} className="relative">
                      {/* Milestone Dot */}
                      <div
                        className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                          step.completed
                            ? 'bg-red-600 text-white'
                            : step.current
                            ? 'bg-red-600 ring-4 ring-red-100'
                            : 'bg-zinc-200 border border-zinc-300'
                        }`}
                      >
                        {step.completed ? (
                          <CheckCircle2 className="w-3 h-3 text-white fill-red-600" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>

                      <div className="pl-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-1">
                          <h4
                            className={`text-xs font-bold ${
                              step.current ? 'text-red-600 font-black' : 'text-black'
                            }`}
                          >
                            {step.title}
                          </h4>
                          <span className="text-[11px] text-zinc-400 font-mono">{step.date}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono mt-0.5">
                          <MapPin className="w-3 h-3 text-zinc-400" />
                          <span>{step.location}</span>
                        </div>
                        <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Guarantee Callout */}
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center gap-3 text-xs text-zinc-600 font-sans">
              <ShieldCheck className="w-5 h-5 text-red-600 shrink-0" />
              <span>
                All merch orders include our <strong>On-Time Safe Arrival Promise</strong>. If your delivery encounters transit hold-ups, our support concierge immediately initiates replacement air freight.
              </span>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-500 text-sm">
            Please enter your order number or tracking code above to inspect status.
          </div>
        )}
      </div>
    </div>
  );
};
