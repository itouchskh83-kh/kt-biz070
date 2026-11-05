# KT 공식가입센터 (soonycompany)

정적 HTML 사이트입니다. 빌드 과정 없이 그대로 배포됩니다.

## 폴더 구조

```
index.html        메인
tel.html          기업전화
corporate.html    기업용 인터넷
office.html       GIGA office
iptv.html         KT IPTV
inquiry.html      1:1 문의
call.html         전화상담신청
agree.html        이용약관
privacy.html      개인정보처리방침
email.html        이메일무단수집거부
404.html          없는 페이지
assets/           CSS · JS · 이미지
_headers          Cloudflare 캐시/보안 헤더
sitemap.xml       사이트맵
robots.txt        크롤러 규칙
```

## Cloudflare Pages 배포 설정

| 항목 | 값 |
|---|---|
| Framework preset | None |
| Build command | (비워둠) |
| Build output directory | `/` |
| Root directory | `/` |

## 도메인 변경 시

`build/build.py` 의 `SITE_URL` 값을 실제 도메인으로 바꾸고 다시 빌드하면
sitemap.xml / robots.txt 주소가 함께 갱신됩니다.

## 문의

1644-9637 · soonycompaany@naver.com
