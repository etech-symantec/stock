"""
collect.py
----------
매일 자동으로 다양한 거시경제 및 시장 지표를 수집하여 data/indicators.csv에 저장합니다.
"""

import os
import csv
import re
import requests
import yfinance as yf
from datetime import date
from bs4 import BeautifulSoup
from pathlib import Path

# ──────────────────────────────────────────────
# 1. Yahoo Finance 기본 지표 수집
# ──────────────────────────────────────────────
def get_yfinance_indicators():
    symbols = {
        "VIX": "^VIX", "MOVE": "^MOVE", "US10Y": "^TNX", 
        "DXY": "DX-Y.NYB", "USDKRW": "KRW=X", "Russell2000": "^RUT", "Copper": "HG=F"
    }
    results = {}
    for name, ticker in symbols.items():
        try:
            hist = yf.Ticker(ticker).history(period="5d")
            results[name] = round(float(hist["Close"].iloc[-1]), 2) if not hist.empty else None
        except Exception as e:
            print(f"   ⚠️ {name} 수집 오류: {e}")
            results[name] = None
    return results

# ──────────────────────────────────────────────
# 2. 하이일드 스프레드 (FRED)
# ──────────────────────────────────────────────
def get_high_yield_spread():
    hy_spread = None
    series_id = "BAMLH0A0HYM2"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    import time

    print("\n   ▶️ [High Yield] FRED 접속 중...")

    # ==========================================
    # 💡 [1순위] FRED 공식 API (api.stlouisfed.org)
    # fred.stlouisfed.org(웹페이지/그래프 도메인)와는 별개의 서브도메인이라
    # 해당 도메인이 클라우드 IP에서 지연/차단되더라도 영향받지 않을 가능성이 높음.
    # API 키는 무료 발급, GitHub Secrets에 FRED_API_KEY로 등록해서 사용.
    # ==========================================
    api_key = os.environ.get("FRED_API_KEY")
    if api_key:
        try:
            api_url = "https://api.stlouisfed.org/fred/series/observations"
            params = {
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 5,  # 최근 결측치(.)가 있을 수도 있으니 여유롭게 5개 조회
            }
            resp = requests.get(api_url, params=params, headers=headers, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                for obs in data.get("observations", []):
                    if obs.get("value") not in (None, ".", ""):
                        hy_spread = round(float(obs["value"]), 2)
                        print(f"      ✅ [1순위/공식API] 하이일드 스프레드: {hy_spread}% (기준일: {obs['date']})")
                        break
            else:
                print(f"      ⚠️ FRED 공식 API 응답코드 {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"      ⚠️ FRED 공식 API 호출 실패: {e}")
    else:
        print("      ⚠️ FRED_API_KEY 환경변수가 없어 공식 API를 건너뜁니다.")

    # ==========================================
    # 💡 [2순위] fredgraph.csv (API 키 불필요, 그래프 도메인 접속)
    # ==========================================
    if hy_spread is None:
        print("      ▶️ [2순위] fredgraph.csv 시도...")
        csv_url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
        for attempt in range(3):
            try:
                resp = requests.get(csv_url, headers=headers, timeout=15)
                if resp.status_code == 200:
                    lines = [line.strip() for line in resp.text.splitlines() if line.strip()]
                    for line in reversed(lines):
                        if line.startswith("DATE"):
                            continue
                        parts = line.split(",")
                        if len(parts) == 2 and parts[1] != ".":
                            hy_spread = round(float(parts[1]), 2)
                            print(f"      ✅ [2순위/CSV] 하이일드 스프레드: {hy_spread}% (기준일: {parts[0]})")
                            break
                    if hy_spread is not None:
                        break
                else:
                    print(f"      ⚠️ FRED CSV 응답코드 {resp.status_code} (재시도 {attempt+1}/3)...")
            except requests.exceptions.ReadTimeout:
                print(f"      ⚠️ FRED 응답 지연 (재시도 {attempt+1}/3)...")
            except Exception as e:
                print(f"      ⚠️ FRED CSV 통신 에러: {e}")
            time.sleep(2)

    # ==========================================
    # 💡 [3순위] HTML 시리즈 페이지 폴백 (1회, 짧은 타임아웃)
    # ==========================================
    if hy_spread is None:
        print("      ▶️ [3순위] FRED 시리즈 페이지(HTML) 폴백 시도...")
        try:
            html_url = f"https://fred.stlouisfed.org/series/{series_id}"
            resp = requests.get(html_url, headers=headers, timeout=10)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                val_span = soup.find('span', class_='series-meta-observation-value')
                if val_span:
                    hy_spread = float(val_span.text.strip())
                    print(f"      ✅ [3순위/HTML] 하이일드 스프레드: {hy_spread}%")
        except Exception as e:
            print(f"      ⚠️ HTML 폴백 실패: {e}")

    if hy_spread is None:
        print("      ❌ 하이일드 스프레드를 수집하지 못했습니다. N/A로 기록됩니다.")

    return hy_spread

# ──────────────────────────────────────────────
# 3. Fear & Greed Index (CNN 공포탐욕지수)
# ──────────────────────────────────────────────
def get_fear_greed():
    fg_val = None
    print("\n   ▶️ [Fear & Greed] CNN 사이트 접속 중...")
    try:
        from playwright.sync_api import sync_playwright
        import re

        with sync_playwright() as p:
            # 봇 탐지 회피를 위한 브라우저 설정
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"]
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            
            # 속도 최적화: 텍스트 렌더링에 불필요한 이미지/미디어 로딩 차단
            context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
            page = context.new_page()

            page.goto("https://edition.cnn.com/markets/fear-and-greed", timeout=40000)
            
            # 💡 사용자가 짚어준 핵심 클래스 타겟팅
            target_selector = ".market-fng-gauge__dial-number-value"
            
            # 해당 요소가 브라우저에 붙을 때까지 최대 20초 대기
            page.wait_for_selector(target_selector, state="attached", timeout=20000)
            
            # 자바스크립트가 숫자를 계산해서 밀어넣을 시간(2초) 부여
            page.wait_for_timeout(2000)
            
            # 로케이터를 이용해 화면에 보이는 텍스트(예: "54")만 콕 집어옴
            raw_text = page.locator(target_selector).first.inner_text()
            
            if raw_text:
                # 불필요한 공백이나 문자가 섞여 있을 경우를 대비해 순수 숫자만 추출
                m = re.search(r"(\d+(?:\.\d+)?)", raw_text)
                if m:
                    fg_val = float(m.group(1))
                    print(f"      ✅ [수집 완료] CNN 공포탐욕지수: {fg_val}")
                else:
                    print(f"      ⚠️ 숫자를 파싱하지 못했습니다. (텍스트: '{raw_text}')")
            else:
                print("      ⚠️ 요소는 찾았으나 텍스트가 비어있습니다.")
                
            browser.close()
    except Exception as e:
        print(f"      ⚠️ Fear & Greed 수집 실패: {e}")

    if fg_val is None:
         print("      ❌ Fear & Greed 지수를 수집하지 못했습니다. N/A로 기록됩니다.")

    return fg_val

# ──────────────────────────────────────────────
# 4. CAPE PE (Shiller PE)
# ──────────────────────────────────────────────
def get_cape_pe():
    try:
        url = "https://www.multpl.com/shiller-pe"
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(resp.text, 'html.parser')
        target_div = soup.find(id="current") or soup.find(id="estimate")
        if target_div:
            match = re.search(r"(\d{2,3}\.\d{1,2})", target_div.text)
            if match: return float(match.group(1))
    except Exception as e:
        print(f"   ⚠️ CAPE PE 수집 오류: {e}")
    return None

# ──────────────────────────────────────────────
# 5. 미국 버핏 지수 (Longtermtrends -> FRED 자체계산)
# ──────────────────────────────────────────────
def get_us_buffett_indicator():
    us_val = None
    print("\n   ▶️ [1순위] Longtermtrends Playwright 접속 중...")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1920, "height": 1080}, user_agent="Mozilla/5.0")
            context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
            page = context.new_page()
            page.goto("https://www.longtermtrends.net/market-cap-to-gdp-the-buffett-indicator/", timeout=40000)
            page.wait_for_selector("#buffett-ratio", state="attached", timeout=20000)
            page.wait_for_timeout(3000)
            
            raw_text = page.locator("#buffett-ratio").inner_text()
            m_alt = re.search(r"(\d{2,4}(?:\.\d+)?)", raw_text)
            if m_alt:
                us_val = float(m_alt.group(1))
                print(f"      ✅ [1순위] Longtermtrends 미국 수치 발견: {us_val}%")
            browser.close()
    except Exception as e:
        print(f"      ⚠️ Playwright 1순위 수집 중 오류: {e}")

    if us_val is None:
        print("   ▶️ [2순위] 1순위 실패. FRED 공공 데이터를 활용해 미국 버핏 지수를 직접 계산합니다...")
        try:
            resp_gdp = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=GDP", timeout=10)
            lines_gdp = [line for line in resp_gdp.text.split('\n') if line.strip() and not line.startswith('DATE')]
            gdp_date, gdp_val = lines_gdp[-1].split(',')
            latest_gdp = float(gdp_val)
            print(f"      - 미국 명목 GDP ({gdp_date}): ${latest_gdp:,.1f}B")
            
            resp_wil = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=WILL5000PRFC", timeout=10)
            lines_wil = [line for line in resp_wil.text.split('\n') if line.strip() and not line.startswith('DATE')]
            latest_wilshire = None
            wil_date = None
            for line in reversed(lines_wil):
                parts = line.split(',')
                if parts[-1] != '.':
                    wil_date = parts[0]
                    latest_wilshire = float(parts[-1])
                    break
            
            if latest_gdp and latest_wilshire:
                print(f"      - Wilshire 5000 ({wil_date}): {latest_wilshire:,.2f}pt")
                market_cap_billions = latest_wilshire * 1.35 
                us_val = round((market_cap_billions / latest_gdp) * 100, 1)
                print(f"      ✅ [2순위] FRED 자체 산출 완료: {us_val}%")
        except Exception as e:
            print(f"      ⚠️ FRED 계산 실패: {e}")

    return us_val

