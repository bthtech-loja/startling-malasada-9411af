import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_STORE_STATE } from '../data/initialStore';
import {
  CartItem,
  CustomerAccount,
  EmailConfig,
  EmailTemplateKey,
  Order,
  OrderStatus,
  OrderTimelineStage,
  Product,
  StoreState,
} from '../types/store';
import { roundCurrency } from '../utils/formatters';

// Storage version: bump these keys whenever the default store data (src/data/initialStore.ts)
// changes, so every browser discards its old cached copy and loads the new defaults.
const STORE_STORAGE_KEY = 'bthtech_oficial_v5';
const CART_STORAGE_KEY = 'bthtech_oficial_v5_cart';
const ACTIVE_CUSTOMER_KEY = 'bthtech_oficial_v5_active_customer';

// Keys from previous versions, removed on load so stale data never resurfaces.
const LEGACY_STORAGE_KEYS = [
  'bthtech_store_v1',
  'bthtech_cart_v1',
  'bthtech_active_customer_v1',
  'bthtech_store_v2',
  'bthtech_cart_v2',
  'bthtech_active_customer_v2',
];

function purgeLegacyStorage() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable (private mode); nothing to clean up
  }
}

purgeLegacyStorage();

export const ORDER_TIMELINE_STAGES: OrderTimelineStage[] = [
  'Pedido Realizado',
  'Pagamento Aprovado',
  'Em Separação',
  'Produto Enviado',
  'Produto Entregue',
];

function normalizeOrderStatus(rawStatus: string): OrderStatus {
  switch (rawStatus) {
    case 'Aguardando Pagamento':
    case 'Pedido Realizado':
      return 'Pedido Realizado';
    case 'Pagamento Aprovado':
      return 'Pagamento Aprovado';
    case 'Pago / Em Separação':
    case 'Em Separação':
      return 'Em Separação';
    case 'NF-e Emitida / Enviado':
    case 'Produto Enviado':
      return 'Produto Enviado';
    case 'Concluído':
    case 'Produto Entregue':
      return 'Produto Entregue';
    case 'Cancelado':
      return 'Cancelado';
    default:
      return 'Pedido Realizado';
  }
}

function buildUpdatedStatusHistory(
  existing: Partial<Record<OrderTimelineStage, string>> | undefined,
  status: OrderStatus,
  fallbackCreatedAt: string
): Partial<Record<OrderTimelineStage, string>> {
  const next: Partial<Record<OrderTimelineStage, string>> = {
    'Pedido Realizado': existing?.['Pedido Realizado'] || fallbackCreatedAt,
    ...(existing || {}),
  };
  if (status === 'Cancelado') return next;
  const targetIdx = ORDER_TIMELINE_STAGES.indexOf(status);
  const nowIso = new Date().toISOString();
  ORDER_TIMELINE_STAGES.forEach((stage, idx) => {
    if (idx <= targetIdx && !next[stage]) {
      next[stage] = idx === targetIdx ? nowIso : fallbackCreatedAt;
    }
  });
  // Update exact timestamp for the newly selected active stage
  next[status] = nowIso;
  return next;
}

function normalizeOrders(rawOrders: unknown): Order[] {
  if (!Array.isArray(rawOrders)) return INITIAL_STORE_STATE.orders;
  return rawOrders.map((o) => {
    const order = o as Order;
    const normalizedStatus = normalizeOrderStatus(String(order.status || 'Pedido Realizado'));
    const history: Partial<Record<OrderTimelineStage, string>> = {
      'Pedido Realizado': order.statusHistory?.['Pedido Realizado'] || order.createdAt,
      ...(order.statusHistory || {}),
    };
    if (normalizedStatus !== 'Cancelado') {
      const idx = ORDER_TIMELINE_STAGES.indexOf(normalizedStatus);
      ORDER_TIMELINE_STAGES.forEach((stage, sIdx) => {
        if (sIdx <= idx && !history[stage]) {
          history[stage] = order.createdAt;
        }
      });
    }
    return {
      ...order,
      status: normalizedStatus,
      statusHistory: history,
      trackingCode: order.trackingCode || '',
      nfeInfo: order.nfeInfo || '',
    };
  });
}

