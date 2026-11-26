import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CartItem,
  CustomerAccount,
  CustomerFiscalData,
  Order,
  PaymentMethod,
  Product,
  ShippingMethod,
  StoreState,
  ViaCepAddress,
} from '../types/store';
import {
  buildPixBrCode,
  calcPixPrice,
  calculateInstallments,
  formatBRL,
  formatWhatsAppOrderMessage,
  getShippingQuotes,
  maskCEP,
  maskCpfCnpj,
  maskPhoneBR,
  roundCurrency,
  ShippingQuote,
} from '../utils/formatters';
import { ResilientImage } from './ResilientImage';
import { ShippingCalculator } from './ShippingCalculator';
import { CardBrandsStrip } from './CardBrandsStrip';
import { sendOrderUpdateEmail } from '../utils/emailService';

interface CartCheckoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  store: StoreState;
  currentCustomer?: CustomerAccount | null;
  cep: string;
  onCepChange: (cep: string) => void;
  viaCepAddress: ViaCepAddress | null;
  onViaCepResolved: (addr: ViaCepAddress | null) => void;
  selectedShippingMethod: ShippingMethod;
  onSelectShippingMethod: (quote: ShippingQuote) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCreateOrder: (order: Order) => void;
}

type DrawerStep = 'cart' | 'checkout' | 'confirmed';

