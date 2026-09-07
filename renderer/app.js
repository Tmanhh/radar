let state = null;

const $ = (s) => document.querySelector(s);
let logLines = [];
let lastWasTransient = false;
const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'nguồn';
  }
};

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

/* ---- dieu huong ---- */
document.querySelectorAll('.tab').forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('is-on'));
    document.querySelectorAll('.view').forEach((x) => x.classList.remove('is-on'));
    t.classList.add('is-on');
    $('#view-' + t.dataset.view).classList.add('is-on');
    if (t.dataset.view === 'track') paintTrack();
    if (t.dataset.view === 'calendar') paintAutoEvents();
    if (t.dataset.view === 'niches') paintNiches();
  };
});

/* ---- trang thai ---- */
async function save() {
  await window.radar.saveState(state);
}

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic API key',
    hint: 'sk-ant-...',
    model: 'claude-sonnet-5',
    note: 'Lấy tại platform.claude.com → Settings → API keys. Cần nạp tiền trước, tối thiểu $5.'
  },
  gemini: {
    label: 'Gemini API key',
    hint: 'AIza...',
    model: 'gemini-2.5-flash',
    note:
      'Lấy tại aistudio.google.com → Get API key. Miễn phí, không cần thẻ. ' +
      'Lưu ý: gói Gemini Pro hay Google AI Pro KHÔNG dùng được ở đây — đó là thuê bao chat, ' +
      'không bao gồm quyền dùng API. Phải tạo khoá riêng trong AI Studio.'
  }
};

let TEAM = null;

function readSettings() {
  state.settings.provider = $('#s-provider').value;
  state.settings.apiKey = $('#s-key').value.trim();
  state.settings.model = $('#s-model').value.trim() || 'claude-sonnet-5';
  state.settings.modelReason = $('#s-model2').value.trim();
  state.settings.modelPerMinute = Math.max(1, parseInt($('#s-rpm').value, 10) || 8);
  state.settings.industry = $('#s-industry').value.trim();
  state.settings.markets = $('#s-markets').value.trim();
  state.settings.windowDays = Math.max(1, parseInt($('#s-window').value, 10) || 14);
  state.settings.priceMin = Math.max(0, parseInt($('#s-pmin').value, 10) || 0);
  state.settings.priceMax = Math.max(1, parseInt($('#s-pmax').value, 10) || 200);
  state.settings.politeDelayMs = Math.max(0, parseInt($('#s-delay').value, 10) || 0);
  state.settings.autoDiscover = $('#s-auto').value === '1';
  state.settings.scoreThreshold = Math.max(0, Math.min(10, parseInt($('#s-thresh').value, 10) || 0));
  state.settings.repo = $('#s-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  state.settings.redditUser = $('#s-reddit').value.trim().replace(/^\/?u\//, '');
  if (!TEAM) {
    state.settings.webAppUrl = $('#s-weburl').value.trim();
    state.settings.webAppToken = $('#s-webtoken').value.trim();
    state.settings.sheetUrl = $('#s-sheeturl').value.trim();
  }
}

function paintSettings() {
  const s = state.settings;
  const p = PROVIDERS[s.provider] || PROVIDERS.anthropic;
  $('#s-provider').value = s.provider || 'anthropic';
  $('#s-key-label').textContent = p.label;
  $('#s-key').placeholder = p.hint;
  $('#s-key-note').textContent = p.note || '';
  $('#s-key').value = s.apiKey || '';
  $('#s-model').value = s.model;
  $('#s-model2').value = s.modelReason || '';
  $('#s-rpm').value = s.modelPerMinute ?? 8;
  $('#s-industry').value = s.industry || '';
  $('#s-markets').value = s.markets || '';
  $('#s-window').value = s.windowDays;
  $('#s-delay').value = s.politeDelayMs;
  $('#s-pmin').value = s.priceMin ?? 40;
  $('#s-pmax').value = s.priceMax ?? 200;
  if (!TEAM) {
    $('#s-weburl').value = s.webAppUrl || '';
    $('#s-webtoken').value = s.webAppToken || '';
    $('#s-sheeturl').value = s.sheetUrl || '';
  }
  $('#s-auto').value = s.autoDiscover === false ? '0' : '1';
  $('#s-thresh').value = s.scoreThreshold ?? 6;
  $('#s-repo').value = s.repo || '';
  $('#s-reddit').value = s.redditUser || '';
}


// Doi nha cung cap thi khoa va model cu khong dung nua, xoa de tranh loi kho hieu.
$('#s-provider').onchange = () => {
  const next = $('#s-provider').value;
  if (next === state.settings.provider) return;
  state.settings.provider = next;
  state.settings.apiKey = '';
  state.settings.model = PROVIDERS[next].model;
  $('#s-model-out').textContent = '';
  paintSettings();
  save();
};

$('#s-model-list').onclick = async () => {
  const btn = $('#s-model-list');
  const out = $('#s-model-out');
  readSettings();
  btn.disabled = true;
  out.textContent = 'Đang hỏi...';
  out.className = 'hint';
  const r = await window.radar.listModels(state.settings);
  btn.disabled = false;
  if (!r.ok) {
    out.className = 'hint err';
    out.textContent = r.error;
    return;
  }
  if (!r.models.length) {
    out.textContent = 'Khoá này không có model nào khả dụng.';
    return;
  }
  out.className = 'model-list';
  out.innerHTML = '';
  for (const m of r.models) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m;
    b.onclick = () => {
      // Bam nhieu model thi cong don, vi han muc tinh theo tung model.
      const cur = $('#s-model')
        .value.split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (!cur.includes(m)) cur.push(m);
      $('#s-model').value = cur.join(', ');
      readSettings();
      save();
      out.className = 'hint';
      out.textContent =
        cur.length > 1 ? `${cur.length} model — Radar sẽ xoay vòng` : 'Đã chọn ' + m;
    };
    out.appendChild(b);
  }
};

