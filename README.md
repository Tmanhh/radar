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

### Windows

```
.\setup.ps1
npm start
```

PowerShell chặn script thì chạy `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` rồi thử lại.

Cần Node.js LTS từ nodejs.org. Script tự tải và bung Electron bằng `Expand-Archive`, không qua bộ giải nén của npm. Nhận đúng máy x64, ARM64 hay x86.

### macOS

```
./setup.sh
npm start
```

### Đóng gói

**Chỉ dựng được `.exe` trên máy Windows, và `.dmg` trên máy Mac.** Không có cách nào dựng chéo — công cụ đóng gói cần chính hệ điều hành đó. Không có đủ hai máy thì dùng GitHub Actions, workflow sẵn có dựng cả hai.

```
npm run build:win     # tren Windows -> dist\Radar-1.0.0-win.exe
npm run build:mac     # tren Mac     -> dist/Radar-1.0.0-mac.dmg
```

Cần Node.js 20 trở lên, cài một lần từ https://nodejs.org (bản LTS). Trên Mac, nếu đã có Homebrew thì `brew install node` cũng được.

Chạy bằng `npm start` trong lúc thử nghiệm. Chỉ đóng gói thành `.app` khi đã dùng ổn — bản đóng gói chưa ký sẽ bị macOS chặn và bạn phải mở khoá thủ công, không đáng làm khi còn đang chỉnh.

## Cài đặt

Trên macOS, chạy một lệnh:

```
./setup.sh
npm start
```

Script tự lo phần Electron. **Đừng chạy `npm install` trần** — bộ giải nén của Electron không hợp với Node mới trên một số máy, nó bung thiếu file rồi im lặng, và `npm start` sẽ báo `Library not loaded`.

## Cập nhật về sau

```
cd ~/radar
unzip -o ~/Downloads/radar-update.zip
npm start
```

Chỉ chạy lại `./setup.sh` khi `npm start` báo lỗi hoặc khi có thông báo dependency đã đổi.

## Cài đặt thủ công

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

## Ngách con

Ngành như "kitchen" là một căn phòng, không phải một ngành hàng. Đưa nó thẳng vào bước tìm nguồn thì mô hình bám vào thứ dễ nghĩ nhất — thiết bị lớn — và cả phễu chạy về phía đồ hỏng, nơi không có sản phẩm dropship nào.

Tab **Ngách** chẻ ngành thành 8–10 ngách con. Mỗi ngách xoay quanh một **hoạt động** hoặc một **nhóm người**, không xoay quanh một căn phòng, và phải có sản phẩm trong khoảng giá bạn đặt. Mỗi ngách kèm đánh giá thẳng thắn về cơ hội — mô hình được phép nói một ngách là kém.

Bạn tick cái nào đáng theo. Radar tìm nguồn riêng cho từng ngách, và sổ ghi nhớ cũng tách theo ngách.

### Chống trùng ngách

Khi chẻ lại, Radar gửi kèm **danh sách ngách bạn đã có** vào prompt với yêu cầu không đề xuất lại, kể cả biến thể đổi tên. Không có bước này thì mô hình nghĩ lại từ đầu với cùng đầu vào và cho ra gần như cùng một danh sách.

### Chẻ lại thì ngách cũ ra sao

Mỗi lần bấm chẻ, mô hình đặt tên hơi khác đi — "Pha cà phê thủ công" lần sau thành "Pha cà phê thủ công (Home Brewing)". Radar khớp theo **từ khoá trong tên**, không khớp từng ký tự, nên nhận ra đó là một ngách và giữ nguyên ngày chạy cùng liên kết tới nguồn.

Ngách cũ không xuất hiện trong đợt chẻ mới **không bị xoá** nếu nó đã chạy hoặc đang gắn với nguồn. Nó ở lại kèm nhãn "không còn trong đợt chẻ mới" để bạn tự quyết.

Sau khi chẻ, dòng thông báo tóm tắt: bao nhiêu mới, bao nhiêu đã có, bao nhiêu được giữ lại.

### Nhớ ngách nào chạy lúc nào

Mỗi ngách hiện tuổi của lần chạy gần nhất: xanh là dưới 7 ngày, xám là 7–28 ngày, đỏ là trên 28 ngày hoặc chưa chạy.

