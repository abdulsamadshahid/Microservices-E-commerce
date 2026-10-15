import React, { useState, useEffect } from 'react';
import { Package, Clock, ShieldCheck, RefreshCw, AlertCircle, UserCheck } from 'lucide-react';
import type { Order } from '../types/index.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';

interface OrderHistoryProps {
  onOpenAuth: () => void;
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({ onOpenAuth }) => {
  const { user, token, loginDemo } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getOrders(token);
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve order history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [token, user?.id]);

  if (!user || !token) {
    return (
      <div className="py-16 max-w-xl mx-auto px-4 text-center">
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center">
            <Package className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Sign In to View Orders</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            ShopSphere strictly enforces order ownership. Each authenticated user can only access orders belonging to their account.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => loginDemo('alice@example.com')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
            >
              Sign in as Alice
            </button>
            <button
              onClick={() => loginDemo('bob@example.com')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Sign in as Bob
            </button>
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold transition"
            >
              Custom Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header and User Isolation Notice */}
      <div className="mb-6 rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold mb-1">
            <UserCheck className="w-4 h-4" />
            <span>Multi-Tenant Data Isolation Active</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Order History</h1>
          <p className="text-xs text-slate-400 mt-1">
            Logged in as <span className="font-semibold text-white">{user.name}</span> ({user.email})
          </p>
        </div>

        {/* Quick Tenant Switcher to demonstrate security */}
        <div className="flex items-center space-x-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700/60">
          <span className="text-[11px] text-slate-400 pl-2">Switch Tenant:</span>
          <button
            onClick={() => loginDemo('alice@example.com')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              user.email === 'alice@example.com'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Alice
          </button>
          <button
            onClick={() => loginDemo('bob@example.com')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              user.email === 'bob@example.com'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Bob
          </button>
          <button
            onClick={fetchOrders}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
            title="Refresh order history"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-rose-300 text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200">No orders placed yet</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
            Place an order from the Catalog to experience the atomic inventory reservation workflow.
          </p>
        </div>
      ) : (
        /* Order List */
        <div className="space-y-4">
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white">Order #{order.id.substring(0, 8)}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        order.status === 'CONFIRMED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Amount</p>
                  <p className="text-lg font-black text-indigo-400">
                    ${(order.totalCents / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Idempotency Key details */}
              {order.idempotencyKey && (
                <div className="mt-3 text-[11px] text-slate-500 flex items-center space-x-1.5 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Idempotency Key: {order.idempotencyKey}</span>
                </div>
              )}

              {/* Items List */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-300">Items:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {order.items.map(item => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-750 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{item.productName}</p>
                        <p className="text-[11px] text-slate-400">
                          {item.quantity} x ${(item.unitPriceCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-bold text-white">
                        ${(item.subtotalCents / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