['#s-key', '#s-model', '#s-model2', '#s-rpm', '#s-industry', '#s-markets', '#s-window', '#s-delay', '#s-reddit', '#s-repo', '#s-auto', '#s-thresh', '#s-weburl', '#s-webtoken', '#s-sheeturl', '#s-pmin', '#s-pmax'].forEach(
  (sel) => {
    document.addEventListener('change', (e) => {
      if (e.target.matches(sel)) {
        readSettings();
        // hien thi dung gia tri da chuan hoa
        if (sel === '#s-reddit') $('#s-reddit').value = state.settings.redditUser;
        save();
      }
    });
  }
);

/* ---- nguon ---- */
function paintSources() {
  const ul = $('#src-list');
  if (!state.sources.length) {
    ul.innerHTML = '<li><span class="sub">Chưa có nguồn nào. Thêm một feed để bắt đầu.</span></li>';
    return;
  }
  ul.innerHTML = state.sources
    .map(
      (s, i) =>
        `<li><span title="${esc(s.url)}">${esc(s.label || s.url)}</span>
         <span class="sub">${esc(new URL(s.url).hostname.replace('www.', ''))}</span>
         <button class="del" data-src="${i}" aria-label="Xoá nguồn">Xoá</button></li>`
    )
    .join('');
}

$('#src-add').onclick = () => {
  const url = $('#src-url').value.trim();
  if (!url) return;
  try {
    new URL(url);
  } catch {
    alert('Địa chỉ không hợp lệ. Cần dạng https://...');
    return;
  }
  state.sources.push({ url, label: $('#src-label').value.trim() || url });
  $('#src-url').value = '';
  $('#src-label').value = '';
  paintSources();
  save();
};

$('#src-suggest').onclick = async () => {
  const btn = $('#src-suggest');
  const msg = $('#src-sug-msg');
  const box = $('#src-sug');
  btn.disabled = true;
  msg.className = 'ex-msg';
  msg.textContent = 'Đang chạy...';
  box.hidden = true;
  box.innerHTML = '';

  const r = await window.radar.suggestSources(state.settings, state.sources);
  btn.disabled = false;

  if (!r.ok) {
    msg.className = 'ex-msg bad';
    msg.textContent = r.error;
    return;
  }

  const th = state.settings.scoreThreshold ?? 6;
  const live = r.results.filter((x) => x.ok);
  const dead = r.results.filter((x) => !x.ok);
  const over = live.filter((x) => (x.score ?? 0) >= th);
  msg.textContent =
    `${live.length} nguồn có thật, ${over.length} đạt điểm từ ${th} trở lên, ${dead.length} bị loại.`;
  box.hidden = false;
  $('#src-add-all').hidden = over.length === 0;

  const render = (s) => {
    const el = document.createElement('div');
    const under = (s.score ?? 0) < th;
    el.className = 'sug-item' + (under ? ' under' : '');
    el.innerHTML =
      `<div class="sug-head">` +
      `<span class="sug-score ${under ? 'lo' : 'hi'}">${s.score ?? '—'}</span>` +
      `<span class="sug-name">${s.type === 'site' ? esc(s.name) : 'r/' + esc(s.name)}</span>` +
      `<span class="sug-count">${s.count} bài / 90 ngày</span>` +
      `<button class="sug-add">Thêm</button></div>` +
      (s.verdict ? `<p class="sug-verdict">${esc(s.verdict)}</p>` : '') +
      `<ul class="sug-samples">${(s.evidence ? [s.evidence] : s.samples)
        .map((t) => `<li>${esc(t)}</li>`)
        .join('')}</ul>`;
    const b = el.querySelector('.sug-add');
    const has = () => state.sources.some((x) => x.url === s.url);
    if (has()) {
      b.disabled = true;
      b.textContent = 'Đã có';
    }
    b.onclick = () => {
      if (has()) return;
      state.sources.push({
        url: s.url,
        label: s.type === 'reddit' ? 'r/' + s.name : s.type === 'news' ? 'tin: ' + s.name : s.name
      });
      b.disabled = true;
      b.textContent = 'Đã thêm';
      paintSources();
      save();
    };
    box.appendChild(el);
  };

  live.forEach(render);

  $('#src-add-all').onclick = () => {
    for (const s of over) {
      if (!state.sources.some((x) => x.url === s.url)) {
        state.sources.push({
        url: s.url,
        label: s.type === 'reddit' ? 'r/' + s.name : s.type === 'news' ? 'tin: ' + s.name : s.name
      });
      }
    }
    box.querySelectorAll('.sug-add').forEach((b) => {
      if (!b.disabled) {
        b.disabled = true;
        b.textContent = 'Đã thêm';
      }
    });
    paintSources();
    save();
    msg.className = 'ex-msg ok';
    msg.textContent = `Đã thêm ${over.length} nguồn.`;
  };

  if (dead.length) {
    const el = document.createElement('div');
    el.className = 'sug-dead';
    el.innerHTML =
      '<b>Bị loại khi kiểm chứng:</b> ' +
      dead.map((d) => `${d.type === 'reddit' ? 'r/' : ''}${esc(d.name)} (${esc(d.reason)})`).join(', ');
    box.appendChild(el);
  }
};

window.radar.onSuggestLog((m) => {
  const msg = $('#src-sug-msg');
  if (!msg.classList.contains('bad')) msg.textContent = m.trim();
});

