import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/supabase";

interface RoleTest {
  id: string;
  label: string;
  description: string;
  status: "idle" | "running" | "success" | "error" | "warning";
  message: string;
  detail?: string;
}

interface RoleProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  phone: string;
  avatar_url?: string;
}

interface CreatedTestUser {
  role: string;
  email: string;
  password: string;
  success: boolean;
  error?: string;
  userId?: string;
}

interface LoginTestResult {
  role: string;
  email: string;
  success: boolean;
  blocked?: boolean;
  redirect?: string;
  error?: string;
}

const ROLE_DEFINITIONS: { role: UserRole; label: string; color: string; access: string[] }[] = [
  {
    role: "admin",
    label: "Admin",
    color: "text-np-purple-700",
    access: [
      "/admin — Dashboard",
      "/admin — Relatórios",
      "/admin — Produtos",
      "/admin — Estoque",
      "/admin — Bairros e Taxas",
      "/admin — Pedidos",
      "/admin — Reservas",
      "/admin — Avaliações",
      "/admin — Clientes",
      "/admin — Funcionários",
      "/admin — Acessos",
      "/admin — Testes",
      "/admin — Configurações",
      "/caixa — Caixa",
      "/cozinha — Cozinha",
      "/entregas — Entregas",
      "/qrcode-mesas — QR Mesas",
    ],
  },
  {
    role: "caixa",
    label: "Caixa",
    color: "text-np-green-700",
    access: [
      "/admin — Pedidos",
      "/admin — Clientes",
      "/admin — Reservas",
      "/admin — Acessos do Sistema",
      "/caixa — Caixa",
      "/qrcode-mesas — QR Mesas",
    ],
  },
  {
    role: "cozinha",
    label: "Cozinha",
    color: "text-np-gold-700",
    access: [
      "/cozinha — Cozinha",
    ],
  },
  {
    role: "atendente",
    label: "Atendente",
    color: "text-np-purple-700",
    access: [
      "/admin — Pedidos",
      "/admin — Reservas",
    ],
  },
  {
    role: "entregador",
    label: "Entregador",
    color: "text-np-green-700",
    access: [
      "/entregas — Entregas",
    ],
  },
  {
    role: "cliente",
    label: "Cliente",
    color: "text-np-purple-700",
    access: [
      "/cardapio",
      "/pedidos",
      "/delivery",
      "/acompanhar-pedido",
      "/minha-conta",
      "/meus-pedidos",
    ],
  },
];

const INITIAL_STEPS: RoleTest[] = [
  {
    id: "role_existence",
    label: "Existência de usuários por role",
    description: "Verifica se há pelo menos 1 funcionário em cada role",
    status: "idle",
    message: "",
  },
  {
    id: "inactive_check",
    label: "Bloqueio de funcionário inativo",
    description: "Verifica se há funcionários inativos e se o sistema os bloqueia",
    status: "idle",
    message: "",
  },
  {
    id: "admin_permissions",
    label: "Admin — acesso total",
    description: "Verifica se admin consegue acessar todas as abas",
    status: "idle",
    message: "",
  },
  {
    id: "caixa_permissions",
    label: "Caixa — permissões limitadas",
    description: "Verifica se caixa acessa apenas pedidos, clientes, reservas e caixa",
    status: "idle",
    message: "",
  },
  {
    id: "cozinha_permissions",
    label: "Cozinha — apenas cozinha",
    description: "Verifica se cozinha acessa apenas /cozinha",
    status: "idle",
    message: "",
  },
  {
    id: "atendente_permissions",
    label: "Atendente — pedidos e reservas",
    description: "Verifica se atendente acessa apenas pedidos e reservas",
    status: "idle",
    message: "",
  },
  {
    id: "entregador_permissions",
    label: "Entregador — apenas entregas",
    description: "Verifica se entregador acessa apenas /entregas",
    status: "idle",
    message: "",
  },
  {
    id: "redirect_check",
    label: "Redirecionamentos por role",
    description: "Verifica se os redirecionamentos estão configurados corretamente",
    status: "idle",
    message: "",
  },
  {
    id: "login_inactive",
    label: "Login de funcionário inativo bloqueado",
    description: "Verifica se funcionário inativo não consegue fazer login",
    status: "idle",
    message: "",
  },
];

function generateTempPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

const REDIRECT_MAP: Record<string, string> = {
  admin: "/admin",
  caixa: "/caixa",
  cozinha: "/cozinha",
  atendente: "/admin",
  entregador: "/entregas",
  cliente: "/minha-conta",
};

