const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let win;

/* ---------- ho so team ---------- */

// Moi ban phat hanh cho mot team se co thu muc team/ duoc chep vao luc build.
// Khong co thu muc do = ban quan tri: moi truong deu sua duoc.
const TEAM = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'team', 'team.json'), 'utf8'));
    if (!cfg.id || !cfg.sheetId) return null;
    const keyPath = path.join(__dirname, 'team', 'service-account.json');
    return { ...cfg, keyPath: fs.existsSync(keyPath) ? keyPath : null };
  } catch {
    return null;
  }
})();

// Du lieu tach theo team. Dung chung kho luu tru se lo team khac
// dang theo duoi tu khoa gi.
const SUFFIX = TEAM ? '-' + TEAM.id : '';

/* ---------- luu tru ---------- */

function storePath(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(storePath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(storePath(name), JSON.stringify(data, null, 2), 'utf8');
}

const DEFAULT_STATE = {
  settings: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-5',
    windowDays: 14,
    markets: 'US, EU, AU, CA',
    industry: '',
    politeDelayMs: 6000,
    repo: '',
    autoDiscover: true,
    scoreThreshold: 6,
    redditUser: '',
    sheetUrl: '',
    sheetTab: 'Radar',
    serviceKeyPath: ''
  },
  sources: [
    { url: 'https://www.reddit.com/r/BuyItForLife/new.rss', label: 'r/BuyItForLife' },
    { url: 'https://www.reddit.com/r/ProductPorn/new.rss', label: 'r/ProductPorn' },
    { url: 'https://www.reddit.com/r/mildlyinfuriating/new.rss', label: 'r/mildlyinfuriating' }
  ],
  calendar: [],
  results: null,
  lastRun: null
};

/* ---------- doc RSS / Atom ---------- */

function decodeOnce(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}

