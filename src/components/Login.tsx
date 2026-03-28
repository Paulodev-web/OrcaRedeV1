"use client";
import { useState, FormEvent } from 'react';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { ON_ENGENHARIA_LOGO_SRC } from '@/lib/branding';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Lado esquerdo - Visual/Ilustração */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 overflow-hidden">
        {/* Elementos decorativos de fundo */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-32 h-32 bg-blue-400 rounded-full opacity-20 blur-xl"></div>
          <div className="absolute bottom-20 right-20 w-48 h-48 bg-blue-300 rounded-full opacity-15 blur-2xl"></div>
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-white rounded-full opacity-5 blur-3xl"></div>
        </div>

        {/* Conteúdo principal */}
        <div className="relative z-10 flex flex-col justify-center items-center text-white p-12 w-full">
          <img
            src={ON_ENGENHARIA_LOGO_SRC}
            alt="ON Engenharia"
            className="h-24 sm:h-28 w-auto object-contain drop-shadow-lg mb-10"
          />
          {/* Ilustração/Visual principal */}
          <div className="mb-12 relative">
            {/* Tela principal */}
            <div className="w-64 h-40 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm border border-white border-opacity-30 shadow-2xl transform rotate-3 mb-8">
              <div className="p-4 h-full flex flex-col justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="w-full h-2 bg-white bg-opacity-40 rounded"></div>
                  <div className="w-3/4 h-2 bg-white bg-opacity-30 rounded"></div>
                  <div className="w-1/2 h-2 bg-white bg-opacity-20 rounded"></div>
                </div>
                <div className="flex justify-center">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <Lock className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </div>

            {/* Tela secundária */}
            <div className="absolute -bottom-4 -left-8 w-48 h-32 bg-white bg-opacity-15 rounded-lg backdrop-blur-sm border border-white border-opacity-20 shadow-xl transform -rotate-6">
              <div className="p-3 h-full flex flex-col justify-between">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-white bg-opacity-50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white bg-opacity-30 rounded-full"></div>
                  <div className="w-2 h-2 bg-white bg-opacity-30 rounded-full"></div>
                </div>
                <div className="space-y-1">
                  <div className="w-full h-1 bg-white bg-opacity-30 rounded"></div>
                  <div className="w-2/3 h-1 bg-white bg-opacity-20 rounded"></div>
                </div>
              </div>
            </div>

            {/* Figura do usuário */}
            <div className="absolute -bottom-12 right-0 w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white border-opacity-30">
              <User className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">ON Engenharia</h1>
            <p className="text-xl text-blue-100 mb-2">Sistema de Orçamentos</p>
            <p className="text-blue-200 max-w-md">
              Gerencie seus projetos elétricos com eficiência e segurança
            </p>
          </div>
        </div>
      </div>

      {/* Lado direito - Formulário de Login */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-gray-50">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Header do login no mobile */}
          <div className="lg:hidden text-center mb-8">
            <img
              src={ON_ENGENHARIA_LOGO_SRC}
              alt="ON Engenharia"
              className="h-20 w-auto object-contain mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ON Engenharia</h1>
            <p className="text-gray-600">Sistema de Orçamentos</p>
          </div>

          <div className="mb-8">
            <div className="hidden lg:flex justify-center mb-6">
              <img
                src={ON_ENGENHARIA_LOGO_SRC}
                alt=""
                className="h-16 w-auto object-contain"
                aria-hidden
              />
            </div>
            <h2 className="text-center text-2xl font-bold text-gray-900 mb-2">
              Bem-vindo de volta
            </h2>
            <p className="text-center text-sm text-gray-600">
              Entre com suas credenciais para acessar o sistema
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Campo Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg text-sm font-medium text-white transition-all duration-200 ${
                  loading
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 hover:shadow-lg'
                }`}
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Entrando...</span>
                  </div>
                ) : (
                  'Entrar'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="text-center text-sm text-gray-600">
              © 2024 ON Engenharia. Todos os direitos reservados.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}