import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, RotateCcw } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { CustomerAccountView } from './components/CustomerAccountView';
import { FlashDealsStrip } from './components/FlashDealsStrip';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { useStore } from './hooks/useStore';
import { Department, Product, ShippingMethod, ViaCepAddress } from './types/store';
import { calcPixPrice, roundCurrency } from './utils/formatters';

type SortOption = 'featured' | 'price_asc' | 'price_desc' | 'discount';

function checkIsAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.endsWith('/admin') ||
    window.location.hash.includes('/admin')
  );
}

function checkIsAccountRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.endsWith('/minha-conta') ||
    window.location.hash.includes('/minha-conta')
  );
}

export default function App() {
  const {
    store,
    setStore,
    saveStoreChanges,
    cart,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
    createOrder,
    updateOrderStatus,
    updateOrderTracking,
    updateOrderFulfillment,
    upsertProduct,
    deleteProduct,
    currentCustomer,
    loginCustomer,
    registerCustomer,
    logoutCustomer,
    updateCustomerAccount,
    toggleFavoriteProduct,
    exportBackupJson,
    importBackupJson,
  } = useStore();

  const [isAdminView, setIsAdminView] = useState<boolean>(checkIsAdminRoute);
  const [isAccountView, setIsAccountView] = useState<boolean>(checkIsAccountRoute);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDepartment, setActiveDepartment] = useState<Department>('TODOS');
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [shippingCep, setShippingCep] = useState('');
  const [viaCepAddress, setViaCepAddress] = useState<ViaCepAddress | null>(null);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<ShippingMethod>('economic');

  useEffect(() => {
    const onPopState = () => {
      setIsAdminView(checkIsAdminRoute());
      setIsAccountView(checkIsAccountRoute());
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
    };
  }, []);

  const openAdmin = () => {
    setIsAdminView(true);
    setIsAccountView(false);
    try {
      window.history.pushState({}, '', '/admin');
    } catch {
      window.location.hash = '#/admin';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAccount = () => {
    setIsAdminView(false);
    setIsAccountView(true);
    try {
      window.history.pushState({}, '', '/minha-conta');
    } catch {
      window.location.hash = '#/minha-conta';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goHome = () => {
    setIsAdminView(false);
    setIsAccountView(false);
    try {
      window.history.pushState({}, '', '/');
    } catch {
      window.location.hash = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cartCount = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  const cartPixSubtotal = useMemo(() => {
    return roundCurrency(
      cart.reduce((acc, item) => {
        const product = store.products.find((p) => p.id === item.productId);
        if (!product) return acc;
        return (
          acc +
          calcPixPrice(product.basePrice, store.payment.pixDiscountPercent) * item.quantity
        );
      }, 0)
    );
  }, [cart, store.products, store.payment.pixDiscountPercent]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const list = store.products.filter((prod) => {
      if (activeDepartment === 'OFERTAS RELÂMPAGO') {
        if (!prod.isFlashDeal) return false;
      } else if (activeDepartment === 'PERIFÉRICOS') {
        if (prod.category === 'SSDs & Memórias') return false;
      } else if (activeDepartment !== 'TODOS') {
        if (prod.category.toUpperCase() !== activeDepartment.toUpperCase()) return false;
      }

      if (query) {
        const hay = `${prod.name} ${prod.category} ${prod.sku} ${prod.description}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }

      return true;
    });

    const sorted = [...list];
    if (sortBy === 'price_asc') {
      sorted.sort((a, b) => a.basePrice - b.basePrice);
    } else if (sortBy === 'price_desc') {
      sorted.sort((a, b) => b.basePrice - a.basePrice);
    } else if (sortBy === 'discount') {
      sorted.sort((a, b) => {
        const savA = a.basePrice - calcPixPrice(a.basePrice, store.payment.pixDiscountPercent);
        const savB = b.basePrice - calcPixPrice(b.basePrice, store.payment.pixDiscountPercent);
        return savB - savA;
      });
    } else {
      sorted.sort((a, b) => {
        const scoreA = (a.isFlashDeal ? 2 : 0) + (a.isBestSeller ? 1 : 0);
        const scoreB = (b.isFlashDeal ? 2 : 0) + (b.isBestSeller ? 1 : 0);
        return scoreB - scoreA;
      });
    }

    return sorted;
  }, [store.products, activeDepartment, searchQuery, sortBy, store.payment.pixDiscountPercent]);

  const handleAddToCart = (product: Product) => {
    addToCart(product.id, 1);
    setIsCartOpen(true);
  };

  const handleToggleFavorite = (productId: string) => {
    const ok = toggleFavoriteProduct(productId);
    if (!ok) {
      setSelectedProduct(null);
      openAccount();
    }
  };

  if (isAdminView) {
    return (
      <AdminPanel
        store={store}
        setStore={setStore}
        onSaveChanges={saveStoreChanges}
        onUpsertProduct={upsertProduct}
        onDeleteProduct={deleteProduct}
        onUpdateOrderStatus={updateOrderStatus}
        onUpdateOrderTracking={updateOrderTracking}
        onUpdateOrderFulfillment={updateOrderFulfillment}
        onExportJson={exportBackupJson}
        onImportJson={importBackupJson}
        onExitAdmin={goHome}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0D10] text-white flex flex-col">
      <Header
        logoUrl={store.visual.logoUrl}
        topPromoText={store.visual.topPromoText}
        topPromoNotices={store.visual.topPromoNotices}
        topPromoSpeed={store.visual.topPromoSpeed || 'normal'}
        accentColor={store.visual.accentColor}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (isAccountView) {
            goHome();
          }
        }}
        activeDepartment={activeDepartment}
        onSelectDepartment={(dept) => {
          setActiveDepartment(dept);
          if (isAccountView) {
            goHome();
          }
        }}
        cartCount={cartCount}
        cartPixSubtotal={cartPixSubtotal}
        currentCustomerName={currentCustomer?.fullName || null}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAccount={openAccount}
        onGoHome={() => {
          setActiveDepartment('TODOS');
          setSearchQuery('');
          goHome();
        }}
      />

      {isAccountView ? (
        <main className="flex-1 flex flex-col">
          <CustomerAccountView
            store={store}
            currentCustomer={currentCustomer}
            accentColor={store.visual.accentColor}
            onLogin={loginCustomer}
            onRegister={registerCustomer}
            onLogout={logoutCustomer}
            onUpdateCustomer={updateCustomerAccount}
            onToggleFavorite={toggleFavoriteProduct}
            onAddToCart={handleAddToCart}
            onBackToStore={goHome}
          />
        </main>
      ) : (
        <main className="flex-1">
          {/* Compact Hero Banner (320px desktop) */}
          <HeroBanner
            banners={store.visual.banners}
            mobileBannerUrl={store.visual.mobileBannerUrl}
            accentColor={store.visual.accentColor}
            onSelectDepartment={(dept) => setActiveDepartment(dept)}
          />

          {/* Flash Deals Countdown Strip */}
          <FlashDealsStrip
            enabled={store.visual.flashSaleEnabled}
            title={store.visual.flashSaleTitle}
            endTimeIso={store.visual.flashSaleEndTime}
            accentColor={store.visual.accentColor}
            isFlashFiltered={activeDepartment === 'OFERTAS RELÂMPAGO'}
            onFilterFlash={() =>
              setActiveDepartment((prev) =>
                prev === 'OFERTAS RELÂMPAGO' ? 'TODOS' : 'OFERTAS RELÂMPAGO'
              )
            }
          />

          {/* Catalog Grid Section */}
          <section className="max-w-[1360px] mx-auto px-3 sm:px-6 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#272D38]">
              <div>
                <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase tracking-wider text-white">
                  {activeDepartment === 'TODOS'
                    ? 'Hardware & Periféricos em Destaque'
                    : activeDepartment}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono-num">
                  {filteredProducts.length}{' '}
                  {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
                  {searchQuery && ` para "${searchQuery}"`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <label htmlFor="catalog-sort" className="sr-only">
                  Ordenar produtos
                </label>
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-9 px-3 rounded bg-[#161A20] border border-[#272D38] text-xs font-medium text-white focus:outline-none focus:border-white/50"
                >
                  <option value="featured">Mais Relevantes</option>
                  <option value="price_asc">Menor Preço no PIX</option>
                  <option value="price_desc">Maior Preço no PIX</option>
                  <option value="discount">Maior Economia no PIX</option>
                </select>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="my-10 p-10 rounded-md bg-[#161A20] border border-[#272D38] text-center space-y-3">
                <h3 className="font-display font-bold text-xl uppercase text-white">
                  Nenhum produto encontrado
                </h3>
                <p className="text-sm text-slate-400">
                  Não encontramos itens correspondentes ao seu filtro ou busca atual.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDepartment('TODOS');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded font-display font-bold uppercase tracking-wider text-xs text-white"
                  style={{ backgroundColor: store.visual.accentColor }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar Filtros</span>
                </button>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    paymentConfig={store.payment}
                    accentColor={store.visual.accentColor}
                    isFavorite={
                      currentCustomer?.favoriteProductIds.includes(product.id) ?? false
                    }
                    onToggleFavorite={handleToggleFavorite}
                    onAddToCart={handleAddToCart}
                    onSelectProduct={setSelectedProduct}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      <Footer
        fiscal={store.fiscal}
        officialEmail={store.email.officialEmail}
        payment={store.payment}
        shipping={store.shipping}
        accentColor={store.visual.accentColor}
        onOpenAdmin={openAdmin}
      />

      <ProductDetailModal
        product={selectedProduct}
        paymentConfig={store.payment}
        shippingConfig={store.shipping}
        accentColor={store.visual.accentColor}
        cep={shippingCep}
        onCepChange={setShippingCep}
        viaCepAddress={viaCepAddress}
        onViaCepResolved={setViaCepAddress}
        selectedShippingMethod={selectedShippingMethod}
        onSelectShippingMethod={(quote) => setSelectedShippingMethod(quote.method)}
        isFavorite={
          selectedProduct
            ? currentCustomer?.favoriteProductIds.includes(selectedProduct.id) ?? false
            : false
        }
        onToggleFavorite={handleToggleFavorite}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <CartCheckoutDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        store={store}
        currentCustomer={currentCustomer}
        cep={shippingCep}
        onCepChange={setShippingCep}
        viaCepAddress={viaCepAddress}
        onViaCepResolved={setViaCepAddress}
        selectedShippingMethod={selectedShippingMethod}
        onSelectShippingMethod={(quote) => setSelectedShippingMethod(quote.method)}
        onUpdateQty={updateCartQty}
        onRemoveItem={removeFromCart}
        onClearCart={clearCart}
        onCreateOrder={createOrder}
      />
    </div>
  );
}
