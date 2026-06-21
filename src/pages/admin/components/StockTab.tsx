import { useState, useMemo } from "react";
import {
  useStock,
  STOCK_REASONS,
  type StockReason,
  type ProductStock,
} from "@/hooks/useStock";

interface StockTabProps {
  addToast: (message: string, type?: "success" | "error" | "warning" | "info") => void;
}

export default function StockTab({ addToast }: StockTabProps) {
  const {
    products,
    movements,
    loading,
    movementsLoading,
    adjustStock,
    getLowStockAlerts,
    getLowStockReport,
  } = useStock();

  const [view, setView] = useState<"produtos" | "movimentacoes" | "relatorio">("produtos");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [adjustingProduct, setAdjustingProduct] = useState<ProductStock | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState<StockReason>("compra");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustType, setAdjustType] = useState<"add" | "remove" | "manual">("add");
  const [showAlertFilter, setShowAlertFilter] = useState(false);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => cats.add(p.category));
    return Array.from(cats);
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => p.active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (categoryFilter) {
      list = list.filter((p) => p.category === categoryFilter);
    }
    if (showAlertFilter) {
      // Mostra produtos em estado crítico (≤ min_stock) e atenção (≤ alert_stock)
      list = list.filter((p) => p.min_stock > 0 && p.stock_quantity <= p.alert_stock);
    }
    return list;
  }, [products, search, categoryFilter, showAlertFilter]);

  const lowStockAlerts = useMemo(() => getLowStockAlerts(), [getLowStockAlerts]);
  const lowStockReport = useMemo(() => getLowStockReport(), [getLowStockReport]);

  const handleAdjust = async () => {
    if (!adjustingProduct || !adjustQuantity) return;
    const qty = parseInt(adjustQuantity);
    if (isNaN(qty) || qty === 0) {
      addToast("Quantidade inválida", "warning");
      return;
    }
    // Para ajuste manual, qty é o valor final desejado; calcular delta
    const delta = adjustType === "add" ? qty : adjustType === "remove" ? -qty : qty - adjustingProduct.stock_quantity;
    const { error, newStock } = await adjustStock(
      adjustingProduct.id,
      delta,
      adjustReason,
      adjustNotes
    );
    if (error) {
      addToast(error.message || "Erro ao ajustar estoque", "error");
      console.error("[STOCK TAB] adjustStock error:", error);
    } else {
      const action = delta > 0 ? "adicionado" : "removido";
      addToast(
        `${Math.abs(delta)} unidade(s) ${action} de ${adjustingProduct.name}. Estoque atual: ${newStock}`,
        "success"
      );
      setAdjustingProduct(null);
      setAdjustQuantity("");
      setAdjustNotes("");
    }
  };

  const openAdjust = (product: ProductStock, type: "add" | "remove" | "manual") => {
    setAdjustingProduct(product);
    setAdjustType(type);
    setAdjustReason(type === "add" ? "compra" : type === "remove" ? "perda" : "correcao");
    setAdjustQuantity("");
    setAdjustNotes("");
  };

  const quickAdd = async (product: ProductStock, amount: number) => {
    const { error, newStock } = await adjustStock(product.id, amount, "compra", "Adição rápida");
    if (error) {
      addToast(error.message || "Erro ao adicionar estoque", "error");
      console.error("[STOCK TAB] quickAdd error:", error);
    } else {
      addToast(`+${amount} unidade(s) adicionadas a ${product.name}. Estoque: ${newStock}`, "success");
    }
  };

  const quickRemove = async (product: ProductStock, amount: number) => {
    const { error, newStock } = await adjustStock(product.id, -amount, "baixa_pedido", "Baixa rápida");
    if (error) {
      addToast(error.message || "Erro ao remover estoque", "error");
      console.error("[STOCK TAB] quickRemove error:", error);
    } else {
      addToast(`-${amount} unidade(s) removidas de ${product.name}. Estoque: ${newStock}`, "success");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl">
        <div className="text-center py-16">
          <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i>
          <p className="text-sm text-np-purple-500 mt-2">Carregando estoque...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl text-np-purple-900">
          <i className="ri-box-3-line mr-2 text-np-purple-500"></i>
          Controle de Estoque
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAlertFilter(!showAlertFilter)}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
              showAlertFilter
                ? "bg-red-50 border-red-300 text-red-700"
                : "bg-white border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50"
            }`}
          >
            <i className="ri-error-warning-line"></i>
            {showAlertFilter ? "Mostrar todos" : "Só alertas"}
          </button>
          <span className="text-xs text-np-purple-400">
            {products.length} produtos
          </span>
        </div>
      </div>

      {/* Alert Banner */}
      {lowStockAlerts.length > 0 && !showAlertFilter && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <i className="ri-error-warning-line text-red-600"></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-900">
              {lowStockAlerts.length} produto{lowStockAlerts.length > 1 ? "s" : ""} com estoque CRÍTICO (≤ {(() => { const p = lowStockAlerts[0]; return p?.product?.min_stock ?? 5; })()} unid.)
            </p>
            <p className="text-xs text-red-700 mt-1">
              {lowStockAlerts
                .map((a) => `${a.product.name} (${a.product.stock_quantity} unid. / mín: ${a.product.min_stock})`)
                .join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        {[
          { id: "produtos", label: "Produtos", icon: "ri-box-3-line" },
          { id: "movimentacoes", label: "Movimentações", icon: "ri-history-line" },
          { id: "relatorio", label: "Relatório de Risco", icon: "ri-bar-chart-line" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id as typeof view)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              view === tab.id
                ? "bg-np-purple-700 text-white"
                : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"
            }`}
          >
            <i className={`${tab.icon} mr-1`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* PRODUTOS VIEW */}
      {view === "produtos" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 bg-white rounded-xl border border-np-wood-200 p-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Buscar produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
              />
            </div>
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500 bg-white"
              >
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {(search || categoryFilter) && (
              <button
                onClick={() => { setSearch(""); setCategoryFilter(""); }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-np-purple-600 hover:bg-np-wood-50 border border-np-wood-200 transition-colors whitespace-nowrap"
              >
                <i className="ri-close-line mr-1"></i>
                Limpar
              </button>
            )}
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-np-purple-50 text-np-purple-800">
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-left px-4 py-3 font-medium">Categoria</th>
                    <th className="text-center px-4 py-3 font-medium">Estoque</th>
                    <th className="text-center px-4 py-3 font-medium">Mínimo</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-center px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-np-wood-100">
                  {filteredProducts.map((product) => {
                    const isCritical = product.min_stock > 0 && product.stock_quantity <= product.min_stock;
                    const isWarning = !isCritical && product.alert_stock > 0 && product.stock_quantity <= product.alert_stock;
                    return (
                      <tr key={product.id} className={`hover:bg-np-wood-50 ${isCritical ? "bg-red-50/50" : isWarning ? "bg-yellow-50/50" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-np-wood-100 flex-shrink-0">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-np-wood-400">
                                  <i className="ri-image-line"></i>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-np-purple-900">{product.name}</p>
                              <p className="text-xs text-np-purple-500">
                                R$ {product.price.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-np-purple-700 text-xs capitalize">
                          {product.category}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${isCritical ? "text-red-600" : isWarning ? "text-yellow-600" : "text-np-purple-900"}`}>
                            {product.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-np-purple-500">
                          {product.min_stock > 0 ? product.min_stock : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                              <i className="ri-error-warning-line"></i>
                              Crítico
                            </span>
                          ) : isWarning ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-medium">
                              <i className="ri-alert-line"></i>
                              Atenção
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-np-green-100 text-np-green-700 px-2 py-0.5 rounded font-medium">
                              <i className="ri-check-line"></i>
                              OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              onClick={() => quickAdd(product, 1)}
                              className="p-1.5 rounded-md bg-np-green-100 text-np-green-600 hover:bg-np-green-200 transition-colors"
                              title="+1"
                            >
                              <i className="ri-add-line"></i>
                            </button>
                            <button
                              onClick={() => quickRemove(product, 1)}
                              className="p-1.5 rounded-md bg-red-100 text-red-500 hover:bg-red-200 transition-colors"
                              title="-1"
                            >
                              <i className="ri-subtract-line"></i>
                            </button>
                            <button
                              onClick={() => openAdjust(product, "add")}
                              className="p-1.5 rounded-md bg-np-green-50 text-np-green-600 hover:bg-np-green-100 transition-colors border border-np-green-200"
                              title="Adicionar Estoque"
                            >
                              <i className="ri-arrow-up-line"></i>
                            </button>
                            <button
                              onClick={() => openAdjust(product, "remove")}
                              className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-200"
                              title="Remover Estoque"
                            >
                              <i className="ri-arrow-down-line"></i>
                            </button>
                            <button
                              onClick={() => openAdjust(product, "manual")}
                              className="p-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200"
                              title="Ajuste Manual"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredProducts.length === 0 && (
              <div className="text-center py-12 text-np-purple-400">
                <i className="ri-search-line text-3xl mb-2 block"></i>
                <p className="text-sm">Nenhum produto encontrado</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* MOVIMENTACOES VIEW */}
      {view === "movimentacoes" && (
        <div className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-np-wood-100">
            <h3 className="font-medium text-np-purple-900 text-sm">
              <i className="ri-history-line mr-1 text-np-purple-500"></i>
              Histórico de Movimentações
            </h3>
            <span className="text-xs text-np-purple-400">
              {movements.length} registros
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-np-purple-50 text-np-purple-800">
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-left px-4 py-3 font-medium">Motivo</th>
                  <th className="text-center px-4 py-3 font-medium">Quantidade</th>
                  <th className="text-center px-4 py-3 font-medium">Anterior</th>
                  <th className="text-center px-4 py-3 font-medium">Novo</th>
                  <th className="text-left px-4 py-3 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-np-wood-100">
                {movementsLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <i className="ri-loader-4-line animate-spin text-2xl text-np-purple-400"></i>
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-np-purple-400">
                      <i className="ri-history-line text-3xl mb-2 block"></i>
                      <p className="text-sm">Nenhuma movimentação registrada</p>
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const reason = STOCK_REASONS[m.reason];
                    return (
                      <tr key={m.id} className="hover:bg-np-wood-50">
                        <td className="px-4 py-3 text-xs text-np-purple-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-sm text-np-purple-800 font-medium">
                          {m.product_name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${reason.color}`}>
                            <i className={reason.icon}></i>
                            {reason.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${m.quantity > 0 ? "text-np-green-600" : "text-red-600"}`}>
                            {m.quantity > 0 ? "+" : ""}{m.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-np-purple-500">
                          {m.previous_stock}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-np-purple-900">
                          {m.new_stock}
                        </td>
                        <td className="px-4 py-3 text-xs text-np-purple-400 max-w-[200px] truncate">
                          {m.notes || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RELATORIO VIEW */}
      {view === "relatorio" && (
        <div className="space-y-4">
          {/* Critical — estoque ≤ mínimo */}
          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="bg-red-50 px-4 py-3 border-b border-red-200">
              <h3 className="font-medium text-red-900 text-sm flex items-center gap-2">
                <i className="ri-error-warning-line text-red-600"></i>
                Estoque Crítico (≤ {products.length > 0 ? products[0].min_stock || 5 : 5} unidades)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50/50 text-red-800">
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-center px-4 py-3 font-medium">Atual</th>
                    <th className="text-center px-4 py-3 font-medium">Mínimo</th>
                    <th className="text-center px-4 py-3 font-medium">Déficit</th>
                    <th className="text-center px-4 py-3 font-medium">% do Mínimo</th>
                    <th className="text-center px-4 py-3 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {lowStockAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-np-purple-400">
                        <i className="ri-check-double-line text-2xl mb-2 block"></i>
                        <p className="text-sm">Nenhum produto em estado crítico</p>
                      </td>
                    </tr>
                  ) : (
                    lowStockAlerts.map((a) => (
                      <tr key={a.product.id} className="hover:bg-red-50/30">
                        <td className="px-4 py-3 text-sm font-medium text-np-purple-900">
                          {a.product.name}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600">
                          {a.product.stock_quantity}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-np-purple-500">
                          {a.product.min_stock}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600">
                          {a.deficit}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 h-2 bg-red-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${Math.min(100, a.percentage)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-red-600 font-medium">{a.percentage}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => openAdjust(a.product, "add")}
                            className="p-1.5 rounded-md bg-np-green-100 text-np-green-600 hover:bg-np-green-200 transition-colors"
                            title="Repor Estoque"
                          >
                            <i className="ri-add-line"></i>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warning — estoque ≤ alerta (atenção), só mostra os que NÃO estão no crítico */}
          <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
            <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200">
              <h3 className="font-medium text-yellow-900 text-sm flex items-center gap-2">
                <i className="ri-alert-line text-yellow-600"></i>
                Atenção — Estoque Baixo (≤ alerta de {products.length > 0 ? products[0]?.alert_stock || 10 : 10} unidades)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-yellow-50/50 text-yellow-800">
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-center px-4 py-3 font-medium">Atual</th>
                    <th className="text-center px-4 py-3 font-medium">Alerta</th>
                    <th className="text-center px-4 py-3 font-medium">Déficit p/ Alerta</th>
                    <th className="text-center px-4 py-3 font-medium">% do Alerta</th>
                    <th className="text-center px-4 py-3 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-100">
                  {lowStockReport.filter((a) => !lowStockAlerts.some((c) => c.product.id === a.product.id)).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-np-purple-400">
                        <i className="ri-check-double-line text-2xl mb-2 block"></i>
                        <p className="text-sm">Nenhum produto em alerta de atenção</p>
                      </td>
                    </tr>
                  ) : (
                    lowStockReport
                      .filter((a) => !lowStockAlerts.some((c) => c.product.id === a.product.id))
                      .map((a) => (
                        <tr key={a.product.id} className="hover:bg-yellow-50/30">
                          <td className="px-4 py-3 text-sm font-medium text-np-purple-900">
                            {a.product.name}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-yellow-600">
                            {a.product.stock_quantity}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-np-purple-500">
                            {a.product.alert_stock || "—"}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-yellow-600">
                            {a.deficit}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-16 h-2 bg-yellow-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-yellow-500 rounded-full"
                                  style={{ width: `${Math.min(100, a.percentage)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-yellow-600 font-medium">{a.percentage}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => openAdjust(a.product, "add")}
                              className="p-1.5 rounded-md bg-np-green-100 text-np-green-600 hover:bg-np-green-200 transition-colors"
                              title="Repor Estoque"
                            >
                              <i className="ri-add-line"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="font-display text-lg text-np-purple-900 mb-1">
              <i className={`mr-2 ${
                adjustType === "add" ? "ri-arrow-up-line text-np-green-600" :
                adjustType === "remove" ? "ri-arrow-down-line text-red-600" :
                "ri-edit-line text-blue-600"
              }`}></i>
              {adjustType === "add" ? "Adicionar Estoque" :
               adjustType === "remove" ? "Remover Estoque" : "Ajuste Manual"}
            </h3>
            <p className="text-sm text-np-purple-500 mb-4">
              {adjustingProduct.name} — Estoque atual: <strong className="text-np-purple-900">{adjustingProduct.stock_quantity}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">
                  {adjustType === "manual" ? "Novo valor de estoque" :
                   adjustType === "add" ? "Quantidade a adicionar" : "Quantidade a remover"}
                </label>
                <input
                  type="number"
                  min="1"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  placeholder="Ex: 10"
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
                {adjustType === "manual" && (
                  <p className="text-xs text-np-purple-400 mt-1">
                    Informe o valor final. Diferença será calculada automaticamente.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Motivo</label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value as StockReason)}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                >
                  {Object.entries(STOCK_REASONS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Notas (opcional)</label>
                <textarea
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex: Compra do fornecedor X, lote 123"
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setAdjustingProduct(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdjust}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
                  adjustType === "add" ? "bg-np-green-600 hover:bg-np-green-700" :
                  adjustType === "remove" ? "bg-red-600 hover:bg-red-700" :
                  "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <i className={`mr-1 ${
                  adjustType === "add" ? "ri-arrow-up-line" :
                  adjustType === "remove" ? "ri-arrow-down-line" :
                  "ri-check-line"
                }`}></i>
                {adjustType === "add" ? "Adicionar" :
                 adjustType === "remove" ? "Remover" : "Confirmar Ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}