/* ==========================================================================
   main.js — page behaviour for the landing page.
   Scroll position is turned into a tour progress "u":
     u = 0        bird's-eye overview (the hero)
     u = 1 … 10   the ten stops
     u = 11       pulled back out, ready to leave the stage
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  var mqSmall = window.matchMedia('(max-width: 860px)');

  var tour = $('#room'), stage = $('#stage'), track = $('#track'), canvas = $('#scene');
  var nav = $('#nav'), links = $('#links'), menuBtn = $('#menu');
  var stops = $$('.stop'), N = stops.length;
  var hudNo = $('#hudNo'), map = $('#map'), cam = $('#cam'), prevBtn = $('#prev'), nextBtn = $('#next');
  var words = $('#words'), toast = $('#toast');
  var room = null, live = false, tourTop = 0, seg = 1, active = -1, dots = [];

  /* interface strings; the Hebrew page (lang="he", dir="rtl") gets its own set and a mirrored layout */
  var he = root.getAttribute('lang') === 'he', rtl = root.getAttribute('dir') === 'rtl', side = rtl ? -1 : 1;
  var STR = he ? { overview: 'מבט על', play: 'הפעלת הטיסה', pause: 'השהיית הטיסה', goTo: 'מעבר לתחנה ' }
               : { overview: 'Overview', play: 'Play the fly-through', pause: 'Pause the fly-through', goTo: 'Go to stop ' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- theme ---------- */
  function isDark() { var t = root.getAttribute('data-theme'); return t ? t === 'dark' : mqDark.matches; }
  function ink() { return getComputedStyle(root).getPropertyValue('--ink').trim() || '#141a1c'; }
  function applyTheme() { if (room) room.setTheme(ink(), isDark()); }
  $('#theme').addEventListener('click', function () { root.setAttribute('data-theme', isDark() ? 'light' : 'dark'); applyTheme(); });
  if (mqDark.addEventListener) mqDark.addEventListener('change', applyTheme);

  /* ---------- nav ---------- */
  menuBtn.addEventListener('click', function () {
    var open = links.classList.toggle('is-open'); menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) { links.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); } });

  /* ---------- tour geometry ---------- */
  function measure() {
    tourTop = tour.getBoundingClientRect().top + window.pageYOffset;
    seg = track.offsetHeight / (N + 1) || 1;
  }
  function progress() { return clamp((window.pageYOffset - tourTop) / seg, 0, N + 1); }
  function go(i, instant) {
    var y = tourTop + clamp(i, 0, N + 1) * seg;
    if (instant || reduce) window.scrollTo(0, y);
    else window.scrollTo({ top: y, behavior: 'smooth' });
  }

  function setActive(i) {
    active = i;
    var onStop = i >= 1 && i <= N;
    hudNo.textContent = onStop ? pad2(i) + ' / ' + pad2(N) : STR.overview;
    dots.forEach(function (d, k) { d.classList.toggle('is-on', k + 1 === i); });
    prevBtn.disabled = i <= 0; nextBtn.disabled = i > N;
    if (room) {
      if (mqSmall.matches) room.setShift(0, i === 0 ? 0.12 : onStop ? 0.2 : 0);
      else room.setShift(side * (i === 0 ? 0.12 : onStop ? 0.17 : 0), i === 0 ? 0.12 : 0);
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var u = progress(), y = window.pageYOffset;
      if (room) { room.setProgress(u); if (!live && u > 1.5) room.skipIntro(); }   // arrived deep in the page: no opening to sit through
      var i = u < 0.5 ? 0 : u > N + 0.5 ? N + 1 : Math.round(u);
      if (i !== active) setActive(i);
      for (var k = 0; k < N; k++) {
        var d = u - (k + 1);
        stops[k].classList.toggle('is-on', Math.abs(d) < 0.4);
        stops[k].classList.toggle('is-past', d >= 0.4);
      }
      root.classList.toggle('is-touring', u > 0.28);
      nav.classList.toggle('is-solid', y > 12);
      if (words) {
        var r = words.parentNode.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) words.style.transform = 'translate3d(' + (-(window.innerHeight - r.top) * 0.42).toFixed(1) + 'px,0,0)';
      }
    });
  }

  /* ---------- minimap ---------- */
  var PLAN = { w: 384, h: 918, off: 10, ppm: 62.76 };            // the cropped plan image, in its own pixels
  function mapXY(x, z) { return [(PLAN.off + x * PLAN.ppm) / PLAN.w, (PLAN.off + z * PLAN.ppm) / PLAN.h]; }
  function buildDots() {
    if (!window.MakerRoom) return;
    var plan = $('.map__plan');
    window.MakerRoom.STOPS.forEach(function (s, k) {
      var p = mapXY(clamp(s.t[0], 0.35, 5.45), clamp(s.t[2], 0.35, 13.95));
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'map__dot';
      b.style.left = 'calc(7px + (100% - 14px) * ' + p[0].toFixed(4) + ')';
      b.style.top = 'calc(7px + (100% - 14px) * ' + p[1].toFixed(4) + ')';
      var title = $('.card__title', stops[k]);
      b.setAttribute('aria-label', STR.goTo + (k + 1) + (title ? ': ' + title.textContent : ''));
      b.addEventListener('click', function () { fly(false); go(k + 1); });
      map.insertBefore(b, cam); dots.push(b);
    });
    void plan;
  }
  function onFrame(f) {
    var show = f.u > 0.62 && f.u < N + 0.38;
    cam.classList.toggle('is-on', show);
    if (!show) return;
    var w = map.clientWidth - 14, h = map.clientHeight - 14, p = mapXY(f.x, f.z);
    cam.style.transform = 'translate3d(' + (7 + p[0] * w).toFixed(1) + 'px,' + (7 + p[1] * h).toFixed(1) + 'px,0) rotate(' + (f.heading * 57.2958).toFixed(1) + 'deg)';
  }

  /* ---------- transport ---------- */
  prevBtn.addEventListener('click', function () { fly(false); go(Math.max(0, Math.ceil(progress() - 0.05) - 1)); });
  nextBtn.addEventListener('click', function () { fly(false); go(Math.min(N + 1, Math.floor(progress() + 0.05) + 1)); });

  /* auto-fly: the page scrolls itself, pausing at each stop */
  var flying = false, flyRaf = 0, flyLast = 0, flyY = 0;
  function fly(on) {
    if (on === flying) return;
    flying = on; root.classList.toggle('is-flying', on);
    $$('[data-fly]').forEach(function (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (b.hasAttribute('aria-label')) b.setAttribute('aria-label', on ? STR.pause : STR.play); });
    $$('[data-fly-label]').forEach(function (s) { s.textContent = on ? STR.pause : STR.play; });
    cancelAnimationFrame(flyRaf);
    if (on) {
      if (progress() > N - 0.05) go(0, true);
      if (room) room.setProgress(Math.max(0.06, progress()));
      flyY = window.pageYOffset; flyLast = 0; flyRaf = requestAnimationFrame(flyStep);
    }
  }
  function flyStep(now) {
    if (!flying) return;
    var dt = Math.min(0.05, (now - (flyLast || now)) / 1000); flyLast = now;
    var u = (flyY - tourTop) / seg, f = u - Math.floor(u), near = Math.min(f, 1 - f);
    var speed = (u > 0.85 && u < N + 0.15 && near < 0.1) ? 0.075 : 0.3;        // stops per second: linger, then travel
    flyY += speed * seg * dt;
    window.scrollTo(0, flyY);
    if (u >= N + 0.1) { fly(false); return; }
    flyRaf = requestAnimationFrame(flyStep);
  }
  $$('[data-fly]').forEach(function (b) { b.addEventListener('click', function () { fly(!flying); }); });
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      if (!flying) return;
      if (ev === 'keydown' && [' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Escape'].indexOf(e.key) < 0) return;
      if (ev === 'touchstart' && e.target.closest && e.target.closest('[data-fly]')) return;
      fly(false);
    }, { passive: true });
  });

  /* keyboard users tabbing into a hidden card bring that stop into view */
  stops.forEach(function (s, k) {
    s.addEventListener('focusin', function () { if (!s.classList.contains('is-on')) { fly(false); go(k + 1, true); } });
  });

  /* ---------- lightbox ---------- */
  var box = $('#lightbox'), boxImg = $('#lightboxImg'), boxCap = $('#lightboxCap'), set = [], at = 0;
  function show(i) {
    if (!set.length) return;
    at = (i + set.length) % set.length;
    var img = $('img', set[at]);
    boxImg.src = set[at].getAttribute('data-full') || img.currentSrc || img.src;
    boxImg.alt = img.alt; boxCap.textContent = img.alt;
    $$('.lightbox__nav', box).forEach(function (b) { b.hidden = set.length < 2; });
  }
  document.addEventListener('click', function (e) {
    var shot = e.target.closest && e.target.closest('.shot');
    if (shot && box.showModal) {
      fly(false);
      set = $$('.shot', shot.closest('.card')); show(set.indexOf(shot)); box.showModal(); return;
    }
    var soon = e.target.closest && e.target.closest('[data-soon]');
    if (soon) { e.preventDefault(); say(soon.getAttribute('data-soon')); return; }

    /* in-page links: scroll ourselves, so they behave the same everywhere (including inside previews) */
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1), el = id ? document.getElementById(id) : null;
    if (!el) return;
    e.preventDefault(); fly(false);
    var stop = /^stop-(\d+)$/.exec(id);
    if (stop) go(Number(stop[1]));
    else if (id === 'top') window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    else {
      var y = el.getBoundingClientRect().top + window.pageYOffset - (el.classList.contains('row') ? nav.offsetHeight + 24 : 0);
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
      $$('.row.is-target').forEach(function (r) { r.classList.remove('is-target'); });
      if (el.classList.contains('row')) el.classList.add('is-target');
    }
    try { history.replaceState(null, '', '#' + id); } catch (err) {}
  });
  box.addEventListener('click', function (e) {
    var step = e.target.closest('[data-step]');
    if (step) { show(at + Number(step.getAttribute('data-step'))); return; }
    if (e.target === box || e.target.closest('[data-close]')) box.close();
  });
  box.addEventListener('keydown', function (e) {
    if (set.length > 1 && e.key === 'ArrowRight') show(at + 1);
    if (set.length > 1 && e.key === 'ArrowLeft') show(at - 1);
  });

  /* ---------- "not uploaded yet" notices ---------- */
  var toastT = 0;
  function say(msg) {
    toast.textContent = msg; toast.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('is-on'); }, 3200);
  }

  /* ---------- boot ---------- */
  function boot() {
    if (boot.done) return; boot.done = true;
    if (window.THREE && window.MakerRoom) {
      room = window.MakerRoom.create(canvas, {
        plan: canvas.getAttribute('data-plan'), ink: ink(), dark: isDark(), still: reduce,
        onFrame: onFrame, onRise: function () { root.classList.add('is-rising'); }, onReady: function () { live = true; root.classList.add('is-live'); }
      });
    }
    if (!room) root.classList.add('no-webgl', 'is-rising', 'is-live');
    buildDots(); measure();
    if (progress() > 0.05 || reduce) root.classList.add('is-quick');   // arriving mid-page: no waiting for the opening
    if (room) {
      if (reduce || progress() > 0.05) room.skipIntro();
      room.jump(progress());
      room.start();
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse') room.setPointer((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
      }, { passive: true });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { room.setVisible(en[0].isIntersecting && !document.hidden); }).observe(stage);
      }
      document.addEventListener('visibilitychange', function () { room.setVisible(!document.hidden); });
    }
    root.classList.add('is-booted');
    setTimeout(function () { root.classList.add('is-rising'); }, 2600);   // never keep the headline waiting on a slow GPU
    active = -1; onScroll();
  }
  var fontsReady = (document.fonts && document.fonts.load) ? document.fonts.load('900 40px Archivo') : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(boot, boot);

  var resizeT = 0;
  function onResize() {
    cancelAnimationFrame(resizeT);
    resizeT = requestAnimationFrame(function () { measure(); if (room) room.resize(); active = -1; onScroll(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(stage);
})();
