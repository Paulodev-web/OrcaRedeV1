import Link from 'next/link';
import type { WorkTeamAttendanceRow, WorkTeamMember } from '@/types/works';

interface Props {
  attendance: WorkTeamAttendanceRow[];
  team: WorkTeamMember[];
  workId: string;
}

export function AttendanceTable({ attendance, team, workId }: Props) {
  if (attendance.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
        <p className="text-sm text-gray-500">
          Presença será registrada automaticamente quando houver diários aprovados.
        </p>
      </div>
    );
  }

  const allocatedIds = new Set(team.map((t) => t.crewMemberId));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-2 font-medium text-gray-700">Membro</th>
            <th className="px-4 py-2 font-medium text-gray-700">Data</th>
            <th className="px-4 py-2 font-medium text-gray-700">Diário</th>
            <th className="px-4 py-2 font-medium text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {attendance.map((row) => {
            const isAllocated = allocatedIds.has(row.crewMemberId);
            return (
              <tr key={row.id}>
                <td className="px-4 py-2 text-[#1D3140]">
                  {row.crewMemberName}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {new Date(row.attendanceDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-2">
                  {row.dailyLogId ? (
                    <Link
                      href={`/tools/andamento-obra/obras/${workId}/diario`}
                      className="text-xs text-[#64ABDE] hover:underline"
                    >
                      Ver diário
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {!isAllocated && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Sem alocação formal
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
