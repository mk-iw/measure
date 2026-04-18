let currentNo = 1;
let isHolding = false;
let lastCapturedFrame = null;
let points = {
    p1: {x: 480, y: 540, label: "口先"},
    p2: {x: 960, y: 540, label: "尾叉"},
    p3: {x: 1200, y: 540, label: "尾先"}
};
let activePoint = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');

window.onload = async () => {
    const startNo = prompt("開始No.", "001");
    currentNo = parseInt(startNo) || 1;
    try {
        const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        video.srcObject = s;
        video.onloadedmetadata = () => { video.play(); render(); };
    } catch (e) { alert("カメラ起動失敗: " + e); }
    initSpeech();
    initTouchEvents();
};

function initSpeech() {
    const Rec = window.webkitSpeechRecognition || window.SpeechRecognition;
    if(!Rec) return;
    const rec = new Rec();
    rec.lang = 'ja-JP'; rec.continuous = true;
    rec.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript;
        if(cmd.match(/チェック|ホールド/)) toggleHold(true);
        if(cmd.match(/パス|ネクスト/) && isHolding) finalizeAndSave();
    };
    rec.onend = () => rec.start();
    rec.start();
}

function toggleHold(state) {
    isHolding = state;
    if (state) {
        lastCapturedFrame = document.createElement('canvas');
        lastCapturedFrame.width = video.videoWidth;
        lastCapturedFrame.height = video.videoHeight;
        lastCapturedFrame.getContext('2d').drawImage(video, 0, 0);
    } else {
        lastCapturedFrame = null;
    }
    document.getElementById('btn-hold').style.display = isHolding ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isHolding ? 'block' : 'none';
    document.getElementById('btn-cancel').style.display = isHolding ? 'block' : 'none';
}

function render() {
    // 描画サイズを現在のブラウザ枠に合わせる
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    
    ctx.save();
    // 常に「画面の横幅」を基準に映像を合わせる
    const scale = canvas.width / vw;
    ctx.scale(scale, scale);

    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, 0, 0);

    // 情報を描画 (映像の左上に集約)
    drawOverlay();

    ctx.restore();
    requestAnimationFrame(render);
}

function drawOverlay() {
    const mmRatio = 0.4; // 倍率
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);

    const res = { 
        fork: (forkPx * mmRatio).toFixed(1), 
        total: (totalPx * mmRatio).toFixed(1) 
    };

    // 全てのテキストを画面上部（ボタンの下）に配置
    const topMargin = 150; 
    drawStyledText(`No.${String(currentNo).padStart(3, '0')}  尾叉:${res.fork}mm  全長:${res.total}mm`, 30, topMargin, 60);
    drawStyledText(isHolding ? "【固定中】" : "【追従中】", 30, topMargin + 80, 45);

    // ポイント
    Object.values(points).forEach(p => {
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.stroke();
        drawStyledText(p.label, p.x + 30, p.y - 30, 40);
    });
}

function drawStyledText(txt, x, y, size) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 6;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(txt, x, y);
}

function finalizeAndSave() {
    const link = document.createElement('a');
    link.download = `No${String(currentNo).padStart(3, '0')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    currentNo++;
    toggleHold(false);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        const scale = video.videoWidth / r.width;
        return { x: (t.clientX - r.left) * scale, y: (t.clientY - r.top) * scale };
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