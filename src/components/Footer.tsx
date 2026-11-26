import { useState } from 'react';
import { FileText, Mail, MessageCircle, Settings, ShieldCheck, Truck, X } from 'lucide-react';
import { FiscalConfig, PaymentConfig, ShippingConfig } from '../types/store';
import { formatBRL } from '../utils/formatters';
import { CardBrandsStrip } from './CardBrandsStrip';

interface FooterProps {
  fiscal: FiscalConfig;
  officialEmail: string;
  payment: PaymentConfig;
  shipping: ShippingConfig;
  accentColor: string;
  onOpenAdmin: () => void;
}

export function Footer({
  fiscal,
  officialEmail,
  payment,
  shipping,
  accentColor,
  onOpenAdmin,
}: FooterProps) {
  const [warrantyModalOpen, setWarrantyModalOpen] = useState(false);
  const cleanPhone = fiscal.whatsappNumber.replace(/\D/g, '');
  const displayOfficialEmail = (officialEmail || fiscal.storeEmail || '').trim();

  return (
    <footer className="mt-12 bg-[#161A20] border-t border-[#272D38] text-slate-300">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8">
        {/* Trust Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-8 border-b border-[#272D38]">
          <div className="flex items-start gap-3">
            <Truck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accentColor }} />
            <div>
              <h4 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                Entrega Rápida para Todo Brasil
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Frete grátis a partir de {formatBRL(shipping.freeShippingMinValue)} (
                {shipping.freeShippingScope === 'brasil' ? 'Todo o Brasil' : 'Sul e Paraná'}).
                {shipping.cascavelPickupEnabled && ' Retirada e Motoboy em Cascavel-PR.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 shrink-0 mt-0.5 text-[#00E676]" />
            <div>
              <h4 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                Emissão Automática de NF-e
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Todos os pedidos acompanham Nota Fiscal eletrônica (PDF e XML) enviada ao seu e-mail.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accentColor }} />
            <div>
              <h4 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                {payment.creditCardEnabled
                  ? `PIX ${payment.pixDiscountPercent}% OFF ou até ${payment.maxInstallments}x`
                  : `Pagamento Instantâneo via PIX (${payment.pixDiscountPercent}% OFF)`}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {payment.creditCardEnabled
                  ? `Até ${payment.interestFreeInstallments}x sem juros no cartão via ${payment.gatewayProvider} ou pagamento no PIX.`
                  : 'Aprovação imediata via PIX com desconto exclusivo.'}
              </p>
              {payment.creditCardEnabled && payment.acceptedCardBrands?.length > 0 && (
                <div className="mt-2">
                  <CardBrandsStrip brands={payment.acceptedCardBrands} compact />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Store Info + Official Contact + Warranty + Admin Trigger */}
        <div className="pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-400">
          <div className="space-y-1">
            <p className="text-white font-semibold">
              {fiscal.corporateName} · CNPJ: {fiscal.cnpj} · IE: {fiscal.stateRegistration}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{fiscal.storeCityState}</span>
              <span aria-hidden="true">·</span>
              <span>
                Atendimento oficial:{' '}
                <a
                  href={`mailto:${displayOfficialEmail}`}
                  className="text-slate-200 hover:text-white underline"
                >
                  {displayOfficialEmail}
                </a>
              </span>
              {fiscal.storeEmail &&
                fiscal.storeEmail.trim().toLowerCase() !==
                  displayOfficialEmail.toLowerCase() && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>E-mail fiscal: {fiscal.storeEmail}</span>
                  </>
                )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setWarrantyModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-slate-500 text-slate-200 hover:text-white font-medium transition-colors"
            >
              <ShieldCheck className="w-4 h-4" style={{ color: accentColor }} />
              <span>Política de Garantia</span>
            </button>

            {cleanPhone && (
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-slate-500 text-slate-200 font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-[#00E676]" />
                <span>Atendimento WhatsApp</span>
              </a>
            )}

            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#0B0D10] border border-[#272D38] hover:border-slate-500 text-slate-300 hover:text-white font-medium transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Área Restrita / Painel Admin</span>
            </button>
          </div>
        </div>
      </div>

      {/* Política de Garantia Modal */}
      {warrantyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="warranty-modal-title"
          onClick={() => setWarrantyModalOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-[#161A20] border border-[#272D38] rounded-md shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#272D38] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" style={{ color: accentColor }} />
                <h3
                  id="warranty-modal-title"
                  className="font-display font-extrabold text-xl uppercase tracking-wider text-white"
                >
                  Política de Garantia BTHTECH
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWarrantyModalOpen(false)}
                className="p-1.5 rounded bg-[#0B0D10] border border-[#272D38] text-slate-300 hover:text-white"
                aria-label="Fechar Política de Garantia"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <p>
                Todos os produtos comercializados pela <strong className="text-white">{fiscal.corporateName}</strong> acompanham Nota Fiscal Eletrônica (NF-e) e garantia legal de 90 dias (CDC), além da garantia contratual do fabricante especificada na página de cada produto.
              </p>
              <div className="p-3.5 rounded bg-[#0B0D10] border border-[#272D38] space-y-1.5 text-xs">
                <div className="font-display font-bold uppercase tracking-wider text-white">
                  Como Acionar a Garantia / RMA
                </div>
                <p>
                  1. Separe o número do pedido e a Nota Fiscal (NF-e).
                  <br />
                  2. Descreva o defeito apresentado (acompanhado de foto ou vídeo curto, se possível).
                  <br />
                  3. Envie a solicitação para nosso canal oficial de atendimento:
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={`mailto:${displayOfficialEmail}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#161A20] border border-[#272D38] hover:border-white/50 text-white font-semibold"
                  >
                    <Mail className="w-4 h-4" style={{ color: accentColor }} />
                    <span>{displayOfficialEmail}</span>
                  </a>
                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#00E676] text-[#0B0D10] font-bold"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp Garantia</span>
                    </a>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                A garantia não cobre mau uso, danos físicos por queda, oxidação, sobrecarga elétrica ou violação de lacres de fabricante.
              </p>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
