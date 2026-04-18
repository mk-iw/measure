let currentNo = 1;
let isHolding = false;
let config = { area_width_mm: 400 };
let points = {
    p1: {x: 400, y: 300, label: "口先"},
    p2: {x: 800, y: 400, label: "尾叉"},
    p3: {x: 1000, y: 300, label: "尾先"}
};
let activePoint = null;
let lastCapturedFrame = null; // ホールド時の静止画保持用

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('status-bar');

window.onload = async () => {
    const startNo = prompt("開始No.を入力(例: 001)", "001");
    currentNo = parseInt(startNo) || 1;
    updateNoDisplay();
    await startCamera();
    initSpeech();
    initDragEvents();
    requestAnimationFrame(mainLoop);
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
}

function updateNoDisplay() {
    document.getElementById('no-display').innerText = `No. ${String(currentNo).padStart(3, '0')}`;
}

function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript;
        if(cmd.match(/チェック|ホールド/)) toggleHold(true);
        if(cmd.match(/パス|ネクスト/) && isHolding) finalizeAndSave();
    };
    recognition.start();
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        // ホールドした瞬間のフレームを記録
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = canvas.width;
        lastCapturedFrame.height = canvas.height;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0);
        
        statusBar.innerText = "【固定】位置を微調整してください";
        statusBar.className = "mode-hold";
        document.getElementById('btn-hold').style.display = 'none';
        document.getElementById('btn-save').style.display = 'block';
        document.getElementById('btn-cancel').style.display = 'block';
    } else {
        lastCapturedFrame = null;
        statusBar.innerText = "【追従中】ホールド/チェック";
        statusBar.className = "mode-detect";
        document.getElementById('btn-hold').style.display = 'block';
        document.getElementById('btn-save').style.display = 'none';
        document.getElementById('btn-cancel').style.display = 'none';
    }
}

// 黒文字（白縁取り）描画関数
function drawStyledText(text, x, y, size = 40) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "left";
    ctx.strokeStyle = "white"; 
    ctx.lineWidth = 5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(text, x, y);
}

function mainLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 背景描画: ホールド中なら静止画、そうでなければビデオ
        if (isHolding && lastCapturedFrame) {
            ctx.drawImage(lastCapturedFrame, 0, 0);
        } else {
            ctx.drawImage(video, 0, 0);
            // ここで本来はArUco/AIが座標(points)をリアルタイム更新する
        }

        const res = calculateMetrics();
        
        // 補助線
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(points.p1.x, points.p1.y); ctx.lineTo(points.p2.x, points.p2.y); ctx.stroke();
        
        // ポイント描画
        Object.values(points).forEach(p => {
            ctx.fillStyle = "black";
            ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
            drawStyledText(p.label, p.x + 25, p.y - 25, 30);
        });

        // 計測値表示 (左下)
        drawStyledText(`尾叉長: ${res.fork}mm`, 50, canvas.height - 110, 50);
        drawStyledText(`全　長: ${res.total}mm`, 50, canvas.height - 40, 50);
        // No表示 (右上)
        drawStyledText(`No. ${String(currentNo).padStart(3, '0')}`, canvas.width - 240, 60, 45);
    }
    requestAnimationFrame(mainLoop);
}

function calculateMetrics() {
    const mmRatio = config.area_width_mm / 1000; 
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);
    return { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
}

function finalizeAndSave() {
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
    link.download = `${dateStr}_No${String(currentNo).padStart(3, '0')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    currentNo++;
    updateNoDisplay();
    toggleHold(false);
}

function initDragEvents() {
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return {
            x: (t.clientX - rect.left) * (canvas.width / rect.width),
            y: (t.clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 60);
    });

    canvas.addEventListener('touchmove', (e) => {
        if(activePoint) {
            const pos = getPos(e);
            activePoint.x = pos.x; activePoint.y = pos.y;
            e.preventDefault();
        }
    }, {passive: false});

    canvas.addEventListener('touchend', () => activePoint = null);
}