/* ---- lich ---- */
function paintCalendar() {
  const ul = $('#cal-list');
  const list = [...state.calendar].sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) {
    ul.innerHTML =
      '<li><span class="sub">Chưa có sự kiện nào. Thêm những gì đã biết trước ngày.</span></li>';
    return;
  }
  ul.innerHTML = list
    .map((c) => {
      const i = state.calendar.indexOf(c);
      return `<li><span class="sub">${esc(c.date)}</span>
        <span>${esc(c.title)}${c.note ? ' — ' + esc(c.note) : ''}</span>
        <button class="del" data-cal="${i}" aria-label="Xoá sự kiện">Xoá</button></li>`;
    })
    .join('');
}

$('#cal-add').onclick = () => {
  const date = $('#cal-date').value;
  const title = $('#cal-title').value.trim();
  if (!date || !title) return;
  state.calendar.push({ date, title, note: $('#cal-note').value.trim() });
  $('#cal-title').value = '';
  $('#cal-note').value = '';
  paintCalendar();
  save();
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('.del');
  if (!b) return;
  if (b.dataset.src != null) {
    state.sources.splice(+b.dataset.src, 1);
    paintSources();
  }
  if (b.dataset.cal != null) {
    state.calendar.splice(+b.dataset.cal, 1);
    paintCalendar();
  }
  save();
});

/* ---- ket qua ---- */
function markRow(c) {
  const yoy = !c.yoyKnown
    ? `<span class="mark unknown"><span class="glyph dash"></span>cùng kỳ: chưa có</span>`
    : `<span class="mark ${c.signalYoY ? 'on' : ''}"><span class="glyph dash"></span>${
        c.signalYoY ? `cao hơn cùng kỳ (${c.lastYearCount})` : 'bằng cùng kỳ'
      }</span>`;

  // Nhan dai lam hang dau hieu gay dong. Ngay da co o tab Lich su kien.
  const ev = (c.upcomingEvents || []).map((e) => e.title).join(', ');

  return `<div class="marks">
    <span class="mark ${c.signalHot ? 'on' : ''}"><span class="glyph"></span>${
      c.signalHot ? `${c.itemCount} bài` : `chỉ ${c.itemCount || 0} bài`
    }</span>
    <span class="mark ${c.signalUpcoming ? 'on' : ''}"><span class="glyph up"></span>${
      c.signalUpcoming ? esc(ev) : 'không khớp lịch'
    }</span>
    ${yoy}
    <span class="mark ${c.signalPersist ? 'on' : ''}">${sparkline(c)}${
      c.isNew ? 'lần đầu xuất hiện' : `nhắc lại ${c.streak} lần liền`
    }</span>
  </div>`;
}

// Tám ô: chủ đề này có mặt ở lần chạy nào. Một chấm đơn độc là nhiễu,
// một chuỗi liền là tín hiệu — đọc được trong một cái liếc.
function sparkline(c) {
  const h = c.history || [];
  if (!h.length) return '';
  const dots = h.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('');
  return `<span class="spark" title="${h.filter(Boolean).length}/${h.length} lần chạy gần đây">${dots}</span>`;
}

