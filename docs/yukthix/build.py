#!/usr/bin/env python3
"""Build index.html from spec.md. No dependencies - plain Python 3.

    python3 build.py

Reads  : spec.md, style.css, app.js  (same folder)
Writes : index.html  (self-contained - CSS and JS are inlined, so the file
         can be opened, mailed or hosted on its own)

Beyond plain Markdown, the builder understands the spec's own conventions:
  - Numbered headings ("#### 1.1.7 Title") and bold module lines
    ("**1.3.5 Payroll**") become anchored sections in the contents rail
    and nodes on the system map.
  - "§1.3.5" becomes a link to that section and is recorded as a
    cross-reference; each section lists what it links to / is linked from.
  - A table whose first column is "Step" renders as a flow; a
    "Source | Feeds" table renders as dependency arrows; "Status" cells
    render as pills.
  - A chapter whose only body is "_(later)_" is marked as not drafted.
"""
import re, html, datetime, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, 'spec.md')
CSS  = os.path.join(HERE, 'style.css')
JS   = os.path.join(HERE, 'app.js')
OUT  = os.path.join(HERE, 'index.html')

HEAD_RE    = re.compile(r'^(#{1,5})\s+(.*)$')
NUM_RE     = re.compile(r'^(\d+(?:\.\d+)*)\.?\s+(.+)$')
MOD_RE     = re.compile(r'^\*\*(\d+(?:\.\d+)+)\s+(.+?)\*\*(?:\s*—\s*(.+))?$')
XREF_RE    = re.compile(r'§(\d+(?:\.\d+)*)')
ROW_NUM_RE = re.compile(r'^\d+\.\d+\.\d+$')
TABLE_SEP  = re.compile(r'^\|[\s:|-]+\|$')
LIST_RE    = re.compile(r'^(\s*)([-*]|\d+\.)\s+(.*)$')
BLOCK_START = re.compile(r'^(#{1,5}\s|\||>|\s*([-*]|\d+\.)\s|-{3,}$)')

# Section-number prefix -> product key. Drives the colour coding.
PRODUCTS = [('1.1', 'proctoring'), ('1.2', 'ats'), ('1.3', 'hrms'),
            ('1.4', 'analytics'), ('2', 'platform')]


def slug(text):
    s = re.sub(r'<[^>]+>', '', text).lower()
    s = s.replace('&amp;', '').replace('&', '')
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    return re.sub(r'[\s-]+', '-', s).strip('-')


def esc(t):
    return html.escape(t, quote=True)


def product_of(num):
    for prefix, key in PRODUCTS:
        if num and (num == prefix or num.startswith(prefix + '.')):
            return key
    return ''


def pill(text):
    return '<span class="pill pill-%s">%s</span>' % (slug(text), esc(text))


def cell(row, i):
    return row[i] if i is not None and i < len(row) else ''


def index_sections(lines):
    """num -> (id, title) for every addressable section, before rendering,
    so a §reference can link forward to a section defined later."""
    idx = {}
    for ln in lines:
        m = HEAD_RE.match(ln)
        if m and len(m.group(1)) > 1:
            nm = NUM_RE.match(m.group(2).strip())
            if nm:
                idx.setdefault(nm.group(1), (slug(m.group(2)), nm.group(2)))
            continue
        m = MOD_RE.match(ln.strip())
        if m:
            idx.setdefault(m.group(1), (slug(m.group(1) + ' ' + m.group(2)), m.group(2)))
        if ln.startswith('|'):
            cells = [c.strip() for c in ln.strip().strip('|').split('|')]
            if len(cells) > 1 and ROW_NUM_RE.match(cells[0]):
                idx.setdefault(cells[0], (slug(cells[0] + ' ' + cells[1]), cells[1]))
    return idx


