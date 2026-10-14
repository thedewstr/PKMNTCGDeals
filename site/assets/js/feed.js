/* feed.js — live success feed + stats from the Cloudflare Worker.
   All user/Discord content is inserted via textContent or sanitised URLs; never innerHTML. */
(function () {
  'use strict';

  var WORKER_BASE = 'https://pkmntcg-deals-api.ryantheshibainu.workers.dev';
  var $ = function (s, r) { return (r || document).querySelector(s); };

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
    if (d < 0) return 'just now';
    var m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var days = Math.floor(h / 24);
    if (days < 7) return days + 'd ago';
    return new Date(t).toLocaleDateString();
  };

  var animateCount = function (el, to, duration) {
    if (!el || typeof to !== 'number' || !isFinite(to)) return;
    duration = duration || 800;
    var start = performance.now();
    var step = function (now) {
      var p = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(to * p).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // ---- Lightbox ---------------------------------------------------------
  var lightbox = null;
  var openLightbox = function (src, alt) {
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm';
      lightbox.setAttribute('role', 'dialog');
      lightbox.setAttribute('aria-modal', 'true');
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
    var im = lightbox.querySelector('img');
    im.src = src;
    im.alt = alt || '';
    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
  };

  // ---- Card builder (no innerHTML) --------------------------------------
  var buildCard = function (item) {
    var img = safeUrl(item.image_url);
    if (!img) return null;

    var caption = typeof item.caption === 'string' ? item.caption.trim() : '';
    var author = typeof item.author === 'string' ? item.author.trim() : '';
    var retailer = typeof item.retailer === 'string' ? item.retailer.trim() : '';
    var link = safeUrl(item.message_url);

    var article = document.createElement('article');
    article.className = 'group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/60 fade-in';

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
    image.addEventListener('error', function () { a.removeAttribute('href'); image.remove(); });

    a.appendChild(image);
    article.appendChild(a);

    var body = document.createElement('div');
    body.className = 'p-3';

    if (retailer) {
      var chip = document.createElement('span');
      chip.className = 'mb-2 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-600/15 dark:text-brand-300';
      chip.textContent = retailer;
      body.appendChild(chip);
    }

    var cap = document.createElement('p');
    cap.className = 'line-clamp-2 text-sm text-slate-700 dark:text-slate-300';
    cap.textContent = caption || 'Restock landed \uD83C\uDF89';
    body.appendChild(cap);

    var meta = document.createElement('div');
    meta.className = 'mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-500';
    var who = document.createElement('span');
    who.textContent = author ? '@' + author : '@member';
    var time = document.createElement('time');
    time.textContent = relTime(item.timestamp);
    meta.appendChild(who);
    meta.appendChild(time);
    body.appendChild(meta);

    article.appendChild(body);
    article.addEventListener('click', function (e) {
      if (e.target.closest('a') && link) return;
      e.preventDefault();
      openLightbox(img, caption);
    });
    return article;
  };

  // ---- Hero collage -----------------------------------------------------
  var buildHero = function (items) {
    var hero = $('#heroGallery');
    if (!hero) return;
    hero.classList.remove('skeleton');
    var pics = (items || []).map(function (i) { return safeUrl(i && i.image_url); }).filter(Boolean).slice(0, 4);
    hero.textContent = '';
    if (!pics.length) {
      hero.className = 'aspect-[4/3] w-full rounded-3xl border border-dashed border-slate-300 dark:border-slate-800';
      return;
    }
    hero.className = 'grid aspect-[4/3] w-full grid-cols-2 gap-2 rounded-3xl border border-slate-200 p-2 dark:border-slate-800';
    pics.forEach(function (src, i) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.className = 'h-full w-full rounded-2xl border border-slate-200 object-cover dark:border-slate-800';
      hero.appendChild(img);
    });
  };

  // ---- Stats ------------------------------------------------------------
  var loadStats = function () {
    fetch(WORKER_BASE + '/stats', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('stats ' + r.status); return r.json(); })
      .then(function (s) {
        animateCount($('#stat-members'), s.members);
        animateCount($('#stat-alerts'), s.alerts_per_week);
        animateCount($('#stat-success'), s.recent_wins);
      })
      .catch(function (e) { console.warn('stats error', e); });
  };

  // ---- Feed -------------------------------------------------------------
  var loadFeed = function () {
    var grid = $('#successGrid');
    var empty = $('#successEmpty');
    fetch(WORKER_BASE + '/feed?ts=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('feed ' + r.status); return r.json(); })
      .then(function (raw) {
        var items = Array.isArray(raw) ? raw
          : (raw && Array.isArray(raw.items)) ? raw.items
          : (raw && Array.isArray(raw.results)) ? raw.results
          : [];
        buildHero(items);
        if (grid) {
          grid.textContent = '';
          var shown = 0;
          items.slice(0, 12).forEach(function (item) {
            var card = buildCard(item || {});
            if (card) { grid.appendChild(card); shown++; }
          });
          if (!shown && empty) empty.classList.remove('hidden');
        }
        if (window.requestAnimationFrame) {
          requestAnimationFrame(function () {
            document.querySelectorAll('.fade-in').forEach(function (el) { el.classList.add('show'); });
          });
        }
      })
      .catch(function (e) {
        console.warn('feed error', e);
        buildHero([]);
        if (empty) empty.classList.remove('hidden');
      });
  };

  document.addEventListener('DOMContentLoaded', function () {
    loadFeed();
    loadStats();
  });
})();
