import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, Bell, BriefcaseBusiness,
  Check, ChevronDown, CircleHelp, Clock3, Command, Database, Ellipsis, ExternalLink, FileText, LayoutDashboard,
  LifeBuoy, LoaderCircle, LogOut, Menu, MessageSquareText, Package, Pencil, Plus,
  Search, Settings, ShieldCheck, Sparkles, Trash2, TrendingUp, Users, X,
} from 'lucide-react';

type User = { id: number; name: string; email: string; role: 'admin' | 'agent'; active: boolean; created_at: string };
type Service = { id: number; name: string; description: string; status: 'operational' | 'maintenance' | 'degraded'; updated_at: string };
type RequestStatus = 'new' | 'in_progress' | 'completed' | 'cancelled';
type ServiceRequest = {
  id: number; code: string; customer_name: string; customer_email: string;
  service_id: number; service_name: string; description: string;
  status: RequestStatus; priority: 'low' | 'normal' | 'high'; created_at: string; updated_at: string;
};
type Dashboard = {
  total_requests: number; open_requests: number; active_users: number;
  operational_services: number; total_services: number; completed_this_month: number;
  requests_by_status: Record<RequestStatus, number>;
  weekly_requests: { date: string; count: number }[];
  services: Service[]; recent_requests: ServiceRequest[];
};
type PageId = 'overview' | 'analytics' | 'requests' | 'users' | 'services' | 'settings';

const pageMeta: Record<PageId, { title: string; eyebrow: string; description: string }> = {
  overview: { title: 'Visão geral', eyebrow: 'PAINEL DE CONTROLE', description: 'Um olhar claro sobre tudo o que acontece.' },
  analytics: { title: 'Análises', eyebrow: 'DADOS & DESEMPENHO', description: 'Entenda tendências e acompanhe resultados.' },
  requests: { title: 'Solicitações', eyebrow: 'CENTRAL DE ATENDIMENTO', description: 'Acompanhe e gerencie cada solicitação.' },
  users: { title: 'Usuários', eyebrow: 'SUA EQUIPE', description: 'Gerencie quem faz parte do seu espaço.' },
  services: { title: 'Serviços', eyebrow: 'OPERAÇÕES', description: 'Acompanhe a saúde dos serviços.' },
  settings: { title: 'Configurações', eyebrow: 'PREFERÊNCIAS', description: 'Gerencie sua conta e o espaço de trabalho.' },
};
const requestStatusLabels: Record<RequestStatus, string> = { new: 'Nova', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
const serviceStatusLabels: Record<Service['status'], string> = { operational: 'Operacional', maintenance: 'Manutenção', degraded: 'Instabilidade' };
const requestStatusValues = Object.keys(requestStatusLabels) as RequestStatus[];
const serviceStatusValues = Object.keys(serviceStatusLabels) as Service['status'][];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, credentials: 'include' }); }
  catch { throw new Error('Não foi possível conectar à API. Verifique se o servidor está em execução.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function dateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro. Tente novamente.';
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try { onLogin(await api<User>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })); }
    catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  }
  return (
    <main className="login-page">
      <div className="login-decoration"><span /><span /><span /></div>
      <section className="login-card">
        <a className="brand login-brand" href="#"><span className="brand-mark"><Command size={20} /></span><span>Symphony<span className="brand-dot">.</span></span></a>
        <div className="login-kicker"><ShieldCheck size={14} /> ESPAÇO DE TRABALHO</div>
        <h1>Bom ter você<br />por <em>aqui.</em></h1>
        <p className="login-copy">Entre para acessar seu painel administrativo.</p>
        <form onSubmit={submit} className="login-form">
          <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label>
          <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" /></label>
          {error && <div role="alert" className="form-error"><AlertTriangle size={15} />{error}</div>}
          <button type="submit" className="primary-button login-submit" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}{loading ? 'Entrando...' : 'Entrar no painel'} <ArrowRight size={16} /></button>
        </form>
        <div className="login-note"><CircleHelp size={15} /> A conta inicial e as instruções estão no README do projeto.</div>
      </section>
      <footer className="login-footer">SYMPHONY ADMIN <span>·</span> UM ESPAÇO PARA FAZER ACONTECER</footer>
    </main>
  );
}

