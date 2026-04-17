import json
import os
import requests
import urllib3
import FinanceDataReader as fdr
from tqdm import tqdm

# 공공데이터포털 SSL 인증서 경고 무시 (한국 공공 API 특성상 가끔 발생하는 에러 방지)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def main():
    db = []
    added_symbols = set()  # 중복 등록 방지용

    def add_to_db(symbol, name, exch):
        if isinstance(symbol, str) and symbol.strip() and symbol not in added_symbols:
            db.append({
                "symbol": symbol.strip(),
                "name": str(name).strip(),
                "exch": exch
            })
            added_symbols.add(symbol.strip())

    print("🇺🇸 1. 미국 주식/ETF 데이터를 수집합니다...")
    try:
        sp500 = fdr.StockListing('S&P500')
        # 🌟 tqdm() 으로 감싸서 진행률 그래프 출력
        for _, row in tqdm(sp500.iterrows(), total=len(sp500), desc="S&P500"):
            add_to_db(row['Symbol'], row['Name'], "US_STOCK")

        for market in ['NASDAQ', 'NYSE', 'AMEX']:
            df = fdr.StockListing(market)
            for _, row in tqdm(df.iterrows(), total=len(df), desc=market):
                add_to_db(row['Symbol'], row['Name'], "US_STOCK")
                
        us_etfs = fdr.StockListing('ETF/US')
        for _, row in tqdm(us_etfs.iterrows(), total=len(us_etfs), desc="US ETF"):
            add_to_db(row['Symbol'], row['Name'], "US_ETF")
    except Exception as e:
        print(f"미국 데이터 가져오기 실패: {e}")

    print("🇰🇷 2. 한국 주식/ETF 데이터를 1차 수집합니다 (FDR 기본)...")
    try:
        krx = fdr.StockListing('KRX')
        for _, row in tqdm(krx.iterrows(), total=len(krx), desc="KRX (KOSPI/KOSDAQ)"):
            sym = str(row['Code'])
            market = str(row.get('Market', 'KRX'))
            suffix = ".KQ" if "KOSDAQ" in market else ".KS"
            add_to_db(f"{sym}{suffix}", row['Name'], market)

        kr_etfs = fdr.StockListing('ETF/KR')
        for _, row in tqdm(kr_etfs.iterrows(), total=len(kr_etfs), desc="KR ETF"):
            add_to_db(f"{str(row['Symbol'])}.KS", row['Name'], "KR_ETF")
    except Exception as e:
        print(f"한국 데이터 1차 가져오기 실패: {e}")

    print("🏛️ 3. 공공데이터포털 API로 누락된 한국 종목을 2차 싹쓸이합니다...")
    # 🌟 보안을 위해 환경변수(GitHub Secrets)에서 API 키를 가져옵니다.
    PUBLIC_API_KEY = os.environ.get('PUBLIC_DATA_API_KEY', '')
    
    if PUBLIC_API_KEY:
        try:
            # numOfRows=10000 으로 한 번의 호출로 한국 주식시장 전체 데이터를 가져옵니다.
            url = f"https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey={PUBLIC_API_KEY}&numOfRows=10000&pageNo=1&resultType=json"
            res = requests.get(url, verify=False, timeout=15)
            
            if res.status_code == 200:
                data = res.json()
                items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
                
                added_from_public = 0
                for item in tqdm(items, desc="공공데이터 매핑 중"):
                    sym = str(item.get('srtnCd'))
                    name = str(item.get('itmsNm'))
                    market = str(item.get('mrktCtg'))
                    suffix = ".KQ" if "KOSDAQ" in market else ".KS"
                    
                    target_sym = f"{sym}{suffix}"
                    if target_sym not in added_symbols:
                        add_to_db(target_sym, name, market)
                        added_from_public += 1
                        
                print(f"   -> 공공데이터포털에서 {added_from_public}개의 누락 종목을 추가로 찾아냈습니다!")
            else:
                print(f"   -> 공공데이터포털 API 에러 (상태코드: {res.status_code})")
        except Exception as e:
            print(f"   -> 공공데이터포털 수집 에러: {e}")
    else:
        print("   -> ⚠️ PUBLIC_DATA_API_KEY가 설정되지 않아 공공데이터 수집은 건너뜁니다.")

    # data 폴더가 없으면 생성
    os.makedirs('data', exist_ok=True)
    
    # JSON 파일로 저장
    with open('data/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        
    print(f"✅ 완료! 총 {len(db)}개의 종목이 data/stocks.json에 저장되었습니다.")

if __name__ == '__main__':
    main()
