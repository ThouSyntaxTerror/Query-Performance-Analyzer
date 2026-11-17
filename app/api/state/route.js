import { handle } from '@/lib/api.mjs';
import { getState } from '@/lib/analyzer.mjs';

export const dynamic = 'force-dynamic';
export const GET = handle(() => getState());