function normalizeEmailConfig(rawEmail: unknown): EmailConfig {
  const emailObj = (rawEmail || {}) as Partial<EmailConfig> & { emailJsEnabled?: boolean };
  const defaults = INITIAL_STORE_STATE.email;
  const rawTemplates = (emailObj.templates || {}) as Partial<
    Record<EmailTemplateKey, Partial<EmailConfig['templates'][EmailTemplateKey]>>
  >;

  const mergeTemplate = (key: EmailTemplateKey) => {
    const def = defaults.templates[key];
    const custom = rawTemplates[key];
    return {
      ...def,
      ...(custom || {}),
      editorMode: custom?.editorMode === 'html' ? ('html' as const) : ('simple' as const),
      customHtml: typeof custom?.customHtml === 'string' ? custom.customHtml : '',
    };
  };

  return {
    ...defaults,
    ...emailObj,
    emailVerificationEnabled:
      typeof emailObj.emailVerificationEnabled === 'boolean'
        ? emailObj.emailVerificationEnabled
        : Boolean(emailObj.emailJsEnabled),
    emailLogoUrl: emailObj.emailLogoUrl || defaults.emailLogoUrl,
    templates: {
      verification: mergeTemplate('verification'),
      orderConfirmed: mergeTemplate('orderConfirmed'),
      orderShipped: mergeTemplate('orderShipped'),
      nfeIssued: mergeTemplate('nfeIssued'),
    },
  };
}

function loadInitialStore(): StoreState {
  try {
    const raw = localStorage.getItem(STORE_STORAGE_KEY);
    if (!raw) return INITIAL_STORE_STATE;
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    const rawTopPromo = parsed.visual?.topPromoText;
    const cleanedTopPromo =
      typeof rawTopPromo === 'string'
        ? rawTopPromo
            .replace(/\s*•\s*NOTA FISCAL \(NF-e\) EM TODOS OS PEDIDOS/gi, '')
            .replace(/NOTA FISCAL \(NF-e\) EM TODOS OS PEDIDOS\s*•?\s*/gi, '')
            .trim()
        : INITIAL_STORE_STATE.visual.topPromoText;

    const resolvedNotices = Array.isArray(parsed.visual?.topPromoNotices)
      ? parsed.visual.topPromoNotices
      : cleanedTopPromo
      ? cleanedTopPromo
          .split('•')
          .map((s) => s.trim())
          .filter(Boolean)
      : INITIAL_STORE_STATE.visual.topPromoNotices;

    return {
      ...INITIAL_STORE_STATE,
      ...parsed,
      visual: {
        ...INITIAL_STORE_STATE.visual,
        ...(parsed.visual || {}),
        topPromoText: cleanedTopPromo,
        topPromoNotices: resolvedNotices,
        banners:
          Array.isArray(parsed.visual?.banners) && parsed.visual.banners.length > 0
            ? parsed.visual.banners
            : INITIAL_STORE_STATE.visual.banners,
      },
      payment: {
        ...INITIAL_STORE_STATE.payment,
        ...(parsed.payment || {}),
        installmentRates: {
          ...INITIAL_STORE_STATE.payment.installmentRates,
          ...(parsed.payment?.installmentRates || {}),
        },
        acceptedCardBrands: Array.isArray(parsed.payment?.acceptedCardBrands)
          ? parsed.payment.acceptedCardBrands
          : INITIAL_STORE_STATE.payment.acceptedCardBrands,
      },
      shipping: {
        ...INITIAL_STORE_STATE.shipping,
        ...(parsed.shipping || {}),
        regionRates: {
          ...INITIAL_STORE_STATE.shipping.regionRates,
          ...(parsed.shipping?.regionRates || {}),
        },
        expressRegionRates: {
          ...INITIAL_STORE_STATE.shipping.expressRegionRates,
          ...(parsed.shipping?.expressRegionRates || {}),
        },
      },
      fiscal: { ...INITIAL_STORE_STATE.fiscal, ...(parsed.fiscal || {}) },
      email: normalizeEmailConfig(parsed.email),
      products:
        Array.isArray(parsed.products) && parsed.products.length > 0
          ? parsed.products.map((prod) => {
              const def = INITIAL_STORE_STATE.products.find((d) => d.id === prod.id);
              return {
                ...prod,
                costPrice:
                  typeof prod.costPrice === 'number'
                    ? prod.costPrice
                    : def?.costPrice ?? roundCurrency((prod.basePrice || 0) * 0.65),
                weightGrams: prod.weightGrams ?? def?.weightGrams ?? 400,
              };
            })
          : INITIAL_STORE_STATE.products,
      coupons: Array.isArray(parsed.coupons) ? parsed.coupons : INITIAL_STORE_STATE.coupons,
      orders: normalizeOrders(parsed.orders),
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    };
  } catch {
    return INITIAL_STORE_STATE;
  }
}

function loadInitialCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadActiveCustomerId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CUSTOMER_KEY);
  } catch {
    return null;
  }
}