Ngách đã chạy có nhãn **đã chạy** và một nút **Cập nhật ngách này** — bấm nút đó thay vì tick ô, để không nhầm với ngách chưa chạy bao giờ. Bấm xong nút đổi thành "Sẽ cập nhật ở lần chạy tới".

Tick cái nào là quyền của bạn. Radar chỉ nhắc: nếu bạn tick một ngách vừa chạy hai ngày trước, dòng thông báo sẽ nói rõ để bạn bỏ tick nếu muốn giữ kết quả cũ. Không tick cái nào thì Radar chạy trên cả ngành như trước.

## Nguồn được chọn thế nào

Radar tìm **ba loại nguồn**, không chỉ Reddit:

**Subreddit** — `reddit.com/r/tên/new.rss`. Reddit chặn mạnh, cần nhập tên tài khoản trong Cài đặt.

**Tìm tin** — truy vấn Google News RSS. Không cần khoá, không bị chặn. Dùng cho tầng phát hiện sự kiện: thu hồi sản phẩm, quy định mới, đứt chuỗi cung. Trần 100 bài mỗi truy vấn, tuổi trung bình khoảng 6–7 ngày.

**Trang web** — diễn đàn chuyên ngành, Stack Exchange, blog người dùng, báo ngành. Prompt ưu tiên theo đúng thứ tự đó: diễn đàn là nơi người ta kể vấn đề dài và cụ thể nhất, và rất nhiều diễn đàn chạy Discourse nên đều có `/latest.rss`. Radar đọc thẻ `<link rel="alternate">` trong trang chủ; không khai báo thì thử vài đường quen thuộc.

Nhật ký ghi rõ **lý do thật** khi không lấy được, không gộp hết thành một câu:
- `trang chặn truy cập tự động` — Cloudflare hoặc tường lửa tương tự
- `không mở được trang chủ` — tên miền sai hoặc không phản hồi
- `có feed nhưng toàn bài cũ` — feed tồn tại nhưng nguồn đã nguội
- `không tìm thấy feed RSS` — thật sự không có

Phân biệt được thì mới biết nên thử tên miền khác hay nên bỏ hẳn nhóm nguồn đó.

Reddit chặn thì mất một phần, không mất tất cả.



Ba bước, mỗi bước loại bớt:

**Đoán tên.** Mô hình đề xuất 12 subreddit và 8 trang web. Bước này chắc chắn có cái bịa — không tránh được, và cũng không cần tránh.

Hai cơ chế chống lặp lại:

*Chặn cứng sub quá chung.* Danh sách 19 sub như r/BuyItForLife, r/HomeImprovement, r/DIY bị loại thẳng bằng mã. Chúng dễ nghĩ ra nhất và vô dụng nhất — mọi ngành đều dẫn tới chúng, nên chúng không nói gì về ngách của bạn.

*Sổ ghi nhớ qua các lần chạy.* Radar lưu mọi ứng viên từng xét, kèm kết quả, và gửi danh sách đó vào prompt kèm yêu cầu đừng đề xuất lại. Không có sổ này thì mỗi lần chạy nghĩ ra đúng một danh sách như cũ. File `seen.json`, tối đa 200 mỗi bên.

Prompt cũng đổi trọng tâm: **đi sâu, đừng đi rộng.** Nó phải tự hỏi "sub này có xuất hiện nếu ngành là thứ khác không" — nếu có thì bỏ. Ưu tiên sub vừa và nhỏ, theo loại sản phẩm cụ thể, thương hiệu, hoạt động sinh nhu cầu, hoặc nhóm người dùng đặc thù.

**Kiểm chứng có thật.** Radar gọi đúng feed của từng cái. Sub không tồn tại trả 404. Sub im lìm có dưới 3 bài trong 90 ngày. Cả hai bị loại, ghi rõ lý do.

**Chấm mật độ than phiền.** Đây là bước quyết định. Radar lấy 15 tiêu đề bài **thật** của mỗi sub còn lại rồi hỏi: ở đây người ta có mô tả vấn đề cụ thể với đồ họ đã mua không? Điểm 0-10.

Khác biệt nằm ở chỗ bước ba chấm trên nội dung có thật, không chấm trên tên sub. Đoán tên thì mô hình bịa; đọc 15 tiêu đề có thật thì nó đánh giá được.

