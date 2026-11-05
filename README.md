# KT 공식가입센터 (soonycompany)

정적 HTML + Cloudflare Pages Functions + D1.
상담신청 접수 시 "문의 내역"(/inquiry.html)에 자동 누적 + 텔레그램 알림 발송.

## 1. 배포
Framework preset: **None** · Build command: **(비워둠)** · Output directory: **/**

## 2. D1 설정 (최초 1회)
1. Cloudflare → Storage & Databases → D1 → Create database → `soonycompany-db`
2. DB → Console → `schema.sql` 실행 (기존 데이터 삭제, 최초 1회만)
3. Pages → Settings → Functions → D1 bindings → Add (Variable name: **`DB`**)
4. Settings → Environment variables → `ADMIN_PASSWORD` = 관리자 비밀번호
5. Deployments → Retry deployment

## 3. 텔레그램 알림
기본값이 이미 들어 있어 별도 설정 없이 동작합니다.
- 봇: @Ktbiz070_bot
- 알림방: Kt문의알림 (그룹)

다른 방으로 바꾸려면 환경변수 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 를 설정하세요 (환경변수가 우선).

## 4. 관리자
`/admin.html` → 비밀번호 → 답변 작성 → 목록이 `답변완료`

## 5. 고객 화면
`/inquiry.html` — 읽기 전용 접수 현황 (이름 마스킹, 수정·삭제 불가)

## 6. 문의
1644-9637 · soonycompaany@naver.com
