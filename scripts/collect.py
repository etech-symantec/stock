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
    """VIX, MOVE, 10년물, 달러, 환율, 러셀2000, 구리"""
    symbols = {
        "VIX": "^VIX",                  # VIX 지수
        "MOVE": "^MOVE",                # ICE BofA MOVE 지수
        "US10Y": "^TNX",                # 미국 10년물 국채 금리
        "DXY": "DX-Y.NYB",              # 달러 인덱스
        "USDKRW": "KRW=X",              # 원/달러 환율
        "Russell2000": "^RUT",          # 러셀 2000
        "Copper": "HG=F",               # 구리 선물 가격
    }
    results = {}
    for name, ticker in symbols.items():
        try:
            hist = yf.Ticker(ticker).history(period="5d")
            if not hist.empty:
                results[name] = round(float(hist["Close"].iloc[-1]), 2)
            else:
                results[name] = None
        except Exception as e:
            print(f"   ⚠️ {name} 수집 오류: {e}")
            results[name] = None
    return results

# ──────────────────────────────────────────────
# 2. 하이일드 스프레드 (FRED CSV 연동)
# ──────────────────────────────────────────────
def get_high_yield_spread():
    """ICE BofA US High Yield Index Option-Adjusted Spread"""
    try:
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        lines = [line for line in resp.text.split('\n') if line.strip()]
        val = lines[-1].split(',')[-1] # 가장 마지막 데이터
        if val != '.':
            return float(val)
    except Exception as e:
        print(f"   ⚠️ 하이일드 수집 오류: {e}")
    return None

# ──────────────────────────────────────────────
# 3. Fear & Greed Index (CNN)
# ──────────────────────────────────────────────
def get_fear_greed():
    try:
        url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
        headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        resp = requests.get(url, headers=headers, timeout=10)
        return round(float(resp.json()["fear_and_greed"]["score"]), 1)
    except:
        return None

# ──────────────────────────────────────────────
# 4. CAPE PE (Shiller PE) - multpl.com 크롤링
# ──────────────────────────────────────────────
def get_cape_pe():
    try:
        url = "https://www.multpl.com/shiller-pe"
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        soup = BeautifulSoup(resp.text, 'html.parser')
        val_text = soup.find(id="estimate").text.strip().replace('\n', '').replace('+', '')
        return round(float(val_text), 2)
    except Exception as e:
        print(f"   ⚠️ CAPE PE 수집 오류: {e}")
    return None

# ──────────────────────────────────────────────
# 5. 버핏 지수 (미국 & 글로벌) - Playwright
# ──────────────────────────────────────────────
def get_buffett_indicators():
    us_val = None
    global_val = None
    try:
        from playwright.sync_api import sync_playwright
        import re
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()

            # 5-1. 미국 버핏 지수
            try:
                page.goto("https://www.gurufocus.com/stock-market-valuations.php", timeout=60000)
                page.wait_for_load_state("networkidle", timeout=30000)
                page.wait_for_timeout(3000)
                
                # 💡 핵심: 태그가 벗겨진 텍스트 대신 '전체 HTML 소스코드'를 가져옵니다.
                html_source = page.content()
                
                # 💡 사용자가 발견한 HTML 태그를 기반으로 정밀 타겟팅
                patterns_us = [
                    # 1순위: Buffett Indicator 글자 근처의 text-(색상) 및 fw-bold 태그 내부 숫자 추출
                    # (시장이 폭락하면 글자색이 text-danger에서 text-success로 바뀔 수 있으므로 색상 이름은 가변 처리)
                    r"Buffett\s+Indicator[\s\S]{1,400}?<span[^>]*class=[\"'][^>]*text-[a-z]+[^>]*[\"'][^>]*>\s*<span[^>]*class=[\"'][^>]*fw-bold[^>]*[\"'][^>]*>\s*(\d{2,4}(?:\.\d+)?)\s*%",
                    
                    # 2순위: 혹시 색상 태그가 사라지고 fw-bold 태그만 남을 경우 방어
                    r"Buffett\s+Indicator[\s\S]{1,400}?<span[^>]*class=[\"'][^>]*fw-bold[^>]*[\"'][^>]*>\s*(\d{2,4}(?:\.\d+)?)\s*%",
                    
                    # 3순위: US Market Valuation 이라는 제목으로 적혀있을 경우
                    r"US\s+Market\s+Valuation[\s\S]{1,400}?<span[^>]*class=[\"'][^>]*fw-bold[^>]*[\"'][^>]*>\s*(\d{2,4}(?:\.\d+)?)\s*%"
                ]
                
                for pat in patterns_us:
                    m_us = re.search(pat, html_source, re.IGNORECASE)
                    if m_us:
                        us_val = float(m_us.group(1))
                        break
            except Exception as e:
                print(f"   ⚠️ 미국 버핏 지수 파싱 오류: {e}")

            # 5-2. 글로벌 버핏 지수
            try:
                page.goto("https://www.gurufocus.com/global-market-valuation.php", timeout=60000)
                page.wait_for_load_state("networkidle", timeout=30000)
                page.wait_for_timeout(3000)
                
                html_source_gl = page.content()
                
                # 글로벌 지수도 HTML 태그 기반으로 추출 방식 통일
                patterns_gl = [
                    r"Ratio\s+of\s+Total\s+Market\s+Cap\s+over\s+GDP[\s\S]{1,400}?<span[^>]*class=[\"'][^>]*text-[a-z]+[^>]*[\"'][^>]*>\s*<span[^>]*class=[\"'][^>]*fw-bold[^>]*[\"'][^>]*>\s*(\d{2,4}(?:\.\d+)?)\s*%",
                    r"Ratio\s+of\s+Total\s+Market\s+Cap\s+over\s+GDP[\s\S]{1,400}?<span[^>]*class=[\"'][^>]*fw-bold[^>]*[\"'][^>]*>\s*(\d{2,4}(?:\.\d+)?)\s*%"
                ]
                
                for pat in patterns_gl:
                    m_gl = re.search(pat, html_source_gl, re.IGNORECASE)
                    if m_gl: 
                        global_val = float(m_gl.group(1))
                        break
            except Exception as e:
                print(f"   ⚠️ 글로벌 버핏 지수 파싱 오류: {e}")

            browser.close()
    except Exception as e:
        print(f"   ⚠️ 버핏 지수 Playwright 실행 환경 오류: {e}")
        
    return us_val, global_val

