"use client";

import { useEffect, useRef } from 'react';

import { trackProposalActivity } from './tracking';

const HEARTBEAT_MS = 20_000;

interface ProposalTrackerProps {
  token: string;
}

/**
 * Instrumentação da página pública: abertura, tempo de leitura, profundidade de
 * rolagem e quais seções o cliente realmente viu.
 *
 * Não renderiza nada e nunca interfere na leitura — qualquer falha de rede é
 * engolida em `trackProposalActivity`.
 */
export function ProposalTracker({ token }: ProposalTrackerProps) {
  const secondsRef = useRef(0);
  const scrollRef = useRef(0);
  const seenSectionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let disposed = false;

    const snapshot = () => ({
      totalSeconds: secondsRef.current,
      maxScrollPercent: scrollRef.current,
    });

    void trackProposalActivity(token, { eventType: 'session_start', ...snapshot() });

    // O tempo só corre com a aba visível: contar aba de fundo inflaria o
    // "tempo de leitura" que o painel mostra.
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      secondsRef.current += HEARTBEAT_MS / 1000;
      void trackProposalActivity(token, { eventType: 'heartbeat', ...snapshot() });
    }, HEARTBEAT_MS);

    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const percent =
        scrollable <= 0 ? 100 : Math.round(((window.scrollY + window.innerHeight) / (scrollable + window.innerHeight)) * 100);
      scrollRef.current = Math.min(100, Math.max(scrollRef.current, percent));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Uma seção conta como vista quando metade dela apareceu — evita contar
    // tudo que passou voando durante um scroll rápido até o fim.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = entry.target.getAttribute('data-proposal-section');
          if (!key || seenSectionsRef.current.has(key)) continue;
          seenSectionsRef.current.add(key);
          void trackProposalActivity(token, { eventType: 'section_view', sectionKey: key, ...snapshot() });
        }
      },
      { threshold: 0.5 },
    );

    document
      .querySelectorAll('[data-proposal-section]')
      .forEach((element) => observer.observe(element));

    const flush = () => {
      if (disposed) return;
      void trackProposalActivity(token, { eventType: 'heartbeat', ...snapshot() });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      disposed = true;
      window.clearInterval(tick);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      observer.disconnect();
    };
  }, [token]);

  return null;
}
