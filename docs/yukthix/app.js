/* YukthiX working spec.
   Turns the plain HTML inside <main id="spec"> into the full page on load:
   contents rail, system map, cross-reference links, step flows and pills.
   No build step - edit index.html and reload. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = t => t.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '');
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();

  const NUM = /^(\d+(?:\.\d+)*)\.?\s+(.+)$/;
  const MODULE = /^(\d+(?:\.\d+)+)\s+(.+)$/;
  const ROW_NUM = /^\d+\.\d+\.\d+$/;
  const XREF = /§(\d+(?:\.\d+)*)/g;
  const PLACEHOLDER = /^_?\(later\)_?$/i;

  // Product colour keys, matched by section title so chapters can be renumbered freely.
  const PRODUCT_KEYS = { proctoring: 'proctoring', ats: 'ats', hrms: 'hrms', analytics: 'analytics', 'platform-foundation': 'platform', platform: 'platform' };
  const ACCESS = { '●': 'Full access', '◐': 'Partial access' };
  const prefixes = [];  // [section number, product key], filled while indexing
  const productOf = num => (prefixes.find(([p]) => num && (num === p || num.startsWith(p + '.'))) || [])[1] || '';

  /* =====================================================================
     Build: plain content -> enhanced page
     ===================================================================== */
  function build() {
    const src = $('#spec');
    const h1 = $('h1', src);
    const [name, sub = 'Working spec'] = (h1 ? text(h1) : document.title).split(' — ');
    if (h1) h1.remove();

    let updated = '';
    for (const el of [...src.children]) {
      if (el.tagName === 'H2') break;
      const m = text(el).match(/^Last updated:\s*(.+)$/i);
      if (m) updated = m[1];
      if (m || el.tagName === 'HR') el.remove();
    }

    const moduleMatch = el => {
      const s = el.tagName === 'P' && el.firstElementChild;
      if (!s || s.tagName !== 'STRONG' || !text(el).startsWith(text(s))) return null;
      return text(s).match(MODULE);
    };

    // Index every addressable section first, so a § link can point forward.
    const idx = new Map();
    let personaNum = null, featuresNum = null;
    const isPersona = num => !!personaNum && !!num && num.startsWith(personaNum + '.');
    for (const el of src.children) {
      if (/^H[2-5]$/.test(el.tagName)) {
        if (!el.id) el.id = slug(text(el));
        const m = text(el).match(NUM);
        if (m && !idx.has(m[1])) idx.set(m[1], { id: el.id, title: m[2] });
        if (m && PRODUCT_KEYS[slug(m[2])]) prefixes.push([m[1], PRODUCT_KEYS[slug(m[2])]]);
        if (m && /^personas?$/i.test(m[2])) personaNum = m[1];
        if (m && el.tagName === 'H2' && /^features$/i.test(m[2])) featuresNum = m[1];
      } else if (moduleMatch(el)) {
        const m = moduleMatch(el);
        if (!idx.has(m[1])) idx.set(m[1], { id: slug(m[0]), title: m[2] });
      } else if (el.tagName === 'TABLE') {
        for (const tr of $$('tbody tr', el)) {
          const [a, b] = tr.cells;
          if (a && b && ROW_NUM.test(text(a)) && !idx.has(text(a))) {
            tr.id = slug(text(a) + ' ' + text(b));
            idx.set(text(a), { id: tr.id, title: text(b) });
          }
        }
      }
    }

    const toc = [], sections = [], edges = [], status = new Map();
    let cur = null, h3num = null, group = null;

    const addEdge = (from, to) => {
      // Chapter-level and parent/child mentions are structure, not dependencies.
      if (!from || !from.includes('.') || from === to) return;
      if (to.startsWith(from + '.') || from.startsWith(to + '.')) return;
      if (!edges.some(([a, b]) => a === from && b === to)) edges.push([from, to]);
    };
    const xrefHTML = num => {
      const s = idx.get(num);
      return `<a class="xref" data-p="${productOf(num)}" href="#${s.id}" title="${esc(s.title)}">§${esc(num)}</a>`;
    };
    function linkify(root, record = true) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n.nodeValue.includes('§') && !n.parentElement.closest('a, code')) hits.push(n);
      }
      for (const n of hits) {
        const parts = n.nodeValue.split(/(§\d+(?:\.\d+)*)/);
        if (parts.length === 1) continue;
        const tmp = document.createElement('span');
        tmp.innerHTML = parts.map(p => {
          const num = p.startsWith('§') ? p.slice(1) : '';
          if (!idx.has(num)) return esc(p);
          if (record) addEdge(cur, num);
          return xrefHTML(num);
        }).join('');
        n.replaceWith(...tmp.childNodes);
      }
    }

    const anchor = (id, label) => `<a class="anchor" href="#${id}" aria-label="Copy link to ${esc(label)}">#</a>`;
    const pill = t => `<span class="pill pill-${slug(t)}">${esc(t)}</span>`;
    const makeSlot = num => { const d = document.createElement('div'); d.className = 'refs'; d.dataset.refs = num; return d; };
    const isPlaceholder = el => el.tagName === 'P' && PLACEHOLDER.test(text(el));
    const chapterIsEmpty = h2 => {
      const body = [];
      for (let el = h2.nextElementSibling; el && !/^H[2-5]$/.test(el.tagName); el = el.nextElementSibling) {
        if (el.tagName !== 'HR') body.push(el);
      }
      return body.length > 0 && body.every(isPlaceholder);
    };

    for (const el of [...src.children]) {
      const tag = el.tagName;

      if (/^H[2-5]$/.test(tag)) {
        const lvl = +tag[1];
        const label = text(el);
        const m = label.match(NUM);
        const [num, title] = m ? [m[1], m[2]] : [null, label];
        const later = lvl === 2 && chapterIsEmpty(el);
        if (lvl === 2) { h3num = null; group = null; }
        if (lvl === 3) h3num = num;
        if (num) {
          cur = num;
          if (lvl <= 4) group = null;
        } else {
          cur = h3num;
          if (lvl === 4) group = title;
        }
        const p = productOf(num || h3num || '');
        el.className = { 2: 'chapter', 3: 'product', 4: num ? 'section' : 'group', 5: num ? 'module' : 'group' }[lvl];
        el.dataset.p = p;
        el.innerHTML = (num ? `<span class="num">${esc(num)}</span>` : '') +
          `<span class="ttl">${esc(title)}</span>` +
          (lvl === 3 && status.has(num) ? pill(status.get(num)) : '') +
          anchor(el.id, title);
        if (num) {
          if (!isPersona(num)) el.after(makeSlot(num));
          if (num.includes('.')) sections.push({ num, title, id: el.id, lvl, group });
        }
        toc.push({ lvl, id: el.id, num, title, p, later });

      } else if (moduleMatch(el)) {
        const [whole, num, title] = moduleMatch(el);
        const id = slug(whole), p = productOf(num);
        cur = num;
        const h5 = document.createElement('h5');
        h5.id = id;
        h5.className = 'module';
        h5.dataset.p = p;
        h5.innerHTML = `<span class="num">${esc(num)}</span><span class="ttl">${esc(title)}</span>${anchor(id, title)}`;
        el.before(h5);
        if (!isPersona(num)) h5.after(makeSlot(num));
        el.firstElementChild.remove();
        if (el.firstChild && el.firstChild.nodeType === 3) {
          el.firstChild.nodeValue = el.firstChild.nodeValue.replace(/^\s*[—–-]\s*/, '');
        }
        if (text(el)) {
          el.className = 'module-desc';
          linkify(el);
        } else {
          el.remove();
        }
        sections.push({ num, title, id, lvl: 5, group });
        toc.push({ lvl: 5, id, num, title, p, later: false });

      } else if (isPlaceholder(el)) {
        el.outerHTML = '<div class="empty"><strong>Not drafted yet.</strong> Write this chapter in <code>index.html</code> and reload.</div>';

      } else if (tag === 'TABLE') {
        const head = $$('thead th', el).map(th => text(th).toLowerCase());
        const rows = $$('tbody tr', el);
        const col = h => head.indexOf(h);

        if (head[0] === 'step') {
          linkify(el);
          const oi = col('owner'), ai = head.length - 1;
          const ol = document.createElement('ol');
          ol.className = 'flow';
          ol.innerHTML = rows.map(tr => {
            const c = tr.cells, step = text(c[0]);
            const who = oi >= 0 && c[oi]
              ? `<span class="owner${text(c[oi]) === 'AI' ? ' owner-ai' : ''}">${c[oi].innerHTML}</span>` : '';
            return `<li><span class="step" aria-label="Step ${esc(step)}">${esc(step)}</span>` +
              `<div class="step-body">${who}<span class="act">${c[ai] ? c[ai].innerHTML : ''}</span></div></li>`;
          }).join('');
          el.replaceWith(ol);

        } else if (head.includes('source') && head.includes('feeds')) {
          const si = col('source'), fi = col('feeds'), wi = col('why');
          for (const tr of rows) {
            for (const [, a] of text(tr.cells[si]).matchAll(XREF)) {
              for (const [, b] of text(tr.cells[fi]).matchAll(XREF)) addEdge(a, b);
            }
          }
          linkify(el, false);
          const ul = document.createElement('ul');
          ul.className = 'deps';
          ul.innerHTML = rows.map(tr => {
            const c = tr.cells;
            return `<li><span class="dep-from">${c[si].innerHTML}</span><span class="dep-arrow" aria-hidden="true">→</span>` +
              `<span class="sr">feeds</span><span class="dep-to">${c[fi].innerHTML}</span>` +
              `<span class="dep-why">${wi >= 0 && c[wi] ? c[wi].innerHTML : ''}</span></li>`;
          }).join('');
          el.replaceWith(ul);

        } else {
          const si = col('status'), hi = col('#');
          linkify(el);
          // Access marks (● full, ◐ partial) take the colour of the product named in their column.
          head.forEach((h, i) => {
            const key = PRODUCT_KEYS[slug(h)];
            if (!key) return;
            for (const tr of rows) {
              const c = tr.cells[i];
              const label = c && ACCESS[text(c)];
              if (!label) continue;
              c.dataset.p = key;
              c.classList.add('mark');
              c.innerHTML = `<span role="img" aria-label="${label}" title="${label}">${esc(text(c))}</span>`;
            }
          });
          for (const tr of rows) {
            const c = tr.cells;
            const first = c[0] ? text(c[0]) : '';
            if (hi >= 0 && si >= 0) status.set(first, text(c[si]));
            if (si >= 0 && c[si]) c[si].innerHTML = pill(text(c[si]));
            if (hi >= 0 && c[hi] && idx.has(text(c[hi])) && !ROW_NUM.test(text(c[hi]))) {
              const n = text(c[hi]);
              c[hi].innerHTML = `<a class="xref" data-p="${productOf(n)}" href="#${idx.get(n).id}">${esc(n)}</a>`;
            }
            if (tr.id && ROW_NUM.test(first) && c[1]) {
              tr.dataset.p = productOf(first);
              sections.push({ num: first, title: text(c[1]), id: tr.id, lvl: 5, group });
              toc.push({ lvl: 5, id: tr.id, num: first, title: text(c[1]), p: productOf(first), later: false });
            }
          }
          const wrap = document.createElement('div');
          wrap.className = 'tbl';
          el.replaceWith(wrap);
          wrap.append(el);
        }

      } else if (tag === 'BLOCKQUOTE') {
        el.classList.add(/^out of scope/i.test(text(el)) ? 'scope' : 'note');
        linkify(el);

      } else {
        linkify(el);
      }
    }

    /* ---- "Links to / Linked from" under each section ---- */
    const chip = num => {
      const s = idx.get(num);
      return `<a class="xref xref-full" data-p="${productOf(num)}" href="#${s.id}"><span class="num">§${esc(num)}</span>${esc(s.title)}</a>`;
    };
    for (const slot of $$('.refs[data-refs]', src)) {
      const num = slot.dataset.refs;
      const outs = edges.filter(([a]) => a === num).map(([, b]) => b);
      const ins = edges.filter(([, b]) => b === num).map(([a]) => a);
      const users = ins.filter(isPersona);
      const from = ins.filter(a => !isPersona(a));
      if (!outs.length && !ins.length) { slot.remove(); continue; }
      const group = (label, nums) => nums.length
        ? `<span class="refs-group"><span class="refs-label">${label}</span>${nums.map(chip).join('')}</span>` : '';
      slot.innerHTML = group('Links to', outs) + group('Linked from', from) + group('Used by', users);
    }

    /* ---- contents rail ---- */
    const root = { lvl: 1, kids: [] };
    const stack = [root];
    for (const it of toc) {
      const node = { ...it, kids: [] };
      while (stack[stack.length - 1].lvl >= node.lvl) stack.pop();
      stack[stack.length - 1].kids.push(node);
      stack.push(node);
    }
    const li = n => {
      const kids = n.kids.length > 0, open = kids && n.lvl === 2;
      const cls = [`l${n.lvl}`, kids && 'branch', open && 'open', n.later && 'later'].filter(Boolean).join(' ');
      const tw = kids
        ? `<button class="tw" type="button" aria-expanded="${open}" aria-label="Show sections in ${esc(n.title)}"></button>`
        : '<span class="tw-space"></span>';
      return `<li class="${cls}" data-p="${n.p}"><div class="row">${tw}<a href="#${n.id}">` +
        (n.num ? `<span class="tn">${esc(n.num)}</span> ` : '') +
        `<span class="tt">${esc(n.title)}</span>${n.later ? '<span class="tag">later</span>' : ''}</a></div>` +
        (kids ? `<ul>${n.kids.map(li).join('')}</ul>` : '') + '</li>';
    };

    /* ---- system map ---- */
    const children = num => {
      const depth = num.split('.').length + 1;
      return sections.filter(s => s.num.startsWith(num + '.') && s.num.split('.').length === depth);
    };
    const chips = mods => {
      const groups = [];
      for (const s of mods) {
        if (!groups.length || groups[groups.length - 1].name !== s.group) groups.push({ name: s.group, items: [] });
        groups[groups.length - 1].items.push(s);
      }
      return groups.map(g => `<div class="map-group">` +
        (g.name ? `<div class="map-group-label">${esc(g.name)}</div>` : '') +
        `<div class="chips">${g.items.map(s =>
          `<a class="node chip" href="#${s.id}" data-num="${esc(s.num)}"><span class="num">${esc(s.num)}</span><span class="nm">${esc(s.title)}</span></a>`
        ).join('')}</div></div>`).join('');
    };
    const products = featuresNum ? sections.filter(s => s.lvl === 3 && s.num.startsWith(featuresNum + '.')) : [];
    const cols = products.map(pr => {
      const mods = children(pr.num);
      return `<div class="col" data-p="${productOf(pr.num)}">` +
        `<a class="node col-head" href="#${pr.id}" data-num="${esc(pr.num)}">` +
        `<span class="col-title"><span class="num">${esc(pr.num)}</span><span class="nm">${esc(pr.title)}</span></span>` +
        `<span class="col-meta">${status.has(pr.num) ? pill(status.get(pr.num)) : ''}<span class="count">${mods.length} modules</span></span></a>` +
        `<div class="col-body">${chips(mods)}</div></div>`;
    }).join('');
    const base = sections.find(s => s.lvl === 3 && productOf(s.num) === 'platform');
    const services = base ? children(base.num) : [];
    const foundation = base
      ? `<div class="foundation" data-p="platform"><a class="node col-head" href="#${base.id}" data-num="${esc(base.num)}">` +
        `<span class="col-title"><span class="num">${esc(base.num)}</span><span class="nm">${esc(base.title)}</span></span>` +
        `<span class="col-meta"><span class="count">${services.length} shared services · used by every product</span></span></a>` +
        `<div class="foundation-body">${chips(services)}</div></div>`
      : '';
    const mapHTML = `<section class="map" aria-labelledby="map-title">
      <div class="map-head">
        <div>
          <h2 id="map-title">System map</h2>
          <p>Four products on one shared platform. Each product keeps its colour throughout the spec, so a link's colour shows which product it points into.</p>
        </div>
        <div class="map-legend">
          <span class="lg lg-out">Links to</span><span class="lg lg-in">Linked from</span>
          <button class="map-toggle" type="button" aria-pressed="false">Show all links</button>
        </div>
      </div>
      <p class="trace" aria-live="polite">Hover over or tab to a module to see its cross-references. Select it to open that section.</p>
      <div class="map-canvas"><svg class="wires" aria-hidden="true"></svg><div class="products">${cols}</div>${foundation}</div>
    </section>`;

    /* ---- facts + page shell ---- */
    const chapters = toc.filter(t => t.lvl === 2);
    const facts = [
      [products.length, 'products'],
      [products.reduce((n, p) => n + children(p.num).length, 0), 'modules'],
      [services.length, 'platform services'],
      [sections.filter(s => isPersona(s.num)).length, 'personas'],
      [edges.filter(([a]) => !isPersona(a)).length, 'cross-references'],
      [edges.filter(([a, b]) => productOf(a) && productOf(b) && productOf(a) !== productOf(b)).length, 'between products'],
      [`${chapters.filter(c => !c.later).length} of ${chapters.length}`, 'chapters drafted'],
    ];

    const shell = document.createElement('div');
    shell.className = 'shell';
    shell.innerHTML = `
      <aside class="rail" id="rail">
        <div class="brand"><div class="brand-name">${esc(name)}</div><div class="brand-sub">${esc(sub)}</div></div>
        <label class="filter"><span class="sr">Filter sections</span>
          <input id="filter" type="search" placeholder="Filter by name or number" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
        <nav aria-label="Contents"><ul>${root.kids.map(li).join('')}</ul></nav>
        <p class="filter-empty" hidden>No sections match. Try a module number, such as 2.3.5.</p>
        <p class="built">Edit index.html and reload to update this page.</p>
      </aside>
      <div class="scrim"></div>
      <main class="page" id="main">
        <header class="hero">
          <p class="eyebrow"><span>${esc(sub)}</span>${updated ? `<span>Last updated ${esc(updated)}</span>` : ''}</p>
          <h1>${esc(name)}</h1>
          <ul class="facts">${facts.map(([v, k]) => `<li><b>${esc(v)}</b> ${esc(k)}</li>`).join('')}</ul>
        </header>
        ${mapHTML}
        <article class="doc"></article>
      </main>`;
    $('.doc', shell).append(...src.childNodes);
    src.replaceWith(shell);
    document.body.insertAdjacentHTML('afterbegin',
      '<a class="skip" href="#main">Skip to content</a><div class="progress" aria-hidden="true"><span></span></div>');
    document.body.insertAdjacentHTML('beforeend',
      '<button class="menu" type="button" aria-controls="rail" aria-expanded="false">Contents</button>');

    return { edges, titles: Object.fromEntries([...idx].map(([k, v]) => [k, v.title])) };
  }

  /* =====================================================================
     Interactions
     ===================================================================== */
  function interact(graph) {
    const rail = $('.rail');
    const nav = $('.rail nav');
    const box = $('#filter');
    const noMatch = $('.filter-empty');
    const bar = $('.progress');
    const menu = $('.menu');

    /* ---------- contents: expand and collapse ---------- */
    // Branches follow the reading position; ones opened by hand stay open.
    const branches = $$('li.branch', nav);
    const pinned = new Set(branches.filter(li => li.classList.contains('open')));
    let active = null;
    let query = '';

    function setOpen(li, open) {
      li.classList.toggle('open', open);
      const tw = li.querySelector(':scope > .row > .tw');
      if (tw) tw.setAttribute('aria-expanded', String(open));
    }
    function follow() {
      if (query) return;
      branches.forEach(li => setOpen(li, pinned.has(li) || (!!active && li.contains(active))));
    }
    function setNav(open) {
      document.body.classList.toggle('nav-open', open);
      menu.setAttribute('aria-expanded', String(open));
    }

    nav.addEventListener('click', e => {
      const tw = e.target.closest('.tw');
      if (tw) {
        const li = tw.closest('li');
        const open = !li.classList.contains('open');
        setOpen(li, open);
        open ? pinned.add(li) : pinned.delete(li);
      } else if (e.target.closest('a')) {
        setNav(false);
      }
    });
    menu.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
    $('.scrim').addEventListener('click', () => setNav(false));

    /* ---------- reading position ---------- */
    const links = $$('.row > a', nav);
    const linkFor = new Map(links.map(a => [decodeURIComponent(a.hash.slice(1)), a]));
    const targets = [...linkFor.keys()].map(id => document.getElementById(id)).filter(Boolean);

    function keepInView(a) {
      const r = a.getBoundingClientRect();
      const view = rail.getBoundingClientRect();
      if (r.top < view.top + 96 || r.bottom > view.bottom - 48) {
        rail.scrollTop += r.top - view.top - view.height / 3;
      }
    }
    function activate(a) {
      if (a === active) return;
      if (active) {
        active.classList.remove('active');
        active.removeAttribute('aria-current');
      }
      active = a;
      if (a) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'true');
        bar.dataset.p = a.closest('li').dataset.p || '';
      }
      follow();
      if (a) keepInView(a);
    }

    let ticking = false;
    function measure() {
      ticking = false;
      let cur = null;
      for (const t of targets) {
        if (t.getBoundingClientRect().top <= 120) cur = t;
        else break;
      }
      activate(cur ? linkFor.get(cur.id) : null);
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.setProperty('--progress', max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    }
    addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(measure); }
    }, { passive: true });

    // Ids only exist once the page is built, so honour a #hash in the URL now.
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ behavior: 'instant' });
    measure();

    /* ---------- filter ---------- */
    // A match keeps its ancestors visible; a matching branch keeps its children.
    function applyFilter() {
      query = box.value.trim().toLowerCase();
      if (!query) {
        $$('li', nav).forEach(li => { li.hidden = false; });
        noMatch.hidden = true;
        follow();
        return;
      }
      const visit = (li, forced) => {
        const own = li.querySelector(':scope > .row > a').textContent.toLowerCase().includes(query);
        let kidMatched = false;
        for (const kid of $$(':scope > ul > li', li)) {
          if (visit(kid, forced || own)) kidMatched = true;
        }
        li.hidden = !(forced || own || kidMatched);
        if (li.classList.contains('branch')) setOpen(li, kidMatched);
        return own || kidMatched;
      };
      let any = false;
      for (const li of $$(':scope > ul > li', nav)) {
        if (visit(li, false)) any = true;
      }
      noMatch.hidden = any;
    }
    box.addEventListener('input', applyFilter);
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        box.value = '';
        applyFilter();
        box.blur();
      } else if (e.key === 'Enter') {
        const first = links.find(a => !a.closest('li[hidden]') && a.textContent.toLowerCase().includes(query));
        if (first) {
          location.hash = first.hash;
          box.blur();
          setNav(false);
        }
      }
    });
    addEventListener('keydown', e => {
      if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) {
        e.preventDefault();
        setNav(true);
        box.focus();
      } else if (e.key === 'Escape') {
        setNav(false);
      }
    });

    /* ---------- copy section links ---------- */
    document.addEventListener('click', e => {
      const a = e.target.closest('.anchor');
      if (!a || !navigator.clipboard) return;
      navigator.clipboard.writeText(location.href.split('#')[0] + a.hash).then(() => {
        a.classList.add('copied');
        setTimeout(() => a.classList.remove('copied'), 1400);
      }, () => {});
    });

    /* ---------- system map: trace cross-references ---------- */
    const map = $('.map');
    if (!map) return;

    const canvas = $('.map-canvas', map);
    const svg = $('.wires', map);
    const readout = $('.trace', map);
    const toggle = $('.map-toggle', map);
    const hint = readout.textContent;
    const NS = 'http://www.w3.org/2000/svg';

    const nodes = new Map($$('.node', map).map(n => [n.dataset.num, n]));
    const outs = new Map();
    const ins = new Map();
    const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    const edges = graph.edges.filter(([s, d]) => nodes.has(s) && nodes.has(d));
    edges.forEach(([s, d]) => { push(outs, s, d); push(ins, d, s); });

    const productIn = n => (n.closest('[data-p]') || { dataset: {} }).dataset.p || 'none';
    const name = num => `${num} ${graph.titles[num] || ''}`.trim();

    // Curve from a to b; the dot marks the end being pointed at.
    function wire(a, b, kind, colourFrom) {
      const c = canvas.getBoundingClientRect();
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const ay = ra.top + ra.height / 2 - c.top;
      const by = rb.top + rb.height / 2 - c.top;
      let ax, bx, c1, c2;
      if (Math.abs(ra.left - rb.left) < 24) {
        ax = ra.right - c.left;
        bx = rb.right - c.left;
        const reach = Math.min(70, 18 + Math.abs(by - ay) / 8);
        c1 = ax + reach;
        c2 = bx + reach;
      } else if (rb.left > ra.left) {
        ax = ra.right - c.left;
        bx = rb.left - c.left;
        c1 = c2 = (ax + bx) / 2;
      } else {
        ax = ra.left - c.left;
        bx = rb.right - c.left;
        c1 = c2 = (ax + bx) / 2;
      }
      const colour = `var(--c-${productIn(colourFrom)})`;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${ax},${ay} C${c1},${ay} ${c2},${by} ${bx},${by}`);
      path.setAttribute('class', `wire ${kind}`);
      path.style.setProperty('--wc', colour);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', bx);
      dot.setAttribute('cy', by);
      dot.setAttribute('r', kind === 'all' ? 2.5 : 3.25);
      dot.setAttribute('class', `wire-end ${kind}`);
      dot.style.setProperty('--wc', colour);
      svg.append(path, dot);
    }

    let current = null;
    const showAll = () => toggle.getAttribute('aria-pressed') === 'true';

    function reset() {
      current = null;
      canvas.classList.remove('tracing');
      nodes.forEach(n => n.classList.remove('is-src', 'is-out', 'is-in'));
      svg.replaceChildren();
      readout.textContent = hint;
      if (showAll()) edges.forEach(([s, d]) => wire(nodes.get(s), nodes.get(d), 'all', nodes.get(d)));
    }

    function trace(node) {
      if (node === current) return;
      current = node;
      svg.replaceChildren();
      nodes.forEach(n => n.classList.remove('is-src', 'is-out', 'is-in'));
      canvas.classList.add('tracing');
      node.classList.add('is-src');

      const num = node.dataset.num;
      const o = outs.get(num) || [];
      const i = ins.get(num) || [];
      o.forEach(d => { const t = nodes.get(d); t.classList.add('is-out'); wire(node, t, 'out', t); });
      i.forEach(s => { const t = nodes.get(s); t.classList.add('is-in'); wire(t, node, 'in', t); });

      if (!o.length && !i.length) {
        readout.textContent = `${name(num)} has no cross-references in the spec yet.`;
      } else {
        const parts = [];
        if (o.length) parts.push(`links to ${o.map(name).join(', ')}`);
        if (i.length) parts.push(`linked from ${i.map(name).join(', ')}`);
        readout.textContent = `${name(num)}: ${parts.join(' · ')}`;
      }
    }

    canvas.addEventListener('pointerover', e => {
      const n = e.target.closest('.node');
      if (n) trace(n);
      else if (current) reset();
    });
    canvas.addEventListener('pointerleave', reset);
    canvas.addEventListener('focusin', e => {
      const n = e.target.closest('.node');
      if (n) trace(n);
    });
    canvas.addEventListener('focusout', e => {
      if (!canvas.contains(e.relatedTarget)) reset();
    });
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-pressed', String(!showAll()));
      if (!current) reset();
    });
    addEventListener('resize', () => {
      const n = current;
      reset();
      if (n) trace(n);
    });
  }

  try {
    interact(build());
  } catch (err) {
    console.error('Spec page could not be built:', err);
  } finally {
    document.body.classList.add('ready');
  }
})();
