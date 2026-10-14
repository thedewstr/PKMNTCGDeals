/* successes.js — full success gallery: client-side filter + paging over /feed. */
(function () {
  'use strict';

  var WORKER_BASE = 'https://pkmntcg-deals-api.ryantheshibainu.workers.dev';
  var PAGE = 24;

  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var btn = document.getElementById('loadMore');
  var search = document.getElementById('search');
  var retailer = document.getElementById('retailer');

  var all = [];
  var filtered = [];
  var shown = 0;

  var safeUrl = function (u) {
    try {
      var p = new URL(String(u), location.origin);
      return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : '';
    } catch (e) { return ''; }
  };

  var relTime = function (ts) {
    var t = Number(ts);
    if (!isFinite(t) || t <= 0) return '';
    var d = Date.now() - t;
    if (d < 60000) return 'just now';
    var m = Math.floor(d / 60000);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var days = Math.floor(h / 24);
    if (days < 7) return days + 'd ago';
    return new Date(t).toLocaleDateString();
  };

  // Lightbox
  var lightbox = null;
  var openLightbox = function (src, alt) {
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm';
      var img = document.createElement('img');
      img.className = 'max-h-[90vh] max-w-[92vw] rounded-xl shadow-2xl';
      img.alt = '';
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'absolute right-4 top-4 rounded-full bg-white/10 px-3 py-2 text-2xl leading-none text-white hover:bg-white/20';
      close.setAttribute('aria-label', 'Close image');
      close.textContent = '\u00D7';
      lightbox.appendChild(img);
      lightbox.appendChild(close);
      document.body.appendChild(lightbox);
      var hide = function () { lightbox.classList.add('hidden'); lightbox.classList.remove('flex'); };
      close.addEventListener('click', hide);
      lightbox.addEventListener('click', function (e) { if (e.target === lightbox) hide(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    }
    lightbox.querySelector('img').src = src;
    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
  };

  var card = function (item) {
    var img = safeUrl(item.image_url);
    if (!img) return null;
    var caption = typeof item.caption === 'string' ? item.caption.trim() : '';
    var author = typeof item.author === 'string' ? item.author.trim() : '';
    var ret = typeof item.retailer === 'string' ? item.retailer.trim() : '';
    var link = safeUrl(item.message_url);

    var el = document.createElement('article');
    el.className = 'group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/60';

    var a = document.createElement('a');
    a.className = 'block';
    a.href = link || img;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    var image = document.createElement('img');
    image.src = img;
    image.alt = caption || 'Community restock success';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.className = 'aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]';
    a.appendChild(image);
    el.appendChild(a);

    var body = document.createElement('div');
    body.className = 'p-3';

    if (ret) {
      var chip = document.createElement('span');
      chip.className = 'mb-2 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-600/15 dark:text-brand-300';
      chip.textContent = ret;
      body.appendChild(chip);
    }

    var cap = document.createElement('p');
    cap.className = 'line-clamp-2 text-sm text-slate-700 dark:text-slate-300';
    cap.textContent = caption || 'Restock landed \uD83C\uDF89';
    body.appendChild(cap);

    var meta = document.createElement('div');
    meta.className = 'mt-2 flex items-center justify-between text-xs text-slate-500';
    var who = document.createElement('span');
    who.textContent = author ? '@' + author : '@member';
    var time = document.createElement('time');
    time.textContent = relTime(item.timestamp);
    meta.appendChild(who);
    meta.appendChild(time);
    body.appendChild(meta);
    el.appendChild(body);

    el.addEventListener('click', function (e) {
      if (e.target.closest('a') && link) return;
      e.preventDefault();
      openLightbox(img, caption);
    });
    return el;
  };

  var render = function (reset) {
    if (!grid) return;
    if (reset) { grid.textContent = ''; shown = 0; }
    var slice = filtered.slice(shown, shown + PAGE);
    slice.forEach(function (i) { var c = card(i); if (c) grid.appendChild(c); });
    shown += slice.length;

    var done = shown >= filtered.length;
    if (btn) {
      btn.classList.toggle('hidden', done);
      btn.disabled = done;
      btn.textContent = 'Load more';
    }
    if (empty) empty.classList.toggle('hidden', filtered.length !== 0);
  };

  var applyFilters = function () {
    var q = (search && search.value || '').toLowerCase().trim();
    var r = (retailer && retailer.value || '').toLowerCase();
    filtered = all.filter(function (i) {
      var text = ((i.caption || '') + ' ' + (i.author || '')).toLowerCase();
      var rt = (i.retailer || '').toLowerCase();
      return (!q || text.indexOf(q) !== -1) && (!r || rt === r);
    });
    render(true);
  };

  fetch(WORKER_BASE + '/feed?ts=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('feed ' + r.status); return r.json(); })
    .then(function (raw) {
      all = (Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items)) ? raw.items : []).filter(function (i) {
        return i && safeUrl(i.image_url);
      });
      applyFilters();
    })
    .catch(function (e) {
      console.warn('feed error', e);
      if (empty) empty.classList.remove('hidden');
    });

  if (btn) btn.addEventListener('click', function () { render(false); });
  if (search) search.addEventListener('input', applyFilters);
  if (retailer) retailer.addEventListener('change', applyFilters);
})();
