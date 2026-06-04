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
    try:
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2"
        resp = requests.get(url, timeout=10)
        lines = [line for line in resp.text.split('\n') if line.strip()]
        val = lines[-1].split(',')[-1]
        if val != '.': return float(val)
    except Exception as e:
        print(f"   ⚠️ 하이일드 수집 오류: {e}")
    return None

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
# 6. 한국 버핏 지수 (한국은행 ECOS + KRX 하이브리드 엔진)
# ──────────────────────────────────────────────
def get_kr_buffett_indicator():
    kr_val = None
    print("\n   ▶️ [한국 버핏지수] 한국은행 ECOS(GDP) + KRX(시가총액) 하이브리드 엔진 가동...")
    try:
        import re
        from playwright.sync_api import sync_playwright
        
        total_cap_billion = 0
        gdp_billion = 0
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
            page = context.new_page()

            # ==========================================
            # 1. 한국은행 ECOS - 명목 GDP 수집
            # ==========================================
            print("      ▶️ 한국은행 ECOS 100대 통계 접속 중...")
            try:
                page.goto("https://ecos.bok.or.kr/#/StatisticsByTheme/KoreanStat100", timeout=40000)
                
                # 'GDP(명목, 계절조정)' 텍스트가 화면에 나타날 때까지 대기
                page.wait_for_selector("text=GDP(명목, 계절조정)", state="attached", timeout=20000)
                page.wait_for_timeout(2000) 
                
                html_ecos = page.content()
                
                # 💡 사용자 제공 HTML 기반 초정밀 정규식
                # <span class="listTit">GDP(명목, 계절조정)</span><span class="result">690,599.9 십억원</span>
                m_gdp = re.search(r"GDP\(명목,\s*계절조정\)</span>\s*<span[^>]*result[^>]*>\s*([\d,]+(?:\.\d+)?)", html_ecos, re.IGNORECASE)
                
                if m_gdp:
                    quarterly_gdp = float(m_gdp.group(1).replace(',', ''))
                    # ECOS 100대 통계의 GDP는 '분기' 기준이므로, 연간 버핏지수 산출을 위해 4를 곱해 연환산(Annualized) 수행
                    gdp_billion = quarterly_gdp * 4
                    print(f"      - [ECOS] 분기 명목 GDP: {quarterly_gdp:,.1f} 십억원")
                    print(f"      - [ECOS] 연환산(추정) 명목 GDP: {gdp_billion:,.1f} 십억원")
                else:
                    print("      ⚠️ ECOS 접속은 성공했으나 GDP 데이터를 찾지 못했습니다.")
            except Exception as e:
                print(f"      ⚠️ ECOS GDP 수집 실패: {e}")

            # ==========================================
            # 2. KRX 한국거래소 - 시가총액 수집
            # ==========================================
            print("      ▶️ KRX 공식 데이터 포털 접속 중...")
            try:
                page.goto("https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd", timeout=40000)
                page.wait_for_selector("text=시가총액(십억원)", state="attached", timeout=20000)
                page.wait_for_timeout(2000)
                
                html_krx = page.content()
                m_cap = re.search(r"시가총액\(십억원\)[^<]*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>", html_krx, re.IGNORECASE)
                
                if m_cap:
                    kospi_val = float(m_cap.group(1).replace(',', ''))
                    kosdaq_val = float(m_cap.group(2).replace(',', ''))
                    total_cap_billion = kospi_val + kosdaq_val
                    
                    print(f"      - [KRX] 한국 전체 시가총액 (코스피+코스닥): {total_cap_billion:,.0f} 십억원")
                else:
                    print("      ⚠️ KRX 접속은 성공했으나 시가총액 데이터를 찾지 못했습니다.")
            except Exception as e:
                print(f"      ⚠️ KRX 시가총액 수집 실패: {e}")

            browser.close()

        # ==========================================
        # 3. 한국 버핏 지수 공식 계산
        # ==========================================
        if total_cap_billion > 0 and gdp_billion > 0:
            kr_val = round((total_cap_billion / gdp_billion) * 100, 1)
            print(f"      ✅ [계산 완료] 한국 버핏 지수: ({total_cap_billion:,.0f} / {gdp_billion:,.0f}) * 100 = {kr_val}%")
        else:
            print("      ⚠️ 수집된 데이터가 부족하여 연산을 수행할 수 없습니다.")

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
    print("\n   ▶️ [미국 신용잔고] FINRA 공식 데이터베이스 접속 중...")
    try:
        import requests
        import re
        import cloudscraper
        
        # 가상 브라우저(Playwright) 대신 가볍고 봇 차단을 잘 뚫는 Cloudscraper 가동
        scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
        
        # ==========================================
        # 💡 [1순위] FINRA 공식 홈페이지 (안정성 가장 높음)
        # ==========================================
        try:
            resp = scraper.get("https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics", timeout=15)
            if resp.status_code == 200:
                # <td>Jan-24</td> <td>700,000</td> 형태의 HTML 구조 타겟팅
                m = re.search(r"<td>\s*(?:[A-Za-z]+\s*-\s*\d{2}|\d{4}-\d{2})\s*</td>\s*<td>\s*\$?\s*([\d,]+)\s*</td>", resp.text, re.IGNORECASE)
                if m:
                    val_millions = float(m.group(1).replace(',', ''))
                    us_margin = round(val_millions / 1000000, 3) # 조 달러(Trillion USD)로 환산
                    print(f"      ✅ [1순위/FINRA] 미국 신용잔고 발견: {us_margin} 조 달러")
                else:
                    print("      ⚠️ FINRA 접속은 성공했으나 최신 데이터 패턴을 찾지 못했습니다.")
            else:
                print(f"      ⚠️ FINRA 접속 차단 (상태코드: {resp.status_code})")
        except Exception as e:
            print(f"      ⚠️ FINRA 수집 실패: {e}")

        # ==========================================
        # 💡 [2순위] YCharts (FINRA 서버에 문제가 있을 경우 우회)
        # ==========================================
        if us_margin is None:
            print("      ▶️ 2순위: YCharts 우회 접속 중...")
            try:
                resp_y = scraper.get("https://ycharts.com/indicators/finra_margin_debt", timeout=15)
                # "Last Value 1.304T" 형태의 텍스트에서 숫자와 단위 추출
                m_y = re.search(r"Last\s+Value[\s\S]{1,50}?([\d\.]+)([TBM])", resp_y.text, re.IGNORECASE)
                if m_y:
                    val = float(m_y.group(1))
                    unit = m_y.group(2).upper()
                    
                    if unit == 'T': us_margin = val
                    elif unit == 'B': us_margin = round(val / 1000, 3)
                    elif unit == 'M': us_margin = round(val / 1000000, 3)
                    print(f"      ✅ [2순위/YCharts] 미국 신용잔고 발견: {us_margin} 조 달러")
            except Exception as e:
                print(f"      ⚠️ YCharts 수집 실패: {e}")

    except Exception as e:
        print(f"      ⚠️ 미국 신용잔고 수집 환경 오류: {e}")
        
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
        
        # 💡 핵심 문제 해결: 네이버 금융의 구형 인코딩(EUC-KR) 강제 변환 (한글 깨짐 방지)
        resp.encoding = 'euc-kr' 
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        table = soup.find('table', class_='type_1')
        if table:
            headers_th = table.find_all('th')
            margin_idx = -1
            
            # 한글이 정상적으로 디코딩되었으므로 이제 '신용융자' 단어를 찾을 수 있습니다.
            for i, th in enumerate(headers_th):
                if '신용융자' in th.text:
                    margin_idx = i
                    break
            
            # 만약 네이버 금융 표 헤더가 이미지로 바뀌거나 탐색에 실패할 경우 3번째 칸으로 강제 고정 (대비책)
            if margin_idx == -1:
                margin_idx = 3 
                    
            rows = table.find_all('tr')
            for row in rows:
                cols = row.find_all('td')
                # 첫 칸이 날짜 형식(202X.XX.XX)인 데이터 추출
                if len(cols) > margin_idx and re.match(r"\d{4}\.\d{2}\.\d{2}", cols[0].text.strip()):
                    date_str = cols[0].text.strip()
                    margin_str = cols[margin_idx].text.strip().replace(',', '')
                    
                    try:
                        # 백만 원 -> 조 원 단위 환산
                        kr_margin = round(float(margin_str) / 1000000, 2)
                        print(f"      ✅ [수집 완료] 한국 신용잔고 ({date_str} 기준): {kr_margin} 조 원")
                        break # 첫 번째(가장 최신) 정상 데이터를 찾으면 스캔 종료
                    except ValueError:
                        continue
        else:
            print("      ⚠️ 네이버 금융에서 'class=type_1' 테이블을 찾을 수 없습니다.")
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

