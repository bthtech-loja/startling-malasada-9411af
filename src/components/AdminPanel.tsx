import { useEffect, useRef, useState } from 'react';
import { acceptInvite, getUser, handleAuthCallback, login } from '@netlify/identity';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Package,
  Paperclip,
  Percent,
  Plus,
  Save,
  Send,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  CardBrand,
  CardGatewayProvider,
  Coupon,
  Department,
  EmailTemplateConfig,
  EmailTemplateKey,
  OrderStatus,
  Product,
  ProductCategory,
  RegionKey,
  StoreState,
  TopPromoSpeed,
} from '../types/store';
import { DEPARTMENTS } from './Header';
import { CardBrandsStrip } from './CardBrandsStrip';
import {
  calcMarkupPercent,
  calcPixPrice,
  calcProfitAmount,
  formatBRL,
  formatNfeClipboardText,
} from '../utils/formatters';
import {
  getDefaultTemplateHtmlWithVars,
  PdfEmailAttachment,
  renderCustomHtmlPreview,
  resolveEmailTemplate,
  sendOrderTemplateEmail,
  sendOrderUpdateEmail,
  sendTestEmailForTemplate,
} from '../utils/emailService';
import { ResilientImage } from './ResilientImage';
import { StudioProductImage } from './StudioProductImage';
import {
  CAMPAIGN_ENDPOINT, CAMPAIGN_INTERVAL_MS, CAMPAIGN_LIMIT, PROMOTION_VARIABLES,
  getPromotionDestination, renderPromotionEmail, selectPromotionRecipients,
  type CampaignQuota, type PromotionAudience,
} from '../utils/promotionEmail';

interface AdminPanelProps {
  store: StoreState;
  setStore: React.Dispatch<React.SetStateAction<StoreState>>;
  onSaveChanges: () => { ok: boolean; message: string };
  onUpsertProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onUpdateOrderTracking: (orderId: string, trackingCode: string) => void;
  onUpdateOrderFulfillment: (
    orderId: string,
    updates: { status: OrderStatus; trackingCode: string; nfeInfo: string }
  ) => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => { ok: boolean; message: string };
  onExitAdmin: () => void;
}

type AdminTab = 'visual' | 'products' | 'coupons' | 'payments' | 'shipping' | 'fiscal_orders';

const CATEGORIES: ProductCategory[] = [
  'Mouses',
  'Teclados',
  'Headsets',
  'Combos Gamer',
  'SSDs & Memórias',
  'Periféricos',
];

const REGION_LABELS: Record<RegionKey, string> = {
  sul: 'Sul (PR / SC / RS)',
  sudeste: 'Sudeste (SP / RJ / MG / ES)',
  centroOeste: 'Centro-Oeste (DF / GO / MT / MS)',
  nordeste: 'Nordeste',
  norte: 'Norte',
};

const ORDER_STATUSES: OrderStatus[] = [
  'Pedido Realizado',
  'Pagamento Aprovado',
  'Em Separação',
  'Produto Enviado',
  'Produto Entregue',
  'Cancelado',
];

function readImageFileAsDataUrl(file: File, callback: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      callback(reader.result);
    }
  };
  reader.readAsDataURL(file);
}

function readPdfFileAsBase64(
  file: File,
  callback: (attachment: PdfEmailAttachment) => void
) {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      const cleanBase64 = reader.result.replace(/^data:[^;]+;base64,/, '');
      callback({
        fileName: file.name,
        base64: cleanBase64,
      });
    }
  };
  reader.readAsDataURL(file);
}

