import { CardBrand } from '../types/store';

interface CardBrandsStripProps {
  brands: CardBrand[];
  compact?: boolean;
}

const BRAND_STYLES: Record<CardBrand, { bg: string; text: string; short: string }> = {
  Visa: { bg: '#1A1F71', text: '#FFFFFF', short: 'VISA' },
  Mastercard: { bg: '#222630', text: '#FFFFFF', short: 'MASTER' },
  Elo: { bg: '#0E1117', text: '#FFCB05', short: 'elo' },
  Hipercard: { bg: '#822124', text: '#FFFFFF', short: 'HIPER' },
  Amex: { bg: '#006FCF', text: '#FFFFFF', short: 'AMEX' },
};

export function CardBrandsStrip({ brands, compact = false }: CardBrandsStripProps) {
  if (!brands || brands.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Bandeiras de cartão aceitas">
      {brands.map((brand) => {
        const s = BRAND_STYLES[brand];
        return (
          <span
            key={brand}
            title={brand}
            className={`inline-flex items-center justify-center rounded-sm border border-white/15 font-display font-extrabold tracking-wider select-none ${
              compact ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]'
            }`}
            style={{ backgroundColor: s.bg, color: s.text }}
          >
            {brand === 'Mastercard' ? (
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex -space-x-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EB001B] inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F79E1B]/90 inline-block" />
                </span>
                <span>MC</span>
              </span>
            ) : (
              s.short
            )}
          </span>
        );
      })}
    </div>
  );
}
