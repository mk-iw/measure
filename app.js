let currentNo = 1;
let isHolding = false;
let points = {
    p1: {x: 400, y: 300, label: "口先"},
    p2: {x: 800, y: 400, label: "尾叉"},
    p3: {x: 1000, y: 300, label: "尾先"}
};
let activePoint = null;
let lastCapturedFrame = null;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    const startNo = prompt("開始No.を入力", "001");
    currentNo = parseInt(startNo) || 1;
    await startCamera();
    initSpeech();
    initDragEvents();
    render();
};

async function startCamera() {
    const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1920, height: 1080 }
    });
    video.srcObject = s;
    video.play();
}

function initSpeech() {
    const recognition = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript;
        if(cmd.match(/チェック|ホールド/)) toggleHold(true);
        if(cmd.match(/パス|ネクスト/) && isHolding) finalizeAndSave();
    };
    recognition.start();
    recognition.onend = () => recognition.start(); // 音声認識が切れたら自動再開
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = canvas.width;
        lastCapturedFrame.height = canvas.height;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0);
    } else {
        lastCapturedFrame = null;
    }
    updateButtons();
}

function updateButtons() {
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function render() {
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    // 背景描画（ホールド中は静止画、それ以外はライブ）
    if (isHolding && lastCapturedFrame) {
        ctx.drawImage(lastCapturedFrame, 0, 0);
    } else {
        ctx.drawImage(video, 0, 0);
    }

    // 文字とポイントの描画
    drawUI();
    requestAnimationFrame(render);
}

function drawUI() {
    const res = calculate();
    // 1. 状態表示（左上）
    drawText(isHolding ? "【固定】調整してパス/ネクスト" : "【追従】チェック/ホールド", 20, 50, 35);
    
    // 2. 計測値（左下）
    drawText(`尾叉長: ${res.fork}mm`, 40, canvas.height - 120, 55);
    drawText(`全　長: ${res.total}mm`, 40, canvas.height - 50, 55);

    // 3. No表示（右上）
    drawText(`No. ${String(currentNo).padStart(3, '0')}`, canvas.width - 250, 60, 55);

    // 4. ポイント
    Object.values(points).forEach(p => {
        ctx.fillStyle = "black";
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
        drawText(p.label, p.x + 30, p.y - 20, 30);
    });
}

function drawText(txt, x, y, size) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 6;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(txt, x, y);
}

function finalizeAndSave() {
    // 1. 画像生成
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
    link.download = `${dateStr}_No${String(currentNo).padStart(3, '0')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    // 2. 即座に状態リセット（これを先にやることでカメラを止めない）
    currentNo++;
    isHolding = false;
    lastCapturedFrame = null;
    updateButtons();
}

function calculate() {
    const mmRatio = 0.4; // 現場に合わせてsettings.jsonから読み込む値
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);
    return { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
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
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 100);
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