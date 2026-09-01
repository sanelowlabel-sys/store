import { Product, Review } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Sanelow Heavyweight Signature Hoodie',
    tagline: '480GSM ultra-dense organic fleece with raised red embroidered Sanelow Label logo.',
    category: 'Hoodies & Sweats',
    price: 85,
    originalPrice: 98,
    rating: 4.96,
    reviewCount: 184,
    inStock: true,
    stockQuantity: 14,
    isFeatured: true,
    isBestSeller: true,
    images: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'The definitive Sanelow Label hoodie. Crafted from double-knit 480GSM organic combed cotton with custom dropped shoulders, double-layer hood, and high-density 3D embroidered Sanelow insignia.',
    features: [
      '480GSM Double-Knit Ultra Heavyweight Organic Fleece',
      'High-Density 3D Raised Red Embroidered Sanelow Logo',
      'Custom Oversized Boxy Streetwear Cut',
      'Double-Layered Hood with Custom Matte Metal Eyelets',
      'Pre-shrunk & Silicone Washed for Zero Shrinkage'
    ],
    variants: {
      sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      colors: [
        { name: 'Obsidian Black', hex: '#1c1917' },
        { name: 'Sanelow Red', hex: '#dc2626' },
        { name: 'Heather Charcoal', hex: '#374151' }
      ]
    },
    specs: {
      'Material': '100% Organic Combed Cotton Fleece',
      'Weight': '480 GSM Heavyweight',
      'Fit': 'Oversized Boxy Cut',
      'Care': 'Machine wash cold inside out, hang dry'
    },
    tags: ['hoodie', 'sanelow', 'merch', 'apparel', 'bestseller']
  },
  {
    id: 'prod-2',
    name: 'Sanelow Official World Tour Tee',
    tagline: 'Vintage-washed 240GSM cotton tee with bold back tour tracklist graphic.',
    category: 'T-Shirts & Tees',
    price: 45,
    originalPrice: 52,
    rating: 4.92,
    reviewCount: 126,
    inStock: true,
    stockQuantity: 22,
    isFeatured: true,
    isBestSeller: true,
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Celebrate the Sanelow Label global movement. Printed on luxury 240GSM combed cotton with a relaxed drop-shoulder cut, screen-printed chest mark, and full tour date graphic across the back.',
    features: [
      '240GSM Heavyweight Single Jersey Cotton',
      'Vintage Enzyme Washed for Soft Handfeel',
      'Crack-resistant Screenprinted Front & Back Graphics',
      'Ribbed 1.25" Collar with Double-Needle Stitched Hem',
      'Custom Sanelow Label Woven Neck Tag'
    ],
    variants: {
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: [
        { name: 'Vintage Wash Black', hex: '#18181b' },
        { name: 'Pure White', hex: '#ffffff' },
        { name: 'Acid Crimson', hex: '#991b1b' }
      ]
    },
    specs: {
      'Material': '100% Ring-Spun Cotton',
      'Weight': '240 GSM',
      'Fit': 'Relaxed Drop-Shoulder',
      'Care': 'Machine wash cold, iron inside out'
    },
    tags: ['t-shirt', 'tour tee', 'sanelow', 'merch', 'streetwear']
  },
  {
    id: 'prod-3',
    name: 'Sanelow Label Ribbed Cuff Beanie',
    tagline: 'Thick-gauge acrylic ribbed knit beanie with red woven brand label.',
    category: 'Hats & Headwear',
    price: 32,
    rating: 4.88,
    reviewCount: 94,
    inStock: true,
    stockQuantity: 18,
    isNew: true,
    isFeatured: true,
    images: [
      'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Keep warm on tour or in the studio. Our signature ribbed beanie features a comfortable stretch-fit knit structure and an authentic stitched Sanelow Label emblem on the cuff.',
    features: [
      'Heavy Gauge 100% Soft Tactile Knit Acrylic',
      'Double-Cuffed Fit with High Density Woven Emblem',
      'One Size Fits All Comfortable Stretch Ergonomics',
      'Snug Itch-Free All Day Wearability'
    ],
    variants: {
      colors: [
        { name: 'Deep Black', hex: '#09090b' },
        { name: 'Signal Red', hex: '#ef4444' },
        { name: 'Slate Gray', hex: '#475569' }
      ]
    },
    specs: {
      'Material': '100% Soft Knit Acrylic',
      'Style': 'Folded Cuff Beanie',
      'Size': 'One Size Fits Most'
    },
    tags: ['beanie', 'headwear', 'hat', 'sanelow', 'winter']
  },
  {
    id: 'prod-4',
    name: 'Sanelow Vinyl "Volume I" 180g Collector Release',
    tagline: '180g blood-red marbled audiophile vinyl with deluxe gatefold sleeve & poster.',
    category: 'Vinyl & Physical',
    price: 38,
    rating: 4.98,
    reviewCount: 112,
    inStock: true,
    stockQuantity: 9,
    isFeatured: true,
    isBestSeller: true,
    images: [
      'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1542208998-f6dbbb27a72f?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'The inaugural Sanelow Label physical compilation. Features 12 remastered tracks pressed onto audiophile-grade 180-gram blood red marble vinyl, complete with foil-stamped gatefold jacket and 24"x36" tour poster.',
    features: [
      '180-Gram Heavyweight Blood-Red Marbled Audiophile Vinyl',
      'Mastered specifically for analog turntable playback',
      'High-Gloss Foil Stamped Gatefold Jacket',
      'Includes Limited Fold-out Sanelow World Poster & Download Code',
      'Strictly Limited First Pressing Run of 1,000 Units'
    ],
    specs: {
      'Format': '12" LP 33-1/3 RPM',
      'Vinyl Weight': '180 Gram',
      'Packaging': 'Foil Stamped Gatefold + Printed Inner Sleeve'
    },
    tags: ['vinyl', 'record', 'sanelow album', 'collector', 'music']
  },
  {
    id: 'prod-5',
    name: 'Sanelow Canvas Tour & Studio Tote Bag',
    tagline: 'Heavy-duty 16oz cotton canvas tote with interior zipped organizer pocket.',
    category: 'Accessories & Bags',
    price: 28,
    rating: 4.85,
    reviewCount: 78,
    inStock: true,
    stockQuantity: 25,
    isNew: true,
    images: [
      'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Built to carry vinyl records, cables, laptops, and daily gear. Constructed from thick 16oz unbleached cotton canvas with reinforced X-stitched handles and screenprinted Sanelow Label branding.',
    features: [
      '16oz Heavy-Duty Natural Cotton Canvas Body',
      'Fits up to 15 Vinyl LPs or a 16" Laptop with Ease',
      'Reinforced Cross-Stitched Carrying Straps (11" Drop)',
      'Internal Zippered Pocket for Keys, Phone & Wallet',
      'Bold Sanelow Label Red Logo Print'
    ],
    specs: {
      'Dimensions': '18" H x 15" W x 5" D',
      'Material': '100% Heavy Cotton Canvas',
      'Capacity': '22 Liters'
    },
    tags: ['tote bag', 'canvas', 'accessories', 'vinyl bag', 'sanelow']
  },
  {
    id: 'prod-6',
    name: 'Sanelow Tech Nylon Flight Bomber Jacket',
    tagline: 'Water-resistant nylon flight jacket with sleeve utility pocket and rear embroidery.',
    category: 'Outerwear',
    price: 140,
    originalPrice: 165,
    rating: 4.95,
    reviewCount: 62,
    inStock: true,
    stockQuantity: 7,
    isFeatured: true,
    images: [
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'A statement outerwear piece designed for late night tour stops and cool studio nights. Features matte water-resistant nylon, thick orange satin lining, metallic zippers, and tonal Sanelow back embroidery.',
    features: [
      'Water-Resistant High-Density Matte Nylon Shell',
      'High-Visibility Red/Orange Satin Padded Lining',
      'Utility Zippered Sleeve Pocket with Sanelow Red Flight Tag',
      'Ribbed Collar, Cuffs, and Elastic Waistband',
      'Tonal Large Format Sanelow Label Back Embroidery'
    ],
    variants: {
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      colors: [
        { name: 'Midnight Black', hex: '#18181b' },
        { name: 'Military Olive', hex: '#3f6212' }
      ]
    },
    specs: {
      'Shell': '100% Water-Resistant Nylon',
      'Lining': '100% Polyester Insulation',
      'Fit': 'Classic Flight Jacket Fit'
    },
    tags: ['bomber jacket', 'outerwear', 'jacket', 'sanelow', 'streetwear']
  },
  {
    id: 'prod-7',
    name: 'Sanelow Pro DJ Slipmats & Record Weight Set',
    tagline: 'High-density felt DJ slipmats (pair) + solid aluminum turntable stabilizer.',
    category: 'Accessories & Bags',
    price: 35,
    rating: 4.91,
    reviewCount: 88,
    inStock: true,
    stockQuantity: 16,
    isBestSeller: true,
    images: [
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Elevate your vinyl DJ setup. Package includes two 12" premium anti-static felt slipmats with Sanelow artwork and a heavy CNC-machined red aluminum record stabilizer for resonance control.',
    features: [
      '12" Glazed Bottom Anti-Static Felt DJ Slipmats (Pair)',
      'CNC-Machined 380g Anodized Red Aluminum Record Weight',
      'Reduces Turntable Vibration & Improves Vinyl Cueing Precision',
      'Includes Sanelow Collector Sticker Pack'
    ],
    specs: {
      'Slipmat Size': '12 inch Standard (Fit all turntables)',
      'Weight Stabilizer': '380 grams Anodized Aluminum',
      'Includes': '2 Slipmats + 1 Record Weight + Sticker Sheet'
    },
    tags: ['slipmats', 'dj', 'turntable', 'vinyl accessories', 'sanelow']
  },
  {
    id: 'prod-8',
    name: 'Sanelow Distressed Corduroy Dad Cap',
    tagline: '100% Cotton corduroy cap with custom brass metal buckle and tonal logo.',
    category: 'Hats & Headwear',
    price: 36,
    rating: 4.89,
    reviewCount: 57,
    inStock: true,
    stockQuantity: 12,
    images: [
      'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1534215754734-18e55d13e346?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Effortless vintage aesthetic. Soft 8-wale cotton corduroy with an unstructured 6-panel crown, curved brim, and adjustable strap with engraved brass hardware.',
    features: [
      '100% Premium 8-Wale Cotton Corduroy',
      'Unstructured Low-Profile 6-Panel Silhouette',
      'Direct Embroidered Sanelow Wordmark on Front',
      'Adjustable Self-Fabric Strap with Engraved Brass Buckle'
    ],
    variants: {
      colors: [
        { name: 'Vintage Rust Red', hex: '#b91c1c' },
        { name: 'Washed Black', hex: '#27272a' },
        { name: 'Sand Beige', hex: '#d6d3d1' }
      ]
    },
    specs: {
      'Material': '100% Cotton Corduroy',
      'Size': 'Adjustable Strap (One Size Fits All)'
    },
    tags: ['dad hat', 'cap', 'headwear', 'corduroy', 'sanelow']
  }
];

export const SAMPLE_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    productId: 'prod-1',
    author: 'Mateo Sanchez',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
    rating: 5,
    date: '2 days ago',
    title: 'Hands down the best quality hoodie I own!',
    comment: 'The 480GSM fleece on this Sanelow hoodie is absurdly heavyweight and warm. The red embroidery pops in person. Sizing is perfectly boxy.',
    verified: true
  },
  {
    id: 'rev-2',
    productId: 'prod-2',
    author: 'Julian Thorne',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80',
    rating: 5,
    date: '1 week ago',
    title: 'Tour tee fabric is incredible',
    comment: 'Super soft vintage wash feel, true heavyweight cotton. The back print graphic detail is sharp and hasn’t faded after multiple washes.',
    verified: true
  },
  {
    id: 'rev-3',
    productId: 'prod-4',
    author: 'Elena Rostova',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=100&q=80',
    rating: 5,
    date: '2 weeks ago',
    title: 'A true collector’s vinyl pressing!',
    comment: 'The blood-red marbled vinyl is visually stunning and plays silently with crisp audio separation. Gatefold sleeve artwork is 10/10.',
    verified: true
  }
];

export const PROMO_CODES: Record<string, { code: string; type: 'percentage' | 'fixed'; value: number; minSpend: number }> = {
  'SANELOW10': { code: 'SANELOW10', type: 'percentage', value: 10, minSpend: 40 },
  'SANELOW20': { code: 'SANELOW20', type: 'fixed', value: 20, minSpend: 80 },
  'WELCOME10': { code: 'WELCOME10', type: 'percentage', value: 10, minSpend: 30 }
};
