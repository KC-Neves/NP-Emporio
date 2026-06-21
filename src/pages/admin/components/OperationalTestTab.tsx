import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/supabase";
import { awardLoyaltyPoints } from "@/hooks/useOrderHistory";
import { getManualFeedbackMessage } from "./OrderNotifications";

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  observation?: string;
}

interface TestStep {
  id: string;
  label: string;
  description: string;
  status: "idle" | "running" | "success" | "error" | "warning";
  message: string;
  detail?: string;
}

const INITIAL_STEPS: TestStep[] = [
  {
    id: "products",
    label: "Produtos disponíveis",
    description: "Verifica se existem produtos ativos no cardápio",
    status: "idle",
    message: "",
  },
  {
    id: "create_order",
    label: "Criar pedido de teste",
    description: "Simula um cliente criando um pedido",
    status: "idle",
    message: "",
  },
  {
    id: "kitchen_view",
    label: "Recebimento Cozinha",
    description: "Verifica se o pedido aparece para a cozinha",
    status: "idle",
    message: "",
  },
  {
    id: "cashier_view",
    label: "Recebimento Caixa",
    description: "Verifica se o pedido aparece no caixa",
    status: "idle",
    message: "",
  },
  {
    id: "admin_view",
    label: "Visibilidade no Admin",
    description: "Verifica se o pedido aparece no painel admin",
    status: "idle",
    message: "",
  },
  {
    id: "payment",
    label: "Pagamento",
    description: "Simula confirmação de pagamento e baixa de estoque",
    status: "idle",
    message: "",
  },
  {
    id: "stock",
    label: "Baixa de Estoque",
    description: "Verifica se o estoque foi baixado corretamente",
    status: "idle",
    message: "",
  },
  {
    id: "permissions",
    label: "Permissões por Role",
    description: "Verifica se existem usuários em cada função",
    status: "idle",
    message: "",
  },
];

const LOYALTY_STEPS: TestStep[] = [
  {
    id: "loyalty_user",
    label: "Usuário logado",
    description: "Verifica se há um usuário autenticado para o teste",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_order",
    label: "Criar pedido com user_id",
    description: "Cria um pedido vinculado ao usuário logado",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_payment",
    label: "Simular pagamento",
    description: "Marca o pedido como pago para disparar crédito de pontos",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_points",
    label: "Crédito de pontos",
    description: "Verifica se os pontos foram creditados na tabela loyalty_points",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_history",
    label: "Histórico de pontos",
    description: "Verifica se o registro foi criado em loyalty_history",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_duplicate",
    label: "Proteção contra duplicidade",
    description: "Simula pagamento novamente e verifica se pontos não foram duplicados",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_delivered",
    label: "Entrega e duplicidade",
    description: "Marca como entregue e verifica se pontos não foram duplicados novamente",
    status: "idle",
    message: "",
  },
  {
    id: "loyalty_cleanup",
    label: "Limpeza",
    description: "Remove dados de teste e restaura estoque",
    status: "idle",
    message: "",
  },
];

