'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  matcher: (pathname: string) => boolean;
}

const items: NavItem[] = [
  {
    href: '/tools/andamento-obra',
    label: 'Obras',
    matcher: (pathname) =>
      pathname === '/tools/andamento-obra'
      || pathname.startsWith('/tools/andamento-obra/obras'),
  },
  {
    href: '/tools/andamento-obra/pessoas',
    label: 'Pessoas',
    matcher: (pathname) => pathname.startsWith('/tools/andamento-obra/pessoas'),
  },
  {
    href: '/tools/andamento-obra/checklists',
    label: 'Modelos de Checklist',
    matcher: (pathname) => pathname.startsWith('/tools/andamento-obra/checklists'),
  },
  {
    href: '/tools/andamento-obra/notificacoes',
    label: 'Notificações',
    matcher: (pathname) => pathname.startsWith('/tools/andamento-obra/notificacoes'),
  },
  {
    href: '/tools/andamento-obra/admin',
    label: 'Admin',
    matcher: (pathname) => pathname.startsWith('/tools/andamento-obra/admin'),
  },
];

export function ModuleSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação do módulo Andamento de Obra"
      className="bg-white"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 py-2 lg:px-8">
        {items.map((item) => {
          const active = item.matcher(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[#1D3140] text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-[#1D3140]',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
