import { Order, PaymentConfig, RegionKey, ShippingConfig, ShippingMethod, ViaCepAddress } from '../types/store';

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcPixPrice(basePrice: number, pixDiscountPercent: number): number {
  const safePercent = Math.max(0, Math.min(90, pixDiscountPercent));
  return roundCurrency(basePrice * (1 - safePercent / 100));
}

export function calcMarkupPercent(costPrice: number, salePrice: number): number {
  if (!costPrice || costPrice <= 0) return 0;
  return roundCurrency(((salePrice - costPrice) / costPrice) * 100);
}

export function calcProfitAmount(costPrice: number, salePrice: number): number {
  return roundCurrency(salePrice - (costPrice || 0));
}

export interface InstallmentOption {
  count: number;
  installmentValue: number;
  totalValue: number;
  hasInterest: boolean;
  ratePercent: number;
}

export function calculateInstallments(totalBase: number, config: PaymentConfig): InstallmentOption[] {
  const options: InstallmentOption[] = [];
  const max = Math.max(1, Math.min(12, config.maxInstallments));
  const freeMax = Math.max(1, Math.min(max, config.interestFreeInstallments));
  const fallbackRate = Math.max(0, config.monthlyInterestRate) / 100;
  const minVal = Math.max(5, config.minInstallmentValue);

  for (let n = 1; n <= max; n++) {
    let total = totalBase;
    let ratePercent = 0;
    const isInterestFreeTier = n <= freeMax;

    if (!isInterestFreeTier) {
      const tableRate = config.installmentRates?.[n];
      if (typeof tableRate === 'number' && tableRate >= 0) {
        ratePercent = tableRate;
        total = roundCurrency(totalBase * (1 + ratePercent / 100));
      } else if (fallbackRate > 0) {
        const factor = (fallbackRate * Math.pow(1 + fallbackRate, n)) / (Math.pow(1 + fallbackRate, n) - 1);
        const pmt = roundCurrency(totalBase * factor);
        total = roundCurrency(pmt * n);
        ratePercent = totalBase > 0 ? roundCurrency(((total - totalBase) / totalBase) * 100) : 0;
      }
    }

    const hasInterest = !isInterestFreeTier && ratePercent > 0;
    const installmentValue = roundCurrency(total / n);
    if (n === 1 || installmentValue >= minVal) {
      options.push({
        count: n,
        installmentValue,
        totalValue: roundCurrency(installmentValue * n),
        hasInterest,
        ratePercent,
      });
    }
  }
  return options;
}

export function getBestInstallmentSummary(totalBase: number, config: PaymentConfig): InstallmentOption {
  const options = calculateInstallments(totalBase, config);
  const interestFree = options.filter((o) => !o.hasInterest);
  if (interestFree.length > 0) {
    return interestFree[interestFree.length - 1];
  }
  return options[options.length - 1] || { count: 1, installmentValue: totalBase, totalValue: totalBase, hasInterest: false, ratePercent: 0 };
}

