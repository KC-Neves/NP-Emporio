import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processando confirmação...');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const process = async () => {
      if (error) {
        console.error('[AUTH_CALLBACK] Erro na URL:', error, errorDescription);
        setStatus('error');
        setMessage(errorDescription || 'Ocorreu um problema ao confirmar seu e-mail.');
        return;
      }

      if (code) {
        console.log('[AUTH_CALLBACK] Trocando code por sessão');
        try {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('[AUTH_CALLBACK] exchangeCodeForSession error:', exchangeError);
            setStatus('error');
            setMessage('Não foi possível confirmar sua sessão. Tente fazer login manualmente.');
            return;
          }
          console.log('[AUTH_CALLBACK] Sessão trocada com sucesso:', data.session ? 'tem sessão' : 'sem sessão');
          setStatus('success');
          setMessage('E-mail confirmado com sucesso! Redirecionando...');
          setTimeout(() => navigate('/login?confirmed=true'), 1500);
        } catch (err) {
          console.error('[AUTH_CALLBACK] Exceção:', err);
          setStatus('error');
          setMessage('Erro inesperado. Tente fazer login manualmente.');
        }
      } else {
        // Sem code — redirecionamento antigo ou direto
        console.log('[AUTH_CALLBACK] Sem code na URL, redirecionando para login');
        setStatus('success');
        setMessage('Redirecionando...');
        setTimeout(() => navigate('/login?confirmed=true'), 500);
      }
    };

    process();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-np-wood-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        {status === 'processing' && (
          <>
            <i className="ri-loader-4-line animate-spin text-4xl text-np-purple-600 block mb-4"></i>
            <p className="text-np-purple-800 font-medium">{message}</p>
            <p className="text-np-purple-500 text-sm mt-2">Aguarde um momento...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-check-line text-3xl text-np-green-600"></i>
            </div>
            <p className="text-np-purple-800 font-medium">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-error-warning-line text-3xl text-red-600"></i>
            </div>
            <p className="text-red-700 mb-4">{message}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/login')}
                className="bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                Ir para Login
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-white border border-np-wood-300 hover:border-np-purple-400 text-np-purple-700 font-medium py-2 px-4 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1"></i>
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}