// worker.js: メインスレッドを止めずに裏で計算する
self.onmessage = function(e) {
    const { data, w, h, prevPoints } = e.data;
    
    // 1. 魚の「主軸（一番太い場所）」を探す
    // 画面中央付近で、上下にエッジが連続している高度を特定
    let bestY = (prevPoints.p1.y + prevPoints.p3.y) / 2;
    let maxThickness = 0;
    const step = 20;

    for (let y = Math.max(100, bestY - 200); y < Math.min(h - 100, bestY + 200); y += step) {
        let thickness = 0;
        for (let x = w / 3; x < (w * 2) / 3; x += step) {
            const i = (y * w + x) * 4;
            const upI = ((y - 10) * w + x) * 4;
            if (Math.abs(data[i] - data[upI]) > 30) thickness++;
        }
        if (thickness > maxThickness) {
            maxThickness = thickness;
            bestY = y;
        }
    }

    // 2. 特定した高度(bestY)をベースに、左右の端を精密スキャン
    let minX = w, maxX = 0;
    const scanStep = 10;
    
    // 左右 10%～90% を走査
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += scanStep) {
        const i = (Math.floor(bestY) * w + x) * 4;
        const prevI = (Math.floor(bestY) * w + (x - scanStep)) * 4;
        
        const b = (data[i] + data[i+1] + data[i+2]) / 3;
        const pb = (data[prevI] + data[prevI+1] + data[prevI+2]) / 3;

        if (Math.abs(b - pb) > 35) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
    }

    // 3. 信頼性チェック（手が入り込んだ時の急激な変化を抑制）
    const found = (maxX - minX > 200); // 最低限の長さがあるか
    
    self.postMessage({
        found: found,
        minX: minX,
        maxX: maxX,
        avgY: bestY
    });
};