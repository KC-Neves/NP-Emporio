import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart, type CartItemCustomization } from "@/hooks/useCart";
import { useOrderHistory } from "@/hooks/useOrderHistory";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalToast } from "@/hooks/useToast";
import { useDeliveryZones } from "@/hooks/useDeliveryZones";
import { useCustomerInfo } from "@/hooks/useCustomerInfo";
import { supabase } from "@/lib/supabase";
import PixPaymentModal from "@/components/feature/PixPaymentModal";
import CardPaymentModal from "@/components/feature/CardPaymentModal";
import Footer from "@/components/feature/Footer";
import WhatsAppButton from "@/components/feature/WhatsAppButton";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  priceFormatted: string;
  category: string;
  image: string;
  featured: boolean;
  active: boolean;
  customizationOptions?: {
    id: string;
    name: string;
    type: 'single' | 'multiple' | 'addon';
    required: boolean;
    maxSelect?: number;
    options: {
      id: string;
      label: string;
      price?: number;
    }[];
  }[];
}

interface MenuCategory {
  id: string;
  name: string;
  icon: string;
}

const CATEGORY_META: Record<string, { name: string; icon: string }> = {
  torres: { name: "Torres", icon: "ri-stack-line" },
  salgados: { name: "Salgados", icon: "ri-bowl-line" },
  massas: { name: "Massas ao Vivo", icon: "ri-restaurant-2-line" },
  doces: { name: "Sobremesas", icon: "ri-cake-3-line" },
  bebidas: { name: "Bebidas", icon: "ri-goblet-line" },
};

