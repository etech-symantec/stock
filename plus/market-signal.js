const MS_CARDS_META = [
  // 1. 심리 / 리스크 (카테고리 합계 25)
  { key: 'VIX', group: 'risk', weight: 8, inverse: false, range: [10, 40] },
  { key: 'MOVE', group: 'risk', weight: 4, inverse: false, range: [50, 160] },
  { key: 'High_Yield', group: 'risk', weight: 6, inverse: false, range: [2.0, 9.0] },
  { key: 'Fear_Greed', group: 'risk', weight: 7, inverse: false, range: [0, 100] },

  // 2. 자금 환경 (카테고리 합계 25)
  { key: 'US10Y', group: 'liquidity', weight: 8, inverse: false, range: [1.5, 6.0] },
  { key: 'DXY', group: 'liquidity', weight: 6, inverse: false, range: [90, 115] },
  { key: 'USDKRW', group: 'liquidity', weight: 5, inverse: false, range: [1000, 1600] },
  { key: 'Margin_Debt_US', group: 'liquidity', weight: 3, inverse: false, range: [0, 2] },
  { key: 'Margin_Debt_KR', group: 'liquidity', weight: 3, inverse: false, range: [10, 45] },

  // 3. 경기 선행 (카테고리 합계 25)
  { key: 'Russell2000', group: 'economy', weight: 6, inverse: true, range: [1800, 3200] },
  { key: 'Copper', group: 'economy', weight: 6, inverse: true, range: [4.0, 7.0] },
  { key: 'BDI_Index', group: 'economy', weight: 5, inverse: true, range: [1000, 3000] },
  { key: 'KR_Export', group: 'economy', weight: 8, inverse: true, range: [500, 950] },

  // 4. 밸류에이션 (카테고리 합계 25)
  { key: 'Buffett_US', group: 'valuation', weight: 8, inverse: false, range: [70, 240] },
  { key: 'Buffett_KR', group: 'valuation', weight: 8, inverse: false, range: [50, 150] },
  { key: 'CAPE_PE', group: 'valuation', weight: 9, inverse: false, range: [15, 45] }
];

function msCalculateTotalScore(row) {
  const groups = {};

  MS_CARDS_META.forEach(meta => {
    const raw = row[meta.key];
    if (raw === undefined || raw === null || raw === '' || raw === 'N/A') return;
    const num = parseFloat(raw.toString().split('(')[0]);
    if (isNaN(num)) return;

    const [min, max] = meta.range;
    let pct = Math.min(Math.max((num - min) / (max - min) * 100, 0), 100);
    const riskPct = meta.inverse ? (100 - pct) : pct;

    if (!groups[meta.group]) groups[meta.group] = { sumScoreWeight: 0, sumWeight: 0 };
    groups[meta.group].sumScoreWeight += riskPct * meta.weight;
    groups[meta.group].sumWeight += meta.weight;
  });

  const groupNames = ['risk', 'liquidity', 'economy', 'valuation'];
  let validGroupCount = 0;
  let totalScore = 0;

  groupNames.forEach(g => {
    if (groups[g] && groups[g].sumWeight > 0) {
      totalScore += groups[g].sumScoreWeight / groups[g].sumWeight;
      validGroupCount++;
    }
  });

  if (validGroupCount === 0) return NaN;
  return totalScore / validGroupCount;
}