function paintResults() {
  const box = $('#results');
  const r = state.results;

  if (!r || !r.clusters || !r.clusters.length) {
    box.innerHTML = `<div class="empty">
      <b>Chưa chạy lần nào</b>
      <p>Vào Cài đặt điền API key và ngành của bạn, rồi bấm Chạy. Radar tự tìm nguồn nếu bạn chưa thêm nguồn nào.</p>
      <p>Lần chạy đầu mất một hai phút, phần lớn là chờ giữa các lượt gọi Reddit.</p>
    </div>`;
    $('#meta').textContent = '';
    $('#export').hidden = true;
    return;
  }
  $('#export').hidden = false;
  $('#ex-msg').textContent = '';

  box.innerHTML = r.clusters
    .map((c) => {
      // Lay o dau thi ghi o day. Khong can trich dan dai, chi can duong dan.
      // Gop theo nhan, khong theo duong dan: hai bai khac nhau cung mot sub
      // van chi la mot nguon.
      const seenSrc = new Set();
      const links = (c.quotes || [])
        .filter((q) => {
          const k = (q.source || hostOf(q.link || '')).toLowerCase();
          if (!q.link || !k || seenSrc.has(k)) return false;
          seenSrc.add(k);
          return true;
        })
        .slice(0, 4)
        .map(
          (q) =>
            `<a class="srclink" href="#" data-open="${esc(q.link)}">${esc(
              q.source || hostOf(q.link)
            )}</a>`
        )
        .join('');
      const quotes = links ? `<div class="srclinks">${links}</div>` : '';

      const ideas = (c.ideas || []).length
        ? `<ul class="ideas">${c.ideas
            .map(
              (i, n) => `<li>
                <div class="idea-head">
                  <span class="idea-name">${esc(i.product)}</span>
                  ${i.price ? `<span class="idea-price">$${esc(String(i.price))}</span>` : ''}
                </div>
                <div class="idea-tags">
                  ${i.variants ? `<span class="tag">${esc(i.variants)}</span>` : ''}
                  ${i.fromLabel ? `<span class="tag src">${esc(i.fromLabel)}</span>` : ''}
                </div>
                <div class="idea-why">${esc(i.why)}</div>
                ${i.moat ? `<div class="idea-risk"><b>Brand thống lĩnh:</b> ${esc(i.moat)}</div>` : ''}
                <div class="idea-risk"><b>Rủi ro:</b> ${esc(i.risk)}</div>
                <div class="idea-foot"><button class="add-track" data-idea="${esc(c.topic)}||${n}">Theo dõi</button></div>
              </li>`
            )
            .join('')}</ul>`
        : '';

      return `<article class="cluster">
        <div class="rail"><div class="rank s${c.score}">${c.score}</div></div>
        <div>
          <div class="topline">
            <h3 class="topic">${esc(c.topic)}</h3>
            ${c.isNew ? '<span class="tag new">mới</span>' : ''}
          </div>
          ${markRow(c)}
          ${quotes}
          ${ideas}
        </div>
      </article>`;
    })
    .join('');

  const m = r.meta;
  const when = new Date(m.ranAt).toLocaleString('vi-VN', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const parts = [
    `<span class="when">${when}</span>`,
    `<span>${m.itemsFresh} bài trên ${m.itemsTotal}</span>`,
    `<span>${m.sourceCount || 0} nguồn</span>`,
    `<span>kho lưu trữ ${m.archiveWeeks} tuần</span>`
  ];
  if (m.failures && m.failures.length) {
    parts.push(`<span class="err">${m.failures.length} nguồn lỗi</span>`);
  }
  $('#meta').innerHTML = parts.join('');
}

document.addEventListener('click', async (e) => {
  const eb = e.target.closest('[data-ev]');
  if (eb) {
    const i = (state.results?.eventIdeas || [])[+eb.dataset.ev];
    if (i) {
      await window.radar.trackAdd({
        topic: i.eventTitle || 'sự kiện',
        product: i.product,
        evidence: i.chain || '',
        risk: i.risk || '',
        source: 'suy từ sự kiện'
      });
      eb.disabled = true;
      eb.textContent = 'Đã thêm vào Theo dõi';
      paintTrack();
    }
    return;
  }
  const tb = e.target.closest('[data-idea]');
  if (tb) {
    const [topic, n] = tb.dataset.idea.split('||');
    const c = (state.results?.clusters || []).find((x) => x.topic === topic);
    const idea = c && c.ideas[+n];
    if (idea) {
      await window.radar.trackAdd({
        topic,
        product: idea.product,
        evidence: idea.evidence || '',
        risk: idea.risk || '',
        source: (c.quotes || [])[0]?.source || ''
      });
      tb.disabled = true;
      tb.textContent = 'Đã thêm vào Theo dõi';
      paintTrack();
    }
    return;
  }
  const a = e.target.closest('[data-open]');
  if (a) {
    e.preventDefault();
    window.radar.open(a.dataset.open);
  }
});


/* ---- cau hinh va chi phi ---- */
$('#cfg-export').onclick = async () => {
  const r = await window.radar.exportConfig();
  const m = $('#cfg-msg');
  if (r.canceled) return (m.textContent = '');
  m.className = 'ex-msg ok';
  m.textContent = 'Đã lưu.';
};

$('#cfg-import').onclick = async () => {
  const r = await window.radar.importConfig();
  const m = $('#cfg-msg');
  if (r.canceled) return (m.textContent = '');
  if (!r.ok) {
    m.className = 'ex-msg bad';
    m.textContent = r.error;
    return;
  }
  const c = r.config;
  // Gop them, khong xoa cai dang co.
  for (const src of c.sources || []) {
    if (!state.sources.some((x) => x.url === src.url)) state.sources.push(src);
  }
  for (const ev of c.calendar || []) {
    if (!state.calendar.some((x) => x.date === ev.date && x.title === ev.title)) {
      state.calendar.push(ev);
    }
  }
  for (const n of c.niches || []) {
    if (!(state.niches || []).some((x) => sameNiche(x.name, n.name))) {
      state.niches = [...(state.niches || []), { ...n, run: false, lastRun: null }];
    }
  }
  Object.assign(state.settings, c.settings || {});
  paintSettings();
  paintSources();
  paintCalendar();
  await save();
  m.className = 'ex-msg ok';
  m.textContent = `Đã nhập ${(c.sources || []).length} nguồn, ${(c.calendar || []).length} sự kiện.`;
};

$('#dbg-save').onclick = async () => {
  const m = $('#cfg-msg');
  const r = await window.radar.saveDebug();
  if (r.canceled) return (m.textContent = '');
  m.className = r.ok ? 'ex-msg ok' : 'ex-msg bad';
  m.textContent = r.ok ? `Đã lưu ${r.calls} lượt gọi.` : r.error;
};

async function paintSpend() {
  const spend = await window.radar.spend();
  const months = Object.keys(spend).sort().reverse().slice(0, 3);
  if (!months.length) return ($('#spend').hidden = true);
  $('#spend').hidden = false;
  const rate = state.settings.provider === 'gemini' ? null : { in: 2, out: 10 };
  $('#spend').innerHTML =
    '<h3>Mức dùng</h3>' +
    months
      .map((mo) => {
        const d = spend[mo];
        const cost = rate
          ? ' · ~$' +
            ((d.inputTokens / 1e6) * rate.in + (d.outputTokens / 1e6) * rate.out).toFixed(2)
          : ' · miễn phí nếu ở bậc free của Gemini';
        return `<p>${mo}: ${d.runs} lần chạy, ${d.calls} lượt gọi, ${(
          (d.inputTokens + d.outputTokens) /
          1000
        ).toFixed(0)}k token${cost}</p>`;
      })
      .join('');
}

/* ---- ngach con ---- */

// Mo hinh dat ten khac nhau moi lan: "Pha ca phe thu cong" va
// "Pha ca phe thu cong (Home Brewing)" la mot ngach. Khop chinh xac tung
// ky tu se coi chung la hai, va mat ngay chay.
const STOP = new Set(['va','tai','cho','cua','trong','the','and','for','at','home','diy']);

function nicheKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function sameNiche(a, b) {
  const A = new Set(nicheKey(a));
  const B = new Set(nicheKey(b));
  if (!A.size || !B.size) return false;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size) >= 0.6;
}

