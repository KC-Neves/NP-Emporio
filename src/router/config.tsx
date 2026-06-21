import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Cardapio from "../pages/cardapio/page";
import Pedidos from "../pages/pedidos/page";
import Delivery from "../pages/delivery/page";
import Reservas from "../pages/reservas/page";
import Login from "../pages/login/page";
import Cadastro from "../pages/cadastro/page";
import VerificarEmail from "../pages/verificar-email/page";
import AuthCallback from "../pages/auth-callback/page";
import MinhaConta from "../pages/minha-conta/page";
import Sobre from "../pages/sobre/page";
import Cozinha from "../pages/cozinha/page";
import Caixa from "../pages/caixa/page";
import Admin from "../pages/admin/page";
import QRMesas from "../pages/qrcode-mesas/page";
import Feedback from "../pages/feedback/page";
import RoleGuard from "../components/base/RoleGuard";
import MeusPedidos from "../pages/meus-pedidos/page";
import AcompanharPedido from "../pages/acompanhar-pedido/page";
import Entregas from "../pages/entregas/page";
import RedefinirSenha from "../pages/redefinir-senha/page";

const routes: RouteObject[] = [
  { path: "/", element: <Home /> },
  { path: "/cardapio", element: <Cardapio /> },
  { path: "/pedidos", element: <Pedidos /> },
  { path: "/delivery", element: <Delivery /> },
  { path: "/reservas", element: <Reservas /> },
  { path: "/login", element: <Login /> },
  { path: "/cadastro", element: <Cadastro /> },
  { path: "/verificar-email", element: <VerificarEmail /> },
  { path: "/auth/callback", element: <AuthCallback /> },
  {
    path: "/minha-conta",
    element: (
      <RoleGuard allowedRoles={["cliente", "admin", "atendente", "caixa", "entregador"]}>
        <MinhaConta />
      </RoleGuard>
    ),
  },
  { path: "/sobre", element: <Sobre /> },
  { path: "/feedback/:orderId", element: <Feedback /> },
  { path: "/acompanhar-pedido/:codigo", element: <AcompanharPedido /> },
  { path: "/redefinir-senha", element: <RedefinirSenha /> },
  {
    path: "/cozinha",
    element: (
      <RoleGuard allowedRoles={["cozinha", "admin"]}>
        <Cozinha />
      </RoleGuard>
    ),
  },
  {
    path: "/caixa",
    element: (
      <RoleGuard allowedRoles={["caixa", "admin"]}>
        <Caixa />
      </RoleGuard>
    ),
  },
  {
    path: "/admin",
    element: (
      <RoleGuard allowedRoles={["admin", "atendente", "caixa"]}>
        <Admin />
      </RoleGuard>
    ),
  },
  {
    path: "/qrcode-mesas",
    element: (
      <RoleGuard allowedRoles={["caixa", "admin"]}>
        <QRMesas />
      </RoleGuard>
    ),
  },
  {
    path: "/meus-pedidos",
    element: (
      <RoleGuard allowedRoles={["cliente", "admin", "atendente", "caixa", "entregador"]}>
        <MeusPedidos />
      </RoleGuard>
    ),
  },
  {
    path: "/entregas",
    element: (
      <RoleGuard allowedRoles={["entregador", "admin"]}>
        <Entregas />
      </RoleGuard>
    ),
  },
  { path: "*", element: <NotFound /> },
];

export default routes;