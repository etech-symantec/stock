// ==========================================
// 🚀 비행 계획 (Flight Plan) — Plus 프리미엄 전용 기능
// ------------------------------------------
// 예전 이름: 목표가 · 손절가 · 물타기(추가매수) 알림 기능
// 새 이름 매핑:
//   🌕 도킹 지점   (구 목표가)   — 도달하고 싶은 목적지 가격
//   🛸 비상 탈출   (구 손절가)   — 위험 신호가 오면 즉시 이탈할 가격
//   ⛽ 연료 보급   (구 물타기)   — 하락 시 연료(자금)를 더 태워 평균단가를 낮추는 지점
//
// app.js 이후, 이 파일이 로드되면서 아래 전역 함수/상태를 제공합니다:
//   getFlightPlanSettings, buildFlightPlanChartLines,
//   window.saveFlightPlanDocking, window.saveFlightPlanEscape,
//   window.addFlightPlanFuel, window.removeFlightPlanFuel,
//   renderFlightPlanPanel, computeActiveFlightPlanAlerts, updateFlightPlanBanner
//
// 🌟 "매수가 대비 %" 지점 설정 기능:
//   getFlightPlanAvgBuyPrice, window.adjustFlightPlanPct, window.applyFlightPlanPct
//   각 필드(도킹/비상탈출/연료 보급)마다 매수 평단가 대비 %를 기본 5%로 시작해
//   5%씩 올리거나 내릴 수 있고, "적용"(연료는 "지점 추가") 버튼으로 계산된 가격을 반영합니다.
// ==========================================

const FLIGHT_PLAN_PROXIMITY_PCT = 3; // 도킹/탈출/연료 지점과의 거리(%)가 이 값 이내면 "근접"으로 알림 표시
const FLIGHT_PLAN_PCT_STEP = 5;   // 매수가 대비 % 스텝(한 번에 조절되는 %)
const FLIGHT_PLAN_PCT_MIN = 5;    // 매수가 대비 % 최솟값
const FLIGHT_PLAN_PCT_MAX = 95;   // 매수가 대비 % 최댓값

