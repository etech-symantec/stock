"""
collect.py
----------
매일 자동으로 4개 시장 지표를 수집하고 data/indicators.csv에 저장합니다.

지표:
  - TQQQ 가격       (yfinance)
  - 버핏지수        (gurufocus.com / Playwright)
  - Fear & Greed    (CNN JSON API)
  - RSI(14)         (yfinance로 S&P 500 직접 계산)

복합 지수:
  각 지표를 0~1 매수 점수로 정규화한 뒤 곱셈 → 0~1000 스케일로 표현
  높을수록 매수 신호 강함
"""

import os
import csv
import re
import requests
import yfinance as yf
from datetime import date
from pathlib import Path


# ──────────────────────────────────────────────
# 1. TQQQ 가격 + S&P 500 RSI(14)
# ──────────────────────────────────────────────

def get_tqqq_and_sp500_rsi(rsi_period: int = 14):
    """yfinance로 TQQQ 종가 수집 및 S&P 500(^GSPC) RSI(14) 계산"""
    
    # 1. TQQQ 종가 가져오기
    tqqq = yf.Ticker("TQQQ")
    tqqq_hist = tqqq.history(period="5d")
    if tqqq_hist.empty:
        raise ValueError("TQQQ 데이터를 가져올 수 없습니다.")
    price = round(float(tqqq_hist["Close"].iloc[-1]), 2)

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
    """CNN 공개 JSON API에서 Fear & Greed 지수 수집"""
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Referer": "https://edition.cnn.com/",
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    score = float(resp.json()["fear_and_greed"]["score"])
    return round(score, 1)


# ──────────────────────────────────────────────
# 3. 버핏지수 (gurufocus)
# ──────────────────────────────────────────────

def get_buffett_indicator():
    """
    gurufocus.com에서 Buffett Indicator(%) 수집
    JavaScript 렌더링이 필요하므로 Playwright(headless Chromium) 사용
    """
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            )
            page = context.new_page()
            try:
                page.goto(
                    "https://www.gurufocus.com/stock-market-valuations.php",
                    timeout=60_000,
                )
                page.wait_for_load_state("networkidle", timeout=30_000)
                page.wait_for_timeout(3_000)

                body_text = page.inner_text("body")

                # 패턴 1: "Buffett Indicator: XXX%"
                patterns = [
                    r"Buffett\s+Indicator[^\d]{0,40}(\d{2,3}(?:\.\d+)?)\s*%",
                    r"US\s+Market\s+Valuation[^\d]{0,40}(\d{2,3}(?:\.\d+)?)\s*%",
                    r"Total\s+Market\s+Cap[^\d]{0,60}(\d{2,3}(?:\.\d+)?)\s*%",
                ]
                for pat in patterns:
                    m = re.search(pat, body_text, re.IGNORECASE | re.DOTALL)
                    if m:
                        val = float(m.group(1))
                        if 50 <= val <= 600:   # 합리적 범위 체크
                            return round(val, 1)

                # 패턴 2: JS 평가로 %가 포함된 숫자 탐색
                result = page.evaluate("""() => {
                    const walker = document.createTreeWalker(
                        document.body, NodeFilter.SHOW_TEXT
                    );
                    while (walker.nextNode()) {
                        const t = walker.currentNode.textContent.trim();
                        const m = t.match(/^(\\d{2,3}(?:\\.\\d+)?)\\s*%$/);
                        if (m) {
                            const v = parseFloat(m[1]);
                            if (v >= 50 && v <= 600) return v;
                        }
                    }
                    return null;
                }""")
                if result:
                    return round(float(result), 1)

            finally:
                browser.close()

    except Exception as e:
        print(f"  ⚠️  Playwright 오류: {e}")

    return None


# ──────────────────────────────────────────────
# 4. 복합 지수 계산 (곱셈)
# ──────────────────────────────────────────────

def _score_buffett(v) -> float:
    """버핏지수 → 매수 점수 (낮을수록 저평가 = 점수 높음)"""
    if v is None:
        return 0.5
    if v < 100:   return 1.0
    if v < 130:   return 0.80
    if v < 160:   return 0.60
    if v < 200:   return 0.40
    if v < 250:   return 0.20
    return 0.10

