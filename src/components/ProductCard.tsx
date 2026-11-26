import { Heart, ShoppingCart } from 'lucide-react';
import { PaymentConfig, Product } from '../types/store';
import {
  calcPixPrice,
  formatBRL,
  getBestInstallmentSummary,
} from '../utils/formatters';
import { StudioProductImage } from './StudioProductImage';

interface ProductCardProps {
  product: Product;
  paymentConfig: PaymentConfig;
  accentColor: string;
  isFavorite?: boolean;
  onToggleFavorite?: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
}

export function ProductCard({
  product,
  paymentConfig,
  accentColor,
  isFavorite = false,
  onToggleFavorite,
  onAddToCart,
  onSelectProduct,
}: ProductCardProps) {
  const pixPrice = calcPixPrice(product.basePrice, paymentConfig.pixDiscountPercent);
  const pixDiscountPct = Math.max(0, Math.round(paymentConfig.pixDiscountPercent));
  const bestInstallment = getBestInstallmentSummary(product.basePrice, paymentConfig);
  const outOfStock = product.stock <= 0;

  return (
    <article className="group flex flex-col justify-between bg-[#161A20] border border-[#272D38] hover:border-slate-500/80 rounded-md overflow-hidden transition-transform duration-150 hover:-translate-y-0.5">
      <div>
        {/* Standardized Studio Image Frame */}
        <div className="p-2.5 pb-0">
          <div className="relative w-full h-[205px] rounded-md border border-[#272D38]/80 overflow-hidden">
            <button
              type="button"
              onClick={() => onSelectProduct(product)}
              className="relative w-full h-full block text-left focus-visible:outline-2 focus-visible:outline-white"
              aria-label={`Ver detalhes de ${product.name}`}
            >
              <StudioProductImage
                src={product.imageUrl}
                alt={product.name}
                fallbackLabel={product.name}
                hoverZoom
              />

              {pixDiscountPct > 0 && (
                <span
                  className="absolute z-20 top-2.5 left-2.5 px-2 py-0.5 rounded-sm text-xs font-display font-extrabold tracking-wider text-white uppercase"
                  style={{ backgroundColor: accentColor }}
                >
                  -{pixDiscountPct}% PIX
                </span>
              )}
            </button>

            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(product.id)}
                className={`absolute z-20 top-2.5 right-2.5 p-1.5 rounded-full border transition-colors ${
                  isFavorite
                    ? 'bg-rose-500/20 border-rose-500/60 text-rose-400'
                    : 'bg-[#0B0D10]/75 border-[#272D38] text-slate-300 hover:text-rose-400 hover:border-rose-500/50'
                }`}
                title={isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
                aria-label={isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Metadata & Title */}
        <div className="p-4 pb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <span>{product.category}</span>
            {(product.isFlashDeal || product.isBestSeller) && (
              <>
                <span aria-hidden="true">·</span>
                <span style={{ color: product.isFlashDeal ? accentColor : '#00E676' }}>
                  {product.isFlashDeal ? 'Oferta Relâmpago' : 'Mais Vendido'}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className="mt-1.5 text-left block w-full focus-visible:outline-2 focus-visible:outline-white rounded-sm"
          >
            <h3 className="text-sm sm:text-[15px] font-semibold leading-snug text-white group-hover:text-slate-200 line-clamp-2 min-h-[2.6rem]">
              {product.name}
            </h3>
          </button>
        </div>
      </div>

      {/* Pricing & CTA anchored at bottom for uniform baseline across rows */}
      <div className="p-4 pt-2 flex flex-col gap-3">
        <div className="border-t border-[#272D38] pt-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-display font-extrabold tracking-tight font-mono-num text-[#00E676]">
              {formatBRL(pixPrice)}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#00E676]">
              À vista no PIX ({pixDiscountPct}% OFF)
            </span>
          </div>

          {paymentConfig.creditCardEnabled ? (
            <p className="mt-1.5 text-xs text-slate-300 font-mono-num leading-tight">
              ou <strong className="text-white">{formatBRL(product.basePrice)}</strong> em até{' '}
              <strong className="text-white">{bestInstallment.count}x</strong>{' '}
              {bestInstallment.hasInterest ? 'no cartão' : 'sem juros no cartão'}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400 font-mono-num leading-tight">
              ou <strong className="text-white">{formatBRL(product.basePrice)}</strong> à prazo
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={outOfStock}
          onClick={() => onAddToCart(product)}
          className="w-full h-11 rounded font-display font-extrabold text-base tracking-wider uppercase text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-95 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: outOfStock ? '#272D38' : accentColor }}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>{outOfStock ? 'ESGOTADO' : 'COMPRAR'}</span>
        </button>
      </div>
    </article>
  );
}
