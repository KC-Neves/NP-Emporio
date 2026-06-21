import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface TestStep {
  id: string;
  label: string;
  description: string;
  status: "idle" | "running" | "success" | "error" | "warning";
  message: string;
  detail?: string;
}

const STOCK_TEST_STEPS: TestStep[] = [
  {
    id: "find_product",
    label: "Buscar produto de teste",
    description: "Encontra um produto ativo com estoque para testar",
    status: "idle",
    message: "",
  },
  {
    id: "add_stock",
    label: "Adicionar estoque",
    description: "Adiciona 10 unidades ao produto com motivo 'Compra'",
    status: "idle",
    message: "",
  },
  {
    id: "check_add_movement",
    label: "Verificar movimentação de entrada",
    description: "Confirma que a movimentação de +10 aparece no histórico",
    status: "idle",
    message: "",
  },
  {
    id: "remove_stock",
    label: "Remover estoque",
    description: "Remove 5 unidades com motivo 'Perda/Desperdício'",
    status: "idle",
    message: "",
  },
  {
    id: "check_remove_movement",
    label: "Verificar movimentação de saída",
    description: "Confirma que a movimentação de -5 aparece no histórico",
    status: "idle",
    message: "",
  },
  {
    id: "manual_adjust",
    label: "Ajuste manual",
    description: "Define o estoque para um valor específico com motivo 'Correção de Inventário'",
    status: "idle",
    message: "",
  },
  {
    id: "check_manual_movement",
    label: "Verificar movimentação de ajuste",
    description: "Confirma que a movimentação de ajuste manual aparece no histórico",
    status: "idle",
    message: "",
  },
  {
    id: "verify_final_stock",
    label: "Verificar estoque final",
    description: "Confirma que o estoque no banco reflete todas as operações",
    status: "idle",
    message: "",
  },
  {
    id: "cleanup",
    label: "Limpeza",
    description: "Restaura o estoque original e remove movimentações de teste",
    status: "idle",
    message: "",
  },
];

interface TestResult {
  productName: string;
  originalStock: number;
  finalStock: number;
  expectedStock: number;
  movementsCount: number;
  addMovementFound: boolean;
  removeMovementFound: boolean;
  manualMovementFound: boolean;
}

