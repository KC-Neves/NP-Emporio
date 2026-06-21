import { useState, useEffect, useCallback } from "react";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  howToTest: string;
  expectedResult: string;
  status: "pendente" | "aprovado" | "erro";
  observation: string;
}

interface ChecklistSection {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: ChecklistItem[];
}

const STORAGE_KEY = "np-homologation-checklist";

function generateInitialChecklist(): ChecklistSection[] {
  return [
    {
      id: "cliente",
      title: "1. Cliente",
      icon: "ri-user-line",
      color: "np-purple",
      items: [
        {
          id: "cliente-cadastro",
          label: "Cadastro de cliente",
          description: "Novo cliente se cadastra no site com email e senha",
          howToTest: "Acesse /cadastro, preencha nome, email, telefone e senha. Confirme o cadastro.",
          expectedResult: "Conta criada, email de confirmação enviado, redireciona para /minha-conta.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cliente-login",
          label: "Login de cliente",
          description: "Cliente cadastrado faz login com email e senha",
          howToTest: "Acesse /login, insira email e senha de um cliente cadastrado.",
          expectedResult: "Login bem-sucedido, redireciona para /minha-conta. Nome do cliente aparece no topo.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cliente-pedido-mesa",
          label: "Pedido por mesa (QR Code)",
          description: "Cliente escaneia QR Code da mesa e faz pedido",
          howToTest: "Acesse /pedidos?mesa=5, selecione itens do cardápio, adicione ao carrinho e finalize o pedido.",
          expectedResult: "Pedido criado com mesa 5, itens corretos, valor total correto. Pedido aparece na cozinha e admin.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cliente-delivery",
          label: "Pedido por delivery",
          description: "Cliente faz pedido para entrega com verificação de CEP",
          howToTest: "Acesse /delivery, insira CEP de Salvador (ex: 40020-000), monte carrinho e finalize.",
          expectedResult: "CEP validado, bairro reconhecido, taxa de entrega calculada. Pedido criado com status 'pending'.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cliente-acompanhamento",
          label: "Acompanhamento do pedido",
          description: "Cliente acompanha status do pedido em tempo real",
          howToTest: "Após criar pedido, acesse /acompanhar-pedido/{código}. Altere o status pelo admin e verifique atualização.",
          expectedResult: "Página mostra status atual, tempo estimado e itens do pedido. Atualiza quando status muda.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cliente-fidelidade",
          label: "Pontos de fidelidade",
          description: "Cliente acumula pontos ao fazer pedidos",
          howToTest: "Estando logado, faça um pedido. Após pagamento/entrega, verifique /minha-conta para os pontos.",
          expectedResult: "Pontos creditados corretamente (1 ponto a cada R$2). Histórico aparece em loyalty_history. Tier atualizado.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cliente-feedback",
          label: "Feedback do pedido",
          description: "Cliente avalia o pedido após entrega",
          howToTest: "Clique no link de feedback enviado por WhatsApp ou acesse /feedback/{orderId}.",
          expectedResult: "Formulário carrega com dados do pedido. Avaliação salva na tabela feedbacks. Confirmação exibida.",
          status: "pendente",
          observation: "",
        },
      ],
    },
    {
      id: "cozinha",
      title: "2. Cozinha",
      icon: "ri-restaurant-line",
      color: "np-gold",
      items: [
        {
          id: "cozinha-realtime",
          label: "Receber pedido em tempo real",
          description: "Pedido novo aparece na tela da cozinha sem precisar recarregar",
          howToTest: "Abra /cozinha em uma janela. Em outra janela, crie um pedido por mesa. Verifique se aparece automaticamente.",
          expectedResult: "Pedido aparece em menos de 3 segundos na tela da cozinha, com som de notificação, nome do cliente, mesa e itens.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cozinha-som",
          label: "Som de novo pedido",
          description: "Alerta sonoro quando chega pedido novo",
          howToTest: "Com som ativado (ícone de volume no topo), crie um novo pedido.",
          expectedResult: "Som de notificação (beep) toca quando pedido pendente aparece. Som pode ser desligado/ligado.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cozinha-status",
          label: "Alterar status do pedido",
          description: "Cozinha avança status: Recebido → Preparando → Pronto",
          howToTest: "Na /cozinha, clique em 'Iniciar Preparo' e depois 'Marcar como Pronto'.",
          expectedResult: "Status muda visualmente. Pedido some da cozinha quando marcado como Pronto. Atualização visível no admin.",
          status: "pendente",
          observation: "",
        },
        {
          id: "cozinha-no-duplicate",
          label: "Não duplicar mensagens/pedidos",
          description: "Pedidos não aparecem duplicados na tela da cozinha",
          howToTest: "Atualize a página /cozinha (F5). Verifique se os mesmos pedidos não aparecem duplicados.",
          expectedResult: "Cada pedido aparece uma única vez. Atualizar página não duplica notificações visuais.",
          status: "pendente",
          observation: "",
        },
      ],
    },
    {
      id: "caixa",
      title: "3. Caixa",
      icon: "ri-coins-line",
      color: "np-green",
      items: [
        {
          id: "caixa-ver-pedidos",
          label: "Ver pedidos por mesa",
          description: "Caixa visualiza todos os pedidos pendentes das 10 mesas reais da NP Empório",
          howToTest: "Acesse /caixa ou /admin com role=caixa. Verifique se o grid mostra exatamente 10 mesas (1 a 10).",
          expectedResult: "Grid de 10 mesas. Mesas com pedidos ativos ficam destacadas em roxo com valor total. Mesas sem pedido aparecem em cinza claro. Apenas mesas 1 a 10 são exibidas (NP Empório tem 10 mesas físicas).",
          status: "pendente",
          observation: "",
        },
        {
          id: "caixa-pagamento",
          label: "Confirmar pagamento",
          description: "Caixa registra pagamento do pedido",
          howToTest: "Em um pedido com status 'pending' ou 'ready', clique no botão de confirmar pagamento.",
          expectedResult: "Pagamento marcado como 'Pago'. Método de pagamento (caixa/cartão/pix) registrado. Estoque baixado automaticamente.",
          status: "pendente",
          observation: "",
        },
        {
          id: "caixa-fechar-conta",
          label: "Fechar conta da mesa",
          description: "Caixa finaliza todos os pedidos de uma mesa",
          howToTest: "Com pedidos pendentes na mesa X, feche a conta (marque todos como pagos/entregues).",
          expectedResult: "Todos os pedidos da mesa atualizados. Total exibido corretamente. Mesa liberada para novos pedidos.",
          status: "pendente",
          observation: "",
        },
        {
          id: "caixa-imprimir",
          label: "Imprimir recibo",
          description: "Impressão de recibo térmico 80mm",
          howToTest: "Em um pedido pago, clique no botão de imprimir recibo.",
          expectedResult: "Janela de impressão abre com recibo formatado (nome NP Empório, itens, total, data). Compatível com impressora térmica 80mm.",
          status: "pendente",
          observation: "",
        },
        {
          id: "caixa-whatsapp",
          label: "Enviar feedback pelo WhatsApp",
          description: "Caixa envia link de avaliação para o cliente via WhatsApp",
          howToTest: "Em um pedido, clique no botão de estrela (WhatsApp) para enviar feedback.",
          expectedResult: "WhatsApp abre com mensagem pré-formatada contendo link de feedback. Número do cliente preenchido corretamente.",
          status: "pendente",
          observation: "",
        },
      ],
    },
    {
      id: "delivery",
      title: "4. Delivery",
      icon: "ri-truck-line",
      color: "np-purple",
      items: [
        {
          id: "delivery-bairro-taxa",
          label: "Bairro e taxa de entrega",
          description: "Sistema reconhece bairro pelo CEP e aplica taxa",
          howToTest: "No /delivery, insira CEPs de diferentes bairros de Salvador (ex: 40020-000 Barra, 41940-000 Rio Vermelho).",
          expectedResult: "Bairro identificado corretamente. Taxa de entrega conforme cadastrado em Bairros e Taxas. Tempo estimado exibido.",
          status: "pendente",
          observation: "",
        },
        {
          id: "delivery-status-flow",
          label: "Fluxo completo de status",
          description: "Status: recebido → preparando → pronto → saiu para entrega → entregue",
          howToTest: "Crie pedido delivery. Pelo admin/cozinha, avance cada status: pending → preparing → ready → out_for_delivery → delivered.",
          expectedResult: "Cada transição de status é registrada. Cliente vê atualização no acompanhamento. Baixa de estoque no pagamento/entrega.",
          status: "pendente",
          observation: "",
        },
        {
          id: "delivery-entregador",
          label: "Entregador acessando /entregas",
          description: "Entregador vê apenas pedidos em rota de entrega",
          howToTest: "Faça login como entregador (role=entregador) e acesse /entregas.",
          expectedResult: "Lista de pedidos com status 'out_for_delivery'. Pode marcar como 'entregue'. Não vê funções de admin/caixa/cozinha.",
          status: "pendente",
          observation: "",
        },
      ],
    },
    {
      id: "admin",
      title: "5. Admin",
      icon: "ri-shield-star-line",
      color: "np-purple",
      items: [
        {
          id: "admin-produtos",
          label: "Gerenciar produtos",
          description: "CRUD completo de produtos do cardápio",
          howToTest: "No /admin, aba Produtos: crie, edite, destaque, ative/desative e remova um produto.",
          expectedResult: "Produto criado aparece no cardápio. Edição salva corretamente. Destaque reflete na home. Desativado some do cardápio público.",
          status: "pendente",
          observation: "",
        },
        {
          id: "admin-estoque-manual",
          label: "Estoque manual",
          description: "Adicionar, remover e ajustar estoque manualmente",
          howToTest: "No /admin, aba Estoque: adicione +10 unidades (Compra), remova -5 (Perda), faça ajuste manual para 50 (Correção).",
          expectedResult: "Estoque atualizado em products. Movimentações registradas em stock_movements com motivo, quantidade, estoque anterior/novo.",
          status: "pendente",
          observation: "",
        },
        {
          id: "admin-baixa-automatica",
          label: "Baixa automática de estoque",
          description: "Estoque baixado automaticamente ao confirmar pagamento",
          howToTest: "Anote estoque de um produto. Crie pedido com 1 unidade desse produto. Confirme pagamento. Verifique estoque.",
          expectedResult: "Estoque reduzido em 1 unidade. Movimentação registrada como 'baixa_pedido' em stock_movements. Sem duplicidade.",
          status: "pendente",
          observation: "",
        },
        {
          id: "admin-relatorios",
          label: "Relatórios",
          description: "Dashboard e relatórios de vendas com dados corretos",
          howToTest: "No /admin, aba Relatórios: filtre por data, verifique gráficos, ticket médio, produtos mais vendidos, horários de pico.",
          expectedResult: "Faturamento soma corretamente. Gráfico de vendas por dia coerente. Top produtos reflete pedidos reais. Ticket médio calculado certo.",
          status: "pendente",
          observation: "",
        },
        {
          id: "admin-clientes",
          label: "Lista de clientes",
          description: "Tabela de clientes com total de pedidos e gastos",
          howToTest: "No /admin, aba Clientes: verifique se aparecem clientes com nome, telefone, pedidos e total gasto.",
          expectedResult: "Clientes listados com dados corretos. Ordenação por total gasto. Filtro de data funciona.",
          status: "pendente",
          observation: "",
        },
        {
          id: "admin-funcionarios",
          label: "Gestão de funcionários",
          description: "Criar, editar, bloquear funcionários com roles",
          howToTest: "No /admin, aba Funcionários: crie usuário, defina role, altere status para inativo, resete senha.",
          expectedResult: "Usuário criado no auth.users + profile. Role definida corretamente. Inativo não consegue login. Reset de senha funciona.",
          status: "pendente",
          observation: "",
        },
        {
          id: "admin-permissoes",
          label: "Permissões por role no admin",
          description: "Cada role vê apenas as abas permitidas no painel admin",
          howToTest: "Login como caixa → ver abas visíveis. Login como atendente → ver abas visíveis.",
          expectedResult: "Caixa: Pedidos, Clientes, Reservas, Acessos. Atendente: Pedidos, Reservas. Admin: todas as abas.",
          status: "pendente",
          observation: "",
        },
      ],
    },
    {
      id: "seguranca",
      title: "6. Segurança",
      icon: "ri-shield-check-line",
      color: "np-green",
      items: [
        {
          id: "seg-cliente-nao-ve-admin",
          label: "Cliente não vê funções de admin",
          description: "Cliente logado não acessa /admin, /caixa, /cozinha, /entregas",
          howToTest: "Faça login como cliente. Tente acessar /admin, /caixa, /cozinha, /entregas diretamente pela URL.",
          expectedResult: "Redirecionado para /minha-conta ou página de acesso negado. Nenhuma função administrativa visível.",
          status: "pendente",
          observation: "",
        },
        {
          id: "seg-cozinha-isolada",
          label: "Cozinha só acessa cozinha",
          description: "Funcionário cozinha não acessa admin, caixa ou entregas",
          howToTest: "Faça login como cozinha. Tente acessar /admin, /caixa, /entregas diretamente pela URL.",
          expectedResult: "Redirecionado para /cozinha. Apenas funções de cozinha disponíveis.",
          status: "pendente",
          observation: "",
        },
        {
          id: "seg-caixa-isolado",
          label: "Caixa só acessa caixa e admin limitado",
          description: "Funcionário caixa acessa apenas /caixa e abas limitadas do /admin",
          howToTest: "Faça login como caixa. Tente acessar /cozinha, /admin (abas de produtos, estoque, funcionários).",
          expectedResult: "Redirecionado para /caixa. No /admin, apenas abas: Pedidos, Clientes, Reservas, Acessos.",
          status: "pendente",
          observation: "",
        },
        {
          id: "seg-entregador-isolado",
          label: "Entregador só acessa entregas",
          description: "Funcionário entregador acessa apenas /entregas",
          howToTest: "Faça login como entregador. Tente acessar /admin, /caixa, /cozinha.",
          expectedResult: "Redirecionado para /entregas. Apenas lista de entregas visível.",
          status: "pendente",
          observation: "",
        },
        {
          id: "seg-inativo-bloqueado",
          label: "Funcionário inativo não entra",
          description: "Usuário com status='inativo' tem login bloqueado",
          howToTest: "Desative um funcionário no admin. Tente fazer login com as credenciais dele.",
          expectedResult: "Login rejeitado com mensagem: 'Sua conta está desativada. Procure um administrador.' Não recebe sessão.",
          status: "pendente",
          observation: "",
        },
        {
          id: "seg-sessao-expirada",
          label: "Sessão expirada redireciona",
          description: "Token expirado redireciona para login sem quebrar",
          howToTest: "Faça login, aguarde expirar ou limpe cookies, tente acessar área protegida.",
          expectedResult: "Redirecionado para /login. Sem tela branca ou erro no console. Após novo login, volta à área correta.",
          status: "pendente",
          observation: "",
        },
      ],
    },
  ];
}

