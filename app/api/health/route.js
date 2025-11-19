import { env } from '../../../src/lib/env.js';

export async function GET() {
  const payload = {
    ok: true,
    service: "novaenglish-next-api",
    timestamp: new Date().toISOString(),
    env: env.nodeEnv,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "pragma": "no-cache",
      "expires": "0",
      "surrogate-control": "no-store",
    },
  });
}