export default function StockTestTab() {
  const [steps, setSteps] = useState<TestStep[]>(STOCK_TEST_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [overallStatus, setOverallStatus] = useState<"idle" | "running" | "success" | "error" | "partial">("idle");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const updateStep = useCallback((id: string, status: TestStep["status"], message: string, detail?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, message, detail } : s))
    );
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runStockTests = async () => {
    setIsRunning(true);
    setOverallStatus("running");
    setSteps(STOCK_TEST_STEPS.map((s) => ({ ...s, status: "idle", message: "", detail: "" })));
    setTestResult(null);

    let allSuccess = true;
    let productId = 0;
    let productName = "";
    let originalStock = 0;
    let finalStock = 0;
    let movementsCount = 0;
    let addMovementFound = false;
    let removeMovementFound = false;
    let manualMovementFound = false;

    // --- Step 1: Find product ---
    updateStep("find_product", "running", "Buscando produto ativo...");
    await sleep(300);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, category, active")
        .eq("active", true)
        .gt("stock_quantity", 0)
        .limit(1)
        .maybeSingle();

      if (error) {
        updateStep("find_product", "error", "Erro ao buscar produto", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("find_product", "error", "Nenhum produto ativo com estoque", "Cadastre produtos antes de testar.");
        allSuccess = false;
      } else {
        productId = data.id;
        productName = data.name;
        originalStock = data.stock_quantity;
        updateStep("find_product", "success", `Produto: ${data.name}`, `ID: ${data.id} | Estoque original: ${originalStock} unid.`);
      }
    } catch (err) {
      updateStep("find_product", "error", "Exceção", String(err));
      allSuccess = false;
    }

    if (!productId) {
      setIsRunning(false);
      setOverallStatus("error");
      return;
    }

    // --- Step 2: Add stock (+10) ---
    updateStep("add_stock", "running", "Adicionando 10 unidades...");
    await sleep(300);
    try {
      const { data: beforeData } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      const beforeStock = beforeData?.stock_quantity ?? 0;
      const newStock = beforeStock + 10;

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", productId);

      if (updateError) {
        updateStep("add_stock", "error", "Erro ao adicionar estoque", updateError.message);
        allSuccess = false;
      } else {
        const { error: movementError } = await supabase
          .from("stock_movements")
          .insert({
            product_id: productId,
            quantity: 10,
            reason: "compra",
            notes: "Teste automático — adição de estoque",
            previous_stock: beforeStock,
            new_stock: newStock,
          });

        if (movementError) {
          updateStep("add_stock", "error", "Erro ao registrar movimentação", movementError.message);
          allSuccess = false;
        } else {
          updateStep("add_stock", "success", "+10 unidades adicionadas", `Estoque: ${beforeStock} → ${newStock}`);
        }
      }
    } catch (err) {
      updateStep("add_stock", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 3: Check add movement ---
    updateStep("check_add_movement", "running", "Verificando histórico...");
    await sleep(400);
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, quantity, reason, previous_stock, new_stock, notes")
        .eq("product_id", productId)
        .eq("reason", "compra")
        .eq("quantity", 10)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        updateStep("check_add_movement", "error", "Erro ao consultar histórico", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("check_add_movement", "error", "Movimentação de entrada não encontrada", "A tabela stock_movements não registrou a adição.");
        allSuccess = false;
      } else {
        addMovementFound = true;
        updateStep("check_add_movement", "success", `Movimentação registrada: +${data.quantity}`, `Anterior: ${data.previous_stock} → Novo: ${data.new_stock}`);
      }
    } catch (err) {
      updateStep("check_add_movement", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 4: Remove stock (-5) ---
    updateStep("remove_stock", "running", "Removendo 5 unidades...");
    await sleep(300);
    try {
      const { data: beforeData } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      const beforeStock = beforeData?.stock_quantity ?? 0;
      const newStock = Math.max(0, beforeStock - 5);

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", productId);

      if (updateError) {
        updateStep("remove_stock", "error", "Erro ao remover estoque", updateError.message);
        allSuccess = false;
      } else {
        const { error: movementError } = await supabase
          .from("stock_movements")
          .insert({
            product_id: productId,
            quantity: -5,
            reason: "perda",
            notes: "Teste automático — remoção de estoque",
            previous_stock: beforeStock,
            new_stock: newStock,
          });

        if (movementError) {
          updateStep("remove_stock", "error", "Erro ao registrar movimentação", movementError.message);
          allSuccess = false;
        } else {
          updateStep("remove_stock", "success", "-5 unidades removidas", `Estoque: ${beforeStock} → ${newStock}`);
        }
      }
    } catch (err) {
      updateStep("remove_stock", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 5: Check remove movement ---
    updateStep("check_remove_movement", "running", "Verificando histórico...");
    await sleep(400);
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, quantity, reason, previous_stock, new_stock, notes")
        .eq("product_id", productId)
        .eq("reason", "perda")
        .eq("quantity", -5)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        updateStep("check_remove_movement", "error", "Erro ao consultar histórico", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("check_remove_movement", "error", "Movimentação de saída não encontrada", "A tabela stock_movements não registrou a remoção.");
        allSuccess = false;
      } else {
        removeMovementFound = true;
        updateStep("check_remove_movement", "success", `Movimentação registrada: ${data.quantity}`, `Anterior: ${data.previous_stock} → Novo: ${data.new_stock}`);
      }
    } catch (err) {
      updateStep("check_remove_movement", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 6: Manual adjust (set to original + 20) ---
    updateStep("manual_adjust", "running", "Executando ajuste manual...");
    await sleep(300);
    try {
      const { data: beforeData } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      const beforeStock = beforeData?.stock_quantity ?? 0;
      const targetStock = originalStock + 20;
      const delta = targetStock - beforeStock;
      const newStock = Math.max(0, targetStock);

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", productId);

      if (updateError) {
        updateStep("manual_adjust", "error", "Erro no ajuste manual", updateError.message);
        allSuccess = false;
      } else {
        const { error: movementError } = await supabase
          .from("stock_movements")
          .insert({
            product_id: productId,
            quantity: delta,
            reason: "correcao",
            notes: "Teste automático — ajuste manual",
            previous_stock: beforeStock,
            new_stock: newStock,
          });

        if (movementError) {
          updateStep("manual_adjust", "error", "Erro ao registrar movimentação", movementError.message);
          allSuccess = false;
        } else {
          updateStep("manual_adjust", "success", `Ajuste manual: ${delta > 0 ? "+" : ""}${delta}`, `Estoque definido para ${newStock}`);
        }
      }
    } catch (err) {
      updateStep("manual_adjust", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 7: Check manual movement ---
    updateStep("check_manual_movement", "running", "Verificando histórico...");
    await sleep(400);
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, quantity, reason, previous_stock, new_stock")
        .eq("product_id", productId)
        .eq("reason", "correcao")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        updateStep("check_manual_movement", "error", "Erro ao consultar histórico", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("check_manual_movement", "error", "Movimentação de ajuste não encontrada", "A tabela stock_movements não registrou o ajuste manual.");
        allSuccess = false;
      } else {
        manualMovementFound = true;
        updateStep("check_manual_movement", "success", `Movimentação registrada: ${data.quantity > 0 ? "+" : ""}${data.quantity}`, `Anterior: ${data.previous_stock} → Novo: ${data.new_stock}`);
      }
    } catch (err) {
      updateStep("check_manual_movement", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 8: Verify final stock ---
    updateStep("verify_final_stock", "running", "Verificando estoque no banco...");
    await sleep(400);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();

      if (error) {
        updateStep("verify_final_stock", "error", "Erro ao consultar estoque", error.message);
        allSuccess = false;
      } else {
        finalStock = data?.stock_quantity ?? 0;
        const expectedStock = originalStock + 20;
        if (finalStock === expectedStock) {
          updateStep("verify_final_stock", "success", `Estoque correto: ${finalStock}`, `Esperado: ${expectedStock} | Original: ${originalStock}`);
        } else {
          updateStep("verify_final_stock", "error", `Estoque incorreto: ${finalStock}`, `Esperado: ${expectedStock} | Diferença: ${finalStock - expectedStock}`);
          allSuccess = false;
        }
      }
    } catch (err) {
      updateStep("verify_final_stock", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 9: Count movements ---
    try {
      const { count, error: countError } = await supabase
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);

      if (!countError) {
        movementsCount = count ?? 0;
      }
    } catch {
      // ignore
    }

    // --- Step 10: Cleanup ---
    updateStep("cleanup", "running", "Restaurando estoque original...");
    await sleep(300);
    try {
      const { error: restoreError } = await supabase
        .from("products")
        .update({ stock_quantity: originalStock })
        .eq("id", productId);

      if (restoreError) {
        updateStep("cleanup", "error", "Erro ao restaurar estoque", restoreError.message);
        allSuccess = false;
      } else {
        // Delete test movements
        const { error: deleteError } = await supabase
          .from("stock_movements")
          .delete()
          .eq("product_id", productId)
          .like("notes", "Teste automático%");

        if (deleteError) {
          updateStep("cleanup", "warning", "Estoque restaurado, mas erro ao limpar histórico", deleteError.message);
        } else {
          updateStep("cleanup", "success", "Dados de teste removidos", `Estoque restaurado para ${originalStock} | Movimentações de teste apagadas.`);
        }
      }
    } catch (err) {
      updateStep("cleanup", "error", "Exceção na limpeza", String(err));
      allSuccess = false;
    }

    setTestResult({
      productName,
      originalStock,
      finalStock,
      expectedStock: originalStock + 20,
      movementsCount,
      addMovementFound,
      removeMovementFound,
      manualMovementFound,
    });

    setIsRunning(false);
    setOverallStatus(allSuccess ? "success" : "partial");
  };

  const statusIcon = (status: TestStep["status"]) => {
    switch (status) {
      case "running":
        return <i className="ri-loader-4-line animate-spin text-lg text-np-purple-500"></i>;
      case "success":
        return <i className="ri-checkbox-circle-line text-lg text-np-green-600"></i>;
      case "error":
        return <i className="ri-error-warning-line text-lg text-red-500"></i>;
      case "warning":
        return <i className="ri-alert-line text-lg text-yellow-500"></i>;
      default:
        return <i className="ri-checkbox-blank-circle-line text-lg text-np-wood-300"></i>;
    }
  };

  const statusBg = (status: TestStep["status"]) => {
    switch (status) {
      case "running":
        return "bg-np-purple-50 border-np-purple-200";
      case "success":
        return "bg-np-green-50 border-np-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-white border-np-wood-200";
    }
  };

  const overallBadge = () => {
    switch (overallStatus) {
      case "success":
        return { text: "Estoque OK", class: "bg-np-green-100 text-np-green-800 border-np-green-300", icon: "ri-check-double-line" };
      case "error":
        return { text: "Falhas críticas", class: "bg-red-100 text-red-800 border-red-300", icon: "ri-close-circle-line" };
      case "partial":
        return { text: "Parcial — revise", class: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "ri-alert-line" };
      case "running":
        return { text: "Executando...", class: "bg-np-purple-100 text-np-purple-800 border-np-purple-300", icon: "ri-loader-4-line animate-spin" };
      default:
        return { text: "Aguardando", class: "bg-np-wood-100 text-np-wood-700 border-np-wood-300", icon: "ri-box-3-line" };
    }
  };

  const badge = overallBadge();
  const successCount = steps.filter((s) => s.status === "success").length;
  const warningCount = steps.filter((s) => s.status === "warning").length;
  const errorCount = steps.filter((s) => s.status === "error").length;

  return (
    <div className="border-t border-np-wood-200 pt-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl text-np-purple-900">
            <i className="ri-box-3-line mr-2 text-np-purple-500"></i>
            Teste de Estoque
          </h2>
          <p className="text-sm text-np-purple-600 mt-1">
            Testa o fluxo completo: adicionar → remover → ajuste manual → verificar histórico
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${badge.class}`}>
          <i className={badge.icon}></i>
          {badge.text}
        </div>
      </div>

      <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <div className="w-9 h-9 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
          <i className="ri-information-line text-np-purple-600"></i>
        </div>
        <div>
          <p className="text-sm font-semibold text-np-purple-900 mb-1">Como funciona o teste de estoque</p>
          <p className="text-sm text-np-purple-700">
            O teste seleciona um produto real, executa 3 operações de estoque (adicionar +10, remover -5, ajuste manual)
            e verifica se cada movimentação aparece no histórico. Ao final, o estoque original é restaurado
            e as movimentações de teste são apagadas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={runStockTests}
          disabled={isRunning}
          className={`px-6 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
            isRunning
              ? "bg-np-wood-200 text-np-wood-500 cursor-not-allowed"
              : "bg-np-purple-700 hover:bg-np-purple-800 text-white shadow-sm"
          }`}
        >
          {isRunning ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Testando estoque...
            </>
          ) : (
            <>
              <i className="ri-play-fill"></i>
              Testar Estoque
            </>
          )}
        </button>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`rounded-xl border p-4 transition-all ${statusBg(step.status)}`}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 w-8 h-8 bg-white rounded-full border border-current flex items-center justify-center text-xs font-bold mt-0.5"
                style={{
                  color:
                    step.status === "success"
                      ? "#16a34a"
                      : step.status === "error"
                      ? "#ef4444"
                      : step.status === "warning"
                      ? "#eab308"
                      : step.status === "running"
                      ? "#7c3aed"
                      : "#d1d5db",
                  borderColor:
                    step.status === "success"
                      ? "#bbf7d0"
                      : step.status === "error"
                      ? "#fecaca"
                      : step.status === "warning"
                      ? "#fef08a"
                      : step.status === "running"
                      ? "#ddd6fe"
                      : "#e5e7eb",
                }}
              >
                {step.status === "running" ? (
                  <i className="ri-loader-4-line animate-spin text-sm"></i>
                ) : step.status === "success" ? (
                  <i className="ri-check-line text-sm"></i>
                ) : step.status === "error" ? (
                  <i className="ri-close-line text-sm"></i>
                ) : step.status === "warning" ? (
                  <i className="ri-alert-line text-sm"></i>
                ) : (
                  index + 1
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-np-purple-900">{step.label}</span>
                  <span className="text-xs text-np-purple-400">{step.description}</span>
                </div>
                {step.message && (
                  <p
                    className={`text-sm mt-1 font-medium ${
                      step.status === "success"
                        ? "text-np-green-700"
                        : step.status === "error"
                        ? "text-red-700"
                        : step.status === "warning"
                        ? "text-yellow-700"
                        : "text-np-purple-700"
                    }`}
                  >
                    {step.message}
                  </p>
                )}
                {step.detail && <p className="text-xs text-np-purple-500 mt-1">{step.detail}</p>}
              </div>
              <div className="flex-shrink-0 mt-0.5">{statusIcon(step.status)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {!isRunning && overallStatus !== "idle" && (
        <div
          className={`mt-6 rounded-xl border p-5 ${
            overallStatus === "success" ? "bg-np-green-50 border-np-green-200" : "bg-yellow-50 border-yellow-200"
          }`}
        >
          <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
            <i
              className={
                overallStatus === "success"
                  ? "ri-check-double-line text-np-green-600"
                  : "ri-alert-line text-yellow-600"
              }
            ></i>
            {overallStatus === "success" ? "Teste de estoque passou" : "Teste de estoque apresentou falhas"}
          </h3>

          {testResult && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                <p className="text-xs text-np-purple-500">Produto</p>
                <p className="font-bold text-np-purple-900 truncate">{testResult.productName}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                <p className="text-xs text-np-purple-500">Estoque original</p>
                <p className="font-bold text-np-purple-900">{testResult.originalStock}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                <p className="text-xs text-np-purple-500">Estoque final (teste)</p>
                <p className="font-bold text-np-green-600">{testResult.finalStock}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                <p className="text-xs text-np-purple-500">Movimentações</p>
                <p className="font-bold text-np-purple-900">{testResult.movementsCount}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <i className="ri-checkbox-circle-line text-np-green-600"></i>
              <span className="text-np-purple-700">{successCount} aprovados</span>
            </div>
            <div className="flex items-center gap-2">
              <i className="ri-alert-line text-yellow-500"></i>
              <span className="text-np-purple-700">{warningCount} avisos</span>
            </div>
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line text-red-500"></i>
              <span className="text-np-purple-700">{errorCount} erros</span>
            </div>
            <div className="flex items-center gap-2">
              <i className="ri-loader-4-line text-np-purple-400"></i>
              <span className="text-np-purple-700">{steps.filter((s) => s.status === "running").length} pendentes</span>
            </div>
          </div>

          {testResult && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${testResult.addMovementFound ? "bg-np-green-50 border-np-green-200 text-np-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                <i className={testResult.addMovementFound ? "ri-check-line" : "ri-close-line"}></i>
                Movimentação de entrada: {testResult.addMovementFound ? "Registrada" : "Não encontrada"}
              </div>
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${testResult.removeMovementFound ? "bg-np-green-50 border-np-green-200 text-np-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                <i className={testResult.removeMovementFound ? "ri-check-line" : "ri-close-line"}></i>
                Movimentação de saída: {testResult.removeMovementFound ? "Registrada" : "Não encontrada"}
              </div>
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${testResult.manualMovementFound ? "bg-np-green-50 border-np-green-200 text-np-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                <i className={testResult.manualMovementFound ? "ri-check-line" : "ri-close-line"}></i>
                Movimentação de ajuste: {testResult.manualMovementFound ? "Registrada" : "Não encontrada"}
              </div>
            </div>
          )}

          {overallStatus === "success" && (
            <p className="text-xs text-np-green-700 mt-3">
              <i className="ri-information-line mr-1"></i>
              Estoque restaurado e movimentações de teste removidas. Nenhum dado de teste permanece.
            </p>
          )}
          {overallStatus === "partial" && (
            <p className="text-xs text-yellow-700 mt-3">
              <i className="ri-information-line mr-1"></i>
              Revise os erros acima. O estoque foi restaurado, mas algumas verificações falharam.
            </p>
          )}
        </div>
      )}
    </div>
  );
}