class Spec:
    def __init__(self, md):
        self.lines = md.split('\n')
        self.idx = index_sections(self.lines)
        self.out, self.toc, self.sections, self.edges = [], [], [], []
        self.status, self.updated = {}, ''
        self.title = 'Working Spec'
        self.cur = None       # section number currently being written
        self.h3num = None     # enclosing numbered h3
        self.group = None     # enclosing un-numbered h4 ("Time & pay")
        self.seen_h2 = False

    # ---------- inline ----------
    def inline(self, t, record=True):
        t = html.escape(t, quote=False)
        t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
        t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
        t = re.sub(r'(?<![\w*])\*([^*]+)\*(?!\*)', r'<em>\1</em>', t)
        t = re.sub(r'(?<!\w)_([^_]+)_(?!\w)', r'<em>\1</em>', t)
        t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
        return XREF_RE.sub(lambda m: self.xref(m.group(1), record), t)

    def xref(self, num, record):
        if num not in self.idx:
            return '§' + num
        if record:
            self.add_edge(self.cur, num)
        sid, title = self.idx[num]
        return '<a class="xref" data-p="%s" href="#%s" title="%s">§%s</a>' % (
            product_of(num), sid, esc(title), num)

    def add_edge(self, src, dst):
        # Chapter-level mentions and parent/child mentions are structure, not dependencies.
        if not src or '.' not in src or src == dst:
            return
        if dst.startswith(src + '.') or src.startswith(dst + '.'):
            return
        if (src, dst) not in self.edges:
            self.edges.append((src, dst))

    # ---------- blocks ----------
    def is_placeholder(self, i):
        body = []
        for ln in self.lines[i + 1:]:
            if HEAD_RE.match(ln):
                break
            if ln.strip() and not re.match(r'^-{3,}$', ln.strip()):
                body.append(ln.strip())
        return body == ['_(later)_']

    def heading(self, lvl, txt, i):
        if lvl == 1:
            self.title = txt
            return
        nm = NUM_RE.match(txt)
        num, name = (nm.group(1), nm.group(2)) if nm else (None, txt)
        sid = slug(txt)
        later = lvl == 2 and self.is_placeholder(i)
        if lvl == 2:
            self.seen_h2, self.h3num, self.group = True, None, None
        if lvl == 3:
            self.h3num = num
        if num:
            self.cur = num
            self.group = None
        else:
            self.cur = self.h3num
            if lvl == 4:
                self.group = name
        p = product_of(num or self.h3num or '')

        cls = {2: 'chapter', 3: 'product', 4: 'section' if num else 'group'}.get(lvl, '')
        extra = pill(self.status[num]) if lvl == 3 and num in self.status else ''
        self.out.append(
            '<h%d id="%s" class="%s" data-p="%s">%s<span class="ttl">%s</span>%s'
            '<a class="anchor" href="#%s" aria-label="Copy link to %s">#</a></h%d>' % (
                lvl, sid, cls, p,
                '<span class="num">%s</span>' % esc(num) if num else '',
                self.inline(name), extra, sid, esc(name), lvl))
        if num:
            self.out.append('<!--refs:%s-->' % num)
            if '.' in num:
                self.sections.append(dict(num=num, title=name, id=sid, lvl=lvl, group=self.group))
        self.toc.append(dict(lvl=lvl, id=sid, num=num, title=name, p=p, later=later))

    def module(self, num, name, desc):
        sid = self.idx[num][0]
        self.cur, p = num, product_of(num)
        self.out.append(
            '<h5 id="%s" class="module" data-p="%s"><span class="num">%s</span>'
            '<span class="ttl">%s</span><a class="anchor" href="#%s" aria-label="Copy link to %s">#</a></h5>' % (
                sid, p, esc(num), self.inline(name), sid, esc(name)))
        self.out.append('<!--refs:%s-->' % num)
        if desc:
            self.out.append('<p class="module-desc">%s</p>' % self.inline(desc))
        self.sections.append(dict(num=num, title=name, id=sid, lvl=5, group=self.group))
        self.toc.append(dict(lvl=5, id=sid, num=num, title=name, p=p, later=False))

    def table(self, head, rows):
        h = [c.lower() for c in head]
        if h and h[0] == 'step':
            return self.flow(h, rows)
        if 'source' in h and 'feeds' in h:
            return self.deps(h, rows)
        si = h.index('status') if 'status' in h else None
        if '#' in h and si is not None:
            for r in rows:
                self.status[r[0]] = cell(r, si)

        out = ['<div class="tbl"><table><thead><tr>' +
               ''.join('<th>%s</th>' % self.inline(c) for c in head) + '</tr></thead><tbody>']
        for r in rows:
            first = cell(r, 0)
            tr = '<tr>'
            if ROW_NUM_RE.match(first) and first in self.idx:
                sid = self.idx[first][0]
                tr = '<tr id="%s" data-p="%s">' % (sid, product_of(first))
                self.sections.append(dict(num=first, title=cell(r, 1), id=sid, lvl=5, group=self.group))
                self.toc.append(dict(lvl=5, id=sid, num=first, title=cell(r, 1),
                                     p=product_of(first), later=False))
            tds = []
            for i, c in enumerate(r):
                if i == si:
                    tds.append('<td>%s</td>' % pill(c))
                elif h[i:i + 1] == ['#'] and c in self.idx and not ROW_NUM_RE.match(c):
                    tds.append('<td><a class="xref" data-p="%s" href="#%s">%s</a></td>' % (
                        product_of(c), self.idx[c][0], esc(c)))
                else:
                    tds.append('<td>%s</td>' % self.inline(c))
            out.append(tr + ''.join(tds) + '</tr>')
        out.append('</tbody></table></div>')
        self.out.extend(out)

    def flow(self, h, rows):
        oi = h.index('owner') if 'owner' in h else None
        ai = len(h) - 1
        self.out.append('<ol class="flow">')
        for r in rows:
            owner = ''
            if oi is not None:
                who = cell(r, oi)
                owner = '<span class="owner%s">%s</span>' % (' owner-ai' if who == 'AI' else '', self.inline(who))
            self.out.append('<li><span class="step" aria-label="Step %s">%s</span>'
                            '<div class="step-body">%s<span class="act">%s</span></div></li>' % (
                                esc(cell(r, 0)), esc(cell(r, 0)), owner, self.inline(cell(r, ai))))
        self.out.append('</ol>')

    def deps(self, h, rows):
        si, fi = h.index('source'), h.index('feeds')
        wi = h.index('why') if 'why' in h else None
        self.out.append('<ul class="deps">')
        for r in rows:
            for a in XREF_RE.findall(cell(r, si)):
                for b in XREF_RE.findall(cell(r, fi)):
                    self.add_edge(a, b)
            self.out.append(
                '<li><span class="dep-from">%s</span><span class="dep-arrow" aria-hidden="true">→</span>'
                '<span class="sr">feeds</span><span class="dep-to">%s</span><span class="dep-why">%s</span></li>' % (
                    self.inline(cell(r, si), False), self.inline(cell(r, fi), False), self.inline(cell(r, wi))))
        self.out.append('</ul>')

    def render(self):
        lines, out = self.lines, self.out
        i, n = 0, len(lines)
        stack = []

        def close():
            while stack:
                out.append('</%s>' % stack.pop())

        while i < n:
            ln = lines[i]

            if ln.startswith('|') and i + 1 < n and TABLE_SEP.match(lines[i + 1]):
                close()
                head = [c.strip() for c in ln.strip().strip('|').split('|')]
                i += 2
                rows = []
                while i < n and lines[i].startswith('|'):
                    rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                    i += 1
                self.table(head, rows)
                continue

            m = HEAD_RE.match(ln)
            if m:
                close()
                self.heading(len(m.group(1)), m.group(2).strip(), i)
                i += 1
                continue

            if ln.startswith('>'):
                close()
                buf = []
                while i < n and lines[i].startswith('>'):
                    buf.append(lines[i].lstrip('>').strip())
                    i += 1
                txt = ' '.join(x for x in buf if x)
                kind = 'scope' if txt.lower().startswith('out of scope') else 'note'
                out.append('<blockquote class="%s"><p>%s</p></blockquote>' % (kind, self.inline(txt)))
                continue

            if re.match(r'^-{3,}$', ln.strip()):
                close()
                if self.seen_h2:
                    out.append('<hr>')
                i += 1
                continue

            m = LIST_RE.match(ln)
            if m:
                indent, marker, txt = len(m.group(1)), m.group(2), m.group(3)
                tag = 'ol' if marker.endswith('.') else 'ul'
                depth = indent // 2 + 1
                while len(stack) > depth:
                    out.append('</%s>' % stack.pop())
                while len(stack) < depth:
                    out.append('<%s>' % tag)
                    stack.append(tag)
                out.append('<li>%s</li>' % self.inline(txt))
                i += 1
                continue

            if not ln.strip():
                close()
                i += 1
                continue

            close()
            buf = []
            while i < n and lines[i].strip() and not BLOCK_START.match(lines[i]):
                buf.append(lines[i].strip())
                i += 1
            if not buf:
                continue
            para = ' '.join(buf)
            mod = MOD_RE.match(para)
            upd = re.match(r'^\*\*Last updated:\*\*\s*(.+)$', para)
            if upd:
                self.updated = upd.group(1)
            elif para == '_(later)_':
                out.append('<div class="empty"><strong>Not drafted yet.</strong> '
                           'Write this chapter in <code>spec.md</code>, then run <code>python3 build.py</code>.</div>')
            elif mod and mod.group(1) in self.idx:
                self.module(mod.group(1), mod.group(2), mod.group(3))
            else:
                out.append('<p>%s</p>' % self.inline(para))

        close()
        body = '\n'.join(out)
        return re.sub(r'<!--refs:([\d.]+)-->', lambda m: self.refs(m.group(1)), body)

    # ---------- derived views ----------
    def chip(self, num):
        sid, title = self.idx[num]
        return '<a class="xref xref-full" data-p="%s" href="#%s"><span class="num">§%s</span>%s</a>' % (
            product_of(num), sid, esc(num), esc(title))

    def refs(self, num):
        outs = [d for s, d in self.edges if s == num]
        ins = [s for s, d in self.edges if d == num]
        if not outs and not ins:
            return ''
        parts = []
        if outs:
            parts.append('<span class="refs-group"><span class="refs-label">Links to</span>%s</span>' %
                         ''.join(self.chip(x) for x in outs))
        if ins:
            parts.append('<span class="refs-group"><span class="refs-label">Linked from</span>%s</span>' %
                         ''.join(self.chip(x) for x in ins))
        return '<div class="refs">%s</div>' % ''.join(parts)

    def children(self, num):
        depth = num.count('.') + 1
        return [s for s in self.sections if s['num'].startswith(num + '.') and s['num'].count('.') == depth]

    def map_groups(self, mods):
        groups = []
        for s in mods:
            if not groups or groups[-1][0] != s['group']:
                groups.append((s['group'], []))
            groups[-1][1].append(s)
        out = []
        for g, ms in groups:
            out.append('<div class="map-group">%s<div class="chips">%s</div></div>' % (
                '<div class="map-group-label">%s</div>' % esc(g) if g else '',
                ''.join('<a class="node chip" href="#%s" data-num="%s"><span class="num">%s</span>'
                        '<span class="nm">%s</span></a>' % (s['id'], esc(s['num']), esc(s['num']), esc(s['title']))
                        for s in ms)))
        return ''.join(out)

    def build_map(self):
        products = [s for s in self.sections if s['lvl'] == 3 and s['num'].startswith('1.')]
        cols = []
        for pr in products:
            mods = self.children(pr['num'])
            cols.append(
                '<div class="col" data-p="%s"><a class="node col-head" href="#%s" data-num="%s">'
                '<span class="col-title"><span class="num">%s</span><span class="nm">%s</span></span>'
                '<span class="col-meta">%s<span class="count">%d modules</span></span></a>'
                '<div class="col-body">%s</div></div>' % (
                    product_of(pr['num']), pr['id'], esc(pr['num']), esc(pr['num']), esc(pr['title']),
                    pill(self.status[pr['num']]) if pr['num'] in self.status else '',
                    len(mods), self.map_groups(mods)))
        base = next((s for s in self.sections if s['num'] == '2.1'), None)
        foundation = ''
        if base:
            mods = self.children('2.1')
            foundation = (
                '<div class="foundation" data-p="platform"><a class="node col-head" href="#%s" data-num="2.1">'
                '<span class="col-title"><span class="num">2.1</span><span class="nm">%s</span></span>'
                '<span class="col-meta"><span class="count">%d shared services · used by every product</span></span></a>'
                '<div class="foundation-body">%s</div></div>' % (
                    base['id'], esc(base['title']), len(mods), self.map_groups(mods)))
        return '''<section class="map" aria-labelledby="map-title">
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
  <div class="map-canvas">
    <svg class="wires" aria-hidden="true"></svg>
    <div class="products">%s</div>
    %s
  </div>
</section>''' % (''.join(cols), foundation), len(products), sum(len(self.children(p['num'])) for p in products), \
            len(self.children('2.1')) if base else 0


