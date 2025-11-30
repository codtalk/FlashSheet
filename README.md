# Cardcard — Learn English (Supabase Edition)

Ứng dụng web đơn giản giúp học từ vựng tiếng Anh qua Cardcard (HTML/CSS/JS thuần) — nay dùng Supabase làm nguồn dữ liệu duy nhất (không còn Google Sheet/App Script).

## Tính năng chính
- study.html — Học từ với Cardcard (lật thẻ, ví dụ, POS, phát âm TTS)
- index.html — Luyện tập (nhập đáp án, trắc nghiệm, trộn), SRS tự động sau mỗi câu trả lời, đếm đúng/sai, âm thanh phản hồi
# Cardcard — Learn English

README này mô tả đầy đủ cách khởi tạo cơ sở dữ liệu Postgres (Supabase) cho ứng dụng học từ vựng Cardcard, bao gồm: bảng, chỉ mục, RLS policies, grants, triggers gợi ý, và script idempotent. Mục tiêu: chạy một lần hoặc nhiều lần không gây lỗi, giúp nâng cấp schema an toàn.

## Mục tiêu hệ thống
- Quản lý từ vựng chung (`words_shared`)
- Theo dõi lịch ôn theo từng người dùng (`srs_user`)
- Quản lý người dùng nhẹ (không Auth hoặc có thể mở rộng thành Auth) (`users`)
- Thu thập góp ý trong ứng dụng (`feedback`)

## Kiến trúc tổng quan
Front-end thuần HTML/CSS/JS, gọi trực tiếp REST API Supabase (PostgREST) với `anon` key. SRS dùng thuật toán SM‑2 rút gọn. Chưa dùng thư viện `@supabase/supabase-js` (có thể thêm sau).

## Quy ước dữ liệu chính
| Bảng | Mục đích | Khóa chính | Ghi chú |
|------|---------|------------|--------|
| words_shared | Kho từ vựng chung | word | Chứa metadata ôn cơ bản để seed hoặc dùng chung |
| srs_user | Trạng thái ôn từng user | (user, word) | Dữ liệu động thay đổi theo đánh giá |
| users | Hồ sơ nhẹ & streak | username | Có thể mở rộng thêm Auth sau |
| feedback | Góp ý từ người dùng | id (uuid) | Lưu msg + ngữ cảnh |

## Script khởi tạo toàn bộ (Idempotent)
Chạy toàn bộ trong Supabase SQL Editor. Supabase đã có các role nội bộ (`anon`, `authenticated`, `service_role`). Không cần tạo role mới, chỉ cần grants & policies.

