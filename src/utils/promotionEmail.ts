import type { CustomerAccount, Order, PromotionEmailConfig } from '../types/store';

export const CAMPAIGN_LIMIT = 100;
export const CAMPAIGN_INTERVAL_MS = 2_000;
export const CAMPAIGN_ENDPOINT = '/api/promotion-email';
export const PROMOTION_VARIABLES = ['titulo_oferta', 'mensagem_oferta', 'cupom', 'link_loja', 'cliente'] as const;

export type PromotionAudience = 'all' | 'never' | 'inactive';
export type PromotionRecipient = { email: string; name: string };
export type CampaignQuota = { sent: number; remaining: number };

export const isRecipientEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email);

const normalizeEmail = (email?: string) => typeof email === 'string' ? email.trim().toLowerCase() : '';

export function selectPromotionRecipients(
  customers: CustomerAccount[],
  orders: Order[],
  audience: PromotionAudience,
  now = Date.now(),
): PromotionRecipient[] {
  const lastPurchaseById = new Map<string, number>();
  const lastPurchaseByEmail = new Map<string, number>();
  for (const order of orders) {
    if (order.status === 'Cancelado' || order.status === 'Pedido Realizado' && !order.statusHistory?.['Pagamento Aprovado']) continue;
    const parsed = Date.parse(order.createdAt);
    const date = Number.isFinite(parsed) ? parsed : now;
    const email = normalizeEmail(order.customer?.email);
    if (order.customerId) {
      lastPurchaseById.set(order.customerId, Math.max(date, lastPurchaseById.get(order.customerId) ?? -Infinity));
    }
    if (isRecipientEmail(email)) {
      lastPurchaseByEmail.set(email, Math.max(date, lastPurchaseByEmail.get(email) ?? -Infinity));
    }
  }

  const cutoff = now - 30 * 86_400_000;
  const grouped = new Map<string, PromotionRecipient & { lastPurchase: number }>();
  for (const customer of customers) {
    const email = normalizeEmail(customer.email);
    if (!isRecipientEmail(email)) continue;
    const name = customer.fullName?.trim() || 'Cliente';
    const lastPurchase = Math.max(
      lastPurchaseById.get(customer.id) ?? -Infinity,
      lastPurchaseByEmail.get(email) ?? -Infinity,
      grouped.get(email)?.lastPurchase ?? -Infinity,
    );
    grouped.set(email, { email, name, lastPurchase });
  }

  return [...grouped.values()]
    .filter(({ lastPurchase }) => audience === 'all' || (
      audience === 'never' ? lastPurchase === -Infinity : lastPurchase > -Infinity && lastPurchase < cutoff
    ))
    .map(({ email, name }) => ({ email, name }));
}

export function getPromotionDestination(value: string, origin: string): string | null {
  try {
    const url = new URL(value.trim() || '/', origin);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] ?? char);

export function renderPromotionEmail(config: PromotionEmailConfig, name: string, destination: string) {
  const vars: Record<string, string> = {
    titulo_oferta: config.title,
    mensagem_oferta: config.message,
    cupom: config.coupon,
    link_loja: destination,
    cliente: name,
  };
  const render = (text: string, html: boolean) => text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    if (!Object.hasOwn(vars, key)) return match;
    return html ? escapeHtml(vars[key]) : vars[key];
  });
  const simpleHtml = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0B0D10;color:#fff;font:16px Arial,sans-serif">
    <table role="presentation" width="100%"><tr><td align="center" style="padding:24px">
    <table role="presentation" width="100%" style="max-width:520px;background:#161A20;border-top:3px solid #FF6500"><tr><td style="padding:28px">
    <p style="color:#FF6500;font-weight:bold">BTHTECH · OFERTAS</p><h1>{{titulo_oferta}}</h1><p>Olá, {{cliente}}!</p>
    <p style="white-space:pre-line">{{mensagem_oferta}}</p>${config.coupon.trim() ? '<p>Cupom: <strong>{{cupom}}</strong></p>' : ''}
    <p><a href="{{link_loja}}" style="display:inline-block;background:#FF6500;color:#0B0D10;padding:12px 18px;font-weight:bold;text-decoration:none">Ver oferta</a></p>
    </td></tr></table></td></tr></table></body></html>`;

  return {
    subject: render(config.subject, false).replace(/[\r\n]+/g, ' ').trim(),
    html: render(config.editorMode === 'html' ? config.customHtml : simpleHtml, true),
  };
}
