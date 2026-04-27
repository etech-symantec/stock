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
let currentDivFilter = 'all'; 
// 🌟 기본 정렬을 등락률로 변경하고, 리스트 스타일 관련 변수 및 함수 추가
let currentSortMode = 'changeDesc'; 
let sortDirection = -1; 
let activeAccountFilter = null; 
let currentListStyle = 'card';
let currentRegionLayout = 'vertical'; // 🌟 [추가] 기본 배치는 상하(vertical)로 설정

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
  if (last > first) return { line:'#00c87a', fill:'rgba(0,200,122,0.12)' };
  if (last < first) return { line:'#ff4d6a', fill:'rgba(255,77,106,0.12)' };
  return { line:'#8890a4', fill:'rgba(136,144,164,0.1)' };
}

function buildChart(canvasId, prices, dates, mini) {
  const {line, fill} = getColors(prices);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: 'line',
    data: { labels: dates, datasets: [{ data: prices, borderColor: line, backgroundColor: fill, borderWidth: mini ? 1.5 : 2, pointRadius: 0, tension: 0.1, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, displayColors: false } }, scales: { x: { display: !mini, ticks: { font:{size:10}, color:'#555e72' }, grid: { display: false }, border: { display: false } }, y: { display: !mini, ticks: { font:{size:10}, color:'#555e72' }, grid: { color:'rgba(255,255,255,0.04)' }, border: { display: false } } }, interaction: { mode: 'index', intersect: false }, animation: { duration: 0 } }
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
let historyFilters = { market: 'all', type: 'all', search: '' };
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
  
  if(type === 'dividend') {
    document.getElementById('txQtyWrap').style.display = 'none';
    document.getElementById('txPriceLabel').textContent = '총 배당금액';
    document.getElementById('txPrice').placeholder = '받은 배당금 총액';
    document.getElementById('txQty').value = 0; 
    document.getElementById('divTaxWrap').style.display = 'block';
    if(!isEditing) document.getElementById('applyDivTax').checked = true;
    else document.getElementById('applyDivTax').checked = false; 
  } else {
    document.getElementById('txQtyWrap').style.display = 'block';
    document.getElementById('txPriceLabel').textContent = '단가 (1주당 가격)';
    document.getElementById('txPrice').placeholder = '0';
    document.getElementById('divTaxWrap').style.display = 'none';
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

// 🌟 보유 주식 평단가 및 수량 계산 (계좌명에서 소유자 이름 제거)
function calculateHoldings(ownerFilter = 'all') {
  let holdings = {};
  const sortedTx = [...state.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
  
  sortedTx.forEach(tx => {
    if (tx.txType === 'dividend') return;
    if (ownerFilter !== 'all' && tx.owner !== ownerFilter) return;

    let broker = tx.broker ? tx.broker.trim() : '미지정';
    
    // 🌟 [핵심 변경] 전체보기 탭에서도 뒤에 '(소유자)'를 붙이지 않고 계좌명만 깔끔하게 사용합니다.
    let displayBroker = broker;
    
    let key = `${tx.symbol}::${displayBroker}`;

    if(!holdings[key]) holdings[key] = { qty: 0, avg: 0, broker: displayBroker, symbol: tx.symbol };
    let h = holdings[key];
    
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

  setSidebarView('ledger');
  const sb = document.getElementById('sidebar');
  if(sb.classList.contains('collapsed')) toggleSidebar();

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
  document.getElementById('txSymbol').value = '';
  document.getElementById('txQty').value = '';
  document.getElementById('txPrice').value = '';
  toggleTxType();
}

function addOrUpdateTransaction() {
  const editId = document.getElementById('editingTxId').value;
  const date = document.getElementById('txDate').value;
  const ownerKey = document.querySelector('input[name="txOwner"]:checked').value;
  const owner = state.owners[ownerKey].name;
  const typeVal = document.querySelector('input[name="txType"]:checked').value;
  const broker = document.getElementById('txBroker').value.trim();
  let symbol = document.getElementById('txSymbol').value.trim().toUpperCase();
  
  let qty = parseFloat(document.getElementById('txQty').value) || 0;
  let price = parseFloat(document.getElementById('txPrice').value);

  if(!date || !symbol || isNaN(price)) { alert("종목코드, 단가(배당금액)를 정확히 입력해주세요."); return; }
  if(typeVal !== 'dividend' && qty === 0) { alert("매매 내역은 수량을 0으로 입력할 수 없습니다."); return; }
  
  let rawSymbol = symbol;
  let cleanRaw = rawSymbol.replace(/\s+/g, '').toUpperCase();
  if (localStockDB && localStockDB.length > 0) {
      let matched = localStockDB.find(s => s.name.replace(/\s+/g,'').toUpperCase() === cleanRaw || s.symbol.toUpperCase() === rawSymbol);
      if(matched) symbol = matched.symbol;
      else if (/^\d{6}$/.test(symbol)) symbol += '.KS';
  } else {
      if (/^\d{6}$/.test(symbol)) symbol += '.KS';
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
  });
  
  listEl.innerHTML = reversed.map(tx => {
    const isBuy = tx.qty > 0;
    const isDiv = tx.txType === 'dividend';
    const dbMatch = localStockDB.find(s => s.symbol === tx.symbol);
    const cachedMatch = cachedMarketData[tx.symbol];
    const stockName = dbMatch ? dbMatch.name : (cachedMatch && !cachedMatch._failed && cachedMatch.name ? cachedMatch.name : tx.symbol);
    
    const totalAmt = isDiv ? tx.price : Math.abs(tx.qty) * tx.price;
    const typeLabel = isDiv ? '💰 배당금' : (isBuy ? '매수' : '매도') + ` ${Math.abs(tx.qty)}주`;
    const typeColor = isDiv ? 'var(--green)' : (isBuy ? 'var(--red)' : 'var(--blue)');
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
            <span class="tx-sym" title="${stockName}">${stockName}</span>
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
  if (!filterBar) {
      filterBar = document.createElement('div');
      filterBar.id = 'historyFilterBar';
      filterBar.style.cssText = "display:flex; gap:10px; margin-bottom:15px; padding:15px; background:var(--bg3); border-radius:8px; border:1px solid var(--border); flex-wrap:wrap;";
      filterBar.innerHTML = `
          <select class="form-input" style="width:auto; min-width:120px; padding:8px 12px; margin:0; cursor:pointer;" onchange="updateHistoryFilter('market', this.value)">
              <option value="all">🌐 전체 국가</option>
              <option value="kr">🇰🇷 한국 종목</option>
              <option value="us">🇺🇸 미국 종목</option>
          </select>
          <select class="form-input" style="width:auto; min-width:120px; padding:8px 12px; margin:0; cursor:pointer;" onchange="updateHistoryFilter('type', this.value)">
              <option value="all">모든 거래</option>
              <option value="buy">🔴 매수 내역</option>
              <option value="sell">🔵 매도 내역</option>
              <option value="dividend">🟢 배당 내역</option>
          </select>
          <input type="text" class="form-input" placeholder="종목명 또는 티커 검색..." style="flex:1; min-width:200px; padding:8px 12px; margin:0;" oninput="updateHistoryFilter('search', this.value)">
      `;
      const tableWrap = tbody.closest('div');
      dash.insertBefore(filterBar, tableWrap);
  }
  
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
  
  if(sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text3);">조건에 맞는 거래 내역이 없습니다.</td></tr>`;
      return;
  }
  
  tbody.innerHTML = sorted.map(tx => {
      const isBuy = tx.qty > 0;
      const isDiv = tx.txType === 'dividend';
      const totalAmt = isDiv ? tx.price : Math.abs(tx.qty) * tx.price;
      const typeLabel = isDiv ? '배당' : (isBuy ? '매수' : '매도');
      const typeColor = isDiv ? 'var(--green)' : (isBuy ? 'var(--red)' : 'var(--blue)');
      
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
      <li class="search-item" onclick="${onSelect}('${q.symbol}')">
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

function selectSidebarSearchResult(symbol) {
  document.getElementById('txSymbol').value = symbol;
  document.getElementById('txDropdown').style.display = 'none';
  if(document.querySelector('input[name="txType"]:checked').value !== 'dividend') {
    document.getElementById('txQty').focus();
  } else {
    document.getElementById('txPrice').focus();
  }
}

async function fetchWithProxy(targetUrl, useCache = true) {
  const finalUrl = useCache ? targetUrl : `${targetUrl}&_t=${Date.now()}`;
  const proxy = `https://corsproxy.io/?${encodeURIComponent(finalUrl)}`;
  try {
    const res = await fetch(proxy);
    if(res.ok) return await res.json();
  } catch(e) {}
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
  
  if (API_KEY === 'd9f831a4f894f1149672e45b4b910dab8f9c2438061c5201f207c20f0d761e55' || !API_KEY) {
      console.warn("공공데이터포털 API 키가 설정되지 않았습니다.");
      return { _failed: true };
  }

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
  const targetUrl = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${API_KEY}&numOfRows=252&pageNo=1&resultType=json&beginBasDt=${beginDate}&srtnCd=${isinCode}`;
  
  // 브라우저 CORS 에러 우회를 위해 프록시 사용
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

  try {
    const res = await fetch(proxyUrl);
    const data = await res.json();

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
  el.classList.add('active'); 
  render();
}

function setSortMode(mode) { currentSortMode = mode; render(); }

function toggleSortDirection() {
  sortDirection = sortDirection === -1 ? 1 : -1;
  document.getElementById('btnSortDir').textContent = sortDirection === -1 ? '⬇️' : '⬆️';
  render();
}

function setView(view, el) {
  currentView = view;
  activeAccountFilter = null; 
  document.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active'); 
  if(view === 'history') renderHistoryDashboard();
  if(view === 'realized') renderRealizedDashboard();
  
  const pChartWrap = document.getElementById('portfolioChartWrapper');
  if (view === 'dividend' || view === 'history') pChartWrap.style.display = 'none';
  else pChartWrap.style.display = 'flex';
  
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
      let sign = item.roi > 0 ? '+' : ''; let color = item.roi > 0 ? 'var(--green)' : (item.roi < 0 ? 'var(--red)' : 'var(--text)');
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
          <span class="holding-val" style="color:var(--${pnl>=0?'green':'red'})">
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
         <div style="font-size:12px; font-weight:700; color:var(--${cls==='up'?'green':(cls==='down'?'red':'text3')});">${sign}${chgPct}%</div>
      </div>
      
      ${isHeld ? `
      <div class="list-item-extra">
         <div style="font-size:11px; color:var(--text2); margin-bottom:2px;">${item.qty}주</div>
         <div style="font-size:12px; font-weight:700; color:var(--${pnl>=0?'green':'red'})">${pnl>=0?'+':''}${formatPrice(Math.abs(pnl), item.symbol)}</div>
      </div>` : `
      <div class="list-item-extra" style="display:flex; align-items:center; justify-content:flex-end;">
         <button class="btn-sm" style="background:var(--bg); border-color:var(--border2); padding:4px 8px;" onclick="event.stopPropagation(); removeTickerConfirm('${item.symbol}', '${displayName.replace(/'/g, "\\'")}')">삭제</button>
      </div>`}
    </div>
  `;
}

// 🌟 자산 성장 추이 그래프 렌더링 (평가액, 투자 원금, 실현 수익 표시)
function renderPortfolioChart(ownerFilter, sliceLen) {
    const chartWrap = document.getElementById('portfolioChartWrapper');
    if (currentView === 'dividend' || currentView === 'history' || currentView === 'realized' || state.transactions.length === 0) {
        chartWrap.style.display = 'none';
        return;
    }
    
    let masterData = cachedMarketData['KRW=X'];
    if (!masterData || masterData._failed) {
        const keys = Object.keys(cachedMarketData);
        if(keys.length > 0) masterData = cachedMarketData[keys[0]];
    }
    if (!masterData || masterData._failed || !masterData.rawDates) {
        chartWrap.style.display = 'none';
        return;
    }

    chartWrap.style.display = 'flex';
    
    const rawDates = masterData.rawDates;
    const displayDates = masterData.dates;
    
    const startIndex = Math.max(0, rawDates.length - sliceLen);
    const slicedRawDates = rawDates.slice(startIndex);
    const slicedDisplayDates = displayDates.slice(startIndex);
    
    const evalData = [];
    const costData = [];
    const realizedData = []; // 🌟 실현수익 데이터를 담을 배열 추가
    
    slicedRawDates.forEach((dateStr) => {
        let dailyCost = 0;
        let dailyEval = 0;
        let dailyRealized = 0; // 🌟 당일 누적 실현수익
        
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
        
        // 시간순 정렬 (정확한 평단가 계산을 위함)
        let sortedTxs = [...filteredTxs].sort((a,b) => new Date(a.date) - new Date(b.date));
        
        let holdings = {};
        sortedTxs.forEach(tx => {
            if (tx.txType === 'dividend') return;
            if (!holdings[tx.symbol]) holdings[tx.symbol] = { qty: 0, avg: 0 };
            let h = holdings[tx.symbol];
            
            if (tx.qty > 0) {
                let totalVal = (h.qty * h.avg) + (tx.qty * tx.price);
                h.qty += tx.qty;
                h.avg = totalVal / h.qty;
            } else {
                let sellQty = Math.abs(tx.qty);
                let pnl = (tx.price - h.avg) * sellQty;
                
                // 🌟 매도 시 당일 환율을 적용하여 누적 실현수익금 더하기
                dailyRealized += pnl * (isKorean(tx.symbol) ? 1 : fxRate);
                
                h.qty -= sellQty;
                if (h.qty <= 0) { h.qty = 0; h.avg = 0; }
            }
        });

        for (let sym in holdings) {
            if (holdings[sym].qty > 0) {
                let h = holdings[sym];
                dailyCost += (h.qty * h.avg) * (isKorean(sym) ? 1 : fxRate);
                
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
                dailyEval += (h.qty * priceOnDate) * (isKorean(sym) ? 1 : fxRate);
            }
        }
        
        costData.push(dailyCost);
        evalData.push(dailyEval);
        realizedData.push(dailyRealized); // 🌟 실현수익 기록
    });

    let firstNonZeroIdx = evalData.findIndex(v => v > 0);
    let finalDisplayDates = slicedDisplayDates;
    let finalEvalData = evalData;
    let finalCostData = costData;
    let finalRealizedData = realizedData; // 🌟

    if (firstNonZeroIdx > 0 && sliceLen >= 756) { 
        finalDisplayDates = slicedDisplayDates.slice(firstNonZeroIdx);
        finalEvalData = evalData.slice(firstNonZeroIdx);
        finalCostData = costData.slice(firstNonZeroIdx);
        finalRealizedData = realizedData.slice(firstNonZeroIdx); // 🌟
    }

    const canvas = document.getElementById('portfolioChartCanvas');
    if (!canvas) return; 
    if (portfolioChartInst) portfolioChartInst.destroy();

    let endEval = finalEvalData[finalEvalData.length-1] || 0;
    let endCost = finalCostData[finalCostData.length-1] || 0;
    let pnl = endEval - endCost;
    
    let evalColor = pnl >= 0 ? '#00c87a' : '#ff4d6a';
    let evalBg = pnl >= 0 ? 'rgba(0, 200, 122, 0.15)' : 'rgba(255, 77, 106, 0.15)';

    portfolioChartInst = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: finalDisplayDates,
            datasets: [
                {
                    label: '평가액',
                    data: finalEvalData,
                    borderColor: evalColor,
                    backgroundColor: evalBg,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.1,
                    order: 1
                },
                {
                    label: '투자 원금',
                    data: finalCostData,
                    borderColor: '#8890a4',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1,
                    order: 2
                },
                // 🌟 실현 수익 그래프 라인 추가 
                {
                    label: '실현 수익',
                    data: finalRealizedData,
                    borderColor: '#4d9fff', // 구분을 위한 맑은 파란색
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1,
                    order: 3
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#8890a4', font: {size: 11}, usePointStyle: true, boxWidth:8 } },
                tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ₩' + Math.round(context.raw).toLocaleString(); } } }
            },
            scales: {
                x: { ticks: { color: '#555e72', maxTicksLimit: 10 }, grid: { display: false } },
                y: { ticks: { color: '#555e72', callback: function(val) { return '₩' + (val/10000).toLocaleString() + '만'; } }, grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } }
            }
        }
    });
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

    state.transactions.forEach(tx => {
      if (tx.txType === 'dividend') {
         if (filterName === 'all' || tx.owner === filterName) {
           if (isKorean(tx.symbol)) krwDiv += tx.price; else usdDiv += tx.price;
         }
      }
    });
    
    const globalDiv = krwDiv + (usdDiv * currentUsdKrw);
    const globalCost = krwSummary.totalCost + (usdSummary.totalCost * currentUsdKrw);
    const globalEval = krwSummary.totalEval + (usdSummary.totalEval * currentUsdKrw);
    const globalRoi = globalCost > 0 ? ((globalEval - globalCost) / globalCost * 100) : 0;
    const globalPnl = globalEval - globalCost;

    document.getElementById('globalTotalCost').textContent = `₩ ${Math.round(globalCost).toLocaleString()}`;
    document.getElementById('globalTotalVal').textContent = `₩ ${Math.round(globalEval).toLocaleString()}`;
    document.getElementById('globalTotalDiv').textContent = `₩ ${Math.round(globalDiv).toLocaleString()}`;
    const gRoiEl = document.getElementById('globalTotalRoi');
    const signG = globalPnl >= 0 ? '+' : '';
    gRoiEl.innerHTML = `${signG}₩${Math.round(Math.abs(globalPnl)).toLocaleString()}<br><span style="font-size:12px; font-weight:500">(${signG}${globalRoi.toFixed(2)}%)</span>`;
    gRoiEl.style.color = globalPnl >= 0 ? 'var(--green)' : (globalCost > 0 ? 'var(--red)' : 'var(--text)');
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
      let evalColor = pnl >= 0 ? 'var(--green)' : 'var(--red)';
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
      let evalColor = pnl >= 0 ? 'rgba(0,200,122,0.8)' : 'rgba(255,77,106,0.8)';
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

  const divTxs = state.transactions.filter(t => {
    if(t.txType !== 'dividend') return false;
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

  let symArr = Object.keys(symTotals).map(sym => {
    return { symbol: sym, total: symTotals[sym].krw + (symTotals[sym].usd * currentUsdKrw) };
  });
  symArr.sort((a,b) => b.total - a.total); 

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
}

function openChartModal(ticker) {
  const data = cachedMarketData[ticker]; if(!data || data._failed) return;
  const getSliceLen = (range) => {
    if (range === '1d') return 2; if (range === '1w') return 6; if (range === '1m') return 22;
    if (range === '3m') return 63; if (range === '6m') return 126; if (range === '1y') return 252;
    if (range === '3y') return 756; if (range === '5y') return 1260; if (range === '10y') return 2520; return 252;
  };
  let sliceLen = getSliceLen(state.range);
  const displayPrices = data.prices.slice(-sliceLen);
  const displayDates = data.dates.slice(-sliceLen);
  if(displayPrices.length === 0) return;
  
  const hi = Math.max(...displayPrices), lo = Math.min(...displayPrices);
  const last = displayPrices[displayPrices.length-1];
  const prev = displayPrices[0]; 
  const chgPct = ((last-prev)/prev*100).toFixed(2);
  
  document.getElementById('mTicker').textContent = data.name;
  document.getElementById('mBroker').textContent = data.symbol;
  document.getElementById('mPrice').textContent = formatPrice(last, ticker);
  
  const chgEl = document.getElementById('mChange');
  chgEl.textContent = `${chgPct > 0 ? '+':''}${formatPrice(last-prev, ticker)} (${chgPct > 0 ? '+':''}${chgPct}%)`;
  chgEl.style.backgroundColor = chgPct > 0 ? 'var(--green-bg)' : 'var(--red-bg)';
  chgEl.style.color = chgPct > 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('mMeta').textContent = `해당 기간 내 최고 ${formatPrice(hi, ticker)} · 최저 ${formatPrice(lo, ticker)}`;
  
  document.getElementById('chartOverlay').classList.add('open');
  if (modalChartInst) modalChartInst.destroy();
  setTimeout(() => { modalChartInst = buildChart('modalCanvas', displayPrices, displayDates, false); }, 50);
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
  const pChartWrap = document.getElementById('portfolioChartWrapper'); 
  const divDash = document.getElementById('dividendDashboard');
  const listOptions = document.getElementById('listOptionsBar');
  const histDash = document.getElementById('historyDashboard');
  const realDash = document.getElementById('realizedDashboard');

  if (currentView === 'dividend') {
    dash.style.display = 'none'; pChartWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; histDash.style.display = 'none'; divDash.style.display = 'flex';
    renderDividendDashboard();
    return;
  } else if (currentView === 'history') {
    dash.style.display = 'none'; pChartWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; divDash.style.display = 'none'; histDash.style.display = 'flex';
    renderHistoryDashboard();
    return;
  } else if (currentView === 'realized') { // 🌟 실현수익 탭 일 때의 동작 추가
    dash.style.display = 'none'; pChartWrap.style.display = 'none'; container.style.display = 'none'; listOptions.style.display = 'none'; divDash.style.display = 'none'; histDash.style.display = 'none'; if(realDash) realDash.style.display = 'flex';
    renderRealizedDashboard();
    return;
  } else {
    dash.style.display = 'flex'; pChartWrap.style.display = 'flex'; container.style.display = 'block'; listOptions.style.display = 'flex'; divDash.style.display = 'none'; histDash.style.display = 'none';
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
    if (range === '3y') return 756; if (range === '5y') return 1260; if (range === '10y') return 2520; return 252;
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
  
  for(let sym in symbolHoldings) {
    if(symbolHoldings[sym].qty > 0) {
      allSymbols.add(sym);
    }
  }
  
  state.tickers.forEach(sym => {
    let hasTransaction = state.transactions.some(t => t.symbol === sym);
    if (!hasTransaction) {
      allSymbols.add(sym);
    }
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
    
    if (cachedMarketData[sym] && !cachedMarketData[sym]._failed) {
      displayItems.push({ type: 'held', symbol: sym, broker: brokerStr, qty: sh.qty, avg: avg, data: cachedMarketData[sym] });
    } else {
      let fallbackName = sym;
      if (localStockDB && localStockDB.length > 0) {
          let match = localStockDB.find(s => s.symbol === sym);
          if (match) fallbackName = match.name;
      }
      displayItems.push({ 
        type: 'held', symbol: sym, broker: brokerStr, qty: sh.qty, avg: avg, 
        data: { name: fallbackName, last: avg, prices: [avg, avg], dates: ['-','-'] }, 
        _isFallback: true 
      });
    }
  }

  let heldSymbols = new Set(displayItems.map(item => item.symbol));
  state.tickers.forEach(sym => {
    if(!heldSymbols.has(sym) && cachedMarketData[sym] && !cachedMarketData[sym]._failed) {
      displayItems.push({ type: 'watch', symbol: sym, broker: '', qty: 0, avg: 0, data: cachedMarketData[sym] });
    }
  });

  displayItems = displayItems.filter(item => {
    if(currentView === 'all') return true;
    if(currentView === 'user1' || currentView === 'user2') return item.type === 'held';
    if(currentView === 'watch') return item.type === 'watch';
    return true; 
  });

  displayItems.forEach(item => {
    item.uniqueId = 'chart_' + Math.random().toString(36).substring(2, 10);
    if(item.data && item.data.prices && item.data.prices.length > 0) {
      const prices = item.data.prices;
      const last = item.data.last;
      item.sliceLen = currentSliceLen; 
      const pStart = prices[Math.max(0, prices.length - currentSliceLen)] || item.data.prev || last;
      item.activeChange = pStart > 0 ? ((last - pStart) / pStart) * 100 : 0;
      if(isNaN(item.activeChange)) item.activeChange = 0;
      
      item.evalAmt = item.qty * last;
      item.costAmt = item.qty * item.avg;
      item.roi = item.costAmt > 0 ? ((item.evalAmt - item.costAmt)/item.costAmt*100) : -9999;
    } else {
      item.activeChange = 0; item.evalAmt = 0; item.costAmt = 0; item.roi = -9999; item.sliceLen = 0;
    }
  });

  updateSummaryAndAllocation(currentHoldings, displayItems);
  renderPortfolioChart(ownerFilter, currentSliceLen);
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
      chartInstances[item.uniqueId] = buildChart(item.uniqueId, displayPrices, displayDates, true);
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

function renderRealizedDashboard() {
    const realDash = document.getElementById('realizedDashboard');
    if(!realDash) return;

    let ownerName = 'all';
    if (currentRealizedOwnerFilter === 'user1') ownerName = state.owners.user1.name;
    if (currentRealizedOwnerFilter === 'user2') ownerName = state.owners.user2.name;

    const yearSelect = document.getElementById('realizedYearFilter');
    let selectedYear = yearSelect ? yearSelect.value : 'all';

    // 🌟 연도 목록(dropdown) 동적 생성 (매도 기록이 있는 연도만)
    let years = new Set();
    state.transactions.forEach(t => {
        if (t.txType === 'sell' || t.qty < 0) years.add(t.date.substring(0, 4));
    });
    let yearArr = Array.from(years).sort().reverse();

    if (yearSelect && yearSelect.options.length <= 1 && yearArr.length > 0) {
        let html = `<option value="all">전체 연도</option>`;
        yearArr.forEach(y => html += `<option value="${y}">${y}년</option>`);
        yearSelect.innerHTML = html;
        yearSelect.value = selectedYear; // 선택 유지
    }

    let holdings = {};
    let realizedTxs = [];
    let krwTotal = 0;
    let usdTotal = 0;

    // 과거부터 순차적으로 매수/매도를 시뮬레이션하여 정확한 평단가 파악
    const sortedTx = [...state.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));

    sortedTx.forEach(tx => {
        if (tx.txType === 'dividend') return;
        let broker = tx.broker ? tx.broker.trim() : '미지정';
        let key = `${tx.symbol}::${broker}`;

        if(!holdings[key]) holdings[key] = { qty: 0, avg: 0 };
        let h = holdings[key];

        if (tx.qty > 0) { // 매수 시 평단가 재계산
            let totalValue = (h.qty * h.avg) + (tx.qty * tx.price);
            h.qty += tx.qty;
            h.avg = totalValue / h.qty;
        } else if (tx.qty < 0) { // 매도 시 수익 계산
            let sellQty = Math.abs(tx.qty);
            let pnl = (tx.price - h.avg) * sellQty;
            let currentAvg = h.avg;

            h.qty -= sellQty;
            if (h.qty <= 0) { h.qty = 0; h.avg = 0; }

            let txYear = tx.date.substring(0, 4);

            // 필터에 맞는 경우만 표와 합산에 추가
            if ((ownerName === 'all' || tx.owner === ownerName) &&
                (selectedYear === 'all' || txYear === selectedYear)) {

                let isKr = isKorean(tx.symbol);
                if (isKr) krwTotal += pnl;
                else usdTotal += pnl;

                realizedTxs.push({
                    date: tx.date,
                    symbol: tx.symbol,
                    owner: tx.owner,
                    broker: broker,
                    sellQty: sellQty,
                    sellPrice: tx.price,
                    avgCost: currentAvg,
                    pnl: pnl,
                    roi: currentAvg > 0 ? (pnl / (currentAvg * sellQty)) * 100 : 0
                });
            }
        }
    });

    // 화면 요약창 업데이트
    document.getElementById('realTotalKrw').textContent = `₩ ${Math.round(krwTotal).toLocaleString()}`;
    document.getElementById('realTotalUsd').textContent = `$ ${usdTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    const grandTotal = krwTotal + (usdTotal * currentUsdKrw);
    const signG = grandTotal >= 0 ? '+' : '';
    const totalEl = document.getElementById('realTotalConverted');
    totalEl.textContent = `${signG}₩ ${Math.round(Math.abs(grandTotal)).toLocaleString()}`;
    totalEl.style.color = grandTotal >= 0 ? 'var(--blue)' : 'var(--red)';

    // 표 렌더링
    const tbody = document.getElementById('realizedTableBody');
    if (realizedTxs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text3);">조건에 맞는 실현수익 내역이 없습니다.</td></tr>`;
        return;
    }

    realizedTxs.reverse(); // 최신 매도일이 맨 위로 오게 뒤집기

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
        let pnlColor = tx.pnl >= 0 ? 'var(--blue)' : 'var(--red)';
        let oInfo = getOwnerInfo(tx.owner);

        return `
        <tr style="border-bottom: 1px solid var(--border); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding:12px 16px; color:var(--text2);">${tx.date}</td>
            <td style="padding:12px 16px;"><div style="font-weight:700; color:var(--text);">${stockName}</div><div style="font-size:10px; font-family:var(--font-mono); color:var(--text3);">${tx.symbol.replace('.KS.DLST','').replace('.DLST','')}</div></td>
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