export function maskCEP(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

export function maskCpfCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function maskPhoneBR(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export interface CepRegionResult {
  region: RegionKey;
  regionLabel: string;
  isSulOrPR: boolean;
  isCascavelPR: boolean;
  economicDays: string;
  expressDays: string;
}

const UF_TO_REGION: Record<string, RegionKey> = {
  PR: 'sul', SC: 'sul', RS: 'sul',
  SP: 'sudeste', RJ: 'sudeste', MG: 'sudeste', ES: 'sudeste',
  DF: 'centroOeste', GO: 'centroOeste', MT: 'centroOeste', MS: 'centroOeste',
  BA: 'nordeste', SE: 'nordeste', PE: 'nordeste', AL: 'nordeste',
  PB: 'nordeste', RN: 'nordeste', CE: 'nordeste', PI: 'nordeste', MA: 'nordeste',
  PA: 'norte', AP: 'norte', AM: 'norte', RR: 'norte', AC: 'norte', RO: 'norte', TO: 'norte',
};

export function detectRegionFromCep(cep: string, uf?: string): CepRegionResult {
  const digits = cep.replace(/\D/g, '');
  const numericCep = digits.length === 8 ? Number(digits) : 0;
  const prefix2 = Number(digits.slice(0, 2));
  const firstDigit = digits[0];

  // Cascavel - PR range: 85800-000 to 85819-999
  const isCascavelPR = numericCep >= 85800000 && numericCep <= 85819999;

  let region: RegionKey = 'centroOeste';
  if (uf && UF_TO_REGION[uf.toUpperCase()]) {
    region = UF_TO_REGION[uf.toUpperCase()];
  } else if (firstDigit === '8' || firstDigit === '9') {
    region = 'sul';
  } else if (['0', '1', '2', '3'].includes(firstDigit)) {
    region = 'sudeste';
  } else if (firstDigit === '4' || firstDigit === '5' || (firstDigit === '6' && prefix2 <= 65)) {
    region = 'nordeste';
  } else if ((firstDigit === '6' && prefix2 >= 66) || prefix2 === 77) {
    region = 'norte';
  }

  const isSulOrPR = region === 'sul';

  if (region === 'sul') {
    return {
      region,
      regionLabel: isCascavelPR ? 'Cascavel - PR' : prefix2 >= 80 && prefix2 <= 87 ? 'Paraná (Sul)' : 'Região Sul',
      isSulOrPR,
      isCascavelPR,
      economicDays: isCascavelPR ? '1 a 2 dias úteis' : '3 a 5 dias úteis',
      expressDays: isCascavelPR ? '1 dia útil' : '1 a 2 dias úteis',
    };
  }

  if (region === 'sudeste') {
    return {
      region,
      regionLabel: 'Região Sudeste',
      isSulOrPR: false,
      isCascavelPR: false,
      economicDays: '4 a 7 dias úteis',
      expressDays: '1 a 3 dias úteis',
    };
  }

  if (region === 'centroOeste') {
    return {
      region,
      regionLabel: 'Região Centro-Oeste',
      isSulOrPR: false,
      isCascavelPR: false,
      economicDays: '5 a 8 dias úteis',
      expressDays: '2 a 3 dias úteis',
    };
  }

  if (region === 'nordeste') {
    return {
      region,
      regionLabel: 'Região Nordeste',
      isSulOrPR: false,
      isCascavelPR: false,
      economicDays: '7 a 12 dias úteis',
      expressDays: '2 a 4 dias úteis',
    };
  }

  return {
    region: 'norte',
    regionLabel: 'Região Norte',
    isSulOrPR: false,
    isCascavelPR: false,
    economicDays: '8 a 14 dias úteis',
    expressDays: '3 a 4 dias úteis',
  };
}

export async function lookupViaCep(cep: string): Promise<{ ok: boolean; data?: ViaCepAddress; error?: string }> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) {
    return { ok: false, error: 'Digite um CEP completo com 8 números.' };
  }
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) {
      return { ok: false, error: 'Não foi possível consultar o CEP no momento.' };
    }
    const json = await response.json();
    if (json.erro) {
      return { ok: false, error: 'CEP não encontrado na base dos Correios.' };
    }
    return {
      ok: true,
      data: {
        cep: maskCEP(digits),
        street: json.logradouro || '',
        neighborhood: json.bairro || '',
        city: json.localidade || '',
        state: json.uf || '',
      },
    };
  } catch {
    return { ok: false, error: 'Consulta ViaCEP indisponível; calculando por faixa de CEP.' };
  }
}

export interface ShippingQuote {
  method: ShippingMethod;
  label: string;
  carrier: string;
  cost: number;
  originalCost: number;
  isFreeActivated: boolean;
  estimatedDays: string;
}

