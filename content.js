/* --- ACV (애사비) 서버 실시간 연동 코드 --- */

let forceStopListener = null;
let currentObserver = null;
let lastProcessedId = null;
let currentEventSource = null;

function initACV() {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get("v");

    // 설계도 Step 1: 유튜브 영상 접속 감지
    if (!window.location.href.includes("watch") || !videoId) {
        removeExistingUI();
        if (currentEventSource) currentEventSource.close();
        return;
    }

    if (videoId === lastProcessedId && document.getElementById("acv-badge")) return;

    lastProcessedId = videoId;
    removeExistingUI();
    if (currentEventSource) currentEventSource.close();

    // 분석 대기 중 상태 표시
    renderProcessingBadge();

    // 설계도 Step 2: SSE GET /api/stream/{video_id} 요청 시작
    connectToACVServer(videoId);
}

function connectToACVServer(videoId) {
    const serverUrl = `http://20.196.136.150:8000/api/stream/${videoId}`;
    currentEventSource = new EventSource(serverUrl);

    // [설계도 Step 15/16] 분석 완료 이벤트 수신 (event: complete)
    currentEventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data);
        console.log("✅ 분석 완료 데이터 수신:", data);
        
        document.getElementById("acv-badge")?.remove();
        
        // 백엔드 데이터(details)를 UI용 reasons 형식으로 변환
        const processedData = {
            ...data,
            // 백엔드의 status(Trustworthy 등)를 UI 판별용 DANGER/SAFE로 매핑
            status: data.score < 60 ? "DANGER" : "SAFE", 
            reasons: data.details ? [{h: "AI 분석 요약", p: data.details}] : [{h: "분석 완료", p: "신뢰도 검증이 완료되었습니다."}]
        };

        renderBadge(processedData);

        // 설계도 Step 13-B: 위험 판정 시 Block(차단) 실행
        if (processedData.status === "DANGER") {
            applyDangerUI(processedData);
        }
        
        currentEventSource.close();
    });

    // 서버 분석 중 신호 수신 (event: ping)
    currentEventSource.addEventListener('ping', (event) => {
        const badge = document.getElementById("acv-badge");
        if (badge) badge.innerText = "🔍 분석 중...";
    });

    // 서버 에러 발생 수신 (event: error)
    currentEventSource.addEventListener('error', (event) => {
        console.error("❌ 서버 에러 발생:", event);
        const badge = document.getElementById("acv-badge");
        if (badge) {
            badge.innerText = "⚠️ 분석 불가";
            badge.style.background = "#FF9500";
        }
        currentEventSource.close();
    });
}

// --- UI 렌더링 함수 (DANGER/SAFE 대응) ---

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
    ['play', 'playing', 'timeupdate'].forEach(evt => video.addEventListener(evt, forceStopListener, true));

    const overlay = document.createElement("div");
    overlay.id = "acv-warning-overlay";
    overlay.innerHTML = `
        <div class="acv-card">
            <div class="acv-title">⚠️ 신뢰도가 낮은 영상입니다</div>
            <p class="acv-score-text">신뢰도 점수: <span style="color:#F04452; font-weight:800;">${data.score}점</span></p>
            <div class="acv-btn-group">
                <div class="acv-btn-row">
                    <button class="acv-btn-primary" id="acv-go-home">홈으로 돌아가기</button>
                    <button class="acv-btn-secondary" id="acv-continue">계속 시청 (주의)</button>
                </div>
                <button class="acv-btn-report" id="acv-toggle-btn">분석 사유 확인하기</button>
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
    if (panel) { panel.style.display = panel.style.display === "none" ? "flex" : "none"; return; }

    panel = document.createElement("div");
    panel.id = "acv-safe-panel";
    panel.innerHTML = `
        <div class="acv-safe-title">🟢 이 영상은 안전합니다</div>
        <p style="color:#6B7684; font-size:14px; margin-bottom:20px;">AI 분석 결과 <b>${data.score}점</b>을 획득했습니다.</p>
        <div class="acv-btn-group">
            <button class="acv-btn-secondary" id="acv-safe-report-btn">분석 리포트 보기</button>
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

function renderProcessingBadge() {
    const badge = document.createElement("div");
    badge.id = "acv-badge";
    badge.style.background = "#4E5968";
    badge.style.color = "white";
    badge.innerText = "🔍 분석 대기 중...";
    document.body.appendChild(badge);
}

function cleanupBlocker(video) {
    if (forceStopListener) ['play', 'playing', 'timeupdate'].forEach(evt => video.removeEventListener(evt, forceStopListener, true));
    video.playbackRate = 1; video.classList.remove("acv-blur"); video.muted = false;
    document.getElementById("acv-warning-overlay")?.remove();
}

function removeExistingUI() {
    const video = document.querySelector("#movie_player video");
    if (video) cleanupBlocker(video);
    document.getElementById("acv-badge")?.remove();
    document.getElementById("acv-safe-panel")?.remove();
}

window.addEventListener('yt-navigate-finish', initACV);
setInterval(() => {
    const currentVideoId = new URLSearchParams(window.location.search).get("v");
    if (window.location.href.includes("watch") && (currentVideoId !== lastProcessedId || !document.getElementById("acv-badge"))) initACV();
}, 1000);