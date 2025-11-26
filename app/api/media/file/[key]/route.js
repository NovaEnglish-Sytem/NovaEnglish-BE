export async function GET() {
  return new Response(JSON.stringify({ message: 'Media files are served from Cloudflare R2' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