Sub từ 6 điểm trở lên được tự thêm. Đổi ngưỡng trong Cài đặt. Đặt cao hơn thì ít nguồn hơn nhưng sạch hơn.

Vì sao không lọc theo số bài: một sub khoe ảnh sản phẩm có thể có 99 bài mỗi tuần và không một câu than phiền nào. Số lượng không nói lên điều gì về chất lượng.

## Sự kiện sinh cầu

Radar tự đọc các bài đã thu thập để tìm sự kiện làm thay đổi nhu cầu mua. Sáu cơ chế, và chỉ sáu:

| Cơ chế | Nghĩa |
|---|---|
| Thay thế | X biến mất hoặc đắt lên, cầu chảy sang Y. Thu hồi, thuế quan, đứt chuỗi cung, lệnh cấm, ngừng sản xuất. |
| Bổ trợ | X ra mắt hoặc lan rộng, kéo theo cầu phụ kiện. |
| Phòng vệ | Sự kiện tiêu cực sinh cầu đồ bảo vệ hoặc dự phòng. |
| Cho phép | Luật hoặc hạ tầng mới khiến Y thành khả thi, hoặc thành bắt buộc. |
| Xuống hạng | Kinh tế xấu, chi tiêu ngoài nhà chuyển thành đồ tự làm tại nhà. |
| Biểu đạt | Khoảnh khắc văn hoá, hàng thể hiện bản sắc. |

Sự kiện phải có **ngày cụ thể** và **câu trích nguyên văn** làm căn cứ. Không gắn được vào một trong sáu cơ chế thì bị loại ngay ở prompt.

Ràng buộc này là thứ ngăn bước phân tích trôi thành máy sinh nội dung nghe hay. Từ một tin tức, mô hình có thể nghĩ ra hai mươi sản phẩm nghe rất hợp lý; bắt nó gọi tên cơ chế biến suy đoán thành thứ bạn kiểm toán được sau ba tháng.

Sự kiện tìm được hiện ở tab Lịch sự kiện, kèm cơ chế và bằng chứng. Bấm Giữ để đưa vào lịch của bạn. **Radar không tự thêm** — nó chỉ đề xuất.

### Sự kiện sinh ra sản phẩm

Trước đây sự kiện chỉ dùng để xếp hạng. Giờ có một bước riêng suy từ sự kiện ra sản phẩm, hiện thành khối riêng phía trên danh sách chủ đề.

Ràng buộc: mô hình phải viết ra **bước giữa** của chuỗi suy luận — *sự kiện → ai đổi hành vi gì → họ mua gì thay thế*. Không viết được bước giữa một cách cụ thể thì bỏ sự kiện đó. Bước giữa hiện ngay dưới tên sản phẩm; mơ hồ thì đề xuất không có gì đỡ.

Cùng bốn điều kiện loại như bước kia.

### Mỗi đề xuất ghi rõ từ đâu ra

Nhãn nhỏ cạnh tên: `r/VacuumCleaners` nếu đến từ than phiền của người dùng, `suy từ tin: ...` nếu đến từ sự kiện. File xuất có cột **Từ đâu ra** riêng.

### Model riêng cho bước suy luận

Suy từ sự kiện ra sản phẩm là suy luận nhân quả nhiều bước, khó hơn hẳn việc trích xuất. Bước này **chỉ chạy một lần mỗi lần chạy**, nên dùng model mạnh hơn tốn thêm không đáng kể.

Ô **Model cho bước suy luận** trong Cài đặt. Bỏ trống thì dùng model chính.

## Bộ lọc sản phẩm bán được

Bước gợi ý sản phẩm hỏng theo một kiểu khó thấy: nó trả lời **đúng về kỹ thuật** và **vô dụng về thương mại**. Người nứt ống nước cần keo epoxy — nhưng keo epoxy giá 8 đô.

Năm điều kiện loại, đến từ kinh nghiệm bán hàng thật:

