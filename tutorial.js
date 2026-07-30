/**
 * ============================================================================
 * 🎓 대시보드 튜토리얼 시스템 (tutorial.js)
 * 화면 스크롤 자동 추적, 반응형 리사이징, 스마트 툴팁 포지셔닝 기능 포함
 * ============================================================================
 */

const TutorialSystem = (function() {
    // 튜토리얼 진행 상태
    let currentStep = 0;
    let isActive = false;
    let resizeTimer = null;

    // 튜토리얼 스텝 정의 (선택자, 제목, 내용, 툴팁 방향)
    const steps = [
        {
            target: '.view-tabs',
            title: '화면 전환하기',
            content: '대시보드, 배당금, 매매기록 등 원하는 뷰로 빠르게 전환할 수 있습니다.',
            position: 'bottom',
            icon: '🧭'
        },
        {
            target: '.ledger-sidebar',
            title: '매매 장부 (사이드바)',
            content: '새로운 거래를 등록하거나 기존 매매 내역을 관리하는 공간입니다.',
            position: 'right',
            icon: '📝'
        },
        {
            target: '.tx-form',
            title: '거래 입력하기',
            content: '매수, 매도, 배당 등 거래 내역을 입력하고 소유자를 지정할 수 있습니다.',
            position: 'right',
            icon: '✏️'
        },
        {
            target: '.cp-accounts',
            title: '내 계좌 요약',
            content: '계좌별 자산 비중과 수익률을 파이 차트와 함께 직관적으로 확인하세요.',
            position: 'left',
            icon: '💼'
        },
        {
            target: '.grid-container',
            title: '보유 종목 카드',
            content: '현재 보유 중이거나 관심 있는 종목들의 실시간 가격과 등락률을 한눈에 봅니다.',
            position: 'top',
            icon: '📈'
        },
        {
            target: '.nav-right-controls',
            title: '기간 설정 및 테마',
            content: '조회 기간을 변경하거나 다크/라이트 모드를 전환하고 설정을 관리할 수 있습니다.',
            position: 'bottom',
            icon: '⚙️'
        }
    ];

    // DOM 요소 참조용 변수
    let elements = {};

    /**
     * 1. 튜토리얼용 HTML 요소를 동적으로 생성 (기존에 없으면)
     */
    function initDOM() {
        if (document.querySelector('.tutorial-backdrop')) return; // 이미 존재하면 패스

        const html = `
            <!-- 환영 모달 -->
            <div class="tutorial-welcome-overlay">
                <div class="tutorial-welcome-modal">
                    <span class="tutorial-welcome-logo">🚀</span>
                    <h2>포트폴리오 관리를 시작해볼까요?</h2>
                    <p>자산 성장 추이와 매매 기록을 <span class="highlight-text">가장 직관적으로</span> 관리하는 방법을 1분 만에 알아보세요.</p>
                    <div class="tutorial-feature-grid">
                        <div class="tutorial-feature-item"><span class="feat-icon">📊</span>스마트한 자산 추적</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">📝</span>손쉬운 거래 장부</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">💸</span>배당금 자동 계산</div>
                        <div class="tutorial-feature-item"><span class="feat-icon">🌙</span>세련된 다크 모드</div>
                    </div>
                    <div class="tutorial-welcome-actions">
                        <button class="btn-tutorial-start">튜토리얼 시작하기</button>
                        <button class="btn-tutorial-skip">건너뛰기</button>
                    </div>
                </div>
            </div>

            <!-- 하이라이트 레이어 (배경, 커튼, 링) -->
            <div class="tutorial-backdrop"></div>
            <div class="tutorial-curtain tutorial-curtain-top"></div>
            <div class="tutorial-curtain tutorial-curtain-bottom"></div>
            <div class="tutorial-curtain tutorial-curtain-left"></div>
            <div class="tutorial-curtain tutorial-curtain-right"></div>
            <div class="tutorial-highlight-ring"></div>

            <!-- 말풍선 툴팁 -->
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

            <!-- 완료 토스트 -->
            <div class="tutorial-done-toast">🎉 튜토리얼을 완료했습니다! 이제 자유롭게 탐험해보세요.</div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // 요소 참조 연결
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

        // 이벤트 바인딩
        elements.startBtn.addEventListener('click', startTutorial);
        elements.skipBtn.addEventListener('click', endTutorial);
        elements.closeX.addEventListener('click', endTutorial);
        elements.prevBtn.addEventListener('click', prevStep);
        elements.nextBtn.addEventListener('click', nextStep);
        window.addEventListener('resize', handleResize);
        
        // 다시 보기 버튼 연동 (설정 메뉴 등에 있는 버튼용)
        document.querySelectorAll('.btn-restart-tutorial').forEach(btn => {
            btn.addEventListener('click', showWelcomeModal);
        });
    }

    /**
     * 2. 환영 모달 띄우기
     */
    function showWelcomeModal() {
        if (!elements.welcomeOverlay) initDOM();
        elements.welcomeOverlay.classList.add('open');
    }

    /**
     * 3. 튜토리얼 본격 시작
     */
    function startTutorial() {
        elements.welcomeOverlay.classList.remove('open');
        currentStep = 0;
        isActive = true;
        document.body.style.overflow = 'hidden'; // 튜토리얼 중 스크롤 방지
        renderStep();
    }

    /**
     * 4. 스텝 렌더링 (핵심 로직)
     */
    function renderStep() {
        if (!isActive) return;

        const step = steps[currentStep];
        const targetEl = document.querySelector(step.target);

        if (!targetEl) {
            console.warn(`튜토리얼 타겟을 찾을 수 없습니다: ${step.target}`);
            nextStep(); // 요소를 못 찾으면 다음 스텝으로 자동 스킵
            return;
        }

        // 요소가 화면에 보이도록 부드럽게 스크롤
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 스크롤이 끝날 때까지 약간 대기 후 위치 계산 (매우 중요)
        setTimeout(() => {
            highlightElement(targetEl);
            updateTooltip(step, targetEl);
        }, 300);
    }

    /**
     * 5. 강조 영역(링 + 4방향 커튼) 정확하게 위치 지정
     */
    function highlightElement(el) {
        const rect = el.getBoundingClientRect();
        const padding = 10; // 강조 영역 여백

        const top = rect.top - padding;
        const left = rect.left - padding;
        const width = rect.width + (padding * 2);
        const height = rect.height + (padding * 2);

        elements.backdrop.classList.add('active');

        // 링 위치 지정
        Object.assign(elements.ring.style, {
            display: 'block',
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            height: `${height}px`
        });

        // 4방향 커튼 위치 지정 (클립 패스 대신 4개의 div로 뚫는 효과)
        const w = window.innerWidth;
        const h = window.innerHeight;

        Object.assign(elements.curtains.top.style, { top: 0, left: 0, width: '100%', height: `${Math.max(0, top)}px` });
        Object.assign(elements.curtains.bottom.style, { top: `${top + height}px`, left: 0, width: '100%', height: `${Math.max(0, h - (top + height))}px` });
        Object.assign(elements.curtains.left.style, { top: `${top}px`, left: 0, width: `${Math.max(0, left)}px`, height: `${height}px` });
        Object.assign(elements.curtains.right.style, { top: `${top}px`, left: `${left + width}px`, width: `${Math.max(0, w - (left + width))}px`, height: `${height}px` });
    }

    /**
     * 6. 툴팁 내용 업데이트 및 스마트 포지셔닝
     */
    function updateTooltip(step, targetEl) {
        elements.tooltip.style.display = 'block';
        
        // 텍스트 업데이트
        elements.tooltip.querySelector('.step-current').innerText = currentStep + 1;
        elements.tooltip.querySelector('.step-total').innerText = steps.length;
        elements.tooltip.querySelector('.tutorial-tooltip-icon').innerText = step.icon;
        elements.tooltip.querySelector('.tooltip-title').innerText = step.title;
        elements.tooltip.querySelector('.tooltip-desc').innerHTML = step.content;

        // 버튼 상태 업데이트
        elements.prevBtn.disabled = currentStep === 0;
        elements.nextBtn.innerText = currentStep === steps.length - 1 ? '완료' : '다음';

        // 진행률 점(Dots) 업데이트
        elements.dotsContainer.innerHTML = steps.map((_, i) => 
            `<div class="tutorial-dot ${i === currentStep ? 'active' : (i < currentStep ? 'done' : '')}"></div>`
        ).join('');

        // 위치 계산
        const rect = targetEl.getBoundingClientRect();
        const tooltipRect = elements.tooltip.getBoundingClientRect();
        const padding = 15; // 타겟과 툴팁 사이 간격
        
        let tTop, tLeft;
        let arrowClass = 'arrow-top'; // 화살표 꼬리 방향

        // 기본 위치 설정
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

        // 🌟 스마트 충돌 방지 (화면 밖으로 나가는 것 방지)
        if (tLeft < 10) tLeft = 10;
        if (tLeft + tooltipRect.width > window.innerWidth - 10) tLeft = window.innerWidth - tooltipRect.width - 10;
        if (tTop < 10) tTop = 10;
        if (tTop + tooltipRect.height > window.innerHeight - 10) tTop = window.innerHeight - tooltipRect.height - 10;

        // 기존 화살표 클래스 제거 후 새 방향 추가
        elements.tooltip.className = `tutorial-tooltip ${arrowClass}`;
        
        // 최종 적용
        elements.tooltip.style.top = `${tTop}px`;
        elements.tooltip.style.left = `${tLeft}px`;
    }

    /**
     * 7. 네비게이션 제어
     */
    function nextStep() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
        } else {
            endTutorial(true); // 끝까지 완료함
        }
    }

    function prevStep() {
        if (currentStep > 0) {
            currentStep--;
            renderStep();
        }
    }

    /**
     * 8. 튜토리얼 종료 처리
     */
    function endTutorial(isCompleted = false) {
        isActive = false;
        document.body.style.overflow = ''; // 스크롤 잠금 해제
        
        elements.welcomeOverlay.classList.remove('open');
        elements.backdrop.classList.remove('active');
        elements.ring.style.display = 'none';
        elements.tooltip.style.display = 'none';
        Object.values(elements.curtains).forEach(c => c.style.width = '0');

        // 완료 시 토스트 메시지
        if (isCompleted) {
            elements.doneToast.classList.add('show');
            setTimeout(() => elements.doneToast.classList.remove('show'), 3500);
            
            // 로컬 스토리지에 완료 기록 저장 (다음에 자동 실행 안 되게)
            localStorage.setItem('hasCompletedTutorial', 'true');
        }
    }

    /**
     * 9. 반응형 크기 조절 대응 (디바운싱 적용)
     */
    function handleResize() {
        if (!isActive) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderStep, 100);
    }

    // 외부로 노출할 API
    return {
        init: () => {
            initDOM();
            // 첫 접속자 자동 실행 로직 (로컬스토리지 확인)
            if (!localStorage.getItem('hasCompletedTutorial')) {
                setTimeout(showWelcomeModal, 500);
            }
        },
        start: showWelcomeModal,
        close: endTutorial
    };

})();

// 문서 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', TutorialSystem.init);
