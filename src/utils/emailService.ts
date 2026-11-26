import { INITIAL_STORE_STATE } from '../data/initialStore';
import {
  EmailConfig,
  EmailTemplateConfig,
  EmailTemplateKey,
  Order,
} from '../types/store';
import { formatBRL } from './formatters';

export interface PdfEmailAttachment {
  fileName: string;
  base64: string;
}

export interface GmailScriptPayload {
  to_email: string;
  subject: string;
  html_body: string;
  pdf_base64?: string;
  pdf_nome?: string;
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEscapedMultiline(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br />');
}

function sanitizeHexColor(color: string | undefined, fallback: string): string {
  const clean = (color || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(clean) || /^#[0-9A-Fa-f]{3}$/.test(clean)) {
    return clean;
  }
  return fallback;
}

export function resolveEmailTemplate(
  config: EmailConfig,
  key: EmailTemplateKey
): EmailTemplateConfig {
  const def = INITIAL_STORE_STATE.email.templates[key];
  const custom = config.templates?.[key];
  return {
    enabled: typeof custom?.enabled === 'boolean' ? custom.enabled : def.enabled,
    editorMode: custom?.editorMode === 'html' ? 'html' : 'simple',
    subject: custom?.subject?.trim() ? custom.subject : def.subject,
    title: custom?.title?.trim() ? custom.title : def.title,
    message: custom?.message?.trim() ? custom.message : def.message,
    badgeColor: sanitizeHexColor(custom?.badgeColor, def.badgeColor),
    customHtml: typeof custom?.customHtml === 'string' ? custom.customHtml : '',
  };
}

export function interpolateEmailVars(
  templateText: string,
  vars: Record<string, string>
): string {
  return templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, rawKey: string) => {
    const lower = rawKey.toLowerCase();
    return Object.prototype.hasOwnProperty.call(vars, lower) ? vars[lower] : match;
  });
}

function interpolateHtmlTemplate(
  rawHtml: string,
  textVars: Record<string, string>,
  rawHtmlVars: Record<string, string> = {}
): string {
  const escapedMap: Record<string, string> = {};
  Object.entries(textVars).forEach(([k, v]) => {
    escapedMap[k.toLowerCase()] = escapeHtml(v);
  });
  Object.entries(rawHtmlVars).forEach(([k, v]) => {
    escapedMap[k.toLowerCase()] = v;
  });
  return interpolateEmailVars(rawHtml, escapedMap);
}

function buildOrderItemsGridHtml(order: Order): string {
  return order.items
    .map((item) => {
      const cleanName = escapeHtml(item.name.replace(/^\d+\s*x\s+/i, '').trim());
      return `<tr>
  <td style="border-bottom: 1px solid #272D38; border-right: 1px solid #272D38; font-size: 12px; font-weight: bold; color: #FFFFFF; line-height: 1.4; padding: 10px;">${cleanName}</td>
  <td align="center" style="border-bottom: 1px solid #272D38; font-size: 13px; font-weight: bold; color: #FF6500; padding: 10px; vertical-align: middle;">${item.quantity} un.</td>
</tr>`;
    })
    .join('\n');
}

function buildCleanItemsListText(order: Order): string {
  return order.items
    .map((item) => item.name.replace(/^\d+\s*x\s+/i, '').trim())
    .join(', ');
}

function buildOrderItemsListHtml(order: Order): string {
  return order.items
    .map(
      (item) =>
        `<div style="margin:0 0 4px 0;font-size:12px;line-height:1.45;color:#E2E8F0;">• <strong style="color:#FFFFFF;">${escapeHtml(item.name.replace(/^\d+\s*x\s+/i, '').trim())}</strong> <span style="color:#FF6500;font-weight:bold;">(${item.quantity} un.)</span></div>`
    )
    .join('');
}

function getPaymentMethodLabel(order: Order): string {
  if (order.paymentMethod === 'pix') return 'PIX';
  if (order.paymentMethod === 'credit_card') {
    return `Cartão de Crédito ${order.installments}x`;
  }
  return 'Link de Pagamento';
}

