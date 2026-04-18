let currentNo = 1;
let isHolding = false;
let lastCapturedFrame = null;
let points = {
    p1: {x: 400, y: 400, label: "口先"},
    p2: {x: 800, y: 500, label: "尾叉"},
    p3: {x: 1000, y: 400, label: "尾先"}
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
    if(!Speech) return;
    const rec = new Speech();
    rec.lang = 'ja-JP'; rec.continuous = true;
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
        lastCapturedFrame.width = 1920; lastCapturedFrame.height = 1080;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0);
    } else {
        lastCapturedFrame = null;
    }
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function render() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    const cw = canvas.width; const ch = canvas.height;

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(Math.PI / 2); // 90度回転
    
    const drawW = ch; const drawH = cw;
    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);

    drawOverlay(drawW, drawH);
    ctx.restore();
    requestAnimationFrame(render);
}

function drawOverlay(w, h) {
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);
    const res = { fork: (forkPx * 0.4).toFixed(1), total: (totalPx * 0.4).toFixed(1) };

    const topY = -h / 2 + 70; // ボタン（高さ約50-60）のすぐ下に配置
    const fSize = h / 28;

    // 全ての情報を「上側」の細い帯状に配置
    // 左：状態, 中央：計測値, 右：No
    drawStyledText(isHolding ? "【固定】" : "【追従】", -w/2 + 20, topY, fSize * 0.7);
    drawStyledText(`尾叉:${res.fork}mm`, -w/2 + 180, topY, fSize);
    drawStyledText(`全長:${res.total}mm`, -w/2 + 450, topY, fSize);
    drawStyledText(`No.${String(currentNo).padStart(3, '0')}`, w/2 - 180, topY, fSize);

    // ポイント描画（ドラッグ操作対象）
    Object.values(points).forEach(p => {
        const px = (p.x / 1920) * w - w/2;
        const py = (p.y / 1080) * h - h/2;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
        drawStyledText(p.label, px + 20, py - 20, fSize * 0.5);
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
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        return { x: (t.clientY - r.top) * (1920 / r.height), y: (r.right - t.clientX) * (1080 / r.width) };
    };
    canvas.addEventListener('touchstart', (e) => {
        if(!isHolding) return;
        const pos = getPos(e);
        activePoint = Object.values(points).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 120);
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