# ──────────────────────────────────────────────
# 6. 월간/특수 데이터 (Mockup or Placeholder)
# ──────────────────────────────────────────────
def get_monthly_and_special():
    """
    BDI, 신용잔고, 수출데이터는 매일 실시간 수집이 어렵거나 월 1회 발표됩니다.
    실제 프로젝트에서는 별도의 유료 API(TradingEconomics 등)나 
    한국은행 Open API 등을 붙여야 하므로 현재는 None 또는 기본값 처리합니다.
    """
    return {
        "Margin_Debt": None,   # FINRA 월간 발표 데이터
        "KR_Export": None,     # 산업통상자원부 월간 데이터
        "BDI_Index": None,     # 무료 API 부재 (웹 크롤링 시 차단 잦음)
    }

# ──────────────────────────────────────────────
# 7. CSV 저장 로직
# ──────────────────────────────────────────────
# 필드명 대거 확장
FIELDNAMES = [
    "Date", "VIX", "MOVE", "US10Y", "DXY", "USDKRW", "Russell2000", "Copper",
    "High_Yield", "Fear_Greed", "CAPE_PE", "Buffett_US", "Buffett_Global",
    "Margin_Debt", "KR_Export", "BDI_Index", "Integrated_Valuation"
]

def save_to_csv(row: dict):
    csv_path = Path("data/indicators.csv")
    csv_path.parent.mkdir(exist_ok=True)
    rows = []
    
    if csv_path.exists():
        with open(csv_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            # 새 필드가 기존 CSV에 없을 수 있으므로 필드 일치 작업 필요
            for existing in reader:
                if existing.get("Date") != row["Date"]:
                    rows.append(existing)
                    
    rows.append(row)

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        # 누락된 키는 'N/A'로 채움
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

    print("▶ 1. Yahoo Finance 지표 수집 중...")
    yf_data = get_yfinance_indicators()
    
    print("▶ 2. 하이일드 스프레드 수집 중...")
    high_yield = get_high_yield_spread()
    
    print("▶ 3. Fear & Greed 수집 중...")
    fg = get_fear_greed()
    
    print("▶ 4. CAPE PE 수집 중...")
    cape_pe = get_cape_pe()
    
    print("▶ 5. 버핏 지수(미국/글로벌) 수집 중...")
    buff_us, buff_gl = get_buffett_indicators()
    
    print("▶ 6. 특수/월간 데이터 세팅 중...")
    special = get_monthly_and_special()

    # 통합 벨류에이션 (단순 예시: 버핏과 CAPE를 조합한 가상 지수 계산)
    # 실제 본인만의 로직(예: (Buffett/150 + CAPE/30)*50)으로 커스텀 가능
    integrated_val = None
    if buff_us and cape_pe:
        integrated_val = round(((buff_us / 150) * 50) + ((cape_pe / 35) * 50), 1)

    # 데이터 병합
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
        "Buffett_Global": buff_gl,
        "Margin_Debt": special.get("Margin_Debt"),
        "KR_Export": special.get("KR_Export"),
        "BDI_Index": special.get("BDI_Index"),
        "Integrated_Valuation": integrated_val
    }

    # None 값 N/A 처리
    for k, v in row.items():
        if v is None: row[k] = "N/A"

    # 수집 결과 콘솔 출력
    for k, v in row.items():
        print(f"   {k.ljust(20)} : {v}")

    save_to_csv(row)

if __name__ == "__main__":
    main()
