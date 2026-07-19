// ══════════════════════════════════════════════════════
// 🚀 탐사선(Probe) 기능 — Plus(프리미엄) 전용 스크립트
// - 관심종목에서 관심 있는 종목을 "가상 매수"해보고 가상 손익/그래프를 확인하는 기능입니다.
// ══════════════════════════════════════════════════════

// ── 🚀 탐사선 띄우기 기능 ──
function ensureProbeStateShape() { if (!state.probes) state.probes = []; }
ensureProbeStateShape();

let _probePickerItems = { kr: [], us: [] }; // 🌟 검색 필터링용 원본 목록 캐시

// 🚀 탐사선 발사일 이후 시세를 안전하게 구성 (당일 매수 시 데이터 공백 방지)
function buildProbeSeries(p, data) {
  const rawDates = data.rawDates || [];
  const dates = data.dates || [];
  const prices = data.prices || [];
  const startIdx = rawDates.findIndex(d => d >= p.buyDate);
  const currentPrice = data.last || prices[prices.length - 1] || p.buyPrice;

  let sinceDates, sincePrices;
  if (startIdx === -1) {
    // 매수일 이후 일봉 데이터가 아직 없음(당일 매수 등) → 매수가·현재가 2포인트로 구성
    sinceDates  = [p.buyDate, rawDates[rawDates.length - 1] || p.buyDate];
    sincePrices = [p.buyPrice, currentPrice];
  } else {
    sinceDates  = dates.slice(startIdx);
    sincePrices = prices.slice(startIdx);
    // 첫 데이터가 실제 매수가와 다르면 맨 앞에 매수 시점 포인트를 보정 삽입
    if (sincePrices.length === 0 || sincePrices[0] !== p.buyPrice) {
      sinceDates.unshift(p.buyDate);
      sincePrices.unshift(p.buyPrice);
    }
  }
  return { sinceDates, sincePrices };
}

function openProbePicker() {
  ensureProbeStateShape();
  const krItems = [], usItems = [];

  state.tickers.forEach(sym => {
    const data = cachedMarketData[sym];
    if (!data || data._failed) return;
    const last = data.last || (data.prices ? data.prices[data.prices.length - 1] : 0);
    (isKorean(sym) ? krItems : usItems).push({ symbol: sym, name: data.name || sym, last });
  });

  _probePickerItems = { kr: krItems, us: usItems };

  const searchInput = document.getElementById('probePickerSearch');
  if (searchInput) searchInput.value = '';
  renderProbePickerList(krItems, usItems);
  document.getElementById('probeOverlay').classList.add('open');
}

function renderProbePickerList(krItems, usItems) {
  const probedSymbols = new Set(state.probes.map(p => p.symbol));

  const renderGroup = (title, items) => {
    const rows = items.length > 0
      ? items.map(it => {
          const already = probedSymbols.has(it.symbol);
          return `
            <div class="probe-pick-item" style="${already ? 'opacity:0.45; cursor:not-allowed;' : ''}"
                 onclick="${already ? '' : `launchProbe('${it.symbol}')`}">
              <div>
                <div style="font-size:13px; font-weight:600;">${it.name}</div>
                <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono);">${it.symbol}</div>
              </div>
              <div style="font-family:var(--font-mono); font-size:12px; font-weight:700;">
                ${already ? '이미 띄움 ✅' : formatPrice(it.last, it.symbol)}
              </div>
            </div>`;
        }).join('')
      : `<div style="text-align:center; padding:20px; font-size:12px; color:var(--text3);">검색 결과가 없습니다</div>`;
    return `
      <div class="probe-pick-group">
        <div class="probe-pick-group-title">${title} (${items.length})</div>
        <div class="probe-pick-group-list">${rows}</div>
      </div>`;
  };

  const body = document.getElementById('probePickerBody');
  body.innerHTML = renderGroup('🇰🇷 국내', krItems) + renderGroup('🇺🇸 해외', usItems);
}