function LineChart({ data }: { data: Dashboard['weekly_requests'] }) {
  const width = 560; const height = 190; const left = 35; const bottom = 26; const top = 14; const right = 10;
  const max = Math.max(4, ...data.map((item) => item.count));
  const points = data.map((item, index) => ({
    x: left + (data.length <= 1 ? 0 : (index * (width - left - right)) / (data.length - 1)),
    y: top + ((height - bottom - top) * (max - item.count)) / max,
    item,
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${points[points.length - 1]?.x ?? width} ${height - bottom} L ${points[0]?.x ?? left} ${height - bottom} Z`;
  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Solicitações recebidas nos últimos sete dias">
      <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6559db" stopOpacity=".22" /><stop offset="100%" stopColor="#6559db" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map((step) => { const y = top + (step * (height - bottom - top)) / 3; return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#eef0f6" strokeDasharray="3 5" /><text x="0" y={y + 3} className="chart-label">{Math.round(max - (step * max) / 3)}</text></g>; })}
      {points.length > 0 && <><path d={area} fill="url(#chartFill)" /><path d={line} fill="none" stroke="#6559db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></>}
      {points.map(({ x, y, item }) => <g key={item.date}><circle cx={x} cy={y} r="4" fill="white" stroke="#6559db" strokeWidth="2" /><text x={x} y={height - 5} textAnchor="middle" className="chart-label">{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</text></g>)}
    </svg>
  );
}

function StatusChart({ counts }: { counts: Dashboard['requests_by_status'] }) {
  const values = requestStatusValues.map((status) => ({ status, value: counts[status] || 0 }));
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(1, ...values.map((item) => item.value));
  return <div className="status-chart">{values.map(({ status, value }) => <div className="status-bar-row" key={status}><span>{requestStatusLabels[status]}</span><div className="status-bar-track"><span style={{ width: `${(value / max) * 100}%` }} /></div><strong>{value}</strong></div>)}<div className="chart-total"><span>Total de solicitações</span><strong>{total}</strong></div></div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><span className="modal-kicker">SYMPHONY · ADMIN</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div>{children}</section></div>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [page, setPage] = useState<PageId>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | RequestStatus>('all');
  const [modal, setModal] = useState<'request' | 'user' | 'service' | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [nextDashboard, nextRequests, nextServices] = await Promise.all([
        api<Dashboard>('/api/dashboard'), api<ServiceRequest[]>('/api/requests'), api<Service[]>('/api/services'),
      ]);
      setDashboard(nextDashboard); setRequests(nextRequests); setServices(nextServices);
      if (user.role === 'admin') setUsers(await api<User[]>('/api/users'));
    } catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    api<User>('/api/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setCheckingAuth(false));
  }, []);
  useEffect(() => { if (user) void refresh(); }, [user, refresh]);

  async function logout() {
    try { await api<void>('/api/auth/logout', { method: 'POST' }); setUser(null); setPage('overview'); setProfileOpen(false); }
    catch (err) { setError(errorText(err)); }
  }

  async function updateRequestStatus(item: ServiceRequest, statusValue: RequestStatus) {
    setError('');
    try {
      const updated = await api<ServiceRequest>(`/api/requests/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: statusValue }) });
      setRequests((previous) => previous.map((request) => request.id === item.id ? updated : request));
      setNotice(`Solicitação ${item.code} atualizada.`); await refresh();
    } catch (err) { setError(errorText(err)); }
  }

  async function updateServiceStatus(service: Service, statusValue: Service['status']) {
    setError('');
    try {
      const updated = await api<Service>(`/api/services/${service.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: statusValue }) });
      setServices((previous) => previous.map((item) => item.id === service.id ? updated : item));
      setNotice(`${service.name}: ${serviceStatusLabels[statusValue].toLowerCase()}.`); await refresh();
    } catch (err) { setError(errorText(err)); }
  }

  async function deleteRequest(item: ServiceRequest) {
    if (!window.confirm(`Excluir a solicitação ${item.code}? Esta ação não pode ser desfeita.`)) return;
    setError('');
    try { await api<void>(`/api/requests/${item.id}`, { method: 'DELETE' }); setRequests((previous) => previous.filter((request) => request.id !== item.id)); setNotice('Solicitação excluída.'); await refresh(); }
    catch (err) { setError(errorText(err)); }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    try {
      await api<ServiceRequest>('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_name: data.customer_name, customer_email: data.customer_email, service_id: Number(data.service_id), description: data.description, priority: data.priority }) });
      setModal(null); setNotice('Solicitação criada.'); await refresh();
    } catch (err) { setError(errorText(err)); }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    const payload: Record<string, unknown> = { name: data.name, email: data.email, role: data.role, active: data.active === 'true' };
    if (data.password) payload.password = data.password;
    if (!editingUser && !data.password) { setError('Defina uma senha inicial com pelo menos 10 caracteres.'); return; }
    setError('');
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      await api<User>(url, { method: editingUser ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setModal(null); setEditingUser(null); setNotice(editingUser ? 'Usuário atualizado.' : 'Usuário cadastrado.'); await refresh();
    } catch (err) { setError(errorText(err)); }
  }

  async function deleteUser(target: User) {
    if (!window.confirm(`Excluir o acesso de ${target.name}?`)) return;
    setError('');
    try { await api<void>(`/api/users/${target.id}`, { method: 'DELETE' }); setUsers((previous) => previous.filter((item) => item.id !== target.id)); setNotice('Acesso removido.'); await refresh(); }
    catch (err) { setError(errorText(err)); }
  }

  async function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    try {
      await api<Service>('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, description: data.description, status: data.status }) });
      setModal(null); setNotice('Serviço cadastrado.'); await refresh();
    } catch (err) { setError(errorText(err)); }
  }

  const filteredRequests = useMemo(() => requests.filter((item) => {
    const matchesStatus = requestFilter === 'all' || item.status === requestFilter;
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const matchesSearch = !query || [item.code, item.customer_name, item.customer_email, item.service_name].some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
    return matchesStatus && matchesSearch;
  }), [requests, requestFilter, search]);
  const meta = pageMeta[page];

  if (checkingAuth) return <div className="app-loading"><LoaderCircle size={25} className="spin" /><span>Preparando seu espaço...</span></div>;
  if (!user) return <Login onLogin={(nextUser) => { setUser(nextUser); setError(''); }} />;

  return (
    <div className="admin-shell">
      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fechar navegação" />}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => { setPage('overview'); setMenuOpen(false); }}><span className="brand-mark"><Command size={20} /></span><span>Symphony</span></button>
        <div className="nav-label">MENU</div>
        <nav className="side-nav" aria-label="Menu principal">
          <button className={page === 'overview' ? 'nav-active' : ''} onClick={() => { setPage('overview'); setMenuOpen(false); }}><LayoutDashboard size={17} /> Visão geral {page === 'overview' && <span className="nav-indicator" />}</button>
          <button className={page === 'analytics' ? 'nav-active' : ''} onClick={() => { setPage('analytics'); setMenuOpen(false); }}><BarChart3 size={17} /> Análises</button>
          <button className={page === 'requests' ? 'nav-active' : ''} onClick={() => { setPage('requests'); setMenuOpen(false); }}><MessageSquareText size={17} /> Solicitações <span className="nav-count">{dashboard?.open_requests ?? 0}</span></button>
          {user.role === 'admin' && <button className={page === 'users' ? 'nav-active' : ''} onClick={() => { setPage('users'); setMenuOpen(false); }}><Users size={17} /> Usuários</button>}
          <button className={page === 'services' ? 'nav-active' : ''} onClick={() => { setPage('services'); setMenuOpen(false); }}><BriefcaseBusiness size={17} /> Serviços</button>
        </nav>
        <div className="nav-label nav-label-secondary">PREFERÊNCIAS</div>
        <nav className="side-nav secondary-nav">
          <button className={page === 'settings' ? 'nav-active' : ''} onClick={() => { setPage('settings'); setMenuOpen(false); }}><Settings size={17} /> Configurações</button>
          <a href="https://fastapi.tiangolo.com/" target="_blank" rel="noreferrer"><LifeBuoy size={17} /> Ajuda & documentação <ExternalLink size={12} className="external-icon" /></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-card"><span className="sidebar-card-icon"><Sparkles size={16} /></span><strong>Bom trabalho começa com clareza.</strong><p>Seu time, seus serviços, tudo no mesmo lugar.</p><button onClick={() => { setPage('analytics'); setMenuOpen(false); }}>Ver indicadores <ArrowRight size={13} /></button></div>
          <button className="sidebar-profile" onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{initials(user.name)}</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Equipe'}</small></span><Ellipsis size={19} className="profile-more" /></button>
          {profileOpen && <div className="profile-menu"><div className="profile-menu-email">{user.email}</div><button onClick={() => { setPage('settings'); setProfileOpen(false); }}><Settings size={15} /> Minha conta</button><button onClick={() => void logout()}><LogOut size={15} /> Sair do painel</button></div>}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><span>Symphony</span><span className="crumb-slash">/</span><strong>{meta.title}</strong></div></div>
          <div className="topbar-right">
            <label className={`global-search ${searchOpen ? 'search-open' : ''}`} onClick={() => setSearchOpen(true)}><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage('requests'); }} placeholder="Buscar solicitações..." aria-label="Buscar solicitações" />{search && <button type="button" onClick={(event) => { event.preventDefault(); setSearch(''); }} aria-label="Limpar busca"><X size={13} /></button>}<span className="search-shortcut">⌘ K</span></label>
            <button className="feedback-button" onClick={() => window.open('mailto:suporte@symphony.local?subject=Feedback%20do%20painel', '_blank')}>Feedback</button>
            <button className="notification-button icon-button" aria-label={`${dashboard?.open_requests ?? 0} solicitações abertas`} onClick={() => setPage('requests')}><Bell size={17} />{(dashboard?.open_requests ?? 0) > 0 && <span className="notification-dot" />}</button>
            <button className="top-avatar" onClick={() => setProfileOpen(!profileOpen)} aria-label="Abrir menu do perfil">{initials(user.name)}</button>
          </div>
        </header>

        <div className="content">
          <section className="page-heading"><div><div className="eyebrow"><span /> {meta.eyebrow}</div><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="heading-actions"><span className="date-chip"><Clock3 size={14} /> {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>{page === 'requests' && <button className="primary-button compact-button" onClick={() => setModal('request')}><Plus size={16} /> Nova solicitação</button>}{page === 'users' && user.role === 'admin' && <button className="primary-button compact-button" onClick={() => { setEditingUser(null); setModal('user'); }}><Plus size={16} /> Novo usuário</button>}{page === 'services' && user.role === 'admin' && <button className="primary-button compact-button" onClick={() => setModal('service')}><Plus size={16} /> Novo serviço</button>}</div></section>
          {error && <div role="alert" className="global-message global-error"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dispensar erro"><X size={15} /></button></div>}
          {notice && <div role="status" className="global-message global-success"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dispensar aviso"><X size={15} /></button></div>}
          {loading && <div className="sync-indicator"><LoaderCircle size={14} className="spin" /> Atualizando dados</div>}

          {page === 'overview' && <Overview dashboard={dashboard} requests={requests} services={services} onPage={setPage} onStatus={updateRequestStatus} />}
          {page === 'analytics' && <Analytics dashboard={dashboard} requests={requests} />}
          {page === 'requests' && <RequestsPage requests={filteredRequests} filter={requestFilter} onFilter={setRequestFilter} onStatus={updateRequestStatus} onDelete={deleteRequest} />}
          {page === 'users' && <UsersPage users={users} onEdit={(item) => { setEditingUser(item); setModal('user'); }} onDelete={deleteUser} currentUser={user} />}
          {page === 'services' && <ServicesPage services={services} onStatus={updateServiceStatus} />}
          {page === 'settings' && <SettingsPage user={user} onLogout={() => void logout()} />}

          <footer className="page-footer"><span>Symphony <span className="footer-dot">·</span> Um painel mais claro, todos os dias.</span><span><a href="https://fastapi.tiangolo.com/" target="_blank" rel="noreferrer">Documentação</a> <span className="footer-dot">·</span> Ambiente seguro <ShieldCheck size={12} /></span></footer>
        </div>
      </main>

      {modal === 'request' && <Modal title="Nova solicitação" onClose={() => setModal(null)} wide><form className="modal-form" onSubmit={submitRequest}>
        <div className="form-grid"><label>Nome do cliente<input name="customer_name" required minLength={2} maxLength={100} placeholder="Ex.: Marina Costa" /></label><label>E-mail do cliente<input name="customer_email" type="email" required placeholder="marina@empresa.com" /></label></div>
        <label>Serviço<select name="service_id" required defaultValue="">{services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></label>
        <div className="form-grid"><label>Prioridade<select name="priority" defaultValue="normal"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option></select></label><div className="form-hint"><ShieldCheck size={14} /> A solicitação será registrada com seu horário de criação.</div></div>
        <label>Descrição<textarea name="description" rows={4} minLength={5} maxLength={2000} required placeholder="Descreva como podemos ajudar..." /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button><button className="primary-button" type="submit"><Plus size={16} /> Criar solicitação</button></div>
      </form></Modal>}
      {modal === 'user' && <Modal title={editingUser ? 'Editar usuário' : 'Novo usuário'} onClose={() => { setModal(null); setEditingUser(null); }}><form className="modal-form" onSubmit={submitUser}>
        <label>Nome completo<input name="name" required minLength={2} maxLength={100} defaultValue={editingUser?.name ?? ''} placeholder="Ex.: Marina Costa" /></label>
        <label>E-mail<input name="email" type="email" required defaultValue={editingUser?.email ?? ''} placeholder="nome@empresa.com" /></label>
        <label>{editingUser ? 'Nova senha (opcional)' : 'Senha inicial'}<input name="password" type="password" minLength={10} autoComplete="new-password" required={!editingUser} placeholder={editingUser ? 'Deixe em branco para manter' : 'Pelo menos 10 caracteres'} /></label>
        <div className="form-grid"><label>Permissão<select name="role" defaultValue={editingUser?.role ?? 'agent'}><option value="agent">Equipe</option><option value="admin">Administrador</option></select></label><label>Acesso<select name="active" defaultValue={String(editingUser?.active ?? true)}><option value="true">Ativo</option><option value="false">Suspenso</option></select></label></div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setModal(null); setEditingUser(null); }}>Cancelar</button><button className="primary-button" type="submit"><Check size={16} /> {editingUser ? 'Salvar alterações' : 'Criar usuário'}</button></div>
      </form></Modal>}
      {modal === 'service' && <Modal title="Novo serviço" onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitService}>
        <label>Nome do serviço<input name="name" required minLength={2} maxLength={100} placeholder="Ex.: Suporte técnico" /></label>
        <label>Descrição<input name="description" maxLength={250} placeholder="Uma breve descrição" /></label>
        <label>Status inicial<select name="status" defaultValue="operational"><option value="operational">Operacional</option><option value="maintenance">Manutenção</option><option value="degraded">Instabilidade</option></select></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button><button className="primary-button" type="submit"><Plus size={16} /> Cadastrar serviço</button></div>
      </form></Modal>}
    </div>
  );
}

function Overview({ dashboard, requests, services, onPage, onStatus }: {
  dashboard: Dashboard | null; requests: ServiceRequest[]; services: Service[];
  onPage: (page: PageId) => void; onStatus: (item: ServiceRequest, status: RequestStatus) => void;
}) {
  const metrics = [
    { label: 'Solicitações totais', value: dashboard?.total_requests ?? 0, icon: MessageSquareText, change: 'No histórico', tone: 'violet' },
    { label: 'Em aberto', value: dashboard?.open_requests ?? 0, icon: Activity, change: 'Acompanhe de perto', tone: 'amber' },
    { label: 'Serviços ativos', value: `${dashboard?.operational_services ?? 0}/${dashboard?.total_services ?? 0}`, icon: BriefcaseBusiness, change: 'Operacionais agora', tone: 'green' },
    { label: 'Pessoas na equipe', value: dashboard?.active_users ?? 0, icon: Users, change: 'Contas ativas', tone: 'blue' },
  ];
  return (
    <>
      <div className="metric-grid">{metrics.map(({ label, value, icon: Icon, change, tone }) => <article className="metric-card card" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div><div className="metric-value">{value}</div><div className="metric-change"><span className={`change-dot ${tone}`} />{change}<ArrowUpRight size={13} className="metric-arrow" /></div></article>)}</div>
      <div className="dashboard-grid">
        <section className="card chart-card"><div className="card-heading"><div><h2>Solicitações recebidas</h2><p>Volume nos últimos 7 dias</p></div><span className="period-chip"><span /> Últimos 7 dias <ChevronDown size={13} /></span></div><LineChart data={dashboard?.weekly_requests ?? []} /></section>
        <section className="card revenue-card"><div className="card-heading"><div><h2>Resumo da equipe</h2><p>Status das solicitações</p></div><span className="heading-icon pale"><Users size={17} /></span></div><StatusChart counts={dashboard?.requests_by_status ?? { new: 0, in_progress: 0, completed: 0, cancelled: 0 }} /><button className="card-link" onClick={() => onPage('analytics')}>Ver análises <ArrowRight size={14} /></button></section>
        <section className="card table-card"><div className="card-heading table-card-heading"><div><h2>Solicitações recentes</h2><p>Acompanhe o que está acontecendo</p></div><button className="secondary-button small-button" onClick={() => onPage('requests')}>Ver todas <ArrowRight size={13} /></button></div><RequestsTable requests={requests.slice(0, 5)} onStatus={onStatus} compact /></section>
        <section className="card services-card"><div className="card-heading"><div><h2>Saúde dos serviços</h2><p>Visão geral das operações</p></div><button className="icon-button" onClick={() => onPage('services')} aria-label="Ver serviços"><ArrowRight size={17} /></button></div><div className="service-summary">{services.map((service) => <div className="service-summary-row" key={service.id}><span className={`service-led ${service.status}`} /><span className="service-summary-name">{service.name}</span><span className={`service-status ${service.status}`}>{serviceStatusLabels[service.status]}</span></div>)}</div><button className="card-link" onClick={() => onPage('services')}>Gerenciar serviços <ArrowRight size={14} /></button></section>
      </div>
    </>
  );
}

function RequestsTable({ requests, onStatus, onDelete, compact = false }: {
  requests: ServiceRequest[]; onStatus: (item: ServiceRequest, value: RequestStatus) => void;
  onDelete?: (item: ServiceRequest) => void; compact?: boolean;
}) {
  if (!requests.length) return <div className="table-empty"><span className="empty-icon"><FileText size={21} /></span><strong>Nenhuma solicitação encontrada</strong><p>Tente mudar a busca ou registre uma nova solicitação.</p></div>;
  return <div className="table-scroll"><table className={compact ? 'requests-table compact-table' : 'requests-table'}><thead><tr><th>SOLICITAÇÃO</th><th>CLIENTE</th><th>SERVIÇO</th><th>DATA</th><th>PRIORIDADE</th><th>STATUS</th>{onDelete && <th />}</tr></thead><tbody>{requests.map((item) => <tr key={item.id}><td><span className="request-code">{item.code}</span><span className="cell-caption">{item.description}</span></td><td><strong className="cell-primary">{item.customer_name}</strong><span className="cell-caption">{item.customer_email}</span></td><td><span className="service-cell"><Package size={13} /> {item.service_name}</span></td><td><span className="date-cell">{dateTime(item.created_at)}</span></td><td><span className={`priority-badge ${item.priority}`}>{item.priority === 'high' ? 'Alta' : item.priority === 'low' ? 'Baixa' : 'Normal'}</span></td><td><select className={`status-select ${item.status}`} aria-label={`Status da solicitação ${item.code}`} value={item.status} onChange={(event) => void onStatus(item, event.target.value as RequestStatus)}>{requestStatusValues.map((value) => <option value={value} key={value}>{requestStatusLabels[value]}</option>)}</select></td>{onDelete && <td><button className="delete-button" onClick={() => onDelete(item)} title="Excluir solicitação" aria-label={`Excluir ${item.code}`}><Trash2 size={15} /></button></td>}</tr>)}</tbody></table></div>;
}

function RequestsPage({ requests, filter, onFilter, onStatus, onDelete }: {
  requests: ServiceRequest[]; filter: 'all' | RequestStatus; onFilter: (value: 'all' | RequestStatus) => void;
  onStatus: (item: ServiceRequest, value: RequestStatus) => void; onDelete: (item: ServiceRequest) => void;
}) {
  const filters: ('all' | RequestStatus)[] = ['all', ...requestStatusValues];
  return <section className="card full-table-card"><div className="table-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filtrar solicitações">{filters.map((value) => <button role="tab" aria-selected={filter === value} className={filter === value ? 'filter-active' : ''} onClick={() => onFilter(value)} key={value}>{value === 'all' ? 'Todas' : requestStatusLabels[value]}</button>)}</div><span className="result-count">{requests.length} {requests.length === 1 ? 'resultado' : 'resultados'}</span></div><RequestsTable requests={requests} onStatus={onStatus} onDelete={onDelete} /></section>;
}

function UsersPage({ users, onEdit, onDelete, currentUser }: {
  users: User[]; onEdit: (user: User) => void; onDelete: (user: User) => void; currentUser: User;
}) {
  return <section className="card users-card"><div className="card-heading"><div><h2>Equipe e acessos</h2><p>{users.length} contas cadastradas no espaço de trabalho</p></div><span className="count-chip"><Users size={14} /> {users.filter((item) => item.active).length} ativos</span></div><div className="table-scroll"><table className="requests-table users-table"><thead><tr><th>MEMBRO</th><th>PERMISSÃO</th><th>STATUS</th><th>ENTROU EM</th><th>AÇÕES</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><div className="user-cell"><span className={`avatar ${item.role === 'admin' ? 'admin-avatar' : ''}`}>{initials(item.name)}</span><span><strong className="cell-primary">{item.name}{item.id === currentUser.id && <span className="you-tag">VOCÊ</span>}</strong><small className="cell-caption">{item.email}</small></span></div></td><td><span className={`role-badge ${item.role}`}>{item.role === 'admin' ? <ShieldCheck size={12} /> : <Users size={12} />}{item.role === 'admin' ? 'Administrador' : 'Equipe'}</span></td><td><span className={`active-status ${item.active ? 'active' : 'inactive'}`}><span />{item.active ? 'Ativo' : 'Suspenso'}</span></td><td>{dateLabel(item.created_at)}</td><td><div className="action-buttons"><button className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => onEdit(item)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`Excluir ${item.name}`} onClick={() => onDelete(item)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section>;
}

function ServicesPage({ services, onStatus }: { services: Service[]; onStatus: (service: Service, status: Service['status']) => void }) {
  return <div className="services-page-grid">{services.map((service) => <article className="card service-detail-card" key={service.id}><div className="service-detail-top"><span className={`service-card-icon ${service.status}`}><BriefcaseBusiness size={19} /></span><span className={`service-status ${service.status}`}><span className="service-led" />{serviceStatusLabels[service.status]}</span></div><h2>{service.name}</h2><p>{service.description || 'Sem descrição adicionada.'}</p><div className="service-detail-meta"><span><MessageSquareText size={14} /> Solicitações associadas</span></div><label className="service-control">Status do serviço<select aria-label={`Status de ${service.name}`} value={service.status} onChange={(event) => void onStatus(service, event.target.value as Service['status'])}>{serviceStatusValues.map((value) => <option value={value} key={value}>{serviceStatusLabels[value]}</option>)}</select></label></article>)}</div>;
}

function Analytics({ dashboard, requests }: { dashboard: Dashboard | null; requests: ServiceRequest[] }) {
  const total = dashboard?.total_requests ?? 0;
  const completionRate = total ? Math.round(((dashboard?.requests_by_status.completed ?? 0) / total) * 100) : 0;
  const highPriority = requests.filter((item) => item.priority === 'high' && item.status !== 'completed' && item.status !== 'cancelled').length;
  return <>
    <div className="analytics-kpi-grid"><article className="card analytics-kpi"><span>CONCLUÍDAS NO PERÍODO</span><strong>{dashboard?.completed_this_month ?? 0}</strong><small><Check size={13} /> Últimos 30 dias</small></article><article className="card analytics-kpi"><span>TAXA DE CONCLUSÃO</span><strong>{completionRate}%</strong><small><TrendingUp size={13} /> Solicitações concluídas</small></article><article className="card analytics-kpi"><span>PRIORIDADE ALTA</span><strong>{highPriority}</strong><small><AlertTriangle size={13} /> Aguardando atendimento</small></article></div>
    <div className="dashboard-grid analytics-grid"><section className="card chart-card"><div className="card-heading"><div><h2>Solicitações recebidas</h2><p>Atividade diária nos últimos sete dias</p></div><span className="period-chip"><span /> Última semana</span></div><LineChart data={dashboard?.weekly_requests ?? []} /></section><section className="card revenue-card"><div className="card-heading"><div><h2>Solicitações por status</h2><p>Distribuição atual do atendimento</p></div><span className="heading-icon pale"><BarChart3 size={17} /></span></div><StatusChart counts={dashboard?.requests_by_status ?? { new: 0, in_progress: 0, completed: 0, cancelled: 0 }} /></section></div>
  </>;
}

function SettingsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <div className="settings-grid"><section className="card settings-card"><div className="settings-heading"><span className="avatar admin-avatar">{initials(user.name)}</span><div><h2>Seu perfil</h2><p>Informações da conta conectada</p></div></div><div className="settings-row"><span>Nome</span><strong>{user.name}</strong></div><div className="settings-row"><span>E-mail</span><strong>{user.email}</strong></div><div className="settings-row"><span>Permissão</span><strong>{user.role === 'admin' ? 'Administrador' : 'Equipe'}</strong></div><div className="settings-row"><span>Status da conta</span><span className="active-status active"><span /> Ativo</span></div></section><section className="card settings-card workspace-card"><span className="settings-icon"><ShieldCheck size={19} /></span><h2>Seu espaço de trabalho</h2><p>Sua sessão é protegida por um cookie seguro e expira após 12 horas. A equipe só acessa os recursos permitidos para sua função.</p><button className="secondary-button logout-button" onClick={onLogout}><LogOut size={15} /> Sair da conta</button></section><section className="card settings-card"><span className="settings-icon"><Database size={19} /></span><h2>Sobre os dados</h2><p>Solicitações, contas e status dos serviços são guardados no PostgreSQL deste ambiente. Dados de demonstração são criados na primeira execução.</p></section></div>;
}

export default App;