// Ngach vua chay thi khong nen chay lai ngay. Hien tuoi ro rang va
// tu bo tick nhung cai con moi, nhung van cho nguoi dung ghi de.
function nicheAge(n) {
  if (!n.lastRun) return { label: 'chưa chạy lần nào', cls: 'stale', days: 999 };
  const d = Math.floor((Date.now() - Date.parse(n.lastRun)) / 86400000);
  const label = d === 0 ? 'chạy hôm nay' : d === 1 ? 'chạy hôm qua' : `chạy ${d} ngày trước`;
  return { label, cls: d < 7 ? 'fresh' : d >= 28 ? 'stale' : '', days: d };
}

function paintNiches() {
  const box = $('#niche-list');
  const list = state.niches || [];
  if (!list.length) {
    box.innerHTML = `<div class="empty">
      <b>Chưa chẻ ngách</b>
      <p>Điền ngành trong Cài đặt rồi bấm nút trên. Radar đề xuất 8–10 ngách con, bạn tick cái nào đáng theo.</p>
      <p>Không tick cái nào thì Radar chạy trên cả ngành, và với ngành rộng thì kết quả thường loãng.</p>
    </div>`;
    return;
  }

  box.innerHTML = '';
  for (const n of list) {
    const age = nicheAge(n);
    const ran = !!n.lastRun;
    const el = document.createElement('div');
    el.className = 'nch' + (n.run ? '' : ' off');

    // Da chay roi thi phai noi ro, khong de nguoi dung tick nham
    // roi ngoi cho lai mot ngach vua chay hom qua.
    const badge = ran
      ? `<span class="pill ran">đã chạy</span>`
      : `<span class="pill new">chưa chạy</span>`;
    const orphan = n.orphan ? `<span class="pill">không còn trong đợt chẻ mới</span>` : '';

    el.innerHTML =
      `<div><input type="checkbox" ${n.run ? 'checked' : ''} aria-label="Chạy ngách này"></div>
       <div>
         <div class="nch-head">
           <span class="nch-name">${esc(n.name)}</span>
           ${badge}${orphan}
           ${n.promise ? `<span class="pill">${esc(n.promise)}</span>` : ''}
           <span class="nch-age ${age.cls}">${age.label}</span>
         </div>
         <div class="nch-desc">${esc(n.desc || '')}</div>
         ${n.products ? `<div class="nch-prod">${esc(n.products)}</div>` : ''}
         ${n.verdict ? `<div class="nch-verdict">${esc(n.verdict)}</div>` : ''}
         ${ran ? `<button class="nch-upd">Cập nhật ngách này</button>` : ''}
       </div>`;

    const cb = el.querySelector('input');
    const setRun = (v) => {
      n.run = v;
      cb.checked = v;
      el.classList.toggle('off', !v);
      const b = el.querySelector('.nch-upd');
      if (b) {
        b.textContent = v ? 'Sẽ cập nhật ở lần chạy tới' : 'Cập nhật ngách này';
        b.classList.toggle('on', v);
      }
      save();
      paintNicheMsg();
    };
    cb.onchange = (e) => setRun(e.target.checked);
    const upd = el.querySelector('.nch-upd');
    if (upd) {
      if (n.run) {
        upd.textContent = 'Sẽ cập nhật ở lần chạy tới';
        upd.classList.add('on');
      }
      upd.onclick = () => setRun(!n.run);
    }
    box.appendChild(el);
  }
  paintNicheMsg();
}

function paintNicheMsg() {
  const list = state.niches || [];
  const on = list.filter((n) => n.run);
  const fresh = on.filter((n) => nicheAge(n).days < 7);
  const msg = $('#niche-msg');
  if (!list.length) return (msg.textContent = '');
  msg.className = 'ex-msg';
  if (!on.length) {
    msg.textContent = 'Chưa tick ngách nào — Radar sẽ chạy trên cả ngành.';
    return;
  }
  const moi = on.filter((n) => !n.lastRun).length;
  const lai = on.length - moi;
  const parts = [];
  if (moi) parts.push(`${moi} ngách mới`);
  if (lai) parts.push(`${lai} ngách chạy lại`);
  msg.textContent = parts.join(', ') + '.';
  if (fresh.length) {
    msg.className = 'ex-msg bad';
    msg.textContent += ` ${fresh.length} cái vừa chạy dưới 7 ngày — bỏ tick nếu chưa cần.`;
  }
}

$('#niche-find').onclick = async () => {
  const btn = $('#niche-find');
  const msg = $('#niche-msg');
  btn.disabled = true;
  msg.className = 'ex-msg';
  msg.textContent = 'Đang chẻ...';
  const r = await window.radar.suggestNiches(
    state.settings,
    (state.niches || []).map((n) => n.name)
  );
  btn.disabled = false;
  if (!r.ok) {
    msg.className = 'ex-msg bad';
    msg.textContent = r.error;
    return;
  }
  const old = state.niches || [];
  const merged = [];
  let dup = 0;
  let fresh = 0;

  for (const n of r.niches) {
    const hit = old.find((o) => sameNiche(o.name, n.name));
    if (hit) {
      dup++;
      // Giu ten cu de khong dut lien ket voi nguon da gan theo ten ngach.
      merged.push({ ...hit, desc: n.desc, products: n.products, verdict: n.verdict, promise: n.promise });
    } else {
      fresh++;
      merged.push({ ...n, run: false, lastRun: null });
    }
  }

  // Ngach cu da chay ma khong xuat hien trong dot chia moi van phai giu:
  // no dang gan voi nguon va co lich su. Xoa am tham la mat het.
  let kept = 0;
  for (const o of old) {
    if (merged.some((m) => sameNiche(m.name, o.name))) continue;
    if (o.lastRun || (state.sources || []).some((x) => x.niche === o.name)) {
      merged.push({ ...o, run: false, orphan: true });
      kept++;
    }
  }

  state.niches = merged;
  await save();
  paintNiches();

  msg.className = 'ex-msg';
  msg.textContent =
    `${fresh} ngách mới` +
    (dup ? `, ${dup} đã có từ trước (giữ nguyên ngày chạy)` : '') +
    (kept ? `, ${kept} ngách cũ được giữ lại` : '') + '.';
};