// Noi dung Atom cua Reddit duoc ma hoa hai lan (&amp;quot; ...), nen phai
// giai ma va boc the hai vong thi phan trich dan moi sach.
function decodeEntities(s) {
  if (!s) return '';
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let i = 0; i < 2; i++) {
    t = decodeOnce(t).replace(/<[^>]+>/g, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function pickLink(block) {
  const atom = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  const rss = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  return rss ? decodeEntities(rss[1]) : '';
}

function parseFeed(xml, sourceLabel) {
  const items = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const dateRaw =
      pick(b, 'pubDate') || pick(b, 'updated') || pick(b, 'published') || pick(b, 'dc:date');
    const ts = dateRaw ? Date.parse(dateRaw) : NaN;
    items.push({
      title: pick(b, 'title'),
      link: pickLink(b),
      body: (pick(b, 'content') || pick(b, 'description') || pick(b, 'summary')).slice(0, 1200),
      date: isNaN(ts) ? null : new Date(ts).toISOString(),
      source: sourceLabel
    });
  }
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reddit yeu cau UA dang <platform>:<app id>:<version> (by /u/<username>)
// va cam gia mao trinh duyet. Ta khai bao dung su that.
function buildUserAgent(settings) {
  const plat =
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const who = (settings.redditUser || '').trim().replace(/^\/?u\//, '');
  const base = `${plat}:com.radar.app:v1.0.0`;
  return who ? `${base} (by /u/${who})` : base;
}

async function fetchOnce(url, ua) {
  const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/xml, text/xml, */*' } });
  if (res.status === 429) {
    const e = new Error('Bi gioi han toc do (429). Tang do gian cach trong Cai dat.');
    e.retryable = true;
    throw e;
  }
  if (res.status === 403) {
    const e = new Error('Bi tu choi (403).');
    e.retryable = true;
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFeed(src, settings) {
  const isReddit = /reddit\.com/i.test(src.url);
  const delayMs = settings.politeDelayMs || 0;
  if (isReddit && delayMs > 0) await sleep(delayMs);

  const ua = buildUserAgent(settings);

  // old.reddit thuong de tinh hon www khi bi chan
  const tries = [src.url];
  if (isReddit && /\/\/(www\.)?reddit\.com/i.test(src.url)) {
    tries.push(src.url.replace(/\/\/(www\.)?reddit\.com/i, '//old.reddit.com'));
  }

  let last;
  for (let i = 0; i < tries.length; i++) {
    try {
      const xml = await fetchOnce(tries[i], ua);
      return parseFeed(xml, src.label || src.url);
    } catch (e) {
      last = e;
      if (!e.retryable) throw e;
      if (i < tries.length - 1) await sleep(3000);
    }
  }

  if (last && last.retryable && isReddit) {
    const hint = settings.redditUser
      ? ' Thu tang do gian cach len 8000ms trong Cai dat.'
      : ' Nhap ten tai khoan Reddit trong Cai dat — Reddit siet manh voi cac User-Agent khong co thong tin lien he.';
    throw new Error(last.message + hint);
  }
  throw last;
}

/* ---------- ho tro thoi gian ---------- */

function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekNumber(key) {
  return parseInt(key.split('-W')[1], 10);
}

/* ---------- goi model ---------- */

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Model tra ve khong phai JSON hop le.');
  }
}

async function callAnthropic(apiKey, model, system, userText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: userText }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Loi API Anthropic');
  return extractJson(
    (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
  );
}

async function callGemini(apiKey, model, system, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      // Gemini ep duoc dinh dang tra ve, chac chan hon so voi nhac trong prompt
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Loi API Gemini');
  const cand = (data.candidates || [])[0];
  if (!cand) throw new Error('Gemini khong tra ve noi dung nao.');
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new Error('Ket qua bi cat vi qua dai. Giam so ngay trong cua so thoi gian.');
  }
  return extractJson((cand.content?.parts || []).map((p) => p.text || '').join('\n'));
}

function callModel(settings, system, userText) {
  const fn = settings.provider === 'gemini' ? callGemini : callAnthropic;
  return fn(settings.apiKey, settings.model, system, userText);
}

async function listModels(settings) {
  if (!settings.apiKey) throw new Error('Chua co API key.');
  if (settings.provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': settings.apiKey }
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => !/embedding|aqa|imagen|veo/i.test(n));
  }
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' }
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return (d.data || []).map((m) => m.id);
}

const SYSTEM_PAIN = `Ban doc cac bai dang tu Reddit, blog va bao de tim VAN DE THUC TE ma nguoi ta dang gap.

Quy tac bat buoc:
- Chi trich van de co bang chung truc tiep trong van ban. Khong suy dien, khong bia.
- Moi cum phai co it nhat mot cau trich NGUYEN VAN tu bai dang, khong dien giai lai.
- KHONG duoc goi y san pham o buoc nay. Chi mo ta van de.
- Gop cac bai noi ve cung mot van de thanh mot cum.
- Bo qua bai chi la tin tuc thuan tuy, quang cao, hoac khong chua nguoi noi ve trai nghiem cua ho.

Tra ve DUY NHAT mot mang JSON, khong loi dan:
[{
  "topic": "ten cum ngan gon",
  "keywords": ["3-6 tu khoa tieng Anh de doi chieu"],
  "problem": "van de la gi, 1-2 cau",
  "intensity": "cao" | "trung binh" | "thap",
  "quotes": [{"text": "cau nguyen van", "source": "ten nguon", "link": "url"}],
  "itemCount": <so bai thuoc cum nay>
}]`;

