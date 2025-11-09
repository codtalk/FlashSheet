# LearnEnglish (Simple Flashcard Web App)

Ứng dụng web đơn giản giúp học từ vựng tiếng Anh qua flashcard, chỉ dùng HTML/CSS/JS thuần.

## Tính năng
- 3 trang chính:
  - `study.html`: Tab "Học từ" — Xem flash card 2 mặt. Mặt trước: từ + các định nghĩa (và hình nếu có). Mặt sau: dịch và giải thích (ví dụ). Nhấp để lật; dùng Trước/Sau để chuyển thẻ; có nút Trộn thứ tự.
  - `index.html`: Tab "Luyện tập" — Ôn tập với chế độ nhập đáp án, trắc nghiệm, hoặc trộn; câu hỏi ngẫu nhiên; hiệu ứng khi trả lời đúng (confetti, glow). Theo dõi số câu đúng/sai.
  - `admin.html`: Tab "Nhập dữ liệu" — Thêm nhiều mô tả (định nghĩa) cho một từ, đồng bộ Google Sheet.
- Dữ liệu lưu:
 - Dữ liệu lưu:
  - Google Sheet (CSV) là nguồn dữ liệu duy nhất/ưu tiên. Ứng dụng sẽ tải dữ liệu từ Sheet khi mở.
  - (SRS được đồng bộ qua Google Sheet; không cần Excel thủ công.)
- Thiết kế giao diện hiện đại, dễ nhìn, có animation nhỏ.
### Học ngắt quãng (SRS giống Anki)
Trang `index.html` (Luyện tập) sau khi bạn trả lời sẽ hiển thị 4 nút chất lượng nhớ:

| Mức | Ý nghĩa | Nội bộ SM-2 |
|-----|---------|------------|
| Again | Quên hoàn toàn / sai | quality = 0 → lên lịch lại sau ~10 phút |
| Hard  | Nhớ khó khăn         | quality = 2 |
| Good  | Nhớ bình thường      | quality = 4 |
| Easy  | Rất dễ / tự tin      | quality = 5 |

Thuật toán (SM-2 rút gọn):
1. Mỗi thẻ có: `addedAt, reps, lapses, ease (EF), interval (days), due, lastReview`.
2. Nếu quality < 3: đặt `reps = 0`, tăng `lapses`, `interval = 1 ngày`, `due = now + 10 phút` (ôn nóng).
3. Nếu quality ≥ 3:
  - `interval = 1` (lần đầu) → `6` (lần thứ hai) → sau đó `interval = round(interval * ease)`.
  - Cập nhật `ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality)*0.02)))`.
4. `due = now + interval * 1 ngày` (hoặc 10 phút với Again).

Hàng ngày khi mở trang, app tạo hàng đợi: thẻ đến hạn (due <= hiện tại) trước, sau đó thêm tối đa X từ mới (chưa từng ôn) theo giới hạn bạn đặt ở `admin.html` → “Cài đặt SRS”. Các thẻ mới khi được ôn lần đầu sẽ nhận `addedAt` và vào vòng lặp SRS.

Bạn có thể chỉnh:
- Số từ mới mỗi ngày (`fs_srs_daily_new_limit`).
- Giới hạn số ôn lại mỗi ngày (`fs_srs_daily_review_limit` — hiện chưa chặn cứng, dành cho thống kê về sau).

Lưu ý: Trạng thái SRS có thể được lưu/đọc trực tiếp từ Google Sheet nếu bạn thêm các cột tương ứng (`addedAt, reps, lapses, ease, interval, due, lastReview`) trong Sheet và Apps Script sẽ đọc/ghi các cột này.

 - Âm thanh phản hồi: phát ngẫu nhiên một âm từ thư mục `sounds/trues/` (đúng) hoặc `sounds/falses/` (sai).
 - TTS (đọc to): chỉ đọc từ/câu tiếng Anh, không đọc phần dịch tiếng Việt.
 - TTS:
   - Nút “🔈 Nghe lại”: chỉ đọc lại từ đáp án (tiếng Anh), không đọc câu.
   - Nút “🌐 Dịch & đọc câu”: ghép đáp án vào câu hỏi tiếng Anh, đọc nguyên câu và (nếu cấu hình) dịch câu ngay trong trang.
