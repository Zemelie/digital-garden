import { getSettings, saveSettings, github } from './shared.js';

const form = document.getElementById('settings');
const status = document.getElementById('status');

const s = await getSettings();
for (const k of ['token', 'repo', 'branch', 'site']) form[k].value = s[k];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = {
    token: form.token.value.trim(),
    repo: form.repo.value.trim(),
    branch: form.branch.value.trim() || 'main',
    site: form.site.value.trim().replace(/\/$/, ''),
  };
  await saveSettings(values);
  status.classList.remove('error');
  status.textContent = 'Saved. Testing the connection…';

  try {
    const repo = await github(values).repoInfo();
    const canWrite = repo.permissions ? repo.permissions.push : true;
    if (!canWrite) throw new Error('this key can read the repo but not write to it — give it Contents: Read and write');
    const garden = await fetch(`${values.site}/data/garden.json`, { cache: 'no-cache' });
    if (!garden.ok) throw new Error(`connected to GitHub, but couldn’t reach the garden site (${garden.status})`);
    status.textContent = `All set! Connected to ${repo.full_name}. Click the dandelion in your toolbar (or press Option+Shift+G) on any page.`;
  } catch (err) {
    status.classList.add('error');
    status.textContent = `Not quite: ${err.message}`;
  }
});
