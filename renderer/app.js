let state = null;

const $ = (s) => document.querySelector(s);
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
  state.settings.industry = $('#s-industry').value.trim();
  state.settings.markets = $('#s-markets').value.trim();
  state.settings.windowDays = Math.max(1, parseInt($('#s-window').value, 10) || 14);
  state.settings.politeDelayMs = Math.max(0, parseInt($('#s-delay').value, 10) || 0);
  state.settings.autoDiscover = $('#s-auto').value === '1';
  state.settings.scoreThreshold = Math.max(0, Math.min(10, parseInt($('#s-thresh').value, 10) || 0));
  state.settings.repo = $('#s-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  state.settings.redditUser = $('#s-reddit').value.trim().replace(/^\/?u\//, '');
  if (!TEAM) {
    state.settings.sheetUrl = $('#s-sheet').value.trim();
    state.settings.sheetTab = $('#s-tab').value.trim() || 'Radar';
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
  $('#s-industry').value = s.industry || '';
  $('#s-markets').value = s.markets || '';
  $('#s-window').value = s.windowDays;
  $('#s-delay').value = s.politeDelayMs;
  $('#s-auto').value = s.autoDiscover === false ? '0' : '1';
  $('#s-thresh').value = s.scoreThreshold ?? 6;
  $('#s-repo').value = s.repo || '';
  $('#s-reddit').value = s.redditUser || '';
  $('#s-sheet').value = s.sheetUrl || '';
  $('#s-tab').value = s.sheetTab || 'Radar';
  $('#s-key-info').textContent = s.serviceKeyPath
    ? 'Khoá: ' + s.serviceKeyPath + (s.serviceEmail ? ' — chia sẻ Sheet cho ' + s.serviceEmail : '')
    : 'Chưa chọn khoá.';
}

$('#s-key-pick').onclick = async () => {
  const r = await window.radar.pickKey();
  if (!r) return;
  if (r.error) {
    $('#s-key-info').textContent = r.error;
    return;
  }
  state.settings.serviceKeyPath = r.path;
  state.settings.serviceEmail = r.email;
  paintSettings();
  save();
};

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
      $('#s-model').value = m;
      readSettings();
      save();
      out.className = 'hint';
      out.textContent = 'Đã chọn ' + m;
    };
    out.appendChild(b);
  }
};

['#s-key', '#s-model', '#s-industry', '#s-markets', '#s-window', '#s-delay', '#s-reddit', '#s-repo', '#s-auto', '#s-thresh', '#s-sheet', '#s-tab'].forEach(
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

  const r = await window.radar.suggestSources(state.settings);
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
      `<span class="sug-name">r/${esc(s.name)}</span>` +
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
      state.sources.push({ url: s.url, label: 'r/' + s.name });
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
        state.sources.push({ url: s.url, label: 'r/' + s.name });
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
      dead.map((d) => `r/${esc(d.name)} (${esc(d.reason)})`).join(', ');
    box.appendChild(el);
  }
};