async function initMarketSignalBar() {
  try {
    const res = await fetch(`data/indicators.csv?t=${new Date().getTime()}`);
    if (!res.ok) throw new Error('CSV not found');
    const text = await res.text();

    // 💡 index.html의 parseCSV()와 동일한 quote-aware 파서 (값 내부 콤마/괄호 안전 처리)
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const vals = [];
      let insideQuote = false;
      let currWord = '';
      for (const char of line) {
        if (char === '"') insideQuote = !insideQuote;
        else if (char === ',' && !insideQuote) { vals.push(currWord.trim()); currWord = ''; }
        else currWord += char;
      }
      vals.push(currWord.trim());
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] ?? '');
      return obj;
    }).filter(r => r.Date);

    if (!rows.length) return;
    const latest = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;

    document.getElementById('marketSignalBar').style.display = 'block';
    document.getElementById('marketSignalBar').setAttribute('data-loaded', '1');

    // ── 헬퍼 ──────────────────────────────────────────
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    // ── 0. 오늘 날짜 (연/월/일 세로 3줄) ──────────────
    if (latest.Date) {
      const d = new Date(latest.Date);
      if (!isNaN(d.getTime())) {
        document.getElementById('ms-date-year').textContent = d.getFullYear() + '년';
        document.getElementById('ms-date-month').textContent = (d.getMonth() + 1) + '월';
        document.getElementById('ms-date-day').textContent = d.getDate() + '일';
      } else {
        // "YYYY-MM-DD" 형식이 아닐 경우 문자열 자체를 분해 시도
        const parts = latest.Date.split(/[-./]/);
        document.getElementById('ms-date-year').textContent = parts[0] ? parts[0] + '년' : '—';
        document.getElementById('ms-date-month').textContent = parts[1] ? parseInt(parts[1], 10) + '월' : '—';
        document.getElementById('ms-date-day').textContent = parts[2] ? parseInt(parts[2], 10) + '일' : '—';
      }
    }

    // ── 어제 대비 등락 표시 헬퍼 ──────────────────────
    // up이 true면 "값이 클수록 긍정적"(녹색 ▲ / 빨강 ▼), false면 "값이 클수록 부정적"(반대)
    // decimals: 비교에 사용할 소수점 자릿수, suffix: 표시 접미사(%, pt 등)
    function msSetDiff(diffEl, currVal, prevVal, { decimals = 1, suffix = '', goodDirection = 'up' } = {}) {
      if (!diffEl) return;
      if (isNaN(currVal) || prevVal === undefined || prevVal === null || prevVal === '' || prevVal === 'N/A') {
        diffEl.textContent = ''; return;
      }
      const prevNum = parseFloat(prevVal.toString().split('(')[0]);
      if (isNaN(prevNum)) { diffEl.textContent = ''; return; }
      const diff = currVal - prevNum;
      const absStr = Math.abs(diff).toFixed(decimals) + suffix;
      if (Math.abs(diff) < Math.pow(10, -decimals) / 2) {
        diffEl.textContent = '─ 0' + suffix;
        diffEl.style.color = 'var(--text3)';
        return;
      }
      const isUp = diff > 0;
      const isGood = goodDirection === 'up' ? isUp : !isUp;
      diffEl.textContent = (isUp ? '▲ ' : '▼ ') + absStr;
      diffEl.style.color = isGood ? 'var(--profit)' : 'var(--loss)';
    }

    // ── 1. 종합 신호 (index.html의 calculateTotalScore() 재계산 로직과 완전히 동일하게 산출) ──
    // index.html getValuationSignal()과 동일한 0~100 스케일 기준:
    // [0~30] 적극 매수 · (30~50] 분할 매수 · (50~70] 관망 유지 · (70~100] 비중 축소
    const score = msCalculateTotalScore(latest);
    let signalLabel = 'N/A', signalColor = 'var(--text3)', signalBg = 'rgba(150,150,150,0.12)';
    if (!isNaN(score) && score !== 0) {
      if (score <= 30)      { signalLabel = '적극 매수'; signalColor = '#059669'; signalBg = 'rgba(5,150,105,0.12)'; }
      else if (score <= 50) { signalLabel = '분할 매수'; signalColor = '#10b981'; signalBg = 'rgba(16,185,129,0.1)'; }
      else if (score <= 70) { signalLabel = '관망 유지'; signalColor = '#d97706'; signalBg = 'rgba(217,119,6,0.12)'; }
      else                  { signalLabel = '비중 축소'; signalColor = '#e11d48'; signalBg = 'rgba(225,29,72,0.12)'; }
    }

    const scoreEl = document.getElementById('ms-score');
    scoreEl.textContent = (isNaN(score) || score === 0) ? '—' : score.toFixed(1);
    scoreEl.style.color = signalColor;

    const badge = document.getElementById('ms-badge');
    badge.textContent = signalLabel;
    badge.style.color = signalColor;
    badge.style.backgroundColor = signalBg;
    badge.style.borderColor = signalColor;

    // 종합 신호: 점수가 낮을수록 긍정적(저평가)이므로 goodDirection은 'down'
    const scoreDiffEl = document.getElementById('ms-score-diff');
    if (prev) {
      const prevScore = msCalculateTotalScore(prev);
      msSetDiff(scoreDiffEl, score, isNaN(prevScore) ? null : prevScore, { decimals: 1, goodDirection: 'down' });
    } else if (scoreDiffEl) { scoreDiffEl.textContent = ''; }

    // ── 2. VIX ──────────────────────────────────────
    const vix = parseFloat(latest.VIX);
    const vixEl = document.getElementById('ms-vix');
    const vixValSpan = vixEl ? vixEl.querySelector('span:first-child') : null;
    const vixDiffEl = document.getElementById('ms-vix-diff');
    const vixGauge = document.getElementById('ms-vix-gauge');
    const vixHint = document.getElementById('ms-vix-hint');
    if (!isNaN(vix)) {
      vixValSpan.textContent = vix.toFixed(2);
      const pct = clamp((vix / 60) * 100, 2, 98);
      const vixDot = document.getElementById('ms-vix-dot');
      if (vixDot) vixDot.style.left = pct + '%';
      let vColor = 'var(--loss)', vHint = '공포 구간 🔴';
      if (vix < 15)      { vColor = 'var(--profit)'; vHint = '저변동 안정 🟢'; }
      else if (vix < 20) { vColor = '#00c87a';        vHint = '보통 수준'; }
      else if (vix < 30) { vColor = '#ffb703';        vHint = '변동성 주의'; }
      vixValSpan.style.color = vColor;
      vixHint.textContent = vHint; vixHint.style.color = vColor;
      if (prev) msSetDiff(vixDiffEl, vix, prev.VIX, { decimals: 2, goodDirection: 'down' });
    } else { vixValSpan.textContent = 'N/A'; vixHint.textContent = '데이터 없음'; }

    // ── 3. MOVE ─────────────────────────────────────
    const move = parseFloat(latest.MOVE);
    const moveEl = document.getElementById('ms-move');
    const moveValSpan = moveEl ? moveEl.querySelector('span:first-child') : null;
    const moveDiffEl = document.getElementById('ms-move-diff');
    const moveGauge = document.getElementById('ms-move-gauge');
    const moveHint = document.getElementById('ms-move-hint');
    if (!isNaN(move)) {
      moveValSpan.textContent = move.toFixed(1);
      const pct = clamp(((move - 50) / 110) * 100, 2, 98);
      const moveDot = document.getElementById('ms-move-dot');
      if (moveDot) moveDot.style.left = pct + '%';
      let mColor = 'var(--loss)', mHint = '채권 발작 경고 🔴';
      if (move < 80)       { mColor = 'var(--profit)'; mHint = '안정 구간 🟢'; }
      else if (move < 110) { mColor = '#ffb703';        mHint = '주의 구간'; }
      moveValSpan.style.color = mColor;
      moveHint.textContent = mHint; moveHint.style.color = mColor;
      if (prev) msSetDiff(moveDiffEl, move, prev.MOVE, { decimals: 1, goodDirection: 'down' });
    } else { moveValSpan.textContent = 'N/A'; moveHint.textContent = '데이터 없음'; }

    // ── 4. 하이일드 스프레드 ─────────────────────────
    const hy = parseFloat(latest.High_Yield);
    const hyEl = document.getElementById('ms-hy');
    const hyValSpan = hyEl ? hyEl.querySelector('span:first-child') : null;
    const hyDiffEl = document.getElementById('ms-hy-diff');
    const hyGauge = document.getElementById('ms-hy-gauge');
    const hyHint = document.getElementById('ms-hy-hint');
    if (!isNaN(hy)) {
      hyValSpan.textContent = hy.toFixed(2) + '%p';
      const pct = clamp(((hy - 2) / 7) * 100, 2, 98);
      const hyDot = document.getElementById('ms-hy-dot');
      if (hyDot) hyDot.style.left = pct + '%';
      let hColor = 'var(--loss)', hHint = '신용 위기 경보 🔴';
      if (hy < 3.5)      { hColor = 'var(--profit)'; hHint = '안정 구간 🟢'; }
      else if (hy < 5.5) { hColor = '#ffb703';        hHint = '신용 주의'; }
      hyValSpan.style.color = hColor;
      hyHint.textContent = hHint; hyHint.style.color = hColor;
      if (prev) msSetDiff(hyDiffEl, hy, prev.High_Yield, { decimals: 2, goodDirection: 'down' });
    } else { hyValSpan.textContent = 'N/A'; hyHint.textContent = '데이터 없음'; }

    // ── 5. 공포탐욕 ──────────────────────────────────
    const fg = parseFloat(latest.Fear_Greed);
    const fgEl = document.getElementById('ms-fg');
    const fgValSpan = fgEl ? fgEl.querySelector('span:first-child') : null;
    const fgDiffEl = document.getElementById('ms-fg-diff');
    const fgDot = document.getElementById('ms-fg-dot');
    const fgHint = document.getElementById('ms-fg-hint');
    if (!isNaN(fg)) {
      fgValSpan.textContent = fg.toFixed(1);
      fgDot.style.left = clamp(fg, 2, 98) + '%';
      let fColor = '#ff4d6a', fHint = '극단적 탐욕 🔴';
      if (fg < 25)      { fColor = '#3A9AFF'; fHint = '극단적 공포 🟢'; }
      else if (fg < 45) { fColor = '#4d9fff'; fHint = '공포 구간'; }
      else if (fg < 55) { fColor = '#ffb703'; fHint = '중립'; }
      else if (fg < 75) { fColor = '#ff9f43'; fHint = '탐욕 구간'; }
      fgValSpan.style.color = fColor;
      fgHint.textContent = fHint; fgHint.style.color = fColor;
      // 공포&탐욕은 중립(50)이 기준이라 방향성 좋다/나쁘다 판단 없이 변화량만 중립색으로 표시
      if (prev && fgDiffEl) {
        const prevFg = parseFloat((prev.Fear_Greed ?? '').toString().split('(')[0]);
        if (!isNaN(prevFg)) {
          const diff = fg - prevFg;
          if (Math.abs(diff) < 0.05) { fgDiffEl.textContent = '─ 0'; fgDiffEl.style.color = 'var(--text3)'; }
          else { fgDiffEl.textContent = (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff).toFixed(1); fgDiffEl.style.color = 'var(--text3)'; }
        } else { fgDiffEl.textContent = ''; }
      }
    } else { fgValSpan.textContent = 'N/A'; fgHint.textContent = '데이터 없음'; }

    // ── 6. 미국 10년물 금리 ──────────────────────────
    const us10y = parseFloat(latest.US10Y);
    const us10yEl = document.getElementById('ms-us10y');
    const us10yValSpan = us10yEl ? us10yEl.querySelector('span:first-child') : null;
    const us10yDiffEl = document.getElementById('ms-us10y-diff');
    const us10yGauge = document.getElementById('ms-us10y-gauge');
    const us10yHint = document.getElementById('ms-us10y-hint');
    if (!isNaN(us10y)) {
      us10yValSpan.textContent = us10y.toFixed(2) + '%';
      const pct = clamp(((us10y - 1.5) / 4.5) * 100, 2, 98);
      const us10yDot = document.getElementById('ms-us10y-dot');
      if (us10yDot) us10yDot.style.left = pct + '%';
      let yColor = 'var(--loss)', yHint = '고금리 부담 🔴';
      if (us10y < 3)      { yColor = 'var(--profit)'; yHint = '저금리 구간'; }
      else if (us10y < 4) { yColor = '#00c87a';        yHint = '안정 수준'; }
      else if (us10y < 5) { yColor = '#ffb703';        yHint = '고금리 주의'; }
      us10yValSpan.style.color = yColor;
      us10yHint.textContent = yHint; us10yHint.style.color = yColor;
      if (prev) msSetDiff(us10yDiffEl, us10y, prev.US10Y, { decimals: 2, suffix: '%p', goodDirection: 'down' });
    } else { us10yValSpan.textContent = 'N/A'; us10yHint.textContent = '데이터 없음'; }

    // ── 7. DXY ───────────────────────────────────────
    const dxy = parseFloat(latest.DXY);
    const dxyEl = document.getElementById('ms-dxy');
    const dxyValSpan = dxyEl ? dxyEl.querySelector('span:first-child') : null;
    const dxyDiffEl = document.getElementById('ms-dxy-diff');
    const dxyGauge = document.getElementById('ms-dxy-gauge');
    const dxyHint = document.getElementById('ms-dxy-hint');
    if (!isNaN(dxy)) {
      dxyValSpan.textContent = dxy.toFixed(2);
      const pct = clamp(((dxy - 90) / 25) * 100, 2, 98);
      const dxyDot = document.getElementById('ms-dxy-dot');
      if (dxyDot) dxyDot.style.left = pct + '%';
      let dColor = 'var(--loss)', dHint = '달러 강세 🔴';
      if (dxy < 95)       { dColor = 'var(--profit)'; dHint = '달러 약세 🟢'; }
      else if (dxy < 103) { dColor = '#ffb703';        dHint = '중립 구간'; }
      dxyValSpan.style.color = dColor;
      dxyHint.textContent = dHint; dxyHint.style.color = dColor;
      if (prev) msSetDiff(dxyDiffEl, dxy, prev.DXY, { decimals: 2, goodDirection: 'down' });
    } else { dxyValSpan.textContent = 'N/A'; dxyHint.textContent = '데이터 없음'; }

    // ── 8. USD/KRW ───────────────────────────────────
    const usdkrw = parseFloat(latest.USDKRW);
    const usdkrwEl = document.getElementById('ms-usdkrw');
    const usdkrwValSpan = usdkrwEl ? usdkrwEl.querySelector('span:first-child') : null;
    const usdkrwDiffEl = document.getElementById('ms-usdkrw-diff');
    const usdkrwGauge = document.getElementById('ms-usdkrw-gauge');
    const usdkrwHint = document.getElementById('ms-usdkrw-hint');
    if (!isNaN(usdkrw)) {
      usdkrwValSpan.textContent = usdkrw.toFixed(0) + '₩';
      const pct = clamp(((usdkrw - 1000) / 600) * 100, 2, 98);
      const usdkrwDot = document.getElementById('ms-usdkrw-dot');
      if (usdkrwDot) usdkrwDot.style.left = pct + '%';
      let kColor = 'var(--loss)', kHint = '원화 약세 🔴';
      if (usdkrw < 1300)      { kColor = 'var(--profit)'; kHint = '원화 강세 🟢'; }
      else if (usdkrw < 1400) { kColor = '#ffb703';        kHint = '보통 수준'; }
      usdkrwValSpan.style.color = kColor;
      usdkrwHint.textContent = kHint; usdkrwHint.style.color = kColor;
      if (prev) msSetDiff(usdkrwDiffEl, usdkrw, prev.USDKRW, { decimals: 0, suffix: '₩', goodDirection: 'down' });
    } else { usdkrwValSpan.textContent = 'N/A'; usdkrwHint.textContent = '데이터 없음'; }

    // ── 9. 미국 신용잔고 ─────────────────────────────
    const marginUs = parseFloat(latest.Margin_Debt_US);
    const marginUsEl = document.getElementById('ms-margin-us');
    const marginUsValSpan = marginUsEl ? marginUsEl.querySelector('span:first-child') : null;
    const marginUsDiffEl = document.getElementById('ms-margin-us-diff');
    const marginUsGauge = document.getElementById('ms-margin-us-gauge');
    const marginUsHint = document.getElementById('ms-margin-us-hint');
    if (!isNaN(marginUs)) {
      marginUsValSpan.textContent = marginUs.toFixed(3) + 'T';
      const pct = clamp((marginUs / 2) * 100, 2, 98);
      const marginUsDot = document.getElementById('ms-margin-us-dot');
      if (marginUsDot) marginUsDot.style.left = pct + '%';
      let muColor = '#ffb703', muHint = '레버리지 과열';
      if (marginUs < 0.8)      { muColor = 'var(--profit)'; muHint = '레버리지 안정 🟢'; }
      else if (marginUs < 1.4) { muColor = '#00c87a';        muHint = '보통 수준'; }
      else if (marginUs > 1.7) { muColor = 'var(--loss)';    muHint = '강제청산 위험 🔴'; }
      marginUsValSpan.style.color = muColor;
      marginUsHint.textContent = muHint; marginUsHint.style.color = muColor;
      if (prev) msSetDiff(marginUsDiffEl, marginUs, prev.Margin_Debt_US, { decimals: 3, suffix: 'T', goodDirection: 'down' });
    } else { marginUsValSpan.textContent = 'N/A'; marginUsHint.textContent = '데이터 없음'; }

    // ── 10. 한국 신용잔고 ────────────────────────────
    const marginKr = parseFloat(latest.Margin_Debt_KR);
    const marginKrEl = document.getElementById('ms-margin-kr');
    const marginKrValSpan = marginKrEl ? marginKrEl.querySelector('span:first-child') : null;
    const marginKrDiffEl = document.getElementById('ms-margin-kr-diff');
    const marginKrGauge = document.getElementById('ms-margin-kr-gauge');
    const marginKrHint = document.getElementById('ms-margin-kr-hint');
    if (!isNaN(marginKr)) {
      marginKrValSpan.textContent = marginKr.toFixed(1) + '조';
      const pct = clamp(((marginKr - 10) / 35) * 100, 2, 98);
      const marginKrDot = document.getElementById('ms-margin-kr-dot');
      if (marginKrDot) marginKrDot.style.left = pct + '%';
      let mkColor = 'var(--loss)', mkHint = '반대매매 위험 🔴';
      if (marginKr < 20)      { mkColor = 'var(--profit)'; mkHint = '안정 구간 🟢'; }
      else if (marginKr < 30) { mkColor = '#ffb703';        mkHint = '레버리지 주의'; }
      marginKrValSpan.style.color = mkColor;
      marginKrHint.textContent = mkHint; marginKrHint.style.color = mkColor;
      if (prev) msSetDiff(marginKrDiffEl, marginKr, prev.Margin_Debt_KR, { decimals: 1, suffix: '조', goodDirection: 'down' });
    } else { marginKrValSpan.textContent = 'N/A'; marginKrHint.textContent = '데이터 없음'; }

    // ── 11. Russell 2000 ─────────────────────────────
    const russell = parseFloat(latest.Russell2000);
    const russellEl = document.getElementById('ms-russell');
    const russellValSpan = russellEl ? russellEl.querySelector('span:first-child') : null;
    const russellDiffEl = document.getElementById('ms-russell-diff');
    const russellGauge = document.getElementById('ms-russell-gauge');
    const russellHint = document.getElementById('ms-russell-hint');
    if (!isNaN(russell)) {
      russellValSpan.textContent = russell.toFixed(0);
      const pct = clamp(((russell - 1400) / 1200) * 100, 2, 98);
      const russellDot = document.getElementById('ms-russell-dot');
      if (russellDot) russellDot.style.left = pct + '%';
      let rColor = 'var(--loss)', rHint = '약세 구간 🔴';
      if (russell > 2200)      { rColor = 'var(--profit)'; rHint = '강세 구간 🟢'; }
      else if (russell > 1800) { rColor = '#ffb703';        rHint = '중립 구간'; }
      russellValSpan.style.color = rColor;
      russellHint.textContent = rHint; russellHint.style.color = rColor;
      if (prev) msSetDiff(russellDiffEl, russell, prev.Russell2000, { decimals: 0, goodDirection: 'up' });
    } else { russellValSpan.textContent = 'N/A'; russellHint.textContent = '데이터 없음'; }

    // ── 12. 구리 가격 ────────────────────────────────
    const copper = parseFloat(latest.Copper);
    const copperEl = document.getElementById('ms-copper');
    const copperValSpan = copperEl ? copperEl.querySelector('span:first-child') : null;
    const copperDiffEl = document.getElementById('ms-copper-diff');
    const copperGauge = document.getElementById('ms-copper-gauge');
    const copperHint = document.getElementById('ms-copper-hint');
    if (!isNaN(copper)) {
      copperValSpan.textContent = '$' + copper.toFixed(2);
      const pct = clamp(((copper - 2.5) / 3) * 100, 2, 98);
      const copperDot = document.getElementById('ms-copper-dot');
      if (copperDot) copperDot.style.left = pct + '%';
      let cColor = 'var(--loss)', cHint = '경기 침체 신호 🔴';
      if (copper > 4.0)      { cColor = 'var(--profit)'; cHint = '경기 호황 🟢'; }
      else if (copper > 3.2) { cColor = '#ffb703';        cHint = '회복 구간'; }
      copperValSpan.style.color = cColor;
      copperHint.textContent = cHint; copperHint.style.color = cColor;
      if (prev) msSetDiff(copperDiffEl, copper, prev.Copper, { decimals: 2, suffix: '$', goodDirection: 'up' });
    } else { copperValSpan.textContent = 'N/A'; copperHint.textContent = '데이터 없음'; }

    // ── 13. BDI ──────────────────────────────────────
    const bdi = parseFloat(latest.BDI_Index);
    const bdiEl = document.getElementById('ms-bdi');
    const bdiValSpan = bdiEl ? bdiEl.querySelector('span:first-child') : null;
    const bdiDiffEl = document.getElementById('ms-bdi-diff');
    const bdiGauge = document.getElementById('ms-bdi-gauge');
    const bdiHint = document.getElementById('ms-bdi-hint');
    if (!isNaN(bdi)) {
      bdiValSpan.textContent = bdi.toFixed(0);
      const pct = clamp(((bdi - 500) / 4000) * 100, 2, 98);
      const bdiDot = document.getElementById('ms-bdi-dot');
      if (bdiDot) bdiDot.style.left = pct + '%';
      let bdColor = 'var(--loss)', bdHint = '물동량 침체 🔴';
      if (bdi > 2000)      { bdColor = 'var(--profit)'; bdHint = '물동량 호황 🟢'; }
      else if (bdi > 1000) { bdColor = '#ffb703';        bdHint = '보통 수준'; }
      bdiValSpan.style.color = bdColor;
      bdiHint.textContent = bdHint; bdiHint.style.color = bdColor;
      if (prev) msSetDiff(bdiDiffEl, bdi, prev.BDI_Index, { decimals: 0, goodDirection: 'up' });
    } else { bdiValSpan.textContent = 'N/A'; bdiHint.textContent = '데이터 없음'; }

    // ── 14. 한국 수출 ─────────────────────────────────
    const krRaw = latest.KR_Export ?? '';
    const krexport = parseFloat(krRaw);
    const krexportEl = document.getElementById('ms-krexport');
    const krexportValSpan = krexportEl ? krexportEl.querySelector('span:first-child') : null;
    const krexportDiffEl = document.getElementById('ms-krexport-diff');
    const krexportGauge = document.getElementById('ms-krexport-gauge');
    const krexportHint = document.getElementById('ms-krexport-hint');
    if (!isNaN(krexport)) {
      krexportValSpan.textContent = krexport.toFixed(0) + '억$';
      const pct = clamp(((krexport - 40) / 30) * 100, 2, 98);
      const krexportDot = document.getElementById('ms-krexport-dot');
      if (krexportDot) krexportDot.style.left = pct + '%';
      let keColor = 'var(--loss)', keHint = '수출 부진 🔴';
      if (krexport > 580)      { keColor = 'var(--profit)'; keHint = '수출 호조 🟢'; }
      else if (krexport > 500) { keColor = '#ffb703';        keHint = '보통 수준'; }
      krexportValSpan.style.color = keColor;
      krexportHint.textContent = keHint; krexportHint.style.color = keColor;
      if (prev) msSetDiff(krexportDiffEl, krexport, prev.KR_Export, { decimals: 0, suffix: '억$', goodDirection: 'up' });
    } else {
      // "877.5 (53.2%)" 같은 형식도 처리
      const match = krRaw.match(/[\d.]+/);
      if (match) {
        krexportValSpan.textContent = parseFloat(match[0]).toFixed(0) + '억$';
        krexportHint.textContent = krRaw.includes('(') ? krRaw.match(/\(([^)]+)\)/)?.[1] ?? '' : '';
        if (prev && krexportDiffEl) {
          const prevRaw = (prev.KR_Export ?? '').toString();
          const prevMatch = prevRaw.match(/[\d.]+/);
          if (prevMatch) msSetDiff(krexportDiffEl, parseFloat(match[0]), prevMatch[0], { decimals: 0, suffix: '억$', goodDirection: 'up' });
        }
      } else {
        krexportValSpan.textContent = 'N/A';
        krexportHint.textContent = '데이터 없음';
      }
    }

    // ── 15. 버핏 지수 (미국) ─────────────────────────
    const buff = parseFloat(latest.Buffett_US);
    const buffEl = document.getElementById('ms-buffett');
    const buffValSpan = buffEl ? buffEl.querySelector('span:first-child') : null;
    const buffDiffEl = document.getElementById('ms-buffett-diff');
    const buffGauge = document.getElementById('ms-buffett-gauge');
    const buffHint = document.getElementById('ms-buffett-hint');
    if (!isNaN(buff)) {
      buffValSpan.textContent = buff.toFixed(1) + '%';
      const pct = clamp(((buff - 70) / 170) * 100, 2, 98);
      const buffDot = document.getElementById('ms-buffett-dot');
      if (buffDot) buffDot.style.left = pct + '%';
      let bColor = 'var(--loss)', bHint = '극단적 버블 🔴';
      if (buff < 100)      { bColor = 'var(--profit)'; bHint = '저평가 구간 🟢'; }
      else if (buff < 130) { bColor = '#00c87a';        bHint = '적정~약간 고평가'; }
      else if (buff < 180) { bColor = '#ffb703';        bHint = '고평가 주의'; }
      buffValSpan.style.color = bColor;
      buffHint.textContent = bHint; buffHint.style.color = bColor;
      if (prev) msSetDiff(buffDiffEl, buff, prev.Buffett_US, { decimals: 1, suffix: '%p', goodDirection: 'down' });
    } else { buffValSpan.textContent = 'N/A'; buffHint.textContent = '데이터 없음'; }

    // ── 16. 버핏 지수 (한국) ─────────────────────────
    const buffKr = parseFloat(latest.Buffett_KR);
    const buffKrEl = document.getElementById('ms-buffett-kr');
    const buffKrValSpan = buffKrEl ? buffKrEl.querySelector('span:first-child') : null;
    const buffKrDiffEl = document.getElementById('ms-buffett-kr-diff');
    const buffKrGauge = document.getElementById('ms-buffett-kr-gauge');
    const buffKrHint = document.getElementById('ms-buffett-kr-hint');
    if (!isNaN(buffKr)) {
      buffKrValSpan.textContent = buffKr.toFixed(1) + '%';
      const pct = clamp(((buffKr - 50) / 100) * 100, 2, 98);
      const buffKrDot = document.getElementById('ms-buffett-kr-dot');
      if (buffKrDot) buffKrDot.style.left = pct + '%';
      let bkColor = 'var(--loss)', bkHint = '고평가 경계 🔴';
      if (buffKr < 80)       { bkColor = 'var(--profit)'; bkHint = '저평가 구간 🟢'; }
      else if (buffKr < 110) { bkColor = '#00c87a';        bkHint = '적정 수준'; }
      else if (buffKr < 130) { bkColor = '#ffb703';        bkHint = '다소 고평가'; }
      buffKrValSpan.style.color = bkColor;
      buffKrHint.textContent = bkHint; buffKrHint.style.color = bkColor;
      if (prev) msSetDiff(buffKrDiffEl, buffKr, prev.Buffett_KR, { decimals: 1, suffix: '%p', goodDirection: 'down' });
    } else { buffKrValSpan.textContent = 'N/A'; buffKrHint.textContent = '데이터 없음'; }

    // ── 17. CAPE PE ──────────────────────────────────
    const cape = parseFloat(latest.CAPE_PE);
    const capeEl = document.getElementById('ms-cape');
    const capeValSpan = capeEl ? capeEl.querySelector('span:first-child') : null;
    const capeDiffEl = document.getElementById('ms-cape-diff');
    const capeGauge = document.getElementById('ms-cape-gauge');
    const capeHint = document.getElementById('ms-cape-hint');
    if (!isNaN(cape)) {
      capeValSpan.textContent = cape.toFixed(1) + '배';
      const pct = clamp(((cape - 15) / 30) * 100, 2, 98);
      const capeDot = document.getElementById('ms-cape-dot');
      if (capeDot) capeDot.style.left = pct + '%';
      let caColor = 'var(--loss)', caHint = '역사적 고평가 🔴';
      if (cape < 20)      { caColor = 'var(--profit)'; caHint = '저평가 구간 🟢'; }
      else if (cape < 28) { caColor = '#ffb703';        caHint = '역사적 평균'; }
      else if (cape < 38) { caColor = '#ff9f43';        caHint = '과열 주의'; }
      capeValSpan.style.color = caColor;
      capeHint.textContent = caHint; capeHint.style.color = caColor;
      if (prev) msSetDiff(capeDiffEl, cape, prev.CAPE_PE, { decimals: 1, suffix: '배', goodDirection: 'down' });
    } else { capeValSpan.textContent = 'N/A'; capeHint.textContent = '데이터 없음'; }

  } catch (e) {
    console.warn('Market Signal Bar 로드 실패:', e);
  }
}
document.addEventListener('DOMContentLoaded', initMarketSignalBar);