# ──────────────────────────────────────────────
# 6. 한국 버핏 지수
#    KRX 메인 HTML 시가총액(십억원) + ECOS GDP
# ──────────────────────────────────────────────
def get_kr_buffett_indicator(ecos_api_key=None, include_konex=True):
    kr_val = None
    print("\n   ▶️ [한국 버핏지수] KRX 시가총액 + ECOS GDP 엔진 가동...")

    try:
        import os
        import re
        import requests

        total_cap_billion = 0.0
        gdp_billion = 0.0

        ecos_api_key = (
            ecos_api_key
            or os.getenv("BOK_ECOS_API_KEY")
            or os.getenv("ECOS_API_KEY")
        )

        # ==========================================
        # 공통 유틸
        # ==========================================
        def _num(value):
            """콤마/문자 제거 후 float 변환"""
            if value is None:
                return 0.0

            s = str(value).strip()
            if not s or s in ("-", "N/A", "nan", "None"):
                return 0.0

            s = s.replace(",", "").replace("−", "-")
            s = re.sub(r"[^\d.\-]", "", s)

            if not s or s in ("-", ".", "-."):
                return 0.0

            try:
                return float(s)
            except Exception:
                return 0.0

        def _make_session():
            session = requests.Session()
            session.headers.update({
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Referer": "https://data.krx.co.kr/",
            })
            return session

        # ==========================================
        # 1. 시가총액 — KRX 메인 HTML row 파싱
        # ==========================================
        def _fetch_cap_krx_main_html():
    """
    KRX 메인 페이지를 Playwright로 렌더링한 뒤,
    DOM에 생성된 '시가총액(십억원)' row를 찾아 수집한다.

    반환 단위: 십억원
    """
    from playwright.sync_api import sync_playwright

    url = "https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )

        context.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in ["image", "media", "font"]
            else route.continue_(),
        )

        page = context.new_page()

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=40_000)

            # JS 데이터 로딩 대기
            page.wait_for_selector("text=상장종목 현황", timeout=20_000)
            page.wait_for_selector("text=시가총액(십억원)", timeout=20_000)

            row_text = page.locator(
                "tr",
                has_text=re.compile(r"시가총액\s*\(십억원\)")
            ).first.inner_text(timeout=10_000)

            # 예:
            # 시가총액(십억원) 7,080,808 492,337 3,378
            nums = re.findall(r"[\d,]+(?:\.\d+)?", row_text)

            if len(nums) < 3:
                raise ValueError(f"시가총액 row 숫자 파싱 실패: {row_text}")

            kospi = _num(nums[0])
            kosdaq = _num(nums[1])
            konex = _num(nums[2])

            if kospi <= 0 or kosdaq <= 0:
                raise ValueError(
                    f"KRX 시가총액 값 이상: KOSPI={kospi}, KOSDAQ={kosdaq}, KONEX={konex}"
                )

            total = kospi + kosdaq + konex if include_konex else kospi + kosdaq

            print(f"      - [KRX/MAIN/PW] KOSPI:  {kospi:,.1f} 십억원")
            print(f"      - [KRX/MAIN/PW] KOSDAQ: {kosdaq:,.1f} 십억원")
            print(f"      - [KRX/MAIN/PW] KONEX:  {konex:,.1f} 십억원")

            if include_konex:
                print(
                    f"      ✅ [KRX/MAIN/PW] 전체 시가총액"
                    f"(KOSPI+KOSDAQ+KONEX): {total:,.1f} 십억원"
                )
            else:
                print(
                    f"      ✅ [KRX/MAIN/PW] 전체 시가총액"
                    f"(KOSPI+KOSDAQ): {total:,.1f} 십억원"
                )

            return total

        finally:
            browser.close()

        # ==========================================
        # 2-A. GDP — ECOS 공식 API
        # ==========================================
        def _fetch_gdp_ecos_api():
            """
            한국은행 ECOS 100대 통계지표 API 사용.
            GDP(명목, 계절조정)의 최근 분기 값을 가져와 연환산한다.

            반환 단위: 십억원
            """
            if not ecos_api_key:
                raise ValueError("ECOS API KEY 없음")

            url = f"https://ecos.bok.or.kr/api/KeyStatisticList/{ecos_api_key}/json/kr/1/100"

            res = requests.get(url, timeout=15)
            res.raise_for_status()

            data = res.json()
            root = data.get("KeyStatisticList", {})

            result = root.get("RESULT", {})
            if result and result.get("CODE") not in (None, "INFO-000"):
                raise ValueError(f"ECOS API 오류: {result}")

            rows = root.get("row", [])
            if not rows:
                raise ValueError("ECOS API row 없음")

            target = None

            for row in rows:
                name = str(row.get("KEYSTAT_NAME", ""))
                if "GDP" in name and "명목" in name and "계절조정" in name:
                    target = row
                    break

            if target is None:
                for row in rows:
                    name = str(row.get("KEYSTAT_NAME", ""))
                    if "GDP" in name and "명목" in name:
                        target = row
                        break

            if target is None:
                raise ValueError("ECOS API에서 명목 GDP 항목을 찾지 못했습니다.")

            value = _num(target.get("DATA_VALUE"))
            unit = str(target.get("UNIT_NAME", "") or "")
            cycle = str(target.get("CYCLE", "") or "")

            if value <= 0:
                raise ValueError(f"ECOS GDP 값 이상: {target}")

            # ECOS 100대 통계 GDP는 보통 '십억원' 단위
            if "조" in unit:
                quarterly_gdp_billion = value * 1_000
            elif "억원" in unit and "십억원" not in unit:
                quarterly_gdp_billion = value / 10
            else:
                quarterly_gdp_billion = value

            annualized_gdp_billion = quarterly_gdp_billion * 4

            print(f"      - [ECOS/API] 항목: {target.get('KEYSTAT_NAME')}")
            print(f"      - [ECOS/API] 기준시점: {cycle}")
            print(f"      - [ECOS/API] 단위: {unit}")
            print(f"      - [ECOS/API] 분기 명목 GDP: {quarterly_gdp_billion:,.1f} 십억원")
            print(f"      - [ECOS/API] 연환산 명목 GDP: {annualized_gdp_billion:,.1f} 십억원")

            return annualized_gdp_billion

        # ==========================================
        # 2-B. GDP — ECOS Playwright 폴백
        # ==========================================
        def _fetch_gdp_ecos_playwright():
            """
            ECOS API 키가 없거나 API 조회에 실패한 경우만 사용.
            ECOS 100대 통계 페이지에서 GDP(명목, 계절조정)를 추출한다.

            반환 단위: 십억원
            """
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36"
                    )
                )

                context.route(
                    "**/*",
                    lambda route: route.abort()
                    if route.request.resource_type in ["image", "media", "font"]
                    else route.continue_(),
                )

                page = context.new_page()

                try:
                    page.goto(
                        "https://ecos.bok.or.kr/#/StatisticsByTheme/KoreanStat100",
                        timeout=40_000,
                    )
                    page.wait_for_selector(
                        "text=GDP(명목, 계절조정)",
                        state="attached",
                        timeout=20_000,
                    )
                    page.wait_for_timeout(2_000)

                    html = page.content()

                    match = re.search(
                        r"GDP\(명목,\s*계절조정\)</span>\s*"
                        r"<span[^>]*result[^>]*>\s*([\d,]+(?:\.\d+)?)",
                        html,
                        re.IGNORECASE,
                    )

                    if not match:
                        body_text = page.evaluate("() => document.body.innerText")
                        match = re.search(
                            r"GDP\(명목,\s*계절조정\)[^\d]+([\d,]+(?:\.\d+)?)",
                            body_text,
                            re.IGNORECASE,
                        )

                    if not match:
                        raise ValueError("ECOS 페이지에서 GDP 값을 찾지 못했습니다.")

                    quarterly_gdp_billion = _num(match.group(1))
                    annualized_gdp_billion = quarterly_gdp_billion * 4

                    print(f"      - [ECOS/PW] 분기 명목 GDP: {quarterly_gdp_billion:,.1f} 십억원")
                    print(f"      - [ECOS/PW] 연환산 명목 GDP: {annualized_gdp_billion:,.1f} 십억원")

                    return annualized_gdp_billion

                finally:
                    browser.close()

        # ==========================================
        # 3. 시가총액 수집
        # ==========================================
        print("      ▶️ [시가총액] KRX 메인 HTML 수집 시도 중...")

        try:
            total_cap_billion = _fetch_cap_krx_main_html()
        except Exception as e:
            print(f"      ❌ KRX 시가총액 수집 실패: {e}")

        # ==========================================
        # 4. GDP 수집
        # ==========================================
        print("      ▶️ [GDP] 한국은행 ECOS 수집 시도 중...")

        try:
            gdp_billion = _fetch_gdp_ecos_api()
        except Exception as e:
            print(f"      ⚠️ ECOS API 실패 또는 미설정 ({e}), Playwright 폴백 시도...")

            try:
                gdp_billion = _fetch_gdp_ecos_playwright()
            except Exception as e2:
                print(f"      ❌ ECOS GDP 수집 실패: {e2}")

        # ==========================================
        # 5. 한국 버핏 지수 계산
        # ==========================================
        if total_cap_billion > 0 and gdp_billion > 0:
            kr_val = round((total_cap_billion / gdp_billion) * 100, 1)

            print(
                f"      ✅ [계산 완료] 한국 버핏 지수: "
                f"({total_cap_billion:,.1f} / {gdp_billion:,.1f}) * 100 = {kr_val}%"
            )
        else:
            print("      ⚠️ 수집된 데이터가 부족하여 연산을 수행할 수 없습니다.")
            print(f"         - 시가총액: {total_cap_billion:,.1f} 십억원")
            print(f"         - GDP: {gdp_billion:,.1f} 십억원")

    except Exception as e:
        print(f"      ⚠️ 한국 버핏 지수 전체 연산 실패: {e}")

    if kr_val is None:
        print("      ❌ 한국 버핏 지수를 수집하지 못했습니다. N/A로 기록됩니다.")

    return kr_val