/* ---- san pham suy tu su kien ---- */
function paintEventIdeas() {
  const list = (state.results && state.results.eventIdeas) || [];
  const box = $('#ev-ideas');
  if (!list.length) return (box.hidden = true);
  box.hidden = false;

  box.innerHTML =
    `<div class="section"><h3>Suy từ sự kiện</h3>` +
    `<p class="hint">Đến từ tin tức, không từ người dùng kể chuyện. Chuỗi suy luận hiện ngay dưới tên — chuỗi mơ hồ thì đề xuất không có gì đỡ.</p></div>` +
    `<ul class="ideas" data-mt="0">${list
      .map(
        (i, n) => `<li>
          <div class="idea-head">
            <span class="idea-name">${esc(i.product)}</span>
            ${i.price ? `<span class="idea-price">$${esc(String(i.price))}</span>` : ''}
          </div>
          <div class="idea-tags">
            ${i.mechanism ? `<span class="tag">${esc(i.mechanism)}</span>` : ''}
            ${i.variants ? `<span class="tag">${esc(i.variants)}</span>` : ''}
          </div>
          <div class="idea-why">${esc(i.chain || '')}</div>
          <div class="idea-risk"><b>Sự kiện:</b> ${esc(i.eventTitle || '')}${
          i.eventDate ? ` — ${esc(i.eventDate)}` : ''
        }</div>
          ${i.moat ? `<div class="idea-risk"><b>Brand thống lĩnh:</b> ${esc(i.moat)}</div>` : ''}
          <div class="idea-risk"><b>Rủi ro:</b> ${esc(i.risk || '')}</div>
          <div class="idea-foot"><button class="add-track" data-ev="${n}">Theo dõi</button></div>
        </li>`
      )
      .join('')}</ul>`;
}

/* ---- su kien tu tim ---- */
function paintAutoEvents() {
  const list = (state.results && state.results.events) || [];
  const box = $('#auto-events');
  if (!list.length) return (box.hidden = true);
  box.hidden = false;

  const inner = $('#auto-list');
  inner.innerHTML = '';
  for (const e of list) {
    const el = document.createElement('div');
    el.className = 'ev';
    const have = state.calendar.some((c) => c.date === e.date && c.title === e.title);
    el.innerHTML =
      `<div class="ev-head">
        <span class="ev-date">${esc(e.date)}</span>
        <span class="ev-title">${esc(e.title)}</span>
        <span class="ev-mech">${esc(e.mechanism)}</span>
        <button class="add-track">${have ? 'Đã có trong lịch' : 'Giữ'}</button>
      </div>
      <div class="ev-cat">${esc(e.category || '')}${
        e.lagWeeks ? ` — cầu thường tăng sau khoảng ${esc(String(e.lagWeeks))} tuần` : ''
      }</div>
      <div class="ev-ev">${esc(e.evidence)}</div>`;
    const b = el.querySelector('button');
    if (have) b.disabled = true;
    b.onclick = () => {
      state.calendar.push({
        date: e.date,
        title: e.title,
        note: [e.category, ...(e.keywords || [])].join(' ')
      });
      b.disabled = true;
      b.textContent = 'Đã thêm vào lịch';
      paintCalendar();
      save();
    };
    inner.appendChild(el);
  }
}

/* ---- theo doi ket qua ---- */
const STATUS = { queued: 'Đang chờ', tested: 'Đã test', dropped: 'Bỏ qua' };
const RESULT = { won: 'Ăn', lost: 'Không ăn', unclear: 'Chưa rõ' };

async function paintTrack() {
  const { items, stats } = await window.radar.trackList();

  $('#track-stats').innerHTML = [
    ['Tổng', stats.total, ''],
    ['Đang chờ', stats.queued, ''],
    ['Đã test', stats.tested, ''],
    ['Ăn', stats.won, ''],
    ['Tỉ lệ đúng', stats.hitRate == null ? '—' : stats.hitRate + '%', 'hit']
  ]
    .map(
      ([label, val, cls]) =>
        `<div class="tstat ${cls}"><b>${val}</b><span>${label}</span></div>`
    )
    .join('');

  const box = $('#track-list');
  if (!items.length) {
    box.innerHTML = `<div class="empty"><p><b>Chưa theo dõi gì.</b></p>
      <p>Ở tab Kết quả, bấm <b>Theo dõi</b> dưới một gợi ý sản phẩm để đưa vào đây.
      Sáu tuần sau quay lại đánh dấu kết quả — đó là cách duy nhất để biết tool có đúng hay không.</p></div>`;
    return;
  }

  box.innerHTML = '';
  for (const t of [...items].reverse()) {
    const el = document.createElement('div');
    el.className = 'titem' + (t.status === 'dropped' ? ' done' : '');
    const d = Math.floor((Date.now() - Date.parse(t.addedAt)) / 86400000);
    const age = d === 0 ? 'hôm nay' : d === 1 ? 'hôm qua' : `${d} ngày trước`;
    el.innerHTML =
      `<div class="thead"><span class="tname">${esc(t.product || '')}</span>` +
      `<span class="tmeta"><span>${esc(t.topic || '')}</span><span>${age}</span>` +
      (t.source ? `<span>${esc(t.source)}</span>` : '') +
      `</span></div>` +
      (t.evidence ? `<blockquote class="tevidence">${esc(t.evidence)}</blockquote>` : '') +
      `<div class="tactions"><span class="taxis">Trạng thái</span>` +
      Object.entries(STATUS)
        .map(
          ([k, v]) =>
            `<button data-st="${k}" class="${t.status === k ? 'on' : ''}">${v}</button>`
        )
        .join('') +
      `<span class="sep"></span><span class="taxis">Kết quả</span>` +
      Object.entries(RESULT)
        .map(
          ([k, v]) =>
            `<button data-res="${k}" class="${t.result === k ? 'on' : ''}">${v}</button>`
        )
        .join('') +
      `<span class="sep"></span><button data-del="1">Xoá</button></div>`;

    el.querySelectorAll('[data-st]').forEach((b) => {
      b.onclick = async () => {
        await window.radar.trackUpdate(t.id, { status: b.dataset.st });
        paintTrack();
      };
    });
    el.querySelectorAll('[data-res]').forEach((b) => {
      b.onclick = async () => {
        // Danh dau ket qua thi coi nhu da test.
        await window.radar.trackUpdate(t.id, { result: b.dataset.res, status: 'tested' });
        paintTrack();
      };
    });
    el.querySelector('[data-del]').onclick = async () => {
      await window.radar.trackRemove(t.id);
      paintTrack();
    };
    box.appendChild(el);
  }
}

