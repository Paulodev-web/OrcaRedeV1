import type { WorkProgressData } from '@/types/works';
import { PostsProgressCard } from './PostsProgressCard';
import { MeterProgressCard } from './MeterProgressCard';
import { SCurveChart } from './SCurveChart';
import { MilestoneStatusSummary } from './MilestoneStatusSummary';

/**
 * Wrapper server component que organiza os cards de progresso. Se um dia
 * algum precisar ser interativo, isolar o filho como client component.
 */
export function ProgressOverview({ data }: { data: WorkProgressData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PostsProgressCard
          postsPlanned={data.postsPlanned}
          postsInstalled={data.postsInstalled}
        />
        <MilestoneStatusSummary counts={data.milestonesCounts} />
      </div>
      <MeterProgressCard meters={data.metersByCategory} />
      <SCurveChart
        data={data.sCurveData}
        totalPlanned={data.totalMetersPlanned}
        startedAt={data.startedAt}
        expectedEndAt={data.expectedEndAt}
      />
    </div>
  );
}
