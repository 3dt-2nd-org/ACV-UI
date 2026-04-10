let forceStopListener = null;
let lastProcessedId = null;

function initACV() {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get("v");

    // 영상 시청 페이지가 아니거나 ID가 없으면 초기화
    if (!window.location.href.includes("watch") || !videoId) {
        removeExistingUI();
        lastProcessedId = null;
        return;
    }

    // 이미 배지가 렌더링된 동일 영상이면 중단
    if (videoId === lastProcessedId && document.getElementById("acv-badge")) return;

    lastProcessedId = videoId;
    removeExistingUI();

    // 1. Background.js 로 API 연결 요청
    chrome.runtime.sendMessage({ action: "START_ANALYSIS", videoId: videoId });
}

// 2. Background.js 로부터 전달받은 분석 결과 처리
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "SSE_DATA" && msg.payload) {
        const payload = msg.payload;
        
        // 서버에서 전달하는 event 타입 확인
        if (payload.event === "complete") {
            // main.py 로직상 payload.data 는 직렬화된 JSON 문자열이므로 한 번 더 파싱
            const analysisData = JSON.parse(payload.data);
            
            // 기존 UI 규격에 맞게 데이터 매핑
            const uiData = {
                score: analysisData.score,
                // 백엔드 status 값에 따른 UI 분기 처리
                status: analysisData.score >= 50 ? "SAFE" : "DANGER", 
                reasons: [
                    { h: "분석 요약", p: analysisData.details || "세부 리포트 정보가 없습니다." }
                ]
            };

            renderBadge(uiData);
            if (uiData.status === "DANGER") applyDangerUI(uiData);
        } else if (payload.event === "error") {
            const errorData = JSON.parse(payload.data);
            console.error("서버 파이프라인 에러:", errorData.error);
        }
    }
});

// --- 이하 UI 렌더링 및 제어 로직 (기존 코드 유지) ---

function applyDangerUI(data) {
    const playerContainer = document.querySelector("#movie_player");
    const video = document.querySelector("#movie_player video");
    if (!video || document.getElementById("acv-warning-overlay")) return;

    video.classList.add("acv-blur");
    video.muted = true;

    forceStopListener = (e) => {
        const isAd = playerContainer.classList.contains("ad-showing") || playerContainer.classList.contains("ad-interrupting");
        if (isAd || video.classList.contains("acv-blur")) {
            video.pause(); video.playbackRate = 0; video.muted = true; video.currentTime = 0;
            e?.stopImmediatePropagation();
        }
    };

    const events = ['play', 'playing', 'timeupdate'];
    events.forEach(evt => video.addEventListener(evt, forceStopListener, true));

    const overlay = document.createElement("div");
    overlay.id = "acv-warning-overlay";
    overlay.innerHTML = `
        <div class="acv-card">
            <div class="acv-title">⚠️ 신뢰도가 낮은 영상입니다</div>
            <p class="acv-score-text">신뢰도 점수: <span style="color:#F04452; font-weight:800;">${data.score}점</span></p>
            <div class="acv-btn-group">
                <div class="acv-btn-row">
                    <button class="acv-btn-primary" id="acv-go-home">유튜브 홈으로</button>
                    <button class="acv-btn-secondary" id="acv-continue">계속 시청 (주의)</button>
                </div>
                <button class="acv-btn-report" id="acv-toggle-btn">신뢰도 점수 이유 확인하기</button>
                <div id="acv-report-content" class="acv-report-area" style="display:none;">
                    ${data.reasons.map(r => `<div class="report-item"><h4>${r.h}</h4><p>${r.p}</p></div>`).join('')}
                </div>
            </div>
        </div>
    `;
    playerContainer.appendChild(overlay);

    document.getElementById("acv-toggle-btn").onclick = () => {
        const content = document.getElementById("acv-report-content");
        content.style.display = content.style.display === "none" ? "block" : "none";
    };
    document.getElementById("acv-go-home").onclick = () => location.href = "https://www.youtube.com";
    document.getElementById("acv-continue").onclick = () => cleanupBlocker(video);
}

function toggleSafePanel(data) {
    let panel = document.getElementById("acv-safe-panel");
    if (panel) {
        panel.style.display = panel.style.display === "none" ? "flex" : "none";
        return;
    }

    panel = document.createElement("div");
    panel.id = "acv-safe-panel";
    panel.innerHTML = `
        <div class="acv-safe-title">🟢 이 영상은 안전합니다</div>
        <p style="color:#6B7684; font-size:14px; margin-bottom:20px;">Azure Critical Validator 검증 결과<br>신뢰도 점수 <b>${data.score}점</b>을 획득했습니다.</p>
        <div class="acv-btn-group">
            <button class="acv-btn-secondary" id="acv-safe-report-btn">신뢰도 점수 자세히 보기</button>
            <div id="acv-safe-report-content" class="acv-report-area" style="display:none;">
                ${data.reasons.map(r => `<div class="report-item"><h4>${r.h}</h4><p>${r.p}</p></div>`).join('')}
            </div>
            <button class="acv-btn-primary" style="margin-top:10px;" id="acv-close-panel">닫기</button>
        </div>
    `;
    document.body.appendChild(panel);
    panel.style.display = "flex";

    document.getElementById("acv-safe-report-btn").onclick = () => {
        const content = document.getElementById("acv-safe-report-content");
        content.style.display = content.style.display === "none" ? "block" : "none";
    };
    document.getElementById("acv-close-panel").onclick = () => panel.style.display = "none";
}

function renderBadge(data) {
    if (document.getElementById("acv-badge")) return;
    const badge = document.createElement("div");
    badge.id = "acv-badge";
    badge.className = data.status === "DANGER" ? "badge-danger" : "badge-safe";
    badge.innerText = `${data.status === "DANGER" ? "🔴 의심" : "🟢 신뢰"} | ${data.score}점`;
    
    badge.onclick = () => {
        if (data.status === "DANGER") applyDangerUI(data);
        else toggleSafePanel(data);
    };
    document.body.appendChild(badge);
}

function cleanupBlocker(video) {
    const events = ['play', 'playing', 'timeupdate'];
    if (forceStopListener) events.forEach(evt => video.removeEventListener(evt, forceStopListener, true));
    video.playbackRate = 1; video.classList.remove("acv-blur"); video.muted = false;
    document.getElementById("acv-warning-overlay")?.remove();
}

function removeExistingUI() {
    const video = document.querySelector("#movie_player video");
    if (video) cleanupBlocker(video);
    document.getElementById("acv-badge")?.remove();
    document.getElementById("acv-safe-panel")?.remove();
}

// 유튜브 페이지 전환 감지 (SPA 특성 대응)
window.addEventListener('yt-navigate-finish', initACV);
setInterval(() => {
    const currentVideoId = new URLSearchParams(window.location.search).get("v");
    if (window.location.href.includes("watch") && (currentVideoId !== lastProcessedId || !document.getElementById("acv-badge"))) {
        initACV();
    }
}, 1000);