import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, ShieldCheck, Check, Truck, AlertTriangle } from 'lucide-react';
import type { Product, InventoryStatus } from '../types/index.js';
import { api } from '../services/api.js';
import { useCart } from '../context/CartContext.js';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
  const [quantity, setQuantity] = useState(1);
  const [inventory, setInventory] = useState<InventoryStatus | null>(null);
  const [loadingInv, setLoadingInv] = useState(false);
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setJustAdded(false);
    setLoadingInv(true);
    api.getInventory(product.id)
      .then(res => setInventory(res))
      .catch(() => setInventory(null))
      .finally(() => setLoadingInv(false));
  }, [product]);

  if (!product) return null;

  const isOutOfStock = inventory !== null && inventory.availableStock <= 0;
  const maxAvailable = inventory ? inventory.availableStock : 10;

  const handleAdd = () => {
    addItem(product, quantity);
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Product Image */}
          <div className="h-64 md:h-full bg-slate-950 relative">
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-900/90 text-indigo-400 border border-indigo-500/30">
                {product.category}
              </span>
            </div>
          </div>

          {/* Details & Actions */}
          <div className="p-6 flex flex-col justify-between space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{product.name}</h2>
              <p className="mt-2 text-2xl font-black text-indigo-400">
                ${(product.price_cents / 100).toFixed(2)}
              </p>

              {/* Live stock status pill */}
              <div className="mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-slate-400">Real-Time Inventory:</span>
                {loadingInv ? (
                  <span className="text-slate-400 animate-pulse">Checking stock...</span>
                ) : inventory ? (
                  isOutOfStock ? (
                    <span className="font-bold text-rose-400 flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Out of Stock</span>
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-400 flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{inventory.availableStock} Units Available</span>
                    </span>
                  )
                ) : (
                  <span className="text-slate-400">Inventory check pending</span>
                )}
              </div>

              <div className="mt-4">
                <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-400">Description</h4>
                <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                  {product.description}
                </p>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <Truck className="w-4 h-4 text-sky-400" />
                  <span>Instant digital reservation & fast order fulfillment</span>
                </div>
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Atomic transaction with rollback compensation</span>
                </div>
              </div>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Quantity</label>
                <div className="flex items-center space-x-2">
                  <button
                    disabled={quantity <= 1 || isOutOfStock}
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold flex items-center justify-center transition"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-white">{quantity}</span>
                  <button
                    disabled={quantity >= maxAvailable || isOutOfStock}
                    onClick={() => setQuantity(q => Math.min(maxAvailable, q + 1))}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold flex items-center justify-center transition"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                disabled={isOutOfStock}
                onClick={handleAdd}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition shadow-lg ${
                  isOutOfStock
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : justAdded
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added to Cart!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>{isOutOfStock ? 'Sold Out' : `Add ${quantity} to Cart — $${((product.price_cents * quantity) / 100).toFixed(2)}`}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
