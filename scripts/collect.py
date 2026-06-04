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
# 6. 한국 버핏 지수 (IndexerGo 크롤링)
# ──────────────────────────────────────────────
def get_kr_buffett_indicator():
    kr_val = None
    print("\n   ▶️ [한국 버핏지수] IndexerGo 사이트 접속 중...")
    try:
        import re
        import requests
        
        url = "https://www.indexergo.com/series/?frq=D&idxDetail=20104"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        # ==========================================
        # 💡 [1순위] 빠르고 가벼운 Requests 스캔
        # ==========================================
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code == 200:
                # 사용자가 짚어준 `<span class="ms-1 text-lg"> 숫자%</span>` 껍데기 타겟팅
                m = re.search(r"class=[\"'][^>]*ms-1\s+text-lg[^>]*[\"'][^>]*>\s*([\d,]+(?:\.\d+)?)\s*%", resp.text, re.IGNORECASE)
                if m:
                    # 천 단위 콤마(,)가 있을 경우 제거 후 float 변환
                    kr_val = float(m.group(1).replace(',', ''))
                    print(f"      ✅ [1순위/Requests] 한국 버핏 지수 발견: {kr_val}%")
                else:
                    print("      ⚠️ Requests 접속은 성공했으나, 화면에 숫자가 바로 뜨지 않습니다. (동적 렌더링 의심)")
            else:
                print(f"      ⚠️ Requests 접속 차단 (상태코드: {resp.status_code})")
        except Exception as e:
            print(f"      ⚠️ 1순위 통신 에러: {e}")

        # ==========================================
        # 💡 [2순위] 자바스크립트 동적 렌더링 대기 (Playwright)
        # ==========================================
        if kr_val is None:
            print("      ▶️ 1순위 실패. Playwright를 이용해 JS 렌더링을 기다립니다...")
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True)
                    context = browser.new_context(user_agent=headers["User-Agent"])
                    
                    # 속도 향상: 불필요한 이미지/폰트 로딩 차단
                    context.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "media", "font"] else route.continue_())
                    page = context.new_page()

                    page.goto(url, timeout=30000)
                    
                    # 짚어주신 클래스 이름(.ms-1.text-lg)이 화면에 붙을 때까지 최대 15초 대기
                    page.wait_for_selector(".ms-1.text-lg", state="attached", timeout=15000)
                    page.wait_for_timeout(2000) # 숫자 업데이트 안정화 2초 대기
                    
                    html_content = page.content()
                    m2 = re.search(r"class=[\"'][^>]*ms-1\s+text-lg[^>]*[\"'][^>]*>\s*([\d,]+(?:\.\d+)?)\s*%", html_content, re.IGNORECASE)
                    
                    if m2:
                        kr_val = float(m2.group(1).replace(',', ''))
                        print(f"      ✅ [2순위/Playwright] 한국 버핏 지수 발견: {kr_val}%")
                    
                    browser.close()
            except Exception as e:
                print(f"      ⚠️ Playwright 2순위 수집 실패: {e}")

    except Exception as e:
        print(f"      ⚠️ 한국 버핏 지수 환경 오류: {e}")

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
