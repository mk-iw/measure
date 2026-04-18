/**
 * Fish-Measure AR Pro: app.js
 * 機能: 音声操作, No.自動更新, 射影変換, 魚類計測, 画像保存
 */

let currentNo = 1;
let isHolding = false;
let config = {};
let markers = []; // ArUcoマーカー座標用
let points = { p1: {x:200, y:200}, p2: {x:400, y:300}, p3: {x:500, y:200} }; // 初期表示点
let mmPerPx = 1.0; // 1ピクセルあたりの長さ(mm)

const video = document.getElementById('video');
const canvas = document.getElementById('canvas-measure');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

// --- 1. 初期化と設定の読み込み ---
window.onload = async () => {
    try {
        const response = await fetch('settings.json');
        config = await response.json();
    } catch (e) {
        // フォールバック設定
        config = {
            system: { target_area_width_mm: 400.0, marker_size_mm: 50.0 },
            labels: { commands: { hold: ["チェック", "ホールド"], save: ["パス", "ネクスト"] } }
        };
    }

    const inputNo = prompt("開始No.を入力(3桁)", "001");
    currentNo = parseInt(inputNo) || 1;
    updateNoDisplay();

    await startCamera();
    initSpeech();
    requestAnimationFrame(mainLoop);
};

// カメラ起動（背面・フルHD推奨）
async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1920, height: 1080 }
    });
    video.srcObject = stream;
}

function updateNoDisplay() {
    document.getElementById('no-display').innerText = `No. ${String(currentNo).padStart(3, '0')}`;
}

// --- 2. 音声認識 (Web Speech API) ---
function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;

    recognition.onresult = (event) => {
        const cmd = event.results[event.results.length - 1][0].transcript.trim();
        console.log("Voice Command:", cmd);

        if (config.labels.commands.hold.some(word => cmd.includes(word))) {
            toggleHold(true);
        } else if (config.labels.commands.save.some(word => cmd.includes(word))) {
            if (isHolding) finalizeAndSave();
        }
    };
    recognition.start();
}

function toggleHold(state) {
    isHolding = state;
    statusEl.innerText = state ? "【固定】位置調整 & ネクスト" : "【追従中】ホールド/チェック";
    statusEl.className = state ? "holding" : "";
}

// --- 3. 幾何計算コア ---
function calculateResults() {
    const { p1, p2, p3 } = points;
    
    // 尾叉長 (P1-P2間)
    const forkLenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    
    // 全長 (P1-P2延長線へのP3投影)
    const ax = p2.x - p1.x, ay = p2.y - p1.y;
    const bx = p3.x - p1.x, by = p3.y - p1.y;
    const dot = ax * bx + ay * by;
    const magASq = ax * ax + ay * ay;
    const totalLenPx = dot / Math.sqrt(magASq);

    // 単位変換 (ピクセル -> mm)
    // 本来はArUcoの距離から動的にmmPerPxを算出するが、ここでは簡易的に固定比率でデモ
    const mmRatio = config.system.target_area_width_mm / 1000; // 仮の画面幅1000px想定
    
    return {
        forkLen: (forkLenPx * mmRatio).toFixed(1),
        totalLen: (totalLenPx * mmRatio).toFixed(1)
    };
}

// --- 4. 描画とメインループ ---
function mainLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // マーカー検出（OpenCV.js）
        if (!isHolding && typeof cv !== 'undefined' && cv.Mat) {
            detectMarkersAndPoints();
        }

        drawOverlay();
    }
    requestAnimationFrame(mainLoop);
}

// ArUcoマーカー検出と座標補正（ロジック概略）
function detectMarkersAndPoints() {
    // ここに OpenCV の検出コードを記述
    // cv.detectMarkers(src, dictionary, corners, ids);
    // 4隅が揃えば射影変換行列を作成し、pointsを自動更新する
}

function drawOverlay() {
    const res = calculateResults();
    
    // 計測ラインとポイント
    ctx.strokeStyle = "#ffff00"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(points.p1.x, points.p1.y); ctx.lineTo(points.p2.x, points.p2.y); ctx.stroke();
    
    ctx.fillStyle = "#00ffff";
    [points.p1, points.p2, points.p3].forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "30px sans-serif";
        ctx.fillText(["口先","尾叉","尾先"][i], p.x + 20, p.y - 20);
        ctx.fillStyle = "#00ffff";
    });

    // 結果表示
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(20, canvas.height - 180, 400, 150);
    ctx.fillStyle = "#00ff00";
    ctx.font = "bold 50px sans-serif";
    ctx.fillText(`尾叉長: ${res.forkLen} mm`, 40, canvas.height - 120);
    ctx.fillText(`全　長: ${res.totalLen} mm`, 40, canvas.height - 50);
}

// --- 5. 保存とNo.更新 ---
function finalizeAndSave() {
    // 右上にNo.刻印
    ctx.fillStyle = "white";
    ctx.font = "bold 50px sans-serif";
    ctx.fillText(`No. ${String(currentNo).padStart(3, '0')}`, canvas.width - 250, 80);

    // 画像を保存（ダウンロード）
    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = `Measure_${String(currentNo).padStart(3, '0')}.png`;
    link.href = dataURL;
    link.click();

    // カウントアップとリセット
    currentNo++;
    updateNoDisplay();
    toggleHold(false);
}

// --- 6. タッチによる微調整機能 ---
canvas.addEventListener('touchstart', (e) => {
    if (!isHolding) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const ty = (touch.clientY - rect.top) * (canvas.height / rect.height);

    // 最も近いポイントを選択して移動
    let closest = points.p1;
    let minDist = Math.hypot(tx - points.p1.x, ty - points.p1.y);
    [points.p2, points.p3].forEach(p => {
        let d = Math.hypot(tx - p.x, ty - p.y);
        if (d < minDist) { minDist = d; closest = p; }
    });
    closest.x = tx; closest.y = ty;
});