/* ---- xuat du lieu ---- */
function exMsg(text, kind) {
  const el = $('#ex-msg');
  el.className = 'ex-msg' + (kind ? ' ' + kind : '');
  el.textContent = text;
}

$('#ex-csv').onclick = async () => {
  const btn = $('#ex-csv');
  btn.disabled = true;
  const r = await window.radar.exportCsv(state.results);
  btn.disabled = false;
  if (r.canceled) return exMsg('');
  if (!r.ok) return exMsg(r.error, 'bad');
  exMsg('Đã lưu. Mở File > Import trong Google Sheet để nhập.', 'ok');
  window.radar.reveal(r.path);
};

$('#ex-sheet').onclick = async () => {
  const s = state.settings;
  // Ban team: Sheet va khoa nam trong ban phat hanh, khong o settings.
  if (!TEAM) {
    if (!s.webAppUrl) return exMsg('Chưa có địa chỉ Web App. Vào Cài đặt để nhập.', 'bad');
    if (!s.webAppToken) return exMsg('Chưa có token. Vào Cài đặt để nhập.', 'bad');
    if (!s.sheetUrl) return exMsg('Chưa có link Google Sheet. Vào Cài đặt để dán.', 'bad');
  }

  const btn = $('#ex-sheet');
  btn.disabled = true;
  exMsg('Đang ghi...');
  const r = await window.radar.exportSheet(s, state.results);
  btn.disabled = false;
  if (!r.ok) return exMsg(r.error, 'bad');
  exMsg(`Đã ghi ${r.rows} dòng vào tab "${r.tab}".`, 'ok');
};

/* ---- bang tien trinh ---- */
let STAGES = [];
let runStart = 0;
let timer = null;
let stageIdx = -1;

function paintSteps(cur, detail, done, total) {
  const box = $('#rp-steps');
  box.innerHTML = STAGES.map(([id, label], i) => {
    const cls = i < cur ? 'done' : i === cur ? 'now' : '';
    const isNow = i === cur;
    const d = isNow && detail ? `<span class="rp-detail">${esc(detail)}</span>` : '';
    const c =
      isNow && total
        ? `<span class="rp-count">${done ?? 0}/${total}</span>`
        : '';
    return `<li class="${cls}"><span class="dot"></span><span>${esc(label)} ${d}</span>${c}</li>`;
  }).join('');
}