def build_toc(items):
    root = dict(lvl=1, kids=[])
    stack = [root]
    for it in items:
        node = dict(it, kids=[])
        while stack[-1]['lvl'] >= node['lvl']:
            stack.pop()
        stack[-1]['kids'].append(node)
        stack.append(node)

    def li(nd):
        kids, open_ = nd['kids'], nd['lvl'] == 2 and nd['kids']
        cls = ['l%d' % nd['lvl']]
        if kids:
            cls.append('branch')
        if open_:
            cls.append('open')
        if nd['later']:
            cls.append('later')
        toggle = ('<button class="tw" type="button" aria-expanded="%s" aria-label="Show sections in %s"></button>' % (
            'true' if open_ else 'false', esc(nd['title'])) if kids else '<span class="tw-space"></span>')
        return '<li class="%s" data-p="%s"><div class="row">%s<a href="#%s">%s <span class="tt">%s</span>%s</a></div>%s</li>' % (
            ' '.join(cls), nd['p'], toggle, nd['id'],
            '<span class="tn">%s</span>' % esc(nd['num']) if nd['num'] else '',
            esc(nd['title']),
            '<span class="tag">later</span>' if nd['later'] else '',
            '<ul>%s</ul>' % ''.join(li(k) for k in kids) if kids else '')

    return '<ul>%s</ul>' % ''.join(li(k) for k in root['kids'])


TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{{TITLE}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
{{CSS}}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="progress" aria-hidden="true"><span></span></div>
<div class="shell">
  <aside class="rail" id="rail">
    <div class="brand">
      <div class="brand-name">{{NAME}}</div>
      <div class="brand-sub">{{SUB}}</div>
    </div>
    <label class="filter">
      <span class="sr">Filter sections</span>
      <input id="filter" type="search" placeholder="Filter by name or number" autocomplete="off">
      <kbd aria-hidden="true">/</kbd>
    </label>
    <nav aria-label="Contents">{{TOC}}</nav>
    <p class="filter-empty" hidden>No sections match. Try a module number, such as 1.3.5.</p>
    <p class="built">Built from spec.md · {{BUILT}}</p>
  </aside>
  <div class="scrim"></div>
  <main class="page" id="main">
    <header class="hero">
      <p class="eyebrow"><span>{{SUB}}</span>{{UPDATED}}</p>
      <h1>{{NAME}}</h1>
      <ul class="facts">{{FACTS}}</ul>
    </header>
    {{MAP}}
    <article class="doc">
{{BODY}}
    </article>
  </main>
</div>
<button class="menu" type="button" aria-controls="rail" aria-expanded="false">Contents</button>
<script>window.GRAPH = {{GRAPH}};</script>
<script>
{{JS}}
</script>
</body>
</html>
'''


def main():
    spec = Spec(open(SRC, encoding='utf-8').read())
    body = spec.render()
    map_html, n_products, n_modules, n_services = spec.build_map()

    name, _, sub = spec.title.partition(' — ')
    sub = sub or 'Working spec'
    chapters = [t for t in spec.toc if t['lvl'] == 2]
    drafted = sum(1 for t in chapters if not t['later'])
    across = sum(1 for s, d in spec.edges if product_of(s) != product_of(d))
    facts = [
        (n_products, 'products'),
        (n_modules, 'modules'),
        (n_services, 'platform services'),
        (len(spec.edges), 'cross-references'),
        (across, 'between products'),
        ('%d of %d' % (drafted, len(chapters)), 'chapters drafted'),
    ]
    graph = json.dumps({'edges': spec.edges, 'titles': {k: v[1] for k, v in spec.idx.items()}})

    fill = {
        'TITLE': esc(spec.title),
        'NAME': esc(name),
        'SUB': esc(sub),
        'UPDATED': '<span>Last updated %s</span>' % esc(spec.updated) if spec.updated else '',
        'FACTS': ''.join('<li><b>%s</b> %s</li>' % (esc(str(v)), esc(k)) for v, k in facts),
        'BUILT': datetime.datetime.now().strftime('%d %B %Y, %H:%M'),
        'TOC': build_toc(spec.toc),
        'MAP': map_html,
        'BODY': body,
        'GRAPH': graph.replace('</', '<\\/'),
        'CSS': open(CSS, encoding='utf-8').read(),
        'JS': open(JS, encoding='utf-8').read(),
    }
    doc = re.sub(r'\{\{(\w+)\}\}', lambda m: fill[m.group(1)], TEMPLATE)

    open(OUT, 'w', encoding='utf-8').write(doc)
    print('Built index.html - %d sections, %d cross-references, %s bytes' % (
        len(spec.toc), len(spec.edges), format(len(doc), ',')))


if __name__ == '__main__':
    main()