def _score_fg(v) -> float:
    """Fear & Greed → 매수 점수 (공포일수록 점수 높음)"""
    if v is None:
        return 0.5
    return round((100 - float(v)) / 100, 4)

def _score_rsi(v) -> float:
    """RSI → 매수 점수 (과매도일수록 점수 높음)"""
    if v is None:
        return 0.5
    v = float(v)
    if v < 30:   return 1.0
    if v < 40:   return 0.80
    if v < 50:   return 0.60
    if v < 60:   return 0.40
    if v < 70:   return 0.25
    return 0.10

def calculate_composite(buffett, fg, rsi) -> float:
    """
    복합 지수 = score_buffett × score_fg × score_rsi × 1000
    범위: 0 ~ 1000  (높을수록 매수 신호)
    """
    s = _score_buffett(buffett) * _score_fg(fg) * _score_rsi(rsi) * 1000
    return round(s, 2)


# ──────────────────────────────────────────────
# 5. CSV 저장 (당일 데이터 있으면 덮어쓰기)
# ──────────────────────────────────────────────

FIELDNAMES = ["Date", "TQQQ", "Buffett_Indicator", "Fear_Greed", "RSI_14", "Composite_Index"]

def save_to_csv(row: dict):
    csv_path = Path("data/indicators.csv")
    csv_path.parent.mkdir(exist_ok=True)

    rows = []
    today = row["Date"]
    updated = False

    if csv_path.exists():
        with open(csv_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for existing in reader:
                if existing.get("Date") == today:
                    rows.append(row)  # 오늘 데이터 덮어쓰기
                    updated = True
                else:
                    rows.append(existing)

    if not updated:
        rows.append(row)

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n✅ 저장 완료 → {csv_path}")


# ──────────────────────────────────────────────
# main
# ──────────────────────────────────────────────

def main():
    today = date.today().strftime("%Y-%m-%d")
    print(f"\n{'='*50}")
    print(f"  📊 시장 데이터 수집 시작: {today}")
    print(f"{'='*50}\n")

    # ① TQQQ + S&P 500 RSI
    print("▶ TQQQ 가격 & S&P 500 RSI(14) 수집 중...")
    try:
        tqqq, rsi = get_tqqq_and_sp500_rsi()
        print(f"   TQQQ        : ${tqqq}")
        print(f"   S&P 500 RSI : {rsi}")
    except Exception as e:
        print(f"   ❌ 오류: {e}")
        tqqq, rsi = None, None

    # ② Fear & Greed
    print("\n▶ Fear & Greed Index 수집 중...")
    try:
        fg = get_fear_greed()
        print(f"   F&G         : {fg}")
    except Exception as e:
        print(f"   ❌ 오류: {e}")
        fg = None

    # ③ 버핏지수
    print("\n▶ 버핏지수 수집 중 (JS 렌더링, 수십 초 소요)...")
    try:
        buffett = get_buffett_indicator()
        print(f"   버핏        : {buffett}%")
    except Exception as e:
        print(f"   ❌ 오류: {e}")
        buffett = None

    # ④ 복합 지수
    composite = calculate_composite(buffett, fg, rsi)

    # ⑤ 저장
    row = {
        "Date":               today,
        "TQQQ":               tqqq      if tqqq     is not None else "N/A",
        "Buffett_Indicator":  buffett   if buffett  is not None else "N/A",
        "Fear_Greed":         fg        if fg       is not None else "N/A",
        "RSI_14":             rsi       if rsi      is not None else "N/A",
        "Composite_Index":    composite,
    }

    save_to_csv(row)

    print("\n📋 최종 결과:")
    print(f"   날짜        : {row['Date']}")
    print(f"   TQQQ        : {row['TQQQ']}")
    print(f"   버핏지수    : {row['Buffett_Indicator']}")
    print(f"   F&G Index   : {row['Fear_Greed']}")
    print(f"   S&P 500 RSI : {row['RSI_14']}")
    print(f"   복합 지수   : {row['Composite_Index']}  (0~1000, 높을수록 매수)")
    print(f"\n{'='*50}\n")


if __name__ == "__main__":
    main()
