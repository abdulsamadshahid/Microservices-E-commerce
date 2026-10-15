import React from 'react';
import { ShoppingBag, Server, User as UserIcon, LogOut, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useCart } from '../context/CartContext.js';

interface NavbarProps {
  currentTab: 'catalog' | 'orders' | 'devops';
  setCurrentTab: (tab: 'catalog' | 'orders' | 'devops') => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, onOpenAuth }) => {
  const { user, logout, loginDemo } = useAuth();
  const { itemCount, setIsDrawerOpen } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('catalog')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-white">ShopSphere</span>
                <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Microservices
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Developer & DevOps Ready Architecture</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => setCurrentTab('catalog')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'catalog'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Catalog
            </button>

            <button
              onClick={() => setCurrentTab('orders')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'orders'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              My Orders
            </button>

            <button
              onClick={() => setCurrentTab('devops')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-1.5 transition-colors ${
                currentTab === 'devops'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Server className="w-4 h-4 text-sky-400" />
              <span>Architecture & Ops</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" title="Cluster Healthy" />
            </button>
          </nav>

          {/* Right Action Icons: Cart & Auth */}
          <div className="flex items-center space-x-3">
            {/* Shopping Cart Button */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="relative p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-indigo-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
                  {itemCount}
                </span>
              )}
            </button>

            {/* User profile / Login */}
            {user ? (
              <div className="flex items-center space-x-2 bg-slate-800/80 pl-3 pr-2 py-1.5 rounded-xl border border-slate-700">
                <div className="text-right hidden md:block">
                  <p className="text-xs font-semibold text-white leading-tight">{user.name}</p>
                  <p className="text-[11px] text-slate-400 leading-tight">{user.email}</p>
                </div>
                {/* Demo switch button for quick tenancy verification */}
                <button
                  onClick={() => loginDemo(user.email.includes('alice') ? 'bob@example.com' : 'alice@example.com')}
                  title="Switch Demo User (Test Order Isolation)"
                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-indigo-400 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={logout}
                  title="Log Out"
                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-rose-400 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-colors"
              >
                <UserIcon className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
