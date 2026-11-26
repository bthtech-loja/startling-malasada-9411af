import { ExternalLink, FileCheck2, Heart, Package, Scale, ShoppingCart, X } from 'lucide-react';
import { PaymentConfig, Product, ShippingConfig, ShippingMethod, ViaCepAddress } from '../types/store';
import {
  calcPixPrice,
  calculateInstallments,
  formatBRL,
  ShippingQuote,
} from '../utils/formatters';
import { ShippingCalculator } from './ShippingCalculator';
import { CardBrandsStrip } from './CardBrandsStrip';
import { StudioProductImage } from './StudioProductImage';

interface ProductDetailModalProps {
  product: Product | null;
  paymentConfig: PaymentConfig;
  shippingConfig: ShippingConfig;
  accentColor: string;
  cep: string;
  onCepChange: (cep: string) => void;
  viaCepAddress: ViaCepAddress | null;
  onViaCepResolved: (addr: ViaCepAddress | null) => void;
  selectedShippingMethod: ShippingMethod;
  onSelectShippingMethod: (quote: ShippingQuote) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (productId: string) => void;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
}

export function ProductDetailModal({
  product,
  paymentConfig,
  shippingConfig,
  accentColor,
  cep,
  onCepChange,
  viaCepAddress,
  onViaCepResolved,
  selectedShippingMethod,
  onSelectShippingMethod,
  isFavorite = false,
  onToggleFavorite,
  onClose,
  onAddToCart,
}: ProductDetailModalProps) {
  if (!product) return null;

  const pixPrice = calcPixPrice(product.basePrice, paymentConfig.pixDiscountPercent);
  const pixDiscountPct = Math.max(0, Math.round(paymentConfig.pixDiscountPercent));
  const installments = calculateInstallments(product.basePrice, paymentConfig);
  const outOfStock = product.stock <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[#161A20] border border-[#272D38] rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 bg-[#161A20]/95 backdrop-blur border-b border-[#272D38]">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono-num">
            <span>{product.category}</span>
            <span aria-hidden="true">·</span>
            <span>SKU: {product.sku}</span>
            <span aria-hidden="true">·</span>
            <span>Peso: {product.weightGrams || 400}g</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
            aria-label="Fechar detalhes do produto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 sm:p-7">
          {/* Left: Product Visual & Specs */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-[4/3] w-full rounded border border-[#272D38] overflow-hidden">
              <StudioProductImage
                src={product.imageUrl}
                alt={product.name}
                fallbackLabel={product.name}
              />
              {pixDiscountPct > 0 && (
                <span
                  className="absolute z-20 top-3 left-3 px-2.5 py-1 rounded-sm text-xs font-display font-extrabold tracking-wider text-white uppercase"
                  style={{ backgroundColor: accentColor }}
                >
                  -{pixDiscountPct}% PIX
                </span>
              )}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(product.id)}
                  className={`absolute z-20 top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-semibold transition-colors ${
                    isFavorite
                      ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                      : 'bg-[#0B0D10]/80 border-[#272D38] text-slate-200 hover:border-rose-500/50 hover:text-rose-300'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                  <span>{isFavorite ? 'Favoritado' : 'Favoritar'}</span>
                </button>
              )}
            </div>

            <div className="bg-[#0B0D10] border border-[#272D38] rounded p-4">
              <h4 className="font-display font-bold text-sm uppercase tracking-wider text-white mb-2">
                Especificações Técnicas
              </h4>
              <p className="text-sm text-slate-300 leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* Installments Breakdown */}
            {paymentConfig.creditCardEnabled && (
              <div className="bg-[#0B0D10] border border-[#272D38] rounded p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
                    Parcelamento no Cartão ({paymentConfig.gatewayProvider})
                  </p>
                  <CardBrandsStrip brands={paymentConfig.acceptedCardBrands} compact />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono-num">
                  {installments.map((opt) => (
                    <div
                      key={opt.count}
                      className="flex items-center justify-between py-1 border-b border-[#1D222B] text-slate-300"
                    >
                      <span>{opt.count}x de {formatBRL(opt.installmentValue)}</span>
                      <span className={opt.hasInterest ? 'text-slate-400' : 'text-[#00E676]'}>
                        {opt.hasInterest ? `Total ${formatBRL(opt.totalValue)}` : 'sem juros'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Purchase Module + Shipping Calculator */}
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div>
                <h2
                  id="pdp-title"
                  className="font-display font-extrabold text-2xl sm:text-3xl leading-tight text-white uppercase"
                >
                  {product.name}
                </h2>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-[#00E676]" />
                    {outOfStock ? 'Sem estoque no momento' : `${product.stock} un. em estoque`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-slate-400" />
                    {product.weightGrams || 400}g
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-slate-400" />
                    Com NF-e
                  </span>
                </div>
              </div>

              <div className="p-4 rounded bg-[#0B0D10] border border-[#272D38]">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-display font-extrabold font-mono-num text-[#00E676]">
                    {formatBRL(pixPrice)}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#00E676]">
                    À vista no PIX ({pixDiscountPct}% OFF)
                  </span>
                </div>

                <div className="mt-2 text-sm text-slate-300 font-mono-num">
                  Preço de Venda / Cartão: <strong className="text-white">{formatBRL(product.basePrice)}</strong>
                </div>
              </div>

              {/* Integrated Shipping & Delivery Calculator */}
              <ShippingCalculator
                cep={cep}
                onCepChange={onCepChange}
                viaCepAddress={viaCepAddress}
                onViaCepResolved={onViaCepResolved}
                subtotal={pixPrice}
                totalWeightGrams={product.weightGrams || 400}
                shippingConfig={shippingConfig}
                accentColor={accentColor}
                selectedMethod={selectedShippingMethod}
                onSelectMethod={onSelectShippingMethod}
              />
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                disabled={outOfStock}
                onClick={() => {
                  onAddToCart(product);
                  onClose();
                }}
                className="w-full h-12 rounded font-display font-extrabold text-lg tracking-wider uppercase text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-95 disabled:opacity-40"
                style={{ backgroundColor: outOfStock ? '#272D38' : accentColor }}
              >
                <ShoppingCart className="w-5 h-5" />
                <span>{outOfStock ? 'PRODUTO ESGOTADO' : 'ADICIONAR AO CARRINHO'}</span>
              </button>

              {product.externalCheckoutUrl && (
                <a
                  href={product.externalCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-10 rounded border border-[#272D38] bg-[#0B0D10] hover:border-slate-500 text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Comprar via Link de Pagamento Direto</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
