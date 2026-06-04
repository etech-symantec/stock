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
# 3. Fear & Greed Index (CNN)
# ──────────────────────────────────────────────
def get_fear_greed():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent="Mozilla/5.0")
            page = context.new_page()
            page.goto("https://edition.cnn.com/markets/fear-and-greed", timeout=60000)
            page.wait_for_selector(".market-fng-gauge__dial-number-value", timeout=20000)
            val_text = page.locator(".market-fng-gauge__dial-number-value").first.inner_text()
            browser.close()
            match = re.search(r"(\d+(?:\.\d+)?)", val_text)
            if match: return float(match.group(1))
    except Exception as e:
        print(f"   ⚠️ Fear & Greed 수집 오류: {e}")
    return None

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
# 6. 한국 버핏 지수 (KRX 한국거래소 + FRED 공식 데이터 직접 계산)
# ──────────────────────────────────────────────
def get_kr_buffett_indicator():
    kr_val = None
    print("\n   ▶️ [한국 버핏지수] KRX(한국거래소) + FRED 계산 엔진 가동...")
    try:
        import re
        import requests
        
        total_cap_billion = 0
        
        # ==========================================
        # 1. KRX 한국거래소 시가총액 수집 (Playwright)
        # ==========================================
        print("      ▶️ KRX 공식 데이터 포털 접속 중...")
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                
                # 불필요한 미디어 차단 (속도 향상)
                context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
                page = context.new_page()

                # KRX 메인 페이지 접속
                page.goto("https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd", timeout=40000)
                
                # '시가총액(십억원)' 텍스트가 화면에 렌더링될 때까지 대기
                page.wait_for_selector("text=시가총액(십억원)", state="attached", timeout=20000)
                page.wait_for_timeout(2000) # 테이블 데이터가 완전히 그려질 시간 부여
                
                html_content = page.content()
                
                # 💡 사용자가 제시한 HTML 구조 기반 초정밀 정규식 타겟팅
                # "시가총액(십억원)" 텍스트 뒤에 오는 첫 번째 td(코스피)와 두 번째 td(코스닥)의 숫자를 그룹화
                m = re.search(r"시가총액\(십억원\)[^<]*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>", html_content, re.IGNORECASE)
                
                if m:
                    kospi_val = float(m.group(1).replace(',', ''))
                    kosdaq_val = float(m.group(2).replace(',', ''))
                    total_cap_billion = kospi_val + kosdaq_val
                    
                    print(f"      - [KRX] 코스피 시총: {kospi_val:,.0f} 십억원")
                    print(f"      - [KRX] 코스닥 시총: {kosdaq_val:,.0f} 십억원")
                    print(f"      - [합산] 한국 전체 시가총액: {total_cap_billion:,.0f} 십억원 ({total_cap_billion/1000:,.1f} 조원)")
                else:
                    print("      ⚠️ KRX 접속은 성공했으나 시가총액 데이터를 찾지 못했습니다.")
                    
                browser.close()
        except Exception as e:
            print(f"      ⚠️ KRX 시가총액 수집 실패: {e}")

        # ==========================================
        # 2. FRED 명목 GDP 수집 및 버핏 지수 계산
        # ==========================================
        if total_cap_billion > 0:
            print("      ▶️ FRED 공공 데이터(한국 명목 GDP) 접속 중...")
            resp_gdp = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=KORNGDP", timeout=10)
            
            # CSV 유효성 검증
            lines_gdp = [line for line in resp_gdp.text.split('\n') if ',' in line and line[0].isdigit()]
            
            if lines_gdp:
                gdp_date, gdp_val = lines_gdp[-1].split(',')
                if gdp_val.strip() == '.': gdp_date, gdp_val = lines_gdp[-2].split(',')
                
                # FRED의 단위 역시 '10억 원(십억원, Billion KRW)'이므로 단위가 완벽히 일치합니다.
                gdp_billion = float(gdp_val)
                print(f"      - [FRED] 한국 명목 GDP ({gdp_date}): {gdp_billion:,.0f} 십억원 ({gdp_billion/1000:,.1f} 조원)")
                
                # 수식 산출: (시가총액 / GDP) * 100
                kr_val = round((total_cap_billion / gdp_billion) * 100, 1)
                print(f"      ✅ [계산 완료] 한국 버핏 지수: ({total_cap_billion:,.0f} / {gdp_billion:,.0f}) * 100 = {kr_val}%")
            else:
                print("      ⚠️ FRED에서 GDP 데이터를 가져오지 못했습니다.")

    except Exception as e:
        print(f"      ⚠️ 한국 버핏 지수 전체 연산 실패: {e}")

    if kr_val is None:
         print("      ❌ 한국 버핏 지수를 수집하지 못했습니다. N/A로 기록됩니다.")

    return kr_val

# ──────────────────────────────────────────────
# 7. 월간/특수 데이터
# ──────────────────────────────────────────────
def get_monthly_and_special():
    return {"Margin_Debt": None, "KR_Export": None, "BDI_Index": None}

# ──────────────────────────────────────────────
# 8. CSV 저장 로직
# ──────────────────────────────────────────────
# ⭐ Buffett_Global을 Buffett_KR로 변경
FIELDNAMES = [
    "Date", "VIX", "MOVE", "US10Y", "DXY", "USDKRW", "Russell2000", "Copper",
    "High_Yield", "Fear_Greed", "CAPE_PE", "Buffett_US", "Buffett_KR",
    "Margin_Debt", "KR_Export", "BDI_Index", "Integrated_Valuation"
]

def save_to_csv(row: dict):
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

    # 통합 밸류에이션 (단순 예시)
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
        "Buffett_KR": buff_kr, # ⭐ 새로 추가된 한국 버핏지수 매핑
        "Margin_Debt": special.get("Margin_Debt"),
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
