const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

const APP_VERSION = (() => {
  try {
    return require('./package.json').version;
  } catch {
    return app.getVersion();
  }
})();

/* ---------- ho so team ---------- */

// Moi ban phat hanh cho mot team se co thu muc team/ duoc chep vao luc build.
// Khong co thu muc do = ban quan tri: moi truong deu sua duoc.
const TEAM = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'team', 'team.json'), 'utf8'));
    if (!cfg.id) return null;
    let secret = {};
    try {
      secret = JSON.parse(fs.readFileSync(path.join(__dirname, 'team', 'secret.json'), 'utf8'));
    } catch {}
    return { ...cfg, webAppUrl: secret.webAppUrl || '', token: secret.token || '' };
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

// Cache co the len vai MB. Ghi dong bo thi chan tien trinh chinh, va
// tien trinh chinh bi chan la ca cua so dung ve lai.
async function writeJsonAsync(name, data) {
  await fs.promises.mkdir(app.getPath('userData'), { recursive: true });
  await fs.promises.writeFile(storePath(name), JSON.stringify(data), 'utf8');
}

const DEFAULT_STATE = {
  settings: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-5',
    modelReason: '',
    modelPerMinute: 8,
    windowDays: 14,
    markets: 'US, EU, AU, CA',
    industry: '',
    politeDelayMs: 6000,
    priceMin: 40,
    priceMax: 200,
    repo: '',
    autoDiscover: true,
    scoreThreshold: 6,
    redditUser: '',
    webAppUrl: '',
    webAppToken: '',
    sheetUrl: ''
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

// fetch cua Node khong co thoi gian cho mac dinh. Mot may chu khong phan hoi
// se treo mai mai, va khoi try/catch bao quanh khong bao gio chay vi loi goi
// khong bao gio tra ve. Day la ly do mot trang chet lam dung ca lan chay.
// "fetch failed" cua Node la loi mang cap thap: DNS truc trac, mat ket noi
// choc lat, VPN dut. Day la loai loi thoang qua nhat, phai thu lai chu khong
// duoc dung ca lan chay.
const NET_CODES = {
  ENOTFOUND: 'không phân giải được tên miền',
  EAI_AGAIN: 'DNS tạm thời không trả lời',
  ECONNRESET: 'kết nối bị ngắt giữa chừng',
  ECONNREFUSED: 'máy chủ từ chối kết nối',
  ETIMEDOUT: 'kết nối quá hạn',
  EHOSTUNREACH: 'không tới được máy chủ',
  ENETUNREACH: 'không có đường ra mạng',
  EPIPE: 'đường truyền đứt',
  UND_ERR_SOCKET: 'socket đóng đột ngột',
  UND_ERR_CONNECT_TIMEOUT: 'quá hạn khi mở kết nối'
};

function netReason(e) {
  let c = e;
  for (let i = 0; i < 4 && c; i++) {
    const code = c.code || (c.cause && c.cause.code);
    if (code && NET_CODES[code]) return { code, why: NET_CODES[code] };
    c = c.cause;
  }
  return null;
}

function hostOfUrl(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return String(u).slice(0, 60);
  }
}

async function fetchT(url, opts = {}, ms = 20000) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      const t = new Error(`${hostOfUrl(url)} không phản hồi sau ${Math.round(ms / 1000)}s.`);
      t.timeout = true;
      t.host = hostOfUrl(url);
      throw t;
    }
    const n = netReason(e);
    if (n || /fetch failed/i.test(e.message || '')) {
      const t = new Error(
        n
          ? `Lỗi mạng với ${hostOfUrl(url)}: ${n.why} (${n.code}).`
          : `Lỗi mạng với ${hostOfUrl(url)}: không gửi được yêu cầu.`
      );
      t.network = true;
      t.host = hostOfUrl(url);
      // Ten mien khong ton tai thi thu lai bao nhieu lan cung the.
      t.fatalNet = !!(n && n.code === 'ENOTFOUND');
      throw t;
    }
    throw e;
  }
}

// Nhip deu tam tap la dau hieu bot ro hon ca fingerprint.
// Ngau nhien hoa +/-40% quanh gia tri dat.
const jitter = (ms) => Math.round(ms * (0.6 + Math.random() * 0.8));

// Reddit yeu cau UA dang <platform>:<app id>:<version> (by /u/<username>)
// va cam gia mao trinh duyet. Ta khai bao dung su that.
// Reddit bat buoc dinh dang rieng. Nhung gui dinh dang do toi moi trang web
// thi tuong lua chan thang, vi no khong giong bat ky client nao chung biet.
function buildUserAgent(settings, forReddit) {
  if (forReddit) {
    const plat =
      process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    const who = (settings.redditUser || '').trim().replace(/^\/?u\//, '');
    const base = `${plat}:com.radar.app:v${APP_VERSION}`;
    return who ? `${base} (by /u/${who})` : base;
  }
  // Quy uoc chuan cho bot doc feed: khai bao that, co duong dan lien he.
  const repo = (settings.repo || '').trim();
  const contact = repo ? `+https://github.com/${repo}` : '+https://github.com/radar-app';
  return `Mozilla/5.0 (compatible; Radar/${APP_VERSION}; ${contact}) RSS reader`;
}

// Bo dem toan cuc trong mot lan chay. Bi siet lien tiep thi tu cham lai
// cho phan con lai, thay vi cu dam vao tuong.
const throttleState = { hits: 0, extra: 0 };

// Nguoi dung bam Dung. Kiem tra giua cac buoc, khong cat ngang giua chung.
const runState = { stop: false, stage: null, busy: false };

// Cac buoc cua mot lan chay. Giao dien ve theo danh sach nay.
const STAGES = [
  ['niche', 'Chẻ ngách'],
  ['sources', 'Tìm và chấm nguồn'],
  ['collect', 'Đọc nguồn'],
  ['extract', 'Trích vấn đề'],
  ['events', 'Tìm sự kiện'],
  ['ideas', 'Gợi ý sản phẩm']
];
function checkStop() {
  if (runState.stop) {
    const e = new Error('Đã dừng theo yêu cầu.');
    e.stopped = true;
    throw e;
  }
}

async function fetchOnce(url, ua, cached) {
  const headers = { 'User-Agent': ua, Accept: 'application/xml, text/xml, */*' };
  // Khong tai lai trang chua doi. Voi 4 team chung IP thi day la
  // cach cat luu luong thua re nhat.
  if (cached && cached.etag) headers['If-None-Match'] = cached.etag;
  if (cached && cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  const res = await fetchT(url, { headers }, 20000);

  if (res.status === 304) return { notModified: true };

  if (res.status === 429 || res.status === 403) {
    const e = new Error(res.status === 429 ? 'Bi gioi han toc do (429).' : 'Bi tu choi (403).');
    e.retryable = true;
    // May chu bao doi bao lau thi doi dung bay nhieu.
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    if (!isNaN(ra)) e.retryAfterMs = Math.min(ra * 1000, 120000);
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.text();
  // 200 nhung khong phai feed = bi chan, khong phai nguon vang.
  // Reddit tra trang gioi han toc do bang HTML kem ma 200, khong phai 429,
  // nen phai nhan dien theo noi dung.
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(body)) {
    const isHtml = /<html/i.test(body);
    const fromReddit = /reddit\.com/i.test(url);
    // Reddit tra trang HTML kem ma 200 khi siet toc do. Noi dung trang doi
    // theo thoi gian, nen dung nguon lam can cu chu khong doi khop chu.
    const throttled = fromReddit && isHtml;
    const e = new Error(
      throttled
        ? 'Reddit siết tốc độ (trả trang HTML kèm mã 200).'
        : isHtml
          ? 'Máy chủ trả trang HTML thay vì feed.'
          : 'Phản hồi không phải RSS hay Atom.'
    );
    e.retryable = isHtml;
    if (throttled) {
      e.retryAfterMs = 20000;
      throttleState.hits++;
      // Ba lan lien tiep la dau hieu phai cham lai han, khong phai xui.
      if (throttleState.hits >= 3) throttleState.extra = Math.min(throttleState.extra + 3000, 12000);
    }
    throw e;
  }

  return {
    xml: body,
    etag: res.headers.get('etag') || null,
    lastModified: res.headers.get('last-modified') || null
  };
}

// Cho im lang la thu lam nguoi dung tuong app chet. Dem nguoc ra man hinh.
async function waitVisible(ms, why, report) {
  if (!report || ms < 4000) return sleep(ms);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const left = Math.ceil((end - Date.now()) / 1000);
    report(`  ${why} — còn ${left}s`, true);
    await sleep(Math.min(1000, end - Date.now()));
  }
}

async function fetchFeed(src, settings, cache, fast, report) {
  const isReddit = /reddit\.com/i.test(src.url);
  const base = (settings.politeDelayMs || 0) + (isReddit ? throttleState.extra : 0);
  if (isReddit && base > 0) await waitVisible(jitter(base), 'giãn cách Reddit', report);

  const ua = buildUserAgent(settings, isReddit);
  const key = src.url;
  const cached = (cache && cache[key]) || null;

  // Buoc kiem chung vua tai feed nay trong chinh lan chay nay.
  // Goi lai la lang phi, va voi Reddit thi do la ly do bi siet toc do.
  if (cached && cached.justFetched) {
    return { items: cached.items || [], fromCache: true };
  }

  const tries = [src.url];
  if (isReddit && /\/\/(www\.)?reddit\.com/i.test(src.url)) {
    tries.push(src.url.replace(/\/\/(www\.)?reddit\.com/i, '//old.reddit.com'));
  }

  let last;
  for (let i = 0; i < tries.length; i++) {
    const maxAttempt = fast ? 1 : 3;
    for (let attempt = 0; attempt < maxAttempt; attempt++) {
      try {
        const r = await fetchOnce(tries[i], ua, i === 0 ? cached : null);
        if (r.notModified) {
          return { items: cached.items || [], fromCache: true };
        }
        const items = parseFeed(r.xml, src.label || src.url);
        if (isReddit) throttleState.hits = 0;
        if (cache) cache[key] = { etag: r.etag, lastModified: r.lastModified, items };
        return { items, fromCache: false };
      } catch (e) {
        last = e;
        if (!e.retryable && !(e.network && !e.fatalNet)) throw e;
        // Backoff luy thua, ton trong Retry-After neu may chu co gui.
        if (attempt < maxAttempt - 1) {
          await waitVisible(e.retryAfterMs || jitter(base > 0 ? base * 2 : 5000), 'bị chặn, chờ', report);
        }
      }
    }
    if (i < tries.length - 1) await waitVisible(jitter(3000), 'thử địa chỉ khác', report);
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

async function callAnthropic(apiKey, model, system, userText, usage) {
  const res = await fetchT(
    'https://api.anthropic.com/v1/messages',
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: userText }]
      })
    },
    180000
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  if (usage && data.usage) {
    usage.inputTokens += data.usage.input_tokens || 0;
    usage.outputTokens += data.usage.output_tokens || 0;
    usage.calls++;
  }
  if (data.stop_reason === 'max_tokens') {
    const e = new Error('Ket qua bi cat vi qua dai.');
    e.truncated = true;
    throw e;
  }
  return extractJson(
    (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
  );
}

