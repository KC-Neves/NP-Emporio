# NP Empório Massas & Variedades

## 1. Project Description
NP Empório é uma cafeteria e casa de massas artesanais localizada em Salvador, BA. O site apresenta o cardápio completo de produtos (torre de batata frita, salgados fritos na hora, macarrão ao vivo, fatias de bolo, brownies e variedade de cafés), horários de funcionamento, localização com mapa, sistema de reservas online para Brunch e Café com Prosa, sistema de pedidos por mesa numerada, serviço de delivery, além de um programa de fidelidade com pontos para clientes cadastrados.

Público-alvo: Clientes locais e visitantes de Salvador que buscam uma experiência gastronômica única com massas artesanais e cafés especiais.

## 2. Page Structure
- `/` — Home (hero, cardápio, destaques, localização e horários, CTA reservas)
- `/cardapio` — Cardápio Completo
- `/pedidos` — Pedidos por Mesa (seleção de mesa + cardápio + carrinho)
- `/delivery` — Delivery (endereço + cardápio + carrinho)
- `/reservas` — Reservas Online (formulário + calendário para Brunch e Café com Prosa)
- `/login` — Login de Clientes (com redirecionamento por função)
- `/cadastro` — Cadastro de Clientes
- `/minha-conta` — Perfil do Cliente (pontos de fidelidade, histórico de reservas e pedidos)
- `/cozinha` — Painel da Cozinha (pedidos em tempo real) — Protegido: cozinha, admin
- `/caixa` — Painel do Caixa (pedidos por mesa, fechamento, impressão de recibos) — Protegido: caixa, admin
- `/admin` — Painel Admin (dashboard, produtos, pedidos, clientes, funcionários) — Protegido: admin
- `/qrcode-mesas` — QR Codes das mesas — Protegido: caixa, admin

## 3. Core Features
- [x] Seção Hero com identidade visual (roxo, dourado, verde, madeira)
- [x] Cardápio com produtos categorizados
- [x] Localização com endereço real e mapa Google Maps embed
- [x] Horários de funcionamento com schema.org markup
- [x] Botão flutuante WhatsApp para reservas rápidas
- [x] Sistema de pedidos por mesa numerada (1-30)
- [x] Sistema de delivery com endereço do cliente
- [x] Sistema de reservas online com calendário e formulário
- [x] Autenticação de clientes (login/cadastro via Supabase Auth)
- [x] **Login por função** (cliente, cozinha, caixa, admin) com redirecionamento automático
- [x] **Proteção de rotas por role** (RoleGuard)
- [x] Programa de fidelidade com pontos (estilo Cacau Show Lovers)
- [x] Histórico de reservas e pedidos no perfil do cliente
- [x] **Painel da Cozinha** — Pedidos em tempo real, atualização de status (Recebido → Preparando → Pronto → Entregue)
- [x] **Painel do Caixa** — Pedidos por mesa, fechar conta, confirmar pagamento, **impressão de recibo**
- [x] **Painel Admin** — Dashboard, produtos, pedidos, clientes, **gestão de funcionários** (definir roles)
- [x] **Impressão de recibos** — Formato térmico 80mm, recibo individual e fechamento de mesa
- [x] QR Codes das mesas
- [x] SEO otimizado com dados estruturados

## 4. Data Model Design

### Table: reservations
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK para auth.users |
| name | text | Nome do cliente |
| phone | text | Telefone |
| email | text | Email |
| reservation_type | text | 'brunch' ou 'cafe_com_prosa' |
| date | date | Data da reserva |
| time | text | Horário da reserva |
| guests | integer | Número de pessoas |
| notes | text | Observações |
| status | text | 'pending', 'confirmed', 'cancelled' |
| created_at | timestamp | Data de criação |

### Table: orders
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK para auth.users (opcional) |
| table_number | integer | Número da mesa (1-30) para pedidos no local |
| order_type | text | 'mesa' ou 'delivery' |
| customer_name | text | Nome do cliente |
| customer_phone | text | Telefone |
| address | text | Endereço (apenas delivery) |
| items | jsonb | Array de itens do pedido |
| total_amount | numeric | Valor total |
| status | text | 'pending', 'preparing', 'ready', 'delivered', 'cancelled' |
| created_at | timestamp | Data de criação |

### Table: loyalty_points
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK para auth.users |
| points | integer | Total de pontos acumulados |
| tier | text | 'bronze', 'silver', 'gold', 'platinum' |
| updated_at | timestamp | Última atualização |

### Table: loyalty_history
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK para auth.users |
| points | integer | Pontos (positivo = ganho, negativo = resgatado) |
| reason | text | Motivo (pedido, reserva, aniversário, resgate) |
| order_id | uuid | FK para orders (opcional) |
| created_at | timestamp | Data do registro |

