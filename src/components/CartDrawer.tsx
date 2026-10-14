import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';

interface CartDrawerProps {
  onOrderSuccess: (orderId: string) => void;
  onOpenAuth: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onOrderSuccess, onOpenAuth }) => {
  const { items, isDrawerOpen, setIsDrawerOpen, removeItem, updateQuantity, totalCents, clearCart } = useCart();
  const { user, token, loginDemo } = useAuth();

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);

  if (!isDrawerOpen) return null;

  const regenerateKey = () => {
    setIdempotencyKey(`cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  };

  const handleCheckout = async () => {
    if (!user || !token) {
      onOpenAuth();
      return;
    }

    if (items.length === 0) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const orderPayload = items.map(i => ({
        productId: i.product.id,
        quantity: i.quantity,
      }));

      const order = await api.createOrder(orderPayload, idempotencyKey, token);
      clearCart();
      setSuccessOrder(order.id);
      regenerateKey();
      setTimeout(() => {
        setSuccessOrder(null);
        setIsDrawerOpen(false);
        onOrderSuccess(order.id);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Order placement failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={() => setIsDrawerOpen(false)} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 text-white flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShoppingBag className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold">Shopping Cart</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
                {items.length} items
              </span>
            </div>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 text-slate-500">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Your cart is empty</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-xs">
                  Browse the catalog and add products to test atomic stock reservation.
                </p>
              </div>
            ) : (
              items.map(item => (
                <div
                  key={item.product.id}
                  className="bg-slate-850 border border-slate-800 rounded-xl p-3 flex space-x-3 items-center"
                >
                  <img
                    src={item.product.image_url}
                    alt={item.product.name}
                    className="w-16 h-16 rounded-lg object-cover bg-slate-950 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{item.product.name}</h4>
                    <p className="text-xs text-indigo-400 font-bold mt-0.5">
                      ${(item.product.price_cents / 100).toFixed(2)}
                    </p>
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs text-white flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold text-slate-200">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs text-white flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-right flex flex-col justify-between items-end h-16">
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-white">
                      ${((item.product.price_cents * item.quantity) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer & Checkout */}
          {items.length > 0 && (
            <div className="p-6 border-t border-slate-800 bg-slate-900/90 space-y-4">
              {/* Idempotency Key Info */}
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-semibold text-slate-300">Idempotency Key:</span>
                  </div>
                  <button
                    onClick={regenerateKey}
                    className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 font-medium"
                    title="Generate new idempotency key"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>New Key</span>
                  </button>
                </div>
                <p className="font-mono text-slate-400 truncate text-[10px]">{idempotencyKey}</p>
                <p className="text-[10px] text-slate-500">
                  Protects against accidental duplicate charges during client retries.
                </p>
              </div>

              {/* Error message */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Checkout failed</p>
                    <p className="mt-0.5 leading-relaxed">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Success notification */}
              {successOrder && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Order confirmed! Redirecting to order history...</span>
                </div>
              )}

              {/* Total Calculation */}
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-white font-medium">${(totalCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Tax</span>
                  <span className="text-white font-medium">$0.00</span>
                </div>
                <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
                  <span>Order Total</span>
                  <span className="text-indigo-400">${(totalCents / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Authenticated User Status or Demo Login */}
              {!user ? (
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs space-y-2">
                  <p className="text-slate-300">Sign in is required to place an order.</p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => loginDemo('alice@example.com')}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                    >
                      Login as Alice
                    </button>
                    <button
                      onClick={onOpenAuth}
                      className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
                    >
                      Other Account
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  disabled={submitting}
                  onClick={handleCheckout}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30 transition"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Reserving Stock & Saving Order...</span>
                    </>
                  ) : (
                    <>
                      <span>Place Order & Reserve Inventory</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}

              <div className="flex items-center justify-center space-x-1 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Synchronous Compensation & Zero-Oversell Guarantee</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
