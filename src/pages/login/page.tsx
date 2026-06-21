import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const { signIn, resetPassword, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // State para o modal de recuperação de senha
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetFieldError, setResetFieldError] = useState('');

  // Detectar confirmação de email via URL
  useEffect(() => {
    const confirmed = searchParams.get('confirmed') === 'true';
    const authError = searchParams.get('error');
    const resetDone = searchParams.get('reset') === 'true';
    if (confirmed) {
      setSuccessMessage('E-mail confirmado com sucesso! Agora você pode fazer login.');
    }
    if (resetDone) {
      setSuccessMessage('Senha redefinida com sucesso! Faça login com sua nova senha.');
    }
    if (authError) {
      setError('Ocorreu um problema ao confirmar seu e-mail. Tente fazer login ou reenvie a confirmação.');
    }
  }, [searchParams]);

  // Se o usuário já estiver logado, redirecionar automaticamente
  useEffect(() => {
    console.log('[LOGIN] useEffect redirect check. user:', user?.role, 'authLoading:', authLoading);
    if (user && !authLoading) {
      console.log('[LOGIN] Usuário logado detectado, redirecionando. Role:', user.role);
      const roleRedirects: Record<string, string> = {
        admin: '/admin',
        cozinha: '/cozinha',
        caixa: '/caixa',
        atendente: '/admin',
        entregador: '/entregas',
        cliente: '/minha-conta',
      };
      const target = roleRedirects[user.role] || '/minha-conta';
      console.log('[LOGIN] Redirecionando para:', target);
      navigate(target, { replace: true });
    }
  }, [user, authLoading, navigate]);

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'O email é obrigatório';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Digite um email válido';
    }
    if (!password) {
      errors.password = 'A senha é obrigatória';
    } else if (password.length < 6) {
      errors.password = 'A senha deve ter pelo menos 6 caracteres';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!validate()) return;
    setIsLoading(true);

    const timeout = setTimeout(() => {
      console.error('[LOGIN] Timeout de 5s atingido');
      setIsLoading(false);
      setError('A conexão está lenta. Tente novamente.');
    }, 5000);

    try {
      console.log('[LOGIN] submit start');
      const { data, error: signInError } = await signIn(email.trim(), password);
      clearTimeout(timeout);

      if (signInError) {
        setIsLoading(false);
        const msg = signInError.message.toLowerCase();
        if (msg === 'inactive_account' || msg.includes('inactive')) {
          setError('Sua conta está desativada. Procure um administrador.');
        } else if (msg.includes('invalid login')) {
          setError('Email ou senha incorretos. Tente novamente.');
        } else if (msg.includes('email not confirmed')) {
          setError('E-mail ainda não confirmado. Verifique sua caixa de entrada e clique no link de confirmação.');
        } else if (msg.includes('network') || msg.includes('fetch')) {
          setError('Falha de conexão. Verifique sua internet e tente novamente.');
        } else {
          setError('Não foi possível fazer login. Tente novamente.');
        }
        console.error('[LOGIN] signIn error:', signInError.message);
        return;
      }

      if (!data?.session) {
        setIsLoading(false);
        setError('Não foi possível iniciar sua sessão. Tente novamente.');
        return;
      }

      console.log('[LOGIN] signIn success, session active. Aguardando useAuth atualizar user...');
      setIsLoading(false);
    } catch (err) {
      clearTimeout(timeout);
      setIsLoading(false);
      console.error('[LOGIN] submit exception:', err);
      setError('Ocorreu um erro inesperado. Tente novamente.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetFieldError('');

    if (!resetEmail.trim() || !EMAIL_REGEX.test(resetEmail.trim())) {
      setResetFieldError('Digite um email válido');
      return;
    }

    setIsResetting(true);
    try {
      const { error: resetErr } = await resetPassword(resetEmail.trim());

      if (resetErr) {
        const msg = resetErr.message.toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
          setResetError('Falha de conexão. Verifique sua internet e tente novamente.');
        } else if (msg.includes('not found') || msg.includes('user not found')) {
          setResetError('Email não cadastrado no sistema.');
        } else {
          setResetError('Não foi possível enviar o email de recuperação. Tente novamente.');
        }
        setIsResetting(false);
        return;
      }

      setResetSuccess(true);
      setIsResetting(false);
    } catch (err) {
      setIsResetting(false);
      setResetError('Ocorreu um erro inesperado. Tente novamente.');
    }
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetEmail('');
    setResetError('');
    setResetFieldError('');
    setResetSuccess(false);
  };

  return (
    <div className="min-h-screen bg-np-wood-50 flex items-center justify-center px-4">
      {/* Modal de Recuperação de Senha */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeResetModal}></div>
          <div className="relative bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8 w-full max-w-sm mx-4 z-10">
            {!resetSuccess ? (
              <>
                <h3 className="font-display text-xl text-np-purple-900 mb-2 text-center">
                  Recuperar Senha
                </h3>
                <p className="text-sm text-np-purple-600 mb-5 text-center">
                  Digite seu email para receber o link de recuperação.
                </p>

                {resetError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
                    <i className="ri-error-warning-line mr-1"></i>
                    {resetError}
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-np-purple-800 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      name="reset-email"
                      value={resetEmail}
                      onChange={(e) => {
                        setResetEmail(e.target.value);
                        if (resetFieldError) setResetFieldError('');
                      }}
                      placeholder="seu@email.com"
                      disabled={isResetting}
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                        resetFieldError ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                      }`}
                      autoFocus
                    />
                    {resetFieldError && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>
                        {resetFieldError}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      disabled={isResetting}
                      className="flex-1 bg-white border border-np-wood-300 hover:border-np-purple-400 text-np-purple-700 font-medium py-3 px-4 rounded-lg text-sm transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isResetting}
                      className="flex-1 bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 text-white font-medium py-3 px-4 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {isResetting ? (
                        <i className="ri-loader-4-line animate-spin"></i>
                      ) : (
                        <>
                          <i className="ri-mail-send-line mr-2"></i>
                          Enviar
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-mail-check-line text-3xl text-np-green-600"></i>
                </div>
                <h3 className="font-display text-xl text-np-purple-900 mb-2">
                  Email enviado!
                </h3>
                <p className="text-sm text-np-purple-600 mb-6">
                  Enviamos um link de recuperação para <strong>{resetEmail}</strong>. Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
                </p>
                <button
                  onClick={closeResetModal}
                  className="bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-3 px-6 rounded-lg transition-colors text-sm whitespace-nowrap"
                >
                  Voltar ao Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <span className="font-['Pacifico'] text-4xl text-np-purple-800">NP</span>
            <span className="font-display text-np-purple-800 text-xl ml-2">Empório</span>
          </Link>
          <p className="text-np-purple-600 mt-2 text-sm">
            Entre na sua conta e acumule pontos
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
          <h1 className="font-display text-2xl text-np-purple-900 mb-6 text-center">
            Login
          </h1>

          {successMessage && (
            <div className="bg-np-green-50 border border-np-green-200 text-np-green-700 rounded-lg p-3 mb-4 text-sm">
              <i className="ri-check-line mr-1"></i>
              {successMessage}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
              <i className="ri-error-warning-line mr-1"></i>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-np-purple-800 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors?.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="seu@email.com"
                disabled={isLoading}
                className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                  fieldErrors?.email ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                }`}
              />
              {fieldErrors?.email && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <i className="ri-error-warning-line"></i>
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-np-purple-800 mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors?.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="Sua senha"
                  disabled={isLoading}
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm pr-10 disabled:opacity-50 ${
                    fieldErrors?.password ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-np-purple-400 hover:text-np-purple-600 disabled:opacity-50 cursor-pointer"
                >
                  <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
                </button>
              </div>
              {fieldErrors?.password && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <i className="ri-error-warning-line"></i>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end text-sm">
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="text-np-purple-600 hover:text-np-purple-800 cursor-pointer whitespace-nowrap"
              >
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {isLoading ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <>
                  <i className="ri-login-box-line mr-2"></i>
                  Entrar
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-np-purple-600">
              Não tem conta?{' '}
              <Link to="/cadastro" className="text-np-purple-800 font-medium hover:underline">
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-np-purple-400 mt-6">
          Ao entrar, você participa automaticamente do programa de fidelidade NP Lovers
        </p>
      </div>
    </div>
  );
}