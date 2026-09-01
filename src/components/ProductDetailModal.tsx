import React, { useState } from 'react';
import { 
  X, 
  Star, 
  Check, 
  ShoppingBag, 
  Heart, 
  Truck, 
  ShieldCheck, 
  RotateCcw, 
  Plus, 
  Minus,
  MessageSquare,
  ThumbsUp,
  Sparkles
} from 'lucide-react';
import { Product, ColorOption, Review } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  reviews: Review[];
  isWishlisted: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, size?: string, color?: ColorOption) => void;
  onToggleWishlist: (product: Product) => void;
  onAddReview: (review: Omit<Review, 'id' | 'date' | 'verified'>) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  reviews,
  isWishlisted,
  onClose,
  onAddToCart,
  onToggleWishlist,
  onAddReview
}) => {
  if (!product) return null;

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    product.variants?.sizes?.[0]
  );
  const [selectedColor, setSelectedColor] = useState<ColorOption | undefined>(
    product.variants?.colors?.[0]
  );
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'overview' | 'specs' | 'reviews'>('overview');

  // Review Form State
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReviewAuthor, setNewReviewAuthor] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewTitle, setNewReviewTitle] = useState('');
  const [newReviewComment, setNewReviewComment] = useState('');

  const productReviews = reviews.filter(r => r.productId === product.id);

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewAuthor.trim() || !newReviewTitle.trim() || !newReviewComment.trim()) return;

    onAddReview({
      productId: product.id,
      author: newReviewAuthor,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80`,
      rating: newReviewRating,
      title: newReviewTitle,
      comment: newReviewComment
    });

    setNewReviewAuthor('');
    setNewReviewTitle('');
    setNewReviewComment('');
    setShowReviewForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      
      {/* Modal Card Container */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden max-h-[90vh] flex flex-col my-auto">
        
        {/* Top Header Close Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800/80">
          <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">
            {product.category} &bull; {product.id}
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            
            {/* Gallery Column */}
            <div className="space-y-4">
              <div className="aspect-square rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-800 relative">
                <img
                  src={product.images[selectedImageIndex] || product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover transition duration-300"
                />
                
                <button
                  onClick={() => onToggleWishlist(product)}
                  className={`absolute top-4 right-4 p-2.5 rounded-full shadow-md backdrop-blur-md transition cursor-pointer ${
                    isWishlisted ? 'bg-rose-500 text-white' : 'bg-white/80 dark:bg-stone-900/80 text-stone-700 dark:text-stone-200'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current' : ''}`} />
                </button>
              </div>

              {/* Thumbnails */}
              {product.images.length > 1 && (
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {product.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition flex-shrink-0 cursor-pointer ${
                        selectedImageIndex === idx
                          ? 'border-red-600 scale-105'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details & Selection Column */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center text-red-500">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < Math.floor(product.rating) ? 'fill-current' : 'text-stone-300 dark:text-stone-700'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100">{product.rating}</span>
                  <span className="text-xs text-stone-400">({product.reviewCount} customer reviews)</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-stone-100">
                  {product.name}
                </h2>
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                  {product.tagline}
                </p>
              </div>

              {/* Price & Stock */}
              <div className="flex items-baseline gap-3 p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-800">
                <span className="text-3xl font-bold text-stone-900 dark:text-stone-100">
                  ${product.price}
                </span>
                {product.originalPrice && (
                  <span className="text-base text-stone-400 line-through">
                    ${product.originalPrice}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>In Stock ({product.stockQuantity} available)</span>
                </div>
              </div>

              {/* Color Options */}
              {product.variants?.colors && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Color: <span className="font-bold text-stone-900 dark:text-stone-100">{selectedColor?.name}</span>
                  </label>
                  <div className="flex items-center gap-3">
                    {product.variants.colors.map((col) => (
                      <button
                        key={col.name}
                        onClick={() => setSelectedColor(col)}
                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition cursor-pointer ${
                          selectedColor?.name === col.name
                            ? 'border-stone-900 dark:border-white scale-110 shadow-md'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      >
                        {selectedColor?.name === col.name && (
                          <Check className={`w-4 h-4 ${col.hex === '#f8fafc' || col.hex === '#e7e5e4' ? 'text-stone-900' : 'text-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Options */}
              {product.variants?.sizes && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Select Size:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.sizes.map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setSelectedSize(sz)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                          selectedSize === sz
                            ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-sm'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity & Add to Cart Controls */}
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center border border-stone-200 dark:border-stone-700 rounded-2xl bg-stone-50 dark:bg-stone-800">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-3 text-stone-500 hover:text-stone-900 dark:hover:text-white transition"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center font-bold text-sm text-stone-900 dark:text-stone-100">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stockQuantity, quantity + 1))}
                    className="p-3 text-stone-500 hover:text-stone-900 dark:hover:text-white transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    onAddToCart(product, quantity, selectedSize, selectedColor);
                    onClose();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white font-semibold text-sm transition shadow-lg cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Add to Bag (${product.price * quantity})</span>
                </button>
              </div>

              {/* Value propositions */}
              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400">
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-red-500" />
                  <span>Free Express Delivery</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-red-500" />
                  <span>30-Day Returns</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                  <span>2-Year Warranty</span>
                </div>
              </div>

            </div>

          </div>

          {/* Tabbed Info & Reviews */}
          <div className="pt-6 border-t border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-6 border-b border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-3 text-sm font-semibold transition border-b-2 cursor-pointer ${
                  activeTab === 'overview'
                    ? 'border-stone-900 text-stone-900 dark:border-white dark:text-white'
                    : 'border-transparent text-stone-400 hover:text-stone-700'
                }`}
              >
                Overview & Features
              </button>
              <button
                onClick={() => setActiveTab('specs')}
                className={`pb-3 text-sm font-semibold transition border-b-2 cursor-pointer ${
                  activeTab === 'specs'
                    ? 'border-stone-900 text-stone-900 dark:border-white dark:text-white'
                    : 'border-transparent text-stone-400 hover:text-stone-700'
                }`}
              >
                Technical Specifications
              </button>
              <button
                onClick={() => setActiveTab('reviews')}
                className={`pb-3 text-sm font-semibold transition border-b-2 cursor-pointer ${
                  activeTab === 'reviews'
                    ? 'border-stone-900 text-stone-900 dark:border-white dark:text-white'
                    : 'border-transparent text-stone-400 hover:text-stone-700'
                }`}
              >
                Reviews ({productReviews.length})
              </button>
            </div>

            {/* Tab Contents */}
            <div className="py-6">
              {activeTab === 'overview' && (
                <div className="space-y-4 text-stone-600 dark:text-stone-300 text-sm leading-relaxed">
                  <p>{product.description}</p>
                  <div>
                    <h4 className="font-bold text-stone-900 dark:text-stone-100 mb-2">Key Highlights:</h4>
                    <ul className="space-y-1.5 list-disc list-inside">
                      {product.features.map((feat, i) => (
                        <li key={i}>{feat}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'specs' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {product.specs && Object.entries(product.specs).map(([key, val]) => (
                    <div key={key} className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 flex justify-between">
                      <span className="font-medium text-stone-500 dark:text-stone-400">{key}</span>
                      <span className="font-bold text-stone-900 dark:text-stone-100">{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'reviews' && (
                <div className="space-y-6">
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-stone-900 dark:text-stone-100">Customer Feedback</h4>
                      <p className="text-xs text-stone-400">Verified purchases and ratings</p>
                    </div>

                    <button
                      onClick={() => setShowReviewForm(!showReviewForm)}
                      className="px-4 py-2 rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 font-semibold text-xs hover:bg-red-500/20 transition cursor-pointer"
                    >
                      {showReviewForm ? 'Cancel Review' : 'Write a Review'}
                    </button>
                  </div>

                  {/* Add Review Form */}
                  {showReviewForm && (
                    <form onSubmit={handleReviewSubmit} className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800 space-y-3 border border-stone-200 dark:border-stone-700">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-stone-700 dark:text-stone-300">Submit Your Experience</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Your Name"
                          value={newReviewAuthor}
                          onChange={e => setNewReviewAuthor(e.target.value)}
                          required
                          className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 focus:outline-none"
                        />
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                          <span className="text-xs font-semibold text-stone-400">Rating:</span>
                          {[1, 2, 3, 4, 5].map(st => (
                            <Star
                              key={st}
                              onClick={() => setNewReviewRating(st)}
                              className={`w-4 h-4 cursor-pointer ${st <= newReviewRating ? 'text-red-500 fill-red-500' : 'text-stone-300'}`}
                            />
                          ))}
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Review Headline (e.g., Exceeded my expectations)"
                        value={newReviewTitle}
                        onChange={e => setNewReviewTitle(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 focus:outline-none"
                      />
                      <textarea
                        placeholder="Detailed review thoughts..."
                        value={newReviewComment}
                        onChange={e => setNewReviewComment(e.target.value)}
                        rows={3}
                        required
                        className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 focus:outline-none"
                      ></textarea>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition"
                      >
                        Publish Review
                      </button>
                    </form>
                  )}

                  {/* Reviews List */}
                  {productReviews.length === 0 ? (
                    <p className="text-xs text-stone-400 italic">No reviews written yet. Be the first to share your thoughts!</p>
                  ) : (
                    <div className="space-y-4">
                      {productReviews.map((rev) => (
                        <div key={rev.id} className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <img src={rev.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                              <div>
                                <p className="text-xs font-bold text-stone-900 dark:text-stone-100">{rev.author}</p>
                                <span className="text-[10px] text-stone-400">{rev.date} &bull; Verified Purchase</span>
                              </div>
                            </div>
                            <div className="flex text-red-500">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} className={`w-3.5 h-3.5 ${i < rev.rating ? 'fill-current' : 'text-stone-300'}`} />
                              ))}
                            </div>
                          </div>
                          <h6 className="text-xs font-bold text-stone-800 dark:text-stone-200">{rev.title}</h6>
                          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">{rev.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
