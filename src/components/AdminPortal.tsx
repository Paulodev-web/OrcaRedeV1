"use client";
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { ArrowRight, Bell, Clock, LayoutGrid, LogOut, Shield, Sparkles } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
// ⚠️ Importar sempre pelo caminho completo do arquivo: no Windows/macOS o
// especificador `@/components/layout` resolve para o `Layout.tsx` legado, que
// difere apenas no caixa-alta. Some com o problema quando a Fase 7 remover o
// legado.
import { ActivityDot } from '@/components/layout/ActivityDot';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { buildAppSidebarSections, getPortalModules, type AppModule } from '@/components/layout/modules';
import { onBrandGradientClass, onBrandHeroGradientClass } from '@/lib/branding';

/**
 * Contagem de atividade não vista por módulo.
 *
 * Fica em zero até `user_module_seen` e as queries de badge existirem — a
 * `ActivityDot` não renderiza nada com zero. É o único ponto a trocar quando a
 * fonte de dados chegar.
 */
const ACTIVITY_COUNTS = {} as const;

export function AdminPortal() {
  const { setActiveModule, setCurrentView } = useApp();
  const { signOut, user } = useAuth();

  const portalModules = getPortalModules();

  /** Módulos que ainda vivem no roteamento por estado do `AppContext`. */
  const openLegacyModule = useCallback(
    (mod: AppModule) => {
      if (mod.legacyModule) setActiveModule(mod.legacyModule);
      if (mod.legacyView) setCurrentView(mod.legacyView);
    },
    [setActiveModule, setCurrentView],
  );

  const sections = useMemo(
    () => buildAppSidebarSections({ activityCounts: ACTIVITY_COUNTS, onLegacySelect: openLegacyModule }),
    [openLegacyModule],
  );

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  };

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sidebarFooter = ({ collapsed }: { collapsed: boolean }) =>
    collapsed ? (
      <button
        type="button"
        onClick={handleLogout}
        title="Sair"
        className="flex w-full items-center justify-center rounded-xl p-2.5 text-white/60 transition-colors hover:bg-red-500/20 hover:text-white"
      >
        <LogOut className="h-5 w-5" />
        <span className="sr-only">Sair</span>
      </button>
    ) : (
      <div className="space-y-1">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue/20 text-sm font-semibold text-brand-blue-soft">
            {userInitial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{user?.email}</span>
            <span className="block text-xs text-white/40">Administrador</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-red-500/20 hover:text-white"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sair
        </button>
      </div>
    );

  return (
    <AppLayout
      sections={sections}
      activeItemId="portal"
      sidebarFooter={sidebarFooter}
      header={
        <ModuleHeader
          icon={LayoutGrid}
          title="Portal Administrativo"
          description="Ponto de entrada do sistema — escolha um módulo para continuar."
          actions={
            <button
              type="button"
              aria-label="Notificações"
              className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-navy"
            >
              <Bell className="h-5 w-5" />
              <ActivityDot count={0} dotOnly className="absolute right-1.5 top-1.5" />
            </button>
          }
        />
      }
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Saudação */}
        <section
          className={`relative mb-8 overflow-hidden rounded-2xl p-8 text-white shadow-xl ${onBrandHeroGradientClass}`}
        >
          <div
            aria-hidden
            className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/4 rounded-full bg-white opacity-5"
          />
          <div
            aria-hidden
            className="absolute bottom-0 left-0 h-48 w-48 -translate-x-1/4 translate-y-1/2 rounded-full bg-white opacity-5"
          />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-3xl font-bold">{greeting}, seja bem-vindo!</h2>
              <p className="mt-2 max-w-lg text-base text-white/90">
                Todos os módulos ficam acessíveis pela navegação lateral, sem passar por aqui de novo.
              </p>
              <p className="mt-4 flex items-center gap-1.5 text-sm text-white/80">
                <Clock className="h-4 w-4" />
                <span className="capitalize">{today}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 self-start rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm lg:self-auto">
              <Sparkles className="h-4 w-4" />
              <span>{portalModules.length} módulos ativos</span>
            </div>
          </div>
        </section>

        {/* Módulos */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-brand-navy">Módulos disponíveis</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Clique em um módulo para acessá-lo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {portalModules.map((mod) => (
            <ModuleCard key={mod.id} module={mod} onOpenLegacy={openLegacyModule} />
          ))}
        </div>

        {/* Rodapé */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-blue/40 bg-brand-blue/15 text-sm font-semibold text-brand-navy">
              {userInitial}
            </span>
            <div>
              <p className="text-sm font-medium text-brand-navy">Conta ativa</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Shield className="h-3.5 w-3.5" />
            <span>Conexão segura</span>
            <span aria-hidden>·</span>
            <span>ON Engenharia Elétrica © {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

interface ModuleCardProps {
  module: AppModule;
  onOpenLegacy: (module: AppModule) => void;
}

function ModuleCard({ module: mod, onOpenLegacy }: ModuleCardProps) {
  const Icon = mod.icon;

  // `h-full` + coluna flex mantêm o CTA alinhado entre cartões de descrição
  // com alturas diferentes.
  const cardClass =
    'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-brand-blue/40 bg-white text-left shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue';

  const cardBody = (
    <>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-navy to-brand-blue"
      />

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4 flex items-start justify-between">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand-blue/40 bg-brand-blue/15">
            <Icon className="h-6 w-6 text-brand-navy" />
          </span>
          <span className="flex items-center gap-2">
            <ActivityDot count={0} label={`novidades em ${mod.label}`} />
            {mod.tag ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {mod.tag}
              </span>
            ) : null}
          </span>
        </div>

        <h3 className="mb-2 text-base font-bold text-brand-navy">{mod.label}</h3>
        <p className="mb-4 text-sm leading-relaxed text-slate-500">{mod.description}</p>

        <span
          className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white group-hover:shadow-md ${onBrandGradientClass}`}
        >
          <span>Acessar módulo</span>
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </>
  );

  if (mod.href) {
    return (
      <Link href={mod.href} prefetch className={cardClass}>
        {cardBody}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onOpenLegacy(mod)} className={`w-full ${cardClass}`}>
      {cardBody}
    </button>
  );
}
