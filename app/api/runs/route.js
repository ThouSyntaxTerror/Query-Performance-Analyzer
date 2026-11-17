import { handle } from '@/lib/api.mjs';
import { listRuns } from '@/lib/analyzer.mjs';

export const dynamic = 'force-dynamic';
export const GET = handle(async ({ request }) => listRuns(new URL(request.url).searchParams.get('queryId')));
