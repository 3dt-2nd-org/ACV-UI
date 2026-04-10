// --- 이전 코드를 전부 지우고 이 내용으로 덮어씌우세요 ---

const DEMO_DATA = {
    "o6kN38CgBUM": { 
        title: "[예양육각수] 육각수의 발견", score: 10, status: "DANGER",
        reasons: [
            { h: "⚠️ 과학적 근거 부족", p: "주류 과학계에서 검증되지 않은 가설을 바탕으로 제작되었습니다." },
            { h: "🚩 확증 편향", p: "효능만을 일방적으로 강조하며 비판적 정보를 차단하고 있습니다." }
        ]
    },
    "SZfv30CFiKA": { 
        title: "오투스 눈운동기 후기", score: 10, status: "DANGER",
        reasons: [
            { h: "⚠️ 의료기기 미인증", p: "식약처 인증을 받지 않은 일반 공산품으로 과대광고 소지가 있습니다." }
        ]
    },
    "Jnpj3zQrOhs": { 
        title: "와디즈 사기 기업 참교육", score: 85, status: "SAFE",
        reasons: [
            { h: "✅ 팩트 기반 보도", p: "실제 공판 기록과 증거 자료를 바탕으로 신뢰도 높게 구성되었습니다." },
            { h: "🟢 공익적 목적", p: "소비자 보호를 위한 정보 제공 목적이 뚜렷합니다." }
        ]
    }
};

let forceStopListener = null;
let currentObserver = null;
let lastProcessedId = null;

function initACV() {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get("v");

    if (!window.location.href.includes("watch") || !videoId) {
        removeExistingUI();
        lastProcessedId = null;
        return;
    }

    if (videoId === lastProcessedId && document.getElementById("acv-badge")) return;

    lastProcessedId = videoId;
    removeExistingUI();

    if (DEMO_DATA[videoId]) {
        const data = DEMO_DATA[videoId];
        renderBadge(data);
        if (data.status === "DANGER") applyDangerUI(data);
    }
}

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

// ★수정: 안전 사이드 패널 - document.body에 붙여 배지와 정렬★
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
    document.body.appendChild(panel); // body에 추가하여 배지 밑에 고정
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

window.addEventListener('yt-navigate-finish', initACV);
setInterval(() => {
    const currentVideoId = new URLSearchParams(window.location.search).get("v");
    if (window.location.href.includes("watch") && (currentVideoId !== lastProcessedId || !document.getElementById("acv-badge"))) initACV();
}, 1000);