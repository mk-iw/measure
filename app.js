/**
 * Fish-Measure AR Pro: Final Version
 */

let currentNo = 1;
let isHolding = false;
let config = {};
let points = { p1: {x:300, y:300}, p2: {x:600, y:450}, p3: {x:750, y:300} };
let draggedPoint = null;
let orientation = 'landscape'; // 'landscape' or 'portrait'

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

// --- 1. 初期化 ---
window.onload = async () => {
    // 設定読み込み
    try {
        const response = await fetch('settings.json');
        config = await response.json();
    } catch (e) {
        config = { system: { target_area_width_mm: 400.0 } };
    }

    const inputNo = prompt("開始No.を入力(3桁)", "001");
    currentNo = parseInt(inputNo) || 1;
    updateNoDisplay();

    await startCamera();
    initSpeech();
    addManualButtons();
    requestAnimationFrame(mainLoop);
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
}

// --- 2. UI操作・音声・ボタン ---
function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.onresult = (event) => {
        const cmd = event.results[event.results.length - 1][0].transcript.trim();
        if (cmd.match(/チェック|ホールド/)) toggleHold(true);
        else if (cmd.match(/パス|ネクスト/)) { if (isHolding) finalizeAndSave(); }
    };
    recognition.start();
}

function addManualButtons() {
    const btnContainer = document.createElement('div');
    btnContainer.style = "position:absolute; bottom:20px; right:20px; display:flex; gap:10px; pointer-events:auto;";
    btnContainer.innerHTML = `
        <button onclick="toggleHold(true)" style="padding:15px; font-weight:bold;">ホールド</button>
        <button onclick="toggleHold(false)" style="padding:15px; background:red; color:white;">撮り直し</button>
        <button onclick="finalizeAndSave()" style="padding:15px; background:green; color:white;">保存(ネクスト)</button>
        <button onclick="rotateUI()" style="padding:15px; background:#555; color:white;">縦横切替</button>
    `;
    document.getElementById('container').appendChild(btnContainer);
}

function rotateUI() {
    orientation = (orientation === 'landscape') ? 'portrait' : 'landscape';
    alert(`UIを ${orientation} モードに切り替えました`);
}

function toggleHold(state) {
    isHolding = state;
    statusEl.innerText = state ? "【固定】ドラッグで微調整" : "【追従中】ホールド/チェック";
    statusEl.className = state ? "holding" : "";
}

function updateNoDisplay() {
    const el = document.getElementById('no-display');
    el.innerText = `No. ${String(currentNo).padStart(3, '0')}`;
    el.style.color = "black";
    el.style.background = "white";
}

// --- 3. 計測ロジック ---
function calculateResults() {
    const { p1, p2, p3 } = points;
    const forkLenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const ax = p2.x - p1.x, ay = p2.y - p1.y;
    const bx = p3.x - p1.x, by = p3.y - p1.y;
    const dot = ax * bx + ay * by;
    const magASq = ax * ax + ay * ay;
    const totalLenPx = dot / Math.sqrt(magASq);
    const mmRatio = config.system.target_area_width_mm / 1000; 

    return {
        forkLen: (forkLenPx * mmRatio).toFixed(1),
        totalLen: (totalLenPx * mmRatio).toFixed(1)
    };
}

// --- 4. 描画 & ループ ---
function mainLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0); // カメラ映像を背面に描画

        drawOverlay(ctx); // 計測内容を合成
    }
    requestAnimationFrame(mainLoop);
}

function drawOverlay(targetCtx) {
    const res = calculateResults();
    
    // 計測ライン
    targetCtx.strokeStyle = "yellow"; targetCtx.lineWidth = 8;
    targetCtx.beginPath(); targetCtx.moveTo(points.p1.x, points.p1.y); targetCtx.lineTo(points.p2.x, points.p2.y); targetCtx.stroke();
    
    // ポイント
    const labels = ["口先", "尾叉", "尾先"];
    [points.p1, points.p2, points.p3].forEach((p, i) => {
        targetCtx.fillStyle = "cyan";
        targetCtx.beginPath(); targetCtx.arc(p.x, p.y, 20, 0, Math.PI*2); targetCtx.fill();
        // 文字背景と黒文字
        targetCtx.fillStyle = "white";
        targetCtx.fillRect(p.x + 25, p.y - 45, 100, 40);
        targetCtx.fillStyle = "black";
        targetCtx.font = "bold 30px sans-serif";
        targetCtx.fillText(labels[i], p.x + 30, p.y - 15);
    });

    // 結果表示（黒文字）
    targetCtx.fillStyle = "rgba(255,255,255,0.8)";
    targetCtx.fillRect(50, canvas.height - 180, 500, 140);
    targetCtx.fillStyle = "black";
    targetCtx.font = "bold 50px sans-serif";
    targetCtx.fillText(`尾叉長: ${res.forkLen} mm`, 70, canvas.height - 110);
    targetCtx.fillText(`全　長: ${res.totalLen} mm`, 70, canvas.height - 50);
}

// --- 5. 保存 ---
function finalizeAndSave() {
    // 保存前にNo.を右上に黒文字で描画
    ctx.fillStyle = "white";
    ctx.fillRect(canvas.width - 250, 20, 220, 60);
    ctx.fillStyle = "black";
    ctx.font = "bold 50px sans-serif";
    ctx.fillText(`No. ${String(currentNo).padStart(3, '0')}`, canvas.width - 230, 65);

    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = `FISH_${String(currentNo).padStart(3, '0')}.png`;
    link.href = dataURL;
    link.click();

    currentNo++;
    updateNoDisplay();
    toggleHold(false);
}

// --- 6. ドラッグ操作 ---
canvas.addEventListener('touchstart', (e) => {
    if (!isHolding) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const ty = (touch.clientY - rect.top) * (canvas.height / rect.height);

    // 近くの点を探す
    [points.p1, points.p2, points.p3].forEach(p => {
        if (Math.hypot(tx - p.x, ty - p.y) < 60) draggedPoint = p;
    });
});

canvas.addEventListener('touchmove', (e) => {
    if (draggedPoint) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        draggedPoint.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        draggedPoint.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        e.preventDefault();
    }
}, { passive: false });

canvas.addEventListener('touchend', () => { draggedPoint = null; });