def get_monthly_and_special():
    return {
        "Margin_Debt_US": get_us_margin_debt(), 
        "Margin_Debt_KR": get_kr_margin_debt(), 
        "KR_Export": None, 
        "BDI_Index": get_bdi_index() # <- 💡 새로 만든 함수가 여기서 실행되어 BDI 값을 넘깁니다.
    }

# ──────────────────────────────────────────────
# 8. CSV 저장 로직
# ──────────────────────────────────────────────
# 💡 Margin_Debt 필드가 삭제되고 _US 와 _KR 두 개로 분리되었습니다.
FIELDNAMES = [
    "Date", "VIX", "MOVE", "US10Y", "DXY", "USDKRW", "Russell2000", "Copper",
    "High_Yield", "Fear_Greed", "CAPE_PE", "Buffett_US", "Buffett_KR",
    "Margin_Debt_US", "Margin_Debt_KR", "KR_Export", "BDI_Index", "Integrated_Valuation"
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

    # 통합 밸류에이션 (기존 로직)
    integrated_val = None
    if buff_us and cape_pe:
        integrated_val = round(((buff_us / 150) * 50) + ((cape_pe / 35) * 50), 1)

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
        "Integrated_Valuation": integrated_val
    }

    for k, v in row.items():
        if v is None: row[k] = "N/A"

    for k, v in row.items():
        print(f"   {k.ljust(20)} : {v}")

    save_to_csv(row)

if __name__ == "__main__":
    main()
