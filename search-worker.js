/* Full-text search worker — MiniSearch over article-level units. */
importScripts('vendor/minisearch.js');

const STOP = new Set(('a an and are as at be been but by for from had has have he her hers him his i if in into is it its me my of on or our ours she so than that the their theirs them then there these they this those to us was we were what when where which who will with you your yours').split(' '));

const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// same length as input → positions map 1:1 back to the original text
const foldKeep = s => { let o = ''; for (const ch of s) { const f = fold(ch); o += f.length === 1 ? f : (f[0] || ch); } return o; };

let ms = null, units = null, byKey = null, ready = null;

function load(url) {
  if (ready) return ready;
  ready = fetch(url).then(r => r.json()).then(data => {
    units = data;
    byKey = new Map();
    units.forEach((u, i) => { u.id = i; if (u.n) byKey.set(u.d + '#' + u.n, i); });
    ms = new MiniSearch({
      fields: ['t', 'h', 'f'],
      storeFields: [],
      processTerm: term => {
        const t = fold(term);
        if (t.length < 2 && !/\d/.test(t)) return null;
        if (STOP.has(t)) return null;
        return t;
      },
      tokenize: s => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
      searchOptions: { processTerm: t => fold(t) }
    });
    ms.addAll(units);
    postMessage({ type: 'ready', count: units.length });
  });
  return ready;
}

function parseQuery(q) {
  const phrases = [];
  const rest = q.replace(/"([^"]+)"|«([^»]+)»|“([^”]+)”/g, (_, a, b, c) => { phrases.push(a || b || c); return ' '; });
  const words = (rest + ' ' + phrases.join(' ')).split(/[^\p{L}\p{N}]+/u).map(fold).filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
  return { words, phrases: phrases.map(p => fold(p).replace(/\s+/g, ' ').trim()).filter(Boolean) };
}

function snippet(text, terms, phrases, len = 260) {
  const norm = foldKeep(text);
  let pos = -1;
  for (const p of phrases) { const i = norm.indexOf(p); if (i >= 0) { pos = i; break; } }
  const re = terms.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')[\\p{L}\\p{N}]*', 'gu') : null;
  if (pos < 0 && re) { re.lastIndex = 0; const m = re.exec(norm); if (m) pos = m.index; }
  let start = 0, end = text.length;
  if (text.length > len) {
    start = Math.max(0, (pos < 0 ? 0 : pos) - 80);
    if (start > 0) { const sp = text.indexOf(' ', start); if (sp > 0 && sp - start < 20) start = sp + 1; }
    end = Math.min(text.length, start + len);
    if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > start + len * .7) end = sp; }
  }
  const seg = text.slice(start, end), nseg = norm.slice(start, end);
  const ranges = [];
  for (const p of phrases) { let i = nseg.indexOf(p); while (i >= 0) { ranges.push([i, i + p.length]); i = nseg.indexOf(p, i + p.length); } }
  if (re) { re.lastIndex = 0; let m; while ((m = re.exec(nseg))) ranges.push([m.index, m.index + m[0].length]); }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (const [a, b] of ranges) { if (a < at) continue; out += esc(seg.slice(at, a)) + '<mark>' + esc(seg.slice(a, b)) + '</mark>'; at = b; }
  out += esc(seg.slice(at));
  return (start > 0 ? '… ' : '') + out + (end < text.length ? ' …' : '');
}

function search({ q, docs, notes, limit }) {
  const { words, phrases } = parseQuery(q);
  if (!words.length) return { results: [], total: 0, terms: [] };
  const filter = docs && docs.length ? (r => docs.includes(units[r.id].d)) : undefined;
  const fields = notes ? ['t', 'h', 'f'] : ['t', 'h'];
  const opts = {
    fields, filter, combineWith: 'AND',
    boost: { h: 1.6, t: 1, f: .35 },
    prefix: t => t.length >= 3,
    fuzzy: t => (t.length >= 6 ? .18 : false),
    weights: { fuzzy: .35, prefix: .6 }
  };
  let res = ms.search(words.join(' '), opts);
  if (phrases.length) {
    res = res.filter(r => {
      const u = units[r.id];
      const hay = fold(u.t + ' ' + (notes ? (u.f || '') : '')).replace(/\s+/g, ' ');
      return phrases.every(p => hay.includes(p));
    });
  }
  const total = res.length;
  const terms = Array.from(new Set(res.slice(0, 400).flatMap(r => r.terms).concat(words)));
  const out = res.slice(0, limit || 60).map(r => {
    const u = units[r.id];
    const tsnip = snippet(u.t, r.terms.concat(words), phrases);
    let fsnip = '';
    if (notes && u.f && !/<mark>/.test(tsnip)) fsnip = snippet(u.f, r.terms.concat(words), phrases, 160);
    return { d: u.d, a: u.a, n: u.n, h: u.h, u: u.u, s: tsnip, fs: fsnip, terms: r.terms };
  });
  return { results: out, total, terms, phrases };
}

onmessage = async e => {
  const m = e.data;
  if (m.type === 'init') { await load(m.url); return; }
  if (m.type === 'search') {
    await load(m.url);
    const r = search(m);
    postMessage({ type: 'results', id: m.id, ...r });
  }
};