export default function HomologationTab() {
  const [sections, setSections] = useState<ChecklistSection[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return generateInitialChecklist();
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    return new Set(["cliente", "cozinha", "caixa", "delivery", "admin", "seguranca"]);
  });

  // Persist to localStorage whenever checklist changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
    } catch {
      // ignore
    }
  }, [sections]);

  const updateItemStatus = useCallback((sectionId: string, itemId: string, status: ChecklistItem["status"]) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: section.items.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, status, observation: status === "erro" ? item.observation : item.observation };
          }),
        };
      })
    );
  }, []);

  const updateItemObservation = useCallback((sectionId: string, itemId: string, observation: string) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: section.items.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, observation };
          }),
        };
      })
    );
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const resetChecklist = useCallback(() => {
    if (window.confirm("Tem certeza que deseja resetar todo o checklist de homologação? Todo o progresso será perdido.")) {
      const fresh = generateInitialChecklist();
      setSections(fresh);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const exportResults = useCallback(() => {
    const lines: string[] = ["CHECKLIST DE HOMOLOGAÇÃO — NP Empório Massas & Variedades", `Data: ${new Date().toLocaleString("pt-BR")}`, ""];

    sections.forEach((section) => {
      lines.push(`=== ${section.title} ===`);
      section.items.forEach((item) => {
        const statusIcon = item.status === "aprovado" ? "✅" : item.status === "erro" ? "❌" : "⬜";
        lines.push(`${statusIcon} ${item.label} — ${item.status.toUpperCase()}`);
        if (item.observation) {
          lines.push(`   Obs: ${item.observation}`);
        }
      });
      lines.push("");
    });

    const allItems = sections.flatMap((s) => s.items);
    const approved = allItems.filter((i) => i.status === "aprovado").length;
    const errors = allItems.filter((i) => i.status === "erro").length;
    const pending = allItems.filter((i) => i.status === "pendente").length;

    lines.push(`=== RESUMO FINAL ===`);
    lines.push(`Aprovados: ${approved}/${allItems.length}`);
    lines.push(`Erros: ${errors}/${allItems.length}`);
    lines.push(`Pendentes: ${pending}/${allItems.length}`);
    lines.push(`Progresso: ${Math.round((approved / allItems.length) * 100)}%`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homologacao-np-emporio-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sections]);

  // Compute totals
  const allItems = sections.flatMap((s) => s.items);
  const totalItems = allItems.length;
  const approvedCount = allItems.filter((i) => i.status === "aprovado").length;
  const errorCount = allItems.filter((i) => i.status === "erro").length;
  const pendingCount = allItems.filter((i) => i.status === "pendente").length;
  const progressPercent = totalItems > 0 ? Math.round((approvedCount / totalItems) * 100) : 0;

  const overallStatus: "pendente" | "parcial" | "aprovado" | "erro" =
    errorCount > 0 ? "erro" : pendingCount === 0 && approvedCount === totalItems ? "aprovado" : approvedCount > 0 ? "parcial" : "pendente";

  const overallBadge = () => {
    switch (overallStatus) {
      case "aprovado":
        return { text: "Homologado!", class: "bg-np-green-100 text-np-green-800 border-np-green-300", icon: "ri-check-double-line" };
      case "erro":
        return { text: `${errorCount} erro(s) encontrado(s)`, class: "bg-red-100 text-red-800 border-red-300", icon: "ri-error-warning-line" };
      case "parcial":
        return { text: "Em andamento", class: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "ri-timer-line" };
      default:
        return { text: "Não iniciado", class: "bg-np-wood-100 text-np-wood-700 border-np-wood-300", icon: "ri-clipboard-line" };
    }
  };

  const badge = overallBadge();

  // Compute section-level stats
  const getSectionStats = (section: ChecklistSection) => {
    const approved = section.items.filter((i) => i.status === "aprovado").length;
    const errors = section.items.filter((i) => i.status === "erro").length;
    const total = section.items.length;
    return { approved, errors, total };
  };

  const bgColors: Record<string, string> = {
    "np-purple": "bg-np-purple-50 border-np-purple-200",
    "np-gold": "bg-np-gold-50 border-np-gold-200",
    "np-green": "bg-np-green-50 border-np-green-200",
  };

  const iconBgColors: Record<string, string> = {
    "np-purple": "bg-np-purple-100",
    "np-gold": "bg-np-gold-100",
    "np-green": "bg-np-green-100",
  };

  const iconColors: Record<string, string> = {
    "np-purple": "text-np-purple-600",
    "np-gold": "text-np-gold-600",
    "np-green": "text-np-green-600",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl text-np-purple-900">
            <i className="ri-task-line mr-2 text-np-purple-500"></i>
            Homologação Final
          </h2>
          <p className="text-sm text-np-purple-600 mt-1">
            Checklist manual para validar se o sistema está pronto para uso na NP Empório
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${badge.class}`}>
          <i className={badge.icon}></i>
          {badge.text}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-np-wood-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm text-np-purple-900">Progresso Geral</h3>
          <span className="text-sm font-bold text-np-purple-700">{progressPercent}%</span>
        </div>
        <div className="w-full h-3 bg-np-wood-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              overallStatus === "aprovado" ? "bg-np-green-500" : overallStatus === "erro" ? "bg-red-400" : "bg-np-purple-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-np-green-500"></div>
            <span className="text-np-purple-700">{approvedCount} aprovados</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <span className="text-np-purple-700">{errorCount} erros</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-np-wood-300"></div>
            <span className="text-np-purple-700">{pendingCount} pendentes</span>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
          <i className="ri-information-line text-np-purple-600"></i>
        </div>
        <div>
          <p className="text-sm font-semibold text-np-purple-900 mb-1">Como usar este checklist</p>
          <ul className="text-sm text-np-purple-700 space-y-1">
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Execute cada teste <strong>manualmente</strong> no sistema (abra outra janela anônima para testar como cliente)</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Marque <strong className="text-np-green-600">Aprovado</strong> se funcionou exatamente como esperado</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Marque <strong className="text-red-500">Erro</strong> se encontrou bug — anote o problema na observação</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> O progresso é salvo automaticamente no navegador</li>
            <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Ao finalizar, exporte o resultado para compartilhar com a equipe</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={resetChecklist}
          className="px-4 py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <i className="ri-restart-line"></i>
          Resetar Checklist
        </button>
        <button
          onClick={exportResults}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <i className="ri-download-line"></i>
          Exportar Resultado (.txt)
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section) => {
          const stats = getSectionStats(section);
          const isExpanded = expandedSections.has(section.id);
          const allDone = stats.approved === stats.total && stats.errors === 0;
          const bg = bgColors[section.color] || "bg-np-wood-50 border-np-wood-200";
          const iconBg = iconBgColors[section.color] || "bg-np-wood-100";
          const iconColor = iconColors[section.color] || "text-np-wood-600";

          return (
            <div key={section.id} className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className={`w-full flex items-center justify-between px-5 py-4 transition-colors hover:opacity-90 ${bg}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${iconBg} rounded-full flex items-center justify-center`}>
                    <i className={`${section.icon} text-lg ${iconColor}`}></i>
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-sm text-np-purple-900">{section.title}</h3>
                    <p className="text-xs text-np-purple-500">
                      {stats.approved}/{stats.total} aprovados
                      {stats.errors > 0 && <span className="text-red-500 ml-2">{stats.errors} erro(s)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {allDone && (
                    <span className="bg-np-green-100 text-np-green-700 text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline-block">
                      Completo
                    </span>
                  )}
                  <i className={`ri-${isExpanded ? "arrow-up-s-line" : "arrow-down-s-line"} text-np-purple-400`}></i>
                </div>
              </button>

              {/* Section items */}
              {isExpanded && (
                <div className="divide-y divide-np-wood-100">
                  {section.items.map((item) => (
                    <div key={item.id} className="px-5 py-4 hover:bg-np-wood-50/50 transition-colors">
                      <div className="flex items-start gap-4">
                        {/* Status selector */}
                        <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5">
                          <button
                            onClick={() => updateItemStatus(section.id, item.id, "aprovado")}
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                              item.status === "aprovado"
                                ? "border-np-green-500 bg-np-green-50 text-np-green-600"
                                : "border-np-wood-300 text-np-wood-300 hover:border-np-green-400"
                            }`}
                            title="Aprovado"
                          >
                            <i className={`ri-check-line ${item.status === "aprovado" ? "text-base" : "text-sm"}`}></i>
                          </button>
                          <button
                            onClick={() => updateItemStatus(section.id, item.id, "erro")}
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                              item.status === "erro"
                                ? "border-red-400 bg-red-50 text-red-500"
                                : "border-np-wood-300 text-np-wood-300 hover:border-red-400"
                            }`}
                            title="Erro"
                          >
                            <i className={`ri-close-line ${item.status === "erro" ? "text-base" : "text-sm"}`}></i>
                          </button>
                          <button
                            onClick={() => updateItemStatus(section.id, item.id, "pendente")}
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                              item.status === "pendente"
                                ? "border-np-wood-400 bg-np-wood-100 text-np-wood-500"
                                : "border-np-wood-200 text-np-wood-200 hover:border-np-wood-400"
                            }`}
                            title="Pendente"
                          >
                            <i className="ri-more-line text-sm"></i>
                          </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-sm text-np-purple-900">{item.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              item.status === "aprovado"
                                ? "bg-np-green-100 text-np-green-700"
                                : item.status === "erro"
                                ? "bg-red-100 text-red-700"
                                : "bg-np-wood-100 text-np-wood-600"
                            }`}>
                              {item.status === "aprovado" ? "Aprovado" : item.status === "erro" ? "Erro" : "Pendente"}
                            </span>
                          </div>
                          <p className="text-xs text-np-purple-500 mb-2">{item.description}</p>

                          {/* How to test (expandable) */}
                          <details className="mb-2 group">
                            <summary className="text-xs font-medium text-np-purple-600 cursor-pointer hover:text-np-purple-800 flex items-center gap-1">
                              <i className="ri-play-circle-line text-xs"></i>
                              Como testar
                              <i className="ri-arrow-down-s-line transition-transform group-open:rotate-180"></i>
                            </summary>
                            <div className="mt-2 pl-4 space-y-1.5">
                              <div className="text-xs">
                                <span className="font-medium text-np-purple-700">Passos: </span>
                                <span className="text-np-purple-600">{item.howToTest}</span>
                              </div>
                              <div className="text-xs">
                                <span className="font-medium text-np-green-700">Esperado: </span>
                                <span className="text-np-green-600">{item.expectedResult}</span>
                              </div>
                            </div>
                          </details>

                          {/* Observation field */}
                          <div className="relative">
                            <input
                              type="text"
                              value={item.observation}
                              onChange={(e) => updateItemObservation(section.id, item.id, e.target.value)}
                              placeholder={item.status === "erro" ? "Descreva o bug encontrado..." : "Observações (opcional)..."}
                              className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 transition-colors ${
                                item.status === "erro"
                                  ? "border-red-200 focus:ring-red-300 bg-red-50/30 placeholder:text-red-400"
                                  : "border-np-wood-200 focus:ring-np-purple-300 placeholder:text-np-purple-300"
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Final summary */}
      <div className={`rounded-xl border p-6 ${
        overallStatus === "aprovado"
          ? "bg-np-green-50 border-np-green-200"
          : overallStatus === "erro"
          ? "bg-red-50 border-red-200"
          : overallStatus === "parcial"
          ? "bg-yellow-50 border-yellow-200"
          : "bg-np-wood-50 border-np-wood-200"
      }`}>
        <h3 className="font-display text-lg text-np-purple-900 mb-3 flex items-center gap-2">
          <i className={
            overallStatus === "aprovado" ? "ri-check-double-line text-np-green-600" :
            overallStatus === "erro" ? "ri-error-warning-line text-red-500" :
            overallStatus === "parcial" ? "ri-timer-line text-yellow-600" :
            "ri-clipboard-line text-np-wood-500"
          }></i>
          {overallStatus === "aprovado"
            ? "Sistema homologado com sucesso!"
            : overallStatus === "erro"
            ? "Foram encontrados bugs — correção necessária antes de ir para produção"
            : overallStatus === "parcial"
            ? "Homologação em andamento"
            : "Checklist não iniciado"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {sections.map((section) => {
            const stats = getSectionStats(section);
            const sectionStatus = stats.errors > 0 ? "erro" : stats.approved === stats.total ? "aprovado" : "pendente";
            return (
              <div key={section.id} className="bg-white rounded-lg border border-np-wood-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-np-purple-700">{section.title.replace(/^\d+\.\s*/, "")}</span>
                  <span className={`text-xs font-medium ${
                    sectionStatus === "aprovado" ? "text-np-green-600" : sectionStatus === "erro" ? "text-red-500" : "text-np-wood-500"
                  }`}>
                    {stats.approved}/{stats.total}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-np-wood-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      sectionStatus === "aprovado" ? "bg-np-green-500" : sectionStatus === "erro" ? "bg-red-400" : "bg-np-wood-300"
                    }`}
                    style={{ width: `${(stats.approved / stats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        {overallStatus === "aprovado" && (
          <div className="bg-white rounded-lg border border-np-green-200 p-4">
            <p className="text-sm text-np-green-800">
              <i className="ri-shield-star-line mr-1"></i>
              Todos os {totalItems} testes foram aprovados! O sistema NP Empório está pronto para uso em produção.
            </p>
          </div>
        )}
        {overallStatus === "erro" && (
          <div className="bg-white rounded-lg border border-red-200 p-4">
            <p className="text-sm text-red-800 mb-2">
              <i className="ri-error-warning-line mr-1"></i>
              <strong>{errorCount} bug(s) encontrado(s).</strong> Corrija os itens marcados como erro antes de colocar o sistema em produção.
            </p>
            <ul className="text-xs text-red-700 space-y-1">
              {sections.flatMap((s) => s.items.filter((i) => i.status === "erro")).map((item) => (
                <li key={item.id} className="flex items-start gap-1">
                  <i className="ri-close-line text-red-400 mt-0.5 flex-shrink-0"></i>
                  <span><strong>{item.label}</strong>{item.observation ? ` — ${item.observation}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={exportResults}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-download-line"></i>
            Exportar Relatório de Homologação
          </button>
        </div>
      </div>
    </div>
  );
}