// 🚀 검색어로 종목 필터링
function filterProbePicker(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    renderProbePickerList(_probePickerItems.kr, _probePickerItems.us);
    return;
  }
  const match = it => it.name.toLowerCase().includes(q) || it.symbol.toLowerCase().includes(q);
  renderProbePickerList(
    _probePickerItems.kr.filter(match),
    _probePickerItems.us.filter(match)
  );
}

function launchProbe(symbol) {
  ensureProbeStateShape();
  if (state.probes.some(p => p.symbol === symbol)) { alert('이미 탐사선을 띄운 종목입니다.'); return; }
  const data = cachedMarketData[symbol];
  if (!data || data._failed) { alert('시세 정보를 불러올 수 없습니다.'); return; }
  const price = data.last || data.prices[data.prices.length - 1];

  const qtyInput = prompt(`${data.name} (${symbol})\n현재가 ${formatPrice(price, symbol)}\n\n몇 주를 가상으로 매수할까요? (1주 이상)`, '1');
  if (qtyInput === null) return;
  const qty = parseFloat(qtyInput);
  if (!qty || qty < 1) { alert('1주 이상 입력해주세요.'); return; }

  state.probes.push({
    id: 'probe_' + Date.now(),
    symbol, name: data.name || symbol,
    qty, buyPrice: price,
    buyDate: new Date().toISOString().split('T')[0],
    isKr: isKorean(symbol)
  });
  saveState();
  closeModal('probeOverlay');
  closeModal('chartOverlay');
  alert(`🚀 ${data.name} 탐사선을 띄웠습니다! (${qty}주 · ${formatPrice(price, symbol)})`);
  render();
}

// 카드 상세창(chartOverlay)에서 바로 띄우기
function launchProbeFromModal() {
  if (!currentModalTicker) return;
  launchProbe(currentModalTicker);
}

// 탐사선 카드 클릭 시 상세창 열기
function openProbeDetail(id) {
  const probe = state.probes.find(p => p.id === id);
  if (!probe) return;
  openChartModal(probe.symbol, probe.id);
}

function deleteProbe(id) {
  if (!confirm('이 탐사선을 회수하시겠습니까?')) return;
  state.probes = state.probes.filter(p => p.id !== id);
  saveState();
  render();
}

