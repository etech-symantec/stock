import json
import os
import FinanceDataReader as fdr

def main():
    db = []
    added_symbols = set()  # 중복 등록 방지용

    def add_to_db(symbol, name, exch):
        # 문자열인지 확인하고, 빈 값이나 중복 심볼 제외
        if isinstance(symbol, str) and symbol.strip() and symbol not in added_symbols:
            db.append({
                "symbol": symbol.strip(),
                "name": str(name).strip(),
                "exch": exch
            })
            added_symbols.add(symbol)

    print("🇺🇸 1. 미국 주식 (S&P500 + NASDAQ + NYSE 전체) 데이터를 가져옵니다...")
    try:
        # 가장 중요한 S&P 500 기업 500개를 우선적으로 검색망 상단에 배치하기 위해 먼저 추가
        sp500 = fdr.StockListing('S&P500')
        for _, row in sp500.iterrows():
            add_to_db(row['Symbol'], row['Name'], "US_STOCK")

        # 나스닥(NASDAQ)과 뉴욕증권거래소(NYSE) 상장 종목 전체 수집 (약 6,000여개)
        nasdaq = fdr.StockListing('NASDAQ')
        nyse = fdr.StockListing('NYSE')
        
        for df in [nasdaq, nyse]:
            for _, row in df.iterrows():
                # S&P500에 이미 들어간 종목은 add_to_db 내부의 set에 의해 자동으로 중복 제외됨
                add_to_db(row['Symbol'], row['Name'], "US_STOCK")
                
    except Exception as e:
        print(f"미국 주식 가져오기 실패: {e}")

    print("🇰🇷 2. 한국 주식 (KOSPI/KOSDAQ 시총 상위 3000개) 데이터를 가져옵니다...")
    try:
        krx = fdr.StockListing('KRX')
        # 시가총액(Marcap) 기준으로 내림차순 정렬
        if 'Marcap' in krx.columns:
            krx = krx.sort_values('Marcap', ascending=False)
            
        for _, row in krx.head(3000).iterrows():
            sym = str(row['Code'])
            market = str(row.get('Market', 'KRX'))
            # 코스닥은 .KQ, 코스피/기타는 .KS (야후 파이낸스 기준)
            suffix = ".KQ" if "KOSDAQ" in market else ".KS"
            add_to_db(f"{sym}{suffix}", row['Name'], market)
    except Exception as e:
        print(f"한국 주식 가져오기 실패: {e}")

    print("🦅 3. 미국 ETF (거래량 상위 500개) 데이터를 가져옵니다...")
    try:
        us_etfs = fdr.StockListing('ETF/US')
        # 거래량이 높은 순서대로 주요 ETF 추출
        if 'Volume' in us_etfs.columns:
            us_etfs = us_etfs.sort_values('Volume', ascending=False)
            
        for _, row in us_etfs.head(500).iterrows():
            add_to_db(row['Symbol'], row['Name'], "US_ETF")
    except Exception as e:
        print(f"미국 ETF 가져오기 실패: {e}")

    print("🐯 4. 한국 ETF (거래량 상위 500개) 데이터를 가져옵니다...")
    try:
        kr_etfs = fdr.StockListing('ETF/KR')
        # 거래량이 높은 순서대로 주요 ETF 추출
        if 'Volume' in kr_etfs.columns:
            kr_etfs = kr_etfs.sort_values('Volume', ascending=False)
            
        for _, row in kr_etfs.head(500).iterrows():
            sym = str(row['Symbol'])
            # 한국 ETF는 야후 파이낸스에서 모두 코스피(.KS)로 취급됨
            add_to_db(f"{sym}.KS", row['Name'], "KR_ETF")
    except Exception as e:
        print(f"한국 ETF 가져오기 실패: {e}")

    print("🪙 5. 암호화폐 및 커스텀 추가 데이터를 가져옵니다...")
    extras = [
        {"symbol": "BTC-USD", "name": "Bitcoin (비트코인)", "exch": "CRYPTO"},
        {"symbol": "ETH-USD", "name": "Ethereum (이더리움)", "exch": "CRYPTO"},
        {"symbol": "SOL-USD", "name": "Solana (솔라나)", "exch": "CRYPTO"}
    ]
    for item in extras:
        add_to_db(item['symbol'], item['name'], item['exch'])

    # data 폴더가 없으면 생성
    os.makedirs('data', exist_ok=True)
    
    # JSON 파일로 저장
    with open('data/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        
    print(f"✅ 완료! 총 {len(db)}개의 종목이 data/stocks.json에 저장되었습니다.")

if __name__ == '__main__':
    main()
