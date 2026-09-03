# Radar

Đọc Reddit, blog và báo ngành → lọc theo ba tầng thời điểm → trích vấn đề khách hàng gặp phải → gợi ý sản phẩm.

Chạy trên Windows và macOS từ cùng một bộ mã nguồn. Mọi dữ liệu và khoá API chỉ nằm trên máy bạn.

---

## Yêu cầu hệ điều hành

**macOS 11 Big Sur trở lên. Windows 10 trở lên.**

Mức này do Electron quy định, không phải do Radar. Bản đang dùng là Electron 37.10.3 — bản mới nhất còn chạy được macOS 11. Từ Electron 38 trở đi, mức tối thiểu nhảy lên macOS 12 Monterey.

| Electron | macOS tối thiểu |
|---|---|
| 37 (đang dùng) | 11.0 Big Sur |
| 38 trở lên | 12.0 Monterey |

Nếu mọi máy trong nhóm đều từ macOS 12 trở lên, có thể nâng `electron` trong `package.json` lên `^43.5.1` để dùng Chromium mới hơn. Không bắt buộc.

## Môi trường

Cần Node.js 20 trở lên, cài một lần từ https://nodejs.org (bản LTS). Trên Mac, nếu đã có Homebrew thì `brew install node` cũng được.

Chạy bằng `npm start` trong lúc thử nghiệm. Chỉ đóng gói thành `.app` khi đã dùng ổn — bản đóng gói chưa ký sẽ bị macOS chặn và bạn phải mở khoá thủ công, không đáng làm khi còn đang chỉnh.

## Cài đặt

Mở Terminal (Mac) hoặc PowerShell (Windows), vào thư mục này rồi chạy:

```
npm install
npm start
```

`npm install` chỉ mất vài chục giây. Lần `npm start` đầu tiên mới tải Electron, khoảng 100 MB, có thanh tiến trình. Những lần sau mở ngay.

Nếu npm cảnh báo về install scripts, bỏ qua — Electron 43 tự tải binary lúc chạy, không phụ thuộc script cài đặt.

### Đóng gói thành app cài đặt được

Chạy trên đúng hệ điều hành bạn muốn đóng gói cho:

```
npm run build:mac     # trên máy Mac  → file .dmg
npm run build:win     # trên máy Win  → file .exe
```

Kết quả nằm trong thư mục `dist/`. Không đóng gói cho Mac từ máy Windows và ngược lại.

App chưa ký số nên lần đầu mở, macOS sẽ báo không mở được. Bấm chuột phải vào app → Open → Open. Chỉ cần làm một lần. Nếu vẫn bị chặn, chạy `xattr -dr com.apple.quarantine /Applications/Radar.app`.

---

## Dùng lần đầu

1. **Cài đặt** — chọn nhà cung cấp rồi dán API key.
   - **Anthropic**: khoá lấy tại platform.claude.com, Settings → API keys. Trả trước, tối thiểu $5.
   - **Google Gemini**: khoá lấy tại aistudio.google.com, Get API key. Có bậc miễn phí, không cần thẻ.

   Bấm **Xem model khả dụng** để app hỏi thẳng API xem khoá của bạn dùng được model nào, rồi bấm chọn. Không phải đoán tên model. Điền ngành của bạn; nó thu hẹp phạm vi phân tích và là đòn bẩy lớn nhất cho chất lượng kết quả.
2. **Nguồn** — không cần làm gì. Cứ bấm Chạy, Radar tự đi tìm nguồn nếu danh sách còn trống. Nhập tay chỉ là lối thoát khi bạn có nguồn riêng muốn thêm.

   Muốn xem trước thì sang tab Nguồn bấm **Tìm nguồn tự động**.
   - Subreddit: `https://www.reddit.com/r/tênsub/new.rss`
   - Tìm theo từ khoá: `https://www.reddit.com/search.rss?q=từ+khoá&sort=new`
   - Blog và báo: hầu hết có sẵn `/feed` hoặc `/rss`
3. **Lịch sự kiện** — nhập những gì đã biết trước ngày: ra mắt sản phẩm, quy định có hiệu lực, mùa vụ. Phần "Từ khoá liên quan" là thứ Radar dùng để nối sự kiện với chủ đề, nên viết bằng tiếng Anh cho khớp với nguồn.
4. **Chạy**.