function formatPrice(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

export default function DeliveryPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(true);
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [complement, setComplement] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [orderSent, setOrderSent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"caixa" | "cartao" | "pix">("caixa");
  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [customizationState, setCustomizationState] = useState<Record<string, string[]>>();
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  // Guarda o total do pedido ANTES de limpar o carrinho
  const [orderTotalSnapshot, setOrderTotalSnapshot] = useState<number>(0);
  const [showPixModal, setShowPixModal] = useState(false);
  // PIX: guarda o ID e tracking code do pedido PIX para monitorar confirmação
  const [pixOrderId, setPixOrderId] = useState<string | null>(null);
  const [pixTrackingCode, setPixTrackingCode] = useState<string | null>(null);
  // Cartão: guarda o ID e tracking code do pedido com cartão
  const [cardOrderId, setCardOrderId] = useState<string | null>(null);
  const [cardTrackingCode, setCardTrackingCode] = useState<string | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const hasAutoSelected = useRef(false);
  const toastCounterRef = useRef(0);
  const hasFetched = useRef(false);

  // ⚠️ useOrderHistory PRECISA vir ANTES do useEffect de monitoramento PIX/Cartão
  // porque o useEffect referencia `orders` na array de dependências (TDZ).
  const { addOrder, orders } = useOrderHistory();

  // PIX + CARTÃO: monitora confirmação do pagamento (realtime + polling fallback a cada 2s)
  // NOTA: NÃO depende de showPixModal — o monitoramento continua mesmo se o cliente fechar o modal
  useEffect(() => {
    const checkAndRedirect = () => {
      if (pixOrderId && pixTrackingCode) {
        const pixOrder = orders.find((o) => o.id === pixOrderId);
        if (pixOrder && pixOrder.status !== "aguardando_pagamento_pix" && pixOrder.paymentStatus === "paid") {
          console.log("[PIX-MONITOR-DELIVERY] Pagamento confirmado! Status:", pixOrder.status, "→ redirecionando");
          setShowPixModal(false);
          setPixOrderId(null);
          setTimeout(() => navigate(`/acompanhar-pedido/${pixTrackingCode}`), 500);
          return;
        }
      }
      if (cardOrderId && cardTrackingCode) {
        const cardOrder = orders.find((o) => o.id === cardOrderId);
        if (cardOrder && cardOrder.status !== "aguardando_pagamento" && cardOrder.paymentStatus === "paid") {
          console.log("[CARD-MONITOR-DELIVERY] Pagamento confirmado! Status:", cardOrder.status, "payment:", cardOrder.paymentStatus, "→ redirecionando");
          setShowCardModal(false);
          setCardOrderId(null);
          setTimeout(() => navigate(`/acompanhar-pedido/${cardTrackingCode}`), 500);
          return;
        }
      }
    };

    checkAndRedirect();
    const interval = setInterval(checkAndRedirect, 2000);
    return () => clearInterval(interval);
  }, [orders, pixOrderId, pixTrackingCode, cardOrderId, cardTrackingCode, navigate]);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  const { user } = useAuth();
  const { customerName, customerPhone, setCustomerName, setCustomerPhone, saveToLocalStorage } = useCustomerInfo(user);
  const { items, addItem, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();
  const { showToast } = useGlobalToast();
  const { zonesByLabel, activeZones, loading: zonesLoading, getFeeByNeighborhood, getZoneByNeighborhood, getZoneLabel } = useDeliveryZones();

  const addToast = (
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
    duration = 4000
  ) => {
    const id = `delivery-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration });
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    let isMounted = true;

    async function fetchProducts() {
      try {
        setMenuLoading(true);
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("active", true)
          .order("display_order")
          .order("id");

        if (error) {
          console.error("[DELIVERY] query error:", error.message);
        } else if (data && isMounted) {
          const seen = new Set<number>();
          const mapped: Product[] = [];
          for (const row of data) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            mapped.push({
              id: row.id,
              name: row.name,
              description: row.description || "",
              price: row.price,
              priceFormatted: formatPrice(row.price),
              category: row.category,
              image: row.image_url || "",
              featured: row.featured || false,
              active: row.active !== false,
              customizationOptions: row.customization_options || undefined,
            });
          }
          setProducts(mapped);

          const catSeen = new Set<string>();
          const cats: MenuCategory[] = [];
          for (const p of mapped) {
            if (!catSeen.has(p.category)) {
              catSeen.add(p.category);
              const meta = CATEGORY_META[p.category] || {
                name: p.category,
                icon: "ri-restaurant-line",
              };
              cats.push({ id: p.category, name: meta.name, icon: meta.icon });
            }
          }
          setCategories(cats);
        }
      } catch (err) {
        console.error("[DELIVERY] exception:", err);
      } finally {
        if (isMounted) {
          setMenuLoading(false);
        }
      }
    }

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const deliveryFee = useMemo(
    () => (neighborhood.trim() ? getFeeByNeighborhood(neighborhood) : 0),
    [neighborhood, getFeeByNeighborhood]
  );

  const deliveryZoneLabel = useMemo(() => {
    if (!neighborhood.trim()) return null;
    return getZoneLabel(neighborhood);
  }, [neighborhood, getZoneLabel]);

  const selectedZoneData = useMemo(() => {
    if (!neighborhood.trim()) return undefined;
    return getZoneByNeighborhood(neighborhood);
  }, [neighborhood, getZoneByNeighborhood]);

  const minOrder = selectedZoneData?.min_order ?? 0;
  const avgTime = selectedZoneData?.avg_time ?? "30–50 min";
  const subtotalBelowMin = minOrder > 0 && total < minOrder;
  const grandTotal = total + deliveryFee;

  const effectiveCategory = useMemo(() => {
    if (activeCategory) return activeCategory;
    if (categories.length === 0 || products.length === 0) return "";
    return (
      categories.find((cat) => products.some((p) => p.category === cat.id && p.active))?.id ||
      categories[0]?.id ||
      ""
    );
  }, [activeCategory, categories, products]);

  useEffect(() => {
    if (!menuLoading && categories.length > 0 && !hasAutoSelected.current) {
      hasAutoSelected.current = true;
      const first = categories.find((cat) =>
        products.some((p) => p.category === cat.id && p.active)
      );
      if (first) setActiveCategory(first.id);
      else if (categories[0]) setActiveCategory(categories[0].id);
    }
  }, [menuLoading, categories, products]);

  const handleAddressConfirm = () => {
    if (
      customerName.trim() &&
      customerPhone.trim() &&
      street.trim() &&
      addressNumber.trim() &&
      neighborhood.trim()
    ) {
      saveToLocalStorage();
      setShowAddressForm(false);
    }
  };

  const openCustomizationModal = (item: Product) => {
    if (!item.customizationOptions || item.customizationOptions.length === 0) {
      handleAddToCart(item);
      return;
    }
    const initialState: Record<string, string[]> = {};
    item.customizationOptions.forEach((opt) => {
      if (opt.type === 'single' && opt.required && opt.options.length > 0) {
        initialState[opt.id] = [opt.options[0].id];
      } else {
        initialState[opt.id] = [];
      }
    });
    setCustomizationState(initialState);
    setCustomizationError(null);
    setCustomizingProduct(item);
  };

  const handleCustomizationConfirm = () => {
    if (!customizingProduct) return;
    const product = customizingProduct;

    for (const opt of product.customizationOptions || []) {
      const selected = customizationState[opt.id] || [];
      if (opt.required && selected.length === 0) {
        setCustomizationError(`Por favor, selecione uma opção em: ${opt.name}`);
        return;
      }
      if (opt.maxSelect && selected.length > opt.maxSelect) {
        setCustomizationError(`Você pode selecionar no máximo ${opt.maxSelect} opções em: ${opt.name}`);
        return;
      }
    }

    const customizations: CartItemCustomization[] = [];
    let extraPrice = 0;

    for (const opt of product.customizationOptions || []) {
      const selectedIds = customizationState[opt.id] || [];
      if (selectedIds.length === 0) continue;

      const selectedLabels = selectedIds.map((sid) => {
        const option = opt.options.find((o) => o.id === sid);
        return option?.label || sid;
      });

      let optExtra = 0;
      if (opt.type === 'addon') {
        optExtra = selectedIds.reduce((sum, sid) => {
          const option = opt.options.find((o) => o.id === sid);
          return sum + (option?.price || 0);
        }, 0);
        extraPrice += optExtra;
      }

      customizations.push({
        groupId: opt.id,
        groupName: opt.name,
        selectedIds,
        selectedLabels,
        extraPrice: optExtra,
      });
    }

    handleAddToCart(product, customizations, extraPrice);
    setCustomizingProduct(null);
    setCustomizationState({});
    setCustomizationError(null);
  };

  const handleAddToCart = (item: Product, customizations?: CartItemCustomization[], extraPrice?: number) => {
    const basePrice = typeof item.price === 'number' ? item.price : Number(item.price);
    const finalPrice = basePrice + (extraPrice || 0);
    const displayName = customizations && customizations.length > 0
      ? `${item.name} (${customizations.map(c => c.selectedLabels.join(', ')).join('; ')})`
      : item.name;
    addItem({ id: item.id, name: displayName, price: finalPrice, image: item.image, category: item.category }, customizations);
    addToast(`${displayName} adicionado!`, "success", 2000);
  };

  const handleSendOrder = async () => {
    if (items.length === 0) return;
    if (subtotalBelowMin) {
      addToast(
        `Pedido mínimo para ${selectedZoneData?.neighborhood} é R$ ${minOrder.toFixed(2)}. Adicione mais itens.`,
        "warning",
        4000
      );
      return;
    }

    // Validate all cart items before submission
    const invalidItems = items.filter((i) => !i || !i.id || !i.name || typeof i.price !== "number" || Number.isNaN(i.price) || i.quantity <= 0);
    if (invalidItems.length > 0) {
      addToast("Há itens inválidos no carrinho. Remova e adicione novamente.", "error", 5000);
      return;
    }

    const fullAddress = [
      `${street}, ${addressNumber}`,
      complement ? complement : null,
      neighborhood,
      "Salvador - BA",
    ]
      .filter(Boolean)
      .join(", ");

    // Salva o total ANTES de limpar o carrinho
    const finalTotal = grandTotal;
    setOrderTotalSnapshot(finalTotal);

    try {
      const result = await addOrder({
        orderType: "delivery",
        customerName,
        customerPhone,
        address: fullAddress,
        addressReference: complement,
        neighborhood,
        deliveryFee,
        deliveryInstructions,
        items: items.filter(Boolean).map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, customizations: i.customizations || undefined })),
        totalAmount: finalTotal,
        status: paymentMethod === "pix" ? "aguardando_pagamento_pix" : paymentMethod === "cartao" ? "aguardando_pagamento" : "pending",
        paymentMethod,
        paymentStatus: "pending",
      });

      setTrackingCode(result.publicTrackingCode || result.id);
      if (paymentMethod === "pix") {
        addToast("Pedido PIX registrado! Mostre o QR Code ao garçom para confirmar o pagamento.", "info", 6000);
      } else if (paymentMethod === "cartao") {
        addToast("Pedido registrado! Informe os dados do cartão para confirmar o pagamento.", "info", 6000);
      } else {
        addToast("Pedido de delivery recebido! Acompanhe ao vivo.", "success", 5000);
      }
      setOrderSent(true);
      clearCart();

      // Se for PIX, mostra o modal (sem redirect automático!)
      if (paymentMethod === "pix") {
        setPixOrderId(result.id);
        setPixTrackingCode(result.publicTrackingCode || result.id);
        setShowPixModal(true);
        // O useEffect de monitoramento vai detectar quando o caixa confirmar
      } else if (paymentMethod === "cartao") {
        setCardOrderId(result.id);
        setCardTrackingCode(result.publicTrackingCode || result.id);
        setShowCardModal(true);
      }
    } catch {
      addToast("Erro ao enviar pedido. Tente novamente.", "error", 4000);
    }
  };

  const filteredItems = products.filter((item) => item.category === effectiveCategory);

  // Calcula os pontos esperados
  const expectedPoints = Math.max(1, Math.floor(orderTotalSnapshot / 2));

  return (
    <div className="min-h-screen bg-np-wood-50">
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <a href="/" className="flex items-center gap-1 text-white/70 hover:text-white transition-colors text-sm mb-4">
            <i className="ri-arrow-left-line"></i>
            Voltar
          </a>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">Delivery</h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">Peça em casa! Escolha seus favoritos e receba no conforto do seu lar</p>
        </div>
      </div>

      {showAddressForm && (
        <div className="w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
          <div className="max-w-2xl mx-auto bg-white rounded-xl border border-np-wood-200 p-6 md:p-8">
            <h2 className="font-display text-xl md:text-2xl text-np-purple-900 mb-6">
              <i className="ri-truck-line text-np-green-600 mr-2"></i>
              Dados para Entrega
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-2">Seu Nome *</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome completo" className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-2">Telefone (WhatsApp) *</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(71) 99999-9999" className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm" />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-np-purple-800 mb-2">Rua / Avenida *</label>
              <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Ex: R. Almiro Pinho" className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-2">Número *</label>
                <input type="text" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="123" className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-2">Complemento</label>
                <input type="text" value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, bloco, etc." className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm" />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-np-purple-800 mb-2">
                Bairro * <span className="text-np-purple-400 font-normal text-xs">(define a taxa de entrega)</span>
              </label>
              <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white">
                <option value="">Selecione um bairro...</option>
                {zonesLoading ? (
                  <option value="" disabled>Carregando bairros...</option>
                ) : (
                  Array.from(zonesByLabel.entries()).map(([label, zones]) => (
                    <optgroup key={label} label={`${label} — R$ ${zones[0]?.fee.toFixed(2)}`}>
                      {zones.map((z) => (
                        <option key={z.id} value={z.neighborhood}>{z.neighborhood}</option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
              {activeZones.length === 0 && !zonesLoading && (
                <p className="text-xs text-red-600 mt-1">
                  <i className="ri-error-warning-line mr-1"></i>
                  Nenhum bairro cadastrado. Entre em contato pelo WhatsApp.
                </p>
              )}
            </div>

            {selectedZoneData && (
              <div className="mb-4 bg-np-green-50 border border-np-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="ri-map-pin-2-line text-np-green-600"></i>
                    <div>
                      <p className="text-sm font-medium text-np-green-900">{selectedZoneData.neighborhood}</p>
                      {deliveryZoneLabel && <p className="text-xs text-np-green-600 mt-0.5">{deliveryZoneLabel}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-np-green-700">R$ {deliveryFee.toFixed(2)}</span>
                    <p className="text-xs text-np-green-600">Taxa de entrega</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-np-green-200">
                  {selectedZoneData.min_order > 0 && (
                    <div className="flex items-center gap-1 text-xs text-np-green-800">
                      <i className="ri-shopping-basket-line"></i>
                      Pedido mínimo: R$ {selectedZoneData.min_order.toFixed(2)}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-np-green-800">
                    <i className="ri-time-line"></i>
                    Tempo médio: {avgTime}
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-np-purple-800 mb-2">Observações para entrega</label>
              <textarea value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} placeholder="Ex: Portão verde, interfone 12, deixar na portaria..." maxLength={200} rows={3} className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm resize-none" />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-np-purple-800 mb-2">
                <i className="ri-wallet-line mr-1 text-np-purple-400"></i>
                Forma de Pagamento
              </label>
              <div className="flex gap-2 flex-wrap">
                {[{ value: "caixa" as const, label: "Pagar na Entrega", icon: "ri-cash-line" }, { value: "cartao" as const, label: "Cartão", icon: "ri-bank-card-line" }, { value: "pix" as const, label: "PIX", icon: "ri-qr-code-line" }].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPaymentMethod(opt.value)}
                    className={`flex items-center gap-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      paymentMethod === opt.value
                        ? "bg-np-purple-600 text-white"
                        : "bg-np-wood-100 text-np-purple-700 hover:bg-np-wood-200 border border-np-wood-300"
                    }`}
                  >
                    <i className={opt.icon}></i>
                    {opt.label}
                  </button>
                ))}
              </div>
              {paymentMethod === "pix" && (
                <p className="text-xs text-np-green-600 mt-2">
                  <i className="ri-qr-code-line mr-1"></i>
                  Após enviar o pedido, você verá o QR Code do PIX para pagamento.
                </p>
              )}
              {paymentMethod === "cartao" && (
                <p className="text-xs text-blue-600 mt-2">
                  <i className="ri-bank-card-line mr-1"></i>
                  Após enviar o pedido, informe os dados do cartão para processar o pagamento.
                </p>
              )}
            </div>

            {!user && (
              <div className="bg-np-purple-50 border border-np-purple-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-np-purple-700">
                  <i className="ri-information-line mr-1 text-np-purple-500"></i>
                  <strong>Pontos de fidelidade:</strong>{" "}
                  <a href="/login" className="font-medium underline hover:text-np-purple-900">Faça login</a>{" "}
                  para acumular pontos a cada pedido. Pedidos sem login não geram pontos.
                </p>
              </div>
            )}

            <div className="bg-np-gold-50 border border-np-gold-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-np-purple-800">
                <i className="ri-time-line mr-1 text-np-gold-600"></i>
                <strong>Tempo estimado:</strong> {avgTime}
              </p>
              <p className="text-xs text-np-purple-600 mt-1">A taxa de entrega é calculada automaticamente pelo bairro selecionado.</p>
            </div>

            <button
              onClick={handleAddressConfirm}
              disabled={!customerName.trim() || !customerPhone.trim() || !street.trim() || !addressNumber.trim() || !neighborhood.trim()}
              className="w-full bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
            >
              <i className="ri-restaurant-line mr-2"></i>
              Escolher Produtos — Taxa: R$ {deliveryFee.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {!showAddressForm && (
        <div className="w-full px-4 sm:px-6 lg:px-12 py-6 md:py-8">
          <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-np-wood-200 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-np-green-600 text-white px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0">
                <i className="ri-truck-line mr-1"></i>
                Delivery
              </span>
              <div className="min-w-0">
                <p className="text-sm text-np-purple-900 font-medium truncate">{street}, {addressNumber}{complement ? ` — ${complement}` : ""}</p>
                <p className="text-xs text-np-purple-500 truncate">
                  {neighborhood} &bull; Taxa: <strong className="text-np-green-700">R$ {deliveryFee.toFixed(2)}</strong>
                  {selectedZoneData?.min_order && selectedZoneData.min_order > 0 && (
                    <span> &bull; Mín: R$ {selectedZoneData.min_order.toFixed(2)}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-np-purple-500 whitespace-nowrap">
                {paymentMethod === "caixa" ? "💵 Pagar na entrega" : paymentMethod === "cartao" ? "💳 Cartão" : "📱 PIX"}
              </span>
              <button onClick={() => setShowAddressForm(true)} className="text-sm text-np-purple-600 hover:text-np-purple-800 underline whitespace-nowrap ml-4 flex-shrink-0">Trocar endereço</button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-6">
                {categories.map((cat) => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${effectiveCategory === cat.id ? "bg-np-purple-700 text-white" : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"}`}>
                    <i className={`${cat.icon} mr-1`}></i>{cat.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                {filteredItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-np-wood-200 overflow-hidden hover:border-np-purple-300 transition-all">
                    <div className="flex">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 p-3 md:p-4 flex flex-col justify-between">
                        <div>
                          <h3 className="font-display font-semibold text-np-purple-900 text-sm md:text-base">{item.name}</h3>
                          <p className="text-np-purple-700 font-bold text-sm mt-1">{item.priceFormatted}</p>
                          {item.customizationOptions && item.customizationOptions.length > 0 && (
                            <p className="text-xs text-np-purple-500 mt-0.5">
                              <i className="ri-settings-3-line mr-1"></i>
                              Personalizável
                            </p>
                          )}
                        </div>
                        <button onClick={() => openCustomizationModal(item)} className="mt-2 w-full bg-np-gold-500 hover:bg-np-gold-600 text-np-purple-900 font-medium py-1.5 px-3 rounded-md text-sm transition-colors whitespace-nowrap flex items-center justify-center gap-1">
                          <i className="ri-add-line"></i>
                          {item.customizationOptions && item.customizationOptions.length > 0 ? "Personalizar" : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-96 flex-shrink-0">
              <div className="bg-white rounded-xl border border-np-wood-200 p-5 md:p-6 sticky top-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg text-np-purple-900"><i className="ri-shopping-bag-3-line mr-2 text-np-green-600"></i>Seu Pedido</h3>
                  {itemCount > 0 && <span className="bg-np-gold-500 text-np-purple-900 text-xs font-bold px-2 py-1 rounded-full">{itemCount} {itemCount === 1 ? "item" : "itens"}</span>}
                </div>

                {items.length === 0 ? (
                  <div className="text-center py-8 text-np-purple-400">
                    <i className="ri-shopping-basket-line text-4xl mb-2 block"></i>
                    <p className="text-sm">Seu carrinho está vazio</p>
                    <p className="text-xs mt-1">Adicione itens do cardápio</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
                      {items.filter(Boolean).map((item) => (
                        <div key={item.cartId} className="flex items-center gap-3 bg-np-wood-50 rounded-lg p-3">
                          <img src={item.image} alt={item.name} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-np-purple-900 truncate">{item.name}</p>
                            <p className="text-xs text-np-purple-600">R$ {item.price.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateQuantity(item.cartId, item.quantity - 1)} className="w-7 h-7 rounded-full bg-np-wood-200 hover:bg-np-wood-300 flex items-center justify-center text-np-purple-700 text-sm"><i className="ri-subtract-line"></i></button>
                            <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.cartId, item.quantity + 1)} className="w-7 h-7 rounded-full bg-np-purple-600 hover:bg-np-purple-700 flex items-center justify-center text-white text-sm"><i className="ri-add-line"></i></button>
                          </div>
                          <button onClick={() => removeItem(item.cartId)} className="text-np-red hover:text-red-600 transition-colors"><i className="ri-delete-bin-line"></i></button>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-np-wood-200 pt-4 space-y-2 mb-4">
                      <div className="flex justify-between text-sm"><span className="text-np-purple-600">Subtotal</span><span className="font-medium text-np-purple-900">R$ {total.toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm"><div className="flex items-center gap-1"><span className="text-np-purple-600">Taxa de entrega</span><span className="text-xs text-np-purple-400">({neighborhood})</span></div><span className="font-medium text-np-green-700">R$ {deliveryFee.toFixed(2)}</span></div>
                      {selectedZoneData?.min_order && selectedZoneData.min_order > 0 && (
                        <div className={`flex justify-between text-xs ${subtotalBelowMin ? "text-red-600 font-medium" : "text-np-green-600"}`}>
                          <span>Pedido mínimo para {selectedZoneData.neighborhood}</span>
                          <span>R$ {selectedZoneData.min_order.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-np-wood-100">
                        <span className="font-display text-base text-np-purple-900">Total</span>
                        <span className="font-display text-xl font-bold text-np-purple-900">R$ {grandTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-xs font-medium text-np-purple-700 mb-1.5">
                        <i className="ri-wallet-line mr-1 text-np-purple-400"></i>
                        Pagamento: {paymentMethod === "caixa" ? "Pagar na entrega" : paymentMethod === "cartao" ? "Cartão" : "PIX"}
                      </p>
                      {paymentMethod === "pix" && (
                        <p className="text-xs text-np-green-600">
                          <i className="ri-qr-code-line mr-1"></i>
                          QR Code será exibido após o envio do pedido.
                        </p>
                      )}
                    </div>

                    {subtotalBelowMin && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                        <p className="text-xs text-red-700 flex items-center gap-1">
                          <i className="ri-error-warning-line"></i>
                          Faltam R$ {(minOrder - total).toFixed(2)} para atingir o pedido mínimo.
                        </p>
                      </div>
                    )}

                    {user && (
                      <p className="text-xs text-np-green-600 mb-3 text-center">
                        <i className="ri-coins-line mr-1"></i>
                        Você vai ganhar {Math.max(1, Math.floor(grandTotal / 2))} pontos neste pedido!
                      </p>
                    )}
                    {!user && (
                      <p className="text-xs text-np-purple-400 mb-3 text-center">
                        <i className="ri-information-line mr-1"></i>
                        <a href="/login" className="underline hover:text-np-purple-600">Login</a> para acumular pontos
                      </p>
                    )}

                    <button onClick={handleSendOrder} disabled={subtotalBelowMin} className="w-full bg-np-green-600 hover:bg-np-green-700 disabled:bg-np-wood-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap">
                      <i className="ri-send-plane-line mr-2"></i>Enviar Pedido
                    </button>
                    <p className="text-xs text-center text-np-purple-500 mt-2">{paymentMethod === "pix" ? "Pague via PIX e envie o comprovante" : "Pagamento na entrega"} &bull; Acompanhe em tempo real</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {orderSent && paymentMethod !== "pix" && paymentMethod !== "cartao" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-check-double-line text-3xl text-np-green-600"></i>
            </div>
            <h3 className="font-display text-xl text-np-purple-900 mb-2">Pedido Recebido!</h3>
            <p className="text-np-purple-600 text-sm mb-1">Obrigado, {customerName}!</p>
            <div className="bg-np-wood-50 rounded-lg p-3 mb-3 text-left space-y-1">
              <div className="flex justify-between text-sm"><span className="text-np-purple-600">Subtotal</span><span className="font-medium">R$ {total.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-np-purple-600">Taxa de entrega</span><span className="font-medium text-np-green-700">R$ {deliveryFee.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm border-t border-np-wood-200 pt-1 mt-1"><span className="font-medium text-np-purple-900">Total</span><span className="font-bold text-np-purple-900">R$ {grandTotal.toFixed(2)}</span></div>
            </div>
            {user && orderTotalSnapshot > 0 && (
              <p className="text-np-green-600 text-sm font-medium mb-2">+{expectedPoints} pontos acumulados!</p>
            )}
            {!user && orderTotalSnapshot > 0 && (
              <p className="text-np-purple-400 text-xs mb-2">
                <a href="/login" className="underline hover:text-np-purple-600">Faça login</a> para guardar seus pontos
              </p>
            )}
            {trackingCode && (
              <a href={`/acompanhar-pedido/${trackingCode}`} className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-lg bg-np-purple-700 hover:bg-np-purple-800 text-white text-sm font-medium transition-colors whitespace-nowrap">
                <i className="ri-map-pin-time-line"></i>Acompanhar Pedido
              </a>
            )}
          </div>
        </div>
      )}

      {showPixModal && (
        <PixPaymentModal
          amount={orderTotalSnapshot}
          orderLabel="Delivery"
          onClose={() => {
            setShowPixModal(false);
            setOrderSent(false);
          }}
        />
      )}

      {showCardModal && cardOrderId && (
        <CardPaymentModal
          amount={orderTotalSnapshot}
          orderLabel="Delivery"
          onClose={() => {
            setShowCardModal(false);
          }}
        />
      )}

      {/* Customization Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg text-np-purple-900">
                  {customizingProduct.name}
                </h3>
                <p className="text-sm text-np-purple-600">
                  {customizingProduct.priceFormatted}
                </p>
              </div>
              <button
                onClick={() => { setCustomizingProduct(null); setCustomizationError(null); }}
                className="w-8 h-8 rounded-full bg-np-wood-100 hover:bg-np-wood-200 flex items-center justify-center text-np-purple-700"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <p className="text-sm text-np-purple-700 mb-4">
              Monte seu macarrão do jeito que você gosta!
            </p>

            {customizationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-700">
                  <i className="ri-error-warning-line mr-1"></i>
                  {customizationError}
                </p>
              </div>
            )}

            <div className="space-y-5">
              {customizingProduct.customizationOptions?.map((opt) => {
                const selected = customizationState[opt.id] || [];
                const isSingle = opt.type === 'single';
                const isAddon = opt.type === 'addon';

                return (
                  <div key={opt.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-sm text-np-purple-800">
                        {opt.name}
                      </h4>
                      {opt.required && (
                        <span className="text-xs text-red-500">*obrigatório</span>
                      )}
                      {opt.maxSelect && (
                        <span className="text-xs text-np-purple-500">
                          (máx {opt.maxSelect})
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {opt.options.map((option) => {
                        const isSelected = selected.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => {
                              setCustomizationState((prev) => {
                                const current = prev[opt.id] || [];
                                if (isSingle) {
                                  return { ...prev, [opt.id]: [option.id] };
                                }
                                if (isSelected) {
                                  return { ...prev, [opt.id]: current.filter((id) => id !== option.id) };
                                }
                                if (opt.maxSelect && current.length >= opt.maxSelect) {
                                  return prev;
                                }
                                return { ...prev, [opt.id]: [...current, option.id] };
                              });
                            }}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                              isSelected
                                ? "bg-np-purple-600 text-white"
                                : "bg-np-wood-100 text-np-purple-700 hover:bg-np-wood-200 border border-np-wood-300"
                            }`}
                          >
                            {option.label}
                            {isAddon && option.price && option.price > 0 && (
                              <span className="ml-1">+R$ {option.price.toFixed(2)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-np-wood-200">
              <button
                onClick={handleCustomizationConfirm}
                className="w-full bg-np-green-600 hover:bg-np-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line mr-2"></i>
                Adicionar ao Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <WhatsAppButton />
    </div>
  );
}