- Nút “🌐 Dịch & đọc câu”: sau khi trả lời, nếu câu hỏi là tiếng Anh, bấm để app tự chèn đáp án vào chỗ trống, đọc nguyên câu và hiển thị phần dịch tham khảo ngay trong trang (không chuyển trang).
 - Dịch câu đầy đủ: nếu cấu hình thêm “Apps Script Translate URL”, app sẽ dịch máy cả câu đầy đủ và hiển thị trực tiếp dưới phần trả lời.

## Cấu trúc
```
learnEnglish/
├─ study.html        # Tab Học từ (flashcard lật)
├─ index.html        # Tab Luyện tập (quiz)
├─ admin.html        # Tab Nhập liệu & Đồng bộ
├─ feedback.html     # Tab Góp ý (chỉ-đọc)
├─ guide.html        # Tab Hướng dẫn
├─ assets/
│  ├─ css/styles.css
│  └─ js/{utils.js, admin.js, learn.js, study.js}
└─ data/vocab.json   # Dữ liệu mẫu
└─ (no local data file) — ứng dụng tải dữ liệu từ Google Sheet
```

## Chạy trên máy
Vì trình duyệt chặn `fetch` file khi mở trực tiếp (file://), hãy chạy server tĩnh đơn giản:

```bash
# Python 3
cd /Users/thien/Documents/codtalk/learnEnglish
python3 -m http.server 8000
# Mở http://localhost:8000 trong trình duyệt
```

Hoặc dùng bất kỳ server tĩnh nào bạn quen dùng.

Lưu ý: Trình duyệt có thể yêu cầu tương tác người dùng trước khi cho phép phát âm thanh/TTS. Hãy click một nút bất kỳ trên trang trước.

## Định dạng dữ liệu
```json
[
  { "word": "apple", "meanings": ["A round fruit...", "Quả táo"] },
  { "word": "run",   "meanings": ["To move quickly...", "Chạy"] }
]
```

Hoặc CSV (đơn giản) với một trong các dạng:

```
# Có tiêu đề, cột meanings ngăn bởi ; hoặc |
word,meanings
apple,A round fruit;Quả táo
run,To move quickly|Chạy

# Không tiêu đề: cột 1 là từ, các cột sau là nghĩa/giải thích
apple,A round fruit,Quả táo
```

## Gợi ý sử dụng
- Vào `admin.html` để thêm/sửa bộ từ (mặc định lưu Local Storage nếu chưa cấu hình Sheet).
- Dùng "Đồng bộ (Sheet ↔ Local)" để tải từ Sheet về (hợp nhất) và đẩy các mục mới từ Local lên Sheet (không xoá dữ liệu ở hai phía).
- Trên `index.html` (Luyện tập) có thể bấm "Tải từ Sheet" để nạp ngay dữ liệu mới.
- Trên `study.html` (Học từ), nhấp vào thẻ để lật, dùng nút Trước/Sau để chuyển thẻ; bấm Trộn để xáo thứ tự.
 - Nút "🔈 Nghe" trên `study.html` ưu tiên dùng Web Speech (trên Chrome/Safari). Nếu môi trường chặn, bạn có thể cấu hình "Apps Script TTS URL" trong `admin.html` để dùng fallback audio qua endpoint của bạn.

## Đồng bộ giữa các thiết bị (Google Sheet)

Ứng dụng dùng Google Sheet để đồng bộ hoá từ vựng cơ bản (word + meanings). Ứng dụng cũng hỗ trợ đọc/ghi các cột trạng thái SRS (`addedAt, reps, lapses, ease, interval, due, lastReview`) nếu Apps Script của bạn được cấu hình để lưu các cột này — do đó không cần làm thủ công qua Excel.

1) Đọc tự động từ Google Sheet (CSV)
- Trong Google Sheets: File → Share → Publish to web → chọn sheet cụ thể → định dạng CSV → Publish → Copy URL (dạng ...&output=csv, không có dấu ";" ở cuối).
- Mở `admin.html` → phần "Đồng bộ Google Sheet" → dán URL vào ô "CSV URL".
- (Tuỳ chọn) Tick "Tự động tải từ Sheet khi mở trang học" và đặt "Khoảng làm mới (giây)" để index.html luôn cập nhật.