```sql
-- =====================================================
-- Cardcard FULL SCHEMA SETUP (Idempotent)
-- =====================================================
-- Khuyến nghị: chạy từng khối nếu bạn muốn kiểm tra.

-- 0. Extensions (Supabase mặc định đã bật một số; kiểm tra trước)
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS uuid-ossp;      -- uuid_generate_v4() (dự phòng)

-- 1. Tables ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.words_shared (
  word              TEXT PRIMARY KEY,
  meanings_text     TEXT,            -- nghĩa phân tách bằng ;
  examples_text     TEXT,            -- ví dụ phân tách bằng ;
  pos               TEXT,            -- loại từ (n., v., adj., ...)
  addedat           BIGINT,          -- epoch ms
  reps              INTEGER,
  lapses            INTEGER,
  ease              REAL,
  interval          BIGINT,          -- ngày (hoặc ms tuỳ bạn)
  due               BIGINT,          -- epoch ms hạn ôn
  lastreview        BIGINT,
  selectedforstudy  TEXT             -- cột dự phòng (không dùng)
);

CREATE TABLE IF NOT EXISTS public.srs_user (
  "user"     TEXT NOT NULL,
  word       TEXT NOT NULL REFERENCES public.words_shared(word) ON DELETE CASCADE,
  addedat    BIGINT,
  reps       INTEGER,
  confirms   INTEGER,          -- số lần đúng xác nhận (đúng nhưng chưa lên cấp)
  lapses     INTEGER,
  ease       REAL,
  interval   BIGINT,
  due        BIGINT,
  lastreview BIGINT,
  PRIMARY KEY ("user", word)
);

CREATE TABLE IF NOT EXISTS public.users (
  username             TEXT PRIMARY KEY,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  streak_count         INTEGER NOT NULL DEFAULT 0,
  best_streak          INTEGER NOT NULL DEFAULT 0,
  last_active          TIMESTAMPTZ,
  new_words_today      INTEGER NOT NULL DEFAULT 0,
  new_words_date       DATE,
  reviews_today        INTEGER NOT NULL DEFAULT 0,
  reviews_date         DATE,
  reviewed_words_today JSONB,
  daily_review_limit   INTEGER,
  -- Cột dự phòng mở rộng
  attrs                JSONB
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message    TEXT,
  ctx        TEXT,
  "user"     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes -----------------------------------------------------
-- Unique index trên users (phòng trường hợp constraint bị drop ở môi trường cũ)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON public.users(username);
-- Truy vấn feedback mới nhất
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback(created_at DESC);
-- SRS truy vấn đến hạn
CREATE INDEX IF NOT EXISTS srs_user_due_idx ON public.srs_user(due);
-- Words tìm theo pos
CREATE INDEX IF NOT EXISTS words_shared_pos_idx ON public.words_shared(pos);

-- 3. Data Quality / Constraints ---------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_best_ge_streak') THEN
    ALTER TABLE public.users DROP CONSTRAINT users_best_ge_streak;
  END IF;
  ALTER TABLE public.users ADD CONSTRAINT users_best_ge_streak CHECK (best_streak >= streak_count);
END $$;

-- 4. RLS ENABLE --------------------------------------------------
ALTER TABLE public.words_shared ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.srs_user     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback     ENABLE ROW LEVEL SECURITY;

-- 5. Policies (open, sử dụng anon key) ---------------------------
-- Helper để drop nếu tồn tại
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('words_shared','srs_user','users','feedback') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP; END $$;

-- words_shared
CREATE POLICY anon_read_words   ON public.words_shared FOR SELECT USING (true);
CREATE POLICY anon_upsert_words ON public.words_shared FOR INSERT WITH CHECK (true);
CREATE POLICY anon_update_words ON public.words_shared FOR UPDATE USING (true) WITH CHECK (true);

-- srs_user
CREATE POLICY anon_read_srs     ON public.srs_user FOR SELECT USING (true);
CREATE POLICY anon_upsert_srs   ON public.srs_user FOR INSERT WITH CHECK (true);
CREATE POLICY anon_update_srs   ON public.srs_user FOR UPDATE USING (true) WITH CHECK (true);

-- users
CREATE POLICY anon_read_users   ON public.users FOR SELECT USING (true);
CREATE POLICY anon_upsert_users ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY anon_update_users ON public.users FOR UPDATE USING (true) WITH CHECK (true);

-- feedback
CREATE POLICY anon_read_feedback  ON public.feedback FOR SELECT USING (true);
CREATE POLICY anon_insert_feedback ON public.feedback FOR INSERT WITH CHECK (true);

-- 6. Grants ------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.words_shared TO anon;
GRANT SELECT, INSERT, UPDATE ON public.srs_user TO anon;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;
GRANT SELECT, INSERT ON public.feedback TO anon;

-- (Tuỳ chọn) Grant cho authenticated (nếu dùng Supabase Auth)
GRANT SELECT, INSERT, UPDATE ON public.words_shared TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.srs_user TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT ON public.feedback TO authenticated;

-- 7. (Optional) Trigger cập nhật streak theo last_active ---------
-- Có thể thêm sau: khi user hoạt động ngày mới => streak_count++ và best_streak cập nhật.
-- Giữ trống để tránh phức tạp trong bản tối giản.

-- 8. Kiểm tra trùng username (chỉ cảnh báo) ----------------------
SELECT username, COUNT(*) AS cnt FROM public.users GROUP BY username HAVING COUNT(*) > 1;

-- 9. Mẫu cập nhật streak thủ công --------------------------------
-- UPDATE public.users
--   SET streak_count = streak_count + 1,
--       best_streak  = GREATEST(best_streak, streak_count + 1),
--       last_active  = NOW()
-- WHERE username='demo';

-- 10. Mẫu insert feedback ---------------------------------------
-- INSERT INTO public.feedback(message, ctx, "user") VALUES ('Great app', 'index.html', 'demo');

-- END SCHEMA SETUP
```

## Nâng cấp lên mức bảo mật cao hơn
Khi bật Supabase Auth:
1. Thêm cột `user_id uuid DEFAULT auth.uid()` trong bảng cần ràng buộc.
2. Thay `USING (true)` bằng biểu thức `auth.uid() = user_id`.
3. Thu hẹp quyền của role `anon` chỉ còn SELECT hạn chế hoặc bỏ hẳn.

## Cấu hình Front-end
Sửa `assets/js/config.js`:
```js
export const DATA_SOURCE = 'supabase';
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
export const SUPABASE_WORDS_TABLE = 'words_shared';
export const SUPABASE_SRS_TABLE = 'srs_user';
export const SUPABASE_USERS_TABLE = 'users';
export const SUPABASE_FEEDBACK_TABLE = 'feedback';
```
Gọi REST: `fetch(\`${SUPABASE_URL}/rest/v1/words_shared?select=*\`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }})`.

## DeepL Proxy (Cloudflare Workers)
Dùng proxy để che API key:
```js
export default {
  async fetch(req, env) {
    const allowedOrigin = 'https://cardcard.thienpahm.dev';
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }});
    }
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const body = await req.json();
    const { text, target_lang, source_lang } = body;
    const apiKey = env.DEEPL_API_KEY;
    if (!apiKey) return new Response('Missing DEEPL_API_KEY', { status: 500 });
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('target_lang', target_lang || 'EN');
    if (source_lang) params.append('source_lang', source_lang);
    const deepl = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const json = await deepl.text();
    return new Response(json, { status: deepl.status, headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    }});
  }
};
```
Environment Variable: `DEEPL_API_KEY`.

