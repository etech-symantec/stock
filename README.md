# 📊 시장 지표 자동 수집기

매일 오전 8시 (KST) GitHub Actions로 4개 시장 지표를 자동 수집하고 CSV에 기록합니다.

## 수집 지표

| 지표 | 출처 | 비고 |
|------|------|------|
| TQQQ 가격 | Yahoo Finance (yfinance) | 미국 시장 전일 종가 |
| 버핏지수 | gurufocus.com | 미국 시가총액 / GDP (%) |
| Fear & Greed Index | CNN Markets | 0(극단적 공포) ~ 100(극단적 탐욕) |
| RSI(14) | yfinance 계산 | TQQQ 14일 RSI |

## 복합 지수 계산

각 지표를 **매수 신호 강도 (0~1)**로 정규화한 뒤 곱셈:

```
복합 지수 = score(버핏) × score(F&G) × score(RSI) × 1000
```

- **버핏지수**: 낮을수록 저평가 → 점수 높음
- **F&G Index**: 낮을수록 공포(매수기회) → 점수 높음
- **RSI**: 30 이하 과매도 → 점수 높음
- 결과 범위: 0 ~ 1000 (높을수록 강한 매수 신호)

## 파일 구조

```
.github/
  workflows/
    daily_collect.yml   # GitHub Actions 스케줄 워크플로우
scripts/
  collect.py            # 데이터 수집 스크립트
data/
  indicators.csv        # 누적 데이터 (날짜별)
requirements.txt
```

## 실행 방법

### 자동 실행
GitHub Actions가 매일 오전 8시 KST에 자동 실행합니다.

### 수동 실행
GitHub 저장소 → **Actions** 탭 → `Daily Market Data Collection` → **Run workflow**

### 로컬 실행
```bash
pip install -r requirements.txt
playwright install chromium
python scripts/collect.py
```

## 데이터 예시 (`data/indicators.csv`)

```csv
Date,TQQQ,Buffett_Indicator,Fear_Greed,RSI_14,Composite_Index
2025-01-15,45.23,178.5,35.2,28.3,312.00
2025-01-16,47.10,179.0,38.0,32.1,198.00
```