# ──────────────────────────────────────────────
# 7. 신용융자 잔고 (미국 FINRA / 한국 KOFIA)
# ──────────────────────────────────────────────
def get_us_margin_debt():
    us_margin = None
    print("\n   ▶️ [미국 신용잔고] 수집 엔진 가동...")
    try:
        import re
        import requests

        # ==========================================
        # 💡 [1순위] YCharts 일반 접속 (빠르고 가벼움)
        # ==========================================
        print("      ▶️ 1순위: YCharts 일반 접속 중...")
        try:
            headers = {"User-Agent": "Mozilla/5.0"}
            resp = requests.get("https://ycharts.com/indicators/finra_margin_debt", headers=headers, timeout=10)
            if resp.status_code == 200:
                m = re.search(r"current level of\s+([\d\.]+)([TBM])", resp.text, re.IGNORECASE) or \
                    re.search(r"Last\s+Value[\s\S]{1,150}?([\d\.]+)([TBM])", resp.text, re.IGNORECASE)
                if m:
                    val = float(m.group(1))
                    unit = m.group(2).upper()
                    if unit == 'T': us_margin = val
                    elif unit == 'B': us_margin = round(val / 1000, 3)
                    elif unit == 'M': us_margin = round(val / 1000000, 3)
                    print(f"      ✅ [1순위/YCharts] 미국 신용잔고 발견: {us_margin} 조 달러")
            else:
                print(f"      ⚠️ YCharts 차단됨 (상태코드: {resp.status_code})")
        except Exception as e:
            print(f"      ⚠️ 1순위 에러: {e}")

        # ==========================================
        # 💡 [2순위] FINRA (Cloudscraper 우회)
        # ==========================================
        if us_margin is None:
            print("      ▶️ 2순위: FINRA 홈페이지 우회 접속 중...")
            try:
                import cloudscraper
                scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
                resp = scraper.get("https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics", timeout=15)
                if resp.status_code == 200:
                    m = re.search(r"<td>\s*(?:[A-Za-z]+\s*-\s*\d{2}|\d{4}-\d{2})\s*</td>\s*<td>\s*\$?\s*([\d,]+)\s*</td>", resp.text, re.IGNORECASE)
                    if m:
                        val_millions = float(m.group(1).replace(',', ''))
                        us_margin = round(val_millions / 1000000, 3)
                        print(f"      ✅ [2순위/FINRA] 미국 신용잔고 발견: {us_margin} 조 달러")
                else:
                    print(f"      ⚠️ FINRA 차단됨 (상태코드: {resp.status_code})")
            except Exception as e:
                print(f"      ⚠️ 2순위 에러: {e}")

        # ==========================================
        # 💡 [3순위] FINRA (Playwright 강제 렌더링 - 신규 도입!)
        # ==========================================
        if us_margin is None:
            print("      ▶️ 3순위: Playwright를 이용한 FINRA 공식 페이지 접속...")
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
                    context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    page = context.new_page()
                    page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                    
                    page.goto("https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics", timeout=30000)
                    page.wait_for_selector("table", state="attached", timeout=15000)
                    
                    # 💡 HTML 껍데기를 무시하고 표 안의 텍스트만 빼옵니다.
                    table_text = page.locator("table").first.inner_text()
                    m = re.search(r"(?:[A-Za-z]+\s*-\s*\d{2}|\d{4}-\d{2})\s+([\d,]+)", table_text)
                    if m:
                        val_millions = float(m.group(1).replace(',', ''))
                        us_margin = round(val_millions / 1000000, 3)
                        print(f"      ✅ [3순위/Playwright] FINRA 미국 신용잔고 발견: {us_margin} 조 달러")
                    else:
                        print("      ⚠️ FINRA 표에서 데이터를 파싱하지 못했습니다.")
                    browser.close()
            except Exception as e:
                print(f"      ⚠️ 3순위 에러: {e}")

        # ==========================================
        # 💡 [4순위] YCharts (Playwright 순수 텍스트 스캔 - 안정성 대폭 상향)
        # ==========================================
        if us_margin is None:
            print("      ▶️ 4순위: Playwright를 이용한 YCharts 강제 렌더링...")
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
                    context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    page = context.new_page()
                    page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                    
                    page.goto("https://ycharts.com/indicators/finra_margin_debt", timeout=30000)
                    page.wait_for_load_state("domcontentloaded", timeout=15000)
                    page.wait_for_timeout(3000)
                    
                    # 💡 핵심: 복잡한 HTML 대신 '화면에 보이는 글자(순수 텍스트)'만 긁어옵니다.
                    raw_text = page.locator("body").inner_text()
                    
                    # 화면 텍스트에서 'Last Value' 혹은 'current level of' 바로 뒤의 숫자를 스캔
                    m = re.search(r"current level of\s+([\d\.]+)([TBM])", raw_text, re.IGNORECASE)
                    if not m:
                        m = re.search(r"Last Value\s+([\d\.]+)([TBM])", raw_text, re.IGNORECASE)
                        
                    if m:
                        val = float(m.group(1))
                        unit = m.group(2).upper()
                        if unit == 'T': us_margin = val
                        elif unit == 'B': us_margin = round(val / 1000, 3)
                        elif unit == 'M': us_margin = round(val / 1000000, 3)
                        print(f"      ✅ [4순위/Playwright] YCharts 미국 신용잔고 발견: {us_margin} 조 달러")
                    else:
                        snippet = raw_text[:100].replace('\n', ' ')
                        print(f"      ⚠️ 텍스트에서 수치를 찾지 못했습니다. (원인파악용 텍스트 일부: {snippet}...)")
                    browser.close()
            except Exception as e:
                print(f"      ⚠️ 4순위 에러: {e}")

    except Exception as e:
        print(f"      ⚠️ 미국 신용잔고 수집 환경 오류: {e}")
        
    if us_margin is None:
         print("      ❌ 미국 신용잔고 수집 실패. N/A로 기록됩니다.")
         
    return us_margin

