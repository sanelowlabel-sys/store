import React, { useState } from 'react';
import { Heart, ShoppingBag, Eye, Star, Check, Truck, Flame, Layers } from 'lucide-react';
import { Product, CurrencyCode, ProductColor, MerchSize } from '../types';
import { formatPrice } from '../data/products';

interface ProductCardProps {
  product: Product;
  currency: CurrencyCode;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product, size: MerchSize, color?: ProductColor) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  currency,
  isWishlisted,
  onToggleWishlist,
  onQuickView,
  onAddToCart,
}) => {
  const [selectedSize, setSelectedSize] = useState<MerchSize>(
    product.sizes.length > 0 ? product.sizes[Math.min(2, product.sizes.length - 1)] : 'M'
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [isAddedRecently, setIsAddedRecently] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product, selectedSize, selectedColor);
    setIsAddedRecently(true);
    setTimeout(() => setIsAddedRecently(false), 1600);
  };

  const fabricWeight = product.fabricSpecs.find(
    (s) => s.label.toLowerCase().includes('weight') || s.label.toLowerCase().includes('composition')
  )?.value;

  return (
    <div
      id={`product-card-${product.id}`}
      className="group relative flex flex-col rounded-2xl bg-white border border-zinc-200 hover:border-black transition-all duration-300 overflow-hidden shadow-xs hover:shadow-lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Product Image Stage */}
      <div
        className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100 cursor-pointer"
        onClick={() => onQuickView(product)}
      >
        <img
          src={isHovered && product.images[1] ? product.images[1] : product.images[0]}
          alt={product.title}
          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
          loading="lazy"
        />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
          {product.badge && (
            <span
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-sm ${
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
          <span className="px-2 py-0.5 rounded-md bg-white/95 border border-zinc-200 text-red-600 text-[10px] font-mono font-bold shadow-xs">
            SAVE {product.discountPercent}%
          </span>
        </div>

        {/* SKU Top Right under Wishlist */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <span className="px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-xs">
            {product.sku}
          </span>
        </div>

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product);
          }}
          className={`absolute top-3 right-3 p-2 rounded-xl transition-all duration-200 z-10 backdrop-blur-md cursor-pointer ${
            isWishlisted
              ? 'bg-red-600 text-white shadow-md'
              : 'bg-white/90 text-zinc-600 hover:text-black hover:bg-white shadow-sm'
          }`}
          aria-label="Toggle Wishlist"
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current text-white' : ''}`} />
        </button>

        {/* Quick View Button Hover Overlay */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            className="flex-1 py-2 rounded-xl bg-white/95 hover:bg-black hover:text-white border border-zinc-300 text-xs font-bold text-black flex items-center justify-center gap-1.5 backdrop-blur-md transition-all shadow-md cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-red-600" />
            <span>Fabric Specs & Sizing</span>
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 p-4 flex flex-col justify-between space-y-3">
        <div>
          {/* Drop Tag & Reviews */}
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider">
              {product.dropCollection}
            </span>
            <div className="flex items-center gap-1 text-amber-500">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span className="font-bold text-black text-xs">{product.rating}</span>
              <span className="text-[10px] text-zinc-400">({product.reviewsCount})</span>
            </div>
          </div>

          {/* Title in bold black */}
          <h3
            onClick={() => onQuickView(product)}
            className="text-sm font-black text-black hover:text-red-600 transition-colors cursor-pointer line-clamp-1 leading-snug"
          >
            {product.title}
          </h3>

          {/* Fabric Spec / Tagline in grey */}
          <p className="text-xs text-zinc-500 line-clamp-1 mt-0.5">
            {fabricWeight || product.tagline}
          </p>

          {/* Size Pills Selector */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
              <span>SELECT SIZE:</span>
              <span className="text-black font-bold">{selectedSize}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {product.sizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSize(sz);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                    selectedSize === sz
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Color swatches preview */}
          {product.colors && product.colors.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">COLOR:</span>
              <div className="flex items-center gap-1">
                {product.colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedColor(c);
                    }}
                    title={c.name}
                    className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                      selectedColor?.name === c.name
                        ? 'ring-2 ring-red-600 ring-offset-1 ring-offset-white scale-110'
                        : 'border-zinc-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Pricing & Add To Bag */}
        <div className="pt-2 border-t border-zinc-100">
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-black font-mono text-red-600">
                {formatPrice(product.priceUSD, currency)}
              </span>
              <span className="text-xs font-mono text-zinc-400 line-through">
                {formatPrice(product.compareAtPriceUSD, currency)}
              </span>
            </div>

            {product.isPreOrder ? (
              <span className="text-[10px] font-mono text-red-600 font-bold">
                Pre-Order
              </span>
            ) : product.stockCount <= 15 ? (
              <span className="text-[10px] font-mono text-red-600 font-bold flex items-center gap-0.5">
                <Flame className="w-3 h-3 text-red-600" />
                {product.stockCount} left
              </span>
            ) : (
              <span className="text-[10px] font-mono text-emerald-600 font-semibold">
                In Stock
              </span>
            )}
          </div>

          {/* Add to Bag CTA in Red */}
          <button
            type="button"
            onClick={handleQuickAdd}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
              isAddedRecently
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isAddedRecently ? (
              <>
                <Check className="w-4 h-4" />
                <span>Added ({selectedSize})</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add ({selectedSize}) to Bag</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
