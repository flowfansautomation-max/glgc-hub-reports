/* Live loader for the GLGC Hub Reports dashboard.
   Reads the Rehearsal / Outreach / Sunday tabs via gviz JSONP (no backend),
   groups every report into a WEEKEND (keyed by its Saturday).
   - Rehearsal + Sunday: every GOVERNOR reports their own members; hub total = sum of its governors.
   - Outreach: ONE ROW PER SOUL (no personal details in this sheet), added up per governor.
   - Overseer: one report per hub (total hub attendance + offering). */
window.GLGC = (function () {
  var CFG = window.GLGC_CONFIG, HUBS = window.HUBS;

  // ---------- dates ----------
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v;
    var m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(String(v));
    if (m) return new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    var d = new Date(v); return isNaN(d.getTime()) ? null : d;
  }
  // Weekend key = that weekend's Saturday. Sunday belongs to the day before.
  function weekendSaturday(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()), dow = x.getDay();
    x.setDate(x.getDate() + (dow === 0 ? -1 : 6 - dow));
    return x;
  }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
  }
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function weekendLabel(sat) {
    var sun = new Date(sat); sun.setDate(sun.getDate() + 1);
    return sat.getDate() + (sat.getMonth() !== sun.getMonth() ? ' ' + MON[sat.getMonth()] : '') +
           '–' + sun.getDate() + ' ' + MON[sun.getMonth()] + ' ' + sun.getFullYear();
  }
  function toNum(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }

  // ---------- gviz ----------
  var FIELDS = { // field -> words that identify its column header
    ts: ['timestamp'], date: ['date'], hub: ['hub center'], governor: ['governor'], overseer: ['overseer'],
    attendance: ['attendance'], offering: ['offering'], souls: ['souls'], service: ['service'], photo: ['photo', 'picture', 'image']
  };
  function parseTable(resp) {
    var t = resp.table, labels = t.cols.map(function (c) { return String(c.label || '').trim(); });
    var rows = t.rows.slice();
    if (!labels.some(function (l) { return /hub/i.test(l); }) && rows.length) { // header came through as a row
      labels = (rows.shift().c || []).map(function (c) { return c && c.v != null ? String(c.v) : ''; });
    }
    var idx = {};
    Object.keys(FIELDS).forEach(function (f) {
      idx[f] = -1;
      labels.forEach(function (l, i) {
        if (idx[f] !== -1) return;
        var low = l.toLowerCase();
        if (f === 'date' && /timestamp/.test(low)) return;
        if (FIELDS[f].some(function (w) { return low.indexOf(w) !== -1; })) idx[f] = i;
      });
    });
    return rows.map(function (r) {
      var c = r.c || [];
      function v(f) { var i = idx[f]; return i >= 0 && c[i] ? c[i].v : null; }
      return { ts: parseDate(v('ts')), date: parseDate(v('date')), hub: String(v('hub') || '').trim(),
        governor: String(v('governor') || '').trim(), overseer: String(v('overseer') || '').trim(), attendance: toNum(v('attendance')),
        offering: toNum(v('offering')), souls: toNum(v('souls')), service: String(v('service') || '').trim(),
        photo: String(v('photo') || '').split(',')[0].trim() };
    }).filter(function (r) { return (r.hub || r.governor) && (r.date || r.ts); });
  }
  function fetchTab(tab) {
    return new Promise(function (resolve, reject) {
      var cb = '__glgc_' + tab.replace(/\W/g, '') + '_' + Date.now();
      window[cb] = function (resp) {
        delete window[cb];
        if (!resp || resp.status === 'error') return reject(new Error('Sheet tab "' + tab + '" could not be read'));
        try { resolve(parseTable(resp)); } catch (e) { reject(e); }
      };
      var s = document.createElement('script');
      s.src = 'https://docs.google.com/spreadsheets/d/' + CFG.SHEET_ID + '/gviz/tq?sheet=' +
              encodeURIComponent(tab) + '&headers=1&tqx=out:json;responseHandler:' + cb;
      s.onerror = function () { reject(new Error('Could not reach the sheet. Is it shared "Anyone with the link"?')); };
      document.body.appendChild(s);
    });
  }

  // ---------- sample data (until SHEET_ID is set) ----------
  function sample() {
    function rnd(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); }
    var out = { rehearsal: [], outreach: [], sunday: [], overseer: [] };
    var sat = weekendSaturday(new Date()); if (sat > new Date()) sat.setDate(sat.getDate() - 7);
    for (var w = 5; w >= 0; w--) {
      var d = new Date(sat); d.setDate(d.getDate() - 7 * w);
      var sun = new Date(d); sun.setDate(sun.getDate() + 1);
      HUBS.forEach(function (h, i) {
        var hubTotal = 0;
        h.governors.forEach(function (g, gi) {
          var s = (i + 1) * 37 + w * 101 + gi * 13, base = 5 + Math.round(h.shepherds * 3 / h.governors.length);
          var isPrimary = !HUBS.slice(0, i).some(function (x) { return x.governors.indexOf(g) !== -1; });
          if (isPrimary && rnd(s) > 0.2) { var a = Math.round(base * (0.7 + rnd(s + 1) * 0.6)); hubTotal += a;
            out.rehearsal.push({ ts: d, date: d, hub: '', governor: g, attendance: a, photo: '' }); }
          if (rnd(s + 3) > 0.45) { var m = 1 + Math.round(base * rnd(s + 5) * 0.4);
            if (isPrimary) for (var q = 0; q < m; q++) out.outreach.push({ ts: d, date: d, hub: '', governor: g,
              service: ['JN','HGE','FLE'][Math.floor(rnd(s + 20 + q) * 3)], souls: 1 }); }
          if (rnd(s + 7) > 0.15) out.sunday.push({ ts: sun, date: sun, hub: h.hub, governor: g,
            attendance: Math.round(base * (1 + rnd(s + 8) * 0.9)), photo: '' });
        });
        var so = (i + 1) * 53 + w * 71;
        if (rnd(so) > 0.15) { var t = hubTotal + Math.round(rnd(so + 1) * 6);
          out.overseer.push({ ts: d, date: d, hub: h.hub, overseer: h.overseer, attendance: t, offering: Math.round(t * (4 + rnd(so + 2) * 6)), photo: '' }); }
      });
    }
    return out;
  }

  // ---------- model ----------
  // rehearsal / sunday : each GOVERNOR reports their own members  → latest per (hub, governor); hub total = sum
  // outreach           : one row per soul                          → added up per governor
  // overseer           : one report per hub (attendance + offering) → latest per hub
  function build(raw, isSample) {
    var weeks = {}, per = { rehearsal: {}, sunday: {} }, ovr = {}, out = {}, gov = {}, hubGov = {}, svc = {};
    // Which weekend a report belongs to. The date the person picked is used, UNLESS it is more than
    // 3 weeks away from when they actually submitted (a slip such as picking the wrong year):
    // then the submission time is trusted instead.
    function when(r) {
      if (r.date && r.ts && Math.abs(r.date - r.ts) > 21 * 86400000) return r.ts;
      return r.date || r.ts;
    }
    function wk(r) { var sat = weekendSaturday(when(r)), key = sat.getTime(); weeks[key] = sat; return key; }
    function newer(r, prev) { return !prev || ((r.ts || 0) >= (prev.ts || 0)); }
    // The Rehearsal form has no Hub Center question: a governor's rehearsal counts under their PRIMARY hub
    // (the first hub they are listed under in roster.js).
    var primary = {}, govHubs = {}; HUBS.forEach(function (h) { h.governors.forEach(function (g) { if (!primary[g]) primary[g] = h; (govHubs[g] = govHubs[g] || []).push(h.hub); }); });

    ['rehearsal', 'sunday'].forEach(function (type) {
      (raw[type] || []).forEach(function (r) {
        // Hub: rehearsal always goes under the governor's primary hub. On Sunday the hub the governor
        // picked is used ONLY if it is really one of their hubs; if they picked someone else's hub by
        // mistake (e.g. "First Love" instead of "HGE FLC") the report goes under their own hub.
        var g = r.governor || 'Unknown', own = govHubs[g] || [], hub;
        if (type === 'rehearsal') hub = primary[g] ? primary[g].hub : (r.hub || 'No hub center');
        else hub = own.indexOf(r.hub) !== -1 ? r.hub : (primary[g] ? primary[g].hub : (r.hub || 'No hub center'));
        var key = wk(r), a = per[type][key] || (per[type][key] = {}), b = a[hub] || (a[hub] = {});
        if (newer(r, b[g])) b[g] = r;
      });
    });
    (raw.overseer || []).forEach(function (r) { var key = wk(r), a = ovr[key] || (ovr[key] = {}); if (newer(r, a[r.hub])) a[r.hub] = r; });
    (raw.outreach || []).forEach(function (r) {
      var key = wk(r), n = r.souls == null ? 1 : r.souls, g = r.governor || 'Unknown';
      var hub = primary[g] ? primary[g].hub : (r.hub || 'No hub center');   // Outreach form has no Hub Center question
      var a = out[key] || (out[key] = {}); a[hub] = (a[hub] || 0) + n;
      var gw = gov[key] || (gov[key] = {}); gw[g] = (gw[g] || 0) + n;
      var hw = hubGov[key] || (hubGov[key] = {}), hh = hw[hub] || (hw[hub] = {}); hh[g] = (hh[g] || 0) + n;
      var sw = svc[key] || (svc[key] = {}), sv = r.service || 'Not stated'; sw[sv] = (sw[sv] || 0) + n;
    });

    var weekList = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      return { key: k, date: weeks[k], wk: isoWeek(weeks[k]), label: weekendLabel(weeks[k]) };
    });

    // hub-level record (null = nothing reported for that hub that weekend)
    function get(type, key, hub) {
      if (type === 'overseer') return (ovr[key] || {})[hub] || null;
      if (type === 'outreach') { var n = (out[key] || {})[hub]; return n ? { hub: hub, souls: n } : null; }
      var b = (per[type][key] || {})[hub]; if (!b) return null;
      var sum = 0, photo = '', names = Object.keys(b);
      names.forEach(function (g) { if (b[g].attendance != null) sum += b[g].attendance; if (!photo && b[g].photo) photo = b[g].photo; });
      return { hub: hub, attendance: sum, photo: photo, reports: names.length };
    }
    function govGet(type, key, hub, g) { return ((per[type][key] || {})[hub] || {})[g] || null; }  // one governor's own report
    function defaulters(type, key) { return HUBS.filter(function (h) { return !get(type, key, h.hub); }); }
    function total(type, key, field, hub) {
      var s = 0; HUBS.forEach(function (h) { if (hub && h.hub !== hub) return; var r = get(type, key, h.hub); if (r && r[field] != null) s += r[field]; });
      return s;
    }

    // every (hub, governor) pair that is expected to report
    var pairs = []; HUBS.forEach(function (h) { h.governors.forEach(function (g) {
      pairs.push({ hub: h.hub, short: h.short, name: g, primary: primary[g] === h, primaryShort: primary[g].short }); }); });
    // rehearsal is expected ONCE per governor (under the primary hub); Sunday once per hub-governor pair
    function expected(type) { return type === 'rehearsal' ? pairs.filter(function (p) { return p.primary; }) : pairs; }
    function pairDefaulters(type, key) { return expected(type).filter(function (p) { return !govGet(type, key, p.hub, p.name); }); }

    // governors (unique), each with the hubs they serve
    var govList = [], seen = {};
    HUBS.forEach(function (h) { h.governors.forEach(function (g) {
      if (!seen[g]) { seen[g] = { name: g, hubs: [] }; govList.push(seen[g]); }
      seen[g].hubs.push(h.short);
    }); });
    (window.EXTRA_GOVERNORS || []).forEach(function (g) { if (!seen[g]) { seen[g] = { name: g, hubs: [] }; govList.push(seen[g]); } });
    function serviceSouls(key) { return svc[key] || {}; }
    // every soul, including those won by governors who have no hub center yet
    function soulsTotal(key) { var t = 0, g = gov[key] || {}; Object.keys(g).forEach(function (x) { t += g[x]; }); return t; }
    function govSouls(key, g) { return (gov[key] || {})[g] || 0; }               // a governor, all their hubs
    function hubGovSouls(key, hub, g) { return ((hubGov[key] || {})[hub] || {})[g] || 0; } // a governor in one hub
    function govDefaulters(key) { return govList.filter(function (g) { return !govSouls(key, g.name); }); }
    return { sample: !!isSample, weeks: weekList, hubs: HUBS, governors: govList, pairs: pairs, expected: expected, get: get, govGet: govGet,
             defaulters: defaulters, pairDefaulters: pairDefaulters, total: total, soulsTotal: soulsTotal, serviceSouls: serviceSouls,
             govSouls: govSouls, hubGovSouls: hubGovSouls, govDefaulters: govDefaulters };
  }

  function load(cb, onErr) {
    if (!CFG.SHEET_ID) return cb(build(sample(), true));
    var names = ['rehearsal', 'outreach', 'sunday', 'overseer'];
    Promise.all(names.map(function (t) {
      // the Overseer tab is optional: if it cannot be read, carry on without it
      return fetchTab(CFG.TABS[t]).catch(function (e) { if (t === 'overseer') return []; throw e; });
    })).then(function (res) {
      var raw = {}; names.forEach(function (t, i) { raw[t] = res[i]; });
      // a missing tab makes Google return the FIRST tab instead: only trust rows that carry an overseer name
      raw.overseer = raw.overseer.filter(function (r) { return r.overseer; });
      cb(build(raw, false));
    }).catch(function (e) { if (onErr) onErr(e); });
  }

  // ---------- shared UI helpers ----------
  var valueLabels = { id: 'valueLabels', afterDatasetsDraw: function (chart) {
    var ctx = chart.ctx, horiz = chart.options.indexAxis === 'y';
    chart.data.datasets.forEach(function (ds, di) {
      var meta = chart.getDatasetMeta(di); if (meta.hidden || ds.noLabels) return;
      meta.data.forEach(function (el, i) {
        var v = ds.data[i]; if (v == null) return;
        ctx.save(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial';
        if (horiz) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v, el.x + 5, el.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(v, el.x, el.y - 4); }
        ctx.restore();
      });
    });
  }};
  function banner(model) {
    if (!model.sample) return;
    var b = document.createElement('div'); b.className = 'sample';
    b.textContent = 'SAMPLE DATA — the Google Sheet is not connected yet (set SHEET_ID in config.js)';
    document.body.insertBefore(b, document.body.firstChild);
  }
  function fail(e) {
    var el = document.getElementById('status') || document.body;
    el.innerHTML = '<div class="err">⚠ ' + (e && e.message ? e.message : 'Could not load data') + '</div>';
  }
  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString('en-GB'); }

  return { load: load, valueLabels: valueLabels, banner: banner, fail: fail, fmt: fmt };
})();
