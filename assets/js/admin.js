// ANCCI admin — editor, AI panel, photo shrinking, import runner. No external libraries.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; };
  var CSRF = meta('csrf'), BASE = meta('admin-base');

  function api(path, body, isForm) {
    var opts = { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF': CSRF, 'Accept': 'application/json' } };
    if (isForm) opts.body = body; else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
    return fetch(BASE + '/' + path, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, message: 'The server did not answer properly (' + r.status + ').' }; });
    }).catch(function () { return { ok: false, message: 'No internet connection. Please try again.' }; });
  }

  /* ---------------- confirm, busy buttons, side menu, copy ---------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-confirm]');
    if (b && !window.confirm(b.getAttribute('data-confirm'))) { e.preventDefault(); e.stopPropagation(); }
    var c = e.target.closest('code.copy');
    if (c && navigator.clipboard) { navigator.clipboard.writeText(c.textContent); c.classList.add('copied'); setTimeout(function () { c.classList.remove('copied'); }, 1200); }
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute('data-confirm') && !window.confirm(f.getAttribute('data-confirm'))) { e.preventDefault(); return; }
    if (f._shrinking) { e.preventDefault(); alert('Photos are still being prepared. Please wait a moment and try again.'); return; }
    $$('[data-editor]', f).forEach(syncEditor);
    f._submitted = true;
    var s = e.submitter;
    if (s && s.dataset.busy) setTimeout(function () { s.textContent = s.dataset.busy; s.classList.add('busy'); }, 10);
  });
  var st = $('.side-toggle'), side = $('#side');
  if (st && side) st.addEventListener('click', function () { var o = side.classList.toggle('open'); st.setAttribute('aria-expanded', o ? 'true' : 'false'); });

  /* ---------------- unsaved-changes warning ---------------- */
  $$('form[data-dirty-guard]').forEach(function (f) {
    var dirty = false;
    f.addEventListener('input', function () { dirty = true; });
    window.addEventListener('beforeunload', function (e) { if (dirty && !f._submitted) { e.preventDefault(); e.returnValue = ''; } });
  });

  /* ---------------- shrink photos in the browser before upload ---------------- */
  var MAX = 1600;
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var s = Math.min(1, MAX / Math.max(img.width, img.height));
        if (s === 1 && file.size < 1.5 * 1024 * 1024) return resolve(file);
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        var ctx = c.getContext('2d');
        var png = file.type === 'image/png';
        if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (!b || b.size >= file.size) return resolve(file);
          resolve(new File([b], file.name.replace(/\.\w+$/, png ? '.png' : '.jpg'), { type: png ? 'image/png' : 'image/jpeg' }));
        }, png ? 'image/png' : 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function shrinkAll(files) { return Promise.all(Array.prototype.map.call(files, shrink)); }
  $$('input[type=file][data-shrink]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      if (!inp.files.length || typeof DataTransfer === 'undefined') return;
      var form = inp.form; if (form) form._shrinking = true;
      var note = inp.parentNode.querySelector('.shrink-note') || document.createElement('small');
      note.className = 'shrink-note'; note.textContent = 'Preparing ' + inp.files.length + ' photo(s)…'; inp.after(note);
      shrinkAll(inp.files).then(function (out) {
        var dt = new DataTransfer(), before = 0, after = 0;
        Array.prototype.forEach.call(inp.files, function (f) { before += f.size; });
        out.forEach(function (f) { dt.items.add(f); after += f.size; });
        inp.files = dt.files;
        note.textContent = out.length + ' photo(s) ready' + (after < before ? ' (' + Math.round(before / 1048576 * 10) / 10 + ' MB → ' + Math.round(after / 1048576 * 10) / 10 + ' MB)' : '') + '. Press Save to upload.';
        if (form) form._shrinking = false;
      });
    });
  });

  /* ---------------- rich text editor ---------------- */
  function syncEditor(ed) { var a = $('.ed-area', ed), s = $('.ed-src', ed); if (a && s) s.value = a.innerHTML; }
  function edStatus(ed, t) { var s = $('.ed-status', ed); if (s) s.textContent = t || ''; }
  var savedRange = null;
  function saveSel(area) { var s = window.getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) savedRange = s.getRangeAt(0); }
  function restoreSel(area) { area.focus(); if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
  function insertHTML(area, html) { restoreSel(area); document.execCommand('insertHTML', false, html); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uploadFiles(files, allow) {
    var fd = new FormData();
    files.forEach(function (f) { fd.append('file[]', f); });
    fd.append('allow', allow);
    return api('media/upload', fd, true);
  }
  $$('[data-editor]').forEach(function (ed) {
    var area = $('.ed-area', ed);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (x) {}
    ['keyup', 'mouseup', 'blur'].forEach(function (ev) { area.addEventListener(ev, function () { saveSel(area); }); });
    area.addEventListener('input', function () { syncEditor(ed); });
    area.addEventListener('paste', function (e) {
      // keep simple formatting, drop colours/fonts from Word or WhatsApp
      var html = e.clipboardData && e.clipboardData.getData('text/html');
      if (!html) return;
      e.preventDefault();
      var tmp = document.createElement('div'); tmp.innerHTML = html;
      $$('script,style,meta,link,o\\:p', tmp).forEach(function (n) { n.remove(); });
      $$('*', tmp).forEach(function (n) { ['style', 'class', 'id', 'lang', 'face', 'color', 'size'].forEach(function (a) { n.removeAttribute(a); }); });
      document.execCommand('insertHTML', false, tmp.innerHTML);
    });
    $$('.ed-bar button', ed).forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        area.focus(); restoreSel(area);
        if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false, null);
        else if (b.dataset.block) document.execCommand('formatBlock', false, '<' + b.dataset.block + '>');
        else if ('link' in b.dataset) {
          var u = window.prompt('Link address (https://…)', 'https://');
          if (u && /^(https?:\/\/|mailto:|tel:|\/)/i.test(u)) {
            if (window.getSelection().isCollapsed) insertHTML(area, '<a href="' + esc(u) + '">' + esc(u) + '</a>');
            else document.execCommand('createLink', false, u);
          }
        } else if ('img' in b.dataset) $('.ed-file', ed).click();
        else if ('pdf' in b.dataset) $('.ed-pdf', ed).click();
        else if ('yt' in b.dataset) {
          var y = window.prompt('Paste the YouTube video link');
          var m = y && y.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_\-]{6,})/);
          if (m) insertHTML(area, '<p><iframe src="https://www.youtube-nocookie.com/embed/' + m[1] + '" title="YouTube video" allowfullscreen></iframe></p><p></p>');
          else if (y) alert('That does not look like a YouTube link.');
        }
        syncEditor(ed);
      });
    });
    $('.ed-file', ed).addEventListener('change', function () {
      var inp = this; if (!inp.files.length) return;
      edStatus(ed, 'Uploading ' + inp.files.length + ' photo(s)…');
      shrinkAll(inp.files).then(function (files) { return uploadFiles(files, 'image'); }).then(function (r) {
        (r.files || []).forEach(function (f) { insertHTML(area, '<p><img src="' + esc(f.url) + '" alt="" width="' + (f.width || '') + '" height="' + (f.height || '') + '"></p>'); });
        edStatus(ed, r.ok ? 'Photo added.' : r.message); syncEditor(ed); inp.value = '';
      });
    });
    $('.ed-pdf', ed).addEventListener('change', function () {
      var inp = this; if (!inp.files.length) return;
      edStatus(ed, 'Uploading PDF…');
      uploadFiles([inp.files[0]], 'pdf').then(function (r) {
        (r.files || []).forEach(function (f) { insertHTML(area, '<p><a href="' + esc(f.url) + '" target="_blank">' + esc(f.name.replace(/\.pdf$/i, '')) + ' (PDF)</a></p>'); });
        edStatus(ed, r.ok ? 'PDF attached.' : r.message); syncEditor(ed); inp.value = '';
      });
    });
  });

  /* ---------------- AI writing panel ---------------- */
  $$('[data-ai]').forEach(function (panel) {
    var form = panel.closest('form'), ed = form && $('[data-editor]', form), area = ed && $('.ed-area', ed);
    var title = form && $('[data-title]', form), out = $('[data-ai-out]', panel);
    function setBalance(b) { if (b == null) return; $$('[data-ai-balance]').forEach(function (el) { el.textContent = (el.closest('.ai-panel') ? 'Credit: ₹' : 'AI credit: ₹') + Number(b).toFixed(2); }); }
    function show(html) { out.hidden = false; out.innerHTML = html; }
    $$('[data-ai-task]', panel).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var task = btn.dataset.aiTask;
        var body = { task: task, title: title ? title.value : '', text: area ? area.innerText.trim() : '' };
        if (task === 'write') {
          body.text = $('[data-ai-notes]', panel).value;
          body.tone = $('[data-ai-tone]', panel).value; body.length = $('[data-ai-length]', panel).value;
          if (area && area.innerText.trim().length > 30 && !confirm('Replace the text already in the editor with the AI draft?')) return;
        }
        var label = btn.textContent; btn.disabled = true; btn.textContent = 'AI is writing…'; panel.classList.add('busy');
        api('ai', body).then(function (r) {
          btn.disabled = false; btn.textContent = label; panel.classList.remove('busy');
          setBalance(r.balance);
          if (!r.ok) { show('<div class="alert err">' + esc(r.message || 'AI did not answer.') + (r.code === 'no_credit' ? ' <a href="' + BASE + '/ai?recharge=1">Recharge now</a>' : '') + '</div>'); return; }
          if (task === 'write') {
            area.innerHTML = r.html; ed.classList.add('ai-new');
            if (title && r.title && (!title.value.trim() || confirm('Use the AI title?\n\n' + r.title))) title.value = r.title;
            show('<div class="alert warn small"><b>AI draft written (₹' + Number(r.charged).toFixed(2) + ').</b> Read it carefully, check names and dates, and fill anything in [square brackets] before publishing.</div>');
          } else if (task === 'titles') {
            show('<p class="small strong">Click a title to use it:</p>' + r.titles.map(function (t) { return '<button type="button" class="title-pick">' + esc(t) + '</button>'; }).join(''));
            $$('.title-pick', out).forEach(function (b) { b.addEventListener('click', function () { if (title) title.value = b.textContent; b.classList.add('picked'); }); });
          } else if (task === 'facebook') {
            show('<label class="small strong">Copy and paste on Facebook / WhatsApp<textarea rows="7" readonly>' + esc(r.text) + '</textarea></label><button type="button" class="btn small copy-fb">Copy</button>');
            $('.copy-fb', out).addEventListener('click', function () { var t = $('textarea', out); t.select(); if (navigator.clipboard) navigator.clipboard.writeText(t.value); this.textContent = 'Copied'; });
          } else if (area) {
            area.innerHTML = r.html;
            show('<div class="alert ok small">Done (₹' + Number(r.charged).toFixed(2) + '). Please read the new text once before saving.</div>');
          }
          if (ed) { syncEditor(ed); form.dispatchEvent(new Event('input')); }
        });
      });
    });
  });

  /* ---------------- WordPress import runner ---------------- */
  var start = $('#wp-start');
  if (start) start.addEventListener('click', function () {
    var log = $('#wp-log'), bar = $('#wp-progress'), url = start.dataset.url, n = 0;
    start.disabled = true; start.textContent = 'Importing… keep this page open'; bar.hidden = false; log.innerHTML = '';
    var add = function (t, cls) { var li = document.createElement('li'); li.textContent = t; if (cls) li.className = cls; log.appendChild(li); li.scrollIntoView({ block: 'nearest' }); };
    var step = function (s) {
      fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': CSRF }, body: JSON.stringify(s) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r.ok) { add('Error: ' + r.message + ' — retrying in 5 seconds…', 'err'); setTimeout(function () { step(s); }, 5000); return; }
          (r.log || []).forEach(function (t) { add(t); });
          n++; $('div', bar).style.width = Math.min(95, n * 3) + '%';
          if (r.next) step(r.next); else { $('div', bar).style.width = '100%'; add('Finished! Open News & Posts, Pages and Photo Gallery to check.', 'ok'); start.textContent = 'Import finished'; }
        })
        .catch(function () { add('Connection problem — retrying in 5 seconds…', 'err'); setTimeout(function () { step(s); }, 5000); });
    };
    step({ stage: 'start', page: 1, source: $('#wp-src').value.trim() });
  });

  /* ---------------- OTP box: digits only ---------------- */
  var otp = $('.otp-input');
  if (otp) otp.addEventListener('input', function () { otp.value = otp.value.replace(/\D/g, '').slice(0, 6); if (otp.value.length === 6) otp.form.submit(); });
})();
