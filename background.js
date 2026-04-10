chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_ANALYSIS" && request.videoId) {
        connectSSE(request.videoId, sender.tab.id);
    }
});

async function connectSSE(videoId, tabId) {
    try {
        const response = await fetch(`http://20.196.136.150:8000/api/stream/${videoId}`, {
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
            }
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            lines.forEach(line => {
                if (line.startsWith('data: ')) {
                    try {
                        const dataStr = line.substring(6).trim();
                        if (dataStr) {
                            const parsedEvent = JSON.parse(dataStr);
                            // content.js로 파싱된 데이터 객체 전달
                            chrome.tabs.sendMessage(tabId, { action: "SSE_DATA", payload: parsedEvent });
                        }
                    } catch (e) {
                        console.error("SSE 파싱 에러:", e, "원본:", line);
                    }
                }
            });
        }
    } catch (error) {
        console.error("서버 연결 실패:", error);
    }
}