## 5. Backend / Third-party Integration Plan
- Supabase: Essencial — autenticação de usuários, banco de dados para reservas, pedidos e pontos de fidelidade
- Shopify: Não necessário — pagamento é na hora na cafeteria
- Stripe: Não necessário — não há pagamento online
- WhatsApp API: Link direto para reservas rápidas via WhatsApp
- Google Maps: Embed iframe para localização

## 6. Development Phase Plan

### Phase 1: Homepage & Visual Identity ✅
### Phase 2: Frontend Pages ✅
### Phase 3: Supabase Setup & Auth ✅
### Phase 4: Reservations, Orders & Loyalty System ✅
### Phase 5: Role-based Login & Route Protection ✅
### Phase 6: Kitchen & Cashier Panels ✅
### Phase 7: Admin Dashboard, Employee Management & Print Receipts ✅
### Phase 8: Supabase Realtime Migration ✅
- [x] Pedidos migrados de localStorage → Supabase com Realtime (WebSocket)
- [x] Reservas migradas de localStorage → Supabase com Realtime
- [x] Pontos de fidelidade migrados de localStorage → Supabase (loyalty_points + loyalty_history)
- [x] RLS policies configuradas para acesso anônimo e autenticado
- [x] Realtime subscriptions substituem BroadcastChannel para sync multi-dispositivo
- [x] Pedidos vinculados automaticamente ao user_id via sessão
- [x] Correções na página admin (useAuth, employees state)

### Phase 9: Menu to Supabase ✅
- [x] Criado `useProducts` hook com Supabase + Realtime subscriptions
- [x] Cardápio migrado do mock (menuData.ts) para a tabela `products` do Supabase
- [x] Categorias derivadas dinamicamente dos produtos (torres, salgados, massas, doces, cafes, bebidas)
- [x] Homepage (MenuSection) conectada ao banco
- [x] Página /cardapio conectada ao banco com busca
- [x] Páginas /pedidos e /delivery com cardápio real do Supabase
- [x] Admin: CRUD completo de produtos (editar nome, descrição, preço, categoria, destaque, ativar/desativar)
- [x] Admin: Modal de edição de produto com campos de nome, descrição, preço e categoria

### Phase 10: Admin Features Completo ✅
- [x] Botão "Novo Produto" com modal de cadastro (nome, descrição, preço, categoria, imagem)
- [x] Edição de imagem_url no modal de editar produto (com preview)
- [x] Filtros por data/período no Dashboard (De / Até) afetando todos os cards e relatórios
- [x] Botão "Limpar filtro" para resetar datas
- [x] Clientes tab também respeita o filtro de data

### Phase 11: Módulo de Estoque Completo ✅
- [x] Tabela `stock_movements` criada para histórico de movimentações de estoque
- [x] Hook `useStock.ts` para gerenciar estoque, movimentações, alertas e relatórios
- [x] Aba **Estoque** no painel Admin com 3 sub-visões: Produtos, Movimentações, Relatório de Risco
- [x] Campo Estoque Atual com controle visual por produto
- [x] Botão **Adicionar Estoque** (+1 rápido e modal com motivo)
- [x] Botão **Remover Estoque** (-1 rápido e modal com motivo)
- [x] **Ajuste Manual de Estoque** com modal de motivo e notas
- [x] Histórico de movimentações com data, produto, motivo, quantidade, estoque anterior/novo
- [x] Motivos de movimentação: Compra, Correção de Inventário, Perda/Desperdício, Consumo Interno, Baixa Automática por Pedido
- [x] Estoque mínimo por produto (campo `min_stock` na tabela `products`)
- [x] Alerta visual de estoque baixo (banner vermelho + badge crítico na lista)
- [x] Relatório de produtos próximos de acabar (estoque até 150% do mínimo)
- [x] Baixa automática por pedido continua funcionando e agora registra movimentação no histórico
- [x] Realtime subscriptions em `products` e `stock_movements` para atualização em tempo real

### Phase 12: Homologação Final ✅
- [x] Aba "Homologação Final" no painel Admin com checklist manual completo
- [x] 31 itens de validação distribuídos em 6 áreas: Cliente, Cozinha, Caixa, Delivery, Admin, Segurança
- [x] Status por item: pendente / aprovado / erro com campo de observação para bugs
- [x] Barra de progresso geral e por seção
- [x] Persistência automática em localStorage
- [x] Exportação do relatório em formato .txt
- [x] Instruções de como testar e resultado esperado para cada item

## Data Model Update

### Table: products (updated)
| Field | Type | Description |
|-------|------|-------------|
| stock_quantity | integer | Estoque atual |
| min_stock | integer | Estoque mínimo para alerta |

### Table: stock_movements (new)
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| product_id | integer | FK para products |
| quantity | integer | Positivo = entrada, negativo = saída |
| reason | text | Motivo: compra, correcao, perda, consumo, baixa_pedido |
| notes | text | Observações opcionais |
| previous_stock | integer | Estoque antes da movimentação |
| new_stock | integer | Estoque após a movimentação |
| created_by | uuid | FK para auth.users (opcional) |
| created_at | timestamp | Data do registro |