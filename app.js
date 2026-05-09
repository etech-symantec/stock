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
      if(!parsed.oldNames) parsed.oldNames = {}; // 🌟 구 종목명 저장용 객체 추가
      if(parsed.transactions) {
          parsed.transactions.forEach(tx => { tx.date = formatDate(tx.date); });
      }
      return parsed;
    }
  } catch(e){}
  return { tickers: ['AAPL','TSLA','005930.KS','000660.KS'], transactions: [], range: '1y', tags: {}, owners: { user1: { name: '소유자1', color: '#7c6af7', icon: '👤' }, user2: { name: '소유자2', color: '#00c87a', icon: '👤' } } };
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
    return d.toISOString().split('T')[0];
}
let currentDivFilter = 'all'; 
// 🌟 기본 정렬을 등락률로 변경하고, 리스트 스타일 관련 변수 및 함수 추가
let currentSortMode = 'changeDesc'; 
let sortDirection = 1; // 🌟 1(내림차순)을 기본값으로 변경하여 높은 수익률이 상단에 오게 설정
let activeAccountFilter = null; 
let currentListStyle = 'card';
let currentRegionLayout = 'vertical'; // 🌟 [추가] 기본 배치는 상하(vertical)로 설정
let realizedChartInst = null; // 🌟 실현수익 차트 저장 변수
// 🌟 실현수익 필터 상태 저장 변수 및 업데이트 함수
let realizedFilters = { market: 'all', symbol: null, tradeIdx: null };
// 🌟 실현수익 랭킹 탭 상태 (pnl: 수익금 | roi: 수익률)
let realizedRankingTab = 'pnl';
// 🌟 실현수익 랭킹 기간 필터 (all | 1y | 6m | 3m | 1m)
let realizedRankingPeriod = 'all';
let realizedRankingSortDir = 'desc'; // 'desc' 내림차순 | 'asc' 오름차순
// 🌟 종목 리스트 검색 및 태그 필터 상태 변수
let currentLocalSearch = '';
let currentLocalTag = 'all';
// 'yieldDesc' | 'yieldAsc' | 'totalDesc' | 'totalAsc'
let currentDivSort = 'yieldDesc';
function setDivSort(val) {
    currentDivSort = val;
    renderDividendDashboard();
}

