/**
 * Radar — cửa ghi vào Google Sheet
 *
 * ĐÂY LÀ BẢN MẪU. Chép thành Code.gs rồi điền token và Sheet ID thật vào đó:
 *
 *     cp apps-script/Code.example.gs apps-script/Code.gs
 *
 * Code.gs đã bị .gitignore chặn nên không lọt lên repo. File này thì không
 * chứa gì nhạy cảm nên commit được.
 *
 * Sinh token:  for i in ADMIN S1 S2 S3 S4; do echo "$i: $(openssl rand -hex 24)"; done
 *
 * Dán nội dung Code.gs vào script.google.com,
 * rồi Deploy → New deployment → Web app.
 *   Execute as:      Me
 *   Who has access:  Anyone
 *
 * Không cần Google Cloud, không cần service account, không cần màn hình OAuth.
 *
 * Vì sao cách này chặt hơn service account:
 *   - Sheet ID nằm ở đây, trên máy chủ Google. App không biết Sheet nào.
 *   - Token chỉ mở được đúng một việc: ghi vào tab của team đó.
 *     Trích token ra khỏi app cũng không đọc được Sheet, không xoá được gì khác.
 *   - Thu hồi một team: xoá dòng của họ ở dưới rồi deploy lại. Không đụng máy họ.
 */

// Mỗi team một token ngẫu nhiên. Tự sinh bằng:  openssl rand -hex 24
//
// Token của team: gắn cứng một Sheet. Leader không đổi được.
// Token của admin: đặt anySheet true — app gửi kèm link Sheet nào thì ghi vào đó.
//   Chỉ dùng cho chính bạn. Đừng phát token này cho ai.
var TEAMS = {
  'DAN_TOKEN_ADMIN_VAO_DAY': { anySheet: true, tab: 'Radar' },
  'DAN_TOKEN_S1_VAO_DAY': { sheetId: 'DAN_SHEET_ID_S1', tab: 'Radar' },
  'DAN_TOKEN_S2_VAO_DAY': { sheetId: 'DAN_SHEET_ID_S2', tab: 'Radar' },
  'DAN_TOKEN_S3_VAO_DAY': { sheetId: 'DAN_SHEET_ID_S3', tab: 'Radar' },
  'DAN_TOKEN_S4_VAO_DAY': { sheetId: 'DAN_SHEET_ID_S4', tab: 'Radar' }
};

// Sheet tổng của admin: mỗi lần chạy ghi thêm một dòng tóm tắt.
// Không chứa nội dung, chỉ số liệu, nên không lộ gì giữa các team.
// Để rỗng nếu không muốn dùng.
var ADMIN_SHEET_ID = '';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var team = TEAMS[body.token];
    if (!team) return out({ ok: false, error: 'Token không hợp lệ.' });

    var rows = body.rows;
    if (!rows || !rows.length) return out({ ok: false, error: 'Không có dữ liệu.' });

    // Token admin: nhận Sheet từ app. Token team: luôn dùng Sheet đã gắn cứng.
    var sheetId = team.anySheet ? body.sheetId : team.sheetId;
    if (!sheetId) return out({ ok: false, error: 'Chưa có Sheet. Dán link Sheet trong Cài đặt.' });

    var ss;
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (err) {
      return out({
        ok: false,
        error: 'Không mở được Sheet này. Kiểm tra link, và Sheet phải thuộc tài khoản đã deploy script.'
      });
    }
    var sh = ss.getSheetByName(team.tab) || ss.insertSheet(team.tab);

    // Ghi đè: xoá sạch rồi viết lại từ đầu.
    sh.clear();
    sh.clearConditionalFormatRules();
    var nCols = rows[0].length;
    sh.getRange(1, 1, rows.length, nCols).setValues(rows);
    format_(sh, rows, nCols);

    logAdmin_(body);
    return out({ ok: true, rows: rows.length - 1, tab: team.tab });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

// Cho phép kiểm tra nhanh bằng trình duyệt xem đã deploy đúng chưa.
function doGet() {
  return out({ ok: true, service: 'Radar sheet writer' });
}

