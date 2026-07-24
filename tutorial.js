// ============================================================
// 🎓 Two the Moon 튜토리얼 시스템 v2 — 페이지별 튜토리얼 포함
// ============================================================
(function() {
'use strict';

// ── 상수 & 상태 ────────────────────────────────────────────
const TUTORIAL_DONE_KEY = 'ttm_tutorial_done_v2';
const PAGE_DONE_PREFIX  = 'ttm_page_v2_';

let tutorialActive     = false;
let currentStep        = 0;
let pageTutorialActive = false;
let currentPageStep    = 0;
let currentPageSteps   = [];
let currentPageView    = '';

// ── DOM 헬퍼 ───────────────────────────────────────────────
function $(sel) { return document.querySelector(sel); }

// ── 메인 튜토리얼 스텝 ────────────────────────────────────
const STEPS = [
    {
        target: 'nav',
        arrow: 'top',
        icon: '🗺️',
        label: '01 — 네비게이션',
        title: '상단 메뉴로 화면을 전환하세요',
        body: '전체보기·소유자1·소유자2·관심종목·거래내역·실현수익·배당통계·달빛정보 탭을 클릭해 각 대시보드로 이동합니다. 각 화면에 첫 방문 시 해당 페이지 가이드가 자동으로 안내됩니다.',
        tip: '💡 기간 탭(1D·1W…전체)으로 조회 기간을 바꿀 수 있어요',
    },
    {
        target: '#sidebar',
        arrow: 'left',
        icon: '✏️',
        label: '02 — 거래 장부',
        title: '좌측 장부에서 거래를 기록하세요',
        body: '소유자, 거래 유형(매수/매도/배당/이동/분할), 종목, 수량, 단가를 입력하면 전체 포트폴리오에 즉시 반영됩니다. 계좌명을 입력하면 계좌별 수익률도 분리 확인할 수 있어요.',
        tip: '💡 \"이동\" 유형으로 같은 종목을 다른 계좌로 옮길 수 있고, \"분할\" 유형으로 액면분할을 기록할 수 있어요',
    },
    {
        target: '#marketSignalBar',
        arrow: 'top',
        icon: '📡',
        label: '03 — 시장 신호 분석',
        title: '실시간 시장 상황을 한눈에 파악하세요',
        body: 'VIX(공포지수)·MOVE·하이일드·공포&탐욕 등 심리/리스크 지표부터, 미국 10Y 금리·DXY·USD/KRW·신용잔고, Russell 2000·구리·BDI 등 경기 선행지표, 버핏지수·CAPE PE 밸류에이션까지 종합 분석합니다.',
        tip: '💡 종합 신호 점수가 낮을수록 리스크 경계 구간입니다',
    },
    {
        target: '#dashboardTopWrapper',
        arrow: 'top',
        icon: '📊',
        label: '04 — 통합 자산 패널',
        title: '내 전체 자산 현황을 한눈에 확인하세요',
        body: '국내·해외 주식의 투자 원금, 현재 평가액, 수익률을 실시간으로 집계합니다. \"현재 보유 / 누적 자산\" 버튼으로 실현수익까지 포함한 누적 자산을 볼 수 있어요.',
        tip: '💡 포트폴리오 맵에서 종목을 꾹 누르면 여러 종목을 선택해 합산 금액을 확인할 수 있어요',
    },
    {
        target: '#allocationTreemap',
        arrow: 'top',
        icon: '🗺️',
        label: '05 — 포트폴리오 맵',
        title: '비중 시각화 맵으로 포트폴리오를 분석하세요',
        body: '종목별 비중을 직사각형 크기로 시각화합니다. 클릭하면 종목 상세 차트가 열리고, 꾹 누르면 선택 모드로 진입해 국장/미장 일괄 선택 또는 태그별 선택으로 합산 금액을 즉시 확인할 수 있어요.',
        tip: '💡 태그 바 차트를 통해 섹터별 비중도 확인할 수 있어요',
    },
    {
        target: '#portfolioChartWrapper',
        arrow: 'bottom',
        icon: '📈',
        label: '06 — 자산 성장 추이',
        title: '투자 원금 대비 평가액 흐름을 추적하세요',
        body: '시간 흐름에 따른 총 투자액과 총 평가액을 영역 차트로 보여줍니다. 차트 위를 드래그하면 원하는 구간을 확대할 수 있고, 막대 그래프로 건별 실현수익도 표시됩니다.',
        tip: '💡 초록 막대 = 익절, 파랑 막대 = 손절로 매도 타이밍을 되돌아볼 수 있어요',
    },
    {
        target: '#aiAdviceFab',
        arrow: 'left',
        icon: '🤖',
        label: '07 — AI 투자조언',
        title: 'AI에게 내 포트폴리오에 대한 조언을 물어보세요',
        body: '우측 하단의 AI 투자조언 버튼을 누르면 현재 시장 신호와 내 보유 종목을 종합해 AI가 분석 의견을 제공합니다. 지난 조언은 기록으로 남아 언제든 다시 확인할 수 있어요.',
        tip: '⚠️ AI 조언은 투자 참고용이며, 최종 투자 판단과 책임은 본인에게 있어요',
    },
    {
        target: '.vtab[onclick*="history"]',
        arrow: 'top',
        icon: '📜',
        label: '08 — 거래 내역',
        title: '전체 거래 이력을 필터링해서 조회하세요',
        body: '국가·유형·계좌·기간·종목명으로 거래를 검색하고, 날짜 일괄수정 기능으로 잘못 입력된 날짜를 한 번에 수정할 수 있어요. CSV 파일로 기존 거래 내역을 일괄 업로드할 수도 있습니다.',
        tip: '💡 각 행의 소유자를 클릭해 바로 변경하거나, 체크박스로 선택 후 일괄 삭제할 수 있어요',
    },
    {
        target: '.vtab[onclick*="realized"]',
        arrow: 'top',
        icon: '💵',
        label: '09 — 실현수익',
        title: '매도를 통해 확정된 수익을 분석하세요',
        body: '누적 실현수익 차트, 종목별 수익금·수익률·단타왕 랭킹을 제공합니다. 해외주식 매도 시 양도소득세(22%)를 자동 계산해 신고 예정세액을 미리 확인할 수 있어요.',
        tip: '💡 랭킹 항목을 클릭하면 해당 종목의 거래 내역만 필터링됩니다',
    },
    {
        target: '.vtab[onclick*="dividend"]',
        arrow: 'top',
        icon: '🌿',
        label: '10 — 배당통계',
        title: '배당금 현황과 예정 배당을 추적하세요',
        body: '월별 배당 추이 차트와 종목별 배당금 목록을 제공합니다. 배당 주기를 자동 감지해 다음 예상 배당월과 예상 수령액을 미리 보여주는 \"예정 배당\" 기능이 있어요.',
        tip: '💡 배당 입력 시 \"세전 금액\" 체크하면 배당세(15.4%)가 자동 차감됩니다',
    },
    {
        target: '.vtab[onclick*="moonlight"]',
        arrow: 'top',
        icon: '🌕',
        label: '11 — 달빛정보',
        title: '통합 밸류에이션 대시보드를 확인하세요',
        body: '심리·리스크, 자금환경, 경기선행, 밸류에이션 4대 카테고리를 종합한 0~100점 시장 점수를 더 자세히 보여줍니다. 적극적·중립적·보수적 3가지 계산 모드를 선택하면 상단 시장 신호 점수에도 동일하게 반영돼요.',
        tip: '💡 점수가 낮을수록 저평가(매수 유리), 높을수록 고평가(비중축소 경고) 구간이에요',
    },
    {
        target: '.btn-sm[onclick*="openMasterSettings"]',
        arrow: 'top',
        icon: '☁️',
        label: '12 — 설정 & 백업',
        title: 'GitHub 백업과 화면 설정을 관리하세요',
        body: '⚙️ 설정은 3개 탭으로 구성돼요. \"데이터 관리\"에서 GitHub 클라우드 동기화·JSON/CSV 백업·초기화를, \"화면 설정\"에서 폰트 크기·수익/손실 색상을, \"지표 설정\"에서 시장 신호 카드에 표시할 지표를 그룹/개별로 선택할 수 있습니다.',
        tip: '💡 \"자동 동기화\"를 켜면 거래 추가·수정 시 GitHub에 자동으로 저장돼요',
    },
];

// ── 페이지별 튜토리얼 스텝 ─────────────────────────────────
const PAGE_STEPS = {
    all: [
        {
            target: '#marketSignalBar',
            arrow: 'top',
            icon: '📡',
            label: '전체보기 — 시장 신호',
            title: '실시간 매크로 지표를 분석합니다',
            body: 'VIX·공포&탐욕·하이일드 스프레드 등 심리/리스크, 금리·달러·환율 등 자금 환경, Russell 2000·구리·BDI 등 경기 선행지표, 버핏지수·CAPE PE 밸류에이션을 종합해 시장 신호 점수를 계산합니다.',
            tip: '💡 각 지표 카드 위에 마우스를 올리면 세부 설명을 볼 수 있어요',
        },
        {
            target: '#allocationTreemap',
            arrow: 'top',
            icon: '🗺️',
            label: '전체보기 — 포트폴리오 맵',
            title: '트리맵으로 종목 비중을 확인하세요',
            body: '클릭 → 종목 상세 차트 열기 / 꾹 누르기(롱프레스) → 선택 모드 진입. 선택 모드에서 국장/미장 일괄 선택 또는 태그별 선택으로 합산 평가금액을 즉시 계산합니다.',
            tip: '💡 하단 태그 바 차트로 섹터별 자산 비중을 확인할 수 있어요',
        },
        {
            target: '#localTagFilterContainer',
            arrow: 'top',
            icon: '🏷️',
            label: '전체보기 — 태그 필터',
            title: '태그로 종목을 그룹핑하고 필터링하세요',
            body: '종목 카드의 🏷️ 버튼으로 태그를 설정하면 (예: 2차전지, 배당용, 장기투자) 여기서 태그별로 필터링할 수 있어요. 여러 태그를 동시에 선택하면 OR 조건으로 필터링됩니다.',
            tip: '💡 태그는 포트폴리오 맵의 선택 모드에서도 활용할 수 있어요',
        },
        {
            target: '#aiAdviceFab',
            arrow: 'left',
            icon: '🤖',
            label: '전체보기 — AI 투자조언',
            title: '내 자산 현황을 바탕으로 AI 의견을 받아보세요',
            body: '우측 하단 버튼을 누르면 현재 시장 신호와 보유 포트폴리오를 함께 분석한 AI 투자조언을 받을 수 있어요. \"기록\" 버튼으로 이전에 받았던 조언들도 날짜별로 다시 볼 수 있습니다.',
            tip: '⚠️ AI 조언은 참고용이며, 투자 판단과 책임은 본인에게 있어요',
        },
    ],

    user1: [
        {
            target: '#dashboardTopWrapper',
            arrow: 'top',
            icon: '👤',
            label: '소유자1 — 개인 포트폴리오',
            title: '소유자1의 자산만 필터링해서 봅니다',
            body: '거래 장부에서 소유자1로 입력된 거래만 집계해 별도 대시보드로 보여줍니다. 국내/해외 투자액, 평가액, 수익률이 소유자1 기준으로 표시돼요.',
            tip: '💡 ⚙️ 설정 → 소유자 이름·아이콘·색상을 자유롭게 바꿀 수 있어요',
        },
        {
            target: '#listOptionsBar',
            arrow: 'top',
            icon: '🗂️',
            label: '소유자1 — 종목 보기 옵션',
            title: '카드/리스트 뷰와 정렬을 조절하세요',
            body: '카드형 보기와 리스트형 보기 중 선택하고, 등락률·평가금액·수익률 기준으로 정렬할 수 있습니다. ↕️/↔️ 버튼으로 국내/해외 섹션의 배치 방향도 바꿀 수 있어요.',
            tip: '💡 🔍 검색창으로 종목명이나 티커를 빠르게 찾을 수 있어요',
        },
    ],

    user2: [
        {
            target: '#dashboardTopWrapper',
            arrow: 'top',
            icon: '👥',
            label: '소유자2 — 개인 포트폴리오',
            title: '소유자2의 자산만 필터링해서 봅니다',
            body: '거래 장부에서 소유자2로 입력된 거래만 집계해 별도 대시보드로 보여줍니다. 국내/해외 투자액, 평가액, 수익률이 소유자2 기준으로 표시돼요.',
            tip: '💡 ⚙️ 설정 → 소유자 이름·아이콘·색상을 자유롭게 바꿀 수 있어요',
        },
        {
            target: '#listOptionsBar',
            arrow: 'top',
            icon: '🗂️',
            label: '소유자2 — 종목 보기 옵션',
            title: '카드/리스트 뷰와 정렬을 조절하세요',
            body: '카드형 보기와 리스트형 보기 중 선택하고, 등락률·평가금액·수익률 기준으로 정렬할 수 있습니다. ↕️/↔️ 버튼으로 국내/해외 섹션의 배치 방향도 바꿀 수 있어요.',
            tip: '💡 🔍 검색창으로 종목명이나 티커를 빠르게 찾을 수 있어요',
        },
    ],

    watch: [
        {
            target: '#watchlistSearchGroup',
            arrow: 'top',
            icon: '⭐',
            label: '관심종목 — 종목 추가',
            title: '관심 종목을 검색해서 추가하세요',
            body: '국내/미국 필터를 선택한 뒤 종목명이나 티커를 입력하면 자동 완성 목록이 나타납니다. 종목을 선택하고 추가 버튼을 누르면 실시간 시세 모니터링이 시작돼요.',
            tip: '💡 모바일에서는 상단 검색바를 이용해 관심종목을 추가할 수 있어요',
        },
        {
            target: '#listOptionsBar',
            arrow: 'top',
            icon: '🏷️',
            label: '관심종목 — 뷰 & 태그',
            title: '카드/리스트 뷰와 태그를 활용하세요',
            body: '카드형 보기에서는 미니 차트와 함께 시세를 확인하고, 리스트형 보기에서는 많은 종목을 한눈에 비교할 수 있어요. 각 종목에 태그를 달아 그룹별로 필터링할 수도 있습니다.',
            tip: '💡 종목 카드에서 ✕ 버튼을 누르면 관심종목에서 삭제됩니다',
        },
    ],

    history: [
        {
            target: '#historyControlsBox',
            arrow: 'top',
            icon: '🔍',
            label: '거래내역 — 필터',
            title: '다양한 조건으로 거래를 검색하세요',
            body: '기간·소유자·시장(국내/미국)·거래유형(매수/매도/배당)·계좌·종목명으로 복합 필터링할 수 있습니다. 활성화된 필터는 우측에 배지로 표시되고, 클릭하면 해당 필터만 바로 해제됩니다.',
            tip: '💡 📅 기간 선택 버튼으로 특정 날짜 범위만 조회할 수 있어요',
        },
        {
            target: '#historyRankingPanel',
            arrow: 'left',
            icon: '🏆',
            label: '거래내역 — 거래 랭킹',
            title: '종목별 거래 통계와 랭킹을 확인하세요',
            body: '좌측 패널에서 거래 횟수, 매수/매도 총액, 수익 기여도 등 종목별 거래 랭킹을 볼 수 있습니다. 항목을 클릭하면 우측 테이블이 해당 종목으로 바로 필터링돼요.',
            tip: '💡 체크박스로 여러 거래를 선택한 뒤 일괄 삭제도 가능해요',
        },
        {
            target: 'button[onclick*="openBulkDateModal"]',
            arrow: 'top',
            icon: '📅',
            label: '거래내역 — 날짜 일괄수정',
            title: '날짜를 한 번에 수정하거나 이동하세요',
            body: '필터된 거래 전체의 날짜를 일괄 처리합니다. 날짜 이동(N일 앞/뒤로 이동), 날짜 치환(특정 날짜를 다른 날짜로 교체), 날짜 설정(모두 같은 날짜로 통일) 세 가지 모드가 있어요.',
            tip: '💡 CSV 일괄 업로드 후 날짜를 한 번에 정리할 때 유용해요',
        },
    ],

    realized: [
        {
            target: '#realStatBanner',
            arrow: 'top',
            icon: '💵',
            label: '실현수익 — 수익 요약',
            title: '확정된 수익의 전체 흐름을 파악하세요',
            body: '국내·해외 실현수익을 환산해 합산하고, Sankey 다이어그램으로 수익 흐름을 시각화합니다. 국내/해외 비율 막대로 어느 시장에서 수익이 더 났는지 한눈에 비교할 수 있어요.',
            tip: '💡 필터를 적용하면 특정 기간·종목·계좌의 실현수익만 집계됩니다',
        },
        {
            target: '#capitalGainsTaxPanel',
            arrow: 'top',
            icon: '🧾',
            label: '실현수익 — 양도소득세',
            title: '해외주식 양도소득세를 자동으로 계산합니다',
            body: '해외주식 매도 시 발생하는 양도소득세(22%)를 자동 계산합니다. 기본 공제(250만원)를 적용한 실질 납부 예정세액이 표시되므로 연말 세금 신고를 미리 준비할 수 있어요.',
            tip: '💡 소유자 필터로 가족 구성원별 세금을 각각 확인할 수 있어요',
        },
        {
            target: '#realizedRankingPanel',
            arrow: 'left',
            icon: '🏆',
            label: '실현수익 — 종목 랭킹',
            title: '수익을 가장 많이 준 종목을 확인하세요',
            body: '종목별 실현 수익금, 수익률, 단타 횟수 랭킹을 제공합니다. 탭을 전환하며 수익금 순/수익률 순으로 정렬하고, 항목을 클릭하면 우측 테이블이 해당 종목으로 필터링됩니다.',
            tip: '💡 \"What if?\" 섹션으로 매도하지 않고 보유했을 때의 가상 수익도 볼 수 있어요',
        },
    ],

    dividend: [
        {
            target: '#divStatBanner',
            arrow: 'top',
            icon: '🌿',
            label: '배당통계 — 배당금 요약',
            title: '누적 배당금 현황을 한눈에 확인하세요',
            body: '국내·해외 배당금을 환산해 합산하고, 국내/해외 비율을 막대 그래프로 보여줍니다. 소유자·시장·계좌·기간 필터를 조합해 원하는 조건의 배당 내역만 분석할 수 있어요.',
            tip: '💡 배당금 입력 시 \"세전 금액\" 옵션으로 배당세(15.4%)를 자동 차감할 수 있어요',
        },
        {
            target: '#divStockList',
            arrow: 'right',
            icon: '🏆',
            label: '배당통계 — 효자 종목',
            title: '배당금을 가장 많이 준 종목을 확인하세요',
            body: '좌측 패널에서 배당금 합계, 배당률, 연환산 배당수익률 순으로 정렬해 종목별 배당 기여도를 분석합니다. 종목을 클릭하면 우측에 해당 종목의 배당 내역만 필터링돼요.',
            tip: '💡 1,000만원 투자 시 월 예상 세후 배당금도 자동으로 계산됩니다',
        },
        {
            target: '#upcomingDivTableBody',
            arrow: 'top',
            icon: '🔮',
            label: '배당통계 — 예정 배당',
            title: '다음에 받을 배당금을 미리 확인하세요',
            body: '보유 종목의 과거 배당 패턴을 분석해 다음 배당 예상월과 예상 수령 금액을 자동으로 계산합니다. 배당 주기(월·분기·반기·연)를 파악해 현금 흐름을 계획하는 데 도움이 됩니다.',
            tip: '💡 배당 주기와 예상월은 과거 배당 이력을 기반으로 추정한 값입니다',
        },
    ],

    moonlight: [
        {
            target: '#moonlightShadowHost',
            arrow: 'top',
            icon: '🌕',
            label: '달빛정보 — 통합 밸류에이션',
            title: '시장 전체의 저평가/고평가 상태를 진단하세요',
            body: '심리·리스크(VIX·공포&탐욕 등), 자금환경(금리·달러·신용잔고), 경기선행(Russell·구리·BDI), 밸류에이션(버핏지수·CAPE PE) 4대 카테고리를 종합해 0~100점의 시장 신호 점수를 계산합니다.',
            tip: '💡 0~30 적극 매수 · 30~50 분할 매수 · 50~70 관망 유지 · 70~100 비중 축소 구간이에요',
        },
        {
            target: '#moonlightShadowHost',
            arrow: 'top',
            icon: '🌗',
            label: '달빛정보 — 계산 모드',
            title: '적극적·중립적·보수적 모드 중 선택하세요',
            body: '지표별 가중치를 다르게 적용하는 3가지 계산 모드를 제공합니다. 여기서 모드를 바꾸면 전체보기 화면 상단의 \"시장 신호\" 종합 점수에도 동일한 모드가 함께 적용됩니다.',
            tip: '💡 선택한 모드는 자동으로 저장되어 다음 접속 시에도 유지돼요',
        },
    ],
};

// ── 환영 모달 주입 ─────────────────────────────────────────
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
          ${STEPS.length}단계 가이드로 핵심 기능을 바로 익혀보세요!
        </p>

        <div class="tutorial-feature-grid">
          <div class="tutorial-feature-item">
            <span class="feat-icon">📡</span>
            <span>실시간 <b>시장 신호</b><br>& 매크로 지표 분석</span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">🗺️</span>
            <span>트리맵 <b>포트폴리오 맵</b><br>& 태그 그룹핑</span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">💵</span>
            <span>실현수익 & <b>양도세 자동계산</b><br>배당통계 & 예정배당</span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">🤖</span>
            <span><b>AI 투자조언</b><br>& 🌕 달빛정보 밸류에이션</span>
          </div>
          <div class="tutorial-feature-item">
            <span class="feat-icon">☁️</span>
            <span>GitHub <b>클라우드 동기화</b><br>& 자동 백업</span>
          </div>
        </div>

        <div class="tutorial-welcome-actions">
          <button class="btn-tutorial-start" onclick="startTutorial()">
            🎓 전체 가이드 시작하기 (${STEPS.length}단계)
          </button>
          <button class="btn-tutorial-skip" onclick="skipTutorial()">
            건너뛰기 — 각 페이지 방문 시 자동 안내가 표시됩니다
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
}

// ── 튜토리얼 DOM 주입 ─────────────────────────────────────
function injectTutorialDOM() {
    if ($('#tutorialCurtain_top')) return;

    ['top','bottom','left','right'].forEach(dir => {
        const c = document.createElement('div');
        c.id = `tutorialCurtain_${dir}`;
        c.className = 'tutorial-curtain';
        c.style.display = 'none';
        c.onclick = () => tutorialActive ? closeTutorial() : closePageTutorial();
        document.body.appendChild(c);
    });

    const ring = document.createElement('div');
    ring.id = 'tutorialHighlightRing';
    ring.className = 'tutorial-highlight-ring';
    ring.style.display = 'none';
    document.body.appendChild(ring);

    const tt = document.createElement('div');
    tt.id = 'tutorialTooltip';
    tt.className = 'tutorial-tooltip';
    tt.style.display = 'none';
    document.body.appendChild(tt);

    const toast = document.createElement('div');
    toast.id = 'tutorialDoneToast';
    toast.className = 'tutorial-done-toast';
    toast.innerHTML = '🎉 튜토리얼 완료! 이제 Two the Moon을 마음껏 사용하세요';
    document.body.appendChild(toast);
}

// ── 스포트라이트 포지셔닝 ─────────────────────────────────
const PAD = 8;

function positionSpotlight(rect) {
    const { top: t, left: l, right: r, bottom: b, width: w, height: h } = rect;
    const vw = window.innerWidth, vh = window.innerHeight;

    function curtain(id, styles) {
        const el = $(`#tutorialCurtain_${id}`);
        if (el) Object.assign(el.style, { display: 'block', ...styles });
    }
    curtain('top',    { top:'0',           left:'0',          width:`${vw}px`,         height:`${t-PAD}px` });
    curtain('bottom', { top:`${b+PAD}px`,  left:'0',          width:`${vw}px`,         height:`${vh-(b+PAD)}px` });
    curtain('left',   { top:`${t-PAD}px`,  left:'0',          width:`${l-PAD}px`,      height:`${h+PAD*2}px` });
    curtain('right',  { top:`${t-PAD}px`,  left:`${r+PAD}px`, width:`${vw-(r+PAD)}px`, height:`${h+PAD*2}px` });

    const ring = $('#tutorialHighlightRing');
    if (ring) Object.assign(ring.style, {
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
    } else {
        left = (targetRect ? targetRect.left - TW - PAD - MARGIN : vw / 2 - TW / 2);
        top  = targetRect ? targetRect.top : vh / 2 - TH / 2;
    }

    left = Math.max(MARGIN, Math.min(left, vw - TW - MARGIN));
    top  = Math.max(MARGIN, Math.min(top,  vh - TH - MARGIN));

    tt.style.top  = `${top}px`;
    tt.style.left = `${left}px`;
}

// ── 메인 튜토리얼 스텝 렌더 ───────────────────────────────
function renderStep(idx) {
    const step = STEPS[idx];
    const total = STEPS.length;

    let targetEl = step.target ? $(step.target) : null;
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) targetEl = null;
    }

    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        positionSpotlight(rect);
        positionTooltip(rect, step.arrow);
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        hideCurtains();
        positionTooltip(null, 'top');
    }

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