function _escFlightPlanText(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 🌟 도킹/비상탈출/연료 보급 입력칸의 "매수가 대비 %" 설정값을 심볼별로 기억합니다. (세션 내 UI 상태, 저장 X)
const _fpPercentState = {};
function getFlightPlanPct(symbol, type) {
  if (!_fpPercentState[symbol]) _fpPercentState[symbol] = { docking: FLIGHT_PLAN_PCT_STEP, escape: FLIGHT_PLAN_PCT_STEP, fuel: FLIGHT_PLAN_PCT_STEP };
  return _fpPercentState[symbol][type] || FLIGHT_PLAN_PCT_STEP;
}

// 종목의 평균 매수가(모든 소유자·계좌 합산 가중평균)를 계산합니다. 보유 중이 아니면 0을 반환합니다.
function getFlightPlanAvgBuyPrice(symbol) {
  if (typeof calculateHoldings !== 'function') return 0;
  const holdings = calculateHoldings('all');
  let totalQty = 0, totalValue = 0;
  Object.keys(holdings).forEach(key => {
    const h = holdings[key];
    if (h && h.symbol === symbol && h.qty > 0) {
      totalQty += h.qty;
      totalValue += h.qty * h.avg;
    }
  });
  return totalQty > 0 ? totalValue / totalQty : 0;
}

// 통화 단위에 맞춰 계산된 가격을 적절히 반올림합니다. (원화: 정수, 그 외: 소수 2자리)
function _fpRoundPrice(value, symbol) {
  if (typeof isKorean === 'function' && isKorean(symbol)) return Math.round(value);
  return Math.round(value * 100) / 100;
}

// 도킹/비상탈출/연료 보급 각각의 "매수가 대비 %" 조절 행 HTML을 만듭니다.
function _fpPctRowHtml(symbol, type, avgPrice) {
  const pct = getFlightPlanPct(symbol, type);
  const sign = type === 'docking' ? 1 : -1;
  const signLabel = sign > 0 ? '+' : '−';
  const hasAvg = avgPrice > 0;
  const preview = hasAvg
    ? formatPrice(_fpRoundPrice(avgPrice * (1 + sign * pct / 100), symbol), symbol)
    : '보유 내역 없음';
  const disabledAttr = hasAvg ? '' : 'disabled';
  const applyLabel = type === 'fuel' ? '지점 추가' : '적용';
  return `
    <div class="fp-pct-row">
      <div class="fp-pct-top">
        <span class="fp-pct-label">평균 매수가 대비 ${signLabel}${pct}%</span>
        <span class="fp-pct-preview">${preview}</span>
      </div>
      <div class="fp-pct-controls">
        <button type="button" class="fp-pct-btn" ${disabledAttr} onclick="adjustFlightPlanPct('${symbol}','${type}',-${FLIGHT_PLAN_PCT_STEP})">−</button>
        <span class="fp-pct-value">${pct}%</span>
        <button type="button" class="fp-pct-btn" ${disabledAttr} onclick="adjustFlightPlanPct('${symbol}','${type}',${FLIGHT_PLAN_PCT_STEP})">+</button>
        <button type="button" class="fp-pct-apply" ${disabledAttr} onclick="applyFlightPlanPct('${symbol}','${type}')">${applyLabel}</button>
      </div>
    </div>`;
}

// 매수가 대비 % 값을 5%씩 올리거나 내립니다. (최소 5%, 최대 95%)
window.adjustFlightPlanPct = function (symbol, type, delta) {
  if (!_fpPercentState[symbol]) _fpPercentState[symbol] = { docking: FLIGHT_PLAN_PCT_STEP, escape: FLIGHT_PLAN_PCT_STEP, fuel: FLIGHT_PLAN_PCT_STEP };
  let next = (_fpPercentState[symbol][type] || FLIGHT_PLAN_PCT_STEP) + delta;
  next = Math.max(FLIGHT_PLAN_PCT_MIN, Math.min(FLIGHT_PLAN_PCT_MAX, next));
  _fpPercentState[symbol][type] = next;
  renderFlightPlanPanel(symbol);
};

// 현재 설정된 %를 실제 도킹/비상탈출 가격에 반영하거나, 연료 보급 지점으로 추가합니다.
window.applyFlightPlanPct = function (symbol, type) {
  const avgPrice = getFlightPlanAvgBuyPrice(symbol);
  if (!avgPrice || avgPrice <= 0) return;
  const pct = getFlightPlanPct(symbol, type);
  const sign = type === 'docking' ? 1 : -1;
  const price = _fpRoundPrice(avgPrice * (1 + sign * pct / 100), symbol);

  if (type === 'fuel') {
    const s = getFlightPlanSettings(symbol);
    s.fuel.push(price);
    s.fuel.sort((a, b) => b - a);
    saveState();
    updateFlightPlanBanner();
    renderModalChart();
    renderFlightPlanPanel(symbol);
    return;
  }

  if (type === 'docking') window.saveFlightPlanDocking(symbol, String(price));
  if (type === 'escape') window.saveFlightPlanEscape(symbol, String(price));
  renderFlightPlanPanel(symbol);
};

// 🌟 예전 이름(priceAlerts)으로 저장돼 있던 데이터를 새 이름(flightPlans)으로 1회 변환합니다.
//    target → docking, stopLoss → escape, dca → fuel
(function migrateLegacyPriceAlerts() {
  if (typeof state === 'undefined') return;
  if (!state.flightPlans) state.flightPlans = {};
  if (!state.priceAlerts) return;

  Object.keys(state.priceAlerts).forEach(symbol => {
    if (state.flightPlans[symbol]) return; // 이미 새 데이터가 있으면 건드리지 않음
    const old = state.priceAlerts[symbol];
    if (!old) return;
    state.flightPlans[symbol] = {
      docking: old.target != null ? old.target : null,
      escape: old.stopLoss != null ? old.stopLoss : null,
      fuel: Array.isArray(old.dca) ? old.dca.slice() : []
    };
  });

  delete state.priceAlerts;
  if (typeof saveState === 'function') saveState();
})();

// 종목별 비행 계획 설정을 가져오고, 없으면 기본값으로 초기화합니다.
function getFlightPlanSettings(symbol) {
  if (!state.flightPlans) state.flightPlans = {};
  if (!state.flightPlans[symbol]) state.flightPlans[symbol] = { docking: null, escape: null, fuel: [] };
  const s = state.flightPlans[symbol];
  if (!Array.isArray(s.fuel)) s.fuel = [];
  return s;
}

// 도킹 지점/비상 탈출/연료 보급 지점을 차트에 가로선으로 표시하기 위한 annotation 배열을 만듭니다.
function buildFlightPlanChartLines(symbol) {
  if (!symbol || !state.flightPlans || !state.flightPlans[symbol]) return [];
  const s = state.flightPlans[symbol];
  const lines = [];
  if (s.docking) lines.push({ value: s.docking, color: '#00C578', label: `🌕 ${formatPrice(s.docking, symbol)}` });
  if (s.escape) lines.push({ value: s.escape, color: '#ff4d6a', label: `🛸 ${formatPrice(s.escape, symbol)}` });
  (s.fuel || []).forEach(p => lines.push({ value: p, color: '#3A9AFF', label: `⛽ ${formatPrice(p, symbol)}` }));
  return lines;
}

window.saveFlightPlanDocking = function (symbol, value) {
  const s = getFlightPlanSettings(symbol);
  const v = parseFloat(value);
  s.docking = (value === '' || isNaN(v) || v <= 0) ? null : v;
  saveState();
  updateFlightPlanBanner();
  renderModalChart();
};

window.saveFlightPlanEscape = function (symbol, value) {
  const s = getFlightPlanSettings(symbol);
  const v = parseFloat(value);
  s.escape = (value === '' || isNaN(v) || v <= 0) ? null : v;
  saveState();
  updateFlightPlanBanner();
  renderModalChart();
};

window.addFlightPlanFuel = function (symbol) {
  const input = document.getElementById('mFuelInput');
  if (!input) return;
  const v = parseFloat(input.value);
  if (isNaN(v) || v <= 0) return;
  const s = getFlightPlanSettings(symbol);
  s.fuel.push(v);
  s.fuel.sort((a, b) => b - a);
  input.value = '';
  saveState();
  updateFlightPlanBanner();
  renderFlightPlanPanel(symbol);
  renderModalChart();
};

window.removeFlightPlanFuel = function (symbol, idx) {
  const s = getFlightPlanSettings(symbol);
  s.fuel.splice(idx, 1);
  saveState();
  updateFlightPlanBanner();
  renderFlightPlanPanel(symbol);
  renderModalChart();
};

// 모달 안의 "🚀 비행 계획" 패널을 그립니다.
function renderFlightPlanPanel(symbol) {
  const wrap = document.getElementById('mFlightPlanPanel');
  if (!wrap || !symbol) return;

  // 🛰️ 탐사선을 띄운 종목의 상세카드에는 비행 계획 설정 영역을 표시하지 않습니다.
  const hasProbe = !!(state.probes && state.probes.some(p => p.symbol === symbol));
  if (hasProbe) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = '';

  const s = getFlightPlanSettings(symbol);
  const isKr = isKorean(symbol);
  const currency = isKr ? '₩' : '$';
  const avgPrice = getFlightPlanAvgBuyPrice(symbol);

  const fuelHtml = s.fuel.length
    ? s.fuel.map((p, i) => `
        <div class="fp-fuel-row">
          <span class="fp-fuel-dot"></span>
          <span class="fp-fuel-value">${currency}${p.toLocaleString()}</span>
          <span class="fp-fuel-remove" onclick="removeFlightPlanFuel('${symbol}', ${i})" title="삭제">✕</span>
        </div>`).join('')
    : `<div class="fp-fuel-empty">설정된 지점 없음</div>`;

  wrap.innerHTML = `
    <div class="fp-title"><span class="fp-title-icon">🚀</span> 비행 계획</div>
    <div class="fp-field">
      <div class="fp-label"><span class="fp-icon-badge fp-icon-docking">🌕</span> 도킹 지점 <span class="fp-sublabel">(목표가)</span></div>
      <input type="number" id="mDockingInput" class="fp-input-docking" value="${s.docking != null ? s.docking : ''}" placeholder="${currency} 입력"
        onchange="saveFlightPlanDocking('${symbol}', this.value)">
      ${_fpPctRowHtml(symbol, 'docking', avgPrice)}
    </div>
    <div class="fp-field">
      <div class="fp-label"><span class="fp-icon-badge fp-icon-escape">🛸</span> 비상 탈출 <span class="fp-sublabel">(손절가)</span></div>
      <input type="number" id="mEscapeInput" class="fp-input-escape" value="${s.escape != null ? s.escape : ''}" placeholder="${currency} 입력"
        onchange="saveFlightPlanEscape('${symbol}', this.value)">
      ${_fpPctRowHtml(symbol, 'escape', avgPrice)}
    </div>
    <div class="fp-field" style="margin-bottom:4px;">
      <div class="fp-label"><span class="fp-icon-badge fp-icon-fuel">⛽</span> 연료 보급 <span class="fp-sublabel">(물타기)</span></div>
      <input type="number" id="mFuelInput" class="fp-input-fuel" placeholder="${currency} 입력 후 Enter"
        onkeydown="if(event.key==='Enter'){addFlightPlanFuel('${symbol}');}">
      <button class="btn-sm fp-add-btn" onclick="addFlightPlanFuel('${symbol}')">+ 지점 추가</button>
      ${_fpPctRowHtml(symbol, 'fuel', avgPrice)}
      ${fuelHtml}
    </div>
  `;
}

// 현재 보유 중인 종목들의 도킹/탈출/연료 지점 중 현재가에 근접하거나 도달한 것을 찾습니다.
function computeActiveFlightPlanAlerts(rawHoldings) {
  const alerts = [];
  if (!state.flightPlans) return alerts;

  const bySymbol = {};
  for (let key in rawHoldings) {
    if (!rawHoldings.hasOwnProperty(key)) continue;
    const h = rawHoldings[key];
    if (h.qty > 0) {
      if (!bySymbol[h.symbol]) bySymbol[h.symbol] = 0;
      bySymbol[h.symbol] += h.qty;
    }
  }

  Object.keys(state.flightPlans).forEach(symbol => {
    if (!bySymbol[symbol] || bySymbol[symbol] <= 0) return; // 현재 보유 중인 종목만 알림 대상
    const settings = state.flightPlans[symbol];
    const data = cachedMarketData[symbol];
    if (!data || data._failed) return;
    const price = data.last || (data.prices && data.prices.length ? data.prices[data.prices.length - 1] : null);
    if (!price) return;
    const name = data.name || symbol;

    const pushIfNear = (point, type, reachedLabel, nearLabel, reachedCond) => {
      if (!point) return;
      const diffPct = (price - point) / point * 100;
      if (reachedCond(price, point) || Math.abs(diffPct) <= FLIGHT_PLAN_PROXIMITY_PCT) {
        alerts.push({
          symbol, name, type,
          label: reachedCond(price, point) ? reachedLabel : nearLabel,
          price, point, diffPct
        });
      }
    };

    pushIfNear(settings.docking, 'docking', '도킹 완료', '도킹 지점 근접', (p, t) => p >= t);
    pushIfNear(settings.escape, 'escape', '비상 탈출 신호', '비상 탈출 근접', (p, t) => p <= t);
    (settings.fuel || []).forEach(fuelPoint => {
      pushIfNear(fuelPoint, 'fuel', '연료 보급 지점 도달', '연료 보급 지점 근접', (p, t) => p <= t);
    });
  });

  return alerts;
}

// "🌐 통합 자산" 영역 상단의 비행 계획 알림 배너를 그립니다.
function updateFlightPlanBanner(rawHoldingsArg) {
  const wrap = document.getElementById('flightPlanBanner');
  if (!wrap) return;

  // 🚀 알림 배너는 전체보기 / 소유자1 / 소유자2 화면에서만 노출합니다.
  if (!['all', 'user1', 'user2'].includes(currentView)) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  let rawHoldings = rawHoldingsArg;
  if (!rawHoldings) {
    let ownerFilter = 'all';
    if (currentView === 'user1') ownerFilter = state.owners.user1.name;
    if (currentView === 'user2') ownerFilter = state.owners.user2.name;
    rawHoldings = calculateHoldings(ownerFilter);
  }

  const alerts = computeActiveFlightPlanAlerts(rawHoldings);
  if (!alerts.length) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  const typeMeta = {
    docking: { icon: '🌕', label: '도킹 지점', color: '#00C578', bg: 'rgba(0,197,120,0.10)' },
    escape:  { icon: '🛸', label: '비상 탈출', color: '#ff4d6a', bg: 'rgba(255,77,106,0.10)' },
    fuel:    { icon: '⛽', label: '연료 보급', color: '#3A9AFF', bg: 'rgba(58,154,255,0.10)' }
  };

  // 알림 유형(도킹/탈출/연료)별로 그룹핑
  const groups = { docking: [], escape: [], fuel: [] };
  alerts.forEach(a => { if (groups[a.type]) groups[a.type].push(a); });

  wrap.style.display = 'flex';
  wrap.innerHTML = ['docking', 'escape', 'fuel'].filter(t => groups[t].length).map(t => {
    const meta = typeMeta[t];
    const chips = groups[t].map(a => {
      const sign = a.diffPct > 0 ? '+' : '';
      return `
        <span class="flight-plan-chip" onclick="openChartModal('${a.symbol}')" title="클릭하면 ${_escFlightPlanText(a.name)} 상세카드가 열립니다">
          <strong>${_escFlightPlanText(a.name)}</strong>
          <span style="color:${meta.color};">${sign}${a.diffPct.toFixed(1)}%</span>
        </span>`;
    }).join('');
    return `
      <div class="flight-plan-group" style="border-color:${meta.color}; background:${meta.bg};">
        <div class="flight-plan-group-head">
          <span>${meta.icon}</span>
          <span>${meta.label} 근접·도달</span>
          <span class="flight-plan-group-count" style="background:${meta.color};">${groups[t].length}</span>
        </div>
        <div class="flight-plan-group-chips">${chips}</div>
      </div>`;
  }).join('');
}