function tick() {
  const s = Math.floor((Date.now() - runStart) / 1000);
  $('#rp-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function startPanel() {
  runStart = Date.now();
  stageIdx = -1;
  $('#run-panel').hidden = false;
  $('#rp-title').textContent = 'Đang chạy';
  $('#log').hidden = true;
  $('#rp-toggle').textContent = 'Xem chi tiết';
  paintSteps(-1);
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

function stopPanel(msg, failed) {
  clearInterval(timer);
  timer = null;
  $('#rp-title').textContent = msg;
  // Hong thi giu nguyen buoc dang do, khong danh dau xong het.
  if (!failed) paintSteps(STAGES.length);
  $('#rp-steps').classList.toggle('failed', !!failed);
}

window.radar.onStage((p) => {
  if (p.id === 'done') return stopPanel('Xong');
  if (p.id === 'error') return stopPanel('Dừng lại', true);
  const i = STAGES.findIndex(([id]) => id === p.id);
  if (i < 0) return;
  stageIdx = i;
  paintSteps(i, p.detail, p.done, p.total);
});

$('#rp-toggle').onclick = () => {
  const log = $('#log');
  log.hidden = !log.hidden;
  $('#rp-toggle').textContent = log.hidden ? 'Xem chi tiết' : 'Ẩn chi tiết';
};

/* ---- chay ---- */
$('#stop').onclick = async () => {
  $('#stop').disabled = true;
  $('#stop').textContent = 'Đang dừng...';
  await window.radar.stop();
};

// Thieu nganh hay thieu khoa thi chay xong moi bao loi — sau khi da cho.
function preflight() {
  const s = state.settings;
  if (!s.apiKey) return { tab: 'settings', msg: 'Chưa có API key. Vào Cài đặt để nhập.' };
  if (!s.industry) {
    return { tab: 'settings', msg: 'Chưa điền Ngành. Đây là đầu vào quyết định chất lượng mọi bước sau.' };
  }
  if (s.provider !== 'gemini' && !s.model) return { tab: 'settings', msg: 'Chưa chọn model.' };
  const on = (state.niches || []).filter((n) => n.run);
  const newOnes = on.filter((n) => !n.lastRun).length;
  if (newOnes >= 4) {
    return {
      warn: true,
      msg: `${newOnes} ngách chưa chạy bao giờ — mỗi ngách là một vòng tìm nguồn riêng, lần này sẽ rất lâu. Bấm Chạy lần nữa nếu vẫn muốn.`
    };
  }
  return null;
}

let warned = false;

$('#run').onclick = async () => {
  readSettings();

  const pf = preflight();
  if (pf && !(pf.warn && warned)) {
    warned = !!pf.warn;
    $('#results').innerHTML = `<div class="empty"><b>${
      pf.warn ? 'Khoan đã' : 'Còn thiếu'
    }</b><p>${esc(pf.msg)}</p></div>`;
    if (pf.tab) {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('is-on'));
      document.querySelectorAll('.view').forEach((x) => x.classList.remove('is-on'));
      document.querySelector('[data-view="' + pf.tab + '"]').classList.add('is-on');
      $('#view-' + pf.tab).classList.add('is-on');
    }
    return;
  }
  warned = false;
  await save();
  const btn = $('#run');
  const log = $('#log');
  btn.disabled = true;
  btn.textContent = 'Đang chạy';
  $('#stop').hidden = false;
  $('#stop').disabled = false;
  $('#stop').textContent = 'Dừng';
  logLines = [];
  lastWasTransient = false;
  log.textContent = '';
  $('#results').innerHTML = '';
  $('#export').hidden = true;
  startPanel();

  const res = await window.radar.run(state);

  btn.disabled = false;
  btn.textContent = 'Chạy';
  $('#stop').hidden = true;

  stopPanel(res.ok ? 'Xong' : res.stopped ? 'Đã dừng' : 'Không chạy được', !res.ok);
  if (!res.ok) {
    $('#results').innerHTML = res.stopped
      ? `<div class="empty"><b>Đã dừng</b>
         <p>Nguồn và bài đã lấy được lưu lại rồi. Bấm Chạy lần nữa thì nó đi thẳng vào phần phân tích, không phải lấy lại từ đầu.</p></div>`
      : `<div class="empty"><b class="err">Không chạy được</b><p>${esc(res.error)}</p></div>`;
    return;
  }
  if (res.ranNiches && res.ranNiches.length) {
    const now = new Date().toISOString();
    for (const n of state.niches || []) {
      if (res.ranNiches.includes(n.name)) n.lastRun = now;
    }
    paintNiches();
  }
  if (res.discovered) {
    for (const src of res.discovered.added) {
      if (!state.sources.some((x) => x.url === src.url)) state.sources.push(src);
    }
    paintSources();
  }
  state.results = { clusters: res.clusters, meta: res.meta, events: res.events || [] };
  await save();
  paintSpend();
  paintAutoEvents();
  paintEventIdeas();
  paintResults();
};

// Dong dem nguoc thay the tai cho thay vi doi mot dong moi moi giay.
// Va chan so dong lai — DOM phinh khong gioi han la mot cach lam treo.
function pushLog(msg, replace) {
  // Chi de dong dem nguoc de len chinh dong dem nguoc truoc do.
  // Nhan dien theo dau cach dau dong se de mat ca dong ket qua that.
  if (replace && lastWasTransient && logLines.length) {
    logLines[logLines.length - 1] = msg;
  } else {
    logLines.push(msg);
  }
  lastWasTransient = !!replace;
  if (logLines.length > 400) logLines = logLines.slice(-400);
  const log = $('#log');
  log.textContent = logLines.join('\n');
  log.scrollTop = log.scrollHeight;
}

window.radar.onLog(pushLog);

/* ---- khoi dong ---- */
(async () => {
  state = await window.radar.loadState();
  TEAM = await window.radar.team();
  STAGES = await window.radar.stages();
  if (TEAM) {
    const b = $('#team-badge');
    b.hidden = false;
    b.textContent = TEAM.id;
    document.title = 'Radar — ' + TEAM.name;
    // Sheet da gan san trong ban phat hanh: an han phan cau hinh,
    // vi de lo ra thi leader tro ket qua di cho khac va admin mat dau.
    $('#sheet-block').hidden = true;
    $('#sheet-locked').hidden = false;
  }
  // macOS an thanh tieu de nen phai chua cho ba nut den giao thong.
  // Windows co thanh he thong rieng, khong can.
  const isMac = navigator.platform.startsWith('Mac');
  if (isMac) document.documentElement.style.setProperty('--brandpad', '62px');
  else document.documentElement.classList.add('win');
  paintSettings();
  paintSources();
  paintCalendar();
  paintAutoEvents();
  paintNiches();
  paintResults();
  paintEventIdeas();
  paintTrack();
  paintSpend();
  $('#datadir').textContent = 'Dữ liệu lưu tại: ' + (await window.radar.dataDir());

  // Kiem tra ban moi mot lan luc mo app, khong lam phien them.
  const up = await window.radar.checkUpdate(state.settings.repo);
  if (up) {
    const bar = $('#upd');
    bar.hidden = false;
    bar.innerHTML =
      `<span><b>Có bản mới ${esc(up.version)}</b> — bạn đang dùng ${esc(up.current)}.</span>` +
      `<a href="#" data-open="${esc(up.url)}">Tải về</a>` +
      `<button class="close" aria-label="Đóng">×</button>`;
    bar.querySelector('.close').onclick = () => (bar.hidden = true);
  }
})();
