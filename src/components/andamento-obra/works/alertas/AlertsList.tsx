'use client';

import { useState } from 'react';
import type { WorkAlert } from '@/types/works';
import { getOlderAlerts } from '@/actions/workAlerts';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { AlertCard } from './AlertCard';

interface Props {
  alerts: WorkAlert[];
  workId: string;
  role: string;
  initialHasMore?: boolean;
}

export function AlertsList({ alerts: initialAlerts, workId, role, initialHasMore = false }: Props) {
  const [alerts, setAlerts] = useState<WorkAlert[]>(initialAlerts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const filtered = alerts.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (severityFilter && a.severity !== severityFilter) return false;
    return true;
  });

  async function handleLoadMore() {
    if (loading || alerts.length === 0) return;
    const oldest = alerts[alerts.length - 1];
    setLoading(true);
    try {
      const result = await getOlderAlerts(workId, oldest.createdAt);
      if (result.success && result.data) {
        setAlerts((prev) => {
          const ids = new Set(prev.map((a) => a.id));
          return [...prev, ...result.data!.items.filter((a) => !ids.has(a.id))];
        });
        setHasMore(result.data.hasMore);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          <option value="open">Aberto</option>
          <option value="in_progress">Em tratativa</option>
          <option value="resolved_in_field">Resolvido em campo</option>
          <option value="closed">Encerrado</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs"
          aria-label="Filtrar por severidade"
        >
          <option value="">Todas severidades</option>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="critical">Crítica</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">
            {alerts.length === 0
              ? 'Nenhum alerta registrado nesta obra.'
              : 'Nenhum alerta corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} workId={workId} role={role} />
          ))}
        </div>
      )}

      <LoadMoreButton
        hasMore={hasMore}
        loading={loading}
        onLoadMore={() => void handleLoadMore()}
        label="Carregar alertas anteriores"
      />
    </div>
  );
}