function renderProbeCollectionPanel() {
  ensureProbeStateShape();
  const panel = document.getElementById('probeCollectionPanel');
  if (!panel) return;
  if (state.probes.length === 0) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.style.display = 'block';

  // 🌟 전체 탐사선 합산용 (원화 환산) 총 가상 투자액 / 총 가상 평가액 계산
  let totalInvestedKrw = 0;
  let totalEvalKrw = 0;

  const cardsHtml = state.probes.map(p => {
    const data = cachedMarketData[p.symbol];
    const current = (data && !data._failed) ? (data.last || data.prices[data.prices.length - 1]) : p.buyPrice;
    const invested = p.qty * p.buyPrice;
    const evalValue = p.qty * current;
    const pnl = evalValue - invested;
    const roi = invested > 0 ? (pnl / invested) * 100 : 0;
    const color = pnl >= 0 ? '#00C578' : '#3A9AFF';

    const fx = isKorean(p.symbol) ? 1 : (currentUsdKrw || 1);
    totalInvestedKrw += invested * fx;
    totalEvalKrw += evalValue * fx;

    return `
      <div class="probe-orbit-card" onclick="openProbeDetail('${p.id}')">
        <div class="probe-orbit-body">
          <div style="display:flex; gap:8px;">
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                <div style="min-width:0;">
                  <div class="probe-name" style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🚀 ${p.name}</div>
                  <div class="probe-meta" style="font-size:9px; font-family:var(--font-mono);">${p.symbol} · ${p.qty}주</div>
                </div>
                <button class="btn-sm" style="height:20px; font-size:10px; padding:0 6px; flex-shrink:0;" onclick="event.stopPropagation(); deleteProbe('${p.id}')">✕</button>
              </div>
              <div class="probe-meta" style="font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:4px;">
                ${formatPrice(invested, p.symbol)} → ${formatPrice(evalValue, p.symbol)}
              </div>
              <div style="font-family:var(--font-mono); font-size:12px; font-weight:700; color:${color};">
                ${pnl >= 0 ? '+' : ''}${formatPrice(pnl, p.symbol)} (${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%)
              </div>
            </div>
            <div class="probe-spark-wrap">
              <canvas id="probeChart_${p.id}"></canvas>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  const totalPnlKrw = totalEvalKrw - totalInvestedKrw;
  const totalRoi = totalInvestedKrw > 0 ? (totalPnlKrw / totalInvestedKrw) * 100 : 0;
  const totalColor = totalPnlKrw >= 0 ? '#00C578' : '#3A9AFF';

  panel.innerHTML = `
    <div style="font-size:13px; font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
      🚀 띄운 탐사선 <span style="font-size:11px; color:var(--text3); font-weight:400;">(${state.probes.length}개)</span>
    </div>
    <div class="probe-summary-row">
      <div class="probe-summary-stats">
        <div class="probe-summary-stat-row">
          <div class="probe-summary-label">총 가상 투자액</div>
          <div class="probe-summary-value">₩${Math.round(totalInvestedKrw).toLocaleString()}</div>
        </div>
        <div class="probe-summary-stat-row">
          <div class="probe-summary-label">총 가상 평가액</div>
          <div class="probe-summary-value">₩${Math.round(totalEvalKrw).toLocaleString()}</div>
        </div>
        <div class="probe-summary-stat-row">
          <div class="probe-summary-label">평가 손익</div>
          <div class="probe-summary-value" style="color:${totalColor};">
            ${totalPnlKrw >= 0 ? '+' : ''}₩${Math.round(totalPnlKrw).toLocaleString()}
            <span style="font-size:11px; font-weight:600;">(${totalRoi >= 0 ? '+' : ''}${totalRoi.toFixed(2)}%)</span>
          </div>
        </div>
      </div>
      <div class="probe-summary-divider"></div>
      <div class="probe-summary-chart">
        <canvas id="probeTotalChart"></canvas>
      </div>
    </div>
    <div class="probe-cards-grid">${cardsHtml}</div>`;

  // 🚀 탐사선 발사일 이후 구간만 잘라서 카드 우측에 미니 스파크라인 렌더
  state.probes.forEach(p => {
    const data = cachedMarketData[p.symbol];
    if (!data || data._failed) return;
    const { sinceDates, sincePrices } = buildProbeSeries(p, data);
    if (sincePrices.length < 2) return;
    buildChart(`probeChart_${p.id}`, sincePrices, sinceDates, true, p.symbol, 'all', true);
  });

  // 🌟 전체 탐사선을 합산한 가상 포트폴리오 그래프 렌더 (투자금 vs 평가금 추이를 한 그래프에 함께 표시)
  const { dates: totalDates, investedValues, evalValues } = buildProbeTotalSeries();
  if (evalValues.length >= 2) {
    buildProbeTotalChart('probeTotalChart', totalDates, investedValues, evalValues);
  }
}

// 🌟 모든 탐사선(관심종목 가상 매수)을 합산한 총 투자금/총 평가금 추이 시계열 계산
// (총 가상 투자액/총 가상 평가액 요약 수치와 환율 기준을 맞추기 위해 항상 현재 환율(currentUsdKrw)로 환산합니다)
function buildProbeTotalSeries() {
  // 탐사선별로 발사일 이후 (날짜 → 가격) 맵 구성
  const perProbe = state.probes.map(p => {
    const data = cachedMarketData[p.symbol];
    const priceMap = {};
    if (data && !data._failed && data.rawDates && data.prices) {
      let startIdx = data.rawDates.findIndex(d => d >= p.buyDate);
      if (startIdx === -1) startIdx = data.rawDates.length - 1;
      for (let i = startIdx; i < data.rawDates.length; i++) {
        if (data.prices[i] !== null && data.prices[i] !== undefined) {
          priceMap[data.rawDates[i]] = data.prices[i];
        }
      }
    }
    const fx = isKorean(p.symbol) ? 1 : (currentUsdKrw || 1);
    return { probe: p, priceMap, fx };
  });

  // 모든 탐사선의 날짜를 합집합으로 모아 정렬
  const allDatesSet = new Set();
  perProbe.forEach(pp => Object.keys(pp.priceMap).forEach(d => allDatesSet.add(d)));
  state.probes.forEach(p => allDatesSet.add(p.buyDate));
  const allDates = Array.from(allDatesSet).sort();
  if (allDates.length === 0) return { dates: [], investedValues: [], evalValues: [] };

  // 날짜별로 (1) 그 시점까지 발사된 탐사선의 투자원금 합, (2) 최근 시세를 이월(forward-fill)한 평가금 합을 계산
  const lastKnown = {};
  const investedValues = [];
  const evalValues = [];
  allDates.forEach(dateStr => {
    let totalInvested = 0;
    let totalEval = 0;
    perProbe.forEach(pp => {
      const p = pp.probe;
      if (dateStr < p.buyDate) return; // 아직 발사 전
      totalInvested += p.qty * p.buyPrice * pp.fx;
      if (pp.priceMap[dateStr] !== undefined) lastKnown[p.id] = pp.priceMap[dateStr];
      const price = lastKnown[p.id] !== undefined ? lastKnown[p.id] : p.buyPrice;
      totalEval += p.qty * price * pp.fx;
    });
    investedValues.push(totalInvested);
    evalValues.push(totalEval);
  });

  return { dates: allDates, investedValues, evalValues };
}

// 🌟 투자금(점선) vs 평가금(채워진 실선) 두 라인을 한 그래프에 함께 그리는 전용 차트
let _probeTotalChartInstance = null;
function buildProbeTotalChart(canvasId, dates, investedValues, evalValues) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (_probeTotalChartInstance && typeof _probeTotalChartInstance.destroy === 'function') {
    _probeTotalChartInstance.destroy();
  }

  const displayDates = dates.map(d => (typeof d === 'string' && d.includes('-')) ? d.substring(2).replace(/-/g, '.') : d);
  const lastEval = evalValues[evalValues.length - 1] || 0;
  const lastInvested = investedValues[investedValues.length - 1] || 0;
  const evalColor = lastEval >= lastInvested ? '#00C578' : '#3A9AFF';
  const evalFill = lastEval >= lastInvested ? 'rgba(0,197,120,0.12)' : 'rgba(58,154,255,0.12)';
  const formatKrw = v => '₩' + Math.round(v).toLocaleString();

  _probeTotalChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: displayDates,
      datasets: [
        {
          label: '총 투자금',
          data: investedValues,
          borderColor: 'rgba(136,144,164,0.9)',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          order: 2
        },
        {
          label: '총 평가금',
          data: evalValues,
          borderColor: evalColor,
          backgroundColor: evalFill,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: true,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 2, font: { size: 10 }, color: '#8890a4', usePointStyle: false }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          displayColors: true,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatKrw(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 9 }, color: '#555e72', maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
        y: {
          ticks: {
            font: { size: 9 }, color: '#555e72',
            callback: v => v >= 1e8 ? (v / 1e8).toFixed(1) + '억' : v >= 1e4 ? (v / 1e4).toFixed(0) + '만' : v
          },
          grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false }
        }
      },
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 0 }
    }
  });

  return _probeTotalChartInstance;
}