function updateLocalSearch(val) {
    currentLocalSearch = val;
    render();
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

// 🌟 모든 실현수익 필터 초기화 함수 (에러 발생 원인!)
function resetRealizedFilters() {
    realizedFilters.symbol = null;
    realizedFilters.tradeIdx = null;
    renderRealizedDashboard();
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

// 🌟 실현수익 랭킹 기간 필터 전환
function setRealizedRankingPeriod(period) {
    realizedRankingPeriod = period;
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
function buildChart(canvasId, prices, passedDates, mini, symbol) {
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
      const buyData = [];
      const sellData = [];
      
      const txs = state.transactions.filter(t => t.symbol === symbol && t.txType !== 'dividend');
      txs.forEach(tx => {
          let dateIdx = displayRawDates.indexOf(tx.date);
          
          // 차트에 정확한 날짜가 없으면 가장 가까운 다음 날짜로 위치 보정
          if (dateIdx === -1) {
              for(let k = 0; k < displayRawDates.length; k++) {
                  if (displayRawDates[k] >= tx.date) { dateIdx = k; break; }
              }
              if (dateIdx === -1 && tx.date <= displayRawDates[displayRawDates.length-1]) {
                  dateIdx = displayRawDates.length - 1;
              }
          }
          
          // 💡 확실하게 Chart.js가 인식하는 {x, y, qty} 좌표 구조로 데이터 추가!
          if (dateIdx !== -1) {
              if (tx.qty > 0) {
                  buyData.push({ x: displayDates[dateIdx], y: tx.price, qty: tx.qty });
              } else if (tx.qty < 0) {
                  sellData.push({ x: displayDates[dateIdx], y: tx.price, qty: Math.abs(tx.qty) });
              }
          }
      });
      
      if (buyData.length > 0) {
          datasets.push({
              label: '매수', data: buyData, type: 'line', showLine: false,
              pointStyle: 'triangle', backgroundColor: '#ff4d6a', borderColor: '#fff',
              borderWidth: mini ? 1 : 1.5, pointRadius: mini ? 4 : 8, pointHoverRadius: mini ? 6 : 10, order: 1
          });
      }
      if (sellData.length > 0) {
          datasets.push({
              label: '매도', data: sellData, type: 'line', showLine: false,
              pointStyle: 'triangle', rotation: 180, backgroundColor: '#4d9fff', borderColor: '#fff',
              borderWidth: mini ? 1 : 1.5, pointRadius: mini ? 4 : 8, pointHoverRadius: mini ? 6 : 10, order: 2
          });
      }
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
                        if (ctx.dataset.label === '매수' && ctx.raw) return `🔴 매수: ${formatPrice(ctx.raw.y, sym)} (${ctx.raw.qty}주)`;
                        if (ctx.dataset.label === '매도' && ctx.raw) return `🔵 매도: ${formatPrice(ctx.raw.y, sym)} (${ctx.raw.qty}주)`;
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
let historyFilters = { market: 'all', type: 'all', search: '', dateFrom: '', dateTo: '', broker: 'all' };
function updateHistoryFilter(key, value) {
    historyFilters[key] = value;
    renderHistoryDashboard();
}
function isCrypto(symbol) { return symbol.endsWith('-USD'); }
function formatPrice(val, symbol) {
  if (isKorean(symbol)) return '₩' + Math.round(val).toLocaleString();
  return '$' + val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
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
  document.getElementById('masterSettingsOverlay').classList.add('open');
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

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if(data.tickers && data.transactions) {
        state = data;
        if(!state.owners) {
           state.owners = {
             user1: { name: state.ownerNames?.user1 || '소유자1', color: '#7c6af7', icon: '👤' },
             user2: { name: state.ownerNames?.user2 || '소유자2', color: '#00c87a', icon: '👤' }
           };
        }
        if(state.transactions) state.transactions.forEach(tx => { tx.date = formatDate(tx.date); });
        saveState();
        cachedMarketData = {};
        updateOwnerLabels();
        renderTxList();
        if (currentView === 'history') renderHistoryDashboard();
        else render();
        triggerAutoSync();
        alert('데이터를 성공적으로 복원했습니다.');
      } else {
        alert('올바른 백업 파일 형식이 아닙니다.');
      }
    } catch(err) {
      alert('파일을 읽는 중 오류가 발생했습니다.');
    }
    event.target.value = '';
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
        else if (typeStr.includes('매도') || typeStr.toLowerCase() === 'sell') { txType = 'sell'; qty = -Math.abs(qty); }
        else if (typeStr.includes('매수') || typeStr.toLowerCase() === 'buy') { txType = 'buy'; qty = Math.abs(qty); }

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

  document.getElementById('tabUser1').textContent = `${o1.icon} ${o1.name}`;
  document.getElementById('tabUser2').textContent = `${o2.icon} ${o2.name}`;
  document.getElementById('lblUser1').innerHTML = `${o1.icon} ${o1.name}`;
  document.getElementById('lblUser2').innerHTML = `${o2.icon} ${o2.name}`;
  document.getElementById('divTabUser1').textContent = `${o1.icon} ${o1.name}`;
  document.getElementById('divTabUser2').textContent = `${o2.icon} ${o2.name}`;
  const realTab1 = document.getElementById('realTabUser1');
  const realTab2 = document.getElementById('realTabUser2');
  if (realTab1) realTab1.textContent = `${o1.icon} ${o1.name}`;
  if (realTab2) realTab2.textContent = `${o2.icon} ${o2.name}`;
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
  document.getElementById('txSymbol').value = tx.symbol.replace('.KS', '');
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
  const tbody = document.getElementById('historyTableBody');
  const dash = document.getElementById('historyDashboard');
  if(!tbody || !dash) return;
  
  // 💡 HTML 수정 없이 JS가 알아서 필터 바를 만들어줍니다!
  let filterBar = document.getElementById('historyFilterBar');

  // 계좌 목록 동적 수집
  const allBrokers = [...new Set(state.transactions.map(t => t.broker).filter(b => b && b.trim()))].sort();

  if (!filterBar) {
      filterBar = document.createElement('div');
      filterBar.id = 'historyFilterBar';
      filterBar.style.cssText = "margin-bottom:15px; padding:12px 15px; background:var(--bg3); border-radius:8px; border:1px solid var(--border);";
      const tableWrap = tbody.closest('div');
      dash.insertBefore(filterBar, tableWrap);
  }

  const hasActiveExtra = historyFilters.dateFrom || historyFilters.dateTo || historyFilters.broker !== 'all';
  // 필터 바 HTML 재렌더링 (계좌 목록이 바뀔 수 있으므로 항상 갱신)
  filterBar.innerHTML = `
      <div style="display:flex; gap:7px; align-items:center; flex-wrap:wrap;">
          <select class="form-input" style="width:100px; padding:6px 7px; margin:0; cursor:pointer; font-size:12px; flex-shrink:0;" onchange="updateHistoryFilter('market', this.value)">
              <option value="all" ${historyFilters.market==='all'?'selected':''}>🌐 전체</option>
              <option value="kr" ${historyFilters.market==='kr'?'selected':''}>🇰🇷 국내</option>
              <option value="us" ${historyFilters.market==='us'?'selected':''}>🇺🇸 해외</option>
          </select>
          <select class="form-input" style="width:105px; padding:6px 7px; margin:0; cursor:pointer; font-size:12px; flex-shrink:0;" onchange="updateHistoryFilter('type', this.value)">
              <option value="all" ${historyFilters.type==='all'?'selected':''}>전체 유형</option>
              <option value="buy" ${historyFilters.type==='buy'?'selected':''}>🔴 매수</option>
              <option value="sell" ${historyFilters.type==='sell'?'selected':''}>🔵 매도</option>
              <option value="dividend" ${historyFilters.type==='dividend'?'selected':''}>🟢 배당</option>
          </select>
          <select class="form-input" id="historyBrokerFilter" style="width:115px; padding:6px 7px; margin:0; cursor:pointer; font-size:12px; flex-shrink:0;" onchange="updateHistoryFilter('broker', this.value)">
              <option value="all" ${historyFilters.broker==='all'?'selected':''}>🏦 전체 계좌</option>
              ${allBrokers.map(b => `<option value="${b}" ${historyFilters.broker===b?'selected':''}>${b}</option>`).join('')}
          </select>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <input type="date" class="form-input" id="historyDateFrom" value="${historyFilters.dateFrom}" style="width:134px; padding:6px 7px; margin:0; font-size:12px;" onchange="updateHistoryFilter('dateFrom', this.value)">
              <span style="color:var(--text3); font-size:11px; flex-shrink:0;">~</span>
              <input type="date" class="form-input" id="historyDateTo" value="${historyFilters.dateTo}" style="width:134px; padding:6px 7px; margin:0; font-size:12px;" onchange="updateHistoryFilter('dateTo', this.value)">
          </div>
          <div style="display:flex; gap:3px; flex-shrink:0;">
              <button class="btn-sm" onclick="setHistoryDatePreset('1m')" style="padding:5px 7px; font-size:11px;">1M</button>
              <button class="btn-sm" onclick="setHistoryDatePreset('3m')" style="padding:5px 7px; font-size:11px;">3M</button>
              <button class="btn-sm" onclick="setHistoryDatePreset('6m')" style="padding:5px 7px; font-size:11px;">6M</button>
              <button class="btn-sm" onclick="setHistoryDatePreset('1y')" style="padding:5px 7px; font-size:11px;">1Y</button>
              <button class="btn-sm" onclick="setHistoryDatePreset('ytd')" style="padding:5px 7px; font-size:11px;">YTD</button>
          </div>
          <input type="text" class="form-input" placeholder="🔍 종목명 / 티커" value="${historyFilters.search}" style="flex:1; min-width:120px; padding:6px 10px; margin:0; font-size:12px;" onkeydown="if(event.key === 'Enter') updateHistoryFilter('search', this.value)">
          ${hasActiveExtra ? `<button class="btn-sm" onclick="resetHistoryFilters()" style="padding:5px 9px; font-size:11px; color:var(--red); border-color:var(--red); flex-shrink:0;">✕ 초기화</button>` : ''}
      </div>
  `;
  
  // 🌟 선택된 필터 조건에 맞게 데이터 걸러내기
  let filtered = state.transactions.filter(tx => {
      let pass = true;
      const isKr = isKorean(tx.symbol);
      
      // 국가 필터
      if (historyFilters.market === 'kr' && !isKr) pass = false;
      if (historyFilters.market === 'us' && isKr) pass = false;
      
      // 거래 유형 필터
      if (historyFilters.type === 'buy' && (tx.txType !== 'trade' || tx.qty <= 0)) pass = false;
      if (historyFilters.type === 'sell' && (tx.txType !== 'trade' || tx.qty >= 0)) pass = false;
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

      // 🌟 글로벌 기간 설정 연동 필터 (1D~3Y)
      const cutoff = getCutoffDateFromRange(state.range);
      if (tx.date < cutoff) pass = false;

      return pass;
  });

  const sorted = filtered.sort((a,b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
  
  if(sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text3);">조건에 맞는 거래 내역이 없습니다.</td></tr>`;
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

      return `
      <tr style="border-bottom: 1px solid var(--border); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
          <td style="padding:12px 16px; color:var(--text2);">${tx.date}</td>
          <td style="padding:12px 16px;"><span class="tx-owner-badge" onclick="toggleTxOwner(${tx.id})" title="클릭하여 소유자 변경" style="margin:0; background:${oInfo.color}20; color:${oInfo.color}; border:1px solid ${oInfo.color}40;">${oInfo.icon} ${tx.owner} ⇄</span></td>
          <td style="padding:12px 16px; color:var(--text2);">${tx.broker || '-'}</td>
          <td style="padding:12px 16px; font-weight:700; color:${typeColor};">${typeLabel}</td>
          <td style="padding:12px 16px;"><div style="font-weight:700; color:var(--text);">${stockName}</div><div style="font-size:10px; font-family:var(--font-mono); color:var(--text3);">${tx.symbol.replace('.KS.DLST','').replace('.DLST','')}</div></td>
          <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono);">${isDiv ? '-' : Math.abs(tx.qty)}</td>
          <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono);">${isDiv ? '-' : formatPrice(tx.price, tx.symbol)}</td>
          <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--text);">${formatPrice(totalAmt, tx.symbol)}</td>
          <td style="padding:12px 16px; text-align:center;"><div class="tx-actions" style="justify-content:center;"><button class="tx-action-btn tx-edit" onclick="editTransaction(${tx.id})" title="수정">✏️</button><button class="tx-action-btn tx-del" onclick="deleteTransaction(${tx.id})" title="삭제">✕</button></div></td>
      </tr>`;
  }).join('');
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
    historyFilters.dateFrom = '';
    historyFilters.dateTo = '';
    historyFilters.broker = 'all';
    renderHistoryDashboard();
}

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
    
    dropdown.innerHTML = results.map(q => `
      <li class="search-item" onclick="${onSelect}('${q.symbol}', '${q.name.replace(/'/g, "\\'")}')">
        <div style="display:flex; flex-direction:column; gap:2px; max-width:70%;">
          <span style="font-weight:500; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${q.name}</span>
          <span style="font-size:10px; color:var(--text3);">${q.exch}</span>
        </div>
        <span style="color:var(--accent); font-family:var(--font-mono); font-size:12px; font-weight:700;">${q.symbol}</span>
      </li>
    `).join('');
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
  if (data && data.last) { currentUsdKrw = data.last; isExchangeRateFetched = true; }
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
  const targetUrl = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${API_KEY}&numOfRows=252&pageNo=1&resultType=json&beginBasDt=${beginDate}&srtnCd=${cleanSymbol}`;
  
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
async function fetchYahooAPI(symbol) {
  // 비정상적인 포맷 차단
  if (!/^[A-Za-z0-9.=^-]+$/.test(symbol)) {
    return { _failed: true };
  }
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1d`;
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
    
    return {
      symbol: symbol, name: cName, currency: meta.currency || 'USD',
      prices: validPrices, dates: validDates, rawDates: rawDates,
      last: validPrices[validPrices.length-1],
      prev: validPrices[validPrices.length-2] || validPrices[validPrices.length-1]
    };
  } catch (e) {
    return { _failed: true };
  }
}

// 🌟 3. 최종 데이터 라우터 (이 함수가 순서를 제어합니다)
// 기존 앱 로직에서 이 함수를 호출하므로 이름은 그대로 유지합니다.
async function fetchYahooData(symbol) {
    // 🌟 [추가] 상장폐지 종목은 API 호출을 아예 스킵하고 즉시 실패처리
    if (symbol.endsWith('.DLST')) return { _failed: true };
  
    // 국내 주식 티커 형태 (예: 005930.KS) 인지 확인
    if (/^\d{6}\.K[SQ]$/.test(symbol)) {
        // 1순위: 공공데이터포털 호출
        let publicData = await fetchPublicData(symbol);
        
        if (publicData && !publicData._failed) {
            return publicData; // 성공 시 바로 리턴
        }
        
        // 2순위: 공공데이터 실패 시 야후 파이낸스로 대비(Fallback)
        return await fetchYahooAPI(symbol);
    } else {
        // 미국 주식, 환율 등은 1순위로 바로 야후 파이낸스 호출
        return await fetchYahooAPI(symbol);
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

    // 3. 오늘 전체 손익 (제목 옆) 업데이트
    const totalColor = totalChangePct > 0 ? 'var(--profit)' : totalChangePct < 0 ? 'var(--loss)' : 'var(--text2)';
    totalChangeEl.style.color = totalColor;
    totalChangeEl.textContent = `${totalChangePct > 0 ? '+' : ''}${totalChangePct.toFixed(2)}%`;
    if (totalPnlEl) {
        totalPnlEl.style.color = totalColor;
        totalPnlEl.textContent = `(${totalChangePct > 0 ? '+' : ''}₩${Math.round(totalPnl).toLocaleString()})`;
    }

    // 시장별 타이틀 옆 손익 텍스트 생성기
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
            return `
            <div style="padding:7px 9px; background:${bgAlpha}; border-radius:8px; border:1px solid ${borderAlpha}; margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:11px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.name}</div>
                        <div style="font-size:9px; color:var(--text3); font-family:var(--font-mono); margin-top:1px;">${r.symbol}</div>
                    </div>
                    <div style="font-size:14px; font-weight:700; font-family:var(--font-mono); color:${accentColor};">${sign}${r.chg1d.toFixed(2)}%</div>
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

    if (portfolioChartInst) portfolioChartInst.destroy();

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
    if(allocationChartInst && typeof allocationChartInst.destroy === 'function') allocationChartInst.destroy();

    let krwSummary = { totalEval: 0, totalCost: 0, accounts: {} };
    let usdSummary = { totalEval: 0, totalCost: 0, accounts: {} };
    let treemapDataMap = {};
    
    if (fullDisplayItems) {
      fullDisplayItems.forEach(item => {
        if(item.type === 'held' && item.evalAmt > 0) {
          let sym = item.symbol;
          if(!treemapDataMap[sym]) {
             treemapDataMap[sym] = { symbol: sym, name: item.data ? item.data.name : sym, value: 0, change: item.activeChange || 0 };
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

    let krwDiv = 0, usdDiv = 0;
    let filterName = 'all';
    if (currentView === 'user1') filterName = state.owners.user1.name;
    if (currentView === 'user2') filterName = state.owners.user2.name;

    // 누적 실현수익 계산
    let cumulRealKr = 0, cumulRealUs = 0;
    const holdingsForReal = {};
    const sortedForReal = [...state.transactions]
        .filter(t => filterName === 'all' || t.owner === filterName)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    sortedForReal.forEach(tx => {
        if (tx.txType === 'dividend' || tx.txType === 'transfer') {
            if (tx.txType === 'dividend') {
                if (isKorean(tx.symbol)) krwDiv += tx.price; else usdDiv += tx.price;
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
            else cumulRealUs += pnl;
            h.qty -= sellQty;
            if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
        }
    });
    // dividend 는 위에서 처리했으니 중복 계산 방지를 위해 아래 루프는 제거
    
    const globalDiv = krwDiv + (usdDiv * currentUsdKrw);
    const globalCost = krwSummary.totalCost + (usdSummary.totalCost * currentUsdKrw);
    const globalEval = krwSummary.totalEval + (usdSummary.totalEval * currentUsdKrw);
    const cumulRealTotal = cumulRealKr + (cumulRealUs * currentUsdKrw);
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
                      <div class="treemap-cell" style="left:${x}%; top:${y}%; width:${w}%; height:${h}%; background:${bg};" 
                           data-name="${it.name}" data-val="₩${Math.round(it.value).toLocaleString()}">
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

            document.querySelectorAll('.treemap-cell').forEach(cell => {
                cell.addEventListener('mouseenter', (e) => {
                    let tooltipEl = document.getElementById('chartjs-tooltip');
                    if (!tooltipEl) {
                        tooltipEl = document.createElement('div');
                        tooltipEl.id = 'chartjs-tooltip';
                        document.body.appendChild(tooltipEl);
                    }
                    let name = cell.getAttribute('data-name');
                    let val = cell.getAttribute('data-val');
                    tooltipEl.innerHTML = `<div style="font-size:13px; font-weight:700; margin-bottom:4px; text-align:center;">${name}</div><div style="font-size:13px; text-align:center; color:var(--text);">${val}</div>`;
                    tooltipEl.style.opacity = 1;
                });
                cell.addEventListener('mousemove', (e) => {
                    let tooltipEl = document.getElementById('chartjs-tooltip');
                    if(tooltipEl) {
                      tooltipEl.style.left = e.pageX + 'px';
                      tooltipEl.style.top = (e.pageY - 10) + 'px';
                    }
                });
                cell.addEventListener('mouseleave', () => {
                    let tooltipEl = document.getElementById('chartjs-tooltip');
                    if(tooltipEl) tooltipEl.style.opacity = 0;
                });
            });
        }
    }

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
                      innerHtml += `<div style="font-size:13px; font-weight:700; display:flex; align-items:center;">${span}${name}</div>`;
                      innerHtml += `<div style="font-size:13px; color:var(--text); padding-left:16px;">${formatVal}</div>`;
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
  let krwTotal = 0, usdTotal = 0;
  let monthlyKrw = {}, monthlyUsd = {};
  let symTotals = {};
  let divYields = {}; 

  const cutoff = getCutoffDateFromRange(state.range);
  const divTxs = state.transactions.filter(t => {
    if(t.txType !== 'dividend') return false;
    if(t.date < cutoff) return false; // 🌟 선택된 기간 이전의 배당 내역 제외
  
    let filterName = 'all';
    if(currentDivFilter === 'user1') filterName = state.owners.user1.name;
    if(currentDivFilter === 'user2') filterName = state.owners.user2.name;
    if(filterName !== 'all' && t.owner !== filterName) return false;
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
     if (!divYields[sym]) divYields[sym] = { totalDiv: 0, totalEvalAtDiv: 0 };

     if (isKRW) { krwTotal += amt; monthlyKrw[month] += amt; symTotals[sym].krw += amt; }
     else { usdTotal += amt; monthlyUsd[month] += amt; symTotals[sym].usd += amt; }
     
     divYields[sym].totalDiv += amt;
     
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
  const grandTotal = krwTotal + (usdTotal * currentUsdKrw);
  document.getElementById('divTotalConverted').textContent = `₩ ${Math.round(grandTotal).toLocaleString()}`;

  // 🌟 배당 리스트 정렬 기준 적용 (배당률 순 vs 배당금 순)
  let symArr = Object.keys(symTotals).map(sym => {
    let yData = divYields[sym];
    let yPct = (yData && yData.totalEvalAtDiv > 0) ? (yData.totalDiv / yData.totalEvalAtDiv) * 100 : 0;
    return { 
        symbol: sym, 
        total: symTotals[sym].krw + (symTotals[sym].usd * currentUsdKrw), 
        yieldPct: yPct 
    };
  });
  
  const divSortFns = {
      yieldDesc: (a, b) => b.yieldPct - a.yieldPct,
      yieldAsc:  (a, b) => a.yieldPct - b.yieldPct,
      totalDesc: (a, b) => b.total    - a.total,
      totalAsc:  (a, b) => a.total    - b.total,
  };
  symArr.sort(divSortFns[currentDivSort] || divSortFns.yieldDesc);
 
  // 🌟 정렬 탭 UI — divStockList 바로 위에 동적 삽입
  const _divListEl = document.getElementById('divStockList');
  let _sortTabBar  = document.getElementById('divSortTabBar');
  if (!_sortTabBar && _divListEl) {
      _sortTabBar = document.createElement('div');
      _sortTabBar.id = 'divSortTabBar';
      _divListEl.parentNode.insertBefore(_sortTabBar, _divListEl);
  }
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
 
      _sortTabBar.innerHTML = `
          <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              margin-bottom: 14px;
              padding-bottom: 14px;
              border-bottom: 1px solid var(--border);
              flex-wrap: wrap;
          ">
              <!-- ── 배당률 그룹 ── -->
              <div style="
                  display: flex;
                  align-items: center;
                  gap: 3px;
                  background: var(--bg3);
                  padding: 4px;
                  border-radius: 8px;
                  border: 1px solid var(--border);
              ">
                  <span style="
                      padding: 5px 8px;
                      font-size: 11px;
                      font-weight: 700;
                      color: var(--text2);
                      white-space: nowrap;
                      letter-spacing: 0.02em;
                  ">📊 배당률</span>
                  ${_tb('yieldDesc', '↓ 높은순', '')}
                  ${_tb('yieldAsc',  '↑ 낮은순', '')}
              </div>
 
              <!-- ── 배당금 그룹 ── -->
              <div style="
                  display: flex;
                  align-items: center;
                  gap: 3px;
                  background: var(--bg3);
                  padding: 4px;
                  border-radius: 8px;
                  border: 1px solid var(--border);
              ">
                  <span style="
                      padding: 5px 8px;
                      font-size: 11px;
                      font-weight: 700;
                      color: var(--text2);
                      white-space: nowrap;
                      letter-spacing: 0.02em;
                  ">💰 배당금</span>
                  ${_tb('totalDesc', '↓ 많은순', '')}
                  ${_tb('totalAsc',  '↑ 적은순', '')}
              </div>
          </div>
      `;
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
  const usdConvertedData = allMonths.map(m => (monthlyUsd[m] || 0) * currentUsdKrw);

  if(divMonthlyChartInst) divMonthlyChartInst.destroy();
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
    if (range === 'all') return 99999; // 🌟 전체 기간일 때 데이터가 잘리지 않도록 매우 큰 값 반환
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
  
  if (modalChartInst) modalChartInst.destroy();
  setTimeout(() => { modalChartInst = buildChart('modalCanvas', displayPrices, displayDates, false, currentModalTicker); }, 50);
}

// 🌟 [추가됨] 화면 멈춤 없이 백그라운드에서 데이터를 몰래 가져오는 함수
let isFetchingMarketData = false;
async function fetchMissingMarketData(symbolsToFetch) {
    if(isFetchingMarketData) return;
    isFetchingMarketData = true;
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
        if(loadingEl) loadingEl.innerHTML = `🔄 실시간 데이터 불러오는 중... (${i}/${symbolsToFetch.length})`;
        const batch = symbolsToFetch.slice(i, i + batchSize);
        await Promise.all(batch.map(async t => {
            let fetchSym = /^\d{6}$/.test(t) ? t + '.KS' : t;
            let fetchedData = await fetchYahooData(fetchSym);
            if (fetchedData) cachedMarketData[t] = fetchedData;
            else cachedMarketData[t] = { _failed: true };
        }));
        
        render(); // 데이터를 3개 가져올 때마다 화면의 빈칸에 쏙쏙 채워 넣음
        
        if (i + batchSize < symbolsToFetch.length) {
            await new Promise(res => setTimeout(res, 1000)); 
        }
    }
    
    isFetchingMarketData = false;
    if(loadingEl) loadingEl.style.opacity = '0';
    
    // 🌟 데이터를 다 가져오면 다음 번 광속 접속을 위해 기기에 임시 저장
    try { 
        localStorage.setItem('sw_market_cache', JSON.stringify(cachedMarketData)); 
        localStorage.setItem('sw_market_cache_time', Date.now().toString());
    } catch(e){}
}

// ── 8. 메인 렌더 함수 (전체 흐름 제어) ──
async function render() {
  if (!isExchangeRateFetched) await fetchExchangeRate();
  
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rtab').forEach(b => {
    if(b.textContent.toLowerCase() === state.range.toLowerCase()) b.classList.add('active');
  });

  const container = document.getElementById('gridContainer');
  const dash = document.getElementById('dashboardTopWrapper');
  const pChartRowWrap = document.getElementById('chartRowWrapper'); 
  const divDash = document.getElementById('dividendDashboard');
  const listOptions = document.getElementById('listOptionsBar');
  const watchlistSearch = document.getElementById('watchlistSearchGroup'); // 🌟 추가된 검색창 요소 찾기
  const mobileSearch = document.getElementById('mobileSearchBar'); // 모바일용 검색창
  const histDash = document.getElementById('historyDashboard');
  const realDash = document.getElementById('realizedDashboard');

  // 🌟 여기서부터 각 탭마다 보여줄 화면과 숨길 화면을 아주 엄격하게 통제합니다! 🌟
  if (currentView === 'dividend') {
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    divDash.style.display = 'flex';
    renderDividendDashboard();
    return;
  } else if (currentView === 'history') {
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; divDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    histDash.style.display = 'flex';
    renderHistoryDashboard();
    return;
  } else if (currentView === 'realized') { 
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; divDash.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'flex';
    renderRealizedDashboard();
    return;
  } else if (currentView === 'watch') {
    dash.style.display = 'none'; pChartRowWrap.style.display = 'none'; 
    container.style.display = 'block'; listOptions.style.display = 'flex'; 
    divDash.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    if(watchlistSearch) watchlistSearch.style.display = 'flex'; 
    if(mobileSearch) mobileSearch.style.display = 'flex';
    renderMainDashboard(displayItems);
  } else {
    // 🌟 전체보기, 소유자별 탭 (메인 대시보드)
    dash.style.display = 'flex'; pChartRowWrap.style.display = 'flex'; container.style.display = 'block'; listOptions.style.display = 'flex'; divDash.style.display = 'none'; histDash.style.display = 'none'; 
    if(realDash) realDash.style.display = 'none';
    if(watchlistSearch) watchlistSearch.style.display = 'none'; 
    if(mobileSearch) mobileSearch.style.display = 'none';
    renderMainDashboard(displayItems);
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
      // 👇 이 줄의 맨 끝에 item.symbol 을 전달하도록 수정합니다!
      chartInstances[item.uniqueId] = buildChart(item.uniqueId, displayPrices, displayDates, true, item.symbol);
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
  el.classList.add('active');
  renderRealizedDashboard();
}

// ==========================================
// 🌟 실현수익 대시보드 렌더링 (최종 완성본 - 에러 수정)
// ==========================================
function renderRealizedDashboard() {
    const realDash = document.getElementById('realizedDashboard');
    if(!realDash) return;

    // 1. UI 필터: 시장(국가) 드롭다운 자동 삽입
    const filterArea = realDash.querySelector('div:first-child > div');
    if (filterArea && !document.getElementById('realizedMarketFilter')) {
        const mFilter = document.createElement('select');
        mFilter.id = 'realizedMarketFilter';
        mFilter.className = 'form-input';
        mFilter.style.cssText = "width:110px; padding:4px 8px; margin:0; font-size:12px; cursor:pointer;";
        mFilter.innerHTML = `
            <option value="all">🌐 전체 국가</option>
            <option value="kr">🇰🇷 국내 주식</option>
            <option value="us">🇺🇸 미국 주식</option>
        `;
        mFilter.onchange = (e) => updateRealizedFilter('market', e.target.value);
        filterArea.insertBefore(mFilter, filterArea.firstChild);
    }

    let ownerName = 'all';
    if (currentRealizedOwnerFilter === 'user1') ownerName = state.owners.user1.name;
    if (currentRealizedOwnerFilter === 'user2') ownerName = state.owners.user2.name;

    const yearSelect = document.getElementById('realizedYearFilter');
    let selectedYear = yearSelect ? yearSelect.value : 'all';

    let years = new Set();
    state.transactions.forEach(t => {
        if (t.txType === 'sell' || t.qty < 0) years.add(t.date.substring(0, 4));
    });
    let yearArr = Array.from(years).sort().reverse();

    if (yearSelect && yearSelect.options.length <= 1 && yearArr.length > 0) {
        let html = `<option value="all">전체 연도</option>`;
        yearArr.forEach(y => html += `<option value="${y}">${y}년</option>`);
        yearSelect.innerHTML = html;
        yearSelect.value = selectedYear;
    }

    // 🌟 변수 선언 (중복 선언 에러 해결)
    let holdings = {};
    let realizedTxs = []; // 하단 표에 들어갈 데이터
    let krwTotal = 0;
    let usdTotal = 0;

    // 차트용 변수
    let chartLabels = [];
    let chartLineData = [];
    let chartBarData = [];
    let cumulativePnl = 0;

    const sortedTx = [...state.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));

    // 2. 과거 내역부터 순차적으로 평단가 및 수익 계산
    sortedTx.forEach(tx => {
        if (tx.txType === 'dividend' || tx.txType === 'transfer') return;
        let broker = tx.broker ? tx.broker.trim() : '미지정';
        let key = `${tx.symbol}::${broker}`;

        if(!holdings[key]) holdings[key] = { qty: 0, avg: 0 };
        let h = holdings[key];

        if (tx.qty > 0) {
            // 매수 시 평단가 갱신
            let totalValue = (h.qty * h.avg) + (tx.qty * tx.price);
            h.qty += tx.qty;
            h.avg = totalValue / h.qty;
        } else if (tx.qty < 0) {
            // 매도 시 수익 계산
            let sellQty = Math.abs(tx.qty);
            let pnl = (tx.price - h.avg) * sellQty;
            let currentAvg = h.avg;
            
            h.qty -= sellQty;
            if (h.qty <= 0) { h.qty = 0; h.avg = 0; }

            let txYear = tx.date.substring(0, 4);
            const isKr = isKorean(tx.symbol);

            // 상단 필터(연도, 소유자, 국가, 종목명) 확인
            const cutoff = getCutoffDateFromRange(state.range);
            const passPeriod = tx.date >= cutoff;
            
            const passYear = (selectedYear === 'all' || txYear === selectedYear);
            const passOwner = (ownerName === 'all' || tx.owner === ownerName);
            const passMarket = (realizedFilters.market === 'all' || (realizedFilters.market === 'kr' ? isKr : !isKr));
            const passSymbol = (realizedFilters.symbol === null || tx.symbol === realizedFilters.symbol);
            
            // 🌟 if문에 passPeriod 조건을 추가합니다.
            if (passYear && passOwner && passMarket && passSymbol && passPeriod) {
                let pnlKrw = pnl * (isKr ? 1 : currentUsdKrw);
                cumulativePnl += pnlKrw;

                // 차트 데이터 누적 (필터 통과한 모든 내역)
                chartLabels.push(tx.date);
                chartLineData.push(cumulativePnl);
                chartBarData.push(pnlKrw);

                // 표 데이터 누적 (차트에서 클릭한 특정 막대 인덱스만 걸러내기)
                const currentDataIndex = chartBarData.length - 1;
                if (realizedFilters.tradeIdx === null || realizedFilters.tradeIdx === currentDataIndex) {
                    realizedTxs.push({
                        date: tx.date, symbol: tx.symbol, owner: tx.owner, broker: broker,
                        sellQty: sellQty, sellPrice: tx.price, avgCost: currentAvg,
                        pnl: pnl, roi: currentAvg > 0 ? (pnl / (currentAvg * sellQty)) * 100 : 0
                    });
                }
                
                // 총계
                if (isKr) krwTotal += pnl;
                else usdTotal += pnl;
            }
        }
    });

    // 3. UI 요약 정보 텍스트 업데이트
    const summaryTitle = document.querySelector('#realizedDashboard .section-title');
    if (realizedFilters.symbol || realizedFilters.tradeIdx !== null) {
        const filterText = realizedFilters.symbol ? realizedFilters.symbol : "선택된 거래 내역";
        summaryTitle.innerHTML = `📈 실현수익: <span style="color:var(--accent)">${filterText}</span> <button class="btn-sm" onclick="resetRealizedFilters()" style="margin-left:8px; padding:2px 8px;">전체보기 ✕</button>`;
    } else {
        summaryTitle.textContent = `📈 연도별 실현수익 통계`;
    }

    document.getElementById('realTotalKrw').textContent = `₩ ${Math.round(krwTotal).toLocaleString()}`;
    document.getElementById('realTotalUsd').textContent = `$ ${usdTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    const grandTotal = krwTotal + (usdTotal * currentUsdKrw);
    const signG = grandTotal >= 0 ? '+' : '';
    const totalEl = document.getElementById('realTotalConverted');
    totalEl.textContent = `${signG}₩ ${Math.round(Math.abs(grandTotal)).toLocaleString()}`;
    totalEl.style.color = grandTotal >= 0 ? '#00C578' : '#3A9AFF';

    // 4. 차트 그리기 함수 호출
    renderRealizedChart(chartLabels, chartLineData, chartBarData);

    // 5. 종목별 통계 집계 → 랭킹 패널 렌더링
    const symStats = {};

    // 🌟 기간 필터: 랭킹용 기간 컷오프 계산
    const rankingPeriodCutoff = (() => {
        const now = new Date();
        const map = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
        if (realizedRankingPeriod in map) {
            const d = new Date(now);
            d.setDate(d.getDate() - map[realizedRankingPeriod]);
            return d.toISOString().substring(0, 10);
        }
        return null;
    })();

    const rankingTxs = rankingPeriodCutoff
        ? realizedTxs.filter(tx => tx.date >= rankingPeriodCutoff)
        : realizedTxs;

    rankingTxs.forEach(tx => {
        const isKr = isKorean(tx.symbol);
        const pnlKrw = tx.pnl * (isKr ? 1 : currentUsdKrw);
        const costKrw = (tx.avgCost * tx.sellQty) * (isKr ? 1 : currentUsdKrw);

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
        // 마지막 매도일 갱신
        if (tx.date > symStats[tx.symbol].lastSellDate) {
            symStats[tx.symbol].lastSellDate = tx.date;
        }
    });
 
    // 🌟 단타왕 속도 점수 = 총 실현수익(₩) ÷ 보유 일수
    //    보유 일수: state.transactions 전체에서 해당 종목 첫 매수일 ~ 마지막 매도일
    Object.values(symStats).forEach(s => {
        const buyTxs = state.transactions.filter(
            t => t.symbol === s.symbol && t.qty > 0 &&
                 t.txType !== 'dividend' && t.txType !== 'transfer'
        );
        const firstBuyDate = buyTxs.length > 0
            ? buyTxs.map(t => t.date).sort()[0]
            : s.lastSellDate;
        const holdDays = Math.max(
            1,
            Math.round((new Date(s.lastSellDate) - new Date(firstBuyDate)) / 86400000)
        );
        s.firstBuyDate = firstBuyDate;
        s.holdDays     = holdDays;
        s.speedScore   = s.pnlKrw / holdDays;   // 하루 평균 실현 수익(₩)
    });
 
    const symList = Object.values(symStats).map(s => ({
        ...s,
        roi: s.costKrw > 0 ? (s.pnlKrw / s.costKrw) * 100 : 0
    }));
 
    const rankByPnl   = [...symList].sort((a, b) => b.pnlKrw    - a.pnlKrw);
    const rankByRoi   = [...symList].sort((a, b) => b.roi        - a.roi);
    const rankBySpeed = [...symList].sort((a, b) => b.speedScore - a.speedScore);   // 단타왕
 
    const maxAbsPnl   = Math.max(...rankByPnl.map(s => Math.abs(s.pnlKrw)),      1);
    const maxAbsRoi   = Math.max(...rankByRoi.map(s => Math.abs(s.roi)),          1);
    const maxAbsSpeed = Math.max(...rankBySpeed.map(s => Math.abs(s.speedScore)), 1);
 
    // 오름차순이면 전체 뒤집기
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

    // 🌟 일평균 금액 포맷 (정확하게)
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
            // 기간 레이블 맵
            const periodLabel = { all: '전체', '1y': '1년', '6m': '6개월', '3m': '3개월', '1m': '1개월' };
            const periods = ['all', '1y', '6m', '3m', '1m'];

            // 현재 탭에 따라 표시할 랭킹 결정
            const isRoi   = realizedRankingTab === 'roi';
            const isSpeed = realizedRankingTab === 'speed';
            const activeRank   = isSpeed ? rankBySpeed : (isRoi ? rankByRoi : rankByPnl);
            const maxAbsActive = isSpeed ? maxAbsSpeed  : (isRoi ? maxAbsRoi : maxAbsPnl);

            const periodBtns = periods.map(p => {
                const isActive = p === realizedRankingPeriod;
                return `<button onclick="setRealizedRankingPeriod('${p}')"
                    style="padding:3px 9px; font-size:10px; font-weight:${isActive?'700':'400'}; border-radius:12px;
                           border:1px solid ${isActive?'var(--accent)':'var(--border)'}; 
                           background:${isActive?'var(--accent-bg)':'transparent'}; 
                           color:${isActive?'var(--accent)':'var(--text3)'}; cursor:pointer; 
                           font-family:var(--font-sans); transition:0.15s; white-space:nowrap;">
                    ${periodLabel[p]}
                </button>`;
            }).join('');

            const tabBtn = (tab, label) => {
                const isActive = realizedRankingTab === tab;
                return `<button onclick="setRealizedRankingTab('${tab}')"
                    style="flex:1; padding:9px 6px; font-size:11px; font-weight:700; border:none;
                           background:transparent; color:${isActive?'#00C578':'var(--text3)'};
                           cursor:pointer; border-bottom:2px solid ${isActive?'#00C578':'transparent'};
                           transition:0.2s; font-family:var(--font-sans);">
                    ${label}
                </button>`;
            };

            rankingPanelEl.innerHTML = `
            <div style="background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; display:flex; flex-direction:column; height:100%;">
              <!-- 기간 필터 -->
              <div style="display:flex; align-items:center; gap:5px; padding:10px 12px 8px; border-bottom:1px solid var(--border); flex-wrap:wrap; flex-shrink:0;">
                <span style="font-size:10px; color:var(--text3); flex-shrink:0; margin-right:2px;">기간</span>
                ${periodBtns}
              </div>
              <!-- 탭 + 정렬 방향 버튼 -->
              <div style="display:flex; border-bottom:1px solid var(--border); flex-shrink:0; align-items:stretch;">
                ${tabBtn('pnl', '💵 수익금')}
                ${tabBtn('roi', '📊 수익률')}
                ${tabBtn('speed', '⚡ 단타왕')}
                <div style="margin-left:auto; display:flex; align-items:center; padding:0 8px; gap:4px; border-left:1px solid var(--border);">
                  <button onclick="setRealizedRankingSortDir('desc')"
                    style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${realizedRankingSortDir==='desc'?'var(--accent)':'var(--border)'}; background:${realizedRankingSortDir==='desc'?'var(--accent-bg)':'transparent'}; color:${realizedRankingSortDir==='desc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; white-space:nowrap; line-height:1;">↓</button>
                  <button onclick="setRealizedRankingSortDir('asc')"
                    style="padding:4px 7px; font-size:11px; border-radius:4px; border:1px solid ${realizedRankingSortDir==='asc'?'var(--accent)':'var(--border)'}; background:${realizedRankingSortDir==='asc'?'var(--accent-bg)':'transparent'}; color:${realizedRankingSortDir==='asc'?'var(--accent)':'var(--text3)'}; cursor:pointer; font-family:var(--font-sans); transition:0.15s; white-space:nowrap; line-height:1;">↑</button>
                </div>
              </div>
              <!-- 랭킹 리스트 -->
              <div style="padding:6px 8px; display:flex; flex-direction:column; gap:2px; flex:1; overflow-y:auto;">
                ${rankingTxs.length === 0
                    ? `<div style="text-align:center; padding:20px; font-size:12px; color:var(--text3);">해당 기간 데이터 없음</div>`
                    : activeRank.map((s, i) => rankRowHtml(
                        s, i+1,
                        (() => {
                            if (isSpeed) {
                                // 일평균: 총 실현수익 ÷ 보유 일수 (정확한 값 표시)
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

    // 6. 거래 내역 표 렌더링
    const tbody = document.getElementById('realizedTableBody');
    if (realizedTxs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text3);">조건에 맞는 실현수익 내역이 없습니다.</td></tr>`;
        return;
    }

    realizedTxs.reverse(); // 최신 날짜가 위로 오게 뒤집기

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
            <td style="padding:12px 16px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${pnlColor};">${sign}${formatPrice(Math.abs(tx.pnl), tx.symbol)}</td>
            <td style="padding:12px 16px; text-align:right; font-weight:700; color:${pnlColor};">${sign}${tx.roi.toFixed(2)}%</td>
        </tr>
        `;
    }).join('');
}

// 🌟 실현수익 콤보 차트 (최종 수정본 - 에러 완벽 해결)
function renderRealizedChart(labels, lineData, barData) {
    const canvas = document.getElementById('realizedChartCanvas');
    if (!canvas) return;
    if (realizedChartInst) realizedChartInst.destroy();

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
                        label: function(ctx) {
                            if (ctx.dataset.label === '개별 매매 손익') {
                                const origVal = barData[ctx.dataIndex] || 0;
                                const sign = origVal >= 0 ? '+' : '-';
                                const val = Math.round(Math.abs(origVal)).toLocaleString();
                                return `${ctx.dataset.label}: ${sign}₩${val}`;
                            }
                            const val = Math.round(ctx.raw).toLocaleString();
                            return `${ctx.dataset.label}: ₩${val}`;
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
      <div class="settings-section-title">🎓 튜토리얼</div>
      <button class="btn-restart-tutorial" onclick="restartTutorial()">
        <span>🔁</span> 빠른 가이드 다시 보기
      </button>
    `;
    settingsModal.appendChild(sec);
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
          <tr>
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

document.addEventListener('DOMContentLoaded', async () => {
  // 🌟 기간 설정 UI를 최상단 글로벌 내비게이션 바 우측으로 이동
  const rangeGroup = document.querySelector('.range-group');
  const navRight = document.querySelector('.nav-right');
  if (rangeGroup && navRight) {
      navRight.insertBefore(rangeGroup, navRight.firstChild);
      rangeGroup.style.marginRight = '10px';
  }
});
