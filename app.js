// ==========================================
// 1. 핵심 유틸 및 데이터 초기화
// ==========================================
const STORE_KEY = 'stockwatch_real_v69'; 

function loadState() {
  try {
    let s = localStorage.getItem(STORE_KEY);
    if (!s) { let oldS = localStorage.getItem('stockwatch_real_v68'); if(oldS) s = oldS; }
    if (s) {
      let parsed = JSON.parse(s);
      if(!parsed.owners) {
         parsed.owners = {
           user1: { name: parsed.ownerNames?.user1 || '소유자1', color: '#7c6af7', icon: '👤' },
           user2: { name: parsed.ownerNames?.user2 || '소유자2', color: '#00c87a', icon: '👤' }
         };
      }
      if(!parsed.oldNames) parsed.oldNames = {}; 
      if(!parsed.riaAccounts) parsed.riaAccounts = [];
      if(!parsed.riaExcludeSymbols) parsed.riaExcludeSymbols = [];
      if(!parsed.customOverseasAssets) parsed.customOverseasAssets = []; // 🌟 수동 지정 해외자산 추가
      if(parsed.transactions) {
          parsed.transactions.forEach(tx => { tx.date = formatDate(tx.date); });
      }
      return parsed;
    }
  } catch(e){}
  return { tickers: ['AAPL','TSLA','005930.KS','000660.KS'], transactions: [], range: '1y', tags: {}, owners: { user1: { name: '소유자1', color: '#7c6af7', icon: '👤' }, user2: { name: '소유자2', color: '#00c87a', icon: '👤' } }, riaAccounts: [], riaExcludeSymbols: [] };
}

let state = loadState();
let currentView = 'all'; 

// 🌟 선택된 기간의 시작 날짜(Cut-off Date)를 계산하는 함수
function getCutoffDateFromRange(range) {
    if (!range || range === 'all') return '1970-01-01'; // 🌟 전체 기간일 경우 모든 데이터를 포함하도록 아주 과거 날짜 반환
    const d = new Date();
    if (range === '1d') d.setDate(d.getDate() - 1);
    else if (range === '1w') d.setDate(d.getDate() - 7);
    else if (range === '1m') d.setMonth(d.getMonth() - 1);
    else if (range === '3m') d.setMonth(d.getMonth() - 3);
    else if (range === '6m') d.setMonth(d.getMonth() - 6);
    else if (range === '1y') d.setFullYear(d.getFullYear() - 1);
    else if (range === '3y') d.setFullYear(d.getFullYear() - 3);
    else if (range === '5y') d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().split('T')[0];
}
let currentDivFilter = 'all';
let dividendFilters = { market: 'all', broker: 'all', search: '', dateFrom: '', dateTo: '' };
// 🌟 기본 정렬을 등락률로 변경하고, 리스트 스타일 관련 변수 및 함수 추가
let currentSortMode = 'changeDesc'; 
let sortDirection = 1; // 🌟 1(내림차순)을 기본값으로 변경하여 높은 수익률이 상단에 오게 설정
let activeAccountFilter = null; 
let currentListStyle = 'card';
let currentRegionLayout = 'horizontal'; // 🌟 기본 배치를 좌우(horizontal)로 변경
let realizedChartInst = null; // 🌟 실현수익 차트 저장 변수
// 🌟 실현수익 필터 상태 저장 변수 및 업데이트 함수
let realizedFilters = { market: 'all', symbol: null, tradeIdx: null, period: 'all', year: 'all', month: 'all', dateFrom: '', dateTo: '', broker: '', name: '' };
// 🌟 실현수익 랭킹 탭 상태 (pnl: 수익금 | roi: 수익률)
let realizedRankingTab = 'pnl';
// 🌟 포트폴리오 맵 선택 모드
let _treemapSelectMode = false;
let _treemapSelectedSymbols = new Map(); // symbol → value(KRW)
// 기존 realizedRankingPeriod 변수 삭제됨
let realizedRankingSortDir = 'desc'; // 'desc' 내림차순 | 'asc' 오름차순
// 🌟 종목 리스트 검색 및 태그 필터 상태 변수
let currentLocalSearch = '';
let currentLocalTag = 'all';
// 'yieldDesc' | 'yieldAsc' | 'totalDesc' | 'totalAsc'
let currentDivSort = 'yieldDesc';
let divRankingSortDir = 'desc'; // 'desc' | 'asc'
let _histSelectedIds = new Set(); // 거래내역 체크된 항목 ID
let historyRankingTab = 'bigbuy'; // 'bigbuy' | 'hold' | 'freq' | 'total'
let historyRankingSortDir = 'desc'; // 'desc' 내림차순 | 'asc' 오름차순

function setHistoryRankingTab(tab) {
    historyRankingTab = tab;
    renderHistoryDashboard();
}

function setHistoryRankingSortDir(dir) {
    historyRankingSortDir = dir;
    renderHistoryDashboard();
}

function setDivRankingSortDir(dir) {
    divRankingSortDir = dir;
    renderDividendDashboard();
}
function setDivSort(val) {
    currentDivSort = val;
    renderDividendDashboard();
}

// 🌟 연속 입력 에러 방지를 위한 타이머 변수 추가
let filterDebounceTimer = null; 

function updateLocalSearch(val) {
    currentLocalSearch = val;
    // 🌟 타이핑할 때마다 즉시 그리지 않고 0.3초 대기
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
        render();
    }, 300);
}

function setLocalTag(tag) {
    currentLocalTag = tag;
    render();
}

// 🌟 필터 업데이트 함수
function updateRealizedFilter(key, value) {
    realizedFilters[key] = value;
    // 차트에서 직접 클릭한 경우가 아니라면 특정 거래 필터는 초기화
    if (key !== 'tradeIdx') realizedFilters.tradeIdx = null; 
    renderRealizedDashboard();
}

function setRealizedPeriodFilter(period, el) {
    realizedFilters.period = period;
    realizedFilters.year = 'all';
    realizedFilters.month = 'all';
    
    document.querySelectorAll('.real-period-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    
    renderRealizedDashboard();
}

function updateRealizedDateFilter(type, value) {
    realizedFilters[type] = value;
    realizedFilters.period = 'all';
    
    document.querySelectorAll('.real-period-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.real-period-btn[onclick*="\'all\'"]');
    if(allBtn && value === 'all' && realizedFilters.year === 'all' && realizedFilters.month === 'all') allBtn.classList.add('active');

    renderRealizedDashboard();
}

// 🌟 실현수익 모든 필터 및 연도/소유자 설정 일괄 초기화
function resetRealizedFilters() {
    realizedFilters.symbol = null;
    realizedFilters.tradeIdx = null;
    realizedFilters.market = 'all';
    realizedFilters.period = 'all';
    realizedFilters.year = 'all';
    realizedFilters.month = 'all';
    realizedFilters.dateFrom = '';
    realizedFilters.dateTo = '';
    realizedFilters.broker = '';
    realizedFilters.name = '';
    const brokerSel = document.getElementById('realBrokerSearch');
    if (brokerSel) brokerSel.value = '';
    const nameSel = document.getElementById('realNameSearch');
    if (nameSel) nameSel.value = '';
    
    document.querySelectorAll('.real-period-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.real-period-btn[onclick*="\'all\'"]');
    if(allBtn) allBtn.classList.add('active');

    _setRealMktBtn(document.getElementById('realMktAll'));
    setRealizedOwnerFilter('all', null);
}

function resetRealizedSymbolFilter() {
    realizedFilters.symbol = null;
    realizedFilters.tradeIdx = null;
    renderRealizedDashboard();
}

// 🌟 실현수익 랭킹 탭 전환
function setRealizedRankingTab(tab) {
    realizedRankingTab = tab;
    renderRealizedDashboard();
}
 
function setRealizedRankingSortDir(dir) {
    realizedRankingSortDir = dir;
    renderRealizedDashboard();
}

// 🌟 [추가] 상하/좌우 버튼 클릭 시 동작하는 함수
function setRegionLayout(layout) {
    currentRegionLayout = layout;
    const btnVert = document.getElementById('btnLayoutVertical');
    const btnHoriz = document.getElementById('btnLayoutHorizontal');
    
    if(btnVert && btnHoriz) {
        if (layout === 'vertical') {
            btnVert.style.background = 'var(--bg3)'; btnVert.style.color = 'var(--text)';
            btnHoriz.style.background = 'transparent'; btnHoriz.style.color = 'var(--text2)';
        } else {
            btnHoriz.style.background = 'var(--bg3)'; btnHoriz.style.color = 'var(--text)';
            btnVert.style.background = 'transparent'; btnVert.style.color = 'var(--text2)';
        }
    }
    render(); // 즉시 화면 새로고침
}
if(['1mo','3mo','6mo'].includes(state.range)) { state.range = state.range.replace('mo','m'); }

let allocationChartInst = null; 
let modalChartInst = null;
let divMonthlyChartInst = null; 
let portfolioChartInst = null; 
let portfolioChartInstUs = null;
let portfolioZoomData = null; // 드래그 줌을 위한 차트 데이터 저장
const chartInstances = {};
let accountPieChartInsts = []; 
let cachedMarketData = {}; 
let localStockDB = []; 

// 🌟 [추가됨] 로컬 스토리지에서 이전 차트 데이터(캐시)를 불러옵니다. (접속 속도 10배 향상)
try {
    let cacheTime = localStorage.getItem('sw_market_cache_time');
    let now = Date.now();
    // 마지막 접속 후 4시간(14400000ms) 이내라면 기존 데이터를 즉시 재사용합니다.
    if (cacheTime && now - parseInt(cacheTime) < 14400000) {
        let c = localStorage.getItem('sw_market_cache');
        if (c) cachedMarketData = JSON.parse(c);
    } else {
        localStorage.removeItem('sw_market_cache');
        localStorage.removeItem('sw_market_cache_time');
    }
} catch(e) {}

let currentUsdKrw = 1350; 
let isExchangeRateFetched = false;

// 🌟 통합 자산 패널 보기 모드: 'current' (현재 보유) | 'cumulative' (누적 자산)
let globalAssetViewMode = 'current';

function setGlobalAssetView(mode) {
    globalAssetViewMode = mode;
    const btnCurrent = document.getElementById('btnGlobalCurrent');
    const btnCumul = document.getElementById('btnGlobalCumulative');
    if (btnCurrent && btnCumul) {
        if (mode === 'current') {
            btnCurrent.style.background = 'var(--bg3)'; btnCurrent.style.color = 'var(--text)';
            btnCumul.style.background = 'transparent'; btnCumul.style.color = 'var(--text2)';
        } else {
            btnCumul.style.background = 'var(--bg3)'; btnCumul.style.color = 'var(--text)';
            btnCurrent.style.background = 'transparent'; btnCurrent.style.color = 'var(--text2)';
        }
    }
    // 최신 데이터로 화면 갱신 (updateSummaryAndAllocation 재호출)
    render();
}

// 🌟 CSV 수동 매핑을 위한 임시 저장 변수
let pendingCsvData = [];
let unmatchedSymbols = [];

function setListStyle(style) {
    currentListStyle = style;
    const btnCard = document.getElementById('btnViewCard');
    const btnList = document.getElementById('btnViewList');
    
    if(btnCard && btnList) {
        if (style === 'card') {
            btnCard.style.background = 'var(--bg3)'; btnCard.style.color = 'var(--text)';
            btnList.style.background = 'transparent'; btnList.style.color = 'var(--text2)';
        } else {
            btnList.style.background = 'var(--bg3)'; btnList.style.color = 'var(--text)';
            btnCard.style.background = 'transparent'; btnCard.style.color = 'var(--text2)';
        }
    }
    render(); // 스타일 변경 즉시 화면 다시 그리기
}

function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function formatDate(dateStr) {
    if (!dateStr) return '';
    let d = dateStr.replace(/[^0-9]/g, '');
    if (d.length === 8) {
        return `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;
    }
   const parts = dateStr.split(/[\.\-\/]/);
    if (parts.length >= 3) {
        let year = parts[0].trim();
        let month = parts[1].trim().padStart(2, '0');
        let day = parts[2].trim().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

async function loadStockDB() {
  try {
    const res = await fetch('data/stocks.json?t=' + new Date().getTime());
    if (res.ok) localStockDB = await res.json();
  } catch(e) {}
}
loadStockDB();

function getColors(prices) {
  if(!prices || prices.length === 0) return { line:'#8890a4', fill:'rgba(136,144,164,0.1)' };
  const last = prices[prices.length-1], first = prices[0];
  if (last > first) return { line:'#00C578', fill:'rgba(26,219,30,0.12)' };
  if (last < first) return { line:'#3A9AFF', fill:'rgba(58,154,255,0.12)' };
  return { line:'#8890a4', fill:'rgba(136,144,164,0.1)' };
}

// 🌟 미니 차트 & 종목 모달 통합 차트 생성기 (연도 표시 + 매매 마커 완벽 복구!)
function buildChart(canvasId, prices, passedDates, mini, symbol, ownerFilter = 'all') {
  const {line, fill} = getColors(prices);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  let displayRawDates = passedDates;

  // 🌟 심볼이 주어지면 원본 캐시 데이터에서 정확한 연도가 포함된 rawDates를 가져옴
  if (symbol && cachedMarketData[symbol] && cachedMarketData[symbol].rawDates) {
      displayRawDates = cachedMarketData[symbol].rawDates.slice(-prices.length);
  }
  
  // 🌟 x축 라벨 연도 표시 (YYYY-MM-DD 형식을 예쁜 YY.MM.DD 형식으로 변경)
  const displayDates = displayRawDates.map(d => {
      if (typeof d === 'string' && d.includes('-')) return d.substring(2).replace(/-/g, '.');
      return d;
  });

  const datasets = [
      { 
          label: '주가',
          data: prices, 
          borderColor: line, 
          backgroundColor: fill, 
          borderWidth: mini ? 1.5 : 2, 
          pointRadius: 0, 
          tension: 0.1, 
          fill: true,
          order: 3
      }
  ];
  
  // 🌟 거래 내역 마커 찍기
  if (symbol && state.transactions) {
      const owners = state.owners;
      const u1 = owners.user1, u2 = owners.user2;

      // ownerFilter에 따라 표시할 소유자 목록 결정
      const activeOwners = ownerFilter === 'all'
          ? [u1.name, u2.name]
          : [ownerFilter];

      // 소유자별 색상 (매수: 붉은 계열, 매도: 파란 계열)
      const ownerBuyColor  = { [u1.name]: '#ff4d6a', [u2.name]: '#ff9f43' };
      const ownerSellColor = { [u1.name]: '#4d9fff', [u2.name]: '#00c896' };

      const txs = state.transactions.filter(t =>
          t.symbol === symbol &&
          t.txType !== 'dividend' &&
          activeOwners.includes(t.owner)
      );

      // 소유자별로 분리된 dataset 생성
      const datasetMap = {}; // key: `${owner}_buy` or `${owner}_sell`

      txs.forEach(tx => {
          let dateIdx = displayRawDates.indexOf(tx.date);
          if (dateIdx === -1) {
              for (let k = 0; k < displayRawDates.length; k++) {
                  if (displayRawDates[k] >= tx.date) { dateIdx = k; break; }
              }
              if (dateIdx === -1 && tx.date <= displayRawDates[displayRawDates.length - 1]) {
                  dateIdx = displayRawDates.length - 1;
              }
          }
          if (dateIdx === -1) return;

          const isBuy = tx.qty > 0;
          const key = `${tx.owner}_${isBuy ? 'buy' : 'sell'}`;
          if (!datasetMap[key]) {
              const isSingleOwner = activeOwners.length === 1;
              const ownerLabel = isSingleOwner ? '' : ` (${tx.owner})`;
              datasetMap[key] = {
                  label: isBuy ? `매수${ownerLabel}` : `매도${ownerLabel}`,
                  data: [], type: 'line', showLine: false,
                  pointStyle: 'triangle',
                  rotation: isBuy ? 0 : 180,
                  backgroundColor: isBuy ? ownerBuyColor[tx.owner] || '#ff4d6a' : ownerSellColor[tx.owner] || '#4d9fff',
                  borderColor: '#fff',
                  borderWidth: mini ? 1 : 1.5,
                  pointRadius: mini ? 4 : 8,
                  pointHoverRadius: mini ? 6 : 10,
                  order: isBuy ? 1 : 2,
                  _owner: tx.owner,
                  _isBuy: isBuy
              };
          }
          datasetMap[key].data.push({
              x: displayDates[dateIdx],
              y: tx.price,
              qty: Math.abs(tx.qty),
              owner: tx.owner
          });
      });

      Object.values(datasetMap).forEach(ds => datasets.push(ds));
  }

  return new Chart(canvas, {
    type: 'line',
    data: { labels: displayDates, datasets: datasets },
    options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { 
            legend: { display: false }, 
            tooltip: { 
                mode: 'index', intersect: false, displayColors: false,
                callbacks: {
                    label: function(ctx) {
                        const sym = symbol || '';
                        const ds = ctx.dataset;
                        if (ds._isBuy !== undefined && ctx.raw) {
                            const icon = ds._isBuy ? '🔴' : '🔵';
                            const action = ds._isBuy ? '매수' : '매도';
                            const ownerTag = ctx.raw.owner ? ` · ${ctx.raw.owner}` : '';
                            return `${icon} ${action}: ${formatPrice(ctx.raw.y, sym)} (${ctx.raw.qty}주${ownerTag})`;
                        }
                        let val = typeof ctx.raw === 'object' ? ctx.raw.y : ctx.raw;
                        return `주가: ${formatPrice(val, sym)}`;
                    }
                }
            } 
        }, 
        scales: { 
            x: { display: !mini, ticks: { font:{size:10}, color:'#555e72', maxTicksLimit: mini ? 5 : 10 }, grid: { display: false }, border: { display: false } }, 
            y: { display: !mini, ticks: { font:{size:10}, color:'#555e72' }, grid: { color:'rgba(255,255,255,0.04)' }, border: { display: false } } 
        }, 
        interaction: { mode: 'index', intersect: false }, 
        animation: { duration: 0 } 
    }
  });
}


function getHeatmapColor(change) {
  if (change >= 3) return 'rgba(0, 200, 122, 0.9)';
  if (change > 0) return 'rgba(0, 200, 122, 0.5)';
  if (change <= -3) return 'rgba(255, 77, 106, 0.9)';
  if (change < 0) return 'rgba(255, 77, 106, 0.5)';
  return 'rgba(136, 144, 164, 0.4)';
}

// 🌟 상장폐지 꼬리표(.DLST)가 붙어도 한국 주식인지 인식할 수 있도록 수정
function isKorean(symbol) { 
    let s = symbol.replace('.KS.DLST', '.KS').replace('.DLST', ''); 
    return s.endsWith('.KS') || s.endsWith('.KQ') || /^\d{6}$/.test(s); 
}

// 🌟 전체 거래내역 필터 상태 저장 변수 추가 (isKorean 함수 바로 아래에 추가하세요)
let historyFilters = { market: 'all', type: 'all', search: '', dateFrom: '', dateTo: '', broker: 'all', owner: 'all' };

function updateHistoryFilter(key, value) {
    historyFilters[key] = value;
    
    // 검색어 입력일 때만 0.3초 지연 처리 (나머지 셀렉트박스는 즉시 반영)
    if (key === 'search') {
        if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
        filterDebounceTimer = setTimeout(() => {
            renderHistoryDashboard();
        }, 300);
    } else {
        renderHistoryDashboard();
    }
}
function isCrypto(symbol) { return symbol.endsWith('-USD'); }
function formatPrice(val, symbol) {
  if (isKorean(symbol)) return '₩' + Math.round(val).toLocaleString();
  return '$' + val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}
function currencyTag(symbol) {
    const isKr = isKorean(symbol);
    return isKr
        ? `<span style="font-size:9px;font-weight:700;color:var(--green);background:rgba(0,200,122,0.12);border:1px solid rgba(0,200,122,0.3);padding:0 4px;border-radius:3px;margin-right:4px;font-family:var(--font-sans);vertical-align:middle;">KRW</span>`
        : `<span style="font-size:9px;font-weight:700;color:#a78bfa;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);padding:0 4px;border-radius:3px;margin-right:4px;font-family:var(--font-sans);vertical-align:middle;">USD</span>`;
}

function getOwnerInfo(ownerName) {
  if (state.owners && ownerName === state.owners.user1.name) return state.owners.user1;
  if (state.owners && ownerName === state.owners.user2.name) return state.owners.user2;
  return { name: ownerName, color: '#8890a4', icon: '👤' };
}


// ==========================================
// 2. 모달, UI 및 클라우드 설정 
// ==========================================
function getGhSettings() {
  const stored = localStorage.getItem('gh_settings');
  if(!stored) return { user: '', repo: '', token: '', autoSync: false };
  return JSON.parse(stored);
}
function saveGhSettings(settings) { localStorage.setItem('gh_settings', JSON.stringify(settings)); }

function openMasterSettingsModal() {
  let s = getGhSettings();
  document.getElementById('ghUser').value = s.user;
  document.getElementById('ghRepo').value = s.repo;
  document.getElementById('ghToken').value = s.token;
  document.getElementById('ghAutoSync').checked = s.autoSync;
  // RIA 계좌 값 복원
  const riaEl = document.getElementById('inputRiaAccounts');
  if (riaEl) riaEl.value = (state.riaAccounts || []).join(', ');
  // 🌟 [추가] 모달 열 때 수동 해외자산 목록 불러오기
  const customOverseasEl = document.getElementById('inputCustomOverseas');
  if (customOverseasEl) customOverseasEl.value = (state.customOverseasAssets || []).join(', ');

  document.getElementById('masterSettingsOverlay').classList.add('open');
}

// 🌟 [추가] 수동 해외자산 목록 저장 함수
function saveCustomOverseas() {
    const val = document.getElementById('inputCustomOverseas').value;
    // 쉼표로 구분된 종목명/티커를 대문자로 변환하고 공백 제거하여 배열로 저장
    state.customOverseasAssets = val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    saveState();
    triggerAutoSync();
    renderCapitalGainsTax(currentRealizedOwnerFilter); // 저장 시 양도세 즉시 재계산
    
    const btn = document.getElementById('btnSaveCustomOverseas');
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ 저장됨';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
}

function saveRiaAccounts() {
    const val = document.getElementById('inputRiaAccounts').value;
    state.riaAccounts = val.split(',').map(s => s.trim()).filter(Boolean);
    saveState();
    triggerAutoSync();
    renderCapitalGainsTax(currentRealizedOwnerFilter);
    const btn = document.getElementById('btnSaveRia');
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ 저장됨';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
}

function openOwnerModal() {
  document.getElementById('inputOwner1Name').value = state.owners.user1.name;
  document.getElementById('inputOwner1Icon').value = state.owners.user1.icon;
  document.getElementById('inputOwner1Color').value = state.owners.user1.color;
  document.getElementById('inputOwner2Name').value = state.owners.user2.name;
  document.getElementById('inputOwner2Icon').value = state.owners.user2.icon;
  document.getElementById('inputOwner2Color').value = state.owners.user2.color;
  document.getElementById('ownerOverlay').classList.add('open');
}

function closeModal(id) { 
  const el = document.getElementById(id);
  if(el) el.classList.remove('open'); 
}

function resetAllTransactions() {
  if(confirm("🚨 경고: 모든 거래 내역이 영구적으로 삭제됩니다.\n정말로 전체 데이터를 초기화하시겠습니까?")) {
    state.transactions = [];
    state.tickers = ['AAPL','TSLA','005930.KS']; 
    saveState();
    renderTxList();
    if(currentView === 'history') renderHistoryDashboard();
    else render();
    triggerAutoSync();
    closeModal('masterSettingsOverlay');
    alert("데이터 초기화가 완료되었습니다.");
  }
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "stock_manager_backup.json");
  document.body.appendChild(dlAnchorElem);
  dlAnchorElem.click();
  document.body.removeChild(dlAnchorElem);
}

// 🌟 JSON 복원 시 덮어쓰기 / 추가하기(병합) 선택 기능 적용
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if(data.tickers && data.transactions) {
        
        let isAppend = false;
        let proceed = true;

        // 1. 기존 장부에 데이터가 있다면 병합 여부를 묻습니다.
        if (state.transactions && state.transactions.length > 0) {
            const appendConfirm = confirm("📁 기존 데이터가 존재합니다. 어떻게 복원하시겠습니까?\n\n• [확인] 기존 내역을 유지하고 새 내역을 추가(병합)합니다.\n• [취소] 덮어쓰기 모드로 진행합니다.");
            
            if (appendConfirm) {
                isAppend = true;
            } else {
                // 덮어쓰기 전 최종 확인
                const overwriteConfirm = confirm("🚨 경고: 기존 장부 데이터가 모두 삭제되고 완전히 덮어씌워집니다. 진행하시겠습니까?");
                if (!overwriteConfirm) {
                    proceed = false;
                }
            }
        }

        if (proceed) {
            if (isAppend) {
                // 📌 추가하기(병합) 모드
                // 고유 ID 충돌을 막기 위해 현재 장부의 최고 ID값을 구합니다.
                let maxId = state.transactions.length > 0 ? Math.max(...state.transactions.map(t => t.id)) : Date.now();
                
                // 거래내역 병합
                data.transactions.forEach((tx, idx) => {
                    let newTx = { ...tx };
                    newTx.id = maxId + idx + 1; // 새 ID 부여
                    newTx.date = formatDate(tx.date);
                    state.transactions.push(newTx);
                });

                // 관심종목(티커) 병합
                data.tickers.forEach(ticker => {
                    if (!state.tickers.includes(ticker)) state.tickers.push(ticker);
                });

                // 구 종목명, 태그 데이터 병합
                if (data.oldNames) state.oldNames = { ...state.oldNames, ...data.oldNames };
                if (data.tags) state.tags = { ...state.tags, ...data.tags };

                alert(`데이터 병합 완료!\n총 ${data.transactions.length}건의 거래가 기존 장부에 추가되었습니다.`);
                
            } else {
                // 📌 덮어쓰기 모드 (기존 로직)
                state = data;
                if(!state.owners) {
                   state.owners = {
                     user1: { name: state.ownerNames?.user1 || '소유자1', color: '#7c6af7', icon: '👤' },
                     user2: { name: state.ownerNames?.user2 || '소유자2', color: '#00c87a', icon: '👤' }
                   };
                }
                if(state.transactions) state.transactions.forEach(tx => { tx.date = formatDate(tx.date); });
                alert('데이터를 성공적으로 덮어썼습니다.');
            }

            // 공통 후처리 로직
            saveState();
            cachedMarketData = {};
            updateOwnerLabels();
            renderTxList();
            if (currentView === 'history') renderHistoryDashboard();
            else render();
            triggerAutoSync();
        }

      } else {
        alert('올바른 백업 파일 형식이 아닙니다.');
      }
    } catch(err) {
      alert('파일을 읽는 중 오류가 발생했습니다.');
    }
    
    event.target.value = ''; // 파일 인풋 초기화
    closeModal('masterSettingsOverlay');
  };
  
  reader.readAsText(file);
}

function downloadCsvSample() {
  const csvContent = "일자,소유자,계좌,유형,종목,수량,단가,세금(세전/세후)\n2026-04-10,소유자1,키움증권,매수,005930,10,80000,\n2026-04-12,소유자2,토스증권,배당,AAPL,0,15.5,세전\n2026-04-14,소유자1,미래에셋,매도,TSLA,-5,170.2,세후";
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_transactions.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── 🌟 구글 번역 API를 활용한 한글 -> 영어 변환 함수 (캐시 적용) ──
const translationCache = {};

async function translateKoToEn(text) {
  // 이미 번역한 종목명은 캐시에서 바로 가져옴 (서버 차단 방지 및 속도 향상)
  if (translationCache[text]) return translationCache[text];
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data[0][0][0].trim();
    translationCache[text] = translated; // 결과 캐싱
    return translated;
  } catch (error) {
    console.error("번역 실패:", error);
    return text; // 번역 실패 시 원본 텍스트 반환
  }
}

// 🌟 수동 매핑 및 CSV 업로드 처리 로직 (진행률 팝업 추가)
function importCsvData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split('\n');
    const totalLines = lines.length;
    
    pendingCsvData = [];
    unmatchedSymbols = [];
    
    // 🌟 [추가] 화면 중앙에 크게 보이는 진행률 팝업 생성 및 표시
    let progressOverlay = document.getElementById('csvProgressOverlay');
    if (!progressOverlay) {
        progressOverlay = document.createElement('div');
        progressOverlay.id = 'csvProgressOverlay';
        progressOverlay.className = 'overlay';
        progressOverlay.style.zIndex = '999999'; // 가장 위에 표시
        progressOverlay.innerHTML = `
            <div class="modal modal-sm" style="text-align:center; padding:30px;">
                <div style="font-size:30px; margin-bottom:15px;">⏳</div>
                <h3 style="margin-bottom:15px; font-size:16px;">CSV 데이터 처리 중...</h3>
                <div style="background:var(--bg3); border-radius:10px; overflow:hidden; height:8px; margin-bottom:10px;">
                    <div id="csvProgressBar" style="width:0%; height:100%; background:var(--accent); transition:width 0.1s;"></div>
                </div>
                <div id="csvProgressText" style="font-size:12px; color:var(--text2); font-family:var(--font-mono);">준비 중...</div>
            </div>
        `;
        document.body.appendChild(progressOverlay);
    }
    progressOverlay.classList.add('open');
    
    // UI가 렌더링될 시간을 아주 잠깐 줍니다.
    await new Promise(resolve => setTimeout(resolve, 50));

    const manualMap = {
        "소파이": "SOFI", "알파벳A": "GOOGL", "구글": "GOOGL",
        "백트홀딩스": "BKKT", "유나이티드헬스그룹": "UNH",
        "애플": "AAPL", "테슬라": "TSLA", "마이크로소프트": "MSFT", 
        "엔비디아": "NVDA", "아마존": "AMZN", "메타": "META",
        "삼성전자우": "005935.KS", "현대차우": "005385.KS",
        "TIGER미국배당다우존스": "458730.KS", "TIGER미국S&P500": "360750.KS"
    };

    for (let i = 1; i < totalLines; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // 🌟 [수정] 10줄마다 팝업창의 프로그레스 바와 텍스트 실시간 업데이트
      if (i % 10 === 0) {
          const percent = Math.round((i / totalLines) * 100);
          document.getElementById('csvProgressBar').style.width = percent + '%';
          document.getElementById('csvProgressText').textContent = `${i} / ${totalLines} (${percent}%)`;
          await new Promise(resolve => setTimeout(resolve, 0)); // 브라우저가 화면을 갱신하도록 양보
      }
      
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim().replace(/^"|"$/g, '').trim());
      
      if (parts.length >= 7) {
        const date = parts[0];
        let owner = parts[1];
        const broker = parts[2];
        const typeStr = parts[3];
        let rawSymbol = parts[4];
        let cleanRaw = rawSymbol.replace(/\s+/g, '').toUpperCase();
        
        let matched = false;
        let finalSymbol = rawSymbol;

        if (manualMap[cleanRaw]) {
            finalSymbol = manualMap[cleanRaw];
            matched = true;
        }

        if (!matched && localStockDB && localStockDB.length > 0) {
            let m = localStockDB.find(s => 
                s.name.replace(/\s+/g, '').toUpperCase() === cleanRaw || 
                s.symbol.replace(/\s+/g, '').toUpperCase() === cleanRaw
            );
            if (m) {
                finalSymbol = m.symbol;
                matched = true;
            }
        }

        if (!matched) {
            if (/^\d{6}$/.test(cleanRaw)) {
                finalSymbol = cleanRaw + '.KS';
                matched = true;
            } else if (/^[A-Za-z0-9.=^-]+$/.test(cleanRaw)) {
                finalSymbol = cleanRaw;
                matched = true;
            }
        }

        if (!matched) {
            if (!unmatchedSymbols.includes(rawSymbol)) {
                unmatchedSymbols.push(rawSymbol);
            }
        }

        let qtyStr = parts[5] ? parts[5].replace(/[^0-9.-]/g, '') : '';
        let priceStr = parts[6] ? parts[6].replace(/[^0-9.-]/g, '') : '';
        let qty = parseFloat(qtyStr) || 0;
        let price = parseFloat(priceStr) || 0;
        const taxStatus = parts.length > 7 ? parts[7] : '';

        if (!date || !rawSymbol) continue; 

        let txType = 'trade';
        if (typeStr.includes('배당') || typeStr.toLowerCase() === 'dividend') { txType = 'dividend'; qty = 0; }
        else if (typeStr.includes('매도') || typeStr.toLowerCase() === 'sell') { txType = 'trade'; qty = -Math.abs(qty); }
        else if (typeStr.includes('매수') || typeStr.toLowerCase() === 'buy')  { txType = 'trade'; qty =  Math.abs(qty); }

        let ownerMapped = owner;
        if (owner === '소유자1') ownerMapped = state.owners.user1.name;
        else if (owner === '소유자2') ownerMapped = state.owners.user2.name;

        pendingCsvData.push({
            id: Date.now() + i,
            date: formatDate(date),
            owner: ownerMapped,
            broker: broker,
            originalSymbol: rawSymbol,
            matchedSymbol: matched ? finalSymbol : null,
            isMatched: matched,
            qty: qty,
            rawPrice: price,
            txType: txType,
            taxStatus: taxStatus
        });
      }
    }
    
    // 작업 완료 후 프로그레스 팝업 닫기
    progressOverlay.classList.remove('open');

    if (pendingCsvData.length > 0) {
        if (unmatchedSymbols.length > 0) {
            openCsvMappingModal(); 
        } else {
            processPendingCsv(); 
        }
    } else {
        alert("추가할 수 있는 유효한 내역이 없습니다.");
    }
    event.target.value = ''; 
  };
  reader.readAsText(file, 'UTF-8');
}

// 🌟 CSV 모달 내부 검색기능 (결과가 3개를 넘어가면 스크롤 처리)
function handleMapSearch(inputElem, idx) {
   let query = inputElem.value.trim().toLowerCase();
   const dropdown = document.getElementById(`mapDropdown_${idx}`);
   if (query.length < 1 || localStockDB.length === 0) { dropdown.style.display = 'none'; return; }
   
   const isIncludesSearch = query.startsWith('*') || query.endsWith('*');
   let cleanQuery = query.replace(/\*/g, '').trim();
   
   if (cleanQuery.length < 1) { dropdown.style.display = 'none'; return; }

   const etfBrandMap = { "timefolio": "타임폴리오", "koact": "코액트", "mighty": "마이티", "woori": "우리", "focus": "포커스", "treyn": "트레인", "vnam": "브이남", "hk": "흥국" };
   for (const [eng, kor] of Object.entries(etfBrandMap)) {
       if (cleanQuery.startsWith(eng)) { cleanQuery = cleanQuery.replace(eng, kor); break; }
   }

   let results = [];
   if (isIncludesSearch) {
       results = localStockDB.filter(s => s.symbol.toLowerCase().includes(cleanQuery) || s.name.toLowerCase().includes(cleanQuery));
   } else {
       results = localStockDB.filter(s => s.symbol.toLowerCase().startsWith(cleanQuery) || s.name.toLowerCase().startsWith(cleanQuery));
   }

   // 🌟 15개까지 넉넉하게 찾고, 창 높이(145px)를 넘으면 알아서 스크롤바가 생깁니다.
   results = results.slice(0, 15);
   
   if (results.length === 0) { dropdown.style.display = 'none'; return; }
   
   dropdown.innerHTML = results.map(q => `
     <li class="search-item" style="padding:10px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; cursor:pointer;" 
         onclick="selectMapResult(${idx}, '${q.symbol}', '${q.name.replace(/'/g, "\\'")}')"
         onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
       <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
         <span style="font-weight:700; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${q.name}</span>
         <span style="font-size:10px; color:var(--text3);">${q.exch}</span>
       </div>
       <span style="color:var(--accent); font-family:var(--font-mono); font-size:11px; font-weight:700; margin-left:10px; flex-shrink:0;">${q.symbol}</span>
     </li>
   `).join('');
   
   dropdown.style.display = 'block';
}

function selectMapResult(idx, symbol, name) {
   const input = document.getElementById(`mapInput_${idx}`);
   input.value = `${name} (${symbol})`; 
   input.dataset.mappedSymbol = symbol;
   document.getElementById(`mapDropdown_${idx}`).style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-dropdown') && !e.target.closest('.form-input')) {
        document.querySelectorAll('[id^="mapDropdown_"]').forEach(el => el.style.display = 'none');
    }
});

function cancelCsvImport() {
    pendingCsvData = [];
    unmatchedSymbols = [];
    closeModal('csvMappingOverlay');
}

// 🌟 사용자가 입력한 매핑 데이터로 최종 저장
function processPendingCsv() {
    if (!state.oldNames) state.oldNames = {}; // 🌟 구 종목명 객체 초기화 보장
    const mappingDict = {};

    for(let i=0; i<unmatchedSymbols.length; i++) {
        const raw = unmatchedSymbols[i];
        const status = document.querySelector(`input[name="status_${i}"]:checked`).value;
        
        // 🌟 상장폐지 선택 시 .DLST 꼬리표 붙임
        if (status === 'delisted') {
            mappingDict[raw] = raw + '.DLST';
            state.oldNames[raw + '.DLST'] = '상장폐지';
        } else {
            const input = document.getElementById(`mapInput_${i}`);
            if(input) {
                const mapped = input.dataset.mappedSymbol || input.value.trim().toUpperCase() || raw;
                mappingDict[raw] = mapped;
                // 🌟 원본 이름과 다르면 구 종목명으로 기억해둠
                if (mapped !== raw) {
                    state.oldNames[mapped] = raw; 
                }
            } else {
                mappingDict[raw] = raw;
            }
        }
    }

    let addedCount = 0;
    pendingCsvData.forEach(tx => {
        let finalSym = tx.isMatched ? tx.matchedSymbol : mappingDict[tx.originalSymbol];
        
        let finalPrice = tx.rawPrice;
        if (tx.txType === 'dividend' && tx.taxStatus === '세전') {
            const taxRate = isKorean(finalSym) ? 0.154 : 0.15;
            finalPrice = finalPrice * (1 - taxRate);
        }

        state.transactions.push({
            id: tx.id,
            date: tx.date,
            owner: tx.owner,
            broker: tx.broker,
            symbol: finalSym.toUpperCase(),
            qty: tx.qty,
            price: finalPrice,
            txType: tx.txType
        });
        if (!state.tickers.includes(finalSym.toUpperCase())) state.tickers.push(finalSym.toUpperCase());
        addedCount++;
    });

    pendingCsvData = [];
    unmatchedSymbols = [];
    closeModal('csvMappingOverlay');
    closeModal('masterSettingsOverlay');
    
    saveState();
    renderTxList();
    if (currentView === 'history') renderHistoryDashboard(); else render();
    triggerAutoSync();
    alert(addedCount + "건의 거래내역이 정상적으로 추가되었습니다.");
}

function utf8_to_b64(str) { return window.btoa(unescape(encodeURIComponent(str))); }
function b64_to_utf8(str) { return decodeURIComponent(escape(window.atob(str))); }

async function getGithubFileSha(settings, path) {
  const url = `https://api.github.com/repos/${settings.user}/${settings.repo}/contents/${path}`;
  const res = await fetch(url, { headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github.v3+json' } });
  if (res.ok) { const json = await res.json(); return { sha: json.sha, content: json.content }; }
  return null;
}

function updateSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  const spinner = document.getElementById('syncSpinner');
  const text = document.getElementById('syncText');
  el.className = 'sync-status';
  if(status === 'syncing') {
    spinner.style.display = 'block'; text.textContent = '클라우드 저장 중...';
  } else if(status === 'success') {
    spinner.style.display = 'none'; text.textContent = '✅ 저장됨'; el.classList.add('active');
  } else if(status === 'error') {
    spinner.style.display = 'none'; text.textContent = '❌ 동기화 실패'; el.classList.add('error');
  } else {
    spinner.style.display = 'none'; text.textContent = '';
  }
}

async function pushToGithub(silent = false) {
  let user = document.getElementById('ghUser').value.trim();
  let repo = document.getElementById('ghRepo').value.trim();
  let token = document.getElementById('ghToken').value.trim();
  
  if(!silent) {
    if(!user || !repo || !token) { alert('GitHub 연동 정보를 모두 입력해주세요.'); return; }
    let s = getGhSettings(); s.user = user; s.repo = repo; s.token = token; saveGhSettings(s);
  } else {
    let s = getGhSettings(); user = s.user; repo = s.repo; token = s.token;
    if(!user || !repo || !token) return;
  }

  updateSyncStatus('syncing');
  const path = 'data/my_portfolio.json';
  const url = `https://api.github.com/repos/${user}/${repo}/contents/${path}`;
  
  try {
    const fileInfo = await getGithubFileSha({user, repo, token}, path);
    const content = utf8_to_b64(JSON.stringify(state, null, 2));
    const body = { message: `🗂️ 거래장부 자동 동기화 (${new Date().toLocaleString()})`, content: content };
    if (fileInfo) body.sha = fileInfo.sha;

    const putRes = await fetch(url, { method: 'PUT', headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }, body: JSON.stringify(body) });
    if(putRes.ok) { 
      updateSyncStatus('success');
      if(!silent) { alert('✅ 성공적으로 GitHub에 저장되었습니다!'); closeModal('masterSettingsOverlay'); }
    } else { 
      updateSyncStatus('error');
      if(!silent) alert('저장 실패. 토큰 권한과 정보를 확인하세요.'); 
    }
  } catch(e) { 
    updateSyncStatus('error');
    if(!silent) alert('네트워크 에러 발생'); 
  }
}

function triggerAutoSync() {
  const s = getGhSettings();
  if(s.autoSync && s.token) pushToGithub(true);
}

async function pullFromGithub(silent = false) {
  let user = document.getElementById('ghUser').value.trim();
  let repo = document.getElementById('ghRepo').value.trim();
  let token = document.getElementById('ghToken').value.trim();
  
  if(!silent) {
    if(!user || !repo || !token) { alert('정보를 입력해주세요.'); return; }
    let s = getGhSettings(); s.user = user; s.repo = repo; s.token = token; saveGhSettings(s);
  } else {
    let s = getGhSettings(); user = s.user; repo = s.repo; token = s.token;
    if(!user || !repo || !token) return;
  }

  const path = 'data/my_portfolio.json';
  try {
    const fileInfo = await getGithubFileSha({user, token, repo}, path);
    if (fileInfo && fileInfo.content) {
      const dataStr = b64_to_utf8(fileInfo.content);
      const data = JSON.parse(dataStr);
      if(data.tickers && data.transactions) {
        state = data; saveState(); cachedMarketData = {};
        updateOwnerLabels(); renderTxList(); render();
        updateSyncStatus('success');
        if(!silent) { alert('✅ 성공적으로 불러왔습니다!'); closeModal('masterSettingsOverlay'); }
      } else if(!silent) alert('유효한 포트폴리오 파일이 아닙니다.');
    } else if(!silent) alert('저장소에 파일이 없습니다.');
  } catch(e) { if(!silent) alert('가져오기 실패'); }
}

// ==========================================
// 3. UI 탭 및 거래 관리 로직
// ==========================================
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('btnOpenSidebar');
  if (sb.classList.contains('collapsed')) {
    sb.classList.remove('collapsed');
    btn.style.display = 'none';
  } else {
    sb.classList.add('collapsed');
    btn.style.display = 'flex';
  }
}

function setSidebarView(view) {
  const vLedger = document.getElementById('sidebarLedgerView');
  const vYield = document.getElementById('sidebarYieldView');
  const tLedger = document.getElementById('tabLedger');
  const tYield = document.getElementById('tabYield');

  if (view === 'ledger') {
    vLedger.style.display = 'flex'; vYield.style.display = 'none';
    tLedger.classList.add('active'); tYield.classList.remove('active');
  } else {
    vLedger.style.display = 'none'; vYield.style.display = 'flex';
    tLedger.classList.remove('active'); tYield.classList.add('active');
    render(); 
  }
}

function updateOwnerLabels() {
  const o1 = state.owners.user1;
  const o2 = state.owners.user2;

  document.getElementById('tabUser1').innerHTML = `<span class="vtab-icon">${o1.icon}</span><span class="vtab-text">${o1.name}</span>`;
  document.getElementById('tabUser2').innerHTML = `<span class="vtab-icon">${o2.icon}</span><span class="vtab-text">${o2.name}</span>`;
  document.getElementById('lblUser1').innerHTML = `${o1.icon} ${o1.name}`;
  document.getElementById('lblUser2').innerHTML = `${o2.icon} ${o2.name}`;
  document.getElementById('divTabUser1').textContent = `${o1.icon} ${o1.name}`;
  document.getElementById('divTabUser2').textContent = `${o2.icon} ${o2.name}`;
  const realTab1 = document.getElementById('realTabUser1');
  const realTab2 = document.getElementById('realTabUser2');
  if (realTab1) realTab1.textContent = `${o1.icon} ${o1.name}`;
  if (realTab2) realTab2.textContent = `${o2.icon} ${o2.name}`;
  const histTab1 = document.getElementById('histTabUser1');
  const histTab2 = document.getElementById('histTabUser2');
  if (histTab1) histTab1.textContent = `${o1.icon} ${o1.name}`;
  if (histTab2) histTab2.textContent = `${o2.icon} ${o2.name}`;
}

function toggleAccountFilter(broker) {
  if (activeAccountFilter === broker) activeAccountFilter = null;
  else activeAccountFilter = broker;
  render();
}

function toggleTxType() {
  const type = document.querySelector('input[name="txType"]:checked').value;
  const editIdElem = document.getElementById('editingTxId');
  const isEditing = editIdElem && editIdElem.value !== '';

  // 모든 필드 초기 상태로 리셋
  document.getElementById('txQtyWrap').style.display = 'block';
  document.getElementById('txPriceWrap').style.display = 'block';
  document.getElementById('txPriceLabel').textContent = '단가 (1주당 가격)';
  document.getElementById('txPrice').placeholder = '0';
  document.getElementById('divTaxWrap').style.display = 'none';
  document.getElementById('txTransferFromWrap').style.display = 'none';
  document.getElementById('txSplitRatioWrap').style.display = 'none';
  document.getElementById('txBrokerGroup').style.display = 'block';
  document.getElementById('txBrokerLabel').textContent = '계좌명 (선택)';
  document.getElementById('txBroker').placeholder = '예: 키움증권, 토스 등';

  if (type === 'dividend') {
    document.getElementById('txQtyWrap').style.display = 'none';
    document.getElementById('txPriceLabel').textContent = '총 배당금액';
    document.getElementById('txPrice').placeholder = '받은 배당금 총액';
    document.getElementById('txQty').value = 0;
    document.getElementById('divTaxWrap').style.display = 'block';
    if (!isEditing) document.getElementById('applyDivTax').checked = true;
    else document.getElementById('applyDivTax').checked = false;

  } else if (type === 'transfer') {
    // 이동: 단가 숨김, 출발계좌 표시, 도착계좌 라벨 변경
    document.getElementById('txPriceWrap').style.display = 'none';
    document.getElementById('txTransferFromWrap').style.display = 'block';
    document.getElementById('txBrokerLabel').textContent = '도착 계좌';
    document.getElementById('txBroker').placeholder = '예: 토스증권, 신한투자증권';
    // 현재 종목이 입력돼 있으면 출발 계좌 목록 바로 업데이트
    populateLedgerTransferFrom();

  } else if (type === 'split') {
    // 분할: 수량·단가·계좌 모두 숨김, 비율 입력만 표시
    document.getElementById('txQtyWrap').style.display = 'none';
    document.getElementById('txPriceWrap').style.display = 'none';
    document.getElementById('txBrokerGroup').style.display = 'none';
    document.getElementById('txSplitRatioWrap').style.display = 'block';
    updateLedgerSplitPreview();
  }
}

function saveOwnerNames() {
  const old1 = state.owners.user1.name;
  const old2 = state.owners.user2.name;
  const new1 = document.getElementById('inputOwner1Name').value.trim() || '소유자1';
  const new2 = document.getElementById('inputOwner2Name').value.trim() || '소유자2';
  
  state.owners.user1 = { name: new1, icon: document.getElementById('inputOwner1Icon').value.trim() || '👤', color: document.getElementById('inputOwner1Color').value || '#7c6af7' };
  state.owners.user2 = { name: new2, icon: document.getElementById('inputOwner2Icon').value.trim() || '👤', color: document.getElementById('inputOwner2Color').value || '#00c87a' };
  
  state.transactions.forEach(tx => {
    if (tx.owner === old1) tx.owner = new1;
    else if (tx.owner === old2) tx.owner = new2;
  });
  
  saveState();
  updateOwnerLabels(); renderTxList();
  if (currentView === 'history') renderHistoryDashboard(); else render();
  closeModal('ownerOverlay');
  triggerAutoSync();
}

function toggleTxOwner(id) {
  const tx = state.transactions.find(t => t.id === id);
  if(!tx) return;
  if (tx.owner === state.owners.user1.name) tx.owner = state.owners.user2.name;
  else tx.owner = state.owners.user1.name;
  saveState(); renderTxList();
  if (currentView === 'history') renderHistoryDashboard(); else render();
  triggerAutoSync();
}

// 🌟 보유 주식 평단가 및 수량 계산 (이전·분할 포함)
function calculateHoldings(ownerFilter = 'all') {
  let holdings = {};
  const sortedTx = [...state.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
  
  sortedTx.forEach(tx => {
    if (tx.txType === 'dividend') return;
    if (ownerFilter !== 'all' && tx.owner !== ownerFilter) return;

    let broker = tx.broker ? tx.broker.trim() : '미지정';
    let key = `${tx.symbol}::${broker}`;
    if(!holdings[key]) holdings[key] = { qty: 0, avg: 0, broker, symbol: tx.symbol };
    let h = holdings[key];

    if (tx.txType === 'transfer') {
      if (tx.qty > 0) {
        // 입고: 평단가 이어받기
        let totalValue = (h.qty * h.avg) + (tx.qty * tx.price);
        h.qty += tx.qty;
        h.avg = h.qty > 0 ? totalValue / h.qty : 0;
      } else {
        // 출고: 수량만 차감
        h.qty += tx.qty;
        if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
      }
      return;
    }
    
    if (tx.qty > 0) {
      let totalValue = (h.qty * h.avg) + (tx.qty * tx.price);
      h.qty += tx.qty;
      h.avg = totalValue / h.qty;
    } else {
      h.qty += tx.qty;
      if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
    }
  });
  return holdings;
}

function editTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  if (tx.txType === 'transfer') {
    alert('계좌 이동 내역은 직접 수정할 수 없습니다.\n해당 이동 내역을 삭제한 후 다시 입력해주세요.');
    return;
  }

  setSidebarView('ledger');
  const sb = document.getElementById('sidebar');
  if(sb.classList.contains('collapsed')) toggleSidebar();

  // 🌟 사이드바 하이라이트 효과 활성화
  sb.classList.add('highlight-edit');

  document.getElementById('txDate').value = tx.date;
  let _editDisplayName = tx.symbol;
  const _editDbMatch = localStockDB && localStockDB.find(s => s.symbol === tx.symbol);
  if (_editDbMatch) _editDisplayName = _editDbMatch.name;
  else if (cachedMarketData[tx.symbol] && !cachedMarketData[tx.symbol]._failed && cachedMarketData[tx.symbol].name) {
      _editDisplayName = cachedMarketData[tx.symbol].name;
  }
  const _editSymInput = document.getElementById('txSymbol');
  _editSymInput.value = _editDisplayName;
  _editSymInput.dataset.symbol = tx.symbol;
  document.getElementById('txQty').value = Math.abs(tx.qty);
  document.getElementById('txPrice').value = tx.price;
  document.getElementById('txBroker').value = tx.broker || '';
  
  const isUser1 = tx.owner === state.owners.user1.name;
  document.getElementById('owner1').checked = isUser1;
  document.getElementById('owner2').checked = !isUser1;
  document.getElementById('editingTxId').value = id;

  if (tx.txType === 'dividend') document.getElementById('typeDiv').checked = true;
  else if (tx.qty < 0 || tx.txType === 'sell') document.getElementById('typeSell').checked = true;
  else document.getElementById('typeBuy').checked = true;
  
  toggleTxType();
  document.getElementById('btnSubmitTx').textContent = '내역 수정하기';
  document.getElementById('btnSubmitTx').style.background = 'var(--blue)';
  document.getElementById('editModeBanner').style.display = 'block';
  document.getElementById('txPrice').focus();
}

function cancelEdit() {
  document.getElementById('editingTxId').value = '';
  document.getElementById('btnSubmitTx').textContent = '내역 추가하기';
  document.getElementById('btnSubmitTx').style.background = 'var(--accent)';
  document.getElementById('editModeBanner').style.display = 'none';
  
  // 🌟 하이라이트 효과 제거
  const sb = document.getElementById('sidebar');
  sb.classList.remove('highlight-edit');

  document.getElementById('txSymbol').value = '';
  document.getElementById('txQty').value = '';
  document.getElementById('txPrice').value = '';
  toggleTxType();
}

function addOrUpdateTransaction() {
  const typeVal = document.querySelector('input[name="txType"]:checked').value;

  // 특수 유형은 전용 함수로 위임
  if (typeVal === 'transfer') { applyLedgerTransfer(); return; }
  if (typeVal === 'split')    { applyLedgerSplit();    return; }

  const editId = document.getElementById('editingTxId').value;
  const date = document.getElementById('txDate').value;
  const ownerKey = document.querySelector('input[name="txOwner"]:checked').value;
  const owner = state.owners[ownerKey].name;
  const broker = document.getElementById('txBroker').value.trim();
  const txSymbolInput = document.getElementById('txSymbol');
  let symbol;
  if (txSymbolInput.dataset.symbol) {
    symbol = txSymbolInput.dataset.symbol.toUpperCase();
    txSymbolInput.dataset.symbol = '';  // 사용 후 초기화
  } else {
    let rawSymbol = txSymbolInput.value.trim().toUpperCase();
    let cleanRaw = rawSymbol.replace(/\s+/g, '').toUpperCase();
    if (localStockDB && localStockDB.length > 0) {
      let matched = localStockDB.find(s => s.name.replace(/\s+/g,'').toUpperCase() === cleanRaw || s.symbol.toUpperCase() === rawSymbol);
      if(matched) symbol = matched.symbol;
      else if (/^\d{6}$/.test(rawSymbol)) symbol = rawSymbol + '.KS';
      else symbol = rawSymbol;
    } else {
      if (/^\d{6}$/.test(rawSymbol)) symbol = rawSymbol + '.KS';
      else symbol = rawSymbol;
    }
  }

  let qty   = parseFloat(document.getElementById('txQty').value)   || 0;
  let price = parseFloat(document.getElementById('txPrice').value) || 0;

  // ✅ 아래 유효성 검사 추가
  if (!date) {
    alert('📅 날짜를 입력해주세요.'); 
    document.getElementById('txDate').focus(); return;
  }
  if (!symbol) {
    alert('🔍 종목을 입력해주세요.'); 
    document.getElementById('txSymbol').focus(); return;
  }
  if (typeVal !== 'dividend' && qty <= 0) {
    alert('📦 수량을 입력해주세요. (0보다 커야 합니다)'); 
    document.getElementById('txQty').focus(); return;
  }
  if (price <= 0) {
    const label = typeVal === 'dividend' ? '배당금액' : '단가';
    alert(`💰 ${label}을 입력해주세요. (0보다 커야 합니다)`); 
    document.getElementById('txPrice').focus(); return;
  }

  if (typeVal === 'dividend' && document.getElementById('applyDivTax').checked) {
      const taxRate = isKorean(symbol) ? 0.154 : 0.15;
      price = price * (1 - taxRate);
  }

  if (typeVal === 'sell') qty = -Math.abs(qty);
  else if (typeVal === 'buy') qty = Math.abs(qty);
  const finalTxType = typeVal === 'dividend' ? 'dividend' : 'trade'; 

  if (editId) {
    const idx = state.transactions.findIndex(t => t.id == editId);
    if (idx !== -1) state.transactions[idx] = { id: parseInt(editId), date: formatDate(date), owner, broker, symbol, qty, price, txType: finalTxType };
    const sb = document.getElementById('sidebar');
    sb.classList.remove('highlight-edit');
    cancelEdit();
  } else {
    state.transactions.push({ id: Date.now(), date: formatDate(date), owner, broker, symbol, qty, price, txType: finalTxType });
    document.getElementById('txSymbol').value = '';
    document.getElementById('txQty').value = '';
    document.getElementById('txPrice').value = '';
  }

  if(!state.tickers.includes(symbol)) state.tickers.push(symbol);
  saveState(); renderTxList(); 
  if (currentView === 'history') renderHistoryDashboard(); else render();
  triggerAutoSync();
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  if(document.getElementById('editingTxId').value == id) cancelEdit();
  saveState(); renderTxList(); 
  if (currentView === 'history') renderHistoryDashboard(); else render();
  triggerAutoSync();
}

function renderTxList() {
  const listEl = document.getElementById('txList');
  if(!listEl) return;
  const uniqueBrokers = [...new Set(state.transactions.map(t => t.broker).filter(b => b))];
  document.getElementById('brokerTags').innerHTML = uniqueBrokers.map(b => `<button type="button" class="broker-tag" onclick="document.getElementById('txBroker').value='${b}'">${b}</button>`).join('');

  if(state.transactions.length === 0) {
    listEl.innerHTML = `<li style="text-align:center; padding:20px; color:var(--text3); font-size:11px;">등록된 내역이 없습니다.</li>`;
    return;
  }
  
  const reversed = [...state.transactions].sort((a,b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    return dateDiff !== 0 ? dateDiff : b.id - a.id; 
  }).slice(0, 10);
  
  listEl.innerHTML = reversed.map(tx => {
    const isBuy = tx.qty > 0;
    const isDiv = tx.txType === 'dividend';
    const dbMatch = localStockDB.find(s => s.symbol === tx.symbol);
    const cachedMatch = cachedMarketData[tx.symbol];
    const stockName = dbMatch ? dbMatch.name : (cachedMatch && !cachedMatch._failed && cachedMatch.name ? cachedMatch.name : tx.symbol);
    
    const totalAmt = isDiv ? tx.price : Math.abs(tx.qty) * tx.price;
    const isTransfer = tx.txType === 'transfer';
    const typeLabel = isDiv ? '💰 배당금'
        : isTransfer ? (tx.qty > 0 ? '↙ 이전입고' : '↗ 이전출고') + ` ${Math.abs(tx.qty)}주`
        : (isBuy ? '매수' : '매도') + ` ${Math.abs(tx.qty)}주`;
    const typeColor = isDiv ? 'var(--green)'
        : isTransfer ? '#ffb703'
        : (isBuy ? 'var(--red)' : 'var(--blue)');
    const oInfo = getOwnerInfo(tx.owner);

    return `
      <li class="tx-card">
        <div class="tx-card-head">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${tx.date}</span>
            <span class="tx-owner-badge" onclick="toggleTxOwner(${tx.id})" title="클릭하여 소유자 변경" style="background:${oInfo.color}20; color:${oInfo.color}; border:1px solid ${oInfo.color}40;">${oInfo.icon} ${tx.owner} ⇄</span>
            <span style="color:var(--text3)">${tx.broker ? `| ${tx.broker}` : ''}</span>
          </div>
          <div class="tx-actions">
            <button class="tx-action-btn tx-edit" onclick="editTransaction(${tx.id})" title="수정">✏️</button>
            <button class="tx-action-btn tx-del" onclick="deleteTransaction(${tx.id})" title="삭제">✕</button>
          </div>
        </div>
        <div class="tx-card-body">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <span style="font-weight:700; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px; display:inline-block;" title="${stockName}">${stockName}</span>
            <span style="color:${typeColor}; font-weight:700; font-size:11px;">${typeLabel}</span>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
            <span style="font-weight:700; color:var(--text); font-size:13px;">${formatPrice(totalAmt, tx.symbol)}</span>
            <span style="font-family:var(--font-mono); font-weight:500; font-size:10px; color:var(--text2);">${isDiv ? '입금액' : '@ ' + formatPrice(tx.price, tx.symbol)}</span>
          </div>
        </div>
      </li>
    `;
  }).join('');
}

// 🌟 전체 거래 내역 렌더링 (필터 UI 자동 생성 및 필터링 로직 추가)
function renderHistoryDashboard() {
  updateViewHeader('📋', '거래 내역');
  const tbody = document.getElementById('historyTableBody');
  const dash = document.getElementById('historyDashboard');
  if(!tbody || !dash) return;
  
  // 💡 HTML 수정 없이 JS가 알아서 필터 바를 만들어줍니다!
  let filterBar = document.getElementById('historyFilterBar');

  // 계좌 드롭다운 동적 업데이트
  const allBrokers = [...new Set(state.transactions.map(t => t.broker).filter(b => b && b.trim()))].sort();
  const brokerSel = document.getElementById('histBrokerFilter');
  if (brokerSel) {
    const cur = historyFilters.broker;
    brokerSel.innerHTML = `<option value="all">전체</option>` +
      allBrokers.map(b => `<option value="${b}" ${cur===b?'selected':''}>${b}</option>`).join('');
  }

  // 활성 필터 배지 업데이트
  const badgesEl = document.getElementById('historyActiveBadges');
  if (badgesEl) {
    let html = '';
    if (historyFilters.dateFrom || historyFilters.dateTo) {
      const label = historyFilters.dateFrom === historyFilters.dateTo
        ? historyFilters.dateFrom
        : `${historyFilters.dateFrom||'~'} ~ ${historyFilters.dateTo||'~'}`;
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">📅 ${label}
        <span onclick="historyFilters.dateFrom='';historyFilters.dateTo='';renderHistoryDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (historyFilters.owner !== 'all') {
      const oLabel = historyFilters.owner === 'user1' ? state.owners.user1.name : state.owners.user2.name;
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">소유자: ${oLabel}
        <span onclick="historyFilters.owner='all'; document.querySelectorAll('.hist-owner-filter').forEach((b,i)=>b.classList.toggle('active',i===0)); renderHistoryDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (historyFilters.market !== 'all') {
      const mLabel = historyFilters.market === 'kr' ? '국내' : '해외';
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">시장: ${mLabel}
        <span onclick="_setHistMktBtn(document.getElementById('histMktAll')); updateHistoryFilter('market','all');"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (historyFilters.type !== 'all') {
      const tLabel = { buy:'매수', sell:'매도', dividend:'배당' }[historyFilters.type] || historyFilters.type;
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">유형: ${tLabel}
        <span onclick="_setHistTypeBtn(document.getElementById('histTypeAll')); updateHistoryFilter('type','all');"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (historyFilters.broker !== 'all') {
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">계좌: ${historyFilters.broker}
        <span onclick="historyFilters.broker='all'; document.getElementById('histBrokerFilter').value='all'; renderHistoryDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (historyFilters.search) {
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">종목: ${historyFilters.search}
        <span onclick="historyFilters.search=''; document.getElementById('histNameSearch').value=''; renderHistoryDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (html) html += `<button class="btn-sm" onclick="resetHistoryFilters()" style="height:26px; padding:0 10px; color:var(--red); border-color:rgba(255,77,106,0.3); background:rgba(255,77,106,0.05); font-size:11px;">초기화 🔄</button>`;
    badgesEl.innerHTML = html;
  }
  
  // 🌟 선택된 필터 조건에 맞게 데이터 걸러내기
  let filtered = state.transactions.filter(tx => {
      let pass = true;
      const isKr = isKorean(tx.symbol);

      // 소유자 필터
      if (historyFilters.owner === 'user1' && tx.owner !== state.owners.user1.name) pass = false;
      if (historyFilters.owner === 'user2' && tx.owner !== state.owners.user2.name) pass = false;
      
      // 국가 필터
      if (historyFilters.market === 'kr' && !isKr) pass = false;
      if (historyFilters.market === 'us' && isKr) pass = false;
      
      // 거래 유형 필터
      if (historyFilters.type === 'buy'  && !(tx.qty > 0 && (!tx.txType || tx.txType === 'trade' || tx.txType === 'buy')))  pass = false;
      if (historyFilters.type === 'sell' && !(tx.qty < 0 && (!tx.txType || tx.txType === 'trade' || tx.txType === 'sell'))) pass = false;
      if (historyFilters.type === 'dividend' && tx.txType !== 'dividend') pass = false;

      // 거래내역 자체 기간 필터
      if (historyFilters.dateFrom && tx.date < historyFilters.dateFrom) pass = false;
      if (historyFilters.dateTo   && tx.date > historyFilters.dateTo)   pass = false;

      // 계좌 필터
      if (historyFilters.broker !== 'all' && (tx.broker || '') !== historyFilters.broker) pass = false;
      
      // 검색어 필터
      if (historyFilters.search) {
          let s = historyFilters.search.toLowerCase();
          let stockName = tx.symbol;
          const dbMatch = localStockDB.find(x => x.symbol === tx.symbol);
          const cachedMatch = cachedMarketData[tx.symbol];
          if (dbMatch) stockName = dbMatch.name;
          else if (cachedMatch && !cachedMatch._failed && cachedMatch.name) stockName = cachedMatch.name;
          
          if (state.oldNames && state.oldNames[tx.symbol] && state.oldNames[tx.symbol] !== '상장폐지') {
              stockName = state.oldNames[tx.symbol];
          }
          if (!tx.symbol.toLowerCase().includes(s) && !stockName.toLowerCase().includes(s)) pass = false;
      }
      return pass;
  });

  const sorted = filtered.sort((a,b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
  // ── 필터 요약바 ──────────────────────────────────────────
  const summaryEl = document.getElementById('histSummaryBar');
  if (summaryEl) {
      const isAnyFilterActive = historyFilters.market !== 'all' || historyFilters.type !== 'all' ||
          historyFilters.search || historyFilters.dateFrom || historyFilters.dateTo ||
          historyFilters.broker !== 'all' || historyFilters.owner !== 'all';
  
      const tradeTxs = sorted.filter(t => t.txType !== 'dividend' && t.txType !== 'transfer');
  
      if (!isAnyFilterActive || tradeTxs.length === 0) {
          summaryEl.style.display = 'none';
      } else {
          let buyKrw = 0, sellKrw = 0;
          tradeTxs.forEach(tx => {
              const amt = Math.abs(tx.qty) * tx.price;
              const fxRate = !isKorean(tx.symbol) ? getHistoricalFxRate(tx.date) : 1;
              const amtKrw = amt * fxRate;
              if (tx.qty > 0) buyKrw += amtKrw;
              else sellKrw += amtKrw;
          });
          const net = sellKrw - buyKrw;
          const fmtW = v => {
              const abs = Math.abs(v);
              if (abs >= 100000000) return '₩' + (abs/100000000).toFixed(1) + '억';
              if (abs >= 10000) return '₩' + Math.round(abs/10000).toLocaleString() + '만';
              return '₩' + Math.round(abs).toLocaleString();
          };
          summaryEl.style.display = 'block';
          summaryEl.innerHTML = `
              <div style="display:flex; gap:20px; align-items:center; padding:10px 16px;
                          background:var(--bg2); border:1px solid var(--border); border-radius:8px;
                          font-size:12px; flex-wrap:wrap;">
                  <span style="color:var(--text3); font-weight:700;">📋 ${tradeTxs.length}건</span>
                  <span>매수 <b style="color:var(--red);">${fmtW(buyKrw)}</b></span>
                  <span>매도 <b style="color:var(--blue);">${fmtW(sellKrw)}</b></span>
                  <span style="border-left:1px solid var(--border); padding-left:20px;">
                      ${net >= 0 ? '순매도' : '순매수'}
                      <b style="color:${net >= 0 ? 'var(--blue)' : 'var(--red)'};">${fmtW(Math.abs(net))}</b>
                  </span>
                  <span style="color:var(--text3); font-size:10px; margin-left:auto;">* 미국주식은 거래일 환율 환산</span>
              </div>`;
      }
  }
  
  if(sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--text3);">조건에 맞는 거래 내역이 없습니다.</td></tr>`;
      return;
  }
  
  tbody.innerHTML = sorted.map(tx => {
      const isBuy = tx.qty > 0;
      const isDiv = tx.txType === 'dividend';
      const isTransfer = tx.txType === 'transfer';
      const totalAmt = isDiv ? tx.price : Math.abs(tx.qty) * tx.price;
      const typeLabel = isDiv ? '배당'
          : isTransfer ? (isBuy ? '↙ 이전입고' : '↗ 이전출고')
          : (isBuy ? '매수' : '매도');
      const typeColor = isDiv ? 'var(--green)'
          : isTransfer ? '#ffb703'
          : (isBuy ? 'var(--red)' : 'var(--blue)');
      const isUs = !isKorean(tx.symbol) && !isDiv && !isTransfer;
      const txFxRate = isUs ? getHistoricalFxRate(tx.date) : null;
      const totalKrw  = isUs && txFxRate ? Math.round(totalAmt * txFxRate) : null;
      
      let stockName = tx.symbol;
      const dbMatch = localStockDB.find(s => s.symbol === tx.symbol);
      const cachedMatch = cachedMarketData[tx.symbol];
      if (dbMatch) stockName = dbMatch.name;
      else if (cachedMatch && !cachedMatch._failed && cachedMatch.name) stockName = cachedMatch.name;

      if (state.oldNames && state.oldNames[tx.symbol]) {
          if (state.oldNames[tx.symbol] === '상장폐지') {
              stockName = `${tx.symbol.replace('.KS.DLST', '').replace('.DLST', '')} (상장폐지)`;
          } else {
              stockName = `${stockName} (구: ${state.oldNames[tx.symbol]})`;
          }
      }

      const oInfo = getOwnerInfo(tx.owner);

      const isChecked = _histSelectedIds.has(tx.id);
      return `
      <tr style="border-bottom: 1px solid var(--border); transition: 0.2s; ${isChecked ? 'background:rgba(var(--accent-rgb, 99,102,241),0.07);' : ''}" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='${isChecked ? 'rgba(99,102,241,0.07)' : 'transparent'}'">
          <td style="padding:12px 8px; text-align:center;">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleHistTxSelect(${tx.id}, this)" style="cursor:pointer; width:15px; height:15px;">
          </td>
          <td style="padding:12px 16px; color:var(--text2);">${tx.date}</td>
          <td style="padding:12px 16px;"><span class="tx-owner-badge" onclick="toggleTxOwner(${tx.id})" title="클릭하여 소유자 변경" style="margin:0; background:${oInfo.color}20; color:${oInfo.color}; border:1px solid ${oInfo.color}40;">${oInfo.icon} ${tx.owner} ⇄</span></td>
          <td style="padding:12px 16px; color:var(--text2);">${tx.broker || '-'}</td>
          <td style="padding:12px 16px; font-weight:700; color:${typeColor};">${typeLabel}</td>
          <td style="padding:12px 16px;"><div style="font-weight:700; color:var(--text);">${stockName}</div><div style="font-size:10px; font-family:var(--font-mono); color:var(--text3);">${tx.symbol.replace('.KS.DLST','').replace('.DLST','')}</div></td>
          <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono);">${isDiv ? '-' : Math.abs(tx.qty)}</td>
          <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono);">${isDiv ? '-' : formatPrice(tx.price, tx.symbol)}</td>
          <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--text);">
              ${currencyTag(tx.symbol)}${formatPrice(totalAmt, tx.symbol)}
              ${totalKrw != null ? `<div style="font-size:10px; font-weight:600; margin-top:3px; color:var(--green);">≈ ₩${totalKrw.toLocaleString()} <span style="color:var(--text3);font-weight:400;font-size:9px;">@${Math.round(txFxRate).toLocaleString()}</span></div>` : ''}
          </td>
          <td style="padding:12px 16px; text-align:center;"><div class="tx-actions" style="justify-content:center;"><button class="tx-action-btn tx-edit" onclick="editTransaction(${tx.id})" title="수정">✏️</button><button class="tx-action-btn tx-del" onclick="deleteTransaction(${tx.id})" title="삭제">✕</button></div></td>
      </tr>`;
  }).join('');
  const allCb = document.getElementById('histSelectAll');
  if (allCb) {
    const allChecked = sorted.length > 0 && sorted.every(tx => _histSelectedIds.has(tx.id));
    allCb.checked = allChecked;
    allCb.indeterminate = !allChecked && sorted.some(tx => _histSelectedIds.has(tx.id));
  }
  renderHistoryRanking(filtered);
}

function renderHistoryRanking(txs) {
    const panel = document.getElementById('historyRankingPanel');
    if (!panel) return;

    const today = new Date();
    const o1 = state.owners.user1;
    const o2 = state.owners.user2;
    const ownerFilter = historyFilters.owner; // 'all' | 'user1' | 'user2'

    const ownerGroups = ownerFilter === 'user1'
        ? [{ key: 'user1', name: o1.name, icon: o1.icon, color: o1.color, txs, allTxs: state.transactions.filter(t => t.owner === o1.name) }]
        : ownerFilter === 'user2'
            ? [{ key: 'user2', name: o2.name, icon: o2.icon, color: o2.color, txs, allTxs: state.transactions }]
            : [{ key: 'all', name: '전체', icon: '📊', color: 'var(--accent)', txs, allTxs: state.transactions }];

    // 금액 포맷
    const fmtW = v => {
        const a = Math.abs(v);
        if (a >= 100000000) return `₩${(a/100000000).toFixed(1)}억`;
        if (a >= 10000)     return `₩${Math.round(a/10000).toLocaleString()}만`;
        return `₩${Math.round(a).toLocaleString()}`;
    };

    // 종목명 헬퍼
    const getName = sym => {
        const db = localStockDB.find(x => x.symbol === sym);
        const c  = cachedMarketData[sym];
        if (db) return db.name;
        if (c && !c._failed && c.name) return c.name;
        return sym.replace(/\.KS\.DLST|\.DLST|\.KS/g, '');
    };

    // 소유자별 랭킹 계산
    const calcRanks = ({ txs: otxs, allTxs }) => {
        const sortMult = historyRankingSortDir === 'asc' ? -1 : 1;

        // 1. 단일 최대 매수
        const bigBuyMap = {};
        otxs.filter(t => (!t.txType || t.txType === 'trade' || t.txType === 'buy') && t.qty > 0).forEach(t => {
            const fx  = !isKorean(t.symbol) ? getHistoricalFxRate(t.date) : 1;
            const amt = t.qty * t.price * fx;
            if (!bigBuyMap[t.symbol] || amt > bigBuyMap[t.symbol].amt)
                bigBuyMap[t.symbol] = { amt, date: t.date };
        });
        const bigBuyRank = Object.entries(bigBuyMap)
            .map(([sym, d]) => ({ sym, ...d }))
            .sort((a, b) => (b.amt - a.amt) * sortMult);

        // 2. 장기 보유 (소유자별 전체 거래 기준)
        const netQty = {}, firstBuy = {};
        [...allTxs]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .filter(t => !t.txType || t.txType === 'trade' || t.txType === 'buy' || t.txType === 'sell' || t.txType === 'transfer')
            .forEach(t => {
                netQty[t.symbol] = (netQty[t.symbol] || 0) + t.qty;
                if (netQty[t.symbol] <= 0.0001) {
                    delete firstBuy[t.symbol];
                } else if (t.qty > 0 && !firstBuy[t.symbol]) {
                    firstBuy[t.symbol] = t.date;
                }
            });
        const holdRank = Object.entries(netQty)
            .filter(([sym, qty]) => qty > 0.0001 && firstBuy[sym])
            .map(([sym]) => ({
                sym,
                days: Math.floor((today - new Date(firstBuy[sym])) / 86400000),
                firstDate: firstBuy[sym]
            }))
            .sort((a, b) => (b.days - a.days) * sortMult);

        // 3. 거래 빈도
        const freqMap = {};
        otxs.filter(t => !t.txType || t.txType === 'trade' || t.txType === 'buy' || t.txType === 'sell').forEach(t => {
            freqMap[t.symbol] = (freqMap[t.symbol] || 0) + 1;
        });
        const freqRank = Object.entries(freqMap)
            .map(([sym, cnt]) => ({ sym, cnt }))
            .sort((a, b) => (b.cnt - a.cnt) * sortMult);

        // 4. 누적 매수액
        const totalMap = {};
        otxs.filter(t => (!t.txType || t.txType === 'trade' || t.txType === 'buy') && t.qty > 0).forEach(t => {
            const fx  = !isKorean(t.symbol) ? getHistoricalFxRate(t.date) : 1;
            totalMap[t.symbol] = (totalMap[t.symbol] || 0) + t.qty * t.price * fx;
        });
        const totalRank = Object.entries(totalMap)
            .map(([sym, amt]) => ({ sym, amt }))
            .sort((a, b) => (b.amt - a.amt) * sortMult);

        return { bigBuyRank, holdRank, freqRank, totalRank };
    };
  
    // 공통 랭킹 row
    const rankRow = (sym, rank, valueHtml, barPct, color) => {
        const medalMap = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const medal = medalMap[rank] || `<span style="font-size:11px; color:var(--text3); font-weight:700; min-width:18px; display:inline-block; text-align:center;">${rank}</span>`;
        return `
        <div style="padding:8px 10px; border-radius:8px; transition:0.15s;"
             onmouseover="this.style.background='rgba(255,255,255,0.04)'"
             onmouseout="this.style.background='transparent'">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
            <span style="font-size:15px; flex-shrink:0;">${medal}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${getName(sym)}</div>
              <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono);">${sym.replace(/\.KS\.DLST|\.DLST|\.KS/g,'')}</div>
            </div>
            <div style="text-align:right; flex-shrink:0; font-family:var(--font-mono); font-size:11px; font-weight:700; color:${color}; line-height:1.4;">${valueHtml}</div>
          </div>
          <div style="height:3px; border-radius:2px; background:var(--bg3); overflow:hidden;">
            <div style="height:100%; width:${Math.min(100,barPct)}%; background:${color}; border-radius:2px; transition:width 0.4s;"></div>
          </div>
        </div>`;
    };

    // 탭 버튼
    const tabBtn = (tab, label) => {
        const on = historyRankingTab === tab;
        return `<button onclick="setHistoryRankingTab('${tab}')"
            style="flex:1; padding:9px 6px; font-size:13px; font-weight:700; border:none;
                   background:transparent; color:${on?'var(--accent)':'var(--text3)'};
                   cursor:pointer; border-bottom:2px solid ${on?'var(--accent)':'transparent'};
                   transition:0.2s; font-family:var(--font-sans);">
            ${label}
        </button>`;
    };

    const empty = msg => `<div style="text-align:center; padding:30px 0; font-size:12px; color:var(--text3);">${msg}</div>`;

    // 소유자 섹션 렌더
    const renderOwnerSection = (group) => {
        const { name, icon, color } = group;
        const { bigBuyRank, holdRank, freqRank, totalRank } = calcRanks(group);
        const accentColor = color || 'var(--accent)';

        let listHtml = '';
        if (historyRankingTab === 'bigbuy') {
            if (!bigBuyRank.length) { listHtml = empty('매수 내역 없음'); }
            else {
                const max = Math.max(...bigBuyRank.map(d => d.amt));
                listHtml = bigBuyRank.map((d, i) =>
                    rankRow(d.sym, i+1,
                        `${fmtW(d.amt)}<div style="font-size:9px;color:var(--text3);font-weight:400;margin-top:1px;">${d.date}</div>`,
                        max === 0 ? 0 : (d.amt/max)*100, '#7c6af7')
                ).join('');
            }
        } else if (historyRankingTab === 'hold') {
            if (!holdRank.length) { listHtml = empty('현재 보유 종목 없음'); }
            else {
                const max = Math.max(...holdRank.map(d => d.days));
                listHtml = holdRank.map((d, i) =>
                    rankRow(d.sym, i+1,
                        `${d.days.toLocaleString()}일<div style="font-size:9px;color:var(--text3);font-weight:400;margin-top:1px;">${d.firstDate} 첫 매수</div>`,
                        max === 0 ? 0 : (d.days/max)*100, '#00C578')
                ).join('');
            }
        } else if (historyRankingTab === 'freq') {
            if (!freqRank.length) { listHtml = empty('거래 내역 없음'); }
            else {
                const max = Math.max(...freqRank.map(d => d.cnt));
                listHtml = freqRank.map((d, i) =>
                    rankRow(d.sym, i+1, `${d.cnt}회`, max === 0 ? 0 : (d.cnt/max)*100, '#ffb703')
                ).join('');
            }
        } else if (historyRankingTab === 'total') {
            if (!totalRank.length) { listHtml = empty('매수 내역 없음'); }
            else {
                const max = Math.max(...totalRank.map(d => d.amt));
                listHtml = totalRank.map((d, i) =>
                    rankRow(d.sym, i+1, fmtW(d.amt), max === 0 ? 0 : (d.amt/max)*100, '#3A9AFF')
                ).join('');
            }
        }

        const headerHtml = ownerFilter === 'all'
            ? `<div style="padding:8px 12px 6px; font-size:11px; font-weight:700; color:${accentColor}; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:5px; flex-shrink:0;">
                 <span>${icon}</span><span>${name}</span>
               </div>`
            : '';

        return `<div style="flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden;">
            ${headerHtml}
            <div style="flex:1; overflow-y:auto; padding:6px 8px; display:flex; flex-direction:column; gap:2px;">
              ${listHtml}
            </div>
          </div>`;
    };

    const sectionsHtml = `<div style="flex:1; overflow:hidden; display:flex; flex-direction:column;">${renderOwnerSection(ownerGroups[0])}</div>`;

    panel.innerHTML = `
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; display:flex; flex-direction:column; height:100%;">
      <div style="padding:10px 12px; border-bottom:1px solid var(--border); flex-shrink:0;">
        <div style="display:flex; border-bottom:1px solid var(--border); flex-shrink:0; align-items:stretch;">
          ${tabBtn('bigbuy', '💰 단일 최대')}
          ${tabBtn('hold',   '⏳ 장기 보유')}
          ${tabBtn('freq',   '🔄 거래 빈도')}
          ${tabBtn('total',  '📦 누적 매수')}
          <div style="margin-left:auto; display:flex; align-items:center; padding:0 8px; gap:4px; border-left:1px solid var(--border);">
            <button onclick="setHistoryRankingSortDir('desc')"
              style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${historyRankingSortDir==='desc'?'var(--accent)':'var(--border)'}; background:${historyRankingSortDir==='desc'?'var(--accent-bg)':'transparent'}; color:${historyRankingSortDir==='desc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; line-height:1;">↓</button>
            <button onclick="setHistoryRankingSortDir('asc')"
              style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${historyRankingSortDir==='asc'?'var(--accent)':'var(--border)'}; background:${historyRankingSortDir==='asc'?'var(--accent-bg)':'transparent'}; color:${historyRankingSortDir==='asc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; line-height:1;">↑</button>
          </div>
        </div>
      </div>
      ${sectionsHtml}
    </div>`;
}

function setHistoryDatePreset(preset) {
    const today = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    let from = '';
    const to = fmt(today);
    if (preset === '1m') {
        const d = new Date(today); d.setMonth(d.getMonth() - 1); from = fmt(d);
    } else if (preset === '3m') {
        const d = new Date(today); d.setMonth(d.getMonth() - 3); from = fmt(d);
    } else if (preset === '6m') {
        const d = new Date(today); d.setMonth(d.getMonth() - 6); from = fmt(d);
    } else if (preset === '1y') {
        const d = new Date(today); d.setFullYear(d.getFullYear() - 1); from = fmt(d);
    } else if (preset === 'ytd') {
        from = `${today.getFullYear()}-01-01`;
    }
    historyFilters.dateFrom = from;
    historyFilters.dateTo = to;
    renderHistoryDashboard();
}

function resetHistoryFilters() {
  historyFilters = { market: 'all', type: 'all', search: '', dateFrom: '', dateTo: '', broker: 'all', owner: 'all' };
  const nameEl = document.getElementById('histNameSearch');
  if (nameEl) nameEl.value = '';
  // 버튼 active 초기화
  ['histMktAll','histTypeAll'].forEach(id => { const b = document.getElementById(id); if(b) b.classList.add('active'); });
  ['histMktKr','histMktUs','histTypeBuy','histTypeSell','histTypeDiv'].forEach(id => { const b = document.getElementById(id); if(b) b.classList.remove('active'); });
  document.querySelectorAll('.hist-owner-filter').forEach((b,i) => b.classList.toggle('active', i===0));
  renderHistoryDashboard();
}

// ── 거래내역 필터 헬퍼 ──────────────────────────────
function setHistoryOwnerFilter(filter, el) {
  historyFilters.owner = filter;
  document.querySelectorAll('.hist-owner-filter').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderHistoryDashboard();
}
function _setHistMktBtn(el) {
  ['histMktAll','histMktKr','histMktUs'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  el.classList.add('active');
}
function _setHistTypeBtn(el) {
  ['histTypeAll','histTypeBuy','histTypeSell','histTypeDiv'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  el.classList.add('active');
}
// 거래내역 날짜 피커
function openHistoryDatePicker() {
  const today = new Date();
  _drp.year = today.getFullYear(); _drp.month = today.getMonth();
  _drp.dragStart = historyFilters.dateFrom || null;
  _drp.dragEnd   = historyFilters.dateTo   || null;
  _drp.hover = null; _drp.dragging = false;
  _renderHistDrpCalendar();
  document.getElementById('historyDatePickerPop').style.display = 'block';
}
function closeHistoryDatePicker() {
  document.getElementById('historyDatePickerPop').style.display = 'none';
}
function _renderHistDrpCalendar() {
  const el = document.getElementById('historyDatePickerPop');
  if (!el) return;
  const y = _drp.year, m = _drp.month;
  const firstDay = new Date(y,m,1).getDay(), daysInMonth = new Date(y,m+1,0).getDate();
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  let rs = _drp.dragStart, re = _drp.dragEnd;
  if (rs && re && rs > re) [rs,re]=[re,rs];
  const todayStr = new Date().toISOString().split('T')[0];
  const dayH = ['일','월','화','수','목','금','토'].map(d=>`<div style="text-align:center;font-size:10px;color:var(--text3);padding:4px 0;">${d}</div>`).join('');
  let cells = '';
  for(let i=0;i<firstDay;i++) cells+='<div></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ds=_drpFmt(y,m,d), isEdge=ds===rs||ds===re, inRange=rs&&re&&ds>=rs&&ds<=re, isToday=ds===todayStr;
    let bg='transparent',color=isToday?'var(--green)':'var(--text)',fw=isToday?'700':'400';
    if(isEdge){bg='var(--accent)';color='#fff';fw='700';}
    else if(inRange){bg='var(--accent-bg)';color='var(--accent)';}
    cells+=`<div style="text-align:center;padding:7px 2px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:${fw};background:${bg};color:${color};user-select:none;transition:background 0.1s;"
      onclick="_histDrpClick('${ds}')"
      onmouseover="if(this.style.background==='transparent')this.style.background='rgba(255,255,255,0.05)'"
      onmouseout="this.style.background='${bg}'">${d}</div>`;
  }
  const selText=(rs&&re&&rs!==re)?`${rs} ~ ${re}`:(rs?`${rs} (두 번째 날짜 선택 가능)`:'날짜 클릭: 하루 / 두 번 클릭: 기간');
  el.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:16px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.5);" onmousedown="event.stopPropagation()">
    <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border);">
      ${_yearBtnsHtml('_histDrpApplyYear')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <button onclick="_histDrpNav(-1)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 10px;font-size:12px;">◀</button>
      <span onclick="_histDrpApplyMonth()" style="font-weight:700;font-size:14px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;">${y}년 ${monthNames[m]}</span>
      <button onclick="_histDrpNav(1)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 10px;font-size:12px;">▶</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">${dayH}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">${cells}</div>
    <div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);text-align:center;min-height:28px;line-height:1.6;">${selText}</div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button onclick="_histDrpClear()" style="flex:1;padding:7px;font-size:11px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer;">초기화</button>
      <button onclick="_histDrpApply()" style="flex:1;padding:7px;font-size:11px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;">적용</button>
    </div>
  </div>`;
}
function _histDrpNav(d){_drp.month+=d;if(_drp.month>11){_drp.month=0;_drp.year++;}if(_drp.month<0){_drp.month=11;_drp.year--;}_renderHistDrpCalendar();}
function _histDrpClick(ds){if(!_drp.dragStart||(_drp.dragStart&&_drp.dragEnd)){_drp.dragStart=ds;_drp.dragEnd=null;}else{_drp.dragEnd=ds;if(_drp.dragStart>_drp.dragEnd)[_drp.dragStart,_drp.dragEnd]=[_drp.dragEnd,_drp.dragStart];}_renderHistDrpCalendar();}
function _histDrpClear(){_drp.dragStart=null;_drp.dragEnd=null;_renderHistDrpCalendar();}
function _histDrpApply(){if(_drp.dragStart&&!_drp.dragEnd){historyFilters.dateFrom=_drp.dragStart;historyFilters.dateTo=_drp.dragStart;}else{historyFilters.dateFrom=_drp.dragStart||'';historyFilters.dateTo=_drp.dragEnd||'';}closeHistoryDatePicker();renderHistoryDashboard();}
function _histDrpApplyMonth(){const y=_drp.year,m=_drp.month;historyFilters.dateFrom=`${y}-${String(m+1).padStart(2,'0')}-01`;historyFilters.dateTo=`${y}-${String(m+1).padStart(2,'0')}-${String(new Date(y,m+1,0).getDate()).padStart(2,'0')}`;closeHistoryDatePicker();renderHistoryDashboard();}

// ── 📅 날짜 일괄수정 ─────────────────────────────────────────────────────────
let _bdCurrentTab = 'shift';
let _bdFilteredIds = []; // 현재 필터 기준 대상 tx id 목록

function _getBdFilteredTxs() {
  // renderHistoryDashboard와 동일한 필터 로직으로 대상 목록 반환
  return state.transactions.filter(tx => {
    let pass = true;
    const isKr = isKorean(tx.symbol);
    if (historyFilters.owner === 'user1' && tx.owner !== state.owners.user1.name) pass = false;
    if (historyFilters.owner === 'user2' && tx.owner !== state.owners.user2.name) pass = false;
    if (historyFilters.market === 'kr' && !isKr) pass = false;
    if (historyFilters.market === 'us' && isKr) pass = false;
    if (historyFilters.type === 'buy' && (tx.txType !== 'trade' || tx.qty <= 0)) pass = false;
    if (historyFilters.type === 'sell' && (tx.txType !== 'trade' || tx.qty >= 0)) pass = false;
    if (historyFilters.type === 'dividend' && tx.txType !== 'dividend') pass = false;
    if (historyFilters.dateFrom && tx.date < historyFilters.dateFrom) pass = false;
    if (historyFilters.dateTo   && tx.date > historyFilters.dateTo)   pass = false;
    if (historyFilters.broker !== 'all' && (tx.broker || '') !== historyFilters.broker) pass = false;
    if (historyFilters.search) {
      let s = historyFilters.search.toLowerCase();
      let stockName = tx.symbol;
      const dbMatch = localStockDB.find(x => x.symbol === tx.symbol);
      const cachedMatch = cachedMarketData[tx.symbol];
      if (dbMatch) stockName = dbMatch.name;
      else if (cachedMatch && !cachedMatch._failed && cachedMatch.name) stockName = cachedMatch.name;
      if (!tx.symbol.toLowerCase().includes(s) && !stockName.toLowerCase().includes(s)) pass = false;
    }
    const cutoff = getCutoffDateFromRange(state.range);
    if (tx.date < cutoff) pass = false;
    return pass;
  });
}

function openBulkDateModal() {
  const filtered = state.transactions.filter(t => _histSelectedIds.has(t.id));
  _bdFilteredIds = filtered.map(t => t.id);

  const infoEl = document.getElementById('bulkDateTargetInfo');
  const today = new Date().toISOString().slice(0, 10);
  if (filtered.length === 0) {
    infoEl.innerHTML = `<span style="color:var(--red);">⚠️ 현재 필터 조건에 해당하는 거래 내역이 없습니다.</span>`;
    document.getElementById('btnBulkDateApply').disabled = true;
    document.getElementById('btnBulkDateApply').style.opacity = '0.4';
  } else {
    const dates = filtered.map(t => t.date).sort();
    infoEl.innerHTML = `
      <b style="color:var(--text);">대상: ${filtered.length}건</b> &nbsp;|&nbsp;
      기간: <span style="color:var(--accent);">${dates[0]}</span> ~ <span style="color:var(--accent);">${dates[dates.length - 1]}</span><br>
      <span style="font-size:11px;">현재 필터 조건에 해당하는 내역에만 적용됩니다.</span>`;
    document.getElementById('btnBulkDateApply').disabled = false;
    document.getElementById('btnBulkDateApply').style.opacity = '1';
  }

  // 기본값 세팅
  document.getElementById('bdShiftDays').value = 1;
  document.getElementById('bdShiftDir').value = 'back';
  document.getElementById('bdShiftDirLabel').textContent = '← 과거로';
  const bdReplaceFrom = document.getElementById('bdReplaceFrom');
  const bdReplaceTo = document.getElementById('bdReplaceTo');
  const bdSetDate = document.getElementById('bdSetDate');
  if (filtered.length > 0) {
    bdReplaceFrom.value = filtered[0].date;
    bdReplaceTo.value = today;
    bdSetDate.value = today;
  }
  _updateBdPreviews();

  setBdTab('shift');
  document.getElementById('bulkDateOverlay').style.display = 'flex';
}

function toggleHistSelectAll(cb) {
  const filtered = _getBdFilteredTxs();
  if (cb.checked) {
    filtered.forEach(tx => _histSelectedIds.add(tx.id));
  } else {
    filtered.forEach(tx => _histSelectedIds.delete(tx.id));
  }
  renderHistoryDashboard();
}

function toggleHistTxSelect(id, cb) {
  if (cb.checked) _histSelectedIds.add(id);
  else _histSelectedIds.delete(id);
  // 전체선택 체크박스 상태 갱신
  const filtered = _getBdFilteredTxs();
  const allCb = document.getElementById('histSelectAll');
  if (allCb) {
    const allChecked = filtered.length > 0 && filtered.every(tx => _histSelectedIds.has(tx.id));
    allCb.checked = allChecked;
    allCb.indeterminate = !allChecked && filtered.some(tx => _histSelectedIds.has(tx.id));
  }
}

function closeBulkDateModal() {
  document.getElementById('bulkDateOverlay').style.display = 'none';
}

function setBdTab(tab) {
  _bdCurrentTab = tab;
  const tabs = ['shift', 'replace', 'set'];
  tabs.forEach(t => {
    const btn = document.getElementById(`bdTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const panel = document.getElementById(`bdPanel${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (!btn || !panel) return;
    if (t === tab) {
      btn.style.borderBottomColor = 'var(--accent)';
      btn.style.color = 'var(--accent)';
      btn.style.fontWeight = '700';
      panel.style.display = 'block';
    } else {
      btn.style.borderBottomColor = 'transparent';
      btn.style.color = 'var(--text2)';
      btn.style.fontWeight = '400';
      panel.style.display = 'none';
    }
  });
  _updateBdPreviews();
}

function _shiftDate(dateStr, days, direction) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + (direction === 'forward' ? days : -days));
  return d.toISOString().slice(0, 10);
}

function _updateBdPreviews() {
  const filtered = _bdFilteredIds.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  if (!filtered.length) return;

  // 이동 미리보기
  const shiftDays = parseInt(document.getElementById('bdShiftDays')?.value) || 1;
  const shiftDir = document.getElementById('bdShiftDir')?.value || 'back';
  const sampleTx = filtered[0];
  const sampleNewDate = _shiftDate(sampleTx.date, shiftDays, shiftDir);
  const shiftPreview = document.getElementById('bdShiftPreview');
  if (shiftPreview) {
    shiftPreview.innerHTML = `예시: <b style="color:var(--text);">${sampleTx.date}</b> → <b style="color:var(--accent);">${sampleNewDate}</b> &nbsp;(${filtered.length}건 전체 적용)`;
  }

  // 치환 미리보기
  const rfrom = document.getElementById('bdReplaceFrom')?.value;
  const rto = document.getElementById('bdReplaceTo')?.value;
  const matchCount = filtered.filter(t => t.date === rfrom).length;
  const repPreview = document.getElementById('bdReplacePreview');
  if (repPreview && rfrom && rto) {
    repPreview.innerHTML = matchCount > 0
      ? `<b style="color:var(--accent);">${rfrom}</b> 날짜를 가진 내역 <b style="color:var(--text);">${matchCount}건</b>이 <b style="color:var(--accent);">${rto}</b>으로 변경됩니다.`
      : `<span style="color:var(--red);">현재 필터된 내역 중 <b>${rfrom}</b> 날짜를 가진 거래가 없습니다.</span>`;
  }

  // 설정 미리보기
  const setDate = document.getElementById('bdSetDate')?.value;
  const setPreview = document.getElementById('bdSetPreview');
  if (setPreview && setDate) {
    setPreview.innerHTML = `필터된 <b style="color:var(--text);">${filtered.length}건</b> 전체가 <b style="color:var(--accent);">${setDate}</b>으로 설정됩니다.`;
  }
}

function applyBulkDate() {
  const filtered = _bdFilteredIds.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  if (!filtered.length) { alert('대상 거래 내역이 없습니다.'); return; }

  let changeCount = 0;

  if (_bdCurrentTab === 'shift') {
    const days = parseInt(document.getElementById('bdShiftDays').value);
    const dir = document.getElementById('bdShiftDir').value;
    if (!days || days < 1) { alert('이동할 일수를 올바르게 입력하세요.'); return; }
    const dirLabel = dir === 'forward' ? `+${days}일 (미래)` : `-${days}일 (과거)`;
    if (!confirm(`필터된 거래 ${filtered.length}건의 날짜를 ${dirLabel}로 이동합니다.\n계속하시겠습니까?`)) return;
    filtered.forEach(tx => {
      tx.date = _shiftDate(tx.date, days, dir);
      changeCount++;
    });

  } else if (_bdCurrentTab === 'replace') {
    const fromDate = document.getElementById('bdReplaceFrom').value;
    const toDate = document.getElementById('bdReplaceTo').value;
    if (!fromDate || !toDate) { alert('변경할 날짜와 바꿀 날짜를 모두 입력하세요.'); return; }
    const targets = filtered.filter(t => t.date === fromDate);
    if (!targets.length) { alert(`현재 필터된 내역 중 ${fromDate} 날짜를 가진 거래가 없습니다.`); return; }
    if (!confirm(`${fromDate} 날짜를 가진 거래 ${targets.length}건을 ${toDate}으로 변경합니다.\n계속하시겠습니까?`)) return;
    targets.forEach(tx => { tx.date = toDate; changeCount++; });

  } else if (_bdCurrentTab === 'set') {
    const setDate = document.getElementById('bdSetDate').value;
    if (!setDate) { alert('설정할 날짜를 입력하세요.'); return; }
    if (!confirm(`필터된 거래 ${filtered.length}건의 날짜를 모두 ${setDate}으로 설정합니다.\n계속하시겠습니까?`)) return;
    filtered.forEach(tx => { tx.date = setDate; changeCount++; });
  }

  if (changeCount > 0) {
    saveState();
    closeBulkDateModal();
    renderHistoryDashboard();
    alert(`✅ ${changeCount}건의 날짜가 수정되었습니다.`);
  }
}
// ── 날짜 일괄수정 끝 ─────────────────────────────────────────────────────────


function updateDividendFilter(key, value) {
  dividendFilters[key] = value;
  renderDividendDashboard();
}
function _setDivMktBtn(el) {
  ['divMktAll','divMktKr','divMktUs'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  el.classList.add('active');
}
function resetDividendFilters() {
  dividendFilters = { market: 'all', broker: 'all', search: '', dateFrom: '', dateTo: '' };
  const nameEl = document.getElementById('divNameSearch');
  if (nameEl) nameEl.value = '';
  ['divMktKr','divMktUs'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById('divMktAll')?.classList.add('active');
  renderDividendDashboard();
}
function openDividendDatePicker() {
  const today = new Date();
  _drp.year = today.getFullYear(); _drp.month = today.getMonth();
  _drp.dragStart = dividendFilters.dateFrom || null;
  _drp.dragEnd   = dividendFilters.dateTo   || null;
  _drp.hover = null; _drp.dragging = false;
  _renderDivDrpCalendar();
  document.getElementById('dividendDatePickerPop').style.display = 'block';
}
function closeDividendDatePicker() {
  document.getElementById('dividendDatePickerPop').style.display = 'none';
}
function _renderDivDrpCalendar() {
  const el = document.getElementById('dividendDatePickerPop');
  if (!el) return;
  const y=_drp.year, m=_drp.month, firstDay=new Date(y,m,1).getDay(), daysInMonth=new Date(y,m+1,0).getDate();
  const monthNames=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  let rs=_drp.dragStart, re=_drp.dragEnd;
  if(rs&&re&&rs>re)[rs,re]=[re,rs];
  const todayStr=new Date().toISOString().split('T')[0];
  const dayH=['일','월','화','수','목','금','토'].map(d=>`<div style="text-align:center;font-size:10px;color:var(--text3);padding:4px 0;">${d}</div>`).join('');
  let cells='';
  for(let i=0;i<firstDay;i++) cells+='<div></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ds=_drpFmt(y,m,d),isEdge=ds===rs||ds===re,inRange=rs&&re&&ds>=rs&&ds<=re,isToday=ds===todayStr;
    let bg='transparent',color=isToday?'var(--green)':'var(--text)',fw=isToday?'700':'400';
    if(isEdge){bg='var(--accent)';color='#fff';fw='700';}else if(inRange){bg='var(--accent-bg)';color='var(--accent)';}
    cells+=`<div style="text-align:center;padding:7px 2px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:${fw};background:${bg};color:${color};user-select:none;transition:background 0.1s;"
      onclick="_divDrpClick('${ds}')"
      onmouseover="if(this.style.background==='transparent')this.style.background='rgba(255,255,255,0.05)'"
      onmouseout="this.style.background='${bg}'">${d}</div>`;
  }
  const selText=(rs&&re&&rs!==re)?`${rs} ~ ${re}`:(rs?`${rs} (두 번째 날짜 선택 가능)`:'날짜 클릭: 하루 / 두 번 클릭: 기간');
  el.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:16px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.5);" onmousedown="event.stopPropagation()">
    <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border);">
      ${_yearBtnsHtml('_divDrpApplyYear')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <button onclick="_divDrpNav(-1)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 10px;font-size:12px;">◀</button>
      <span onclick="_divDrpApplyMonth()" style="font-weight:700;font-size:14px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;">${y}년 ${monthNames[m]}</span>
      <button onclick="_divDrpNav(1)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 10px;font-size:12px;">▶</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">${dayH}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">${cells}</div>
    <div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);text-align:center;min-height:28px;line-height:1.6;">${selText}</div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button onclick="_divDrpClear()" style="flex:1;padding:7px;font-size:11px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer;">초기화</button>
      <button onclick="_divDrpApply()" style="flex:1;padding:7px;font-size:11px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;">적용</button>
    </div>
  </div>`;
}
function _divDrpNav(d){_drp.month+=d;if(_drp.month>11){_drp.month=0;_drp.year++;}if(_drp.month<0){_drp.month=11;_drp.year--;}_renderDivDrpCalendar();}
function _divDrpClick(ds){if(!_drp.dragStart||(_drp.dragStart&&_drp.dragEnd)){_drp.dragStart=ds;_drp.dragEnd=null;}else{_drp.dragEnd=ds;if(_drp.dragStart>_drp.dragEnd)[_drp.dragStart,_drp.dragEnd]=[_drp.dragEnd,_drp.dragStart];}_renderDivDrpCalendar();}
function _divDrpClear(){_drp.dragStart=null;_drp.dragEnd=null;_renderDivDrpCalendar();}
function _divDrpApply(){if(_drp.dragStart&&!_drp.dragEnd){dividendFilters.dateFrom=_drp.dragStart;dividendFilters.dateTo=_drp.dragStart;}else{dividendFilters.dateFrom=_drp.dragStart||'';dividendFilters.dateTo=_drp.dragEnd||'';}closeDividendDatePicker();renderDividendDashboard();}
function _divDrpApplyMonth(){const y=_drp.year,m=_drp.month;dividendFilters.dateFrom=`${y}-${String(m+1).padStart(2,'0')}-01`;dividendFilters.dateTo=`${y}-${String(m+1).padStart(2,'0')}-${String(new Date(y,m+1,0).getDate()).padStart(2,'0')}`;closeDividendDatePicker();renderDividendDashboard();}

function prepareTransaction(symbol, broker) {
  document.getElementById('txSymbol').value = symbol;
  if(broker) document.getElementById('txBroker').value = broker.replace(/\s*\([^)]*\)$/, '');
  document.querySelector('input[name="txType"][value="buy"]').checked = true;
  toggleTxType();
  document.getElementById('txQty').focus();
  setSidebarView('ledger');
  const sb = document.getElementById('sidebar');
  if(sb.classList.contains('collapsed')) toggleSidebar();
  sb.style.boxShadow = "inset 0 0 0 2px var(--accent)";
  setTimeout(() => sb.style.boxShadow = "none", 500);
}

// ==========================================
// 4. 검색, 자동완성 및 API Fetch 
// ==========================================
function setupSearch(inputId, dropdownId, onSelect, filterId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const filter = document.getElementById(filterId);
  if(!input || !dropdown) return;
  
  dropdown.style.maxHeight = '300px';
  dropdown.style.overflowY = 'auto';
  
  const performSearch = () => {
    let query = input.value.trim().toLowerCase();
    if (query.length < 1 || localStockDB.length === 0) { dropdown.style.display = 'none'; return; }
    
    const isIncludesSearch = query.startsWith('*') || query.endsWith('*');
    let cleanQuery = query.replace(/\*/g, '').trim();
    
    if (cleanQuery.length < 1) { dropdown.style.display = 'none'; return; }

    // 🌟 국가 필터링 적용 (한국: .KS, .KQ, 숫자6자리 / 미국: 한국과 암호화폐가 아닌 것)
    let filteredDB = localStockDB;
    if (filter && filter.value === 'kr') {
        filteredDB = localStockDB.filter(s => isKorean(s.symbol));
    } else if (filter && filter.value === 'us') {
        filteredDB = localStockDB.filter(s => !isKorean(s.symbol) && !isCrypto(s.symbol));
    }

    let results = [];
    if (isIncludesSearch) {
        results = filteredDB.filter(s => s.symbol.toLowerCase().includes(cleanQuery) || s.name.toLowerCase().includes(cleanQuery));
    } else {
        results = filteredDB.filter(s => s.symbol.toLowerCase().startsWith(cleanQuery) || s.name.toLowerCase().startsWith(cleanQuery));
    }

    // 🌟 이미 등록된 종목을 최상단으로 정렬
    const registeredSet = new Set(state.tickers);
    results.sort((a, b) => {
        const aReg = registeredSet.has(a.symbol) ? 0 : 1;
        const bReg = registeredSet.has(b.symbol) ? 0 : 1;
        return aReg - bReg;
    });
    
    if (results.length === 0) {
  dropdown.innerHTML = `
    <li style="padding:12px 16px; display:flex; align-items:center; gap:8px; color:var(--text2); font-size:12px;">
      <span>검색 결과 없음</span>
      <a href="https://www.google.com/search?q=${encodeURIComponent(input.value.trim() + ' 주식 ticker')}"
         target="_blank"
         style="margin-left:auto; text-decoration:none; font-size:11px; background:var(--bg3); border:1px solid var(--border); padding:3px 8px; border-radius:4px; color:var(--text2);"
         onmouseover="this.style.color='var(--text)'; this.style.borderColor='var(--border2)';"
         onmouseout="this.style.color='var(--text2)'; this.style.borderColor='var(--border)';">
        🔍 구글 검색
      </a>
    </li>
  `;
  dropdown.style.display = 'block';
  return;
}
    
    dropdown.innerHTML = results.map(q => {
      const isRegistered = registeredSet.has(q.symbol);
      const badge = isRegistered
        ? `<span style="font-size:9px; font-weight:700; color:var(--green); background:rgba(0,200,122,0.12); border:1px solid rgba(0,200,122,0.35); padding:1px 5px; border-radius:3px; margin-left:4px; vertical-align:middle;">보유/관심</span>`
        : '';
      return `
      <li class="search-item" onclick="${onSelect}('${q.symbol}', '${q.name.replace(/'/g, "\\'")}')">
        <div style="display:flex; flex-direction:column; gap:2px; max-width:70%;">
          <span style="font-weight:500; font-size:13px; color:${isRegistered ? 'var(--green)' : 'var(--text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${q.name}${badge}</span>
          <span style="font-size:10px; color:var(--text3);">${q.exch}</span>
        </div>
        <span style="color:var(--accent); font-family:var(--font-mono); font-size:12px; font-weight:700;">${q.symbol}</span>
      </li>`;
    }).join('');
    dropdown.style.display = 'block';
  };

  input.addEventListener('input', performSearch);
  if (filter) filter.addEventListener('change', performSearch); // 🌟 필터를 바꿀 때도 즉시 검색 결과 갱신

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target) && (!filter || !filter.contains(e.target))) dropdown.style.display = 'none';
  });
}

// 🌟 필터 ID를 포함하여 검색 기능 초기화
setupSearch('tickerInput', 'searchDropdown', 'selectMainSearchResult', 'mainSearchFilter');
setupSearch('txSymbol', 'txDropdown', 'selectSidebarSearchResult', 'sideSearchFilter');

function selectMainSearchResult(symbol) {
  document.getElementById('tickerInput').value = '';
  document.getElementById('searchDropdown').style.display = 'none';
  if(currentView === 'history') setView('all');
  addTickerToPortfolio(symbol);
}

function addManualTicker() {
  const val = document.getElementById('tickerInput').value.trim().toUpperCase();
  const rawVal = document.getElementById('tickerInput').value.trim();
  if (val) {
    if(currentView === 'history') setView('all');
    let symbolToAdd = val;
    if (localStockDB && localStockDB.length > 0) {
        let matched = localStockDB.find(s => s.name.replace(/\s+/g, '') === rawVal.replace(/\s+/g, '') || s.symbol.toUpperCase() === val);
        if(matched) symbolToAdd = matched.symbol;
    }
    addTickerToPortfolio(symbolToAdd);
  }
}
const tickerInp = document.getElementById('tickerInput');
if(tickerInp) {
    tickerInp.addEventListener('keydown', e => { if (e.key === 'Enter') addManualTicker(); });
}

function selectSidebarSearchResult(symbol, name) {
  const input = document.getElementById('txSymbol');
  input.value = name || symbol;
  input.dataset.symbol = symbol;  // 실제 ticker는 숨겨서 보관
  document.getElementById('txDropdown').style.display = 'none';
  const type = document.querySelector('input[name="txType"]:checked').value;
  if (type === 'transfer') {
    populateLedgerTransferFrom();
  } else if (type === 'split') {
    updateLedgerSplitPreview();
  } else if (type === 'dividend') {
    document.getElementById('txPrice').focus();
  } else {
    document.getElementById('txQty').focus();
  }
}

// 🌟 모든 외부 API 요청은 이 Vercel 전용 프록시 함수를 통과하여 초고속으로 처리됩니다.
async function fetchWithProxy(targetUrl, useCache = true) {
  const finalUrl = useCache ? targetUrl : `${targetUrl}&_t=${Date.now()}`;
  const vercelProxyUrl = `/api/proxy?url=${encodeURIComponent(finalUrl)}`;

  try {
    const res = await fetch(vercelProxyUrl);
    if(res.ok) return await res.json();
  } catch(e) {
      console.error("Vercel Proxy 연결 실패:", e);
  }
  return null;
}

async function fetchExchangeRate() {
  if (isExchangeRateFetched) return;
  const data = await fetchYahooData('KRW=X');
  if (data && data.last) {
    currentUsdKrw = data.last;
    isExchangeRateFetched = true;
    cachedMarketData['KRW=X'] = data;   // 5년치 이력도 캐시에 저장
  }
}
// 📅 특정 날짜의 USD/KRW 환율 조회 (주말/휴장일은 가장 가까운 이전 영업일 값 사용)
function getHistoricalFxRate(dateStr) {
    const fx = cachedMarketData['KRW=X'];
    if (fx && !fx._failed && fx.rawDates && fx.prices) {
        const idx = fx.rawDates.indexOf(dateStr);
        if (idx !== -1 && fx.prices[idx] != null) return fx.prices[idx];
        // 주말·공휴일 → 가장 가까운 이전 영업일
        for (let i = fx.rawDates.length - 1; i >= 0; i--) {
            if (fx.rawDates[i] <= dateStr && fx.prices[i] != null) return fx.prices[i];
        }
    }
    return currentUsdKrw; // 캐시 없으면 현재 환율 fallback
}

// 🌟 1. 공공데이터포털 API 호출 함수 (국내 주식 전용)
async function fetchPublicData(symbol) {
  // 🚨 [필수] 공공데이터포털에서 발급받은 'Decoding' 인증키를 입력하세요.
  const API_KEY = 'd9f831a4f894f1149672e45b4b910dab8f9c2438061c5201f207c20f0d761e55';
  
  // 🌟 기존 임시 키 검사 로직 삭제, 키가 비어있을 때만 에러 처리
  if (!API_KEY) {
      console.warn("공공데이터포털 API 키가 설정되지 않았습니다.");
      return { _failed: true };
  }

  // 🌟 핵심 수정 포인트: 야후 파이낸스용 꼬리표(.KS, .KQ)를 제거한 순수 6자리 숫자만 추출
  const cleanSymbol = symbol.replace('.KS', '').replace('.KQ', '');

  // 공공데이터포털은 국내 주식(6자리 숫자)만 지원합니다. 미국 주식 등은 실패 처리.
  if (!/^\d{6}\.K[SQ]$/.test(symbol)) {
      return { _failed: true }; 
  }

  // 티커에서 숫자 6자리(단축코드)만 추출
  const isinCode = symbol.substring(0, 6);
  
  // 과거 1년치 데이터를 가져오기 위해 시작일 계산 (YYYYMMDD 형식)
  const today = new Date();
  const pastYear = new Date(today.setFullYear(today.getFullYear() - 1));
  const beginDate = pastYear.toISOString().substring(0, 10).replace(/-/g, '');

  // 공공데이터 API 엔드포인트 구성 (한 페이지에 252개(약 1년치 영업일) 요청)
  const targetUrl = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${API_KEY}&numOfRows=252&pageNo=1&resultType=json&beginBasDt=${beginDate}&likeSrtnCd=${isinCode}`;
  
  // 🌟 [수정됨] 국내 주식 공공데이터도 Vercel 전용 프록시(fetchWithProxy)를 태워서 빛의 속도로 가져옴
  try {
    const data = await fetchWithProxy(targetUrl, true);
    
    // 응답 데이터가 null 이면 실패
    if (!data) return { _failed: true };

    // 응답 데이터 구조 확인 및 에러 처리
    if (!data.response || !data.response.body || !data.response.body.items || !data.response.body.items.item) {
        console.warn("공공데이터 API 응답 형식이 올바르지 않거나 데이터가 없습니다.");
        return { _failed: true };
    }

    // 데이터가 최신 날짜부터 내림차순으로 오므로, 차트를 위해 오름차순(과거->최신)으로 뒤집기
    const items = data.response.body.items.item.reverse();

    if (items.length === 0) return { _failed: true };

    let validPrices = [];
    let validDates = [];
    let rawDates = [];
    let stockName = symbol;

    items.forEach(item => {
        // clpr: 종가 (종가는 문자열로 오므로 숫자로 변환)
        const price = parseInt(item.clpr, 10);
        validPrices.push(price);

        // basDt: 기준일자 (YYYYMMDD 형태) -> YYYY-MM-DD 및 M/D 형태로 변환
        const dt = item.basDt; 
        const year = dt.substring(0, 4);
        const month = dt.substring(4, 6);
        const day = dt.substring(6, 8);
        
        rawDates.push(`${year}-${month}-${day}`);
        validDates.push(`${parseInt(month, 10)}/${parseInt(day, 10)}`);
        
        // itmsNm: 종목명 (매 행마다 같지만 덮어쓰기)
        if (item.itmsNm) {
            stockName = item.itmsNm;
        }
    });

    return {
      symbol: symbol, 
      name: stockName, 
      currency: 'KRW',
      prices: validPrices, 
      dates: validDates, 
      rawDates: rawDates,
      last: validPrices[validPrices.length - 1],
      prev: validPrices[validPrices.length - 2] || validPrices[validPrices.length - 1]
    };

  } catch (e) {
    return { _failed: true };
  }
}

// 🌟 2. 야후 파이낸스 API 호출 함수 (미국 주식 및 대체용)
async function fetchYahooAPI(symbol, range = '5y') {
  // 비정상적인 포맷 차단
  if (!/^[A-Za-z0-9.=^-]+$/.test(symbol)) {
    return { _failed: true };
  }
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const json = await fetchWithProxy(url, false);
    
    if (!json || !json.chart || !json.chart.result || json.chart.result.length === 0) return { _failed: true };
    const result = json.chart.result[0];
    if (!result || !result.timestamp || !result.indicators || !result.indicators.quote || !result.indicators.quote[0] || !result.indicators.quote[0].close) return { _failed: true };
    
    const quotes = result.indicators.quote[0].close;
    let validPrices = [], validDates = [], rawDates = [];
    
    for(let i=0; i<result.timestamp.length; i++) {
      if(quotes[i] !== null && quotes[i] !== undefined) {
        validPrices.push(quotes[i]);
        const d = new Date(result.timestamp[i] * 1000);
        validDates.push(`${d.getMonth()+1}/${d.getDate()}`);
        const yy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        rawDates.push(`${yy}-${mm}-${dd}`);
      }
    }
    if(validPrices.length === 0) return { _failed: true };
    
    const meta = result.meta || {};
    let cName = symbol;
    if (localStockDB && localStockDB.length > 0) {
        const localMatch = localStockDB.find(s => s.symbol === symbol);
        if (localMatch) cName = localMatch.name;
        else if (meta.shortName) cName = meta.shortName;
    } else if (meta.shortName) {
        cName = meta.shortName;
    }
    if(symbol === 'KRW=X') cName = 'USD/KRW 환율';
    
    const rangeLevel = { '1y': 1, '3y': 2, '5y': 3 }[range] || 1;
    return {
      symbol: symbol, name: cName, currency: meta.currency || 'USD',
      prices: validPrices, dates: validDates, rawDates: rawDates,
      last: validPrices[validPrices.length-1],
      prev: validPrices[validPrices.length-2] || validPrices[validPrices.length-1],
      _rangeLevel: rangeLevel
    };
  } catch (e) {
    return { _failed: true };
  }
}

// 🌟 3. 최종 데이터 라우터 (이 함수가 순서를 제어합니다)
async function fetchYahooData(symbol, range = '5y') {
    if (symbol.endsWith('.DLST')) return { _failed: true };
    if (/^\d{6}\.K[SQ]$/.test(symbol)) {
        // Phase 1(1y)은 공공데이터 우선, Phase 2/3은 Yahoo 직접 사용
        if (range === '1y' || range === '10y') {
            let publicData = await fetchPublicData(symbol);
            if (publicData && !publicData._failed) {
                publicData._rangeLevel = 1;
                return publicData;
            }
        }
        return await fetchYahooAPI(symbol, range);
    } else {
        return await fetchYahooAPI(symbol, range);
    }
}

async function addTickerToPortfolio(symbol) {
  let finalSym = /^\d{6}$/.test(symbol) ? symbol + '.KS' : symbol;
  if (state.tickers.includes(finalSym)) { alert("이미 등록된 종목입니다."); return; }
  
  const addIcon = document.querySelector('.btn-add-icon');
  addIcon.textContent = "⏳";
  const data = await fetchYahooData(finalSym);
  addIcon.textContent = "＋";

  if (data && !data._failed) {
    state.tickers.push(data.symbol); cachedMarketData = {}; saveState();
    document.getElementById('tickerInput').value = ''; render();
    triggerAutoSync();
  } else { alert("차트 데이터를 불러올 수 없는 종목입니다."); }
}

function removeTicker(t) {
  state.tickers = state.tickers.filter(x => x !== t);
  delete cachedMarketData[t]; saveState(); render();
  triggerAutoSync();
}

function setRange(rangeStr, el) {
  state.range = rangeStr; saveState();
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  
  if(el) {
      el.classList.add('active'); 
  } else {
      document.querySelectorAll('.rtab').forEach(b => {
          if(b.textContent.toLowerCase() === rangeStr.toLowerCase()) b.classList.add('active');
      });
  }

  // 🌟 기간 변경 시 현재 보고 있는 뷰에 맞춰 전체 재계산 및 렌더링
  if (currentView === 'dividend') renderDividendDashboard();
  else if (currentView === 'history') renderHistoryDashboard();
  else if (currentView === 'realized') renderRealizedDashboard();
  else render();
}

function setSortMode(mode) { currentSortMode = mode; render(); }

function toggleSortDirection() {
  sortDirection = sortDirection === 1 ? -1 : 1;
  document.getElementById('btnSortDir').textContent = sortDirection === 1 ? '⬇️' : '⬆️';
  render();
}

function setView(view, el) {
  currentView = view;
  activeAccountFilter = null; 
  document.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active'); 
  
  if(view === 'history') renderHistoryDashboard();
  if(view === 'realized') renderRealizedDashboard();
  
  const pChartRowWrap2 = document.getElementById('chartRowWrapper');
  if (view === 'dividend' || view === 'history' || view === 'realized' || view === 'watch') {
      if(pChartRowWrap2) pChartRowWrap2.style.display = 'none';
  } else {
      if(pChartRowWrap2) pChartRowWrap2.style.display = 'flex';
  }
  
  render();
}

function setDivFilter(filter, el) {
  currentDivFilter = filter;
  document.querySelectorAll('.div-filter').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderDividendDashboard();
}

// ==========================================
// 5. 시각화 및 대시보드 렌더링 세부 함수들
// ==========================================
function renderSidebarYieldList(currentHoldings) {
  const container = document.getElementById('sidebarYieldList');
  if (!container) return;

  let yieldItems = [];
  for (let key in currentHoldings) {
      let h = currentHoldings[key];
      if (h.qty > 0 && cachedMarketData[h.symbol] && !cachedMarketData[h.symbol]._failed && cachedMarketData[h.symbol].last) {
          let evalAmt = h.qty * cachedMarketData[h.symbol].last;
          let costAmt = h.qty * h.avg;
          let roi = costAmt > 0 ? ((evalAmt - costAmt) / costAmt) * 100 : -9999;
          
          if (roi !== -9999) {
              yieldItems.push({
                  symbol: h.symbol, name: cachedMarketData[h.symbol].name, broker: h.broker, roi: roi, pnl: evalAmt - costAmt,
                  owner: state.transactions.filter(t => t.symbol===h.symbol && (t.broker+' ('+t.owner+')'===h.broker || t.broker===h.broker) && t.txType!=='dividend').pop()?.owner || '보유'
              });
          }
      }
  }

  yieldItems.sort((a, b) => b.roi - a.roi);

  if (yieldItems.length === 0) {
      container.innerHTML = '<div style="color:var(--text3); font-size:12px; text-align:center; padding:20px;">보유한 자산이 없습니다.</div>';
      return;
  }

  container.innerHTML = yieldItems.map((item, idx) => {
      let sign = item.roi > 0 ? '+' : ''; let color = item.roi > 0 ? '#00C578' : (item.roi < 0 ? '#3A9AFF' : 'var(--text)');
      let rankColor = idx === 0 ? '#ffb703' : (idx === 1 ? '#a259ff' : (idx === 2 ? '#4d9fff' : 'var(--text3)'));
      let cleanBroker = item.broker.split(' (')[0]; let brokerText = cleanBroker !== '미지정' ? `<span style="font-size:10px; color:var(--text3); margin-left:6px;">[${cleanBroker}]</span>` : '';
      
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:6px; border:1px solid var(--border); transition:0.2s;" onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1; margin-right:10px;">
              <span style="font-weight:900; font-style:italic; color:${rankColor}; width:18px; text-align:center; flex-shrink:0;">${idx+1}</span>
              <div style="min-width:0; overflow:hidden;">
                  <div style="font-size:13px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name} ${brokerText}</div>
                  <div style="font-size:10px; font-family:var(--font-mono); color:var(--text2);">${item.symbol}</div>
              </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
              <div style="font-size:14px; font-family:var(--font-mono); font-weight:700; color:${color};">${sign}${item.roi.toFixed(2)}%</div>
              <div style="font-size:10px; color:var(--text3);">${sign}${formatPrice(Math.abs(item.pnl), item.symbol)}</div>
          </div>
      </div>
      `;
  }).join('');
}

function generateCardHtml(item) {
  const data = item.data;
  const isHeld = item.type === 'held';
  const chgPct = item.activeChange.toFixed(2);
  const cls = item.activeChange > 0 ? 'up' : (item.activeChange < 0 ? 'down' : 'flat');
  const sign = item.activeChange > 0 ? '+' : '';
  const pnl = isHeld ? (data.last - item.avg) * item.qty : null;
  const pnlPct = isHeld && item.avg > 0 ? ((data.last-item.avg)/item.avg*100).toFixed(2) : null;
  const brokerDisp = isHeld && item.broker !== '미지정' ? item.broker : '계좌 미지정';

  // 🌟 [수정] 여러 계좌가 섞여서 매칭이 실패하는 버그 해결 및 현재 탭(currentView) 우선 반영
  let oInfo = { icon: '💼', name: '보유' };
  if (isHeld) {
      let mainOwner = '보유';
      if (currentView === 'user1') mainOwner = state.owners.user1.name;
      else if (currentView === 'user2') mainOwner = state.owners.user2.name;
      else {
          const holdingTxs = state.transactions.filter(t => t.symbol === item.symbol && t.txType !== 'dividend');
          if(holdingTxs.length > 0) mainOwner = holdingTxs[holdingTxs.length-1].owner; 
      }
      oInfo = getOwnerInfo(mainOwner);
  }

  // 🌟 [수정] 아이콘, 소유자 이름 | 계좌명 형식으로 깔끔하게 표시
  const tagContent = isHeld 
    ? `<span class="icon">${oInfo.icon}</span> <span style="font-weight:600;">${oInfo.name}</span> <span class="divider" style="margin:0 4px; color:var(--text3);">|</span> <span class="broker-text" style="color:var(--text2);">${brokerDisp}</span>` 
    : `<span class="icon" style="font-style:normal;">⭐</span> 관심종목 <span style="margin-left:4px; font-weight:bold; opacity:0.7;">✕</span>`;

  const countryBadge = isKorean(item.symbol) 
    ? `<span style="font-size:16px; margin-right:6px; line-height:1;" title="한국 주식">🇰🇷</span>` 
    : `<span style="font-size:16px; margin-right:6px; line-height:1;" title="미국 주식">🇺🇸</span>`;

  const customTagText = state.tags && state.tags[item.symbol] ? state.tags[item.symbol] : '';
  const tagsArray = customTagText.split(',').map(t => t.trim()).filter(t => t).slice(0, 5);
  
  let displayName = data.name;
  let displaySymbol = item.symbol;
  if (state.oldNames && state.oldNames[item.symbol]) {
      if (state.oldNames[item.symbol] === '상장폐지') {
          displaySymbol = item.symbol.replace('.KS.DLST', '').replace('.DLST', '');
          displayName = `${displaySymbol} (상장폐지)`;
      } else {
          displayName = `${data.name} (구: ${state.oldNames[item.symbol]})`;
      }
  }

  let tagsHtml = '';
  if (tagsArray.length > 0) {
      tagsHtml = `<div class="tags-container" onclick="event.stopPropagation(); openTagModal('${item.symbol}', '${displayName.replace(/'/g, "\\'")}')">` + 
                 tagsArray.map(t => `<div class="custom-tag-badge">${t}</div>`).join('') +
                 `</div>`;
  } else {
      tagsHtml = `<div class="tags-container"><div class="add-tag-btn" onclick="event.stopPropagation(); openTagModal('${item.symbol}', '${displayName.replace(/'/g, "\\'")}')">+ 태그 추가</div></div>`;
  }

  return `
    <div class="card ${cls}" onclick="openChartModal('${item.symbol}')">
      <div style="display:flex; align-items:center;">
        ${countryBadge}
        <div class="card-tag ${isHeld ? 'tag-held' : 'tag-watch'}" 
             style="margin-bottom:0; background:var(--bg3); color:var(--text); border:1px solid var(--border); ${!isHeld ? 'cursor:pointer;' : ''}"
             ${!isHeld ? `onclick="event.stopPropagation(); removeTickerConfirm('${item.symbol}', '${displayName.replace(/'/g, "\\'")}')"` : ''}>
          ${tagContent}
        </div>
      </div>

      <div class="card-head" style="align-items:center; margin-top:12px;">
        <div style="flex:1; min-width:0; margin-right:10px;">
          <div style="font-size:16px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text);" title="${displayName}">${displayName}</div>
          <div style="font-size:11px; font-family:var(--font-mono); color:var(--text3); margin-top:2px; white-space:nowrap;">
            ${displaySymbol}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="card-badge badge-${cls}">${sign}${chgPct}%</span>
          <button class="btn-danger" onclick="event.stopPropagation();prepareTransaction('${item.symbol}','${isHeld ? item.broker.split(',')[0].trim() : ''}')">잔고</button>
        </div>
      </div>
      
      <div class="card-price">${formatPrice(data.last, item.symbol)}</div>
      
      <div class="chart-wrap"><canvas id="${item.uniqueId}"></canvas></div>
      
      ${tagsHtml}

      ${isHeld ? `
      <div class="card-footer">
        <div>평단가 ${formatPrice(item.avg, item.symbol)}<br>수량 <strong>${item.qty}</strong>주</div>
        <div style="text-align:right">
          <span class="holding-val" style="color:${pnl>=0?'#00C578':'#3A9AFF'}">
            ${pnl>=0?'+':''}${formatPrice(Math.abs(pnl), item.symbol)}<br>(${pnl>=0?'+':''}${pnlPct}%)
          </span>
        </div>
      </div>` : ''}
    </div>
  `;
}

// 🌟 목록형 뷰를 위한 한 줄짜리 아이템 HTML 생성
function generateListItemHtml(item) {
  const data = item.data;
  const isHeld = item.type === 'held';
  const chgPct = item.activeChange.toFixed(2);
  const cls = item.activeChange > 0 ? 'up' : (item.activeChange < 0 ? 'down' : 'flat');
  const sign = item.activeChange > 0 ? '+' : '';
  const pnl = isHeld ? (data.last - item.avg) * item.qty : null;
  const brokerDisp = isHeld && item.broker !== '미지정' ? item.broker : '계좌 미지정';

  let oInfo = { icon: '💼', name: '보유' };
  if (isHeld) {
      let mainOwner = '보유';
      if (currentView === 'user1') mainOwner = state.owners.user1.name;
      else if (currentView === 'user2') mainOwner = state.owners.user2.name;
      else {
          const holdingTxs = state.transactions.filter(t => t.symbol === item.symbol && t.txType !== 'dividend');
          if(holdingTxs.length > 0) mainOwner = holdingTxs[holdingTxs.length-1].owner; 
      }
      oInfo = getOwnerInfo(mainOwner);
  }

  const tagContent = isHeld 
    ? `<span class="icon" style="font-size:12px;">${oInfo.icon}</span> <span class="divider" style="margin:0 4px; color:var(--border2);">|</span> <span class="broker-text" style="color:var(--text2); font-size:10px;">${brokerDisp}</span>` 
    : `<span class="icon" style="font-size:10px; font-style:normal;">⭐ 관심종목</span>`;

  const countryBadge = isKorean(item.symbol) ? '🇰🇷' : '🇺🇸';

  let displayName = data.name;
  let displaySymbol = item.symbol;
  if (state.oldNames && state.oldNames[item.symbol]) {
      if (state.oldNames[item.symbol] === '상장폐지') {
          displaySymbol = item.symbol.replace('.KS.DLST', '').replace('.DLST', '');
          displayName = `${displaySymbol} (상장폐지)`;
      } else {
          displayName = `${data.name} (구: ${state.oldNames[item.symbol]})`;
      }
  }

  return `
    <div class="list-item" onclick="openChartModal('${item.symbol}')">
      <div class="list-item-left">
         <div style="font-size:20px; line-height:1; margin-right:4px;">${countryBadge}</div>
         <div style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:0;">
            <div style="font-size:14px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${displayName}">${displayName}</div>
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:10px; font-family:var(--font-mono); color:var(--text3);">${displaySymbol}</span>
                <div class="card-tag ${isHeld ? 'tag-held' : 'tag-watch'}" style="margin:0; padding:2px 6px; background:var(--bg); border:1px solid var(--border);">${tagContent}</div>
            </div>
         </div>
      </div>
      
      <div class="list-item-chart"><canvas id="${item.uniqueId}"></canvas></div>
      
      <div class="list-item-right">
         <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:2px;">${formatPrice(data.last, item.symbol)}</div>
         <div style="font-size:12px; font-weight:700; color:${cls==='up'?'#00C578':(cls==='down'?'#3A9AFF':'var(--text3)')};">${sign}${chgPct}%</div>
      </div>
      
      ${isHeld ? `
      <div class="list-item-extra">
         <div style="font-size:11px; color:var(--text2); margin-bottom:2px;">${item.qty}주</div>
         <div style="font-size:12px; font-weight:700; color:${pnl>=0?'#00C578':'#3A9AFF'}">${pnl>=0?'+':''}${formatPrice(Math.abs(pnl), item.symbol)}</div>
      </div>` : `
      <div class="list-item-extra" style="display:flex; align-items:center; justify-content:flex-end;">
         <button class="btn-sm" style="background:var(--bg); border-color:var(--border2); padding:4px 8px;" onclick="event.stopPropagation(); removeTickerConfirm('${item.symbol}', '${displayName.replace(/'/g, "\\'")}')">삭제</button>
      </div>`}
    </div>
  `;
}

// 📊 오늘 종목 현황 패널 렌더링
function renderTodayStocksPanel(displayItems) {
    const panel = document.getElementById('todayStocksPanel');
    const listEl = document.getElementById('todayStocksList');
    const totalChangeEl = document.getElementById('todayStocksTotalChange');
    const totalPnlEl = document.getElementById('todayStocksTotalPnl');
    
    if (!panel || !listEl || !totalChangeEl) return;

    const heldItems = displayItems.filter(item => item.qty > 0 && item.data && !item.data._failed);
    if (heldItems.length === 0) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'flex';

    // 1. 데이터 가공
    const rows = heldItems.map(item => {
        const d = item.data;
        const last = d.last || 0;
        const prev = d.prev || last;
        const chg1d = prev > 0 ? ((last - prev) / prev) * 100 : 0;
        const pnl1d = item.qty * (last - prev);
        const prevEval = item.qty * prev;
        const isKr = isKorean(item.symbol);
        return { isKr, pnl1d, prevEval, chg1d, name: d.name || item.symbol, symbol: item.symbol };
    });

    // 2. 성과 계산
    const calcStats = (marketRows, useFx = false) => {
        const pnl = marketRows.reduce((s, r) => s + r.pnl1d, 0);
        const prevEval = marketRows.reduce((s, r) => s + r.prevEval, 0);
        const pct = prevEval > 0 ? (pnl / prevEval) * 100 : 0;
        const finalPnl = useFx ? pnl * (currentUsdKrw || 1) : pnl;
        return { pnl: finalPnl, pct, rawPrevEval: useFx ? prevEval * (currentUsdKrw || 1) : prevEval };
    };

    const krStats = calcStats(rows.filter(r => r.isKr), false);
    const usStats = calcStats(rows.filter(r => !r.isKr), true);
    
    const totalPnl = krStats.pnl + usStats.pnl;
    const totalPrevEval = krStats.rawPrevEval + usStats.rawPrevEval;
    const totalChangePct = totalPrevEval > 0 ? (totalPnl / totalPrevEval) * 100 : 0;

    // 3. 오늘 전체 손익 업데이트
    const totalColor = totalChangePct > 0 ? 'var(--profit)' : totalChangePct < 0 ? 'var(--loss)' : 'var(--text2)';
    totalChangeEl.style.color = totalColor;
    totalChangeEl.textContent = `${totalChangePct > 0 ? '+' : ''}${totalChangePct.toFixed(2)}%`;
    if (totalPnlEl) {
        totalPnlEl.style.color = totalColor;
        totalPnlEl.textContent = `(${totalChangePct > 0 ? '+' : ''}₩${Math.round(totalPnl).toLocaleString()})`;
    }

    const getStatHtml = (stats, prefix = '') => {
        const color = stats.pct > 0 ? 'var(--profit)' : stats.pct < 0 ? 'var(--loss)' : 'var(--text2)';
        const sign = stats.pct > 0 ? '+' : '';
        return `<span style="color:${color}; font-size:11px; font-weight:normal; font-family:var(--font-mono); margin-left:auto;">${sign}${stats.pct.toFixed(2)}% (${sign}${prefix}${Math.round(stats.pnl).toLocaleString()})</span>`;
    };

    // 4. 종목 리스트 렌더링 헬퍼
    function getMarketHtml(marketRows) {
        const upRows   = marketRows.filter(r => r.chg1d > 0).sort((a, b) => b.chg1d - a.chg1d);
        const downRows = marketRows.filter(r => r.chg1d < 0).sort((a, b) => a.chg1d - b.chg1d);
        const flatRows = marketRows.filter(r => r.chg1d === 0);

        function stockCard(r) {
            const sign = r.chg1d > 0 ? '+' : '';
            const isUp = r.chg1d > 0, isDown = r.chg1d < 0;
            const accentColor = isUp ? 'var(--profit)' : isDown ? 'var(--loss)' : 'var(--text3)';
            const bgAlpha     = isUp ? 'var(--profit-bg)' : isDown ? 'var(--loss-bg)' : 'var(--bg3)';
            const borderAlpha = isUp ? 'rgba(0,200,122,0.2)' : isDown ? 'rgba(58,154,255,0.2)' : 'var(--border)';
            
            // 🌟 2줄 레이아웃: 종목명 풀네임(줄바꿈 허용) 윗줄, 등락률 아랫줄 우측 배치
            return `
            <div onclick="openChartModal('${r.symbol}')" style="padding:10px 12px; background:${bgAlpha}; border-radius:8px; border:1px solid ${borderAlpha}; margin-bottom:5px; display:flex; flex-direction:column; gap:6px; cursor:pointer; transition:opacity 0.15s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                <div style="font-size:12px; font-weight:700; color:var(--text); line-height:1.4; word-break:keep-all;">
                    ${r.name}
                </div>
                <div style="font-size:15px; font-weight:800; font-family:var(--font-mono); color:${accentColor}; text-align:right;">
                    ${sign}${r.chg1d.toFixed(2)}%
                </div>
            </div>`;
        }

        function colHeader(label, count, color) {
            return `<div style="font-size:10px; font-weight:700; color:${color}; margin-bottom:6px; display:flex; align-items:center; gap:4px; position:sticky; top:0; background:var(--bg2); padding:2px 0;">
                ${label} <span style="background:${color}; color:#fff; border-radius:10px; padding:1px 5px; font-size:9px;">${count}</span>
            </div>`;
        }

        const upHtml   = (upRows.length > 0 ? colHeader('▲ 상승', upRows.length, 'var(--profit)') : '') + upRows.map(stockCard).join('') + (flatRows.length > 0 && upRows.length === 0 ? colHeader('━ 보합', flatRows.length, 'var(--text3)') + flatRows.map(stockCard).join('') : '');
        const downHtml = (downRows.length > 0 ? colHeader('▼ 하락', downRows.length, 'var(--loss)') : '') + downRows.map(stockCard).join('') + (flatRows.length > 0 && downRows.length === 0 ? colHeader('━ 보합', flatRows.length, 'var(--text3)') + flatRows.map(stockCard).join('') : '');

        return `
        <div style="display:flex; gap:8px; flex:1; min-height:0;">
            <div style="flex:1; min-width:0; overflow-y:auto; padding-right:2px;" class="custom-scrollbar">
                ${upRows.length + flatRows.length > 0 && upRows.length === 0 ? upHtml : upHtml || '<div style="font-size:10px; color:var(--text3); text-align:center; margin-top:12px;">상승 없음</div>'}
            </div>
            <div style="flex:1; min-width:0; overflow-y:auto; padding-right:2px;" class="custom-scrollbar">
                ${downHtml || '<div style="font-size:10px; color:var(--text3); text-align:center; margin-top:12px;">하락 없음</div>'}
            </div>
        </div>`;
    }

    listEl.innerHTML = `
    <div style="display:flex; gap:12px; flex:1; min-height:0; height:100%;">
        <div style="flex:1; display:flex; flex-direction:column; min-width:0;">
            <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:8px; display:flex; align-items:center; gap:5px;">
                🇰🇷 국내 주식 ${getStatHtml(krStats, '₩')}
            </div>
            ${getMarketHtml(rows.filter(r => r.isKr))}
        </div>
        <div style="width:1px; background:var(--border); flex-shrink:0;"></div>
        <div style="flex:1; display:flex; flex-direction:column; min-width:0;">
            <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:8px; display:flex; align-items:center; gap:5px;">
                🇺🇸 미국 주식 ${getStatHtml(usStats, '₩')}
            </div>
            ${getMarketHtml(rows.filter(r => !r.isKr))}
        </div>
    </div>`;
}

// 🌟 자산 성장 추이 그래프 렌더링 (누적 영역 + 우측 기준 누적 실현수익 막대)
function renderPortfolioChart(ownerFilter, sliceLen) {
    const chartWrap = document.getElementById('portfolioChartWrapper');
    if (!chartWrap) return; // HTML이 없으면 에러 방지
    if (currentView === 'dividend' || currentView === 'history' || currentView === 'realized' || currentView === 'watch' || state.transactions.length === 0) {
        if(chartWrap) chartWrap.style.display = 'none';
        return;
    }
    
    let masterData = cachedMarketData['KRW=X'];
    if (!masterData || masterData._failed || !masterData.rawDates) {
        const validKeys = Object.keys(cachedMarketData).filter(k => cachedMarketData[k] && !cachedMarketData[k]._failed && cachedMarketData[k].rawDates);
        if(validKeys.length > 0) masterData = cachedMarketData[validKeys[0]];
    }
    if (!masterData || masterData._failed || !masterData.rawDates) {
        if(chartWrap) chartWrap.style.display = 'none';
        return;
    }

    if(chartWrap) chartWrap.style.display = 'flex';
    
    const rawDates = masterData.rawDates;
    const startIndex = Math.max(0, rawDates.length - sliceLen);
    const slicedRawDates = rawDates.slice(startIndex);
    const slicedDisplayDates = slicedRawDates.map(d => {
        if (typeof d === 'string' && d.includes('-')) {
            const parts = d.split('-');
            return `${parts[0]}.${parts[1]}.${parts[2]}`;
        }
        return d;
    });
    
    const costDataKr = []; const costDataUs = [];
    const evalDataKr = []; const evalDataUs = [];
    const realDataKr = []; const realDataUs = [];
    const realDataSymbols = []; // 날짜별 매도 종목 정보
    let firstNonZeroIdx = -1;
    
    slicedRawDates.forEach((dateStr, idx) => {
        let dCostKr = 0, dCostUs = 0;
        let dEvalKr = 0, dEvalUs = 0;
        let dRealKr = 0, dRealUs = 0;
        let dRealSymbols = []; // 해당 날짜에 매도된 종목들
        
        let fxRate = currentUsdKrw;
        if(cachedMarketData['KRW=X'] && !cachedMarketData['KRW=X']._failed) {
            const fxIdx = cachedMarketData['KRW=X'].rawDates.indexOf(dateStr);
            if(fxIdx !== -1) fxRate = cachedMarketData['KRW=X'].prices[fxIdx];
        }

        const pastTxs = state.transactions.filter(t => t.date <= dateStr);
        let filteredTxs = pastTxs;
        if(ownerFilter !== 'all') {
           filteredTxs = pastTxs.filter(t => t.owner === ownerFilter || t.owner === state.owners[ownerFilter]?.name);
        }
        
        let sortedTxs = [...filteredTxs].sort((a,b) => new Date(a.date) - new Date(b.date));
        
        let holdings = {};
        sortedTxs.forEach(tx => {
            if (tx.txType === 'dividend') return;
            if (!holdings[tx.symbol]) holdings[tx.symbol] = { qty: 0, avg: 0 };
            let h = holdings[tx.symbol];

            if (tx.txType === 'transfer') {
                if (tx.qty > 0) {
                    let totalVal = (h.qty * h.avg) + (tx.qty * tx.price);
                    h.qty += tx.qty;
                    h.avg = h.qty > 0 ? totalVal / h.qty : 0;
                } else {
                    h.qty += tx.qty;
                    if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
                }
                return;
            }
            
            if (tx.qty > 0) {
                let totalVal = (h.qty * h.avg) + (tx.qty * tx.price);
                h.qty += tx.qty;
                h.avg = totalVal / h.qty;
            } else {
                let sellQty = Math.abs(tx.qty);
                let pnl = (tx.price - h.avg) * sellQty;
                let isKr = isKorean(tx.symbol);
                if (tx.date === dateStr) {
                    if (isKr) dRealKr += pnl;
                    else dRealUs += pnl * fxRate;
                    // 매도 종목 기록
                    const symName = (cachedMarketData[tx.symbol] && !cachedMarketData[tx.symbol]._failed)
                        ? (cachedMarketData[tx.symbol].name || tx.symbol) : tx.symbol;
                    dRealSymbols.push({ symbol: tx.symbol, name: symName, qty: sellQty, pnl: isKr ? pnl : pnl * fxRate });
                }
                h.qty -= sellQty;
                if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
            }
        });

        for (let sym in holdings) {
            if (holdings[sym].qty > 0) {
                let h = holdings[sym];
                let isKr = isKorean(sym);
                let costVal = (h.qty * h.avg) * (isKr ? 1 : fxRate);
                if (isKr) dCostKr += costVal;
                else dCostUs += costVal;
                
                let priceOnDate = h.avg; 
                if (cachedMarketData[sym] && !cachedMarketData[sym]._failed) {
                    const pIdx = cachedMarketData[sym].rawDates.indexOf(dateStr);
                    if (pIdx !== -1 && cachedMarketData[sym].prices[pIdx] !== null) {
                        priceOnDate = cachedMarketData[sym].prices[pIdx];
                    } else {
                        let closestPrice = null;
                        for(let k = cachedMarketData[sym].rawDates.length - 1; k >= 0; k--) {
                            if (cachedMarketData[sym].rawDates[k] <= dateStr && cachedMarketData[sym].prices[k] !== null) {
                                closestPrice = cachedMarketData[sym].prices[k];
                                break;
                            }
                        }
                        if (closestPrice !== null) priceOnDate = closestPrice;
                    }
                }
                
                let evalVal = (h.qty * priceOnDate) * (isKr ? 1 : fxRate);
                if (isKr) dEvalKr += evalVal;
                else dEvalUs += evalVal;
            }
        }
        
        costDataKr.push(dCostKr);
        costDataUs.push(dCostUs);
        evalDataKr.push(dEvalKr);
        evalDataUs.push(dEvalUs);
        realDataKr.push(dRealKr);
        realDataUs.push(dRealUs);
        realDataSymbols.push(dRealSymbols);
        
        if (firstNonZeroIdx === -1 && (dCostKr > 0 || dCostUs > 0 || dEvalKr > 0 || dEvalUs > 0)) {
            firstNonZeroIdx = idx;
        }
    });

    let finalDisplayDates = slicedDisplayDates;
    let finalCostKr = costDataKr; let finalCostUs = costDataUs;
    let finalEvalKr = evalDataKr; let finalEvalUs = evalDataUs;
    let finalRealKr = realDataKr; let finalRealUs = realDataUs;
    let finalRealSymbols = realDataSymbols;

    if (firstNonZeroIdx > 0 && sliceLen >= 756) { 
        finalDisplayDates = slicedDisplayDates.slice(firstNonZeroIdx);
        finalCostKr = costDataKr.slice(firstNonZeroIdx);
        finalCostUs = costDataUs.slice(firstNonZeroIdx);
        finalEvalKr = evalDataKr.slice(firstNonZeroIdx);
        finalEvalUs = evalDataUs.slice(firstNonZeroIdx);
        finalRealKr = realDataKr.slice(firstNonZeroIdx);
        finalRealUs = realDataUs.slice(firstNonZeroIdx);
        finalRealSymbols = realDataSymbols.slice(firstNonZeroIdx);
    }

    // ── 캔버스 & 차트 초기화 ─────────────────────────────────────────
    const chartWrap2 = document.getElementById('portfolioChartWrapper');
    const oldPanels = chartWrap2.querySelector('[data-chart-panels]');
    if (oldPanels) oldPanels.remove();
    const singleCanvasWrap = document.getElementById('portfolioChartCanvas')?.parentElement;
    if (singleCanvasWrap) singleCanvasWrap.style.display = '';

    const canvas = document.getElementById('portfolioChartCanvas');
    if (!canvas) return;
    if (portfolioChartInst) portfolioChartInst.destroy();
    if (portfolioChartInstUs) { portfolioChartInstUs.destroy(); portfolioChartInstUs = null; }

    // 통합 평가액 = 국장 평가액 + 미장 평가액
    const finalEvalTotal = finalEvalKr.map((v, i) => v + finalEvalUs[i]);

    // 건별 실현수익 (우측 Y축 막대용 — 절댓값으로 막대 높이, 색상으로 손익 구분)
    const finalRealDaily = finalRealKr.map((v, i) => v + finalRealUs[i]);
    const finalRealPerTrade = finalRealDaily.map(v => v !== 0 ? Math.abs(v) : null);
    const finalRealBarColors = finalRealDaily.map(v => v > 0 ? 'rgba(0,200,122,0.75)' : (v < 0 ? 'rgba(255,77,106,0.75)' : 'rgba(136,144,164,0.3)'));
    const finalRealBarBorderColors = finalRealDaily.map(v => v > 0 ? '#00C578' : (v < 0 ? '#ff4d6a' : '#8890a4'));

    // 총 투자액 / 평가액 (국장+미장 합산, 당시 보유 기준)
    const finalCostTotal = finalCostKr.map((v, i) => v + finalCostUs[i]);

    const fmtWon = v => {
        const abs = Math.abs(v);
        if (abs >= 100000000) return (v < 0 ? '-' : '') + '₩' + (abs / 100000000).toFixed(1) + '억';
        if (abs >= 10000)     return (v < 0 ? '-' : '') + '₩' + Math.round(abs / 10000).toLocaleString() + '만';
        return (v < 0 ? '-' : '') + '₩' + Math.round(abs).toLocaleString();
    };

    // ── 누적 영역 그래프: 아래→위 순서 (국장투자액, 미장투자액, 국장평가액, 미장평가액, 통합평가액) ──
    // Chart.js stacked: true 로 각 레이어가 이전 레이어 위에 쌓임
    // 각 dataset의 data는 해당 레이어의 "순수 기여분(increment)"
    // ┌ Layer 5: 통합 평가액 → 순수 기여분 = 통합 평가액 - (국장평가액 + 미장평가액) = 0 (단, 최상단 라인으로 시각화)
    // ┌ Layer 4: 미장 평가액
    // ┌ Layer 3: 국장 평가액
    // ┌ Layer 2: 미장 투자액
    // └ Layer 1: 국장 투자액 (바닥)
    // * 통합 평가액은 국장+미장 평가액의 합이므로, "선(border)"만 가진 투명 레이어로 올려 전체 합계선을 표시

    // ── 드래그 줌용 데이터 저장 ──
    portfolioZoomData = {
        labels: finalDisplayDates,
        costTotal: finalCostTotal,
        evalTotal: finalEvalTotal,
        realPerTrade: finalRealPerTrade,
        realBarColors: finalRealBarColors,
        realBarBorderColors: finalRealBarBorderColors,
        realDaily: finalRealDaily,
        realSymbols: finalRealSymbols,
        fmtWon
    };

    _buildPortfolioChart(portfolioZoomData, null);
}

// ── 포트폴리오 차트 실제 생성 (줌 슬라이스 지원) ──
function _buildPortfolioChart(data, zoomRange) {
    const canvas = document.getElementById('portfolioChartCanvas');
    if (!canvas) return;

    // 줌 범위에 따라 데이터 슬라이스
    const si = (zoomRange && zoomRange.start >= 0) ? zoomRange.start : 0;
    const ei = (zoomRange && zoomRange.end >= 0)   ? zoomRange.end + 1 : data.labels.length;
    const sl  = (x) => x.slice(si, ei);

    const labels          = sl(data.labels);
    const costTotal       = sl(data.costTotal);
    const evalTotal       = sl(data.evalTotal);
    const realPerTrade    = sl(data.realPerTrade);
    const realBarColors   = sl(data.realBarColors);
    const realBarBordClrs = sl(data.realBarBorderColors);
    const realDaily       = sl(data.realDaily);
    const realSymbols     = sl(data.realSymbols);
    const fmtWon          = data.fmtWon;

    if (portfolioChartInst) { portfolioChartInst.destroy(); portfolioChartInst = null; }

    // 줌 초기화 버튼 상태 갱신
    const btnReset = document.getElementById('btnPortfolioZoomReset');
    if (btnReset) btnReset.classList.toggle('active', !!zoomRange);

    portfolioChartInst = new Chart(canvas.getContext('2d'), {
        data: {
            labels: labels,
            datasets: [
                // ❶ 총 투자액 (당시 보유 기준 합산 — 틸 영역)
                {
                    label: '📊 총 투자액',
                    type: 'line',
                    data: costTotal,
                    borderColor: '#56B6C6',
                    backgroundColor: 'rgba(86,182,198,0.35)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: 'origin',
                    tension: 0.1,
                    yAxisID: 'y',
                    order: 3
                },
                // ❷ 총 평가액 (당시 보유 기준 합산 — 민트 영역)
                {
                    label: '📈 총 평가액',
                    type: 'line',
                    data: evalTotal,
                    borderColor: 'rgba(0,200,122,1)',
                    backgroundColor: 'rgba(0,200,122,0.18)',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    fill: '-1',
                    tension: 0.1,
                    yAxisID: 'y',
                    order: 2
                },
                // ❸ 건별 실현수익 막대 — 우측 Y축 (익절=초록, 손절=빨강)
                {
                    label: '💰 건별 실현수익',
                    type: 'bar',
                    data: realPerTrade,
                    backgroundColor: realBarColors,
                    borderColor: realBarBordClrs,
                    borderWidth: 1.5,
                    borderRadius: 3,
                    yAxisID: 'y2',
                    order: 1,
                    barThickness: 6,
                    minBarLength: 4
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { color: '#8890a4', font: { size: 11 }, usePointStyle: true, boxWidth: 8, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.raw === null || ctx.raw === undefined) return null;
                            const lbl = ctx.dataset.label || '';
                            if (lbl.includes('건별 실현수익')) {
                                const origVal = realDaily[ctx.dataIndex] || 0;
                                if (origVal === 0) return null;
                                const sign = origVal >= 0 ? '▲ +' : '▼ ';
                                const lines = [`💰 건별 실현수익: ${sign}${fmtWon(Math.abs(origVal))}`];
                                const syms = realSymbols[ctx.dataIndex] || [];
                                syms.forEach(s => {
                                    const pnlSign = s.pnl >= 0 ? '+' : '';
                                    const nameStr = s.name !== s.symbol ? `${s.name}` : s.symbol;
                                    lines.push(`  📌 ${nameStr} (${s.qty}주)  →  ${pnlSign}${fmtWon(s.pnl)}`);
                                });
                                return lines;
                            }
                            return `${lbl}: ${fmtWon(ctx.raw)}`;
                        },
                        afterBody: function(items) {
                            const cost  = items.find(i => (i.dataset.label || '').includes('총 투자액'))?.raw || 0;
                            const total = items.find(i => (i.dataset.label || '').includes('총 평가액'))?.raw || 0;
                            if (total > 0 && cost > 0) {
                                const pnl  = total - cost;
                                const pct  = (pnl / cost * 100).toFixed(2);
                                const sign = pnl >= 0 ? '+' : '';
                                return [`─────────────────`, `미실현 손익: ${sign}${fmtWon(pnl)}  (${sign}${pct}%)`];
                            }
                            return [];
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#555e72', maxTicksLimit: 10, font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    position: 'left',
                    ticks: {
                        color: '#555e72', font: { size: 10 },
                        callback: function(val) { return fmtWon(val); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    border: { display: false }
                },
                y2: {
                    position: 'right',
                    beginAtZero: true,
                    ticks: {
                        color: '#8890a4', font: { size: 10 },
                        callback: function(val) { return fmtWon(val); }
                    },
                    grid: { drawOnChartArea: false },
                    border: { display: false }
                }
            }
        }
    });

    // ── 드래그 줌 이벤트 설정 ──
    _setupPortfolioDragZoom(canvas, zoomRange);
}

// ── 드래그 줌 이벤트 핸들러 ──
let _pDragStartX = 0, _pDragCurrentX = 0, _pIsDragging = false;
let _pZoomOverlay = null;

function _setupPortfolioDragZoom(canvas, currentZoom) {
    // 기존 리스너 제거를 위해 새 함수 참조 방식 사용
    canvas._onMouseDown = function(e) {
        if (e.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        _pDragStartX = e.clientX - rect.left;
        _pDragCurrentX = _pDragStartX;
        _pIsDragging = true;
        // 오버레이 캔버스 준비
        if (!_pZoomOverlay) {
            _pZoomOverlay = document.createElement('canvas');
            _pZoomOverlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;';
            canvas.parentElement.appendChild(_pZoomOverlay);
        }
        _pZoomOverlay.width  = canvas.offsetWidth;
        _pZoomOverlay.height = canvas.offsetHeight;
    };
    canvas._onMouseMove = function(e) {
        if (!_pIsDragging || !_pZoomOverlay) return;
        const rect = canvas.getBoundingClientRect();
        _pDragCurrentX = e.clientX - rect.left;
        const ctx2 = _pZoomOverlay.getContext('2d');
        ctx2.clearRect(0, 0, _pZoomOverlay.width, _pZoomOverlay.height);
        const x1 = Math.min(_pDragStartX, _pDragCurrentX);
        const x2 = Math.max(_pDragStartX, _pDragCurrentX);
        if (x2 - x1 < 5) return;
        ctx2.fillStyle = 'rgba(124,106,247,0.15)';
        ctx2.fillRect(x1, 0, x2 - x1, _pZoomOverlay.height);
        ctx2.strokeStyle = 'rgba(124,106,247,0.7)';
        ctx2.lineWidth = 1.5;
        ctx2.setLineDash([4, 3]);
        ctx2.strokeRect(x1, 0, x2 - x1, _pZoomOverlay.height);
        ctx2.setLineDash([]);
    };
    canvas._onMouseUp = function(e) {
        if (!_pIsDragging) return;
        _pIsDragging = false;
        if (_pZoomOverlay) {
            _pZoomOverlay.getContext('2d').clearRect(0, 0, _pZoomOverlay.width, _pZoomOverlay.height);
        }
        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const x1 = Math.min(_pDragStartX, endX);
        const x2 = Math.max(_pDragStartX, endX);
        if (x2 - x1 < 8 || !portfolioChartInst || !portfolioZoomData) return;

        // Chart.js 차트 영역 기준으로 인덱스 계산
        const chartArea = portfolioChartInst.chartArea;
        if (!chartArea) return;
        const totalPts = portfolioZoomData.labels.length;
        const areaW = chartArea.right - chartArea.left;
        function pxToIdx(px) {
            const ratio = Math.max(0, Math.min(1, (px - chartArea.left) / areaW));
            // 현재 zoomed offset 반영
            const base = currentZoom ? currentZoom.start : 0;
            const span = currentZoom ? (currentZoom.end - currentZoom.start + 1) : totalPts;
            return Math.round(base + ratio * (span - 1));
        }
        const startIdx = Math.max(0, pxToIdx(x1));
        const endIdx   = Math.min(totalPts - 1, pxToIdx(x2));
        if (endIdx - startIdx < 1) return;

        _buildPortfolioChart(portfolioZoomData, { start: startIdx, end: endIdx });
    };

    canvas.removeEventListener('mousedown', canvas._prevMouseDown);
    canvas.removeEventListener('mousemove', canvas._prevMouseMove);
    canvas.removeEventListener('mouseup',   canvas._prevMouseUp);
    canvas.addEventListener('mousedown', canvas._onMouseDown);
    canvas.addEventListener('mousemove', canvas._onMouseMove);
    canvas.addEventListener('mouseup',   canvas._onMouseUp);
    canvas._prevMouseDown = canvas._onMouseDown;
    canvas._prevMouseMove = canvas._onMouseMove;
    canvas._prevMouseUp   = canvas._onMouseUp;

    // 캔버스 밖에서 마우스 놓을 때 드래그 취소
    if (!window._pDocMouseUpBound) {
        window._pDocMouseUpBound = true;
        document.addEventListener('mouseup', () => {
            if (_pIsDragging) {
                _pIsDragging = false;
                if (_pZoomOverlay) _pZoomOverlay.getContext('2d').clearRect(0, 0, _pZoomOverlay.width, _pZoomOverlay.height);
            }
        });
    }
}

// ── 줌 초기화 ──
function resetPortfolioChartZoom() {
    if (!portfolioZoomData) return;
    _buildPortfolioChart(portfolioZoomData, null);
}

function updateSummaryAndAllocation(rawHoldings, fullDisplayItems) {
    accountPieChartInsts.forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
    accountPieChartInsts = [];
    if(allocationChartInst && typeof allocationChartInst.destroy === 'function') { allocationChartInst.destroy(); allocationChartInst = null; }

    let krwSummary = { totalEval: 0, totalCost: 0, accounts: {} };
    let usdSummary = { totalEval: 0, totalCost: 0, accounts: {} };
    let treemapDataMap = {};
    
    if (fullDisplayItems) {
      fullDisplayItems.forEach(item => {
        if(item.type === 'held' && item.evalAmt > 0) {
          let sym = item.symbol;
          if(!treemapDataMap[sym]) {
             treemapDataMap[sym] = {
               symbol: sym,
               name: item.data ? item.data.name : sym,
               value: 0,
               change: item.activeChange || 0,
               isKr: isKorean(sym),
               tags: (state.tags && state.tags[sym]) ? state.tags[sym] : ''
             };
          }
          treemapDataMap[sym].value += (isKorean(sym) ? item.evalAmt : item.evalAmt * currentUsdKrw);
        }
      });
    }
    let treemapData = Object.values(treemapDataMap);

    for(let key in rawHoldings) {
      if(!rawHoldings.hasOwnProperty(key)) continue;
      let h = rawHoldings[key];
      if(h.qty > 0) {
        let currentPrice = h.avg; 
        let stockName = h.symbol;
        if (cachedMarketData[h.symbol] && !cachedMarketData[h.symbol]._failed) {
            currentPrice = cachedMarketData[h.symbol].last || h.avg;
            stockName = cachedMarketData[h.symbol].name || h.symbol;
        } else if (localStockDB && localStockDB.length > 0) {
            let matched = localStockDB.find(s => s.symbol === h.symbol);
            if(matched) stockName = matched.name;
        }

        const eAmt = h.qty * currentPrice; 
        const cAmt = h.qty * h.avg;
        let broker = h.broker || '미지정'; 
        
        if(isKorean(h.symbol)) { 
          krwSummary.totalEval += eAmt; krwSummary.totalCost += cAmt;
          if(!krwSummary.accounts[broker]) krwSummary.accounts[broker] = { eval: 0, cost: 0, items: [] };
          krwSummary.accounts[broker].eval += eAmt; krwSummary.accounts[broker].cost += cAmt;
          krwSummary.accounts[broker].items.push({ name: stockName, costAmt: cAmt, evalAmt: eAmt });
        } else { 
          usdSummary.totalEval += eAmt; usdSummary.totalCost += cAmt;
          if(!usdSummary.accounts[broker]) usdSummary.accounts[broker] = { eval: 0, cost: 0, items: [] };
          usdSummary.accounts[broker].eval += eAmt; usdSummary.accounts[broker].cost += cAmt;
          usdSummary.accounts[broker].items.push({ name: stockName, costAmt: cAmt, evalAmt: eAmt });
        }
      }
    }

    let krwDiv = 0, usdDivKrw = 0;
    let filterName = 'all';
    if (currentView === 'user1') filterName = state.owners.user1.name;
    if (currentView === 'user2') filterName = state.owners.user2.name;

    // 누적 실현수익 계산
    let cumulRealKr = 0, cumulRealUsKrw = 0;
    const holdingsForReal = {};
    const sortedForReal = [...state.transactions]
        .filter(t => filterName === 'all' || t.owner === filterName)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    sortedForReal.forEach(tx => {
        if (tx.txType === 'dividend' || tx.txType === 'transfer') {
            if (tx.txType === 'dividend') {
                if (isKorean(tx.symbol)) krwDiv += tx.price;
                else usdDivKrw += tx.price * getHistoricalFxRate(tx.date);
            }
            return;
        }
        if (!holdingsForReal[tx.symbol]) holdingsForReal[tx.symbol] = { qty: 0, avg: 0 };
        const h = holdingsForReal[tx.symbol];
        if (tx.qty > 0) {
            const totalVal = (h.qty * h.avg) + (tx.qty * tx.price);
            h.qty += tx.qty;
            h.avg = h.qty > 0 ? totalVal / h.qty : 0;
        } else {
            const sellQty = Math.abs(tx.qty);
            const pnl = (tx.price - h.avg) * sellQty;
            if (isKorean(tx.symbol)) cumulRealKr += pnl;
            else cumulRealUsKrw += pnl * getHistoricalFxRate(tx.date);
            h.qty -= sellQty;
            if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
        }
    });
    // dividend 는 위에서 처리했으니 중복 계산 방지를 위해 아래 루프는 제거
    
    const globalDiv = krwDiv + usdDivKrw;
    const globalCost = krwSummary.totalCost + (usdSummary.totalCost * currentUsdKrw);
    const globalEval = krwSummary.totalEval + (usdSummary.totalEval * currentUsdKrw);
    const cumulRealTotal = cumulRealKr + cumulRealUsKrw;
    // 누적 자산 = 현재 평가액 + 누적 실현수익
    const globalCumulative = globalEval + cumulRealTotal;

    // 보기 모드에 따라 표시값 결정
    const displayVal = globalAssetViewMode === 'cumulative' ? globalCumulative : globalEval;
    const displayValLabel = globalAssetViewMode === 'cumulative' ? '누적 자산 (평가+실현)' : '통합 평가 자산';
    const globalRoi = globalCost > 0 ? ((displayVal - globalCost) / globalCost * 100) : 0;
    const globalPnl = displayVal - globalCost;

    document.getElementById('globalTotalCost').textContent = `₩ ${Math.round(globalCost).toLocaleString()}`;
    document.getElementById('globalTotalVal').textContent = `₩ ${Math.round(displayVal).toLocaleString()}`;
    document.getElementById('globalTotalDiv').textContent = `₩ ${Math.round(globalDiv).toLocaleString()}`;
    // 레이블도 모드에 따라 변경
    const valLabelEl = document.getElementById('globalTotalValLabel');
    if (valLabelEl) valLabelEl.textContent = displayValLabel;
    const gRoiEl = document.getElementById('globalTotalRoi');
    const signG = globalPnl >= 0 ? '+' : '';
    gRoiEl.innerHTML = `${signG}₩${Math.round(Math.abs(globalPnl)).toLocaleString()}<br><span style="font-size:12px; font-weight:500">(${signG}${globalRoi.toFixed(2)}%)</span>`;
    gRoiEl.style.color = globalPnl >= 0 ? '#00C578' : (globalCost > 0 ? '#3A9AFF' : 'var(--text)');
    document.getElementById('globalExchangeRate').textContent = `$1 = ₩${Math.round(currentUsdKrw).toLocaleString()}`;

    const tmContainer = document.getElementById('allocationTreemap');
    if (tmContainer) {
        if (treemapData.length === 0) {
            tmContainer.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center; color:var(--text3); font-size:12px;">보유 자산 없음</div>';
        } else {
            tmContainer.innerHTML = '';
            let x = 0, y = 0, w = 100, h = 100;
            treemapData.sort((a,b)=> b.value - a.value);

            let html = '';
            function renderTreemapNode(items, x, y, w, h) {
                if(items.length === 0) return;
                if(items.length === 1) {
                    let it = items[0];
                    let bg = getHeatmapColor(it.change);
                    let sign = it.change > 0 ? '+' : '';
                    let fontSz = (w < 15 || h < 25) ? 10 : 13;
                    let tickerDisp = (w > 20 && h > 30) ? `<div style="font-size:${fontSz-3}px; opacity:0.7; margin-top:2px;">${it.symbol.split('.')[0]}</div>` : '';

                    html += `
                        <div class="treemap-cell" style="left:${x}%; top:${y}%; width:${w}%; height:${h}%; background:${bg}; cursor:pointer; transition:opacity 0.15s, outline 0.1s;"
                             data-name="${it.name}" data-val="₩${Math.round(it.value).toLocaleString()}"
                             data-symbol="${it.symbol}" data-rawval="${Math.round(it.value)}"
                             data-iskr="${it.isKr}" data-tags="${it.tags}">
                          <div style="font-weight:bold; font-size:${fontSz}px; text-align:center; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${it.name}">${it.name}</div>
                          ${tickerDisp}
                          <div style="font-size:${fontSz-1}px; margin-top:2px; opacity:0.9;">${sign}${it.change.toFixed(2)}%</div>
                        </div>`;
                    return;
                }
                let totalItems = items.reduce((sum, i)=>sum+i.value, 0);
                if(totalItems <= 0) return;
                let half = totalItems / 2;
                let sum = 0; let splitIdx = 0;
                for(let i=0; i<items.length; i++){
                    sum += items[i].value;
                    if(sum >= half && i < items.length-1) { splitIdx = i; break; }
                }
                if(splitIdx === 0 && items.length > 1) splitIdx = 0; 

                let leftItems = items.slice(0, splitIdx+1);
                let rightItems = items.slice(splitIdx+1);
                let leftRatio = leftItems.reduce((sum, i)=>sum+i.value, 0) / totalItems;

                if (w > h) {
                    let lw = w * leftRatio;
                    renderTreemapNode(leftItems, x, y, lw, h);
                    renderTreemapNode(rightItems, x + lw, y, w - lw, h);
                } else {
                    let lh = h * leftRatio;
                    renderTreemapNode(leftItems, x, y, w, lh);
                    renderTreemapNode(rightItems, x, y + lh, w, h - lh);
                }
            }
            renderTreemapNode(treemapData, x, y, w, h);
            tmContainer.innerHTML = html;

            // 🌟 포트폴리오 맵 셀 이벤트: 일반 클릭 → 종목창 / 롱프레스 → 선택 모드
            document.querySelectorAll('.treemap-cell').forEach(cell => {
                let _pressTimer = null;
                const LONG_PRESS_MS = 480;

                // ── 툴팁 ──
                cell.addEventListener('mouseenter', () => {
                    if (_treemapSelectMode) return;
                    let tip = document.getElementById('chartjs-tooltip');
                    if (!tip) { tip = document.createElement('div'); tip.id = 'chartjs-tooltip'; document.body.appendChild(tip); }
                    tip.innerHTML = `<div style="font-size:16px;font-weight:700;margin-bottom:4px;text-align:center;">${cell.getAttribute('data-name')}</div><div style="font-size:16px;text-align:center;color:var(--text);">${cell.getAttribute('data-val')}</div>`;
                    tip.style.opacity = 1;
                });
                cell.addEventListener('mousemove', (e) => {
                    const tip = document.getElementById('chartjs-tooltip');
                    if (tip) { tip.style.left = e.pageX + 'px'; tip.style.top = (e.pageY - 10) + 'px'; }
                });
                cell.addEventListener('mouseleave', () => {
                    const tip = document.getElementById('chartjs-tooltip');
                    if (tip) tip.style.opacity = 0;
                    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
                });

                // ── 롱프레스 (마우스) ──
                cell.addEventListener('mousedown', () => {
                    _pressTimer = setTimeout(() => { _pressTimer = null; _enterTreemapSelectMode(cell); }, LONG_PRESS_MS);
                });
                cell.addEventListener('mouseup', () => {
                    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
                });

                // ── 롱프레스 (터치) ──
                cell.addEventListener('touchstart', () => {
                    _pressTimer = setTimeout(() => { _pressTimer = null; _enterTreemapSelectMode(cell); }, LONG_PRESS_MS);
                }, { passive: true });
                cell.addEventListener('touchend', () => {
                    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
                });
                cell.addEventListener('touchmove', () => {
                    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
                }, { passive: true });

                // ── 클릭 ──
                cell.addEventListener('click', () => {
                    if (_treemapSelectMode) {
                        _toggleTreemapCell(cell);
                    } else {
                        const sym = cell.getAttribute('data-symbol');
                        if (sym) openChartModal(sym);
                    }
                });
            });
        }
    }

    renderTagBar(treemapData);

    const krwPnl = krwSummary.totalEval - krwSummary.totalCost;
    const krwRoi = krwSummary.totalCost > 0 ? (krwPnl / krwSummary.totalCost * 100) : 0;
    
    document.getElementById('krwTotalCost').textContent = `₩${Math.round(krwSummary.totalCost).toLocaleString()}`;
    document.getElementById('krwTotalEval').textContent = `₩${Math.round(krwSummary.totalEval).toLocaleString()}`;
    const elKrwPnl = document.getElementById('krwTotalPnl');
    elKrwPnl.textContent = `${krwPnl >= 0 ? '+' : ''}₩${Math.round(krwPnl).toLocaleString()} (${krwRoi.toFixed(2)}%)`;
    elKrwPnl.className = 'cp-sum-val ' + (krwPnl >= 0 ? 'up' : (krwSummary.totalCost > 0 ? 'down' : ''));

    let maxKrwAccVal = 0;
    Object.values(krwSummary.accounts).forEach(d => {
      if(d.cost > maxKrwAccVal) maxKrwAccVal = d.cost;
      if(d.eval > maxKrwAccVal) maxKrwAccVal = d.eval;
    });

    let krwPieConfigs = [];
    let krwAccHtml = Object.keys(krwSummary.accounts).map(b => {
      let d = krwSummary.accounts[b];
      let pnl = d.eval - d.cost;
      let roi = d.cost > 0 ? (pnl / d.cost * 100) : 0;
      let cls = pnl >= 0 ? 'up' : (d.cost > 0 ? 'down' : '');
      let sign = pnl >= 0 ? '+' : '';
      let count = d.items.length;
      let pieId = 'krw_pie_' + Math.random().toString(36).substring(2, 9);
      krwPieConfigs.push({ id: pieId, items: d.items, isUsd: false });

      let costPct = maxKrwAccVal > 0 ? (d.cost / maxKrwAccVal * 100) : 0;
      let evalPct = maxKrwAccVal > 0 ? (d.eval / maxKrwAccVal * 100) : 0;
      let evalColor = pnl >= 0 ? '#00C578' : '#3A9AFF';
      let activeCls = activeAccountFilter === b ? 'active-filter' : '';

      return `
        <div class="acc-row ${activeCls}" onclick="toggleAccountFilter('${b}')">
          <div class="acc-pie-wrap"><canvas id="${pieId}"></canvas></div>
          <div class="acc-content">
              <div class="acc-header">
                  <div class="acc-name" title="${b}">${b}<span class="acc-count">(${count}종목)</span></div>
                  <div class="acc-pnl ${cls}">${sign}₩${Math.round(Math.abs(pnl)).toLocaleString()} <span class="acc-roi">(${sign}${roi.toFixed(2)}%)</span></div>
              </div>
              <div class="acc-bars">
                  <div class="acc-bar-row">
                      <span class="acc-bar-label">투자</span>
                      <div class="acc-bar-bg"><div class="acc-bar-fill" style="width:${costPct}%; background:rgba(136,144,164,0.4);"></div></div>
                      <span class="acc-bar-val">₩${Math.round(d.cost).toLocaleString()}</span>
                  </div>
                  <div class="acc-bar-row">
                      <span class="acc-bar-label">평가</span>
                      <div class="acc-bar-bg"><div class="acc-bar-fill" style="width:${evalPct}%; background:${evalColor};"></div></div>
                      <span class="acc-bar-val">₩${Math.round(d.eval).toLocaleString()}</span>
                  </div>
              </div>
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('krwAccountList').innerHTML = krwAccHtml || '<div style="color:var(--text3); font-size:11px; text-align:center; padding:10px;">등록된 계좌가 없습니다.</div>';

    const usdPnl = usdSummary.totalEval - usdSummary.totalCost;
    const usdRoi = usdSummary.totalCost > 0 ? (usdPnl / usdSummary.totalCost * 100) : 0;

    document.getElementById('usdTotalCost').textContent = `$${usdSummary.totalCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('usdTotalEval').textContent = `$${usdSummary.totalEval.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    const elUsdPnl = document.getElementById('usdTotalPnl');
    elUsdPnl.textContent = `${usdPnl >= 0 ? '+' : ''}$${usdPnl.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} (${usdRoi.toFixed(2)}%)`;
    elUsdPnl.className = 'cp-sum-val ' + (usdPnl >= 0 ? 'up' : (usdSummary.totalCost > 0 ? 'down' : ''));

    let maxUsdAccVal = 0;
    Object.values(usdSummary.accounts).forEach(d => {
      if(d.cost > maxUsdAccVal) maxUsdAccVal = d.cost;
      if(d.eval > maxUsdAccVal) maxUsdAccVal = d.eval;
    });

    let usdPieConfigs = [];
    let usdAccHtml = Object.keys(usdSummary.accounts).map(b => {
      let d = usdSummary.accounts[b];
      let pnl = d.eval - d.cost;
      let roi = d.cost > 0 ? (pnl / d.cost * 100) : 0;
      let cls = pnl >= 0 ? 'up' : (d.cost > 0 ? 'down' : '');
      let sign = pnl >= 0 ? '+' : '';
      let count = d.items.length;
      let pieId = 'usd_pie_' + Math.random().toString(36).substring(2, 9);
      usdPieConfigs.push({ id: pieId, items: d.items, isUsd: true });

      let costPct = maxUsdAccVal > 0 ? (d.cost / maxUsdAccVal * 100) : 0;
      let evalPct = maxUsdAccVal > 0 ? (d.eval / maxUsdAccVal * 100) : 0;
      let evalColor = pnl >= 0 ? 'rgba(0,197,120,0.8)' : 'rgba(58,154,255,0.8)';
      let activeCls = activeAccountFilter === b ? 'active-filter' : '';

      return `
        <div class="acc-row ${activeCls}" onclick="toggleAccountFilter('${b}')">
          <div class="acc-pie-wrap"><canvas id="${pieId}"></canvas></div>
          <div class="acc-content">
              <div class="acc-header">
                  <div class="acc-name" title="${b}">${b}<span class="acc-count">(${count}종목)</span></div>
                  <div class="acc-pnl ${cls}">${sign}$${Math.abs(pnl).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} <span class="acc-roi">(${sign}${roi.toFixed(2)}%)</span></div>
              </div>
              <div class="acc-bars">
                  <div class="acc-bar-row">
                      <span class="acc-bar-label">투자</span>
                      <div class="acc-bar-bg"><div class="acc-bar-fill" style="width:${costPct}%; background:rgba(136,144,164,0.4);"></div></div>
                      <span class="acc-bar-val">$${d.cost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                  </div>
                  <div class="acc-bar-row">
                      <span class="acc-bar-label">평가</span>
                      <div class="acc-bar-bg"><div class="acc-bar-fill" style="width:${evalPct}%; background:${evalColor};"></div></div>
                      <span class="acc-bar-val">$${d.eval.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                  </div>
              </div>
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('usdAccountList').innerHTML = usdAccHtml || '<div style="color:var(--text3); font-size:11px; text-align:center; padding:10px;">등록된 계좌가 없습니다.</div>';

    const pieColors = ['#7c6af7', '#4d9fff', '#00c87a', '#ff4d6a', '#f5a623', '#00b4d8', '#a259ff', '#ffb703', '#118ab2', '#06d6a0'];
    [...krwPieConfigs, ...usdPieConfigs].forEach(cfg => {
      const ctx = document.getElementById(cfg.id);
      if(!ctx) return;
      cfg.items.sort((a,b) => b.evalAmt - a.evalAmt);
      const c = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: cfg.items.map(i => i.name),
          datasets: [{
            data: cfg.items.map(i => i.evalAmt),
            backgroundColor: cfg.items.map((_, i) => pieColors[i % pieColors.length]),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: 4 },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              callbacks: {
                label: function(context) {
                  let v = context.raw;
                  let formatVal = cfg.isUsd ? '$' + v.toLocaleString(undefined,{minimumFractionDigits:2}) : '₩' + Math.round(v || 0).toLocaleString();
                  return context.label + ': ' + formatVal;
                }
              },
              external: function(context) {
                let tooltipEl = document.getElementById('chartjs-tooltip');
                if (!tooltipEl) {
                  tooltipEl = document.createElement('div');
                  tooltipEl.id = 'chartjs-tooltip';
                  document.body.appendChild(tooltipEl);
                }
                const tooltipModel = context.tooltip;
                if (tooltipModel.opacity === 0) {
                  tooltipEl.style.opacity = 0;
                  return;
                }
                if (tooltipModel.body) {
                  const bodyLines = tooltipModel.body.map(b => b.lines);
                  let innerHtml = '<div style="display:flex; flex-direction:column; gap:4px;">';
                  bodyLines.forEach(function(body, i) {
                    const colors = tooltipModel.labelColors[i];
                    const span = `<span style="background:${colors.backgroundColor}; width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px;"></span>`;
                    let txt = body[0];
                    let splitTxt = txt.split(': ');
                    if(splitTxt.length === 2) {
                      let name = splitTxt[0];
                      let formatVal = splitTxt[1]; 
                      innerHtml += `<div style="font-size:16px; font-weight:700; display:flex; align-items:center;">${span}${name}</div>`;
                      innerHtml += `<div style="font-size:16px; color:var(--text); padding-left:16px;">${formatVal}</div>`;
                    } else {
                      innerHtml += `<div style="font-size:12px; display:flex; align-items:center;">${span}${txt}</div>`;
                    }
                  });
                  innerHtml += '</div>';
                  tooltipEl.innerHTML = innerHtml;
                }
                const position = context.chart.canvas.getBoundingClientRect();
                tooltipEl.style.opacity = 1;
                tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
                tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
              }
            }
          },
          cutout: '55%', animation: { duration: 0 }
        }
      });
      accountPieChartInsts.push(c);
    });
}

function renderDividendDashboard() {
  updateViewHeader('🌿', '배당통계');
  let krwTotal = 0, usdTotal = 0, usdTotalKrw = 0;
  let monthlyKrw = {}, monthlyUsd = {}, monthlyUsdKrw = {};
  let symTotals = {};
  let divYields = {}; 

  const cutoff = getCutoffDateFromRange(state.range);
// 배당 계좌 드롭다운 동적 업데이트
  const allDivBrokers = [...new Set(
    state.transactions.filter(t=>t.txType==='dividend').map(t=>t.broker).filter(b=>b&&b.trim())
  )].sort();
  const divBrokerSel = document.getElementById('divBrokerFilter');
  if (divBrokerSel) {
    const cur = dividendFilters.broker;
    divBrokerSel.innerHTML = `<option value="all">전체</option>` +
      allDivBrokers.map(b => `<option value="${b}" ${cur===b?'selected':''}>${b}</option>`).join('');
  }

  // 활성 필터 배지 업데이트
  const divBadgesEl = document.getElementById('dividendActiveBadges');
  if (divBadgesEl) {
    let html = '';
    if (dividendFilters.dateFrom || dividendFilters.dateTo) {
      const label = dividendFilters.dateFrom === dividendFilters.dateTo
        ? dividendFilters.dateFrom
        : `${dividendFilters.dateFrom||'~'} ~ ${dividendFilters.dateTo||'~'}`;
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">📅 ${label}
        <span onclick="dividendFilters.dateFrom='';dividendFilters.dateTo='';renderDividendDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (currentDivFilter !== 'all') {
      const oLabel = currentDivFilter === 'user1' ? state.owners.user1.name : state.owners.user2.name;
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">소유자: ${oLabel}
        <span onclick="currentDivFilter='all'; document.querySelectorAll('.div-owner-filter').forEach((b,i)=>b.classList.toggle('active',i===0)); renderDividendDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (dividendFilters.market !== 'all') {
      const mLabel = dividendFilters.market === 'kr' ? '국내' : '해외';
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">시장: ${mLabel}
        <span onclick="_setDivMktBtn(document.getElementById('divMktAll')); updateDividendFilter('market','all');"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (dividendFilters.broker !== 'all') {
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">계좌: ${dividendFilters.broker}
        <span onclick="dividendFilters.broker='all'; document.getElementById('divBrokerFilter').value='all'; renderDividendDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (dividendFilters.search) {
      html += `<div class="f-btn active" style="cursor:default;font-size:11px;">종목: ${dividendFilters.search}
        <span onclick="dividendFilters.search=''; document.getElementById('divNameSearch').value=''; renderDividendDashboard();"
          style="margin-left:6px;cursor:pointer;font-weight:bold;color:var(--text2);">✕</span></div>`;
    }
    if (html) html += `<button class="btn-sm" onclick="resetDividendFilters()" style="height:26px; padding:0 10px; color:var(--red); border-color:rgba(255,77,106,0.3); background:rgba(255,77,106,0.05); font-size:11px;">초기화 🔄</button>`;
    divBadgesEl.innerHTML = html;
  }

  const divTxs = state.transactions.filter(t => {
    if (t.txType !== 'dividend') return false;
    if (t.date < cutoff) return false;

    let filterName = 'all';
    if (currentDivFilter === 'user1') filterName = state.owners.user1.name;
    if (currentDivFilter === 'user2') filterName = state.owners.user2.name;
    if (filterName !== 'all' && t.owner !== filterName) return false;

    // 추가 필터
    const isKr = isKorean(t.symbol);
    if (dividendFilters.market === 'kr' && !isKr) return false;
    if (dividendFilters.market === 'us' && isKr) return false;
    if (dividendFilters.broker !== 'all' && (t.broker||'') !== dividendFilters.broker) return false;
    if (dividendFilters.dateFrom && t.date < dividendFilters.dateFrom) return false;
    if (dividendFilters.dateTo   && t.date > dividendFilters.dateTo)   return false;
    if (dividendFilters.search) {
      const s = dividendFilters.search.toLowerCase();
      let name = t.symbol;
      const dbM = localStockDB.find(x => x.symbol === t.symbol);
      if (dbM) name = dbM.name;
      else if (cachedMarketData[t.symbol]?.name) name = cachedMarketData[t.symbol].name;
      if (!t.symbol.toLowerCase().includes(s) && !name.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  divTxs.forEach(tx => {
     const isKRW = isKorean(tx.symbol);
     const amt = tx.price; 
     const month = tx.date.substring(0, 7); 
     const sym = tx.symbol;

     if (!monthlyKrw[month]) monthlyKrw[month] = 0;
     if (!monthlyUsd[month]) monthlyUsd[month] = 0;
     if (!symTotals[sym]) symTotals[sym] = { krw: 0, usd: 0 };
     if (!divYields[sym]) divYields[sym] = { totalDiv: 0, totalEvalAtDiv: 0, payCount: 0, firstDate: tx.date, lastDate: tx.date };

     if (isKRW) {
        krwTotal += amt; monthlyKrw[month] += amt; symTotals[sym].krw += amt;
    } else {
        const txFx = getHistoricalFxRate(tx.date);
        usdTotal += amt; monthlyUsd[month] += amt; symTotals[sym].usd += amt;
        usdTotalKrw += amt * txFx;
        monthlyUsdKrw[month] = (monthlyUsdKrw[month] || 0) + (amt * txFx);
        symTotals[sym].usdKrw = (symTotals[sym].usdKrw || 0) + (amt * txFx);
    }
     
     divYields[sym].totalDiv += amt;
     divYields[sym].payCount += 1;
     if (tx.date < divYields[sym].firstDate) divYields[sym].firstDate = tx.date;
     if (tx.date > divYields[sym].lastDate)  divYields[sym].lastDate  = tx.date;

     let qtyAtDiv = 0;
     let filterName = 'all';
     if(currentDivFilter === 'user1') filterName = state.owners.user1.name;
     if(currentDivFilter === 'user2') filterName = state.owners.user2.name;

     state.transactions.forEach(t => {
         if (t.symbol === sym && t.txType !== 'dividend' && t.date <= tx.date) {
             if (filterName === 'all' || t.owner === filterName) qtyAtDiv += t.qty;
         }
     });
     
     let priceAtDiv = 0;
     if (cachedMarketData[sym] && !cachedMarketData[sym]._failed && cachedMarketData[sym].rawDates) {
         let pIdx = cachedMarketData[sym].rawDates.indexOf(tx.date);
         if (pIdx !== -1 && cachedMarketData[sym].prices[pIdx] !== null) priceAtDiv = cachedMarketData[sym].prices[pIdx];
         else {
             for (let k = cachedMarketData[sym].rawDates.length - 1; k >= 0; k--) {
                 if (cachedMarketData[sym].rawDates[k] <= tx.date && cachedMarketData[sym].prices[k] !== null) { priceAtDiv = cachedMarketData[sym].prices[k]; break; }
             }
         }
     }
     divYields[sym].totalEvalAtDiv += (qtyAtDiv * priceAtDiv);
  });

  document.getElementById('divTotalKrw').textContent = `₩ ${Math.round(krwTotal).toLocaleString()}`;
  document.getElementById('divTotalUsd').textContent = `$ ${usdTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

  // 배당 비율바 + 환산액
  const divKrwNum = krwTotal;
  const divUsdKrwNum = usdTotalKrw;
  const divGrand = divKrwNum + divUsdKrwNum;
  const divKrPct = divGrand > 0 ? Math.round(divKrwNum / divGrand * 100) : 50;
  const divUsPct = 100 - divKrPct;
  const rKr = document.getElementById('divRatioKr');
  const rPKr = document.getElementById('divRatioPctKr');
  const rPUs = document.getElementById('divRatioPctUs');
  const rConv = document.getElementById('divTotalUsdConverted');
  if (rKr) rKr.style.width = divKrPct + '%';
  if (rPKr) rPKr.textContent = `🇰🇷 ${divKrPct}%`;
  if (rPUs) rPUs.textContent = `${divUsPct}% 🇺🇸`;
  if (rConv) rConv.textContent = usdTotal > 0 ? `≈ ₩${Math.round(divUsdKrwNum).toLocaleString()}` : '';
    
  const grandTotal = krwTotal + usdTotalKrw;
  document.getElementById('divTotalConverted').textContent = `₩ ${Math.round(grandTotal).toLocaleString()}`;

  // 🌟 배당 리스트 정렬 기준 적용 (배당률 순 vs 배당금 순)
  let symArr = Object.keys(symTotals).map(sym => {
    let yData = divYields[sym];
    let yPct = 0;
    if (yData && yData.totalEvalAtDiv > 0 && yData.payCount > 0) {
        const avgEval = yData.totalEvalAtDiv / yData.payCount; // 지급 횟수로 나눠 평균 평가금액 산출
        const periodDays = Math.max(1, (new Date(yData.lastDate) - new Date(yData.firstDate)) / 86400000);
        const annualFactor = yData.payCount === 1 ? 1 : (365 / periodDays); // 지급이 1회면 그대로, 복수면 연환산
        yPct = (yData.totalDiv / avgEval) * annualFactor * 100;
    }
    return { 
        symbol: sym, 
        total: symTotals[sym].krw + (symTotals[sym].usdKrw || 0),
        yieldPct: yPct 
    };
  });
  
  const divSortFns = {
      yieldDesc: (a, b) => b.yieldPct - a.yieldPct,
      yieldAsc:  (a, b) => a.yieldPct - b.yieldPct,
      totalDesc: (a, b) => b.total    - a.total,
      totalAsc:  (a, b) => a.total    - b.total,
  };
 
  // 🌟 정렬 탭 UI — divStockList 바로 위에 동적 삽입
  const _sortTabBar = document.getElementById('divSortTabBar');
  if (_sortTabBar) {
      const _tb = (val, label, icon) => {
          const isActive = currentDivSort === val;
          return `<button
              onclick="setDivSort('${val}')"
              style="
                  padding: 7px 13px;
                  font-size: 12px;
                  font-weight: ${isActive ? '700' : '500'};
                  border-radius: 6px;
                  border: 1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};
                  background: ${isActive ? 'var(--accent-bg)' : 'transparent'};
                  color: ${isActive ? 'var(--accent)' : 'var(--text3)'};
                  cursor: pointer;
                  font-family: var(--font-sans);
                  transition: 0.15s;
                  white-space: nowrap;
                  display: flex; align-items: center; gap: 5px;
              "
              onmouseover="if('${val}'!=='${currentDivSort}') { this.style.background='rgba(255,255,255,0.04)'; this.style.color='var(--text)'; }"
              onmouseout="if('${val}'!=='${currentDivSort}') { this.style.background='transparent'; this.style.color='var(--text3)'; }"
          >${icon} ${label}</button>`;
      };
 
      const divRankingTab = currentDivSort.startsWith('yield') ? 'yield' : 'total';

      const tabBtn = (tab, label) => {
          const isActive = divRankingTab === tab;
          return `<button onclick="currentDivSort='${tab}${divRankingSortDir==='desc'?'Desc':'Asc'}'; renderDividendDashboard();"
              style="flex:1; padding:9px 6px; font-size:13px; font-weight:700; border:none;
                     background:transparent; color:${isActive?'#00C578':'var(--text3)'};
                     cursor:pointer; border-bottom:2px solid ${isActive?'#00C578':'transparent'};
                     transition:0.2s; font-family:var(--font-sans);">
              ${label}
          </button>`;
      };
      
      _sortTabBar.innerHTML = `
      <div style="display:flex; border-bottom:1px solid var(--border); flex-shrink:0; align-items:stretch;">
        ${tabBtn('yield', '📊 배당률')}
        ${tabBtn('total', '💰 배당금')}
        <div style="margin-left:auto; display:flex; align-items:center; padding:0 8px; gap:4px; border-left:1px solid var(--border);">
          <button onclick="setDivRankingSortDir('desc')"
            style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${divRankingSortDir==='desc'?'var(--accent)':'var(--border)'}; background:${divRankingSortDir==='desc'?'var(--accent-bg)':'transparent'}; color:${divRankingSortDir==='desc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; line-height:1;">↓</button>
          <button onclick="setDivRankingSortDir('asc')"
            style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${divRankingSortDir==='asc'?'var(--accent)':'var(--border)'}; background:${divRankingSortDir==='asc'?'var(--accent-bg)':'transparent'}; color:${divRankingSortDir==='asc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; line-height:1;">↑</button>
        </div>
      </div>`;
      
      // 정렬 방향 반영
      const sortKey = divRankingTab === 'yield' ? 'yieldPct' : 'total';
      symArr.sort((a, b) => divRankingSortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]);
    }
  
    let listHtml = symArr.map(item => {
    const isKRW = isKorean(item.symbol);
    const originAmt = isKRW ? symTotals[item.symbol].krw : symTotals[item.symbol].usd;
    
    let cName = item.symbol;
    if (localStockDB && localStockDB.length > 0) {
        let dbMatch = localStockDB.find(s => s.symbol === item.symbol);
        if (dbMatch) cName = dbMatch.name;
    }
    if (cachedMarketData[item.symbol] && !cachedMarketData[item.symbol]._failed && cachedMarketData[item.symbol].name) {
        cName = cachedMarketData[item.symbol].name;
    }

    let yieldHtml = '';
    let yData = divYields[item.symbol];
    if (yData && yData.totalEvalAtDiv > 0) {
        let yPct = (yData.totalDiv / yData.totalEvalAtDiv) * 100;
        yieldHtml = `<span style="font-size:11px; color:var(--text2); margin-right:12px; border:1px solid var(--border2); padding:2px 6px; border-radius:4px;">실질 배당률 ${yPct.toFixed(2)}%</span>`;
    }

    return `
      <div class="div-item">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:700; color:var(--text); font-size:13px; max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${cName}">${cName}</span>
          <span style="font-family:var(--font-mono); font-size:10px; color:var(--text3);">${item.symbol}</span>
        </div>
        <div style="display:flex; align-items:center;">
          ${yieldHtml}
          <div style="font-family:var(--font-mono); font-weight:700; color:var(--green); font-size:14px; text-align:right;">
            ${formatPrice(originAmt, item.symbol)}
          </div>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('divStockList').innerHTML = listHtml || '<div style="color:var(--text3); font-size:12px; text-align:center; padding:40px;">조회된 배당 내역이 없습니다.</div>';

  const allMonths = Array.from(new Set([...Object.keys(monthlyKrw), ...Object.keys(monthlyUsd)])).sort();
  const krwData = allMonths.map(m => monthlyKrw[m] || 0);
  const usdConvertedData = allMonths.map(m => monthlyUsdKrw[m] || 0);

  if(divMonthlyChartInst) { divMonthlyChartInst.destroy(); divMonthlyChartInst = null; }
  const ctx = document.getElementById('divMonthlyCanvas').getContext('2d');
  divMonthlyChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: allMonths,
      datasets: [
        { label: '국내 (₩)', data: krwData, backgroundColor: '#00c87a', borderRadius: 4 },
        { label: '해외 환산 (₩)', data: usdConvertedData, backgroundColor: '#7c6af7', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { color: '#8890a4', font: {size:11} } }, tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => ' ₩' + Math.round(ctx.raw).toLocaleString() } } },
      scales: { x: { stacked: true, ticks: { color: '#8890a4' }, grid: { display: false } }, y: { stacked: true, ticks: { color: '#8890a4' }, grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } } }
    }
  });
  window._lastDivTxs = divTxs;
  renderDivHistoryTable(divTxs);
  renderUpcomingDividends();
}

// 🌟 종목 카드 모달 관련 로직 (개별 기간 조정 기능 추가)
let currentModalTicker = '';
let currentModalRange = state.range; // 처음 켤 때는 메인 대시보드 설정을 따라감

function openChartModal(ticker) {
  currentModalTicker = ticker;
  currentModalRange = state.range; // 모달을 새로 열 때마다 메인 설정으로 초기화
  
  // 버튼 UI 초기화
  document.querySelectorAll('.m-rtab').forEach(b => {
      b.classList.remove('active');
      if (b.textContent.toLowerCase() === currentModalRange.toLowerCase()) {
          b.classList.add('active');
      }
  });
  
  renderModalChart();
  document.getElementById('chartOverlay').classList.add('open');
}

function setModalRange(range, el) {
  currentModalRange = range;
  document.querySelectorAll('.m-rtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderModalChart();
}

function renderModalChart() {
  if (!currentModalTicker) return;
  const data = cachedMarketData[currentModalTicker]; 
  if(!data || data._failed) return;
  
  const getSliceLen = (range) => {
    if (range === '1d') return 2; if (range === '1w') return 6; if (range === '1m') return 22;
    if (range === '3m') return 63; if (range === '6m') return 126; if (range === '1y') return 252;
    if (range === '3y') return 756; if (range === '5y') return 1260; if (range === '10y') return 2520; 
    if (range === 'all') return 99999;
    return 252;
  };
  let sliceLen = getSliceLen(currentModalRange);
  
  const displayPrices = data.prices.slice(-sliceLen);
  const displayDates = data.dates.slice(-sliceLen); 
  if(displayPrices.length === 0) return;
  
  const hi = Math.max(...displayPrices), lo = Math.min(...displayPrices);
  const last = displayPrices[displayPrices.length-1];
  const prev = displayPrices[0]; 
  const chgPct = ((last-prev)/prev*100).toFixed(2);
  
  document.getElementById('mTicker').textContent = data.name;
  document.getElementById('mBroker').textContent = data.symbol;
  document.getElementById('mPrice').textContent = formatPrice(last, currentModalTicker);
  
  const chgEl = document.getElementById('mChange');
  chgEl.textContent = `${chgPct > 0 ? '+':''}${formatPrice(last-prev, currentModalTicker)} (${chgPct > 0 ? '+':''}${chgPct}%)`;
  chgEl.style.backgroundColor = chgPct > 0 ? 'var(--profit-bg)' : 'var(--loss-bg)';
  chgEl.style.color = chgPct > 0 ? '#00C578' : '#3A9AFF';
  document.getElementById('mMeta').textContent = `해당 기간 내 최고 ${formatPrice(hi, currentModalTicker)} · 최저 ${formatPrice(lo, currentModalTicker)}`;
  
  if (modalChartInst) { modalChartInst.destroy(); modalChartInst = null; }
  const _modalOwnerFilter = currentView === 'user1' ? state.owners.user1.name
                          : currentView === 'user2' ? state.owners.user2.name
                          : 'all'; // watch, all 등 나머지는 전체 표시
  setTimeout(() => { modalChartInst = buildChart('modalCanvas', displayPrices, displayDates, false, currentModalTicker, _modalOwnerFilter); }, 50);

  // 🌟 매매기록 요약 + What if 계산
  const sym = currentModalTicker;
  const txs = state.transactions.filter(t => t.symbol === sym && t.txType !== 'dividend' && t.txType !== 'transfer');
  const statsEl = document.getElementById('mTradeStats');

  if (txs.length === 0) {
    statsEl.style.display = 'none';
  } else {
    statsEl.style.display = 'block';

    // 공통 헬퍼
    const isKrStock = isKorean(sym);
    const currentPrice = data.prices[data.prices.length - 1];
    const fmt = v => isKrStock
      ? '₩' + Math.round(Math.abs(v)).toLocaleString()
      : '$' + Math.abs(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    const profitColor = v => v >= 0 ? '#00C578' : '#3A9AFF';

    // ── 매매 요약 (실현수익 페이지와 동일한 평단가 추적 방식) ──
    let totalBuy = 0, totalSell = 0, netProfit = 0;
    let totalBuyQty = 0, totalSellQty = 0; // 🌟 수량 추적 추가
    let _holdings = {};
    [...txs].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
        const broker = t.broker ? t.broker.trim() : '미지정';
        const key = `${t.symbol}::${broker}`;
        if (!_holdings[key]) _holdings[key] = { qty: 0, avg: 0 };
        const h = _holdings[key];
        if (t.qty > 0) {
            totalBuy += t.qty * t.price;
            totalBuyQty += t.qty; // 🌟
            const totalValue = (h.qty * h.avg) + (t.qty * t.price);
            h.qty += t.qty;
            h.avg = totalValue / h.qty;
        } else if (t.qty < 0) {
            const sellQty = Math.abs(t.qty);
            totalSell += sellQty * t.price;
            totalSellQty += sellQty; // 🌟
            netProfit += (t.price - h.avg) * sellQty;
            h.qty -= sellQty;
            if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
        }
    });

    const avgBuy  = totalBuyQty  > 0 ? totalBuy  / totalBuyQty  : 0;
    const avgSell = totalSellQty > 0 ? totalSell / totalSellQty : 0;

    document.getElementById('mTotalBuy').textContent  = fmt(totalBuy);
    document.getElementById('mTotalSell').textContent = fmt(totalSell);
    document.getElementById('mAvgBuy').textContent  = totalBuyQty  > 0 ? `평균 ${fmt(avgBuy)}`  : '';
    document.getElementById('mAvgSell').textContent = totalSellQty > 0 ? `평균 ${fmt(avgSell)}` : '';
    const netEl = document.getElementById('mNetProfit');
    netEl.textContent = (netProfit >= 0 ? '+' : '-') + fmt(netProfit);
    netEl.style.color = profitColor(netProfit);
    // ── 현재 보유 잔량 평가금 ──
    const allHoldings = calculateHoldings();
    const symHoldings = Object.values(allHoldings).filter(h => h.symbol === sym && h.qty > 0);
    const holdingQty = symHoldings.reduce((s, h) => s + h.qty, 0);
    const holdingCost = symHoldings.reduce((s, h) => s + h.qty * h.avg, 0);
    const holdingBox = document.getElementById('mHoldingBox');
    if (holdingQty > 0) {
      const holdingValue = holdingQty * currentPrice;
      const holdingPnl = holdingValue - holdingCost;
      const holdingRoi = holdingCost > 0 ? (holdingPnl / holdingCost) * 100 : 0;
      holdingBox.style.display = 'block';
      document.getElementById('mHoldingQty').textContent = `${holdingQty}주 보유`;
      document.getElementById('mHoldingValue').textContent = fmt(holdingValue);
      const holdingPnlEl = document.getElementById('mHoldingPnl');
      holdingPnlEl.textContent = `${holdingPnl >= 0 ? '+' : '-'}${fmt(holdingPnl)} (${holdingRoi >= 0 ? '+' : ''}${holdingRoi.toFixed(2)}%)`;
      holdingPnlEl.style.color = profitColor(holdingPnl);
    } else {
      holdingBox.style.display = 'none';
    }

    // ── What if 계산 ──
    let totalQtyBought = 0, totalCost = 0;
    txs.filter(t => t.qty > 0).forEach(t => {
      totalQtyBought += t.qty;
      totalCost += t.qty * t.price;
    });
    const wiValue = totalQtyBought * currentPrice;
    const wiProfit = wiValue - totalCost;
    const wiRoi = totalCost > 0 ? (wiProfit / totalCost) * 100 : 0;

    document.getElementById('mWiCost').textContent = fmt(totalCost);
    document.getElementById('mWiValue').textContent = fmt(wiValue);
    const wiProfitEl = document.getElementById('mWiProfit');
    wiProfitEl.textContent = (wiProfit >= 0 ? '+' : '-') + fmt(wiProfit);
    wiProfitEl.style.color = profitColor(wiProfit);
    const wiRoiEl = document.getElementById('mWiRoi');
    wiRoiEl.textContent = (wiRoi >= 0 ? '+' : '') + wiRoi.toFixed(2) + '%';
    wiRoiEl.style.color = profitColor(wiRoi);
  }
}

// 🌟 5Y/10Y 버튼 준비 상태 업데이트
function updateRangeButtonReadiness() {
    const allSymbols = Object.keys(cachedMarketData).filter(s => cachedMarketData[s] && !cachedMarketData[s]._failed);
    if (allSymbols.length === 0) return;

    const minLevel = Math.min(...allSymbols.map(s => cachedMarketData[s]._rangeLevel || 0));

    const btn5y  = document.getElementById('rtab-5y');
    const btn10y = document.getElementById('rtab-10y');

    if (btn5y) {
        const ready = minLevel >= 3;
        btn5y.style.opacity    = ready ? '1'       : '0.35';
        btn5y.style.cursor     = ready ? 'pointer' : 'not-allowed';
        btn5y.title            = ready ? ''        : '5년치 데이터 로딩 중...';
        btn5y.style.transition = 'opacity 0.4s';
    }
    if (btn10y) {
        const ready = minLevel >= 4;
        btn10y.style.opacity    = ready ? '1'       : '0.35';
        btn10y.style.cursor     = ready ? 'pointer' : 'not-allowed';
        btn10y.title            = ready ? ''        : '10년치 데이터 로딩 중...';
        btn10y.style.transition = 'opacity 0.4s';
    }
}
// 🌟 화면 멈춤 없이 백그라운드에서 데이터를 몰래 가져오는 함수
let isFetchingMarketData = false;
async function fetchMissingMarketData(symbolsToFetch) {
    if(isFetchingMarketData || !symbolsToFetch || symbolsToFetch.length === 0) return;
    isFetchingMarketData = true;

    // 🌟 Phase 1 시작 시 5Y/10Y 버튼 즉시 흐리게
    updateRangeButtonReadiness();
    
    // 🌟 장부에 한 번이라도 기록된 종목(보유/매도)을 1순위로 끌어올리기
    const transactedSymbols = new Set(state.transactions.map(tx => tx.symbol));
    symbolsToFetch.sort((a, b) => {
        const aOwned = transactedSymbols.has(a) ? 1 : 0;
        const bOwned = transactedSymbols.has(b) ? 1 : 0;
        return bOwned - aOwned; // 1(내 종목)이 0(단순 관심종목)보다 무조건 먼저 오게 정렬
    });
    const batchSize = 3;
    
    // 우측 하단에 조그맣게 '로딩 중' 알림 띄우기
    let loadingEl = document.getElementById('bgLoadingIndicator');
    if(!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'bgLoadingIndicator';
        loadingEl.style.cssText = "position:fixed; bottom:20px; right:20px; background:var(--accent); color:#fff; padding:10px 16px; border-radius:20px; font-size:12px; font-weight:bold; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition: 0.3s; opacity: 1;";
        document.body.appendChild(loadingEl);
    }
    loadingEl.style.opacity = '1';

    for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
        if(loadingEl) loadingEl.innerHTML = `🔄 실시간 데이터 쾌속 로딩 중... (${Math.min(i + batchSize, symbolsToFetch.length)}/${symbolsToFetch.length})`;
        const batch = symbolsToFetch.slice(i, i + batchSize);
        await Promise.all(batch.map(async t => {
            let fetchSym = /^\d{6}$/.test(t) ? t + '.KS' : t;
            let fetchedData = await fetchYahooData(fetchSym);
            if (fetchedData && !fetchedData._failed) cachedMarketData[t] = fetchedData;
            else cachedMarketData[t] = { _failed: true };
        }));
        
        render();
        
        if (i + batchSize < symbolsToFetch.length) {
            await new Promise(res => setTimeout(res, 100)); 
        }
    }
    
    isFetchingMarketData = false;
    if(loadingEl) loadingEl.style.opacity = '0';

    // 🌟 10년치를 한 번에 받으므로 모든 버튼 즉시 활성화
    const btn5y  = document.getElementById('rtab-5y');
    const btn10y = document.getElementById('rtab-10y');
    if (btn5y)  { btn5y.style.opacity  = '1'; btn5y.style.cursor  = 'pointer'; btn5y.title  = ''; }
    if (btn10y) { btn10y.style.opacity = '1'; btn10y.style.cursor = 'pointer'; btn10y.title = ''; }

    try { 
        localStorage.setItem('sw_market_cache', JSON.stringify(cachedMarketData)); 
        localStorage.setItem('sw_market_cache_time', Date.now().toString());
    } catch(e){}
}

async function fetchExtendedMarketData(yahooRange, rangeLevel) {
    // rangeLevel: 2=3y완료, 3=5y완료, 4=10y완료
    const nextPhase = {
        2: () => fetchExtendedMarketData('5y',  3),
        3: () => fetchExtendedMarketData('10y', 4),
        4: () => {}  // 마지막 단계
    };
    const label = { 2: '3년', 3: '5년', 4: '10년' }[rangeLevel] || '';

    const allSymbols = Object.keys(cachedMarketData).filter(sym =>
        cachedMarketData[sym] &&
        !cachedMarketData[sym]._failed &&
        (cachedMarketData[sym]._rangeLevel || 0) < rangeLevel
    );
    if (allSymbols.length === 0) {
        nextPhase[rangeLevel]?.();
        return;
    }

    const batchSize = 2; // 백그라운드라 배치 작게
    let loadingEl = document.getElementById('bgLoadingIndicator');
    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'bgLoadingIndicator';
        loadingEl.style.cssText = "position:fixed; bottom:20px; right:20px; background:var(--accent); color:#fff; padding:10px 16px; border-radius:20px; font-size:12px; font-weight:bold; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:0.3s; opacity:1;";
        document.body.appendChild(loadingEl);
    }
    loadingEl.style.opacity = '1';

    for (let i = 0; i < allSymbols.length; i += batchSize) {
        const batch = allSymbols.slice(i, i + batchSize);

        // 🌟 현재 로딩 중인 종목명 표시
        const batchNames = batch.map(s => {
            const d = cachedMarketData[s];
            return (d && d.name) ? d.name : s;
        }).join(', ');
        loadingEl.innerHTML = `📊 ${label}치 로딩 중 (${Math.min(i + batchSize, allSymbols.length)}/${allSymbols.length})<br><span style="font-size:10px; opacity:0.8;">${batchNames}</span>`;

        await Promise.all(batch.map(async sym => {
            const fetchSym = /^\d{6}$/.test(sym) ? sym + '.KS' : sym;
            const data = await fetchYahooData(fetchSym, yahooRange);
            if (data && !data._failed) {
                cachedMarketData[sym] = { ...data, name: cachedMarketData[sym]?.name || data.name };
            }
        }));

        updateRangeButtonReadiness(); // 🌟 배치마다 버튼 상태 갱신
        render();
        await new Promise(res => setTimeout(res, 500));
    }

    // 🌟 완료 메시지 잠깐 표시 후 숨김
    loadingEl.innerHTML = `✅ ${label}치 데이터 준비 완료!`;
    await new Promise(res => setTimeout(res, 1200));
    loadingEl.style.opacity = '0';

    try {
        localStorage.setItem('sw_market_cache', JSON.stringify(cachedMarketData));
        localStorage.setItem('sw_market_cache_time', Date.now().toString());
    } catch(e) {}

    nextPhase[rangeLevel]?.();
}

// ── 8. 메인 렌더 함수 (전체 흐름 제어) ──
async function render() {
  if (!isExchangeRateFetched) await fetchExchangeRate();
  
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rtab').forEach(b => {
    const btnRange = b.id ? b.id.replace('rtab-', '') : '';
    if (btnRange === state.range) b.classList.add('active');
  });

  const container = document.getElementById('gridContainer');
  const dash = document.getElementById('dashboardTopWrapper');
  const pChartRowWrap = document.getElementById('chartRowWrapper'); 
  const divDash = document.getElementById('dividendDashboard');
  const listOptions = document.getElementById('listOptionsBar');
  const watchlistSearch = document.getElementById('watchlistSearchGroup');
  const mobileSearch = document.getElementById('mobileSearchBar');
  const histDash = document.getElementById('historyDashboard');
  const realDash = document.getElementById('realizedDashboard');
  const msBar = document.getElementById('marketSignalBar');
  
  if (currentView === 'dividend') {
    if (msBar) msBar.style.display = 'none';
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    divDash.style.display = 'flex';
    renderDividendDashboard();
    return;
  } else if (currentView === 'history') {
    if (msBar) msBar.style.display = 'none';
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; divDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    histDash.style.display = 'flex';
    renderHistoryDashboard();
    return;
  } else if (currentView === 'realized') {
    if (msBar) msBar.style.display = 'none';
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; container.style.display = 'none'; 
    listOptions.style.display = 'none'; divDash.style.display = 'none'; histDash.style.display = 'none'; 
    
    // 실현수익 페이지 진입 시 다른 탭의 잔여 클래스 간섭을 완전히 제거 및 청소
    if (listOptions) listOptions.classList.remove('non-sticky'); 
    
    if(realDash) realDash.style.display = 'flex';
    renderRealizedDashboard();
    return;
  } else if (currentView === 'watch') {
    if (msBar) msBar.style.display = 'none';
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; 
    container.style.display = 'block'; listOptions.style.display = 'flex'; 
    divDash.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    if(watchlistSearch) watchlistSearch.style.display = 'flex';
    updateViewHeader('⭐', '관심종목');
    const _lob = document.getElementById('listOptionsBar');
    if (_lob) _lob.classList.add('non-sticky');
  } else {
    // 🌟 전체보기, 소유자별 탭 (메인 대시보드)
    if(msBar && msBar.getAttribute('data-loaded') && currentView === 'all') msBar.style.display = 'flex';
    else if(msBar) msBar.style.display = 'none';
    dash.style.display = 'flex';
    pChartRowWrap.style.display = 'flex'; container.style.display = 'block'; listOptions.style.display = 'flex'; divDash.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    if(watchlistSearch) watchlistSearch.style.display = 'none';
    updateViewHeader();
    const _lob = document.getElementById('listOptionsBar');
    if (_lob) _lob.classList.remove('non-sticky');
  }

  let ownerFilter = 'all';
  if (currentView === 'user1') ownerFilter = state.owners.user1.name;
  if (currentView === 'user2') ownerFilter = state.owners.user2.name;

  const currentHoldings = calculateHoldings(ownerFilter);
  
  let symbolHoldings = {};
  for(let key in currentHoldings) {
    if(!currentHoldings.hasOwnProperty(key)) continue;
    let h = currentHoldings[key];
    if(h.qty > 0) {
      if(!symbolHoldings[h.symbol]) {
        symbolHoldings[h.symbol] = { qty: 0, totalCost: 0, brokers: new Set() };
      }
      symbolHoldings[h.symbol].qty += h.qty;
      symbolHoldings[h.symbol].totalCost += (h.qty * h.avg);
      symbolHoldings[h.symbol].brokers.add(h.broker);
    }
  }

  const getSliceLen = (range) => {
    if (range === '1d') return 2; if (range === '1w') return 6; if (range === '1m') return 22;
    if (range === '3m') return 63; if (range === '6m') return 126; if (range === '1y') return 252;
    if (range === '3y') return 756; if (range === '5y') return 1260; if (range === '10y') return 2520; 
    if (range === 'all') return 99999; // 🌟 전체 기간일 때 데이터가 잘리지 않도록 매우 큰 값 반환
    return 252;
  };
  const currentSliceLen = getSliceLen(state.range);

  if (state.tickers.length === 0 && Object.keys(symbolHoldings).length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">📈</div><p>상단 검색창에서 관심종목을 추가하거나,<br>좌측에서 거래 내역을 입력하세요.</p></div>`;
    updateSummaryAndAllocation(currentHoldings, []); 
    renderPortfolioChart(ownerFilter, currentSliceLen);
    renderSidebarYieldList(currentHoldings); 
    return;
  }

  let allSymbols = new Set();
  
  // 🌟 [수정됨] 수량이 0이더라도 (전량 매도) 차트 데이터를 가져오도록 allSymbols에 추가합니다.
  for(let sym in symbolHoldings) {
      allSymbols.add(sym); 
  }
  
  state.tickers.forEach(sym => {
      allSymbols.add(sym);
  });

  allSymbols = Array.from(allSymbols);

  let symbolsToFetch = allSymbols.filter(t => !cachedMarketData[t]);
  // 🌟 [핵심] 화면을 멈추게 했던 옛날 로딩 방식을 지우고 백그라운드 호출로 바꿈
  if (symbolsToFetch.length > 0) {
    fetchMissingMarketData(symbolsToFetch); // 뒤에서 몰래 가져오라고 시키고 바로 다음 줄로 넘어감
  }
  
  let displayItems = [];
  for(let sym in symbolHoldings) {
    let sh = symbolHoldings[sym];
    let avg = sh.qty > 0 ? sh.totalCost / sh.qty : 0;
    let brokerStr = Array.from(sh.brokers).join(', ');
    
    // 🌟 [수정됨] 보유 수량이 0(전량 매도)이면 'watch'(관심종목) 타입으로 강제 전환하여 표시
    let displayType = sh.qty > 0 ? 'held' : 'watch';
    
    if (cachedMarketData[sym] && !cachedMarketData[sym]._failed) {
      displayItems.push({ type: displayType, symbol: sym, broker: brokerStr, qty: sh.qty, avg: avg, data: cachedMarketData[sym] });
    } else {
      let fallbackName = sym;
      if (localStockDB && localStockDB.length > 0) {
          let match = localStockDB.find(s => s.symbol === sym);
          if (match) fallbackName = match.name;
      }
      displayItems.push({ 
        type: displayType, symbol: sym, broker: brokerStr, qty: sh.qty, avg: avg, 
        data: { name: fallbackName, last: avg, prices: [avg, avg], dates: ['-','-'] }, 
        _isFallback: true 
      });
    }
  }

  // 🌟 수량이 0이 되어 watch로 들어간 종목도 이미 리스트에 있으므로,
  // 관심종목 탭에서 중복해서 또 추가하지 않도록 heldSymbols에 모든 리스트의 심볼을 담습니다.
  let heldSymbols = new Set(displayItems.map(item => item.symbol));
  state.tickers.forEach(sym => {
    if(!heldSymbols.has(sym) && cachedMarketData[sym] && !cachedMarketData[sym]._failed) {
      displayItems.push({ type: 'watch', symbol: sym, broker: '', qty: 0, avg: 0, data: cachedMarketData[sym] });
    }
  });

  displayItems = displayItems.filter(item => {
    if(currentView === 'all') return item.type === 'held';
    if(currentView === 'user1' || currentView === 'user2') return item.type === 'held';
    if(currentView === 'watch') return item.type === 'watch';
    return true; 
  });

  // 🌟 1. 현재 화면에 있는 종목들의 태그만 모아서 예쁜 버튼으로 만들기 (쉼표 분리 기능 추가!)
  const tagContainer = document.getElementById('localTagFilterContainer');
  if (tagContainer) {
      let uniqueTags = new Set();
      displayItems.forEach(item => {
          if (state.tags && state.tags[item.symbol]) {
              // 💡 쉼표로 쪼갠 뒤 빈칸 없애고, 빈 태그가 아니면 Set에 담기
              const tagsArray = state.tags[item.symbol].split(',').map(t => t.trim()).filter(t => t !== '');
              tagsArray.forEach(tag => uniqueTags.add(tag));
          }
      });
      
      if (uniqueTags.size === 0) {
          tagContainer.style.display = 'none';
      } else {
          tagContainer.style.display = 'flex';
          let tagsHtml = `<button class="vtab ${currentLocalTag === 'all' ? 'active' : ''}" onclick="setLocalTag('all')" style="padding:4px 10px; font-size:11px;">🏷️ 전체보기</button>`;
          Array.from(uniqueTags).sort().forEach(tag => {
              tagsHtml += `<button class="vtab ${currentLocalTag === tag ? 'active' : ''}" onclick="setLocalTag('${tag}')" style="padding:4px 10px; font-size:11px;">${tag}</button>`;
          });
          tagContainer.innerHTML = tagsHtml;
      }
  }

  // 🌟 2. 클릭한 태그와 입력한 검색어로 리스트를 깔끔하게 걸러내기 (쉼표 분리 검색 반영!)
  displayItems = displayItems.filter(item => {
      // 태그 필터
      if (currentLocalTag !== 'all') {
          const itemTagString = (state.tags && state.tags[item.symbol]) ? state.tags[item.symbol] : '';
          // 💡 해당 종목의 태그를 쪼개서 배열로 만든 뒤, 클릭한 태그가 그 배열 안에 있는지 확인
          const itemTagsArray = itemTagString.split(',').map(t => t.trim());
          if (!itemTagsArray.includes(currentLocalTag)) return false;
      }
      
      // 검색어 필터
      if (currentLocalSearch) {
          const sText = currentLocalSearch.toLowerCase().trim();
          const stockName = (item.data && item.data.name) ? item.data.name.toLowerCase() : '';
          const symbolStr = item.symbol.toLowerCase();
          if (!stockName.includes(sText) && !symbolStr.includes(sText)) return false;
      }
      return true;
  });
  
  displayItems.forEach(item => {
    item.uniqueId = 'chart_' + Math.random().toString(36).substring(2, 10);
    if(item.data && item.data.prices && item.data.prices.length > 0) {
      const prices = item.data.prices;
      const last = item.data.last;
      item.sliceLen = currentSliceLen; 
      
      // 🌟 '전체' 기간이면 전체 데이터를 사용하고, 아니면 기간만큼 자름
      const actualSlice = state.range === 'all' ? prices.length : Math.min(prices.length, currentSliceLen);
      let pStart = prices[prices.length - actualSlice] || item.data.prev || last;
      
      item.activeChange = pStart > 0 ? ((last - pStart) / pStart) * 100 : 0;
      if(isNaN(item.activeChange)) item.activeChange = 0;
      
      item.evalAmt = item.qty * last;
      // 🌟 평단가가 아닌 "기간 시작 시점의 가격"을 투자 원금으로 간주하여 기간 수익률 산출
      item.costAmt = state.range === 'all' ? (item.qty * item.avg) : (item.qty * pStart); 
      item.roi = item.costAmt > 0 ? ((item.evalAmt - item.costAmt)/item.costAmt*100) : -9999;
    } else {
      item.activeChange = 0; item.evalAmt = 0; item.costAmt = 0; item.roi = -9999; item.sliceLen = 0;
    }
  });

  updateSummaryAndAllocation(currentHoldings, displayItems);
  renderPortfolioChart(ownerFilter, currentSliceLen);
  renderTodayStocksPanel(displayItems);
  renderSidebarYieldList(currentHoldings);

  if (activeAccountFilter) {
    displayItems = displayItems.filter(item => item.type === 'held' && item.broker.includes(activeAccountFilter));
  }

  if(currentSortMode === 'roiDesc') displayItems.sort((a,b) => (b.roi - a.roi) * sortDirection);
  else if(currentSortMode === 'evalDesc') displayItems.sort((a,b) => (b.evalAmt - a.evalAmt) * sortDirection);
  else if(currentSortMode === 'changeDesc') displayItems.sort((a,b) => (b.activeChange - a.activeChange) * sortDirection);

  Object.values(chartInstances).forEach(c => { if(c && typeof c.destroy === 'function') c.destroy(); });
  for(let key in chartInstances) delete chartInstances[key];
  
  if(displayItems.length === 0) {
     if(activeAccountFilter) container.innerHTML = `<div class="empty">해당 계좌에 표시할 종목이 없습니다.</div>`;
     else container.innerHTML = `<div class="empty">선택한 탭에 표시할 종목이 없습니다.</div>`;
     return;
  }

  const krItems = displayItems.filter(item => isKorean(item.symbol));
  const usItems = displayItems.filter(item => !isKorean(item.symbol) && !isCrypto(item.symbol));
  const cryptoItems = displayItems.filter(item => isCrypto(item.symbol));

  // 🌟 현재 스타일에 따라 카드형 또는 목록형 렌더링 방식 선택
  let renderItemHtml = currentListStyle === 'card' ? generateCardHtml : generateListItemHtml;
  let layoutClass = currentListStyle === 'card' ? 'grid' : 'list-layout';

  let html = '';
  
  // 🌟 [변경] 좌우 배치 모드일 경우 (화면이 좁으면 알아서 상하로 떨어집니다)
  if (currentRegionLayout === 'horizontal') {
      html += `<div style="display:flex; gap:24px; flex-wrap:wrap;">`;
      
      // 한국 주식 구역
      if(krItems.length > 0) {
          html += `<div style="flex:1; min-width:320px;">`;
          html += `<h3 style="margin: 10px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); color: var(--text); font-size: 15px; display:flex; align-items:center; gap:8px;">🇰🇷 국내 주식</h3>`;
          html += `<div class="${layoutClass}">${krItems.map(t => renderItemHtml(t)).join('')}</div>`;
          html += `</div>`;
      }
      
      // 미국 주식 구역
      if(usItems.length > 0) {
          html += `<div style="flex:1; min-width:320px;">`;
          html += `<h3 style="margin: 10px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); color: var(--text); font-size: 15px; display:flex; align-items:center; gap:8px;">🇺🇸 미국 주식</h3>`;
          html += `<div class="${layoutClass}">${usItems.map(t => renderItemHtml(t)).join('')}</div>`;
          html += `</div>`;
      }
      html += `</div>`; // 좌우 배치 구역 끝
      
      // 암호화폐는 보통 하단에 넓게 배치
      if(cryptoItems.length > 0) {
          html += `<h3 style="margin: 30px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); color: var(--text); font-size: 15px; display:flex; align-items:center; gap:8px;">🪙 암호화폐</h3>`;
          html += `<div class="${layoutClass}">${cryptoItems.map(t => renderItemHtml(t)).join('')}</div>`;
      }
      
  } else {
      // 기존 상하(위아래) 배치 모드
      if(krItems.length > 0) {
        html += `<h3 style="margin: 10px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); color: var(--text); font-size: 15px; display:flex; align-items:center; gap:8px;">🇰🇷 국내 주식</h3>`;
        html += `<div class="${layoutClass}">${krItems.map(t => renderItemHtml(t)).join('')}</div>`;
      }
      if(usItems.length > 0) {
        html += `<h3 style="margin: 30px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); color: var(--text); font-size: 15px; display:flex; align-items:center; gap:8px;">🇺🇸 미국 주식</h3>`;
        html += `<div class="${layoutClass}">${usItems.map(t => renderItemHtml(t)).join('')}</div>`;
      }
      if(cryptoItems.length > 0) {
        html += `<h3 style="margin: 30px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); color: var(--text); font-size: 15px; display:flex; align-items:center; gap:8px;">🪙 암호화폐</h3>`;
        html += `<div class="${layoutClass}">${cryptoItems.map(t => renderItemHtml(t)).join('')}</div>`;
      }
  }

  container.innerHTML = html;

  displayItems.forEach(item => {
    // 대체(Fallback) 데이터인 경우 차트를 그리지 않음
    if (item.data && item.data.prices && !item._isFallback) {
      const displayPrices = item.data.prices.slice(-item.sliceLen);
      const displayDates = item.data.dates.slice(-item.sliceLen);
      const _ownerFilter = currentView === 'user1' ? state.owners.user1.name
                         : currentView === 'user2' ? state.owners.user2.name
                         : 'all'; // watch, all 등 나머지는 전체 표시
      chartInstances[item.uniqueId] = buildChart(item.uniqueId, displayPrices, displayDates, true, item.symbol, _ownerFilter);
    }
  });
}

// ==========================================
// 6. CSV 알 수 없는 종목 수동 매핑 모달 로직
// ==========================================
// 🌟 CSV 모달 창 열기 (상장폐지 선택 시 국가 지정 옵션 추가)
function openCsvMappingModal() {
    const container = document.getElementById('unmatchedContainer');
    if(!container) return;

    container.innerHTML = unmatchedSymbols.map((sym, idx) => `
        <div class="form-group" style="background:rgba(255,255,255,0.02); padding:12px; border:1px solid var(--border); border-radius:8px; margin-bottom:10px; position:relative; z-index:${9999 - idx};">
          
          <label style="font-size:13px; color:var(--text); font-weight:bold; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
             <span style="color:var(--accent); font-size:16px;">${sym}</span>
             <a href="https://www.google.com/search?q=${encodeURIComponent(sym + ' 주식 ticker')}" target="_blank" 
                style="text-decoration:none; font-size:11px; background:var(--bg3); border:1px solid var(--border); padding:4px 10px; border-radius:4px; color:var(--text2); transition:0.2s; display:inline-block;" 
                onmouseover="this.style.color='var(--text)'; this.style.borderColor='var(--border2)';" 
                onmouseout="this.style.color='var(--text2)'; this.style.borderColor='var(--border)';" 
                title="새 탭에서 티커 검색하기">
                🔍 구글 검색
             </a>
          </label>
          
          <div style="display: flex; gap: 15px; margin-bottom: 10px; font-size: 12px; color: var(--text2);">
             <label style="cursor:pointer;"><input type="radio" name="status_${idx}" value="rename" checked onchange="document.getElementById('mappingInputArea_${idx}').style.display='flex'; document.getElementById('delistedMarketArea_${idx}').style.display='none';"> 🔄 종목명/티커 변경</label>
             <label style="cursor:pointer;"><input type="radio" name="status_${idx}" value="delisted" onchange="document.getElementById('mappingInputArea_${idx}').style.display='none'; document.getElementById('delistedMarketArea_${idx}').style.display='block';"> ☠️ 상장폐지</label>
          </div>

          <div id="delistedMarketArea_${idx}" style="display:none; margin-bottom:10px; font-size:12px; color:var(--text); background:var(--bg3); padding:10px; border-radius:6px; border:1px solid var(--border2);">
             <div style="margin-bottom:8px; font-weight:bold; color:var(--text2);">어느 국가 종목인가요? (환율 및 통화 계산용)</div>
             <label style="margin-right:15px; cursor:pointer;"><input type="radio" name="market_${idx}" value="kr" checked> 🇰🇷 한국 종목</label>
             <label style="cursor:pointer;"><input type="radio" name="market_${idx}" value="us"> 🇺🇸 미국 종목</label>
          </div>

          <div id="mappingInputArea_${idx}" style="display:flex; gap:5px; position:relative;">
             <select id="mapFilter_${idx}" class="form-input" style="width:85px; padding:0 5px; font-size:12px; cursor:pointer;" onchange="handleMapSearch(document.getElementById('mapInput_${idx}'), ${idx})">
                 <option value="all">🌐 전체</option>
                 <option value="kr">🇰🇷 한국</option>
                 <option value="us">🇺🇸 미국</option>
             </select>
             <div style="position:relative; flex:1;">
                 <input type="text" id="mapInput_${idx}" class="form-input" placeholder="현재 종목명 또는 티커 검색" autocomplete="off" oninput="handleMapSearch(this, ${idx})">
                 <ul id="mapDropdown_${idx}" class="search-dropdown" 
                     style="position:absolute; top:calc(100% + 4px); left:0; width:100%; max-height:180px; overflow-y:auto; z-index:1; display:none; background-color:#141720; border:1px solid var(--border2); border-radius:6px; box-shadow:0 8px 24px rgba(0,0,0,0.8); padding:0;">
                 </ul>
             </div>
          </div>
        </div>
    `).join('');
    document.getElementById('csvMappingOverlay').classList.add('open');
}

// 🌟 CSV 모달 내부 검색기능 (국가 필터링 반영)
function handleMapSearch(inputElem, idx) {
   let query = inputElem.value.trim().toLowerCase();
   const dropdown = document.getElementById(`mapDropdown_${idx}`);
   const filterElem = document.getElementById(`mapFilter_${idx}`);
   if (query.length < 1 || localStockDB.length === 0) { dropdown.style.display = 'none'; return; }
   
   const isIncludesSearch = query.startsWith('*') || query.endsWith('*');
   let cleanQuery = query.replace(/\*/g, '').trim();
   
   if (cleanQuery.length < 1) { dropdown.style.display = 'none'; return; }

   // 🌟 필터링 적용 로직
   let filteredDB = localStockDB;
   if (filterElem && filterElem.value === 'kr') {
       filteredDB = localStockDB.filter(s => isKorean(s.symbol));
   } else if (filterElem && filterElem.value === 'us') {
       filteredDB = localStockDB.filter(s => !isKorean(s.symbol) && !isCrypto(s.symbol));
   }

   let results = [];
   if (isIncludesSearch) {
       results = filteredDB.filter(s => s.symbol.toLowerCase().includes(cleanQuery) || s.name.toLowerCase().includes(cleanQuery));
   } else {
       results = filteredDB.filter(s => s.symbol.toLowerCase().startsWith(cleanQuery) || s.name.toLowerCase().startsWith(cleanQuery));
   }

   if (results.length === 0) { dropdown.style.display = 'none'; return; }
   
   dropdown.innerHTML = results.map(q => `
     <li class="search-item" style="padding:10px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; cursor:pointer;" 
         onclick="selectMapResult(${idx}, '${q.symbol}', '${q.name.replace(/'/g, "\\'")}')"
         onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
       <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
         <span style="font-weight:700; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${q.name}</span>
         <span style="font-size:10px; color:var(--text3);">${q.exch}</span>
       </div>
       <span style="color:var(--accent); font-family:var(--font-mono); font-size:11px; font-weight:700; margin-left:10px; flex-shrink:0;">${q.symbol}</span>
     </li>
   `).join('');
   
   dropdown.style.display = 'block';
}
function selectMapResult(idx, symbol, name) {
   const input = document.getElementById(`mapInput_${idx}`);
   input.value = `${name} (${symbol})`; 
   input.dataset.mappedSymbol = symbol;
   document.getElementById(`mapDropdown_${idx}`).style.display = 'none';
}

// 드롭다운 바깥 클릭 시 닫기
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-dropdown') && !e.target.closest('.form-input')) {
        document.querySelectorAll('[id^="mapDropdown_"]').forEach(el => {
            if(el) el.style.display = 'none';
        });
    }
});

function cancelCsvImport() {
    pendingCsvData = [];
    unmatchedSymbols = [];
    closeModal('csvMappingOverlay');
}

// 🌟 사용자가 매핑한 구 종목명 / 상장폐지 데이터 및 국가 정보 저장
function processPendingCsv() {
    if (!state.oldNames) state.oldNames = {};
    const mappingDict = {};

    for(let i=0; i<unmatchedSymbols.length; i++) {
        const raw = unmatchedSymbols[i];
        const status = document.querySelector(`input[name="status_${i}"]:checked`).value;
        
        if (status === 'delisted') {
            // 🌟 국가별 맞춤 꼬리표 부여 (.KS.DLST 또는 .DLST)
            const market = document.querySelector(`input[name="market_${i}"]:checked`).value;
            let finalSym = raw;
            if (market === 'kr' && !finalSym.endsWith('.KS') && !finalSym.endsWith('.KQ')) {
                finalSym += '.KS'; 
            }
            finalSym += '.DLST';
            
            mappingDict[raw] = finalSym;
            state.oldNames[finalSym] = '상장폐지';
        } else {
            const input = document.getElementById(`mapInput_${i}`);
            if(input) {
                const mapped = input.dataset.mappedSymbol || input.value.trim().toUpperCase() || raw;
                mappingDict[raw] = mapped;
                if (mapped !== raw) {
                    state.oldNames[mapped] = raw; 
                }
            } else {
                mappingDict[raw] = raw;
            }
        }
    }

    let addedCount = 0;
    pendingCsvData.forEach(tx => {
        let finalSym = tx.isMatched ? tx.matchedSymbol : mappingDict[tx.originalSymbol];
        
        let finalPrice = tx.rawPrice;
        if (tx.txType === 'dividend' && tx.taxStatus === '세전') {
            const taxRate = isKorean(finalSym) ? 0.154 : 0.15;
            finalPrice = finalPrice * (1 - taxRate);
        }

        state.transactions.push({
            id: tx.id,
            date: tx.date,
            owner: tx.owner,
            broker: tx.broker,
            symbol: finalSym.toUpperCase(),
            qty: tx.qty,
            price: finalPrice,
            txType: tx.txType
        });
        if (!state.tickers.includes(finalSym.toUpperCase())) state.tickers.push(finalSym.toUpperCase());
        addedCount++;
    });

    pendingCsvData = [];
    unmatchedSymbols = [];
    closeModal('csvMappingOverlay');
    closeModal('masterSettingsOverlay');
    
    saveState();
    renderTxList();
    if (currentView === 'history') renderHistoryDashboard(); else render();
    triggerAutoSync();
    alert(addedCount + "건의 거래내역이 정상적으로 추가되었습니다.");
}

// ── 🌟 [추가] 관심종목 삭제 경고창 함수 ──
function removeTickerConfirm(symbol, name) {
    if (confirm(`'${name || symbol}' 종목을 관심종목에서 삭제하시겠습니까?`)) {
        removeTicker(symbol);
    }
}

// ── 🌟 [추가] 태그/메모 모달 열기 및 저장 로직 ──
function openTagModal(symbol, name) {
    document.getElementById('tagModalSymbol').value = symbol;
    document.getElementById('tagModalTickerLabel').textContent = `${name} (${symbol})`;
    
    // 기존 태그가 있으면 불러오기
    const currentTag = (state.tags && state.tags[symbol]) ? state.tags[symbol] : '';
    document.getElementById('inputStockTag').value = currentTag;
    
    document.getElementById('tagOverlay').classList.add('open');
    setTimeout(() => document.getElementById('inputStockTag').focus(), 100);
}

function saveStockTag(forcedValue) {
    const symbol = document.getElementById('tagModalSymbol').value;
    if (!symbol) return;

    if (!state.tags) state.tags = {};

    let newTag = forcedValue !== undefined ? forcedValue : document.getElementById('inputStockTag').value.trim();

    if (newTag === '') {
        delete state.tags[symbol]; // 빈 값이면 태그 삭제
    } else {
        state.tags[symbol] = newTag;
    }

    saveState();
    closeModal('tagOverlay');
    render(); // 화면 즉시 새로고침
    triggerAutoSync(); // 클라우드 동기화
}

// ==========================================
// 🌟 페이지 초기화 (첫 로딩 시 빈 화면 방지)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 기본 날짜 오늘로 설정
  if (document.getElementById('txDate')) {
      document.getElementById('txDate').valueAsDate = new Date();
  }

  // 2. 종목 DB 로드 완료를 기다린 후 화면 그리기
  await loadStockDB();

  // 3. UI 업데이트 및 첫 화면 렌더링
  updateOwnerLabels();
  renderTxList();
  render(); 
  
  // 4. 자동 동기화 설정 적용
  const ghAutoSyncCheckbox = document.getElementById('ghAutoSync');
  if (ghAutoSyncCheckbox) {
      ghAutoSyncCheckbox.addEventListener('change', function(e) {
        let s = getGhSettings();
        s.autoSync = e.target.checked;
        saveGhSettings(s);
        if(s.autoSync) triggerAutoSync();
      });
  }
});

// ==========================================
// 🌟 실현수익(매도) 통계 대시보드 로직
// ==========================================
let currentRealizedOwnerFilter = 'all';

function setRealizedOwnerFilter(filter, el) {
  currentRealizedOwnerFilter = filter;
  document.querySelectorAll('.real-filter').forEach(b => b.classList.remove('active'));
  
  if (el) {
      el.classList.add('active');
  } else {
      // 강제 초기화 시 '전체' 버튼 활성화
      document.querySelectorAll('.real-filter').forEach(b => {
          if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'all'")) b.classList.add('active');
      });
  }
  renderRealizedDashboard();
}

function _setRealMktBtn(el) {
  ['realMktAll','realMktKr','realMktUs'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('active');
  });
  if (el) el.classList.add('active');
}

// ==========================================
// 🌟 실현수익 대시보드 렌더링 (최종 완성본 - 에러 수정)
// ==========================================
function renderRealizedDashboard() {
    updateViewHeader('💵', '실현수익');
    const realDash = document.getElementById('realizedDashboard');
    if(!realDash) return;

    // 🚨 [핵심 수정] 소유자 및 기간 필터 변수 매핑
    let ownerName = 'all';
    if (currentRealizedOwnerFilter === 'user1') ownerName = state.owners.user1.name;
    if (currentRealizedOwnerFilter === 'user2') ownerName = state.owners.user2.name;

    let selectedYear = realizedFilters.year;
    let selectedMonth = realizedFilters.month;

    // 🌟 2. 종목명 헬퍼
    function _getDisplayName(symbol) {
        if (cachedMarketData[symbol] && cachedMarketData[symbol].name) return cachedMarketData[symbol].name;
        const match = localStockDB && localStockDB.find(s => s.symbol === symbol);
        return match ? match.name : symbol;
    }

    // 계좌 / 종목명 select 옵션 동적 주입 (매도 거래 기준)
    const sellTxs = state.transactions.filter(t => t.qty < 0 && t.txType !== 'dividend' && t.txType !== 'transfer');
    
    const brokerSel = document.getElementById('realBrokerSearch');
    if (brokerSel) {
        const uniqueBrokers = [...new Set(sellTxs.map(t => t.broker ? t.broker.trim() : '미지정'))].sort();
        const curBroker = realizedFilters.broker;
        brokerSel.innerHTML = '<option value="">전체</option>' +
            uniqueBrokers.map(b => `<option value="${b}" ${curBroker === b ? 'selected' : ''}>${b}</option>`).join('');
    }
    
    // 활성화된 종목·시장 필터 배지를 상단 박스에 인라인으로 표시
    const badgesEl = document.getElementById('realizedActiveBadges');
    if (badgesEl) {
      let badgesHtml = "";
      if (realizedFilters.dateFrom || realizedFilters.dateTo) {
          const from = realizedFilters.dateFrom || '처음';
          const to   = realizedFilters.dateTo   || '오늘';
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">📅 ${from} ~ ${to} <span onclick="realizedFilters.dateFrom=''; realizedFilters.dateTo=''; renderRealizedDashboard();" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (realizedFilters.symbol) {
          const displayName = _getDisplayName(realizedFilters.symbol);
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">종목: ${displayName} <span onclick="resetRealizedSymbolFilter()" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (realizedFilters.tradeIdx !== null) {  // 🌟 추가
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">📊 차트 선택: ${realizedFilters.tradeIdx + 1}번째 거래 <span onclick="realizedFilters.tradeIdx=null; renderRealizedDashboard();" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (realizedFilters.market !== 'all') {
          const mLabel = realizedFilters.market === 'kr' ? '국내' : '해외';
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">시장: ${mLabel} <span onclick="_setRealMktBtn(document.getElementById('realMktAll')); updateRealizedFilter('market','all');" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (realizedFilters.broker) {
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">계좌: ${realizedFilters.broker} <span onclick="realizedFilters.broker=''; document.getElementById('realBrokerSearch').value=''; renderRealizedDashboard();" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (realizedFilters.name) {
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">종목: ${_getDisplayName(realizedFilters.name)} <span onclick="realizedFilters.name=''; document.getElementById('realNameSearch').value=''; renderRealizedDashboard();" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (selectedYear !== 'all') {
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">연도: ${selectedYear}년 <span onclick="updateRealizedDateFilter('year','all')" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      if (selectedMonth !== 'all') {
          badgesHtml += `<div class="f-btn active" style="cursor:default; font-size:11px;">월: ${parseInt(selectedMonth, 10)}월 <span onclick="updateRealizedDateFilter('month','all')" style="margin-left:6px; cursor:pointer; font-weight:bold; color:var(--text2);">✕</span></div>`;
      }
      
      const isAnyFilterActive = realizedFilters.symbol || realizedFilters.tradeIdx !== null || realizedFilters.market !== 'all' || selectedYear !== 'all' || selectedMonth !== 'all' || currentRealizedOwnerFilter !== 'all' || realizedFilters.dateFrom || realizedFilters.dateTo || realizedFilters.broker || realizedFilters.name;
      if (isAnyFilterActive) {
          badgesHtml += `<button class="btn-sm" onclick="resetRealizedFilters()" style="height:26px; padding:0 10px; color:var(--red); border-color:rgba(255,77,106,0.3); background:rgba(255,77,106,0.05); font-size:11px;">초기화 🔄</button>`;
      }
      badgesEl.innerHTML = badgesHtml;
    }

    // 🌟 글로벌 기간 컷오프(dashboardCutoff) 계산
    const dashboardCutoff = getCutoffDateFromRange(state.range);

    // 🌟 변수 선언
    let holdings = {};
    let realizedTxs = []; 
    let krwTotal = 0;
    let usdTotal = 0;
    let usdTotalKrw = 0;
    let chartLabels = [];
    let chartLineData = [];
    let chartBarData = [];
    let chartTxInfo = [];
    let cumulativePnl = 0;
    let dailyData = {};

    const sortedTx = [...state.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));

    // 3. 과거 내역부터 순차적으로 평단가 및 수익 계산
    sortedTx.forEach(tx => {
        if (tx.txType === 'dividend' || tx.txType === 'transfer') return;
        let broker = tx.broker ? tx.broker.trim() : '미지정';
        let key = `${tx.symbol}::${broker}`;

        if(!holdings[key]) holdings[key] = { qty: 0, avg: 0 };
        let h = holdings[key];

        if (tx.qty > 0) {
            let totalValue = (h.qty * h.avg) + (tx.qty * tx.price);
            h.qty += tx.qty;
            h.avg = totalValue / h.qty;
        } else if (tx.qty < 0) {
            let sellQty = Math.abs(tx.qty);
            let pnl = (tx.price - h.avg) * sellQty;
            let currentAvg = h.avg;
            
            h.qty -= sellQty;
            if (h.qty <= 0) { h.qty = 0; h.avg = 0; }

            let txYear = tx.date.substring(0, 4);
            const isKr = isKorean(tx.symbol);

            const passPeriodLocal = tx.date >= dashboardCutoff;
            const passYear = (selectedYear === 'all' || txYear === selectedYear);
            const passMonth = (selectedMonth === 'all' || tx.date.substring(5, 7) === selectedMonth);
            const passOwner = (ownerName === 'all' || tx.owner === ownerName);
            const passMarket = (realizedFilters.market === 'all' || (realizedFilters.market === 'kr' ? isKr : !isKr));
            const passSymbol = (realizedFilters.symbol === null || tx.symbol === realizedFilters.symbol);
            const passCustomDate = (!realizedFilters.dateFrom || tx.date >= realizedFilters.dateFrom) &&
                       (!realizedFilters.dateTo   || tx.date <= realizedFilters.dateTo);
            const passBroker = (!realizedFilters.broker || broker === realizedFilters.broker);
            const passName = (!realizedFilters.name || tx.symbol.toLowerCase().includes(realizedFilters.name.toLowerCase()) || (_getDisplayName(tx.symbol) || '').toLowerCase().includes(realizedFilters.name.toLowerCase()));
            
            // 변경 후
            if (passYear && passMonth && passOwner && passMarket && passSymbol && passPeriodLocal && passCustomDate && passBroker && passName) {
                const txFxRate = isKr ? 1 : getHistoricalFxRate(tx.date);
                let pnlKrw = pnl * txFxRate;
            
                // 같은 날짜 매도 내역은 하나로 합산
                if (!dailyData[tx.date]) dailyData[tx.date] = { pnlKrw: 0, trades: [] };
                dailyData[tx.date].pnlKrw += pnlKrw;
                dailyData[tx.date].trades.push({
                    symbol: tx.symbol,
                    name: _getDisplayName(tx.symbol) || tx.symbol,
                    qty: sellQty, sellPrice: tx.price, avgCost: currentAvg,
                    pnl: pnl, pnlKrw: pnlKrw,
                    roi: currentAvg > 0 ? (pnl / (currentAvg * sellQty)) * 100 : 0,
                    owner: tx.owner || '', broker: broker, isKr: isKr,
                    txFxRate: isKr ? null : txFxRate
                });
            
                if (isKr) {
                    krwTotal += pnl;
                } else {
                    usdTotal += pnl;
                    usdTotalKrw += pnl * txFxRate;
                }
            }
        }
    });

    // 날짜별 정렬 후 차트 배열 구성
    const _sortedDates = Object.keys(dailyData).sort();
    _sortedDates.forEach((date, dateIdx) => {
        const day = dailyData[date];
        cumulativePnl += day.pnlKrw;
        chartLabels.push(date);
        chartLineData.push(cumulativePnl);
        chartBarData.push(day.pnlKrw);
        chartTxInfo.push({ date, pnlKrw: day.pnlKrw, trades: day.trades });

        if (realizedFilters.tradeIdx === null || realizedFilters.tradeIdx === dateIdx) {
            day.trades.forEach(t => {
                realizedTxs.push({
                    date: date, symbol: t.symbol, owner: t.owner, broker: t.broker,
                    sellQty: t.qty, sellPrice: t.sellPrice, avgCost: t.avgCost,
                    pnl: t.pnl, roi: t.roi, txFxRate: t.txFxRate
                });
            });
        }
    });

    // 4. UI 요약 정보 텍스트 업데이트
    const summaryTitle = document.querySelector('#realizedDashboard .section-title');
    if (summaryTitle) {
        if (realizedFilters.symbol || realizedFilters.tradeIdx !== null) {
            const filterText = realizedFilters.symbol ? _getDisplayName(realizedFilters.symbol) : "선택된 거래 내역";
            summaryTitle.innerHTML = `📈 실현수익: <span style="color:var(--accent)">${filterText}</span> <button class="btn-sm" onclick="resetRealizedFilters()" style="margin-left:8px; padding:2px 8px;">전체보기 ✕</button>`;
        } else {
            summaryTitle.textContent = `📈 연도별 실현수익 통계`;
        }
    }

    const krwEl = document.getElementById('realTotalKrw');
    if (krwEl) krwEl.textContent = `₩ ${Math.round(krwTotal).toLocaleString()}`;

    const usdEl = document.getElementById('realTotalUsd');
    if (usdEl) usdEl.textContent = `$ ${usdTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

    const totalEl = document.getElementById('realTotalConverted');
    if (totalEl) {
        const grandTotal = krwTotal + usdTotalKrw;
        const signG = grandTotal >= 0 ? '+' : '';
        totalEl.textContent = `${signG}₩ ${Math.round(Math.abs(grandTotal)).toLocaleString()}`;
        totalEl.style.color = grandTotal >= 0 ? '#00C578' : '#3A9AFF';
    }

    const realKrNum = krwTotal;
    const realUsKrwNum = usdTotalKrw;
    const realGrand = Math.abs(realKrNum) + Math.abs(realUsKrwNum);
    const realKrPct = realGrand > 0 ? Math.round(Math.abs(realKrNum) / realGrand * 100) : 50;
    const realUsPct = 100 - realKrPct;
    const rrKr = document.getElementById('realRatioKr');
    const rrPKr = document.getElementById('realRatioPctKr');
    const rrPUs = document.getElementById('realRatioPctUs');
    const rrConv = document.getElementById('realTotalUsdConverted');
    if (rrKr) rrKr.style.width = realKrPct + '%';
    if (rrPKr) rrPKr.textContent = `🇰🇷 ${realKrPct}%`;
    if (rrPUs) rrPUs.textContent = `${realUsPct}% 🇺🇸`;
    if (rrConv) rrConv.textContent = usdTotal !== 0 ? `≈ ₩${Math.round(Math.abs(realUsKrwNum)).toLocaleString()}` : '';

    // 5. 차트 그리기 함수 호출
    renderRealizedChart(chartLabels, chartLineData, chartBarData, chartTxInfo);

    // 필터 요약바
    const realSummaryBar = document.getElementById('realSummaryBar');
    if (realSummaryBar) {
        const isAnyFilterActive = realizedFilters.symbol || realizedFilters.tradeIdx !== null ||
            realizedFilters.market !== 'all' || selectedYear !== 'all' || selectedMonth !== 'all' ||
            currentRealizedOwnerFilter !== 'all' || realizedFilters.dateFrom || realizedFilters.dateTo ||
            realizedFilters.broker || realizedFilters.name;

        if (!isAnyFilterActive || realizedTxs.length === 0) {
            realSummaryBar.style.display = 'none';
        } else {
            const uniqueSymbols = new Set(realizedTxs.map(t => t.symbol)).size;
            let netPnlKrw = 0, totalCostKrw = 0;
            realizedTxs.forEach(t => {
                const isKr = isKorean(t.symbol);
                const fx = isKr ? 1 : (t.txFxRate || currentUsdKrw);
                netPnlKrw += t.pnl * fx;
                totalCostKrw += t.avgCost * t.sellQty * fx;
            });
            const netRoi = totalCostKrw > 0 ? (netPnlKrw / totalCostKrw) * 100 : 0;
            const isPos = netPnlKrw >= 0;
            const sign = isPos ? '+' : '';
            const pnlColor = isPos ? 'var(--green)' : 'var(--blue)';
            const fmtW = v => {
                const abs = Math.abs(v);
                if (abs >= 100000000) return (v < 0 ? '-' : '+') + '₩' + (abs / 100000000).toFixed(1) + '억';
                if (abs >= 10000)     return (v < 0 ? '-' : '+') + '₩' + Math.round(abs / 10000).toLocaleString() + '만';
                return (v < 0 ? '-' : '+') + '₩' + Math.round(abs).toLocaleString();
            };
            realSummaryBar.style.display = 'block';
            realSummaryBar.innerHTML = `
                <div style="display:flex; gap:20px; align-items:center; padding:10px 16px;
                            background:var(--bg2); border:1px solid var(--border); border-radius:8px;
                            font-size:12px; flex-wrap:wrap; margin-bottom:12px;">
                    <span style="color:var(--text3); font-weight:700;">📊 ${realizedTxs.length}건 · ${uniqueSymbols}종목 매도</span>
                    <span style="border-left:1px solid var(--border); padding-left:20px;">
                        순 실현수익 <b style="color:${pnlColor}; font-family:var(--font-mono);">${fmtW(netPnlKrw)}</b>
                    </span>
                    <span>
                        순 수익률 <b style="color:${pnlColor}; font-family:var(--font-mono);">${sign}${netRoi.toFixed(2)}%</b>
                    </span>
                    <span style="color:var(--text3); font-size:10px; margin-left:auto;">* 미국주식은 거래일 환율 환산</span>
                </div>`;
        }
    }

    // 6. 종목별 통계 집계 → 랭킹 패널 렌더링
    const symStats = {};
    const rankingTxs = realizedTxs;

    rankingTxs.forEach(tx => {
        const isKr = isKorean(tx.symbol);
        const fxForRank = isKr ? 1 : (tx.txFxRate || currentUsdKrw);
        const pnlKrw    = tx.pnl * fxForRank;
        const costKrw   = (tx.avgCost * tx.sellQty) * fxForRank;

        if (!symStats[tx.symbol]) {
            let stockName = tx.symbol;
            const dbMatch = localStockDB.find(x => x.symbol === tx.symbol);
            const cachedMatch = cachedMarketData[tx.symbol];
            if (dbMatch) stockName = dbMatch.name;
            else if (cachedMatch && !cachedMatch._failed && cachedMatch.name) stockName = cachedMatch.name;
            symStats[tx.symbol] = {
                symbol: tx.symbol, name: stockName,
                pnlKrw: 0, costKrw: 0, trades: 0,
                lastSellDate: tx.date
            };
        }
        symStats[tx.symbol].pnlKrw  += pnlKrw;
        symStats[tx.symbol].costKrw += costKrw;
        symStats[tx.symbol].trades  += 1;
        if (tx.date > symStats[tx.symbol].lastSellDate) {
            symStats[tx.symbol].lastSellDate = tx.date;
        }
    });
 
    Object.values(symStats).forEach(s => {
        const buyTxs = state.transactions.filter(
            t => t.symbol === s.symbol && t.qty > 0 &&
                 t.txType !== 'dividend' && t.txType !== 'transfer'
        );
        const firstBuyDate = buyTxs.length > 0 ? buyTxs.map(t => t.date).sort()[0] : s.lastSellDate;
        const holdDays = Math.max(1, Math.round((new Date(s.lastSellDate) - new Date(firstBuyDate)) / 86400000));
        s.firstBuyDate = firstBuyDate;
        s.holdDays     = holdDays;
        s.speedScore   = s.pnlKrw / holdDays;
    });
 
    const symList = Object.values(symStats).map(s => ({
        ...s,
        roi: s.costKrw > 0 ? (s.pnlKrw / s.costKrw) * 100 : 0
    }));
 
    const rankByPnl   = [...symList].sort((a, b) => b.pnlKrw    - a.pnlKrw);
    const rankByRoi   = [...symList].sort((a, b) => b.roi        - a.roi);
    const rankBySpeed = [...symList].sort((a, b) => b.speedScore - a.speedScore); 
 
    const maxAbsPnl   = Math.max(...rankByPnl.map(s => Math.abs(s.pnlKrw)),      1);
    const maxAbsRoi   = Math.max(...rankByRoi.map(s => Math.abs(s.roi)),          1);
    const maxAbsSpeed = Math.max(...rankBySpeed.map(s => Math.abs(s.speedScore)), 1);
 
    if (realizedRankingSortDir === 'asc') {
        rankByPnl.reverse();
        rankByRoi.reverse();
        rankBySpeed.reverse();
    }

    const fmtW = v => {
        const abs = Math.abs(v);
        if (abs >= 100000000) return (v < 0 ? '-' : '+') + '₩' + (abs / 100000000).toFixed(1) + '억';
        if (abs >= 10000)     return (v < 0 ? '-' : '+') + '₩' + Math.round(abs / 10000).toLocaleString() + '만';
        return (v < 0 ? '-' : '+') + '₩' + Math.round(abs).toLocaleString();
    };

    const fmtSpeed = (v) => {
        const abs  = Math.abs(v);
        const sign = v >= 0 ? '+' : '-';
        if (abs >= 100000000) return sign + '₩' + (abs / 100000000).toFixed(2) + '억/일';
        if (abs >= 10000)     return sign + '₩' + (abs / 10000).toFixed(2) + '만/일';
        return sign + '₩' + Math.round(abs).toLocaleString() + '/일';
    };
 
    const rankRowHtml = (item, rank, valueStr, barPct, isPos) => {
        const medalMap = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const medal = medalMap[rank] || `<span style="font-size:11px; color:var(--text3); font-weight:700; min-width:18px; display:inline-block; text-align:center;">${rank}</span>`;
        const barColor = isPos ? '#00C578' : '#3A9AFF';
        const valColor = isPos ? '#00C578' : '#3A9AFF';
        return `
        <div onclick="updateRealizedFilter('symbol','${item.symbol}')"
             style="padding:8px 10px; border-radius:6px; cursor:pointer; transition:0.15s; border:1px solid transparent;"
             onmouseover="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='var(--border2)'"
             onmouseout="this.style.background='transparent'; this.style.borderColor='transparent'">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
            <span style="font-size:15px; flex-shrink:0;">${medal}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
              <div style="font-size:10px; color:var(--text3);">${item.trades}건 매도</div>
            </div>
            <div style="font-size:12px; font-weight:700; color:${valColor}; font-family:var(--font-mono); flex-shrink:0; text-align:right; line-height:1.4;">${valueStr}</div>
          </div>
          <div style="height:3px; border-radius:2px; background:var(--bg3); overflow:hidden;">
            <div style="height:100%; width:${Math.min(100, Math.abs(barPct))}%; background:${barColor}; border-radius:2px; transition:width 0.4s;"></div>
          </div>
        </div>`;
    };

    const rankingPanelEl = document.getElementById('realizedRankingPanel');
    if (rankingPanelEl) {
        if (symList.length === 0) {
            rankingPanelEl.innerHTML = `<div style="font-size:12px; color:var(--text3); text-align:center; padding:20px;">실현수익 데이터 없음</div>`;
        } else {
            const isRoi   = realizedRankingTab === 'roi';
            const isSpeed = realizedRankingTab === 'speed';
            const activeRank   = isSpeed ? rankBySpeed : (isRoi ? rankByRoi : rankByPnl);
            const maxAbsActive = isSpeed ? maxAbsSpeed  : (isRoi ? maxAbsRoi : maxAbsPnl);

            const tabBtn = (tab, label) => {
                const isActive = realizedRankingTab === tab;
                return `<button onclick="setRealizedRankingTab('${tab}')"
                    style="flex:1; padding:9px 6px; font-size:13px; font-weight:700; border:none;
                           background:transparent; color:${isActive?'#00C578':'var(--text3)'};
                           cursor:pointer; border-bottom:2px solid ${isActive?'#00C578':'transparent'};
                           transition:0.2s; font-family:var(--font-sans);">
                    ${label}
                </button>`;
            };

            rankingPanelEl.innerHTML = `
            <div style="background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; display:flex; flex-direction:column; height:100%;">
              <div style="padding:10px 12px; border-bottom:1px solid var(--border); flex-shrink:0;">
                <div style="display:flex; border-bottom:1px solid var(--border); flex-shrink:0; align-items:stretch;">
                  ${tabBtn('pnl', '💵 수익금')}
                  ${tabBtn('roi', '📊 수익률')}
                  ${tabBtn('speed', '⚡ 단타왕')}
                  <div style="margin-left:auto; display:flex; align-items:center; padding:0 8px; gap:4px; border-left:1px solid var(--border);">
                    <button onclick="setRealizedRankingSortDir('desc')"
                      style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${realizedRankingSortDir==='desc'?'var(--accent)':'var(--border)'}; background:${realizedRankingSortDir==='desc'?'var(--accent-bg)':'transparent'}; color:${realizedRankingSortDir==='desc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; line-height:1;">↓</button>
                    <button onclick="setRealizedRankingSortDir('asc')"
                      style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${realizedRankingSortDir==='asc'?'var(--accent)':'var(--border)'}; background:${realizedRankingSortDir==='asc'?'var(--accent-bg)':'transparent'}; color:${realizedRankingSortDir==='asc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; line-height:1;">↑</button>
                  </div>
                </div>
              </div>
              <div style="padding:6px 8px; display:flex; flex-direction:column; gap:2px; flex:1; overflow-y:auto;">
                ${rankingTxs.length === 0
                    ? `<div style="text-align:center; padding:20px; font-size:12px; color:var(--text3);">해당 기간 데이터 없음</div>`
                    : activeRank.map((s, i) => rankRowHtml(
                        s, i+1,
                        (() => {
                            if (isSpeed) {
                                const dailyLine = fmtSpeed(s.speedScore);
                                const holdLine  = `<br><span style="font-size:9px;color:var(--text3);font-weight:400;">${s.holdDays}일 보유 · 총 ${fmtW(s.pnlKrw)}</span>`;
                                return dailyLine + holdLine;
                            }
                            return isRoi
                                ? (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%'
                                : fmtW(s.pnlKrw);
                        })(),
                        (Math.abs(isSpeed ? s.speedScore : isRoi ? s.roi : s.pnlKrw) / maxAbsActive) * 100,
                        isSpeed ? s.speedScore >= 0 : isRoi ? s.roi >= 0 : s.pnlKrw >= 0
                      )).join('')
                }
              </div>
            </div>`;
        }
    }

    // 7. 거래 내역 표 렌더링
    const tbody = document.getElementById('realizedTableBody');
    if (realizedTxs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text3);">조건에 맞는 실현수익 내역이 없습니다.</td></tr>`;
        return;
    }

    realizedTxs.reverse(); 

    tbody.innerHTML = realizedTxs.map(tx => {
        let stockName = tx.symbol;
        const dbMatch = localStockDB.find(x => x.symbol === tx.symbol);
        const cachedMatch = cachedMarketData[tx.symbol];
        if (dbMatch) stockName = dbMatch.name;
        else if (cachedMatch && !cachedMatch._failed && cachedMatch.name) stockName = cachedMatch.name;

        if (state.oldNames && state.oldNames[tx.symbol]) {
           stockName = state.oldNames[tx.symbol] === '상장폐지' ? `${tx.symbol.replace('.KS.DLST', '').replace('.DLST', '')} (상장폐지)` : `${stockName} (구: ${state.oldNames[tx.symbol]})`;
        }

        let sign = tx.pnl >= 0 ? '+' : '';
        let pnlColor = tx.pnl >= 0 ? '#00C578' : '#3A9AFF';
        let oInfo = getOwnerInfo(tx.owner);

        return `
        <tr style="border-bottom: 1px solid var(--border); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding:12px 16px; color:var(--text2);">${tx.date}</td>
            <td style="padding:12px 16px; cursor:pointer;" onclick="updateRealizedFilter('symbol', '${tx.symbol}')" title="이 종목만 보기">
                <div style="font-weight:700; color:var(--accent); text-decoration:underline;">${stockName}</div>
                <div style="font-size:10px; font-family:var(--font-mono); color:var(--text3);">${tx.symbol.replace('.KS.DLST','').replace('.DLST','')}</div>
            </td>
            <td style="padding:12px 16px;"><div style="color:var(--text2); font-size:12px;">${tx.broker}</div><div style="font-size:11px; margin-top:2px;">${oInfo.icon} ${tx.owner}</div></td>
            <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono);">${tx.sellQty}</td>
            <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono);">${formatPrice(tx.sellPrice, tx.symbol)}</td>
            <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono); color:var(--text3);">${formatPrice(tx.avgCost, tx.symbol)}</td>
            <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${pnlColor};">
                ${currencyTag(tx.symbol)}${sign}${formatPrice(Math.abs(tx.pnl), tx.symbol)}
                ${tx.txFxRate ? `<div style="font-size:10px; font-weight:600; margin-top:3px; color:${pnlColor}; opacity:0.85;">${sign}₩${(Math.abs(tx.pnl * tx.txFxRate) >= 1 ? Math.round(Math.abs(tx.pnl * tx.txFxRate)).toLocaleString() : (Math.abs(tx.pnl * tx.txFxRate)).toFixed(0))} <span style="color:var(--text3);font-weight:400;font-size:9px;">@${Math.round(tx.txFxRate).toLocaleString()}</span></div>` : ''}
            </td>
            <td style="padding:12px 16px; text-align:right; font-weight:700; color:${pnlColor};">${sign}${tx.roi.toFixed(2)}%</td>
        </tr>
        `;
    }).join('');
  updateRfpSankey(krwTotal, usdTotalKrw);
  renderCapitalGainsTax(currentRealizedOwnerFilter);
}

// ── 🇺🇸 미국주식 양도소득세 계산 패널 ────────────────────────────────────────
let _cgTaxExpanded = true; // 패널 펼침/접힘 상태

function renderCapitalGainsTax(ownerFilter) {
    const panel = document.getElementById('capitalGainsTaxPanel');
    if (!panel) return;

    // ① 전체 거래에서 미국주식 매도분만 평단가 추적하며 연도별 손익 집계
    //    (세금은 연간 전체 기준이므로 현재 필터 무관하게 ALL 계산)
    const DEDUCTION = 2500000;   // 기본공제 250만원
    const TAX_RATE  = 0.22;      // 22% (소득세 20% + 지방소득세 2%)

    let ownerName = 'all';
    if (ownerFilter === 'user1') ownerName = state.owners.user1.name;
    if (ownerFilter === 'user2') ownerName = state.owners.user2.name;

    const holdings = {};     // key: `symbol::broker`
    const byYear = {};     // key: '2024' → { gainUsd, lossUsd }
    const tradesByYear = {};

    [...state.transactions]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(tx => {
            if (tx.txType === 'dividend' || tx.txType === 'transfer') return;
            if (isKorean(tx.symbol)) return;   // 미국주식만
            if (ownerName !== 'all' && tx.owner !== ownerName) return;

            const broker = tx.broker ? tx.broker.trim() : '미지정';
            const key    = `${tx.symbol}::${broker}`;
            if (!holdings[key]) holdings[key] = { qty: 0, avg: 0 };
            const h = holdings[key];

            if (tx.qty > 0) {
                const total = h.qty * h.avg + tx.qty * tx.price;
                h.qty += tx.qty;
                h.avg  = total / h.qty;
            } else if (tx.qty < 0) {
                const avgCost = h.avg;   // ← 차감 전에 먼저 캡처
                const sellQty = Math.abs(tx.qty);
                const pnl     = (tx.price - avgCost) * sellQty;
                h.qty -= sellQty;
                if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
            
                const year = tx.date.substring(0, 4);
                if (!byYear[year]) byYear[year] = { gainUsd: 0, lossUsd: 0, gainKrw: 0, lossKrw: 0 };
                if (!tradesByYear[year]) tradesByYear[year] = [];
                const txFx = getHistoricalFxRate(tx.date);
            
                // ── 개별 거래 저장 ──
                tradesByYear[year].push({
                    date: tx.date, symbol: tx.symbol,
                    name: (() => {
                        const m = localStockDB && localStockDB.find(s => s.symbol === tx.symbol);
                        const c = cachedMarketData[tx.symbol];
                        return m ? m.name : (c && !c._failed && c.name ? c.name : tx.symbol);
                    })(),
                    qty: sellQty, sellPrice: tx.price, avgCost, pnl, txFx,
                    broker, owner: tx.owner
                });
            
                if (pnl >= 0) { byYear[year].gainUsd += pnl; byYear[year].gainKrw += pnl * txFx; }
                else          { byYear[year].lossUsd += Math.abs(pnl); byYear[year].lossKrw += Math.abs(pnl) * txFx; }
            }
        });

    const years = Object.keys(byYear).sort((a, b) => b - a); // 최신연도 먼저

    if (years.length === 0) {
        panel.innerHTML = '';
        return;
    }

    // ② 연도별 세금 계산
    // ── 2026 RIA 가중치 헬퍼 ──────────────────────────────────
    function _ria2026Weight(dateStr) {
        const m = parseInt(dateStr.substring(5, 7), 10);
        if (m <= 5) return 1.0;
        if (m <= 7) return 0.8;
        return 0.5;
    }
    
    const riaAccounts = (state.riaAccounts || []).map(s => s.trim()).filter(Boolean);
    const isRiaBroker = b => {
        const s = (b || '').trim();
        return s.toUpperCase().includes('RIA') || riaAccounts.includes(s);
    };
    const rows = years.map(year => {
        const { gainUsd, lossUsd, gainKrw, lossKrw } = byYear[year];
        const netUsd = gainUsd - lossUsd;
        const netKrw = (gainKrw || 0) - (lossKrw || 0);
    
        // ── 2026 RIA 특례 계산 ─────────────────────────────────
        let riaDeduction = 0;
        let riaNote = '';
        let nonRiaDetails = [];
    
        if (year === '2026') {
            const _h2 = {};
            let riaWeightedSell = 0;   // 가중 매도금액 (분모)
            let riaWeightedGain = 0;   // 조정 전 공제액 (분자)
    
            [...state.transactions]
                .filter(t => t.txType !== 'dividend' && t.txType !== 'transfer' && !isKorean(t.symbol))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .forEach(tx => {
                    if (ownerName !== 'all' && tx.owner !== ownerName) return;
                    const broker = (tx.broker || '').trim();
                    const key = `${tx.symbol}::${broker}`;
                    if (!_h2[key]) _h2[key] = { qty: 0, avg: 0 };
                    const h = _h2[key];
                    if (tx.qty > 0) {
                        const tv = h.qty * h.avg + tx.qty * tx.price;
                        h.qty += tx.qty; h.avg = tv / h.qty;
                    } else if (tx.qty < 0 && tx.date.startsWith('2026') && isRiaBroker(broker)) {
                        const sellQty = Math.abs(tx.qty);
                        const fx = getHistoricalFxRate(tx.date);
                        const sellAmtKrw = tx.price * sellQty * fx;
                        const costAmtKrw = h.avg * sellQty * fx;
                        const gainKrwTx  = sellAmtKrw - costAmtKrw;
                        const w = _ria2026Weight(tx.date);
                        riaWeightedSell += sellAmtKrw * w;
                        if (gainKrwTx > 0) riaWeightedGain += gainKrwTx * w; // 이익분만 공제
                        h.qty -= sellQty; if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
                    } else if (tx.qty < 0) {
                        const sellQty = Math.abs(tx.qty);
                        h.qty -= sellQty; if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
                    }
                });
    
            // ② RIA 외 계좌 순매수금액 (가중치 적용)
            let nonRiaNetBuy = 0;
            const customOverseas = state.customOverseasAssets || []; // 🌟 수동 지정 종목 배열
            
            state.transactions
                .filter(t => {
                    // 1. 기본 조건 필터 (2026년, 매수/매도 거래, 해당 소유자, RIA 계좌 제외)
                    if (!t.date.startsWith('2026')) return false;
                    if (t.txType === 'dividend' || t.txType === 'transfer') return false;
                    if (ownerName !== 'all' && t.owner !== ownerName) return false;
                    if (isRiaBroker(t.broker)) return false;
                    if ((state.riaExcludeSymbols||[]).includes(t.symbol)) return false;

                    // 2. 🌟 [수정] 해외주식 및 미국 관련 국내 ETF 판별
                    let isTargetAsset = !isKorean(t.symbol);
                    // 🌟 1. 수동 지정된 종목인지 검사 (종목코드 일치 확인)
                    if (!isTargetAsset && customOverseas.includes(t.symbol.toUpperCase())) {
                        isTargetAsset = true;
                    }
                    // 2. 수동 지정이 안 되어있다면 키워드 및 이름 검사
                    if (!isTargetAsset) {
                        // 국내 종목인 경우 종목명을 가져와서 검사
                        let stockName = t.symbol;
                        if (localStockDB && localStockDB.length > 0) {
                            const m = localStockDB.find(s => s.symbol === t.symbol);
                            if (m) stockName = m.name;
                        }
                        if (cachedMarketData[t.symbol] && !cachedMarketData[t.symbol]._failed && cachedMarketData[t.symbol].name) {
                            stockName = cachedMarketData[t.symbol].name;
                        }
                        
                        // 🌟 종목명(한글 등)으로 직접 수동 지정된 경우인지 확인
                        if (customOverseas.includes(stockName.toUpperCase())) {
                            isTargetAsset = true;
                        } else {
                            const cleanName = stockName.replace(/\s+/g, '').toLowerCase();
                            const usKeywords = ['미국', '테슬라', '팔란티어', '구글', '애플', '나스닥', 's&p', '다우존스', '엔비디아', '마이크로소프트'];
                            isTargetAsset = usKeywords.some(kw => cleanName.includes(kw));
                        }
                    }
                    
                    return isTargetAsset;
                })
                .forEach(tx => {
                    // 1. 환율 및 가중치 계산 (국내주식은 환율 1 적용)
                    const fx = isKorean(tx.symbol) ? 1 : getHistoricalFxRate(tx.date);
                    const w  = _ria2026Weight(tx.date);
                    const calcAmount = tx.qty * tx.price * fx * w; 
                    
                    nonRiaNetBuy += calcAmount;

                    // 2. 종목명 추출 (let 선언은 여기서 딱 한 번만!)
                    let stockName = tx.symbol;
                    if (localStockDB && localStockDB.length > 0) {
                        const m = localStockDB.find(s => s.symbol === tx.symbol);
                        if (m) stockName = m.name;
                    }
                    if (cachedMarketData[tx.symbol] && !cachedMarketData[tx.symbol]._failed && cachedMarketData[tx.symbol].name) {
                        stockName = cachedMarketData[tx.symbol].name;
                    }
                    
                    // 3. 상세 내역 배열에 푸시
                    nonRiaDetails.push({
                        date: tx.date,
                        symbol: stockName,
                        ticker: tx.symbol,
                        broker: tx.broker || '미지정',
                        type: tx.qty > 0 ? '매수' : '매도',
                        weight: w * 100,
                        calcAmt: calcAmount
                    });
                });
    
            // ③ 최종 공제액
            if (riaWeightedSell > 0 && riaWeightedGain > 0) {
                const ratio = Math.min(1, Math.max(0, nonRiaNetBuy / riaWeightedSell));
                riaDeduction = Math.max(0, riaWeightedGain * (1 - ratio));
                riaNote = `RIA 조정 전 공제 ₩${Math.round(riaWeightedGain).toLocaleString()} × (1 - ${Math.round(nonRiaNetBuy).toLocaleString()}/${Math.round(riaWeightedSell).toLocaleString()})`;
            }
        }
    
        const taxableKrw = Math.max(0, netKrw - DEDUCTION - riaDeduction);
        const taxKrw     = Math.round(taxableKrw * TAX_RATE);
        const isProfit   = netUsd > 0;
        return { year, gainUsd, lossUsd, netUsd, netKrw, taxableKrw, taxKrw, isProfit,
                 riaDeduction, riaNote, nonRiaDetails };
    });

    // ③ 금액 포맷 헬퍼
    const fmtUsd = v => {
        const s = v < 0 ? '-' : (v > 0 ? '+' : '');
        return `${s}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const fmtKrw = v => {
        const abs = Math.abs(v);
        const s   = v < 0 ? '-' : (v > 0 ? '+' : '');
        if (abs >= 100000000) return `${s}₩${(abs / 100000000).toFixed(2)}억`;
        if (abs >= 10000)     return `${s}₩${Math.round(abs / 10000).toLocaleString()}만`;
        return `${s}₩${Math.round(abs).toLocaleString()}`;
    };

    // ④ 총계 행
    const totalNetKrw   = rows.reduce((s, r) => s + r.netKrw,  0);
    const totalTaxKrw   = rows.reduce((s, r) => s + r.taxKrw,  0);

    // ⑤ 올해 연도 확인
    const thisYear = String(new Date().getFullYear());
    const curRow = rows.find(r => r.year === thisYear);

    // 올해 한 줄 인라인 렌더
    const curRowHtml = (() => {
        const r = curRow;
        if (!r) return `<div style="font-size:12px; color:var(--text3); padding:6px 0;">${thisYear}년 매도 내역 없음</div>`;
        const netColor = r.netUsd > 0 ? '#00C578' : r.netUsd < 0 ? '#3A9AFF' : 'var(--text3)';
        const taxStr = r.taxKrw > 0
            ? `<span style="font-family:var(--font-mono); font-size:17px; font-weight:700; line-height:1.15; letter-spacing:-0.02em; color:#ff4d6a;">₩${r.taxKrw.toLocaleString()}</span>`
            : `<span style="font-size:13px; color:var(--text3);">납부 없음</span>`;
        const riaInfoHtml = r.riaDeduction > 0
            ? `<div style="font-size:10px; color:var(--green); font-family:var(--font-mono); margin-top:3px;">📌 RIA공제 −₩${Math.round(r.riaDeduction/10000).toLocaleString()}만</div>`
            : (riaAccounts.length === 0 && thisYear === '2026')
                ? `<div style="font-size:10px; color:var(--text3); margin-top:3px;">⚙️ RIA 계좌 미설정 — <span style="cursor:pointer; text-decoration:underline;" onclick="openMasterSettingsModal()">설정에서 등록</span></div>`
                : '';
        return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:6px 0;">
            <div>
                <div style="font-size:12px; color:var(--text3); font-weight:700; letter-spacing:0.03em; margin-bottom:3px;">순손익</div>
                <div style="font-family:var(--font-mono); font-size:17px; font-weight:700; line-height:1.15; letter-spacing:-0.02em; color:${netColor};">${fmtUsd(r.netUsd)}</div>
                <div style="font-size:12px; color:${netColor}; font-family:var(--font-mono); margin-top:4px;">${fmtKrw(r.netKrw)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:12px; color:var(--text3); font-weight:700; letter-spacing:0.03em; margin-bottom:3px;">예상 세금</div>
                ${taxStr}
                ${riaInfoHtml}
                ${r.netKrw > 0 && r.netKrw <= DEDUCTION ? `<div style="font-size:11px; color:var(--text3); margin-top:4px;">공제 범위 내</div>` : ''}
            </div>
        </div>`;
    })();

    // 전체 테이블 (모달용 빌더 - 클로저로 데이터 캡처)
    const buildFullTableHtml = () => `
    <div style="overflow-x:auto;">
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
            <tr style="border-bottom:1px solid var(--border); background:var(--bg3);">
                <th style="padding:9px 18px; text-align:left; font-weight:600; color:var(--text2); white-space:nowrap;">연도</th>
                <th style="padding:9px 14px; text-align:right; font-weight:600; color:var(--text2); white-space:nowrap;">총 매도차익</th>
                <th style="padding:9px 14px; text-align:right; font-weight:600; color:var(--text2); white-space:nowrap;">총 매도손실</th>
                <th style="padding:9px 14px; text-align:right; font-weight:600; color:var(--text2); white-space:nowrap;">순손익 (USD)</th>
                <th style="padding:9px 14px; text-align:right; font-weight:600; color:var(--text2); white-space:nowrap;">순손익 (환산 KRW)</th>
                <th style="padding:9px 14px; text-align:right; font-weight:600; color:var(--text2); white-space:nowrap;">기본공제 후 과세표준</th>
                <th style="padding:9px 18px; text-align:right; font-weight:600; color:#ff4d6a; white-space:nowrap;">예상 세금 (22%)</th>
            </tr>
        </thead>
        <tbody>
            ${rows.map((r, i) => {
                const netColor   = r.netUsd > 0 ? '#00C578' : r.netUsd < 0 ? '#3A9AFF' : 'var(--text3)';
                const taxColor   = r.taxKrw > 0 ? '#ff4d6a' : 'var(--text3)';
                const isThisYear = r.year === thisYear;
                const bg         = isThisYear ? 'rgba(124,106,247,0.07)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)');
                const taxableStr = r.taxableKrw > 0
                    ? `<span style="color:#ff4d6a;">${fmtKrw(r.taxableKrw)}</span>
                       ${r.riaDeduction > 0 ? `<div style="font-size:9px;color:var(--green);margin-top:2px;">RIA공제 -₩${Math.round(r.riaDeduction/10000).toLocaleString()}만</div>` : ''}`
                    : `<span style="color:var(--text3);">—</span>`;
                const taxStr = r.taxKrw > 0
                    ? `<b style="color:${taxColor}; font-family:var(--font-mono);">₩${r.taxKrw.toLocaleString()}</b>`
                    : `<span style="color:var(--text3); font-size:11px;">납부 없음</span>`;
                const notice = r.netKrw > 0 && r.netKrw <= DEDUCTION
                    ? `<div style="font-size:10px; color:var(--text3); margin-top:2px;">공제 범위 내</div>` : '';
                return `
                <tr style="border-bottom:1px solid var(--border); background:${bg}; transition:0.15s; cursor:pointer;"
                    onclick="window._openCgYearDetail('${r.year}')"
                    onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='${bg}'">
                    <td style="padding:11px 18px; font-weight:700; color:var(--text); font-size:13px;">
                        ${r.year}년
                        ${isThisYear ? `<span style="font-size:10px; color:#7c6af7; background:rgba(124,106,247,0.15); padding:1px 6px; border-radius:4px; margin-left:4px;">올해</span>` : ''}
                    </td>
                    <td style="padding:11px 14px; text-align:right; font-family:var(--font-mono); color:#00C578;">+$${r.gainUsd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td style="padding:11px 14px; text-align:right; font-family:var(--font-mono); color:#3A9AFF;">${r.lossUsd > 0 ? `-$${r.lossUsd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}</td>
                    <td style="padding:11px 14px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${netColor};">${fmtUsd(r.netUsd)}</td>
                    <td style="padding:11px 14px; text-align:right; font-family:var(--font-mono); color:${netColor};">
                        ${fmtKrw(r.netKrw)}
                        <div style="font-size:10px; color:var(--text3); font-weight:400;">거래일 환율 적용</div>
                    </td>
                    <td style="padding:11px 14px; text-align:right;">${taxableStr}${notice}</td>
                    <td style="padding:11px 18px; text-align:right;">${taxStr}</td>
                </tr>`;
            }).join('')}
        </tbody>
        ${rows.length > 1 ? `
        <tfoot>
            <tr style="border-top:2px solid var(--border2); background:var(--bg3);">
                <td style="padding:10px 18px; font-weight:700; color:var(--text2); font-size:12px;" colspan="4">합계</td>
                <td style="padding:10px 14px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${totalNetKrw>0?'#00C578':totalNetKrw<0?'#3A9AFF':'var(--text3)'};">${fmtKrw(totalNetKrw)}</td>
                <td></td>
                <td style="padding:10px 18px; text-align:right; font-weight:700; font-family:var(--font-mono); color:${totalTaxKrw>0?'#ff4d6a':'var(--text3)'};">${totalTaxKrw>0?`₩${Math.round(totalTaxKrw).toLocaleString()}`:'—'}</td>
            </tr>
        </tfoot>` : ''}
    </table>
    </div>
    <div style="padding:10px 18px; font-size:10px; color:var(--text3); border-top:1px solid var(--border); line-height:1.7; background:var(--bg3);">
        ⚠️ 위 계산은 <b>참고용 추정치</b>입니다. 실제 신고 시에는 환율 기준일(매도일 기준 대고객 매매기준율), 해외 원천징수세액 공제 등을 반드시 확인하세요. 확정신고: 매년 5월 (전년도 양도분 기준).
    </div>`;

    // ── 연도 상세 모달 ──
    window._cgTradesByYear = tradesByYear;
    window._cgRows = rows;
    window._openCgTaxModal = function() {
        let overlay = document.getElementById('cgFullTableOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cgFullTableOverlay';
            overlay.className = 'overlay';
            overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
            document.body.appendChild(overlay);
        }
        
        overlay.innerHTML = `
            <div class="modal" onclick="event.stopPropagation()"
                 style="max-width:900px; width:95vw; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; padding:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--border); flex-shrink:0;">
                <div>
                  <div style="font-size:18px; font-weight:700; color:var(--text);">🇺🇸 미국주식 양도소득세 연도별 요약</div>
                  <div style="font-size:13px; color:var(--text3); margin-top:2px;">기본공제 250만원 · 세율 22% · 거래일 환율 적용</div>
                </div>
                <button class="btn-sm" onclick="document.getElementById('cgFullTableOverlay').style.display='none'">닫기</button>
              </div>
              <div style="flex:1; overflow-y:auto;">${buildFullTableHtml()}</div>
            </div>`;
        overlay.style.display = 'flex';
    };
    
    /**
     * 🇺🇸 미국주식 양도소득세 연도별 상세 모달
     *
     * ── 기본 계산 ────────────────────────────────────────────────
     * ① 과세표준 = 총 매도차익(KRW) − 총 매도손실(KRW) − 기본공제(250만) − RIA 특례공제
     * ② 예상 세금 = 과세표준 × 22%  (소득세 20% + 지방소득세 2%)
     * ③ 환산: 각 거래일의 USD/KRW 대고객 매매기준율 적용
     *
     * ── 2026 RIA 계좌 특례공제 계산 ─────────────────────────────
     * RIA(개인종합자산관리계좌) 경유 매도분에 한해 추가 공제 적용
     *
     * 핵심 개념:
     *   "RIA 계좌 매도 이익 중, 비(非)RIA 계좌에서
     *    같은 기간 추가 매수한 비율만큼은 공제 불가"
     *
     * 변수 정의 (모두 가중치 적용 후 KRW 환산 기준):
     *   A = RIA 계좌 매도 이익 합계
     *   B = RIA 계좌 매도 금액 합계
     *   C = 비RIA 계좌 순매수 금액 합계
     *
     *   공제액 = A × (1 − C/B)   ← C ≥ B 이면 공제 없음
     *
     * 기간별 가중치 (2026년):
     *   1~5월  → ×1.0  (100%)
     *   6~7월  → ×0.8  ( 80%)
     *   8월~   → ×0.5  ( 50%)
     *
     * ※ 참고용 추정치 — 실제 신고 시 세무사 확인 필요
     */

    // 🌟 [추가] 모달창 전용: 수동 지정 종목 저장 및 즉시 재계산 함수
    window.saveCustomOverseasModal = function(year) {
        const val = document.getElementById('inputCustomOverseasModal').value;
        state.customOverseasAssets = val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        saveState();
        triggerAutoSync();
        
        // 백그라운드 패널의 양도세 재계산 (이 함수가 window._cgRows 등을 최신화함)
        renderCapitalGainsTax(currentRealizedOwnerFilter); 
        
        // 현재 보고 있는 상세 모달창을 최신 데이터로 다시 그리기 (깜빡임 없이 갱신)
        window._openCgYearDetail(year); 
    };

    window.toggleRiaExclude = function(ticker, year) {
        if (!state.riaExcludeSymbols) state.riaExcludeSymbols = [];
        const idx = state.riaExcludeSymbols.indexOf(ticker);
        if (idx === -1) state.riaExcludeSymbols.push(ticker);
        else state.riaExcludeSymbols.splice(idx, 1);
        saveState();
        renderCapitalGainsTax(currentRealizedOwnerFilter);
        window._openCgYearDetail(year);
    };

    window._openCgYearDetail = function(year) {
        const trades = (window._cgTradesByYear || {})[year] || [];
        const DEDUCTION = 2500000, TAX_RATE = 0.22;
    
        let gainUsd=0, lossUsd=0, gainKrw=0, lossKrw=0;
        trades.forEach(t => {
            if (t.pnl >= 0) { gainUsd += t.pnl; gainKrw += t.pnl * t.txFx; }
            else { lossUsd += Math.abs(t.pnl); lossKrw += Math.abs(t.pnl) * t.txFx; }
        });
        const netUsd = gainUsd - lossUsd;
        const netKrw = gainKrw - lossKrw;
        const savedRow = (window._cgRows || []).find(r => r.year === year);
        const riaDeduction = savedRow ? savedRow.riaDeduction : 0;
        const riaNote = savedRow ? savedRow.riaNote : '';
        const nonRiaDetails = savedRow ? savedRow.nonRiaDetails : [];
        const taxableKrw = Math.max(0, netKrw - DEDUCTION - riaDeduction);
        const taxKrw = Math.round(taxableKrw * TAX_RATE);
    
        const fmtU = v => (v < 0 ? '-' : '+') + '$' + Math.abs(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
        const fmtW = v => {
            const a = Math.abs(v), s = v < 0 ? '-' : '+';
            if (a >= 100000000) return s + '₩' + (a/100000000).toFixed(2) + '억';
            if (a >= 10000)     return s + '₩' + Math.round(a/10000).toLocaleString() + '만';
            return s + '₩' + Math.round(a).toLocaleString();
        };
    
        let overlay = document.getElementById('cgYearDetailOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cgYearDetailOverlay';
            overlay.className = 'overlay';
            overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
            document.body.appendChild(overlay);
        }
    
        const rowsHtml = [...trades].sort((a,b) => a.date.localeCompare(b.date)).map(t => {
            const pc = t.pnl >= 0 ? '#00C578' : '#3A9AFF';
            const roi = t.avgCost > 0 ? ((t.pnl / (t.avgCost * t.qty)) * 100).toFixed(1) : '0.0';
            return `
            <tr style="border-bottom:1px solid var(--border);"
                onmouseover="this.style.background='rgba(255,255,255,0.03)'"
                onmouseout="this.style.background='transparent'">
              <td style="padding:10px 12px; color:var(--text2); white-space:nowrap;">${t.date}</td>
              <td style="padding:10px 12px;">
                <div style="font-weight:700; color:var(--text); font-size:13px;">${t.name}</div>
                <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono);">${t.symbol}</div>
              </td>
              <td style="padding:10px 12px; color:var(--text2); font-size:12px;">${t.broker}</td>
              <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono);">${t.qty}</td>
              <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono);">$${t.sellPrice.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono); color:var(--text3);">$${t.avgCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${pc};">${fmtU(t.pnl)}<div style="font-size:10px; font-weight:400; opacity:0.7;">${t.pnl>=0?'+':''}${roi}%</div></td>
              <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono); color:${pc}; font-size:12px;">${fmtW(t.pnl * t.txFx)}<div style="font-size:9px; opacity:0.55;">@${Math.round(t.txFx).toLocaleString()}</div></td>
            </tr>`;
        }).join('');
    
        const _nonRiaRowsHtml = (nonRiaDetails || []).map(d => {
            const typeColor = d.type === '매수' ? 'var(--red)' : 'var(--blue)';
            const amtColor  = d.calcAmt > 0    ? 'var(--red)' : 'var(--blue)';
            const amtSign   = d.calcAmt > 0    ? '+'          : '';
            const ticker    = d.ticker || d.symbol;
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              <td style="padding:8px 10px; text-align:left; color:var(--text2);">${d.date}</td>
              <td style="padding:8px 10px; text-align:left;">
                <span style="color:var(--text); font-weight:bold;">${d.symbol}</span><br>
                <span style="color:var(--text3); font-size:10px;">${d.broker}</span>
              </td>
              <td style="padding:8px 10px; font-weight:bold; color:${typeColor};">${d.type}</td>
              <td style="padding:8px 10px; color:var(--text2);">${d.weight}%</td>
              <td style="padding:8px 10px; font-family:var(--font-mono); font-weight:bold; color:${amtColor};">
                ${amtSign}${Math.round(d.calcAmt).toLocaleString()}원
              </td>
              <td style="padding:8px 10px; text-align:center;">
                <button onclick="window.toggleRiaExclude('${ticker}', '${year}')"
                  style="padding:2px 7px; font-size:10px; border-radius:4px; border:1px solid rgba(255,77,106,0.4); background:rgba(255,77,106,0.08); color:var(--red); cursor:pointer; font-family:var(--font-sans); transition:0.15s; white-space:nowrap;"
                  onmouseover="this.style.background='rgba(255,77,106,0.2)'"
                  onmouseout="this.style.background='rgba(255,77,106,0.08)'"
                  title="이 종목을 계산에서 제외">✕ 제외</button>
              </td>
            </tr>`;
        }).join('');

        // --- 🌟 추가: 드롭다운용 국내 종목 필터링 로직 ---
        const domesticMap = new Map();
        const nonRiaNames = (nonRiaDetails || []).map(d => d.symbol); 
        const customSet = new Set((state.customOverseasAssets || []).map(s => s.toUpperCase()));

        state.transactions.forEach(tx => {
            if (isKorean(tx.symbol) && tx.qty > 0 && tx.date.startsWith(year)) {
                let sName = tx.symbol;
                if (typeof localStockDB !== 'undefined' && localStockDB.length > 0) {
                    const m = localStockDB.find(x => x.symbol === tx.symbol);
                    if (m) sName = m.name;
                }
                if (cachedMarketData[tx.symbol] && !cachedMarketData[tx.symbol]._failed && cachedMarketData[tx.symbol].name) {
                    sName = cachedMarketData[tx.symbol].name;
                }
                // 수동 지정되었거나 이미 타계좌 목록에 잡힌 종목(ex. '미국' 키워드 등)은 제외
                if (!customSet.has(tx.symbol.toUpperCase()) && 
                    !customSet.has(sName.toUpperCase()) && 
                    !nonRiaNames.includes(sName)) {
                    domesticMap.set(tx.symbol, sName);
                }
            }
        });

        let dropdownOptions = `<option value="">➕ 내 계좌의 다른 국내 종목 추가하기</option>`;
        // 가나다 이름순으로 정렬해서 보기 편하게 만듦
        Array.from(domesticMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([sym, name]) => {
                dropdownOptions += `<option value="${name}">${name} (${sym.replace('.KS', '')})</option>`;
            });
        // ------------------------------------

        overlay.innerHTML = `
        <div class="modal" onclick="event.stopPropagation()"
             style="max-width:1300px; width:95vw; max-height:95vh; display:flex; flex-direction:column; overflow:hidden; padding:0;">
          
          <!-- 상단 헤더 -->
          <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--border); flex-shrink:0;">
            <div>
              <div style="font-size:18px; font-weight:700; color:var(--text);">🇺🇸 ${year}년 미국주식 양도소득세 상세</div>
              <div style="font-size:13px; color:var(--text3); margin-top:2px;">총 ${trades.length}건 매도 · 기본공제 250만원 · 세율 22%</div>
            </div>
            <button class="btn-sm" onclick="document.getElementById('cgYearDetailOverlay').style.display='none'">닫기</button>
          </div>
    
          <!-- 요약 카드 (전체 폭) -->
          <div style="display:flex; gap:10px; padding:12px 20px; background:var(--bg3); border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap;">
            ${[
              ['총 매도차익', '+$'+gainUsd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}), '#00C578'],
              ['총 매도손실', lossUsd>0?'-$'+lossUsd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—', '#3A9AFF'],
              ['순손익 (USD)', fmtU(netUsd), netUsd>=0?'#00C578':'#3A9AFF'],
              ['순손익 (KRW)', fmtW(netKrw), netKrw>=0?'#00C578':'#3A9AFF'],
              ['과세표준',
                (() => {
                  if (taxableKrw <= 0) return '공제 범위 내';
                  let sub = riaDeduction > 0
                    ? `기본공제 −₩250만<br>RIA공제 −₩${Math.round(riaDeduction/10000).toLocaleString()}만`
                    : `기본공제 −₩250만 적용`;
                    return fmtW(taxableKrw) + `<div style="font-size:9px;margin-top:3px;line-height:1.6;color:${riaDeduction>0?'var(--green)':'var(--text3)'};">${sub}</div>`;
                })(),
                taxableKrw > 0 ? '#ff4d6a' : 'var(--text3)'],
              ['예상 세금', taxKrw>0?'₩'+taxKrw.toLocaleString():'납부 없음', taxKrw>0?'#ff4d6a':'var(--text3)'],
            ].map(([label, val, color]) => `
              <div style="flex:1; min-width:110px; background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:10px 12px;">
                <div style="font-size:13px; color:var(--text3); margin-bottom:4px;">${label}</div>
                <div style="font-weight:700; color:${color}; font-family:var(--font-mono); font-size:16px; line-height:1.3;">${val}</div>
              </div>`).join('')}
          </div>

          <!-- 2026년 전용: RIA 특례공제 레이아웃 -->
          ${year === '2026' ? `
          <div style="padding:14px 20px; background:var(--bg3); border-bottom:1px solid var(--border); flex-shrink:0; display:flex; flex-direction:column; gap:12px;">
            
            ${riaDeduction > 0 ? `
            <!-- 1. 상단: 타이틀 및 계산식 (전체 폭) -->
            <div>
              <div style="font-weight:700; color:var(--green); margin-bottom:6px; font-size:15px;">
                📌 RIA 계좌 특례 공제 계산 상세
              </div>
              <div style="font-family:var(--font-mono); color:var(--text3); margin:0; font-size:13px; line-height:1.4; word-break:break-all; background:var(--bg); padding:8px 12px; border-radius:6px; border:1px solid var(--border);">
                계산식: ${riaNote || '—'}
              </div>
            </div>

            <!-- 2. 하단: 좌우 2분할 -->
            <div style="display:flex; gap:14px; align-items:flex-start;">
              
              <!-- 좌측: 타계좌 거래내역 -->
              <div style="flex:1; min-width:0; background:var(--bg); border:1px solid var(--border); border-radius:8px; display:flex; flex-direction:column; overflow:hidden;">
                <div style="padding:10px 14px; font-size:12px; font-weight:700; color:var(--text); border-bottom:1px solid var(--border); background:rgba(255,255,255,0.02);">
                  📋 타계좌(RIA 외) 해외주식 상세 거래 내역
                </div>
                <div style="max-height:280px; overflow-y:auto;" class="custom-scrollbar">
                  <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:right;">
                    <thead style="background:rgba(255,255,255,0.02); color:var(--text3); position:sticky; top:0;">
                      <tr>
                        <th style="padding:6px 10px; text-align:left; border-bottom:1px solid var(--border);">일자</th>
                        <th style="padding:6px 10px; text-align:left; border-bottom:1px solid var(--border);">종목(계좌)</th>
                        <th style="padding:6px 10px; border-bottom:1px solid var(--border);">유형</th>
                        <th style="padding:6px 10px; border-bottom:1px solid var(--border);">가중치</th>
                        <th style="padding:6px 10px; border-bottom:1px solid var(--border);">반영금액(KRW)</th>
                        <th style="padding:6px 10px; border-bottom:1px solid var(--border);">제외</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${_nonRiaRowsHtml || '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text3);">내역이 없습니다.</td></tr>'}
                    </tbody>
                  </table>
                </div>
                ${(() => {
                    const totalBuy  = (nonRiaDetails||[]).filter(d=>d.calcAmt>0).reduce((s,d)=>s+d.calcAmt,0);
                    const totalSell = (nonRiaDetails||[]).filter(d=>d.calcAmt<0).reduce((s,d)=>s+Math.abs(d.calcAmt),0);
                    const net = totalBuy - totalSell;
                    const fmt = v => { const a=Math.abs(v); if(a>=100000000) return '₩'+(a/100000000).toFixed(1)+'억'; if(a>=10000) return '₩'+Math.round(a/10000).toLocaleString()+'만'; return '₩'+Math.round(a).toLocaleString(); };
                    const netColor = net>0?'var(--red)':net<0?'var(--blue)':'var(--text3)';
                    return `<div style="padding:8px 14px; border-top:1px solid var(--border); background:rgba(255,255,255,0.025); display:flex; gap:16px; flex-wrap:wrap; font-size:14px; flex-shrink:0; align-items:center;">
                        <span style="color:var(--text3); font-weight:700;">합계</span>
                        <span>총 매수 <b style="color:var(--red); font-family:var(--font-mono);">+${fmt(totalBuy)}</b></span>
                        <span style="color:var(--border);">|</span>
                        <span>총 매도 <b style="color:var(--blue); font-family:var(--font-mono);">-${fmt(totalSell)}</b></span>
                        <span style="color:var(--border);">|</span>
                        <span>순매수 <b style="color:${netColor}; font-family:var(--font-mono);">${net>=0?'+':'-'}${fmt(Math.abs(net))}</b></span>
                    </div>`;
                })()}
                
              ${(state.riaExcludeSymbols||[]).length > 0 ? `
                <div style="padding:8px 12px; border-top:1px solid rgba(255,77,106,0.2); background:rgba(255,77,106,0.04); flex-shrink:0;">
                  <div style="font-size:10px; color:var(--text3); font-weight:700; margin-bottom:5px;">🚫 제외된 종목 (클릭하면 복원)</div>
                  <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    ${(state.riaExcludeSymbols||[]).map(sym => {
                        let symName = sym;
                        if (localStockDB && localStockDB.length > 0) { const m = localStockDB.find(s => s.symbol === sym); if (m) symName = m.name; }
                        if (cachedMarketData[sym] && !cachedMarketData[sym]._failed && cachedMarketData[sym].name) symName = cachedMarketData[sym].name;
                        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;border:1px solid rgba(255,77,106,0.3);background:rgba(255,77,106,0.08);font-size:11px;color:var(--red);">
                          ${symName}
                          <button onclick="window.toggleRiaExclude('${sym}','${year}')"
                            style="background:none;border:none;color:var(--green);cursor:pointer;font-size:12px;padding:0;line-height:1;font-weight:700;" title="제외 취소 (복원)">↩</button>
                        </span>`;
                    }).join('')}
                  </div>
                </div>` : ''}
              </div>

              <!-- 우측: 수동 지정 & 적용 결과 -->
              <div style="flex:0 0 380px; display:flex; flex-direction:column; gap:12px;">
                
                <!-- 🌟 수정: 수동 지정 UI (드롭다운 포함) -->
                <div style="padding:12px 14px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
                   <div style="font-weight:700; color:var(--text); font-size:12px; margin-bottom:4px;">🌐 국내 상장 해외자산 수동 지정</div>
                   <div style="font-size:10px; color:var(--text3); margin-bottom:8px; line-height:1.4;">
                     자동 계산에 포함되지 않는 국내 상장 해외 ETF 등을 수동으로 추가합니다. (종목 선택 또는 쉼표 구분 입력)
                   </div>
                   <div style="display:flex; flex-direction:column; gap:6px;">
                     <!-- 드롭다운 메뉴 -->
                     <select class="form-input" style="height:28px; font-size:11px; padding:0 8px; cursor:pointer; background:var(--bg2); border:1px solid var(--border);"
                             onchange="
                               const val = this.value; 
                               if(!val) return; 
                               const inp = document.getElementById('inputCustomOverseasModal');
                               let arr = inp.value.split(',').map(s=>s.trim()).filter(Boolean);
                               if(!arr.includes(val)) { arr.push(val); inp.value = arr.join(', '); }
                               this.value = '';
                             ">
                       ${dropdownOptions}
                     </select>
                     <!-- 텍스트 입력 및 저장 버튼 -->
                     <div style="display:flex; gap:6px;">
                       <input type="text" id="inputCustomOverseasModal" class="form-input" style="flex:1; height:28px; font-size:11px; margin:0; background:var(--bg2);" placeholder="직접 입력 시 쉼표 구분" value="${(state.customOverseasAssets || []).join(', ')}">
                       <button class="btn-sm" style="background:var(--accent); color:#fff; font-weight:bold; height:28px; padding:0 12px; border:none;" onclick="window.saveCustomOverseasModal('${year}')">저장</button>
                     </div>
                   </div>
                </div>

                <!-- 적용 결과 UI -->
                <div style="padding:10px 14px; background:var(--bg); border:1px solid var(--border); border-radius:8px; flex:1; display:flex; flex-direction:column; justify-content:center;">
                    <div style="font-weight:700; color:var(--green); margin-bottom:8px; font-size:12px;">📌 RIA 계좌 특례공제 적용 결과</div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                      <div style="background:rgba(0,200,122,0.05); border:1px solid rgba(0,200,122,0.2); border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11.5px; color:var(--text2); font-weight:bold;">RIA 조정 공제</span>
                        <b style="color:var(--green); font-family:var(--font-mono); font-size:14px;">−₩${Math.round(riaDeduction/10000).toLocaleString()}만</b>
                      </div>
                      <div style="background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11.5px; color:var(--text2);">기본공제</span>
                        <b style="font-family:var(--font-mono); font-size:13px; color:var(--text);">−₩250만</b>
                      </div>
                      <div style="background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11.5px; color:var(--text2);">과세표준</span>
                        <b style="color:#ff4d6a; font-family:var(--font-mono); font-size:13px;">${taxableKrw > 0 ? fmtW(taxableKrw) : '공제 범위 내'}</b>
                      </div>
                      <div style="background:rgba(255,77,106,0.05); border:1px solid rgba(255,77,106,0.2); border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11.5px; color:var(--text2); font-weight:bold;">예상 세금 (22%)</span>
                        <b style="color:#ff4d6a; font-family:var(--font-mono); font-size:14.5px;">${taxKrw > 0 ? '₩' + taxKrw.toLocaleString() : '납부 없음'}</b>
                      </div>
                    </div>
                </div>

            </div>
          </div>
            ` : `
            <div style="padding:10px 12px; background:rgba(255,183,3,0.06); border:1px solid rgba(255,183,3,0.18); border-radius:8px; font-size:11px; color:var(--text2); line-height:1.8;">
              ⚙️ <b>RIA 계좌 미설정</b> — 2026년 특례공제를 자동 계산하려면
              <span style="color:var(--accent); text-decoration:underline; cursor:pointer;"
                onclick="document.getElementById('cgYearDetailOverlay').style.display='none'; openMasterSettingsModal()">
                설정에서 RIA 계좌를 등록
              </span>하세요.
              <div style="margin-top:5px; font-size:10px; color:var(--text3);">
                💡 공제 공식: RIA 매도이익 × (1 − 비RIA 순매수 ÷ RIA 매도금액) &nbsp;|&nbsp; 가중치: 1~5월 ×1.0 / 6~7월 ×0.8 / 8월~ ×0.5
              </div>
            </div>
            `}
          </div>
          ` : ''}

          <!-- 일반 미국주식 거래내역 (하단 전체 폭) -->
          <div style="flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg);">
             <div style="padding:14px 20px; font-weight:700; color:var(--text); font-size:13px; border-bottom:1px solid var(--border); background:var(--bg3); flex-shrink:0;">
                🇺🇸 일반 미국주식 매도 거래내역
             </div>
             <div style="flex:1; overflow-y:auto;" class="custom-scrollbar">
               <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
                 <thead style="position:sticky; top:0; background:rgba(255,255,255,0.03); z-index:1; backdrop-filter:blur(5px);">
                   <tr style="border-bottom:1px solid var(--border);">
                     ${['날짜','종목','계좌','수량','매도가','평단가','손익 (USD)','손익 (KRW)'].map(
                       (h,i) => `<th style="padding:10px 14px; text-align:${i>=3?'right':'left'}; font-weight:600; color:var(--text3); white-space:nowrap;">${h}</th>`
                     ).join('')}
                   </tr>
                 </thead>
                 <tbody>${rowsHtml || '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3);">거래 내역이 없습니다.</td></tr>'}</tbody>
               </table>
             </div>
             <!-- 하단 경고 문구 -->
             <div style="padding:10px 20px; font-size:10px; color:var(--text3); border-top:1px solid var(--border); background:var(--bg3); line-height:1.7; flex-shrink:0;">
               ⚠️ 참고용 추정치입니다. 실제 신고 시 환율 기준일(매도일 기준 대고객 매매기준율), 해외 원천징수세액 공제 등을 반드시 확인하세요.
             </div>
          </div>
          
        </div>`;
        
    overlay.style.display = 'flex';
    }

    // 인라인 패널: 올해만 표시 + 더 보기 버튼
    panel.innerHTML = `
    <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="stat-flag">📋</span>
                <div class="stat-market-label">${thisYear}년 양도소득세</div>
            </div>
            <button onclick="if(typeof window._openCgTaxModal==='function') window._openCgTaxModal(); else alert('데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.')"
                style="font-size:10px; color:var(--accent); background:none; border:none; cursor:pointer; padding:0; font-family:var(--font-sans); white-space:nowrap;">
                전체 보기 ▶
            </button>
        </div>
        ${curRowHtml}
        <div style="font-size:9px; color:var(--text3); margin-top:4px;">공제 250만 · 세율 22% · 거래일 환율 적용</div>
    </div>`;
}

// 🌟 실현수익 콤보 차트 (최종 수정본 - 에러 완벽 해결)
function renderRealizedChart(labels, lineData, barData, txInfo = []) {
    const canvas = document.getElementById('realizedChartCanvas');
    if (!canvas) return;
    if (realizedChartInst) { realizedChartInst.destroy(); realizedChartInst = null; }

    const barColors = barData.map(val => val >= 0 ? 'rgba(0,200,122,0.75)' : 'rgba(255,77,106,0.75)');
    const barBorderColors = barData.map(val => val >= 0 ? '#00C578' : '#ff4d6a');
    const absBarData = barData.map(v => Math.abs(v));

    realizedChartInst = new Chart(canvas.getContext('2d'), {
        type: 'bar', // 🌟 이 부분이 추가되었습니다! (콤보 차트의 기본 바탕 타입)
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: '누적 실현수익',
                    data: lineData,
                    borderColor: '#7c6af7',
                    borderWidth: 3,
                    pointRadius: 2,
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'y-cumulative',
                    order: 1
                },
                {
                    type: 'bar',
                    label: '개별 매매 손익',
                    data: absBarData,
                    backgroundColor: barColors,
                    borderColor: barBorderColors,
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y-individual',
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            // 🌟 차트 클릭 시 표 필터링
            onClick: function(event, elements) {
                if (elements && elements.length > 0) {
                    const clickedIndex = elements[0].index;
                    updateRealizedFilter('tradeIdx', clickedIndex);
                }
            },
            // 🌟 마우스 오버 시 포인터(손가락) 모양 변경 (안전한 코드 적용)
            onHover: function(event, elements) {
                if (event.native && event.native.target) {
                    event.native.target.style.cursor = (elements && elements.length > 0) ? 'pointer' : 'default';
                }
            },
            plugins: {
                legend: { 
                    display: true, 
                    position: 'top',
                    labels: { color: '#8890a4', font: { size: 11 }, usePointStyle: true } 
                },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            const idx = items[0]?.dataIndex;
                            const dayInfo = txInfo[idx];
                            if (!dayInfo || !dayInfo.trades) return items[0]?.label || '';
                            if (dayInfo.trades.length === 1) {
                                return `${items[0]?.label}  |  ${dayInfo.trades[0].name} (${dayInfo.trades[0].symbol})`;
                            }
                            return `${items[0]?.label}  |  ${dayInfo.trades.length}건 매도`;
                        },
                        label: function(ctx) {
                            const dayInfo = txInfo[ctx.dataIndex];
                            if (ctx.dataset.label === '개별 매매 손익') {
                                const origVal = barData[ctx.dataIndex] || 0;
                                if (origVal === 0) return null;
                                const fmtKrw = v => {
                                    const a = Math.abs(v), s = v >= 0 ? '+' : '-';
                                    if (a >= 100000000) return s + '₩' + (a/100000000).toFixed(1) + '억';
                                    if (a >= 10000) return s + '₩' + Math.round(a/10000).toLocaleString() + '만';
                                    return s + '₩' + Math.round(a).toLocaleString();
                                };
                                const sign = origVal >= 0 ? '▲ ' : '▼ ';
                                const lines = [`💰 일별 실현수익: ${sign}${fmtKrw(origVal)}`];
                                if (dayInfo && dayInfo.trades) {
                                    dayInfo.trades.forEach(t => {
                                        const tSign = t.pnl >= 0 ? '+' : '-';
                                        const pnlAmt = Math.abs(t.pnlKrw);
                                        let krwStr = pnlAmt >= 10000
                                            ? tSign + '₩' + Math.round(pnlAmt / 10000).toLocaleString() + '만'
                                            : tSign + '₩' + Math.round(pnlAmt).toLocaleString();
                                        const usdStr = !t.isKr
                                            ? `  (${t.pnl >= 0 ? '+' : ''}$${Math.abs(t.pnl).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})})`
                                            : '';
                                        const flag = t.isKr ? '🇰🇷' : '🇺🇸';
                                        lines.push(`  📌 ${flag} ${t.name} (${t.qty}주)  →  ${krwStr}${usdStr}`);
                                    });
                                }
                                return lines;
                            }
                            return `${ctx.dataset.label}: ₩${Math.round(ctx.raw).toLocaleString()}`;
                        },
                        afterLabel: function(ctx) {
                            if (ctx.dataset.label !== '개별 매매 손익') return '';
                            const dayInfo = txInfo[ctx.dataIndex];
                            if (!dayInfo || !dayInfo.trades) return '';
                            const lines = [];
                            dayInfo.trades.forEach(tx => {
                                if (tx.isKr) {
                                    lines.push(`     🇰🇷 매도 ₩${Math.round(tx.sellPrice).toLocaleString()} / 평단 ₩${Math.round(tx.avgCost).toLocaleString()}`);
                                } else {
                                    lines.push(`     🇺🇸 매도 $${tx.sellPrice.toFixed(2)} / 평단 $${tx.avgCost.toFixed(2)}`);
                                    if (tx.txFxRate) {
                                        const krwAmt = Math.abs(tx.pnlKrw);
                                        const krwSign = tx.pnlKrw >= 0 ? '+' : '-';
                                        const krwStr = krwAmt >= 10000
                                            ? krwSign + '₩' + Math.round(krwAmt / 10000).toLocaleString() + '만'
                                            : krwSign + '₩' + Math.round(krwAmt).toLocaleString();
                                        lines.push(`        ↳ 환율 @${Math.round(tx.txFxRate).toLocaleString()} → ${krwStr}`);
                                    }
                                }
                                if (tx.owner) lines.push(`     👤 ${tx.owner}  |  ${tx.broker}`);
                            });
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    ticks: { color: '#555e72', maxTicksLimit: 10 }, 
                    grid: { display: false } 
                },
                'y-cumulative': {
                    type: 'linear',
                    position: 'left',
                    ticks: { 
                        color: '#7c6af7', 
                        callback: function(v) { return (v/10000).toLocaleString() + '만'; } 
                    },
                    title: { display: true, text: '누적 수익', color: '#7c6af7', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                'y-individual': {
                    type: 'linear',
                    position: 'right',
                    ticks: { 
                        color: '#8890a4',
                        callback: function(v) { return (v/10000).toLocaleString() + '만'; }
                    },
                    title: { display: true, text: '개별 손익', color: '#8890a4', font: { size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
}

/**
 * 실현수익 Sankey 패널 (전체보기 버튼 복구 및 부드러운 곡선 UI 적용)
 */
function updateRfpSankey(krwTotal, usdTotalKrw) {
  let container = document.getElementById('newSankeyContainer');

  if (!container) {
    const oldSvg = document.getElementById('rfpSankeySvg');
    if (!oldSvg) return;

    let parent = oldSvg.parentElement;
    while(parent && parent.tagName !== 'BODY') {
        if (parent.querySelector('#rfpRatioKrFill') || parent.querySelector('.rfp-tax-wrap')) break;
        parent = parent.parentElement;
    }
    if(!parent || parent.tagName === 'BODY') parent = oldSvg.parentElement.parentElement;

    container = document.createElement('div');
    container.id = 'newSankeyContainer';
    container.style.cssText = 'width:100%; min-width:0; box-sizing:border-box;';
    parent.parentNode.replaceChild(container, parent);
  }

  // 3️⃣ 양도소득세 및 순수익 계산 (기본공제 250만 원, 22% 세율)
  const combinedTotal = krwTotal + usdTotalKrw;
  const totalColor = combinedTotal >= 0 ? 'var(--profit)' : 'var(--loss)';
  const krColor    = krwTotal     >= 0 ? 'var(--profit)' : 'var(--loss)';
  const usColor    = usdTotalKrw  >= 0 ? 'var(--profit)' : 'var(--loss)';

  const _fmt = v => {
    const abs = Math.abs(v), s = v >= 0 ? '+' : '-';
    if (abs >= 100000000) return s + '₩' + (abs/100000000).toFixed(1) + '억';
    if (abs >= 10000)     return s + '₩' + Math.round(abs/10000).toLocaleString() + '만';
    return s + '₩' + Math.round(abs).toLocaleString();
  };

  const absKr = Math.abs(krwTotal), absUs = Math.abs(usdTotalKrw);
  const grandAbs = absKr + absUs;
  const krPct = grandAbs > 0 ? Math.round(absKr / grandAbs * 100) : 50;
  const usPct = 100 - krPct;

  container.innerHTML = `
    <div class="stat-banner" style="margin-bottom:15px; flex-shrink:0; align-items:stretch;">
      <div class="stat-banner-accent" style="background:${totalColor};"></div>

      <div class="stat-banner-total">
        <div class="stat-banner-label">
          <span class="stat-dot" style="background:${totalColor};"></span>
          합산 손익
        </div>
        <div style="font-family:var(--font-mono); font-size:22px; font-weight:700; color:${totalColor}; margin-top:6px; line-height:1.2;">${_fmt(combinedTotal)}</div>
        <div style="font-size:10px; color:var(--text3); margin-top:5px;">국내 + 해외 합산</div>
      </div>

      <div class="stat-banner-right">
        <div class="stat-markets" style="align-items:stretch;">

          <!-- 국내주식 -->
          <div class="stat-market">
            <span class="stat-flag">🇰🇷</span>
            <div class="stat-market-info">
              <div class="stat-market-label">국내주식</div>
              <div class="stat-market-val" style="color:${krColor};">${_fmt(krwTotal)}</div>
            </div>
          </div>

          <!-- 미국주식 + 양도세 -->
          <div class="stat-market" style="flex-direction:column; align-items:stretch; gap:0;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="stat-flag">🇺🇸</span>
              <div class="stat-market-info">
                <div class="stat-market-label">미국주식 순수익</div>
                <div class="stat-market-val" style="color:${usColor};">${_fmt(usdTotalKrw)}</div>
              </div>
            </div>
            <div id="capitalGainsTaxPanel" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border);"></div>
          </div>

        </div>

        <!-- 비중 바 -->
        <div class="stat-ratio-row">
          <div class="stat-ratio-bar">
            <div class="stat-ratio-kr-fill" id="rfpRatioKrFill" style="width:${krPct}%; background:var(--profit);"></div>
            <div class="stat-ratio-us-fill" style="background:var(--loss);"></div>
          </div>
          <div class="stat-ratio-pcts">
            <span style="color:var(--profit);">🇰🇷 ${krPct}%</span>
            <span style="color:var(--loss);">${usPct}% 🇺🇸</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 🌟 주가 캐시 수동 최신화 및 마지막 업데이트 시간 표시 기능
// ==========================================

// 1. 수동으로 최신화하는 함수
function forceMarketDataUpdate() {
    if(confirm("현재 캐시된 주가 데이터를 지우고 증권 서버에서 최신 주가를 다시 받아오시겠습니까?\n(종목 수에 따라 몇 초 정도 소요될 수 있습니다.)")) {
        // 임시 저장된 데이터 강제 삭제
        localStorage.removeItem('sw_market_cache');
        localStorage.removeItem('sw_market_cache_time');
        
        // 메모리에 있는 기존 캐시 비우기
        cachedMarketData = {};
        
        alert("최신 주가를 받아옵니다. 화면이 새로고침됩니다.");
        // 페이지를 아예 새로고침하여 처음부터 다시 로딩하게 만듦
        location.reload();
    }
}

// 2. 화면에 마지막 업데이트 시간을 예쁘게 표시해 주는 함수
function updateLastSyncTimeDisplay() {
    const timeDisplay = document.getElementById('marketDataLastUpdated');
    if (!timeDisplay) return;

    const cacheTimeStr = localStorage.getItem('sw_market_cache_time');
    if (!cacheTimeStr) {
        timeDisplay.innerHTML = `<span style="color:var(--text2)">방금 막 최신화됨</span>`;
        return;
    }

    const cacheTime = parseInt(cacheTimeStr);
    const now = Date.now();
    const diffMin = Math.floor((now - cacheTime) / 60000);

    if (diffMin < 1) {
        timeDisplay.innerHTML = `<span style="color:var(--text2)">방금 막 최신화됨</span>`;
    } else if (diffMin < 60) {
        timeDisplay.innerHTML = `마지막 업데이트: <span style="color:var(--text2); font-weight:bold;">${diffMin}분 전</span>`;
    } else {
        const diffHour = Math.floor(diffMin / 60);
        timeDisplay.innerHTML = `마지막 업데이트: <span style="color:var(--text2); font-weight:bold;">${diffHour}시간 전</span>`;
    }
}

// 화면을 다시 그릴 때(렌더링 시) 시간 표시도 함께 업데이트하도록 인터셉트!
const originalRender = render;
render = async function() {
    await originalRender();
    updateLastSyncTimeDisplay();
};

// ==========================================
// 🔀 거래장부 — 계좌 이동 전용 함수
// ==========================================

function populateLedgerTransferFrom() {
    const rawSym = document.getElementById('txSymbol').value.trim().toUpperCase();
    const fromSelect = document.getElementById('txTransferFrom');
    const infoEl    = document.getElementById('txTransferFromInfo');
    if (!fromSelect) return;

    if (!rawSym) {
        fromSelect.innerHTML = '<option value="">먼저 종목을 선택하세요</option>';
        if (infoEl) infoEl.textContent = '';
        return;
    }

    // DB 매칭으로 정확한 심볼 확정
    let sym = rawSym;
    if (localStockDB && localStockDB.length > 0) {
        const m = localStockDB.find(s => s.symbol.toUpperCase() === rawSym || s.name.replace(/\s+/g,'').toUpperCase() === rawSym);
        if (m) sym = m.symbol;
    }
    if (/^\d{6}$/.test(sym)) sym += '.KS';

    const holdings = calculateHoldings('all');
    const matches = Object.values(holdings).filter(h => h.symbol === sym && h.qty > 0);

    if (matches.length === 0) {
        fromSelect.innerHTML = `<option value="">보유 내역 없음 (${sym})</option>`;
        if (infoEl) infoEl.textContent = '';
        return;
    }

    fromSelect.innerHTML = '<option value="">출발 계좌 선택...</option>' +
        matches.map(h =>
            `<option value="${h.broker}" data-qty="${h.qty}" data-avg="${h.avg}">` +
            `${h.broker}  ·  ${h.qty}주  /  평단 ${formatPrice(h.avg, sym)}</option>`
        ).join('');

    onLedgerTransferFromChange();
}

function onLedgerTransferFromChange() {
    const rawSym = document.getElementById('txSymbol').value.trim().toUpperCase();
    let sym = rawSym;
    if (/^\d{6}$/.test(sym)) sym += '.KS';

    const fromSelect = document.getElementById('txTransferFrom');
    const opt  = fromSelect.options[fromSelect.selectedIndex];
    const infoEl = document.getElementById('txTransferFromInfo');

    if (!opt || !opt.dataset.qty) {
        if (infoEl) infoEl.textContent = '';
        return;
    }
    const qty = parseFloat(opt.dataset.qty);
    const avg = parseFloat(opt.dataset.avg);
    document.getElementById('txQty').value = qty;
    document.getElementById('txQty').max   = qty;
    if (infoEl) infoEl.textContent = `${qty}주 보유  ·  평단 ${formatPrice(avg, sym)}`;
}

function applyLedgerTransfer() {
    const rawSym   = document.getElementById('txSymbol').value.trim().toUpperCase();
    const date     = document.getElementById('txDate').value;
    const ownerKey = document.querySelector('input[name="txOwner"]:checked').value;
    const owner    = state.owners[ownerKey].name;
    const fromSelect = document.getElementById('txTransferFrom');
    const fromBroker = fromSelect.value;
    const toBroker   = document.getElementById('txBroker').value.trim();
    const qty  = parseFloat(document.getElementById('txQty').value);

    if (!rawSym || !date) { alert('종목과 날짜를 입력해주세요.'); return; }
    if (!fromBroker)       { alert('출발 계좌를 선택해주세요.'); return; }
    if (!toBroker)         { alert('도착 계좌를 입력해주세요.'); return; }
    if (!qty || qty <= 0)  { alert('이동할 수량을 입력해주세요.'); return; }
    if (fromBroker === toBroker) { alert('출발 계좌와 도착 계좌가 같습니다.'); return; }

    let sym = rawSym;
    if (localStockDB && localStockDB.length > 0) {
        const m = localStockDB.find(s => s.symbol.toUpperCase() === rawSym);
        if (m) sym = m.symbol;
    }
    if (/^\d{6}$/.test(sym)) sym += '.KS';

    const opt    = fromSelect.options[fromSelect.selectedIndex];
    const avgCost = parseFloat(opt?.dataset?.avg) || 0;
    const maxQty  = parseFloat(opt?.dataset?.qty) || 0;

    if (qty > maxQty) { alert(`이전 가능 수량은 최대 ${maxQty}주입니다.`); return; }

    const now = Date.now();
    state.transactions.push({ id: now,     date: formatDate(date), owner, broker: fromBroker, symbol: sym, qty: -qty, price: avgCost, txType: 'transfer' });
    state.transactions.push({ id: now + 1, date: formatDate(date), owner, broker: toBroker,   symbol: sym, qty:  qty, price: avgCost, txType: 'transfer' });
    if (!state.tickers.includes(sym)) state.tickers.push(sym);

    // 폼 초기화
    document.getElementById('txSymbol').value = '';
    document.getElementById('txQty').value    = '';
    document.getElementById('txBroker').value = '';
    document.getElementById('txTransferFrom').innerHTML = '<option value="">먼저 종목을 선택하세요</option>';
    document.getElementById('txTransferFromInfo').textContent = '';

    saveState(); renderTxList();
    if (currentView === 'history') renderHistoryDashboard(); else render();
    triggerAutoSync();
    alert(`✅ 이동 완료\n${sym} ${qty}주\n[${fromBroker}] → [${toBroker}]\n평단가 ${formatPrice(avgCost, sym)} 유지`);
}


// ==========================================
// ✂️ 거래장부 — 액면분할 전용 함수
// ==========================================

function updateLedgerSplitPreview() {
    const rawSym   = document.getElementById('txSymbol').value.trim().toUpperCase();
    const ratioOld = parseFloat(document.getElementById('txSplitOld').value) || 1;
    const ratioNew = parseFloat(document.getElementById('txSplitNew').value);
    const previewEl = document.getElementById('txSplitPreview');
    if (!previewEl) return;

    if (!rawSym || !ratioNew || ratioNew <= 0 || ratioNew === ratioOld) {
        previewEl.innerHTML = ''; return;
    }

    let sym = rawSym;
    if (/^\d{6}$/.test(sym)) sym += '.KS';

    const factor = ratioNew / ratioOld;
    const txs = state.transactions.filter(t => t.symbol === sym && t.txType !== 'dividend' && t.txType !== 'transfer');
    const totalQty = txs.reduce((s, t) => s + t.qty, 0);
    const newQty   = Math.round(totalQty * factor * 10000) / 10000;
    const sample   = txs.find(t => t.qty > 0);

    previewEl.innerHTML = `
      <div style="background:rgba(124,106,247,0.12); border:1px solid rgba(124,106,247,0.3); border-radius:6px; padding:10px; line-height:1.8;">
        <div style="color:var(--text2);">보유 수량 &nbsp;<b style="color:var(--text)">${totalQty}주</b> → <b style="color:var(--green)">${newQty}주</b></div>
        ${sample ? `<div style="color:var(--text2);">단가 예시 &nbsp;<b style="color:var(--text)">${formatPrice(sample.price, sym)}</b> → <b style="color:var(--blue)">${formatPrice(Math.round(sample.price / factor * 1000)/1000, sym)}</b></div>` : ''}
        <div style="color:var(--text3); font-size:10px; margin-top:4px;">✂️ 기준일 이전 거래 ${txs.length}건에 일괄 적용</div>
      </div>`;
}

function applyLedgerSplit() {
    const rawSym   = document.getElementById('txSymbol').value.trim().toUpperCase();
    const date     = document.getElementById('txDate').value;
    const ratioOld = parseFloat(document.getElementById('txSplitOld').value) || 1;
    const ratioNew = parseFloat(document.getElementById('txSplitNew').value);

    if (!rawSym || !date)              { alert('종목과 기준일을 입력해주세요.'); return; }
    if (!ratioNew || ratioNew <= 0)    { alert('신 주식 수를 입력해주세요.'); return; }
    if (ratioNew === ratioOld)         { alert('분할 비율이 1:1입니다. 변경사항이 없습니다.'); return; }

    let sym = rawSym;
    if (localStockDB && localStockDB.length > 0) {
        const m = localStockDB.find(s => s.symbol.toUpperCase() === rawSym);
        if (m) sym = m.symbol;
    }
    if (/^\d{6}$/.test(sym)) sym += '.KS';

    const formattedDate = formatDate(date);
    const factor = ratioNew / ratioOld;

    if (!confirm(
        `${sym} 액면분할을 적용합니다.\n\n` +
        `비율: ${ratioOld} : ${ratioNew}  (×${factor.toFixed(4)})\n` +
        `기준일: ${formattedDate} 이전 내역 일괄 수정\n\n` +
        `⚠️ 이 작업은 되돌릴 수 없습니다.`
    )) return;

    let count = 0;
    state.transactions.forEach(tx => {
        if (tx.symbol !== sym) return;
        if (tx.txType === 'dividend' || tx.txType === 'transfer') return;
        if (tx.date > formattedDate) return;
        tx.qty   = Math.round(tx.qty   * factor * 100000) / 100000;
        tx.price = Math.round(tx.price / factor * 100000) / 100000;
        count++;
    });

    if (!state.splitEvents) state.splitEvents = [];
    state.splitEvents.push({ symbol: sym, date: formattedDate, ratioOld, ratioNew, appliedAt: new Date().toISOString() });

    delete cachedMarketData[sym]; // 주가 재조회

    // 폼 초기화
    document.getElementById('txSymbol').value   = '';
    document.getElementById('txSplitOld').value = 1;
    document.getElementById('txSplitNew').value = '';
    document.getElementById('txSplitPreview').innerHTML = '';

    saveState(); renderTxList();
    if (currentView === 'history') renderHistoryDashboard(); else render();
    triggerAutoSync();
    alert(`✅ 액면분할 완료\n${sym}  ${ratioOld}:${ratioNew} 분할 적용\n총 ${count}건 수정됨`);
}
// ==========================================
// 🌓 테마 (다크/라이트 모드) 토글
// ==========================================

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  // 로고 이미지 전환
  const logo = document.getElementById('logoImg');
  if (logo) logo.src = theme === 'light' ? '/img/logo_light_tp.png' : '/img/logo_dark_tp.png';
  localStorage.setItem('app_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ==========================================
// 📱 모바일 메뉴 (드로어)
// ==========================================

function openMobileMenu() {
  const drawer = document.getElementById('mobileNavDrawer');
  if (drawer) drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  const drawer = document.getElementById('mobileNavDrawer');
  if (drawer) drawer.classList.remove('open');
  document.body.style.overflow = '';
}

// 모바일 하단 탭바 active 상태 동기화
function syncMobileTabBar(view) {
  const map = { all: 'mbTabAll', watch: 'mbTabWatch', history: 'mbTabHistory' };
  document.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
  if (map[view]) {
    const el = document.getElementById(map[view]);
    if (el) el.classList.add('active');
  }
  // 드로어 탭도 동기화
  const drawerMap = {
    all: 'mDrawerTabAll', user1: 'mDrawerTabUser1', user2: 'mDrawerTabUser2',
    watch: 'mDrawerTabWatch', history: 'mDrawerTabHistory',
    realized: 'mDrawerTabRealized', dividend: 'mDrawerTabDividend'
  };
  document.querySelectorAll('.mobile-nav-panel .vtab').forEach(b => b.classList.remove('active'));
  if (drawerMap[view]) {
    const el = document.getElementById(drawerMap[view]);
    if (el) el.classList.add('active');
  }
}

// 사이드바 모바일 열기/닫기 패치
const _origToggleSidebar = typeof toggleSidebar === 'function' ? toggleSidebar : null;
if (_origToggleSidebar) {
  toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    if (isMobile && sidebar) {
      sidebar.classList.toggle('mobile-open');
    } else {
      _origToggleSidebar();
    }
  };
}

// ==========================================
// 🚀 초기화 (DOMContentLoaded)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 툴팁 글자 크기 2배 (Chart.js 기본값: title 14px → 28px, body 12px → 24px)
  Chart.defaults.plugins.tooltip.titleFont = { size: 20 };
  Chart.defaults.plugins.tooltip.bodyFont  = { size: 16 };
  Chart.defaults.plugins.tooltip.footerFont = { size: 16 };

  // 저장된 테마 복원 (없으면 시스템 설정 따름)
  const saved = localStorage.getItem('app_theme');
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // 시스템 테마 변경 감지 (사용자가 직접 설정한 경우 무시)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('app_theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  // 모바일 사이드바 닫기: 사이드바 바깥 터치 시
  document.addEventListener('click', e => {
    if (window.innerWidth > 768) return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (sidebar.classList.contains('mobile-open') &&
        !sidebar.contains(e.target) &&
        !e.target.closest('#btnOpenSidebar') &&
        !e.target.closest('.mobile-tab-btn')) {
      sidebar.classList.remove('mobile-open');
    }
  });
});

// setView 함수 래핑: 모바일 탭바 동기화
const _origSetView = typeof setView === 'function' ? setView : null;
if (_origSetView) {
  setView = function(view, el) {
    _origSetView(view, el);
    syncMobileTabBar(view);
  };
}



// ============================================================
// 🎓 Two the Moon 튜토리얼 시스템 (app.js 맨 아래에 통째로 붙여넣기)
// ============================================================

(function() {
'use strict';

// ── 상수 & 상태 ────────────────────────────────────────────
const TUTORIAL_DONE_KEY = 'ttm_tutorial_done_v1';
let tutorialActive = false;
let currentStep    = 0;

// ── 스텝 정의 ──────────────────────────────────────────────
// target: CSS 선택자 | 'center': 화면 중앙에 표시 (요소 없음)
// arrow: 'top' | 'bottom' | 'left' | 'right' (툴팁 꼬리 방향)
// position: 툴팁의 기준 위치 (auto 계산)
const STEPS = [
    {
        target: 'nav',
        arrow: 'top',
        icon: '🗺️',
        label: '01 — 네비게이션',
        title: '상단 메뉴로 화면을 전환하세요',
        body: '상단 탭(전체보기·소유자별·관심종목·거래내역·실현수익·배당통계)을 클릭해 각 대시보드로 이동할 수 있어요.',
        tip: '💡 검색창에서 티커를 입력하고 ＋를 눌러 관심 종목을 추가하세요',
    },
    {
        target: '#sidebar',
        arrow: 'left',
        icon: '✏️',
        label: '02 — 거래 장부',
        title: '좌측 장부에서 매수·매도를 기록하세요',
        body: '소유자, 거래 유형(매수/매도/배당/이동/분할), 종목, 수량, 단가를 입력하면 전체 포트폴리오에 즉시 반영됩니다.',
        tip: '💡 계좌명을 입력하면 계좌별 수익률도 분리해서 확인할 수 있어요',
    },
    {
        target: '#dashboardTopWrapper',
        arrow: 'top',
        icon: '📊',
        label: '03 — 통합 자산 패널',
        title: '내 전체 자산 현황을 한눈에 확인하세요',
        body: '국내·해외 주식의 투자 원금, 현재 평가액, 수익률을 실시간으로 집계합니다. "현재 보유 / 누적 자산" 버튼으로 실현수익까지 포함한 누적 자산을 볼 수 있어요.',
        tip: '💡 우측 포트폴리오 맵에서 종목별 비중을 시각적으로 확인하세요',
    },
    {
        target: '#portfolioChartWrapper',
        arrow: 'bottom',
        icon: '📈',
        label: '04 — 자산 성장 추이',
        title: '투자 원금 대비 평가액 흐름을 추적하세요',
        body: '시간 흐름에 따른 총 투자액과 총 평가액을 영역 차트로 보여줍니다. 차트 위를 드래그하면 원하는 구간을 확대할 수 있어요.',
        tip: '💡 초록 막대 = 익절, 파랑 막대 = 손절로 건별 실현수익도 표시됩니다',
    },
    {
        target: '.vtab[onclick*="history"]',
        arrow: 'top',
        icon: '📜',
        label: '05 — 거래 내역',
        title: '전체 거래 이력을 필터링해서 조회하세요',
        body: '국가·유형·계좌·기간·종목명으로 거래를 검색하고, CSV 파일로 일괄 업로드할 수도 있어요. 각 행을 클릭하면 소유자를 바로 변경할 수 있습니다.',
        tip: '💡 ⚙️ 설정 > "CSV 파일로 일괄 업로드"로 기존 거래 내역을 한 번에 가져오세요',
    },
    {
        target: '.vtab[onclick*="realized"]',
        arrow: 'top',
        icon: '💵',
        label: '06 — 실현수익',
        title: '매도를 통해 확정된 수익을 분석하세요',
        body: '누적 실현수익 차트, 종목별 수익금·수익률·단타왕 랭킹을 제공합니다. 기간 필터와 ↓↑ 정렬 버튼으로 원하는 분석을 바로 찾을 수 있어요.',
        tip: '💡 랭킹 항목을 클릭하면 해당 종목의 거래 내역만 필터링됩니다',
    },
    {
        target: '.vtab[onclick*="dividend"]',
        arrow: 'top',
        icon: '🌿',
        label: '07 — 배당통계',
        title: '배당금 현황과 실질 배당률을 추적하세요',
        body: '월별 배당 추이 차트와 종목별 배당금 목록을 제공합니다. 📊 배당률 / 💰 배당금 탭과 ↓↑ 정렬로 원하는 기준으로 정렬할 수 있어요.',
        tip: '💡 배당 입력 시 "세전 금액" 체크하면 세금(15%)이 자동 차감됩니다',
    },
    {
        target: '.btn-sm[onclick*="openMasterSettings"]',
        arrow: 'top',
        icon: '☁️',
        label: '08 — 클라우드 백업',
        title: 'GitHub에 데이터를 안전하게 백업하세요',
        body: '개인 GitHub 저장소를 연결하면 모든 기기에서 장부를 동기화할 수 있습니다. "자동 동기화"를 켜면 거래 추가·수정 시 자동으로 저장돼요.',
        tip: '💡 JSON 파일로 로컬 백업도 지원합니다',
    },
];

// ── DOM 헬퍼 ───────────────────────────────────────────────
function $(sel)  { return document.querySelector(sel); }
function injectWelcomeModal() {
    if ($('#tutorialWelcomeOverlay')) return;
    const el = document.createElement('div');
    el.id = 'tutorialWelcomeOverlay';
    el.className = 'tutorial-welcome-overlay';
    el.innerHTML = `
      <div class="tutorial-welcome-modal" onclick="event.stopPropagation()">
        <span class="tutorial-welcome-logo">🚀</span>
        <h2>Two the Moon에 오신 걸 환영합니다!</h2>
        <p>
          국내·미국 주식 포트폴리오를 한 곳에서 관리하는
          <span class="highlight-text">스마트 주식 장부</span>입니다.<br>
          빠른 가이드로 핵심 기능을 바로 익혀보세요!
        </p>

        <div class="tutorial-feature-grid">
          <div class="tutorial-feature-item">
            <span class="feat-icon">✏️</span>
            <span>거래 장부로<br><b>매수·매도·배당 기록</b></span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">📊</span>
            <span>실시간 시세·<br><b>수익률 자동 계산</b></span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">💵</span>
            <span>실현수익 & <br><b>배당금 통계</b></span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">☁️</span>
            <span>GitHub 클라우드<br><b>자동 백업·동기화</b></span>
          </div>
        </div>

        <div class="tutorial-welcome-actions">
          <button class="btn-tutorial-start" onclick="startTutorial()">
            🎓 빠른 가이드 시작하기 (${STEPS.length}단계)
          </button>
          <button class="btn-tutorial-skip" onclick="skipTutorial()">
            건너뛰기 — 나중에 ⚙️ 설정에서 다시 볼 수 있어요
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
}

function injectTutorialDOM() {
    if ($('#tutorialBackdrop')) return;

    // 4방향 커튼
    ['top','bottom','left','right'].forEach(dir => {
        const c = document.createElement('div');
        c.id = `tutorialCurtain_${dir}`;
        c.className = 'tutorial-curtain';
        c.style.display = 'none';
        c.onclick = () => closeTutorial();
        document.body.appendChild(c);
    });

    // 하이라이트 링
    const ring = document.createElement('div');
    ring.id = 'tutorialHighlightRing';
    ring.className = 'tutorial-highlight-ring';
    ring.style.display = 'none';
    document.body.appendChild(ring);

    // 툴팁
    const tt = document.createElement('div');
    tt.id = 'tutorialTooltip';
    tt.className = 'tutorial-tooltip';
    tt.style.display = 'none';
    document.body.appendChild(tt);

    // 완료 토스트
    const toast = document.createElement('div');
    toast.id = 'tutorialDoneToast';
    toast.className = 'tutorial-done-toast';
    toast.innerHTML = '🎉 튜토리얼 완료! 이제 Two the Moon을 마음껏 사용하세요';
    document.body.appendChild(toast);
}

// ── 스포트라이트 포지셔닝 ─────────────────────────────────
const PAD = 8; // 하이라이트 여백

function positionSpotlight(rect) {
    const { top: t, left: l, right: r, bottom: b, width: w, height: h } = rect;
    const vw = window.innerWidth, vh = window.innerHeight;

    // 커튼 4개
    function curtain(id, styles) {
        const el = $(`#tutorialCurtain_${id}`);
        Object.assign(el.style, { display: 'block', ...styles });
    }
    curtain('top',    { top:'0',                left:'0',               width:`${vw}px`,          height:`${t-PAD}px` });
    curtain('bottom', { top:`${b+PAD}px`,        left:'0',               width:`${vw}px`,          height:`${vh-(b+PAD)}px` });
    curtain('left',   { top:`${t-PAD}px`,        left:'0',               width:`${l-PAD}px`,       height:`${h+PAD*2}px` });
    curtain('right',  { top:`${t-PAD}px`,        left:`${r+PAD}px`,      width:`${vw-(r+PAD)}px`,  height:`${h+PAD*2}px` });

    // 링
    const ring = $('#tutorialHighlightRing');
    Object.assign(ring.style, {
        display: 'block',
        top:    `${t - PAD}px`,
        left:   `${l - PAD}px`,
        width:  `${w + PAD*2}px`,
        height: `${h + PAD*2}px`,
    });
}

function hideCurtains() {
    ['top','bottom','left','right'].forEach(id => {
        const el = $(`#tutorialCurtain_${id}`);
        if (el) el.style.display = 'none';
    });
    const ring = $('#tutorialHighlightRing');
    if (ring) ring.style.display = 'none';
}

function positionTooltip(targetRect, arrow) {
    const tt = $('#tutorialTooltip');
    if (!tt) return;

    tt.className = `tutorial-tooltip arrow-${arrow}`;
    tt.style.display = 'block';

    const TW = tt.offsetWidth  || 300;
    const TH = tt.offsetHeight || 260;
    const vw = window.innerWidth, vh = window.innerHeight;
    const MARGIN = 14;

    let top, left;

    if (arrow === 'top') {
        top  = (targetRect ? targetRect.bottom + PAD + MARGIN : vh / 2 - TH / 2);
        left = targetRect ? Math.min(targetRect.left, vw - TW - MARGIN) : vw / 2 - TW / 2;
    } else if (arrow === 'bottom') {
        top  = (targetRect ? targetRect.top - TH - PAD - MARGIN : vh / 2 - TH / 2);
        left = targetRect ? Math.min(targetRect.left, vw - TW - MARGIN) : vw / 2 - TW / 2;
    } else if (arrow === 'left') {
        left = (targetRect ? targetRect.right + PAD + MARGIN : vw / 2 - TW / 2);
        top  = targetRect ? targetRect.top : vh / 2 - TH / 2;
    } else { // right
        left = (targetRect ? targetRect.left - TW - PAD - MARGIN : vw / 2 - TW / 2);
        top  = targetRect ? targetRect.top : vh / 2 - TH / 2;
    }

    // 뷰포트 밖으로 나가지 않게 보정
    left = Math.max(MARGIN, Math.min(left, vw - TW - MARGIN));
    top  = Math.max(MARGIN, Math.min(top,  vh - TH - MARGIN));

    tt.style.top  = `${top}px`;
    tt.style.left = `${left}px`;
}

// ── 스텝 렌더 ─────────────────────────────────────────────
function renderStep(idx) {
    const step = STEPS[idx];
    const total = STEPS.length;

    // 타깃 요소 찾기
    let targetEl = step.target ? $(step.target) : null;

    // 숨겨진 요소 처리 (nav는 항상 보임)
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        if (!visible) targetEl = null;
    }

    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        positionSpotlight(rect);
        positionTooltip(rect, step.arrow);
        // 요소가 화면 밖이면 스크롤
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        hideCurtains();
        positionTooltip(null, 'top');
    }

    // 툴팁 내용 렌더링
    const dots = STEPS.map((_, i) => {
        const cls = i === idx ? 'active' : (i < idx ? 'done' : '');
        return `<div class="tutorial-dot ${cls}" onclick="goToStep(${i})" title="${i+1}단계"></div>`;
    }).join('');

    const tt = $('#tutorialTooltip');
    const isLast = idx === total - 1;
    tt.innerHTML = `
      <button class="btn-tutorial-close-x" onclick="closeTutorial()" title="튜토리얼 닫기">✕</button>
      <div class="tutorial-tooltip-step">${step.label}</div>
      <span class="tutorial-tooltip-icon">${step.icon}</span>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      ${step.tip ? `<div class="tip-tag">${step.tip}</div>` : ''}
      <div class="tutorial-nav">
        <button class="btn-tutorial-prev" onclick="prevStep()" ${idx === 0 ? 'disabled' : ''}>← 이전</button>
        <div class="tutorial-progress-dots">${dots}</div>
        <button class="btn-tutorial-next" onclick="nextStep()">
          ${isLast ? '🎉 완료!' : '다음 →'}
        </button>
      </div>
    `;
}

// ── 공개 API ───────────────────────────────────────────────
window.startTutorial = function() {
    closeWelcome();
    injectTutorialDOM();
    tutorialActive = true;
    currentStep = 0;
    renderStep(0);
};

window.skipTutorial = function() {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    closeWelcome();
};

window.closeTutorial = function() {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    tutorialActive = false;
    hideCurtains();
    const tt = $('#tutorialTooltip');
    if (tt) tt.style.display = 'none';
};

window.nextStep = function() {
    if (!tutorialActive) return;
    if (currentStep >= STEPS.length - 1) {
        finishTutorial();
    } else {
        currentStep++;
        renderStep(currentStep);
    }
};

window.prevStep = function() {
    if (!tutorialActive || currentStep <= 0) return;
    currentStep--;
    renderStep(currentStep);
};

window.goToStep = function(idx) {
    if (!tutorialActive) return;
    currentStep = idx;
    renderStep(idx);
};

window.restartTutorial = function() {
    closeModal('masterSettingsOverlay');
    localStorage.removeItem(TUTORIAL_DONE_KEY);
    injectWelcomeModal();
    $('#tutorialWelcomeOverlay').classList.add('open');
};

function closeWelcome() {
    const el = $('#tutorialWelcomeOverlay');
    if (el) el.classList.remove('open');
}

function finishTutorial() {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    tutorialActive = false;
    hideCurtains();
    const tt = $('#tutorialTooltip');
    if (tt) tt.style.display = 'none';

    const toast = $('#tutorialDoneToast');
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3800);
    }
}

// ── 설정 모달에 재시작 버튼 주입 ──────────────────────────
function injectRestartButton() {
    const settingsModal = $('#masterSettingsOverlay .modal');
    if (!settingsModal || settingsModal.querySelector('.tutorial-restart-section')) return;

    const sec = document.createElement('div');
    sec.className = 'settings-section tutorial-restart-section';
    sec.style.cssText = 'margin-top:16px; margin-bottom:0;';
    sec.innerHTML = `
      <div class="settings-section-title">📡 주가 데이터</div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <span id="marketDataLastUpdated" style="font-size:12px; color:var(--text2);"></span>
        <button class="btn-restart-tutorial" onclick="forceMarketDataUpdate()" style="margin:0;">
          <span>🔄</span> 캐시 삭제 후 최신화
        </button>
      </div>
      <div class="settings-section-title" style="margin-top:12px;">🎓 튜토리얼</div>
      <button class="btn-restart-tutorial" onclick="restartTutorial()">
        <span>🔁</span> 빠른 가이드 다시 보기
      </button>
    `;
    settingsModal.appendChild(sec);
    updateLastSyncTimeDisplay(); // 모달 열릴 때 시간 즉시 표시
}

// ── 초기화 ────────────────────────────────────────────────
function initTutorial() {
    // 최초 방문 여부 확인
    const done = localStorage.getItem(TUTORIAL_DONE_KEY);
    if (!done) {
        // 첫 방문: 약간 딜레이 후 환영 모달 표시
        setTimeout(() => {
            injectWelcomeModal();
            const overlay = $('#tutorialWelcomeOverlay');
            if (overlay) overlay.classList.add('open');
        }, 800);
    }

    // 설정 모달이 열릴 때마다 재시작 버튼 주입 (MutationObserver 활용)
    const settingsOverlay = document.getElementById('masterSettingsOverlay');
    if (settingsOverlay) {
        const obs = new MutationObserver(() => {
            if (settingsOverlay.classList.contains('open')) injectRestartButton();
        });
        obs.observe(settingsOverlay, { attributes: true, attributeFilter: ['class'] });
    }

    // 리사이즈 시 스텝 위치 재계산
    window.addEventListener('resize', () => {
        if (tutorialActive) renderStep(currentStep);
    });
}

// DOMContentLoaded 이후 또는 즉시 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTutorial);
} else {
    // 이미 로드됐으면 다음 틱에 실행 (다른 초기화 코드가 끝난 후)
    setTimeout(initTutorial, 0);
}

})(); // IIFE 끝

function renderDivHistoryTable(divTxs, filterSymbol = null) {
    const tbody = document.getElementById('divHistoryTableBody');
    if (!tbody) return;

    // 소유자 필터 (상위와 동기화)
    let filterName = 'all';
    if (typeof currentDivFilter !== 'undefined') {
        if (currentDivFilter === 'user1') filterName = state.owners.user1.name;
        if (currentDivFilter === 'user2') filterName = state.owners.user2.name;
    }

    const sorted = [...divTxs]
        .filter(tx => !filterSymbol || tx.symbol === filterSymbol)
        .sort((a, b) => b.date.localeCompare(a.date));

    // 💡 1,000만원 투자 시 세후 월 배당 계산 (종목 필터링 시만)
    let monthlyHint = '';
    if (filterSymbol && sorted.length > 0) {
        // 최근 1년치 우선, 없으면 전체 이력으로 연간 DPS 합산
        const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const baseTxs = sorted.filter(tx => tx.date >= cutoffStr);
        const targetTxs = baseTxs.length > 0 ? baseTxs : sorted;

        let annualDps = 0;
        targetTxs.forEach(tx => {
            let qty = 0;
            state.transactions.forEach(t => {
                if (t.symbol === tx.symbol && t.txType !== 'dividend' && t.date <= tx.date
                    && t.broker === tx.broker && t.owner === tx.owner) qty += t.qty;
            });
            qty = Math.round(qty * 10000) / 10000;
            if (qty > 0) annualDps += tx.price / qty;
        });

        // 현재가 → KRW 환산
        const isKr = isKorean(filterSymbol);
        let curPrice = 0;
        if (cachedMarketData[filterSymbol] && !cachedMarketData[filterSymbol]._failed)
            curPrice = cachedMarketData[filterSymbol].last || 0;
        if (!isKr && curPrice > 0) curPrice *= currentUsdKrw;

        if (annualDps > 0 && curPrice > 0) {
            const shares = 10000000 / curPrice;
            const monthly = shares * (annualDps / 12) * (1 - 0.154);
            monthlyHint = `<span style="font-size:10px; color:var(--text3); margin-left:10px;">
                💡 1,000만원 투자 시 월 <b style="color:var(--green); font-family:var(--font-mono);">
                ₩${Math.round(monthly).toLocaleString()}</b> 세후 (최근 배당 기준)
              </span>`;
        }
    }

    // 헤더에 필터 배지 표시
    const headerEl = tbody.closest('.history-table-container')?.previousElementSibling;
    if (headerEl) {
        let filterDisplayName = filterSymbol;
        if (localStockDB?.length > 0) {
            const m = localStockDB.find(s => s.symbol === filterSymbol);
            if (m) filterDisplayName = m.name;
        }
        if (cachedMarketData[filterSymbol]?.name && !cachedMarketData[filterSymbol]._failed) {
            filterDisplayName = cachedMarketData[filterSymbol].name;
        }

        const badge = filterSymbol
            ? `<span style="margin-left:8px; font-size:11px; font-weight:500; color:var(--accent);
                            background:var(--accent-bg); border:1px solid var(--accent);
                            border-radius:4px; padding:2px 8px; cursor:pointer;"
                     onclick="renderDivHistoryTable(window._lastDivTxs)">
                 ${filterDisplayName} ✕
               </span>`
            : '';
        headerEl.innerHTML = `💚 배당 수령 내역${badge}${monthlyHint}`;
    }

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${filterSymbol ? 6 : 6}" style="text-align:center; color:var(--text3); padding:30px;">조회된 배당 내역이 없습니다.</td></tr>`;
        return;
    }

    // 각 건마다 당시 보유 수량 계산
    const rows = sorted.map(tx => {
        // 종목명
        let name = tx.symbol;
        if (localStockDB?.length > 0) {
            const m = localStockDB.find(s => s.symbol === tx.symbol);
            if (m) name = m.name;
        }
        if (cachedMarketData[tx.symbol]?.name && !cachedMarketData[tx.symbol]._failed) {
            name = cachedMarketData[tx.symbol].name;
        }

        // 배당 지급일 기준 보유 수량 계산
        let qtyAtDiv = 0, totalCost = 0;
        state.transactions.forEach(t => {
            if (t.symbol === tx.symbol && t.txType !== 'dividend' && t.date <= tx.date
                && t.broker === tx.broker && t.owner === tx.owner) {
                if (t.qty > 0) totalCost += t.qty * t.price;
                else if (qtyAtDiv > 0) totalCost += t.qty * (totalCost / qtyAtDiv);
                qtyAtDiv += t.qty;
            }
        });
        qtyAtDiv = Math.round(qtyAtDiv * 10000) / 10000;
        const avgCost = qtyAtDiv > 0 ? totalCost / qtyAtDiv : 0;
        const dps = qtyAtDiv > 0 ? tx.price / qtyAtDiv : null;
        const dpsStr = dps !== null ? formatPrice(dps, tx.symbol) : '—';
        const yieldPct = (dps !== null && avgCost > 0) ? (dps / avgCost) * 100 : null;
        const yieldStr = yieldPct !== null ? yieldPct.toFixed(2) + '%' : '—';

        const symDisp = tx.symbol.replace(/\.KS\.DLST|\.DLST|\.KS/g, '');
        const qtyStr = qtyAtDiv > 0 ? qtyAtDiv.toLocaleString() + '주' : '—';

        if (filterSymbol) {
            // 종목 필터링 시: 종목 열 숨기고 1주당 배당금 표시
            return `<tr>
              <td style="font-family:var(--font-mono); font-size:12px; color:var(--text3); white-space:nowrap;">${tx.date}</td>
              <td style="font-size:12px; color:var(--text2);">${tx.broker || '—'}</td>
              <td style="font-size:12px; color:var(--text2);">${tx.owner || '—'}</td>
              <td style="text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--text);">${qtyStr}</td>
              <td style="text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--text2);">${dpsStr}</td>
              <td style="text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--green);">${yieldStr}</td>
              <td style="text-align:right; color:var(--green); font-weight:700; font-family:var(--font-mono); font-size:13px;">${formatPrice(tx.price, tx.symbol)}</td>
            </tr>`;
        } else {
            // 전체 목록: 종목 열 표시, 1주당 배당금 숨김
            return `<tr>
              <td style="font-family:var(--font-mono); font-size:12px; color:var(--text3); white-space:nowrap;">${tx.date}</td>
              <td>
                <div style="font-weight:700; color:var(--text); font-size:13px; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${name}">${name}</div>
                <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono);">${symDisp}</div>
              </td>
              <td style="font-size:12px; color:var(--text2);">${tx.broker || '—'}</td>
              <td style="font-size:12px; color:var(--text2);">${tx.owner || '—'}</td>
              <td style="text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--text);">${qtyStr}</td>
              <td style="text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--green);">${yieldStr}</td>
              <td style="text-align:right; color:var(--green); font-weight:700; font-family:var(--font-mono); font-size:13px;">${formatPrice(tx.price, tx.symbol)}</td>
            </tr>`;
        }
    });

    // 헤더도 filterSymbol 여부에 따라 동적으로 교체
    const thead = tbody.closest('table')?.querySelector('thead tr');
    if (thead) {
        if (filterSymbol) {
            thead.innerHTML = `
              <th>날짜</th>
              <th>계좌</th>
              <th>소유자</th>
              <th style="text-align:right;">보유 수량</th>
              <th style="text-align:right;">1주당 배당금</th>
              <th style="text-align:right;">배당률(YOC)</th>
              <th style="text-align:right;">배당금</th>`;
        } else {
            thead.innerHTML = `
              <th>날짜</th>
              <th>종목</th>
              <th>계좌</th>
              <th>소유자</th>
              <th style="text-align:right;">보유 수량</th>
              <th style="text-align:right;">배당률(YOC)</th>
              <th style="text-align:right;">배당금</th>`;
        }
    }
    tbody.innerHTML = rows.join('');
}

// 🌟 보유 종목들의 최근 배당 기록을 바탕으로 다음 예상 배당금 계산
function renderUpcomingDividends() {
    const tbody = document.getElementById('upcomingDivTableBody');
    if (!tbody) return;

    let filterName = 'all';
    if(typeof currentDivFilter !== 'undefined') {
        if(currentDivFilter === 'user1') filterName = state.owners.user1.name;
        if(currentDivFilter === 'user2') filterName = state.owners.user2.name;
    }

    const holdings = calculateHoldings(filterName);
    let heldSymbols = {};
    for (let key in holdings) {
        let h = holdings[key];
        if (h.qty > 0) {
            if (!heldSymbols[h.symbol]) heldSymbols[h.symbol] = 0;
            heldSymbols[h.symbol] += h.qty;
        }
    }

    let divTxs = state.transactions.filter(t => t.txType === 'dividend');
    if (filterName !== 'all') {
        divTxs = divTxs.filter(t => t.owner === filterName);
    }

    let divHistory = {};
    divTxs.forEach(tx => {
        if (!divHistory[tx.symbol]) divHistory[tx.symbol] = [];
        divHistory[tx.symbol].push(tx);
    });

    const today = new Date();
    const currentMonth = today.getMonth() + 1; 

    let upcomingItems = [];

    for (let sym in heldSymbols) {
        if (!divHistory[sym] || divHistory[sym].length === 0) continue; 

        let history = divHistory[sym].sort((a, b) => new Date(a.date) - new Date(b.date));
        let pastMonths = [...new Set(history.map(t => parseInt(t.date.split('-')[1], 10)))].sort((a, b) => a - b);
        let recentTx = history[history.length - 1]; 

        let qtyAtDiv = 0;
        state.transactions.forEach(t => {
            if (t.symbol === sym && t.txType !== 'dividend' && t.date <= recentTx.date) {
                if (filterName === 'all' || t.owner === filterName) {
                    qtyAtDiv += t.qty;
                }
            }
        });

        if (qtyAtDiv <= 0) continue; 

        let dps = recentTx.price / qtyAtDiv; 
        let currentQty = heldSymbols[sym];
        let expectedTotal = dps * currentQty;

        let nextMonth = pastMonths.find(m => m > currentMonth);
        if (!nextMonth) nextMonth = pastMonths[0]; 

        let fallbackName = sym;
        if (typeof localStockDB !== 'undefined' && localStockDB.length > 0) {
            let match = localStockDB.find(s => s.symbol === sym);
            if (match) fallbackName = match.name;
        }
        if (cachedMarketData[sym] && !cachedMarketData[sym]._failed && cachedMarketData[sym].name) {
            fallbackName = cachedMarketData[sym].name;
        }

        upcomingItems.push({
            symbol: sym, name: fallbackName, pastMonths: pastMonths,
            nextMonth: nextMonth, dps: dps, qty: currentQty, expectedTotal: expectedTotal
        });
    }

    upcomingItems.sort((a, b) => {
        let aDist = a.nextMonth >= currentMonth ? a.nextMonth - currentMonth : (a.nextMonth + 12) - currentMonth;
        let bDist = b.nextMonth >= currentMonth ? b.nextMonth - currentMonth : (b.nextMonth + 12) - currentMonth;
        if (aDist !== bDist) return aDist - bDist;
        return b.expectedTotal - a.expectedTotal;
    });

    if (upcomingItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text3); padding:40px;">과거 배당 기록을 바탕으로 예측할 수 있는 데이터가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = upcomingItems.map(item => {
        let formattedDps = formatPrice(item.dps, item.symbol);
        let formattedTotal = formatPrice(item.expectedTotal, item.symbol);
        
        return `
          <tr style="cursor:pointer;" onclick="renderDivHistoryTable(window._lastDivTxs||[], '${item.symbol}'); this.closest('.history-table-container').previousElementSibling?.scrollIntoView({behavior:'smooth',block:'nearest'});"
              onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
            <td>
              <div style="font-weight:700; color:var(--text); font-size:13px; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.name}">${item.name}</div>
              <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono);">${item.symbol}</div>
            </td>
            <td style="text-align:center; color:var(--text2); font-family:var(--font-mono); font-size:11px;">${item.pastMonths.join(', ')}월</td>
            <td style="text-align:center;">
                <span style="background:var(--accent-bg); color:var(--accent); padding:3px 8px; border-radius:12px; font-weight:700; font-size:11px;">${item.nextMonth}월 예정</span>
            </td>
            <td style="text-align:right; color:var(--text2); font-family:var(--font-mono); font-size:12px;">${formattedDps}</td>
            <td style="text-align:right; color:var(--text); font-weight:500;">${item.qty}주</td>
            <td style="text-align:right; color:var(--green); font-weight:700; font-family:var(--font-mono); font-size:13px;">${formattedTotal}</td>
          </tr>
        `;
    }).join('');
}

function updateViewHeader(icon, title, badge) {
  const el = document.getElementById('viewHeader');
  if (!el) return;
  if (!icon) { el.className = 'view-header'; return; }
  el.className = 'view-header active';
  el.innerHTML = `
    <span class="view-header-icon" aria-hidden="true">${icon}</span>
    <span class="view-header-title">${title}</span>
    ${badge !== undefined
      ? `<span class="view-header-badge">${badge}</span>`
      : ''}
  `;
}

// ==========================================
// 🎨 수익/손실 색상 커스터마이징 모듈
// ==========================================
const COLOR_PREFS_KEY = 'ttm_color_prefs';

// 현재 적용된 색상을 언제 어디서나 꺼낼 수 있는 전역 변수
window._PC    = '#00C578';   // profit color (수익)
window._LC    = '#3A9AFF';   // loss color   (손실)
window._PCbg  = 'rgba(0,200,122,0.12)';
window._LCbg  = 'rgba(58,154,255,0.12)';

// HEX → rgba 변환
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// CSS 변수 + 전역 변수 동시 적용
function applyColors(profit, loss) {
    window._PC   = profit;
    window._LC   = loss;
    window._PCbg = hexToRgba(profit, 0.12);
    window._LCbg = hexToRgba(loss,   0.12);

    const root = document.documentElement;
    // 기존 테마가 var(--profit)/var(--loss)/var(--green)/var(--blue) 를
    // 쓰는 곳은 CSS 변수 덮어쓰기만으로 즉시 반영됩니다.
    root.style.setProperty('--profit',    profit);
    root.style.setProperty('--loss',      loss);
    root.style.setProperty('--green',     profit);
    root.style.setProperty('--blue',      loss);
    root.style.setProperty('--profit-bg', hexToRgba(profit, 0.12));
    root.style.setProperty('--loss-bg',   hexToRgba(loss,   0.12));

    // Chart.js 의 기본 녹색/파랑 데이터셋 색상도 맞춰줍니다.
    // (buildChart 내부 getColors 함수를 재정의)
    window._colorsOverridden = true;
}

// 로컬스토리지에서 불러와 즉시 적용
function loadAndApplyColorPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(COLOR_PREFS_KEY));
        if (saved && saved.profit && saved.loss) {
            applyColors(saved.profit, saved.loss);
            return saved;
        }
    } catch(e) {}
    return { profit: '#00C578', loss: '#3A9AFF' };
}

// 설정 모달 내 색상 피커 값을 UI와 동기화
function syncColorPickerUI() {
    const pi = document.getElementById('inputColorProfit');
    const li = document.getElementById('inputColorLoss');
    if (pi) pi.value = window._PC;
    if (li) li.value = window._LC;
    updateColorPreview();
}

// 미리보기 뱃지 실시간 갱신
function updateColorPreview() {
    const pp = document.getElementById('colorPreviewProfit');
    const lp = document.getElementById('colorPreviewLoss');
    const pi = document.getElementById('inputColorProfit');
    const li = document.getElementById('inputColorLoss');
    if (pp && pi) {
        pp.style.background = hexToRgba(pi.value, 0.15);
        pp.style.color       = pi.value;
        pp.style.borderColor = hexToRgba(pi.value, 0.4);
    }
    if (lp && li) {
        lp.style.background = hexToRgba(li.value, 0.15);
        lp.style.color       = li.value;
        lp.style.borderColor = hexToRgba(li.value, 0.4);
    }
}

// 저장 버튼 클릭
function saveColorPrefs() {
    const profit = document.getElementById('inputColorProfit').value;
    const loss   = document.getElementById('inputColorLoss').value;
    localStorage.setItem(COLOR_PREFS_KEY, JSON.stringify({ profit, loss }));
    applyColors(profit, loss);

    // 차트 캐시 무효화 후 전체 재렌더
    Object.values(chartInstances).forEach(c => c && c.destroy && c.destroy());
    for (let k in chartInstances) delete chartInstances[k];
    render();

    // 저장 완료 피드백
    const btn = document.getElementById('btnSaveColorPrefs');
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ 저장됨';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
}

// 기본값으로 초기화
function resetColorPrefs() {
    localStorage.removeItem(COLOR_PREFS_KEY);
    applyColors('#00C578', '#3A9AFF');
    syncColorPickerUI();

    Object.values(chartInstances).forEach(c => c && c.destroy && c.destroy());
    for (let k in chartInstances) delete chartInstances[k];
    render();
}

// getColors 함수를 오버라이드하여 미니 차트도 커스텀 색상 사용
const _origGetColors = getColors;
getColors = function(prices) {
    if (!window._colorsOverridden) return _origGetColors(prices);
    if (!prices || prices.length === 0) return { line:'#8890a4', fill:'rgba(136,144,164,0.1)' };
    const last = prices[prices.length-1], first = prices[0];
    if (last > first) return { line: window._PC, fill: hexToRgba(window._PC, 0.12) };
    if (last < first) return { line: window._LC, fill: hexToRgba(window._LC, 0.12) };
    return { line:'#8890a4', fill:'rgba(136,144,164,0.1)' };
};

// 페이지 로드 시 즉시 적용 (깜빡임 방지)
loadAndApplyColorPrefs();

// 설정 모달이 열릴 때마다 피커 UI 동기화
(function watchSettingsModal() {
    const overlay = document.getElementById('masterSettingsOverlay');
    if (!overlay) { setTimeout(watchSettingsModal, 300); return; }
    new MutationObserver(() => {
        if (overlay.classList.contains('open')) syncColorPickerUI();
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
})();

// applyColorPreset — 프리셋 버튼 클릭 시 피커 값 변경 후 즉시 미리보기 갱신
function applyColorPreset(profit, loss) {
    const pi = document.getElementById('inputColorProfit');
    const li = document.getElementById('inputColorLoss');
    if (pi) pi.value = profit;
    if (li) li.value = loss;
    updateColorPreview();
}

// ==========================================
// 📅 실현수익 드래그형 날짜 범위 선택기
// ==========================================
let _drp = {
  year: new Date().getFullYear(), month: new Date().getMonth(),
  dragStart: null, dragEnd: null
};

function openRealizedDatePicker() {
  const today = new Date();
  _drp.year = today.getFullYear(); _drp.month = today.getMonth();
  _drp.dragStart = realizedFilters.dateFrom || null;
  _drp.dragEnd   = realizedFilters.dateTo   || null;
  _drp.hover = null; _drp.dragging = false;
  _renderDrpCalendar();
  document.getElementById('realizedDatePickerPop').style.display = 'block';
}

function closeRealizedDatePicker() {
  document.getElementById('realizedDatePickerPop').style.display = 'none';
}

function _drpNav(delta) {
  _drp.month += delta;
  if (_drp.month > 11) { _drp.month = 0; _drp.year++; }
  if (_drp.month < 0)  { _drp.month = 11; _drp.year--; }
  _renderDrpCalendar();
}

function _drpFmt(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function _renderDrpCalendar() {
  const el = document.getElementById('realizedDatePickerPop');
  if (!el) return;
  const y = _drp.year, m = _drp.month;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  let rs = _drp.dragStart;
  let re = _drp.dragEnd;
  if (rs && re && rs > re) { [rs, re] = [re, rs]; }

  const todayStr = new Date().toISOString().split('T')[0];
  let dayHeaders = ['일','월','화','수','목','금','토']
    .map(d => `<div style="text-align:center;font-size:10px;color:var(--text3);padding:4px 0;">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = _drpFmt(y, m, d);
    const isEdge  = ds === rs || ds === re;
    const inRange = rs && re && ds >= rs && ds <= re;
    const isToday = ds === todayStr;
    let bg = 'transparent', color = isToday ? 'var(--green)' : 'var(--text)', fw = isToday ? '700' : '400';
    if (isEdge)       { bg = 'var(--accent)'; color = '#fff'; fw = '700'; }
    else if (inRange) { bg = 'var(--accent-bg)'; color = 'var(--accent)'; }
    cells += `<div data-date="${ds}"
      style="text-align:center;padding:7px 2px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:${fw};background:${bg};color:${color};user-select:none;transition:background 0.1s;"
      onclick="_drpClick('${ds}')"
      onmouseover="if(!this.style.background||this.style.background==='transparent')this.style.background='rgba(255,255,255,0.05)'"
      onmouseout="this.style.background='${bg}'">${d}</div>`;
  }

  const selText = (rs && re && rs !== re) ? `${rs} ~ ${re}` : (rs ? `${rs} (하루 필터 / 두 번째 날짜 선택 가능)` : '날짜 클릭: 하루 / 두 번 클릭: 기간');

  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:16px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.5);" onmousedown="event.stopPropagation()">
      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border);">
        ${_yearBtnsHtml('_drpApplyYear')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <button onclick="_drpNav(-1)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 10px;font-size:12px;">◀</button>
        <span onclick="_drpApplyMonth()" style="font-weight:700;font-size:14px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;" title="클릭하면 이 달 전체로 필터">${y}년 ${monthNames[m]}</span>
        <button onclick="_drpNav(1)" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 10px;font-size:12px;">▶</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">${dayHeaders}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">${cells}</div>
      <div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);text-align:center;min-height:28px;line-height:1.6;">${selText}</div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="_drpClear()" style="flex:1;padding:7px;font-size:11px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer;font-family:var(--font-sans);">초기화</button>
        <button onclick="_drpApply()" style="flex:1;padding:7px;font-size:11px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;font-family:var(--font-sans);">적용</button>
      </div>
    </div>`;
}

function _drpClick(ds) {
  if (!_drp.dragStart || (_drp.dragStart && _drp.dragEnd)) {
    // 선택 없음 또는 이미 완성된 범위 → 새로 시작
    _drp.dragStart = ds;
    _drp.dragEnd = null;
  } else {
    // 시작만 있음 → 두 번째 클릭으로 끝 설정
    _drp.dragEnd = ds;
    if (_drp.dragStart > _drp.dragEnd)
      [_drp.dragStart, _drp.dragEnd] = [_drp.dragEnd, _drp.dragStart];
  }
  _renderDrpCalendar();
}
function _drpClear() {
  _drp.dragStart = null; _drp.dragEnd = null; _drp.hover = null; _drp.dragging = false;
  _renderDrpCalendar();
}
function _drpApply() {
  if (_drp.dragStart && !_drp.dragEnd) {
    // 날짜 하나만 찍은 경우 → 그날 하루만 필터
    realizedFilters.dateFrom = _drp.dragStart;
    realizedFilters.dateTo   = _drp.dragStart;
  } else {
    realizedFilters.dateFrom = _drp.dragStart || '';
    realizedFilters.dateTo   = _drp.dragEnd   || '';
  }
  closeRealizedDatePicker();
  renderRealizedDashboard();
}

function _drpApplyMonth() {
  const y = _drp.year, m = _drp.month;
  const firstDay = `${y}-${String(m+1).padStart(2,'0')}-01`;
  const lastDate  = new Date(y, m+1, 0).getDate();
  const lastDay   = `${y}-${String(m+1).padStart(2,'0')}-${String(lastDate).padStart(2,'0')}`;
  realizedFilters.dateFrom = firstDay;
  realizedFilters.dateTo   = lastDay;
  closeRealizedDatePicker();
  renderRealizedDashboard();
}

document.addEventListener('mousedown', (e) => {
  // 기존 realized 닫기
  const pop = document.getElementById('realizedDatePickerPop');
  const btn = document.getElementById('btnRealizedDatePicker');
  if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== btn)
    closeRealizedDatePicker();

  // 거래내역 닫기 (추가)
  const hPop = document.getElementById('historyDatePickerPop');
  const hBtn = document.getElementById('btnHistoryDatePicker');
  if (hPop && hPop.style.display !== 'none' && !hPop.contains(e.target) && e.target !== hBtn)
    closeHistoryDatePicker();

  // 배당통계 닫기 (추가)
  const dPop = document.getElementById('dividendDatePickerPop');
  const dBtn = document.getElementById('btnDividendDatePicker');
  if (dPop && dPop.style.display !== 'none' && !dPop.contains(e.target) && e.target !== dBtn)
    closeDividendDatePicker();
});

function _getAvailableYears() {
    const years = new Set([new Date().getFullYear()]);
    state.transactions.forEach(tx => {
        if (tx.date) years.add(parseInt(tx.date.substring(0, 4)));
    });
    return [...years].sort((a, b) => b - a);
}

function _yearBtnsHtml(applyFn) {
    return _getAvailableYears().map(y =>
        `<button onclick="${applyFn}(${y})"
            style="padding:4px 9px; font-size:11px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--text2); cursor:pointer; font-family:var(--font-sans); transition:0.15s;"
            onmouseover="this.style.background='rgba(124,106,247,0.15)';this.style.color='var(--accent)';this.style.borderColor='var(--accent)';"
            onmouseout="this.style.background='transparent';this.style.color='var(--text2)';this.style.borderColor='var(--border)';">${y}</button>`
    ).join('');
}

function _histDrpApplyYear(y) {
    historyFilters.dateFrom = `${y}-01-01`;
    historyFilters.dateTo   = `${y}-12-31`;
    closeHistoryDatePicker();
    renderHistoryDashboard();
}

function _drpApplyYear(y) {
    realizedFilters.dateFrom = `${y}-01-01`;
    realizedFilters.dateTo   = `${y}-12-31`;
    closeRealizedDatePicker();
    renderRealizedDashboard();
}

function _divDrpApplyYear(y) {
    dividendFilters.dateFrom = `${y}-01-01`;
    dividendFilters.dateTo   = `${y}-12-31`;
    closeDividendDatePicker();
    renderDividendDashboard();
}

// ==========================================
// 🗺️ 포트폴리오 맵 선택 모드
// ==========================================
function _enterTreemapSelectMode(triggerCell) {
    _treemapSelectMode = true;
    _treemapSelectedSymbols.clear();

    // 롱프레스한 셀 자동 선택
    const sym = triggerCell.getAttribute('data-symbol');
    const val = parseInt(triggerCell.getAttribute('data-rawval'), 10) || 0;
    _treemapSelectedSymbols.set(sym, val);

    // 툴바 표시
    const toolbar = document.getElementById('treemapSelectToolbar');
    if (toolbar) toolbar.style.display = 'flex';

    // 툴팁 숨기기
    const tip = document.getElementById('chartjs-tooltip');
    if (tip) tip.style.opacity = 0;

    _renderTreemapTagButtons();
    _updateTreemapSelectUI();
}

function _toggleTreemapCell(cell) {
    const sym = cell.getAttribute('data-symbol');
    const val = parseInt(cell.getAttribute('data-rawval'), 10) || 0;
    if (_treemapSelectedSymbols.has(sym)) {
        _treemapSelectedSymbols.delete(sym);
    } else {
        _treemapSelectedSymbols.set(sym, val);
    }
    _updateTreemapSelectUI();
}

// 국장/미장 일괄 선택 (이미 전체 선택됐으면 전체 해제)
function _selectTreemapByMarket(market) {
    const cells = [...document.querySelectorAll('.treemap-cell')].filter(c =>
        market === 'kr' ? c.getAttribute('data-iskr') === 'true'
                        : c.getAttribute('data-iskr') === 'false'
    );
    const allSelected = cells.every(c => _treemapSelectedSymbols.has(c.getAttribute('data-symbol')));
    cells.forEach(c => {
        const sym = c.getAttribute('data-symbol');
        const val = parseInt(c.getAttribute('data-rawval'), 10) || 0;
        if (allSelected) _treemapSelectedSymbols.delete(sym);
        else             _treemapSelectedSymbols.set(sym, val);
    });
    _updateTreemapSelectUI();
}

// 태그 일괄 선택 (이미 해당 태그 전체 선택됐으면 전체 해제)
function _selectTreemapByTag(tag) {
    const cells = [...document.querySelectorAll('.treemap-cell')].filter(c => {
        const tags = (c.getAttribute('data-tags') || '').split(',').map(t => t.trim());
        return tags.includes(tag);
    });
    const allSelected = cells.every(c => _treemapSelectedSymbols.has(c.getAttribute('data-symbol')));
    cells.forEach(c => {
        const sym = c.getAttribute('data-symbol');
        const val = parseInt(c.getAttribute('data-rawval'), 10) || 0;
        if (allSelected) _treemapSelectedSymbols.delete(sym);
        else             _treemapSelectedSymbols.set(sym, val);
    });
    _updateTreemapSelectUI();
}

// 태그 버튼 동적 렌더링 (선택 모드 진입 시 1회)
function _renderTreemapTagButtons() {
    const container = document.getElementById('treemapTagButtons');
    if (!container) return;
    const uniqueTags = new Set();
    document.querySelectorAll('.treemap-cell').forEach(c => {
        (c.getAttribute('data-tags') || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => uniqueTags.add(t));
    });
    if (uniqueTags.size === 0) { container.innerHTML = ''; return; }
    container.innerHTML = [...uniqueTags].sort().map(tag =>
        `<button id="tmTag_${CSS.escape(tag)}" onclick="_selectTreemapByTag('${tag.replace(/'/g,"\\'")}')
"          class="btn-sm" style="font-size:11px;">🏷️ ${tag}</button>`
    ).join('');
}

// UI 갱신 (셀 스타일 + 카운트 + 합산액 + 필터 버튼 활성화)
function _updateTreemapSelectUI() {
    const count = _treemapSelectedSymbols.size;
    const totalVal = [..._treemapSelectedSymbols.values()].reduce((s, v) => s + v, 0);

    // 카운트
    const countEl = document.getElementById('treemapSelectCount');
    if (countEl) countEl.textContent = `${count}종목 선택`;

    // 합산액
    const resultEl = document.getElementById('treemapSelectResult');
    if (resultEl) {
        if (count === 0) {
            resultEl.textContent = '';
        } else {
            const abs = totalVal;
            let fmtVal;
            if (abs >= 100000000) fmtVal = '₩' + (abs / 100000000).toFixed(2) + '억';
            else if (abs >= 10000) fmtVal = '₩' + Math.round(abs / 10000).toLocaleString() + '만';
            else fmtVal = '₩' + Math.round(abs).toLocaleString();
            resultEl.textContent = `= ${fmtVal}`;
        }
    }

    // 셀 시각 처리 (선택=선명+테두리 / 비선택=반투명)
    document.querySelectorAll('.treemap-cell').forEach(c => {
        const sym = c.getAttribute('data-symbol');
        const selected = _treemapSelectedSymbols.has(sym);
        c.style.opacity  = selected ? '1' : (count > 0 ? '0.35' : '1');
        c.style.outline  = selected ? '2.5px solid rgba(255,255,255,0.9)' : 'none';
        c.style.outlineOffset = '-2px';
    });

    // 국장/미장 버튼 활성 표시
    const krCells = [...document.querySelectorAll('.treemap-cell[data-iskr="true"]')];
    const usCells = [...document.querySelectorAll('.treemap-cell[data-iskr="false"]')];
    const krBtn = document.getElementById('tmFilterKr');
    const usBtn = document.getElementById('tmFilterUs');
    if (krBtn) {
        const allKrSel = krCells.length > 0 && krCells.every(c => _treemapSelectedSymbols.has(c.getAttribute('data-symbol')));
        krBtn.style.background    = allKrSel ? 'var(--accent)' : '';
        krBtn.style.color         = allKrSel ? '#fff' : '';
        krBtn.style.borderColor   = allKrSel ? 'var(--accent)' : '';
    }
    if (usBtn) {
        const allUsSel = usCells.length > 0 && usCells.every(c => _treemapSelectedSymbols.has(c.getAttribute('data-symbol')));
        usBtn.style.background    = allUsSel ? 'var(--accent)' : '';
        usBtn.style.color         = allUsSel ? '#fff' : '';
        usBtn.style.borderColor   = allUsSel ? 'var(--accent)' : '';
    }

    // 태그 버튼 활성 표시
    document.querySelectorAll('[id^="tmTag_"]').forEach(btn => {
        const tag = btn.textContent.replace('🏷️ ', '').trim();
        const tagCells = [...document.querySelectorAll('.treemap-cell')].filter(c =>
            (c.getAttribute('data-tags') || '').split(',').map(t => t.trim()).includes(tag)
        );
        const allTagSel = tagCells.length > 0 && tagCells.every(c => _treemapSelectedSymbols.has(c.getAttribute('data-symbol')));
        btn.style.background  = allTagSel ? 'var(--accent)' : '';
        btn.style.color       = allTagSel ? '#fff' : '';
        btn.style.borderColor = allTagSel ? 'var(--accent)' : '';
    });
}

function exitTreemapSelectMode() {
    _treemapSelectMode = false;
    _treemapSelectedSymbols.clear();

    const toolbar = document.getElementById('treemapSelectToolbar');
    if (toolbar) toolbar.style.display = 'none';

    document.querySelectorAll('.treemap-cell').forEach(c => {
        c.style.opacity = '1';
        c.style.outline = 'none';
    });
}

// ==========================================
// 🏷️ 태그 비중 막대 차트
// ==========================================
function renderTagBar(treemapData) {
    const el = document.getElementById('tagBarChart');
    if (!el) return;

    // 태그 자체가 없으면 숨김
    if (!state.tags || Object.keys(state.tags).length === 0) {
        el.style.display = 'none';
        return;
    }

    const totalVal = treemapData.reduce((s, d) => s + d.value, 0);
    if (totalVal === 0) { el.style.display = 'none'; return; }

    // 태그별 평가금액 집계 (태그 여러 개면 균등 분배)
    const tagMap = {};
    let untaggedVal = 0;

    treemapData.forEach(d => {
        const tagStr = (state.tags[d.symbol] || '').trim();
        const tags = tagStr ? tagStr.split(',').map(t => t.trim()).filter(Boolean) : [];
        if (tags.length === 0) {
            untaggedVal += d.value;
        } else {
            tags.forEach(tag => {
                tagMap[tag] = (tagMap[tag] || 0) + d.value / tags.length;
            });
        }
    });

    const tagEntries = Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
    if (tagEntries.length === 0) { el.style.display = 'none'; return; }

    // 색상 팔레트
    const palette = [
        '#4f8ef7','#f7874f','#4fd47a','#f7d44f','#a44ff7',
        '#f74f7a','#4fd4f7','#f7b44f','#7af74f','#f74fce'
    ];

    const segments = tagEntries.map(([tag, val], i) => ({
        tag, val, pct: val / totalVal * 100, color: palette[i % palette.length]
    }));
    if (untaggedVal > 0) {
        segments.push({
            tag: '미분류', val: untaggedVal,
            pct: untaggedVal / totalVal * 100,
            color: 'var(--bg3)'
        });
    }

    // 막대 세그먼트
    const barHTML = segments.map(s => `
        <div title="${s.tag}: ${s.pct.toFixed(1)}%"
             style="width:${s.pct.toFixed(3)}%; height:100%; background:${s.color};
                    position:relative; overflow:hidden; transition:opacity 0.15s; cursor:default;"
             onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
            ${s.pct >= 6 ? `
            <span style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
                          font-size:10px; font-weight:700; color:#fff; white-space:nowrap;
                          text-shadow:0 1px 3px rgba(0,0,0,0.65);">${s.pct.toFixed(1)}%</span>` : ''}
        </div>`).join('');

    // 범례
    const legendHTML = segments.map(s => `
        <div style="display:flex; align-items:center; gap:4px; white-space:nowrap;">
            <span style="width:9px; height:9px; border-radius:2px; background:${s.color};
                         flex-shrink:0; display:inline-block; border:1px solid rgba(255,255,255,0.15);"></span>
            <span style="font-size:11px; color:var(--text2);">${s.tag}</span>
            <span style="font-size:11px; color:var(--text3); font-family:var(--font-mono);">${s.pct.toFixed(1)}%</span>
        </div>`).join('');

    el.style.display = 'block';
    el.innerHTML = `
        <div style="height:20px; width:100%; border-radius:4px; overflow:hidden;
                    display:flex; gap:1px; margin-bottom:7px;">
            ${barHTML}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:5px 14px;">
            ${legendHTML}
        </div>`;
}

// ==========================================
// 🌟 ESC 키를 누르면 가장 위에 있는 모달 1개만 닫기
// ==========================================
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
        
        // 1. 현재 화면에 표시된(열려있는) 모든 모달(.overlay) 찾기
        const overlays = Array.from(document.querySelectorAll('.overlay'));
        const visibleModals = overlays.filter(modal => {
            const isDisplayOn = modal.style.display !== 'none' && modal.style.display !== '';
            const isOpenClass = modal.classList.contains('open');
            return isDisplayOn || isOpenClass;
        });

        // 열려있는 모달이 없으면 반응하지 않음
        if (visibleModals.length === 0) return;

        // 2. 가장 화면 위쪽에 있는 모달(최상단) 판별하기
        // (z-index가 가장 높거나, 같다면 HTML 코드상 가장 마지막에 작성되어 위로 덮인 요소)
        let topModal = visibleModals[0];
        let maxZ = parseInt(window.getComputedStyle(topModal).zIndex) || 0;

        for (let i = 1; i < visibleModals.length; i++) {
            const z = parseInt(window.getComputedStyle(visibleModals[i]).zIndex) || 0;
            // z-index가 더 크거나 같으면 (배열 뒤쪽일수록 나중에 렌더링되므로 위쪽임) 교체
            if (z >= maxZ) {
                maxZ = z;
                topModal = visibleModals[i];
            }
        }

        // 3. 판별된 최상단 모달 딱 1개만 닫기
        if (topModal.classList.contains('open')) {
            topModal.classList.remove('open');
        } else {
            topModal.style.display = 'none';
        }
    }
});

async function initMarketSignalBar() {
  try {
    const res = await fetch(`data/indicators.csv?t=${new Date().getTime()}`);
    if (!res.ok) throw new Error('CSV not found');
    const text = await res.text();
    
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] ?? '');
      return obj;
    }).filter(r => r.Date);

    if (!rows.length) return;
    const latest = rows[rows.length - 1];

    document.getElementById('marketSignalBar').style.display = 'block';
    document.getElementById('marketSignalBar').setAttribute('data-loaded', '1');

    // ── 헬퍼 ──────────────────────────────────────────
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    // ── 1. 종합 신호 ──────────────────────────────────
    const score = parseFloat(latest.Composite_Index);
    let signalLabel = '매수 자제', signalColor = 'var(--loss)', signalBg = 'rgba(58,154,255,0.12)';
    if (score >= 400)      { signalLabel = '강한 매수';  signalColor = 'var(--profit)'; signalBg = 'rgba(0,200,122,0.15)'; }
    else if (score >= 200) { signalLabel = '분할 매수';  signalColor = '#00c87a';        signalBg = 'rgba(0,200,122,0.1)'; }
    else if (score >= 100) { signalLabel = '관 망';      signalColor = '#ffb703';        signalBg = 'rgba(255,183,3,0.12)'; }

    const scoreEl = document.getElementById('ms-score');
    scoreEl.textContent = isNaN(score) ? '—' : Math.round(score);
    scoreEl.style.color = signalColor;

    const badge = document.getElementById('ms-badge');
    badge.textContent = signalLabel;
    badge.style.color = signalColor;
    badge.style.backgroundColor = signalBg;
    badge.style.borderColor = signalColor;

    // ── 2. TQQQ ──────────────────────────────────────
    const tqqq = parseFloat(latest.TQQQ);
    const tqqqEl = document.getElementById('ms-tqqq');
    const tqqqGauge = document.getElementById('ms-tqqq-gauge');
    const tqqqHint = document.getElementById('ms-tqqq-hint');
    if (!isNaN(tqqq)) {
      tqqqEl.textContent = '$' + tqqq.toFixed(2);
      // 0~200 범위 기준 게이지
      const pct = clamp((tqqq / 150) * 100, 5, 95);
      tqqqGauge.style.width = pct + '%';
      let tColor, tHint;
      if (tqqq >= 100) { tColor = 'var(--profit)'; tHint = '강세 구간'; }
      else if (tqqq >= 50) { tColor = '#ffb703'; tHint = '중립 구간'; }
      else { tColor = 'var(--loss)'; tHint = '약세 구간'; }
      tqqqEl.style.color = tColor;
      tqqqGauge.style.background = tColor;
      tqqqHint.textContent = tHint;
      tqqqHint.style.color = tColor;
    } else {
      tqqqEl.textContent = 'N/A';
      tqqqHint.textContent = '데이터 없음';
    }

    // ── 3. 버핏 지수 ──────────────────────────────────
    const buff = parseFloat(latest.Buffett_Indicator);
    const buffEl = document.getElementById('ms-buffett');
    const buffGauge = document.getElementById('ms-buffett-gauge');
    const buffHint = document.getElementById('ms-buffett-hint');
    if (!isNaN(buff)) {
      buffEl.textContent = buff.toFixed(1) + '%';
      // 0~200% 범위 기준 게이지 (100%가 중간)
      const pct = clamp((buff / 200) * 100, 2, 98);
      buffGauge.style.width = pct + '%';
      let bColor, bHint;
      if (buff < 80)       { bColor = 'var(--profit)'; bHint = '저평가 구간'; }
      else if (buff < 100) { bColor = '#00c87a';        bHint = '적정 수준'; }
      else if (buff < 130) { bColor = '#ffb703';        bHint = '다소 고평가'; }
      else                 { bColor = 'var(--loss)';    bHint = '고평가 경계'; }
      buffEl.style.color = bColor;
      buffGauge.style.background = bColor;
      buffHint.textContent = bHint;
      buffHint.style.color = bColor;
    } else {
      buffEl.textContent = 'N/A';
      buffHint.textContent = '데이터 없음';
    }

    // ── 4. 공포탐욕 ──────────────────────────────────
    const fg = parseFloat(latest.Fear_Greed);
    const fgEl = document.getElementById('ms-fg');
    const fgDot = document.getElementById('ms-fg-dot');
    const fgHint = document.getElementById('ms-fg-hint');
    if (!isNaN(fg)) {
      fgEl.textContent = fg.toFixed(1);
      fgDot.style.left = clamp(fg, 2, 98) + '%';
      let fColor, fHint;
      if (fg < 25)       { fColor = '#3A9AFF'; fHint = '극단적 공포 🟢'; }
      else if (fg < 45)  { fColor = '#4d9fff'; fHint = '공포 구간'; }
      else if (fg < 55)  { fColor = '#ffb703'; fHint = '중립'; }
      else if (fg < 75)  { fColor = '#ff9f43'; fHint = '탐욕 구간'; }
      else               { fColor = '#ff4d6a'; fHint = '극단적 탐욕 🔴'; }
      fgEl.style.color = fColor;
      fgHint.textContent = fHint;
      fgHint.style.color = fColor;
    } else {
      fgEl.textContent = 'N/A';
      fgHint.textContent = '데이터 없음';
    }

    // ── 5. RSI(14) ────────────────────────────────────
    const rsi = parseFloat(latest.RSI_14);
    const rsiEl = document.getElementById('ms-rsi');
    const rsiGauge = document.getElementById('ms-rsi-gauge');
    const rsiHint = document.getElementById('ms-rsi-hint');
    if (!isNaN(rsi)) {
      rsiEl.textContent = rsi.toFixed(1);
      const pct = clamp(rsi, 2, 98);
      rsiGauge.style.width = pct + '%';
      let rColor, rHint;
      if (rsi < 30)      { rColor = 'var(--profit)'; rHint = '과매도 🟢'; }
      else if (rsi < 50) { rColor = '#4d9fff';        rHint = '하락세'; }
      else if (rsi < 70) { rColor = '#ffb703';        rHint = '상승세'; }
      else               { rColor = '#ff4d6a';        rHint = '과매수 🔴'; }
      rsiEl.style.color = rColor;
      rsiGauge.style.background = rColor;
      rsiHint.textContent = rHint;
      rsiHint.style.color = rColor;
    } else {
      rsiEl.textContent = 'N/A';
      rsiHint.textContent = '데이터 없음';
    }

  } catch (e) {
    console.warn('Market Signal Bar 로드 실패:', e);
  }
}
document.addEventListener('DOMContentLoaded', initMarketSignalBar);


// ==========================================
// 🔤 전체 폰트 크기 설정
// ==========================================
const FONT_SIZE_KEY = 'ttm_font_size';
const FONT_SIZE_LEVELS = { xs: 0.82, sm: 0.91, md: 1.0, lg: 1.1, xl: 1.22 };

function applyFontSize(level) {
    const zoom = FONT_SIZE_LEVELS[level] || 1.0;
    document.documentElement.style.fontSize = (zoom * 16) + 'px';
    localStorage.setItem(FONT_SIZE_KEY, level);

    // 버튼 active 상태 동기화
    document.querySelectorAll('.font-size-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-level') === level;
        btn.style.background    = isActive ? 'var(--accent)'    : 'transparent';
        btn.style.color         = isActive ? '#fff'             : 'var(--text2)';
        btn.style.borderColor   = isActive ? 'var(--accent)'    : 'var(--border2)';
        btn.style.fontWeight    = isActive ? '700'              : '500';
    });
}

function loadFontSize() {
    const saved = localStorage.getItem(FONT_SIZE_KEY) || 'md';
    applyFontSize(saved);
}

// 페이지 로드 시 즉시 적용 (깜빡임 방지)
loadFontSize();

// 설정 모달이 열릴 때마다 버튼 상태 동기화
(function watchFontSettingsModal() {
    const overlay = document.getElementById('masterSettingsOverlay');
    if (!overlay) { setTimeout(watchFontSettingsModal, 300); return; }
    new MutationObserver(() => {
        if (overlay.classList.contains('open')) {
            const saved = localStorage.getItem(FONT_SIZE_KEY) || 'md';
            applyFontSize(saved);
        }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
})();
