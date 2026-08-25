export function renderErrorPage(requestUrl?: string): string {
  const ref = `${new Date().toISOString()}${requestUrl ? ` · ${requestUrl}` : ""}`;
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Esta página no se cargó · FIGURARTE</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
      .ref { margin-top: 1.25rem; font-size: 11px; color: #9ca3af; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Esta página no se cargó</h1>
      <p>Se produjo un error temporal del servidor. Reintenta la petición; si continúa, vuelve al inicio.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Reintentar</button>
        <a class="secondary" href="/">Ir al inicio</a>
      </div>
      <div class="ref">Ref: ${ref}</div>
    </div>
  </body>
</html>`;
}