1. **Giá thị trường ngoài khoảng bạn đặt.** Mặc định $40–200. Dưới thì biên lợi nhuận không đủ trả tiền quảng cáo.
2. **Hàng tiêu thụ trực tiếp lên cơ thể** — thuốc, thực phẩm chức năng, mỹ phẩm, quần áo. Vướng quy định, tỉ lệ trả hàng cao.
3. **Danh mục cần quá nhiều biến thể màu sắc mẫu mã.** Mỗi màu mỗi size là một SKU; đoán sai tồn kho, khách chọn nhầm rồi trả hàng.
4. **Có brand thống lĩnh danh mục.** Nếu khách đã có sẵn một cái tên trong đầu khi nghĩ tới món đó thì không có cửa. Đây không phải chuyện Amazon có bán hay không — mà là danh mục đó đã có chủ chưa.
5. **Không phải hàng một người bê được.** Chi phí ship theo thể tích thùng, không theo cân nặng.

   Phép thử: một người bê được bằng một tay từ cửa vào nhà, và giao được bằng chuyển phát thường. Không thì loại.

   Trong mỗi danh mục, lấy **phiên bản cá nhân** và bỏ phiên bản công nghiệp: cưa cầm tay chứ không phải cưa bàn. Nồi chiên không dầu là mức trần — đồ gia dụng đặt bàn thì được, đồ nội thất thì không kể cả khi nhẹ.

   Đây là phán đoán về loại hàng, không phải con số. Dropship thì hàng không qua tay bạn nên không ai biết nhà máy đóng thùng cỡ nào — bắt nhập kích thước chỉ là bắt đoán rồi đối xử với con số đoán như dữ liệu.

Prompt ghi rõ **không tự thêm điều kiện nào khác**. Cụ thể: nhu cầu gấp không phải lý do loại — người vừa gặp sự cố là người sẵn sàng mua nhất. Dụng cụ và thiết bị đo trên $40 đều được.

Ngưỡng giá còn được **lọc lại bằng mã** sau khi mô hình trả lời, vì không nên tin nó tự giữ ngưỡng.

Mỗi đề xuất hiện thêm **giá ước tính**, **số biến thể** và **brand thống lĩnh**. Đều có trong file xuất.

## Nút Dừng

Bấm Dừng bất cứ lúc nào. Radar dừng ở bước tiếp theo, không cắt ngang giữa chừng, và **giữ lại mọi thứ đã lấy được**. Chạy lại thì đi thẳng vào phần phân tích.

## Vì sao lần chạy đầu lâu, lần sau nhanh

Phần lâu nhất là **tìm và kiểm chứng nguồn**, và nó chỉ chạy một lần cho mỗi ngách. Nguồn được lưu lại; những lần sau chỉ đọc feed của các nguồn đó.

Ba thay đổi cắt bớt thời gian:

**Trang web kiểm chứng song song 4 luồng.** Chúng là các tên miền độc lập, không chia chung hạn mức nào. 14 trang từ 11 giây xuống 3 giây. Reddit vẫn tuần tự vì chung một hạn mức.

**Reddit chỉ thử một lần ở bước kiểm chứng.** Bước đó chỉ cần biết nguồn có dùng được không, không đáng chờ 60 giây cho một sub hỏng. Sáu sub hỏng: từ 360 giây xuống 6 giây. Bước đọc thật vẫn thử ba lần như cũ.

**Tick ít ngách lại.** Mỗi ngách là một vòng tìm nguồn riêng. Tick hết 8 ngách là nhân 8 thời gian — đó là lý do các leader mất một tiếng. Hai ba ngách mỗi lần là hợp lý, và ngách đã chạy rồi thì lần sau không tìm lại nữa.

## Chống treo

Bốn lớp, vì hết giờ chỉ chặn được hậu quả chứ không chặn nguyên nhân.

**Không gửi nội dung bài qua IPC.** Kết quả trả về giao diện từng chứa toàn bộ mảng bài của mọi nguồn — mấy trăm KB đến vài MB phải nhân bản qua tiến trình, trong khi giao diện chỉ cần tên và điểm. Đo được: giảm 99%.

**Ghi file bất đồng bộ.** Cache có thể vài MB; ghi đồng bộ là chặn tiến trình chính, và tiến trình chính bị chặn thì cả cửa sổ đứng vẽ lại.

**Nhật ký chặn ở 400 dòng.** DOM phình không giới hạn là một cách làm treo.

**Bảng tiến trình thay cho hộp log.** Sáu bước của một lần chạy hiện thành danh sách: xong thì chấm đặc, đang chạy thì chấm nhấn nhấp nháy kèm số đếm `7/11`, chưa tới thì chấm rỗng. Kèm đồng hồ đếm thời gian.

