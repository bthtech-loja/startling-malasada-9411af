import { StoreState } from '../types/store';
import { DEFAULT_EMAIL_TEMPLATES } from './defaultEmailTemplates';

// Estado inicial oficial da loja BTHTECH, gravado a partir do backup de 2026-11-26.
// É carregado sempre que o navegador não tem dados salvos (localStorage vazio).

// Flash sale end time: 18 hours from first visit (persisted once saved)
const defaultFlashEnd = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString();

export const INITIAL_STORE_STATE: StoreState = {
  visual: {
    "logoUrl": "/src/assets/images/logo_bthtech_circuito_verde.png",
    "topPromoText": "ENVIAMOS PARA TODO O BRASIL • BLACK OFERTAS",
    "topPromoNotices": [
      "ENVIAMOS PARA TODO O BRASIL",
      "BLACK OFERTAS"
    ],
    "topPromoSpeed": "slow",
    "accentColor": "#FF6500",
    "mobileBannerUrl": "/src/assets/images/banner_setup_gamer_1795713393664.jpg",
    "flashSaleEnabled": true,
    "flashSaleTitle": "OFERTAS RELÂMPAGO BTHTECH",
    flashSaleEndTime: defaultFlashEnd,
    banners: [
      {
        "id": "banner-1",
        "title": "PERIFÉRICOS GAMER & HARDWARE DE ALTA PERFORMANCE",
        "subtitle": "Mouses 25K DPI, Teclados Mecânicos ABNT2 e SSDs NVMe com até 10% OFF no PIX e NF-e garantida.",
        "ctaLabel": "VER OFERTAS RELÂMPAGO",
        "targetDepartment": "OFERTAS RELÂMPAGO",
        "imageUrl": "/src/assets/images/banner_setup_gamer_1795713393664.jpg",
        "active": true,
        "linkUrl": "",
        "mobileImageUrl": ""
      },
      {
        "id": "banner-2",
        "title": "UPGRADE INSTANTÂNEO: SSD NVMe 1TB 3500MB/s",
        "subtitle": "Carregamentos ultrarrápidos para jogos e trabalho pesado. Envio imediato para todo o Brasil.",
        "ctaLabel": "CONFERIR SSDs & MEMÓRIAS",
        "targetDepartment": "SSDs & MEMÓRIAS",
        "imageUrl": "/src/assets/images/banner_nvme_promo_1795713394143.jpg",
        "active": true,
        "linkUrl": "",
        "mobileImageUrl": ""
      },
      {
        "id": "banner-3",
        "title": "COMBOS GAMER 4 EM 1 PRONTOS PARA JOGAR",
        "subtitle": "Teclado + Mouse + Headset 50mm + Mousepad com preço especial de fábrica.",
        "ctaLabel": "VER COMBOS GAMER",
        "targetDepartment": "COMBOS GAMER",
        "imageUrl": "/src/assets/images/prod_combo_mech_1795713395788.jpg",
        "active": false,
        "linkUrl": "",
        "mobileImageUrl": ""
      }
    ],
  },
  products: [
    {
      "id": "prod-g203",
      "sku": "BTH-MSE-G203",
      "name": "Mouse Gamer Logitech G203 LIGHTSYNC RGB (8.000 DPI, 6 Botões, Preto)",
      "category": "Mouses",
      "oldPrice": 199.99,
      "costPrice": 69.9,
      "basePrice": 111.1,
      "weightGrams": 300,
      "stock": 24,
      "imageUrl": "/src/assets/images/prod_mouse_g203_1795713393571.jpg",
      "description": "Sensor óptico de nível gamer com rastreamento de 200 a 8.000 DPI, iluminação RGB LIGHTSYNC personalizável com ~16,8 milhões de cores, 6 botões programáveis, tensionamento de clique por mola metálica e taxa de transmissão de 1ms (1000Hz).",
      "externalCheckoutUrl": "",
      "isFlashDeal": true,
      "isBestSeller": false
    },
    {
      "id": "prod-g403",
      "sku": "BTH-MSE-G403",
      "name": "Mouse Gamer Logitech G403 HERO (Sensor HERO 25K, RGB LIGHTSYNC)",
      "category": "Mouses",
      "oldPrice": 298.62,
      "costPrice": 164.9,
      "basePrice": 255.54,
      "weightGrams": 320,
      "stock": 15,
      "imageUrl": "/src/assets/images/prod_mouse_g403_1795713394690.jpg",
      "description": "Equipado com o avançado sensor HERO 25K de 100 a 25.600 DPI com precisão sub-mícron, design ergonômico com laterais emborrachadas, peso removível de 10g incluso, 6 botões programáveis e iluminação LIGHTSYNC RGB.",
      "externalCheckoutUrl": "",
      "isFlashDeal": false,
      "isBestSeller": true
    },
    {
      "id": "prod-headset-71",
      "sku": "BTH-HST-71RGB",
      "name": "Headset Gamer Surround 7.1 Drivers 50mm USB RGB Preto",
      "category": "Headsets",
      "oldPrice": 171,
      "costPrice": 79.9,
      "basePrice": 133.22,
      "weightGrams": 480,
      "stock": 18,
      "imageUrl": "/src/assets/images/prod_headset_rgb_1795713394937.jpg",
      "description": "Áudio posicional Surround 7.1 virtual via placa USB integrada, drivers magnéticos de neodímio de 50mm para graves profundos, microfone flexível com cancelamento de ruído, almofadas Memory Foam e arco com iluminação RGB.",
      "externalCheckoutUrl": "",
      "isFlashDeal": true,
      "isBestSeller": false
    },
    {
      "id": "prod-headset-stereo",
      "sku": "BTH-HST-ST50",
      "name": "Headset Gamer Stereo Drivers 50mm P2/P3 com Microfone",
      "category": "Headsets",
      "oldPrice": 167.99,
      "costPrice": 74.9,
      "basePrice": 127.67,
      "weightGrams": 450,
      "stock": 30,
      "imageUrl": "/src/assets/images/prod_headset_stereo_1795713395064.jpg",
      "description": "Compatibilidade multiplataforma (PC, PS4/PS5, Xbox, Switch e Mobile) via conector P3 3.5mm + adaptador Y P2 incluso. Drivers de 50mm de alta definição, controle de volume no cabo trançado e haste metálica reforçada.",
      "externalCheckoutUrl": "",
      "isFlashDeal": false,
      "isBestSeller": false
    },
    {
      "id": "prod-combo-mech",
      "sku": "BTH-CMB-MECH4X1",
      "name": "Combo Gamer 4x1 Teclado Mecânico ABNT2 Switch Vermelho + Mouse 12.800 DPI + Headset 50mm + Mousepad",
      "category": "Combos Gamer",
      "oldPrice": 299.99,
      "costPrice": 168,
      "basePrice": 266.65,
      "weightGrams": 1350,
      "stock": 12,
      "imageUrl": "/src/assets/images/prod_combo_mech_1795713395788.jpg",
      "description": "Kit completo de alta performance: Teclado Mecânico padrão brasileiro ABNT2 (com Ç) e Switches Mecânicos Vermelhos lineares silenciosos, Mouse Gamer 12.800 DPI com software macro, Headset 50mm P2/USB e Mousepad Speed costura reforçada.",
      "externalCheckoutUrl": "",
      "isFlashDeal": true,
      "isBestSeller": true
    },
    {
      "id": "prod-combo-rainbow",
      "sku": "BTH-CMB-RNB4X1",
      "name": "Combo Gamer 4x1 Rainbow Teclado ABNT2 + Mouse 8.000 DPI + Headset 50mm + Mousepad",
      "category": "Combos Gamer",
      "oldPrice": 179.99,
      "costPrice": 98,
      "basePrice": 166.65,
      "weightGrams": 1150,
      "stock": 22,
      "imageUrl": "/src/assets/images/prod_combo_rainbow_1795713396415.jpg",
      "description": "Setup completo custo-benefício: Teclado Gamer ABNT2 anti-ghosting com iluminação Rainbow, Mouse óptico ergonômico 8.000 DPI ajustáveis, Headset Over-Ear drivers 50mm com microfone articulado e Mousepad Gamer antiderrapante.",
      "externalCheckoutUrl": "",
      "isFlashDeal": false,
      "isBestSeller": false
    },
    {
      "id": "prod-kit-office",
      "sku": "BTH-TEC-OFFSLIM",
      "name": "Kit Teclado e Mouse Sem Fio Office Slim ABNT2 Preto",
      "category": "Teclados",
      "oldPrice": 129.9,
      "costPrice": 58,
      "basePrice": 99.89,
      "weightGrams": 750,
      "stock": 35,
      "imageUrl": "/src/assets/images/prod_kit_office_1795713396724.jpg",
      "description": "Conjunto sem fio 2.4GHz com nano receptor USB único (Plug & Play), alcance de até 10 metros. Teclado perfil baixo silencioso padrão ABNT2 (com Ç) e mouse compacto 1600 DPI com economia inteligente de energia.",
      "externalCheckoutUrl": "",
      "isFlashDeal": false,
      "isBestSeller": false
    },
    {
      "id": "prod-ssd-1tb",
      "sku": "BTH-SSD-NVME1TB",
      "name": "SSD NVMe M.2 1TB BTHTECH Alta Velocidade (Leitura 3500MB/s)",
      "category": "SSDs & Memórias",
      "oldPrice": 549.9,
      "costPrice": 295,
      "basePrice": 477.67,
      "weightGrams": 100,
      "stock": 19,
      "imageUrl": "/src/assets/images/prod_ssd_nvme_1795713397531.jpg",
      "description": "Armazenamento M.2 2280 PCIe Gen3 x4 NVMe 1.3 de 1TB com dissipador térmico integrado em alumínio anodizado. Velocidades sequenciais de até 3.500 MB/s de leitura e 3.000 MB/s de gravação, MTBF 1.500.000 horas e 3 anos de garantia.",
      "externalCheckoutUrl": "",
      "isFlashDeal": true,
      "isBestSeller": true
    }
  ],
  coupons: [
    {
      "id": "cup-1795718498465",
      "code": "NASMOU",
      "type": "percent",
      "value": 10,
      "minOrderValue": 99.9,
      "active": false
    }
  ],
  pixDiscountPercent: 5,
  payment: {
    "pixDiscountPercent": 5,
    "creditCardEnabled": true,
    "gatewayProvider": "InfinitePay",
    "creditCardInstructions": "Após confirmar seu pedido, utilize o link seguro abaixo ou solicite o link parcelado diretamente em nosso WhatsApp.",
    "maxInstallments": 12,
    "interestFreeInstallments": 1,
    "monthlyInterestRate": 1.99,
    "installmentRates": {
      "1": 0,
      "2": 6,
      "3": 7,
      "4": 7.92,
      "5": 8.9,
      "6": 9.7,
      "7": 12.6,
      "8": 13.42,
      "9": 14.25,
      "10": 15.06,
      "11": 15.87,
      "12": 16.66
    },
    "minInstallmentValue": 5,
    "acceptedCardBrands": [
      "Visa",
      "Mastercard",
      "Elo",
      "Hipercard",
      "Amex"
    ],
    "pixKey": "33279307000122",
    "pixKeyType": "CNPJ",
    "pixBeneficiary": "BTHTECH COMÉRCIO DE HARDWARE LTDA",
    "pixBank": "Banco santander",
    "defaultExternalCheckoutUrl": "https://link.mercadopago.com.br/"
  },
  shipping: {
    "originCep": "85801-000",
    "freeShippingMinValue": 299,
    "freeShippingScope": "brasil",
    "regionRates": {
      "sul": 19.9,
      "sudeste": 24.9,
      "centroOeste": 29.9,
      "nordeste": 39.9,
      "norte": 49.9
    },
    "expressRegionRates": {
      "sul": 40,
      "sudeste": 42.9,
      "centroOeste": 46.9,
      "nordeste": 64.9,
      "norte": 79.9
    },
    "additionalKgRate": 9.9,
    "cascavelPickupEnabled": false,
    "cascavelPickupAddress": "",
    "cascavelMotoboyEnabled": true,
    "cascavelMotoboyFee": 12
  },
  fiscal: {
    "cnpj": "33279307000122",
    "corporateName": "BTHTECH HARDWARE E PERIFERICOS LTDA",
    "stateRegistration": "90876543-21",
    "whatsappNumber": "45999700054",
    "adminUsername": "bthtech",
    "adminPassword": "Juliano@2510",
    "storeEmail": "fiscal@bthtech.com.br",
    "storeCityState": "Cascavel - PR"
  },
  email: {
    "officialEmail": "contato.bthtech@gmail.com",
    "emailVerificationEnabled": true,
    "gmailScriptUrl": "https://script.google.com/macros/s/AKfycbwK1zXLKBBZA47F3XWSROmIaRLOk_ggRIYoGpUjl4e3emFj_J0sIWRLg-ib3HoU3kNS/exec",
    "emailLogoUrl": "https://i.postimg.cc/rpvFjwjs/Logo-BTHTECH-com-Circuitos-Neon.png",
    templates: DEFAULT_EMAIL_TEMPLATES,
  },
  orders: [],
  customers: [],
};