const SYSTEM_PRODUCT = `Ban nhan mot danh sach van de khach hang da duoc trich xuat, kem diem tin hieu thoi diem.

Nhiem vu: voi moi van de, de xuat NHIEU lua chon san pham co the ban online, khong phai mot.

Quy tac bat buoc:
- Moi de xuat phai gan duoc voi mot cau trich cu the trong du lieu dau vao. Ghi lai cau do vao truong "evidence".
- Neu khong tim duoc bang chung cho mot y tuong, KHONG dua ra y tuong do.
- Chi de xuat hang vat ly, ship duoc, gia thap den trung binh.
- Ghi ro rui ro lam de xuat that bai.

Tra ve DUY NHAT mot mang JSON:
[{
  "topic": "ten cum khop voi dau vao",
  "ideas": [{
    "product": "mo ta san pham",
    "why": "vi sao no giai quyet van de, 1 cau",
    "evidence": "cau trich nguyen van lam can cu",
    "risk": "rui ro chinh"
  }]
}]`;

/* ---------- xuat du lieu ---------- */

const COLUMNS = [
  'Ngay chay',
  'Diem',
  'Chu de',
  'Van de',
  'Dang nong',
  'Su kien sap toi',
  'Cao hon cung ky',
  'So bai',
  'Su kien khop',
  'San pham de xuat',
  'Vi sao',
  'Cau trich lam can cu',
  'Rui ro',
  'Nguon'
];

// Mot dong cho moi y tuong san pham, boi canh chu de lap lai o moi dong.
// Chu de khong co y tuong van duoc mot dong, de khong bien mat khoi bang.
function toRows(results) {
  if (!results || !results.clusters) return [COLUMNS];
  const ran = new Date(results.meta.ranAt).toISOString().slice(0, 10);
  const rows = [COLUMNS];

  for (const c of results.clusters) {
    const yoy = !c.yoyKnown ? 'chua co du lieu' : c.signalYoY ? 'co' : 'khong';
    const ev = (c.upcomingEvents || []).map((e) => `${e.title} (${e.date})`).join('; ');
    const link = (c.quotes || []).map((q) => q.link).filter(Boolean)[0] || '';
    const base = [
      ran,
      c.score,
      c.topic,
      c.problem,
      c.signalHot ? 'co' : 'khong',
      c.signalUpcoming ? 'co' : 'khong',
      yoy,
      c.itemCount || 0,
      ev
    ];
    const ideas = c.ideas && c.ideas.length ? c.ideas : [null];
    for (const i of ideas) {
      rows.push([
        ...base,
        i ? i.product : '',
        i ? i.why : '',
        i ? i.evidence || '' : '',
        i ? i.risk : '',
        link
      ]);
    }
  }
  return rows;
}

function toCsv(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // BOM de Excel doc dung tieng Viet
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/* ---------- Google Sheets qua service account ---------- */

function sheetIdFromUrl(url) {
  const m = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // cho phep dan thang ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(String(url || '').trim())) return url.trim();
  return null;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwt(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })
  );
  const input = `${header}.${claims}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).end().sign(privateKey);
  return `${input}.${b64url(sig)}`;
}

async function getAccessToken(keyPath) {
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error('Khong tim thay file khoa service account. Chon lai trong Cai dat.');
  }
  let key;
  try {
    key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch {
    throw new Error('File khoa khong phai JSON hop le.');
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('File khoa thieu client_email hoac private_key. Can dung loai service account.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signJwt(key.client_email, key.private_key)
    })
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Google tu choi khoa: ' + (data.error_description || data.error || 'khong ro'));
  }
  return { token: data.access_token, email: key.client_email };
}

async function gapi(token, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function ensureTab(token, id, tab) {
  const meta = await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`);
  const has = (meta.sheets || []).some((s) => s.properties.title === tab);
  if (has) return;
  await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] })
  });
}

