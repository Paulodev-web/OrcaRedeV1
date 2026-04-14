"use client";
import { useRouter } from 'next/navigation';
import {
  LogOut,
  ChevronRight,
  Zap,
  Clock,
  ArrowRight,
  User,
  Bell,
  Grid3X3,
  Shield,
  Hammer,
  Package,
  Calculator,
  HardHat,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { ON_ENGENHARIA_LOGO_SRC } from '@/lib/branding';

interface Module {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  status: 'active' | 'soon';
  badge?: string;
  color: string;
  bgColor: string;
  borderColor: string;
  stats?: { label: string; value: string }[];
}

const ON_COLORS = { navy: '#1D3140', blue: '#64ABDE' };

const modules: Module[] = [
  {
    id: 'orca-rede',
    title: 'OrçaRede',
    description: 'Sistema de orçamentos para projetos de redes elétricas',
    icon: Zap,
    status: 'active',
    badge: 'Financeiro',
    color: 'text-[#1D3140]',
    bgColor: 'bg-[#64ABDE]/15',
    borderColor: 'border-[#64ABDE]/40',
    stats: [
      { label: 'Módulo principal', value: 'Ativo' },
    ],
  },
  {
    id: 'portal-engenheiro',
    title: 'Portal do Engenheiro',
    description: 'Gestão e acompanhamento de instalações em campo',
    icon: Hammer,
    status: 'active',
    badge: 'Obras',
    color: 'text-[#1D3140]',
    bgColor: 'bg-[#64ABDE]/15',
    borderColor: 'border-[#64ABDE]/40',
  },
  {
    id: 'fornecedores',
    title: 'Suprimentos e Cotações',
    description: 'Importação de PDFs de fornecedores, conciliação de itens e cenários de compra',
    icon: Package,
    status: 'active',
    badge: 'Compras',
    color: 'text-[#1D3140]',
    bgColor: 'bg-[#64ABDE]/15',
    borderColor: 'border-[#64ABDE]/40',
  },
  {
    id: 'precificacao',
    title: 'Módulo de Precificação',
    description: 'Formação de preço de venda com custo direto, BDI e análise de lucro',
    icon: Calculator,
    status: 'active',
    badge: 'Comercial',
    color: 'text-[#1D3140]',
    bgColor: 'bg-[#64ABDE]/15',
    borderColor: 'border-[#64ABDE]/40',
  },
  {
    id: 'andamento-obra',
    title: 'Andamento de Obra',
    description: 'Acompanhamento de cronograma e evolução física das obras em campo',
    icon: HardHat,
    status: 'active',
    href: '/andamento-obra',
    badge: 'Obras',
    color: 'text-[#1D3140]',
    bgColor: 'bg-[#64ABDE]/15',
    borderColor: 'border-[#64ABDE]/40',
  },
];

export function AdminPortal() {
  const router = useRouter();
  const { setActiveModule, setCurrentView } = useApp();
  const { signOut, user } = useAuth();
  const activeModuleCount = modules.filter((m) => m.status === 'active').length;
  const handleOpenModule = (moduleId: string) => {
    if (moduleId === 'orca-rede') {
      setActiveModule('orcamentos');
    } else if (moduleId === 'portal-engenheiro') {
      setActiveModule('portal-engenheiro');
      setCurrentView('portal-engenheiro');
    } else if (moduleId === 'fornecedores') {
      router.push('/fornecedores');
    } else if (moduleId === 'precificacao') {
      router.push('/tools/precificacao');
    } else {
      setActiveModule(moduleId);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  };

  const getUserInitials = () => {
    if (!user?.email) return 'U';
    return user.email.charAt(0).toUpperCase();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white/95 border-b border-slate-200 shadow-sm sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <div className="flex items-center space-x-3">
              <img
                src={ON_ENGENHARIA_LOGO_SRC}
                alt="ON Engenharia"
                className="h-9 w-auto max-h-9 object-contain"
              />
              <div>
                <span className="text-base font-bold text-[#1D3140] leading-tight block">
                  ON Engenharia
                </span>
                <span className="text-xs text-slate-500 leading-tight block">
                  Portal Administrativo
                </span>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-3">
              <button className="relative p-2 rounded-lg text-slate-500 hover:text-[#1D3140] hover:bg-slate-100 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: ON_COLORS.blue }}></span>
              </button>

              <div className="flex items-center space-x-2 pl-3 border-l border-slate-200">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ON_COLORS.blue}20` }}>
                  <span className="text-sm font-semibold" style={{ color: ON_COLORS.navy }}>{getUserInitials()}</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-[#1D3140] leading-tight max-w-[180px] truncate">
                    {user?.email}
                  </p>
                  <p className="text-xs text-slate-500 leading-tight">Administrador</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors ml-1"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">

        {/* Welcome Hero */}
        <div className="mb-8">
          <div className="rounded-2xl p-8 text-white relative overflow-hidden shadow-xl" style={{ background: `linear-gradient(140deg, ${ON_COLORS.navy} 0%, #223f52 45%, ${ON_COLORS.blue} 100%)` }}>
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white opacity-5 rounded-full translate-y-1/2 -translate-x-1/4"></div>
            <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-white opacity-5 rounded-full -translate-y-1/2"></div>

            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Grid3X3 className="w-4 h-4 text-white/70" />
                  <span className="text-white/80 text-sm font-medium">Portal Administrativo</span>
                </div>
                <h1 className="text-3xl font-bold mb-2">
                  {getGreeting()}, seja bem-vindo!
                </h1>
                <p className="text-white/90 text-base max-w-lg">
                  Selecione um módulo abaixo para começar. Todos os seus projetos e dados estão aqui.
                </p>
                <div className="flex items-center space-x-1.5 mt-4 text-white/80 text-sm">
                  <Clock className="w-4 h-4" />
                  <span className="capitalize">{today}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-[#1D3140]">Módulos disponíveis</h2>
            <p className="text-sm text-slate-500 mt-0.5">Clique em um módulo ativo para acessá-lo</p>
          </div>
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium border" style={{ backgroundColor: `${ON_COLORS.blue}15`, color: ON_COLORS.navy, borderColor: `${ON_COLORS.blue}40` }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ON_COLORS.blue }}></span>
            <span>{activeModuleCount} ativos</span>
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const isActive = mod.status === 'active';
            return (
              <div
                key={mod.id}
                className={`
                  relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden
                  ${isActive
                    ? 'border-[#64ABDE]/40 shadow-md hover:shadow-xl hover:-translate-y-1 cursor-pointer'
                    : 'border-slate-200 shadow-sm opacity-70 cursor-not-allowed'
                  }
                `}
                onClick={() => isActive && handleOpenModule(mod.id)}
              >
                {/* Active indicator strip */}
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}></div>
                )}

                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 ${mod.bgColor} rounded-xl flex items-center justify-center border ${mod.borderColor}`}>
                      <Icon className={`w-6 h-6 ${mod.color}`} />
                    </div>
                    {mod.badge ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {mod.badge}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                        Ativo
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-[#1D3140] mb-2">{mod.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">{mod.description}</p>

                  {isActive ? (
                    <button
                      type="button"
                      className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-white text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-md"
                      style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
                    >
                      <span>Acessar módulo</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl bg-slate-100 text-sm font-medium text-slate-500 border border-slate-200">
                      <Clock className="w-4 h-4 mr-2" />
                      Em desenvolvimento
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom info */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${ON_COLORS.blue}20` }}>
              <User className="w-4 h-4" style={{ color: ON_COLORS.navy }} />
            </div>
            <div>
              <p className="text-sm font-medium text-[#1D3140]">Conta ativa</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-xs text-slate-500">
            <Shield className="w-3.5 h-3.5" />
            <span>Conexão segura</span>
            <ChevronRight className="w-3 h-3 mx-1" />
            <span>ON Engenharia Elétrica © {new Date().getFullYear()}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
