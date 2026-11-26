import { useEffect, useMemo, useState } from 'react';
import { Bike, CheckCircle2, Loader2, MapPin, Package, Store, Truck, Zap } from 'lucide-react';
import { ShippingConfig, ShippingMethod, ViaCepAddress } from '../types/store';
import {
  formatBRL,
  getShippingQuotes,
  lookupViaCep,
  maskCEP,
  ShippingQuote,
} from '../utils/formatters';

interface ShippingCalculatorProps {
  cep: string;
  onCepChange: (cep: string) => void;
  viaCepAddress: ViaCepAddress | null;
  onViaCepResolved: (addr: ViaCepAddress | null) => void;
  subtotal: number;
  totalWeightGrams: number;
  shippingConfig: ShippingConfig;
  accentColor: string;
  selectedMethod?: ShippingMethod;
  onSelectMethod?: (quote: ShippingQuote) => void;
  compact?: boolean;
}

export function ShippingCalculator({
  cep,
  onCepChange,
  viaCepAddress,
  onViaCepResolved,
  subtotal,
  totalWeightGrams,
  shippingConfig,
  accentColor,
  selectedMethod,
  onSelectMethod,
  compact = false,
}: ShippingCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [hasCalculated, setHasCalculated] = useState(false);

  const cleanCep = cep.replace(/\D/g, '');

  const runLookup = async (targetCep: string) => {
    const digits = targetCep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setLookupError('Digite um CEP completo com 8 dígitos.');
      return;
    }
    setLoading(true);
    setLookupError('');
    const result = await lookupViaCep(digits);
    setLoading(false);
    setHasCalculated(true);

    if (result.ok && result.data) {
      onViaCepResolved(result.data);
      setLookupError('');
    } else {
      onViaCepResolved(null);
      setLookupError(result.error || '');
    }
  };

  // Auto-trigger calculation when 8 digits are typed if not already resolved for this CEP
  useEffect(() => {
    if (cleanCep.length === 8 && viaCepAddress?.cep.replace(/\D/g, '') !== cleanCep) {
      runLookup(cleanCep);
    } else if (cleanCep.length === 8) {
      setHasCalculated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanCep]);

  const calculation = useMemo(() => {
    if (cleanCep.length !== 8) return null;
    return getShippingQuotes(cleanCep, subtotal, totalWeightGrams, shippingConfig, viaCepAddress);
  }, [cleanCep, subtotal, totalWeightGrams, shippingConfig, viaCepAddress]);

  // Keep selected quote synced when quotes update
  useEffect(() => {
    if (!calculation || !onSelectMethod || calculation.quotes.length === 0) return;
    const current = calculation.quotes.find((q) => q.method === selectedMethod);
    if (!current) {
      onSelectMethod(calculation.quotes[0]);
    } else {
      onSelectMethod(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculation?.quotes]);

  const getMethodIcon = (method: ShippingMethod) => {
    if (method === 'motoboy_cascavel') return <Bike className="w-4 h-4 shrink-0" style={{ color: accentColor }} />;
    if (method === 'pickup_cascavel') return <Store className="w-4 h-4 shrink-0 text-[#00E676]" />;
    if (method === 'express') return <Zap className="w-4 h-4 shrink-0" style={{ color: accentColor }} />;
    return <Package className="w-4 h-4 shrink-0 text-slate-300" />;
  };

  const remainingForFree = Math.max(0, shippingConfig.freeShippingMinValue - subtotal);

  return (
    <div className={`rounded bg-[#0B0D10] border border-[#272D38] ${compact ? 'p-3.5' : 'p-4'} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={compact ? 'calc-cep-cart' : 'calc-cep-pdp'}
          className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-white"
        >
          <Truck className="w-4 h-4" style={{ color: accentColor }} />
          <span>Calcular Frete e Prazo</span>
        </label>
        <span className="text-[11px] text-slate-400 font-mono-num">
          Origem: Cascavel-PR ({shippingConfig.originCep || '85801-000'}) · Peso: {(Math.max(100, totalWeightGrams) / 1000).toFixed(2)} kg
        </span>
      </div>

      {/* Input + Button */}
      <div className="flex gap-2">
        <input
          id={compact ? 'calc-cep-cart' : 'calc-cep-pdp'}
          type="text"
          inputMode="numeric"
          maxLength={9}
          value={cep}
          onChange={(e) => {
            const masked = maskCEP(e.target.value);
            onCepChange(masked);
            if (masked.replace(/\D/g, '').length < 8) {
              setHasCalculated(false);
              setLookupError('');
            }
          }}
          placeholder="00000-000"
          className="flex-1 min-w-0 h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm font-mono-num text-white placeholder:text-slate-500 focus:outline-none focus:border-white/50"
        />
        <button
          type="button"
          onClick={() => runLookup(cep)}
          disabled={loading}
          className="h-10 px-4 rounded font-display font-bold text-xs sm:text-sm uppercase tracking-wider text-white flex items-center gap-1.5 transition-opacity hover:opacity-95 disabled:opacity-60 whitespace-nowrap shrink-0"
          style={{ backgroundColor: accentColor }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>Calcular Frete</span>
        </button>
      </div>

      {/* Free Shipping Progress Hint */}
      {remainingForFree > 0 ? (
        <p className="text-[11px] text-slate-400">
          Faltam <strong className="text-white font-mono-num">{formatBRL(remainingForFree)}</strong> para ganhar{' '}
          <span className="text-[#00E676] font-semibold">Frete Grátis</span> (
          {shippingConfig.freeShippingScope === 'brasil' ? 'Todo Brasil' : 'Sul e PR'}).
        </p>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#00E676]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>FRETE GRÁTIS ATIVADO na modalidade Econômica (PAC / Jadlog)!</span>
        </div>
      )}

      {/* ViaCEP Resolved Address Line */}
      {viaCepAddress && cleanCep.length === 8 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded bg-[#161A20] border border-[#272D38] text-xs text-slate-200">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[#00E676]" />
          <div>
            <span className="font-semibold text-white">
              Entrega para {viaCepAddress.neighborhood ? `${viaCepAddress.neighborhood}, ` : ''}
              {viaCepAddress.city} - {viaCepAddress.state}
            </span>
            {viaCepAddress.street && (
              <div className="text-[11px] text-slate-400 mt-0.5">{viaCepAddress.street}</div>
            )}
          </div>
        </div>
      )}

      {lookupError && (
        <p className="text-[11px] text-amber-400">{lookupError}</p>
      )}

      {/* Shipping Options */}
      {calculation && (hasCalculated || cleanCep.length === 8) && (
        <div className="space-y-1.5 pt-1">
          {calculation.quotes.map((quote) => {
            const isSelected = selectedMethod === quote.method;
            const clickable = Boolean(onSelectMethod);
            return (
              <button
                key={quote.method}
                type="button"
                disabled={!clickable}
                onClick={() => onSelectMethod?.(quote)}
                className={`w-full flex items-center justify-between gap-3 p-2.5 rounded border text-left transition-colors ${
                  clickable ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isSelected
                    ? 'bg-[#161A20] border-white/70'
                    : 'bg-[#161A20]/60 border-[#272D38] hover:border-slate-500'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5">{getMethodIcon(quote.method)}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-white">{quote.label}</span>
                      {quote.isFreeActivated && quote.method === 'economic' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#00E676]">
                          FRETE GRÁTIS ATIVADO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Prazo: <strong className="text-slate-200">{quote.estimatedDays}</strong> · {quote.carrier}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono-num shrink-0">
                  {quote.isFreeActivated && quote.originalCost > 0 && (
                    <div className="text-[10px] text-slate-500 line-through">
                      {formatBRL(quote.originalCost)}
                    </div>
                  )}
                  <div
                    className={`text-xs sm:text-sm font-bold ${
                      quote.cost === 0 ? 'text-[#00E676]' : 'text-white'
                    }`}
                  >
                    {quote.cost === 0 ? 'GRÁTIS' : formatBRL(quote.cost)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