async function writeSheet(settings, results) {
  // Ban phat hanh cho team: Sheet va khoa deu dong goi san, khong doc tu settings.
  // Do la ranh gioi that: leader khong tro duoc ket qua di cho khac.
  const id = TEAM ? TEAM.sheetId : sheetIdFromUrl(settings.sheetUrl);
  if (!id) throw new Error('Duong dan Google Sheet khong hop le. Dan ca URL cua sheet.');
  const tab = (TEAM ? TEAM.sheetTab : settings.sheetTab || 'Radar').trim();
  const keyPath = TEAM ? TEAM.keyPath : settings.serviceKeyPath;
  if (TEAM && !keyPath) throw new Error('Ban phat hanh nay thieu khoa service account. Bao nguoi phat hanh.');

  const { token, email } = await getAccessToken(keyPath);

  try {
    await ensureTab(token, id, tab);
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      throw new Error(
        `Khong mo duoc sheet. Chia se sheet cho ${email} voi quyen Editor, roi thu lai.`
      );
    }
    throw e;
  }

  const rows = toRows(results);
  const range = encodeURIComponent(`${tab}!A1:Z100000`);

  // ghi de: xoa sach vung cu truoc khi ghi
  await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}:clear`, {
    method: 'POST',
    body: '{}'
  });
  await gapi(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) }
  );

  return { rows: rows.length - 1, tab, email };
}

/* ---------- goi y nguon ---------- */

const SYSTEM_SOURCES = `Ban de xuat subreddit de theo doi van de khach hang trong mot nganh cu the.

Nguyen tac:
- Uu tien noi NGUOI TA THAN PHIEN ve san pham, khong phai noi khoe anh dep hay ban tin.
- Tron bon loai: (a) sub dung nganh, (b) sub xin tu van mua hang trong nganh,
  (c) sub than phien chung noi san pham nganh do hay bi nhac, (d) sub sua chua / do ben.
- Chi tra ten sub, khong kem "r/" va khong kem URL.
- De xuat 16 cai. Uoc doan cung duoc, he thong se tu kiem chung va loai cai khong ton tai.

Tra ve DUY NHAT mang JSON:
[{"name":"tensub","why":"mot cau ngan vi sao dang theo doi"}]`;

const SYSTEM_SCORE = `Ban duoc cho tieu de bai THAT lay tu vai subreddit. Cham diem tung sub.

Cau hoi duy nhat: o day nguoi ta co MO TA VAN DE CU THE voi do ho da mua hay dang dung khong?

Thang diem 0-10:
- 8-10: phan lon la nguoi ke chuyen do hong, khong vua, mua nham, dung mot thoi gian roi that vong
- 5-7: co lan lon, mot phan la than phien that
- 2-4: chu yeu khoe anh, hoi dap chung chung, tin tuc
- 0-1: quang cao, ban hang, khong lien quan

Cham theo tieu de THAT duoc cung cap, khong cham theo ten sub va khong doan.

Tra ve DUY NHAT mang JSON:
[{"name":"tensub","score":<0-10>,"verdict":"mot cau ngan bang tieng Viet","evidence":"mot tieu de that the hien ro nhat"}]`;

// LLM co the bia ten sub. Cach duy nhat de biet that hay khong
// la goi dung feed do va xem co bai nao khong.
async function verifySource(name, settings) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(name)}/new.rss`;
  try {
    const items = await fetchFeed({ url, label: 'r/' + name }, settings);
    const cutoff = Date.now() - 90 * 86400000;
    const recent = items.filter((i) => i.date && Date.parse(i.date) >= cutoff);
    if (recent.length < 3) return { name, url, ok: false, reason: 'quá ít bài gần đây' };
    return {
      name,
      url,
      ok: true,
      count: recent.length,
      titles: recent.slice(0, 15).map((i) => i.title),
      samples: recent.slice(0, 3).map((i) => i.title)
    };
  } catch (e) {
    return { name, url, ok: false, reason: e.message.includes('404') ? 'không tồn tại' : e.message };
  }
}

