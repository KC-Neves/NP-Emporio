import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function RedefinirSenhaPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<'processing' | 'ready' | 'error' | 'success'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>();

  useEffect(() => {
    const processHash = async () => {
      const hash = window.location.hash;

      if (!hash || hash === '#') {
        console.log('[REDEFINIR] Sem hash na URL, exibindo erro');
        setStatus('error');
        setErrorMessage('Link inválido ou expirado. Solicite uma nova recuperação de senha.');
        return;
      }

      const params = new URLSearchParams(hash.replace('#', ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      console.log('[REDEFINIR] Params:', { type, hasAccessToken: !!accessToken });

      if (type !== 'recovery') {
        setStatus('error');
        setErrorMessage('Link de recuperação inválido. Solicite uma nova recuperação de senha.');
        return;
      }

      if (!accessToken) {
        setStatus('error');
        setErrorMessage('Token de acesso não encontrado. O link pode estar incompleto. Solicite uma nova recuperação de senha.');
        return;
      }

      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (error) {
          console.error('[REDEFINIR] setSession error:', error.message);

          if (error.message.toLowerCase().includes('expired') || error.message.includes('JWT')) {
            setStatus('error');
            setErrorMessage('O link de recuperação expirou. Solicite uma nova recuperação de senha.');
          } else {
            setStatus('error');
            setErrorMessage('Link inválido. Solicite uma nova recuperação de senha.');
          }
          return;
        }

        console.log('[REDEFINIR] Sessão definida com sucesso:', data.session ? 'sim' : 'não');
        setStatus('ready');
      } catch (err) {
        console.error('[REDEFINIR] Exceção:', err);
        setStatus('error');
        setErrorMessage('Ocorreu um erro ao processar o link de recuperação. Tente novamente.');
      }
    };

    processHash();
  }, []);

  const validatePassword = (pw: string): string | null => {
    if (!pw) return 'A nova senha é obrigatória';
    if (pw.length < 6) return 'A senha deve ter pelo menos 6 caracteres';
    if (pw.length > 128) return 'A senha deve ter no máximo 128 caracteres';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: { password?: string; confirm?: string } = {};

    const passwordError = validatePassword(newPassword);
    if (passwordError) errors.password = passwordError;

    if (!confirmPassword) {
      errors.confirm = 'Confirme sua nova senha';
    } else if (newPassword !== confirmPassword) {
      errors.confirm = 'As senhas não coincidem';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('[REDEFINIR] updateUser error:', updateError.message);

        if (updateError.message.toLowerCase().includes('same password') || updateError.message.includes('different')) {
          setFieldErrors({ password: 'A nova senha deve ser diferente da atual' });
        } else if (updateError.message.toLowerCase().includes('expired')) {
          setStatus('error');
          setErrorMessage('Sua sessão expirou. Solicite uma nova recuperação de senha.');
        } else {
          setFieldErrors({ password: 'Não foi possível redefinir a senha. Tente novamente.' });
        }
        setIsSubmitting(false);
        return;
      }

      setStatus('success');
      setIsSubmitting(false);

      // Deslogar após redefinir senha para segurança
      await supabase.auth.signOut();

      setTimeout(() => navigate('/login?reset=true'), 2000);
    } catch (err) {
      console.error('[REDEFINIR] Exceção:', err);
      setIsSubmitting(false);
      setFieldErrors({ password: 'Erro inesperado. Tente novamente.' });
    }
  };

  return (
    <div className="min-h-screen bg-np-wood-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {status === 'processing' && (
          <div className="text-center">
            <i className="ri-loader-4-line animate-spin text-4xl text-np-purple-600 block mb-4"></i>
            <p className="text-np-purple-800 font-medium">Verificando link de recuperação...</p>
            <p className="text-np-purple-500 text-sm mt-2">Aguarde um momento</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-error-warning-line text-3xl text-red-600"></i>
            </div>
            <h1 className="font-display text-xl text-np-purple-900 mb-2">Link inválido</h1>
            <p className="text-sm text-np-purple-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => navigate('/login')}
              className="bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-3 px-6 rounded-lg transition-colors text-sm whitespace-nowrap cursor-pointer"
            >
              <i className="ri-login-box-line mr-2"></i>
              Ir para Login
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
            <h1 className="font-display text-2xl text-np-purple-900 mb-2 text-center">
              Redefinir Senha
            </h1>
            <p className="text-sm text-np-purple-600 mb-6 text-center">
              Escolha uma nova senha para sua conta.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-2">
                  Nova Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (fieldErrors?.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Mínimo 6 caracteres"
                    disabled={isSubmitting}
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm pr-10 disabled:opacity-50 ${
                      fieldErrors?.password ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                    }`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
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

              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-2">
                  Confirmar Nova Senha
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors?.confirm) setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                  }}
                  placeholder="Repita a nova senha"
                  disabled={isSubmitting}
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                    fieldErrors?.confirm ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                  }`}
                />
                {fieldErrors?.confirm && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <i className="ri-error-warning-line"></i>
                    {fieldErrors.confirm}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {isSubmitting ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <>
                    <i className="ri-lock-line mr-2"></i>
                    Redefinir Senha
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-np-purple-600 hover:text-np-purple-800 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-left-line mr-1"></i>
                Voltar ao Login
              </button>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8 text-center">
            <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-check-line text-3xl text-np-green-600"></i>
            </div>
            <h1 className="font-display text-xl text-np-purple-900 mb-2">Senha Redefinida!</h1>
            <p className="text-sm text-np-purple-600 mb-6">
              Sua senha foi alterada com sucesso. Você será redirecionado para o login.
            </p>
            <button
              onClick={() => navigate('/login?reset=true')}
              className="bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-3 px-6 rounded-lg transition-colors text-sm whitespace-nowrap cursor-pointer"
            >
              <i className="ri-login-box-line mr-2"></i>
              Ir para Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}