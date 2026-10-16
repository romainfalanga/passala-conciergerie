// The browser only calls same-origin endpoints. Credentials stay on the server.
window.Passala = {
  async api(path, options = {}) {
    const headers = { ...options.headers };
    if (options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-Passala-Request'] = '1';
    }
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({ error: 'Le service est momentanément indisponible.' }));
    if (!response.ok) {
      const error = new Error(result.error || 'Impossible de terminer cette opération.');
      error.status = response.status;
      throw error;
    }
    return result;
  },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  url(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' || url.origin === location.origin ? this.escape(url.href) : '';
    } catch { return ''; }
  },
  requestIdentity(data, previous) {
    const payload = JSON.stringify(data);
    return previous && previous.payload === payload ? previous : { payload, key: crypto.randomUUID() };
  }
};