async function suggestSources(settings, report) {
  if (!settings.apiKey) throw new Error('Chua co API key. Vao Cai dat de nhap.');
  if (!settings.industry) throw new Error('Chua dien nganh trong Cai dat. Do la dau vao duy nhat cua buoc nay.');

  report('Đang nghĩ ứng viên...');
  const cands = await callModel(
    settings,
    SYSTEM_SOURCES,
    `Nganh: ${settings.industry}\nThi truong: ${settings.markets || 'US, EU, AU, CA'}`
  );

  const list = (Array.isArray(cands) ? cands : []).slice(0, 16);
  report(`${list.length} ứng viên. Đang kiểm chứng với Reddit...`);

  const out = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const v = await verifySource(String(c.name || '').replace(/^\/?r\//, ''), settings);
    v.why = c.why || '';
    out.push(v);
    report(`  ${i + 1}/${list.length} r/${v.name}: ${v.ok ? v.count + ' bài' : 'loại — ' + v.reason}`);
  }

  // Cham diem tren tieu de THAT, khong phai tren ten sub.
  // Day la khac biet: doan ten thi bia, doc noi dung that thi danh gia duoc.
  const live = out.filter((x) => x.ok);
  if (live.length) {
    report('Đang đọc nội dung thật để chấm mật độ than phiền...');
    try {
      const corpus = live
        .map((s) => `## ${s.name}\n` + s.titles.map((t) => '- ' + t).join('\n'))
        .join('\n\n');
      const scores = await callModel(
        settings,
        SYSTEM_SCORE,
        `Nganh: ${settings.industry}\n\n${corpus}`
      );
      const byName = new Map(
        (Array.isArray(scores) ? scores : []).map((s) => [String(s.name).toLowerCase(), s])
      );
      for (const s of live) {
        const m = byName.get(s.name.toLowerCase());
        if (m) {
          s.score = Math.max(0, Math.min(10, Number(m.score) || 0));
          s.verdict = m.verdict || '';
          s.evidence = m.evidence || '';
        }
      }
    } catch (e) {
      report('Không chấm điểm được: ' + e.message + '. Vẫn trả về danh sách để bạn tự chọn.');
    }
  }

  out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return out;
}

async function runPipeline(state, report) {
  const { settings, calendar } = state;
  let sources = state.sources;
  if (!settings.apiKey) throw new Error('Chua co API key. Vao Cai dat de nhap.');

  // Chua co nguon: tu di tim va tu them nhung cai vuot nguong.
  // Nhap tay chi con la loi thoat, khong phai buoc bat buoc.
  let discovered = null;
  if (!sources.length) {
    if (!settings.autoDiscover) throw new Error('Chua co nguon nao. Vao Nguon de them hoac bat tu tim nguon.');
    report('Chưa có nguồn nào. Đang tự đi tìm...');
    const found = await suggestSources(settings, report);
    const th = settings.scoreThreshold ?? 6;
    const picked = found.filter((f) => f.ok && (f.score ?? 0) >= th);
    if (!picked.length) {
      throw new Error('Tim duoc nguon nhung khong cai nao dat nguong. Vao Nguon de xem va tu chon.');
    }
    sources = picked.map((f) => ({ url: f.url, label: 'r/' + f.name }));
    discovered = { added: sources, all: found };
    report(`Đã tự thêm ${sources.length} nguồn đạt điểm từ ${th} trở lên.`);
  }

  /* 1. thu thap */
  report('Dang doc ' + sources.length + ' nguon...');
  const all = [];
  const failures = [];
  for (const src of sources) {
    try {
      const items = await fetchFeed(src, settings);
      all.push(...items);
      report(`${src.label || src.url}: ${items.length} bai`);
    } catch (e) {
      failures.push(`${src.label || src.url}: ${e.message}`);
      report(`${src.label || src.url}: LOI - ${e.message}`);
    }
  }

  /* 2a. loc dang nong */
  const cutoff = Date.now() - settings.windowDays * 86400000;
  const fresh = all.filter((i) => i.date && Date.parse(i.date) >= cutoff);
  report(`${all.length} bai tong, ${fresh.length} bai trong ${settings.windowDays} ngay.`);
  if (!fresh.length) {
    throw new Error('Khong co bai nao trong cua so thoi gian. Thu tang so ngay trong Cai dat.');
  }

  /* 3. trich pain point */
  report('Dang trich van de bang Claude...');
  const corpus = fresh
    .slice(0, 220)
    .map((i, n) => `[${n}] (${i.source}) ${i.title}\n${i.body}\nURL: ${i.link}`)
    .join('\n\n');

  const context = [
    settings.industry ? `Nganh cua nguoi dung: ${settings.industry}` : '',
    `Thi truong: ${settings.markets}`,
    '',
    corpus
  ].join('\n');

  const clusters = await callModel(settings, SYSTEM_PAIN, context);
  report(`Tim duoc ${clusters.length} cum van de.`);

  /* 2b + 2c. cham diem tat dinh, khong dung LLM */
  const archive = readJson(`archive${SUFFIX}.json`, {});
  const nowWeek = isoWeekKey(new Date());
  const thisWeekNo = weekNumber(nowWeek);
  const thisYear = parseInt(nowWeek.split('-W')[0], 10);

  const horizon = Date.now() + 70 * 86400000;
  for (const c of clusters) {
    const kws = (c.keywords || []).map((k) => String(k).toLowerCase());

    // tang "dang nong": so bai trong cum
    c.signalHot = (c.itemCount || 0) >= 3;

    // tang "sap toi": doi chieu voi lich su kien, tat dinh
    const hits = (calendar || []).filter((ev) => {
      const t = Date.parse(ev.date);
      if (isNaN(t) || t < Date.now() || t > horizon) return false;
      const hay = `${ev.title} ${ev.note || ''}`.toLowerCase();
      return kws.some((k) => k && hay.includes(k));
    });
    c.signalUpcoming = hits.length > 0;
    c.upcomingEvents = hits;

    // tang "cung ky": so voi kho luu tru cua chinh app
    let lastYear = null;
    for (let off = -4; off <= 4; off++) {
      const key = `${thisYear - 1}-W${String(thisWeekNo + off).padStart(2, '0')}`;
      const snap = archive[key];
      if (!snap) continue;
      for (const k of kws) {
        if (snap[k] != null) lastYear = (lastYear || 0) + snap[k];
      }
    }
    c.lastYearCount = lastYear;
    c.signalYoY = lastYear != null && (c.itemCount || 0) > lastYear * 1.3;
    c.yoyKnown = lastYear != null;

    c.score = [c.signalHot, c.signalUpcoming, c.signalYoY].filter(Boolean).length;
  }

  clusters.sort((a, b) => b.score - a.score || (b.itemCount || 0) - (a.itemCount || 0));

  /* 4. goi y san pham */
  report('Dang goi y san pham...');
  const brief = clusters
    .map(
      (c) =>
        `## ${c.topic}\nVan de: ${c.problem}\nTrich dan: ${(c.quotes || [])
          .map((q) => `"${q.text}"`)
          .join(' | ')}`
    )
    .join('\n\n');

  let suggestions = [];
  try {
    suggestions = await callModel(
      settings,
      SYSTEM_PRODUCT,
      `Thi truong: ${settings.markets}\n${settings.industry ? 'Nganh: ' + settings.industry : ''}\n\n${brief}`
    );
  } catch (e) {
    report('Buoc goi y san pham loi: ' + e.message);
  }
  const byTopic = new Map(suggestions.map((s) => [s.topic, s.ideas || []]));
  for (const c of clusters) c.ideas = byTopic.get(c.topic) || [];

  /* luu kho luu tru cho lan sau */
  const snap = archive[nowWeek] || {};
  for (const c of clusters) {
    for (const k of c.keywords || []) {
      const key = String(k).toLowerCase();
      snap[key] = (snap[key] || 0) + (c.itemCount || 0);
    }
  }
  archive[nowWeek] = snap;
  writeJson(`archive${SUFFIX}.json`, archive);

  const archiveWeeks = Object.keys(archive).length;
  report('Xong.');

  return {
    discovered,
    clusters,
    meta: {
      ranAt: new Date().toISOString(),
      itemsTotal: all.length,
      itemsFresh: fresh.length,
      failures,
      archiveWeeks,
      yoyReady: clusters.some((c) => c.yoyKnown)
    }
  };
}

/* ---------- kiem tra ban moi ---------- */

// app.getVersion() tra ve phien ban Electron neu khong xac dinh duoc app path.
// Doc thang tu package.json (nam trong app.asar khi da dong goi) thi chac chan hon.
const APP_VERSION = (() => {
  try {
    return require('./package.json').version;
  } catch {
    return app.getVersion();
  }
})();

// So sanh semver: true neu b moi hon a.
function isNewer(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (b1 !== a1) return b1 > a1;
  if (b2 !== a2) return b2 > a2;
  return b3 > a3;
}

// macOS chua ky so thi khong the tu thay the binary cua chinh no,
// nen ta chi kiem tra va bao co ban moi, khong tai ngam.
async function checkUpdate(repo) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Radar' }
  });
  if (!res.ok) return null;
  const rel = await res.json();
  if (!rel.tag_name) return null;
  const current = APP_VERSION;
  if (!isNewer(current, rel.tag_name)) return null;
  return { version: String(rel.tag_name).replace(/^v/, ''), current, url: rel.html_url };
}

