import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export type StockReason = "compra" | "correcao" | "perda" | "consumo" | "baixa_pedido";

export const STOCK_REASONS: Record<StockReason, { label: string; color: string; icon: string }> = {
  compra: { label: "Compra", color: "bg-np-green-100 text-np-green-700", icon: "ri-shopping-cart-line" },
  correcao: { label: "Correção de Inventário", color: "bg-blue-100 text-blue-700", icon: "ri-refresh-line" },
  perda: { label: "Perda/Desperdício", color: "bg-red-100 text-red-700", icon: "ri-delete-bin-line" },
  consumo: { label: "Consumo Interno", color: "bg-yellow-100 text-yellow-700", icon: "ri-restaurant-line" },
  baixa_pedido: { label: "Baixa por Pedido", color: "bg-np-purple-100 text-np-purple-700", icon: "ri-shopping-bag-line" },
};

export interface StockMovement {
  id: string;
  product_id: number;
  product_name?: string;
  quantity: number;
  reason: StockReason;
  notes: string | null;
  previous_stock: number;
  new_stock: number;
  created_by: string | null;
  created_at: string;
}

export interface ProductStock {
  id: number;
  name: string;
  category: string;
  stock_quantity: number;
  min_stock: number;
  alert_stock: number;
  price: number;
  image_url: string | null;
  active: boolean;
}

export interface LowStockAlert {
  product: ProductStock;
  deficit: number;
  percentage: number;
}