async function callGemini(apiKey, model, system, userText, usage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const res = await fetchT(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      // Gemini ep duoc dinh dang tra ve, chac chan hon so voi nhac trong prompt
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32768 }
      })
    },
    180000
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = new Error(
      `[${model}] ${(data.error && data.error.message) || 'HTTP ' + res.status}`
    );
    // Co nha cung cap tra HTTP 200 kem ma loi trong than phan hoi.
    e.status = (data.error && Number(data.error.code)) || res.status;
    // Google gui kem thoi gian can cho trong error.details
    const d = (data.error && data.error.details) || [];
    for (const x of d) {
      const m = /^(\d+(?:\.\d+)?)s$/.exec(x.retryDelay || '');
      if (m) e.retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000);
    }
    throw e;
  }
  if (usage && data.usageMetadata) {
    usage.inputTokens += data.usageMetadata.promptTokenCount || 0;
    usage.outputTokens += data.usageMetadata.candidatesTokenCount || 0;
    usage.calls++;
  }
  const cand = (data.candidates || [])[0];
  if (!cand) throw new Error('Gemini khong tra ve noi dung nao.');
  if (cand.finishReason === 'MAX_TOKENS') {
    const e = new Error('Ket qua bi cat vi qua dai.');
    e.truncated = true;
    throw e;
  }
  return extractJson((cand.content?.parts || []).map((p) => p.text || '').join('\n'));
}

// Chuoi model nao roi cung het han. Thay vi de nguoi dung tu doan,
// hoi thang API xem khoa cua ho dung duoc gi roi goi y.
function looksLikeBadModel(msg) {
  return /no longer available|not.?found|not supported|unknown model|does not exist|invalid model|deprecated|models\//i.test(
    msg || ''
  );
}

// 503 va 429 la loi tam thoi cua nha cung cap. Khong thu lai thi mot lo
// trich van de roi vao do se mat im lang, va nguoi dung khong biet thieu.
// Het gio o buoc goi model thuong la qua tai tam thoi, dang thu lai.
// Het gio o buoc doc feed thi bo qua luon, vi con nhieu nguon khac.
// Han muc cua Gemini tinh THEO TUNG MODEL trong cung mot du an.
// Xoay vong ba model la nhan ba thong luong. Va khi mot model dinh 429
// thi doi model chay tiep, thay vi ngoi cho het cua so mot phut.
const modelPace = { last: {}, cooldown: {} };

function modelList(settings) {
  const raw = String(settings.model || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return raw.length ? raw : ['claude-sonnet-5'];
}

// Model nao rot cho som nhat thi dung model do.
function pickModel(settings) {
  const pool = modelList(settings);
  const now = Date.now();
  const perMin = settings.modelPerMinute || (settings.provider === 'gemini' ? 9 : 30);
  const gap = Math.ceil(60000 / perMin);
  let best = null;
  let bestAt = Infinity;
  for (const m of pool) {
    const ready = Math.max(
      (modelPace.last[m] || 0) + gap,
      modelPace.cooldown[m] || 0
    );
    if (ready < bestAt) {
      bestAt = ready;
      best = m;
    }
  }
  return { model: best, waitMs: Math.max(0, bestAt - now), pool };
}

async function paceModel(settings, report, forced) {
  if (forced) {
    modelPace.last[forced] = Date.now();
    return forced;
  }
  const { model, waitMs, pool } = pickModel(settings);
  if (waitMs > 0) {
    await waitVisible(
      waitMs,
      pool.length > 1 ? `giãn nhịp (${pool.length} model)` : 'giãn nhịp gọi model',
      report
    );
  }
  modelPace.last[model] = Date.now();
  return model;
}

const TRANSIENT = (e) =>
  e.timeout ||
  (e.network && !e.fatalNet) ||
  e.status === 429 ||
  (e.status >= 500 && e.status < 600);

// Ket qua ky la thi hien khong truy duoc vi dau. Giu lai lan chay gan nhat.
const debugLog = [];
function logCall(model, system, userText, out, err) {
  debugLog.push({
    at: new Date().toISOString(),
    model,
    systemHead: String(system).slice(0, 400),
    inputChars: userText.length,
    inputHead: String(userText).slice(0, 1200),
    output: err ? null : JSON.stringify(out).slice(0, 4000),
    error: err || null
  });
  if (debugLog.length > 30) debugLog.shift();
}

async function callModel(settings, system, userText, usage, report, heavy) {
  const fn = settings.provider === 'gemini' ? callGemini : callAnthropic;
  // Buoc suy luan chi chay mot lan moi lan chay, nen dung model manh hon
  // ton them khong dang ke ma chat luong khac han.
  const forced = (heavy && settings.modelReason) || null;
  let last;
  let model = forced || modelList(settings)[0];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      model = await paceModel(settings, report, forced);
      const out = await fn(settings.apiKey, model, system, userText, usage);
      logCall(model, system, userText, out, null);
      return out;
    } catch (e) {
      last = e;
      if (!TRANSIENT(e)) break;
      if (attempt === 3) break;

      // Model nay het han muc: cho no nghi, roi thu model khac ngay
      // thay vi ngoi cho het cua so mot phut.
      if (e.status === 429 || e.status === 503) {
        modelPace.cooldown[model] = Date.now() + (e.retryAfterMs || (e.status === 429 ? 65000 : 30000));
        const other = pickModel(settings);
        if (!forced && other.pool.length > 1 && other.waitMs < 5000) {
          if (report) report(`  ${model} hết hạn mức, chuyển sang ${other.model}`, true);
          continue;
        }
      }
      // 429 la han muc theo phut: cho 8 giay roi thu lai la roi vao dung
      // cua so bi chan. 503 o bac mien phi cua Gemini la "model qua tai",
      // cung la mot dang gioi han nang luc chu khong phai truc trac thoang qua.
      const base =
        e.retryAfterMs ||
        (e.status === 429
          ? 65000
          : e.status === 503
            ? 12000 * Math.pow(2, attempt)
            : e.network
              ? 4000 * Math.pow(2, attempt)
              : 2000 * Math.pow(2, attempt));
      const wait = Math.round(base * (0.85 + Math.random() * 0.3));
      await waitVisible(
        wait,
        e.network
          ? 'lỗi mạng, thử lại'
          : e.timeout
            ? 'nhà cung cấp không phản hồi, chờ'
            : `nhà cung cấp lỗi ${e.status}, chờ`,
        report
      );
    }
  }
  logCall(model, system, userText, null, `[${runState.stage || '?'}] ${last && last.message}`);
  const e = last;
  {
    if (!looksLikeBadModel(e.message)) {
      if (TRANSIENT(e)) {
        throw new Error(
          e.network
            ? `${e.message} Kiểm tra kết nối mạng hoặc VPN rồi chạy lại.`
            : e.timeout
              ? 'Nhà cung cấp không phản hồi sau 4 lần thử. Thử lại sau vài phút.'
            : e.status === 429
              ? 'Vượt hạn mức của nhà cung cấp sau 4 lần thử. Giảm "Số lượt gọi model mỗi phút" trong Cài đặt, hoặc bớt ngách lại.'
              : `Nhà cung cấp trả lỗi ${e.status} sau 4 lần thử. Đây là lỗi phía họ, thử lại sau vài phút.`
        );
      }
      throw e;
    }
    let list = [];
    try {
      list = await listModels(settings);
    } catch {}
    const flash = list.filter((m) => /flash|haiku/i.test(m)).slice(0, 4);
    const pick = (flash.length ? flash : list.slice(0, 6)).join(', ');
    throw new Error(
      `Model "${model}" khong dung duoc.` +
        (pick
          ? ` Khoa cua ban dung duoc: ${pick}. Vao Cai dat, bam "Xem model kha dung" roi chon mot cai.`
          : ' Vao Cai dat, bam "Xem model kha dung" de chon lai.')
    );
  }
}

async function listModels(settings) {
  if (!settings.apiKey) throw new Error('Chua co API key.');
  if (settings.provider === 'gemini') {
    const res = await fetchT(
      'https://generativelanguage.googleapis.com/v1beta/models',
      { headers: { 'x-goog-api-key': settings.apiKey } },
      30000
    );
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => !/embedding|aqa|imagen|veo/i.test(n));
  }
  const res = await fetchT(
    'https://api.anthropic.com/v1/models?limit=100',
    { headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' } },
    30000
  );
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
}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

