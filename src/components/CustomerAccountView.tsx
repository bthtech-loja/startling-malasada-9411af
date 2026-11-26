import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Heart,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  User,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { ORDER_TIMELINE_STAGES } from '../hooks/useStore';
import {
  CustomerAccount,
  Order,
  OrderTimelineStage,
  Product,
  SavedAddress,
  StoreState,
} from '../types/store';
import {
  calcPixPrice,
  formatBRL,
  lookupViaCep,
  maskCEP,
  maskCpfCnpj,
  maskPhoneBR,
} from '../utils/formatters';
import { generateOtpCode, sendVerificationEmail } from '../utils/emailService';
import { StudioProductImage } from './StudioProductImage';

interface CustomerAccountViewProps {
  store: StoreState;
  currentCustomer: CustomerAccount | null;
  accentColor: string;
  onLogin: (identifier: string, password: string) => { ok: boolean; message: string };
  onRegister: (
    payload: Omit<CustomerAccount, 'id' | 'createdAt' | 'favoriteProductIds'>
  ) => { ok: boolean; message: string };
  onLogout: () => void;
  onUpdateCustomer: (updated: CustomerAccount) => void;
  onToggleFavorite: (productId: string) => boolean;
  onAddToCart: (product: Product) => void;
  onBackToStore: () => void;
}

type AccountSection = 'overview' | 'orders' | 'favorites' | 'addresses' | 'profile';
type AuthMode = 'login' | 'register';

function formatShortDateTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function getPaymentLabel(order: Order): string {
  if (order.paymentMethod === 'pix') return 'PIX';
  if (order.paymentMethod === 'credit_card') {
    return `Cartão de Crédito (${order.installments}x de ${formatBRL(order.installmentValue)})`;
  }
  return 'Link de Pagamento';
}

