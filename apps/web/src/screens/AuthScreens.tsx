import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { registerSchema } from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError } from '../api/http';
import { Icon } from '../components/icons';
import { enterWithAuth } from '../lib/session';
import { useAuthStore } from '../stores/auth';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-embers" aria-hidden />
      <section className="auth-card panel ornate">
        <div className="auth-crest">
          <Icon name="keep" size={44} color="#E2572B" />
        </div>
        <h1 className="title-xl">Cinzas de Vharos</h1>
        <p className="muted center italic">O fogo é a lei.</p>
        <h2 className="auth-title">{title}</h2>
        <p className="muted small center">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

export function LoginScreen() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to="/cidade" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return setError('Preencha usuário e senha.');
    setBusy(true);
    setError(null);
    try {
      await enterWithAuth(await api.login({ username: username.trim(), password }));
      navigate('/cidade', { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Entrar" subtitle="Volte para a sua Casa e mantenha a chama acesa.">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Usuário
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn big" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="center small">
        Ainda não jurou o Braseiro? <Link to="/cadastro">Fundar uma Casa</Link>
      </p>
    </AuthShell>
  );
}

const FIELD_ERRORS: Record<string, string> = {
  username: 'Usuário: 3 a 20 caracteres (letras, números ou _).',
  password: 'Senha: 8 a 72 caracteres.',
  cityName: 'Nome da cidade: 3 a 24 caracteres.',
};

export function RegisterScreen() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', cityName: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to="/cidade" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Mesmo schema zod do back.
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
      setErrors(fields.map((f) => FIELD_ERRORS[f] ?? 'Dados inválidos.'));
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      await enterWithAuth(await api.register(parsed.data));
      navigate('/cidade', { replace: true });
    } catch (err) {
      setErrors([describeError(err)]);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthShell title="Fundar uma Casa" subtitle="Sua cidade nasce nos Vales do Braseiro, com escudo de novato por 24 h.">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Usuário
          <input autoFocus autoComplete="username" value={form.username} onChange={set('username')} maxLength={20} />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} maxLength={72} />
        </label>
        <label>
          Nome da cidade
          <input value={form.cityName} onChange={set('cityName')} maxLength={24} placeholder="Forte de Brasa" />
        </label>
        {errors.map((er) => (
          <p key={er} className="form-error">
            {er}
          </p>
        ))}
        <button className="btn big" disabled={busy}>
          {busy ? 'Acendendo o Braseiro…' : 'Fundar'}
        </button>
      </form>
      <p className="center small">
        Já tem uma Casa? <Link to="/entrar">Entrar</Link>
      </p>
    </AuthShell>
  );
}