Nhật ký chữ vẫn còn, nằm sau nút **Xem chi tiết**. Ở đó có dòng đếm ngược tự đè lên chính nó mỗi giây khi đang chờ — không đẻ dòng mới.

## Hạn mức của nhà cung cấp

Một lần chạy gọi model **15–20 lượt** — chẻ ngách, sinh ứng viên và chấm điểm cho mỗi ngách, bốn lô trích vấn đề, tìm sự kiện, gợi ý sản phẩm. Bậc miễn phí của Gemini cho khoảng 10 lượt mỗi phút.

**Điền nhiều model, cách nhau bằng dấu phẩy.** Hạn mức của Gemini tính **theo từng model** trong cùng một dự án — Flash 10 lượt/phút, Flash-Lite 15 lượt/phút. Ba model là gần ba lần thông lượng. Đo được: 20 lượt gọi chỉ chờ 40 giây thay vì 127 giây, tiết kiệm 68%.

Lưu ý: thêm **khoá API** trong cùng dự án thì không thêm hạn mức, vì hạn mức thuộc về dự án. Chỉ đổi model mới có tác dụng. Muốn nhân thêm nữa thì phải tạo dự án Google Cloud riêng.

**Model nào hết hạn mức thì Radar chuyển ngay sang model khác**, thay vì ngồi chờ hết cửa sổ một phút.

**Và vẫn tự giãn nhịp.** Mặc định 9 lượt mỗi phút cho mỗi model. Đổi trong Cài đặt nếu bạn dùng bậc trả tiền.

Khi vẫn dính 429, Radar **đọc `retryDelay` mà Google gửi kèm** và chờ đúng bấy nhiêu. Không có thì chờ 65 giây — vì 429 là hạn mức theo phút, chờ 8 giây rồi thử lại là rơi vào đúng cửa sổ đang bị chặn.

**503 được xử lý riêng.** Ở bậc miễn phí của Gemini, 503 nghĩa là model đang quá tải — cũng là một dạng giới hạn năng lực chứ không phải trục trặc thoáng qua. Backoff 13, 26, 53, 91 giây. Các lỗi 5xx khác vẫn dùng backoff ngắn 2–18 giây.

**Chọn model ít tranh chấp hơn.** Model mới nhất luôn đông người dùng nhất và hay 503 nhất. Nếu bạn thấy nhiều 503 trong bảng theo dõi của Google, thử lùi một bậc — bản `flash` đời trước thường ổn định hơn hẳn mà chất lượng trích xuất gần như không khác.

## Thông báo lỗi chỉ đúng thủ phạm

Mọi lỗi mạng ghi kèm **địa chỉ hỏng**: *"Lỗi mạng với news.google.com: DNS tạm thời không trả lời (EAI_AGAIN)"*. Mọi lỗi từ nhà cung cấp ghi kèm **tên model**: *"[gemini-3.6-flash] Quota exceeded"*.

Nhật ký gỡ lỗi ghi thêm **bước đang chạy** lúc hỏng.

Trước đây tất cả đều hiện là `fetch failed` — đúng thông báo thô của Node, không nói được gì.

## Hai lần chạy chồng nhau

Bấm Dừng rồi bấm Chạy ngay có thể khiến lần chạy cũ chưa gỡ xong đã có lần mới bắt đầu, và hai luồng cùng ghi vào một bộ cache. Radar giờ từ chối lần chạy thứ hai kèm thông báo rõ, thay vì để hai luồng đè nhau.

## Trang không phản hồi

`fetch` của Node không có thời gian chờ mặc định, nên một máy chủ treo sẽ treo mãi mãi và khối `try/catch` bao quanh không bao giờ chạy — lời gọi không bao giờ trả về để mà bắt lỗi. Đó là lý do một trang chết làm dừng cả lần chạy.

Giờ mọi lời gọi mạng đều có hạn:

| Loại | Chờ tối đa |
|---|---|
| Đọc feed, mở trang chủ | 20 giây |
| Gọi model | 180 giây |
| Ghi Sheet | 60 giây |
| Liệt kê model, kiểm tra bản mới | 15–30 giây |

Feed hết giờ thì bỏ qua nguồn đó và đi tiếp. Model hết giờ thì thử lại tới bốn lần với giãn cách tăng dần, vì đó thường là quá tải tạm thời phía nhà cung cấp.