---

## Nguồn được chọn thế nào

Ba bước, mỗi bước loại bớt:

**Đoán tên.** Mô hình đề xuất 16 subreddit từ ngành của bạn. Bước này chắc chắn có cái bịa — không tránh được, và cũng không cần tránh.

**Kiểm chứng có thật.** Radar gọi đúng feed của từng cái. Sub không tồn tại trả 404. Sub im lìm có dưới 3 bài trong 90 ngày. Cả hai bị loại, ghi rõ lý do.

**Chấm mật độ than phiền.** Đây là bước quyết định. Radar lấy 15 tiêu đề bài **thật** của mỗi sub còn lại rồi hỏi: ở đây người ta có mô tả vấn đề cụ thể với đồ họ đã mua không? Điểm 0-10.

Khác biệt nằm ở chỗ bước ba chấm trên nội dung có thật, không chấm trên tên sub. Đoán tên thì mô hình bịa; đọc 15 tiêu đề có thật thì nó đánh giá được.

Sub từ 6 điểm trở lên được tự thêm. Đổi ngưỡng trong Cài đặt. Đặt cao hơn thì ít nguồn hơn nhưng sạch hơn.

Vì sao không lọc theo số bài: một sub khoe ảnh sản phẩm có thể có 99 bài mỗi tuần và không một câu than phiền nào. Số lượng không nói lên điều gì về chất lượng.

## Ba tầng thời điểm

Mỗi chủ đề được chấm 0–3 điểm, mỗi tầng một điểm:

| Tầng | Ý nghĩa | Cách tính |
|---|---|---|
| Đang nóng | từ 3 bài trở lên trong cửa sổ thời gian | đếm bài |
| Sự kiện sắp tới | từ khoá khớp một mục trong lịch, trong 10 tuần tới | so khớp chuỗi |
| Cao hơn cùng kỳ | nhiều hơn 1,3 lần so với cùng tuần năm ngoái | kho lưu trữ nội bộ |

**Điểm số do mã tính, không do Claude tính.** Claude chỉ trích xuất, không chấm điểm. Chạy hai lần trên cùng dữ liệu thì điểm giống nhau, nên bạn so sánh được giữa các tuần.

---

## Phát hành cho nhiều team

Bốn team S1–S4, mỗi team một bản riêng, dữ liệu không trộn.

### Ranh giới được thi hành thế nào

Mỗi bản phát hành gắn cứng **một Sheet** và **một service account riêng**, nằm trong `app.asar`. Leader không đổi được vì ô cấu hình Sheet bị ẩn hẳn ở bản team.

Điểm mấu chốt: **mỗi team phải có service account riêng.** Khoá nằm trong app trên máy họ nên trích ra được — đó là thực tế không tránh khỏi của app chạy cục bộ. Nhưng khoá của S1 chỉ được chia sẻ vào Sheet của S1, nên trích ra cũng vô dụng với team khác. Google thi hành ranh giới, không phải app. Dùng chung một khoá là hỏng toàn bộ mô hình.

Kho lưu trữ cũng tách theo team (`archive-S1.json`), vì dùng chung sẽ lộ team khác đang theo đuổi từ khoá gì.

Admin sở hữu cả bốn Sheet nên đọc được hết. Thu hồi quyền thì bỏ chia sẻ Sheet, không cần đụng vào máy họ.

### Chuẩn bị một lần

1. Tạo 4 Google Sheet, bạn là chủ sở hữu.
2. Tạo 4 service account trong Google Cloud, tải 4 file JSON.
3. Chia sẻ mỗi Sheet cho đúng email service account của nó, quyền Editor.
4. Điền `sheetId` vào `teams/S1/team.json` ... `teams/S4/team.json`. ID lấy từ URL Sheet, đoạn giữa `/d/` và `/edit`.
5. Đưa 4 file JSON vào GitHub Secrets tên `SA_S1` ... `SA_S4`, nội dung là cả file.

**Không commit file khoá.** `.gitignore` đã chặn `teams/*/service-account.json`.

