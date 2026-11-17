import { handle } from '@/lib/api.mjs';
import { getRun } from '@/lib/analyzer.mjs';

export const dynamic = 'force-dynamic';
export const GET = handle(async ({ params }) => getRun(params.id));
