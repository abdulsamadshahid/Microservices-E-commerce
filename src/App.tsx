/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext.js';
import { CartProvider } from './context/CartContext.js';
import { Navbar } from './components/Navbar.js';
import { ProductCatalog } from './components/ProductCatalog.js';
import { ProductDetailModal } from './components/ProductDetailModal.js';
import { CartDrawer } from './components/CartDrawer.js';
import { OrderHistory } from './components/OrderHistory.js';
import { DevOpsDashboard } from './components/DevOpsDashboard.js';
import { AuthModal } from './components/AuthModal.js';
import type { Product } from './types/index.js';
import { Server, ShieldCheck, Heart } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'catalog' | 'orders' | 'devops'>('catalog');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const handleOrderSuccess = (orderId: string) => {
    setCurrentTab('orders');
  };

  return (
    <AuthProvider>
      <CartProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
          {/* Top Navigation */}
          <Navbar
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            onOpenAuth={() => setIsAuthOpen(true)}
          />

          {/* Main Body */}
          <main className="flex-1">
            {currentTab === 'catalog' && (
              <ProductCatalog onSelectProduct={product => setSelectedProduct(product)} />
            )}

            {currentTab === 'orders' && (
              <OrderHistory onOpenAuth={() => setIsAuthOpen(true)} />
            )}

            {currentTab === 'devops' && (
              <DevOpsDashboard />
            )}
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-8 text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-semibold text-slate-300">ShopSphere Microservices Engine</span>
                <span className="text-slate-600">|</span>
                <span>Product (4001) &bull; Inventory (4002) &bull; Order (4003)</span>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setCurrentTab('devops')}
                  className="hover:text-indigo-400 flex items-center space-x-1 transition"
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>DevOps Explorer</span>
                </button>
                <a
                  href="/api/docs/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-indigo-400 transition"
                >
                  OpenAPI Spec
                </a>
                <span className="flex items-center space-x-1 text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>PostgreSQL Persistent</span>
                </span>
              </div>
            </div>
          </footer>

          {/* Modals & Drawers */}
          <ProductDetailModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
          />

          <CartDrawer
            onOrderSuccess={handleOrderSuccess}
            onOpenAuth={() => setIsAuthOpen(true)}
          />

          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
          />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