export function getShippingQuotes(
  cep: string,
  cartSubtotal: number,
  totalWeightGrams: number,
  shipping: ShippingConfig,
  viaCepData?: ViaCepAddress | null
): { regionInfo: CepRegionResult; quotes: ShippingQuote[]; totalWeightKg: number } {
  const regionInfo = detectRegionFromCep(cep, viaCepData?.state);
  const qualifiesFree =
    cartSubtotal >= shipping.freeShippingMinValue &&
    (shipping.freeShippingScope === 'brasil' || regionInfo.isSulOrPR);

  const safeGrams = Math.max(100, totalWeightGrams);
  const totalWeightKg = roundCurrency(safeGrams / 1000);
  // Surcharge proportional to weight (per kg over initial 300g base package)
  const extraKg = Math.max(0, (safeGrams - 300) / 1000);
  const kgRate = shipping.additionalKgRate ?? 9.9;
  const economicWeightSurcharge = roundCurrency(extraKg * kgRate);
  const expressWeightSurcharge = roundCurrency(extraKg * kgRate * 1.45);

  const baseEconomic = shipping.regionRates[regionInfo.region] ?? 26.9;
  const baseExpress = shipping.expressRegionRates?.[regionInfo.region] ?? roundCurrency(baseEconomic * 1.75);

  const economicCost = roundCurrency(baseEconomic + economicWeightSurcharge);
  const expressCost = roundCurrency(baseExpress + expressWeightSurcharge);

  const quotes: ShippingQuote[] = [];

  if (regionInfo.isCascavelPR) {
    if (shipping.cascavelMotoboyEnabled) {
      quotes.push({
        method: 'motoboy_cascavel',
        label: 'Entrega Local / Motoboy Cascavel - PR',
        carrier: 'Motoboy BTHTECH',
        cost: shipping.cascavelMotoboyFee,
        originalCost: shipping.cascavelMotoboyFee,
        isFreeActivated: false,
        estimatedDays: 'Entrega no mesmo dia',
      });
    }
    if (shipping.cascavelPickupEnabled) {
      quotes.push({
        method: 'pickup_cascavel',
        label: 'Retirada no Balcão (Cascavel - PR)',
        carrier: 'CD Cascavel - CEP 85801-000',
        cost: 0,
        originalCost: 0,
        isFreeActivated: true,
        estimatedDays: 'Pronto em 1 hora útil',
      });
    }
  }

  quotes.push({
    method: 'economic',
    label: 'Frete Econômico (PAC / Jadlog)',
    carrier: 'PAC / Jadlog',
    cost: qualifiesFree ? 0 : economicCost,
    originalCost: economicCost,
    isFreeActivated: qualifiesFree,
    estimatedDays: regionInfo.economicDays,
  });

  quotes.push({
    method: 'express',
    label: 'Frete Expresso (SEDEX)',
    carrier: 'SEDEX Correios',
    cost: expressCost,
    originalCost: expressCost,
    isFreeActivated: false,
    estimatedDays: regionInfo.expressDays,
  });

  return { regionInfo, quotes, totalWeightKg };
}

// EMVCo / BACEN Static PIX BRCode Generator with valid CRC16-CCITT
function crc16ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

