export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { ok: true, version: process.env.BUILD_VERSION || 'local' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