function getCarrierLabel(order: Order): string {
  switch (order.shippingMethod) {
    case 'express':
      return 'SEDEX / Expresso';
    case 'economic':
      return 'PAC / Econômico';
    case 'motoboy_cascavel':
      return 'Motoboy Expresso (Cascavel-PR)';
    case 'pickup_cascavel':
      return 'Retirada no Balcão (Cascavel-PR)';
    default:
      return order.shippingLabel || 'Transportadora Padrão';
  }
}

function resolveNfeLinkUrl(nfeRaw: string): string {
  const urlMatch = nfeRaw.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    return urlMatch[0];
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/minha-conta`;
  }
  return 'https://bthtech.com.br/minha-conta';
}

function validateScriptAndRecipient(
  config: EmailConfig,
  toEmail: string
): { ok: true; url: string; to: string } | { ok: false; message: string } {
  const scriptUrl = (config.gmailScriptUrl || '').trim();
  const cleanEmail = (toEmail || '').trim();

  if (!scriptUrl) {
    return {
      ok: false,
      message:
        'Informe a URL do Disparador Gmail (Google Apps Script) nas configurações do /admin.',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(scriptUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Protocolo inválido');
    }
  } catch {
    return {
      ok: false,
      message: 'A URL do Disparador Gmail informada não é uma URL válida (https://...).',
    };
  }

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      ok: false,
      message: 'Informe um endereço de e-mail de destino válido.',
    };
  }

  return { ok: true, url: parsedUrl.toString(), to: cleanEmail };
}

async function postToGmailScript(
  scriptUrl: string,
  payload: GmailScriptPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    return { ok: true };
  } catch (err: unknown) {
    const anyErr = err as { message?: string };
    return {
      ok: false,
      error: anyErr?.message || 'Erro de rede ao chamar a URL do Google Apps Script.',
    };
  }
}

export function buildOtpEmailHtml(params: {
  customerName: string;
  verificationCode: string;
  logoUrl: string;
  officialEmail?: string;
  template?: EmailTemplateConfig;
}): string {
  const def = INITIAL_STORE_STATE.email.templates.verification;
  const tpl = params.template || def;
  const badgeColor = sanitizeHexColor(tpl.badgeColor, def.badgeColor);
  const vars = {
    cliente: params.customerName.trim() || 'Cliente',
    codigo: params.verificationCode.trim(),
    user_name: params.customerName.trim() || 'Cliente',
    verification_code: params.verificationCode.trim(),
    logo_url: (params.logoUrl || 'https://googleusercontent.com').trim(),
    email_oficial: (params.officialEmail || 'contato.bthtech@gmail.com').trim(),
  };

  if (tpl.editorMode === 'html' && tpl.customHtml.trim()) {
    return interpolateHtmlTemplate(tpl.customHtml, vars);
  }

  const renderedTitle = escapeHtml(interpolateEmailVars(tpl.title || def.title, vars));
  const renderedMessage = formatEscapedMultiline(
    interpolateEmailVars(tpl.message || def.message, vars)
  );
  const safeCode = escapeHtml(vars.codigo);
  const safeLogo = escapeHtml(vars.logo_url);
  const safeOfficialEmail = escapeHtml(vars.email_oficial);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Código de Verificação BTHTECH</title>
</head>
<body style="margin:0;padding:14px 8px;background-color:#0B0D10;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;margin:0 auto;background-color:#161A20;border:1px solid #272D38;border-radius:8px;overflow:hidden;">
    <tr>
      <td align="center" style="padding:22px 18px 16px 18px;background-color:#0B0D10;border-bottom:2px solid #FF6500;">
        <img src="${safeLogo}" width="200" alt="BTHTECH" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto 6px auto;border:0;color:#FF6500;font-size:20px;font-weight:bold;" />
        <div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#94A3B8;text-transform:uppercase;">
          BTHTECH
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 20px 22px 20px;">
        <div style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:4px;background-color:#0B0D10;border:1px solid ${badgeColor};color:${badgeColor};font-size:11px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;">
            Verificação de Cadastro
          </span>
        </div>
        <h1 style="margin:0 0 12px 0;font-size:19px;line-height:1.35;font-weight:bold;color:#FFFFFF;">
          ${renderedTitle}
        </h1>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.55;color:#CBD5E1;">
          ${renderedMessage}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0B0D10;border:1px solid ${badgeColor};border-radius:6px;">
          <tr>
            <td align="center" style="padding:18px 12px;">
              <span style="display:inline-block;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:bold;letter-spacing:8px;color:${badgeColor};">
                ${safeCode}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0 0;font-size:12px;line-height:1.5;color:#94A3B8;">
          Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:16px 20px;background-color:#0B0D10;border-top:1px solid #272D38;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#FF6500;font-weight:bold;">
          BTHTECH — A sua melhor loja em hardware e periféricos.
        </p>
        <p style="margin:0;font-size:11px;color:#94A3B8;">
          Atendimento: ${safeOfficialEmail}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getOrderVars(
  order: Order,
  logoUrl?: string,
  officialEmail?: string
): Record<string, string> {
  const tracking = (order.trackingCode || '').trim() || 'Aguardando postagem';
  const nfeRaw = (order.nfeInfo || '').trim();
  const nfeDisplay = nfeRaw || 'Emitida e enviada para o seu e-mail';
  const totalQty = order.items.reduce((acc, item) => acc + item.quantity, 0);
  const netItemsSubtotal = Math.max(
    0,
    order.subtotalBase - order.pixDiscountAmount - order.discountCouponAmount
  );
  const freteText = order.shippingCost <= 0 ? 'Grátis' : formatBRL(order.shippingCost);

  return {
    cliente: order.customer.fullName.trim() || 'Cliente',
    user_name: order.customer.fullName.trim() || 'Cliente',
    pedido: order.id,
    status: order.status,
    pagamento: getPaymentMethodLabel(order),
    itens: buildCleanItemsListText(order),
    quantidade: `${totalQty} un.`,
    subtotal: formatBRL(netItemsSubtotal),
    frete: freteText,
    total: formatBRL(order.totalAmount),
    rastreio: tracking,
    transportadora: getCarrierLabel(order),
    nfe: nfeDisplay,
    link_nfe_pdf: resolveNfeLinkUrl(nfeRaw),
    logo_url: (logoUrl || 'https://googleusercontent.com').trim(),
    email_oficial: (officialEmail || 'contato.bthtech@gmail.com').trim(),
  };
}

function getBadgeLabelForOrderTemplate(
  order: Order,
  templateKey: Exclude<EmailTemplateKey, 'verification'>
): string {
  if (order.status === 'Cancelado') return 'Pedido Cancelado';
  if (templateKey === 'nfeIssued') return 'Nota Fiscal (NF-e)';
  if (templateKey === 'orderShipped') {
    return order.status === 'Produto Entregue' ? 'Produto Entregue' : 'Pedido Enviado';
  }
  if (order.status === 'Em Separação') return 'Em Separação';
  if (order.status === 'Pagamento Aprovado') return 'Pagamento Aprovado';
  return 'Pedido Confirmado';
}

export function buildOrderTemplateEmailHtml(params: {
  order: Order;
  templateKey: Exclude<EmailTemplateKey, 'verification'>;
  template: EmailTemplateConfig;
  logoUrl: string;
  officialEmail?: string;
}): string {
  const { order, templateKey, template } = params;
  const vars = getOrderVars(order, params.logoUrl, params.officialEmail);
  const itemsGridHtml = buildOrderItemsGridHtml(order);

  if (template.editorMode === 'html' && template.customHtml.trim()) {
    return interpolateHtmlTemplate(template.customHtml, vars, {
      lista_itens_grade: itemsGridHtml,
    });
  }

  const isCanceled = order.status === 'Cancelado';
  const badgeColor = isCanceled
    ? '#EF4444'
    : sanitizeHexColor(template.badgeColor, '#00E676');
  const badgeLabel = escapeHtml(getBadgeLabelForOrderTemplate(order, templateKey));

  const titleText = isCanceled
    ? `Olá, ${vars.cliente}.`
    : interpolateEmailVars(template.title, vars);
  const messageText = isCanceled
    ? `Seu pedido #${vars.pedido} foi cancelado. Caso tenha dúvidas, entre em contato com o nosso atendimento.`
    : interpolateEmailVars(template.message, vars);

  const safeOrderId = escapeHtml(order.id);
  const safeLogo = escapeHtml(vars.logo_url);
  const safeOfficialEmail = escapeHtml(vars.email_oficial);

  const tracking = (order.trackingCode || '').trim();
  const nfe = (order.nfeInfo || '').trim();
  const nfeIsUrl = /^https?:\/\//i.test(nfe);
  const nfeValueHtml = nfe
    ? nfeIsUrl
      ? `<a href="${escapeHtml(nfe)}" target="_blank" style="color:#00E676;font-weight:bold;text-decoration:underline;word-break:break-all;">${escapeHtml(nfe)}</a>`
      : `<span style="color:#00E676;font-weight:bold;">${escapeHtml(nfe)}</span>`
    : `<span style="color:#94A3B8;">Em processamento</span>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(interpolateEmailVars(template.subject, vars))}</title>
</head>
<body style="margin:0;padding:14px 8px;background-color:#0B0D10;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;margin:0 auto;background-color:#161A20;border:1px solid #272D38;border-radius:8px;overflow:hidden;">
    <tr>
      <td align="center" style="padding:22px 18px 16px 18px;background-color:#0B0D10;border-bottom:2px solid #FF6500;">
        <img src="${safeLogo}" width="200" alt="BTHTECH" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto 6px auto;border:0;color:#FF6500;font-size:20px;font-weight:bold;" />
        <div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#94A3B8;text-transform:uppercase;">
          BTHTECH
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:22px 18px;">
        <div style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:4px;background-color:#0B0D10;border:1px solid ${badgeColor};color:${badgeColor};font-size:12px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;">
            ${badgeLabel}
          </span>
        </div>

        <h1 style="margin:0 0 10px 0;font-size:18px;line-height:1.35;font-weight:bold;color:#FFFFFF;">
          ${escapeHtml(titleText)}
        </h1>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#CBD5E1;">
          ${formatEscapedMultiline(messageText)}
        </p>

        <!-- Order Items Grid Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0B0D10;border:1px solid #272D38;border-radius:6px;border-collapse:collapse;margin-bottom:12px;">
          <tr>
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #272D38;border-right:1px solid #272D38;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#94A3B8;">
              Produto
            </th>
            <th align="center" style="padding:8px 10px;border-bottom:1px solid #272D38;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#94A3B8;width:72px;">
              Qtd.
            </th>
          </tr>
          ${itemsGridHtml}
        </table>

        <!-- Compact Order Details Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0B0D10;border:1px solid #272D38;border-radius:6px;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;width:42%;">
              Número do Pedido
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:13px;font-weight:bold;color:#FFFFFF;text-align:right;">
              #${safeOrderId}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Pagamento (${escapeHtml(vars.quantidade)})
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;font-weight:bold;color:#E2E8F0;text-align:right;">
              ${escapeHtml(vars.pagamento)}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Subtotal / Frete (${escapeHtml(vars.transportadora)})
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#E2E8F0;text-align:right;">
              ${escapeHtml(vars.subtotal)} · <strong style="color:#00E676;">${escapeHtml(vars.frete)}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Valor Total
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:14px;font-weight:bold;color:#00E676;text-align:right;">
              ${escapeHtml(vars.total)}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Código de Rastreio
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:13px;font-weight:bold;text-align:right;font-family:'Courier New',Courier,monospace;">
              ${
                tracking
                  ? `<span style="color:#FF6500;">${escapeHtml(tracking)}</span>`
                  : `<span style="color:#94A3B8;font-family:Arial,sans-serif;font-weight:normal;">Aguardando postagem</span>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:12px;color:#94A3B8;">
              Nota Fiscal (NF-e)
            </td>
            <td style="padding:10px 12px;font-size:12px;text-align:right;">
              ${nfeValueHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:16px 18px;background-color:#0B0D10;border-top:1px solid #272D38;">
        <p style="margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#FF6500;">
          BTHTECH — A sua melhor loja em hardware e periféricos.
        </p>
        <p style="margin:0;font-size:11px;color:#94A3B8;">
          Dúvidas? Responda ou escreva para: ${safeOfficialEmail}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getDefaultTemplateHtmlWithVars(
  config: EmailConfig,
  templateKey: EmailTemplateKey
): string {
  const tpl = resolveEmailTemplate(config, templateKey);
  const badgeColor = sanitizeHexColor(tpl.badgeColor, '#FF6500');

  if (templateKey === 'verification') {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(tpl.subject)}</title>
</head>
<body style="margin:0;padding:14px 8px;background-color:#0B0D10;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;margin:0 auto;background-color:#161A20;border:1px solid #272D38;border-radius:8px;overflow:hidden;">
    <tr>
      <td align="center" style="padding:22px 18px 16px 18px;background-color:#0B0D10;border-bottom:2px solid #FF6500;">
        <img src="{{logo_url}}" width="200" alt="BTHTECH" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto 6px auto;border:0;color:#FF6500;font-size:20px;font-weight:bold;" />
        <div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#94A3B8;text-transform:uppercase;">
          BTHTECH
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 20px 22px 20px;">
        <div style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:4px;background-color:#0B0D10;border:1px solid ${badgeColor};color:${badgeColor};font-size:11px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;">
            Verificação de Cadastro
          </span>
        </div>
        <h1 style="margin:0 0 12px 0;font-size:19px;line-height:1.35;font-weight:bold;color:#FFFFFF;">
          ${escapeHtml(tpl.title)}
        </h1>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.55;color:#CBD5E1;">
          ${formatEscapedMultiline(tpl.message)}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0B0D10;border:1px solid ${badgeColor};border-radius:6px;">
          <tr>
            <td align="center" style="padding:18px 12px;">
              <span style="display:inline-block;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:bold;letter-spacing:8px;color:${badgeColor};">
                {{codigo}}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0 0;font-size:12px;line-height:1.5;color:#94A3B8;">
          Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:16px 20px;background-color:#0B0D10;border-top:1px solid #272D38;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#FF6500;font-weight:bold;">
          BTHTECH — A sua melhor loja em hardware e periféricos.
        </p>
        <p style="margin:0;font-size:11px;color:#94A3B8;">
          Atendimento: {{email_oficial}}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  const badgeLabel =
    templateKey === 'nfeIssued'
      ? 'Nota Fiscal (NF-e)'
      : templateKey === 'orderShipped'
      ? 'Pedido Enviado'
      : 'Pedido Confirmado';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(tpl.subject)}</title>
</head>
<body style="margin:0;padding:14px 8px;background-color:#0B0D10;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;margin:0 auto;background-color:#161A20;border:1px solid #272D38;border-radius:8px;overflow:hidden;">
    <tr>
      <td align="center" style="padding:22px 18px 16px 18px;background-color:#0B0D10;border-bottom:2px solid #FF6500;">
        <img src="{{logo_url}}" width="200" alt="BTHTECH" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto 6px auto;border:0;color:#FF6500;font-size:20px;font-weight:bold;" />
        <div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#94A3B8;text-transform:uppercase;">
          BTHTECH
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 18px;">
        <div style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:4px;background-color:#0B0D10;border:1px solid ${badgeColor};color:${badgeColor};font-size:12px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;">
            ${badgeLabel}
          </span>
        </div>
        <h1 style="margin:0 0 10px 0;font-size:18px;line-height:1.35;font-weight:bold;color:#FFFFFF;">
          ${escapeHtml(tpl.title)}
        </h1>
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#CBD5E1;">
          ${formatEscapedMultiline(tpl.message)}
        </p>

        <!-- Grade Automática de Itens -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0B0D10;border:1px solid #272D38;border-radius:6px;border-collapse:collapse;margin-bottom:12px;">
          <tr>
            <th align="left" style="padding:8px 10px;border-bottom:1px solid #272D38;border-right:1px solid #272D38;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#94A3B8;">
              Produto
            </th>
            <th align="center" style="padding:8px 10px;border-bottom:1px solid #272D38;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#94A3B8;width:72px;">
              Qtd.
            </th>
          </tr>
          {{lista_itens_grade}}
        </table>

        <!-- Resumo Financeiro e Envio -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0B0D10;border:1px solid #272D38;border-radius:6px;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;width:42%;">
              Pedido / Qtd. Total
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:13px;font-weight:bold;color:#FFFFFF;text-align:right;">
              #{{pedido}} ({{quantidade}})
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Pagamento
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;font-weight:bold;color:#E2E8F0;text-align:right;">
              {{pagamento}}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Subtotal / Frete ({{transportadora}})
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#E2E8F0;text-align:right;">
              {{subtotal}} · <strong style="color:#00E676;">{{frete}}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Valor Total
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:14px;font-weight:bold;color:#00E676;text-align:right;">
              {{total}}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:12px;color:#94A3B8;">
              Código de Rastreio
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #272D38;font-size:13px;font-weight:bold;color:#FF6500;text-align:right;font-family:'Courier New',Courier,monospace;">
              {{rastreio}}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:12px;color:#94A3B8;">
              Nota Fiscal (NF-e)
            </td>
            <td style="padding:10px 12px;font-size:12px;color:#00E676;font-weight:bold;text-align:right;">
              {{nfe}}
            </td>
          </tr>
        </table>

        <div style="margin-top:16px;text-align:center;">
          <a href="{{link_nfe_pdf}}" target="_blank" style="display:inline-block;padding:10px 18px;border-radius:4px;background-color:#FF6500;color:#FFFFFF;font-size:12px;font-weight:bold;text-decoration:none;text-transform:uppercase;">
            Consultar Pedido / DANFE
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:16px 18px;background-color:#0B0D10;border-top:1px solid #272D38;">
        <p style="margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#FF6500;">
          BTHTECH — A sua melhor loja em hardware e periféricos.
        </p>
        <p style="margin:0;font-size:11px;color:#94A3B8;">
          Dúvidas? Responda ou escreva para: {{email_oficial}}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function createSampleOrder(templateKey: EmailTemplateKey, targetEmail: string): Order {
  const sampleStatus =
    templateKey === 'orderShipped' ? 'Produto Enviado' : 'Pagamento Aprovado';

  return {
    id: 'BTH-998877',
    createdAt: new Date().toISOString(),
    status: sampleStatus,
    trackingCode: 'AA123456789BR',
    nfeInfo: 'NF-e nº 000.142 — Série 1',
    items: [
      {
        productId: 'prod-ssd-1tb',
        sku: 'BTH-SSD-NVME1TB',
        name: 'SSD NVMe M.2 1TB BTHTECH Alta Velocidade',
        quantity: 1,
        unitBasePrice: 429.9,
        unitPixPrice: 429.9,
      },
      {
        productId: 'prod-ram-16gb',
        sku: 'BTH-RAM-16GB3200',
        name: 'Memória RAM 16GB DDR4 3200MHz',
        quantity: 2,
        unitBasePrice: 129.9,
        unitPixPrice: 129.9,
      },
    ],
    subtotalBase: 766.33,
    discountCouponAmount: 0,
    pixDiscountAmount: 76.63,
    shippingMethod: 'express',
    shippingLabel: 'SEDEX / Expresso',
    shippingCost: 0,
    paymentMethod: 'pix',
    installments: 1,
    installmentValue: 689.7,
    totalAmount: 689.7,
    customer: {
      fullName: 'Cliente Teste BTHTECH',
      document: '000.000.000-00',
      email: targetEmail.trim() || 'cliente@bthtech.com.br',
      whatsapp: '(45) 99999-9999',
      cep: '85801-000',
      street: 'Av. Brasil',
      number: '6200',
      complement: '',
      neighborhood: 'Centro',
      city: 'Cascavel',
      state: 'PR',
    },
  };
}

export function renderCustomHtmlPreview(
  config: EmailConfig,
  templateKey: EmailTemplateKey,
  rawHtml: string
): string {
  if (!rawHtml.trim()) {
    return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:32px 20px;background-color:#0B0D10;color:#94A3B8;font-family:Arial,sans-serif;text-align:center;"><div style="max-width:360px;margin:0 auto;padding:24px;background-color:#161A20;border:1px dashed #272D38;border-radius:8px;"><p style="margin:0 0 8px 0;color:#FFFFFF;font-weight:bold;font-size:14px;">Editor HTML Vazio</p><p style="margin:0;font-size:12px;line-height:1.5;">Cole o código HTML do seu e-mail ao lado ou clique em <strong style="color:#FF6500;">"Carregar Modelo Padrão BTHTECH no Editor"</strong> para começar.</p></div></body></html>`;
  }

  const sampleOrder = createSampleOrder(templateKey, config.officialEmail);
  const logoUrl = (config.emailLogoUrl || 'https://googleusercontent.com').trim();
  const officialEmail = (config.officialEmail || 'contato.bthtech@gmail.com').trim();
  const orderVars = getOrderVars(sampleOrder, logoUrl, officialEmail);

  return interpolateHtmlTemplate(
    rawHtml,
    {
      ...orderVars,
      codigo: '123456',
      verification_code: '123456',
    },
    {
      lista_itens_grade: buildOrderItemsGridHtml(sampleOrder),
      itens_lista_html: buildOrderItemsListHtml(sampleOrder),
    }
  );
}

export async function sendVerificationEmail(
  config: EmailConfig,
  params: {
    user_name: string;
    to_email: string;
    verification_code: string;
    subject?: string;
    isTest?: boolean;
  }
): Promise<{ ok: boolean; message: string }> {
  const template = resolveEmailTemplate(config, 'verification');
  if (!params.isTest && !template.enabled) {
    return {
      ok: false,
      message:
        'O envio do modelo "1. Código de Verificação" está desativado nas configurações de e-mail.',
    };
  }

  const check = validateScriptAndRecipient(config, params.to_email);
  if (!check.ok) {
    return { ok: false, message: check.message };
  }

  const vars = {
    cliente: params.user_name.trim() || 'Cliente',
    codigo: params.verification_code.trim(),
    user_name: params.user_name.trim() || 'Cliente',
    verification_code: params.verification_code.trim(),
  };

  const subject =
    params.subject || interpolateEmailVars(template.subject, vars);

  const html_body = buildOtpEmailHtml({
    customerName: params.user_name,
    verificationCode: params.verification_code,
    logoUrl: config.emailLogoUrl || 'https://googleusercontent.com',
    officialEmail: config.officialEmail,
    template,
  });

  const dispatch = await postToGmailScript(check.url, {
    to_email: check.to,
    subject,
    html_body,
  });

  if (!dispatch.ok) {
    return {
      ok: false,
      message: `Falha ao conectar com o Disparador Gmail: ${dispatch.error}`,
    };
  }

  return {
    ok: true,
    message: params.isTest
      ? `Teste do modelo "1. Código de Verificação" disparado para ${check.to}!`
      : `Disparo enviado para ${check.to} via Google Apps Script! Verifique a caixa de entrada ou spam.`,
  };
}

export async function sendOrderTemplateEmail(
  config: EmailConfig,
  order: Order,
  templateKey: Exclude<EmailTemplateKey, 'verification'>,
  options?: {
    isTest?: boolean;
    pdfAttachment?: PdfEmailAttachment | null;
  }
): Promise<{ ok: boolean; message: string }> {
  const template = resolveEmailTemplate(config, templateKey);
  if (!options?.isTest && !template.enabled) {
    const labelMap: Record<Exclude<EmailTemplateKey, 'verification'>, string> = {
      orderConfirmed: '2. Pedido Confirmado',
      orderShipped: '3. Pedido Enviado',
      nfeIssued: '4. Notas Fiscais (NF-e)',
    };
    return {
      ok: false,
      message: `O envio do modelo "${labelMap[templateKey]}" está desativado na aba de configurações de e-mail.`,
    };
  }

  const check = validateScriptAndRecipient(config, order.customer.email);
  if (!check.ok) {
    return { ok: false, message: check.message };
  }

  const vars = getOrderVars(order, config.emailLogoUrl, config.officialEmail);
  const subject =
    order.status === 'Cancelado'
      ? `Atualização do Pedido #${order.id} — Cancelado | BTHTECH`
      : interpolateEmailVars(template.subject, vars);

  const html_body = buildOrderTemplateEmailHtml({
    order,
    templateKey,
    template,
    logoUrl: config.emailLogoUrl || 'https://googleusercontent.com',
    officialEmail: config.officialEmail,
  });

  const payload: GmailScriptPayload = {
    to_email: check.to,
    subject,
    html_body,
  };

  if (options?.pdfAttachment?.base64) {
    payload.pdf_base64 = options.pdfAttachment.base64;
    payload.pdf_nome =
      options.pdfAttachment.fileName.trim() || `DANFE-Pedido-${order.id}.pdf`;
  }

  const dispatch = await postToGmailScript(check.url, payload);

  if (!dispatch.ok) {
    return {
      ok: false,
      message: `Falha ao enviar atualização por e-mail: ${dispatch.error}`,
    };
  }

  if (options?.isTest) {
    const labelMap: Record<Exclude<EmailTemplateKey, 'verification'>, string> = {
      orderConfirmed: '2. Pedido Confirmado',
      orderShipped: '3. Pedido Enviado',
      nfeIssued: '4. Notas Fiscais (NF-e)',
    };
    return {
      ok: true,
      message: `Teste do modelo "${labelMap[templateKey]}" disparado para ${check.to}!`,
    };
  }

  if (options?.pdfAttachment?.base64) {
    return {
      ok: true,
      message: `Pedido #${order.id} atualizado e e-mail com PDF (${payload.pdf_nome}) enviado para ${check.to}!`,
    };
  }

  return {
    ok: true,
    message: `Pedido #${order.id} atualizado e cliente notificado em ${check.to}!`,
  };
}

export async function sendOrderUpdateEmail(
  config: EmailConfig,
  order: Order
): Promise<{ ok: boolean; message: string }> {
  const templateKey: Exclude<EmailTemplateKey, 'verification'> =
    order.status === 'Produto Enviado' || order.status === 'Produto Entregue'
      ? 'orderShipped'
      : 'orderConfirmed';
  return sendOrderTemplateEmail(config, order, templateKey);
}

export async function sendTestEmailForTemplate(
  config: EmailConfig,
  templateKey: EmailTemplateKey,
  targetEmail: string
): Promise<{ ok: boolean; message: string }> {
  if (templateKey === 'verification') {
    return sendVerificationEmail(config, {
      user_name: 'Cliente Teste BTHTECH',
      to_email: targetEmail,
      verification_code: '123456',
      isTest: true,
    });
  }

  const sampleOrder = createSampleOrder(templateKey, targetEmail);
  return sendOrderTemplateEmail(config, sampleOrder, templateKey, { isTest: true });
}