Lỗi thật — khoá sai, yêu cầu sai, model không tồn tại — thì dừng ngay, không thử lại vô ích.

## Khi một lần chạy hỏng giữa chừng

Bước lấy dữ liệu là phần lâu nhất — có thể cả tiếng nếu Reddit siết tốc độ. Trước đây một lỗi ở bước gọi model vứt hết công đó.

Giờ Radar **lưu ngay sau khi thu thập xong**, trước mọi bước gọi model. Chạy lại thì nó dùng lại nguồn và bài đã lấy, đi thẳng vào phần phân tích. Nhật ký sẽ ghi *"Dùng lại N nguồn đã tìm được ở lần chạy trước"*.

File tạm bị xoá khi một lần chạy đi trọn vẹn.

**Kết quả bị cắt vì quá dài** không còn làm hỏng cả lần chạy. Radar chia đôi lô đó rồi thử lại; hỏng tiếp thì chỉ bỏ nửa lô đó và đi tiếp. Trần đầu ra cũng đã nâng từ 8.192 lên 32.768 token, và lô nhỏ lại từ 60 xuống 35 bài.

## Vòng học

Tab Theo dõi không chỉ để bạn xem. Sau **6 sản phẩm đã đánh dấu kết quả** và có ít nhất một cái Ăn, Radar rút ra đặc điểm chung — khoảng giá, nguồn phát hiện, số biến thể — rồi đưa vào prompt gợi ý sản phẩm.

Dưới 6 mẫu thì im lặng, vì mọi "điểm chung" tìm được đều là nhiễu. Prompt cũng ghi rõ mẫu còn nhỏ và không được coi là luật.

Đây là thứ duy nhất khiến app tốt lên theo thời gian thay vì đứng yên. Đánh dấu càng đều thì càng có tác dụng.

## Không đề xuất lại thứ đã bỏ qua

Gợi ý lại thứ bạn đã bỏ qua tuần trước là cách nhanh nhất để mất niềm tin. Radar so tên sản phẩm với mọi thứ trong Theo dõi và loại trùng.

So theo từ khoá, không theo chuỗi: "Dụng cụ thông cống lò xo" và "Dụng cụ thông cống lò xo cầm tay" là một. Nhưng từ đầu tiên phải trùng — "ghế công thái học" và "đệm lưng công thái học" trùng ba trên bốn từ mà là hai món khác nhau.

## Kiểm tra trước khi chạy

Thiếu API key hay thiếu Ngành thì báo ngay và nhảy sang tab Cài đặt, thay vì chạy xong mới báo lỗi.

Tick từ 4 ngách chưa chạy bao giờ trở lên thì cảnh báo một lần — mỗi ngách là một vòng tìm nguồn riêng. Bấm Chạy lần nữa là đi tiếp.

## Nhật ký gỡ lỗi

Nút **Lưu nhật ký gỡ lỗi** trong Cài đặt xuất ra file JSON gồm mọi lượt gọi model của lần chạy gần nhất: model nào, đầu vào ra sao, trả về gì. Kết quả kỳ lạ thì gửi file đó đi là truy được ngay.

Chỉ giữ trong bộ nhớ của phiên đang chạy, không ghi ra đĩa cho tới khi bạn bấm lưu.

## Ngôn ngữ đầu ra

**Tên chủ đề và tên sản phẩm viết bằng ngôn ngữ thị trường, mở ngoặc dịch tiếng Việt:**

> Paint correction compound (dung dịch đánh bóng phục hồi sơn)

Bạn bán ở thị trường nói tiếng Anh nên cần đúng từ khoá để tra nhà cung cấp và tra đối thủ. Tiếng Việt một mình thì tra không ra gì.

**Mọi phần còn lại — mô tả, lý do, rủi ro — viết tiếng Việt có dấu.** Đó là phần để bạn đọc, không phải để tra.

**Trích dẫn nguyên văn giữ nguyên tiếng gốc**, không dịch, vì đó là bằng chứng.

## Đọc kết quả

Mỗi chủ đề hiện: điểm, tên, bốn dấu hiệu, **chip nguồn** bấm được, rồi các đề xuất sản phẩm.

