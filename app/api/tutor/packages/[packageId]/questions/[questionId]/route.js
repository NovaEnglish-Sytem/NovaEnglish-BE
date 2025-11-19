export async function PUT(_request, { params: _params }) {
  return new Response(JSON.stringify({ ok: false, error: 'Gone' }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function DELETE(_request, { params: _params }) {
  return new Response(JSON.stringify({ ok: false, error: 'Gone' }), {
    status: 410,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