// Bảng 18 cột chữ dày đặc thì không ai đọc. Định dạng cho quét được bằng mắt.
function format_(sh, rows, nCols) {
  var n = rows.length;
  var head = rows[0];
  var iNiche = head.indexOf('Ngach');
  var iScore = head.indexOf('Diem');
  var iQuote = head.indexOf('Cau trich lam can cu');
  var iPrice = head.indexOf('Gia uoc tinh');

  sh.setFrozenRows(1);
  sh.setFrozenColumns(iNiche >= 0 ? 1 : 0);

  // Hàng tiêu đề
  sh.getRange(1, 1, 1, nCols)
    .setFontWeight('bold')
    .setBackground('#1f2430')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sh.setRowHeight(1, 38);

  // Cả bảng: xuống dòng trong ô, canh trên, viền nhạt
  var body = sh.getRange(2, 1, Math.max(n - 1, 1), nCols);
  body.setVerticalAlignment('top').setWrap(true);
  sh.getRange(1, 1, n, nCols).setBorder(true, true, true, true, true, true, '#d9d9d9', null);

  // Cột trích dẫn dùng chữ có chân — lời khách là bằng chứng, phần còn lại là diễn giải
  if (iQuote >= 0) {
    sh.getRange(2, iQuote + 1, Math.max(n - 1, 1), 1)
      .setFontFamily('Georgia')
      .setFontStyle('italic')
      .setBackground('#fbfbf9');
  }

  if (iPrice >= 0) sh.getRange(2, iPrice + 1, Math.max(n - 1, 1), 1).setNumberFormat('$#,##0');

  // Điểm: càng cao càng đậm
  if (iScore >= 0) {
    var sc = sh.getRange(2, iScore + 1, Math.max(n - 1, 1), 1);
    sc.setHorizontalAlignment('center').setFontWeight('bold');
    var rules = [];
    var colors = ['#f3f3f3', '#e8ecfb', '#c9d2f5', '#94a5ea', '#5b74dd'];
    for (var v = 0; v <= 4; v++) {
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberEqualTo(v)
          .setBackground(colors[v])
          .setFontColor(v >= 3 ? '#ffffff' : '#1f2430')
          .setRanges([sc])
          .build()
      );
    }
    sh.setConditionalFormatRules(rules);
  }

  // Kẻ vạch giữa các ngách để mắt bám được nhóm
  if (iNiche >= 0 && n > 2) {
    sh.getRange(2, iNiche + 1, n - 1, 1).setFontWeight('bold');
    for (var r = 3; r <= n; r++) {
      if (rows[r - 1][iNiche] !== rows[r - 2][iNiche]) {
        sh.getRange(r, 1, 1, nCols).setBorder(
          true, null, null, null, null, null, '#1f2430', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
        );
      }
    }
  }

  // Độ rộng cột: chữ dài thì rộng, số thì hẹp
  var wide = { 'Van de': 300, 'San pham de xuat': 250, 'Vi sao': 260,
               'Cau trich lam can cu': 380, 'Brand thong linh': 280,
               'Rui ro': 260, 'Chu de': 200, 'Su kien khop': 180, 'Nguon': 150 };
  for (var c = 0; c < nCols; c++) {
    sh.setColumnWidth(c + 1, wide[head[c]] || 105);
  }

  sh.getRange(1, 1, n, nCols).createFilter();
}

function logAdmin_(body) {
  if (!ADMIN_SHEET_ID) return;
  try {
    var ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
    var sh = ss.getSheetByName('Log') || ss.insertSheet('Log');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Thời điểm', 'Team', 'Số nguồn', 'Số chủ đề', 'Phiên bản app']);
    }
    sh.appendRow([
      new Date(),
      body.team || '',
      body.sourceCount || '',
      Math.max(0, (body.rows || []).length - 1),
      body.appVersion || ''
    ]);
  } catch (err) {
    // Log hỏng thì không được làm hỏng việc ghi chính.
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