// =====================================================
// 📡 Market Signal 표시 설정 + 자동 컴팩트 레이아웃
// - 설정 모달에서 그룹/지표 숨김 상태 저장
// - 숨긴 지표 수와 실제 가로 공간에 따라 날짜+종합 신호를 1줄로 자동 배치
// =====================================================
const MARKET_SIGNAL_VISIBILITY_KEY = 'ttm_market_signal_visibility_v1';

const MARKET_SIGNAL_GROUPS = {
  risk: {
    checkboxId: 'sig-group-risk',
    selector: '.ms-risk',
    indicators: ['vix', 'move', 'hy', 'fg']
  },
  valuation: {
    checkboxId: 'sig-group-valuation',
    selector: '.ms-valuation',
    indicators: ['buffett', 'buffett-kr', 'cape']
  },
  cycle: {
    checkboxId: 'sig-group-cycle',
    selector: '.ms-cycle',
    indicators: ['russell', 'copper', 'bdi', 'krexport']
  },
  liquidity: {
    checkboxId: 'sig-group-liquidity',
    selector: '.ms-liquidity',
    indicators: ['us10y', 'dxy', 'usdkrw', 'margin-us', 'margin-kr']
  }
};

const MARKET_SIGNAL_INDICATORS = {
  vix: { checkboxId: 'sig-ind-vix', cardId: 'ms-card-vix' },
  move: { checkboxId: 'sig-ind-move', cardId: 'ms-card-move' },
  hy: { checkboxId: 'sig-ind-hy', cardId: 'ms-card-hy' },
  fg: { checkboxId: 'sig-ind-fg', cardId: 'ms-card-fg' },
  buffett: { checkboxId: 'sig-ind-buffett', cardId: 'ms-card-buffett' },
  'buffett-kr': { checkboxId: 'sig-ind-buffett-kr', cardId: 'ms-card-buffett-kr' },
  cape: { checkboxId: 'sig-ind-cape', cardId: 'ms-card-cape' },
  russell: { checkboxId: 'sig-ind-russell', cardId: 'ms-card-russell' },
  copper: { checkboxId: 'sig-ind-copper', cardId: 'ms-card-copper' },
  bdi: { checkboxId: 'sig-ind-bdi', cardId: 'ms-card-bdi' },
  krexport: { checkboxId: 'sig-ind-krexport', cardId: 'ms-card-krexport' },
  us10y: { checkboxId: 'sig-ind-us10y', cardId: 'ms-card-us10y' },
  dxy: { checkboxId: 'sig-ind-dxy', cardId: 'ms-card-dxy' },
  usdkrw: { checkboxId: 'sig-ind-usdkrw', cardId: 'ms-card-usdkrw' },
  'margin-us': { checkboxId: 'sig-ind-margin-us', cardId: 'ms-card-margin-us' },
  'margin-kr': { checkboxId: 'sig-ind-margin-kr', cardId: 'ms-card-margin-kr' }
};