// ── 페이지 튜토리얼 렌더 ──────────────────────────────────
function renderPageStep(idx) {
    const step = currentPageSteps[idx];
    const total = currentPageSteps.length;

    let targetEl = step.target ? $(step.target) : null;
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) targetEl = null;
    }

    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        positionSpotlight(rect);
        positionTooltip(rect, step.arrow);
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        hideCurtains();
        positionTooltip(null, 'top');
    }

    const dots = currentPageSteps.map((_, i) => {
        const cls = i === idx ? 'active' : (i < idx ? 'done' : '');
        return `<div class="tutorial-dot ${cls}" onclick="pageGoToStep(${i})" title="${i+1}단계"></div>`;
    }).join('');

    const tt = $('#tutorialTooltip');
    const isLast = idx === total - 1;
    tt.innerHTML = `
      <button class="btn-tutorial-close-x" onclick="closePageTutorial()" title="닫기">✕</button>
      <div class="tutorial-tooltip-step" style="background:rgba(0,200,122,0.1); border-color:rgba(0,200,122,0.3); color:var(--green);">${step.label}</div>
      <span class="tutorial-tooltip-icon">${step.icon}</span>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      ${step.tip ? `<div class="tip-tag">${step.tip}</div>` : ''}
      <div class="tutorial-nav">
        <button class="btn-tutorial-prev" onclick="pagePrevStep()" ${idx === 0 ? 'disabled' : ''}>← 이전</button>
        <div class="tutorial-progress-dots">${dots}</div>
        <button class="btn-tutorial-next" onclick="pageNextStep()">
          ${isLast ? '✅ 닫기' : '다음 →'}
        </button>
      </div>
      <div style="text-align:center; margin-top:8px;">
        <button onclick="dontShowPageTutorial()" style="background:none; border:none; font-size:10px; color:var(--text3); cursor:pointer; font-family:var(--font-sans);">다시 보지 않기</button>
      </div>
    `;
}

