// ══════════════════════════════════════════════════════════════
// 📰 종목 상세 모달 - 최근 1주일 뉴스 (구글 뉴스) — Plus 프리미엄 전용
//   app.js의 openChartModal()에서 typeof renderNewsSection === 'function'
//   체크를 통해 호출되므로, 이 스크립트가 로드되지 않은 환경(비Plus)에서는
//   뉴스 섹션 없이 나머지 모달 기능이 그대로 동작합니다.
// ══════════════════════════════════════════════════════════════
function newsEscapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function newsEscapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function newsRelativeTime(pubDateStr) {
  const d = new Date(pubDateStr);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return '방금 전';
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 종목 코드로부터 표시용 종목명을 찾습니다 (거래내역 목록에서 쓰는 것과 동일한 규칙).
function resolveStockDisplayName(ticker) {
  const dbMatch = localStockDB && localStockDB.find(s => s.symbol === ticker);
  const cachedMatch = cachedMarketData[ticker];
  if (dbMatch) return dbMatch.name;
  if (cachedMatch && !cachedMatch._failed && cachedMatch.name) return cachedMatch.name;
  return ticker;
}

// 구글 뉴스는 이 앱이 이미 배포한 같은 도메인의 서버리스 함수 /api/news를 통해 가져옵니다
// (달빛정보 페이지와 동일한 방식). 브라우저에서 news.google.com을 직접 호출하면 CORS로 막히기 때문입니다.
async function fetchGoogleNewsRss(query) {
  const searchTerm = query + ' 주식';
  const res = await fetch(`/api/news?q=${encodeURIComponent(searchTerm)}`);
  if (!res.ok) throw new Error('구글 뉴스 응답 오류');
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) throw new Error('구글 뉴스 응답 형식 오류');

  // 최근 7일 이내에 발행된 기사만 남깁니다 (발행 시각을 알 수 없는 기사는 제외).
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const nowTs = Date.now();
  const items = data.items
    .map(it => ({
      title: it.title || '',
      link: it.link || '#',
      pubDate: it.pubDate || '',
      source: it.source || ''
    }))
    .filter(it => {
      const t = it.pubDate ? new Date(it.pubDate).getTime() : NaN;
      return !isNaN(t) && (nowTs - t) <= sevenDaysMs;
    })
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return items.slice(0, 6);
}

function newsSearchLinkCard(url, label) {
  return `<a href="${url}" target="_blank" rel="noopener" style="display:block; padding:10px 12px; background:var(--bg3); border:1px solid var(--border2); border-radius:8px; font-size:12px; color:var(--text); text-decoration:none;">${label} ↗</a>`;
}

function newsArticleCard(item) {
  const cleanTitle = item.source
    ? item.title.replace(new RegExp(' - ' + newsEscapeRegExp(item.source) + '$'), '')
    : item.title;
  const metaParts = [item.source, newsRelativeTime(item.pubDate)].filter(Boolean);
  return `
    <a href="${item.link}" target="_blank" rel="noopener"
       style="display:block; padding:8px 10px; background:var(--bg3); border:1px solid var(--border2); border-radius:8px; text-decoration:none; transition:border-color 0.15s;"
       onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border2)'">
      <div style="font-size:12px; font-weight:600; color:var(--text); line-height:1.4; margin-bottom:4px;">${newsEscapeHtml(cleanTitle)}</div>
      <div style="font-size:10px; color:var(--text3);">${newsEscapeHtml(metaParts.join(' · '))}</div>
    </a>`;
}

async function renderNewsSection(ticker) {
  const body = document.getElementById('mNewsBody');
  if (!body) return;

  const name = resolveStockDisplayName(ticker);
  const query = name || ticker;
  const googleFallbackUrl = `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

  body.innerHTML = `<div style="font-size:11px; color:var(--text3); padding:10px 0;">뉴스를 불러오는 중...</div>`;

  try {
    const items = await fetchGoogleNewsRss(query);
    if (currentModalTicker !== ticker) return; // 모달이 닫혔거나 다른 종목으로 바뀐 경우 무시
    const target = document.getElementById('mNewsBody');
    if (!target) return;
    if (!items || items.length === 0) {
      target.innerHTML = `<div style="font-size:11px; color:var(--text3); padding:10px 0;">최근 1주일간 관련 뉴스를 찾지 못했습니다.</div>`;
      return;
    }
    target.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">${items.map(newsArticleCard).join('')}</div>`;
  } catch (e) {
    if (currentModalTicker !== ticker) return;
    const target = document.getElementById('mNewsBody');
    if (!target) return;
    // 브라우저 환경에 따라 구글 뉴스 RSS 호출이 막히는 경우(CORS 등) 검색 링크로 대체합니다.
    target.innerHTML = newsSearchLinkCard(googleFallbackUrl, `뉴스를 불러오지 못했습니다. "${newsEscapeHtml(query)}" 검색 결과 보기`);
  }
}
