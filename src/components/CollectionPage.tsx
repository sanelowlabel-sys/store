import React, { useMemo } from 'react';
import { ChevronRight, Layers, ArrowLeft } from 'lucide-react';
import { Product, ShopifyCollection, ShopifyVariant } from '../types';
import { ProductCard } from './ProductCard';

export interface CollectionPageProps {
  collection: ShopifyCollection;
  currency: string;
  isWishlisted: (id: string) => boolean;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onAddToCart?: (product: Product, variant: ShopifyVariant) => void;
  onBackToHome: () => void;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
  collection,
  currency,
  isWishlisted,
  onToggleWishlist,
  onQuickView,
  onAddToCart,
  onBackToHome,
}) => {
  const collectionProducts = useMemo(() => {
    return collection.products || [];
  }, [collection]);

  return (
    <div id="collection-main" className="min-h-screen bg-white text-[#0f172a] pt-28 sm:pt-32 pb-20 scroll-mt-28 sm:scroll-mt-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation with crawlable links */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-xs sm:text-sm text-[#64748b] font-mono">
            <li>
              <a
                href="/"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onBackToHome();
                  }
                }}
                className="hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
              >
                HOME
              </a>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-[#64748b]" />
            </li>
            <li>
              <a
                href="/#catalogue"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onBackToHome();
                  }
                }}
                className="hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
              >
                CATALOGUE
              </a>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-[#64748b]" />
            </li>
            <li className="text-[#0f172a] font-bold uppercase truncate" aria-current="page">
              {collection.title}
            </li>
          </ol>
        </nav>

        {/* Back Link */}
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs uppercase font-mono font-semibold tracking-wider text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalogue</span>
        </button>

        {/* Header */}
        <div className="mb-10 border-b border-[#e2e8f0] pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-full text-[#0f172a] text-xs font-mono mb-4 shadow-xs">
            <Layers className="w-3.5 h-3.5 text-red-600" />
            <span>COLLECTION • {collectionProducts.length} PIECES</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-heading font-extrabold uppercase tracking-tight text-[#0f172a] mb-4">
            {collection.title}
          </h1>
          {collection.description && (
            <p className="text-[#64748b] max-w-2xl text-sm sm:text-base leading-relaxed">
              {collection.description}
            </p>
          )}
        </div>

        {/* Products Grid */}
        {collectionProducts.length === 0 ? (
          <div className="py-16 text-center text-[#64748b] font-mono text-sm bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl">
            No pieces found in this collection.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {collectionProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={currency}
                onSelect={(p) => onQuickView(p)}
                onQuickView={onQuickView}
                onAddToCart={onAddToCart ? (prod, variant) => onAddToCart(prod, variant) : undefined}
                onToggleWishlist={onToggleWishlist}
                isWishlisted={isWishlisted(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionPage;