## Chạy cục bộ
```bash
python3 -m http.server 8000
# Mở http://localhost:8000
```

## Quy trình nhập từ (admin.html)
1. Nhập thủ công: điền từ, nghĩa (mỗi dòng một nghĩa) → Lưu → upsert.
2. Dán TSV/CSV: map cột và xác nhận preview trước khi gửi.

## SRS Logic tóm tắt
- Ease mặc định ~2.5; đúng tăng ease nhẹ, sai giảm.
- interval tính theo công thức rút gọn (không đầy đủ SM-2).
- `due` = `NOW + interval` (quy đổi ms nếu cần).
- `reps`: số lần thẻ lên cấp (level-up) — chỉ tăng ở lần đúng đủ điều kiện sau chuỗi xác nhận.
- `confirms`: số lần đúng xác nhận (đáp án đúng nhưng chưa lên cấp). Khi đạt ngưỡng (mặc định 2) lần đúng xác nhận tiếp theo sẽ chuyển thành level-up (tăng `reps` và reset `confirms`). Sai sẽ reset `confirms` về 0.
- Cột Đúng trong `mywords.html` = `reps + confirms` để phản ánh tổng số lần trả lời đúng (gồm cả xác nhận chưa lên cấp).

## Checklist sau khi deploy
- [ ] Chạy FULL SCHEMA SETUP.
- [ ] Kiểm tra không có username trùng.
- [ ] Thử insert vào từng bảng qua REST.
- [ ] Kiểm tra policies hiển thị trong Supabase Dashboard.
- [ ] Kiểm tra CORS proxy DeepL (nếu dùng).

## Giấy phép
MIT

## Tham khảo
- Supabase REST: https://supabase.com/docs/guides/api
- RLS Policies: https://supabase.com/docs/guides/auth/row-level-security
- DeepL API: https://www.deepl.com/en/docs-api
```
UPDATE public.users SET best_streak = COALESCE(best_streak, streak_count, 0);
ALTER TABLE public.users ALTER COLUMN streak_count SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN best_streak SET NOT NULL;

-- Constraint: best_streak >= streak_count (drop & recreate để chắc chắn)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_best_ge_streak') THEN
    ALTER TABLE public.users DROP CONSTRAINT users_best_ge_streak;
  END IF;
  ALTER TABLE public.users ADD CONSTRAINT users_best_ge_streak CHECK (best_streak >= streak_count);
END $$;

---------------------------------------------
-- 5. RLS policies (chọn ENABLE hoặc DISABLE) --
---------------------------------------------
-- Option A: Disable RLS
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Option B: Enable RLS + open policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_select_all') THEN
    DROP POLICY users_select_all ON public.users; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_insert_any') THEN
    DROP POLICY users_insert_any ON public.users; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_update_any') THEN
    DROP POLICY users_update_any ON public.users; END IF;
END $$;
CREATE POLICY users_select_all ON public.users FOR SELECT USING (true);
CREATE POLICY users_insert_any ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY users_update_any ON public.users FOR UPDATE USING (true) WITH CHECK (true);

-------------------------------
-- 6. Grants cho role anon    --
-------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;

-----------------------------------------
-- 7. Test queries (chạy riêng)          --
-----------------------------------------
-- SELECT username, streak_count, best_streak, last_active FROM public.users WHERE username='thienpahm';
-- UPDATE public.users
--   SET streak_count = streak_count + 1,
--       best_streak = GREATEST(best_streak, streak_count + 1),
--       last_active = NOW()
-- WHERE username='thienpahm';

-- End of script
```

## Giấy phép
MIT.


----
code Cloudflare Workers 

export default {
  async fetch(request, env, ctx) {
    const allowedOrigin = "https://cardcard.thienpahm.dev";

    // Preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const body = await request.json();
      const { text, target_lang, source_lang } = body;

      const apiKey = env.DEEPL_API_KEY;
      if (!apiKey) return new Response("Missing DEEPL_API_KEY", { status: 500 });

      const params = new URLSearchParams();
      params.append("text", text);
      params.append("target_lang", target_lang || "EN");
      if (source_lang) params.append("source_lang", source_lang);

      const deepl = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: {
          "Authorization": `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      const textResponse = await deepl.text();

      return new Response(textResponse, {
        status: deepl.status,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      return new Response("Error: " + err.toString(), { status: 500 });
    }
  }
};


Settings → Variables → Environment Variables

Nhấn Add variable:

Name: DEEPL_API_KEY
Value: DeepL-Auth-Key youractualkey


---
https://www.deepl.com/en/your-account/keys