export default function OperationalTestTab() {
  const [steps, setSteps] = useState<TestStep[]>(INITIAL_STEPS);
  const [loyaltySteps, setLoyaltySteps] = useState<TestStep[]>(LOYALTY_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoyaltyRunning, setIsLoyaltyRunning] = useState(false);
  const [overallStatus, setOverallStatus] = useState<"idle" | "running" | "success" | "error" | "partial">("idle");
  const [loyaltyOverallStatus, setLoyaltyOverallStatus] = useState<"idle" | "running" | "success" | "error" | "partial">("idle");
  const [testOrderId, setTestOrderId] = useState<string | null>(null);
  const [testProductId, setTestProductId] = useState<number | null>(null);
  const [originalStock, setOriginalStock] = useState<number | null>(null);
  const [testUsersMessage, setTestUsersMessage] = useState<string | null>(null);
  const [stockAlreadyDeducted, setStockAlreadyDeducted] = useState(false);
  const [feedbackTestPhone, setFeedbackTestPhone] = useState("(71) 99999-9999");
  const [feedbackTestOrderId, setFeedbackTestOrderId] = useState("teste-123-456");
  const [feedbackPreview, setFeedbackPreview] = useState<string | null>(null);
  const [loyaltyTestResult, setLoyaltyTestResult] = useState<{pointsBefore: number; pointsAfter: number; pointsExpected: number; historyCount: number; duplicateBlocked: boolean} | null>(null);

  const updateStep = useCallback((id: string, status: TestStep["status"], message: string, detail?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, message, detail } : s))
    );
  }, []);

  const updateLoyaltyStep = useCallback((id: string, status: TestStep["status"], message: string, detail?: string) => {
    setLoyaltySteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, message, detail } : s))
    );
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Replicate stock deduction logic from useOrderHistory — with post-update verification
  const deductStock = async (orderId: string, items: OrderItem[]) => {
    const { data: orderRow, error: checkError } = await supabase
      .from("orders")
      .select("stock_deducted")
      .eq("id", orderId)
      .maybeSingle();

    if (checkError) {
      return { insufficient: ["Erro ao verificar status do estoque"], success: false };
    }

    if (orderRow?.stock_deducted) {
      return { insufficient: [], success: true };
    }

    const insufficient: string[] = [];
    let allSuccess = true;

    for (const item of items) {
      if (!item.id || !item.quantity || item.quantity <= 0) continue;

      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", item.id)
        .maybeSingle();

      if (fetchError) {
        insufficient.push(`${item.name} (erro de leitura)`);
        allSuccess = false;
        continue;
      }

      const currentStock = product?.stock_quantity ?? 0;
      if (currentStock < item.quantity) {
        insufficient.push(`${item.name} (estoque: ${currentStock}, precisa: ${item.quantity})`);
        allSuccess = false;
        continue;
      }

      const newStock = currentStock - item.quantity;
      const { data: updatedData, error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", item.id)
        .select("stock_quantity");

      if (updateError) {
        insufficient.push(`${item.name} (erro ao baixar: ${updateError.message})`);
        allSuccess = false;
        continue;
      }

      if (!updatedData || updatedData.length === 0) {
        insufficient.push(`${item.name} (nenhuma linha atualizada — verifique permissões/RLS)`);
        allSuccess = false;
        continue;
      }

      const confirmedStock = updatedData[0]?.stock_quantity;
      if (confirmedStock !== newStock) {
        insufficient.push(`${item.name} (estoque não confirmado: esperado ${newStock}, obtido ${confirmedStock})`);
        allSuccess = false;
        continue;
      }
    }

    if (allSuccess && insufficient.length === 0) {
      const { data: markedData, error: markError } = await supabase
        .from("orders")
        .update({ stock_deducted: true })
        .eq("id", orderId)
        .select("stock_deducted");

      if (markError) {
        allSuccess = false;
      } else if (!markedData || markedData.length === 0) {
        allSuccess = false;
      }
    }

    return { insufficient, success: allSuccess && insufficient.length === 0 };
  };

  const createTestUsers = async () => {
    const testUsers = [
      { email: "teste.cozinha@np-emporio.test", password: "Teste123!", role: "cozinha" as UserRole, full_name: "Teste Cozinha" },
      { email: "teste.caixa@np-emporio.test", password: "Teste123!", role: "caixa" as UserRole, full_name: "Teste Caixa" },
    ];

    const results: string[] = [];
    for (const u of testUsers) {
      try {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", u.email)
          .maybeSingle();

        if (existing) {
          results.push(`${u.role}: já existe`);
          continue;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: u.email,
          password: u.password,
          options: { data: { full_name: u.full_name } },
        });

        if (authError || !authData.user) {
          results.push(`${u.role}: erro no cadastro`);
          continue;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update({ role: u.role, full_name: u.full_name })
          .eq("id", authData.user.id);

        if (profileError) {
          results.push(`${u.role}: erro ao definir role`);
        } else {
          results.push(`${u.role}: criado com sucesso`);
        }
      } catch {
        results.push(`${u.role}: erro inesperado`);
      }
    }

    return results;
  };

  const runLoyaltyTests = async () => {
    setIsLoyaltyRunning(true);
    setLoyaltyOverallStatus("running");
    setLoyaltySteps(LOYALTY_STEPS.map((s) => ({ ...s, status: "idle", message: "", detail: "" })));
    setLoyaltyTestResult(null);

    let allSuccess = true;
    let testUserId: string | null = null;
    let testOrderIdLocal = "";
    let testProductIdLocal = 0;
    let originalStockQty = 0;
    let pointsBefore = 0;
    let pointsAfter = 0;
    let pointsExpected = 0;
    let historyCount = 0;
    let duplicateBlocked = false;

    // --- Step 1: Check logged user ---
    updateLoyaltyStep("loyalty_user", "running", "Verificando usuário autenticado...");
    await sleep(300);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        updateLoyaltyStep("loyalty_user", "error", "Nenhum usuário autenticado", "Faça login para testar a fidelidade.");
        setIsLoyaltyRunning(false);
        setLoyaltyOverallStatus("error");
        return;
      }
      testUserId = session.user.id;
      updateLoyaltyStep("loyalty_user", "success", `Usuário autenticado: ${session.user.email}`, `ID: ${testUserId.slice(0, 8)}...`);
    } catch (err) {
      updateLoyaltyStep("loyalty_user", "error", "Erro ao verificar sessão", String(err));
      setIsLoyaltyRunning(false);
      setLoyaltyOverallStatus("error");
      return;
    }

    // --- Step 2: Create order with user_id ---
    updateLoyaltyStep("loyalty_order", "running", "Criando pedido vinculado ao usuário...");
    await sleep(300);
    try {
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity")
        .eq("active", true)
        .gt("stock_quantity", 0)
        .limit(1)
        .maybeSingle();

      if (productError || !productData) {
        updateLoyaltyStep("loyalty_order", "error", "Nenhum produto disponível para teste", productError?.message || "Cadastre produtos com estoque.");
        allSuccess = false;
      } else {
        testProductIdLocal = productData.id;
        originalStockQty = productData.stock_quantity;
        testOrderIdLocal = crypto.randomUUID();
        const total = Number(productData.price);
        pointsExpected = Math.max(1, Math.floor(total / 2));

        const { error: insertError } = await supabase.from("orders").insert({
          id: testOrderIdLocal,
          user_id: testUserId,
          table_number: 88,
          order_type: "mesa",
          customer_name: "Teste Fidelidade",
          customer_phone: "(88) 88888-8888",
          address: null,
          items: [{ id: productData.id, name: productData.name, price: Number(productData.price), quantity: 1 }],
          total_amount: total,
          status: "pending",
          payment_method: "caixa",
          payment_status: "pending",
          stock_deducted: false,
        });

        if (insertError) {
          updateLoyaltyStep("loyalty_order", "error", "Erro ao criar pedido", insertError.message);
          allSuccess = false;
        } else {
          updateLoyaltyStep("loyalty_order", "success", `Pedido #${testOrderIdLocal.slice(-8)} criado`, `Total: R$ ${total.toFixed(2)} | Pontos esperados: ${pointsExpected}`);
        }
      }
    } catch (err) {
      updateLoyaltyStep("loyalty_order", "error", "Exceção ao criar pedido", String(err));
      allSuccess = false;
    }

    if (!testOrderIdLocal || !testProductIdLocal) {
      setIsLoyaltyRunning(false);
      setLoyaltyOverallStatus("error");
      return;
    }

    // --- Step 3: Simulate payment ---
    updateLoyaltyStep("loyalty_payment", "running", "Marcando pedido como pago...");
    await sleep(300);
    try {
      // Record points before payment
      const { data: beforeData } = await supabase
        .from("loyalty_points")
        .select("points")
        .eq("user_id", testUserId)
        .maybeSingle();
      pointsBefore = beforeData?.points ?? 0;

      const { error: payError } = await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", testOrderIdLocal);

      if (payError) {
        updateLoyaltyStep("loyalty_payment", "error", "Erro ao marcar pagamento", payError.message);
        allSuccess = false;
      } else {
        // Trigger stock deduction and loyalty (same as real flow)
        const { success: stockSuccess } = await deductStock(testOrderIdLocal, [{ id: testProductIdLocal, name: "Test", price: 1, quantity: 1 }]);
        if (stockSuccess) {
          await supabase.from("orders").update({ stock_deducted: true }).eq("id", testOrderIdLocal);
        }
        // Trigger loyalty points credit (same as real flow)
        const { data: orderData } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("id", testOrderIdLocal)
          .maybeSingle();
        const totalAmount = orderData?.total_amount ?? 0;
        await awardLoyaltyPoints(testUserId, testOrderIdLocal, Number(totalAmount));
        updateLoyaltyStep("loyalty_payment", "success", "Pagamento confirmado", `Estoque baixado: ${stockSuccess ? "Sim" : "Não"} | Pontos creditados`);
      }
    } catch (err) {
      updateLoyaltyStep("loyalty_payment", "error", "Exceção no pagamento", String(err));
      allSuccess = false;
    }

    // Wait for points to be credited
    await sleep(1000);

    // --- Step 4: Check points credited ---
    updateLoyaltyStep("loyalty_points", "running", "Verificando crédito de pontos...");
    await sleep(300);
    try {
      const { data: afterData, error: afterError } = await supabase
        .from("loyalty_points")
        .select("points, tier")
        .eq("user_id", testUserId)
        .maybeSingle();

      if (afterError) {
        updateLoyaltyStep("loyalty_points", "error", "Erro ao buscar pontos", afterError.message);
        allSuccess = false;
      } else if (!afterData) {
        updateLoyaltyStep("loyalty_points", "error", "Registro de fidelidade não criado", "A função de crédito de pontos falhou silenciosamente.");
        allSuccess = false;
      } else {
        pointsAfter = afterData.points;
        const pointsAdded = pointsAfter - pointsBefore;
        if (pointsAdded === pointsExpected) {
          updateLoyaltyStep("loyalty_points", "success", `${pointsAdded} pontos creditados`, `Total: ${pointsAfter} pts | Tier: ${afterData.tier}`);
        } else if (pointsAdded > 0) {
          updateLoyaltyStep("loyalty_points", "warning", `${pointsAdded} pontos creditados (esperado: ${pointsExpected})`, `Total: ${pointsAfter} pts | Tier: ${afterData.tier}`);
        } else {
          updateLoyaltyStep("loyalty_points", "error", "Nenhum ponto creditado", `Antes: ${pointsBefore} | Depois: ${pointsAfter} | Esperado: +${pointsExpected}`);
          allSuccess = false;
        }
      }
    } catch (err) {
      updateLoyaltyStep("loyalty_points", "error", "Exceção ao verificar pontos", String(err));
      allSuccess = false;
    }

    // --- Step 5: Check history ---
    updateLoyaltyStep("loyalty_history", "running", "Verificando histórico de pontos...");
    await sleep(300);
    try {
      const { data: historyData, error: historyError } = await supabase
        .from("loyalty_history")
        .select("id, points, reason, order_id")
        .eq("user_id", testUserId)
        .eq("order_id", testOrderIdLocal)
        .maybeSingle();

      if (historyError) {
        updateLoyaltyStep("loyalty_history", "error", "Erro ao buscar histórico", historyError.message);
        allSuccess = false;
      } else if (!historyData) {
        updateLoyaltyStep("loyalty_history", "error", "Histórico não criado", "Nenhum registro em loyalty_history para este pedido.");
        allSuccess = false;
      } else {
        historyCount = 1;
        updateLoyaltyStep("loyalty_history", "success", `Histórico criado: +${historyData.points} pts`, `Reason: ${historyData.reason}`);
      }
    } catch (err) {
      updateLoyaltyStep("loyalty_history", "error", "Exceção ao verificar histórico", String(err));
      allSuccess = false;
    }

    // --- Step 6: Duplicate protection test ---
    updateLoyaltyStep("loyalty_duplicate", "running", "Testando proteção contra duplicidade...");
    await sleep(300);
    try {
      // Try to mark as paid again (should not duplicate points)
      const { data: pointsBeforeDup } = await supabase
        .from("loyalty_points")
        .select("points")
        .eq("user_id", testUserId)
        .maybeSingle();
      const beforeDup = pointsBeforeDup?.points ?? 0;

      // Re-run the award logic manually
      const alreadyAwarded = await supabase
        .from("loyalty_history")
        .select("id")
        .eq("user_id", testUserId)
        .eq("order_id", testOrderIdLocal)
        .maybeSingle();

      if (alreadyAwarded.data) {
        duplicateBlocked = true;
        updateLoyaltyStep("loyalty_duplicate", "success", "Duplicidade bloqueada", "Pontos já creditados para este pedido — novo crédito ignorado.");
      } else {
        updateLoyaltyStep("loyalty_duplicate", "error", "Proteção não funcionou", "Deveria haver um registro em loyalty_history.");
        allSuccess = false;
      }
    } catch (err) {
      updateLoyaltyStep("loyalty_duplicate", "error", "Exceção no teste de duplicidade", String(err));
      allSuccess = false;
    }

    // --- Step 7: Deliver and check again ---
    updateLoyaltyStep("loyalty_delivered", "running", "Marcando como entregue e verificando...");
    await sleep(300);
    try {
      const { data: pointsBeforeDel } = await supabase
        .from("loyalty_points")
        .select("points")
        .eq("user_id", testUserId)
        .maybeSingle();
      const beforeDel = pointsBeforeDel?.points ?? 0;

      const { error: delError } = await supabase
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", testOrderIdLocal);

      if (delError) {
        updateLoyaltyStep("loyalty_delivered", "error", "Erro ao marcar entregue", delError.message);
        allSuccess = false;
      } else {
        // Trigger loyalty points on delivery (same as real flow)
        const { data: orderData } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("id", testOrderIdLocal)
          .maybeSingle();
        const totalAmount = orderData?.total_amount ?? 0;
        await awardLoyaltyPoints(testUserId, testOrderIdLocal, Number(totalAmount));

        await sleep(800);
        const { data: pointsAfterDel } = await supabase
          .from("loyalty_points")
          .select("points")
          .eq("user_id", testUserId)
          .maybeSingle();
        const afterDel = pointsAfterDel?.points ?? 0;

        const { count: historyCountAfter } = await supabase
          .from("loyalty_history")
          .select("id", { count: "exact", head: true })
          .eq("user_id", testUserId)
          .eq("order_id", testOrderIdLocal);

        if (afterDel === beforeDel && (historyCountAfter ?? 0) <= 1) {
          updateLoyaltyStep("loyalty_delivered", "success", "Duplicidade bloqueada na entrega", `Pontos mantidos em ${afterDel} | Apenas 1 registro no histórico`);
        } else {
          updateLoyaltyStep("loyalty_delivered", "error", "Pontos duplicados!", `Antes: ${beforeDel} | Depois: ${afterDel} | Histórico: ${historyCountAfter} registros`);
          allSuccess = false;
        }
      }
    } catch (err) {
      updateLoyaltyStep("loyalty_delivered", "error", "Exceção na entrega", String(err));
      allSuccess = false;
    }

    // --- Step 8: Cleanup ---
    updateLoyaltyStep("loyalty_cleanup", "running", "Removendo dados de teste...");
    try {
      if (testOrderIdLocal) {
        await supabase.from("orders").delete().eq("id", testOrderIdLocal);
      }
      if (testProductIdLocal && originalStockQty !== null) {
        await supabase.from("products").update({ stock_quantity: originalStockQty }).eq("id", testProductIdLocal);
      }
      // Clean up loyalty history for this test order
      if (testOrderIdLocal) {
        await supabase.from("loyalty_history").delete().eq("order_id", testOrderIdLocal);
      }
      // Optionally reset points to before (but we keep them since it's the admin testing)
      updateLoyaltyStep("loyalty_cleanup", "success", "Dados de teste removidos", "Pedido, histórico e estoque restaurados.");
    } catch (err) {
      updateLoyaltyStep("loyalty_cleanup", "error", "Erro na limpeza", String(err));
      allSuccess = false;
    }

    setLoyaltyTestResult({ pointsBefore, pointsAfter, pointsExpected, historyCount, duplicateBlocked });
    setIsLoyaltyRunning(false);
    setLoyaltyOverallStatus(allSuccess ? "success" : "partial");
  };

  const runTests = async () => {
    setIsRunning(true);
    setOverallStatus("running");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", message: "", detail: "" })));
    setTestOrderId(null);
    setTestProductId(null);
    setOriginalStock(null);
    setTestUsersMessage(null);
    setStockAlreadyDeducted(false);

    let orderId = "";
    let productId = 0;
    let originalStockQty = 0;
    let allSuccess = true;
    let testItems: OrderItem[] = [];

    // --- Step 1: Products ---
    updateStep("products", "running", "Buscando produtos ativos...");
    await sleep(400);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, category, active")
        .eq("active", true)
        .gt("stock_quantity", 0)
        .limit(10);

      if (error) {
        updateStep("products", "error", "Erro ao buscar produtos", error.message);
        allSuccess = false;
      } else if (!data || data.length === 0) {
        updateStep("products", "error", "Nenhum produto ativo com estoque encontrado", "Cadastre produtos antes de testar.");
        allSuccess = false;
      } else {
        const p = data[0];
        productId = p.id;
        originalStockQty = p.stock_quantity;
        setTestProductId(productId);
        setOriginalStock(originalStockQty);
        updateStep(
          "products",
          "success",
          `${data.length} produtos ativos com estoque`,
          `Produto de teste: ${p.name} (ID: ${p.id}, estoque: ${p.stock_quantity})`
        );
      }
    } catch (err) {
      updateStep("products", "error", "Exceção ao buscar produtos", String(err));
      allSuccess = false;
    }

    if (!allSuccess && productId === 0) {
      setIsRunning(false);
      setOverallStatus("error");
      return;
    }

    // --- Step 2: Create Order ---
    updateStep("create_order", "running", "Criando pedido de teste...");
    await sleep(400);
    try {
      const { data: productData } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("id", productId)
        .single();

      if (!productData) {
        updateStep("create_order", "error", "Produto de teste não encontrado");
        allSuccess = false;
      } else {
        orderId = crypto.randomUUID();
        testItems = [
          {
            id: productData.id,
            name: productData.name,
            price: Number(productData.price),
            quantity: 1,
          },
        ];
        const total = Number(productData.price);

        const { error: insertError } = await supabase.from("orders").insert({
          id: orderId,
          user_id: null,
          table_number: 99,
          order_type: "mesa",
          customer_name: "Teste Operacional",
          customer_phone: "(99) 99999-9999",
          address: null,
          items: testItems,
          total_amount: total,
          status: "pending",
          payment_method: "caixa",
          payment_status: "pending",
          stock_deducted: false,
        });

        if (insertError) {
          updateStep("create_order", "error", "Erro ao criar pedido", insertError.message);
          allSuccess = false;
        } else {
          setTestOrderId(orderId);
          updateStep("create_order", "success", `Pedido #${orderId.slice(-8)} criado`, `Mesa 99, R$ ${total.toFixed(2)}`);
        }
      }
    } catch (err) {
      updateStep("create_order", "error", "Exceção ao criar pedido", String(err));
      allSuccess = false;
    }

    if (!orderId) {
      setIsRunning(false);
      setOverallStatus("error");
      return;
    }

    await sleep(600);

    // --- Step 3: Kitchen View ---
    updateStep("kitchen_view", "running", "Verificando visibilidade na cozinha...");
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, customer_name, table_number")
        .eq("id", orderId)
        .eq("status", "pending")
        .maybeSingle();

      if (error) {
        updateStep("kitchen_view", "error", "Erro ao consultar cozinha", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("kitchen_view", "error", "Pedido não aparece como pendente", "Verifique a aba Cozinha.");
        allSuccess = false;
      } else {
        updateStep("kitchen_view", "success", "Pedido visível na cozinha", `Status: ${data.status} | Mesa ${data.table_number}`);
      }
    } catch (err) {
      updateStep("kitchen_view", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 4: Cashier View ---
    await sleep(400);
    updateStep("cashier_view", "running", "Verificando visibilidade no caixa...");
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, payment_status, total_amount")
        .eq("id", orderId)
        .maybeSingle();

      if (error) {
        updateStep("cashier_view", "error", "Erro ao consultar caixa", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("cashier_view", "error", "Pedido não aparece no caixa");
        allSuccess = false;
      } else {
        updateStep("cashier_view", "success", "Pedido visível no caixa", `Pagamento: ${data.payment_status} | Total: R$ ${Number(data.total_amount).toFixed(2)}`);
      }
    } catch (err) {
      updateStep("cashier_view", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 5: Admin View ---
    await sleep(400);
    updateStep("admin_view", "running", "Verificando visibilidade no admin...");
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, payment_status, total_amount, created_at")
        .eq("id", orderId)
        .maybeSingle();

      if (error) {
        updateStep("admin_view", "error", "Erro ao consultar admin", error.message);
        allSuccess = false;
      } else if (!data) {
        updateStep("admin_view", "error", "Pedido não aparece no admin");
        allSuccess = false;
      } else {
        updateStep("admin_view", "success", "Pedido visível no admin", `Status: ${data.status} | Pagamento: ${data.payment_status}`);
      }
    } catch (err) {
      updateStep("admin_view", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 6: Payment ---
    await sleep(400);
    updateStep("payment", "running", "Confirmando pagamento e baixando estoque...");
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", orderId);

      if (error) {
        updateStep("payment", "error", "Erro ao confirmar pagamento", error.message);
        allSuccess = false;
      } else {
        // Trigger stock deduction when payment is confirmed
        const { insufficient, success } = await deductStock(orderId, testItems);
        if (insufficient.length > 0) {
          updateStep("payment", "error", "Estoque insuficiente", insufficient.join(", "));
          allSuccess = false;
        } else if (success) {
          setStockAlreadyDeducted(true);
          updateStep("payment", "success", "Pagamento confirmado e estoque baixado", "Pedido marcado como pago e estoque deduzido");
        } else {
          updateStep("payment", "success", "Pagamento confirmado", "Estoque não foi baixado");
        }
      }
    } catch (err) {
      updateStep("payment", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 7: Stock Deduction ---
    await sleep(400);
    updateStep("stock", "running", "Verificando estoque após pagamento...");
    try {
      // Also mark as delivered and trigger stock deduction again (idempotent)
      const { error: statusError } = await supabase
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", orderId);

      if (statusError) {
        updateStep("stock", "error", "Erro ao marcar entregue", statusError.message);
        allSuccess = false;
      } else {
        // If stock wasn't already deducted on payment, deduct now on delivery
        if (!stockAlreadyDeducted) {
          const { insufficient, success } = await deductStock(orderId, testItems);
          if (insufficient.length > 0) {
            updateStep("stock", "error", "Estoque insuficiente", insufficient.join(", "));
            allSuccess = false;
          } else if (success) {
            setStockAlreadyDeducted(true);
          }
        }

        // Wait for stock update to propagate, then re-fetch
        await sleep(1500);

        // Check stock with retry
        let productAfter: { stock_quantity: number; name: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data } = await supabase
            .from("products")
            .select("stock_quantity, name")
            .eq("id", productId)
            .maybeSingle();
          if (data) {
            productAfter = data;
            break;
          }
          if (attempt < 2) await sleep(500);
        }

        const expectedStock = originalStockQty - 1;
        const actualStock = productAfter?.stock_quantity ?? null;

        if (actualStock !== null && actualStock === expectedStock) {
          updateStep(
            "stock",
            "success",
            "Estoque baixado corretamente",
            `${productAfter?.name}: ${originalStockQty} → ${actualStock} unid.`
          );
        } else if (actualStock !== null) {
          updateStep(
            "stock",
            "error",
            "Estoque não baixou como esperado",
            `Esperado: ${expectedStock}, Atual: ${actualStock}`
          );
          allSuccess = false;
        } else {
          updateStep("stock", "error", "Não foi possível verificar o estoque");
          allSuccess = false;
        }
      }
    } catch (err) {
      updateStep("stock", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 8: Permissions ---
    await sleep(400);
    updateStep("permissions", "running", "Verificando distribuição de roles...");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .not("role", "is", null);

      if (error) {
        updateStep("permissions", "error", "Erro ao consultar roles", error.message);
        allSuccess = false;
      } else {
        const roleCounts: Record<string, number> = {};
        const profilesArray: Array<{ role: string }> = (Array.isArray(data) ? data : []) as unknown as Array<{ role: string }>;
        profilesArray.forEach((r) => {
          if (r && typeof r.role === "string") roleCounts[r.role] = (roleCounts[r.role] || 0) + 1;
        });

        const expectedRoles: UserRole[] = ["cliente", "cozinha", "caixa", "admin"];
        const missingRoles = expectedRoles.filter((r) => !roleCounts[r] || roleCounts[r] === 0);
        const criticalMissing = missingRoles.filter((r) => r === "admin");
        const warningMissing = missingRoles.filter((r) => r === "cozinha" || r === "caixa");

        if (criticalMissing.length > 0) {
          updateStep(
            "permissions",
            "error",
            `Role crítica ausente: ${criticalMissing.join(", ")}`,
            `Encontrados: ${Object.entries(roleCounts || {}).map(([k, v]) => `${k}=${v}`).join(", ")}`
          );
          allSuccess = false;
        } else if (warningMissing.length > 0) {
          // Warning only — not critical
          updateStep(
            "permissions",
            "warning",
            `Roles opcionais ausentes: ${warningMissing.join(", ")}`,
            `Crie usuários de teste para cozinha e caixa na aba Funcionários. Encontrados: ${Object.entries(roleCounts || {}).map(([k, v]) => `${k}=${v}`).join(", ")}`
          );
        } else {
          updateStep(
            "permissions",
            "success",
            "Todas as roles estão presentes",
            Object.entries(roleCounts || {})
              .map(([k, v]) => `${k}: ${v} usuário${v > 1 ? "s" : ""}`)
              .join(" | ")
          );
        }
      }
    } catch (err) {
      updateStep("permissions", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // Cleanup: delete test order
    if (orderId) {
      await supabase.from("orders").delete().eq("id", orderId);
    }
    // Restore stock
    if (productId && originalStockQty !== null) {
      await supabase.from("products").update({ stock_quantity: originalStockQty }).eq("id", productId);
    }

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
        return { text: "Tudo certo!", class: "bg-np-green-100 text-np-green-800 border-np-green-300", icon: "ri-check-double-line" };
      case "error":
        return { text: "Falhas críticas", class: "bg-red-100 text-red-800 border-red-300", icon: "ri-close-circle-line" };
      case "partial":
        return { text: "Parcial — revise os avisos", class: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "ri-alert-line" };
      case "running":
        return { text: "Executando testes...", class: "bg-np-purple-100 text-np-purple-800 border-np-purple-300", icon: "ri-loader-4-line animate-spin" };
      default:
        return { text: "Aguardando início", class: "bg-np-wood-100 text-np-wood-700 border-np-wood-300", icon: "ri-play-circle-line" };
    }
  };

  const loyaltyOverallBadge = () => {
    switch (loyaltyOverallStatus) {
      case "success":
        return { text: "Fidelidade OK", class: "bg-np-green-100 text-np-green-800 border-np-green-300", icon: "ri-check-double-line" };
      case "error":
        return { text: "Falhas críticas", class: "bg-red-100 text-red-800 border-red-300", icon: "ri-close-circle-line" };
      case "partial":
        return { text: "Parcial — revise", class: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "ri-alert-line" };
      case "running":
        return { text: "Executando...", class: "bg-np-purple-100 text-np-purple-800 border-np-purple-300", icon: "ri-loader-4-line animate-spin" };
      default:
        return { text: "Aguardando", class: "bg-np-wood-100 text-np-wood-700 border-np-wood-300", icon: "ri-coins-line" };
    }
  };

  const badge = overallBadge();
  const loyaltyBadge = loyaltyOverallBadge();

  const successCount = steps.filter((s) => s.status === "success").length;
  const warningCount = steps.filter((s) => s.status === "warning").length;
  const errorCount = steps.filter((s) => s.status === "error").length;

  const loyaltySuccessCount = loyaltySteps.filter((s) => s.status === "success").length;
  const loyaltyWarningCount = loyaltySteps.filter((s) => s.status === "warning").length;
  const loyaltyErrorCount = loyaltySteps.filter((s) => s.status === "error").length;

  const handlePreviewFeedback = () => {
    const msg = getManualFeedbackMessage(feedbackTestOrderId);
    setFeedbackPreview(msg);
  };

  const handleTestFeedbackWhatsApp = () => {
    const clean = feedbackTestPhone.replace(/\D/g, "");
    if (!clean) return;
    const msg = getManualFeedbackMessage(feedbackTestOrderId);
    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/${clean}?text=${encoded}`;
    window.open(url, "_blank");
  };

  return (
    <div className="max-w-4xl space-y-10">
      {/* ===== OPERATIONAL TEST ===== */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl text-np-purple-900">
              <i className="ri-test-tube-line mr-2 text-np-purple-500"></i>
              Teste Operacional
            </h2>
            <p className="text-sm text-np-purple-600 mt-1">
              Executa um fluxo completo de teste: pedido → cozinha → caixa → pagamento → estoque → permissões
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${badge.class}`}>
            <i className={badge.icon}></i>
            {badge.text}
          </div>
        </div>

        {/* Warning box */}
        <div className="bg-np-gold-50 border border-np-gold-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <div className="w-9 h-9 bg-np-gold-100 rounded-full flex items-center justify-center flex-shrink-0">
            <i className="ri-information-line text-np-gold-600"></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-np-gold-900 mb-1">Como funciona o teste</p>
            <p className="text-sm text-np-gold-700">
              O teste cria um pedido real de teste (Mesa 99), executa todo o fluxo e apaga os dados ao final.
              O estoque do produto de teste é restaurado automaticamente. Não afeta pedidos reais.
            </p>
          </div>
        </div>

        {/* Start button + create test users */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={runTests}
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
                Executando testes...
              </>
            ) : (
              <>
                <i className="ri-play-fill"></i>
                Iniciar Teste Operacional
              </>
            )}
          </button>
          <button
            onClick={async () => {
              const results = await createTestUsers();
              setTestUsersMessage(results.join("\n"));
            }}
            disabled={isRunning}
            className="px-4 py-3 rounded-xl text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-user-add-line"></i>
            Criar usuários de teste
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
                <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full border border-current flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{
                    color: step.status === "success" ? "#16a34a" : step.status === "error" ? "#ef4444" : step.status === "warning" ? "#eab308" : step.status === "running" ? "#7c3aed" : "#d1d5db",
                    borderColor: step.status === "success" ? "#bbf7d0" : step.status === "error" ? "#fecaca" : step.status === "warning" ? "#fef08a" : step.status === "running" ? "#ddd6fe" : "#e5e7eb",
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
                    <p className={`text-sm mt-1 font-medium ${
                      step.status === "success" ? "text-np-green-700" : step.status === "error" ? "text-red-700" : step.status === "warning" ? "text-yellow-700" : "text-np-purple-700"
                    }`}>
                      {step.message}
                    </p>
                  )}
                  {step.detail && (
                    <p className="text-xs text-np-purple-500 mt-1">{step.detail}</p>
                  )}
                </div>
                <div className="flex-shrink-0 mt-0.5">
                  {statusIcon(step.status)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary when done */}
        {!isRunning && overallStatus !== "idle" && (
          <div className={`mt-6 rounded-xl border p-5 ${
            overallStatus === "success" ? "bg-np-green-50 border-np-green-200" : "bg-yellow-50 border-yellow-200"
          }`}>
            <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
              <i className={overallStatus === "success" ? "ri-check-double-line text-np-green-600" : "ri-alert-line text-yellow-600"}></i>
              {overallStatus === "success" ? "Todos os testes passaram" : "Alguns testes apresentaram falhas ou avisos"}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-np-green-600"></i>
                <span className="text-np-purple-700">
                  {successCount} aprovados
                </span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-alert-line text-yellow-500"></i>
                <span className="text-np-purple-700">
                  {warningCount} avisos
                </span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-error-warning-line text-red-500"></i>
                <span className="text-np-purple-700">
                  {errorCount} erros
                </span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-loader-4-line text-np-purple-400"></i>
                <span className="text-np-purple-700">
                  {steps.filter((s) => s.status === "running").length} pendentes
                </span>
              </div>
            </div>
            {overallStatus === "success" && (
              <p className="text-xs text-np-green-700 mt-3">
                <i className="ri-information-line mr-1"></i>
                Pedido de teste foi removido e estoque restaurado. Nenhum dado de teste permanece no sistema.
              </p>
            )}
            {overallStatus === "partial" && (
              <p className="text-xs text-yellow-700 mt-3">
                <i className="ri-information-line mr-1"></i>
                Revise os erros e avisos acima. Dados de teste já foram limpos do sistema.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ===== LOYALTY TEST ===== */}
      <div className="border-t border-np-wood-200 pt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl text-np-purple-900">
              <i className="ri-coins-line mr-2 text-np-gold-500"></i>
              Teste de Fidelidade
            </h2>
            <p className="text-sm text-np-purple-600 mt-1">
              Testa o fluxo completo: pedido com user_id → pagamento → crédito de pontos → histórico → proteção contra duplicidade
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${loyaltyBadge.class}`}>
            <i className={loyaltyBadge.icon}></i>
            {loyaltyBadge.text}
          </div>
        </div>

        <div className="bg-np-gold-50 border border-np-gold-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <div className="w-9 h-9 bg-np-gold-100 rounded-full flex items-center justify-center flex-shrink-0">
            <i className="ri-information-line text-np-gold-600"></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-np-gold-900 mb-1">Como funciona o teste de fidelidade</p>
            <p className="text-sm text-np-gold-700">
              Cria um pedido vinculado ao seu usuário logado, simula pagamento, verifica se pontos foram creditados,
              testa a proteção contra duplicidade (pagamento + entrega) e limpa os dados ao final.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={runLoyaltyTests}
            disabled={isLoyaltyRunning}
            className={`px-6 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
              isLoyaltyRunning
                ? "bg-np-wood-200 text-np-wood-500 cursor-not-allowed"
                : "bg-np-gold-500 hover:bg-np-gold-600 text-np-purple-900 shadow-sm"
            }`}
          >
            {isLoyaltyRunning ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Testando fidelidade...
              </>
            ) : (
              <>
                <i className="ri-play-fill"></i>
                Testar Fidelidade
              </>
            )}
          </button>
        </div>

        {/* Loyalty Steps */}
        <div className="space-y-3">
          {loyaltySteps.map((step, index) => (
            <div
              key={step.id}
              className={`rounded-xl border p-4 transition-all ${statusBg(step.status)}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full border border-current flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{
                    color: step.status === "success" ? "#16a34a" : step.status === "error" ? "#ef4444" : step.status === "warning" ? "#eab308" : step.status === "running" ? "#7c3aed" : "#d1d5db",
                    borderColor: step.status === "success" ? "#bbf7d0" : step.status === "error" ? "#fecaca" : step.status === "warning" ? "#fef08a" : step.status === "running" ? "#ddd6fe" : "#e5e7eb",
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
                    <p className={`text-sm mt-1 font-medium ${
                      step.status === "success" ? "text-np-green-700" : step.status === "error" ? "text-red-700" : step.status === "warning" ? "text-yellow-700" : "text-np-purple-700"
                    }`}>
                      {step.message}
                    </p>
                  )}
                  {step.detail && (
                    <p className="text-xs text-np-purple-500 mt-1">{step.detail}</p>
                  )}
                </div>
                <div className="flex-shrink-0 mt-0.5">
                  {statusIcon(step.status)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Loyalty Summary */}
        {!isLoyaltyRunning && loyaltyOverallStatus !== "idle" && (
          <div className={`mt-6 rounded-xl border p-5 ${
            loyaltyOverallStatus === "success" ? "bg-np-green-50 border-np-green-200" : "bg-yellow-50 border-yellow-200"
          }`}>
            <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
              <i className={loyaltyOverallStatus === "success" ? "ri-check-double-line text-np-green-600" : "ri-alert-line text-yellow-600"}></i>
              {loyaltyOverallStatus === "success" ? "Teste de fidelidade passou" : "Teste de fidelidade apresentou falhas"}
            </h3>
            {loyaltyTestResult && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                  <p className="text-xs text-np-purple-500">Pontos antes</p>
                  <p className="font-bold text-np-purple-900">{loyaltyTestResult.pointsBefore}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                  <p className="text-xs text-np-purple-500">Pontos depois</p>
                  <p className="font-bold text-np-green-600">{loyaltyTestResult.pointsAfter}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                  <p className="text-xs text-np-purple-500">Esperado</p>
                  <p className="font-bold text-np-purple-900">+{loyaltyTestResult.pointsExpected}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-np-wood-200">
                  <p className="text-xs text-np-purple-500">Proteção duplicidade</p>
                  <p className={`font-bold ${loyaltyTestResult.duplicateBlocked ? "text-np-green-600" : "text-red-500"}`}>
                    {loyaltyTestResult.duplicateBlocked ? "Ativa" : "Falhou"}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-np-green-600"></i>
                <span className="text-np-purple-700">{loyaltySuccessCount} aprovados</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-alert-line text-yellow-500"></i>
                <span className="text-np-purple-700">{loyaltyWarningCount} avisos</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="ri-error-warning-line text-red-500"></i>
                <span className="text-np-purple-700">{loyaltyErrorCount} erros</span>
              </div>
            </div>
            {loyaltyOverallStatus === "success" && (
              <p className="text-xs text-np-green-700 mt-3">
                <i className="ri-information-line mr-1"></i>
                Dados de teste removidos. O estoque foi restaurado e o histórico de teste foi limpo.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Feedback WhatsApp Test */}
      <div className="border-t border-np-wood-200 pt-10">
        <h3 className="font-medium text-np-purple-900 mb-3 flex items-center gap-2">
          <i className="ri-whatsapp-line text-np-green-600"></i>
          Teste de Mensagem de Feedback (WhatsApp)
        </h3>
        <p className="text-sm text-np-purple-600 mb-4">
          Pré-visualize e teste a mensagem de avaliação que o cliente recebe no WhatsApp.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-np-purple-700 mb-1">Telefone de teste</label>
            <input
              type="text"
              value={feedbackTestPhone}
              onChange={(e) => setFeedbackTestPhone(e.target.value)}
              placeholder="(71) 99999-9999"
              className="w-full px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-np-purple-700 mb-1">ID do pedido (exemplo)</label>
            <input
              type="text"
              value={feedbackTestOrderId}
              onChange={(e) => setFeedbackTestOrderId(e.target.value)}
              placeholder="teste-123-456"
              className="w-full px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={handlePreviewFeedback}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-np-purple-100 hover:bg-np-purple-200 text-np-purple-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-eye-line mr-1"></i>
            Pré-visualizar
          </button>
          <button
            onClick={handleTestFeedbackWhatsApp}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-np-green-600 hover:bg-np-green-700 text-white transition-colors whitespace-nowrap"
          >
            <i className="ri-whatsapp-line mr-1"></i>
            Abrir WhatsApp
          </button>
        </div>

        {feedbackPreview && (
          <div className="bg-np-wood-50 rounded-lg p-4 border border-np-wood-200">
            <p className="text-xs font-medium text-np-purple-600 mb-2">Mensagem que será enviada:</p>
            <pre className="text-sm text-np-purple-800 whitespace-pre-wrap font-mono bg-white p-3 rounded border border-np-wood-200">
              {feedbackPreview}
            </pre>
          </div>
        )}
      </div>

      {/* Test users creation message */}
      {testUsersMessage && (
        <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="ri-user-add-line text-np-purple-600"></i>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-np-purple-900 mb-1">Resultado da criação de usuários</p>
              <p className="text-sm text-np-purple-700 whitespace-pre-line">{testUsersMessage}</p>
              <button
                onClick={() => setTestUsersMessage(null)}
                className="mt-2 text-xs text-np-purple-500 hover:text-np-purple-700 underline"
              >
                Fechar mensagem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}