function getDefaultMarketSignalVisibility() {
  const groups = {};
  const indicators = {};
  Object.keys(MARKET_SIGNAL_GROUPS).forEach(key => groups[key] = true);
  Object.keys(MARKET_SIGNAL_INDICATORS).forEach(key => indicators[key] = true);
  return { groups, indicators };
}

function loadMarketSignalVisibility() {
  const defaults = getDefaultMarketSignalVisibility();
  try {
    const saved = JSON.parse(localStorage.getItem(MARKET_SIGNAL_VISIBILITY_KEY) || '{}');
    return {
      groups: { ...defaults.groups, ...(saved.groups || {}) },
      indicators: { ...defaults.indicators, ...(saved.indicators || {}) }
    };
  } catch (e) {
    return defaults;
  }
}

function saveMarketSignalVisibility(visibility) {
  localStorage.setItem(MARKET_SIGNAL_VISIBILITY_KEY, JSON.stringify(visibility));
}

function isMarketSignalElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && !el.hidden;
}

function syncMarketSignalSettingsUI() {
  const visibility = loadMarketSignalVisibility();

  Object.entries(MARKET_SIGNAL_GROUPS).forEach(([groupKey, group]) => {
    const groupCheckbox = document.getElementById(group.checkboxId);
    if (!groupCheckbox) return;

    const groupVisible = visibility.groups[groupKey] !== false;
    const visibleCount = group.indicators.filter(indKey => visibility.indicators[indKey] !== false).length;

    groupCheckbox.checked = groupVisible;
    groupCheckbox.indeterminate = groupVisible && visibleCount > 0 && visibleCount < group.indicators.length;

    group.indicators.forEach(indKey => {
      const meta = MARKET_SIGNAL_INDICATORS[indKey];
      const indicatorCheckbox = meta ? document.getElementById(meta.checkboxId) : null;
      if (!indicatorCheckbox) return;
      indicatorCheckbox.checked = visibility.indicators[indKey] !== false;
      indicatorCheckbox.disabled = !groupVisible;
      const row = indicatorCheckbox.closest('.signal-check');
      if (row) row.classList.toggle('is-disabled', !groupVisible);
    });
  });
}

