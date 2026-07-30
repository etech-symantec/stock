/**
 * ============================================================================
 * 🎓 투더문(Two the Moon) 7대 핵심 페이지 통합 튜토리얼
 * ============================================================================
 */

const TutorialSystem = (function() {
    let currentStep = 0;
    let isActive = false;
    let resizeTimer = null;

    // 헬퍼 함수: 탭 버튼 클릭 처리 (data-tab 속성 또는 클래스 기반)
    const switchTab = (tabName) => {
        const tabBtn = document.querySelector(`[data-tab="${tabName}"]`) || document.querySelector(`.tab-${tabName}`);
        if (tabBtn) tabBtn.click();
    };

    // 🌟 7개 주요 페이지 순서별 튜토리얼 스텝 정의
    const steps = [
        // --------------------------------------------------------------------
        // 1. 전체보기 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-all-container, #view-all',
            title: '1. 전체보기 (Overview)',
            content: '모든 계좌와 종목을 한눈에 파악하는 종합 대시보드입니다. 총 자산 규모, 실시간 총 평가 손익, 자산 배분 비중을 한곳에서 확인하세요.',
            position: 'bottom',
            icon: '🌕',
            action: () => switchTab('all')
        },

        // --------------------------------------------------------------------
        // 2. 소유자 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-owner-container, #view-owner',
            title: '2. 소유자 페이지 (Owner)',
            content: '본인 및 가계 구성원별(예: 배우자, 가족) 자산을 분리하여 관리할 수 있습니다. 소유자별 자산 기여도와 개별 수익률을 명확하게 파악해 보세요.',
            position: 'bottom',
            icon: '👤',
            action: () => switchTab('owner')
        },

        // --------------------------------------------------------------------
        // 3. 관심종목 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-watchlist-container, #view-watchlist',
            title: '3. 관심종목 (Watchlist)',
            content: '현재 매수를 고려 중이거나 주가 추이를 지적 관찰하고 싶은 종목들을 모아두는 공간입니다. 목표가 설정과 실시간 가격 모니터링을 지원합니다.',
            position: 'bottom',
            icon: '⭐',
            action: () => switchTab('watchlist')
        },

        // --------------------------------------------------------------------
        // 4. 거래내역 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-transactions-container, #view-transactions',
            title: '4. 거래내역 (Transactions)',
            content: '매수, 매도, 환전 등 모든 투자 활동을 기록하는 장부입니다. 소유자 지정 및 계좌별 거래 입력을 통해 정확한 포트폴리오 데이터를 유지합니다.',
            position: 'bottom',
            icon: '📝',
            action: () => switchTab('transactions')
        },

        // --------------------------------------------------------------------
        // 5. 실현수익 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-realized-container, #view-realized',
            title: '5. 실현수익 (Realized Gains)',
            content: '매도가 완료되어 확정된 손익(누적 실현 손익)과 투자 승률을 분석합니다. 기간별 확정 수익과 매도 기록을 통해 투자 성과를 복기해보세요.',
            position: 'bottom',
            icon: '💰',
            action: () => switchTab('realized')
        },

        // --------------------------------------------------------------------
        // 6. 배당통계 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-dividend-container, #view-dividend',
            title: '6. 배당통계 (Dividend Stats)',
            content: '월별/연도별 수령 배당금을 시각적인 차트로 제공합니다. 배당 수익률과 월별 현금 흐름을 예측하여 안정한 제2의 월급을 설계해 보세요.',
            position: 'bottom',
            icon: '💸',
            action: () => switchTab('dividend')
        },

        // --------------------------------------------------------------------
        // 7. 달빛정보 페이지
        // --------------------------------------------------------------------
        {
            target: '.view-info-container, #view-info',
            title: '7. 달빛정보 (Moonlight Info)',
            content: '투더문 활용 팁, 주요 업데이트 소식, 포트폴리오 관리 노하우 등 유용한 정보와 가이드를 확인할 수 있는 지식 공간입니다.',
            position: 'bottom',
            icon: '🌙',
            action: () => switchTab('info')
        }
    ];

    let elements = {};

    function initDOM() {
        if (document.querySelector('.tutorial-backdrop')) return;

        const html = `
            <div class="tutorial-welcome-overlay">
                <div class="tutorial-welcome-modal">
                    <span class="tutorial-welcome-logo">🚀</span>
                    <h2>투더문(Two the Moon) 탐험하기</h2>
                    <p>자산 관리부터 배당 통계까지, <span class="highlight-text">7가지 핵심 기능</span>을 빠르게 둘러보세요.</p>
                    <div class="tutorial-feature-grid">
                        <div class="tutorial-feature-item"><span class="feat-icon">🌕</span>전체 자산 요약</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">👤</span>소유자별 분리</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">📝</span>거래/실현 손익</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">💸</span>배당 현금 흐름</div>
                    </div>
                    <div class="tutorial-welcome-actions">
                        <button class="btn-tutorial-start">투어 시작하기</button>
                        <button class="btn-tutorial-skip">건너뛰기</button>
                    </div>
                </div>
            </div>

            <div class="tutorial-backdrop"></div>
            <div class="tutorial-curtain tutorial-curtain-top"></div>
            <div class="tutorial-curtain tutorial-curtain-bottom"></div>
            <div class="tutorial-curtain tutorial-curtain-left"></div>
            <div class="tutorial-curtain tutorial-curtain-right"></div>
            <div class="tutorial-highlight-ring"></div>

            <div class="tutorial-tooltip" style="display: none;">
                <button class="btn-tutorial-close-x">✕</button>
                <div class="tutorial-tooltip-step">STEP <span class="step-current">1</span>/<span class="step-total">7</span></div>
                <span class="tutorial-tooltip-icon"></span>
                <h3 class="tooltip-title"></h3>
                <p class="tooltip-desc"></p>
                <div class="tutorial-nav">
                    <button class="btn-tutorial-prev">이전</button>
                    <div class="tutorial-progress-dots"></div>
                    <button class="btn-tutorial-next">다음</button>
                </div>
            </div>

            <div class="tutorial-done-toast">🎉 모든 기능 둘러보기가 완료되었습니다! 즐거운 투자 되세요.</div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        elements = {
            welcomeOverlay: document.querySelector('.tutorial-welcome-overlay'),
            startBtn: document.querySelector('.btn-tutorial-start'),
            skipBtn: document.querySelector('.btn-tutorial-skip'),
            backdrop: document.querySelector('.tutorial-backdrop'),
            curtains: {
                top: document.querySelector('.tutorial-curtain-top'),
                bottom: document.querySelector('.tutorial-curtain-bottom'),
                left: document.querySelector('.tutorial-curtain-left'),
                right: document.querySelector('.tutorial-curtain-right')
            },
            ring: document.querySelector('.tutorial-highlight-ring'),
            tooltip: document.querySelector('.tutorial-tooltip'),
            closeX: document.querySelector('.btn-tutorial-close-x'),
            prevBtn: document.querySelector('.btn-tutorial-prev'),
            nextBtn: document.querySelector('.btn-tutorial-next'),
            dotsContainer: document.querySelector('.tutorial-progress-dots'),
            doneToast: document.querySelector('.tutorial-done-toast')
        };

        elements.startBtn.addEventListener('click', startTutorial);
        elements.skipBtn.addEventListener('click', endTutorial);
        elements.closeX.addEventListener('click', endTutorial);
        elements.prevBtn.addEventListener('click', prevStep);
        elements.nextBtn.addEventListener('click', nextStep);
        window.addEventListener('resize', handleResize);

        document.querySelectorAll('.btn-restart-tutorial').forEach(btn => {
            btn.addEventListener('click', showWelcomeModal);
        });
    }

    function showWelcomeModal() {
        if (!elements.welcomeOverlay) initDOM();
        elements.welcomeOverlay.classList.add('open');
    }

    function startTutorial() {
        elements.welcomeOverlay.classList.remove('open');
        currentStep = 0;
        isActive = true;
        document.body.style.overflow = 'hidden';
        renderStep();
    }

    function renderStep() {
        if (!isActive) return;

        const step = steps[currentStep];

        // 1. 페이지 전환 클릭 실행
        if (typeof step.action === 'function') {
            try {
                step.action();
            } catch (e) {
                console.warn('탭 전환 처리 중 오류:', e);
            }
        }

        // 2. 탭 전환 애니메이션/렌더링 대기 후 렌더링
        setTimeout(() => {
            let targetEl = document.querySelector(step.target);

            // 해당 DOM을 찾지 못할 경우 탭 버튼 자체라도 하이라이트
            if (!targetEl) {
                targetEl = document.querySelector(`[data-tab="${step.action.toString().match(/'([^']+)'/)?.[1]}"]`) ||
                           document.querySelector('.view-tabs');
            }

            if (!targetEl) {
                nextStep();
                return;
            }

            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                highlightElement(targetEl);
                updateTooltip(step, targetEl);
            }, 250);

        }, 350);
    }

    function highlightElement(el) {
        const rect = el.getBoundingClientRect();
        const padding = 10;

        const top = rect.top - padding;
        const left = rect.left - padding;
        const width = rect.width + (padding * 2);
        const height = rect.height + (padding * 2);

        elements.backdrop.classList.add('active');

        Object.assign(elements.ring.style, {
            display: 'block', top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px`
        });

        const w = window.innerWidth, h = window.innerHeight;
        Object.assign(elements.curtains.top.style, { top: 0, left: 0, width: '100%', height: `${Math.max(0, top)}px` });
        Object.assign(elements.curtains.bottom.style, { top: `${top + height}px`, left: 0, width: '100%', height: `${Math.max(0, h - (top + height))}px` });
        Object.assign(elements.curtains.left.style, { top: `${top}px`, left: 0, width: `${Math.max(0, left)}px`, height: `${height}px` });
        Object.assign(elements.curtains.right.style, { top: `${top}px`, left: `${left + width}px`, width: `${Math.max(0, w - (left + width))}px`, height: `${height}px` });
    }

    function updateTooltip(step, targetEl) {
        elements.tooltip.style.display = 'block';

        elements.tooltip.querySelector('.step-current').innerText = currentStep + 1;
        elements.tooltip.querySelector('.step-total').innerText = steps.length;
        elements.tooltip.querySelector('.tutorial-tooltip-icon').innerText = step.icon;
        elements.tooltip.querySelector('.tooltip-title').innerText = step.title;
        elements.tooltip.querySelector('.tooltip-desc').innerHTML = step.content;

        elements.prevBtn.disabled = currentStep === 0;
        elements.nextBtn.innerText = currentStep === steps.length - 1 ? '시작하기' : '다음';

        elements.dotsContainer.innerHTML = steps.map((_, i) =>
            `<div class="tutorial-dot ${i === currentStep ? 'active' : (i < currentStep ? 'done' : '')}"></div>`
        ).join('');

        const rect = targetEl.getBoundingClientRect();
        const tooltipRect = elements.tooltip.getBoundingClientRect();
        const padding = 15;

        let tTop, tLeft, arrowClass = 'arrow-top';

        if (step.position === 'bottom') {
            tTop = rect.bottom + padding;
            tLeft = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            arrowClass = 'arrow-top';
        } else if (step.position === 'top') {
            tTop = rect.top - tooltipRect.height - padding;
            tLeft = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            arrowClass = 'arrow-bottom';
        } else if (step.position === 'right') {
            tTop = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            tLeft = rect.right + padding;
            arrowClass = 'arrow-left';
        } else if (step.position === 'left') {
            tTop = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
            tLeft = rect.left - tooltipRect.width - padding;
            arrowClass = 'arrow-right';
        }

        // 화면 영역 이탈 방지
        if (tLeft < 10) tLeft = 10;
        if (tLeft + tooltipRect.width > window.innerWidth - 10) tLeft = window.innerWidth - tooltipRect.width - 10;
        if (tTop < 10) tTop = 10;
        if (tTop + tooltipRect.height > window.innerHeight - 10) tTop = window.innerHeight - tooltipRect.height - 10;

        elements.tooltip.className = `tutorial-tooltip ${arrowClass}`;
        elements.tooltip.style.top = `${tTop}px`;
        elements.tooltip.style.left = `${tLeft}px`;
    }

    function nextStep() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
        } else {
            endTutorial(true);
        }
    }

    function prevStep() {
        if (currentStep > 0) {
            currentStep--;
            renderStep();
        }
    }

    function endTutorial(isCompleted = false) {
        isActive = false;
        document.body.style.overflow = '';

        elements.welcomeOverlay.classList.remove('open');
        elements.backdrop.classList.remove('active');
        elements.ring.style.display = 'none';
        elements.tooltip.style.display = 'none';
        Object.values(elements.curtains).forEach(c => c.style.width = '0');

        // 종료 시 기본 '전체보기' 탭으로 원상 복구
        switchTab('all');

        if (isCompleted) {
            elements.doneToast.classList.add('show');
            setTimeout(() => elements.doneToast.classList.remove('show'), 3500);
            localStorage.setItem('hasCompletedTutorial', 'true');
        }
    }

    function handleResize() {
        if (!isActive) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderStep, 100);
    }

    return {
        init: () => {
            initDOM();
            if (!localStorage.getItem('hasCompletedTutorial')) {
                setTimeout(showWelcomeModal, 500);
            }
        },
        start: showWelcomeModal,
        close: endTutorial
    };
})();

document.addEventListener('DOMContentLoaded', TutorialSystem.init);