// ── 페이지 튜토리얼 트리거 ────────────────────────────────
function showPageTutorial(view) {
    if (tutorialActive) return;
    const steps = PAGE_STEPS[view];
    if (!steps || steps.length === 0) return;
    const key = PAGE_DONE_PREFIX + view;
    if (localStorage.getItem(key)) return;

    setTimeout(() => {
        injectTutorialDOM();
        currentPageSteps = steps;
        currentPageStep  = 0;
        currentPageView  = view;
        pageTutorialActive = true;

        const tt = $('#tutorialTooltip');
        if (tt) { tt.style.display = 'none'; tt.className = 'tutorial-tooltip'; }
        hideCurtains();

        renderPageStep(0);
    }, 700);
}

// ── 공개 API — 메인 튜토리얼 ─────────────────────────────
window.startTutorial = function() {
    closeWelcome();
    injectTutorialDOM();
    tutorialActive = true;
    pageTutorialActive = false;
    hideCurtains();
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
    const overlay = $('#tutorialWelcomeOverlay');
    if (overlay) overlay.classList.add('open');
};

// ── 공개 API — 페이지 튜토리얼 ───────────────────────────
window.pageNextStep = function() {
    if (!pageTutorialActive) return;
    if (currentPageStep >= currentPageSteps.length - 1) {
        closePageTutorial();
    } else {
        currentPageStep++;
        renderPageStep(currentPageStep);
    }
};