function applyMarketSignalVisibility() {
  const visibility = loadMarketSignalVisibility();
  const bar = document.getElementById('marketSignalBar');
  if (!bar) return;

  Object.entries(MARKET_SIGNAL_INDICATORS).forEach(([indicatorKey, meta]) => {
    const card = document.getElementById(meta.cardId);
    if (!card) return;
    card.style.display = visibility.indicators[indicatorKey] === false ? 'none' : '';
  });

  Object.entries(MARKET_SIGNAL_GROUPS).forEach(([groupKey, group]) => {
    const groupEl = bar.querySelector(group.selector);
    if (!groupEl) return;

    const groupVisible = visibility.groups[groupKey] !== false;
    const hasVisibleIndicator = group.indicators.some(indKey => visibility.indicators[indKey] !== false);
    groupEl.style.display = groupVisible && hasVisibleIndicator ? '' : 'none';
  });

  syncMarketSignalSettingsUI();
  requestAnimationFrame(updateMarketSignalCompactLayout);
}

function toggleSignalGroupVisibility(groupKey, checked) {
  const visibility = loadMarketSignalVisibility();
  if (!visibility.groups) visibility.groups = {};
  visibility.groups[groupKey] = !!checked;
  saveMarketSignalVisibility(visibility);
  applyMarketSignalVisibility();
}

