# soonycompany — KT 공식가입센터 배포 가이드

## 이 폴더에 들어있는 것
- HTML 13개 (index, tel, corporate, office, iptv, inquiry, admin, call, agree, privacy, email, 404 ...)
- assets/ : style.css, app.js, board.js, home.js, img/
- functions/api/ : 상담 접수·조회·답변 API (Cloudflare Functions)
- schema.sql : DB 테이블 생성 (주석 없는 버전 — D1 Console 붙여넣기용)
- seed.sql : 2년치 예시 데이터 2,453건 생성 스크립트

## 전체 순서 (5단계, 약 15분)

### 1단계 — GitHub 업로드
1. github.com 로그인 → 우측 상단 + → New repository
2. Repository name: `soonycompany` / Private 선택 → Create repository
3. 생성된 화면에서 "uploading an existing file" 클릭
4. **deploy 폴더를 열고, 그 안의 파일과 폴더를 전부 선택**해서 드래그
   (deploy 폴더 자체를 끌어다 놓으면 안 됩니다 — 한 단계 안으로 들어가서 선택)
5. 아래 Commit changes 클릭

### 2단계 — Cloudflare Pages 프로젝트 생성
1. dash.cloudflare.com 로그인 → 좌측 Workers & Pages → Create
2. Pages 탭 → Connect to Git → GitHub 계정 연결 → `soonycompany` 선택
3. Build settings:
   - Framework preset: **None**
   - Build command: **비워둠**
   - Build output directory: **`/`**  (슬래시 한 개)
4. Save and Deploy → 1~2분 후 `https://soonycompany.pages.dev` 주소 생성

### 3단계 — D1 데이터베이스 만들기
1. 좌측 Storage & Databases → D1 SQL Database → Create
2. Name: **`soonycompany-db`** → Create
3. 생성된 DB 클릭 → 상단 **Console** 탭
4. `schema.sql` 내용 전체 복사 → 붙여넣기 → Execute
   → "Executed 1 statement" 나오면 성공
5. `seed.sql` 내용 전체 복사 → 붙여넣기 → Execute
   → 2,453건이 한 번에 들어갑니다 (1초 내외)
6. Console에서 확인:
   `SELECT COUNT(*) FROM posts;`  → 2453 이 나오면 정상

### 4단계 — DB 연결 (가장 중요)
1. Workers & Pages → `soonycompany` 프로젝트 → Settings 탭
2. 좌측 Functions → **D1 database bindings** → Add binding
3. Variable name: **`DB`**  ← 반드시 대문자 DB, 다른 이름이면 API가 죽습니다
4. D1 database: `soonycompany-db` 선택 → Save
5. Variables and secrets → Add:
   - Name: `ADMIN_PASSWORD`
   - Value: 관리자 페이지에서 쓸 비밀번호 (원하는 값)
   - Save
6. 상단 Deployments 탭 → 최근 배포 우측 ⋯ → **Retry deployment**

### 5단계 — 확인
- 홈: `https://내주소.pages.dev` → 상담 접수 현황에 **총 2,453건**, 6행 롤링
- 목록: `/inquiry.html` → 12건씩 페이지, 유형 필터·검색 동작
- 관리자: `/admin.html` → 비밀번호 입력 → 답변 등록 시 상태가 답변완료로 변경
- 접수 테스트: `/inquiry.html`에서 실제로 한 건 접수 → 텔레그램 알림 도착 확인

## 자주 막히는 곳
| 증상 | 원인 / 해결 |
|---|---|
| 홈에 총 0건 | D1 binding 이름이 `DB`가 아님 → 4단계 재확인 후 Retry deployment |
| 목록이 안 뜨고 "불러오는 중" | functions 폴더가 업로드 안 됨 → GitHub에 `functions/api/posts.js` 있는지 확인 |
| Console에 "No SQL statements detected" | 주석 포함된 schema를 붙여넣음 → 이 폴더의 schema.sql 사용 |
| Console "statement too long" | seed를 옛 버전(개별 INSERT)으로 실행 → 이 폴더의 seed.sql 사용 |
| 답변 등록 시 401 | ADMIN_PASSWORD 미설정 또는 오타 → 4단계 5번 |
| 텔레그램 알림 안 옴 | 봇이 그룹에 없음 → @Ktbiz070_bot을 "Kt문의알림" 그룹에 다시 초대 |

## 데이터 다시 만들기
`seed.sql`은 실행할 때마다 `DELETE FROM posts;` 후 2,453건을 새로 만듭니다.
실제 접수된 문의가 쌓인 뒤에는 실행하지 마세요.