const SYSTEM_PRODUCT = `Ban nhan mot danh sach van de khach hang da duoc trich xuat.
Nhiem vu: tim san pham co the BAN ONLINE duoc, khong phai tim giai phap ky thuat dung.

Nguoi bi nut ong nuoc CAN keo epoxy — do la cau tra loi dung ve ky thuat va vo dung
ve thuong mai, vi keo epoxy gia 8 do. Do la loi thuong gap nhat o buoc nay.

NAM DIEU KIEN LOAI. Chung den tu kinh nghiem ban hang that, khong phai suy luan.
Loai ngay neu san pham roi vao bat ky dieu nao:

1. GIA BAN LE THI TRUONG duoi {MIN} do hoac tren {MAX} do.
   Duoi thi bien loi nhuan khong du tra tien quang cao.

2. HANG TIEU THU TRUC TIEP LEN CO THE: thuoc, thuc pham chuc nang, my pham,
   do cham soc da, quan ao, do lot. Vuong quy dinh, ty le tra hang cao,
   va khach phai thu moi biet co hop khong.

3. DANH MUC CAN QUA NHIEU BIEN THE mau sac hoac mau ma.
   Moi mau moi size la mot SKU; doan sai ton kho, khach chon nham roi tra hang.
   Uu tien san pham mot phien ban, hoac nhieu nhat hai ba bien the chuc nang.

4. CO BRAND THONG LINH DANH MUC. Neu khach da co mot cai ten mac dinh trong dau
   khi nghi den mon do do, ban khong co cua. Day khong phai chuyen Amazon co ban hay khong —
   ma la chuyen danh muc do da co chu chua.
5. KHONG PHAI HANG MOT NGUOI BE DUOC. Chi phi ship theo the tich thung,
   khong theo can nang, va no giet lai nhanh hon moi thu khac.

   Phep thu: mot nguoi co be duoc bang mot tay tu cua vao nha khong,
   va co giao duoc bang chuyen phat thuong khong. Khong thi loai.

   Trong moi danh muc, lay PHIEN BAN CA NHAN, bo phien ban cong nghiep:
   cua cam tay chu khong phai cua ban, may hut cam tay chu khong phai may cong nghiep.

   Noi chien khong dau la muc tran — do gia dung dat ban thi duoc.
   Do noi that thi khong, ke ca khi nhe: ghe, ban, thang, tam lon.

Ngoai nam dieu tren thi KHONG tu them dieu kien nao khac. Cu the:
- Nhu cau gap KHONG phai ly do loai. Nguoi vua gap su co la nguoi san sang mua nhat.
- Viec Amazon co ban mon tuong tu KHONG phai ly do loai, tru khi dieu 4 dung.
- Dung cu, thiet bi do, do sua chua gia tren {MIN} do deu duoc, dung loai chung.

Quy tac khac:
- Moi de xuat phai gan duoc voi mot cau trich cu the trong du lieu dau vao.
- Uoc gia ban le thi truong hop ly, bang do la.
- Ghi ro rui ro lam de xuat that bai.

Tra ve DUY NHAT mang JSON (co the rong):
[{
  "topic": "ten cum khop voi dau vao",
  "ideas": [{
    "product": "mo ta san pham",
    "price": <gia ban le uoc tinh, so nguyen, do la>,
    "variants": "mot phien ban" | "vai bien the chuc nang" | "nhieu mau ma",
    "why": "vi sao no giai quyet van de, 1 cau",
    "evidence": "cau trich nguyen van lam can cu",
    "moat": "danh muc nay da co brand thong linh chua, va vi sao khach chua co lua chon mac dinh",
    "risk": "rui ro chinh"
  }]
}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

/* ---------- xuat du lieu ---------- */

const COLUMNS = [
  'Ngach',
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
  'Tu dau ra',
  'Gia uoc tinh',
  'So bien the',
  'Vi sao',
  'Cau trich lam can cu',
  'Brand thong linh',
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
      c.niche || '',
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
        i ? (i.from === 'event' ? 'suy tu tin tuc' : 'tu cong dong') : '',
        i && i.price ? i.price : '',
        i ? i.variants || '' : '',
        i ? i.why : '',
        i ? i.evidence || '' : '',
        i ? i.moat || '' : '',
        i ? i.risk : '',
        link
      ]);
    }
  }
  // San pham suy tu su kien nam ngoai cac cum, van phai co trong file xuat.
  for (const i of results.eventIdeas || []) {
    rows.push([
      '',
      ran,
      '',
      i.eventTitle || '',
      i.chain || '',
      '',
      'co',
      '',
      '',
      i.eventDate || '',
      i.product || '',
      'suy tu tin tuc',
      i.price || '',
      i.variants || '',
      i.chain || '',
      `${i.mechanism || ''} — ${i.eventTitle || ''}`,
      i.moat || '',
      i.risk || '',
      ''
    ]);
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

/* ---------- ghi Google Sheet qua Apps Script ---------- */

// Khong dung Google Cloud, khong dung service account.
// App chi POST toi mot Web App do admin trien khai. Sheet ID nam trong script
// tren may chu Google, app khong biet Sheet nao. Token chi mo duoc dung mot
// viec: ghi vao tab cua team do.
function sheetIdFromUrl(u) {
  const m = String(u || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{25,}$/.test(String(u || '').trim())) return String(u).trim();
  return null;
}

async function writeSheet(settings, results) {
  const url = (TEAM ? TEAM.webAppUrl : settings.webAppUrl || '').trim();
  const token = (TEAM ? TEAM.token : settings.webAppToken || '').trim();

  // Ban team: Sheet gan cung trong script. Ban ca nhan: dan link vao Cai dat.
  const sheetId = TEAM ? null : sheetIdFromUrl(settings.sheetUrl);
  if (!TEAM && settings.sheetUrl && !sheetId) {
    throw new Error('Link Google Sheet khong hop le. Dan ca duong dan tu thanh dia chi trinh duyet.');
  }
  if (!TEAM && !sheetId) throw new Error('Chua co link Google Sheet. Vao Cai dat de dan.');
  if (!url) throw new Error('Chua co dia chi Web App. Vao Cai dat de nhap.');
  if (!token) throw new Error('Chua co token. Vao Cai dat de nhap.');
  if (!/^https:\/\/script\.google\.com\//.test(url)) {
    throw new Error('Dia chi khong phai Web App cua Apps Script.');
  }

  const rows = toRows(results);

  const res = await fetchT(
    url,
    {
      method: 'POST',
      // Apps Script chuyen huong sang googleusercontent, phai cho phep di theo.
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token,
        sheetId,
        rows,
        team: TEAM ? TEAM.id : '',
        sourceCount: (results.meta && results.meta.sourceCount) || '',
        appVersion: APP_VERSION
      })
    },
    60000
  );

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Web App tra ve khong phai JSON. Kiem tra da deploy voi "Who has access: Anyone" chua.'
    );
  }
  if (!data.ok) throw new Error(data.error || 'Ghi that bai.');
  return { rows: data.rows, tab: data.tab };
}

/* ---------- che ngach con ---------- */

// "Kitchen" la mot can phong, khong phai mot nganh hang. Bat mo hinh di
// nguon voi dau vao do thi no bam vao thu de nghi nhat — thiet bi lon —
// va ca phieu chay ve phia do hong, noi khong co san pham dropship nao.
const SYSTEM_NICHES = `Ban chia mot nganh rong thanh cac NGACH CON ban duoc.

Nganh nguoi dung dua co the rat rong, vi du "kitchen" — do la mot can phong,
khong phai mot nganh hang. Nhiem vu cua ban la chia no thanh nhung ngach du hep
de tim nguon va tim san pham cho ra hon.

Moi ngach con phai:
- Hep den muc co cong dong rieng tren mang, khong phai mot danh muc chung.
- Xoay quanh mot HOAT DONG hoac mot NHOM NGUOI, khong xoay quanh mot can phong.
- Co san pham trong khoang {MIN}-{MAX} do.
- KHONG phai thiet bi lon gan co dinh, khong phai do tieu thu len co the,
  khong phai danh muc can qua nhieu bien the mau ma.

Voi moi ngach, danh gia thang than xem no co dang theo duoi khong.
Duoc phep noi mot ngach la kem.

Neu duoc cho danh sach NGACH DA CO, tuyet doi khong de xuat lai chung
va cung khong de xuat bien the doi ten cua chung. Di sang vung khac cua nganh.

