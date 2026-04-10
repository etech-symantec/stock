import json
import os
import FinanceDataReader as fdr

def main():
    db = []
    
    print("🇺🇸 미국 주식(S&P 500) 데이터를 가져옵니다...")
    # S&P 500 (미국 시총 상위 500여개) + 나스닥 100 등 활용 가능
    # 여기서는 S&P500 전체와 나스닥 상위 종목을 섞어 약 1000개를 추출합니다.
    sp500 = fdr.StockListing('S&P500')
    for _, row in sp500.iterrows():
        db.append({
            "symbol": row['Symbol'],
            "name": row['Name'],
            "exch": "US"
        })
        
    print("🇰🇷 한국 주식(KOSPI/KOSDAQ) 데이터를 가져옵니다...")
    # 한국 거래소 전체 종목 가져오기
    krx = fdr.StockListing('KRX')
    
    # 시가총액(Marcap) 기준으로 내림차순 정렬 후 상위 1000개 자르기
    if 'Marcap' in krx.columns:
        krx = krx.sort_values('Marcap', ascending=False)
    
    krx_top1000 = krx.head(1000)
    
    for _, row in krx_top1000.iterrows():
        sym = row['Code']
        market = row.get('Market', 'KRX')
        
        # 야후 파이낸스 티커 형식에 맞게 접미사(.KS, .KQ) 붙이기
        if market == "KOSPI":
            suffix = ".KS"
        elif market == "KOSDAQ" or market == "KOSDAQ GLOBAL":
            suffix = ".KQ"
        else:
            suffix = ".KS" # 기본값
            
        db.append({
            "symbol": f"{sym}{suffix}",
            "name": row['Name'],
            "exch": market
        })
        
    print("🪙 주요 ETF 및 암호화폐 데이터를 추가합니다...")
    extras = [
        {"symbol": "TQQQ", "name": "ProShares UltraPro QQQ", "exch": "ETF"},
        {"symbol": "SQQQ", "name": "ProShares UltraPro Short QQQ", "exch": "ETF"},
        {"symbol": "SOXL", "name": "Direxion Daily Semi Bull 3X", "exch": "ETF"},
        {"symbol": "SOXS", "name": "Direxion Daily Semi Bear 3X", "exch": "ETF"},
        {"symbol": "SCHD", "name": "Schwab US Dividend Equity ETF", "exch": "ETF"},
        {"symbol": "BTC-USD", "name": "Bitcoin", "exch": "CRYPTO"},
        {"symbol": "ETH-USD", "name": "Ethereum", "exch": "CRYPTO"},
    ]
    db.extend(extras)
    
    # data 폴더가 없으면 생성
    os.makedirs('data', exist_ok=True)
    
    # JSON 파일로 저장
    with open('data/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        
    print(f"✅ 완료! 총 {len(db)}개의 종목이 data/stocks.json에 저장되었습니다.")

if __name__ == '__main__':
    main()
