import React, { useState } from 'react';
import { X, Sparkles, Send, Bot, User, ArrowRight, Eye, ShoppingBag } from 'lucide-react';
import { Product } from '../types';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  products: Product[];
  onClose: () => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  recommendedProducts?: Product[];
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  products,
  onClose,
  onQuickView,
  onAddToCart
}) => {
  if (!isOpen) return null;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Welcome to Sanelow Label Merch Concierge! Looking for sizing recommendations on our 480GSM heavyweight hoodies, tour tees, headwear, or limited vinyl releases?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const samplePrompts = [
    'What size heavyweight hoodie should I get for an oversized fit?',
    'Show me the latest tour tees and headwear drops',
    'Tell me about the Volume I limited vinyl pressing'
  ];

  const handleSendMessage = async (userQuery: string) => {
    if (!userQuery.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userQuery
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai-shopping-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery, products })
      });

      const data = await res.json();
      
      const matchedProducts = products.filter(p => 
        data.recommendedProductIds?.includes(p.id)
      );

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.text || "Here are my curated recommendations from our studio collection.",
        recommendedProducts: matchedProducts.length > 0 ? matchedProducts : [products[0], products[3]]
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: 'I recommend exploring our Noise-Canceling Headphones and Titanium Chrono for timeless, refined utility.',
          recommendedProducts: [products[0], products[3]]
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-6 border-b border-stone-100 dark:border-stone-800 bg-stone-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-sans">Sanelow Merch Concierge</h3>
                <p className="text-[11px] text-stone-300">Sanelow Label Apparel & Sizing Advisor</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-stone-800 text-stone-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`space-y-3 max-w-[85%] ${
                  msg.sender === 'user'
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 p-3.5 rounded-2xl rounded-tr-none font-medium'
                    : 'bg-stone-50 dark:bg-stone-800/80 p-4 rounded-2xl rounded-tl-none border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200'
                }`}>
                  <p>{msg.text}</p>

                  {/* Recommended Products Carousel Cards */}
                  {msg.recommendedProducts && msg.recommendedProducts.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                        Curated Gear Recommendations:
                      </p>
                      <div className="space-y-2">
                        {msg.recommendedProducts.map((p) => (
                          <div key={p.id} className="flex items-center gap-3 p-2 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700">
                            <img src={p.images[0]} alt="" className="w-12 h-12 object-cover rounded-lg bg-stone-100" />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-stone-900 dark:text-stone-100 truncate">{p.name}</p>
                              <p className="text-[10px] text-stone-400">${p.price} &bull; {p.category}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => onQuickView(p)}
                                className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-white"
                                title="Quick View"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onAddToCart(p)}
                                className="p-1.5 rounded-lg bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-bold"
                                title="Add to Bag"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 items-center text-xs text-stone-400">
                <div className="w-7 h-7 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
                <span>Curating matching recommendations...</span>
              </div>
            )}
          </div>

          {/* Sample prompts */}
          <div className="p-3 bg-stone-50 dark:bg-stone-800/40 border-t border-stone-100 dark:border-stone-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-1.5">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-[11px] text-stone-600 dark:text-stone-300 hover:border-red-500 transition cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Footer */}
          <div className="p-4 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask about guitars, synths, audio specs..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-full text-xs bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-transparent focus:border-red-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2.5 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 disabled:opacity-40 transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
};
