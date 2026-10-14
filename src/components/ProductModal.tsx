import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  Star,
  ShoppingBag,
  Heart,
  ShieldCheck,
  Truck,
  Layers,
  Ruler,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Product, ShopifyVariant, ProductColor } from '../types';
import { formatPrice } from '../lib/shopify';

interface ProductModalProps {
  product: Product | null;
  currency?: string;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product, variant: ShopifyVariant, quantity: number) => void;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  currency = 'ZAR',
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onClose,
}) => {
  if (!product) return null;

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes.length > 0 ? product.sizes[0] : ''
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [isAdded, setIsAdded] = useState(false);

  // Map chosen options to the exact Shopify variant
  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return null;

    const match = product.variants.find((v) => {
      const matchSize = selectedSize
        ? v.selectedOptions.some(
            (so) => ['size', 'sizes'].includes(so.name.toLowerCase()) && so.value === selectedSize
          )
        : true;
      const matchColor = selectedColor
        ? v.selectedOptions.some(
            (so) =>
              ['color', 'colour'].includes(so.name.toLowerCase()) && so.value === selectedColor.name
          )
        : true;
      return matchSize && matchColor;
    });

    return match || product.variants[0];
  }, [product.variants, selectedSize, selectedColor]);

  const isAvailable = selectedVariant ? selectedVariant.availableForSale : product.availableForSale;

  const unitPrice = selectedVariant
    ? parseFloat(selectedVariant.price.amount)
    : product.priceAmount;

  const currentCurrency = selectedVariant?.price?.currencyCode || product.currencyCode || currency;

  const comparePrice = selectedVariant?.compareAtPrice?.amount
    ? parseFloat(selectedVariant.compareAtPrice.amount)
    : product.compareAtPriceAmount;

  const hasDiscount = comparePrice && comparePrice > unitPrice;
  const discountPercent = hasDiscount
    ? Math.round(((comparePrice! - unitPrice) / comparePrice!) * 100)
    : 0;

  const totalAmount = unitPrice * quantity;

  const handleAdd = () => {
    if (!selectedVariant || !isAvailable) return;
    onAddToCart(product, selectedVariant, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const images = product.images.length > 0 ? product.images : [
    'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=800&q=80'
  ];

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
                  src={images[selectedImageIndex] || images[0]}
                  alt={product.title}
                  className="w-full h-full object-cover object-center"
                />

                {/* Badges (Only shown when genuine supporting data exists) */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
                  {product.badge && (
                    <span className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                      {product.badge}
                    </span>
                  )}
                  {hasDiscount && (
                    <span className="px-2.5 py-0.5 rounded-md bg-white border border-zinc-200 text-red-600 text-[10px] font-mono font-bold shadow-xs">
                      SAVE {discountPercent}% OFF
                    </span>
                  )}
                </div>

                {product.sku && (
                  <div className="absolute bottom-3 left-3">
                    <span className="px-2.5 py-1 rounded-md bg-black/85 text-white text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-xs">
                      SKU: {product.sku}
                    </span>
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, idx) => (
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
                  <span>Shopify Fulfilled & Shipped</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Real-time shipping rates and courier options for your delivery address are calculated securely at Shopify checkout.
                </p>
              </div>
            </div>

            {/* Product Details & Purchase Form Column */}
            <div className="lg:col-span-6 space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-mono uppercase text-zinc-500 font-bold tracking-wider">
                    {product.dropCollection}
                  </span>
                  {product.rating && (
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                      <span className="text-xs font-black text-black">{product.rating}</span>
                      {product.reviewsCount ? (
                        <span className="text-xs text-zinc-400">
                          ({product.reviewsCount} reviews)
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-black leading-tight">
                  {product.title}
                </h1>
                <p className="text-xs text-zinc-600 mt-1">{product.tagline}</p>

                {/* Availability status badge */}
                <div className="mt-3 p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono bg-zinc-50 border-zinc-200">
                  <span className="flex items-center gap-1.5 font-bold">
                    {isAvailable ? (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        Variant Available in Storefront
                      </span>
                    ) : (
                      <span className="text-red-700 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        Currently Sold Out
                      </span>
                    )}
                  </span>
                  {selectedVariant?.sku && (
                    <span className="text-[11px] text-zinc-400">{selectedVariant.sku}</span>
                  )}
                </div>

                {/* Pricing Box */}
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-3xl font-black font-mono text-red-600">
                    {formatPrice(totalAmount, currentCurrency)}
                  </span>
                  {hasDiscount && (
                    <span className="text-sm font-mono text-zinc-400 line-through">
                      {formatPrice(comparePrice! * quantity, currentCurrency)}
                    </span>
                  )}
                  {hasDiscount && (
                    <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-mono font-bold">
                      Save {discountPercent}% OFF
                    </span>
                  )}
                </div>
              </div>

              {/* Sizing / Variant Options Picker */}
              {product.sizes.length > 1 && (
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <span>Select Size / Option:</span>
                      <span className="text-red-600 font-mono font-black">{selectedSize}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {product.sizes.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSelectedSize(sz)}
                        className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
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
              )}

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

              {/* Quantity Selector */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-mono font-bold uppercase text-black">
                  Quantity:
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-xl bg-zinc-50 border border-zinc-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-3 py-1.5 text-sm text-zinc-600 hover:text-black cursor-pointer"
                      disabled={quantity <= 1}
                    >
                      -
                    </button>
                    <span className="px-4 text-xs font-mono font-bold text-black">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-3 py-1.5 text-sm text-zinc-600 hover:text-black cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">
                    {formatPrice(unitPrice, currentCurrency)} each
                  </span>
                </div>
              </div>

              {/* Action Buttons: Add to Bag + Wishlist */}
              <div className="pt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    id="modal-add-to-cart-btn"
                    type="button"
                    onClick={handleAdd}
                    disabled={!isAvailable}
                    className={`flex-1 py-4 px-6 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer ${
                      !isAvailable
                        ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                        : isAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {!isAvailable ? (
                      <span>Variant Unavailable</span>
                    ) : isAdded ? (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Added To Your Bag!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        <span>
                          Add to Bag • {formatPrice(totalAmount, currentCurrency)}
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
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Shopify Storefront Verified Product</span>
                </div>
              </div>

              {/* Description & Features */}
              <div className="pt-4 border-t border-zinc-200 space-y-3">
                <h4 className="text-xs font-mono font-bold uppercase text-black">
                  Product Description
                </h4>
                <div className="text-xs text-zinc-600 leading-relaxed whitespace-pre-line">
                  {product.description}
                </div>

                {product.features.length > 0 && (
                  <ul className="space-y-1 pt-2">
                    {product.features.map((feat, idx) => (
                      <li key={idx} className="text-xs text-zinc-600 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1.5 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
