// Accès à l'API Passala. Le navigateur n'appelle que /api sur le même domaine :
// Netlify relaie ces requêtes vers le Worker Cloudflare (base D1 + photos R2).
window.Passala = {
  async api(path, options = {}) {
    const headers = { ...options.headers };
    const method = options.method || 'GET';
    if (method !== 'GET') {
      headers['X-Passala-Request'] = '1';
      if (!(options.body instanceof Blob) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
      response = await fetch('/api' + path, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    } catch {
      throw Object.assign(new Error('Connexion impossible. Vérifiez votre réseau et réessayez.'), { status: 0 });
    }
    const result = await response.json().catch(() => ({ error: 'Le service est momentanément indisponible.' }));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Impossible de terminer cette opération.'), { status: response.status });
    return result;
  },
  send(path, method, data, extraHeaders) {
    return this.api(path, { method, headers: extraHeaders, body: JSON.stringify(data ?? {}) });
  },
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  /** URL sûre pour un attribut src/href : https ou chemin du site uniquement. */
  url(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' || url.origin === location.origin ? this.escape(url.href) : '';
    } catch { return ''; }
  },
  euros(cents) {
    if (cents === null || cents === undefined) return '';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  },
  frDate(key, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' });
  },
  /** Clé d'idempotence stable tant que le contenu envoyé ne change pas (évite les doublons au double clic). */
  requestIdentity(data, previous) {
    const payload = JSON.stringify(data);
    return previous && previous.payload === payload ? previous : { payload, key: crypto.randomUUID() };
  }
};
