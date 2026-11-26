export type Department =
  | 'TODOS'
  | 'OFERTAS RELÂMPAGO'
  | 'PERIFÉRICOS'
  | 'MOUSES'
  | 'TECLADOS'
  | 'HEADSETS'
  | 'COMBOS GAMER'
  | 'SSDs & MEMÓRIAS';

export type ProductCategory =
  | 'Mouses'
  | 'Teclados'
  | 'Headsets'
  | 'Combos Gamer'
  | 'SSDs & Memórias'
  | 'Periféricos';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  oldPrice?: number;
  costPrice: number;
  basePrice: number;
  weightGrams: number;
  stock: number;
  imageUrl: string;
  description: string;
  externalCheckoutUrl?: string;
  isFlashDeal: boolean;
  isBestSeller: boolean;
}

export interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetDepartment: Department;
  linkUrl?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  active: boolean;
}

export type TopPromoSpeed = 'slow' | 'normal' | 'fast' | 'fixed';

export interface VisualConfig {
  logoUrl: string;
  topPromoText: string;
  topPromoNotices: string[];
  topPromoSpeed: TopPromoSpeed;
  accentColor: string;
  banners: BannerSlide[];
  mobileBannerUrl: string;
  flashSaleEnabled: boolean;
  flashSaleTitle: string;
  flashSaleEndTime: string; // ISO timestamp
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrderValue: number;
  active: boolean;
}

export type CardBrand = 'Visa' | 'Mastercard' | 'Elo' | 'Hipercard' | 'Amex';

export type CardGatewayProvider =
  | 'InfinitePay'
  | 'Mercado Pago'
  | 'PagBank'
  | 'Asaas'
  | 'Outro Link de Pagamento';

export interface PaymentConfig {
  pixDiscountPercent: number;
  creditCardEnabled: boolean;
  gatewayProvider: CardGatewayProvider;
  creditCardInstructions: string;
  maxInstallments: number;
  interestFreeInstallments: number;
  monthlyInterestRate: number;
  installmentRates: Record<number, number>;
  minInstallmentValue: number;
  acceptedCardBrands: CardBrand[];
  pixKey: string;
  pixKeyType: 'CNPJ' | 'CPF' | 'E-mail' | 'Telefone' | 'Aleatória';
  pixBeneficiary: string;
  pixBank: string;
  defaultExternalCheckoutUrl: string;
}

export type RegionKey = 'sul' | 'sudeste' | 'centroOeste' | 'nordeste' | 'norte';

export interface ShippingConfig {
  originCep: string;
  freeShippingMinValue: number;
  freeShippingScope: 'brasil' | 'sul_pr';
  regionRates: Record<RegionKey, number>;
  expressRegionRates: Record<RegionKey, number>;
  additionalKgRate: number;
  cascavelPickupEnabled: boolean;
  cascavelPickupAddress: string;
  cascavelMotoboyEnabled: boolean;
  cascavelMotoboyFee: number;
}

export interface FiscalConfig {
  cnpj: string;
  corporateName: string;
  stateRegistration: string;
  whatsappNumber: string;
  adminUsername: string;
  adminPassword: string;
  storeEmail: string;
  storeCityState: string;
}

export type EmailTemplateKey =
  | 'verification'
  | 'orderConfirmed'
  | 'orderShipped'
  | 'nfeIssued';

export type EmailEditorMode = 'simple' | 'html';

export interface EmailTemplateConfig {
  enabled: boolean;
  editorMode: EmailEditorMode;
  subject: string;
  title: string;
  message: string;
  badgeColor: string;
  customHtml: string;
}

export interface EmailConfig {
  officialEmail: string;
  emailVerificationEnabled: boolean;
  gmailScriptUrl: string;
  emailLogoUrl: string;
  templates: Record<EmailTemplateKey, EmailTemplateConfig>;
}

export type PaymentMethod = 'pix' | 'credit_card' | 'external_link';

export type ShippingMethod = 'economic' | 'express' | 'motoboy_cascavel' | 'pickup_cascavel';

export interface ViaCepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface OrderItemSnapshot {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitBasePrice: number;
  unitPixPrice: number;
}

export interface CustomerFiscalData {
  fullName: string;
  document: string; // CPF or CNPJ
  email: string;
  whatsapp: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export type OrderTimelineStage =
  | 'Pedido Realizado'
  | 'Pagamento Aprovado'
  | 'Em Separação'
  | 'Produto Enviado'
  | 'Produto Entregue';

export type OrderStatus = OrderTimelineStage | 'Cancelado';

export interface SavedAddress {
  id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
}

export interface CustomerAccount {
  id: string;
  fullName: string;
  document: string;
  email: string;
  whatsapp: string;
  password: string;
  addresses: SavedAddress[];
  favoriteProductIds: string[];
  createdAt: string;
}

export interface Order {
  id: string;
  createdAt: string;
  customerId?: string;
  status: OrderStatus;
  statusHistory?: Partial<Record<OrderTimelineStage, string>>;
  trackingCode?: string;
  nfeInfo?: string;
  items: OrderItemSnapshot[];
  subtotalBase: number;
  discountCouponCode?: string;
  discountCouponAmount: number;
  pixDiscountAmount: number;
  shippingMethod: ShippingMethod;
  shippingLabel: string;
  shippingCost: number;
  paymentMethod: PaymentMethod;
  installments: number;
  installmentValue: number;
  totalAmount: number;
  customer: CustomerFiscalData;
}

export interface StoreState {
  visual: VisualConfig;
  products: Product[];
  coupons: Coupon[];
  pixDiscountPercent: number; // mirrored/synced helper
  payment: PaymentConfig;
  shipping: ShippingConfig;
  fiscal: FiscalConfig;
  email: EmailConfig;
  orders: Order[];
  customers: CustomerAccount[];
}
