import React, { useState } from 'react';
import { Calculator, DollarSign, TrendingUp, ShoppingBag, Target, ArrowUpRight, Percent, Award } from 'lucide-react';

export const ProfitCalculator: React.FC = () => {
  const [baseCost, setBaseCost] = useState<number>(18.50);
  const [shippingCost, setShippingCost] = useState<number>(5.50);
  const [retailPrice, setRetailPrice] = useState<number>(54.00);
  const [monthlyTraffic, setMonthlyTraffic] = useState<number>(10000);
  const [conversionRate, setConversionRate] = useState<number>(2.2); // %
  const [adCac, setAdCac] = useState<number>(18.00); // $ per customer

  const totalCostPerUnit = baseCost + shippingCost;
  const grossProfitPerUnit = retailPrice - totalCostPerUnit;
  const grossMargin = ((grossProfitPerUnit / retailPrice) * 100) || 0;

  const totalOrders = Math.round(monthlyTraffic * (conversionRate / 100));
  const monthlyRevenue = totalOrders * retailPrice;
  const monthlyCogs = totalOrders * totalCostPerUnit;
  const monthlyAdSpend = totalOrders * adCac;
  const monthlyNetProfit = monthlyRevenue - monthlyCogs - monthlyAdSpend;
  const netMargin = monthlyRevenue > 0 ? (monthlyNetProfit / monthlyRevenue) * 100 : 0;
  const roas = monthlyAdSpend > 0 ? (monthlyRevenue / monthlyAdSpend) : 0;

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 rounded-2xl border border-slate-700/80 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              Printify + WooCommerce POD Profitability & Economics Calculator
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl">
              Simulate unit margins, monthly sales volume, ad acquisition CAC budgets, and net cash flow for your dropshipping store.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Column */}
        <div className="lg:col-span-5 bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-5 shadow-xl">
          <h3 className="text-base font-bold text-slate-100 border-b border-slate-700 pb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-400" />
            Unit Pricing & Traffic Parameters
          </h3>

          <div className="space-y-4 text-xs">
            {/* Base Garment Cost */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Printify Base Blank Garment Cost:</span>
                <strong className="text-amber-400">${baseCost.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={0.5}
                value={baseCost}
                onChange={(e) => setBaseCost(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>

            {/* Printify Shipping Cost */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Printify Carrier Shipping Fee:</span>
                <strong className="text-amber-400">${shippingCost.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min={2}
                max={20}
                step={0.5}
                value={shippingCost}
                onChange={(e) => setShippingCost(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>

            {/* Retail Selling Price */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>WooCommerce Retail Sale Price:</span>
                <strong className="text-emerald-400">${retailPrice.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min={15}
                max={150}
                step={1}
                value={retailPrice}
                onChange={(e) => setRetailPrice(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>

            {/* Monthly Traffic */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Monthly Store Traffic (Visitors):</span>
                <strong className="text-blue-400">{monthlyTraffic.toLocaleString()} v</strong>
              </div>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={monthlyTraffic}
                onChange={(e) => setMonthlyTraffic(parseInt(e.target.value))}
                className="w-full accent-blue-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>

            {/* Conversion Rate */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>WooCommerce Conversion Rate (%):</span>
                <strong className="text-purple-400">{conversionRate.toFixed(1)}%</strong>
              </div>
              <input
                type="range"
                min={0.5}
                max={6.0}
                step={0.1}
                value={conversionRate}
                onChange={(e) => setConversionRate(parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>

            {/* Customer Acquisition Cost (CAC) */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Ad CAC (Meta / TikTok / Google):</span>
                <strong className="text-rose-400">${adCac.toFixed(2)} / sale</strong>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={adCac}
                onChange={(e) => setAdCac(parseFloat(e.target.value))}
                className="w-full accent-rose-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 space-y-1">
              <span className="text-xs text-slate-400 block font-semibold">Unit Gross Profit</span>
              <strong className="text-xl font-bold text-emerald-400">${grossProfitPerUnit.toFixed(2)}</strong>
              <span className="text-[10px] text-slate-400 block">{grossMargin.toFixed(1)}% Gross Margin</span>
            </div>

            <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 space-y-1">
              <span className="text-xs text-slate-400 block font-semibold">Monthly Orders</span>
              <strong className="text-xl font-bold text-amber-400">{totalOrders} Sales</strong>
              <span className="text-[10px] text-slate-400 block">@ {conversionRate}% CR</span>
            </div>

            <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 space-y-1 col-span-2 sm:col-span-1">
              <span className="text-xs text-slate-400 block font-semibold">Target ROAS</span>
              <strong className="text-xl font-bold text-blue-400">{roas.toFixed(2)}x</strong>
              <span className="text-[10px] text-slate-400 block">${adCac} CAC Budget</span>
            </div>
          </div>

          {/* Monthly P&L Breakdown Card */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-100 border-b border-slate-700 pb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                Monthly Pro-Forma Income Statement
              </span>
              <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 font-bold">
                Net Profit: ${monthlyNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-700">
                <span className="text-slate-300 font-semibold">Total Gross Revenue ({totalOrders} units @ ${retailPrice}):</span>
                <span className="font-bold text-emerald-400 text-sm">${monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400">Total Printify COGS (Blanks + Shipping):</span>
                <span className="font-semibold text-rose-300">-${monthlyCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400">Total Paid Advertising Spend ({totalOrders} @ ${adCac} CAC):</span>
                <span className="font-semibold text-rose-300">-${monthlyAdSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center bg-emerald-950/60 p-4 rounded-xl border border-emerald-500/40 text-sm">
                <span className="font-bold text-emerald-300">Net Take-Home Profit:</span>
                <span className="font-bold text-emerald-400 text-base">${monthlyNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({netMargin.toFixed(1)}% Net Margin)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