def get_kr_margin_debt():
    kr_margin = None
    print("\n   ▶️ [한국 신용잔고] 네이버 금융(증시자금동향) 수집 중...")
    try:
        import re
        import requests
        from bs4 import BeautifulSoup
        
        url = "https://finance.naver.com/sise/sise_deposit.naver"
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.encoding = 'euc-kr' 
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        table = soup.find('table', class_='type_1')
        
        if table:
            headers_th = table.find_all('th')
            margin_idx = -1
            for i, th in enumerate(headers_th):
                if '신용융자' in th.text:
                    margin_idx = i
                    break
            
            if margin_idx == -1: margin_idx = 3 
                    
            rows = table.find_all('tr')
            for row in rows:
                cols = row.find_all('td')
                
                # 💡 핵심 수정: 네이버 금융의 연도 2자리 표기("24.06.03")를 인식하도록 정규식을 \d{4} -> \d{2,4}로 수정
                if len(cols) > margin_idx and re.match(r"\d{2,4}\.\d{2}\.\d{2}", cols[0].text.strip()):
                    date_str = cols[0].text.strip()
                    margin_str = cols[margin_idx].text.strip().replace(',', '')
                    
                    try:
                        kr_margin = round(float(margin_str) / 10000, 2)
                        print(f"      ✅ [수집 완료] 한국 신용잔고 ({date_str} 기준): {kr_margin} 조 원")
                        break 
                    except ValueError:
                        continue
        else:
            print("      ⚠️ 네이버 금융 표를 찾을 수 없습니다.")
    except Exception as e:
        print(f"      ⚠️ 한국 신용잔고 수집 실패: {e}")
        
    return kr_margin

