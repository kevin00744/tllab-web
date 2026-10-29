// Docker healthcheck 用；不需登入
export function GET() {
  return Response.json({ ok: true });
}