window.pagePrevStep = function() {
    if (!pageTutorialActive || currentPageStep <= 0) return;
    currentPageStep--;
    renderPageStep(currentPageStep);
};

window.pageGoToStep = function(idx) {
    if (!pageTutorialActive) return;
    currentPageStep = idx;
    renderPageStep(idx);
};

window.closePageTutorial = function() {
    pageTutorialActive = false;
    hideCurtains();
    const tt = $('#tutorialTooltip');
    if (tt) tt.style.display = 'none';
};

window.dontShowPageTutorial = function() {
    if (currentPageView) {
        localStorage.setItem(PAGE_DONE_PREFIX + currentPageView, '1');
    }
    window.closePageTutorial();
};

window.resetPageTutorials = function() {
    ['all','user1','user2','watch','history','realized','dividend','moonlight'].forEach(v => {
        localStorage.removeItem(PAGE_DONE_PREFIX + v);
    });
    alert('모든 페이지 가이드가 초기화됐습니다. 각 탭을 방문하면 다시 표시됩니다.');
};

// ── 내부 헬퍼 ─────────────────────────────────────────────
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
      <button class="btn-restart-tutorial" onclick="restartTutorial()" style="margin-bottom:8px;">
        <span>🔁</span> 전체 가이드 다시 보기
      </button>
      <button class="btn-restart-tutorial" onclick="resetPageTutorials(); closeModal('masterSettingsOverlay');">
        <span>📄</span> 페이지별 가이드 초기화
      </button>
    `;
    settingsModal.appendChild(sec);
    if (typeof updateLastSyncTimeDisplay === 'function') updateLastSyncTimeDisplay();
}

// ── setView 래핑: 페이지 튜토리얼 트리거 ─────────────────
function hookSetView() {
    const existing = typeof setView === 'function' ? setView : null;
    if (!existing) return;
    const _wrapped = setView;
    setView = function(view, el) {
        _wrapped(view, el);
        showPageTutorial(view);
    };
}

// ── 초기화 ────────────────────────────────────────────────
function initTutorial() {
    const done = localStorage.getItem(TUTORIAL_DONE_KEY);
    if (!done) {
        setTimeout(() => {
            injectWelcomeModal();
            const overlay = $('#tutorialWelcomeOverlay');
            if (overlay) overlay.classList.add('open');
        }, 900);
    } else {
        // 첫 방문이 아니어도 현재 페이지(전체보기)의 페이지 튜토리얼은 체크
        setTimeout(() => showPageTutorial('all'), 1200);
    }

    // 설정 모달 재시작 버튼 주입
    const settingsOverlay = document.getElementById('masterSettingsOverlay');
    if (settingsOverlay) {
        const obs = new MutationObserver(() => {
            if (settingsOverlay.classList.contains('open')) injectRestartButton();
        });
        obs.observe(settingsOverlay, { attributes: true, attributeFilter: ['class'] });
    }

    // setView 래핑 (딜레이로 다른 래퍼가 먼저 실행되도록)
    setTimeout(hookSetView, 50);

    // 리사이즈 시 스텝 위치 재계산
    window.addEventListener('resize', () => {
        if (tutorialActive) renderStep(currentStep);
        else if (pageTutorialActive) renderPageStep(currentPageStep);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTutorial);
} else {
    setTimeout(initTutorial, 0);
}

})(); // IIFE 끝
