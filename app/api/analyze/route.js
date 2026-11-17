import { handle } from '@/lib/api.mjs';
import { analyzeSql } from '@/lib/analyzer.mjs';

export const dynamic = 'force-dynamic';
export const POST = handle(async ({ request }) => analyzeSql(await request.json()));
