import React, { useState, useEffect } from 'react';
import { Search, Plus, Eye, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { Product, InventoryStatus } from '../types/index.js';
import { api } from '../services/api.js';
import { useCart } from '../context/CartContext.js';

interface ProductCatalogProps {
  onSelectProduct: (product: Product) => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ onSelectProduct }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryMap, setInventoryMap] = useState<Record<string, InventoryStatus>>({});
  const [category, setCategory] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { addItem } = useCart();
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const categories = ['All', 'Audio', 'Electronics', 'Home & Office', 'Apparel'];

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const prods = await api.getProducts(search, category);
      setProducts(prods);

      // Fetch live inventory for each product concurrently
      const invResults = await Promise.allSettled(
        prods.map(p => api.getInventory(p.id))
      );

      const invRecord: Record<string, InventoryStatus> = {};
      invResults.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          invRecord[prods[idx].id] = res.value;
        }
      });
      setInventoryMap(invRecord);
    } catch (err: any) {
      setError(err.message || 'Failed to load product catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [category]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCatalog();
  };

  const handleAddToCart = (product: Product) => {
    addItem(product, 1);
    setAddedNotice(product.id);
    setTimeout(() => setAddedNotice(null), 1800);
  };

  return (
    <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Hero Banner */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
            <span>Authoritative Price & Real-Time Stock Sync</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Curated High-Performance Tech
          </h1>
          <p className="mt-2 text-slate-400 text-sm sm:text-base leading-relaxed">
            Every transaction is backed by atomic inventory reservation in PostgreSQL, guaranteed against overselling and concurrency race conditions.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  category === c
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Search form */}
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </form>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 flex items-center justify-between text-rose-300 text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadCatalog}
            className="flex items-center space-x-1 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-semibold text-rose-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-pulse p-4">
              <div className="h-48 bg-slate-800 rounded-xl mb-4" />
              <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-1/2 mb-4" />
              <div className="flex justify-between items-center">
                <div className="h-6 bg-slate-800 rounded w-1/3" />
                <div className="h-8 bg-slate-800 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800">
          <p className="text-slate-400 text-base">No products match your search or filter.</p>
          <button
            onClick={() => {
              setCategory('All');
              setSearch('');
              loadCatalog();
            }}
            className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm font-semibold underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        /* Product Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map(product => {
            const inv = inventoryMap[product.id];
            const stock = inv ? inv.availableStock : null;
            const isOutOfStock = stock !== null && stock <= 0;
            const isLowStock = stock !== null && stock > 0 && stock <= 3;

            return (
              <div
                key={product.id}
                className="group bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 shadow-md hover:shadow-xl hover:shadow-indigo-500/5"
              >
                {/* Product Image */}
                <div className="relative h-48 sm:h-52 overflow-hidden bg-slate-950">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {/* Category badge */}
                  <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-900/80 backdrop-blur text-slate-300 border border-slate-700/60">
                    {product.category}
                  </span>

                  {/* Stock status badge */}
                  <div className="absolute top-3 right-3">
                    {stock !== null ? (
                      isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/90 text-white shadow">
                          Sold Out
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/90 text-white shadow">
                          Only {stock} left!
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/90 text-white shadow">
                          {stock} in stock
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                        Checking...
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3
                      onClick={() => onSelectProduct(product)}
                      className="font-bold text-white text-base hover:text-indigo-400 cursor-pointer line-clamp-1 transition-colors"
                      title={product.name}
                    >
                      {product.name}
                    </h3>
                    <p className="mt-1 text-slate-400 text-xs line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Price</p>
                      <p className="text-lg font-extrabold text-white">
                        ${(product.price_cents / 100).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onSelectProduct(product)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleAddToCart(product)}
                        disabled={isOutOfStock}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                          isOutOfStock
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : addedNotice === product.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                        }`}
                      >
                        {addedNotice === product.id ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
