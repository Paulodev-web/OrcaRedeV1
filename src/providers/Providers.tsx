"use client";

import { AuthProvider } from '@/contexts/AuthContext';
import { AppProvider } from '@/contexts/AppContext';
import { ModuleAccessProvider } from '@/contexts/ModuleAccessContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // ThemeProvider por fora: não depende de sessão e precisa valer também na
    // tela de login. ModuleAccessProvider depende de AuthProvider (lê `user`).
    <ThemeProvider>
      <AuthProvider>
        <ModuleAccessProvider>
          <AppProvider>
            {children}
          </AppProvider>
        </ModuleAccessProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
