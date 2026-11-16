# Chloe-Amelie Garden

A digital garden: every **node** is an idea, drawn as a dandelion. **Branches** are the connected
thoughts, files and links that grow out of it (and branches can fork into sub-branches). Each branch's
line shows how grown it is — **bloomed** (solid), **budding** (dashed), **fresh** (dotted) — and
**threads** connect related entries across clusters.

The dandelions lay themselves out from the data, so adding entries is all it takes to make them grow.

## How it fits together

```
content/entries/*.json   one file per entry — what the CMS writes
build.py                 compiles them into data/garden.json (Python, no installs)
index.html               the garden + zoomed-in dandelion (#/n/<node>)
entry.html?id=<slug>     the interior page for one entry
admin/                   Decap CMS — the "plant a seed" form, works on your phone
site.config.js           site title, philosophy blurb, comments (giscus) settings
```

### An entry

| Field | Meaning |
|---|---|
| `title` | Name of the entry |
| `parent` | **Grows from**: the node/branch it grows from. Empty = a new dandelion (node) |
| `tags` | **Type**: any of `document link photo drawing video audio` (uploads add theirs automatically) |
| `status` | **Stage**: `fresh` · `budding` · `bloomed` |
| `planted` / `tended` | stamped automatically by the CMS on save |
| `files` | uploads, each with a type (photo, drawing, document, audio, video, link) |
| `body` | **Notes**, in Markdown |
| `related` | **Threads to**: optional related entries in other dandelions |

The CMS lives behind the fish next to "Chamcham's Place" (it links to `/admin`).

### Look and feel

- Sky colours, cloud colours and cloud settings: top of `assets/js/sky.js`.
  Preview any time of day with `?sky=morning`, `?sky=afternoon`, `?sky=evening` or `?sky=night` on the URL.
- Page colours and fonts: the top of `assets/css/garden.css`.

## Preview locally

```bash
python3 build.py && python3 -m http.server 8000
```

Then open http://localhost:8000. Re-run `python3 build.py` after editing anything in `content/entries/`.

## Put it online + tend it from anywhere

1. **Make a GitHub repo** (e.g. `digital-garden`) and push this folder to it.
2. **Deploy on Netlify**: "Add new site → Import from Git" and pick the repo. `netlify.toml`
   already tells it to run `python3 build.py` and publish the folder.
3. **Let the CMS log in with GitHub**:
   - On GitHub: Settings → Developer settings → OAuth Apps → New. Homepage = your Netlify URL,
     callback = `https://api.netlify.com/auth/done`.
   - On Netlify: Site configuration → Access & security → OAuth → Install provider → GitHub,
     paste the client ID and secret.
4. In `admin/config.yml`, set `repo:` to `your-username/digital-garden`, commit, push.
5. Visit `https://<your-site>/admin` (bookmark it on your phone's home screen). Each save commits
   to GitHub, Netlify rebuilds, and the garden regrows in about a minute.

## Comments

Entry pages have a comments column. To switch it on, enable Discussions on the GitHub repo, get the
IDs from https://giscus.app and paste them into `site.config.js`.
