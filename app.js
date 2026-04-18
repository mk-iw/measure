let currentNo = 1;
let isHolding = false;
let lastCapturedFrame = null;
let points = {
    p1: {x: 400, y: 500, label: "口先"},
    p2: {x: 900, y: 500, label: "尾叉"},
    p3: {x: 1200, y: 500, label: "尾先"}
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
            video: { facingMode: "environment", width: 1920, height: 1080 }
        });
        video.srcObject = s;
        video.play();
        render();
    } catch (e) { alert("カメラエラー"); }
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
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    
    const img = (isHolding && lastCapturedFrame) ? lastCapturedFrame : video;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    drawOverlay();

    // --- 拡大プレビュー (ドラッグ中のみ表示) ---
    if (activePoint && isHolding) {
        drawMagnifier();
    }

    requestAnimationFrame(render);
}

function drawMagnifier() {
    const size = 200; // 拡大窓のサイズ
    const mag = 2.0;  // 倍率
    const px = (activePoint.x / 1920) * canvas.width;
    const py = (activePoint.y / 1080) * canvas.height;

    ctx.save();
    // 表示位置：画面中央上部
    const targetX = canvas.width / 2 - size / 2;
    const targetY = 150; 

    // 枠と背景
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 5;
    ctx.strokeRect(targetX, targetY, size, size);
    
    // クリップして拡大描画
    ctx.beginPath();
    ctx.rect(targetX, targetY, size, size);
    ctx.clip();
    
    ctx.drawImage(canvas, 
        px - (size/mag)/2, py - (size/mag)/2, size/mag, size/mag,
        targetX, targetY, size, size
    );

    // 中心点
    ctx.strokeStyle = "red"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetX + size/2, targetY); ctx.lineTo(targetX + size/2, targetY + size);
    ctx.moveTo(targetX, targetY + size/2); ctx.lineTo(targetX + size, targetY + size/2);
    ctx.stroke();
    ctx.restore();
}

function drawOverlay() {
    const mmRatio = 0.4;
    const forkPx = Math.hypot(points.p2.x - points.p1.x, points.p2.y - points.p1.y);
    const ax = points.p2.x - points.p1.x, ay = points.p2.y - points.p1.y;
    const bx = points.p3.x - points.p1.x, by = points.p3.y - points.p1.y;
    const totalPx = (ax * bx + ay * by) / Math.sqrt(ax * ax + ay * ay);

    const res = { fork: (forkPx * mmRatio).toFixed(1), total: (totalPx * mmRatio).toFixed(1) };
    const fSize = canvas.height / 22;
    const textY = 100;

    drawStyledText(`No.${String(currentNo).padStart(3, '0')}  尾叉:${res.fork}mm  全長:${res.total}mm`, 20, textY, fSize);
    
    // 計測点
    Object.values(points).forEach(p => {
        const px = (p.x / 1920) * canvas.width;
        const py = (p.y / 1080) * canvas.height;
        ctx.fillStyle = "black"; ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
        drawStyledText(p.label, px + 15, py - 15, fSize * 0.6);
    });
}

function drawStyledText(txt, x, y, size) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.strokeStyle = "white"; ctx.lineWidth = 4;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(txt, x, y);
}

// 保存処理（確認ダイアログ回避のため一旦ログ出力。サーバー送信に拡張可能）
function finalizeAndSave() {
    // 1. ファイル名を作成（No.001.pngなど）
    const fileName = `No${String(currentNo).padStart(3, '0')}.png`;
    
    // 2. 保存用のリンクを一時的に作って、自動でクリックさせる
    const link = document.createElement('a');
    link.href = canvas.toDataURL("image/png");
    link.download = fileName;
    
    // 設定がオフなら、ここをクリックした瞬間に無言で保存されます
    link.click();

    // 3. 画面に「保存した」ことを知らせる（一瞬だけ）
    showToast(`${fileName} を保存しました`);

    currentNo++;
    toggleHold(false);
}

// 既にある場合は不要ですが、通知用関数です
function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed; top:70px; left:50%; transform:translateX(-50%); 
        background:rgba(0,0,0,0.6); color:#fff; padding:5px 15px; border-radius:15px; z-index:2000;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1000);
}

function initTouchEvents() {
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        return { 
            x: (t.clientX - r.left) * (1920 / r.width), 
            y: (t.clientY - r.top) * (1080 / r.height) 
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