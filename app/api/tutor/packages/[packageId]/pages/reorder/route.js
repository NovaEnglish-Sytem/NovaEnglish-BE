export async function POST() {
  return new Response(JSON.stringify({ ok: false, error: 'Gone' }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
