const TOKEN_KEY = 'bahi_token';
const COMPANY_KEY = 'bahi_company';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const companyStore = {
  get: () => localStorage.getItem(COMPANY_KEY) || '',
  set: (id) => localStorage.setItem(COMPANY_KEY, id),
  clear: () => localStorage.removeItem(COMPANY_KEY),
};

export function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = companyStore.get();
  if (company) headers['x-company-id'] = company;
  return headers;
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: apiHeaders(headers) };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw Object.assign(new Error('Server se connection nahi ban raha. Check karo BahiBooks server chal raha hai.'), { status: 0, code: 'NETWORK' });
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && tokenStore.get()) window.dispatchEvent(new Event('bahi:unauthorized'));
    if (res.status === 403 && data?.code === 'COMPANY_LOCKED') window.dispatchEvent(new Event('bahi:company-locked'));
    const message = typeof data === 'object' && data?.error ? data.error : `Request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status, code: data?.code, data });
  }
  return data;
}

export async function downloadFile(path, fallbackName = 'download') {
  const res = await fetch(`/api${path}`, { headers: apiHeaders() });
  if (!res.ok) {
    let msg = 'Download failed';
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const name = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