### Build

Trên CI, đẩy tag là ra 8 bản (4 team × mac/win):

```
npm version patch
git push --follow-tags
```

Cục bộ, cần đặt file khoá vào `teams/S1/service-account.json` trước:

```
node build-team.js S1 --mac
```

### API key thì leader tự nhập

Cố ý để mở. Khoá AI Studio miễn phí nên không ai phải trả gì, và bạn không phải mang khoá của mình lên máy người khác.

**Lưu ý quan trọng khi hướng dẫn leader:** gói Gemini Pro hay Google AI Pro **không dùng được**. Đó là thuê bao chat, không bao gồm quyền dùng API — quyền lợi của gói chỉ áp dụng trong giao diện web AI Studio. Phải vào aistudio.google.com bấm Get API key để tạo khoá riêng. App đã ghi rõ điều này ngay dưới ô nhập khoá.

Nếu công ty dùng Google Workspace, quản trị viên có thể đã chặn AI Studio. Cho một leader thử lấy khoá trước khi build cả bốn bản.

## Phát hành qua GitHub

Để không phải gửi file 250 MB mỗi lần thêm tính năng.

### Thiết lập một lần

1. Tạo repo trên GitHub. **Nên để public** — mã nguồn không chứa bí mật nào; API key và mọi cấu hình nằm trong `state.json` trên máy từng người, không bao giờ vào repo. Repo private thì app phải mang token mới đọc được Releases, và nhúng token vào app đã phát hành là sai.
2. Đẩy mã lên. File `.github/workflows/build.yml` đã có sẵn.
3. Trong Cài đặt của Radar, điền ô **Kho GitHub** dạng `tên_tài_khoản/radar`.

### Mỗi lần phát hành

```
npm version patch      # 1.0.0 -> 1.0.1
git push --follow-tags
```

GitHub Actions tự build `.dmg` trên máy Mac ảo và `.exe` trên máy Windows ảo, rồi đưa lên tab Releases. Mất chừng 10 phút. **Điều này giải quyết luôn chuyện bạn không có máy Windows.**

Lần sau đồng nghiệp mở Radar, một dải xanh hiện lên đầu cửa sổ: có bản mới, bấm Tải về. Bạn không phải gửi gì nữa.

### Vì sao không cập nhật tự động hoàn toàn

macOS không cho app chưa ký số tự thay thế binary của chính nó. App được phép kiểm tra và báo, nhưng bước cài phải do người dùng bấm. Muốn tự động hoàn toàn thì phải mua chứng chỉ Apple Developer 99 đô một năm. Với công cụ nội bộ hai người thì không đáng.

Trên Windows thì cập nhật ngầm chạy được, nhưng tôi làm thống nhất một cách cho cả hai để bạn không phải giải thích hai quy trình khác nhau.

---

## Đưa kết quả ra ngoài

Sau mỗi lần chạy, thanh xuất hiện phía trên kết quả với hai lựa chọn.

**Xuất file CSV** — chạy được ngay, không cần cấu hình gì. File có BOM nên Excel đọc đúng tiếng Việt. Trong Google Sheet dùng File → Import để nhập.

**Ghi đè lên Google Sheet** — cần cấu hình một lần:

1. Vào console.cloud.google.com, tạo project, bật **Google Sheets API**.
2. Credentials → tạo **Service account** → tạo khoá dạng JSON, tải về.
3. Trong Radar, tab Cài đặt, bấm Chọn file JSON. Radar chỉ lưu đường dẫn tới file, không sao chép khoá vào dữ liệu của mình.
4. Mở Google Sheet, bấm Share, thêm email của service account với quyền **Editor**. Email đó hiện ngay dưới nút chọn khoá.
5. Dán đường dẫn Sheet và tên tab vào Cài đặt.

Cách này không cần màn hình đồng ý của Google và không có token hết hạn để xử lý.

**Ghi đè nghĩa là xoá sạch rồi viết lại.** Mỗi lần ghi, Radar xoá toàn bộ tab đó trước. Đừng để dữ liệu bạn tự nhập tay trong cùng tab. Nếu tab chưa tồn tại thì Radar tự tạo.

### Hình dạng bảng

