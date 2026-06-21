import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function VerificarEmailPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');
  const { resendConfirmation } = useAuth();

  const handleResend = async () => {
    if (!email) {
      setResendError('Não foi possível identificar seu email. Volte ao cadastro.');
      return;
    }
    setResendError('');
    setResendSuccess(false);
    setIsResending(true);

    const timeout = setTimeout(() => {
      setIsResending(false);
      setResendError('A conexão está lenta. Tente novamente em instantes.');
    }, 5000);

    try {
      const { error } = await resendConfirmation(email);
      clearTimeout(timeout);
      setIsResending(false);
      if (error) {
        setResendError(
          error.message.includes('rate limit')
            ? 'Aguarde alguns minutos antes de reenviar.'
            : 'Não foi possível reenviar. Tente novamente mais tarde.'
        );
        return;
      }
      setResendSuccess(true);
    } catch {
      clearTimeout(timeout);
      setIsResending(false);
      setResendError('Ocorreu um erro inesperado. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-np-wood-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <span className="font-['Pacifico'] text-4xl text-np-purple-800">NP</span>
            <span className="font-display text-np-purple-800 text-xl ml-2">Empório</span>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8 text-center">
          <div className="w-20 h-20 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <i className="ri-mail-send-line text-4xl text-np-green-600"></i>
          </div>

          <h1 className="font-display text-2xl text-np-purple-900 mb-3">
            Verifique seu e-mail
          </h1>

          <p className="text-np-purple-600 text-sm mb-6 leading-relaxed">
            Sua conta foi criada com sucesso! Enviamos um link de confirmação para
            <strong className="text-np-purple-800 block mt-1">{email || 'seu e-mail'}</strong>
          </p>

          <div className="bg-np-purple-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-np-purple-700 text-sm font-medium mb-2">
              <i className="ri-information-line mr-1"></i>
              O que fazer agora:
            </p>
            <ul className="text-np-purple-600 text-sm space-y-1">
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-np-green-500 mt-0.5"></i>
                Abra seu e-mail e procure por "NP Empório"
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-np-green-500 mt-0.5"></i>
                Clique no link de confirmação
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-np-green-500 mt-0.5"></i>
                Volte aqui e faça login
              </li>
            </ul>
          </div>

          {resendSuccess && (
            <div className="bg-np-green-50 border border-np-green-200 text-np-green-700 rounded-lg p-3 mb-4 text-sm">
              <i className="ri-check-line mr-1"></i>
              E-mail de confirmação reenviado com sucesso!
            </div>
          )}

          {resendError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
              <i className="ri-error-warning-line mr-1"></i>
              {resendError}
            </div>
          )}

          <div className="space-y-3">
            <Link
              to="/login"
              className="block w-full bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
            >
              <i className="ri-login-box-line mr-2"></i>
              Ir para Login
            </Link>

            <button
              onClick={handleResend}
              disabled={isResending || !email}
              className="block w-full bg-white border border-np-wood-300 hover:border-np-purple-400 text-np-purple-700 font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isResending ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <>
                  <i className="ri-refresh-line mr-2"></i>
                  Reenviar confirmação
                </>
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-np-purple-600">
              Não recebeu? Verifique a pasta de spam ou lixeira.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-np-purple-400 mt-6">
          Programa NP Lovers: a cada R$ 1 gasto você acumula 1 ponto.
        </p>
      </div>
    </div>
  );
}