De xuat 8-10 ngach. Tra ve DUY NHAT mang JSON:
[{
  "name": "ten ngach, ngan gon",
  "desc": "mot cau: ai mua, mua de lam gi",
  "products": "vai vi du san pham tieu bieu trong khoang gia",
  "verdict": "danh gia that ve co hoi, mot hai cau",
  "promise": "cao" | "trung binh" | "thap"
}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

async function suggestNiches(settings, usage, existing) {
  if (!settings.apiKey) throw new Error('Chua co API key. Vao Cai dat de nhap.');
  if (!settings.industry) throw new Error('Chua dien nganh trong Cai dat.');
  const lo = settings.priceMin ?? 40;
  const hi = settings.priceMax ?? 200;
  const out = await callModel(
    settings,
    SYSTEM_NICHES.replace('{MIN}', lo).replace('{MAX}', hi),
    `Nganh: ${settings.industry}\nThi truong: ${settings.markets || 'US, EU, AU, CA'}` +
      ((existing || []).length
        ? `\n\nNGACH DA CO (${existing.length}), dung de xuat lai:\n${existing.join('\n')}`
        : ''),
    usage
  );
  return (Array.isArray(out) ? out : []).filter((n) => n && n.name).slice(0, 10);
}

/* ---------- goi y nguon ---------- */


// Sub cang lon cang de nghi ra, va cang vo dung: moi nganh deu roi vao chung.
// Chan cung nhung cai to nhat, roi ep mo hinh di sau hon.
const GENERIC_SUBS = [
  'buyitforlife', 'homeimprovement', 'fixit', 'diy', 'homeowners', 'frugal',
  'lifeprotips', 'mildlyinfuriating', 'assholedesign', 'crappydesign',
  'productreviews', 'consumerreports', 'shutupandtakemymoney', 'gadgets',
  'amazon', 'reviews', 'declutter', 'organization', 'remodeling'
];

const SYSTEM_SOURCES = `Ban de xuat NGUON de theo doi van de khach hang trong mot nganh cu the.

QUAN TRONG NHAT: DI SAU, DUNG DI RONG.

Sub cang lon cang de nghi ra va cang vo dung, vi moi nganh deu dan toi chung.
Mot sub 3 trieu thanh vien noi ve moi thu trong nha thi khong cho ban biet gi
ve nganh cua nguoi dung. Mot sub 40 nghin thanh vien chi noi ve dung mot loai
do thi moi dang.

Voi moi de xuat, tu hoi: "sub nay co xuat hien neu nganh la thu khac khong?"
Neu CO, thi bo. No qua chung.

Cach di sau:
- Theo loai san pham cu the, khong theo danh muc. Khong phai "do gia dung"
  ma la loai may cu the trong do.
- Theo thuong hieu ma nguoi dung nganh do hay noi toi.
- Theo hoat dong sinh ra nhu cau, khong theo mon do.
- Theo nhom nguoi dung dac thu: nghe nghiep, hoan canh song, so thich.
- Theo su co: sub chuyen sua chua hoac phan hoi ve dung loai do do.

Neu duoc cho mot NGACH CU THE, chi tim nguon cho dung ngach do.
Nguon phai dac thu cho ngach, khong phai cho nganh rong ben ngoai.

Tra ve BA loai nguon:
1. Subreddit — CHI 6 cai, chon ky nhat. Reddit siet toc do rat manh nen
   moi cai deu dat; dung liet ke cho du so.
2. Trang web — 12 cai. Nhom nay gan nhu khong bi chan nen de xuat rong tay.
   Uu tien theo thu tu:
   - DIEN DAN chuyen nganh. Rat nhieu dien dan chay Discourse va deu co feed.
     Day la noi nguoi ta ke van de dai va cu the nhat.
   - Trang Stack Exchange cua nganh, dang <ten>.stackexchange.com. Cau hoi o day
     luon la mot van de co that, viet ro rang.
   - Blog nguoi dung that, khong phai trang ban hang.
   - Bao nganh va tap chi chuyen nganh.

3. Tim kiem tin tuc — 4 cai. Tra ve TU KHOA tieng Anh, khong phai URL.
   Dung cho viec phat hien su kien: thu hoi san pham, quy dinh moi, dut chuoi cung.
   Vi du: "product recall <nganh>", "<nganh> regulation 2026".
   Bao NGANH quan trong: it doi thu doc chung, nen day la loi the that.

Voi trang web chi tra TEN MIEN, khong kem https:// va khong kem duong dan.

Tra ve DUY NHAT mang JSON:
[{"type":"reddit","name":"tensub","why":"mot cau ngan"},
 {"type":"site","domain":"vidu.com","why":"mot cau ngan"},
 {"type":"news","query":"tu khoa tieng Anh","why":"mot cau ngan"}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

const SYSTEM_SCORE = `Ban duoc cho tieu de bai THAT lay tu vai nguon (subreddit hoac trang web). Cham diem tung nguon.

Cau hoi duy nhat: o day nguoi ta co MO TA VAN DE CU THE voi do ho da mua hay dang dung khong?

Thang diem 0-10:
- 8-10: phan lon la nguoi ke chuyen do hong, khong vua, mua nham, dung mot thoi gian roi that vong
- 5-7: co lan lon, mot phan la than phien that
- 2-4: chu yeu khoe anh, hoi dap chung chung, tin tuc thuan tuy, bai review tra tien
- 0-1: quang cao, ban hang, khong lien quan

Cham theo tieu de THAT duoc cung cap, khong cham theo ten sub va khong doan.

Tra ve DUY NHAT mang JSON:
[{"name":"ten nguon dung nhu duoc cung cap","score":<0-10>,"verdict":"mot cau ngan bang tieng Viet","evidence":"mot tieu de that the hien ro nhat"}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

// Blog khong co duong feed thong nhat. Doc the <link rel="alternate"> trong
// trang chu truoc, vi do la cho trang tu khai bao. Khong co thi thu cac
// duong quen thuoc.
// Xep theo do pho bien. Chi thu het khi trang chu khong khai bao gi.
const FEED_PATHS = [
  '/feed', '/rss', '/feed.xml', '/index.xml', '/atom.xml',
  '/latest.rss', '/blog/feed', '/rss.xml', '/news/feed',
  '/forum/feed', '/feeds', '/feeds/posts/default'
];

function feedLinksFromHtml(html, base) {
  const out = [];
  const re = /<link\s[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["'](application\/(rss|atom)\+xml|text\/xml)["']/i.test(tag)) continue;
    const h = tag.match(/href=["']([^"']+)["']/i);
    if (!h) continue;
    try {
      out.push(new URL(h[1], base).href);
    } catch {}
  }
  return out;
}

async function discoverFeed(domain, settings) {
  const host = String(domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;

  const ua = buildUserAgent(settings, false);

  // Nuot het loi roi bao "khong tim thay feed" la che mat nguyen nhan that.
  async function tryBase(base) {
    let declared = [];
    let homeOk = false;
    try {
      const res = await fetchT(base, { headers: { 'User-Agent': ua } }, 20000);
      if (res.status === 403 || res.status === 429) {
        return { blocked: true, why: `trang chủ trả ${res.status}` };
      }
      if (res.ok) {
        homeOk = true;
        declared = feedLinksFromHtml((await res.text()).slice(0, 200000), res.url || base);
      }
    } catch (e) {
      return { unreachable: true, why: e.timeout ? 'trang chủ không phản hồi' : 'không mở được trang chủ' };
    }

    // Trang chu mo duoc va co khai bao: gan nhu chac chan dung.
    // Khong khai bao thi thu duong quen thuoc, nhung it thoi.
    const paths = declared.length ? [] : FEED_PATHS.slice(0, homeOk ? 5 : 10);
    const candidates = [...declared, ...paths.map((p) => base + p)];

    let stale = false;
    let n = 0;
    for (const url of candidates) {
      if (n++ > 0) await sleep(jitter(400));
      try {
        const r = await fetchOnce(url, ua, null);
        const items = parseFeed(r.xml, host);
        const cutoff = Date.now() - 120 * 86400000;
        const recent = items.filter((i) => i.date && Date.parse(i.date) >= cutoff);
        if (recent.length >= 3) return { url, items: recent };
        if (items.length) stale = true;
      } catch (e) {
        if (/40[13]|429/.test(e.message)) return { blocked: true, why: 'bị chặn khi tải feed' };
      }
    }
    return { why: stale ? 'có feed nhưng toàn bài cũ' : 'không tìm thấy feed RSS' };
  }

  const first = await tryBase(`https://${host}`);
  if (first.url) return first;
  if (first.blocked) return { failed: true, why: 'trang chặn truy cập tự động' };

  // Chi thu bien the www khi ban dau khong voi toi duoc.
  if (first.unreachable && !host.startsWith('www.')) {
    const second = await tryBase(`https://www.${host}`);
    if (second.url) return second;
    return { failed: true, why: second.why };
  }
  return { failed: true, why: first.why };
}

// Google News RSS: khong can khoa, tran 100 bai moi truy van.
// Tuoi trung binh khoang 6-7 ngay nen van nam trong cua so 14 ngay.
function newsFeedUrl(query, markets) {
  const gl = /EU|DE|FR/i.test(markets || '') ? 'US' : 'US';
  return (
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) +
    `&hl=en-US&gl=${gl}&ceid=${gl}:en`
  );
}

async function verifySource(cand, settings) {
  const type = cand.type === 'site' ? 'site' : cand.type === 'news' ? 'news' : 'reddit';

  if (type === 'news') {
    const q = String(cand.query || '').trim();
    if (!q) return { name: '(trống)', type, ok: false, reason: 'thiếu từ khoá' };
    const url = newsFeedUrl(q, settings.markets);
    try {
      const { items } = await fetchFeed({ url, label: 'tin: ' + q }, settings, null, true, settings._report);
      const cutoff = Date.now() - 120 * 86400000;
      const recent = items.filter((i) => i.date && Date.parse(i.date) >= cutoff);
      if (recent.length < 3) return { name: q, type, url, ok: false, reason: 'quá ít tin' };
      return {
        name: q,
        type,
        url,
        ok: true,
        count: recent.length,
        items: recent,
        titles: recent.slice(0, 15).map((i) => i.title),
        samples: recent.slice(0, 3).map((i) => i.title)
      };
    } catch (e) {
      return { name: q, type, url, ok: false, reason: e.message };
    }
  }

  if (type === 'site') {
    const host = String(cand.domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const found = await discoverFeed(host, settings);
    if (!found || found.failed) {
      return { name: host, type, ok: false, reason: (found && found.why) || 'tên miền không hợp lệ' };
    }
    return {
      name: host,
      type,
      url: found.url,
      ok: true,
      count: found.items.length,
      items: found.items,
      titles: found.items.slice(0, 15).map((i) => i.title),
      samples: found.items.slice(0, 3).map((i) => i.title)
    };
  }

  const name = String(cand.name || '').replace(/^\/?r\//, '');
  const url = `https://www.reddit.com/r/${encodeURIComponent(name)}/new.rss`;
  try {
    const { items } = await fetchFeed({ url, label: 'r/' + name }, settings, null, true, settings._report);
    const cutoff = Date.now() - 90 * 86400000;
    const recent = items.filter((i) => i.date && Date.parse(i.date) >= cutoff);
    if (recent.length < 3) return { name, type, url, ok: false, reason: 'quá ít bài gần đây' };
    return {
      name,
      type,
      url,
      ok: true,
      count: recent.length,
      items: recent,
      titles: recent.slice(0, 15).map((i) => i.title),
      samples: recent.slice(0, 3).map((i) => i.title)
    };
  } catch (e) {
    return {
      name,
      type,
      url,
      ok: false,
      reason: e.message.includes('404') ? 'không tồn tại' : e.message
    };
  }
}

async function suggestSources(settings, report, existing, niche) {
  if (!settings.apiKey) throw new Error('Chua co API key. Vao Cai dat de nhap.');
  if (!settings.industry) throw new Error('Chua dien nganh trong Cai dat. Do la dau vao duy nhat cua buoc nay.');

  report('Đang nghĩ ứng viên...');

  // So ghi nho: moi ung vien tung xet, kem ket qua. Khong co no thi moi lan
  // chay lai nghi ra dung mot danh sach nhu cu.
  const seenAll = readJson(`seen${SUFFIX}.json`, {});
  const key = niche || '_';
  const seen = seenAll[key] || { ok: [], bad: [] };
  const already = [
    ...(existing || []).map((x) => x.label),
    ...seen.ok,
    ...seen.bad
  ]
    .filter(Boolean)
    .slice(0, 120);

  const avoid = already.length
    ? `\n\nDA XET ROI, DUNG DE XUAT LAI (${already.length} cai):\n${already.join(', ')}`
    : '';

  const cands = await callModel(
    settings,
    SYSTEM_SOURCES,
    `Nganh: ${settings.industry}${niche ? `\nNGACH CU THE: ${niche}` : ''}\nThi truong: ${
      settings.markets || 'US, EU, AU, CA'
    }${avoid}`,
    null
  );

  const raw = Array.isArray(cands) ? cands : [];
  const generic = [];
  const list = raw
    .filter((c) => {
      if (c.type === 'site') return true;
      const n = String(c.name || '').replace(/^\/?r\//, '').toLowerCase();
      if (GENERIC_SUBS.includes(n)) {
        generic.push('r/' + c.name);
        return false;
      }
      return true;
    })
    .slice(0, 22);
  if (generic.length) {
    report(`Bỏ ${generic.length} sub quá chung: ${generic.join(', ')}`);
  }

  const reddits = list.filter((c) => c.type !== 'site' && c.type !== 'news');
  const others = list.filter((c) => c.type === 'site' || c.type === 'news');
  const nNews = others.filter((c) => c.type === 'news').length;
  report(
    `${list.length} ứng viên (${reddits.length} sub, ${others.length - nNews} trang web, ${nNews} tìm tin). Đang kiểm chứng...`
  );

  const out = [];
  let done = 0;
  const tick = (v) => {
    out.push(v);
    const tag = v.type === 'reddit' ? 'r/' + v.name : v.type === 'news' ? 'tin: ' + v.name : v.name;
    report(`  ${++done}/${list.length} ${tag}: ${v.ok ? v.count + ' bài' : 'loại — ' + v.reason}`);
  };

  // Trang web la cac ten mien doc lap, khong chia chung han muc nao,
  // nen chay song song. Reddit thi phai tuan tu vi chung mot han muc.
  const POOL = 4;
  const queue = [...others];
  await Promise.all(
    Array.from({ length: Math.min(POOL, queue.length) }, async () => {
      while (queue.length) {
        if (runState.stop) return;
        const c = queue.shift();
        const v = await verifySource(c, settings);
        v.why = c.why || '';
        tick(v);
      }
    })
  );

  for (const c of reddits) {
    checkStop();
    const v = await verifySource(c, settings);
    v.why = c.why || '';
    tick(v);
  }

  // Loi xen ke nhau la dau hieu bi siet theo nhip, khong phai nguon xau.
  const blocked = out.filter(
    (x) => !x.ok && /chan|403|429|HTML|khong phai RSS/i.test(x.reason || '')
  ).length;
  if (blocked >= 3) {
    report(
      `${blocked} nguồn bị chặn chứ không phải nguồn xấu. ` +
        `Tăng "Giãn cách giữa các lần gọi Reddit" lên 10000ms trong Cài đặt rồi chạy lại.`
    );
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

  // Ghi lai de lan sau khong de xuat trung. Giu toi da 200 moi ben.
  const nameOf = (x) =>
    x.type === 'reddit' ? 'r/' + x.name : x.type === 'news' ? 'tin: ' + x.name : x.name;
  seen.ok = [...new Set([...seen.ok, ...out.filter((x) => x.ok).map(nameOf)])].slice(-200);
  seen.bad = [...new Set([...seen.bad, ...out.filter((x) => !x.ok).map(nameOf)])].slice(-200);
  seenAll[key] = seen;
  writeJson(`seen${SUFFIX}.json`, seenAll);

  out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return out;
}

/* ---------- phat hien su kien sinh cau ---------- */

// Sau co che, va chi sau co che. Neu mot su kien khong gan duoc vao
// mot trong so nay thi no khong phai su kien sinh cau — no chi la tin tuc.
const SYSTEM_EVENTS = `Ban doc tin tuc va bai viet de tim SU KIEN LAM THAY DOI NHU CAU MUA.

Chi nhan su kien gan duoc vao mot trong sau co che:
- "thay the": X bien mat hoac dat len, cau chay sang Y. Thu hoi san pham, thue quan, dut chuoi cung, lenh cam, ngung san xuat.
- "bo tro": X ra mat hoac lan rong, keo theo cau phu kien.
- "phong ve": su kien tieu cuc sinh cau do bao ve hoac du phong.
- "cho phep": luat hoac ha tang moi khien Y thanh kha thi, hoac thanh bat buoc.
- "xuong hang": kinh te xau, chi tieu ngoai nha chuyen thanh do tu lam tai nha.
- "bieu dat": khoanh khac van hoa, hang the hien ban sac.

Quy tac bat buoc:
- Su kien phai co NGAY cu the, da xay ra hoac sap xay ra. Khong co ngay thi bo.
- Phai trich duoc cau tu bai goc lam can cu. Khong co thi bo.
- Neu khong gan duoc vao co che nao trong sau cai tren, BO. Tha tra ve mang rong.
- Chi nhan su kien dan toi HANG VAT LY ship duoc.

Tra ve DUY NHAT mang JSON (co the rong):
[{
  "title": "ten su kien ngan",
  "date": "YYYY-MM-DD",
  "mechanism": "thay the" | "bo tro" | "phong ve" | "cho phep" | "xuong hang" | "bieu dat",
  "category": "danh muc san pham chiu anh huong",
  "keywords": ["3-5 tu khoa tieng Anh"],
  "evidence": "cau trich nguyen van tu bai goc",
  "lagWeeks": <so tuan uoc tinh tu su kien den luc cau tang>
}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

async function detectEvents(items, settings, usage, report) {
  if (!items.length) return [];
  report('Đang tìm sự kiện làm thay đổi nhu cầu...');
  const corpus = items
    .slice(0, 80)
    .map((i) => `(${i.source}) ${i.title}\n${i.body.slice(0, 300)}`)
    .join('\n\n');
  try {
    const found = await callModel(
      settings,
      SYSTEM_EVENTS,
      `Hom nay: ${new Date().toISOString().slice(0, 10)}\nNganh: ${settings.industry}\nThi truong: ${settings.markets}\n\n${corpus}`,
      usage
    );
    const list = (Array.isArray(found) ? found : []).filter(
      (e) => e && e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && e.mechanism && e.evidence
    );
    report(`Tìm được ${list.length} sự kiện có ngày và có căn cứ.`);
    return list;
  } catch (e) {
    report('Không tìm được sự kiện: ' + e.message);
    return [];
  }
}

// Su kien truoc day chi lam viec xep hang. Buoc nay moi bat no sinh san pham.
// Suy luan nhan qua nhieu buoc — dung model manh hon neu co.
const SYSTEM_EVENT_PRODUCT = `Ban nhan mot danh sach SU KIEN da lam thay doi nhu cau mua.
Nhiem vu: suy ra san pham co the ban online nho su kien do.

Chuoi suy luan phai di du ba buoc, va ban phai viet ra buoc giua:
  su kien -> ai doi hanh vi gi -> ho mua gi thay the

Neu khong viet duoc buoc giua mot cach cu the, BO su kien do.
Tha tra ve mang rong con hon tra ve thu nghe hop ly ma khong co duong dan.

NAM DIEU KIEN LOAI (giong het buoc kia):
1. Gia ban le thi truong duoi {MIN} do hoac tren {MAX} do.
2. Hang tieu thu truc tiep len co the: thuoc, my pham, quan ao.
3. Danh muc can qua nhieu bien the mau sac mau ma.
4. Co brand thong linh danh muc.
5. Khong phai hang mot nguoi be duoc bang mot tay va giao bang chuyen phat thuong.
   Trong moi danh muc lay phien ban ca nhan, bo phien ban cong nghiep.
   Noi chien khong dau la muc tran; do noi that thi khong ke ca khi nhe.

Dung tu them dieu kien nao khac. Nhu cau gap KHONG phai ly do loai.

Tra ve DUY NHAT mang JSON (co the rong):
[{
  "product": "mo ta san pham",
  "price": <gia ban le uoc tinh, so nguyen, do la>,
  "variants": "mot phien ban" | "vai bien the chuc nang" | "nhieu mau ma",
  "eventTitle": "ten su kien da dan toi de xuat nay",
  "eventDate": "YYYY-MM-DD",
  "mechanism": "co che da duoc gan cho su kien do",
  "chain": "mot cau: ai doi hanh vi gi roi mua gi",
  "moat": "danh muc nay da co brand thong linh chua",
  "risk": "rui ro chinh"
}]

NGON NGU DAU RA — BAT BUOC:
Viết tiếng Việt có dấu đầy đủ. Ví dụ đúng: "Cung cấp giải pháp bơm nhiên liệu
siêu bền, cho phép thay van bên trong thay vì vứt bỏ cả bơm."
Ví dụ SAI, tuyệt đối không viết như thế này: "Cung cap giai phap bom nhien lieu".
Prompt này viết không dấu chỉ vì lý do kỹ thuật — đừng bắt chước.

Riêng trường trích dẫn nguyên văn thì giữ nguyên ngôn ngữ gốc của bài viết,
không dịch.`;

async function productsFromEvents(events, settings, usage, report) {
  if (!events.length) return [];
  report('Đang suy sản phẩm từ sự kiện...');
  const lo = settings.priceMin ?? 40;
  const hi = settings.priceMax ?? 200;
  const brief = events
    .map(
      (e) =>
        `- ${e.date} | ${e.title}\n  co che: ${e.mechanism} | danh muc: ${e.category || ''} | do tre: ${
          e.lagWeeks || '?'
        } tuan\n  can cu: ${e.evidence}`
    )
    .join('\n');
  try {
    const out = await callModel(
      settings,
      SYSTEM_EVENT_PRODUCT.replace('{MIN}', lo).replace('{MAX}', hi)
 + learnedBlock(),
      `Nganh: ${settings.industry}\nThi truong: ${settings.markets}\n\n${brief}`,
      usage,
      report,
      true
    );
    const list = (Array.isArray(out) ? out : []).filter((i) => i && i.product && i.chain);
    const kept = list.filter((i) => {
      const p = Number(i.price);
      return !isFinite(p) || p <= 0 || (p >= lo && p <= hi);
    });
    report(`${kept.length} sản phẩm suy ra từ sự kiện.`);
    return kept;
  } catch (e) {
    report('Không suy được sản phẩm từ sự kiện: ' + e.message);
    return [];
  }
}

function trackedPath() {
  return `tracked${SUFFIX}.json`;
}

// Ten san pham moi lan mot khac. So sanh theo tu khoa, khong theo chuoi.
function normProduct(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// "Dung cu thong cong lo xo" va "... cam tay" la mot san pham.
// So khop chinh xac chuoi se de lot, phai so theo tu khoa.
function sameProduct(a, b) {
  const A = normProduct(a);
  const B = normProduct(b);
  if (!A.length || !B.length) return false;
  // Tu dau tien la danh tu chi loai san pham. "ghe cong thai hoc" va
  // "dem lung cong thai hoc" trung 3/4 tu nhung la hai mon khac nhau.
  if (A[0] !== B[0]) return false;
  const SA = new Set(A);
  const SB = new Set(B);
  let hit = 0;
  for (const w of SA) if (SB.has(w)) hit++;
  return hit / Math.min(SA.size, SB.size) >= 0.75;
}

/* ---------- vong hoc ---------- */

// Tab Theo doi thu thap du lieu ma khong ai doc, ke ca app. Buoc nay noi nguoc lai.
// Duoi 6 mau thi moi "diem chung" tim duoc deu la nhieu, nen khong dung.
function learnedTraits() {
  const items = readJson(trackedPath(), []);
  const tested = items.filter((t) => t.status === 'tested' && (t.result === 'won' || t.result === 'lost'));
  if (tested.length < 6) return { ready: false, tested: tested.length };

  const won = tested.filter((t) => t.result === 'won');
  const lost = tested.filter((t) => t.result === 'lost');
  if (!won.length) return { ready: false, tested: tested.length, note: 'chưa có cái nào ăn' };

  const nums = won.map((t) => Number(t.price)).filter((p) => isFinite(p) && p > 0);
  const band = nums.length
    ? `${Math.min(...nums)}-${Math.max(...nums)} do`
    : null;

  const tally = (arr, key) => {
    const m = {};
    for (const t of arr) {
      const v = (t[key] || '').trim();
      if (v) m[v] = (m[v] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const lines = [];
  lines.push(`Da test ${tested.length} san pham: ${won.length} an, ${lost.length} khong an.`);
  if (band) lines.push(`Cai an nam trong khoang ${band}.`);
  const bySrc = tally(won, 'source').slice(0, 3);
  if (bySrc.length) lines.push(`Nguon phat hien ra cai an: ${bySrc.map(([k, n]) => `${k} (${n})`).join(', ')}.`);
  const byVar = tally(won, 'variants').slice(0, 2);
  if (byVar.length) lines.push(`So bien the cua cai an: ${byVar.map(([k, n]) => `${k} (${n})`).join(', ')}.`);
  const lostSrc = tally(lost, 'source').slice(0, 2);
  if (lostSrc.length) lines.push(`Nguon hay cho ra cai khong an: ${lostSrc.map(([k]) => k).join(', ')}.`);

  return { ready: true, tested: tested.length, won: won.length, text: lines.join('\n') };
}

function learnedBlock() {
  const t = learnedTraits();
  if (!t.ready) return '';
  return (
    `\n\nDU LIEU THAT TU CAC LAN TEST TRUOC (mau con nho, dung coi la luat):\n${t.text}\n` +
    `Uu tien de xuat giong dac diem cua nhung cai da an, nhung dung bo qua thu moi chi vi no khac.`
  );
}

/* ---------- gop cum va lich su ---------- */

const norm = (v) => String(v || '').toLowerCase().trim();

// Hai cum duoc coi la mot neu tu khoa trung tu mot nua tro len.
function overlap(a, b) {
  const A = new Set((a || []).map(norm).filter(Boolean));
  const B = new Set((b || []).map(norm).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const k of A) if (B.has(k)) hit++;
  return hit / Math.min(A.size, B.size);
}

// Cac lo duoc goi rieng nen cung mot van de co the xuat hien nhieu lan
// duoi ten khac nhau. Gop lai theo do trung tu khoa.
function mergeClusters(acc, incoming) {
  const RANK = { 'thap': 0, 'trung binh': 1, 'cao': 2, 'thấp': 0, 'trung bình': 1 };
  for (const c of incoming) {
    if (!c || !c.topic) continue;
    const hit = acc.find((x) => overlap(x.keywords, c.keywords) >= 0.5);
    if (!hit) {
      acc.push({ ...c, quotes: c.quotes || [], keywords: c.keywords || [] });
      continue;
    }
    hit.itemCount = (hit.itemCount || 0) + (c.itemCount || 0);
    hit.quotes = [...(hit.quotes || []), ...(c.quotes || [])].slice(0, 4);
    const seen = new Set((hit.keywords || []).map(norm));
    for (const k of c.keywords || []) if (!seen.has(norm(k))) hit.keywords.push(k);
    if ((RANK[norm(c.intensity)] ?? -1) > (RANK[norm(hit.intensity)] ?? -1)) {
      hit.intensity = c.intensity;
    }
  }
  return acc;
}

// Mot chu de lap lai qua nhieu lan chay la tin hieu that.
// Xuat hien mot lan roi bien mat thi thuong la nhieu.
function applyHistory(clusters, runs) {
  const recent = runs.slice(-8);
  for (const c of clusters) {
    // Mang co/khong qua tung lan chay. Day la thu dang nhin nhat:
    // mot cham don doc la nhieu, mot chuoi lien tiep la tin hieu.
    const hist = recent.map((r) =>
      (r.topics || []).some((t) => overlap(t.keywords, c.keywords) >= 0.4)
    );
    let seen = 0;
    let streak = 0;
    let streakLive = true;
    let firstSeen = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i]) {
        seen++;
        firstSeen = recent[i].ranAt;
        if (streakLive) streak++;
      } else {
        streakLive = false;
      }
    }
    c.history = hist;
    c.timesSeen = seen;
    c.streak = streak;
    c.isNew = seen === 0;
    c.firstSeen = firstSeen;
    c.signalPersist = streak >= 1;
  }
  return clusters;
}

// Gui trang thai buoc rieng khoi nhat ky chu, de giao dien ve duoc.
function makeStage(send) {
  return (id, detail, done, total) => {
    runState.stage = id;
    if (send) send({ id, detail: detail || '', done, total });
  };
}

async function runPipeline(state, report, stage) {
  const st = stage || (() => {});
  const { settings, calendar } = state;
  let sources = state.sources;
  if (!settings.apiKey) throw new Error('Chua co API key. Vao Cai dat de nhap.');

  // Ngach da tick. Khong tick cai nao thi chay nhu cu, khong phan ngach.
  const activeNiches = (state.niches || []).filter((n) => n.run);
  const nicheNames = activeNiches.length ? activeNiches.map((n) => n.name) : [null];

  let discovered = null;
  const th = settings.scoreThreshold ?? 6;
  const prefetched = new Map();

  // Lan chay truoc lay du lieu xong roi hong o buoc sau: dung lai nguon do.
  const pending = readJson(`pending-sources${SUFFIX}.json`, []);
  if (pending.length) {
    const have = new Set(sources.map((x) => x.url));
    const add = pending.filter((x) => !have.has(x.url));
    if (add.length) {
      sources = [...sources, ...add];
      discovered = { added: add, all: [] };
      report(`Dùng lại ${add.length} nguồn đã tìm được ở lần chạy trước.`);
    }
  }

  for (const nm of nicheNames) {
    checkStop();
    if (sources.some((x) => (x.niche || null) === nm)) continue;
    if (!settings.autoDiscover) continue;
    st('sources', nm ? `ngách "${nm}"` : '');
    report(nm ? `Ngách "${nm}": chưa có nguồn, đang tìm...` : 'Chưa có nguồn nào. Đang tự đi tìm...');
    const found = await suggestSources(settings, report, sources, nm);
    const ok = found.filter((f) => f.ok && (f.score ?? 0) >= th);
    if (!ok.length) {
      report(`${nm ? `Ngách "${nm}": k` : 'K'}hông nguồn nào đạt ngưỡng ${th}.`);
      continue;
    }
    for (const f of ok) if (f.items) prefetched.set(f.url, f.items);
    const added = ok.map((f) => ({
      url: f.url,
      label: f.type === 'reddit' ? 'r/' + f.name : f.type === 'news' ? 'tin: ' + f.name : f.name,
      niche: nm || undefined
    }));
    sources = [...sources, ...added];
    // Bo mang items truoc khi gui qua IPC: giao dien chi can ten va diem,
    // con noi dung bai thi nang hang MB va phai nhan ban qua tien trinh.
    const light = found.map(({ items, titles, ...rest }) => rest);
    discovered = { added: [...((discovered && discovered.added) || []), ...added], all: light };
    report(`Đã tự thêm ${added.length} nguồn${nm ? ` cho ngách "${nm}"` : ''}.`);
  }

  if (!sources.length) {
    throw new Error('Khong tim duoc nguon nao. Vao Nguon de them tay, hoac ha nguong diem.');
  }

  // Chi doc nguon thuoc cac ngach da tick. Nguon khong gan ngach thi luon doc.
  if (activeNiches.length) {
    const want = new Set(nicheNames);
    sources = sources.filter((x) => !x.niche || want.has(x.niche));
  }

  /* 1. thu thap */
  st('collect', '', 0, sources.length);
  report('Đang đọc ' + sources.length + ' nguồn...');
  const httpCache = readJson(`httpcache${SUFFIX}.json`, {});
  // Buoc kiem chung nguon da tai feed roi. Tai lai la goi Reddit gap doi
  // so lan can thiet, va do la ly do chinh khien no siet toc do.
  for (const [url, items] of prefetched) {
    httpCache[url] = { etag: null, lastModified: null, items, justFetched: true };
  }
  const all = [];
  const failures = [];
  const perSource = {};
  const nicheOf = new Map(sources.map((x) => [x.label || x.url, x.niche || '']));
  for (const src of sources) {
    checkStop();
    const label = src.label || src.url;
    try {
      const { items, fromCache } = await fetchFeed(src, settings, httpCache, false, report);
      all.push(...items);
      perSource[label] = items.length;
      st('collect', label, Object.keys(perSource).length + failures.length, sources.length);
      report(`${label}: ${items.length} bài${fromCache ? ' (không đổi)' : ''}`);
    } catch (e) {
      failures.push(`${src.label || src.url}: ${e.message}`);
      report(`${src.label || src.url}: LOI - ${e.message}`);
    }
  }

  /* 2a. loc dang nong */
  const cutoff = Date.now() - settings.windowDays * 86400000;
  const fresh = all.filter((i) => i.date && Date.parse(i.date) >= cutoff);
  // Luu NGAY. Truoc day chi luu o cuoi pipeline, nen mot loi o buoc goi model
  // vut het cong lay du lieu — co khi ca tieng dong ho.
  // Cache tich luy theo moi URL tung dung. Doi ngach vai lan la no chua
  // hang tram nguon khong bao gio dung lai. Chi giu nguon dang hoat dong.
  const live = new Set(sources.map((x) => x.url));
  for (const k of Object.keys(httpCache)) {
    delete httpCache[k].justFetched;
    if (!live.has(k)) delete httpCache[k];
  }
  await writeJsonAsync(`httpcache${SUFFIX}.json`, httpCache);
  if (discovered && discovered.added.length) {
    await writeJsonAsync(`pending-sources${SUFFIX}.json`, discovered.added);
  }
  report(`${all.length} bài tổng, ${fresh.length} bài trong ${settings.windowDays} ngày. Đã lưu, chạy lại sẽ không phải lấy lại.`);
  if (!fresh.length) {
    throw new Error('Khong co bai nao trong cua so thoi gian. Thu tang so ngay trong Cai dat.');
  }

  /* 3. trich pain point — chia lo */
  // Nhoi 240 bai vao mot prompt thi bai cuoi gan nhu khong duoc doc ky.
  // Chia lo nho, goi rieng, roi gop cac cum trung nhau.
  const pool = fresh.slice(0, 240);
  const SIZE = 35;
  const batches = [];
  for (let i = 0; i < pool.length; i += SIZE) batches.push(pool.slice(i, i + SIZE));

  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  let clusters = [];

  for (let b = 0; b < batches.length; b++) {
    checkStop();
    st('extract', '', b, batches.length);
    report(`Đang trích vấn đề, lô ${b + 1}/${batches.length}...`);
    const corpus = batches[b]
      .map((i, n) => `[${n}] (${i.source}) ${i.title}\n${i.body}\nURL: ${i.link}`)
      .join('\n\n');
    const head =
      (settings.industry ? `Nganh cua nguoi dung: ${settings.industry}\n` : '') +
      `Thi truong: ${settings.markets}\n\n`;
    const context = head + corpus;

    try {
      const part = await callModel(settings, SYSTEM_PAIN, context, usage, report);
      clusters = mergeClusters(clusters, Array.isArray(part) ? part : []);
    } catch (e) {
      if (!e.truncated) throw e;
      // Bi cat thi chia doi lo roi thu lai, thay vi hong ca lan chay.
      report(`  Lô ${b + 1} quá dài, chia đôi và thử lại...`);
      const half = Math.ceil(batches[b].length / 2);
      for (const piece of [batches[b].slice(0, half), batches[b].slice(half)]) {
        const sub = piece
          .map((i, n) => `[${n}] (${i.source}) ${i.title}\n${i.body}\nURL: ${i.link}`)
          .join('\n\n');
        try {
          const part = await callModel(settings, SYSTEM_PAIN, head + sub, usage, report);
          clusters = mergeClusters(clusters, Array.isArray(part) ? part : []);
        } catch (e2) {
          report(`  Bỏ nửa lô ${b + 1}: ${e2.message}`);
        }
      }
    }
  }
  report(`Tìm được ${clusters.length} cụm vấn đề sau khi gộp.`);

  /* 2b-0. tu phat hien su kien tu chinh cac bai vua doc */
  st('events');
  const foundEvents = await detectEvents(fresh, settings, usage, report);
  // Su kien tu tim duoc dung ngang lich nhap tay, nhung danh dau nguon goc
  // de nguoi dung biet cai nao la may doan.
  const allEvents = [
    ...(calendar || []),
    ...foundEvents.map((e) => ({
      date: e.date,
      title: e.title,
      note: [e.category, ...(e.keywords || [])].join(' '),
      auto: true,
      mechanism: e.mechanism,
      evidence: e.evidence,
      lagWeeks: e.lagWeeks
    }))
  ];

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
    const hits = allEvents.filter((ev) => {
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

  // Gan ngach cho tung cum, dua vao nguon cua trich dan.
  for (const c of clusters) {
    const src = (c.quotes || []).map((q) => q.source).find((x) => nicheOf.has(x));
    c.niche = (src && nicheOf.get(src)) || '';
  }

  // Tin hieu thu tu: chu de lap lai qua cac lan chay truoc.
  // Xuat hien mot lan roi bien mat thuong la nhieu.
  const runs = readJson(`runs${SUFFIX}.json`, []);
  applyHistory(clusters, runs);
  for (const c of clusters) if (c.signalPersist) c.score++;

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
    const lo = settings.priceMin ?? 40;
    const hi = settings.priceMax ?? 200;
    suggestions = await callModel(
      settings,
      SYSTEM_PRODUCT.replace('{MIN}', lo).replace('{MAX}', hi)
 + learnedBlock(),
      `Thi truong: ${settings.markets}\n${settings.industry ? 'Nganh: ' + settings.industry : ''}\n\n${brief}`,
      usage
    );
  } catch (e) {
    report('Buoc goi y san pham loi: ' + e.message);
  }
  // Loc lai bang ma, khong tin mo hinh tu giu nguong gia.
  const pLo = settings.priceMin ?? 40;
  const pHi = settings.priceMax ?? 200;
  let dropped = 0;
  const byTopic = new Map(
    suggestions.map((s) => [
      s.topic,
      (s.ideas || []).filter((i) => {
        const p = Number(i.price);
        if (isFinite(p) && p > 0 && (p < pLo || p > pHi)) { dropped++; return false; }
        return true;
      })
    ])
  );
  for (const c of clusters) c.ideas = byTopic.get(c.topic) || [];
  if (dropped) report(`Loại ${dropped} đề xuất ngoài khoảng $${pLo}–$${pHi}.`);

  // Danh dau nguon goc de nguoi dung biet de xuat nao den tu dau.
  for (const c of clusters) {
    for (const i of c.ideas || []) {
      i.from = 'painpoint';
      i.fromLabel = (c.quotes || [])[0]?.source || 'nguồn cộng đồng';
    }
  }

  // Goi y lai thu nguoi dung da bo qua tuan truoc la cach nhanh nhat de mat niem tin.
  const seenProducts = readJson(trackedPath(), []).map((t) => t.product);
  let dupProducts = 0;
  for (const c of clusters) {
    c.ideas = (c.ideas || []).filter((i) => {
      if (seenProducts.some((p) => sameProduct(p, i.product))) {
        dupProducts++;
        return false;
      }
      return true;
    });
  }

  const eventIdeas = (await productsFromEvents(foundEvents, settings, usage, report)).filter((i) => {
    if (seenProducts.some((p) => sameProduct(p, i.product))) {
      dupProducts++;
      return false;
    }
    return true;
  });
  if (dupProducts) report(`Bỏ ${dupProducts} đề xuất trùng với thứ đã có trong Theo dõi.`);
  for (const i of eventIdeas) {
    i.from = 'event';
    i.fromLabel = 'suy từ tin: ' + (i.eventTitle || '').slice(0, 40);
  }

  /* luu kho luu tru cho lan sau */
  const snap = archive[nowWeek] || {};
  for (const c of clusters) {
    for (const k of c.keywords || []) {
      const key = String(k).toLowerCase();
      snap[key] = (snap[key] || 0) + (c.itemCount || 0);
    }
  }
  archive[nowWeek] = snap;
  await writeJsonAsync(`archive${SUFFIX}.json`, archive);
  // Luu dau vet lan chay de lan sau doi chieu. Chi giu tu khoa va so lieu,
  // khong giu noi dung, nen file khong phinh to.
  runs.push({
    ranAt: new Date().toISOString(),
    topics: clusters.map((c) => ({ keywords: c.keywords, topic: c.topic, score: c.score })),
    perSource
  });
  await writeJsonAsync(`runs${SUFFIX}.json`, runs.slice(-26));

  // Chi phi cong don theo thang
  // Ghi lai ngach nao vua chay, de lan sau biet no cu bao lau.
  const ranNiches = nicheNames.filter(Boolean);
  try {
    fs.unlinkSync(storePath(`pending-sources${SUFFIX}.json`));
  } catch {}

  const spend = readJson(`spend${SUFFIX}.json`, {});
  const month = new Date().toISOString().slice(0, 7);
  const m = spend[month] || { inputTokens: 0, outputTokens: 0, calls: 0, runs: 0 };
  m.inputTokens += usage.inputTokens;
  m.outputTokens += usage.outputTokens;
  m.calls += usage.calls;
  m.runs++;
  spend[month] = m;
  await writeJsonAsync(`spend${SUFFIX}.json`, spend);

  const archiveWeeks = Object.keys(archive).length;
  report('Xong.');

  return {
    discovered,
    ranNiches,
    events: foundEvents,
    eventIdeas,
    clusters,
    meta: {
      ranAt: new Date().toISOString(),
      itemsTotal: all.length,
      itemsFresh: fresh.length,
      failures,
      perSource,
      usage,
      runCount: runs.length,
      sourceCount: sources.length,
      archiveWeeks,
      yoyReady: clusters.some((c) => c.yoyKnown)
    }
  };
}

/* ---------- kiem tra ban moi ---------- */

// app.getVersion() tra ve phien ban Electron neu khong xac dinh duoc app path.
// Doc thang tu package.json (nam trong app.asar khi da dong goi) thi chac chan hon.

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
  const res = await fetchT(
    `https://api.github.com/repos/${repo}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Radar' } },
    15000
  );
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

ipcMain.handle('stop', () => {
  runState.stop = true;
  return true;
});

ipcMain.handle('run', async (_e, state) => {
  // Bam Dung roi bam Chay ngay: lan chay cu co the chua go xong, va hai
  // luong cung ghi vao mot bo cache se cho ra loi kho hieu.
  if (runState.busy) {
    return { ok: false, error: 'Lần chạy trước chưa dừng hẳn. Đợi vài giây rồi bấm lại.' };
  }
  runState.busy = true;
  debugLog.length = 0;
  runState.stop = false;
  throttleState.hits = 0;
  throttleState.extra = 0;
  modelPace.last = {};
  modelPace.cooldown = {};
  const report = (msg, replace) =>
    win && !win.isDestroyed() && win.webContents.send('run:log', msg, !!replace);
  try {
    state.settings._report = report;
    const send = (p) => win && !win.isDestroyed() && win.webContents.send('run:stage', p);
    const stage = makeStage(send);
    const out = await runPipeline(state, report, stage);
    send({ id: 'done' });
    return { ok: true, ...out };
  } catch (e) {
    if (win && !win.isDestroyed()) win.webContents.send('run:stage', { id: 'error' });
    return { ok: false, error: e.message, stopped: !!e.stopped };
  } finally {
    runState.busy = false;
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

ipcMain.handle('niches:suggest', async (_e, settings, existing) => {
  try {
    return { ok: true, niches: await suggestNiches(settings, null, existing || []) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('suggest:sources', async (_e, settings, sources) => {
  const report = (m, replace) =>
    win && !win.isDestroyed() && win.webContents.send('suggest:log', m, !!replace);
  settings._report = report;
  try {
    return { ok: true, results: await suggestSources(settings, report, sources || []) };
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

ipcMain.handle('stages', () => STAGES);

ipcMain.handle('team', () => (TEAM ? { id: TEAM.id, name: TEAM.name, locked: true } : null));

ipcMain.handle('models', async (_e, settings) => {
  try {
    return { ok: true, models: await listModels(settings) };
  } catch (e) {
    return { ok: false, error: e.message };
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

/* ---------- theo doi ket qua ---------- */

// Khong co buoc nay thi sau sau thang ban van khong biet tool dung 1/10 hay 1/50.
// Moi gia thuyet duoc ghi lai kem ngay, roi ban danh dau ket qua that.
function statsOf(items) {
  const tested = items.filter((t) => t.status === 'tested');
  const won = tested.filter((t) => t.result === 'won').length;
  const lost = tested.filter((t) => t.result === 'lost').length;
  const bySource = {};
  for (const t of tested) {
    const k = t.source || '(không rõ)';
    bySource[k] = bySource[k] || { won: 0, lost: 0, total: 0 };
    bySource[k].total++;
    if (t.result === 'won') bySource[k].won++;
    if (t.result === 'lost') bySource[k].lost++;
  }
  return {
    total: items.length,
    queued: items.filter((t) => t.status === 'queued').length,
    tested: tested.length,
    dropped: items.filter((t) => t.status === 'dropped').length,
    won,
    lost,
    hitRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    bySource
  };
}

ipcMain.handle('track:list', () => {
  const items = readJson(trackedPath(), []);
  return { items, stats: statsOf(items) };
});

ipcMain.handle('learned', () => learnedTraits());

ipcMain.handle('debug:save', async () => {
  if (!debugLog.length) return { ok: false, error: 'Chưa có lần chạy nào trong phiên này.' };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Luu nhat ky go loi',
    defaultPath: path.join(app.getPath('downloads'), `radar-debug-${Date.now()}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  fs.writeFileSync(filePath, JSON.stringify(debugLog, null, 2), 'utf8');
  return { ok: true, path: filePath, calls: debugLog.length };
});

ipcMain.handle('track:add', (_e, entry) => {
  const items = readJson(trackedPath(), []);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({
    id,
    addedAt: new Date().toISOString(),
    status: 'queued',
    result: null,
    note: '',
    ...entry
  });
  writeJson(trackedPath(), items);
  return { ok: true, id };
});

ipcMain.handle('track:update', (_e, id, patch) => {
  const items = readJson(trackedPath(), []);
  const it = items.find((x) => x.id === id);
  if (!it) return { ok: false };
  Object.assign(it, patch, { updatedAt: new Date().toISOString() });
  writeJson(trackedPath(), items);
  return { ok: true };
});

ipcMain.handle('track:remove', (_e, id) => {
  const items = readJson(trackedPath(), []).filter((x) => x.id !== id);
  writeJson(trackedPath(), items);
  return { ok: true };
});

ipcMain.handle('spend', () => readJson(`spend${SUFFIX}.json`, {}));

ipcMain.handle('config:export', async () => {
  const st = readJson(`state${SUFFIX}.json`, {});
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Xuat cau hinh',
    defaultPath: path.join(app.getPath('downloads'), 'radar-config.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  // Khong xuat API key va token: do la cua tung nguoi.
  const out = {
    sources: st.sources || [],
    calendar: st.calendar || [],
    niches: (st.niches || []).map((n) => ({ ...n, run: false, lastRun: null })),
    settings: {
      industry: st.settings?.industry || '',
      markets: st.settings?.markets || '',
      windowDays: st.settings?.windowDays,
      scoreThreshold: st.settings?.scoreThreshold,
      politeDelayMs: st.settings?.politeDelayMs
    }
  };
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf8');
  return { ok: true, path: filePath };
});

ipcMain.handle('config:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Nhap cau hinh',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true };
  try {
    const cfg = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    return { ok: true, config: cfg };
  } catch (e) {
    return { ok: false, error: 'Khong doc duoc file: ' + e.message };
  }
});

/* ---------- an toan cap ung dung ---------- */

// Mot loi chua bat o tien trinh chinh se lam app chet khong dau vet.
// Ghi lai va bao ra giao dien thay vi bien mat.
function reportFatal(kind, err) {
  const msg = (err && err.stack) || String(err);
  console.error(`[radar] ${kind}:`, msg);
  if (win && !win.isDestroyed()) {
    win.webContents.send('run:log', `Lỗi không mong đợi (${kind}): ${String(err)}`);
    win.webContents.send('run:stage', { id: 'error' });
  }
}

process.on('uncaughtException', (e) => reportFatal('uncaughtException', e));
process.on('unhandledRejection', (e) => reportFatal('unhandledRejection', e));

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
  // Chromium giet tien trinh giao dien neu no khong phan hoi. Ghi lai de
  // biet, thay vi de no chet am tham giua mot lan chay.
  win.webContents.on('unresponsive', () => {
    console.warn('[radar] giao dien khong phan hoi');
  });
  win.webContents.on('responsive', () => {
    console.warn('[radar] giao dien phan hoi tro lai');
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