# ──────────────────────────────────────────────
# (추가) BDI 지수 (TradingEconomics 크롤링)
# ──────────────────────────────────────────────
def get_bdi_index():
    bdi_val = None
    print("\n   ▶️ [BDI 지수] TradingEconomics 접속 중...")
    try:
        import re
        from bs4 import BeautifulSoup

        url = "https://ko.tradingeconomics.com/commodity/baltic"

        # ==========================================
        # 💡 [1순위] Cloudscraper + BeautifulSoup
        # ==========================================
        try:
            import cloudscraper
            scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
            resp = scraper.get(url, timeout=15)
            
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # 사용자가 알려준 정확한 식별자(data-symbol="BDIY:IND")로 행(tr)을 먼저 찾고, 그 안의 id="p" 탐색
                target_tr = soup.find('tr', {'data-symbol': 'BDIY:IND'})
                if target_tr:
                    target_td = target_tr.find('td', id='p')
                    if target_td:
                        # 콤마 제거 및 실수 변환 (예: "3,124.00 " -> 3124.0)
                        clean_text = target_td.get_text(strip=True).replace(',', '')
                        bdi_val = float(clean_text)
                        print(f"      ✅ [1순위/BS4] BDI 지수 발견: {bdi_val} pt")
                else:
                    print("      ⚠️ 접속은 성공했으나 data-symbol='BDIY:IND' 태그를 찾지 못했습니다.")
            else:
                print(f"      ⚠️ Cloudscraper 접속 차단 (상태코드: {resp.status_code})")
        except Exception as e:
            print(f"      ⚠️ 1순위 통신 에러: {e}")

        # ==========================================
        # 💡 [2순위] 로봇 탐지 회피형 Playwright
        # ==========================================
        if bdi_val is None:
            print("      ▶️ 2순위: Playwright 브라우저 렌더링 대기...")
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(
                        headless=True,
                        args=["--disable-blink-features=AutomationControlled"]
                    )
                    context = browser.new_context(user_agent="Mozilla/5.0")
                    context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
                    page = context.new_page()

                    page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                    page.goto(url, timeout=30000)
                    
                    # css selector를 이용해 짚어주신 구조 직격 타겟팅
                    target_selector = 'tr[data-symbol="BDIY:IND"] td#p'
                    page.wait_for_selector(target_selector, state="attached", timeout=15000)
                    
                    raw_text = page.locator(target_selector).first.inner_text()
                    
                    if raw_text:
                        clean_text = raw_text.replace(',', '').strip()
                        bdi_val = float(clean_text)
                        print(f"      ✅ [2순위/Playwright] BDI 지수 발견: {bdi_val} pt")
                    else:
                        print("      ⚠️ 렌더링 완료 후에도 텍스트가 비어있습니다.")
                        
                    browser.close()
            except Exception as e:
                print(f"      ⚠️ Playwright 2순위 수집 실패: {e}")

    except Exception as e:
        print(f"      ⚠️ BDI 지수 환경 오류: {e}")

    if bdi_val is None:
         print("      ❌ BDI 지수를 수집하지 못했습니다. N/A로 기록됩니다.")

    return bdi_val

