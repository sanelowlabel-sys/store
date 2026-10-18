import React, { useState, useMemo, useEffect } from 'react';
import {
  Heart,
  ShoppingBag,
  ArrowLeft,
  Star,
  Check,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Product, ShopifyVariant, ProductColor } from '../types';
import { formatPrice } from '../lib/shopify';

interface ProductPageProps {
  product: Product;
  currency: string;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product, variant: ShopifyVariant, quantity: number) => void;
  onBackToCatalogue: () => void;
  onRetryVariants?: () => void;
}

export const ProductPage: React.FC<ProductPageProps> = ({
  product,
  currency,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onBackToCatalogue,
  onRetryVariants,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes.length > 0 ? product.sizes[0] : ''
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);
  const [isAddedRecently, setIsAddedRecently] = useState(false);

  // Scroll to top on page mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [product.handle]);

  // Map chosen options to exact Shopify variant
  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return null;

    const exactMatch = product.variants.find((v) => {
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

    return exactMatch || product.variants[0];
  }, [product.variants, selectedSize, selectedColor]);

  const isVariantAvailable = selectedVariant ? selectedVariant.availableForSale : product.availableForSale;

  const currentPriceAmount = selectedVariant
    ? parseFloat(selectedVariant.price.amount)
    : product.priceAmount;

  const currentCurrency = selectedVariant?.price?.currencyCode || product.currencyCode || currency;

  const comparePriceAmount = selectedVariant?.compareAtPrice?.amount
    ? parseFloat(selectedVariant.compareAtPrice.amount)
    : product.compareAtPriceAmount;

  const hasDiscount = comparePriceAmount && comparePriceAmount > currentPriceAmount;
  const discountPercent = hasDiscount
    ? Math.round(((comparePriceAmount! - currentPriceAmount) / comparePriceAmount!) * 100)
    : 0;

  const handleAdd = () => {
    if (!selectedVariant || !isVariantAvailable) return;
    onAddToCart(product, selectedVariant, quantity);
    setIsAddedRecently(true);
    setTimeout(() => setIsAddedRecently(false), 2000);
  };

  const images = product.images.length > 0
    ? product.images
    : ['https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80'];

  return (
    <article className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 w-full font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Crawlable Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 text-xs font-mono text-zinc-500">
        <ol className="flex items-center gap-2 flex-wrap">
          <li>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onBackToCatalogue();
              }}
              className="hover:text-black transition-colors"
            >
              Home
            </a>
          </li>
          <li>/</li>
          <li>
            <a
              href="/#catalog"
              onClick={(e) => {
                e.preventDefault();
                onBackToCatalogue();
              }}
              className="hover:text-black transition-colors"
            >
              Merch
            </a>
          </li>
          <li>/</li>
          <li className="text-zinc-800 font-bold truncate max-w-xs" aria-current="page">
            {product.title}
          </li>
        </ol>
      </nav>

      {/* Back button */}
      <div className="mb-8">
        <button
          type="button"
          onClick={onBackToCatalogue}
          className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-zinc-600 hover:text-black transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to All Pieces</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14">
        {/* Left: Gallery */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200 shadow-sm">
            <img
              src={images[selectedImageIndex] || images[0]}
              alt={`${product.title} - view ${selectedImageIndex + 1}`}
              className="w-full h-full object-cover object-center"
              width="900"
              height="1125"
            />

            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
              {product.badge && (
                <span
                  className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider shadow-sm ${
                    product.badge === 'PRE-ORDER'
                      ? 'bg-black text-white'
                      : product.badge === 'LIMITED DROP'
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-900 text-white'
                  }`}
                >
                  {product.badge}
                </span>
              )}
              {hasDiscount && (
                <span className="px-2.5 py-1 rounded-md bg-white/95 border border-zinc-200 text-red-600 text-xs font-mono font-bold shadow-xs">
                  SAVE {discountPercent}%
                </span>
              )}
            </div>

            {/* Wishlist toggle */}
            <button
              type="button"
              onClick={() => onToggleWishlist(product)}
              className={`absolute top-4 right-4 p-3 rounded-2xl transition-all z-10 backdrop-blur-md cursor-pointer ${
                isWishlisted
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-white/90 text-zinc-600 hover:text-black hover:bg-white shadow-sm'
              }`}
              aria-label="Save to Wishlist"
            >
              <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current text-white' : ''}`} />
            </button>
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative w-20 h-24 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                    selectedImageIndex === idx ? 'border-red-600 shadow-md scale-102' : 'border-zinc-200 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Info & Actions */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className="text-red-600 font-bold uppercase tracking-wider">
                {product.dropCollection}
              </span>
              {product.sku && (
                <span className="text-zinc-500 font-mono">SKU: {product.sku}</span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-black tracking-tight leading-tight">
              {product.title}
            </h1>

            {product.tagline && (
              <p className="text-sm font-medium text-zinc-600">
                {product.tagline}
              </p>
            )}

            {/* Price section */}
            <div className="flex items-baseline gap-3 pt-2">
              <span className="text-3xl font-black text-black">
                {formatPrice(currentPriceAmount, currentCurrency)}
              </span>
              {hasDiscount && (
                <span className="text-lg font-mono text-zinc-400 line-through">
                  {formatPrice(comparePriceAmount!, currentCurrency)}
                </span>
              )}
              <span
                className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                  isVariantAvailable
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {isVariantAvailable ? 'In Stock (Shopify Verified)' : 'Sold Out'}
              </span>
            </div>

            {/* Incomplete Variants Warning with Retry */}
            {product.variantsIncomplete && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-mono space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    Incomplete options loaded ({product.variants.length} retrieved)
                  </span>
                  {onRetryVariants && (
                    <button
                      type="button"
                      onClick={onRetryVariants}
                      className="text-amber-800 underline hover:text-black font-bold cursor-pointer"
                    >
                      Retry
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-amber-700 leading-normal">
                  {product.incompleteVariantsReason || 'Unable to retrieve all product options from Shopify. Preserving available loaded options.'}
                </p>
              </div>
            )}

            {/* Size Options */}
            {product.sizes.length > 0 && product.sizes[0] !== 'One Size' && (
              <div className="pt-4 border-t border-zinc-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-black uppercase">Selected Size:</span>
                  <span className="text-red-600 font-bold">{selectedSize}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                        selectedSize === sz
                          ? 'bg-black text-white border-black shadow-sm'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:border-black'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Options */}
            {product.colors && product.colors.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-black uppercase">Color Option:</span>
                  <span className="text-zinc-700 font-bold">{selectedColor?.name || 'Selected'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      title={c.name}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                        selectedColor?.name === c.name
                          ? 'border-red-600 scale-110 shadow-sm'
                          : 'border-zinc-300 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Quantity and Add to Bag */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-zinc-300 rounded-xl bg-white px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || !isVariantAvailable}
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold text-zinc-600 hover:text-black disabled:opacity-30 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-xs font-mono font-bold text-black">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    disabled={!isVariantAvailable}
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold text-zinc-600 hover:text-black disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!isVariantAvailable}
                  className={`flex-1 py-3.5 px-6 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                    !isVariantAvailable
                      ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed shadow-none'
                      : isAddedRecently
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {isAddedRecently ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Added to Bag</span>
                    </>
                  ) : !isVariantAvailable ? (
                    <span>Sold Out</span>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Add to Bag • {formatPrice(currentPriceAmount * quantity, currentCurrency)}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Verified Specifications / Features (Only from real data) */}
            {product.features && product.features.length > 0 && (
              <div className="pt-4 border-t border-zinc-200 space-y-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Verified Fabric & Craft
                </span>
                <ul className="space-y-1.5 text-xs text-zinc-700">
                  {product.features.map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Product Description */}
            <div className="pt-4 border-t border-zinc-200 space-y-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                Piece Description
              </span>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {product.description}
              </p>
            </div>
          </div>

          {/* South Africa Dispatch & Genuine Checkout Guarantee */}
          <div className="pt-6 border-t border-zinc-200 grid grid-cols-2 gap-3 text-xs text-zinc-500 font-mono">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-red-600 shrink-0" />
              <span>South Africa Dispatch</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Shopify Certified Checkout</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
