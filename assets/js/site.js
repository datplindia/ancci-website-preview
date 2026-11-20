// ANCCI website — menu and photo viewer. No external libraries.
(function () {
  'use strict';
  var t = document.querySelector('.nav-toggle'), nav = document.getElementById('nav');
  if (t && nav) t.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.sub-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = b.parentElement, open = li.classList.toggle('open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  // Lightbox for gallery photos
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var img = lb.querySelector('img'), list = [], idx = 0;
  function show(i) { idx = (i + list.length) % list.length; img.src = list[idx].href; img.alt = list[idx].dataset.caption || (list[idx].querySelector('img') || {}).alt || ''; }
  function close() { lb.hidden = true; img.src = ''; document.body.style.overflow = ''; }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a.lb');
    if (!a) return;
    e.preventDefault();
    list = Array.prototype.slice.call(document.querySelectorAll('a.lb[data-group="' + (a.dataset.group || '') + '"]'));
    lb.hidden = false; document.body.style.overflow = 'hidden';
    show(list.indexOf(a));
    lb.querySelector('.lb-close').focus();
  });
  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', function () { show(idx - 1); });
  lb.querySelector('.lb-next').addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
})();
