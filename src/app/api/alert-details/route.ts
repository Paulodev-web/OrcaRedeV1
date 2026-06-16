import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getAlertWithHistory } from '@/services/works/getAlertWithHistory';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const alertId = searchParams.get('alertId');
  const workId = searchParams.get('workId');

  if (!alertId || !workId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await getAlertWithHistory(supabase, alertId);
  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
