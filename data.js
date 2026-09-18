/* Live loader for the GLGC Hub Reports dashboard.
   Reads the Rehearsal / Outreach / Sunday tabs via gviz JSONP (no backend),
   groups every report into a WEEKEND (keyed by its Saturday). Rehearsal and Sunday keep
   the latest submission per hub per weekend. Outreach is ONE ROW PER SOUL (no personal
   details in this sheet), so its rows are ADDED UP per hub per weekend. */
window.GLGC = (function () {
  var CFG = window.GLGC_CONFIG, HUBS = window.HUBS;
  var TYPES = ['rehearsal', 'outreach', 'sunday'];

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
    ts: ['timestamp'], date: ['date'], hub: ['hub'], governor: ['governor'],
    attendance: ['attendance'], offering: ['offering'], souls: ['souls'], photo: ['photo', 'picture', 'image']
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
        governor: String(v('governor') || '').trim(), attendance: toNum(v('attendance')),
        offering: toNum(v('offering')), souls: toNum(v('souls')),
        photo: String(v('photo') || '').split(',')[0].trim() };
    }).filter(function (r) { return r.hub && (r.date || r.ts); });
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
    var out = { rehearsal: [], outreach: [], sunday: [] };
    var sat = weekendSaturday(new Date()); if (sat > new Date()) sat.setDate(sat.getDate() - 7);
    for (var w = 5; w >= 0; w--) {
      var d = new Date(sat); d.setDate(d.getDate() - 7 * w);
      var sun = new Date(d); sun.setDate(sun.getDate() + 1);
      HUBS.forEach(function (h, i) {
        var s = (i + 1) * 37 + w * 101, base = 6 + h.shepherds * 3;
        if (rnd(s) > 0.18) { var a = Math.round(base * (0.7 + rnd(s + 1) * 0.6));
          out.rehearsal.push({ ts: d, date: d, hub: h.hub, governor: h.governors[0], attendance: a, offering: Math.round(a * (4 + rnd(s + 2) * 6)), photo: '' }); }
        if (rnd(s + 3) > 0.3) { var m = 1 + Math.round(base * rnd(s + 5) * 0.5);
          for (var q = 0; q < m; q++) out.outreach.push({ ts: d, date: d, hub: h.hub, governor: h.governors[Math.floor(rnd(s + 9 + q) * h.governors.length)], souls: 1 }); }
        if (rnd(s + 7) > 0.12) out.sunday.push({ ts: sun, date: sun, hub: h.hub, governor: h.governors[0],
          attendance: Math.round(base * (1 + rnd(s + 8) * 0.9)), photo: '' });
      });
    }
    return out;
  }

  // ---------- model ----------
  function build(raw, isSample) {
    var known = {}; HUBS.forEach(function (h) { known[h.hub] = 1; });
    var weeks = {}, data = {}, gov = {}, hubGov = {};
    TYPES.forEach(function (type) {
      data[type] = {};
      (raw[type] || []).forEach(function (r) {
        var sat = weekendSaturday(r.date || r.ts), key = sat.getTime();
        weeks[key] = sat;
        var slot = data[type][key] || (data[type][key] = {});
        var prev = slot[r.hub];
        if (type === 'outreach') {                                     // one row per soul → add up
          var n = r.souls == null ? 1 : r.souls, g = r.governor || 'Unknown';
          var gw = gov[key] || (gov[key] = {}); gw[g] = (gw[g] || 0) + n;
          var hw = hubGov[key] || (hubGov[key] = {}), hh = hw[r.hub] || (hw[r.hub] = {}); hh[g] = (hh[g] || 0) + n;
          if (prev) prev.souls += n; else slot[r.hub] = { hub: r.hub, governor: r.governor, ts: r.ts, date: r.date, souls: n };
        } else if (!prev || ((r.ts || 0) >= (prev.ts || 0))) slot[r.hub] = r; // latest submission wins
      });
    });
    var weekList = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      return { key: k, date: weeks[k], wk: isoWeek(weeks[k]), label: weekendLabel(weeks[k]) };
    });
    function get(type, key, hub) { return (data[type][key] || {})[hub] || null; }
    function defaulters(type, key) { return HUBS.filter(function (h) { return !get(type, key, h.hub); }); }
    function total(type, key, field, hub) {
      var s = 0; HUBS.forEach(function (h) { if (hub && h.hub !== hub) return; var r = get(type, key, h.hub); if (r && r[field] != null) s += r[field]; });
      return s;
    }
    // governors (unique), each with the hubs they serve
    var govList = [], seen = {};
    HUBS.forEach(function (h) { h.governors.forEach(function (g) {
      if (!seen[g]) { seen[g] = { name: g, hubs: [] }; govList.push(seen[g]); }
      seen[g].hubs.push(h.short);
    }); });
    function govSouls(key, g) { return (gov[key] || {})[g] || 0; }               // a governor, all their hubs
    function hubGovSouls(key, hub, g) { return ((hubGov[key] || {})[hub] || {})[g] || 0; } // a governor in one hub
    function govDefaulters(key) { return govList.filter(function (g) { return !govSouls(key, g.name); }); }
    return { sample: !!isSample, weeks: weekList, hubs: HUBS, governors: govList, get: get, defaulters: defaulters,
             total: total, govSouls: govSouls, hubGovSouls: hubGovSouls, govDefaulters: govDefaulters };
  }

  function load(cb, onErr) {
    if (!CFG.SHEET_ID) return cb(build(sample(), true));
    Promise.all(TYPES.map(function (t) { return fetchTab(CFG.TABS[t]); })).then(function (res) {
      cb(build({ rehearsal: res[0], outreach: res[1], sunday: res[2] }, false));
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