Một dòng cho mỗi sản phẩm đề xuất, thông tin chủ đề lặp lại ở mỗi dòng để bạn lọc và sắp xếp được. Chủ đề không có đề xuất nào vẫn được một dòng, để nó không biến mất khỏi bảng.

14 cột: ngày chạy, điểm, chủ đề, vấn đề, ba cột tín hiệu, số bài, sự kiện khớp, sản phẩm, vì sao, câu trích làm căn cứ, rủi ro, nguồn.

Cột **câu trích làm căn cứ** là cột đáng đọc nhất. Nếu nó trống hoặc không liên quan tới sản phẩm bên cạnh, đó là dấu hiệu đề xuất đó không có gì đỡ.

---

## Giới hạn cần biết trước

**Tầng cùng kỳ trống trong năm đầu.** Không có API Google Trends công khai, nên Radar tự dựng kho lưu trữ: mỗi lần chạy ghi lại tần suất từ khoá của tuần đó. Tầng này chỉ trả lời được khi đã có dữ liệu cùng tuần năm ngoái. Trong lúc đó nó hiện "chưa có dữ liệu" thay vì đoán bừa. Chạy đều hàng tuần thì sau một năm nó bắt đầu có giá trị.

**Reddit đòi khai báo danh tính.** Radar dùng feed RSS công khai, không cần khoá API, nhưng Reddit chặn (403) những công cụ không khai báo ai đang gọi. Nhập tên tài khoản Reddit của bạn vào Cài đặt — chỉ tên, không cần mật khẩu. Radar gửi kèm theo đúng định dạng Reddit yêu cầu.

Radar không giả mạo trình duyệt. Reddit nói rõ trong tài liệu rằng họ chặn vĩnh viễn những công cụ khai man User-Agent, nên đi đường đó là đánh đổi tài khoản của bạn lấy vài request.

Vẫn 403 sau khi đã nhập tên: Radar tự thử lại qua `old.reddit.com`. Nếu vẫn không được thì tăng giãn cách lên 8000ms. Giới hạn thực tế của Reddit cho truy cập không đăng nhập là khoảng 10 request mỗi phút.

**Chi phí.** Một lần chạy dùng chừng 50 nghìn token vào và 6 nghìn token ra, chia cho hai lần gọi.

Với Sonnet 5 ($2 vào / $10 ra mỗi triệu token) là khoảng $0,15–0,20 mỗi lần, dưới 1 đô một tháng nếu chạy hàng tuần.

Với Gemini bậc miễn phí là $0. Giới hạn miễn phí khoảng 10–15 request mỗi phút và 1.500 mỗi ngày, mà Radar chỉ gọi 2 lần mỗi lần chạy, nên không chạm trần. Đây là cách rẻ nhất để thử xem tool có dùng được không trước khi bỏ tiền.

Đổi nhà cung cấp sẽ xoá khoá cũ và đặt lại model mặc định, để bạn không vô tình gửi khoá Anthropic sang Google.

**Gợi ý sản phẩm là giả thuyết, không phải kết luận.** Mỗi gợi ý buộc phải kèm câu trích nguyên văn làm căn cứ; nếu không có căn cứ thì nó bị loại ngay ở prompt. Nhưng đúng khoảng 1 trên 10 vẫn là kỳ vọng hợp lý. Dùng nó để chọn thứ đáng test, đừng dùng để quyết định nhập hàng.

**Hai bước gọi Claude tách rời có chủ đích.** Trích vấn đề chạy trước, gợi ý sản phẩm chạy sau trên kết quả đã có. Gộp làm một thì mô hình sẽ nhảy thẳng tới sản phẩm rồi bịa ngược vấn đề cho khớp.

---

## Dữ liệu lưu ở đâu

- macOS: `~/Library/Application Support/Electron/`
- Windows: `%APPDATA%\Electron\`

Ba thứ: `state.json` (nguồn, lịch, cài đặt, kết quả gần nhất) và `archive.json` (kho lưu trữ theo tuần). Khoá service account **không** nằm ở đây — Radar chỉ lưu đường dẫn tới file gốc của bạn.

Đường dẫn chính xác hiện ở cuối tab Cài đặt.
