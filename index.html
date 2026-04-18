let currentNo = 1;
let isHolding = false;
let lastCapturedFrame = null;
let points = {
    p1: {x: 300, y: 200, label: "口先"},
    p2: {x: 700, y: 300, label: "尾叉"},
    p3: {x: 900, y: 200, label: "尾先"}
};
let activePoint = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    const startNo = prompt("開始No.を入力", "001");
    currentNo = parseInt(startNo) || 1;
    await startCamera();
    initSpeech();
    initTouchEvents();
    render();
};

async function startCamera() {
    const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1920, height: 1080 }
    });
    video.srcObject = s;
    await video.play();
}

function initSpeech() {
    const Speech = window.webkitSpeechRecognition || window.SpeechRecognition;
    const rec = new Speech();
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript;
        if(cmd.match(/チェック|ホールド/)) toggleHold(true);
        if(cmd.match(/パス|ネクスト/) && isHolding) finalizeAndSave();
    };
    rec.start();
    rec.onend = () => rec.start();
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = 1920; 
        lastCapturedFrame.height = 1080;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0);
    } else {
        lastCapturedFrame = null;
    }
}

function render() {
    // 常に画面いっぱいに描画
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.save();
    // 画面中央を軸に90度回転させて「横長」に見せる
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(Math.PI / 2);
    
    // 回転後の座標系での描画幅（スマホの縦が横になる）
    const drawW = ch; 
    const drawH = cw;

    // 背景描画
    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);

    // 数値計算と描画（この中では横長1920x1080の座標系で考える）
    drawOverlay(drawW, drawH);

    ctx.restore();
    requestAnimationFrame(render);
}

function drawOverlay(w, h) {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);
    const mmRatio = 0.4; // settingsから取得する実倍率

    const res = { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };

    // 全体の文字サイズ調整
    const baseS = h / 20;

    // 1. 状態 (左上端)
    drawStyledText(isHolding ? "【固定】パス/ネクストで保存" : "【追従】チェック/ホールド", -w/2 + 20, -h/2 + 50, baseS * 0.8);
    
    // 2. 計測値 (左下端)
    drawStyledText(`尾叉長: ${res.fork}mm`, -w/2 + 30, h/2 - 100, baseS * 1.5);
    drawStyledText(`全　長: ${res.total}mm`, -w/2 + 30, h/2 - 30, baseS * 1.5);

    // 3. No表示 (右上端)
    drawStyledText(`No. ${String(currentNo).padStart(3, '0')}`, w/2 - 200, -h/2 + 60, baseS * 1.2);

    // 4. ポイント
    Object.values(points).forEach(p => {
        const px = p.x / 1920 * w - w/2;
        const py = p.y / 1080 * h - h/2;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
        drawStyledText(p.label, px + 20, py - 20, baseS * 0.6);
    });
}

function drawStyledText(txt, x, y, size) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 4;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(txt, x, y);
}

function finalizeAndSave() {
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
    link.download = `${dateStr}_No${String(currentNo).padStart(3, '0')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    currentNo++;
    toggleHold(false);
}

function initTouchEvents() {
    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const rect = canvas.getBoundingClientRect();
        const t = e.touches[0];
        // 回転を考慮した座標変換
        const tx = (t.clientY - rect.top) * (1920 / rect.height);
        const ty = (rect.right - t.clientX) * (1080 / rect.width);
        activePoint = Object.values(points).find(p => Math.hypot(p.x - tx, p.y - ty) < 100);
    });
    canvas.addEventListener('touchmove', (e) => {
        if(activePoint) {
            const rect = canvas.getBoundingClientRect();
            const t = e.touches[0];
            activePoint.x = (t.clientY - rect.top) * (1920 / rect.height);
            activePoint.y = (rect.right - t.clientX) * (1080 / rect.width);
            e.preventDefault();
        }
    }, {passive: false});
    canvas.addEventListener('touchend', () => activePoint = null);
}