function toggleSignalIndicatorVisibility(indicatorKey, checked) {
  const visibility = loadMarketSignalVisibility();
  if (!visibility.indicators) visibility.indicators = {};
  visibility.indicators[indicatorKey] = !!checked;
  saveMarketSignalVisibility(visibility);
  applyMarketSignalVisibility();
}

function resetMarketSignalVisibility() {
  saveMarketSignalVisibility(getDefaultMarketSignalVisibility());
  applyMarketSignalVisibility();
}

function getVisibleMarketSignalGroups() {
  const bar = document.getElementById('marketSignalBar');
  if (!bar) return [];

  return [...bar.querySelectorAll('.ms-group')].filter(group => {
    if (!isMarketSignalElementVisible(group)) return false;
    return [...group.querySelectorAll('.ms-indicator-card')].some(card => isMarketSignalElementVisible(card));
  });
}

function updateMarketSignalCompactLayout() {
  const bar = document.getElementById('marketSignalBar');
  if (!bar) return;

  const shell = bar.querySelector('.market-signal-shell');
  if (!shell || !isMarketSignalElementVisible(bar)) {
    bar.classList.remove('ms-compact');
    return;
  }

  const visibleGroups = getVisibleMarketSignalGroups();
  const visibleCardCount = visibleGroups.reduce((sum, group) => {
    return sum + [...group.querySelectorAll('.ms-indicator-card')].filter(card => isMarketSignalElementVisible(card)).length;
  }, 0);

  const shellWidth = shell.clientWidth || bar.clientWidth || window.innerWidth;

  // 날짜+종합신호 1줄 영역(약 300px) + 그룹 예상 폭을 비교해서 충분할 때만 컴팩트 적용
  const overviewWidth = 300;
  const groupsRequiredWidth = visibleGroups.reduce((sum, group) => {
    const cardCount = [...group.querySelectorAll('.ms-indicator-card')].filter(card => isMarketSignalElementVisible(card)).length;
    return sum + Math.max(220, Math.min(cardCount, 5) * 96 + 32);
  }, 0);
  const gapWidth = Math.max(0, visibleGroups.length) * 10;
  const requiredWidth = overviewWidth + groupsRequiredWidth + gapWidth;

  const shouldCompact =
    visibleGroups.length > 0 &&
    visibleGroups.length <= 4 &&
    visibleCardCount <= 9 &&
    shellWidth >= requiredWidth;

  bar.classList.toggle('ms-compact', shouldCompact);
}

function bindMarketSignalLayoutWatchers() {
  const bar = document.getElementById('marketSignalBar');
  if (!bar) return;

  const scheduleUpdate = () => requestAnimationFrame(updateMarketSignalCompactLayout);

  window.addEventListener('resize', scheduleUpdate);

  const mutationObserver = new MutationObserver(scheduleUpdate);
  mutationObserver.observe(bar, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'class', 'hidden']
  });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(bar);
  }

  applyMarketSignalVisibility();
  scheduleUpdate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindMarketSignalLayoutWatchers);
} else {
  bindMarketSignalLayoutWatchers();
}