export function useStock() {
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from("products")
        .select("id, name, category, stock_quantity, min_stock, alert_stock, price, image_url, active")
        .order("id");
      if (queryError) {
        console.error("[STOCK] fetchProducts error:", queryError.message);
        setError(queryError.message);
        return;
      }
      const mapped = (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        stock_quantity: p.stock_quantity ?? 0,
        min_stock: p.min_stock ?? 0,
        alert_stock: p.alert_stock ?? (p.min_stock ?? 0) * 2,
        price: p.price ?? 0,
        image_url: p.image_url || null,
        active: p.active !== false,
      }));
      console.log("[STOCK] fetchProducts loaded", mapped.length, "products");
      setProducts(mapped);
    } catch (err) {
      console.error("[STOCK] fetchProducts exception:", err);
      setError(String(err));
    }
  }, []);

  const fetchMovements = useCallback(async (productId?: number) => {
    setMovementsLoading(true);
    try {
      let query = supabase
        .from("stock_movements")
        .select("*, product:product_id(name)")
        .order("created_at", { ascending: false });
      if (productId) {
        query = query.eq("product_id", productId);
      }
      const { data, error: queryError } = await query;
      if (queryError) {
        console.error("[STOCK] fetchMovements error:", queryError.message);
        setError(queryError.message);
        return;
      }
      const mapped = (data || []).map((m) => ({
        id: m.id,
        product_id: m.product_id,
        product_name: m.product?.name || "",
        quantity: m.quantity,
        reason: m.reason as StockReason,
        notes: m.notes,
        previous_stock: m.previous_stock,
        new_stock: m.new_stock,
        created_by: m.created_by,
        created_at: m.created_at,
      }));
      console.log("[STOCK] fetchMovements loaded", mapped.length, "movements");
      setMovements(mapped);
    } catch (err) {
      console.error("[STOCK] fetchMovements exception:", err);
      setError(String(err));
    } finally {
      setMovementsLoading(false);
    }
  }, []);

  const adjustStock = useCallback(async (
    productId: number,
    quantity: number,
    reason: StockReason,
    notes: string = ""
  ) => {
    console.log("[STOCK] adjustStock called:", { productId, quantity, reason, notes });

    // Buscar estoque atual do banco para evitar stale state
    const { data: currentData, error: currentError } = await supabase
      .from("products")
      .select("stock_quantity, name")
      .eq("id", productId)
      .maybeSingle();

    if (currentError) {
      console.error("[STOCK] adjustStock fetch error:", currentError.message);
      return { error: new Error(`Erro ao buscar produto: ${currentError.message}`), newStock: null };
    }
    if (!currentData) {
      console.error("[STOCK] adjustStock: produto não encontrado no banco");
      return { error: new Error("Produto não encontrado no banco"), newStock: null };
    }

    const previousStock = currentData.stock_quantity ?? 0;
    const newStock = Math.max(0, previousStock + quantity);
    console.log("[STOCK] adjustStock calculated:", { previousStock, newStock, quantity });

    // Atualizar o banco — usar .select() para confirmar que foi atualizado
    const { data: updatedData, error: updateError } = await supabase
      .from("products")
      .update({ stock_quantity: newStock })
      .eq("id", productId)
      .select("id, stock_quantity");

    if (updateError) {
      console.error("[STOCK] adjustStock update error:", updateError.message);
      return { error: new Error(`Erro ao atualizar estoque: ${updateError.message}`), newStock: null };
    }

    // Verificar se realmente atualizou algo (RLS pode retornar sucesso silencioso)
    if (!updatedData || updatedData.length === 0) {
      console.error("[STOCK] adjustStock: update retornou 0 linhas — RLS pode estar bloqueando");
      return { error: new Error("Permissão negada: o estoque não foi atualizado. Verifique se você está logado como admin."), newStock: null };
    }

    console.log("[STOCK] adjustStock update success:", updatedData);

    // Atualizar estado local otimistamente ANTES do refetch
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, stock_quantity: newStock } : p
      )
    );

    // Registrar movimentação
    const { error: insertError } = await supabase
      .from("stock_movements")
      .insert({
        product_id: productId,
        quantity,
        reason,
        notes: notes || null,
        previous_stock: previousStock,
        new_stock: newStock,
      });

    if (insertError) {
      console.error("[STOCK] adjustStock insert movement error:", insertError.message);
      // Não retornar erro aqui — o estoque já foi atualizado, mas logamos
    } else {
      console.log("[STOCK] adjustStock movement registered");
    }

    // Refetch para sincronizar com o banco
    await fetchProducts();
    await fetchMovements();
    console.log("[STOCK] adjustStock refetch complete");
    return { error: null, newStock };
  }, [fetchProducts, fetchMovements]);

  // NOVO: 3 níveis — Crítico (≤ min_stock), Atenção (≤ alert_stock), OK (> alert_stock)
  // Filtra SOMENTE produtos ativos
  const getLowStockAlerts = useCallback((): LowStockAlert[] => {
    return products
      .filter((p) => p.active && p.min_stock > 0 && p.stock_quantity <= p.min_stock)
      .map((p) => ({
        product: p,
        deficit: p.min_stock - p.stock_quantity,
        percentage: p.min_stock > 0 ? Math.round((p.stock_quantity / p.min_stock) * 100) : 0,
      }))
      .sort((a, b) => a.percentage - b.percentage);
  }, [products]);

  // NOVO: Relatório — alerta quando ≤ alert_stock (nível de atenção + crítico), só ativos
  const getLowStockReport = useCallback((): LowStockAlert[] => {
    return products
      .filter((p) => p.active && p.alert_stock > 0 && p.stock_quantity <= p.alert_stock)
      .map((p) => ({
        product: p,
        deficit: Math.max(0, p.alert_stock - p.stock_quantity),
        percentage: p.alert_stock > 0 ? Math.round((p.stock_quantity / p.alert_stock) * 100) : 0,
      }))
      .sort((a, b) => a.percentage - b.percentage);
  }, [products]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!mounted) return;
      setLoading(true);
      await fetchProducts();
      await fetchMovements();
      if (mounted) setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchProducts, fetchMovements]);

  useEffect(() => {
    const channel = supabase
      .channel("stock-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          fetchProducts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => {
          fetchMovements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProducts, fetchMovements]);

  return {
    products,
    movements,
    loading,
    movementsLoading,
    error,
    adjustStock,
    getLowStockAlerts,
    getLowStockReport,
    refreshProducts: fetchProducts,
    refreshMovements: fetchMovements,
  };
}