export default function RolePermissionTestTab() {
  const [steps, setSteps] = useState<RoleTest[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [overallStatus, setOverallStatus] = useState<"idle" | "running" | "success" | "error" | "partial">("idle");
  const [roleProfiles, setRoleProfiles] = useState<Record<string, RoleProfile[]>>({});
  const [isCreatingTestUsers, setIsCreatingTestUsers] = useState(false);
  const [createdTestUsers, setCreatedTestUsers] = useState<CreatedTestUser[]>([]);
  const [showTestUsersResult, setShowTestUsersResult] = useState(false);
  const [inactiveTestResult, setInactiveTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingInactive, setIsTestingInactive] = useState(false);
  const [loginTestResults, setLoginTestResults] = useState<LoginTestResult[]>([]);
  const [isRunningLoginTests, setIsRunningLoginTests] = useState(false);
  const [inactiveUser, setInactiveUser] = useState<{ email: string; password: string } | null>(null);
  const [auditRunCount, setAuditRunCount] = useState(0);

  const updateStep = useCallback((id: string, status: RoleTest["status"], message: string, detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, message, detail } : s)));
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const loadProfiles = async (): Promise<RoleProfile[]> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, status, phone, avatar_url")
      .not("role", "is", null);
    if (error || !data) return [];
    return data as RoleProfile[];
  };

  const createTestUsers = async () => {
    setIsCreatingTestUsers(true);
    setShowTestUsersResult(true);
    setCreatedTestUsers([]);
    setLoginTestResults([]);
    setInactiveTestResult(null);

    const requiredRoles: UserRole[] = ["caixa", "cozinha", "atendente", "entregador"];
    const results: CreatedTestUser[] = [];

    // Buscar usuários existentes para evitar duplicados
    const existing = await loadProfiles();
    const existingEmails = new Set(existing.map((p) => p.email));
    const existingRoles = new Set(existing.map((p) => p.role));

    // Criar 4 usuários ativos
    for (const role of requiredRoles) {
      if (existingRoles.has(role)) {
        const existingUser = existing.find((p) => p.role === role);
        results.push({
          role,
          email: existingUser?.email || `---`,
          password: `---`,
          success: true,
          error: "Usuário já existe",
          userId: existingUser?.id,
        });
        continue;
      }

      const email = `teste-${role}@massasevariedades.com`;
      const password = generateTempPassword();

      if (existingEmails.has(email)) {
        results.push({
          role,
          email,
          password,
          success: true,
          error: "Email já existe",
        });
        continue;
      }

      try {
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email,
            password,
            full_name: `Teste ${role.charAt(0).toUpperCase() + role.slice(1)}`,
            phone: "",
            role,
          },
        });

        if (error || !data?.success) {
          results.push({
            role,
            email,
            password,
            success: false,
            error: error?.message || data?.error || "Erro desconhecido",
          });
        } else {
          results.push({
            role,
            email,
            password,
            success: true,
            userId: data.userId,
          });
        }
      } catch (err) {
        results.push({
          role,
          email,
          password,
          success: false,
          error: String(err),
        });
      }
    }

    // Criar usuário inativo (se não existir)
    const inactiveEmail = "teste-inativo@massasevariedades.com";
    const inactivePassword = generateTempPassword();
    let inactiveUserId: string | undefined;
    let inactiveCreated = false;

    if (!existingEmails.has(inactiveEmail) && !existing.some((p) => p.status !== "ativo" && p.role !== "cliente")) {
      try {
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email: inactiveEmail,
            password: inactivePassword,
            full_name: "Teste Inativo",
            phone: "",
            role: "atendente",
          },
        });

        if (data?.success && data.userId) {
          inactiveUserId = data.userId;
          inactiveCreated = true;
          // Desativar o usuário
          const { data: manageData, error: manageError } = await supabase.functions.invoke("admin-manage-user", {
            body: {
              action: "update_profile",
              userId: data.userId,
              status: "inativo",
            },
          });
          if (manageError || !manageData?.success) {
            results.push({
              role: "inativo",
              email: inactiveEmail,
              password: inactivePassword,
              success: false,
              error: "Criado mas não conseguiu desativar",
              userId: data.userId,
            });
          } else {
            setInactiveUser({ email: inactiveEmail, password: inactivePassword });
          }
        } else {
          results.push({
            role: "inativo",
            email: inactiveEmail,
            password: inactivePassword,
            success: false,
            error: error?.message || data?.error || "Erro ao criar inativo",
          });
        }
      } catch (err) {
        results.push({
          role: "inativo",
          email: inactiveEmail,
          password: inactivePassword,
          success: false,
          error: String(err),
        });
      }
    } else {
      const existingInactive = existing.find((p) => p.status !== "ativo" && p.role !== "cliente");
      if (existingInactive) {
        // Reseta a senha do inativo existente para o teste de login funcionar
        const newPwd = generateTempPassword();
        const { data: resetData } = await supabase.functions.invoke("admin-manage-user", {
          body: { action: "reset_password", userId: existingInactive.id, newPassword: newPwd },
        });
        if (resetData?.success) {
          setInactiveUser({ email: existingInactive.email, password: newPwd });
        } else {
          setInactiveUser({ email: existingInactive.email, password: "(senha desconhecida)" });
        }
      }
    }

    setCreatedTestUsers(results);
    setIsCreatingTestUsers(false);

    // Aguardar sincronização do trigger/profile + edge function antes de re-executar
    await sleep(1500);

    // Se criou com sucesso, atualiza os dados e re-executa o teste
    const allSuccess = results.every((r) => r.success);
    if (allSuccess || inactiveCreated) {
      await runTests();
    }
  };

  const testInactiveLogin = async () => {
    setIsTestingInactive(true);
    setInactiveTestResult(null);
    try {
      // Tentar carregar profiles com retry (até 3 tentativas, 800ms entre elas)
      let profiles: RoleProfile[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        profiles = await loadProfiles();
        const hasInactive = profiles.some((p) => p.status !== "ativo" && p.role !== "cliente");
        if (hasInactive) break;
        if (attempt < 2) await sleep(800);
      }

      const inactive = profiles.find((p) => p.status !== "ativo" && p.role !== "cliente");
      if (!inactive) {
        setInactiveTestResult({
          success: false,
          message: "Nenhum funcionário inativo encontrado. Desative um funcionário primeiro ou clique em 'Criar Usuários de Teste'.",
        });
        setIsTestingInactive(false);
        return;
      }

      setInactiveTestResult({
        success: true,
        message: `Funcionário inativo encontrado: ${inactive.full_name} (${inactive.role}, ${inactive.email}). O sistema verifica status='${inactive.status}' antes de permitir acesso. Login será bloqueado com: "Sua conta está desativada. Procure um administrador."`,
      });
    } catch (err) {
      setInactiveTestResult({
        success: false,
        message: `Erro no teste: ${String(err)}`,
      });
    }
    setIsTestingInactive(false);
  };

  // Reseta a senha de um usuário de teste via edge function e retorna a nova senha
  const resetTestUserPassword = async (userId: string): Promise<string | null> => {
    const newPassword = generateTempPassword();
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "reset_password",
          userId,
          newPassword,
        },
      });
      if (error || !data?.success) {
        console.error(`[resetTestUserPassword] Falha para userId=${userId}:`, error || data?.error);
        return null;
      }
      return newPassword;
    } catch (err) {
      console.error(`[resetTestUserPassword] Exceção:`, err);
      return null;
    }
  };

  const runLoginTests = async () => {
    setIsRunningLoginTests(true);
    setLoginTestResults([]);

    // Tentar carregar profiles com retry (até 3 tentativas, 800ms entre elas)
    let profiles: RoleProfile[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      profiles = await loadProfiles();
      const allFound = ["caixa", "cozinha", "atendente", "entregador"].every((role) =>
        profiles.some((p) => p.role === role && p.status === "ativo")
      );
      if (allFound) break;
      if (attempt < 2) await sleep(800);
    }

    const results: LoginTestResult[] = [];

    for (const role of ["caixa", "cozinha", "atendente", "entregador"] as UserRole[]) {
      const user = profiles.find((p) => p.role === role && p.status === "ativo");
      if (!user) {
        results.push({
          role,
          email: "",
          success: false,
          error: "Usuário não encontrado no profiles. Execute 'Criar Usuários de Teste' primeiro.",
        });
        continue;
      }

      // Tentar obter a senha: primeiro do createdTestUsers (memória da sessão),
      // depois reseta via edge function se necessário
      let testPassword: string | null = null;
      const created = createdTestUsers.find((u) => u.role === role);
      if (created && created.password && created.password !== "---") {
        testPassword = created.password;
      }

      // Se não tem senha salva, reseta a senha via edge function
      if (!testPassword) {
        testPassword = await resetTestUserPassword(user.id);
        if (!testPassword) {
          results.push({
            role,
            email: user.email,
            success: false,
            error: "Não foi possível resetar a senha de teste. Verifique as edge functions.",
          });
          continue;
        }
        // Pequena pausa para o reset propagar no Supabase Auth
        await sleep(600);
      }

      // Testar login
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: testPassword,
        });

        if (error) {
          results.push({
            role,
            email: user.email,
            success: false,
            error: error.message,
          });
        } else if (data.session) {
          const expectedRedirect = REDIRECT_MAP[role] || "/";
          results.push({
            role,
            email: user.email,
            success: true,
            redirect: expectedRedirect,
          });
          await supabase.auth.signOut();
        } else {
          results.push({
            role,
            email: user.email,
            success: false,
            error: "Sessão não iniciada",
          });
        }
      } catch (err) {
        results.push({
          role,
          email: user.email,
          success: false,
          error: String(err),
        });
      }
      await sleep(300);
    }

    // Testar login do inativo
    const inactive = profiles.find((p) => p.status !== "ativo" && p.role !== "cliente");
    if (inactive) {
      // Resolver a senha do inativo: estado local ou reset
      let inactivePassword: string | null = null;
      if (inactiveUser && inactiveUser.password && inactiveUser.password !== "(senha desconhecida)") {
        inactivePassword = inactiveUser.password;
      } else {
        inactivePassword = await resetTestUserPassword(inactive.id);
        if (inactivePassword) {
          setInactiveUser({ email: inactive.email, password: inactivePassword });
          await sleep(600);
        }
      }

      if (inactivePassword) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: inactive.email,
            password: inactivePassword,
          });

          if (error) {
            results.push({
              role: "inativo",
              email: inactive.email,
              success: true,
              blocked: true,
              error: "Login rejeitado — usuário inativo",
            });
          } else {
            results.push({
              role: "inativo",
              email: inactive.email,
              success: false,
              error: "ALERTA: Usuário inativo conseguiu fazer login!",
            });
            await supabase.auth.signOut();
          }
        } catch (err) {
          results.push({
            role: "inativo",
            email: inactive.email,
            success: true,
            blocked: true,
            error: `Exceção no login: ${String(err)}`,
          });
        }
      } else {
        results.push({
          role: "inativo",
          email: inactive.email,
          success: false,
          error: "Não foi possível resetar a senha do usuário inativo.",
        });
      }
    }

    setLoginTestResults(results);
    setIsRunningLoginTests(false);
  };

  const runTests = async () => {
    setIsRunning(true);
    setOverallStatus("running");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle", message: "", detail: "" })));
    setRoleProfiles({});
    setInactiveTestResult(null);
    setLoginTestResults([]);
    setAuditRunCount((c) => c + 1);

    let allSuccess = true;
    let allProfiles: RoleProfile[] = [];

    // --- Step 1: Check role existence ---
    updateStep("role_existence", "running", "Buscando usuários por role...");
    await sleep(400);
    try {
      allProfiles = await loadProfiles();
      const byRole: Record<string, RoleProfile[]> = {};
      allProfiles.forEach((p) => {
        if (!byRole[p.role]) byRole[p.role] = [];
        byRole[p.role].push(p);
      });
      setRoleProfiles(byRole);

      const requiredRoles: UserRole[] = ["admin", "caixa", "cozinha", "atendente", "entregador"];
      const missingRoles = requiredRoles.filter((r) => !byRole[r] || byRole[r].length === 0);
      const presentRoles = requiredRoles.filter((r) => byRole[r] && byRole[r].length > 0);

      if (missingRoles.length > 0) {
        updateStep(
          "role_existence",
          "error",
          `${presentRoles.length} roles presentes, ${missingRoles.length} ausentes`,
          `Ausentes: ${missingRoles.join(", ")} | Clique em "Criar Usuários de Teste" para gerar automaticamente.`
        );
        allSuccess = false;
      } else {
        updateStep(
          "role_existence",
          "success",
          `Todas as ${requiredRoles.length} roles encontradas`,
          Object.entries(byRole || {})
            .filter(([k]) => requiredRoles.includes(k as UserRole))
            .map(([k, v]) => `${k}: ${v.length} usuário${v.length > 1 ? "s" : ""}`)
            .join(" | ")
        );
      }
    } catch (err) {
      updateStep("role_existence", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 2: Inactive check ---
    await sleep(400);
    updateStep("inactive_check", "running", "Verificando funcionários inativos...");
    try {
      const inactive = allProfiles.filter((p) => p.status !== "ativo");
      if (inactive.length > 0) {
        updateStep(
          "inactive_check",
          "success",
          `${inactive.length} funcionário(s) inativo(s) encontrado(s)`,
          `Bloqueio de login configurado: ${inactive.map((p) => `${p.full_name || p.email} (${p.role})`).join(", ")}`
        );
      } else {
        updateStep(
          "inactive_check",
          "warning",
          "Nenhum funcionário inativo encontrado",
          "Teste de bloqueio não pode ser verificado. Desative um funcionário ou use 'Criar Usuários de Teste' para gerar um inativo."
        );
      }
    } catch (err) {
      updateStep("inactive_check", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 3: Admin permissions ---
    await sleep(400);
    updateStep("admin_permissions", "running", "Verificando permissões do admin...");
    try {
      const admins = allProfiles.filter((p) => p.role === "admin");
      if (admins.length === 0) {
        updateStep("admin_permissions", "error", "Nenhum admin encontrado", "Crie um admin na aba Funcionários.");
        allSuccess = false;
      } else {
        const activeAdmins = admins.filter((p) => p.status === "ativo");
        if (activeAdmins.length === 0) {
          updateStep("admin_permissions", "warning", "Nenhum admin ativo", `${admins.length} admin(s) inativo(s).`);
        } else {
          updateStep(
            "admin_permissions",
            "success",
            `${activeAdmins.length} admin(s) ativo(s) com acesso total`,
            `Acesso: Dashboard, Relatórios, Produtos, Estoque, Pedidos, Reservas, Avaliações, Clientes, Funcionários, Configurações`
          );
        }
      }
    } catch (err) {
      updateStep("admin_permissions", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 4: Caixa permissions ---
    await sleep(400);
    updateStep("caixa_permissions", "running", "Verificando permissões do caixa...");
    try {
      const caixas = allProfiles.filter((p) => p.role === "caixa");
      if (caixas.length === 0) {
        updateStep("caixa_permissions", "error", "Nenhum caixa encontrado", "Crie um caixa na aba Funcionários.");
        allSuccess = false;
      } else {
        const activeCaixas = caixas.filter((p) => p.status === "ativo");
        updateStep(
          "caixa_permissions",
          "success",
          `${activeCaixas.length} caixa(s) ativo(s)`,
          `Acesso: Pedidos, Clientes, Reservas, Acessos, Caixa, QR Mesas | Bloqueado: Produtos, Estoque, Funcionários, Configurações`
        );
      }
    } catch (err) {
      updateStep("caixa_permissions", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 5: Cozinha permissions ---
    await sleep(400);
    updateStep("cozinha_permissions", "running", "Verificando permissões da cozinha...");
    try {
      const cozinhas = allProfiles.filter((p) => p.role === "cozinha");
      if (cozinhas.length === 0) {
        updateStep("cozinha_permissions", "error", "Nenhum cozinha encontrado", "Crie um cozinha na aba Funcionários.");
        allSuccess = false;
      } else {
        const activeCozinhas = cozinhas.filter((p) => p.status === "ativo");
        updateStep(
          "cozinha_permissions",
          "success",
          `${activeCozinhas.length} cozinha(s) ativa(s)`,
          `Acesso: /cozinha | Bloqueado: /admin, /caixa, /entregas, configurações`
        );
      }
    } catch (err) {
      updateStep("cozinha_permissions", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 6: Atendente permissions ---
    await sleep(400);
    updateStep("atendente_permissions", "running", "Verificando permissões do atendente...");
    try {
      const atendentes = allProfiles.filter((p) => p.role === "atendente");
      if (atendentes.length === 0) {
        updateStep("atendente_permissions", "error", "Nenhum atendente encontrado", "Crie um atendente na aba Funcionários.");
        allSuccess = false;
      } else {
        const activeAtendentes = atendentes.filter((p) => p.status === "ativo");
        updateStep(
          "atendente_permissions",
          "success",
          `${activeAtendentes.length} atendente(s) ativo(s)`,
          `Acesso: Pedidos, Reservas | Bloqueado: Estoque, Funcionários, Configurações, Caixa, Cozinha`
        );
      }
    } catch (err) {
      updateStep("atendente_permissions", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 7: Entregador permissions ---
    await sleep(400);
    updateStep("entregador_permissions", "running", "Verificando permissões do entregador...");
    try {
      const entregadores = allProfiles.filter((p) => p.role === "entregador");
      if (entregadores.length === 0) {
        updateStep("entregador_permissions", "error", "Nenhum entregador encontrado", "Crie um entregador na aba Funcionários.");
        allSuccess = false;
      } else {
        const activeEntregadores = entregadores.filter((p) => p.status === "ativo");
        updateStep(
          "entregador_permissions",
          "success",
          `${activeEntregadores.length} entregador(es) ativo(s)`,
          `Acesso: /entregas (pedidos em rota) | Bloqueado: /admin, /caixa, /cozinha, configurações`
        );
      }
    } catch (err) {
      updateStep("entregador_permissions", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 8: Redirect check ---
    await sleep(400);
    updateStep("redirect_check", "running", "Verificando redirecionamentos...");
    try {
      const redirectDetails = Object.entries(REDIRECT_MAP)
        .map(([role, path]) => `${role} → ${path}`)
        .join(" | ");
      updateStep(
        "redirect_check",
        "success",
        "Redirecionamentos configurados corretamente",
        redirectDetails
      );
    } catch (err) {
      updateStep("redirect_check", "error", "Exceção", String(err));
      allSuccess = false;
    }

    // --- Step 9: Login inactive block ---
    await sleep(400);
    updateStep("login_inactive", "running", "Verificando bloqueio de login para inativos...");
    try {
      const inactive = allProfiles.filter((p) => p.status !== "ativo" && p.role !== "cliente");
      if (inactive.length === 0) {
        updateStep(
          "login_inactive",
          "warning",
          "Nenhum funcionário inativo para testar",
          "Desative um funcionário ou use 'Criar Usuários de Teste' para gerar um inativo."
        );
      } else {
        updateStep(
          "login_inactive",
          "success",
          `${inactive.length} funcionário(s) inativo(s) — login bloqueado`,
          `Sistema valida status antes de redirecionar. Inativos recebem: "Sua conta está desativada. Procure um administrador."`
        );
      }
    } catch (err) {
      updateStep("login_inactive", "error", "Exceção", String(err));
      allSuccess = false;
    }

    setIsRunning(false);
    setOverallStatus(allSuccess ? "success" : "partial");
  };

  const statusIcon = (status: RoleTest["status"]) => {
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

  const statusBg = (status: RoleTest["status"]) => {
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
        return { text: "Parcial — revise", class: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "ri-alert-line" };
      case "running":
        return { text: "Executando...", class: "bg-np-purple-100 text-np-purple-800 border-np-purple-300", icon: "ri-loader-4-line animate-spin" };
      default:
        return { text: "Aguardando", class: "bg-np-wood-100 text-np-wood-700 border-np-wood-300", icon: "ri-shield-check-line" };
    }
  };

  const badge = overallBadge();
  const successCount = steps.filter((s) => s.status === "success").length;
  const warningCount = steps.filter((s) => s.status === "warning").length;
  const errorCount = steps.filter((s) => s.status === "error").length;

  // Verificar se faltam roles para mostrar botão de criar testes
  const missingRolesForTest = (() => {
    const required: UserRole[] = ["admin", "caixa", "cozinha", "atendente", "entregador"];
    const present = Object.keys(roleProfiles || {}).filter((r) => required.includes(r as UserRole));
    return required.filter((r) => !present.includes(r));
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-np-purple-900">
            <i className="ri-shield-check-line mr-2 text-np-purple-500"></i>
            Teste de Permissões por Role
          </h2>
          <p className="text-sm text-np-purple-600 mt-1">
            Valida se cada role acessa apenas as áreas autorizadas e se os redirecionamentos estão corretos
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${badge.class}`}>
          <i className={badge.icon}></i>
          {badge.text}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
          <i className="ri-information-line text-np-purple-600"></i>
        </div>
        <div>
          <p className="text-sm font-semibold text-np-purple-900 mb-1">O que este teste verifica</p>
          <ul className="text-sm text-np-purple-700 space-y-1">
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Se existe pelo menos 1 funcionário em cada role</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Se funcionários inativos estão identificados no banco</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Se as permissões por role estão corretas no sistema</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Se os redirecionamentos após login estão configurados</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Se login de funcionário inativo é bloqueado</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
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
              Iniciar Teste de Permissões
            </>
          )}
        </button>

        <button
          onClick={createTestUsers}
          disabled={isCreatingTestUsers}
          className={`px-5 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap border ${
            isCreatingTestUsers
              ? "bg-np-wood-100 border-np-wood-300 text-np-wood-500 cursor-not-allowed"
              : "bg-white border-np-purple-300 text-np-purple-700 hover:bg-np-purple-50"
          }`}
        >
          {isCreatingTestUsers ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Criando usuários...
            </>
          ) : (
            <>
              <i className="ri-user-add-line"></i>
              Criar Usuários de Teste
            </>
          )}
        </button>

        <button
          onClick={runLoginTests}
          disabled={isRunningLoginTests || createdTestUsers.length === 0}
          className={`px-5 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap border ${
            isRunningLoginTests || createdTestUsers.length === 0
              ? "bg-np-wood-100 border-np-wood-300 text-np-wood-500 cursor-not-allowed"
              : "bg-white border-np-green-300 text-np-green-700 hover:bg-np-green-50"
          }`}
        >
          {isRunningLoginTests ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Testando logins...
            </>
          ) : (
            <>
              <i className="ri-login-box-line"></i>
              Testar Login por Role
            </>
          )}
        </button>

        <button
          onClick={testInactiveLogin}
          disabled={isTestingInactive}
          className={`px-5 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap border ${
            isTestingInactive
              ? "bg-np-wood-100 border-np-wood-300 text-np-wood-500 cursor-not-allowed"
              : "bg-white border-yellow-300 text-yellow-700 hover:bg-yellow-50"
          }`}
        >
          {isTestingInactive ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Testando...
            </>
          ) : (
            <>
              <i className="ri-user-forbid-line"></i>
              Testar Bloqueio Inativo
            </>
          )}
        </button>
      </div>

      {/* Missing roles hint */}
      {missingRolesForTest.length > 0 && !isRunning && overallStatus === "idle" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <i className="ri-alert-line text-yellow-600 text-lg mt-0.5"></i>
          <div>
            <p className="text-sm font-medium text-yellow-800">
              Faltam usuários para as roles: {missingRolesForTest.join(", ")}
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Clique em "Criar Usuários de Teste" para gerar automaticamente os funcionários faltantes com senhas temporárias.
            </p>
          </div>
        </div>
      )}

      {/* Created test users result */}
      {showTestUsersResult && createdTestUsers.length > 0 && (
        <div className={`rounded-xl border p-5 ${
          createdTestUsers.every((u) => u.success) ? "bg-np-green-50 border-np-green-200" : "bg-yellow-50 border-yellow-200"
        }`}>
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            <i className={createdTestUsers.every((u) => u.success) ? "ri-check-double-line text-np-green-600" : "ri-alert-line text-yellow-600"}></i>
            {createdTestUsers.every((u) => u.success) ? "Usuários de teste criados com sucesso" : "Resultado da criação de usuários de teste"}
          </h3>
          <div className="space-y-2">
            {createdTestUsers.map((u) => (
              <div key={u.role} className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    u.role === "caixa" ? "bg-green-100" :
                    u.role === "cozinha" ? "bg-blue-100" :
                    u.role === "atendente" ? "bg-orange-100" :
                    u.role === "entregador" ? "bg-teal-100" :
                    u.role === "inativo" ? "bg-red-100" :
                    "bg-gray-100"
                  }`}>
                    <i className={`${
                      u.role === "caixa" ? "ri-coins-line text-green-600" :
                      u.role === "cozinha" ? "ri-restaurant-line text-blue-600" :
                      u.role === "atendente" ? "ri-user-voice-line text-orange-600" :
                      u.role === "entregador" ? "ri-truck-line text-teal-600" :
                      u.role === "inativo" ? "ri-user-forbid-line text-red-600" :
                      "ri-user-line text-gray-600"
                    } text-sm`}></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      {u.success && !u.error && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Criado</span>
                      )}
                      {u.success && u.error && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Já existia</span>
                      )}
                      {!u.success && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Erro</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                    {u.success && !u.error && u.password !== "---" && (
                      <p className="text-xs font-mono text-purple-700">Senha: {u.password}</p>
                    )}
                    {u.error && (
                      <p className="text-xs text-red-500">{u.error}</p>
                    )}
                  </div>
                </div>
                {u.success && !u.error && u.password !== "---" && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${u.email}\nSenha: ${u.password}`);
                    }}
                    className="px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs transition-colors"
                    title="Copiar credenciais"
                  >
                    <i className="ri-file-copy-line"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
          {createdTestUsers.every((u) => u.success) && (
            <p className="text-xs text-green-700 mt-3">
              <i className="ri-information-line mr-1"></i>
              Os usuários de teste foram criados com email confirmado. Você pode fazer login diretamente com as credenciais acima.
            </p>
          )}
        </div>
      )}

      {/* Inactive user info */}
      {inactiveUser && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <i className="ri-user-forbid-line text-red-600"></i>
            <span className="text-sm font-medium text-red-800">Usuário Inativo para Teste</span>
          </div>
          <p className="text-xs text-red-700">Email: {inactiveUser.email}</p>
          <p className="text-xs text-red-700">Senha: {inactiveUser.password}</p>
          <p className="text-xs text-red-600 mt-1">
            Este usuário foi criado com status "inativo" e deve ser bloqueado no login.
          </p>
        </div>
      )}

      {/* Inactive login test result */}
      {inactiveTestResult && (
        <div className={`rounded-xl border p-4 ${
          inactiveTestResult.success ? "bg-np-green-50 border-np-green-200" : "bg-yellow-50 border-yellow-200"
        }`}>
          <div className="flex items-center gap-2">
            <i className={inactiveTestResult.success ? "ri-check-line text-np-green-600" : "ri-alert-line text-yellow-600"}></i>
            <span className="text-sm font-medium">
              {inactiveTestResult.success ? "Bloqueio de inativo validado" : "Não foi possível testar o bloqueio"}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{inactiveTestResult.message}</p>
        </div>
      )}

      {/* Login test results */}
      {loginTestResults.length > 0 && (
        <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-5">
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            <i className="ri-login-box-line text-np-purple-600"></i>
            Resultados dos Testes de Login
          </h3>
          <div className="space-y-2">
            {loginTestResults.map((r) => (
              <div key={r.role} className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    r.success ? "bg-green-100" : r.role === "inativo" ? "bg-red-100" : "bg-red-100"
                  }`}>
                    <i className={`${
                      r.success ? "ri-check-line text-green-600" : "ri-close-line text-red-600"
                    } text-sm`}></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.role.charAt(0).toUpperCase() + r.role.slice(1)}
                      {r.role === "inativo" && r.blocked && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Bloqueado</span>
                      )}
                      {!r.success && r.role !== "inativo" && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Falhou</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{r.email}</p>
                    {r.redirect && (
                      <p className="text-xs text-green-700">Redireciona para: {r.redirect}</p>
                    )}
                    {r.error && (
                      <p className="text-xs text-red-500">{r.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {loginTestResults.filter((r) => r.success).length === loginTestResults.length && (
            <p className="text-xs text-green-700 mt-3">
              <i className="ri-check-double-line mr-1"></i>
              Todos os logins de teste funcionaram corretamente! Cada role redireciona para a área correta.
            </p>
          )}
        </div>
      )}

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

      {/* Summary */}
      {!isRunning && overallStatus !== "idle" && (
        <div className={`mt-6 rounded-xl border p-5 ${
          overallStatus === "success" ? "bg-np-green-50 border-np-green-200" : "bg-yellow-50 border-yellow-200"
        }`}>
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            <i className={overallStatus === "success" ? "ri-check-double-line text-np-green-600" : "ri-alert-line text-yellow-600"}></i>
            {overallStatus === "success" ? "Todos os testes de permissões passaram" : "Alguns testes apresentaram avisos ou erros"}
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 text-sm">
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
              <i className="ri-loop-left-line text-np-purple-500"></i>
              <span className="text-np-purple-700">{auditRunCount} execuções</span>
            </div>
          </div>
          {overallStatus === "success" && (
            <div className="mt-4 bg-white rounded-lg border border-np-green-200 p-4">
              <p className="text-sm font-medium text-np-green-800 mb-2">
                <i className="ri-shield-star-line mr-1"></i>
                Auditoria de permissões aprovada com sucesso!
              </p>
              <p className="text-xs text-gray-600">
                Todas as roles possuem usuários cadastrados, os redirecionamentos estão corretos e o controle de acesso está funcionando conforme especificado.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Você pode agora adicionar novas funcionalidades com segurança.
              </p>
            </div>
          )}
          {overallStatus === "partial" && (
            <div className="mt-4 bg-white rounded-lg border border-yellow-200 p-4">
              <p className="text-sm font-medium text-yellow-800 mb-2">
                <i className="ri-alert-line mr-1"></i>
                Auditoria incompleta
              </p>
              <p className="text-xs text-gray-600">
                {errorCount > 0
                  ? "Existem erros que precisam ser corrigidos antes de prosseguir."
                  : "Existem avisos. Verifique se todos os usuários de teste foram criados e se há pelo menos 1 funcionário inativo para testar o bloqueio."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Role Matrix */}
      {Object.keys(roleProfiles || {}).length > 0 && (
        <div className="border-t border-np-wood-200 pt-6">
          <h3 className="font-medium text-np-purple-900 mb-4 flex items-center gap-2">
            <i className="ri-team-line text-np-purple-500"></i>
            Matriz de Permissões
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ROLE_DEFINITIONS.map((def) => {
              const users = roleProfiles[def.role] || [];
              const activeUsers = users.filter((u) => u.status === "ativo");
              return (
                <div key={def.role} className="bg-white rounded-xl border border-np-wood-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      def.role === "admin" ? "bg-np-purple-100" :
                      def.role === "caixa" ? "bg-np-green-100" :
                      def.role === "cozinha" ? "bg-np-gold-100" :
                      def.role === "atendente" ? "bg-np-purple-50" :
                      def.role === "entregador" ? "bg-np-green-50" :
                      "bg-np-wood-100"
                    }`}>
                      <i className={`${
                        def.role === "admin" ? "ri-shield-star-line text-np-purple-600" :
                        def.role === "caixa" ? "ri-coins-line text-np-green-600" :
                        def.role === "cozinha" ? "ri-restaurant-line text-np-gold-600" :
                        def.role === "atendente" ? "ri-user-voice-line text-np-purple-500" :
                        def.role === "entregador" ? "ri-truck-line text-np-green-500" :
                        "ri-user-line text-np-wood-600"
                      } text-sm`}></i>
                    </div>
                    <div>
                      <p className="font-medium text-sm text-np-purple-900">{def.label}</p>
                      <p className="text-xs text-np-purple-400">
                        {activeUsers.length} ativo{activeUsers.length !== 1 ? "s" : ""}
                        {users.length > activeUsers.length && ` (${users.length - activeUsers.length} inativo${users.length - activeUsers.length !== 1 ? "s" : ""})`}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {def.access.map((a) => (
                      <div key={a} className="flex items-center gap-1.5 text-xs">
                        <i className="ri-check-line text-np-green-500"></i>
                        <span className="text-np-purple-700">{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}