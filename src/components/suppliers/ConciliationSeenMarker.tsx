'use client';

import { useEffect } from 'react';
import { markConciliationSeen } from '@/lib/suppliesConciliationAlert';

interface Props {
  sessionId: string;
}

/** Marca a conciliação como visitada ao abrir a tela (dispensa alerta nos cenários). */
export default function ConciliationSeenMarker({ sessionId }: Props) {
  useEffect(() => {
    markConciliationSeen(sessionId);
  }, [sessionId]);

  return null;
}
