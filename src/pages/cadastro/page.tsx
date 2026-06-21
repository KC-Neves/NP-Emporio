import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

export default function CadastroPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (!name.trim()) {
      errors.name = 'O nome é obrigatório';
    } else if (name.trim().length < 3) {
      errors.name = 'O nome deve ter pelo menos 3 caracteres';
    }

    if (!email.trim()) {
      errors.email = 'O email é obrigatório';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Digite um email válido';
    }

    if (phone.trim() && !PHONE_REGEX.test(phone.trim().replace(/\s/g, ''))) {
      errors.phone = 'Digite um telefone válido (ex: 71 99999-9999)';
    }

    if (!password) {
      errors.password = 'A senha é obrigatória';
    } else if (password.length < 6) {
      errors.password = 'A senha deve ter pelo menos 6 caracteres';
    } else if (password.length > 64) {
      errors.password = 'A senha deve ter no máximo 64 caracteres';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'As senhas não coincidem';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSuccessMessage('');
    if (!validate()) return;

    setIsLoading(true);

    const timeout = setTimeout(() => {
      console.error('[CADASTRO] Timeout de 5s atingido');
      setIsLoading(false);
      setError('A conexão está lenta. Tente novamente.');
    }, 5000);

    try {
      console.log('[CADASTRO] submit start');
      const { data, error: signUpError } = await signUp(email.trim(), password, name.trim(), phone.trim() || undefined);
      clearTimeout(timeout);

      if (signUpError) {
        setIsLoading(false);
        const msg = signUpError.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already registered')) {
          setError('Este email já está cadastrado. Faça login ou use outro email.');
        } else if (msg.includes('password')) {
          setError('Senha muito curta. Use pelo menos 6 caracteres.');
        } else if (msg.includes('email')) {
          setError('Verifique se o email está correto.');
        } else if (msg.includes('network') || msg.includes('fetch')) {
          setError('Falha de conexão. Verifique sua internet e tente novamente.');
        } else {
          setError('Não foi possível concluir o cadastro. Tente novamente.');
        }
        console.error('[CADASTRO] signUp error:', signUpError.message);
        return;
      }

      if (data?.session?.user) {
        console.log('[CADASTRO] signUp com session — email confirmation desabilitado. Redirecionando para minha-conta.');
        setSuccess(true);
        setSuccessMessage('Conta criada com sucesso! Você já está logado.');
        setTimeout(() => {
          navigate('/minha-conta');
        }, 1500);
      } else if (data?.user) {
        console.log('[CADASTRO] signUp sem session — email confirmation habilitado. Redirecionando para verificar-email.');
        setSuccess(true);
        setSuccessMessage('Conta criada com sucesso! Verifique seu e-mail para confirmar sua conta.');
        setTimeout(() => {
          navigate(`/verificar-email?email=${encodeURIComponent(email.trim())}`);
        }, 1500);
      } else {
        setIsLoading(false);
        setError('Não foi possível concluir o cadastro. Tente novamente.');
      }
    } catch (err) {
      clearTimeout(timeout);
      setIsLoading(false);
      console.error('[CADASTRO] submit exception:', err);
      setError('Ocorreu um erro inesperado. Tente novamente.');
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
          <p className="text-np-purple-600 mt-2 text-sm">
            Crie sua conta e comece a acumular pontos!
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
          {!success ? (
            <>
              <h1 className="font-display text-2xl text-np-purple-900 mb-6 text-center">
                Cadastro
              </h1>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
                  <i className="ri-error-warning-line mr-1"></i>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Seu nome completo"
                    disabled={isLoading}
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                      fieldErrors.name ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                    }`}
                  />
                  {fieldErrors.name && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="seu@email.com"
                    disabled={isLoading}
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                      fieldErrors.email ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                    }`}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="(71) 99999-9999"
                    disabled={isLoading}
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                      fieldErrors.phone ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                    }`}
                  />
                  {fieldErrors.phone && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Senha *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      placeholder="Mínimo 6 caracteres"
                      disabled={isLoading}
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm pr-10 disabled:opacity-50 ${
                        fieldErrors.password ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-np-purple-400 hover:text-np-purple-600 disabled:opacity-50"
                    >
                      <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Confirmar Senha *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }}
                    placeholder="Repita sua senha"
                    disabled={isLoading}
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:opacity-50 ${
                      fieldErrors.confirmPassword ? 'border-red-400 focus:ring-red-500' : 'border-np-wood-300 focus:ring-np-purple-500'
                    }`}
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    required
                    disabled={isLoading}
                    className="mt-1 rounded border-np-wood-300 text-np-purple-600 focus:ring-np-purple-500 disabled:opacity-50"
                  />
                  <span className="text-xs text-np-purple-600">
                    Concordo com os termos de uso e política de privacidade do programa NP Lovers
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isLoading ? (
                    <i className="ri-loader-4-line animate-spin"></i>
                  ) : (
                    <>
                      <i className="ri-user-add-line mr-2"></i>
                      Criar Conta
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-check-double-line text-3xl text-np-green-600"></i>
              </div>
              <h2 className="font-display text-xl text-np-purple-900 mb-2">
                {successMessage}
              </h2>
              <div className="animate-pulse text-np-purple-400 text-sm">
                <i className="ri-arrow-right-line mr-1"></i>
                Redirecionando...
              </div>
            </div>
          )}

          {!success && (
            <div className="mt-6 text-center">
              <p className="text-sm text-np-purple-600">
                Já tem conta?{' '}
                <Link to="/login" className="text-np-purple-800 font-medium hover:underline">
                  Faça login
                </Link>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-np-purple-400 mt-6">
          Programa NP Lovers: a cada R$ 1 gasto você acumula 1 ponto. Troque por recompensas exclusivas!
        </p>
      </div>
    </div>
  );
}