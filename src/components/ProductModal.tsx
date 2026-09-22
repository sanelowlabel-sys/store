import React, { useState } from 'react';
import {
  X,
  Check,
  Star,
  ShoppingBag,
  Heart,
  ShieldCheck,
  Truck,
  Clock,
  Flame,
  Layers,
  Ruler,
  Info,
  Package,
} from 'lucide-react';
import { Product, CurrencyCode, ProductColor, MerchSize } from '../types';
import { formatPrice } from '../data/products';

interface ProductModalProps {
  product: Product | null;
  currency: CurrencyCode;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (
    product: Product,
    size: MerchSize,
    color?: ProductColor,
    quantity?: number,
    appliedDiscountPercent?: number
  ) => void;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  currency,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onClose,
}) => {
  if (!product) return null;

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<MerchSize>(
    product.sizes.length > 0 ? product.sizes[Math.min(2, product.sizes.length - 1)] : 'M'
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [selectedBundleQty, setSelectedBundleQty] = useState<number>(1);
  const [isAdded, setIsAdded] = useState(false);
  const [activeTab, setActiveTab] = useState<'fabric' | 'sizing' | 'reviews'>('fabric');
  const [showSizeGuide, setShowSizeGuide] = useState(false);

  // Calculate bundle discount
  const activeBundle = product.bundleDeals?.find((b) => b.quantity === selectedBundleQty);
  const discountPercent = activeBundle ? activeBundle.discountPercent : 0;
  const effectiveUnitUSD = product.priceUSD * (1 - discountPercent / 100);
  const totalUSD = effectiveUnitUSD * selectedBundleQty;

  const handleAdd = () => {
    onAddToCart(product, selectedSize, selectedColor, selectedBundleQty, discountPercent);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-md overflow-y-auto">
      <div
        id="product-modal-container"
        className="relative w-full max-w-4xl rounded-2xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col text-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          id="close-product-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-white/90 text-zinc-600 hover:text-black border border-zinc-200 hover:border-black transition-colors cursor-pointer shadow-sm"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto flex-1 p-5 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Gallery Column */}
            <div className="lg:col-span-6 space-y-4">
              {/* Main Image Stage */}
              <div className="relative aspect-[4/5] w-full rounded-2xl bg-zinc-100 border border-zinc-200 overflow-hidden">
                <img
                  src={product.images[selectedImageIndex] || product.images[0]}
                  alt={product.title}
                  className="w-full h-full object-cover object-center"
                />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
                  {product.badge && (
                    <span className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                      {product.badge}
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-md bg-white border border-zinc-200 text-red-600 text-[10px] font-mono font-bold shadow-xs">
                    SAVE {product.discountPercent}% OFF
                  </span>
                </div>

                <div className="absolute bottom-3 left-3">
                  <span className="px-2.5 py-1 rounded-md bg-black/85 text-white text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-xs">
                    SKU: {product.sku}
                  </span>
                </div>
              </div>

              {/* Thumbnails */}
              {product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {product.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative aspect-square rounded-xl overflow-hidden border transition-all cursor-pointer ${
                        selectedImageIndex === idx
                          ? 'border-red-600 ring-2 ring-red-600/30'
                          : 'border-zinc-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Delivery info card */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs text-zinc-600">
                <div className="flex items-center gap-2 font-mono text-black font-bold">
                  <Truck className="w-4 h-4 text-red-600" />
                  <span>Complimentary Tracked Air Courier Over $45</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Direct dispatch with individual waybill tracking, insured transit, and customs pre-clearance. Sealed in eco-friendly dust bags.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 pt-1 border-t border-zinc-200">
                  <Clock className="w-3.5 h-3.5 text-red-600" />
                  <span>
                    {product.isPreOrder
                      ? product.preOrderShipDate
                      : 'Dispatches within 24 hours from logistics hub.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Product Details & Purchase Form Column */}
            <div className="lg:col-span-6 space-y-5">
              <div>
                {/* Collection & Rating */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-mono uppercase text-zinc-500 font-bold tracking-wider">
                    {product.dropCollection}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex text-amber-500">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs font-black text-black">{product.rating}</span>
                    <span className="text-xs text-zinc-400">
                      ({product.reviewsCount} verified reviews)
                    </span>
                  </div>
                </div>

                {/* Title in bold black */}
                <h1 className="text-xl sm:text-2xl font-black text-black leading-tight">
                  {product.title}
                </h1>
                <p className="text-xs text-zinc-600 mt-1">{product.tagline}</p>

                {/* Stock alert */}
                <div className="mt-3 p-2.5 rounded-xl bg-red-50/70 border border-red-200 flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-red-700 font-bold">
                    <Flame className="w-4 h-4 text-red-600" />
                    {product.isPreOrder
                      ? `Pre-Order Window Open • ${product.stockCount} Slots Left`
                      : `Drop Allocation: Only ${product.stockCount} units remaining!`}
                  </span>
                  <span className="text-[11px] text-zinc-500">Fast sellout</span>
                </div>

                {/* Pricing Box */}
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-3xl font-black font-mono text-red-600">
                    {formatPrice(effectiveUnitUSD * selectedBundleQty, currency)}
                  </span>
                  <span className="text-sm font-mono text-zinc-400 line-through">
                    {formatPrice(product.compareAtPriceUSD * selectedBundleQty, currency)}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-mono font-bold">
                    Save {product.discountPercent}% OFF
                  </span>
                </div>
              </div>

              {/* Sizing Picker (XS to 3XL) */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                    <span>Select Size:</span>
                    <span className="text-red-600 font-mono font-black">{selectedSize}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide(!showSizeGuide)}
                    className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>{showSizeGuide ? 'Hide Guide' : 'Size & Fit Guide'}</span>
                  </button>
                </div>

                {/* Sizing Chart Guide Accordion */}
                {showSizeGuide && (
                  <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs space-y-2 animate-in fade-in">
                    <div className="font-bold text-black flex items-center justify-between">
                      <span>Garment Measurements (Inches / CM)</span>
                      <span className="text-[10px] font-mono text-zinc-500">Unisex Streetwear Cut</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-400 uppercase">
                            <th className="py-1 pr-2">Size</th>
                            <th className="py-1 px-2">Chest</th>
                            <th className="py-1 px-2">Length</th>
                            <th className="py-1 pl-2">Shoulder</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/60">
                          {product.sizingDetails.map((spec) => (
                            <tr
                              key={spec.size}
                              className={selectedSize === spec.size ? 'bg-red-50/70 font-bold' : ''}
                            >
                              <td className="py-1 pr-2 text-black font-bold">{spec.size}</td>
                              <td className="py-1 px-2 text-zinc-600">{spec.chest}</td>
                              <td className="py-1 px-2 text-zinc-600">{spec.length}</td>
                              <td className="py-1 pl-2 text-zinc-600">{spec.shoulder || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Size Selection Buttons */}
                <div className="grid grid-cols-7 gap-1.5">
                  {product.sizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`py-2.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                        selectedSize === sz
                          ? 'bg-red-600 border-red-600 text-white shadow-sm'
                          : 'bg-white border-zinc-200 text-zinc-800 hover:border-black'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colorway Choice */}
              {product.colors && product.colors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-black font-bold uppercase">Colorway:</span>
                    <span className="text-red-600 font-bold">{selectedColor?.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                          selectedColor?.name === c.name
                            ? 'bg-zinc-100 border-red-600 text-black font-bold'
                            : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-zinc-300 shadow-xs"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className="text-xs font-sans">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Multi-Buy Bundle Deal Selector */}
              {product.bundleDeals && product.bundleDeals.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold uppercase text-black flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-red-600" />
                    <span>Bundle & Save Multi-Pack:</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.bundleDeals.map((bundle) => {
                      const isSelected = selectedBundleQty === bundle.quantity;
                      const unitPrice = product.priceUSD * (1 - bundle.discountPercent / 100);
                      return (
                        <button
                          key={bundle.quantity}
                          type="button"
                          onClick={() => setSelectedBundleQty(bundle.quantity)}
                          className={`p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                            isSelected
                              ? 'bg-red-50/60 border-red-600 shadow-xs'
                              : 'bg-white border-zinc-200 hover:border-zinc-400'
                          }`}
                        >
                          {bundle.popular && (
                            <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-wider">
                              Most Popular
                            </span>
                          )}
                          <div className="text-xs font-bold text-black">{bundle.label}</div>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xs font-mono font-black text-red-600">
                              {formatPrice(unitPrice * bundle.quantity, currency)}
                            </span>
                            {bundle.discountPercent > 0 && (
                              <span className="text-[10px] font-mono text-emerald-600 font-bold">
                                {bundle.discountPercent}% OFF
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons: Add to Bag + Wishlist */}
              <div className="pt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    id="modal-add-to-cart-btn"
                    type="button"
                    onClick={handleAdd}
                    className={`flex-1 py-4 px-6 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer ${
                      isAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Added To Your Bag!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        <span>
                          Add ({selectedSize}) • {formatPrice(totalUSD, currency)}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleWishlist(product)}
                    className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                      isWishlisted
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-white border-zinc-200 text-zinc-500 hover:text-black hover:border-black'
                    }`}
                    aria-label="Wishlist item"
                  >
                    <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current text-white' : ''}`} />
                  </button>
                </div>

                {/* Trust Seal */}
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center gap-2 text-xs text-zinc-600 font-mono">
                  <ShieldCheck className="w-4 h-4 text-red-600" />
                  <span>30-Day Authentic Fit & Quality Guarantee</span>
                </div>
              </div>

              {/* Detail Tabs */}
              <div className="pt-4 border-t border-zinc-200">
                <div className="flex items-center gap-6 border-b border-zinc-200 text-xs font-mono mb-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('fabric')}
                    className={`pb-2 transition-colors relative cursor-pointer ${
                      activeTab === 'fabric'
                        ? 'text-red-600 font-bold border-b-2 border-red-600'
                        : 'text-zinc-500 hover:text-black'
                    }`}
                  >
                    Fabric & Garment Specs
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sizing')}
                    className={`pb-2 transition-colors relative cursor-pointer ${
                      activeTab === 'sizing'
                        ? 'text-red-600 font-bold border-b-2 border-red-600'
                        : 'text-zinc-500 hover:text-black'
                    }`}
                  >
                    Fit & Sizing Breakdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('reviews')}
                    className={`pb-2 transition-colors relative cursor-pointer ${
                      activeTab === 'reviews'
                        ? 'text-red-600 font-bold border-b-2 border-red-600'
                        : 'text-zinc-500 hover:text-black'
                    }`}
                  >
                    Reviews ({product.reviews.length})
                  </button>
                </div>

                {activeTab === 'fabric' && (
                  <div className="space-y-3 text-xs">
                    <p className="leading-relaxed text-zinc-600">{product.description}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {product.fabricSpecs.map((spec, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col"
                        >
                          <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                            {spec.label}
                          </span>
                          <span className="font-semibold text-black mt-0.5">{spec.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'sizing' && (
                  <div className="space-y-3 text-xs">
                    <p className="text-zinc-600 leading-relaxed">
                      Custom tailored boxy streetwear proportion. We recommend taking your true size for an authentic drape, or size down for a slimmer tailored silhouette.
                    </p>
                    <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl overflow-hidden">
                      {product.sizingDetails.map((sz, i) => (
                        <div key={i} className="p-2.5 flex justify-between bg-white text-xs font-mono">
                          <span className="font-bold text-black">{sz.size}</span>
                          <span className="text-zinc-600">Chest: {sz.chest}</span>
                          <span className="text-zinc-600">Length: {sz.length}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="space-y-3">
                    {product.reviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-black flex items-center gap-1.5">
                            {rev.author}
                            {rev.sizePurchased && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-800">
                                {rev.sizePurchased}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">{rev.date}</span>
                        </div>
                        <div className="flex text-amber-500">
                          {[...Array(rev.rating)].map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-current" />
                          ))}
                        </div>
                        <p className="text-zinc-600 text-xs leading-relaxed mt-1">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