function OrderTimeline({ order }: { order: Order }) {
  const isCanceled = order.status === 'Cancelado';
  const activeStageIndex = isCanceled
    ? -1
    : ORDER_TIMELINE_STAGES.indexOf(order.status as OrderTimelineStage);

  if (isCanceled) {
    return (
      <div className="mt-4 pt-4 border-t border-[#272D38] flex items-center gap-2.5 text-xs text-red-400">
        <XCircle className="w-4 h-4 shrink-0" />
        <span className="font-semibold uppercase tracking-wider">
          Pedido Cancelado — Entre em contato com o suporte caso tenha dúvidas.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#272D38]">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-2">
        {ORDER_TIMELINE_STAGES.map((stage, idx) => {
          const isCompleted = idx <= activeStageIndex;
          const isCurrent = idx === activeStageIndex;
          const stageDate = order.statusHistory?.[stage];
          const connectorDone = idx < activeStageIndex;

          return (
            <div key={stage} className="relative flex flex-col items-start sm:items-center text-left sm:text-center">
              {/* Desktop horizontal connector line */}
              {idx < ORDER_TIMELINE_STAGES.length - 1 && (
                <div
                  className={`hidden sm:block absolute top-3.5 left-[54%] w-[92%] h-[2px] ${
                    connectorDone ? 'bg-[#00E676]' : 'bg-[#272D38]'
                  }`}
                  aria-hidden="true"
                />
              )}

              <div className="relative z-10 flex items-center gap-2 sm:flex-col sm:gap-1.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-mono-num font-bold transition-colors ${
                    isCompleted
                      ? 'bg-[#00E676] border-[#00E676] text-[#0B0D10]'
                      : 'bg-[#0B0D10] border-[#272D38] text-slate-500'
                  } ${isCurrent ? 'ring-4 ring-[#00E676]/20' : ''}`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : idx + 1}
                </div>
                <div>
                  <div
                    className={`text-xs font-bold leading-tight ${
                      isCompleted ? 'text-[#00E676]' : 'text-slate-400'
                    }`}
                  >
                    {stage}
                  </div>
                  <div className="text-[10px] font-mono-num text-slate-500 mt-0.5 min-h-[14px]">
                    {isCompleted && stageDate ? formatShortDateTime(stageDate) : 'Pendente'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerAccountView({
  store,
  currentCustomer,
  accentColor,
  onLogin,
  onRegister,
  onLogout,
  onUpdateCustomer,
  onToggleFavorite,
  onAddToCart,
  onBackToStore,
}: CustomerAccountViewProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [section, setSection] = useState<AccountSection>('orders');

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regDocument, setRegDocument] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regCep, setRegCep] = useState('');
  const [regStreet, setRegStreet] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [regComplement, setRegComplement] = useState('');
  const [regNeighborhood, setRegNeighborhood] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regState, setRegState] = useState('');
  const [regCepLoading, setRegCepLoading] = useState(false);

  // EmailJS 6-digit OTP verification state
  const [otpStepActive, setOtpStepActive] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpInfoMsg, setOtpInfoMsg] = useState('');

  // Order detail / tracking modals
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);

  // Addresses state
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrLabel, setAddrLabel] = useState('Casa');
  const [addrCep, setAddrCep] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrComplement, setAddrComplement] = useState('');
  const [addrNeighborhood, setAddrNeighborhood] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [addrDefault, setAddrDefault] = useState(true);
  const [addrCepLoading, setAddrCepLoading] = useState(false);

  // Profile edit state
  const [profName, setProfName] = useState('');
  const [profDocument, setProfDocument] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profWhatsapp, setProfWhatsapp] = useState('');
  const [profNewPass, setProfNewPass] = useState('');
  const [profConfirmPass, setProfConfirmPass] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (currentCustomer) {
      setProfName(currentCustomer.fullName);
      setProfDocument(currentCustomer.document);
      setProfEmail(currentCustomer.email);
      setProfWhatsapp(currentCustomer.whatsapp);
    }
  }, [currentCustomer]);

  // Auto ViaCEP on register CEP
  useEffect(() => {
    const digits = regCep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    let cancelled = false;
    setRegCepLoading(true);
    lookupViaCep(digits)
      .then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        setRegStreet(res.data.street || '');
        setRegNeighborhood(res.data.neighborhood || '');
        setRegCity(res.data.city || '');
        setRegState(res.data.state || '');
      })
      .finally(() => {
        if (!cancelled) setRegCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regCep]);

  // Auto ViaCEP on address manager CEP
  useEffect(() => {
    const digits = addrCep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    let cancelled = false;
    setAddrCepLoading(true);
    lookupViaCep(digits)
      .then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        setAddrStreet((prev) => res.data?.street || prev);
        setAddrNeighborhood((prev) => res.data?.neighborhood || prev);
        setAddrCity((prev) => res.data?.city || prev);
        setAddrState((prev) => res.data?.state || prev);
      })
      .finally(() => {
        if (!cancelled) setAddrCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addrCep]);

  const showFeedback = (msg: string, ok = true) => {
    setFeedbackBanner({ ok, msg });
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  // Match orders belonging to the logged-in customer (by customerId, email, or document)
  const customerOrders = useMemo(() => {
    if (!currentCustomer) return [];
    const cEmail = currentCustomer.email.trim().toLowerCase();
    const cDoc = currentCustomer.document.replace(/\D/g, '');
    return store.orders.filter((order) => {
      if (order.customerId && order.customerId === currentCustomer.id) return true;
      if (order.customer.email.trim().toLowerCase() === cEmail) return true;
      const oDoc = order.customer.document.replace(/\D/g, '');
      if (cDoc.length >= 11 && oDoc === cDoc) return true;
      return false;
    });
  }, [store.orders, currentCustomer]);

  const favoriteProducts = useMemo(() => {
    if (!currentCustomer) return [];
    return store.products.filter((p) => currentCustomer.favoriteProductIds.includes(p.id));
  }, [store.products, currentCustomer]);

  const cleanSupportPhone = store.fiscal.whatsappNumber.replace(/\D/g, '');

  const buildSupportWhatsappUrl = (orderId: string) => {
    const msg = `Olá BTHTECH! Preciso de suporte referente ao pedido #${orderId}.`;
    return `https://wa.me/${cleanSupportPhone}?text=${encodeURIComponent(msg)}`;
  };

  // UNAUTHENTICATED SCREEN (LOGIN / REGISTER)
  if (!currentCustomer) {
    const handleLoginSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      const res = onLogin(loginIdentifier, loginPassword);
      if (!res.ok) {
        setAuthError(res.message);
      }
    };

    const completeRegistration = () => {
      const initialAddress: SavedAddress = {
        id: `addr-${Date.now()}`,
        label: 'Principal',
        cep: maskCEP(regCep),
        street: regStreet.trim(),
        number: regNumber.trim(),
        complement: regComplement.trim(),
        neighborhood: regNeighborhood.trim(),
        city: regCity.trim(),
        state: regState.trim().toUpperCase(),
        isDefault: true,
      };

      const res = onRegister({
        fullName: regName.trim(),
        document: maskCpfCnpj(regDocument),
        email: regEmail.trim(),
        whatsapp: maskPhoneBR(regWhatsapp),
        password: regPassword,
        addresses: [initialAddress],
      });
      if (!res.ok) {
        setAuthError(res.message);
      } else {
        setOtpStepActive(false);
        setGeneratedOtp('');
        setEnteredOtp('');
        setOtpInfoMsg('');
      }
    };

    const dispatchOtpCode = async () => {
      const code = generateOtpCode();
      setOtpSending(true);
      setAuthError('');
      setOtpInfoMsg('');
      const result = await sendVerificationEmail(store.email, {
        user_name: regName.trim(),
        to_email: regEmail.trim(),
        verification_code: code,
      });
      setOtpSending(false);
      if (!result.ok) {
        setAuthError(result.message);
        return false;
      }
      setGeneratedOtp(code);
      setOtpStepActive(true);
      setOtpInfoMsg(
        `Enviamos um código de 6 dígitos para ${regEmail.trim()}. Confira sua caixa de entrada ou spam.`
      );
      return true;
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      const docDigits = regDocument.replace(/\D/g, '');
      const phoneDigits = regWhatsapp.replace(/\D/g, '');
      const cepDigits = regCep.replace(/\D/g, '');

      if (regName.trim().length < 3) {
        setAuthError('Informe seu nome completo.');
        return;
      }
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        setAuthError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
        return;
      }
      if (!regEmail.includes('@') || !regEmail.includes('.')) {
        setAuthError('Informe um e-mail válido.');
        return;
      }
      if (phoneDigits.length < 10) {
        setAuthError('Informe um número de WhatsApp válido com DDD.');
        return;
      }
      if (regPassword.length < 6) {
        setAuthError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (regPassword !== regConfirmPassword) {
        setAuthError('As senhas digitadas não conferem.');
        return;
      }
      if (cepDigits.length !== 8 || !regStreet.trim() || !regNumber.trim() || !regCity.trim()) {
        setAuthError('Preencha o endereço completo com CEP, logradouro, número e cidade.');
        return;
      }

      const cleanEmail = regEmail.trim().toLowerCase();
      const duplicate = store.customers.find(
        (c) =>
          c.email.trim().toLowerCase() === cleanEmail ||
          (docDigits.length >= 11 && c.document.replace(/\D/g, '') === docDigits)
      );
      if (duplicate) {
        setAuthError('Já existe uma conta cadastrada com este e-mail ou CPF/CNPJ.');
        return;
      }

      const verificationActive =
        store.email.emailVerificationEnabled &&
        (store.email.templates?.verification?.enabled ?? true);

      if (verificationActive) {
        await dispatchOtpCode();
        return;
      }

      completeRegistration();
    };

    const handleConfirmOtp = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      if (enteredOtp.trim() !== generatedOtp) {
        setAuthError('Código de verificação inválido. Confira os 6 dígitos enviados ao seu e-mail.');
        return;
      }
      completeRegistration();
    };

    return (
      <section className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToStore}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#161A20] border border-[#272D38] hover:border-slate-500 text-xs font-semibold text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a Vitrine</span>
          </button>
        </div>

        <div className="max-w-2xl mx-auto bg-[#161A20] border border-[#272D38] rounded-md overflow-hidden shadow-2xl">
          <div className="p-6 sm:p-8 border-b border-[#272D38] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                <User className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-display font-extrabold text-2xl sm:text-3xl uppercase tracking-wider text-white leading-none">
                  Área do Cliente BTHTECH
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Acompanhe seus pedidos, código de rastreio, favoritos e endereços.
                </p>
              </div>
            </div>

            <div className="flex bg-[#0B0D10] p-1 rounded border border-[#272D38] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                }}
                className={`px-4 py-2 rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                  authMode === 'login' ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
                style={authMode === 'login' ? { backgroundColor: accentColor } : undefined}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
                className={`px-4 py-2 rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                  authMode === 'register' ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
                style={authMode === 'register' ? { backgroundColor: accentColor } : undefined}
              >
                Criar Conta
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {authError && (
              <div className="mb-5 p-3 rounded bg-red-950/60 border border-red-500/60 text-xs text-red-200">
                {authError}
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="cli-login-id" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    E-mail ou CPF/CNPJ
                  </label>
                  <input
                    id="cli-login-id"
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="seuemail@exemplo.com ou 000.000.000-00"
                    className="w-full h-11 px-3.5 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
                  />
                </div>

                <div>
                  <label htmlFor="cli-login-pass" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Senha
                  </label>
                  <input
                    id="cli-login-pass"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha"
                    className="w-full h-11 px-3.5 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded font-display font-extrabold text-base uppercase tracking-wider text-white flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
                  style={{ backgroundColor: accentColor }}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Acessar Minha Conta</span>
                </button>

                <p className="text-center text-xs text-slate-400 pt-2">
                  Ainda não possui cadastro?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError('');
                    }}
                    className="font-semibold underline hover:text-white"
                    style={{ color: accentColor }}
                  >
                    Criar conta gratuitamente
                  </button>
                </p>
              </form>
            ) : otpStepActive ? (
              <form onSubmit={handleConfirmOtp} className="space-y-4">
                <div className="p-4 rounded bg-[#0B0D10] border border-[#00E676]/40 space-y-2">
                  <div className="flex items-center gap-2 text-[#00E676] font-display font-bold text-base uppercase tracking-wider">
                    <Mail className="w-5 h-5" />
                    <span>Confirme seu E-mail</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {otpInfoMsg ||
                      `Digite o código numérico de 6 dígitos enviado para ${regEmail.trim()}.`}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="cli-otp-input"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    Código de Verificação (6 dígitos) *
                  </label>
                  <input
                    id="cli-otp-input"
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={enteredOtp}
                    onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full h-12 px-4 rounded bg-[#0B0D10] border border-[#272D38] text-center text-xl font-mono-num font-bold tracking-[0.4em] text-white focus:outline-none focus:border-[#00E676]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded font-display font-extrabold text-base uppercase tracking-wider text-white flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
                  style={{ backgroundColor: accentColor }}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirmar Código e Criar Conta</span>
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <button
                    type="button"
                    disabled={otpSending}
                    onClick={dispatchOtpCode}
                    className="font-semibold text-[#00E676] hover:underline disabled:opacity-50"
                  >
                    {otpSending ? 'Reenviando código...' : 'Reenviar código de 6 dígitos'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStepActive(false);
                      setAuthError('');
                    }}
                    className="text-slate-400 hover:text-white underline"
                  >
                    Voltar e editar dados
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nome Completo / Razão Social *
                    </label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo Silva"
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      CPF ou CNPJ *
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      value={regDocument}
                      onChange={(e) => setRegDocument(maskCpfCnpj(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white focus:outline-none focus:border-white/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      WhatsApp com DDD *
                    </label>
                    <input
                      type="tel"
                      required
                      value={regWhatsapp}
                      onChange={(e) => setRegWhatsapp(maskPhoneBR(e.target.value))}
                      placeholder="(45) 99999-9999"
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white focus:outline-none focus:border-white/60"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com.br"
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Senha (mín. 6 caracteres) *
                    </label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Confirmar Senha *
                    </label>
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#272D38] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" style={{ color: accentColor }} />
                      Endereço Principal de Entrega
                    </span>
                    {regCepLoading && (
                      <span className="text-[11px] text-slate-400">Buscando CEP...</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">CEP *</label>
                      <input
                        type="text"
                        required
                        maxLength={9}
                        inputMode="numeric"
                        value={regCep}
                        onChange={(e) => setRegCep(maskCEP(e.target.value))}
                        placeholder="85800-000"
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Logradouro *</label>
                      <input
                        type="text"
                        required
                        value={regStreet}
                        onChange={(e) => setRegStreet(e.target.value)}
                        placeholder="Rua / Avenida"
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Número *</label>
                      <input
                        type="text"
                        required
                        value={regNumber}
                        onChange={(e) => setRegNumber(e.target.value)}
                        placeholder="123"
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Complemento</label>
                      <input
                        type="text"
                        value={regComplement}
                        onChange={(e) => setRegComplement(e.target.value)}
                        placeholder="Apto, Sala, Bloco..."
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={regNeighborhood}
                        onChange={(e) => setRegNeighborhood(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={regCity}
                        onChange={(e) => setRegCity(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">UF *</label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={regState}
                        onChange={(e) => setRegState(e.target.value.toUpperCase())}
                        className="w-full h-10 px-2 text-center rounded bg-[#0B0D10] border border-[#272D38] text-sm uppercase text-white"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={otpSending}
                  className="w-full h-12 rounded font-display font-extrabold text-base uppercase tracking-wider text-white flex items-center justify-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: accentColor }}
                >
                  {otpSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando código de verificação...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {store.email.emailVerificationEnabled &&
                        (store.email.templates?.verification?.enabled ?? true)
                          ? 'Enviar Código de Confirmação'
                          : 'Criar Minha Conta'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    );
  }

  // AUTHENTICATED CUSTOMER PORTAL (PICHAU-STYLE DARK LAYOUT)
  const firstName = currentCustomer.fullName.trim().split(' ')[0];
  const latestOrder = customerOrders[0] || null;

  const menuItems: { id: AccountSection; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Minha Conta', icon: <User className="w-4 h-4" /> },
    {
      id: 'orders',
      label: 'Meus Pedidos',
      icon: <ShoppingBag className="w-4 h-4" />,
      count: customerOrders.length,
    },
    {
      id: 'favorites',
      label: 'Meus Favoritos',
      icon: <Heart className="w-4 h-4" />,
      count: favoriteProducts.length,
    },
    {
      id: 'addresses',
      label: 'Endereços',
      icon: <MapPin className="w-4 h-4" />,
      count: currentCustomer.addresses.length,
    },
    { id: 'profile', label: 'Meus Dados', icon: <UserCheck className="w-4 h-4" /> },
  ];

  const openNewAddressForm = () => {
    setEditingAddressId(null);
    setAddrLabel('Casa');
    setAddrCep('');
    setAddrStreet('');
    setAddrNumber('');
    setAddrComplement('');
    setAddrNeighborhood('');
    setAddrCity('');
    setAddrState('');
    setAddrDefault(currentCustomer.addresses.length === 0);
    setAddressFormOpen(true);
  };

  const openEditAddressForm = (addr: SavedAddress) => {
    setEditingAddressId(addr.id);
    setAddrLabel(addr.label);
    setAddrCep(addr.cep);
    setAddrStreet(addr.street);
    setAddrNumber(addr.number);
    setAddrComplement(addr.complement);
    setAddrNeighborhood(addr.neighborhood);
    setAddrCity(addr.city);
    setAddrState(addr.state);
    setAddrDefault(addr.isDefault);
    setAddressFormOpen(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const cepDigits = addrCep.replace(/\D/g, '');
    if (cepDigits.length !== 8 || !addrStreet.trim() || !addrNumber.trim() || !addrCity.trim()) {
      showFeedback('Preencha CEP, logradouro, número e cidade corretamente.', false);
      return;
    }

    const nextAddress: SavedAddress = {
      id: editingAddressId || `addr-${Date.now()}`,
      label: addrLabel.trim() || 'Endereço',
      cep: maskCEP(addrCep),
      street: addrStreet.trim(),
      number: addrNumber.trim(),
      complement: addrComplement.trim(),
      neighborhood: addrNeighborhood.trim(),
      city: addrCity.trim(),
      state: addrState.trim().toUpperCase(),
      isDefault: addrDefault,
    };

    let updatedList: SavedAddress[];
    if (editingAddressId) {
      updatedList = currentCustomer.addresses.map((a) =>
        a.id === editingAddressId ? nextAddress : addrDefault ? { ...a, isDefault: false } : a
      );
    } else {
      updatedList = [
        ...(addrDefault
          ? currentCustomer.addresses.map((a) => ({ ...a, isDefault: false }))
          : currentCustomer.addresses),
        nextAddress,
      ];
    }

    if (!updatedList.some((a) => a.isDefault) && updatedList.length > 0) {
      updatedList[0] = { ...updatedList[0], isDefault: true };
    }

    onUpdateCustomer({ ...currentCustomer, addresses: updatedList });
    setAddressFormOpen(false);
    showFeedback(editingAddressId ? 'Endereço atualizado com sucesso!' : 'Novo endereço cadastrado!');
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (profName.trim().length < 3) {
      showFeedback('Informe seu nome completo.', false);
      return;
    }
    if (profNewPass && profNewPass.length < 6) {
      showFeedback('A nova senha deve ter pelo menos 6 caracteres.', false);
      return;
    }
    if (profNewPass && profNewPass !== profConfirmPass) {
      showFeedback('A confirmação da nova senha não confere.', false);
      return;
    }

    onUpdateCustomer({
      ...currentCustomer,
      fullName: profName.trim(),
      document: maskCpfCnpj(profDocument),
      email: profEmail.trim(),
      whatsapp: maskPhoneBR(profWhatsapp),
      password: profNewPass ? profNewPass : currentCustomer.password,
    });
    setProfNewPass('');
    setProfConfirmPass('');
    showFeedback('Dados pessoais atualizados com sucesso!');
  };

  const renderOrderCard = (order: Order) => {
    const isCanceled = order.status === 'Cancelado';
    return (
      <div
        key={order.id}
        className="p-4 sm:p-5 rounded-md bg-[#161A20] border border-[#272D38] hover:border-slate-600/80 transition-colors"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Column 1: Number & Payment */}
          <div className="md:col-span-3 space-y-1">
            <span className="block text-[11px] uppercase tracking-wider text-slate-400">
              Número do Pedido
            </span>
            <div className="font-display font-extrabold text-xl text-white tracking-wide">
              #{order.id}
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{getPaymentLabel(order)}</span>
            </div>
          </div>

          {/* Column 2: Date & Status */}
          <div className="md:col-span-3 space-y-1">
            <span className="block text-[11px] uppercase tracking-wider text-slate-400">
              Data / Status Atual
            </span>
            <div className="text-xs font-mono-num text-slate-300">
              {formatShortDateTime(order.createdAt)}
            </div>
            <div
              className={`text-sm font-display font-extrabold uppercase tracking-wider ${
                isCanceled ? 'text-red-400' : 'text-[#00E676]'
              }`}
            >
              {order.status}
            </div>
          </div>

          {/* Column 3: Total */}
          <div className="md:col-span-2 space-y-1">
            <span className="block text-[11px] uppercase tracking-wider text-slate-400">
              Valor Total
            </span>
            <div className="font-mono-num font-bold text-lg text-white">
              {formatBRL(order.totalAmount)}
            </div>
            <div className="text-[11px] text-slate-400">
              {order.items.reduce((acc, i) => acc + i.quantity, 0)}{' '}
              {order.items.reduce((acc, i) => acc + i.quantity, 0) === 1 ? 'item' : 'itens'}
            </div>
          </div>

          {/* Column 4: 3 Action Buttons */}
          <div className="md:col-span-4 flex flex-wrap md:justify-end gap-2">
            <button
              type="button"
              onClick={() => setViewingOrder(order)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-white/60 text-[11px] font-display font-bold uppercase tracking-wider text-white transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>VER PEDIDO</span>
            </button>

            <button
              type="button"
              onClick={() => setTrackingOrder(order)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-[#00E676] text-[11px] font-display font-bold uppercase tracking-wider text-[#00E676] transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>RASTREAR PEDIDO</span>
            </button>

            {cleanSupportPhone && (
              <a
                href={buildSupportWhatsappUrl(order.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-[11px] font-display font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>CONTATAR SUPORTE</span>
              </a>
            )}
          </div>
        </div>

        {/* Synced Tracking Code & NF-e Quick Summary */}
        {(order.trackingCode || order.nfeInfo) && (
          <div className="mt-3 pt-3 border-t border-[#272D38]/70 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            {order.trackingCode && (
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#FF6500]" />
                <span className="text-slate-400">Rastreio:</span>
                <span className="font-mono-num font-bold text-[#FF6500]">
                  {order.trackingCode}
                </span>
              </div>
            )}
            {order.nfeInfo && (
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#00E676]" />
                <span className="text-slate-400">NF-e:</span>
                {/^https?:\/\//i.test(order.nfeInfo) ? (
                  <a
                    href={order.nfeInfo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00E676] font-semibold underline hover:text-white"
                  >
                    Consultar Nota Fiscal
                  </a>
                ) : (
                  <span className="text-[#00E676] font-semibold">{order.nfeInfo}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5-Stage Visual Progress Timeline */}
        <OrderTimeline order={order} />
      </div>
    );
  };

  return (
    <section className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-[#272D38]">
        <div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl uppercase tracking-wider text-white">
            Olá, {firstName}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {currentCustomer.email} · {currentCustomer.document}
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToStore}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#161A20] border border-[#272D38] hover:border-slate-500 text-xs font-semibold text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Continuar Comprando</span>
        </button>
      </div>

      {feedbackBanner && (
        <div
          className={`mt-4 px-4 py-2.5 rounded border text-xs font-semibold ${
            feedbackBanner.ok
              ? 'bg-[#00E676]/15 border-[#00E676]/50 text-[#00E676]'
              : 'bg-red-950/70 border-red-500/60 text-red-200'
          }`}
        >
          {feedbackBanner.msg}
        </div>
      )}

      {/* Main Split Grid: Sidebar + Content */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar Menu */}
        <aside className="lg:col-span-3 bg-[#161A20] border border-[#272D38] rounded-md p-2.5 space-y-1">
          {menuItems.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded text-xs sm:text-sm font-semibold transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-slate-300 hover:text-white hover:bg-[#0B0D10]/70'
                }`}
                style={active ? { backgroundColor: accentColor } : undefined}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono-num ${
                      active ? 'bg-black/25 text-white' : 'bg-[#0B0D10] text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-[#272D38]">
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded text-xs sm:text-sm font-semibold text-red-400 hover:bg-red-950/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="lg:col-span-9 space-y-5">
          {/* OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setSection('orders')}
                  className="p-4 rounded-md bg-[#161A20] border border-[#272D38] hover:border-slate-500 text-left transition-colors"
                >
                  <ShoppingBag className="w-5 h-5 mb-2" style={{ color: accentColor }} />
                  <div className="font-mono-num font-bold text-2xl text-white">
                    {customerOrders.length}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Pedidos Realizados</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSection('favorites')}
                  className="p-4 rounded-md bg-[#161A20] border border-[#272D38] hover:border-slate-500 text-left transition-colors"
                >
                  <Heart className="w-5 h-5 mb-2 text-rose-400" />
                  <div className="font-mono-num font-bold text-2xl text-white">
                    {favoriteProducts.length}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Produtos Favoritos</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSection('addresses')}
                  className="p-4 rounded-md bg-[#161A20] border border-[#272D38] hover:border-slate-500 text-left transition-colors"
                >
                  <MapPin className="w-5 h-5 mb-2 text-[#00E676]" />
                  <div className="font-mono-num font-bold text-2xl text-white">
                    {currentCustomer.addresses.length}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Endereços Salvos</div>
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white">
                    Último Pedido
                  </h2>
                  {customerOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSection('orders')}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: accentColor }}
                    >
                      Ver todos os pedidos
                    </button>
                  )}
                </div>

                {latestOrder ? (
                  renderOrderCard(latestOrder)
                ) : (
                  <div className="p-8 rounded-md bg-[#161A20] border border-[#272D38] text-center space-y-2">
                    <Package className="w-8 h-8 mx-auto text-slate-500" />
                    <p className="text-sm text-slate-300">
                      Você ainda não realizou nenhum pedido com esta conta.
                    </p>
                    <button
                      type="button"
                      onClick={onBackToStore}
                      className="mt-2 px-4 py-2 rounded font-display font-bold text-xs uppercase tracking-wider text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      Explorar Produtos
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ORDERS LIST */}
          {section === 'orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white">
                  Meus Pedidos ({customerOrders.length})
                </h2>
              </div>

              {customerOrders.length === 0 ? (
                <div className="p-10 rounded-md bg-[#161A20] border border-[#272D38] text-center space-y-3">
                  <ShoppingBag className="w-10 h-10 mx-auto text-slate-500" />
                  <h3 className="font-display font-bold text-lg uppercase text-white">
                    Nenhum pedido encontrado
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Seus pedidos realizados com o mesmo e-mail ou CPF/CNPJ aparecerão automaticamente aqui com acompanhamento de status e rastreio.
                  </p>
                  <button
                    type="button"
                    onClick={onBackToStore}
                    className="px-5 py-2.5 rounded font-display font-bold text-xs uppercase tracking-wider text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    Ir para a Vitrine
                  </button>
                </div>
              ) : (
                <div className="space-y-4">{customerOrders.map(renderOrderCard)}</div>
              )}
            </div>
          )}

          {/* FAVORITES */}
          {section === 'favorites' && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white">
                Meus Favoritos ({favoriteProducts.length})
              </h2>

              {favoriteProducts.length === 0 ? (
                <div className="p-10 rounded-md bg-[#161A20] border border-[#272D38] text-center space-y-3">
                  <Heart className="w-10 h-10 mx-auto text-slate-500" />
                  <p className="text-sm text-slate-300">
                    Você ainda não salvou produtos nos favoritos.
                  </p>
                  <button
                    type="button"
                    onClick={onBackToStore}
                    className="px-5 py-2.5 rounded font-display font-bold text-xs uppercase tracking-wider text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    Descobrir Produtos
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favoriteProducts.map((product) => {
                    const pixPrice = calcPixPrice(
                      product.basePrice,
                      store.payment.pixDiscountPercent
                    );
                    const outOfStock = product.stock <= 0;
                    return (
                      <div
                        key={product.id}
                        className="bg-[#161A20] border border-[#272D38] rounded-md overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          <div className="h-44 border-b border-[#272D38] relative">
                            <StudioProductImage
                              src={product.imageUrl}
                              alt={product.name}
                              fallbackLabel={product.name}
                            />
                            <button
                              type="button"
                              onClick={() => onToggleFavorite(product.id)}
                              className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-[#0B0D10]/85 border border-[#272D38] text-rose-400 hover:text-rose-300"
                              title="Remover dos favoritos"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="p-3.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">
                              {product.category}
                            </div>
                            <h3 className="text-sm font-semibold text-white line-clamp-2 mt-1 min-h-[2.4rem]">
                              {product.name}
                            </h3>
                            <div className="mt-2 font-mono-num font-bold text-lg text-[#00E676]">
                              {formatBRL(pixPrice)}{' '}
                              <span className="text-[10px] font-normal text-slate-400">no PIX</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-3.5 pt-0">
                          <button
                            type="button"
                            disabled={outOfStock}
                            onClick={() => onAddToCart(product)}
                            className="w-full h-10 rounded font-display font-bold text-xs uppercase tracking-wider text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                            style={{ backgroundColor: outOfStock ? '#272D38' : accentColor }}
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>{outOfStock ? 'ESGOTADO' : 'COMPRAR'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ADDRESSES */}
          {section === 'addresses' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white">
                  Endereços Cadastrados
                </h2>
                <button
                  type="button"
                  onClick={openNewAddressForm}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded font-display font-bold text-xs uppercase tracking-wider text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Endereço</span>
                </button>
              </div>

              {addressFormOpen && (
                <form
                  onSubmit={handleSaveAddress}
                  className="p-5 rounded-md bg-[#161A20] border border-[#272D38] space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[#272D38] pb-2">
                    <h3 className="font-display font-bold text-base uppercase text-white">
                      {editingAddressId ? 'Editar Endereço' : 'Cadastrar Novo Endereço'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setAddressFormOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Identificação *</label>
                      <input
                        type="text"
                        required
                        value={addrLabel}
                        onChange={(e) => setAddrLabel(e.target.value)}
                        placeholder="Ex: Casa, Trabalho"
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        CEP * {addrCepLoading && '(Buscando...)'}
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={9}
                        value={addrCep}
                        onChange={(e) => setAddrCep(maskCEP(e.target.value))}
                        placeholder="85800-000"
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Número *</label>
                      <input
                        type="text"
                        required
                        value={addrNumber}
                        onChange={(e) => setAddrNumber(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Rua / Logradouro *</label>
                      <input
                        type="text"
                        required
                        value={addrStreet}
                        onChange={(e) => setAddrStreet(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Complemento</label>
                      <input
                        type="text"
                        value={addrComplement}
                        onChange={(e) => setAddrComplement(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={addrNeighborhood}
                        onChange={(e) => setAddrNeighborhood(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={addrCity}
                        onChange={(e) => setAddrCity(e.target.value)}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">UF *</label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={addrState}
                        onChange={(e) => setAddrState(e.target.value.toUpperCase())}
                        className="w-full h-10 px-2 text-center rounded bg-[#0B0D10] border border-[#272D38] text-sm uppercase text-white"
                      />
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addrDefault}
                      onChange={(e) => setAddrDefault(e.target.checked)}
                      className="accent-[#00E676]"
                    />
                    <span>Definir como endereço principal</span>
                  </label>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAddressFormOpen(false)}
                      className="px-4 py-2 rounded border border-[#272D38] text-xs font-semibold text-slate-300"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded font-display font-bold text-xs uppercase tracking-wider text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      Salvar Endereço
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentCustomer.addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`p-4 rounded-md bg-[#161A20] border space-y-2 ${
                      addr.isDefault ? 'border-[#00E676]/60' : 'border-[#272D38]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-base uppercase text-white">
                          {addr.label}
                        </span>
                        {addr.isDefault && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#00E676]">
                            · Principal
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditAddressForm(addr)}
                          className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const remaining = currentCustomer.addresses.filter(
                              (a) => a.id !== addr.id
                            );
                            if (
                              remaining.length > 0 &&
                              !remaining.some((a) => a.isDefault)
                            ) {
                              remaining[0] = { ...remaining[0], isDefault: true };
                            }
                            onUpdateCustomer({ ...currentCustomer, addresses: remaining });
                            showFeedback('Endereço removido.');
                          }}
                          className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-red-400 hover:border-red-500"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {addr.street}, Nº {addr.number}
                      {addr.complement ? ` — ${addr.complement}` : ''}
                      <br />
                      {addr.neighborhood} · {addr.city}/{addr.state}
                      <br />
                      <span className="font-mono-num text-slate-400">CEP: {addr.cep}</span>
                    </p>

                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = currentCustomer.addresses.map((a) => ({
                            ...a,
                            isDefault: a.id === addr.id,
                          }));
                          onUpdateCustomer({ ...currentCustomer, addresses: updated });
                          showFeedback('Endereço principal atualizado!');
                        }}
                        className="text-[11px] font-semibold text-[#00E676] hover:underline"
                      >
                        Definir como principal
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PROFILE / MEUS DADOS */}
          {section === 'profile' && (
            <form
              onSubmit={handleSaveProfile}
              className="p-5 sm:p-6 rounded-md bg-[#161A20] border border-[#272D38] space-y-4"
            >
              <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                Meus Dados Cadastrais
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-300 mb-1">
                    Nome Completo / Razão Social
                  </label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">CPF / CNPJ</label>
                  <input
                    type="text"
                    required
                    value={profDocument}
                    onChange={(e) => setProfDocument(maskCpfCnpj(e.target.value))}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">WhatsApp</label>
                  <input
                    type="tel"
                    required
                    value={profWhatsapp}
                    onChange={(e) => setProfWhatsapp(maskPhoneBR(e.target.value))}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Nova Senha (opcional)
                  </label>
                  <input
                    type="password"
                    value={profNewPass}
                    onChange={(e) => setProfNewPass(e.target.value)}
                    placeholder="Deixe vazio para manter a atual"
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    value={profConfirmPass}
                    onChange={(e) => setProfConfirmPass(e.target.value)}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded font-display font-bold text-sm uppercase tracking-wider text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* MODAL: VER PEDIDO */}
      {viewingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewingOrder(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#161A20] border border-[#272D38] rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#272D38] flex items-center justify-between">
              <div>
                <h3 className="font-display font-extrabold text-xl uppercase tracking-wider text-white">
                  Detalhes do Pedido #{viewingOrder.id}
                </h3>
                <p className="text-xs text-slate-400 font-mono-num">
                  Realizado em {formatShortDateTime(viewingOrder.createdAt)} · Status:{' '}
                  <span className="text-[#00E676] font-bold">{viewingOrder.status}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingOrder(null)}
                className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
                aria-label="Fechar detalhes do pedido"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs">
              {/* Items */}
              <div className="space-y-2">
                <h4 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                  Produtos Adquiridos
                </h4>
                <div className="divide-y divide-[#272D38] bg-[#0B0D10] border border-[#272D38] rounded">
                  {viewingOrder.items.map((item, idx) => {
                    const unitVal =
                      viewingOrder.paymentMethod === 'pix'
                        ? item.unitPixPrice
                        : item.unitBasePrice;
                    return (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">{item.name}</div>
                          <div className="text-[11px] font-mono-num text-slate-400">
                            SKU: {item.sku} · Qtd: {item.quantity} × {formatBRL(unitVal)}
                          </div>
                        </div>
                        <div className="font-mono-num font-bold text-sm text-white shrink-0">
                          {formatBRL(unitVal * item.quantity)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial + Shipping + NF-e Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded bg-[#0B0D10] border border-[#272D38] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-display font-bold text-sm uppercase text-white">
                    <FileText className="w-4 h-4 text-[#00E676]" />
                    <span>Dados Fiscais (NF-e) e Entrega</span>
                  </div>
                  <p className="text-slate-300">
                    <strong className="text-white">{viewingOrder.customer.fullName}</strong>
                    <br />
                    CPF/CNPJ: <span className="font-mono-num">{viewingOrder.customer.document}</span>
                    <br />
                    E-mail NF-e: {viewingOrder.customer.email}
                    <br />
                    {viewingOrder.customer.street}, {viewingOrder.customer.number}{' '}
                    {viewingOrder.customer.complement && `(${viewingOrder.customer.complement})`}
                    <br />
                    {viewingOrder.customer.neighborhood} · {viewingOrder.customer.city}/
                    {viewingOrder.customer.state} · CEP {viewingOrder.customer.cep}
                  </p>
                  <div className="pt-2 border-t border-[#272D38] space-y-1">
                    <div>
                      <span className="text-slate-400">Situação NF-e:</span>{' '}
                      {viewingOrder.nfeInfo ? (
                        /^https?:\/\//i.test(viewingOrder.nfeInfo) ? (
                          <a
                            href={viewingOrder.nfeInfo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00E676] font-semibold underline"
                          >
                            Consultar Nota Fiscal
                          </a>
                        ) : (
                          <strong className="text-[#00E676]">{viewingOrder.nfeInfo}</strong>
                        )
                      ) : (
                        <span className="text-slate-400">Em processamento</span>
                      )}
                    </div>
                    {viewingOrder.trackingCode && (
                      <div>
                        <span className="text-slate-400">Rastreio:</span>{' '}
                        <strong className="font-mono-num text-[#FF6500]">
                          {viewingOrder.trackingCode}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded bg-[#0B0D10] border border-[#272D38] space-y-1.5 font-mono-num">
                  <div className="font-display font-bold text-sm uppercase text-white">
                    Resumo Financeiro
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Pagamento:</span>
                    <span className="text-white">{getPaymentLabel(viewingOrder)}</span>
                  </div>
                  {viewingOrder.paymentMethod === 'pix' && (
                    <div className="flex justify-between text-slate-400">
                      <span>TxID PIX:</span>
                      <span className="text-white">{viewingOrder.id}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-300">
                    <span>Frete ({viewingOrder.shippingLabel}):</span>
                    <span>
                      {viewingOrder.shippingCost === 0
                        ? 'GRÁTIS'
                        : formatBRL(viewingOrder.shippingCost)}
                    </span>
                  </div>
                  {viewingOrder.discountCouponAmount > 0 && (
                    <div className="flex justify-between text-[#00E676]">
                      <span>Cupom ({viewingOrder.discountCouponCode}):</span>
                      <span>-{formatBRL(viewingOrder.discountCouponAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-[#00E676] pt-2 border-t border-[#272D38]">
                    <span>Total Pago:</span>
                    <span>{formatBRL(viewingOrder.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RASTREAR PEDIDO */}
      {trackingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setTrackingOrder(null)}
        >
          <div
            className="w-full max-w-lg bg-[#161A20] border border-[#272D38] rounded-md shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#272D38] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#00E676]" />
                <h3 className="font-display font-extrabold text-lg uppercase tracking-wider text-white">
                  Rastreamento — Pedido #{trackingOrder.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTrackingOrder(null)}
                className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded bg-[#0B0D10] border border-[#272D38] space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Modalidade de Envio
                </div>
                <div className="text-sm font-semibold text-white">
                  {trackingOrder.shippingLabel}
                </div>
                <div className="text-xs text-[#00E676] font-semibold">
                  Status Atual: {trackingOrder.status}
                </div>
              </div>

              {trackingOrder.trackingCode ? (
                <div className="p-4 rounded bg-[#0B0D10] border border-[#00E676]/50 space-y-3">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">
                      Código de Rastreamento
                    </span>
                    <div className="mt-1 font-mono-num font-bold text-xl text-[#00E676] tracking-wider">
                      {trackingOrder.trackingCode}
                    </div>
                  </div>
                  <a
                    href="https://rastreamento.correios.com.br/app/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-10 rounded bg-[#00E676] hover:bg-[#00cf6a] font-display font-bold text-xs uppercase tracking-wider text-[#0B0D10] flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Acompanhar na Transportadora / Correios</span>
                  </a>
                </div>
              ) : (
                <div className="p-4 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    O código de rastreamento será disponibilizado aqui assim que o pedido for despachado pelo centro de distribuição BTHTECH.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