window.radar.onSuggestLog((m) => {
  const msg = $('#src-sug-msg');
  if (!msg.classList.contains('bad')) msg.textContent = m;
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
    ? `<span class="mark unknown"><span class="glyph bar"></span>cùng kỳ: chưa có dữ liệu</span>`
    : `<span class="mark ${c.signalYoY ? 'on' : ''}"><span class="glyph bar"></span>${
        c.signalYoY ? `cao hơn cùng kỳ (${c.lastYearCount} năm ngoái)` : 'không cao hơn cùng kỳ'
      }</span>`;

  const ev = (c.upcomingEvents || []).map((e) => `${e.title} ${e.date}`).join(', ');

  return `<div class="marks">
    <span class="mark ${c.signalHot ? 'on' : ''}"><span class="glyph"></span>${
      c.signalHot ? `đang nóng (${c.itemCount} bài)` : `ít bài (${c.itemCount || 0})`
    }</span>
    <span class="mark ${c.signalUpcoming ? 'on' : ''}"><span class="glyph up"></span>${
      c.signalUpcoming ? `sự kiện sắp tới: ${esc(ev)}` : 'không khớp lịch'
    }</span>
    ${yoy}
  </div>`;
}

function paintResults() {
  const box = $('#results');
  const r = state.results;

  if (!r || !r.clusters || !r.clusters.length) {
    box.innerHTML = `<div class="empty">
      <p><b>Chưa có kết quả.</b></p>
      <p>Thêm vài nguồn ở tab Nguồn, nhập API key ở Cài đặt, rồi bấm Chạy.
      Mỗi lần chạy cũng ghi thêm một tuần vào kho lưu trữ dùng cho tầng so sánh cùng kỳ.</p>
    </div>`;
    $('#meta').textContent = '';
    $('#export').hidden = true;
    return;
  }
  $('#export').hidden = false;
  $('#ex-msg').textContent = '';

  box.innerHTML = r.clusters
    .map((c) => {
      const quotes = (c.quotes || [])
        .slice(0, 2)
        .map(
          (q) => `<blockquote class="quote">${esc(q.text)}
            <cite>${esc(q.source || '')}${
            q.link ? ` · <a href="#" data-open="${esc(q.link)}">nguồn</a>` : ''
          }</cite></blockquote>`
        )
        .join('');

      const ideas = (c.ideas || []).length
        ? `<ul class="ideas">${c.ideas
            .map(
              (i) => `<li>
                <div class="idea-name">${esc(i.product)}</div>
                <div class="idea-why">${esc(i.why)}</div>
                <div class="idea-risk"><b>Rủi ro:</b> ${esc(i.risk)}</div>
              </li>`
            )
            .join('')}</ul>`
        : '';

      return `<article class="cluster">
        <div class="rank s${c.score}">${c.score}</div>
        <div>
          <h3 class="topic">${esc(c.topic)}</h3>
          <p class="problem">${esc(c.problem)}</p>
          ${markRow(c)}
          ${quotes}
          ${ideas}
        </div>
      </article>`;
    })
    .join('');

  const m = r.meta;
  const when = new Date(m.ranAt).toLocaleString('vi-VN');
  const fail = m.failures.length ? ` · <span class="err">${m.failures.length} nguồn lỗi</span>` : '';
  $('#meta').innerHTML =
    `${when} · ${m.itemsFresh} bài trong cửa sổ (trên ${m.itemsTotal}) · ` +
    `kho lưu trữ ${m.archiveWeeks} tuần${fail}`;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (a) {
    e.preventDefault();
    window.radar.open(a.dataset.open);
  }
});

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
    if (!s.sheetUrl) return exMsg('Chưa có đường dẫn Sheet. Vào Cài đặt để nhập.', 'bad');
    if (!s.serviceKeyPath) return exMsg('Chưa chọn khoá service account. Vào Cài đặt.', 'bad');
  }

  const btn = $('#ex-sheet');
  btn.disabled = true;
  exMsg('Đang ghi...');
  const r = await window.radar.exportSheet(s, state.results);
  btn.disabled = false;
  if (!r.ok) return exMsg(r.error, 'bad');
  exMsg(`Đã ghi ${r.rows} dòng vào tab "${r.tab}".`, 'ok');
};

/* ---- chay ---- */
$('#run').onclick = async () => {
  readSettings();
  await save();
  const btn = $('#run');
  const log = $('#log');
  btn.disabled = true;
  btn.textContent = 'Đang chạy';
  log.hidden = false;
  log.textContent = '';
  $('#results').innerHTML = '';
  $('#export').hidden = true;

  const res = await window.radar.run(state);

  btn.disabled = false;
  btn.textContent = 'Chạy';

  if (!res.ok) {
    $('#results').innerHTML = `<div class="empty"><p class="err"><b>Không chạy được.</b></p><p>${esc(
      res.error
    )}</p></div>`;
    return;
  }
  if (res.discovered) {
    for (const src of res.discovered.added) {
      if (!state.sources.some((x) => x.url === src.url)) state.sources.push(src);
    }
    paintSources();
  }
  state.results = { clusters: res.clusters, meta: res.meta };
  await save();
  log.hidden = true;
  paintResults();
};

window.radar.onLog((msg) => {
  const log = $('#log');
  log.textContent += msg + '\n';
  log.scrollTop = log.scrollHeight;
});

/* ---- khoi dong ---- */
(async () => {
  state = await window.radar.loadState();
  TEAM = await window.radar.team();
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
  if (navigator.platform.startsWith('Mac')) {
    document.documentElement.style.setProperty('--brandpad', '62px');
  }
  paintSettings();
  paintSources();
  paintCalendar();
  paintResults();
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
