interface Env {
  ASSETS: {
    fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'geolocation=(), microphone=(), payment=()');

    const contentType = headers.get('Content-Type') ?? '';
    if (contentType.includes('text/html')) {
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (response.ok) {
      headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
