# FlashSheet — Learn English (Supabase Edition)

Ứng dụng web đơn giản giúp học từ vựng tiếng Anh qua flashcard (HTML/CSS/JS thuần) — nay dùng Supabase làm nguồn dữ liệu duy nhất (không còn Google Sheet/App Script).

## Tính năng chính
- study.html — Học từ với flashcard (lật thẻ, ví dụ, POS, phát âm TTS)
- index.html — Luyện tập (nhập đáp án, trắc nghiệm, trộn), SRS tự động sau mỗi câu trả lời, đếm đúng/sai, âm thanh phản hồi
- admin.html — Nhập từ trực tiếp (lưu vào Supabase), dán nhanh TSV/CSV để nhập hàng loạt, cấu hình SRS (giới hạn mỗi ngày)
- feedback.html — Xem góp ý từ bảng `feedback` trên Supabase

## Kiến trúc dữ liệu (Supabase)
Sử dụng REST API của Supabase (PostgREST) với khóa anon. Các bảng mặc định:

- words_shared
  - word text primary key
  - meanings_text text      # danh sách nghĩa (ngăn bởi ;)
  - examples_text text      # ví dụ tiếng Anh (ngăn bởi ;)
  - pos text                # nhãn loại từ ngắn (n., v., adj., ...)
  - addedat bigint          # thời điểm thêm (epoch ms)
  - reps integer            # số lần ôn
  - lapses integer          # số lần quên
  - ease real               # hệ số SM-2
  - interval bigint         # khoảng cách (ngày)
  - due bigint              # hạn ôn (epoch ms)
  - lastreview bigint       # lần ôn cuối (epoch ms)
  - selectedforstudy text   # tuỳ chọn, KHÔNG dùng trong app (app lọc theo srs_user theo từng user)

- srs_user
  - user text
  - word text
  - addedat bigint
  - reps integer
  - lapses integer
  - ease real
  - interval bigint
  - due bigint
  - lastreview bigint
  - primary key (user, word)

- users
  - username text primary key (unique)
  - created_at timestamptz NOT NULL DEFAULT now()
  - streak_count integer NOT NULL DEFAULT 0    # chuỗi ngày liên tiếp hiện tại
  - best_streak integer NOT NULL DEFAULT 0     # kỷ lục chuỗi ngày
  - last_active timestamptz                    # lần hoạt động gần nhất (cập nhật khi mở app)
  - new_words_today integer NOT NULL DEFAULT 0 # số từ mới đã bắt đầu hôm nay
  - new_words_date date                        # ngày tương ứng với bộ đếm từ mới
  - reviews_today integer NOT NULL DEFAULT 0   # số lượt ôn hôm nay
  - reviews_date date                          # ngày tương ứng bộ đếm ôn
  - reviewed_words_today jsonb                 # mảng từ đã ôn hôm nay
  - daily_review_limit integer                 # giới hạn ôn/ngày (NULL hoặc 0 = không giới hạn)

- feedback
  - id uuid default gen_random_uuid() primary key
  - message text
  - ctx text
  - user text
  - created_at timestamptz default now()

SQL tham khảo để khởi tạo nhanh (chỉnh schema nếu cần):