export function buildPixBrCode(params: {
  pixKey: string;
  beneficiary: string;
  city: string;
  amount: number;
  txId: string;
}): string {
  const cleanKey = params.pixKey.trim() || 'bthtech@pix.com.br';
  const merchantName = (params.beneficiary || 'BTHTECH')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .slice(0, 25)
    .trim() || 'BTHTECH';
  const merchantCity = (params.city || 'CASCAVEL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .slice(0, 15)
    .trim() || 'CASCAVEL';
  const tx = (params.txId || 'BTHTECH01').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'BTHTECH';

  const gui = tlv('00', 'br.gov.bcb.pix');
  const keyField = tlv('01', cleanKey);
  const merchantAccount = tlv('26', `${gui}${keyField}`);

  const payloadWithoutCrc = [
    tlv('00', '01'),
    merchantAccount,
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', params.amount.toFixed(2)),
    tlv('58', 'BR'),
    tlv('59', merchantName),
    tlv('60', merchantCity),
    tlv('62', tlv('05', tx)),
    '6304',
  ].join('');

  return `${payloadWithoutCrc}${crc16ccitt(payloadWithoutCrc)}`;
}

export function formatNfeClipboardText(order: Order): string {
  const c = order.customer;
  const itemsText = order.items
    .map(
      (item, idx) =>
        `${idx + 1}. [SKU: ${item.sku}] ${item.name} | Qtd: ${item.quantity} | Unit: ${formatBRL(
          order.paymentMethod === 'pix' ? item.unitPixPrice : item.unitBasePrice
        )}`
    )
    .join('\n');

  return `=== DADOS PARA EMISSOR NF-e (MarketUP / NFe+) ===
PEDIDO: #${order.id}
DATA: ${new Date(order.createdAt).toLocaleString('pt-BR')}
STATUS: ${order.status}

[DESTINATÁRIO / CLIENTE]
Nome/Razão Social: ${c.fullName}
CPF/CNPJ: ${c.document}
E-mail (Envio XML/PDF): ${c.email}
WhatsApp: ${c.whatsapp}

[ENDEREÇO DE ENTREGA / FATURAMENTO]
CEP: ${c.cep}
Logradouro: ${c.street}, Nº ${c.number}${c.complement ? ` - ${c.complement}` : ''}
Bairro: ${c.neighborhood}
Cidade/UF: ${c.city} / ${c.state}

[ITENS DO PEDIDO]
${itemsText}

[TOTAIS E PAGAMENTO]
Forma de Pagamento: ${
    order.paymentMethod === 'pix'
      ? 'PIX'
      : order.paymentMethod === 'credit_card'
      ? `Cartão de Crédito (${order.installments}x de ${formatBRL(order.installmentValue)})`
      : 'Link de Pagamento Externo'
  }
Frete (${order.shippingLabel}): ${formatBRL(order.shippingCost)}
Cupom (${order.discountCouponCode || 'Nenhum'}): -${formatBRL(order.discountCouponAmount)}
TOTAL NF-e: ${formatBRL(order.totalAmount)}
===============================================`;
}

export function formatWhatsAppOrderMessage(order: Order, storeName: string): string {
  const c = order.customer;
  const lines = [
    `*NOVO PEDIDO #${order.id} — ${storeName}*`,
    ``,
    `*Itens:*`,
    ...order.items.map(
      (i) =>
        `• ${i.quantity}x ${i.name} (SKU: ${i.sku}) — ${formatBRL(
          (order.paymentMethod === 'pix' ? i.unitPixPrice : i.unitBasePrice) * i.quantity
        )}`
    ),
    ``,
    `*Resumo Financeiro:*`,
    `• Entrega: ${order.shippingLabel} (${order.shippingCost === 0 ? 'GRÁTIS' : formatBRL(order.shippingCost)})`,
    ...(order.discountCouponCode
      ? [`• Cupom (${order.discountCouponCode}): -${formatBRL(order.discountCouponAmount)}`]
      : []),
    `• Pagamento: ${
      order.paymentMethod === 'pix'
        ? 'PIX'
        : order.paymentMethod === 'credit_card'
        ? `Cartão de Crédito em ${order.installments}x de ${formatBRL(order.installmentValue)} (Solicito Link de Cobrança)`
        : 'Link de Pagamento Online'
    }`,
    `• *TOTAL: ${formatBRL(order.totalAmount)}*`,
    ``,
    `*Dados para NF-e:*`,
    `Nome/Razão Social: ${c.fullName}`,
    `CPF/CNPJ: ${c.document}`,
    `E-mail NF-e: ${c.email}`,
    `WhatsApp: ${c.whatsapp}`,
    `Endereço: ${c.street}, ${c.number}${c.complement ? ` (${c.complement})` : ''} - ${c.neighborhood}, ${c.city}/${c.state} - CEP ${c.cep}`,
  ];
  return lines.join('\n');
}