export function CartCheckoutDrawer({
  isOpen,
  onClose,
  cart,
  store,
  currentCustomer,
  cep,
  onCepChange,
  viaCepAddress,
  onViaCepResolved,
  selectedShippingMethod,
  onSelectShippingMethod,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCreateOrder,
}: CartCheckoutDrawerProps) {
  const [step, setStep] = useState<DrawerStep>('cart');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [selectedInstallments, setSelectedInstallments] = useState<number>(1);

  const [customer, setCustomer] = useState<CustomerFiscalData>({
    fullName: '',
    document: '',
    email: '',
    whatsapp: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  });
  const [formError, setFormError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [showPixModalBox, setShowPixModalBox] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  const accentColor = store.visual.accentColor || '#FF6500';
  const pixPercent = store.payment.pixDiscountPercent;

  // Map cart items to actual products
  const enrichedItems = useMemo(() => {
    return cart
      .map((item) => {
        const product = store.products.find((p) => p.id === item.productId);
        if (!product) return null;
        return {
          ...item,
          product,
          unitPixPrice: calcPixPrice(product.basePrice, pixPercent),
        };
      })
      .filter((x): x is { productId: string; quantity: number; product: Product; unitPixPrice: number } => x !== null);
  }, [cart, store.products, pixPercent]);

  const subtotalBase = useMemo(
    () => roundCurrency(enrichedItems.reduce((acc, i) => acc + i.product.basePrice * i.quantity, 0)),
    [enrichedItems]
  );

  const subtotalPix = useMemo(
    () => roundCurrency(enrichedItems.reduce((acc, i) => acc + i.unitPixPrice * i.quantity, 0)),
    [enrichedItems]
  );

  const totalWeightGrams = useMemo(
    () =>
      enrichedItems.reduce(
        (acc, i) => acc + (i.product.weightGrams || 400) * i.quantity,
        0
      ),
    [enrichedItems]
  );

  // Active coupon
  const activeCoupon = useMemo(() => {
    if (!appliedCouponCode) return null;
    return store.coupons.find((c) => c.code.toUpperCase() === appliedCouponCode.toUpperCase() && c.active) || null;
  }, [appliedCouponCode, store.coupons]);

  const couponDiscountAmount = useMemo(() => {
    if (!activeCoupon) return 0;
    const referenceBase = paymentMethod === 'pix' ? subtotalPix : subtotalBase;
    if (referenceBase < activeCoupon.minOrderValue) return 0;
    if (activeCoupon.type === 'percent') {
      return roundCurrency(referenceBase * (activeCoupon.value / 100));
    }
    return Math.min(referenceBase, roundCurrency(activeCoupon.value));
  }, [activeCoupon, paymentMethod, subtotalPix, subtotalBase]);

  // Shipping calculation
  const cleanCep = (customer.cep || cep).replace(/\D/g, '');
  const shippingResult = useMemo(() => {
    if (cleanCep.length < 8) return null;
    const orderValForFree = paymentMethod === 'pix' ? subtotalPix : subtotalBase;
    return getShippingQuotes(
      cleanCep,
      orderValForFree,
      totalWeightGrams,
      store.shipping,
      viaCepAddress
    );
  }, [cleanCep, paymentMethod, subtotalPix, subtotalBase, totalWeightGrams, store.shipping, viaCepAddress]);

  const selectedQuote: ShippingQuote | null = useMemo(() => {
    if (!shippingResult || shippingResult.quotes.length === 0) return null;
    const found = shippingResult.quotes.find((q) => q.method === selectedShippingMethod);
    return found || shippingResult.quotes[0];
  }, [shippingResult, selectedShippingMethod]);

  const shippingCost = selectedQuote ? selectedQuote.cost : 0;

  // Final total
  const itemsSubtotalAfterPayment = paymentMethod === 'pix' ? subtotalPix : subtotalBase;
  const totalBeforeInterest = Math.max(0, roundCurrency(itemsSubtotalAfterPayment - couponDiscountAmount + shippingCost));

  const installmentOptions = useMemo(
    () => calculateInstallments(totalBeforeInterest, store.payment),
    [totalBeforeInterest, store.payment]
  );

  const activeInstallmentOption = useMemo(() => {
    return (
      installmentOptions.find((o) => o.count === selectedInstallments) ||
      installmentOptions[installmentOptions.length - 1] || {
        count: 1,
        installmentValue: totalBeforeInterest,
        totalValue: totalBeforeInterest,
        hasInterest: false,
      }
    );
  }, [installmentOptions, selectedInstallments, totalBeforeInterest]);

  const finalTotal =
    paymentMethod === 'credit_card' ? activeInstallmentOption.totalValue : totalBeforeInterest;

  useEffect(() => {
    if (!store.payment.creditCardEnabled && paymentMethod === 'credit_card') {
      setPaymentMethod('pix');
    }
  }, [store.payment.creditCardEnabled, paymentMethod]);

  // Prefill NF-e form from logged-in customer if fields are still empty
  useEffect(() => {
    if (!isOpen || !currentCustomer) return;
    const defaultAddr =
      currentCustomer.addresses.find((a) => a.isDefault) || currentCustomer.addresses[0];
    setCustomer((prev) => ({
      fullName: prev.fullName || currentCustomer.fullName,
      document: prev.document || currentCustomer.document,
      email: prev.email || currentCustomer.email,
      whatsapp: prev.whatsapp || currentCustomer.whatsapp,
      cep: prev.cep || defaultAddr?.cep || cep || '',
      street: prev.street || defaultAddr?.street || '',
      number: prev.number || defaultAddr?.number || '',
      complement: prev.complement || defaultAddr?.complement || '',
      neighborhood: prev.neighborhood || defaultAddr?.neighborhood || '',
      city: prev.city || defaultAddr?.city || '',
      state: prev.state || defaultAddr?.state || '',
    }));
  }, [isOpen, currentCustomer, cep]);

  // Sync shared ViaCEP address and CEP directly into NF-e checkout form
  useEffect(() => {
    if (cep && !customer.cep) {
      setCustomer((prev) => ({ ...prev, cep }));
    }
  }, [cep, customer.cep]);

  useEffect(() => {
    if (!viaCepAddress) return;
    setCustomer((prev) => ({
      ...prev,
      cep: viaCepAddress.cep || prev.cep,
      street: viaCepAddress.street || prev.street,
      neighborhood: viaCepAddress.neighborhood || prev.neighborhood,
      city: viaCepAddress.city || prev.city,
      state: viaCepAddress.state || prev.state,
    }));
  }, [viaCepAddress]);

  // Auto-lookup ViaCEP when 8 digits are typed inside NF-e checkout form
  useEffect(() => {
    const digits = customer.cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    if (viaCepAddress?.cep.replace(/\D/g, '') === digits) return;
    let cancelled = false;
    setCepLoading(true);
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.erro) return;
        const resolved: ViaCepAddress = {
          cep: maskCEP(digits),
          street: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.uf || '',
        };
        onViaCepResolved(resolved);
        setCustomer((prev) => ({
          ...prev,
          street: resolved.street || prev.street,
          neighborhood: resolved.neighborhood || prev.neighborhood,
          city: resolved.city || prev.city,
          state: resolved.state || prev.state,
        }));
      })
      .catch(() => {
        // Offline / blocked fallback silently ignored
      })
      .finally(() => {
        if (!cancelled) setCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.cep, viaCepAddress, onViaCepResolved]);

  if (!isOpen) return null;

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const found = store.coupons.find((c) => c.code.toUpperCase() === code && c.active);
    if (!found) {
      setCouponFeedback({ ok: false, msg: 'Cupom inválido ou expirado.' });
      return;
    }
    const refVal = paymentMethod === 'pix' ? subtotalPix : subtotalBase;
    if (refVal < found.minOrderValue) {
      setCouponFeedback({
        ok: false,
        msg: `Valor mínimo para este cupom: ${formatBRL(found.minOrderValue)}.`,
      });
      return;
    }
    setAppliedCouponCode(found.code);
    setCouponFeedback({
      ok: true,
      msg: `Cupom ${found.code} aplicado (${
        found.type === 'percent' ? `${found.value}% OFF` : `${formatBRL(found.value)} OFF`
      }).`,
    });
  };

  const handleCepInput = (val: string) => {
    const masked = maskCEP(val);
    onCepChange(masked);
    setCustomer((prev) => ({ ...prev, cep: masked }));
  };

  const handleConfirmOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const docDigits = customer.document.replace(/\D/g, '');
    const phoneDigits = customer.whatsapp.replace(/\D/g, '');
    const cepDigits = customer.cep.replace(/\D/g, '');

    if (!customer.fullName.trim() || customer.fullName.trim().length < 3) {
      setFormError('Informe o Nome Completo ou Razão Social para emissão da NF-e.');
      return;
    }
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setFormError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }
    if (!customer.email.includes('@') || !customer.email.includes('.')) {
      setFormError('Informe um e-mail válido para envio automático da NF-e (PDF e XML).');
      return;
    }
    if (phoneDigits.length < 10) {
      setFormError('Informe um WhatsApp válido com DDD.');
      return;
    }
    if (cepDigits.length !== 8 || !customer.street.trim() || !customer.number.trim() || !customer.city.trim()) {
      setFormError('Preencha o endereço completo com CEP, logradouro, número e cidade.');
      return;
    }

    const orderId = `BTH-${Date.now().toString().slice(-6)}`;
    const createdAt = new Date().toISOString();
    const newOrder: Order = {
      id: orderId,
      createdAt,
      customerId: currentCustomer?.id,
      status: 'Pedido Realizado',
      statusHistory: { 'Pedido Realizado': createdAt },
      trackingCode: '',
      nfeInfo: '',
      items: enrichedItems.map((i) => ({
        productId: i.product.id,
        sku: i.product.sku,
        name: i.product.name,
        quantity: i.quantity,
        unitBasePrice: i.product.basePrice,
        unitPixPrice: i.unitPixPrice,
      })),
      subtotalBase,
      discountCouponCode: activeCoupon?.code,
      discountCouponAmount: couponDiscountAmount,
      pixDiscountAmount: paymentMethod === 'pix' ? roundCurrency(subtotalBase - subtotalPix) : 0,
      shippingMethod: selectedQuote ? selectedQuote.method : 'economic',
      shippingLabel: selectedQuote
        ? `${selectedQuote.label} (${selectedQuote.estimatedDays} · Origem Cascavel-PR)`
        : 'Frete a combinar (Origem Cascavel-PR)',
      shippingCost,
      paymentMethod,
      installments: paymentMethod === 'credit_card' ? activeInstallmentOption.count : 1,
      installmentValue:
        paymentMethod === 'credit_card' ? activeInstallmentOption.installmentValue : finalTotal,
      totalAmount: finalTotal,
      customer: { ...customer },
    };

    onCreateOrder(newOrder);
    if (
      store.email.emailVerificationEnabled &&
      (store.email.templates?.orderConfirmed?.enabled ?? true) &&
      store.email.gmailScriptUrl.trim()
    ) {
      void sendOrderUpdateEmail(store.email, newOrder);
    }
    onClearCart();
    setConfirmedOrder(newOrder);
    setShowPixModalBox(newOrder.paymentMethod === 'pix');
    setStep('confirmed');
  };

  const resetAndClose = () => {
    setStep('cart');
    setConfirmedOrder(null);
    setShowPixModalBox(false);
    onClose();
  };

  // External link target for confirmed order
  const externalPayUrl =
    (confirmedOrder &&
      store.products.find((p) => p.id === confirmedOrder.items[0]?.productId && p.externalCheckoutUrl)
        ?.externalCheckoutUrl) ||
    store.payment.defaultExternalCheckoutUrl;

  const pixPayload = confirmedOrder
    ? buildPixBrCode({
        pixKey: store.payment.pixKey,
        beneficiary: store.payment.pixBeneficiary,
        city: store.fiscal.storeCityState.split('-')[0] || 'CASCAVEL',
        amount: confirmedOrder.totalAmount,
        txId: confirmedOrder.id,
      })
    : '';

  const whatsappTarget = store.fiscal.whatsappNumber.replace(/\D/g, '');
  const whatsappUrl = confirmedOrder
    ? `https://wa.me/${whatsappTarget}?text=${encodeURIComponent(
        formatWhatsAppOrderMessage(confirmedOrder, 'BTHTECH — Hardware & Periféricos')
      )}`
    : '#';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Carrinho e Checkout"
      onClick={resetAndClose}
    >
      <div
        className="w-full max-w-lg h-full bg-[#0B0D10] border-l border-[#272D38] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 bg-[#161A20] border-b border-[#272D38] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {step === 'checkout' && (
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
                aria-label="Voltar ao carrinho"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <ShoppingBag className="w-5 h-5" style={{ color: accentColor }} />
            <h2 className="font-display font-extrabold text-xl uppercase tracking-wider text-white">
              {step === 'cart' && 'Seu Carrinho'}
              {step === 'checkout' && 'Dados para NF-e e Entrega'}
              {step === 'confirmed' && 'Pedido Confirmado'}
            </h2>
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
            aria-label="Fechar carrinho"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'cart' && enrichedItems.length === 0 && (
            <div className="py-16 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#161A20] border border-[#272D38] flex items-center justify-center text-slate-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl uppercase text-white">
                  Seu carrinho está vazio
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Adicione mouses, teclados, headsets ou SSDs NVMe para continuar.
                </p>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="px-6 py-2.5 rounded font-display font-bold uppercase tracking-wider text-sm text-white"
                style={{ backgroundColor: accentColor }}
              >
                Explorar Produtos
              </button>
            </div>
          )}

          {step === 'cart' && enrichedItems.length > 0 && (
            <>
              {/* Item List */}
              <div className="space-y-3">
                {enrichedItems.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex gap-3 p-3 rounded bg-[#161A20] border border-[#272D38]"
                  >
                    <div className="w-20 h-16 rounded bg-[#0B0D10] overflow-hidden shrink-0 border border-[#272D38]">
                      <ResilientImage
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug">
                          {item.product.name}
                        </h4>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.product.id)}
                          className="p-1 text-slate-400 hover:text-red-400 shrink-0"
                          aria-label={`Remover ${item.product.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center bg-[#0B0D10] border border-[#272D38] rounded">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-mono-num font-bold text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateQty(
                                item.product.id,
                                Math.min(item.product.stock || 99, item.quantity + 1)
                              )
                            }
                            className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-right font-mono-num">
                          <div className="text-sm font-bold text-[#00E676]">
                            {formatBRL(item.unitPixPrice * item.quantity)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Cartão: {formatBRL(item.product.basePrice * item.quantity)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Box */}
              <div className="p-3.5 rounded bg-[#161A20] border border-[#272D38] space-y-2.5">
                <label
                  htmlFor="cart-coupon-input"
                  className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-slate-200"
                >
                  <Tag className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  Cupom de Desconto
                </label>
                <div className="flex gap-2">
                  <input
                    id="cart-coupon-input"
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Ex: BTH10"
                    className="flex-1 h-9 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num uppercase text-white placeholder:text-slate-500 focus:outline-none focus:border-white/50"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-4 h-9 rounded bg-[#272D38] hover:bg-[#353D4C] text-xs font-bold uppercase tracking-wider text-white transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
                {couponFeedback && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={couponFeedback.ok ? 'text-[#00E676]' : 'text-red-400'}>
                      {couponFeedback.msg}
                    </span>
                    {appliedCouponCode && (
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedCouponCode(null);
                          setCouponFeedback(null);
                          setCouponInput('');
                        }}
                        className="text-slate-400 underline hover:text-white"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* CEP Shipping Calculator with ViaCEP & Weight Calculation */}
              <ShippingCalculator
                cep={cep || customer.cep}
                onCepChange={(masked) => {
                  onCepChange(masked);
                  setCustomer((prev) => ({ ...prev, cep: masked }));
                }}
                viaCepAddress={viaCepAddress}
                onViaCepResolved={onViaCepResolved}
                subtotal={itemsSubtotalAfterPayment}
                totalWeightGrams={totalWeightGrams}
                shippingConfig={store.shipping}
                accentColor={accentColor}
                selectedMethod={selectedQuote?.method || selectedShippingMethod}
                onSelectMethod={(quote) => onSelectShippingMethod(quote)}
                compact
              />

              {/* Payment Method Selection */}
              <div className="p-3.5 rounded bg-[#161A20] border border-[#272D38] space-y-2.5">
                <p className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-slate-200">
                  <CreditCard className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  Forma de Pagamento
                </p>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`p-2.5 rounded border flex items-center justify-between text-left ${
                      paymentMethod === 'pix'
                        ? 'bg-[#0B0D10] border-[#00E676]'
                        : 'bg-[#0B0D10]/50 border-[#272D38]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">
                        PIX
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Aprovação imediata + envio prioritário
                      </div>
                    </div>
                    <span className="text-sm font-mono-num font-bold text-[#00E676]">
                      {formatBRL(subtotalPix)}
                    </span>
                  </button>

                  {store.payment.creditCardEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('credit_card')}
                        className={`p-2.5 rounded border flex items-center justify-between text-left ${
                          paymentMethod === 'credit_card'
                            ? 'bg-[#0B0D10] border-white/70'
                            : 'bg-[#0B0D10]/50 border-[#272D38]'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-white">
                            Cartão de Crédito (até {store.payment.maxInstallments}x)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Até {store.payment.interestFreeInstallments}x sem juros · {store.payment.gatewayProvider}
                          </div>
                        </div>
                        <span className="text-sm font-mono-num font-bold text-white">
                          {formatBRL(subtotalBase)}
                        </span>
                      </button>

                      {paymentMethod === 'credit_card' && (
                        <div className="p-3 rounded bg-[#0B0D10] border border-[#272D38] space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label
                              htmlFor="cart-installments"
                              className="text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                            >
                              Escolha as Parcelas
                            </label>
                            <CardBrandsStrip brands={store.payment.acceptedCardBrands} compact />
                          </div>
                          <select
                            id="cart-installments"
                            value={activeInstallmentOption.count}
                            onChange={(e) => setSelectedInstallments(Number(e.target.value))}
                            className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num text-white"
                          >
                            {installmentOptions.map((opt) => (
                              <option key={opt.count} value={opt.count}>
                                {opt.count}x de {formatBRL(opt.installmentValue)}{' '}
                                {opt.hasInterest
                                  ? `(Total ${formatBRL(opt.totalValue)})`
                                  : 'sem juros'}
                              </option>
                            ))}
                          </select>
                          {store.payment.creditCardInstructions && (
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {store.payment.creditCardInstructions}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Mandatory NF-e Checkout Form */}
          {step === 'checkout' && (
            <form id="nfe-checkout-form" onSubmit={handleConfirmOrder} className="space-y-4">
              <div className="p-3 rounded bg-[#161A20] border border-[#272D38] flex items-start gap-2.5">
                <FileText className="w-5 h-5 text-[#00E676] shrink-0 mt-0.5" />
                <p className="text-xs text-slate-200 leading-relaxed">
                  <strong>Emissão de Nota Fiscal (NF-e):</strong> Preencha seus dados fiscais corretamente.{' '}
                  <span className="text-[#00E676] font-semibold">
                    Sua Nota Fiscal (NF-e em PDF e XML) será enviada automaticamente para este e-mail.
                  </span>
                </p>
              </div>

              {formError && (
                <div className="p-3 rounded bg-red-950/60 border border-red-500/60 text-xs text-red-200">
                  {formError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome Completo / Razão Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={customer.fullName}
                    onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })}
                    placeholder="Ex: João da Silva ou Empresa LTDA"
                    className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      CPF ou CNPJ *
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      value={customer.document}
                      onChange={(e) =>
                        setCustomer({ ...customer, document: maskCpfCnpj(e.target.value) })
                      }
                      placeholder="000.000.000-00"
                      className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm font-mono-num text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      WhatsApp com DDD *
                    </label>
                    <input
                      type="tel"
                      required
                      inputMode="tel"
                      value={customer.whatsapp}
                      onChange={(e) =>
                        setCustomer({ ...customer, whatsapp: maskPhoneBR(e.target.value) })
                      }
                      placeholder="(45) 99999-9999"
                      className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm font-mono-num text-white focus:outline-none focus:border-white/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    E-mail para envio da NF-e *
                  </label>
                  <input
                    type="email"
                    required
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    placeholder="seuemail@exemplo.com.br"
                    className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                  />
                  <p className="mt-1 text-[11px] text-[#00E676]">
                    Sua Nota Fiscal (NF-e em PDF e XML) será enviada automaticamente para este e-mail
                  </p>
                </div>

                <div className="pt-2 border-t border-[#272D38] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" style={{ color: accentColor }} />
                      Endereço Completo (Entrega e Faturamento)
                    </span>
                    {cepLoading && <span className="text-[11px] text-slate-400">Buscando CEP...</span>}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">CEP *</label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        value={customer.cep}
                        onChange={(e) => handleCepInput(e.target.value)}
                        placeholder="85800-000"
                        maxLength={9}
                        className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm font-mono-num text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Rua / Logradouro *</label>
                      <input
                        type="text"
                        required
                        value={customer.street}
                        onChange={(e) => setCustomer({ ...customer, street: e.target.value })}
                        placeholder="Av. Brasil"
                        className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Número *</label>
                      <input
                        type="text"
                        required
                        value={customer.number}
                        onChange={(e) => setCustomer({ ...customer, number: e.target.value })}
                        placeholder="123"
                        className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Complemento</label>
                      <input
                        type="text"
                        value={customer.complement}
                        onChange={(e) => setCustomer({ ...customer, complement: e.target.value })}
                        placeholder="Apto, Sala, Bloco..."
                        className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={customer.neighborhood}
                        onChange={(e) => setCustomer({ ...customer, neighborhood: e.target.value })}
                        placeholder="Centro"
                        className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={customer.city}
                        onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                        placeholder="Cascavel"
                        className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">UF *</label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={customer.state}
                        onChange={(e) =>
                          setCustomer({ ...customer, state: e.target.value.toUpperCase() })
                        }
                        placeholder="PR"
                        className="w-full h-10 px-2 text-center rounded bg-[#161A20] border border-[#272D38] text-sm uppercase text-white focus:outline-none focus:border-white/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: Hybrid Confirmation */}
          {step === 'confirmed' && confirmedOrder && (
            <div className="space-y-5">
              <div className="p-4 rounded bg-[#161A20] border border-[#00E676]/50 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-[#00E676] mx-auto" />
                <h3 className="font-display font-extrabold text-2xl uppercase text-white">
                  Pedido #{confirmedOrder.id} Registrado!
                </h3>
                <p className="text-xs text-slate-300">
                  Seus dados fiscais foram salvos com sucesso. A NF-e será enviada para{' '}
                  <strong className="text-white">{confirmedOrder.customer.email}</strong>.
                </p>
                <div className="pt-2 text-lg font-mono-num font-bold text-[#00E676]">
                  Total: {formatBRL(confirmedOrder.totalAmount)}
                </div>
                {confirmedOrder.paymentMethod === 'credit_card' && (
                  <div className="text-xs font-mono-num text-slate-200">
                    Parcelamento selecionado:{' '}
                    <strong className="text-white">
                      {confirmedOrder.installments}x de {formatBRL(confirmedOrder.installmentValue)}
                    </strong>{' '}
                    ({store.payment.gatewayProvider})
                  </div>
                )}
              </div>

              {confirmedOrder.paymentMethod === 'credit_card' &&
                store.payment.creditCardInstructions && (
                  <div className="p-3 rounded bg-[#161A20] border border-[#272D38] text-xs text-slate-300 leading-relaxed">
                    {store.payment.creditCardInstructions}
                  </div>
                )}

              {/* Hybrid Buttons */}
              <div className="grid grid-cols-1 gap-3">
                {confirmedOrder.paymentMethod === 'credit_card' ? (
                  <>
                    {externalPayUrl && (
                      <a
                        href={externalPayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-12 rounded font-display font-extrabold text-sm sm:text-base uppercase tracking-wider text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-95"
                        style={{ backgroundColor: accentColor }}
                      >
                        <ExternalLink className="w-5 h-5" />
                        <span>IR PARA PAGAMENTO SEGURO NO CARTÃO</span>
                      </a>
                    )}

                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-12 rounded bg-[#00E676] hover:bg-[#00cf6a] font-display font-extrabold text-sm sm:text-base uppercase tracking-wider text-[#0B0D10] flex items-center justify-center gap-2 transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>SOLICITAR LINK DE COBRANÇA NO WHATSAPP</span>
                    </a>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPixModalBox((prev) => !prev)}
                      className="w-full h-12 rounded font-display font-extrabold text-base uppercase tracking-wider text-white flex items-center justify-center gap-2"
                      style={{ backgroundColor: accentColor }}
                    >
                      <QrCode className="w-5 h-5" />
                      <span>Pagar Online Agora (QR Code PIX)</span>
                    </button>

                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-12 rounded bg-[#00E676] hover:bg-[#00cf6a] font-display font-extrabold text-base uppercase tracking-wider text-[#0B0D10] flex items-center justify-center gap-2 transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>Enviar Pedido no WhatsApp</span>
                    </a>
                  </>
                )}
              </div>

              {/* PIX QR Code & Key Details */}
              {showPixModalBox && (
                <div className="p-4 rounded bg-[#161A20] border border-[#272D38] space-y-3 text-center">
                  <p className="text-xs font-display font-bold uppercase tracking-wider text-white">
                    Escaneie o QR Code no App do seu Banco
                  </p>
                  <div className="inline-block p-3 bg-white rounded">
                    <QRCodeSVG value={pixPayload} size={172} level="M" />
                  </div>
                  <div className="text-xs text-slate-300 space-y-1 text-left bg-[#0B0D10] p-3 rounded border border-[#272D38]">
                    <div>
                      <span className="text-slate-400">Chave ({store.payment.pixKeyType}):</span>{' '}
                      <strong className="text-white font-mono-num">{store.payment.pixKey}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Favorecido:</span>{' '}
                      <strong className="text-white">{store.payment.pixBeneficiary}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Banco:</span>{' '}
                      <strong className="text-white">{store.payment.pixBank}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(pixPayload);
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2500);
                    }}
                    className="w-full h-10 rounded bg-[#272D38] hover:bg-[#363F4E] text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-2"
                  >
                    {copiedPix ? <Check className="w-4 h-4 text-[#00E676]" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPix ? 'Código PIX Copiado!' : 'Copiar PIX Copia e Cola'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Totals */}
        {step !== 'confirmed' && enrichedItems.length > 0 && (
          <div className="p-5 bg-[#161A20] border-t border-[#272D38] space-y-3">
            <div className="space-y-1 text-xs font-mono-num">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal ({paymentMethod === 'pix' ? 'PIX' : 'Cartão/Base'})</span>
                <span>{formatBRL(itemsSubtotalAfterPayment)}</span>
              </div>
              {couponDiscountAmount > 0 && (
                <div className="flex justify-between text-[#00E676]">
                  <span>Cupom ({activeCoupon?.code})</span>
                  <span>-{formatBRL(couponDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-300">
                <span>Frete ({selectedQuote ? selectedQuote.label : 'Informe CEP'})</span>
                <span>{selectedQuote ? (shippingCost === 0 ? 'GRÁTIS' : formatBRL(shippingCost)) : '—'}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-[#272D38]">
                <span>TOTAL</span>
                <span className={paymentMethod === 'pix' ? 'text-[#00E676]' : 'text-white'}>
                  {formatBRL(finalTotal)}
                </span>
              </div>
              {paymentMethod === 'credit_card' && (
                <div className="text-right text-[11px] text-slate-400">
                  {activeInstallmentOption.count}x de {formatBRL(activeInstallmentOption.installmentValue)}{' '}
                  {activeInstallmentOption.hasInterest ? 'com juros' : 'sem juros'}
                </div>
              )}
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full h-12 rounded font-display font-extrabold text-base uppercase tracking-wider text-white transition-opacity hover:opacity-95"
                style={{ backgroundColor: accentColor }}
              >
                Finalizar Compra (Dados NF-e)
              </button>
            ) : (
              <button
                type="submit"
                form="nfe-checkout-form"
                className="w-full h-12 rounded font-display font-extrabold text-base uppercase tracking-wider text-white transition-opacity hover:opacity-95"
                style={{ backgroundColor: accentColor }}
              >
                Confirmar Pedido
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