2) Ghi tự động vào Google Sheet (append)
- Trong Google Sheets: Extensions → Apps Script → tạo Web App nhận POST để ghi vào sheet (mã mẫu bên dưới).
- Deploy: Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone (hoặc Anyone with the link) → Deploy → Copy "Web app URL".
- Dán URL đó vào ô "Apps Script Write URL" trong `admin.html` và bấm "Lưu cấu hình".
- Từ giờ, mỗi lần bấm "Lưu vào trình duyệt" khi thêm từ mới, app sẽ tự gửi lên Sheet.

3) Đồng bộ 2 chiều (không xoá dữ liệu)
- Trong `admin.html`, bấm "Đồng bộ (Sheet ↔ Local)":
  - App tải dữ liệu từ Sheet về và hợp nhất với Local theo quy tắc: gộp theo từ (không phân biệt hoa thường), hợp nhất các định nghĩa (bỏ trùng).
  - App tính phần chênh: những định nghĩa ở Local mà Sheet chưa có → đẩy lên Sheet bằng các dòng append mới (không xoá gì trên Sheet).
  - Kết quả: Cả hai phía đều tăng thêm dữ liệu mới, không mất chữ.

Mẫu Apps Script (Code.gs) — ghi từ vào 'Sheet1' và góp ý vào 'Feedback' (khuyên dùng form-urlencoded để tránh CORS preflight). Muốn mở rộng để lưu SRS bạn có thể thêm các cột (`addedAt, reps, lapses, ease, interval, due, lastReview`) và ghi chúng khi POST gửi đầy đủ.
```javascript
function doPost(e) {
  try {
    var MAIN_SHEET = 'Sheet1';
    var FEEDBACK_SHEET = 'Feedback';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var main = ss.getSheetByName(MAIN_SHEET) || ss.getSheets()[0];
    var fb = ss.getSheetByName(FEEDBACK_SHEET) || ss.insertSheet(FEEDBACK_SHEET);

    var rowsParam = e && e.parameter && e.parameter.rows ? e.parameter.rows : null;
    if (!rowsParam) return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Missing rows' })).setMimeType(ContentService.MimeType.JSON);
    var rows = JSON.parse(rowsParam);
    if (!Array.isArray(rows)) return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'rows must be array' })).setMimeType(ContentService.MimeType.JSON);

    var now = new Date();
    var mainValues = [];
    var fbValues = [];
    rows.forEach(function(r){
      var word = (r.word !== undefined ? r.word : (Array.isArray(r) ? r[0] : '')) || '';
    var defs = (r.meanings !== undefined ? r.meanings : (Array.isArray(r) ? r[1] : '')) || '';
      if (Array.isArray(defs)) defs = defs.join('; ');
      var isFeedback = (r.type && String(r.type).toLowerCase() === 'feedback') || word === '[feedback]';
      if (isFeedback) {
        var msg = (r.message !== undefined ? r.message : defs) || '';
        var ctx = r.ctx || '';
        var user = r.user || '';
        fbValues.push([now, user, msg, ctx]);
      } else {
        // Accept optional SRS fields from client and write them as extra columns
        var addedAt = r.addedAt !== undefined ? r.addedAt : '';
        var reps = r.reps !== undefined ? r.reps : '';
        var lapses = r.lapses !== undefined ? r.lapses : '';
        var ease = r.ease !== undefined ? r.ease : '';
        var interval = r.interval !== undefined ? r.interval : '';
        var due = r.due !== undefined ? r.due : '';
        var lastReview = r.lastReview !== undefined ? r.lastReview : '';
        mainValues.push([now, word, defs, addedAt, reps, lapses, ease, interval, due, lastReview]);
      }
    });

    if (mainValues.length){
  if (main.getLastRow() === 0) main.appendRow(['timestamp','word','meanings','addedAt','reps','lapses','ease','interval','due','lastReview']);
      main.getRange(main.getLastRow()+1, 1, mainValues.length, 10).setValues(mainValues);
    }
    if (fbValues.length){
      if (fb.getLastRow() === 0) fb.appendRow(['timestamp','user','message','context']);
      fb.getRange(fb.getLastRow()+1, 1, fbValues.length, 4).setValues(fbValues);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok:true, appendedMain: mainValues.length, appendedFeedback: fbValues.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```