Chip nguồn ghi đúng nơi lấy được — `r/robotvacuums` cho Reddit, tên miền cho trang web. Bấm vào mở bài gốc.

Nhãn được **chuẩn hoá và gộp**: mô hình ghi lúc thì `r/CarAV`, lúc `Reddit r/CarAV`, lúc chỉ `Reddit` — Radar quy về một dạng, và ba bài từ cùng một sub chỉ hiện một chip.

Mô tả vấn đề và trích dẫn nguyên văn **vẫn có trong file xuất và trong Sheet**, chỉ không hiện trong app để danh sách gọn và quét nhanh hơn.

## Theo dõi kết quả

Tab **Theo dõi** là thứ biến app từ máy sinh gợi ý thành thứ tự biết mình đúng bao nhiêu.

Thấy gợi ý nào đáng thì bấm **Theo dõi** dưới nó. Sáu tuần sau quay lại đánh dấu Ăn hoặc Không ăn. Sau vài tháng bạn có tỉ lệ đúng thật, chia theo nguồn.

Không có bước này thì sau nửa năm bạn vẫn không biết tool đúng 1 trên 10 hay 1 trên 50, và không biết nguồn nào đáng giữ.

## Bốn tầng thời điểm

Mỗi chủ đề được chấm 0–3 điểm, mỗi tầng một điểm:

| Tầng | Ý nghĩa | Cách tính |
|---|---|---|
| Đang nóng | từ 3 bài trở lên trong cửa sổ thời gian | đếm bài |
| Sự kiện sắp tới | từ khoá khớp một mục trong lịch, trong 10 tuần tới | so khớp chuỗi |
| Cao hơn cùng kỳ | nhiều hơn 1,3 lần so với cùng tuần năm ngoái | kho lưu trữ nội bộ |
| Bền bỉ | chủ đề nhắc lại ở lần chạy trước | đối chiếu 8 lần gần nhất |

Tầng bền bỉ là tầng hữu ích nhất trong vài tháng đầu, vì nó chạy được ngay từ lần thứ hai. Chủ đề xuất hiện một lần rồi biến mất thường là nhiễu; nhắc lại nhiều tuần liên tiếp mới là tín hiệu.

**Điểm số do mã tính, không do Claude tính.** Claude chỉ trích xuất, không chấm điểm. Chạy hai lần trên cùng dữ liệu thì điểm giống nhau, nên bạn so sánh được giữa các tuần.

---

## Phát hành cho nhiều team

Bốn team S1–S4, mỗi team một bản riêng, dữ liệu không trộn.

### Ranh giới được thi hành thế nào

Admin triển khai **một Apps Script** giữ bản đồ token → Sheet. Mỗi bản phát hành mang một token riêng.

Sheet ID nằm trong script trên máy chủ Google. **App không biết Sheet nào.** Token chỉ mở được đúng một việc: ghi vào tab của team đó.

Đây là lý do cách này chặt hơn service account: khoá service account bị trích ra thì dùng được toàn bộ Sheets API trên Sheet đó. Token bị trích ra thì không đọc được gì, không xoá được gì khác, chỉ ghi đè đúng tab vốn đã của họ.

Kho lưu trữ cũng tách theo team (`archive-S1.json`), vì dùng chung sẽ lộ team khác đang theo đuổi từ khoá gì.

Thu hồi một team: xoá dòng của họ trong `TEAMS` rồi deploy lại script. Không cần đụng vào máy họ.

### Chuẩn bị một lần

**Trong repo chỉ có `Code.example.gs`.** Bản có token thật là `Code.gs`, đã bị `.gitignore` chặn. Chép ra rồi điền:

```
cp apps-script/Code.example.gs apps-script/Code.gs
```

1. Tạo 4 Google Sheet.
2. Mở **script.google.com**, tạo project, dán nội dung `Code.gs` của bạn.
3. Sinh 4 token: `openssl rand -hex 24`. Điền `TEAMS` với token và Sheet ID tương ứng.
4. **Deploy → New deployment → Web app.** Chọn *Execute as: Me* và *Who has access: Anyone*. Copy địa chỉ.
5. Đưa vào GitHub Secrets `TEAM_S1` ... `TEAM_S4`, mỗi cái là một JSON:

```json
{"webAppUrl": "https://script.google.com/macros/s/.../exec", "token": "token-cua-team-do"}
```

