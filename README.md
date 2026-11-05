# KT 공식가입센터

## 5단계
1. GitHub 업로드 (이 폴더 안의 내용물만)
2. Pages 연결 (Framework None / Build command 비움 / Output `/`)
3. D1 생성 soonycompany-db → schema.sql 실행
4. Bindings → D1 database / Variable name `DB`
5. Variables and Secrets → `ADMIN_PASSWORD` → Retry deployment

## 예시 데이터
D1 Console 에서 seed.sql 실행 → 200건 (하루 2~5건, 최근 58일)

## 텔레그램 알림
기본값 내장(@Ktbiz070_bot / Kt문의알림). 변경 시 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

## 화면
- 홈: 상담 접수 현황 6행 롤링 (최근 3일) → 전체 보기 누르면 펼침
- /inquiry.html: 전체 내역 12건씩 페이지
- /admin.html: 답변 등록
