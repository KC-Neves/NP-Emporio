import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

export default function RoleGuard({ children, allowedRoles, redirectTo = '/login' }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowTimeoutMessage(false);
      return;
    }
    const timer = setTimeout(() => setShowTimeoutMessage(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-np-wood-50 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-4xl text-np-purple-600 block mb-4"></i>
          <p className="text-np-purple-500 text-sm">Carregando...</p>
          {showTimeoutMessage && (
            <div className="mt-4 max-w-sm mx-auto">
              <p className="text-np-purple-600 text-sm mb-3">
                Estamos tendo problemas para verificar seu acesso.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1"></i>
                Recarregar página
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('[ROLEGUARD] !user -> redirecionando para login. ROTA:', location.pathname);
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Verificar se o usuário está ativo
  if (user.status !== 'ativo') {
    console.log('[ROLEGUARD] Usuário inativo. Redirecionando para login. ROTA:', location.pathname);
    return <Navigate to="/login?error=inactive" replace />;
  }

  const userRole = user.role || 'cliente';
  console.log('[ROLEGUARD] ROLE:', userRole, 'ROTA:', location.pathname, 'ALLOWED:', allowedRoles);

  if (!allowedRoles.includes(userRole)) {
    const roleRedirects: Record<string, string> = {
      admin: '/admin',
      cozinha: '/cozinha',
      caixa: '/caixa',
      atendente: '/admin',
      entregador: '/entregas',
      cliente: '/minha-conta',
    };

    const target = roleRedirects[userRole] || '/';
    console.log('[ROLEGUARD] Role não permitida. Redirecionando para:', target);
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}