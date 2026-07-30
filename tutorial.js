/**
 * ============================================================================
 * 🎓 대시보드 튜토리얼 시스템 (tutorial.js) - 다중 페이지(탭) 지원 버전
 * ============================================================================
 */

const TutorialSystem = (function() {
    let currentStep = 0;
    let isActive = false;
    let resizeTimer = null;

    // 💡 [핵심] 페이지별 튜토리얼 스텝 정의
    // action: 튜토리얼 해당 스텝을 보여주기 전에 실행할 동작 (예: 탭 클릭)
    const steps = [
        // --- [1] 대시보드 페이지 ---
        {
            target: '.view-tabs',
            title: '1. 화면 전환하기',
            content: '대시보드, 매매 장부, 배당금 등 원하는 화면으로 이동하는 메인 탭입니다.',
            position: 'bottom',
            icon: '🧭',
            action: () => document.querySelector('.tab-dashboard')?.click() // 대시보드 탭으로 이동
        },
        {
            target: '.cp-accounts',
            title: '2. 내 자산 요약 (대시보드)',
            content: '계좌별 자산 비중과 전체 수익률을 파이 차트로 한눈에 확인하세요.',
            position: 'right',
            icon: '💼'
        },
        {
            target: '.grid-container',
            title: '3. 보유 종목 리스트',
            content: '현재 보유 중인 종목들의 실시간 가격과 등락률 카드가 표시됩니다.',
            position: 'top',
            icon: '📈'
        },

        // --- [2] 매매 장부 페이지 ---
        {
            target: '.tx-form',
            title: '4. 거래 입력하기 (매매 장부)',
            content: '매수, 매도 기록을 남겨보세요. 입력한 데이터는 포트폴리오에 즉시 반영됩니다.',
            position: 'right',
            icon: '✏️',
            action: () => document.querySelector('.tab-ledger')?.click() // 매매장부 탭으로 이동
        },
        {
            target: '.tx-history-list', // 매매내역 리스트 클래스명에 맞게 수정 필요
            title: '5. 매매 타임라인',
            content: '과거의 모든 거래 내역과 환전 기록을 시간순으로 조회하고 수정할 수 있습니다.',
            position: 'left',
            icon: '📜'
        },

        // --- [3] 배당금 페이지 ---
        {
            target: '.dividend-chart', // 배당금 차트 클래스명에 맞게 수정 필요
            title: '6. 월별 배당금 추이 (배당 뷰)',
            content: '매월 들어오는 배당금을 막대 차트로 확인하고 현금 흐름을 예측하세요.',
            position: 'bottom',
            icon: '💸',
            action: () => document.querySelector('.tab-dividend')?.click() // 배당금 탭으로 이동
        },

        // --- [4] 설정 및 마무리 ---
        {
            target: '.nav-right-controls',
            title: '7. 환경 설정',
            content: '다크 모드로 전환하거나, 보기 기간을 변경하고 포트폴리오 설정을 관리합니다.',
            position: 'bottom',
            icon: '⚙️'
        }
    ];

    let elements = {};

    function initDOM() {
        if (document.querySelector('.tutorial-backdrop')) return;

        const html = `
            <div class="tutorial-welcome-overlay">
                <div class="tutorial-welcome-modal">
                    <span class="tutorial-welcome-logo">🚀</span>
                    <h2>투더문(Two the Moon) 시작하기</h2>
                    <p>자산 성장 추이와 매매 기록을 <span class="highlight-text">가장 직관적으로</span> 관리하는 방법을 알아보세요.</p>
                    <div class="tutorial-feature-grid">
                        <div class="tutorial-feature-item"><span class="feat-icon">📊</span>대시보드 요약</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">📝</span>매매 장부 관리</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">💸</span>배당금 추적</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">🌙</span>다크 모드 지원</div>
                    </div>
                    <div class="tutorial-welcome-actions">
                        <button class="btn-tutorial-start">튜토리얼 시작</button>
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
                <div class="tutorial-tooltip-step">STEP <span class="step-current">1</span>/<span class="step-total">6</span></div>
                <span class="tutorial-tooltip-icon"></span>
                <h3 class="tooltip-title"></h3>
                <p class="tooltip-desc"></p>
                <div class="tutorial-nav">
                    <button class="btn-tutorial-prev">이전</button>
                    <div class="tutorial-progress-dots"></div>
                    <button class="btn-tutorial-next">다음</button>
                </div>
            </div>

            <div class="tutorial-done-toast">🎉 튜토리얼을 완료했습니다! 이제 자유롭게 탐험해보세요.</div>
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

    /**
     * 💡 스텝 렌더링 로직 (탭 전환 액션 추가)
     */
    function renderStep() {
        if (!isActive) return;

        const step = steps[currentStep];

        // 1. 해당 스텝에 정의된 액션(탭 이동 등)이 있다면 먼저 실행합니다.
        if (typeof step.action === 'function') {
            try {
                step.action();
            } catch (e) {
                console.warn('튜토리얼 액션 실행 중 오류 발생:', e);
            }
        }

        // 2. 탭이 전환되고 DOM이 다시 렌더링될 시간을 줍니다. (0.4초 대기)
        setTimeout(() => {
            const targetEl = document.querySelector(step.target);

            if (!targetEl) {
                console.warn(`튜토리얼 타겟을 찾을 수 없습니다: ${step.target}. 다음으로 넘어갑니다.`);
                nextStep(); 
                return;
            }

            // 요소가 화면 중앙에 오도록 부드럽게 스크롤
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 스크롤 완료 후 하이라이트 및 툴팁 렌더링
            setTimeout(() => {
                highlightElement(targetEl);
                updateTooltip(step, targetEl);
            }, 300);
            
        }, 400); // 탭 전환 애니메이션 시간에 맞춰 조절 가능
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

        // 화면 밖 이탈 방지
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

        // 💡 튜토리얼이 끝나면 다시 기본 '대시보드' 탭으로 돌려놓기 (옵션)
        document.querySelector('.tab-dashboard')?.click();

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
