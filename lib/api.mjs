import { NextResponse } from 'next/server';
import { UserError } from './sqlguard.mjs';

// Wraps a route handler: JSON out, friendly 400 for user mistakes, 500 (with the MySQL message) otherwise.
export const handle = (fn) => async (request, ctx) => {
  try {
    const params = ctx?.params ? await ctx.params : {};
    return NextResponse.json(await fn({ request, params }));
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: e.sqlMessage || e.message || 'Unexpected error' }, { status: 500 });
  }
};