```sql
create table if not exists public.words_shared (
  word text primary key,
  meanings_text text,
  examples_text text,
  pos text,
  addedat bigint,
  reps integer,
  lapses integer,
  ease real,
  interval bigint,
  due bigint,
  lastreview bigint,
  selectedforstudy text
);

create table if not exists public.srs_user (
  "user" text not null,
  word text not null,
  addedat bigint,
  reps integer,
  lapses integer,
  ease real,
  interval bigint,
  due bigint,
  lastreview bigint,
  primary key ("user", word),
  constraint srs_user_word_fkey foreign key (word) references words_shared (word) on delete cascade
);

create table if not exists public.users (
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  streak_count integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_active timestamptz,
  new_words_today integer NOT NULL DEFAULT 0,
  new_words_date date,
  reviews_today integer NOT NULL DEFAULT 0,
  reviews_date date,
  reviewed_words_today jsonb,
  daily_review_limit integer,
  constraint users_pkey primary key (username),
  constraint users_username_key unique (username)
);

-- Nếu nâng cấp từ phiên bản cũ (các cột streak có thể NULL) chạy:
-- ALTER TABLE public.users ALTER COLUMN streak_count SET DEFAULT 0;
-- ALTER TABLE public.users ALTER COLUMN streak_count SET NOT NULL;
-- ALTER TABLE public.users ALTER COLUMN best_streak SET DEFAULT 0;
-- ALTER TABLE public.users ALTER COLUMN best_streak SET NOT NULL;
-- ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username); -- nếu chưa có

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  message text,
  ctx text,
  "user" text,
  created_at timestamptz default now()
);

-- Chính sách RLS (ví dụ: cho phép đọc/ghi public anon)
alter table public.words_shared enable row level security;
alter table public.srs_user enable row level security;
alter table public.feedback enable row level security;
alter table public.users enable row level security;

create policy anon_read_words on public.words_shared for select using (true);
create policy anon_upsert_words on public.words_shared for insert with check (true);
create policy anon_update_words on public.words_shared for update using (true) with check (true);

create policy anon_read_srs on public.srs_user for select using (true);
create policy anon_upsert_srs on public.srs_user for insert with check (true);
create policy anon_update_srs on public.srs_user for update using (true) with check (true);

create policy anon_read_feedback on public.feedback for select using (true);
create policy anon_insert_feedback on public.feedback for insert with check (true);

create policy anon_read_users on public.users for select using (true);
create policy anon_upsert_users on public.users for insert with check (true);
create policy anon_update_users on public.users for update using (true) with check (true);
```

Lưu ý: Tùy nhu cầu bảo mật, bạn có thể siết RLS và dùng Auth — ví dụ ràng buộc theo `auth.uid()` thay cho public anon.

## Cấu hình
Sửa `assets/js/config.js`:

- DATA_SOURCE: 'supabase'
- SUPABASE_URL, SUPABASE_ANON_KEY: lấy từ Supabase Project Settings → API
- SUPABASE_WORDS_TABLE, SUPABASE_SRS_TABLE, SUPABASE_FEEDBACK_TABLE: tên bảng nếu bạn tuỳ biến

App sử dụng REST API trực tiếp, không phụ thuộc thư viện supabase-js.

## Chạy trên máy

```bash
cd /Users/thien/Documents/codtalk/learnEnglish
python3 -m http.server 8000
# Mở http://localhost:8000
```

## Nhập dữ liệu nhanh (admin.html)
- Nhập từ: điền Từ vựng, định nghĩa (nhiều dòng), ví dụ (tuỳ chọn), Lưu → dữ liệu được upsert vào `words_shared`
- Dán nhanh: dán TSV/CSV (cột 2: từ, cột 4: nghĩa "a; b", cột 5: ví dụ "ex1; ex2") → Nhập → upsert hàng loạt

## SRS (tự động)
- Khi trả lời trên `index.html`, app tự tính lịch (SM-2 rút gọn) và ghi tiến độ vào `srs_user` (khóa phức hợp `user, word`)
- Username lưu ở LocalStorage (không có đăng nhập). Bạn có thể thêm Auth của Supabase nếu cần.

## Góp ý (feedback.html)
- Danh sách góp ý đọc trực tiếp từ `feedback` (order by created_at desc)
- Nút Góp ý trên trang luyện tập gửi vào `feedback` (nếu mất mạng sẽ buffer và gửi lại sau)

## Gỡ bỏ Google Sheet/App Script
- Toàn bộ UI và mã liên quan Sheet đã được xoá khỏi `admin.html`, `index.html`, và JS.
- Nếu thư mục `apps_script/` còn tồn tại trong repo của bạn, có thể xoá thủ công vì không còn dùng.

## Giấy phép
MIT.