Kiểm tra đã deploy đúng: mở địa chỉ Web App bằng trình duyệt, phải thấy `{"ok":true,"service":"Radar sheet writer"}`.

**Không cần Google Cloud, không cần service account, không có màn hình OAuth consent.**

Lưu ý khi sửa script về sau: **Deploy → Manage deployments → sửa bản cũ → chọn "New version"**. Nếu tạo deployment mới thì địa chỉ đổi và bốn bản app đang chạy sẽ hỏng.

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

### Cập nhật mã lên GitHub

```
cd ~/radar
unzip -o ~/Downloads/radar-update.zip
git add -A
git status
```

**Đọc danh sách trước khi commit.** Không được có `Code.gs`, `secret.json`, `node_modules` hay `dist`. Có là dừng lại.

Kiểm tra bằng chính token của bạn cho chắc:

```
git grep -l "token-cua-ban" --cached
```

Không ra gì là sạch. Rồi:

```
git commit -m "Mô tả thay đổi"
git push
```

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

Sheet được định dạng để quét bằng mắt: đóng băng hàng tiêu đề và cột Ngách, kẻ vạch đậm giữa các ngách, tô đậm dần theo điểm, bật bộ lọc sẵn, và giãn cột theo độ dài nội dung.

Cột **câu trích** dùng chữ có chân trên nền sáng hơn — cùng nguyên tắc như trong app: lời khách là bằng chứng, phần còn lại là diễn giải.

Một dòng cho mỗi sản phẩm đề xuất, thông tin chủ đề lặp lại ở mỗi dòng để bạn lọc và sắp xếp được. Chủ đề không có đề xuất nào vẫn được một dòng, để nó không biến mất khỏi bảng.

14 cột: ngày chạy, điểm, chủ đề, vấn đề, ba cột tín hiệu, số bài, sự kiện khớp, sản phẩm, vì sao, câu trích làm căn cứ, rủi ro, nguồn.

Cột **câu trích làm căn cứ** là cột đáng đọc nhất. Nếu nó trống hoặc không liên quan tới sản phẩm bên cạnh, đó là dấu hiệu đề xuất đó không có gì đỡ.

---

## Giới hạn cần biết trước

**Tầng cùng kỳ trống trong năm đầu.** Không có API Google Trends công khai, nên Radar tự dựng kho lưu trữ: mỗi lần chạy ghi lại tần suất từ khoá của tuần đó. Tầng này chỉ trả lời được khi đã có dữ liệu cùng tuần năm ngoái. Trong lúc đó nó hiện "chưa có dữ liệu" thay vì đoán bừa. Chạy đều hàng tuần thì sau một năm nó bắt đầu có giá trị.

**Chỉ 6 subreddit mỗi ngách, 14 trang web.** Reddit siết rất mạnh với truy cập không đăng nhập, nên mỗi lần gọi đều đắt. Trước đây 12 sub mỗi ngách nhân ba ngách là 36 lần gọi trong vài phút — vượt xa hạn mức và tự gây ra chính vấn đề. Trang web gần như không bị chặn nên đề xuất rộng tay hơn.

**Giãn cách tự tăng khi bị siết.** Ba lần bị chặn liên tiếp thì Radar tự cộng thêm 3 giây vào giãn cách, tối đa 12 giây, và giảm lại khi lấy được. Không phải chỉnh tay giữa chừng.

**Ba lần thử mỗi địa chỉ, rồi mới sang `old.reddit.com`.** Mô phỏng với tỉ lệ thành công 1 trên 4 cho thấy cách này lấy được cả 5 trên 5 nguồn. Đổi lại là chậm — đó là đánh đổi có chủ ý.

**Reddit siết tốc độ bằng trang HTML, không phải mã 429.** Khi bị siết, Reddit trả về một trang web kèm mã 200 chứ không phải mã lỗi. Radar nhận diện trang đó theo nội dung và chờ 45 giây rồi thử lại, thay vì tưởng nhầm là nguồn vắng.

**Feed đã tải ở bước kiểm chứng không tải lại.** Trước đây mỗi nguồn bị gọi hai lần: một lần lúc kiểm chứng, một lần lúc thu thập. Đó là lý do chính khiến Reddit siết. Giờ bước thu thập dùng lại dữ liệu vừa lấy, cắt một nửa số lần gọi.

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