# ──────────────────────────────────────────────
# (추가) 한국 수출액 (TradingEconomics 크롤링)
# ──────────────────────────────────────────────
def get_kr_export():
    export_val = None
    print("\n   ▶️ [한국 수출액] TradingEconomics 접속 중...")
    try:
        import re
        from bs4 import BeautifulSoup

        url = "https://ko.tradingeconomics.com/south-korea/exports"

        # ==========================================
        # 💡 [1순위] Cloudscraper + BeautifulSoup
        # ==========================================
        try:
            import cloudscraper
            scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
            resp = scraper.get(url, timeout=15)
            
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                exp_num = None
                yoy_num = None
                
                # 1. 수출 절대액 추출 (USD - 백만)
                exp_a = soup.find('a', href='/south-korea/exports')
                if exp_a and exp_a.find_parent('tr'):
                    tds = exp_a.find_parent('tr').find_all('td')
                    if len(tds) >= 2:
                        val_str = tds[1].text.strip().replace(',', '')
                        # 백만 달러를 대시보드 표기용인 '억 달러'로 환산 (나누기 100)
                        exp_num = round(float(val_str) / 100, 1)
                        
                # 2. 수출 전년동기대비(YoY) 추출 (%)
                yoy_a = soup.find('a', href='/south-korea/exports-yoy')
                if yoy_a and yoy_a.find_parent('tr'):
                    tds = yoy_a.find_parent('tr').find_all('td')
                    if len(tds) >= 2:
                        yoy_num = float(tds[1].text.strip().replace(',', ''))

                if exp_num:
                    if yoy_num:
                        # 관세청에서 원하셨던 "절대액 + 증감률" 형태로 결합 (예: "877.5 (53.2%)")
                        export_val = f"{exp_num} ({yoy_num}%)"
                        print(f"      ✅ [1순위/BS4] 한국 수출액 및 YoY 발견: {export_val} 억 달러")
                    else:
                        export_val = exp_num
                        print(f"      ✅ [1순위/BS4] 한국 수출액 발견 (YoY 누락): {export_val} 억 달러")
            else:
                print(f"      ⚠️ Cloudscraper 접속 차단 (상태코드: {resp.status_code})")
        except Exception as e:
            print(f"      ⚠️ 1순위 통신 에러: {e}")

        # ==========================================
        # 💡 [2순위] 로봇 탐지 회피형 Playwright
        # ==========================================
        if export_val is None:
            print("      ▶️ 2순위: Playwright 브라우저 렌더링 대기...")
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(
                        headless=True,
                        args=["--disable-blink-features=AutomationControlled"]
                    )
                    context = browser.new_context(user_agent="Mozilla/5.0")
                    context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
                    page = context.new_page()

                    page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                    page.goto(url, timeout=30000)
                    
                    # CSS 선택자를 사용해 정확히 해당 링크가 들어있는 줄(tr)의 2번째 칸(td)을 타겟팅
                    target_exp = 'tr:has(a[href="/south-korea/exports"]) td:nth-child(2)'
                    page.wait_for_selector(target_exp, state="attached", timeout=15000)
                    
                    raw_exp = page.locator(target_exp).first.inner_text().strip().replace(',', '')
                    exp_num = round(float(raw_exp) / 100, 1) if raw_exp else None
                    
                    # YoY 지표는 없어도 에러를 내지 않도록 예외 처리
                    target_yoy = 'tr:has(a[href="/south-korea/exports-yoy"]) td:nth-child(2)'
                    yoy_num = None
                    try:
                        raw_yoy = page.locator(target_yoy).first.inner_text(timeout=5000).strip().replace(',', '')
                        yoy_num = float(raw_yoy) if raw_yoy else None
                    except:
                        pass
                        
                    if exp_num:
                        if yoy_num:
                            export_val = f"{exp_num} ({yoy_num}%)"
                        else:
                            export_val = exp_num
                        print(f"      ✅ [2순위/Playwright] 한국 수출액 발견: {export_val} 억 달러")
                    else:
                        print("      ⚠️ 화면 렌더링 완료 후에도 데이터를 찾지 못했습니다.")
                        
                    browser.close()
            except Exception as e:
                print(f"      ⚠️ Playwright 2순위 수집 실패: {e}")

    except Exception as e:
        print(f"      ⚠️ 한국 수출액 환경 오류: {e}")

    if export_val is None:
         print("      ❌ 한국 수출액을 수집하지 못했습니다. N/A로 기록됩니다.")

    return export_val

