"""
collect.py
----------
매일 자동으로 여러 시장 지표를 수집하고 data/indicators.csv에 저장합니다.
"""

import os
import csv
import re
import requests
import yfinance as yf
from datetime import date
from pathlib import Path

# 🎯 수집을 원하는 주식 티커들을 여기에 추가/수정하세요
TARGET_TICKERS = ["TQQQ", "SOXL", "SPY", "QQQ", "AAPL", "TSLA"]

# ──────────────────────────────────────────────
# 1. 개별 종목 가격 + S&P 500 RSI(14)
# ──────────────────────────────────────────────
def get_stock_and_sp500_rsi(ticker_symbol: str, rsi_period: int = 14):
    """yfinance로 대상 종목 종가 수집 및 S&P 500(^GSPC) RSI(14) 계산"""
    
    # 1. 대상 종목 종가 가져오기
    ticker = yf.Ticker(ticker_symbol)
    ticker_hist = ticker.history(period="5d")
    if ticker_hist.empty:
        raise ValueError(f"{ticker_symbol} 데이터를 가져올 수 없습니다.")
    price = round(float(ticker_hist["Close"].iloc[-1]), 2)

    # 2. S&P 500(^GSPC) RSI 계산
    sp500 = yf.Ticker("^GSPC")
    sp500_hist = sp500.history(period=f"{rsi_period + 25}d")
    if sp500_hist.empty:
        raise ValueError("S&P 500 데이터를 가져올 수 없습니다.")

    delta = sp500_hist["Close"].diff()
    gain  = delta.clip(lower=0).rolling(window=rsi_period).mean()
    loss  = (-delta.clip(upper=0)).rolling(window=rsi_period).mean()
    rs    = gain / loss
    rsi   = 100 - (100 / (1 + rs))
    rsi_value = round(float(rsi.iloc[-1]), 2)

    return price, rsi_value

# ──────────────────────────────────────────────
# 2. Fear & Greed Index
# ──────────────────────────────────────────────
def get_fear_greed() -> float:
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://edition.cnn.com/",
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return round(float(resp.json()["fear_and_greed"]["score"]), 1)

# ──────────────────────────────────────────────
# 3. 버핏지수 (gurufocus)
# ──────────────────────────────────────────────
def get_buffett_indicator():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            page = context.new_page()
            try:
                page.goto("https://www.gurufocus.com/stock-market-valuations.php", timeout=60_000)
                page.wait_for_load_state("networkidle", timeout=30_000)
                page.wait_for_timeout(3_000)
                body_text = page.inner_text("body")

                patterns = [
                    r"Buffett\s+Indicator[^\d]{0,40}(\d{2,3}(?:\.\d+)?)\s*%",
                    r"US\s+Market\s+Valuation[^\d]{0,40}(\d{2,3}(?:\.\d+)?)\s*%",
                    r"Total\s+Market\s+Cap[^\d]{0,60}(\d{2,3}(?:\.\d+)?)\s*%",
                ]
                for pat in patterns:
                    m = re.search(pat, body_text, re.IGNORECASE | re.DOTALL)
                    if m:
                        val = float(m.group(1))
                        if 50 <= val <= 600: return round(val, 1)
            finally:
                browser.close()
    except Exception as e:
        print(f"  ⚠️  Playwright 오류: {e}")
    return None

# ──────────────────────────────────────────────
# 4. 복합 지수 계산 (곱셈)
# ──────────────────────────────────────────────
def _score_buffett(v) -> float:
    if v is None: return 0.5
    if v < 100: return 1.0
    if v < 130: return 0.80
    if v < 160: return 0.60
    if v < 200: return 0.40
    if v < 250: return 0.20
    return 0.10

def _score_fg(v) -> float:
    if v is None: return 0.5
    return round((100 - float(v)) / 100, 4)

def _score_rsi(v) -> float:
    if v is None: return 0.5
    v = float(v)
    if v < 30: return 1.0
    if v < 40: return 0.80
    if v < 50: return 0.60
    if v < 60: return 0.40
    if v < 70: return 0.25
    return 0.10

def calculate_composite(buffett, fg, rsi) -> float:
    s = _score_buffett(buffett) * _score_fg(fg) * _score_rsi(rsi) * 1000
    return round(s, 2)

# ──────────────────────────────────────────────
# 5. CSV 저장 (다중 종목 처리)
# ──────────────────────────────────────────────
FIELDNAMES = ["Date", "Ticker", "Price", "Buffett_Indicator", "Fear_Greed", "RSI_14", "Composite_Index"]

def save_to_csv(new_rows: list):
    csv_path = Path("data/indicators.csv")
    csv_path.parent.mkdir(exist_ok=True)

    existing_rows = []
    today = new_rows[0]["Date"]

    if csv_path.exists():
        with open(csv_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # 오늘 날짜의 데이터는 버림 (새로운 데이터로 덮어쓰기 위함)
                if row.get("Date") != today:
                    existing_rows.append(row)

    existing_rows.extend(new_rows)

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(existing_rows)

    print(f"\n✅ 저장 완료 → {csv_path} (총 {len(new_rows)}개 종목 갱신)")

# ──────────────────────────────────────────────
# main
# ──────────────────────────────────────────────
def main():
    today = date.today().strftime("%Y-%m-%d")
    print(f"\n{'='*50}\n  📊 시장 데이터 수집 시작: {today}\n{'='*50}\n")

    # 공통 지표 수집 (버핏 지수, F&G는 모든 종목에 동일하게 적용됨)
    print("▶ 공통 지표 수집 중...")
    fg = get_fear_greed()
    buffett = get_buffett_indicator()
    print(f"   F&G: {fg} / 버핏지수: {buffett}%\n")

    new_rows = []
    for ticker in TARGET_TICKERS:
        print(f"▶ [{ticker}] 데이터 수집 중...")
        try:
            price, rsi = get_stock_and_sp500_rsi(ticker)
            composite = calculate_composite(buffett, fg, rsi)
            
            new_rows.append({
                "Date": today,
                "Ticker": ticker,
                "Price": price if price is not None else "N/A",
                "Buffett_Indicator": buffett if buffett is not None else "N/A",
                "Fear_Greed": fg if fg is not None else "N/A",
                "RSI_14": rsi if rsi is not None else "N/A",
                "Composite_Index": composite,
            })
            print(f"   성공 - 가격: ${price}, RSI: {rsi}, 복합지수: {composite}")
        except Exception as e:
            print(f"   ❌ 오류 발생: {e}")

    if new_rows:
        save_to_csv(new_rows)
    print(f"\n{'='*50}\n")

if __name__ == "__main__":
    main()