export function AdminPanel({
  store,
  setStore: setStoreProp,
  onSaveChanges,
  onUpsertProduct,
  onDeleteProduct,
  onUpdateOrderStatus: _onUpdateOrderStatus,
  onUpdateOrderTracking: _onUpdateOrderTracking,
  onUpdateOrderFulfillment,
  onExportJson,
  onImportJson,
  onExitAdmin,
}: AdminPanelProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('visual');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Product Editor state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // New Coupon state
  const [newCoupon, setNewCoupon] = useState<Omit<Coupon, 'id'>>({
    code: '',
    type: 'percent',
    value: 10,
    minOrderValue: 0,
    active: true,
  });

  // Password Change state
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');

  // Clipboard order feedback & order fulfillment drafts
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, OrderStatus>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [nfeDrafts, setNfeDrafts] = useState<Record<string, string>>({});
  const [nfePdfDrafts, setNfePdfDrafts] = useState<Record<string, PdfEmailAttachment>>({});
  const [notifyingOrderId, setNotifyingOrderId] = useState<string | null>(null);
  const [orderEmailFeedback, setOrderEmailFeedback] = useState<
    Record<string, { ok: boolean; msg: string }>
  >({});

  // Email templates & test dispatch state
  const [activeEmailSubTab, setActiveEmailSubTab] =
    useState<EmailTemplateKey | 'promotion'>('verification');
  const [audience, setAudience] = useState<PromotionAudience>('all');
  const [campaignQuota, setCampaignQuota] = useState<CampaignQuota | null>(null);
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignEmail, setCampaignEmail] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [campaignBusy, setCampaignBusy] = useState(false);
  const campaignLock = useRef(false);

  async function readCampaignQuota() {
    await getUser();
    const response = await fetch(CAMPAIGN_ENDPOINT, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setCampaignQuota(data.quota);
    return data.quota as CampaignQuota;
  }

  useEffect(() => {
    void handleAuthCallback().then((callback) => {
      if (callback?.type === 'invite' && callback.token) setInviteToken(callback.token);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeEmailSubTab === 'promotion') {
      void readCampaignQuota().catch(() => setCampaignQuota(null));
    }
  }, [activeEmailSubTab]);

  async function launchPromotion() {
    if (campaignLock.current) return;
    const promotion = store.email.promotion;
    const destination = getPromotionDestination(promotion.destinationUrl, location.origin);
    const recipients = selectPromotionRecipients(store.customers, store.orders, audience);
    if (!destination || !promotion.subject.trim() || !promotion.title.trim() || !promotion.message.trim() ||
        (promotion.editorMode === 'html' && !promotion.customHtml.trim()) || !store.email.gmailScriptUrl.trim()) {
      setCampaignMessage('Preencha os campos da campanha e confira a URL do disparador.');
      return;
    }
    campaignLock.current = true;
    setCampaignBusy(true);
    let sent = 0;
    try {
      const quota = await readCampaignQuota();
      const batch = recipients.slice(0, quota.remaining);
      if (!batch.length) throw new Error('Nenhum destinatário elegível ou vagas disponíveis para envio.');
      for (const recipient of batch) {
        if (sent) await new Promise((resolve) => setTimeout(resolve, CAMPAIGN_INTERVAL_MS));
        const email = renderPromotionEmail(promotion, recipient.name, destination);
        const response = await fetch(CAMPAIGN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptUrl: store.email.gmailScriptUrl, to: recipient.email, ...email }),
        });
        const data = await response.json();
        if (data.quota) setCampaignQuota(data.quota);
        if (!response.ok) throw new Error(data.error);
        sent += 1;
        setCampaignMessage(`Envios confirmados nesta campanha: ${sent} de ${batch.length}.`);
      }
    } catch (error) {
      setCampaignMessage(`${sent} envio(s) confirmado(s). ${error instanceof Error ? error.message : 'Não foi possível continuar o disparo.'}`);
    } finally {
      campaignLock.current = false;
      setCampaignBusy(false);
    }
  }
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [testEmailTarget, setTestEmailTarget] = useState<string>(
    () => store.email?.officialEmail || ''
  );
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailFeedbackByTab, setTestEmailFeedbackByTab] = useState<
    Partial<Record<EmailTemplateKey, { ok: boolean; msg: string }>>
  >({});

  const accentColor = store.visual.accentColor || '#FF6500';

  const setStore: React.Dispatch<React.SetStateAction<StoreState>> = (action) => {
    setStoreProp(action);
    setHasUnsavedChanges(true);
    setJustSaved(false);
  };

  const notify = (msg: string, ok = true) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveChanges = () => {
    const result = onSaveChanges();
    if (result.ok) {
      setHasUnsavedChanges(false);
      setJustSaved(true);
      setLastSavedAt(new Date().toLocaleTimeString('pt-BR'));
      setTimeout(() => setJustSaved(false), 3000);
    }
    notify(result.message, result.ok);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      loginUser.trim().toLowerCase() === store.fiscal.adminUsername.toLowerCase() &&
      loginPass === store.fiscal.adminPassword
    ) {
      setAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Usuário ou senha inválidos. Tente novamente.');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const result = onImportJson(reader.result);
        notify(result.message, result.ok);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // LOGIN GATE
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0B0D10] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#161A20] border border-[#272D38] rounded-md p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded flex items-center justify-center text-white"
                style={{ backgroundColor: accentColor }}
              >
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display font-extrabold text-2xl uppercase tracking-wider text-white leading-none">
                  Painel Admin BTHTECH
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Acesso restrito para gerenciamento da loja
                </p>
              </div>
            </div>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded bg-red-950/60 border border-red-500/60 text-xs text-red-200">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-user" className="block text-xs font-semibold text-slate-300 mb-1">
                Usuário
              </label>
              <input
                id="admin-user"
                type="text"
                required
                autoFocus
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="bthtech"
                className="w-full h-11 px-3.5 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
              />
            </div>

            <div>
              <label htmlFor="admin-pass" className="block text-xs font-semibold text-slate-300 mb-1">
                Senha
              </label>
              <input
                id="admin-pass"
                type="password"
                required
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white focus:outline-none focus:border-white/60"
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded font-display font-extrabold text-base uppercase tracking-wider text-white transition-opacity hover:opacity-95"
              style={{ backgroundColor: accentColor }}
            >
              Entrar no Painel
            </button>
          </form>

          <button
            type="button"
            onClick={onExitAdmin}
            className="mt-4 w-full h-10 rounded border border-[#272D38] text-xs font-medium text-slate-300 hover:text-white flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a Loja</span>
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'visual', label: '1. Banners e Visual', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'products', label: '2. Produtos e Estoque', icon: <Package className="w-4 h-4" /> },
    { id: 'coupons', label: '3. Descontos e Cupons', icon: <Percent className="w-4 h-4" /> },
    { id: 'payments', label: '4. Pagamentos e Parcelamento', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'shipping', label: '5. Frete e Entregas', icon: <Truck className="w-4 h-4" /> },
    { id: 'fiscal_orders', label: `6. Dados Fiscais, E-mail e Pedidos (${store.orders.length})`, icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0B0D10] text-white flex flex-col">
      {/* Admin Top Bar with JSON Backup Export/Import */}
      <header className="sticky top-0 z-40 bg-[#161A20] border-b border-[#272D38] px-4 sm:px-6 py-3">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExitAdmin}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-slate-500 text-xs font-semibold text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ver Loja</span>
            </button>
            <div>
              <h1 className="font-display font-extrabold text-xl uppercase tracking-wider text-white leading-none">
                Admin BTHTECH
              </h1>
              <span className="text-[11px] text-slate-400">
                {hasUnsavedChanges
                  ? 'Alterações pendentes — clique em Salvar Alterações'
                  : lastSavedAt
                  ? `Salvo às ${lastSavedAt}`
                  : 'Persistência local automática (Netlify Ready)'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveChanges}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded font-display font-bold text-xs sm:text-sm uppercase tracking-wider transition-all ${
                justSaved
                  ? 'bg-[#00E676] text-[#0B0D10]'
                  : 'text-white hover:opacity-95'
              }`}
              style={!justSaved ? { backgroundColor: accentColor } : undefined}
            >
              {justSaved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{justSaved ? 'Alterações Salvas!' : 'Salvar Alterações'}</span>
              {hasUnsavedChanges && !justSaved && (
                <span
                  className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse"
                  aria-hidden="true"
                />
              )}
            </button>

            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-[#00E676] text-xs font-semibold text-[#00E676] transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Configurações (Backup JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-white/60 text-xs font-semibold text-white transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Importar Configurações (JSON)</span>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setAuthenticated(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#272D38] hover:bg-red-900/60 text-xs font-semibold text-slate-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast Feedback */}
      {toast && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div
            className={`px-4 py-2.5 rounded border text-xs font-semibold ${
              toast.ok
                ? 'bg-[#00E676]/15 border-[#00E676]/50 text-[#00E676]'
                : 'bg-red-950/70 border-red-500/60 text-red-200'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <nav className="bg-[#161A20]/60 border-b border-[#272D38]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2.5">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-[#161A20]'
                }`}
                style={active ? { backgroundColor: accentColor } : undefined}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6">
        {/* TAB 1: BANNERS E VISUAL */}
        {activeTab === 'visual' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Brand, Colors, Top Bar */}
              <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
                <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                  Identidade Visual e Barra Superior
                </h2>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Logo da Loja (URL ou Upload de Imagem)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={store.visual.logoUrl}
                      onChange={(e) =>
                        setStore((p) => ({ ...p, visual: { ...p.visual, logoUrl: e.target.value } }))
                      }
                      placeholder="Deixe vazio para usar o logotipo tipográfico BTHTECH"
                      className="flex-1 h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                    <label className="px-3 h-10 rounded bg-[#272D38] hover:bg-[#353D4C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            readImageFileAsDataUrl(f, (dataUrl) => {
                              setStore((p) => ({
                                ...p,
                                visual: { ...p.visual, logoUrl: dataUrl },
                              }));
                              notify('Logo atualizada!');
                            });
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Avisos da Barra Superior (Letreiro)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setStore((p) => {
                          const currentNotices = Array.isArray(p.visual.topPromoNotices)
                            ? p.visual.topPromoNotices
                            : p.visual.topPromoText
                            ? p.visual.topPromoText.split('•').map((s) => s.trim()).filter(Boolean)
                            : [];
                          const nextNotices = [...currentNotices, 'NOVA OFERTA BTHTECH'];
                          return {
                            ...p,
                            visual: {
                              ...p.visual,
                              topPromoNotices: nextNotices,
                              topPromoText: nextNotices.filter(Boolean).join(' • '),
                            },
                          };
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-display font-bold uppercase tracking-wider text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Aviso</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(Array.isArray(store.visual.topPromoNotices)
                      ? store.visual.topPromoNotices
                      : []
                    ).map((notice, nIdx) => (
                      <div key={nIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={notice}
                          onChange={(e) => {
                            const updated = [...(store.visual.topPromoNotices || [])];
                            updated[nIdx] = e.target.value;
                            setStore((p) => ({
                              ...p,
                              visual: {
                                ...p.visual,
                                topPromoNotices: updated,
                                topPromoText: updated.map((s) => s.trim()).filter(Boolean).join(' • '),
                              },
                            }));
                          }}
                          placeholder={`Frase de aviso ${nIdx + 1}`}
                          className="flex-1 h-9 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (store.visual.topPromoNotices || []).filter(
                              (_, i) => i !== nIdx
                            );
                            setStore((p) => ({
                              ...p,
                              visual: {
                                ...p.visual,
                                topPromoNotices: updated,
                                topPromoText: updated.map((s) => s.trim()).filter(Boolean).join(' • '),
                              },
                            }));
                            notify('Aviso removido da barra superior.');
                          }}
                          className="h-9 w-9 rounded bg-[#0B0D10] border border-[#272D38] hover:border-red-500 text-red-400 flex items-center justify-center shrink-0"
                          title="Excluir aviso"
                          aria-label={`Excluir aviso ${nIdx + 1}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label
                      htmlFor="admin-marquee-speed"
                      className="block text-xs font-semibold text-slate-300 mb-1"
                    >
                      Velocidade do Letreiro
                    </label>
                    <select
                      id="admin-marquee-speed"
                      value={store.visual.topPromoSpeed || 'normal'}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          visual: {
                            ...p.visual,
                            topPromoSpeed: e.target.value as TopPromoSpeed,
                          },
                        }))
                      }
                      className="w-full sm:w-56 h-9 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    >
                      <option value="slow">Lento</option>
                      <option value="normal">Normal</option>
                      <option value="fast">Rápido</option>
                      <option value="fixed">Fixo / Parado</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Cor Principal da Loja (Botões e Destaques)
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="color"
                      value={store.visual.accentColor}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          visual: { ...p.visual, accentColor: e.target.value },
                        }))
                      }
                      className="w-11 h-10 rounded bg-[#0B0D10] border border-[#272D38] cursor-pointer p-1"
                    />
                    <input
                      type="text"
                      value={store.visual.accentColor}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          visual: { ...p.visual, accentColor: e.target.value },
                        }))
                      }
                      className="w-28 h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num uppercase text-white"
                    />
                    {['#FF6500', '#E11D48', '#2563EB', '#059669', '#D97706'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setStore((p) => ({
                            ...p,
                            visual: { ...p.visual, accentColor: preset },
                          }))
                        }
                        className="w-7 h-7 rounded border border-white/20"
                        style={{ backgroundColor: preset }}
                        title={`Usar cor ${preset}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Flash Sale Timer & Mobile Banner */}
              <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
                <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                  Cronômetro de Ofertas Relâmpago & Banner Mobile
                </h2>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={store.visual.flashSaleEnabled}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        visual: { ...p.visual, flashSaleEnabled: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#FF6500]"
                  />
                  <span className="text-sm font-semibold text-white">
                    Exibir faixa e cronômetro de Ofertas Relâmpago na vitrine
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Título da Faixa Relâmpago
                  </label>
                  <input
                    type="text"
                    value={store.visual.flashSaleTitle}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        visual: { ...p.visual, flashSaleTitle: e.target.value },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Reiniciar Duração do Cronômetro
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[6, 12, 24, 48].map((hours) => (
                      <button
                        key={hours}
                        type="button"
                        onClick={() => {
                          const end = new Date(Date.now() + hours * 3600 * 1000).toISOString();
                          setStore((p) => ({
                            ...p,
                            visual: { ...p.visual, flashSaleEndTime: end },
                          }));
                          notify(`Cronômetro ajustado para ${hours} horas a partir de agora.`);
                        }}
                        className="px-3 py-1.5 rounded bg-[#0B0D10] border border-[#272D38] hover:border-white/50 text-xs font-mono-num"
                      >
                        +{hours} horas
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Banner Mobile (Exibido em celulares no Slide 1)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={store.visual.mobileBannerUrl}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          visual: { ...p.visual, mobileBannerUrl: e.target.value },
                        }))
                      }
                      className="flex-1 h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                    <label className="px-3 h-10 rounded bg-[#272D38] hover:bg-[#353D4C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            readImageFileAsDataUrl(f, (dataUrl) => {
                              setStore((p) => ({
                                ...p,
                                visual: { ...p.visual, mobileBannerUrl: dataUrl },
                              }));
                              notify('Banner mobile atualizado!');
                            });
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Unlimited Dynamic Rotating Banners */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#272D38] pb-3">
                <div>
                  <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white">
                    Banners Principais / Slides Rotativos ({store.visual.banners.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Adicione quantos slides desejar. Todos os slides marcados como ativos aparecem no carrossel da loja.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newSlide = {
                      id: `banner-${Date.now()}`,
                      title: 'NOVA PROMOÇÃO BTHTECH',
                      subtitle: 'Hardware e periféricos gamer com envio rápido e garantia.',
                      ctaLabel: 'VER OFERTAS',
                      targetDepartment: 'OFERTAS RELÂMPAGO' as Department,
                      linkUrl: '',
                      imageUrl: '/src/assets/images/banner_setup_gamer_1795713393664.jpg',
                      mobileImageUrl: '',
                      active: true,
                    };
                    setStore((p) => ({
                      ...p,
                      visual: {
                        ...p.visual,
                        banners: [...p.visual.banners, newSlide],
                      },
                    }));
                    notify('Novo slide adicionado! Configure as imagens e textos abaixo.');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded font-display font-bold text-xs sm:text-sm uppercase tracking-wider text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Novo Slide / Banner</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {store.visual.banners.map((banner, idx) => (
                  <div
                    key={banner.id}
                    className="p-4 rounded bg-[#0B0D10] border border-[#272D38] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-sm uppercase text-white">
                        Slide {idx + 1}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Reorder Arrows */}
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              const updated = [...store.visual.banners];
                              const tmp = updated[idx - 1];
                              updated[idx - 1] = updated[idx];
                              updated[idx] = tmp;
                              setStore((p) => ({
                                ...p,
                                visual: { ...p.visual, banners: updated },
                              }));
                            }}
                            className="p-1 rounded bg-[#161A20] border border-[#272D38] text-slate-300 hover:text-white disabled:opacity-30"
                            title="Mover slide para antes"
                            aria-label={`Mover slide ${idx + 1} para antes`}
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === store.visual.banners.length - 1}
                            onClick={() => {
                              const updated = [...store.visual.banners];
                              const tmp = updated[idx + 1];
                              updated[idx + 1] = updated[idx];
                              updated[idx] = tmp;
                              setStore((p) => ({
                                ...p,
                                visual: { ...p.visual, banners: updated },
                              }));
                            }}
                            className="p-1 rounded bg-[#161A20] border border-[#272D38] text-slate-300 hover:text-white disabled:opacity-30"
                            title="Mover slide para depois"
                            aria-label={`Mover slide ${idx + 1} para depois`}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={banner.active}
                            onChange={(e) => {
                              const updated = [...store.visual.banners];
                              updated[idx] = { ...banner, active: e.target.checked };
                              setStore((p) => ({
                                ...p,
                                visual: { ...p.visual, banners: updated },
                              }));
                            }}
                            className="accent-[#FF6500]"
                          />
                          <span>Ativo</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            if (store.visual.banners.length <= 1) {
                              notify('Mantenha pelo menos 1 slide no carrossel.', false);
                              return;
                            }
                            const updated = store.visual.banners.filter((b) => b.id !== banner.id);
                            setStore((p) => ({
                              ...p,
                              visual: { ...p.visual, banners: updated },
                            }));
                            notify(`Slide ${idx + 1} excluído.`);
                          }}
                          className="p-1 rounded bg-[#161A20] border border-[#272D38] hover:border-red-500 text-red-400"
                          title="Excluir Slide"
                          aria-label={`Excluir slide ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="h-24 rounded overflow-hidden bg-[#161A20] border border-[#272D38]">
                      <ResilientImage src={banner.imageUrl} alt={banner.title} />
                    </div>

                    {/* Desktop Image */}
                    <div className="space-y-1">
                      <span className="block text-[11px] text-slate-400">
                        Imagem Desktop (URL ou Upload)
                      </span>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={banner.imageUrl}
                          onChange={(e) => {
                            const updated = [...store.visual.banners];
                            updated[idx] = { ...banner, imageUrl: e.target.value };
                            setStore((p) => ({
                              ...p,
                              visual: { ...p.visual, banners: updated },
                            }));
                          }}
                          placeholder="URL da imagem Desktop"
                          className="flex-1 h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                        />
                        <label className="px-2.5 h-9 rounded bg-[#272D38] hover:bg-[#353D4C] text-xs flex items-center cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                readImageFileAsDataUrl(f, (dataUrl) => {
                                  const updated = [...store.visual.banners];
                                  updated[idx] = { ...banner, imageUrl: dataUrl };
                                  setStore((p) => ({
                                    ...p,
                                    visual: { ...p.visual, banners: updated },
                                  }));
                                  notify(`Imagem Desktop do Slide ${idx + 1} atualizada!`);
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Mobile Image (Optional) */}
                    <div className="space-y-1">
                      <span className="block text-[11px] text-slate-400">
                        Imagem Mobile (Opcional — URL ou Upload)
                      </span>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={banner.mobileImageUrl || ''}
                          onChange={(e) => {
                            const updated = [...store.visual.banners];
                            updated[idx] = { ...banner, mobileImageUrl: e.target.value };
                            setStore((p) => ({
                              ...p,
                              visual: { ...p.visual, banners: updated },
                            }));
                          }}
                          placeholder="Opcional (usa Desktop se vazio)"
                          className="flex-1 h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                        />
                        <label className="px-2.5 h-9 rounded bg-[#272D38] hover:bg-[#353D4C] text-xs flex items-center cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                readImageFileAsDataUrl(f, (dataUrl) => {
                                  const updated = [...store.visual.banners];
                                  updated[idx] = { ...banner, mobileImageUrl: dataUrl };
                                  setStore((p) => ({
                                    ...p,
                                    visual: { ...p.visual, banners: updated },
                                  }));
                                  notify(`Imagem Mobile do Slide ${idx + 1} atualizada!`);
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={banner.title}
                      onChange={(e) => {
                        const updated = [...store.visual.banners];
                        updated[idx] = { ...banner, title: e.target.value };
                        setStore((p) => ({ ...p, visual: { ...p.visual, banners: updated } }));
                      }}
                      placeholder="Título do Banner"
                      className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                    />

                    <input
                      type="text"
                      value={banner.subtitle}
                      onChange={(e) => {
                        const updated = [...store.visual.banners];
                        updated[idx] = { ...banner, subtitle: e.target.value };
                        setStore((p) => ({ ...p, visual: { ...p.visual, banners: updated } }));
                      }}
                      placeholder="Subtítulo"
                      className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={banner.ctaLabel}
                        onChange={(e) => {
                          const updated = [...store.visual.banners];
                          updated[idx] = { ...banner, ctaLabel: e.target.value };
                          setStore((p) => ({ ...p, visual: { ...p.visual, banners: updated } }));
                        }}
                        placeholder="Texto Botão"
                        className="h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                      />
                      <select
                        value={banner.targetDepartment}
                        onChange={(e) => {
                          const updated = [...store.visual.banners];
                          updated[idx] = {
                            ...banner,
                            targetDepartment: e.target.value as Department,
                          };
                          setStore((p) => ({ ...p, visual: { ...p.visual, banners: updated } }));
                        }}
                        className="h-9 px-2 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      value={banner.linkUrl || ''}
                      onChange={(e) => {
                        const updated = [...store.visual.banners];
                        updated[idx] = { ...banner, linkUrl: e.target.value };
                        setStore((p) => ({ ...p, visual: { ...p.visual, banners: updated } }));
                      }}
                      placeholder="Link de Destino URL (opcional — ex: https://...)"
                      className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRODUTOS E ESTOQUE */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white">
                  Catálogo de Produtos ({store.products.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Os preços no PIX são calculados automaticamente com {store.payment.pixDiscountPercent}% de desconto sobre o Preço Base.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingProduct({
                    id: `prod-${Date.now()}`,
                    sku: `BTH-${Math.floor(1000 + Math.random() * 9000)}`,
                    name: '',
                    category: 'Periféricos',
                    costPrice: 90.00,
                    basePrice: 149.90,
                    weightGrams: 400,
                    stock: 10,
                    imageUrl: '',
                    description: '',
                    externalCheckoutUrl: '',
                    isFlashDeal: false,
                    isBestSeller: false,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded font-display font-bold text-sm uppercase tracking-wider text-white"
                style={{ backgroundColor: accentColor }}
              >
                <Plus className="w-4 h-4" />
                <span>Novo Produto</span>
              </button>
            </div>

            {/* Product Editor Modal */}
            {editingProduct && (
              <div className="bg-[#161A20] border border-white/30 rounded-md p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#272D38] pb-2">
                  <h3 className="font-display font-bold text-lg uppercase text-white">
                    {store.products.some((p) => p.id === editingProduct.id)
                      ? 'Editar Produto'
                      : 'Cadastrar Novo Produto'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-300 mb-1">Nome do Produto *</label>
                    <input
                      type="text"
                      value={editingProduct.name}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, name: e.target.value })
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">SKU *</label>
                    <input
                      type="text"
                      value={editingProduct.sku}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, sku: e.target.value })
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Categoria</label>
                    <select
                      value={editingProduct.category}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          category: e.target.value as ProductCategory,
                        })
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm text-white"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Estoque</label>
                    <input
                      type="number"
                      value={editingProduct.stock}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          stock: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Peso (gramas)</label>
                    <input
                      type="number"
                      min={10}
                      step={10}
                      value={editingProduct.weightGrams || 400}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          weightGrams: Math.max(10, Number(e.target.value)),
                        })
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                    />
                  </div>

                  {/* 4-Column Pricing Row: Cost, Base Sale, Auto Margin %, Auto PIX */}
                  <div className="md:col-span-3 p-3.5 rounded bg-[#0B0D10]/70 border border-[#272D38] space-y-2.5">
                    <div className="text-[11px] font-display font-bold uppercase tracking-wider text-slate-300">
                      Precificação, Margem &amp; PIX
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Preço de Custo (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={editingProduct.costPrice ?? 0}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              costPrice: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                        />
                        <span className="block text-[11px] text-slate-500 mt-1">
                          Dado interno (oculto na loja)
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Preço de Venda / Base (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={editingProduct.basePrice}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              basePrice: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                        />
                        <span className="block text-[11px] text-slate-500 mt-1">
                          Base do parcelamento no cartão
                        </span>
                      </div>

                      {(() => {
                        const cost = editingProduct.costPrice || 0;
                        const sale = editingProduct.basePrice || 0;
                        const markup = calcMarkupPercent(cost, sale);
                        const profit = calcProfitAmount(cost, sale);
                        const isNeg = profit < 0;
                        return (
                          <div>
                            <label className="block text-xs text-slate-300 mb-1">
                              Margem (%) — Automático
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={
                                cost > 0
                                  ? `Markup: ${markup >= 0 ? '+' : ''}${markup}% | Lucro: ${formatBRL(profit)}`
                                  : `Markup: — | Lucro: ${formatBRL(profit)}`
                              }
                              className={`w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num font-bold cursor-default ${
                                isNeg ? 'text-red-400' : 'text-white'
                              }`}
                            />
                            <span className="block text-[11px] text-slate-400 mt-1">
                              Sobre o Preço de Venda
                            </span>
                          </div>
                        );
                      })()}

                      {(() => {
                        const cost = editingProduct.costPrice || 0;
                        const pixVal = calcPixPrice(
                          editingProduct.basePrice || 0,
                          store.payment.pixDiscountPercent
                        );
                        const pixProfit = calcProfitAmount(cost, pixVal);
                        const isNeg = pixProfit < 0;
                        return (
                          <div>
                            <label className="block text-xs text-slate-300 mb-1">
                              Preço no PIX (R$) — Automático
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={formatBRL(pixVal)}
                              className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#00E676]/40 text-sm font-mono-num font-bold text-[#00E676] cursor-default"
                            />
                            <span
                              className={`block text-[11px] font-mono-num mt-1 ${
                                isNeg ? 'text-red-400' : 'text-[#00E676]'
                              }`}
                            >
                              Lucro líquido PIX: {formatBRL(pixProfit)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        URL da Foto ou Upload (Suporta PNG Transparente no Estúdio)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingProduct.imageUrl}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, imageUrl: e.target.value })
                          }
                          placeholder="/src/assets/images/... ou upload PNG sem fundo"
                          className="flex-1 h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                        />
                        <label className="px-3 h-10 rounded bg-[#272D38] hover:bg-[#353D4C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                readImageFileAsDataUrl(f, (dataUrl) =>
                                  setEditingProduct({ ...editingProduct, imageUrl: dataUrl })
                                );
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <span className="block text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
                        Pré-visualização no Cenário de Estúdio (Vitrine)
                      </span>
                      <div className="w-full max-w-[300px] h-[205px] rounded-md border border-[#272D38] overflow-hidden">
                        <StudioProductImage
                          src={editingProduct.imageUrl}
                          alt={editingProduct.name || 'Pré-visualização do produto'}
                          fallbackLabel={editingProduct.name || 'Envie um PNG ou URL'}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs text-slate-300 mb-1">
                      Descrição Técnica
                    </label>
                    <textarea
                      rows={3}
                      value={editingProduct.description}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, description: e.target.value })
                      }
                      className="w-full p-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-300 mb-1">
                      Link de Checkout Externo (InfinitePay / Mercado Pago - Opcional)
                    </label>
                    <input
                      type="url"
                      value={editingProduct.externalCheckoutUrl || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          externalCheckoutUrl: e.target.value,
                        })
                      }
                      placeholder="https://link.mercadopago.com.br/..."
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center gap-5 pt-4">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingProduct.isFlashDeal}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            isFlashDeal: e.target.checked,
                          })
                        }
                        className="accent-[#FF6500]"
                      />
                      <span>Oferta Relâmpago</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingProduct.isBestSeller}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            isBestSeller: e.target.checked,
                          })
                        }
                        className="accent-[#00E676]"
                      />
                      <span>Mais Vendido</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-4 py-2 rounded border border-[#272D38] text-xs font-semibold text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingProduct.name.trim()) {
                        notify('Informe o nome do produto.', false);
                        return;
                      }
                      onUpsertProduct(editingProduct);
                      setEditingProduct(null);
                      notify('Produto salvo no catálogo!');
                    }}
                    className="px-5 py-2 rounded font-display font-bold text-sm uppercase tracking-wider text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    Salvar Produto
                  </button>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[960px]">
                <thead>
                  <tr className="border-b border-[#272D38] text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-3">Categoria</th>
                    <th className="py-3 px-3">Custo</th>
                    <th className="py-3 px-3">Preço Venda</th>
                    <th className="py-3 px-3">Margem %</th>
                    <th className="py-3 px-3">Preço PIX</th>
                    <th className="py-3 px-3">Estoque</th>
                    <th className="py-3 px-3">Destaques</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#272D38] text-xs">
                  {store.products.map((prod) => {
                    const cost = prod.costPrice || 0;
                    const markup = calcMarkupPercent(cost, prod.basePrice);
                    const profit = calcProfitAmount(cost, prod.basePrice);
                    const pixVal = calcPixPrice(prod.basePrice, store.payment.pixDiscountPercent);
                    const pixProfit = calcProfitAmount(cost, pixVal);
                    return (
                    <tr key={prod.id} className="hover:bg-[#0B0D10]/40">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-10 rounded bg-[#0B0D10] overflow-hidden shrink-0 border border-[#272D38]">
                            <ResilientImage src={prod.imageUrl} alt={prod.name} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white line-clamp-1 max-w-xs">
                              {prod.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono-num">
                              SKU: {prod.sku}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{prod.category}</td>
                      <td className="py-3 px-3 font-mono-num text-slate-300">
                        {formatBRL(cost)}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-white font-semibold">
                        {formatBRL(prod.basePrice)}
                      </td>
                      <td className="py-3 px-3 font-mono-num">
                        <div className={profit < 0 ? 'text-red-400 font-semibold' : 'text-white font-semibold'}>
                          {cost > 0 ? `${markup >= 0 ? '+' : ''}${markup}%` : '—'}
                        </div>
                        <div className={`text-[11px] ${profit < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          Lucro: {formatBRL(profit)}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-num">
                        <div className="text-[#00E676] font-bold">
                          {formatBRL(pixVal)}
                        </div>
                        <div className={`text-[11px] ${pixProfit < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          Líq: {formatBRL(pixProfit)}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-num">
                        <div>{prod.stock} un</div>
                        <div className="text-[11px] text-slate-400">{prod.weightGrams || 400}g</div>
                      </td>
                      <td className="py-3 px-3 text-[11px]">
                        {prod.isFlashDeal && (
                          <span className="text-[#FF6500] font-semibold mr-2">Relâmpago</span>
                        )}
                        {prod.isBestSeller && (
                          <span className="text-[#00E676] font-semibold">Mais Vendido</span>
                        )}
                        {!prod.isFlashDeal && !prod.isBestSeller && (
                          <span className="text-slate-500">Padrão</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingProduct({ ...prod })}
                            className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] hover:border-white/60 text-slate-200"
                            title="Editar produto"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpsertProduct({
                                ...prod,
                                id: `prod-${Date.now()}`,
                                sku: `${prod.sku}-CP`,
                                name: `${prod.name} (Cópia)`,
                              });
                              notify('Produto duplicado!');
                            }}
                            className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] hover:border-white/60 text-slate-200"
                            title="Duplicar produto"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteProduct(prod.id);
                              notify('Produto removido.');
                            }}
                            className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] hover:border-red-500 text-red-400"
                            title="Excluir produto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DESCONTOS E CUPONS */}
        {activeTab === 'coupons' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                Desconto Global no PIX
              </h2>
              <p className="text-xs text-slate-400">
                Alterar esta porcentagem recalcula automaticamente todos os preços à vista no PIX em toda a vitrine e no carrinho.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Porcentagem de Desconto no PIX (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={1}
                  value={store.payment.pixDiscountPercent}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(80, Number(e.target.value)));
                    setStore((p) => ({
                      ...p,
                      pixDiscountPercent: val,
                      payment: { ...p.payment, pixDiscountPercent: val },
                    }));
                  }}
                  className="w-full h-11 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-lg font-mono-num font-bold text-[#00E676]"
                />
              </div>
            </div>

            <div className="lg:col-span-2 bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                Cupons de Desconto
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-end bg-[#0B0D10] p-3.5 rounded border border-[#272D38]">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] text-slate-400 mb-1">Código</label>
                  <input
                    type="text"
                    value={newCoupon.code}
                    onChange={(e) =>
                      setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })
                    }
                    placeholder="BTH15"
                    className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num uppercase text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Tipo</label>
                  <select
                    value={newCoupon.type}
                    onChange={(e) =>
                      setNewCoupon({ ...newCoupon, type: e.target.value as 'percent' | 'fixed' })
                    }
                    className="w-full h-9 px-2 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                  >
                    <option value="percent">% OFF</option>
                    <option value="fixed">R$ Fixo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Valor</label>
                  <input
                    type="number"
                    min={1}
                    value={newCoupon.value}
                    onChange={(e) =>
                      setNewCoupon({ ...newCoupon, value: Number(e.target.value) })
                    }
                    className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Pedido Mín (R$)</label>
                  <input
                    type="number"
                    min={0}
                    value={newCoupon.minOrderValue}
                    onChange={(e) =>
                      setNewCoupon({ ...newCoupon, minOrderValue: Number(e.target.value) })
                    }
                    className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newCoupon.code.trim()) return;
                    const item: Coupon = { ...newCoupon, id: `cup-${Date.now()}` };
                    setStore((p) => ({ ...p, coupons: [item, ...p.coupons] }));
                    setNewCoupon({
                      code: '',
                      type: 'percent',
                      value: 10,
                      minOrderValue: 0,
                      active: true,
                    });
                    notify(`Cupom ${item.code} criado!`);
                  }}
                  className="h-9 rounded font-display font-bold uppercase text-xs tracking-wider text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  Criar Cupom
                </button>
              </div>

              <div className="space-y-2">
                {store.coupons.map((cup) => (
                  <div
                    key={cup.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-bold text-sm text-white">
                        {cup.code}
                      </span>
                      <span className="text-[#00E676] font-mono-num">
                        {cup.type === 'percent' ? `${cup.value}% OFF` : `${formatBRL(cup.value)} OFF`}
                      </span>
                      <span className="text-slate-400">
                        Mínimo: {formatBRL(cup.minOrderValue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setStore((p) => ({
                            ...p,
                            coupons: p.coupons.map((c) =>
                              c.id === cup.id ? { ...c, active: !c.active } : c
                            ),
                          }))
                        }
                        className={`px-3 py-1 rounded border text-[11px] font-semibold ${
                          cup.active
                            ? 'border-[#00E676]/50 text-[#00E676]'
                            : 'border-slate-600 text-slate-400'
                        }`}
                      >
                        {cup.active ? 'Ativo' : 'Pausado'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setStore((p) => ({
                            ...p,
                            coupons: p.coupons.filter((c) => c.id !== cup.id),
                          }))
                        }
                        className="p-1.5 text-red-400 hover:text-red-300"
                        title="Excluir cupom"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PAGAMENTOS E PARCELAMENTO */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            {/* PIX Configuration Section */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                Configuração do Recebedor PIX
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Tipo da Chave</label>
                  <select
                    value={store.payment.pixKeyType}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        payment: {
                          ...p.payment,
                          pixKeyType: e.target.value as StoreState['payment']['pixKeyType'],
                        },
                      }))
                    }
                    className="w-full h-10 px-2.5 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  >
                    <option value="CNPJ">CNPJ</option>
                    <option value="CPF">CPF</option>
                    <option value="E-mail">E-mail</option>
                    <option value="Telefone">Telefone</option>
                    <option value="Aleatória">Aleatória</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Chave PIX</label>
                  <input
                    type="text"
                    value={store.payment.pixKey}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        payment: { ...p.payment, pixKey: e.target.value },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Favorecido</label>
                  <input
                    type="text"
                    value={store.payment.pixBeneficiary}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        payment: { ...p.payment, pixBeneficiary: e.target.value },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Banco</label>
                  <input
                    type="text"
                    value={store.payment.pixBank}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        payment: { ...p.payment, pixBank: e.target.value },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Credit Card Rules & Links Card (directly below PIX) */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#272D38] pb-3">
                <div>
                  <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white">
                    Regras e Links de Cartão de Crédito
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure gateway, link de pagamento, parcelamento, taxas por parcela (1x a 12x) e bandeiras aceitas.
                  </p>
                </div>

                {/* Switch Sim / Não */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={store.payment.creditCardEnabled}
                  onClick={() =>
                    setStore((p) => ({
                      ...p,
                      payment: {
                        ...p.payment,
                        creditCardEnabled: !p.payment.creditCardEnabled,
                      },
                    }))
                  }
                  className="inline-flex items-center gap-3 px-3.5 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-slate-500 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-200">
                    Ativar Pagamento no Cartão
                  </span>
                  <span
                    className={`w-10 h-5 rounded-full relative transition-colors ${
                      store.payment.creditCardEnabled ? 'bg-[#00E676]' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#0B0D10] transition-transform ${
                        store.payment.creditCardEnabled ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      store.payment.creditCardEnabled ? 'text-[#00E676]' : 'text-slate-400'
                    }`}
                  >
                    {store.payment.creditCardEnabled ? 'SIM' : 'NÃO'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Gateway & Link */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Provedor / Gateway Utilizado
                      </label>
                      <select
                        value={store.payment.gatewayProvider}
                        onChange={(e) =>
                          setStore((p) => ({
                            ...p,
                            payment: {
                              ...p.payment,
                              gatewayProvider: e.target.value as CardGatewayProvider,
                            },
                          }))
                        }
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                      >
                        <option value="InfinitePay">InfinitePay</option>
                        <option value="Mercado Pago">Mercado Pago</option>
                        <option value="PagBank">PagBank</option>
                        <option value="Asaas">Asaas</option>
                        <option value="Outro Link de Pagamento">Outro Link de Pagamento</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Parcela Mínima (R$)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min={5}
                        value={store.payment.minInstallmentValue}
                        onChange={(e) =>
                          setStore((p) => ({
                            ...p,
                            payment: {
                              ...p.payment,
                              minInstallmentValue: Math.max(5, Number(e.target.value)),
                            },
                          }))
                        }
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Link de Pagamento Padrão / Dinâmico (URL)
                    </label>
                    <input
                      type="url"
                      value={store.payment.defaultExternalCheckoutUrl}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          payment: { ...p.payment, defaultExternalCheckoutUrl: e.target.value },
                        }))
                      }
                      placeholder="https://link.infinitepay.io/..."
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Instruções Exibidas ao Cliente no Checkout
                    </label>
                    <textarea
                      rows={2}
                      value={store.payment.creditCardInstructions}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          payment: { ...p.payment, creditCardInstructions: e.target.value },
                        }))
                      }
                      className="w-full p-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Número Máximo de Parcelas
                      </label>
                      <select
                        value={store.payment.maxInstallments}
                        onChange={(e) => {
                          const max = Number(e.target.value);
                          setStore((p) => ({
                            ...p,
                            payment: {
                              ...p.payment,
                              maxInstallments: max,
                              interestFreeInstallments: Math.min(
                                p.payment.interestFreeInstallments,
                                max
                              ),
                            },
                          }));
                        }}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                      >
                        {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => (
                          <option key={n} value={n}>
                            Até {n}x
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Parcelas Sem Juros
                      </label>
                      <select
                        value={store.payment.interestFreeInstallments}
                        onChange={(e) => {
                          const free = Number(e.target.value);
                          setStore((p) => ({
                            ...p,
                            payment: {
                              ...p.payment,
                              interestFreeInstallments: free,
                            },
                          }));
                        }}
                        className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                      >
                        {Array.from(
                          { length: store.payment.maxInstallments },
                          (_, idx) => idx + 1
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}x sem juros
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Accepted Card Brands Checkboxes */}
                  <div className="p-3.5 rounded bg-[#0B0D10] border border-[#272D38] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-300">
                        Bandeiras Aceitas (Exibidas no Checkout e Rodapé)
                      </span>
                      <CardBrandsStrip brands={store.payment.acceptedCardBrands} compact />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {(['Visa', 'Mastercard', 'Elo', 'Hipercard', 'Amex'] as CardBrand[]).map(
                        (brand) => {
                          const checked = store.payment.acceptedCardBrands.includes(brand);
                          return (
                            <label
                              key={brand}
                              className="inline-flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...store.payment.acceptedCardBrands, brand]
                                    : store.payment.acceptedCardBrands.filter((b) => b !== brand);
                                  setStore((p) => ({
                                    ...p,
                                    payment: { ...p.payment, acceptedCardBrands: next },
                                  }));
                                }}
                                className="accent-[#FF6500]"
                              />
                              <span>{brand}</span>
                            </label>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                {/* Editable 1x-12x Installment Rate Table */}
                <div className="p-4 rounded bg-[#0B0D10] border border-[#272D38] space-y-3">
                  <div>
                    <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                      Tabela de Taxas de Juros por Parcela (1x a 12x)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Parcelas até {store.payment.interestFreeInstallments}x são absorvidas pela loja (0% sem juros). Acima disso, aplica-se a % digitada abaixo.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => {
                      const isFree = n <= store.payment.interestFreeInstallments;
                      const isDisabled = n > store.payment.maxInstallments;
                      const val = isFree ? 0 : store.payment.installmentRates?.[n] ?? 0;
                      return (
                        <div
                          key={n}
                          className={`p-2 rounded border ${
                            isDisabled
                              ? 'opacity-40 bg-[#161A20]/40 border-[#272D38]'
                              : isFree
                              ? 'bg-[#161A20] border-[#00E676]/40'
                              : 'bg-[#161A20] border-[#272D38]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-mono-num font-bold text-white">{n}x</span>
                            <span className={isFree ? 'text-[#00E676]' : 'text-slate-400'}>
                              {isFree ? 'Sem juros' : '% acréscimo'}
                            </span>
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              disabled={isFree || isDisabled}
                              value={val}
                              onChange={(e) => {
                                const rateVal = Math.max(0, Number(e.target.value));
                                setStore((p) => ({
                                  ...p,
                                  payment: {
                                    ...p.payment,
                                    installmentRates: {
                                      ...p.payment.installmentRates,
                                      [n]: rateVal,
                                    },
                                  },
                                }));
                              }}
                              className="w-full h-8 px-2 pr-6 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white disabled:text-slate-500"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                              %
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: FRETE E ENTREGAS */}
        {activeTab === 'shipping' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                Regras de Frete Grátis, Peso e Tabela Regional
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    CEP de Origem (CD Cascavel - PR)
                  </label>
                  <input
                    type="text"
                    value={store.shipping.originCep || '85801-000'}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        shipping: { ...p.shipping, originCep: e.target.value },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Valor por Kg Adicional (R$ / kg)
                  </label>
                  <input
                    type="number"
                    step="0.50"
                    min={0}
                    value={store.shipping.additionalKgRate ?? 9.9}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        shipping: {
                          ...p.shipping,
                          additionalKgRate: Math.max(0, Number(e.target.value)),
                        },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Valor Mínimo Frete Grátis (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={store.shipping.freeShippingMinValue}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        shipping: {
                          ...p.shipping,
                          freeShippingMinValue: Math.max(0, Number(e.target.value)),
                        },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Abrangência do Frete Grátis
                  </label>
                  <select
                    value={store.shipping.freeShippingScope}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        shipping: {
                          ...p.shipping,
                          freeShippingScope: e.target.value as 'brasil' | 'sul_pr',
                        },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  >
                    <option value="brasil">Todo o Brasil</option>
                    <option value="sul_pr">Apenas Região Sul / Paraná</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#272D38]">
                <div className="grid grid-cols-12 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <span className="col-span-6">Região / UF</span>
                  <span className="col-span-3 text-right">Econômico (PAC)</span>
                  <span className="col-span-3 text-right">Expresso (SEDEX)</span>
                </div>
                {(Object.keys(REGION_LABELS) as RegionKey[]).map((regionKey) => (
                  <div key={regionKey} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-6 text-xs text-slate-300">{REGION_LABELS[regionKey]}</span>
                    <input
                      type="number"
                      step="0.10"
                      min={0}
                      value={store.shipping.regionRates[regionKey]}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          shipping: {
                            ...p.shipping,
                            regionRates: {
                              ...p.shipping.regionRates,
                              [regionKey]: Math.max(0, Number(e.target.value)),
                            },
                          },
                        }))
                      }
                      className="col-span-3 h-9 px-2.5 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white text-right"
                    />
                    <input
                      type="number"
                      step="0.10"
                      min={0}
                      value={store.shipping.expressRegionRates?.[regionKey] ?? 0}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          shipping: {
                            ...p.shipping,
                            expressRegionRates: {
                              ...p.shipping.expressRegionRates,
                              [regionKey]: Math.max(0, Number(e.target.value)),
                            },
                          },
                        }))
                      }
                      className="col-span-3 h-9 px-2.5 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                Entrega Local: Cascavel - PR (CEPs 85800 a 85819)
              </h2>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={store.shipping.cascavelMotoboyEnabled}
                  onChange={(e) =>
                    setStore((p) => ({
                      ...p,
                      shipping: { ...p.shipping, cascavelMotoboyEnabled: e.target.checked },
                    }))
                  }
                  className="accent-[#FF6500]"
                />
                <span className="text-sm font-semibold text-white">
                  Habilitar Motoboy Expresso em Cascavel - PR
                </span>
              </label>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Taxa Motoboy Cascavel (R$)
                </label>
                <input
                  type="number"
                  step="0.50"
                  min={0}
                  value={store.shipping.cascavelMotoboyFee}
                  onChange={(e) =>
                    setStore((p) => ({
                      ...p,
                      shipping: {
                        ...p.shipping,
                        cascavelMotoboyFee: Math.max(0, Number(e.target.value)),
                      },
                    }))
                  }
                  className="w-40 h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-sm font-mono-num text-white"
                />
              </div>

              <div className="pt-3 border-t border-[#272D38] space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={store.shipping.cascavelPickupEnabled}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        shipping: { ...p.shipping, cascavelPickupEnabled: e.target.checked },
                      }))
                    }
                    className="accent-[#00E676]"
                  />
                  <span className="text-sm font-semibold text-white">
                    Habilitar Retirada no Balcão em Cascavel - PR (Grátis)
                  </span>
                </label>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Endereço de Retirada
                  </label>
                  <input
                    type="text"
                    value={store.shipping.cascavelPickupAddress}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        shipping: { ...p.shipping, cascavelPickupAddress: e.target.value },
                      }))
                    }
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: DADOS FISCAIS E PEDIDOS (NF-e) */}
        {activeTab === 'fiscal_orders' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Store Fiscal Data */}
              <div className="lg:col-span-2 bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
                <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                  Dados Fiscais e Contato da Loja
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Razão Social</label>
                    <input
                      type="text"
                      value={store.fiscal.corporateName}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          fiscal: { ...p.fiscal, corporateName: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">CNPJ</label>
                    <input
                      type="text"
                      value={store.fiscal.cnpj}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          fiscal: { ...p.fiscal, cnpj: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Inscrição Estadual</label>
                    <input
                      type="text"
                      value={store.fiscal.stateRegistration}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          fiscal: { ...p.fiscal, stateRegistration: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      WhatsApp Oficial (com DDI 55 + DDD)
                    </label>
                    <input
                      type="text"
                      value={store.fiscal.whatsappNumber}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          fiscal: { ...p.fiscal, whatsappNumber: e.target.value },
                        }))
                      }
                      placeholder="5545999999999"
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">E-mail Fiscal</label>
                    <input
                      type="email"
                      value={store.fiscal.storeEmail}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          fiscal: { ...p.fiscal, storeEmail: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Cidade / UF</label>
                    <input
                      type="text"
                      value={store.fiscal.storeCityState}
                      onChange={(e) =>
                        setStore((p) => ({
                          ...p,
                          fiscal: { ...p.fiscal, storeCityState: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Password Change */}
              <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-3">
                <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white border-b border-[#272D38] pb-2">
                  Alterar Senha do Painel
                </h2>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Nova Senha</label>
                  <input
                    type="password"
                    value={newAdminPass}
                    onChange={(e) => setNewAdminPass(e.target.value)}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    value={confirmAdminPass}
                    onChange={(e) => setConfirmAdminPass(e.target.value)}
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (newAdminPass.length < 6) {
                      notify('A senha deve ter pelo menos 6 caracteres.', false);
                      return;
                    }
                    if (newAdminPass !== confirmAdminPass) {
                      notify('As senhas não conferem.', false);
                      return;
                    }
                    setStore((p) => ({
                      ...p,
                      fiscal: { ...p.fiscal, adminPassword: newAdminPass },
                    }));
                    setNewAdminPass('');
                    setConfirmAdminPass('');
                    notify('Senha do painel alterada com sucesso!');
                  }}
                  className="w-full h-10 rounded font-display font-bold text-sm uppercase tracking-wider text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  Atualizar Senha
                </button>
              </div>
            </div>

            {/* Official Email & Google Apps Script Gmail Dispatcher Card */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-5">
              {/* 1. Fixed Top Block (General Dispatcher Connection) */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#272D38] pb-3">
                <div className="flex items-start gap-2.5">
                  <Mail className="w-5 h-5 mt-0.5 shrink-0" style={{ color: accentColor }} />
                  <div>
                    <h2 className="font-display font-bold text-lg sm:text-xl uppercase tracking-wider text-white">
                      Configuração de E-mail Oficial e Disparador Gmail
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure a conexão do Google Apps Script e personalize os modelos e campanhas nas sub-abas.
                    </p>
                  </div>
                </div>

                {/* Global Switch Sim / Não */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={store.email.emailVerificationEnabled}
                  onClick={() =>
                    setStore((p) => ({
                      ...p,
                      email: {
                        ...p.email,
                        emailVerificationEnabled: !p.email.emailVerificationEnabled,
                      },
                    }))
                  }
                  className="inline-flex items-center gap-3 px-3.5 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-slate-500 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-200">
                    Ativar Envio Real por E-mail
                  </span>
                  <span
                    className={`w-10 h-5 rounded-full relative transition-colors ${
                      store.email.emailVerificationEnabled ? 'bg-[#00E676]' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#0B0D10] transition-transform ${
                        store.email.emailVerificationEnabled ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      store.email.emailVerificationEnabled ? 'text-[#00E676]' : 'text-slate-400'
                    }`}
                  >
                    {store.email.emailVerificationEnabled ? 'SIM' : 'NÃO'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    E-mail Oficial de Exibição
                  </label>
                  <input
                    type="email"
                    value={store.email.officialEmail}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        email: { ...p.email, officialEmail: e.target.value },
                      }))
                    }
                    placeholder="contato.bthtech@gmail.com"
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs sm:text-sm text-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Exibido no rodapé da loja, Garantia e em todos os e-mails.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    URL do Disparador Gmail (Google Apps Script)
                  </label>
                  <input
                    type="url"
                    value={store.email.gmailScriptUrl}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        email: { ...p.email, gmailScriptUrl: e.target.value },
                      }))
                    }
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Recebe POST JSON <code className="text-slate-200 font-mono-num">{'{ to_email, subject, html_body }'}</code>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    URL da Logo para E-mails
                  </label>
                  <input
                    type="url"
                    value={store.email.emailLogoUrl}
                    onChange={(e) =>
                      setStore((p) => ({
                        ...p,
                        email: { ...p.email, emailLogoUrl: e.target.value },
                      }))
                    }
                    placeholder="https://googleusercontent.com"
                    className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs font-mono-num text-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Logo exibida no cabeçalho escuro (#0B0D10) dos 4 modelos.
                  </p>
                </div>
              </div>

              {/* 2. Menu de 4 Sub-Abas Horizontais Lado a Lado */}
              {(() => {
                const emailSubTabs: {
                  id: EmailTemplateKey;
                  label: string;
                  badgePreview: string;
                  description: string;
                  variables: string[];
                  icon: React.ReactNode;
                }[] = [
                  {
                    id: 'verification',
                    label: '1. Código de Verificação',
                    badgePreview: 'VERIFICAÇÃO DE CADASTRO',
                    description:
                      'Enviado automaticamente quando um novo cliente cria conta na loja e precisa confirmar os 6 dígitos.',
                    variables: ['{{codigo}}', '{{cliente}}'],
                    icon: <ShieldCheck className="w-4 h-4" />,
                  },
                  {
                    id: 'orderConfirmed',
                    label: '2. Pedido Confirmado',
                    badgePreview: 'PEDIDO CONFIRMADO',
                    description:
                      'Enviado ao concluir a compra ou ao clicar em "Notificar Aprovação" na lista de pedidos.',
                    variables: ['{{pedido}}', '{{cliente}}', '{{status}}', '{{total}}'],
                    icon: <CheckCircle2 className="w-4 h-4" />,
                  },
                  {
                    id: 'orderShipped',
                    label: '3. Pedido Enviado',
                    badgePreview: 'PEDIDO ENVIADO',
                    description:
                      'Enviado com o código de rastreamento quando o pedido for despachado ou ao clicar em "Enviar Rastreio".',
                    variables: ['{{pedido}}', '{{cliente}}', '{{rastreio}}', '{{total}}'],
                    icon: <Truck className="w-4 h-4" />,
                  },
                  {
                    id: 'nfeIssued',
                    label: '4. Notas Fiscais (NF-e)',
                    badgePreview: 'NOTA FISCAL (NF-e)',
                    description:
                      'Enviado ao clicar em "Enviar Aviso NF-e", informando sobre emissão do PDF (DANFE), XML e consulta SEFAZ.',
                    variables: ['{{pedido}}', '{{cliente}}', '{{nfe}}', '{{total}}'],
                    icon: <FileText className="w-4 h-4" />,
                  },
                ];

                const activeMeta =
                  emailSubTabs.find((t) => t.id === activeEmailSubTab) || emailSubTabs[0];
                const currentTemplate = resolveEmailTemplate(store.email, activeMeta.id);
                const activeFeedback = testEmailFeedbackByTab[activeMeta.id];

                const updateActiveTemplate = (patch: Partial<EmailTemplateConfig>) => {
                  setStore((p) => {
                    const resolved = resolveEmailTemplate(p.email, activeMeta.id);
                    return {
                      ...p,
                      email: {
                        ...p.email,
                        templates: {
                          ...p.email.templates,
                          [activeMeta.id]: {
                            ...resolved,
                            ...patch,
                          },
                        },
                      },
                    };
                  });
                };

                return (
                  <div className="space-y-4 pt-1">
                    {/* Sub-tabs horizontal bar matching main Admin tabs style */}
                    <div className="bg-[#0B0D10] border border-[#272D38] rounded-md px-2.5 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {emailSubTabs.map((sub) => {
                        const isActive = activeEmailSubTab === sub.id;
                        const subCfg = resolveEmailTemplate(store.email, sub.id);
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => setActiveEmailSubTab(sub.id)}
                            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                              isActive
                                ? 'text-white'
                                : 'text-slate-400 hover:text-white hover:bg-[#161A20]'
                            }`}
                            style={isActive ? { backgroundColor: accentColor } : undefined}
                          >
                            {sub.icon}
                            <span>{sub.label}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                subCfg.enabled ? 'bg-[#00E676]' : 'bg-slate-600'
                              }`}
                              title={subCfg.enabled ? 'Envio ativo' : 'Envio desativado'}
                            />
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setActiveEmailSubTab('promotion')}
                        aria-pressed={activeEmailSubTab === 'promotion'}
                        className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-3.5 py-2 text-xs font-semibold ${activeEmailSubTab === 'promotion' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                        style={activeEmailSubTab === 'promotion' ? { backgroundColor: accentColor } : undefined}
                      >
                        <Mail className="w-4 h-4" /> 5. Promoções e Reativação
                      </button>
                    </div>

                    {activeEmailSubTab === 'promotion' ? (() => {
                      const promotion = store.email.promotion;
                      const updatePromotion = (patch: Partial<typeof promotion>) => setStore((previous) => ({
                        ...previous,
                        email: { ...previous.email, promotion: { ...previous.email.promotion, ...patch } },
                      }));
                      const field = 'w-full rounded border border-[#272D38] bg-[#161A20] p-2 text-sm text-white';
                      const recipients = selectPromotionRecipients(store.customers, store.orders, audience);
                      return <div className="space-y-4 rounded-md border border-[#272D38] bg-[#0B0D10] p-4">
                        <h3 className="font-display font-bold text-white">5. Promoções e Reativação</h3>
                        <fieldset disabled={campaignBusy} className="grid gap-3 sm:grid-cols-2">
                          {([['subject', 'Assunto'], ['title', 'Título da Oferta ({{titulo_oferta}})'], ['coupon', 'Código do Cupom ({{cupom}})'], ['destinationUrl', 'Link de Destino ({{link_loja}})']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs text-slate-300">
                            <span>{label}</span><input className={field} value={promotion[key]} onChange={(event) => updatePromotion({ [key]: event.target.value })} />
                          </label>)}
                          <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Mensagem ({'{{mensagem_oferta}}'})
                            <textarea rows={3} className={field} value={promotion.message} onChange={(event) => updatePromotion({ message: event.target.value })} />
                          </label>
                          <label className="space-y-1 text-xs text-slate-300">Editor
                            <select className={field} value={promotion.editorMode} onChange={(event) => updatePromotion({ editorMode: event.target.value === 'html' ? 'html' : 'simple' })}>
                              <option value="simple">Editor Visual Simples</option><option value="html">Código HTML Completo (&lt;&gt;)</option>
                            </select>
                          </label>
                          <label className="space-y-1 text-xs text-slate-300">Destinatários
                            <select className={field} value={audience} onChange={(event) => setAudience(event.target.value as PromotionAudience)}>
                              <option value="all">Todos os clientes cadastrados</option>
                              <option value="never">Clientes que nunca compraram</option>
                              <option value="inactive">Clientes inativos há mais de 30 dias</option>
                            </select>
                          </label>
                          {promotion.editorMode === 'html' && <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Código HTML Completo · {PROMOTION_VARIABLES.map((variable) => `{{${variable}}}`).join(' · ')}
                            <textarea rows={8} className={`${field} font-mono`} value={promotion.customHtml} onChange={(event) => updatePromotion({ customHtml: event.target.value })} />
                          </label>}
                        </fieldset>
                        <p className="text-xs text-slate-400">{recipients.length} destinatário(s) no cadastro deste navegador. Envie apenas a quem autorizou receber promoções e mantenha a aba aberta durante o disparo.</p>
                        <p className="text-sm font-semibold text-white">Envios realizados hoje: {campaignQuota?.sent ?? '—'} / {CAMPAIGN_LIMIT} (Limite gratuito do Gmail)</p>
                        {!campaignQuota && <form className="grid gap-2 sm:grid-cols-3" onSubmit={async (event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          const password = String(new FormData(form).get('campaign-password') ?? '');
                          try {
                            if (inviteToken) {
                              await acceptInvite(inviteToken, password);
                              setInviteToken('');
                            } else await login(campaignEmail.trim(), password);
                            await readCampaignQuota();
                            setCampaignMessage('Conta autorizada.');
                          } catch {
                            setCampaignMessage('Não foi possível autorizar a conta ou consultar o contador. Confira o acesso administrativo.');
                          } finally { form.reset(); }
                        }}>
                          {!inviteToken && <input required type="email" aria-label="E-mail da conta de campanhas" placeholder="E-mail da conta de campanhas" className={field} value={campaignEmail} onChange={(event) => setCampaignEmail(event.target.value)} />}
                          <input required type="password" name="campaign-password" aria-label={inviteToken ? 'Nova senha' : 'Senha da conta de campanhas'} placeholder={inviteToken ? 'Defina sua senha' : 'Senha'} className={field} />
                          <button className="rounded border border-[#272D38] px-3 py-2 text-xs font-bold text-white">{inviteToken ? 'Aceitar convite' : 'Autorizar disparos'}</button>
                        </form>}
                        <button type="button" disabled={campaignBusy || !campaignQuota?.remaining || !recipients.length} onClick={() => void launchPromotion()} className="inline-flex items-center gap-2 rounded bg-[#FF6500] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                          <Send className="h-4 w-4" /> {campaignBusy ? 'Disparando campanha…' : 'Disparar Campanha Agora'}
                        </button>
                        <p role="status" className="text-xs text-slate-300">{campaignMessage}</p>
                      </div>;
                    })() : (
                    <div className="p-4 sm:p-5 rounded-md bg-[#0B0D10] border border-[#272D38] space-y-4">
                      {/* Sub-tab header + individual enable/disable switch */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#272D38] pb-3">
                        <div>
                          <h3 className="font-display font-bold text-base uppercase tracking-wider text-white">
                            {activeMeta.label}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">{activeMeta.description}</p>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={currentTemplate.enabled}
                          onClick={() =>
                            updateActiveTemplate({ enabled: !currentTemplate.enabled })
                          }
                          className="inline-flex items-center gap-3 px-3.5 py-2 rounded bg-[#161A20] border border-[#272D38] hover:border-slate-500 transition-colors"
                        >
                          <span className="text-xs font-semibold text-slate-200">
                            Ativar/Desativar este envio
                          </span>
                          <span
                            className={`w-10 h-5 rounded-full relative transition-colors ${
                              currentTemplate.enabled ? 'bg-[#00E676]' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#0B0D10] transition-transform ${
                                currentTemplate.enabled ? 'left-5' : 'left-0.5'
                              }`}
                            />
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              currentTemplate.enabled ? 'text-[#00E676]' : 'text-slate-400'
                            }`}
                          >
                            {currentTemplate.enabled ? 'ATIVO' : 'DESATIVADO'}
                          </span>
                        </button>
                      </div>

                      {/* Mode Selector: Editor Visual Simples vs Código HTML Completo (<>) */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161A20] border border-[#272D38] rounded p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateActiveTemplate({ editorMode: 'simple' })}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                              currentTemplate.editorMode === 'simple'
                                ? 'text-white'
                                : 'text-slate-400 hover:text-white hover:bg-[#0B0D10]'
                            }`}
                            style={
                              currentTemplate.editorMode === 'simple'
                                ? { backgroundColor: accentColor }
                                : undefined
                            }
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editor Visual Simples</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => updateActiveTemplate({ editorMode: 'html' })}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                              currentTemplate.editorMode === 'html'
                                ? 'text-white'
                                : 'text-slate-400 hover:text-white hover:bg-[#0B0D10]'
                            }`}
                            style={
                              currentTemplate.editorMode === 'html'
                                ? { backgroundColor: accentColor }
                                : undefined
                            }
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span>Código HTML Completo (&lt;&gt;)</span>
                          </button>
                        </div>

                        <span className="text-[11px] text-slate-400 px-1">
                          {currentTemplate.editorMode === 'html'
                            ? 'Prioridade ativa: enviará o HTML personalizado abaixo'
                            : 'Modo ativo: layout visual automático BTHTECH'}
                        </span>
                      </div>

                      {/* Subject (shared by both modes) */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-300">
                          Assunto do E-mail (Subject)
                        </label>
                        <input
                          type="text"
                          value={currentTemplate.subject}
                          onChange={(e) =>
                            updateActiveTemplate({ subject: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-xs sm:text-sm text-white"
                        />
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          <span>Variáveis de assunto:</span>
                          {activeMeta.variables.map((v) => (
                            <code
                              key={v}
                              className="px-1.5 py-0.5 rounded bg-[#161A20] border border-[#272D38] text-[#FF6500] font-mono-num"
                            >
                              {v}
                            </code>
                          ))}
                        </div>
                      </div>

                      {currentTemplate.editorMode === 'simple' ? (
                        <div className="space-y-4">
                          {/* Badge Color & Live Badge Preview */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-300">
                              Cor do Selo (Badge do E-mail)
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="color"
                                value={currentTemplate.badgeColor}
                                onChange={(e) =>
                                  updateActiveTemplate({ badgeColor: e.target.value })
                                }
                                className="w-10 h-10 rounded bg-[#161A20] border border-[#272D38] cursor-pointer p-1"
                              />
                              <input
                                type="text"
                                value={currentTemplate.badgeColor}
                                onChange={(e) =>
                                  updateActiveTemplate({ badgeColor: e.target.value })
                                }
                                className="w-24 h-10 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num uppercase text-white"
                              />
                              {['#FF6500', '#00E676', '#3B82F6', '#F59E0B', '#A855F7'].map(
                                (preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => updateActiveTemplate({ badgeColor: preset })}
                                    className="w-6 h-6 rounded border border-white/20"
                                    style={{ backgroundColor: preset }}
                                    title={`Usar cor ${preset}`}
                                  />
                                )
                              )}
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 ml-1">
                                <span>Prévia:</span>
                                <span
                                  className="inline-block px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider bg-[#0B0D10]"
                                  style={{
                                    border: `1px solid ${currentTemplate.badgeColor}`,
                                    color: currentTemplate.badgeColor,
                                  }}
                                >
                                  {activeMeta.badgePreview}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Title */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              Título Principal
                            </label>
                            <input
                              type="text"
                              value={currentTemplate.title}
                              onChange={(e) => updateActiveTemplate({ title: e.target.value })}
                              className="w-full h-10 px-3 rounded bg-[#161A20] border border-[#272D38] text-sm text-white"
                            />
                          </div>

                          {/* Message Body */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              Mensagem Personalizada (Saudação e Instruções ao Cliente)
                            </label>
                            <textarea
                              rows={3}
                              value={currentTemplate.message}
                              onChange={(e) => updateActiveTemplate({ message: e.target.value })}
                              className="w-full p-3 rounded bg-[#161A20] border border-[#272D38] text-xs sm:text-sm text-white leading-relaxed"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Custom HTML Toolbar: Load Default Button + Dynamic Variables */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded bg-[#161A20] border border-[#272D38]">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                              <span className="font-semibold">Variáveis (clique para inserir):</span>
                              {[
                                '{{cliente}}',
                                ...(activeMeta.id === 'verification'
                                  ? ['{{codigo}}']
                                  : [
                                      '{{pedido}}',
                                      '{{pagamento}}',
                                      '{{itens}}',
                                      '{{lista_itens_grade}}',
                                      '{{quantidade}}',
                                      '{{subtotal}}',
                                      '{{frete}}',
                                      '{{total}}',
                                      '{{rastreio}}',
                                      '{{transportadora}}',
                                      '{{nfe}}',
                                      '{{link_nfe_pdf}}',
                                    ]),
                                '{{logo_url}}',
                                '{{email_oficial}}',
                              ].map((variable) => (
                                <button
                                  key={variable}
                                  type="button"
                                  onClick={() =>
                                    updateActiveTemplate({
                                      customHtml: currentTemplate.customHtml
                                        ? `${currentTemplate.customHtml}\n${variable}`
                                        : variable,
                                    })
                                  }
                                  className="px-1.5 py-0.5 rounded bg-[#0B0D10] border border-[#272D38] hover:border-[#FF6500] text-[#FF6500] font-mono-num transition-colors"
                                  title={`Inserir ${variable} no código`}
                                >
                                  {variable}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const defaultHtml = getDefaultTemplateHtmlWithVars(
                                  store.email,
                                  activeMeta.id
                                );
                                updateActiveTemplate({ customHtml: defaultHtml });
                                notify('Modelo HTML padrão BTHTECH carregado no editor!');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0B0D10] border border-[#FF6500]/60 hover:bg-[#FF6500]/15 text-xs font-display font-bold uppercase tracking-wider text-[#FF6500] transition-colors shrink-0"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Carregar Modelo Padrão BTHTECH no Editor</span>
                            </button>
                          </div>

                          {/* Side-by-Side Code Editor & Live Iframe Preview */}
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
                            {/* Left: Monospace HTML Textarea */}
                            <div className="flex flex-col space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                  <Code2 className="w-3.5 h-3.5 text-[#FF6500]" />
                                  <span>Código HTML Completo (&lt;!DOCTYPE html&gt;, &lt;table&gt;, estilos inline)</span>
                                </label>
                                {currentTemplate.customHtml.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => updateActiveTemplate({ customHtml: '' })}
                                    className="text-[11px] text-slate-400 hover:text-red-400 underline"
                                  >
                                    Limpar HTML
                                  </button>
                                )}
                              </div>
                              <textarea
                                rows={18}
                                spellCheck={false}
                                value={currentTemplate.customHtml}
                                onChange={(e) =>
                                  updateActiveTemplate({ customHtml: e.target.value })
                                }
                                placeholder="Cole aqui seu código HTML completo (ex: exportado do EmailJS, Stripo ou clicando em 'Carregar Modelo Padrão BTHTECH no Editor')..."
                                className="w-full flex-1 min-h-[420px] p-3 rounded bg-[#06080A] border border-[#272D38] focus:border-[#FF6500] focus:outline-none font-mono text-xs leading-relaxed text-emerald-300"
                              />
                            </div>

                            {/* Right: Live Iframe Preview with 375px Mobile / 600px Desktop Switch */}
                            <div className="flex flex-col space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                  <Eye className="w-3.5 h-3.5 text-[#00E676]" />
                                  <span>Pré-visualização ao Vivo</span>
                                </span>

                                <div className="inline-flex items-center bg-[#161A20] border border-[#272D38] rounded p-0.5 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewViewport('mobile')}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                      previewViewport === 'mobile'
                                        ? 'bg-[#00E676] text-[#0B0D10]'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    <Smartphone className="w-3 h-3" />
                                    <span>Celular (375px)</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewViewport('desktop')}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                      previewViewport === 'desktop'
                                        ? 'bg-[#00E676] text-[#0B0D10]'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    <Monitor className="w-3 h-3" />
                                    <span>Computador (600px)</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex-1 min-h-[420px] rounded bg-[#06080A] border border-[#272D38] p-3 overflow-x-auto flex justify-center items-start">
                                <iframe
                                  title={`Pré-visualização HTML — ${activeMeta.label}`}
                                  sandbox=""
                                  srcDoc={renderCustomHtmlPreview(
                                    store.email,
                                    activeMeta.id,
                                    currentTemplate.customHtml
                                  )}
                                  style={{
                                    width: previewViewport === 'mobile' ? '375px' : '600px',
                                    height: '430px',
                                  }}
                                  className="rounded border border-[#272D38] bg-[#0B0D10] shrink-0 transition-all duration-200"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Per-Tab Test Dispatch Box */}
                      <div className="p-3.5 rounded bg-[#161A20] border border-[#272D38] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                          <div className="flex-1">
                            <label
                              htmlFor="admin-test-email"
                              className="block text-[11px] font-semibold text-slate-300 mb-1"
                            >
                              E-mail de Destino para Testar "{activeMeta.label}" (com dados de exemplo)
                            </label>
                            <input
                              id="admin-test-email"
                              type="email"
                              value={testEmailTarget}
                              onChange={(e) => setTestEmailTarget(e.target.value)}
                              placeholder={store.email.officialEmail || 'seuemail@gmail.com'}
                              className="w-full h-10 px-3 rounded bg-[#0B0D10] border border-[#272D38] text-xs text-white"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={testEmailSending}
                            onClick={async () => {
                              const target = (
                                testEmailTarget ||
                                store.email.officialEmail ||
                                ''
                              ).trim();
                              setTestEmailSending(true);
                              const res = await sendTestEmailForTemplate(
                                store.email,
                                activeMeta.id,
                                target
                              );
                              setTestEmailSending(false);
                              setTestEmailFeedbackByTab((prev) => ({
                                ...prev,
                                [activeMeta.id]: { ok: res.ok, msg: res.message },
                              }));
                              notify(res.message, res.ok);
                            }}
                            className="w-full sm:w-auto h-10 px-4 rounded bg-[#00E676] hover:bg-[#00cf6a] disabled:opacity-50 font-display font-extrabold text-xs uppercase tracking-wider text-[#0B0D10] inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                          >
                            {testEmailSending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            <span>
                              {testEmailSending
                                ? 'Enviando Teste...'
                                : 'Enviar Teste Deste Modelo'}
                            </span>
                          </button>
                        </div>

                        {activeFeedback && (
                          <div
                            className={`p-3 rounded border text-xs font-medium ${
                              activeFeedback.ok
                                ? 'bg-[#00E676]/15 border-[#00E676]/50 text-[#00E676]'
                                : 'bg-red-950/70 border-red-500/60 text-red-200'
                            }`}
                          >
                            {activeFeedback.msg}
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded font-display font-bold text-xs sm:text-sm uppercase tracking-wider text-white hover:opacity-95"
                  style={{ backgroundColor: accentColor }}
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Configurações de E-mail</span>
                </button>
              </div>
            </div>

            {/* Orders List */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#272D38] pb-2">
                <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white">
                  Pedidos Recebidos ({store.orders.length})
                </h2>
              </div>

              {store.orders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <ShoppingBag className="w-8 h-8 mx-auto opacity-60" />
                  <p className="text-sm">Nenhum pedido recebido ainda nesta loja.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {store.orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 rounded bg-[#0B0D10] border border-[#272D38] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#272D38] pb-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-display font-extrabold text-lg text-white">
                              Pedido #{order.id}
                            </span>
                            <span className="text-xs text-slate-400 font-mono-num">
                              {new Date(order.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">
                            {order.customer.fullName} · CPF/CNPJ: {order.customer.document} · E-mail NF-e:{' '}
                            {order.customer.email}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-display font-bold uppercase tracking-wider border ${
                              order.status === 'Cancelado'
                                ? 'bg-red-950/60 border-red-500/50 text-red-300'
                                : 'bg-[#00E676]/10 border-[#00E676]/40 text-[#00E676]'
                            }`}
                          >
                            {order.status}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              const text = formatNfeClipboardText(order);
                              navigator.clipboard?.writeText(text);
                              setCopiedOrderId(order.id);
                              setTimeout(() => setCopiedOrderId(null), 2500);
                            }}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded bg-[#161A20] border border-[#272D38] hover:border-slate-500 font-display font-bold text-xs uppercase tracking-wider text-slate-200"
                          >
                            {copiedOrderId === order.id ? (
                              <Check className="w-3.5 h-3.5 text-[#00E676]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {copiedOrderId === order.id
                                ? 'Dados Copiados!'
                                : 'Copiar Dados para Emissor NF-e'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <p className="text-slate-400 font-semibold uppercase text-[11px]">
                            Itens do Pedido
                          </p>
                          {order.items.map((item, idx) => (
                            <div key={idx} className="text-slate-200 font-mono-num">
                              {item.quantity}x [{item.sku}] {item.name}
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-400 font-semibold uppercase text-[11px]">
                            Entrega & Pagamento
                          </p>
                          <p className="text-slate-200">
                            {order.customer.street}, {order.customer.number}{' '}
                            {order.customer.complement && `(${order.customer.complement})`} -{' '}
                            {order.customer.neighborhood}, {order.customer.city}/
                            {order.customer.state} · CEP {order.customer.cep}
                          </p>
                          <p className="text-slate-300">
                            WhatsApp: {order.customer.whatsapp} · Frete: {order.shippingLabel} (
                            {formatBRL(order.shippingCost)})
                          </p>
                          <p className="text-[#00E676] font-mono-num font-bold text-sm pt-1">
                            Total: {formatBRL(order.totalAmount)} (
                            {order.paymentMethod === 'pix'
                              ? 'PIX'
                              : order.paymentMethod === 'credit_card'
                              ? `Cartão ${order.installments}x`
                              : 'Link Externo'}
                            )
                          </p>
                        </div>
                      </div>

                      {/* Side-by-Side Fulfillment & Client Email Notification Controls */}
                      {(() => {
                        const draftStatus = statusDrafts[order.id] ?? order.status;
                        const draftTracking =
                          trackingDrafts[order.id] !== undefined
                            ? trackingDrafts[order.id]
                            : order.trackingCode || '';
                        const draftNfe =
                          nfeDrafts[order.id] !== undefined
                            ? nfeDrafts[order.id]
                            : order.nfeInfo || 'Emitida e enviada para o seu e-mail';
                        const isSending = notifyingOrderId === order.id;
                        const rowFeedback = orderEmailFeedback[order.id];

                        return (
                          <div className="pt-3 border-t border-[#272D38] space-y-2.5">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                              <div className="md:col-span-3">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                  Status do Pedido
                                </label>
                                <select
                                  value={draftStatus}
                                  onChange={(e) =>
                                    setStatusDrafts((prev) => ({
                                      ...prev,
                                      [order.id]: e.target.value as OrderStatus,
                                    }))
                                  }
                                  className="w-full h-9 px-2.5 rounded bg-[#161A20] border border-[#272D38] text-xs font-semibold text-white"
                                >
                                  {ORDER_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="md:col-span-3">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                  Código de Rastreamento
                                </label>
                                <input
                                  type="text"
                                  value={draftTracking}
                                  onChange={(e) =>
                                    setTrackingDrafts((prev) => ({
                                      ...prev,
                                      [order.id]: e.target.value.toUpperCase(),
                                    }))
                                  }
                                  placeholder="Ex: AA123456789BR"
                                  className="w-full h-9 px-3 rounded bg-[#161A20] border border-[#272D38] text-xs font-mono-num uppercase text-white"
                                />
                              </div>

                              <div className="md:col-span-4">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                  Nota Fiscal (NF-e) e Anexo DANFE (.pdf)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={draftNfe}
                                    onChange={(e) =>
                                      setNfeDrafts((prev) => ({
                                        ...prev,
                                        [order.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Emitida e enviada para o seu e-mail"
                                    className="flex-1 min-w-0 h-9 px-3 rounded bg-[#161A20] border border-[#272D38] text-xs text-white"
                                  />
                                  <label
                                    className={`inline-flex items-center gap-1 h-9 px-2.5 rounded border text-[11px] font-semibold cursor-pointer shrink-0 transition-colors ${
                                      nfePdfDrafts[order.id]
                                        ? 'bg-blue-500/15 border-blue-500/60 text-blue-300'
                                        : 'bg-[#161A20] border-[#272D38] hover:border-blue-500/60 text-slate-200'
                                    }`}
                                    title="Anexar arquivo PDF da DANFE"
                                  >
                                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                                    <span>Anexar PDF (DANFE)</span>
                                    <input
                                      type="file"
                                      accept="application/pdf"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (
                                          file.type !== 'application/pdf' &&
                                          !file.name.toLowerCase().endsWith('.pdf')
                                        ) {
                                          notify('Selecione um arquivo .pdf válido da DANFE.', false);
                                          return;
                                        }
                                        readPdfFileAsBase64(file, (attachment) => {
                                          setNfePdfDrafts((prev) => ({
                                            ...prev,
                                            [order.id]: attachment,
                                          }));
                                          notify(`PDF "${attachment.fileName}" anexado ao pedido #${order.id}!`);
                                        });
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                </div>
                                {nfePdfDrafts[order.id] && (
                                  <div className="mt-1.5 flex items-center justify-between gap-2 px-2 py-1 rounded bg-blue-950/40 border border-blue-500/40 text-[11px] text-blue-200">
                                    <span
                                      className="truncate font-mono-num"
                                      title={nfePdfDrafts[order.id].fileName}
                                    >
                                      PDF: {nfePdfDrafts[order.id].fileName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setNfePdfDrafts((prev) => {
                                          const next = { ...prev };
                                          delete next[order.id];
                                          return next;
                                        })
                                      }
                                      className="text-slate-400 hover:text-red-400 shrink-0"
                                      title="Remover PDF anexado"
                                      aria-label="Remover PDF anexado"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="md:col-span-2">
                                <button
                                  type="button"
                                  disabled={isSending}
                                  onClick={async () => {
                                    const updates = {
                                      status: draftStatus,
                                      trackingCode: draftTracking.trim(),
                                      nfeInfo: draftNfe.trim(),
                                    };
                                    onUpdateOrderFulfillment(order.id, updates);

                                    const updatedSnapshot = {
                                      ...order,
                                      ...updates,
                                    };

                                    setNotifyingOrderId(order.id);
                                    const res = await sendOrderUpdateEmail(
                                      store.email,
                                      updatedSnapshot
                                    );
                                    setNotifyingOrderId(null);

                                    setOrderEmailFeedback((prev) => ({
                                      ...prev,
                                      [order.id]: { ok: res.ok, msg: res.message },
                                    }));
                                    notify(res.message, res.ok);
                                  }}
                                  className="w-full h-9 px-3 rounded font-display font-extrabold text-xs uppercase tracking-wider text-white inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95 disabled:opacity-50"
                                  style={{ backgroundColor: accentColor }}
                                >
                                  {isSending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  <span className="truncate">
                                    {isSending
                                      ? 'Enviando...'
                                      : 'Salvar e Notificar Cliente por E-mail'}
                                  </span>
                                </button>
                              </div>
                            </div>

                            {/* Quick Template Dispatch Buttons */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <span className="text-[11px] font-semibold text-slate-400 mr-1">
                                Disparos Rápidos (por modelo):
                              </span>

                              <button
                                type="button"
                                disabled={isSending}
                                onClick={async () => {
                                  const nextStatus: OrderStatus =
                                    draftStatus === 'Pedido Realizado' || draftStatus === 'Cancelado'
                                      ? 'Pagamento Aprovado'
                                      : draftStatus;
                                  const updates = {
                                    status: nextStatus,
                                    trackingCode: draftTracking.trim(),
                                    nfeInfo: draftNfe.trim(),
                                  };
                                  setStatusDrafts((prev) => ({ ...prev, [order.id]: nextStatus }));
                                  onUpdateOrderFulfillment(order.id, updates);

                                  setNotifyingOrderId(order.id);
                                  const res = await sendOrderTemplateEmail(
                                    store.email,
                                    { ...order, ...updates },
                                    'orderConfirmed'
                                  );
                                  setNotifyingOrderId(null);
                                  setOrderEmailFeedback((prev) => ({
                                    ...prev,
                                    [order.id]: { ok: res.ok, msg: res.message },
                                  }));
                                  notify(res.message, res.ok);
                                }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-[#161A20] border border-[#00E676]/50 hover:bg-[#00E676]/10 text-[11px] font-display font-bold uppercase tracking-wider text-[#00E676] disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Notificar Aprovação</span>
                              </button>

                              <button
                                type="button"
                                disabled={isSending}
                                onClick={async () => {
                                  if (!draftTracking.trim()) {
                                    const errMsg =
                                      'Informe o Código de Rastreamento no campo acima antes de clicar em Enviar Rastreio.';
                                    setOrderEmailFeedback((prev) => ({
                                      ...prev,
                                      [order.id]: { ok: false, msg: errMsg },
                                    }));
                                    notify(errMsg, false);
                                    return;
                                  }
                                  const nextStatus: OrderStatus =
                                    draftStatus === 'Pedido Realizado' ||
                                    draftStatus === 'Pagamento Aprovado' ||
                                    draftStatus === 'Em Separação'
                                      ? 'Produto Enviado'
                                      : draftStatus;
                                  const updates = {
                                    status: nextStatus,
                                    trackingCode: draftTracking.trim(),
                                    nfeInfo: draftNfe.trim(),
                                  };
                                  setStatusDrafts((prev) => ({ ...prev, [order.id]: nextStatus }));
                                  onUpdateOrderFulfillment(order.id, updates);

                                  setNotifyingOrderId(order.id);
                                  const res = await sendOrderTemplateEmail(
                                    store.email,
                                    { ...order, ...updates },
                                    'orderShipped'
                                  );
                                  setNotifyingOrderId(null);
                                  setOrderEmailFeedback((prev) => ({
                                    ...prev,
                                    [order.id]: { ok: res.ok, msg: res.message },
                                  }));
                                  notify(res.message, res.ok);
                                }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-[#161A20] border border-[#FF6500]/60 hover:bg-[#FF6500]/10 text-[11px] font-display font-bold uppercase tracking-wider text-[#FF6500] disabled:opacity-50 transition-colors"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Enviar Rastreio</span>
                              </button>

                              <button
                                type="button"
                                disabled={isSending}
                                onClick={async () => {
                                  const resolvedNfe =
                                    draftNfe.trim() || 'Emitida e enviada para o seu e-mail';
                                  const updates = {
                                    status: draftStatus,
                                    trackingCode: draftTracking.trim(),
                                    nfeInfo: resolvedNfe,
                                  };
                                  setNfeDrafts((prev) => ({ ...prev, [order.id]: resolvedNfe }));
                                  onUpdateOrderFulfillment(order.id, updates);

                                  const attachedPdf = nfePdfDrafts[order.id] || null;
                                  setNotifyingOrderId(order.id);
                                  const res = await sendOrderTemplateEmail(
                                    store.email,
                                    { ...order, ...updates },
                                    'nfeIssued',
                                    { pdfAttachment: attachedPdf }
                                  );
                                  setNotifyingOrderId(null);
                                  setOrderEmailFeedback((prev) => ({
                                    ...prev,
                                    [order.id]: { ok: res.ok, msg: res.message },
                                  }));
                                  notify(res.message, res.ok);
                                }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-[#161A20] border border-blue-500/60 hover:bg-blue-500/10 text-[11px] font-display font-bold uppercase tracking-wider text-blue-400 disabled:opacity-50 transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Enviar Aviso NF-e</span>
                              </button>
                            </div>

                            {rowFeedback && (
                              <div
                                className={`px-3 py-2 rounded border text-xs font-medium ${
                                  rowFeedback.ok
                                    ? 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
                                    : 'bg-red-950/70 border-red-500/60 text-red-200'
                                }`}
                              >
                                {rowFeedback.msg}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Registered Customers Overview */}
            <div className="bg-[#161A20] border border-[#272D38] rounded-md p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-[#272D38] pb-2">
                <Users className="w-5 h-5" style={{ color: accentColor }} />
                <h2 className="font-display font-bold text-lg uppercase tracking-wider text-white">
                  Clientes Cadastrados ({store.customers.length})
                </h2>
              </div>

              {store.customers.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Nenhum cliente criou conta na Área do Cliente ainda.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {store.customers.map((cli) => (
                    <div
                      key={cli.id}
                      className="p-3.5 rounded bg-[#0B0D10] border border-[#272D38] text-xs space-y-1"
                    >
                      <div className="font-semibold text-white">{cli.fullName}</div>
                      <div className="font-mono-num text-slate-400">
                        CPF/CNPJ: {cli.document}
                      </div>
                      <div className="text-slate-300 truncate">{cli.email}</div>
                      <div className="text-slate-400 font-mono-num">{cli.whatsapp}</div>
                      <div className="text-[11px] text-[#00E676] pt-1">
                        {cli.addresses.length} endereço(s) · {cli.favoriteProductIds.length} favorito(s)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Save Changes Bar */}
        <div className="mt-8 bg-[#161A20] border border-[#272D38] rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {hasUnsavedChanges ? (
              <span className="text-amber-400 font-semibold">
                Você possui alterações pendentes nesta sessão. Clique ao lado para confirmar o salvamento.
              </span>
            ) : justSaved ? (
              <span className="text-[#00E676] font-semibold">
                Alterações salvas com sucesso no painel administrativo!
              </span>
            ) : (
              <span className="text-slate-400">
                {lastSavedAt
                  ? `Último salvamento confirmado às ${lastSavedAt}.`
                  : 'Todas as configurações estão sincronizadas.'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveChanges}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded font-display font-extrabold text-sm uppercase tracking-wider transition-all ${
              justSaved
                ? 'bg-[#00E676] text-[#0B0D10]'
                : 'text-white hover:opacity-95'
            }`}
            style={!justSaved ? { backgroundColor: accentColor } : undefined}
          >
            {justSaved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{justSaved ? 'Alterações Salvas!' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
