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

Mẫu Apps Script (Code.gs) — hỗ trợ JSON và form-urlencoded (khuyên dùng form-urlencoded để tránh CORS preflight):
```javascript
function doPost(e) {
  const ss = SpreadsheetApp.openById('YOUR_SHEET_ID');
  const sh = ss.getSheetByName('Sheet1');

  let rows = [];
  try {
    if (e.postData && e.postData.type && e.postData.type.indexOf('application/json') !== -1) {
      const body = JSON.parse(e.postData.contents || '{}');
      rows = (body.rows || []);
    } else if (e.parameter && e.parameter.rows) {
      rows = JSON.parse(e.parameter.rows);
    }
  } catch(err) {
    rows = [];
  }

  const toAppend = rows.map(r => [new Date(), r.word || '', r.definitions || '']);
  if (toAppend.length) {
    sh.getRange(sh.getLastRow()+1, 1, toAppend.length, 3).setValues(toAppend);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, appended: toAppend.length }))
    .setMimeType(ContentService.MimeType.JSON);
}
```
Triển khai: Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone (hoặc Anyone with the link) → Deploy. Copy "Web app URL" và dán vào app.

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