export function useStore() {
  const [store, setStore] = useState<StoreState>(loadInitialStore);
  const [cart, setCart] = useState<CartItem[]>(loadInitialCart);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(loadActiveCustomerId);

  const currentCustomer = useMemo(() => {
    if (!activeCustomerId) return null;
    return store.customers.find((c) => c.id === activeCustomerId) || null;
  }, [store.customers, activeCustomerId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Ignore storage quota warnings gracefully
    }
  }, [store]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota warnings gracefully
    }
  }, [cart]);

  useEffect(() => {
    try {
      if (activeCustomerId) {
        localStorage.setItem(ACTIVE_CUSTOMER_KEY, activeCustomerId);
      } else {
        localStorage.removeItem(ACTIVE_CUSTOMER_KEY);
      }
    } catch {
      // Ignore storage warnings
    }
  }, [activeCustomerId]);

  useEffect(() => {
    document.documentElement.style.setProperty('--bthtech-accent', store.visual.accentColor || '#FF6500');
  }, [store.visual.accentColor]);

  const addToCart = useCallback((productId: string, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + qty }
            : item
        );
      }
      return [...prev, { productId, quantity: qty }];
    });
  }, []);

  const updateCartQty = useCallback((productId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.productId !== productId);
      }
      return prev.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      );
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const createOrder = useCallback((order: Order) => {
    setStore((prev) => {
      const updatedProducts = prev.products.map((prod) => {
        const bought = order.items.find((i) => i.productId === prod.id);
        if (!bought) return prod;
        return {
          ...prod,
          stock: Math.max(0, prod.stock - bought.quantity),
        };
      });
      return {
        ...prev,
        products: updatedProducts,
        orders: [order, ...prev.orders],
      };
    });
  }, []);

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setStore((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              statusHistory: buildUpdatedStatusHistory(o.statusHistory, status, o.createdAt),
            }
          : o
      ),
    }));
  }, []);

  const updateOrderTracking = useCallback((orderId: string, trackingCode: string) => {
    setStore((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId ? { ...o, trackingCode: trackingCode.trim() } : o
      ),
    }));
  }, []);

  const updateOrderFulfillment = useCallback(
    (
      orderId: string,
      updates: { status: OrderStatus; trackingCode: string; nfeInfo: string }
    ): Order | null => {
      let updatedOrder: Order | null = null;
      setStore((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => {
          if (o.id !== orderId) return o;
          updatedOrder = {
            ...o,
            status: updates.status,
            statusHistory: buildUpdatedStatusHistory(o.statusHistory, updates.status, o.createdAt),
            trackingCode: updates.trackingCode.trim(),
            nfeInfo: updates.nfeInfo.trim(),
          };
          return updatedOrder;
        }),
      }));
      return updatedOrder;
    },
    []
  );

  const upsertProduct = useCallback((product: Product) => {
    setStore((prev) => {
      const exists = prev.products.some((p) => p.id === product.id);
      return {
        ...prev,
        products: exists
          ? prev.products.map((p) => (p.id === product.id ? product : p))
          : [product, ...prev.products],
      };
    });
  }, []);

  const deleteProduct = useCallback((productId: string) => {
    setStore((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== productId),
    }));
  }, []);

  const loginCustomer = useCallback(
    (identifier: string, password: string): { ok: boolean; message: string } => {
      const cleanId = identifier.trim().toLowerCase();
      const cleanDoc = identifier.replace(/\D/g, '');
      const found = store.customers.find(
        (c) =>
          c.email.trim().toLowerCase() === cleanId ||
          (cleanDoc.length >= 11 && c.document.replace(/\D/g, '') === cleanDoc)
      );
      if (!found || found.password !== password) {
        return { ok: false, message: 'E-mail/CPF ou senha inválidos.' };
      }
      setActiveCustomerId(found.id);
      return { ok: true, message: `Bem-vindo(a), ${found.fullName.split(' ')[0]}!` };
    },
    [store.customers]
  );

  const registerCustomer = useCallback(
    (
      payload: Omit<CustomerAccount, 'id' | 'createdAt' | 'favoriteProductIds'>
    ): { ok: boolean; message: string } => {
      const cleanEmail = payload.email.trim().toLowerCase();
      const cleanDoc = payload.document.replace(/\D/g, '');
      const duplicate = store.customers.find(
        (c) =>
          c.email.trim().toLowerCase() === cleanEmail ||
          (cleanDoc.length >= 11 && c.document.replace(/\D/g, '') === cleanDoc)
      );
      if (duplicate) {
        return {
          ok: false,
          message: 'Já existe uma conta cadastrada com este e-mail ou CPF/CNPJ.',
        };
      }
      const newCustomer: CustomerAccount = {
        ...payload,
        id: `cli-${Date.now()}`,
        favoriteProductIds: [],
        createdAt: new Date().toISOString(),
      };
      setStore((prev) => ({
        ...prev,
        customers: [newCustomer, ...prev.customers],
      }));
      setActiveCustomerId(newCustomer.id);
      return { ok: true, message: 'Conta criada com sucesso!' };
    },
    [store.customers]
  );

  const logoutCustomer = useCallback(() => {
    setActiveCustomerId(null);
  }, []);

  const updateCustomerAccount = useCallback((updated: CustomerAccount) => {
    setStore((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => (c.id === updated.id ? updated : c)),
    }));
  }, []);

  const toggleFavoriteProduct = useCallback(
    (productId: string): boolean => {
      if (!activeCustomerId) return false;
      setStore((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => {
          if (c.id !== activeCustomerId) return c;
          const exists = c.favoriteProductIds.includes(productId);
          return {
            ...c,
            favoriteProductIds: exists
              ? c.favoriteProductIds.filter((id) => id !== productId)
              : [...c.favoriteProductIds, productId],
          };
        }),
      }));
      return true;
    },
    [activeCustomerId]
  );

  const exportBackupJson = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      store,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bthtech-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  const importBackupJson = useCallback((jsonText: string): { ok: boolean; message: string } => {
    try {
      const parsed = JSON.parse(jsonText);
      const data = parsed.store ? parsed.store : parsed;
      if (!data || !Array.isArray(data.products) || !data.visual || !data.fiscal) {
        return { ok: false, message: 'Arquivo JSON inválido ou incompatível com o formato BTHTECH.' };
      }
      const importedNotices = Array.isArray(data.visual?.topPromoNotices)
        ? data.visual.topPromoNotices
        : typeof data.visual?.topPromoText === 'string' && data.visual.topPromoText.trim()
        ? data.visual.topPromoText
            .split('•')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : INITIAL_STORE_STATE.visual.topPromoNotices;

      setStore({
        ...INITIAL_STORE_STATE,
        ...data,
        visual: {
          ...INITIAL_STORE_STATE.visual,
          ...(data.visual || {}),
          topPromoNotices: importedNotices,
          banners: Array.isArray(data.visual?.banners)
            ? data.visual.banners
            : INITIAL_STORE_STATE.visual.banners,
        },
        payment: {
          ...INITIAL_STORE_STATE.payment,
          ...(data.payment || {}),
          installmentRates: {
            ...INITIAL_STORE_STATE.payment.installmentRates,
            ...(data.payment?.installmentRates || {}),
          },
          acceptedCardBrands: Array.isArray(data.payment?.acceptedCardBrands)
            ? data.payment.acceptedCardBrands
            : INITIAL_STORE_STATE.payment.acceptedCardBrands,
        },
        shipping: {
          ...INITIAL_STORE_STATE.shipping,
          ...(data.shipping || {}),
          regionRates: {
            ...INITIAL_STORE_STATE.shipping.regionRates,
            ...(data.shipping?.regionRates || {}),
          },
          expressRegionRates: {
            ...INITIAL_STORE_STATE.shipping.expressRegionRates,
            ...(data.shipping?.expressRegionRates || {}),
          },
        },
        fiscal: { ...INITIAL_STORE_STATE.fiscal, ...(data.fiscal || {}) },
        email: normalizeEmailConfig(data.email),
        products: data.products.map((prod: Product) => {
          const def = INITIAL_STORE_STATE.products.find((d) => d.id === prod.id);
          return {
            ...prod,
            costPrice:
              typeof prod.costPrice === 'number'
                ? prod.costPrice
                : def?.costPrice ?? roundCurrency((prod.basePrice || 0) * 0.65),
            weightGrams: prod.weightGrams ?? def?.weightGrams ?? 400,
          };
        }),
        orders: normalizeOrders(data.orders),
        customers: Array.isArray(data.customers) ? data.customers : [],
      });
      return { ok: true, message: 'Configurações, produtos, clientes e pedidos restaurados com sucesso!' };
    } catch {
      return { ok: false, message: 'Erro ao ler o arquivo JSON. Verifique se o arquivo está íntegro.' };
    }
  }, []);

  const saveStoreChanges = useCallback(
    (overrideStore?: StoreState): { ok: boolean; message: string } => {
      const target = overrideStore ?? store;
      try {
        localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(target));
        if (overrideStore) {
          setStore(overrideStore);
        }
        return { ok: true, message: 'Todas as alterações foram salvas com sucesso!' };
      } catch {
        return {
          ok: false,
          message:
            'Não foi possível salvar no armazenamento local (limite de espaço atingido). Exporte um Backup JSON.',
        };
      }
    },
    [store]
  );

  return {
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
  };
}
