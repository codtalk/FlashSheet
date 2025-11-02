# LearnEnglish (Simple Flashcard Web App)

Ứng dụng web đơn giản giúp học từ vựng tiếng Anh qua flashcard, chỉ dùng HTML/CSS/JS thuần.

## Tính năng
- 2 trang:
  - `index.html`: Trang học (flashcard). Chế độ nhập đáp án, trắc nghiệm, hoặc trộn; câu hỏi ngẫu nhiên; hiệu ứng khi trả lời đúng (confetti, glow). Theo dõi số câu đúng/sai.
  - `admin.html`: Trang nhập dữ liệu. Thêm nhiều mô tả (định nghĩa) cho một từ, nhập/xuất JSON, lưu Local Storage.
- Dữ liệu lưu:
  - Ưu tiên Local Storage trình duyệt (không cần server).
  - Có thể nhập file JSON (đặt vào thư mục `data/vocab.json`) hoặc dùng nút tải JSON.
- Thiết kế giao diện hiện đại, dễ nhìn, có animation nhỏ.

## Cấu trúc
```
learnEnglish/
├─ index.html        # Trang học
├─ admin.html        # Trang nhập liệu
├─ assets/
│  ├─ css/styles.css
│  └─ js/{utils.js, admin.js, learn.js}
└─ data/vocab.json   # Dữ liệu mẫu
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

## Định dạng dữ liệu
```json
[
  { "word": "apple", "definitions": ["A round fruit...", "Quả táo"] },
  { "word": "run",   "definitions": ["To move quickly...", "Chạy"] }
]
```

Hoặc CSV (đơn giản) với một trong các dạng:

```
# Có tiêu đề, cột definitions ngăn bởi ; hoặc |
word,definitions
apple,A round fruit;Quả táo
run,To move quickly|Chạy

# Không tiêu đề: cột 1 là từ, các cột sau là định nghĩa
apple,A round fruit,Quả táo
```

## Gợi ý sử dụng
- Vào `admin.html` để thêm/sửa bộ từ (mặc định lưu Local Storage nếu chưa cấu hình Sheet).
- Dùng "Đồng bộ (Sheet ↔ Local)" để tải từ Sheet về (hợp nhất) và đẩy các mục mới từ Local lên Sheet (không xoá dữ liệu ở hai phía).
- Trên `index.html` có thể bấm "Tải từ Sheet" để nạp ngay dữ liệu mới.

## Đồng bộ giữa các thiết bị (Google Sheet)

Ứng dụng chỉ dùng Google Sheet để đồng bộ hoá, không cần server riêng:

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

Mẫu Apps Script (Code.gs) — ghi từ vào 'Sheet1' và góp ý vào 'Feedback' (khuyên dùng form-urlencoded để tránh CORS preflight):
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
      var defs = (r.definition !== undefined ? r.definition : (Array.isArray(r) ? r[1] : (r.definitions || ''))) || '';
      if (Array.isArray(defs)) defs = defs.join('; ');
      var isFeedback = (r.type && String(r.type).toLowerCase() === 'feedback') || word === '[feedback]';
      if (isFeedback) {
        var msg = (r.message !== undefined ? r.message : defs) || '';
        var ctx = r.ctx || '';
        var user = r.user || '';
        fbValues.push([now, user, msg, ctx]);
      } else {
        mainValues.push([now, word, defs]);
      }
    });

    if (mainValues.length){
      if (main.getLastRow() === 0) main.appendRow(['timestamp','word','definition']);
      main.getRange(main.getLastRow()+1, 1, mainValues.length, 3).setValues(mainValues);
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
  --data-urlencode 'rows=[{"word":"test","definitions":"a; b"}]' \
  'YOUR_WEB_APP_URL'
```
Nếu trả 200/ok thì Web App nhận tốt.

## Ghi chú
- Nút "Lưu vào thư mục data" dùng File System Access API (Chrome/Edge). Safari hiện chưa hỗ trợ.
- Nếu bạn muốn dùng Excel, hãy xuất ra CSV rồi dùng công cụ chuyển thành JSON theo định dạng trên.

Tính năng bổ xung sau:
- Tích hợp ai đọc từ; cụm;