# ──────────────────────────────────────────────
# 기존 7번 구역 하단 get_monthly_and_special() 확인용
# ──────────────────────────────────────────────
def get_monthly_and_special():
    return {
        "Margin_Debt_US": get_us_margin_debt(), 
        "Margin_Debt_KR": get_kr_margin_debt(), 
        "KR_Export": get_kr_export(),   # 정상적으로 연결되어 있는지 확인
        "BDI_Index": get_bdi_index()
    }

# ──────────────────────────────────────────────
# 8. CSV 저장 로직 및 점수 산출
# ──────────────────────────────────────────────
# 💡 Integrated_Valuation 대신 Daily_Score, Monthly_Score, Total_Score 3개 필드로 개편
FIELDNAMES = [
    "Date", "VIX", "MOVE", "US10Y", "DXY", "USDKRW", "Russell2000", "Copper",
    "High_Yield", "Fear_Greed", "CAPE_PE", "Buffett_US", "Buffett_KR",
    "Margin_Debt_US", "Margin_Debt_KR", "KR_Export", "BDI_Index", 
    "Daily_Score", "Monthly_Score", "Total_Score"
]

def save_to_csv(row: dict):
    from pathlib import Path
    import csv
    
    csv_path = Path("data/indicators.csv")
    csv_path.parent.mkdir(exist_ok=True)
    rows = []
    
    if csv_path.exists():
        with open(csv_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for existing in reader:
                if existing.get("Date") != row["Date"]:
                    rows.append(existing)
                    
    rows.append(row)

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for r in rows:
            clean_row = {k: r.get(k, "N/A") for k in FIELDNAMES}
            writer.writerow(clean_row)
    print(f"\n✅ 저장 완료 → {csv_path}")

# ──────────────────────────────────────────────
# 9. 통합 밸류에이션 산출 로직 (0 ~ 100 정규화)
# ──────────────────────────────────────────────
def normalize(val, min_v, max_v, inverse=False):
    if val is None or val == "N/A": return 50 # 결측치는 중립(50) 처리
    try:
        v = float(val)
        # 역방향(inverse): 낮을수록 위험(100점), 높을수록 안전(0점)
        if inverse:
            pct = (max_v - v) / (max_v - min_v) * 100
        else:
            pct = (v - min_v) / (max_v - min_v) * 100
        return max(0, min(100, pct))
    except:
        return 50

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    today = date.today().strftime("%Y-%m-%d")
    print(f"📊 대규모 시장 지표 수집 시작: {today}\n")

    yf_data = get_yfinance_indicators()
    high_yield = get_high_yield_spread()
    fg = get_fear_greed()
    cape_pe = get_cape_pe()
    
    buff_us = get_us_buffett_indicator()
    buff_kr = get_kr_buffett_indicator()
    
    special = get_monthly_and_special()

    # ========================================================
    # 💡 1. 단기 일일 점수 (심리 & 수급) 0~100점
    # ========================================================
    score_fg = normalize(fg, 0, 100)
    score_vix = normalize(yf_data.get("VIX"), 12, 40, inverse=True)
    score_hy = normalize(high_yield, 3, 8, inverse=True)
    
    daily_score = round((score_fg * 0.4) + (score_vix * 0.3) + (score_hy * 0.3), 1)

    # ========================================================
    # 💡 2. 장기 월간 점수 (펀더멘털 & 밸류에이션) 0~100점
    # ========================================================
    score_buff = normalize(buff_us, 100, 200)
    score_cape = normalize(cape_pe, 15, 45)
    score_margin = normalize(special.get("Margin_Debt_US"), 0.5, 1.2)
    
    monthly_score = round((score_buff * 0.5) + (score_cape * 0.3) + (score_margin * 0.2), 1)

    # ========================================================
    # 💡 3. 최종 통합 점수 (단기 30% + 장기 70%)
    # ========================================================
    total_score = round((daily_score * 0.3) + (monthly_score * 0.7), 1)

    row = {
        "Date": today,
        "VIX": yf_data.get("VIX"),
        "MOVE": yf_data.get("MOVE"),
        "US10Y": yf_data.get("US10Y"),
        "DXY": yf_data.get("DXY"),
        "USDKRW": yf_data.get("USDKRW"),
        "Russell2000": yf_data.get("Russell2000"),
        "Copper": yf_data.get("Copper"),
        "High_Yield": high_yield,
        "Fear_Greed": fg,
        "CAPE_PE": cape_pe,
        "Buffett_US": buff_us,
        "Buffett_KR": buff_kr,
        "Margin_Debt_US": special.get("Margin_Debt_US"),
        "Margin_Debt_KR": special.get("Margin_Debt_KR"),
        "KR_Export": special.get("KR_Export"),
        "BDI_Index": special.get("BDI_Index"),
        "Daily_Score": daily_score,
        "Monthly_Score": monthly_score,
        "Total_Score": total_score
    }

    for k, v in row.items():
        if v is None: row[k] = "N/A"
        print(f"   {k.ljust(20)} : {row[k]}")

    save_to_csv(row)

if __name__ == "__main__":
    main()
