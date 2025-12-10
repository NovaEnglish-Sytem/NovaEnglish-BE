export async function GET() {
  return new Response(JSON.stringify({ ok: false, error: 'Gone' }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function PUT() {
  return new Response(JSON.stringify({ ok: false, error: 'Gone' }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
