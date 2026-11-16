/* "Grows from" picker for the CMS.
 *
 * Step 1: pick the dandelion (node) this entry belongs to — or none, to plant a new one.
 * Step 2 (optional): pick a branch inside that dandelion to grow from.
 *
 * The saved value is a single entry id in the `parent` field, exactly as before:
 * the branch if one is picked, otherwise the node. It reads the garden from the
 * published data/garden.json, so an entry planted a minute ago appears here once
 * the site has rebuilt.
 */
(function () {
  const STYLE = {
    wrap: { display: 'grid', gap: '12px' },
    row: { display: 'grid', gap: '4px' },
    label: { fontSize: '12px', fontWeight: 600, color: '#5c6070', textTransform: 'uppercase', letterSpacing: '0.04em' },
    select: { width: '100%', padding: '10px 12px', fontSize: '15px', border: '2px solid #dfdfe3', borderRadius: '5px', background: '#fff', color: '#313d3e' },
    note: { fontSize: '13px', color: '#7a7f8c', margin: 0 },
    error: { fontSize: '13px', color: '#b5312c', margin: 0 },
  };

  let gardenPromise = null;
  const loadGarden = () =>
    (gardenPromise ||= fetch('/data/garden.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((j) => j.entries || []));

  const GardenPicker = createClass({
    getInitialState() {
      return { entries: null, error: null, node: null };
    },

    componentDidMount() {
      loadGarden()
        .then((entries) => this.setState({ entries }))
        .catch(() => this.setState({ error: true }));
    },

    // Lookups built from the published garden.
    helpers() {
      const entries = this.state.entries || [];
      const byId = new Map(entries.map((e) => [e.id, e]));
      const children = new Map();
      entries.forEach((e) => {
        if (e.parent && byId.has(e.parent)) {
          if (!children.has(e.parent)) children.set(e.parent, []);
          children.get(e.parent).push(e);
        }
      });
      children.forEach((list) => list.sort((a, b) => a.title.localeCompare(b.title)));
      const rootOf = (id) => {
        let cur = byId.get(id);
        const seen = new Set();
        while (cur && cur.parent && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent); }
        return cur || null;
      };
      return { entries, byId, children, rootOf };
    },

    selfId() {
      const entry = this.props.entry;
      return entry && entry.get ? entry.get('slug') : null;
    },

    handleNode(e) {
      const id = e.target.value;
      this.setState({ node: id });
      this.props.onChange(id); // grows straight from the node until a branch is picked
    },

    handleBranch(e) {
      const id = e.target.value;
      this.props.onChange(id || this.currentNode());
    },

    currentNode() {
      if (this.state.node !== null) return this.state.node;
      const value = this.props.value || '';
      if (!value) return '';
      const root = this.helpers().rootOf(value);
      return root ? root.id : value;
    },

    render() {
      const { forID, value, classNameWrapper } = this.props;
      if (this.state.error) {
        return h('div', { className: classNameWrapper },
          h('p', { style: STYLE.error }, 'Couldn’t load the garden to pick from. Type the id of the entry this grows from:'),
          h('input', { id: forID, style: STYLE.select, value: value || '', onChange: (e) => this.props.onChange(e.target.value) }));
      }
      if (!this.state.entries) {
        return h('div', { className: classNameWrapper }, h('p', { style: STYLE.note }, 'Loading the garden…'));
      }

      const { entries, children } = this.helpers();
      const self = this.selfId();
      const nodes = entries.filter((e) => !e.parent && e.id !== self).sort((a, b) => a.title.localeCompare(b.title));
      const node = this.currentNode();

      // Every branch under the chosen node, indented by depth. Skip this entry
      // and anything growing from it, so nothing can grow from itself.
      const branchOptions = [];
      const walk = (id, depth) => {
        (children.get(id) || []).forEach((c) => {
          if (c.id === self) return;
          branchOptions.push(h('option', { key: c.id, value: c.id }, `${'   '.repeat(depth)}${depth ? '└ ' : ''}${c.title}`));
          walk(c.id, depth + 1);
        });
      };
      if (node) walk(node, 0);
      const branchValue = value && value !== node ? value : '';

      return h('div', { className: classNameWrapper, style: STYLE.wrap },
        h('div', { style: STYLE.row },
          h('label', { htmlFor: forID, style: STYLE.label }, '1. Dandelion (node)'),
          h('select', { id: forID, style: STYLE.select, value: node, onChange: this.handleNode },
            h('option', { value: '' }, '— None: plant a new dandelion —'),
            nodes.map((n) => h('option', { key: n.id, value: n.id }, n.title)))),
        node
          ? h('div', { style: STYLE.row },
              h('label', { htmlFor: forID + '-branch', style: STYLE.label }, '2. Branch (optional)'),
              branchOptions.length
                ? h('select', { id: forID + '-branch', style: STYLE.select, value: branchValue, onChange: this.handleBranch },
                    h('option', { value: '' }, '— Grow straight from the dandelion —'),
                    branchOptions)
                : h('p', { style: STYLE.note }, 'No branches yet — this will grow straight from the dandelion.'))
          : h('p', { style: STYLE.note }, 'Leaving this empty makes this entry a new dandelion in the garden.'));
    },
  });

  CMS.registerWidget('garden-parent', GardenPicker);
})();
