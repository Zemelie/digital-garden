// Settings + GitHub helpers shared by the popup and the settings page.

export const DEFAULTS = {
  repo: 'Zemelie/digital-garden',
  branch: 'main',
  site: 'https://majestic-torrone-93e7f1.netlify.app',
  token: '',
};

// chrome.storage.local keeps the token on this computer only (it isn't synced).
// Outside the extension (previewing popup.html in a normal tab) fall back to localStorage.
const store = globalThis.chrome?.storage?.local;

export async function getSettings() {
  if (store) return { ...DEFAULTS, ...(await store.get(Object.keys(DEFAULTS))) };
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('garden-settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}

export async function saveSettings(values) {
  if (store) return store.set(values);
  try { localStorage.setItem('garden-settings', JSON.stringify({ ...(await getSettings()), ...values })); } catch {}
}

export async function remember(key, value) {
  if (store) return store.set({ [key]: value });
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export async function recall(key) {
  if (store) return (await store.get(key))[key];
  try { return JSON.parse(localStorage.getItem(key)); } catch { return undefined; }
}

export function github(settings) {
  const base = `https://api.github.com/repos/${settings.repo}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${settings.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function call(path, init = {}) {
    const res = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).message || msg; } catch {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    repoInfo: () => call(''),
    async exists(path) {
      try { await call(`/contents/${path}?ref=${settings.branch}`); return true; }
      catch (e) { if (e.status === 404) return false; throw e; }
    },
    put(path, base64, message) {
      return call(`/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: base64, branch: settings.branch }),
      });
    },
  };
}

export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Same shape of slug the CMS makes: "Toronto font (?)" -> "toronto-font".
export function slugify(title) {
  return title
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'seed';
}