/* ---------- IPC ---------- */

// Ban dau tien phat hanh voi chuoi model da cu, se lam API tra ve 404.
// Chi thay dung gia tri do; moi lua chon khac la cua nguoi dung, khong dung toi.
const SHIPPED_STALE_MODEL = 'claude-sonnet-4-6';

ipcMain.handle('state:load', () => {
  const s = readJson(`state${SUFFIX}.json`, null);
  if (!s) return DEFAULT_STATE;
  const merged = {
    ...DEFAULT_STATE,
    ...s,
    settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) }
  };
  if (merged.settings.model === SHIPPED_STALE_MODEL) {
    merged.settings.model = DEFAULT_STATE.settings.model;
  }
  return merged;
});

ipcMain.handle('state:save', (_e, state) => {
  writeJson(`state${SUFFIX}.json`, state);
  return true;
});

ipcMain.handle('run', async (_e, state) => {
  const report = (msg) => win && win.webContents.send('run:log', msg);
  try {
    const out = await runPipeline(state, report);
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open', (_e, url) => shell.openExternal(url));
ipcMain.handle('datadir', () => app.getPath('userData'));

ipcMain.handle('export:csv', async (_e, results) => {
  if (!results || !results.clusters || !results.clusters.length) {
    return { ok: false, error: 'Chua co ket qua de xuat.' };
  }
  const stamp = new Date(results.meta.ranAt).toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Xuat ket qua',
    defaultPath: path.join(app.getPath('downloads'), `radar-${stamp}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, toCsv(toRows(results)), 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

ipcMain.handle('suggest:sources', async (_e, settings) => {
  const report = (m) => win && win.webContents.send('suggest:log', m);
  try {
    return { ok: true, results: await suggestSources(settings, report) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('update:check', async (_e, repo) => {
  try {
    return await checkUpdate(repo);
  } catch {
    return null;
  }
});

ipcMain.handle('version', () => APP_VERSION);

ipcMain.handle('team', () => (TEAM ? { id: TEAM.id, name: TEAM.name, locked: true } : null));

ipcMain.handle('models', async (_e, settings) => {
  try {
    return { ok: true, models: await listModels(settings) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('pick:key', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Chon file khoa service account',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return null;
  try {
    const k = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!k.client_email || !k.private_key) {
      return { error: 'File nay khong phai khoa service account.' };
    }
    return { path: filePaths[0], email: k.client_email };
  } catch {
    return { error: 'Khong doc duoc file JSON.' };
  }
});

ipcMain.handle('export:sheet', async (_e, settings, results) => {
  if (!results || !results.clusters || !results.clusters.length) {
    return { ok: false, error: 'Chua co ket qua de ghi.' };
  }
  try {
    const out = await writeSheet(settings, results);
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* ---------- cua so ---------- */

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    backgroundColor: '#E9EAE4',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
