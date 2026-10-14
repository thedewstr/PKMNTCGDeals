/* site.js — theme toggle, mobile nav, scroll reveal, lightbox-free page chrome */
(function () {
  'use strict';

  // ---- Mobile nav -------------------------------------------------------
  var menuBtn = document.getElementById('menuToggle');
  var menu = document.getElementById('mobileMenu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () {
      var open = menu.classList.toggle('hidden') === false;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        menu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---- Theme toggle -----------------------------------------------------
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var isDark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
      themeBtn.setAttribute('aria-pressed', String(isDark));
    });
  }

  // ---- Year -------------------------------------------------------------
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // ---- Scroll reveal ----------------------------------------------------
  var reveal = function () {
    document.querySelectorAll('.fade-in:not(.show)').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < (window.innerHeight || 0) - 60) el.classList.add('show');
    });
  };
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('show'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.05 });
    document.querySelectorAll('.fade-in').forEach(function (el) { io.observe(el); });
  } else {
    window.addEventListener('scroll', reveal, { passive: true });
    window.addEventListener('load', reveal);
  }
})();
