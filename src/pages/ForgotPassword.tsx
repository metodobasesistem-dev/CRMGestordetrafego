import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Brain, Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;
      
      setSuccess(true);
    } catch (err: any) {
      console.error('Reset request error:', err);
      setError(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="text-center">
          <div className="inline-flex p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20 mb-4">
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Recuperar Senha
          </h2>
          <p className="mt-2 text-slate-500 dark:text-slate-400 font-medium">
            {success 
              ? 'Verifique seu e-mail para continuar' 
              : 'Enviaremos um link de recuperação para o seu e-mail'}
          </p>
        </div>

        {success ? (
          <div className="mt-8 space-y-6">
            <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-emerald-800 dark:text-emerald-400 font-medium">
                Link de recuperação enviado com sucesso para <strong>{email}</strong>.
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-2">
                Não esqueça de verificar a caixa de spam.
              </p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full flex justify-center items-center py-4 px-4 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-black text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              VOLTAR PARA O LOGIN
            </button>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleResetRequest}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-3 h-3" />
                  E-mail de cadastro
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 text-sm font-bold text-center">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-xl shadow-indigo-500/20 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>ENVIANDO...</span>
                  </div>
                ) : (
                  'SOLICITAR RECUPERAÇÃO'
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl text-sm font-black text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                VOLTAR PARA O LOGIN
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