Triển khai: Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone (hoặc Anyone with the link) → Deploy. Copy "Web app URL" và dán vào app. Khi cập nhật mã, vào Manage deployments → Edit → chọn New version → Deploy (không cần tạo endpoint thứ hai cho góp ý).

4) Góp ý (feedback) cố định về sheet trung tâm
- App đã cấu hình sẵn endpoint góp ý trung tâm trong code, người dùng không cần nhập URL.
- Dữ liệu góp ý được gửi bằng type='feedback' (hoặc word='[feedback]') và sẽ ghi vào sheet 'Feedback' của hệ thống trung tâm.
- Nếu đang offline hoặc lỗi mạng, góp ý sẽ lưu tạm trên Local Storage và tự gửi lại khi có kết nối.

3) Kiểm tra nhanh và khắc phục sự cố
- Lần đầu mở Web App URL có thể thấy cảnh báo "Google hasn’t verified this app" → bấm Advanced → Go to ... (unsafe) → Allow (chỉ cần chủ dự án thực hiện lần đầu).
- Kiểm tra gửi từ trình duyệt bị CORS: ứng dụng đã gửi ở dạng form-urlencoded để tránh preflight; nếu vẫn không đọc được phản hồi, ứng dụng dùng fallback no-cors (yêu cầu vẫn tới server). Kiểm tra trực tiếp trên Sheet hoặc vào Apps Script → Executions để xem log.
- Test bằng terminal (bỏ qua CORS):
```bash
curl -v -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'rows=[{"word":"test","meanings":"a; b"}]' \
  'YOUR_WEB_APP_URL'
```
Nếu trả 200/ok thì Web App nhận tốt.

## Ghi chú
- Nút "Lưu vào thư mục data" dùng File System Access API (Chrome/Edge). Safari hiện chưa hỗ trợ.
- Nếu bạn muốn đồng bộ trạng thái SRS, hãy cấu hình Apps Script để chấp nhận các cột SRS (xem mẫu ở trên).

### Tuỳ biến âm thanh phản hồi
- Thêm/xoá file trong `sounds/trues/` (âm đúng) hoặc `sounds/falses/` (âm sai). Ứng dụng sẽ chọn ngẫu nhiên mỗi lần trả lời.
- Hỗ trợ .mp3/.wav phổ biến. Nếu muốn tắt âm, hãy tắt âm lượng tab trình duyệt hoặc chỉnh hệ thống.

### Dịch câu đầy đủ (tuỳ chọn, online)
Bạn có thể dùng Apps Script để cung cấp endpoint dịch máy đơn giản (EN→VI). Thêm URL đó vào `admin.html` → “Apps Script Translate URL”.

Mẫu Apps Script (Code.gs):
```javascript
function doPost(e){
  try{
    var text = e.parameter && e.parameter.text || '';
    var sl = e.parameter && e.parameter.sl || 'en';
    var tl = e.parameter && e.parameter.tl || 'vi';
    if (!text) return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Missing text' })).setMimeType(ContentService.MimeType.JSON);
    // Yêu cầu bật Advanced Service: Google Cloud Translation API (hoặc dùng LanguageApp.translate đơn giản)
    var out = LanguageApp.translate(text, sl, tl);
    return ContentService.createTextOutput(JSON.stringify({ ok:true, text: out }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin','*');
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin','*');
  }
}
```
Triển khai: Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone → Deploy. Dán URL vào ô tương ứng. Lưu ý: API này là online; nếu không cấu hình, app sẽ không dịch máy câu đầy đủ mà chỉ hiển thị “Đang dịch…” rồi “(Không dịch được)”.

Tính năng bổ xung sau:
- Tích hợp ai đọc từ; cụm;
 - Đồng bộ trực tiếp trạng thái SRS qua Google Sheet (thêm Apps Script đọc/ghi đầy đủ cột)
 - Bộ phân tích thống kê: số ôn lại/ngày, đường cong nhớ, dự báo khối lượng hôm sau.
