import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCart, type CartItemCustomization } from "@/hooks/useCart";
import { useOrderHistory } from "@/hooks/useOrderHistory";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalToast } from "@/hooks/useToast";
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
  soldOut: boolean;
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

const TABLES = Array.from({ length: 10 }, (_, i) => i + 1);

export default function PedidosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mesaParam = searchParams.get("mesa");

  const [selectedTable, setSelectedTable] = useState<number | null>(
    mesaParam ? parseInt(mesaParam, 10) : null
  );
  const [activeCategory, setActiveCategory] = useState("");
  const [showTableSelect, setShowTableSelect] = useState(true);
  const [orderSent, setOrderSent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"caixa" | "cartao" | "pix">("caixa");
  const [itemObservations, setItemObservations] = useState<Record<string, string>>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [invalidTableError, setInvalidTableError] = useState<string | null>(null);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [customizationState, setCustomizationState] = useState<Record<string, string[]>>();
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  const [orderTotalSnapshot, setOrderTotalSnapshot] = useState<number>(0);
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixOrderId, setPixOrderId] = useState<string | null>(null);
  const [pixTrackingCode, setPixTrackingCode] = useState<string | null>(null);
  const [cardOrderId, setCardOrderId] = useState<string | null>(null);
  const [cardTrackingCode, setCardTrackingCode] = useState<string | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const hasAutoSelected = useRef(false);
  const toastIdCounter = useRef(0);
  const hasFetched = useRef(false);

  // ⚠️ useOrderHistory PRECISA vir ANTES do useEffect de monitoramento PIX/Cartão
  // porque o useEffect referencia `orders` na array de dependências.
  // Se viesse depois, daria "Cannot access 'orders' before initialization" (TDZ).
  const { addOrder, orders } = useOrderHistory();

  // PIX + CARTÃO: monitora confirmação do pagamento (realtime + polling fallback a cada 2s)
  // NOTA: NÃO depende de showPixModal — o monitoramento continua mesmo se o cliente fechar o modal
  useEffect(() => {
    const checkAndRedirect = () => {
      if (pixOrderId && pixTrackingCode) {
        const pixOrder = orders.find((o) => o.id === pixOrderId);
        if (pixOrder && pixOrder.status !== "aguardando_pagamento_pix" && pixOrder.paymentStatus === "paid") {
          console.log("[PIX-MONITOR] Pagamento confirmado! Status:", pixOrder.status, "→ redirecionando");
          setShowPixModal(false);
          setPixOrderId(null);
          setTimeout(() => navigate(`/acompanhar-pedido/${pixTrackingCode}`), 500);
          return;
        }
      }
      if (cardOrderId && cardTrackingCode) {
        const cardOrder = orders.find((o) => o.id === cardOrderId);
        if (cardOrder && cardOrder.status !== "aguardando_pagamento" && cardOrder.paymentStatus === "paid") {
          console.log("[CARD-MONITOR] Pagamento confirmado! Status:", cardOrder.status, "payment:", cardOrder.paymentStatus, "→ redirecionando");
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

  useEffect(() => {
    if (mesaParam) {
      const num = parseInt(mesaParam, 10);
      if (num < 1 || num > 10 || Number.isNaN(num)) {
        setInvalidTableError(`Mesa ${mesaParam} não existe. Nosso estabelecimento possui apenas 10 mesas (1 a 10).`);
        setSelectedTable(null);
      } else {
        setInvalidTableError(null);
        setSelectedTable(num);
      }
    }
  }, [mesaParam]);

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
          console.error("[PEDIDOS] query error:", error.message);
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
              soldOut: row.sold_out === true,
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
        console.error("[PEDIDOS] exception:", err);
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

  const { user } = useAuth();
  const { customerName, customerPhone, setCustomerName, setCustomerPhone, saveToLocalStorage } = useCustomerInfo(user);
  const { items, addItem, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();

  useEffect(() => {
    if (menuLoading) return;
    const validIds = new Set(safeProducts.map((p) => p.id));
    const currentItems = items;
    const invalidCartIds: string[] = [];
    for (const item of currentItems) {
      if (item && item.id && !validIds.has(item.id)) {
        invalidCartIds.push(item.cartId);
      }
    }
    if (invalidCartIds.length > 0) {
      console.warn("[PEDIDOS] removing invalid cart items (products no longer exist):", invalidCartIds);
      showToast({
        id: nextToastId(),
        message: `${invalidCartIds.length} item(ns) do carrinho foram removidos pois o produto não está mais disponível.`,
        type: "warning",
        duration: 5000,
      });
      invalidCartIds.forEach((cid) => removeItem(cid));
    }
  }, [menuLoading]);
  const { showToast } = useGlobalToast();

  const nextToastId = () => `pedidos-${Date.now()}-${++toastIdCounter.current}`;

  const safeProducts = Array.isArray(products) ? products : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const effectiveCategory = useMemo(() => {
    if (activeCategory) return activeCategory;
    if (safeCategories.length === 0 || safeProducts.length === 0) return "";
    const firstWithProducts = safeCategories.find((cat) =>
      safeProducts.some((p) => p.category === cat.id && p.active)
    );
    return firstWithProducts?.id || safeCategories[0]?.id || "";
  }, [activeCategory, safeCategories, safeProducts]);

  useEffect(() => {
    if (!menuLoading && safeCategories.length > 0 && !hasAutoSelected.current) {
      hasAutoSelected.current = true;
      const validCategoryIds = new Set(safeCategories.map((c) => c.id));
      if (!activeCategory || !validCategoryIds.has(activeCategory)) {
        const firstWithProducts = safeCategories.find((cat) =>
          safeProducts.some((p) => p.category === cat.id && p.active)
        );
        if (firstWithProducts) {
          setActiveCategory(firstWithProducts.id);
        } else {
          setActiveCategory(safeCategories[0].id);
        }
      }
    }
  }, [menuLoading, safeCategories, safeProducts]);

  const handleTableConfirm = () => {
    if (selectedTable && customerName.trim()) {
      saveToLocalStorage();
      setShowTableSelect(false);
    }
  };

  const openCustomizationModal = (item: Product) => {
    if (!item.customizationOptions || item.customizationOptions.length === 0) {
      safeAddItem(item);
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

    safeAddItem(product, customizations, extraPrice);
    setCustomizingProduct(null);
    setCustomizationState({});
    setCustomizationError(null);
  };

  const safeAddItem = (item: Product, customizations?: CartItemCustomization[], extraPrice?: number) => {
    console.log("[PEDIDOS] produto selecionado:", item);
    if (item.soldOut) {
  showToast({
    id: nextToastId(),
    message: "Este produto está esgotado no momento.",
    type: "warning",
    duration: 3000,
  });
  return;
}
    try {
      if (!item || typeof item !== "object") {
        console.error("[PEDIDOS] produto inválido:", item);
        showToast({ id: nextToastId(), message: "Não foi possível adicionar este item. Produto inválido.", type: "error", duration: 4000 });
        return;
      }
      const id = item.id ?? 0;
      const name = item.name || "Produto";
      const rawPrice = item.price;
      const basePrice = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
      const price = basePrice + (extraPrice || 0);
      if (Number.isNaN(price)) {
        console.error("[PEDIDOS] preço inválido:", rawPrice);
        showToast({ id: nextToastId(), message: "Não foi possível adicionar este item. Preço inválido.", type: "error", duration: 4000 });
        return;
      }
      const image = item.image || "";
      const category = item.category || "outros";

      const displayName = customizations && customizations.length > 0
        ? `${name} (${customizations.map(c => c.selectedLabels.join(', ')).join('; ')})`
        : name;

      console.log("[PEDIDOS] adicionando ao carrinho:", { id, name: displayName, price, image, category });
      addItem({ id, name: displayName, price, image, category }, customizations);
      console.log("[PEDIDOS] item adicionado:", displayName);
      showToast({ id: nextToastId(), message: `${displayName} adicionado!`, type: "success", duration: 2000 });
    } catch (err) {
      console.error("[PEDIDOS] erro ao adicionar item:", err);
      showToast({ id: nextToastId(), message: "Não foi possível adicionar este item. Tente novamente.", type: "error", duration: 4000 });
    }
  };

  const handleSendOrder = async () => {
    if (!selectedTable || items.length === 0) {
      console.warn("[ORDER] submit blocked — missing table or empty cart");
      return;
    }

    setSubmitError(null);

    const validProductIds = new Set(safeProducts.map((p) => p.id));
    const invalidItems = items.filter((i) =>
      !i || !i.id || !i.name || typeof i.price !== "number" || Number.isNaN(i.price) || i.quantity <= 0 || !validProductIds.has(i.id)
    );
    if (invalidItems.length > 0) {
      const msg = "Há itens inválidos no carrinho. Remova e adicione novamente.";
      console.error("[ORDER] invalid cart items:", invalidItems);
      setSubmitError(msg);
      showToast({ id: nextToastId(), message: msg, type: "error", duration: 5000 });
      return;
    }

    console.log("[ORDER] submit started — table:", selectedTable, "items:", items.length);

    const finalTotal = total;
    setOrderTotalSnapshot(finalTotal);

    const safeObservations = itemObservations || {};
    const orderItems = items
      .filter((i) => i && i.id && validProductIds.has(i.id))
      .map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        observation: safeObservations[i.cartId] || undefined,
        customizations: i.customizations || undefined,
      }));

    try {
      const result = await addOrder({
        tableNumber: selectedTable,
        orderType: "mesa",
        customerName,
        customerPhone,
        items: orderItems,
        totalAmount: finalTotal,
        status: paymentMethod === "pix" ? "aguardando_pagamento_pix" : paymentMethod === "cartao" ? "aguardando_pagamento" : "pending",
        paymentMethod,
        paymentStatus: "pending",
      });
      console.log("[ORDER] insert success — orderId:", result.id, "trackingCode:", result.publicTrackingCode);

      saveToLocalStorage(customerName, customerPhone);
      if (paymentMethod === "pix") {
        showToast({ id: nextToastId(), message: `Pedido PIX da Mesa ${selectedTable} registrado! Aguardando confirmação do pagamento.`, type: "info", duration: 6000 });
      } else if (paymentMethod === "cartao") {
        showToast({ id: nextToastId(), message: `Pedido da Mesa ${selectedTable} registrado! Processe o cartão para confirmar o pagamento.`, type: "info", duration: 6000 });
      } else {
        showToast({ id: nextToastId(), message: `Pedido da Mesa ${selectedTable} enviado para a cozinha!`, type: "success", duration: 5000 });
      }
      setOrderSent(true);
      clearCart();
      setItemObservations({});
      console.log("[ORDER] state reset — cart cleared, orderSent=true");

      if (paymentMethod === "pix") {
        setPixOrderId(result.id);
        setPixTrackingCode(result.publicTrackingCode || result.id);
        setShowPixModal(true);
      } else if (paymentMethod === "cartao") {
        setCardOrderId(result.id);
        setCardTrackingCode(result.publicTrackingCode || result.id);
        setShowCardModal(true);
      } else {
        const trackingCode = result.publicTrackingCode || result.id;
        setTimeout(() => {
          navigate(`/acompanhar-pedido/${trackingCode}`);
        }, 2000);
      }
    } catch (err) {
      console.error("[ORDER] insert failed:", err);
      const msg = err instanceof Error ? err.message : "Erro ao enviar pedido";
      setSubmitError(msg);
      showToast({ id: nextToastId(), message: `Erro ao enviar pedido: ${msg}`, type: "error", duration: 6000 });
    }
  };

  const filteredItems = safeProducts.filter((item) => item && item.category === effectiveCategory);

  const expectedPoints = Math.max(1, Math.floor(orderTotalSnapshot / 2));

  return (
    <div className="min-h-screen bg-np-wood-50">
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-white/70 hover:text-white transition-colors text-sm mb-4"
          >
            <i className="ri-arrow-left-line"></i>
            Voltar
          </button>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">
            Pedidos por Mesa
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Escolha sua mesa, selecione os itens e envie o pedido direto pra cozinha
          </p>
        </div>
      </div>

      {invalidTableError && (
        <div className="w-full px-4 sm:px-6 lg:px-12 pt-6">
          <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <i className="ri-error-warning-line text-2xl text-red-500"></i>
            <div>
              <p className="text-sm font-medium text-red-800">Mesa Inválida</p>
              <p className="text-xs text-red-600">{invalidTableError}</p>
            </div>
          </div>
        </div>
      )}

      {mesaParam && selectedTable && showTableSelect && !invalidTableError && (
        <div className="w-full px-4 sm:px-6 lg:px-12 pt-6">
          <div className="max-w-2xl mx-auto bg-np-green-50 border border-np-green-200 rounded-xl p-4 flex items-center gap-3">
            <i className="ri-qr-code-line text-2xl text-np-green-600"></i>
            <div>
              <p className="text-sm font-medium text-np-green-800">Mesa {selectedTable} identificada via QR Code</p>
              <p className="text-xs text-np-green-600">Confirme seus dados abaixo para continuar</p>
            </div>
          </div>
        </div>
      )}

      {showTableSelect && (
        <div className="w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
            <h2 className="font-display text-xl md:text-2xl text-np-purple-900 mb-6">
              <i className="ri-map-pin-line text-np-green-600 mr-2"></i>
              Identifique sua Mesa
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-np-purple-800 mb-2">Seu Nome *</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Como podemos te chamar?" className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm" />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-np-purple-800 mb-2">Telefone (opcional)</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(71) 99999-9999" className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm" />
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

            {!mesaParam && (
              <label className="block text-sm font-medium text-np-purple-800 mb-3">Selecione o número da sua mesa</label>
            )}
            {mesaParam && (
              <div className="mb-4 bg-np-green-50 border border-np-green-200 rounded-lg p-3 flex items-center gap-2">
                <i className="ri-check-line text-np-green-600"></i>
                <span className="text-sm text-np-green-800">Mesa <strong>{selectedTable}</strong> identificada pelo QR Code</span>
              </div>
            )}
            <div className={`grid gap-2 md:gap-3 ${mesaParam ? 'grid-cols-1' : 'grid-cols-5 sm:grid-cols-6 md:grid-cols-10'}`}>
              {mesaParam ? (
                <button onClick={() => setSelectedTable(parseInt(mesaParam, 10))} className={`w-full aspect-square rounded-lg font-display font-bold text-sm transition-all ${selectedTable === parseInt(mesaParam, 10) ? "bg-np-purple-600 text-white shadow-md" : "bg-np-wood-100 text-np-purple-700 hover:bg-np-wood-200 border border-np-wood-300"}`}>
                  {mesaParam}
                </button>
              ) : (
                TABLES.map((num) => (
                  <button key={num} onClick={() => setSelectedTable(num)} className={`w-full aspect-square rounded-lg font-display font-bold text-sm transition-all ${selectedTable === num ? "bg-np-purple-600 text-white shadow-md" : "bg-np-wood-100 text-np-purple-700 hover:bg-np-wood-200 border border-np-wood-300"}`}>
                    {num}
                  </button>
                ))
              )}
            </div>

            <button onClick={handleTableConfirm} disabled={!selectedTable || !customerName.trim()} className="mt-6 w-full bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap">
              {selectedTable ? <><i className="ri-check-line mr-2"></i>Confirmar Mesa {selectedTable}</> : "Selecione uma mesa"}
            </button>
          </div>
        </div>
      )}

      {!showTableSelect && (
        <div className="w-full px-4 sm:px-6 lg:px-12 py-6 md:py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="bg-np-purple-700 text-white px-4 py-2 rounded-full text-sm font-medium"><i className="ri-armchair-line mr-1"></i>Mesa {selectedTable}</span>
              <span className="text-sm text-np-purple-700">Olá, {customerName}!</span>
            </div>
            <button onClick={() => setShowTableSelect(true)} className="text-sm text-np-purple-600 hover:text-np-purple-800 underline">Trocar mesa</button>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-6">
                {safeCategories.map((cat) => (
                  <button key={cat?.id || Math.random()} onClick={() => setActiveCategory(cat?.id || "outros")} className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${effectiveCategory === cat?.id ? "bg-np-purple-700 text-white" : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"}`}>
                    <i className={`${cat?.icon || "ri-restaurant-line"} mr-1`}></i>{cat?.name || "Categoria"}
                  </button>
                ))}
              </div>

              {menuLoading ? (
                <div className="flex items-center justify-center py-12"><i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                  {filteredItems.map((item) => (
                    <div key={item?.id || Math.random()} className="bg-white rounded-xl border border-np-wood-200 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="flex">
                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0">
                          <img
                        src={
                            item?.image ||
                        "https://readdy.ai/api/search-image?query=minimalist%20food%20placeholder%20icon%20on%20light%20background%20simple%20illustration&width=200&height=200&seq=1&orientation=squarish"
  }
  alt={item?.name || "Produto"}
  className={`w-full h-full object-cover ${
    item?.soldOut ? "grayscale opacity-70" : ""
  }`}
  onError={(e) => {
    (e.target as HTMLImageElement).src =
      "https://readdy.ai/api/search-image?query=minimalist%20food%20placeholder%20icon%20on%20light%20background%20simple%20illustration&width=200&height=200&seq=1&orientation=squarish";
  }}
/>
{item?.soldOut && (
  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
    <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
      ESGOTADO
    </span>
  </div>
)}
                        </div>
                        <div className="flex-1 p-3 md:p-4 flex flex-col justify-between">
                          <div>
                            <h3 className="font-display font-semibold text-np-purple-900 text-sm md:text-base">{item?.name || "Produto"}</h3>
                            <p className="text-np-purple-700 font-bold text-sm mt-1">{item?.priceFormatted || "R$ 0,00"}</p>
                            {item?.customizationOptions && item.customizationOptions.length > 0 && (
                              <p className="text-xs text-np-purple-500 mt-0.5"><i className="ri-settings-3-line mr-1"></i>Personalizável</p>
                            )}
                          </div>
                          <button
  disabled={item?.soldOut}
  onClick={() => {
    if (item?.soldOut) return;
    item && openCustomizationModal(item);
  }}
  className={`mt-2 w-full font-medium py-1.5 px-3 rounded-md text-sm transition-colors flex items-center justify-center gap-1 ${
    item?.soldOut
      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
      : "bg-np-gold-500 hover:bg-np-gold-600 text-np-purple-900"
  }`}
>
  <i
    className={
      item?.soldOut ? "ri-forbid-2-line" : "ri-add-line"
    }
  ></i>

  {item?.soldOut
    ? "ESGOTADO"
    : item?.customizationOptions &&
      item.customizationOptions.length > 0
    ? "Personalizar"
    : "Adicionar"}
</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                    <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                      {items.filter(Boolean).map((item) => {
                        const cartId = item?.cartId || "";
                        const obs = (itemObservations || {})[cartId] || "";
                        return (
                        <div key={cartId || Math.random()} className="flex items-center gap-3 bg-np-wood-50 rounded-lg p-3">
                          <img src={item?.image || ""} alt={item?.name || "Produto"} className="w-12 h-12 rounded-md object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-np-purple-900 truncate">{item?.name || "Produto"}</p>
                            <p className="text-xs text-np-purple-600">R$ {typeof item?.price === "number" ? item.price.toFixed(2) : "0.00"}</p>
                            <input type="text" value={obs} onChange={(e) => setItemObservations((prev) => ({ ...(prev || {}), [cartId]: e.target.value }))} placeholder="Obs: sem cebola, mais molho..." maxLength={100} className="mt-1 w-full text-xs px-2 py-1 rounded border border-np-wood-200 focus:outline-none focus:ring-1 focus:ring-np-purple-400" />
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => item?.cartId && updateQuantity(item.cartId, (item?.quantity || 1) - 1)} className="w-7 h-7 rounded-full bg-np-wood-200 hover:bg-np-wood-300 flex items-center justify-center text-np-purple-700 text-sm"><i className="ri-subtract-line"></i></button>
                            <span className="text-sm font-medium w-5 text-center">{item?.quantity || 1}</span>
                            <button onClick={() => item?.cartId && updateQuantity(item.cartId, (item?.quantity || 1) + 1)} className="w-7 h-7 rounded-full bg-np-purple-600 hover:bg-np-purple-700 flex items-center justify-center text-white text-sm"><i className="ri-add-line"></i></button>
                          </div>
                          <button onClick={() => item?.cartId && removeItem(item.cartId)} className="text-np-red hover:text-red-600 transition-colors"><i className="ri-delete-bin-line"></i></button>
                        </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-np-wood-200 pt-4 mb-4">
                      <p className="text-sm font-medium text-np-purple-800 mb-2"><i className="ri-wallet-line mr-1 text-np-purple-400"></i>Forma de Pagamento</p>
                      <div className="flex gap-2 flex-wrap">
                        {[{ value: "caixa", label: "Pagar no Caixa", icon: "ri-cash-line" }, { value: "cartao", label: "Cartão", icon: "ri-bank-card-line" }, { value: "pix", label: "PIX", icon: "ri-qr-code-line" }].map((opt) => (
                          <button key={opt.value} onClick={() => setPaymentMethod(opt.value as typeof paymentMethod)} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${paymentMethod === opt.value ? "bg-np-purple-600 text-white" : "bg-np-wood-100 text-np-purple-700 hover:bg-np-wood-200 border border-np-wood-300"}`}>
                            <i className={opt.icon}></i>{opt.label}
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

                    <div className="border-t border-np-wood-200 pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-display text-lg text-np-purple-900">Total</span>
                        <span className="font-display text-xl font-bold text-np-purple-900">R$ {typeof total === "number" ? total.toFixed(2) : "0.00"}</span>
                      </div>
                      {user && (
                        <p className="text-xs text-np-green-600 mb-2 text-center">
                          <i className="ri-coins-line mr-1"></i>
                          Você vai ganhar {typeof total === "number" ? Math.max(1, Math.floor(total / 2)) : 0} pontos neste pedido!
                        </p>
                      )}
                      {!user && (
                        <p className="text-xs text-np-purple-400 mb-2 text-center">
                          <i className="ri-information-line mr-1"></i>
                          <a href="/login" className="underline hover:text-np-purple-600">Login</a> para acumular pontos
                        </p>
                      )}
                      {submitError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                          <p className="text-xs text-red-700"><i className="ri-error-warning-line mr-1"></i>{submitError}</p>
                        </div>
                      )}
                      <button onClick={handleSendOrder} className="w-full bg-np-green-600 hover:bg-np-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap">
                        <i className="ri-send-plane-line mr-2"></i>Enviar Pedido
                      </button>
                      <p className="text-xs text-center text-np-purple-500 mt-2">Pagamento: {paymentMethod === "caixa" ? "Pagar no caixa/garçom" : paymentMethod === "cartao" ? "Cartão de crédito/débito" : "PIX"}</p>
                    </div>
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
            <h3 className="font-display text-xl text-np-purple-900 mb-2">Pedido Enviado!</h3>
            <p className="text-np-purple-600 text-sm mb-1">Mesa {selectedTable} — {customerName}</p>
            {user && orderTotalSnapshot > 0 && (
              <p className="text-np-green-600 text-sm font-medium">
                +{expectedPoints} pontos acumulados!
              </p>
            )}
            {!user && orderTotalSnapshot > 0 && (
              <p className="text-np-purple-400 text-xs mt-1">
                <a href="/login" className="underline hover:text-np-purple-600">Faça login</a> para guardar seus pontos
              </p>
            )}
            <p className="text-np-purple-500 text-sm mt-2">Seu pedido já foi para a cozinha. Em breve um garçom vai confirmar com você!</p>
          </div>
        </div>
      )}

      {showPixModal && (
        <PixPaymentModal
          amount={orderTotalSnapshot}
          orderLabel={`Mesa ${selectedTable}`}
          onClose={() => {
            setShowPixModal(false);
            setOrderSent(false);
          }}
        />
      )}

      {showCardModal && cardOrderId && (
        <CardPaymentModal
          amount={orderTotalSnapshot}
          orderLabel={`Mesa ${selectedTable}`}
          onClose={() => {
            setShowCardModal(false);
          }}
        />
      )}

      {customizingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg text-np-purple-900">{customizingProduct.name}</h3>
                <p className="text-sm text-np-purple-600">{customizingProduct.priceFormatted}</p>
              </div>
              <button onClick={() => { setCustomizingProduct(null); setCustomizationError(null); }} className="w-8 h-8 rounded-full bg-np-wood-100 hover:bg-np-wood-200 flex items-center justify-center text-np-purple-700">
                <i className="ri-close-line"></i>
              </button>
            </div>

            <p className="text-sm text-np-purple-700 mb-4">Monte seu macarrão do jeito que você gosta!</p>

            {customizationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-700"><i className="ri-error-warning-line mr-1"></i>{customizationError}</p>
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
                      <h4 className="font-medium text-sm text-np-purple-800">{opt.name}</h4>
                      {opt.required && <span className="text-xs text-red-500">*obrigatório</span>}
                      {opt.maxSelect && <span className="text-xs text-np-purple-500">(máx {opt.maxSelect})</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {opt.options.map((option) => {
                        const isSelected = selected.includes(option.id);
                        return (
                          <button key={option.id} onClick={() => {
                            setCustomizationState((prev) => {
                              const current = prev[opt.id] || [];
                              if (isSingle) return { ...prev, [opt.id]: [option.id] };
                              if (isSelected) return { ...prev, [opt.id]: current.filter((id) => id !== option.id) };
                              if (opt.maxSelect && current.length >= opt.maxSelect) return prev;
                              return { ...prev, [opt.id]: [...current, option.id] };
                            });
                          }} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${isSelected ? "bg-np-purple-600 text-white" : "bg-np-wood-100 text-np-purple-700 hover:bg-np-wood-200 border border-np-wood-300"}`}>
                            {option.label}
                            {isAddon && option.price && option.price > 0 && <span className="ml-1">+R$ {option.price.toFixed(2)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-np-wood-200">
              <button onClick={handleCustomizationConfirm} className="w-full bg-np-green-600 hover:bg-np-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap">
                <i className="ri-add-line mr-2"></i>Adicionar ao Pedido
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