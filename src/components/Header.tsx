import { Search, ShoppingCart, User, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Department, TopPromoSpeed } from '../types/store';
import { formatBRL } from '../utils/formatters';
import { ResilientImage } from './ResilientImage';

export const DEPARTMENTS: Department[] = [
  'TODOS',
  'OFERTAS RELÂMPAGO',
  'PERIFÉRICOS',
  'MOUSES',
  'TECLADOS',
  'HEADSETS',
  'COMBOS GAMER',
  'SSDs & MEMÓRIAS',
];

interface HeaderProps {
  logoUrl: string;
  topPromoText: string;
  topPromoNotices?: string[];
  topPromoSpeed: TopPromoSpeed;
  accentColor: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeDepartment: Department;
  onSelectDepartment: (dept: Department) => void;
  cartCount: number;
  cartPixSubtotal: number;
  currentCustomerName?: string | null;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  onGoHome: () => void;
}

const MARQUEE_DURATION_BY_SPEED: Record<Exclude<TopPromoSpeed, 'fixed'>, string> = {
  slow: '38s',
  normal: '24s',
  fast: '13s',
};

export function Header({
  logoUrl,
  topPromoText,
  topPromoNotices,
  topPromoSpeed,
  accentColor,
  searchQuery,
  onSearchChange,
  activeDepartment,
  onSelectDepartment,
  cartCount,
  cartPixSubtotal,
  currentCustomerName,
  onOpenCart,
  onOpenAccount,
  onGoHome,
}: HeaderProps) {
  const firstCustomerName = currentCustomerName?.trim().split(' ')[0] || '';
  const activeNotices = (
    Array.isArray(topPromoNotices)
      ? topPromoNotices
      : topPromoText.split('•')
  )
    .map((s) => s.trim())
    .filter(Boolean);

  const isMarqueeFixed = topPromoSpeed === 'fixed';
  const marqueeDuration = isMarqueeFixed
    ? '0s'
    : MARQUEE_DURATION_BY_SPEED[topPromoSpeed] || '24s';
  const repeatBlocks = activeNotices.length <= 1 ? 4 : activeNotices.length === 2 ? 3 : 2;

  return (
    <>
      {/* Slim Editable Promotional Top Bar with Continuous Seamless Marquee */}
      {activeNotices.length > 0 && (
        <div
          className="marquee-container w-full overflow-hidden whitespace-nowrap text-[11px] sm:text-xs font-semibold tracking-wide py-1.5 border-b border-[#272D38] text-white/95"
          style={{
            background: `linear-gradient(90deg, #11141A 0%, color-mix(in srgb, ${accentColor} 18%, #161A20) 50%, #11141A 100%)`,
          }}
        >
          {isMarqueeFixed ? (
            <p className="w-full px-4 sm:px-6 lg:px-8 text-center truncate whitespace-nowrap uppercase">
              {activeNotices.join('   •   ')}
            </p>
          ) : (
            <div
              className="animate-marquee items-center whitespace-nowrap"
              style={{ '--marquee-duration': marqueeDuration } as CSSProperties}
            >
              {[0, 1].map((half) => (
                <div
                  key={half}
                  aria-hidden={half === 1 ? true : undefined}
                  className="flex items-center shrink-0 whitespace-nowrap"
                >
                  {Array.from({ length: repeatBlocks }, (_, blockIdx) =>
                    activeNotices.map((notice, idx) => (
                      <span
                        key={`${blockIdx}-${idx}`}
                        className="inline-flex items-center whitespace-nowrap uppercase"
                      >
                        <span className="px-8">{notice}</span>
                        <span className="opacity-60" aria-hidden="true">
                          •
                        </span>
                      </span>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Sticky Full-Width Header */}
      <header className="sticky top-0 z-40 w-full bg-[#0B0D10]/95 backdrop-blur-md border-b border-[#272D38]">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3 sm:gap-4">
          {/* Logo Left (48px-56px height, no surrounding box/background) */}
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center shrink-0 h-12 sm:h-14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded"
            aria-label="BTHTECH Página Inicial"
          >
            {logoUrl ? (
              <ResilientImage
                src={logoUrl}
                alt="BTHTECH Logo"
                className="h-12 sm:h-14 w-auto max-w-[220px] sm:max-w-[260px] object-contain bg-transparent"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <span
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded flex items-center justify-center font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  B
                </span>
                <span className="font-display font-extrabold text-2xl sm:text-3xl tracking-wider text-white uppercase whitespace-nowrap leading-none">
                  BTH<span style={{ color: accentColor }}>TECH</span>
                </span>
              </div>
            )}
          </button>

          {/* Real-time Search Bar Center (Desktop + Tablet) */}
          <div className="hidden sm:flex flex-1 max-w-3xl mx-4 lg:mx-8 relative">
            <label htmlFor="store-search-desktop" className="sr-only">
              Buscar produtos
            </label>
            <input
              id="store-search-desktop"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Busque por SSD NVMe, Mouse, Teclado, Headset..."
              className="w-full h-11 pl-4 pr-11 bg-[#161A20] border border-[#272D38] rounded text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-white/50 transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <Search
                className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Right Actions: Minha Conta + Cart */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenAccount}
              className="flex items-center gap-2 h-10 sm:h-11 px-2.5 sm:px-3.5 rounded border border-[#272D38] bg-[#161A20] hover:border-slate-500 text-slate-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
              title="Minha Conta"
              aria-label="Minha Conta"
            >
              <User className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accentColor }} />
              <div className="hidden md:flex flex-col items-start leading-none text-left">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  {firstCustomerName ? `OLÁ, ${firstCustomerName.toUpperCase()}` : 'MINHA CONTA'}
                </span>
                <span className="text-xs font-semibold text-white mt-0.5">
                  {firstCustomerName ? 'Minha Conta' : 'Entrar / Cadastrar'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              className="flex items-center gap-2.5 h-10 sm:h-11 px-3 sm:px-4 rounded text-white font-semibold transition-transform active:scale-[0.98] whitespace-nowrap shrink-0"
              style={{ backgroundColor: accentColor }}
              aria-label="Abrir carrinho de compras"
            >
              <div className="relative flex items-center">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                {cartCount > 0 && (
                  <span className="-top-2 -right-2 absolute min-w-[18px] h-[18px] px-1 rounded-full bg-[#0B0D10] text-white text-[10px] font-mono-num font-bold flex items-center justify-center border border-white/20">
                    {cartCount}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start leading-none text-left">
                <span className="text-[10px] uppercase tracking-wider text-white/85">
                  Carrinho
                </span>
                <span className="text-xs sm:text-sm font-mono-num font-bold">
                  {formatBRL(cartPixSubtotal)}
                </span>
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Search Row (non-sticky so mobile sticky height stays strictly compact) */}
      <div className="sm:hidden w-full bg-[#0B0D10] px-4 pt-2.5 pb-2 border-b border-[#272D38]">
        <div className="relative">
          <label htmlFor="store-search-mobile" className="sr-only">
            Buscar produtos no catálogo
          </label>
          <input
            id="store-search-mobile"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Busque por SSD NVMe, Mouse, Teclado, Headset..."
            className="w-full h-10 pl-3.5 pr-9 bg-[#161A20] border border-[#272D38] rounded text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-white/50"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <Search
              className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* Full-Width Department Navigation Bar */}
      <nav
        aria-label="Departamentos"
        className="w-full bg-[#161A20] border-b border-[#272D38]"
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-3 lg:gap-4 overflow-x-auto no-scrollbar py-2">
          {DEPARTMENTS.map((dept) => {
            const isActive = activeDepartment === dept;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => onSelectDepartment(dept)}
                className={`px-3 py-1.5 rounded text-xs sm:text-sm font-display font-bold tracking-wider uppercase whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-300 hover:text-white hover:bg-[#1F242D]'
                }`}
                style={isActive ? { backgroundColor: accentColor } : undefined}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
