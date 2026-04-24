// piktorioeditor.js — Piktorio マップエディタ v1.1

const PiktorioEditor = (() => {

  // ===== タイル定義 =====
  const TILE_FILL = {
    walk:'#2d5a1b', wall:'#5a3010', cracked:'#4a2808',
    red:'#cc3333', blue:'#2277cc', yellow:'#aaaa10',
    red_cracked:'#cc3333', blue_cracked:'#2277cc', yellow_cracked:'#aaaa10',
  };
  const TILE_LABELS = {
    walk:'通路', wall:'壁', cracked:'ヒビ壁',
    red:'赤壁', blue:'青壁', yellow:'黄壁',
    red_cracked:'赤ヒビ', blue_cracked:'青ヒビ', yellow_cracked:'黄ヒビ',
  };
  const FOOD_COLORS = ['red','blue','yellow'];
  const FOOD_COLOR_FILL = {red:'#cc3333',blue:'#2277cc',yellow:'#aaaa10'};
  const FOOD_COLOR_STROKE = {red:'#ff8888',blue:'#88ccff',yellow:'#ffee44'};
  const FOOD_WEIGHTS = [1,5,10];
  const TREASURE_WEIGHTS = [10,20,40];

  // ===== 状態 =====
  let ed = null; // editor state

  function initState(mapData) {
    const rows = mapData.tiles.length;
    const cols = mapData.tiles[0].length;
    // タイルをディープコピー
    const tiles = mapData.tiles.map(row => row.map(c => ({
      type: c.type,
      piks: {red:c.piks?.red||0, blue:c.piks?.blue||0, yellow:c.piks?.yellow||0},
      hp: c.hp ?? null,
    })));
    ed = {
      rows, cols, tiles,
      startRow: mapData.playerStart[0],
      startCol: mapData.playerStart[1],
      foods: (mapData.foods||[]).map((f,i)=>({...f,id:i})),
      treasures: (mapData.treasures||[]).map((t,i)=>({...t,id:i})),
      // ビューポート（オフセット px）
      vpX: 0, vpY: 0,
      // ツール
      tool: 'scroll', // 'scroll'|'draw'|'erase'
      drawType: 'wall', // タイル種別 or 'food_*' or 'treasure_*' or 'start'
      drawFoodColor: 'red',
      drawFoodWeight: 1,
      drawTreasureWeight: 10,
      // ドラッグ状態
      dragging: false,
      dragStartX: 0, dragStartY: 0,
      dragVpX: 0, dragVpY: 0,
      painting: false,
    };
    _clampViewport();
  }

  // ===== レイアウト =====
  const VIEW_TILES = 10;
  function _getLayout() {
    const canvas = document.getElementById('piktorioCanvas');
    const CELL = Math.floor(canvas.width / VIEW_TILES);
    return { CELL, canvas };
  }

  function _clampViewport() {
    const { CELL, canvas } = _getLayout();
    const maxX = Math.max(0, ed.cols * CELL - canvas.width);
    const maxY = Math.max(0, ed.rows * CELL - canvas.height);
    ed.vpX = Math.max(0, Math.min(maxX, ed.vpX));
    ed.vpY = Math.max(0, Math.min(maxY, ed.vpY));
  }

  function _pixelToCell(px, py) {
    const { CELL } = _getLayout();
    const c = Math.floor((px + ed.vpX) / CELL);
    const r = Math.floor((py + ed.vpY) / CELL);
    return { r, c };
  }

  // ===== 描画 =====
  function render() {
    if (!ed) return;
    const { CELL, canvas } = _getLayout();
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    const cMin = Math.floor(ed.vpX / CELL);
    const cMax = Math.min(ed.cols - 1, Math.ceil((ed.vpX + W) / CELL));
    const rMin = Math.floor(ed.vpY / CELL);
    const rMax = Math.min(ed.rows - 1, Math.ceil((ed.vpY + H) / CELL));

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const x = c * CELL - ed.vpX;
        const y = r * CELL - ed.vpY;
        const tile = ed.tiles[r][c];
        ctx.fillStyle = TILE_FILL[tile.type] || '#333';
        ctx.fillRect(x, y, CELL, CELL);
        // グリッド線
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL, CELL);
      }
    }

    // スタートマス
    {
      const x = ed.startCol * CELL - ed.vpX;
      const y = ed.startRow * CELL - ed.vpY;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(3, CELL * 0.10);
      ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    }

    // エサ
    for (const food of ed.foods) {
      const x = food.col * CELL - ed.vpX;
      const y = food.row * CELL - ed.vpY;
      if (x + CELL < 0 || x > W || y + CELL < 0 || y > H) continue;
      _drawFoodEd(ctx, x, y, CELL, food);
    }

    // 宝物
    for (const t of ed.treasures) {
      const x = t.col * CELL - ed.vpX;
      const y = t.row * CELL - ed.vpY;
      if (x + CELL < 0 || x > W || y + CELL < 0 || y > H) continue;
      _drawTreasureEd(ctx, x, y, CELL, t);
    }

    // カーソル位置ハイライト（描画/削除ツール）
    if (ed.tool !== 'scroll' && ed._cursorR !== undefined) {
      const x = ed._cursorC * CELL - ed.vpX;
      const y = ed._cursorR * CELL - ed.vpY;
      ctx.strokeStyle = ed.tool === 'draw' ? 'rgba(255,255,100,0.9)' : 'rgba(255,80,80,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    }
  }

  function _drawFoodEd(ctx, x, y, CELL, food) {
    const cx = x + CELL / 2, cy = y + CELL / 2, r = CELL * 0.30;
    ctx.beginPath(); ctx.arc(cx + 1, cy + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = FOOD_COLOR_FILL[food.color] || '#888'; ctx.fill();
    ctx.strokeStyle = FOOD_COLOR_STROKE[food.color] || '#ccc';
    ctx.lineWidth = Math.max(1, CELL * 0.05); ctx.stroke();
    const fs = Math.max(7, Math.floor(CELL * 0.28));
    ctx.font = `bold ${fs}px monospace`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(food.weight), cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function _drawTreasureEd(ctx, x, y, CELL, t) {
    const cx = x + CELL / 2, cy = y + CELL / 2;
    const fs = Math.max(10, Math.floor(CELL * 0.72));
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fs}px monospace`;
    ctx.fillText('\u2605', cx, cy);
    ctx.shadowBlur = 0;
    const ns = Math.max(6, Math.floor(CELL * 0.22));
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${ns}px monospace`;
    ctx.fillText(String(t.weight), cx, cy + CELL * 0.04);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ===== 編集操作 =====
  function _applyDraw(r, c) {
    if (r < 0 || r >= ed.rows || c < 0 || c >= ed.cols) return;
    const dt = ed.drawType;

    if (dt === 'start') {
      ed.startRow = r; ed.startCol = c;
      _updateHTML(); render(); return;
    }

    if (dt.startsWith('food_')) {
      // 既存エサを同マスにあれば削除してから追加
      ed.foods = ed.foods.filter(f => !(f.row === r && f.col === c));
      // タイルがwalkのときのみ配置
      if (ed.tiles[r][c].type !== 'wall') {
        const id = Date.now() + Math.random();
        ed.foods.push({ id, color: ed.drawFoodColor, weight: ed.drawFoodWeight, row: r, col: c });
      }
      _updateHTML(); render(); return;
    }

    if (dt.startsWith('treasure_')) {
      ed.treasures = ed.treasures.filter(t => !(t.row === r && t.col === c));
      if (ed.tiles[r][c].type !== 'wall') {
        const id = Date.now() + Math.random();
        ed.treasures.push({ id, weight: ed.drawTreasureWeight, row: r, col: c });
      }
      _updateHTML(); render(); return;
    }

    // タイル描画
    ed.tiles[r][c].type = dt;
    // タイルが壁になったらエサ/宝物を除去
    if (dt === 'wall') {
      ed.foods = ed.foods.filter(f => !(f.row === r && f.col === c));
      ed.treasures = ed.treasures.filter(t => !(t.row === r && t.col === c));
    }
    _updateHTML(); render();
  }

  function _applyErase(r, c) {
    if (r < 0 || r >= ed.rows || c < 0 || c >= ed.cols) return;
    ed.tiles[r][c].type = 'walk';
    ed.foods = ed.foods.filter(f => !(f.row === r && f.col === c));
    ed.treasures = ed.treasures.filter(t => !(t.row === r && t.col === c));
    _updateHTML(); render();
  }

  // ===== HTML生成 =====
  function _buildMapDataJS() {
    const lines = [];
    lines.push('const mapData = {');
    lines.push(`  playerStart: [${ed.startRow}, ${ed.startCol}],`);

    if (ed.foods.length > 0) {
      lines.push('  foods: [');
      for (const f of ed.foods) {
        lines.push(`    { color:'${f.color}', weight:${f.weight}, row:${f.row}, col:${f.col} },`);
      }
      lines.push('  ],');
    }

    if (ed.treasures.length > 0) {
      lines.push('  treasures: [');
      for (const t of ed.treasures) {
        lines.push(`    { weight:${t.weight}, row:${t.row}, col:${t.col} },`);
      }
      lines.push('  ],');
    }

    // タイル略称マップ
    const T2S = {
      walk:'W', wall:'BK', cracked:'CR',
      red:'R', blue:'B', yellow:'Y',
      red_cracked:'RC', blue_cracked:'BC', yellow_cracked:'YC',
    };

    lines.push('  tiles: [');
    for (let r = 0; r < ed.rows; r++) {
      const row = ed.tiles[r].map(c => ' ' + (T2S[c.type] || 'W')).join(',');
      lines.push(`    [${row} ],`);
    }
    lines.push('  ],');
    lines.push('};');
    return lines.join('\n');
  }

  function _updateHTML() {
    // 現在のindex.html全体のmapData部分を置換してtextareaに反映
    const ta = document.getElementById('editorOutput');
    if (!ta) return;
    const current = ta.value || window._originalHTML || '';
    // mapDataブロックを置換
    const newMapData = _buildMapDataJS();
    const replaced = current.replace(/const mapData = \{[\s\S]*?\};\n/, newMapData + '\n');
    ta.value = replaced;
    window._editorHTML = replaced;
  }

  // ===== タッチ/マウスイベント =====
  function _getPos(e) {
    const canvas = document.getElementById('piktorioCanvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return {
      px: (src.clientX - rect.left) * scaleX,
      py: (src.clientY - rect.top) * scaleY,
    };
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (!ed) return;
    const { px, py } = _getPos(e);
    if (ed.tool === 'scroll') {
      ed.dragging = true;
      ed.dragStartX = px; ed.dragStartY = py;
      ed.dragVpX = ed.vpX; ed.dragVpY = ed.vpY;
    } else {
      ed.painting = true;
      const { r, c } = _pixelToCell(px, py);
      ed._cursorR = r; ed._cursorC = c;
      if (ed.tool === 'draw') _applyDraw(r, c);
      else _applyErase(r, c);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!ed) return;
    const { px, py } = _getPos(e);
    if (ed.tool === 'scroll' && ed.dragging) {
      ed.vpX = ed.dragVpX + (ed.dragStartX - px);
      ed.vpY = ed.dragVpY + (ed.dragStartY - py);
      _clampViewport();
      render();
    } else if (ed.painting) {
      const { r, c } = _pixelToCell(px, py);
      ed._cursorR = r; ed._cursorC = c;
      if (ed.tool === 'draw') _applyDraw(r, c);
      else _applyErase(r, c);
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    if (!ed) return;
    ed.dragging = false;
    ed.painting = false;
  }

  // ===== 外部API =====
  function activate(mapData) {
    initState(mapData);
    // 初期HTML設定
    const ta = document.getElementById('editorOutput');
    if (ta && !ta.value) {
      ta.value = window._originalHTML || document.documentElement.outerHTML;
      window._editorHTML = ta.value;
    }
    // canvasにエディタイベントをバインド
    const canvas = document.getElementById('piktorioCanvas');
    canvas.removeEventListener('touchstart', window._edBindTs);
    canvas.removeEventListener('touchmove',  window._edBindTm);
    canvas.removeEventListener('touchend',   window._edBindTe);
    canvas.removeEventListener('mousedown',  window._edBindMd);
    canvas.removeEventListener('mousemove',  window._edBindMm);
    canvas.removeEventListener('mouseup',    window._edBindMu);

    window._edBindTs = e => onTouchStart(e);
    window._edBindTm = e => onTouchMove(e);
    window._edBindTe = e => onTouchEnd(e);
    window._edBindMd = e => onTouchStart(e);
    window._edBindMm = e => { if (ed.dragging || ed.painting) onTouchMove(e); };
    window._edBindMu = e => onTouchEnd(e);

    canvas.addEventListener('touchstart', window._edBindTs, {passive:false});
    canvas.addEventListener('touchmove',  window._edBindTm, {passive:false});
    canvas.addEventListener('touchend',   window._edBindTe, {passive:false});
    canvas.addEventListener('mousedown',  window._edBindMd);
    canvas.addEventListener('mousemove',  window._edBindMm);
    canvas.addEventListener('mouseup',    window._edBindMu);

    // 初期ビューポート：スタート付近を中心に
    const { CELL, canvas: cv } = _getLayout();
    ed.vpX = Math.max(0, ed.startCol * CELL - cv.width / 2);
    ed.vpY = Math.max(0, ed.startRow * CELL - cv.height / 2);
    _clampViewport();
    render();
    _updateHTML();
  }

  function deactivate() {
    const canvas = document.getElementById('piktorioCanvas');
    canvas.removeEventListener('touchstart', window._edBindTs);
    canvas.removeEventListener('touchmove',  window._edBindTm);
    canvas.removeEventListener('touchend',   window._edBindTe);
    canvas.removeEventListener('mousedown',  window._edBindMd);
    canvas.removeEventListener('mousemove',  window._edBindMm);
    canvas.removeEventListener('mouseup',    window._edBindMu);
  }

  function setTool(tool) {
    if (!ed) return;
    ed.tool = tool;
    document.querySelectorAll('.ed-tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('edTool_' + tool);
    if (btn) btn.classList.add('active');
  }

  function setDrawType(type) {
    if (!ed) return;
    ed.drawType = type;
    document.querySelectorAll('.ed-palette-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.ed-palette-btn[data-type="${type}"]`);
    if (btn) btn.classList.add('active');
  }

  function setFoodColor(c) { if (ed) ed.drawFoodColor = c; }
  function setFoodWeight(w) { if (ed) ed.drawFoodWeight = Number(w); }
  function setTreasureWeight(w) { if (ed) ed.drawTreasureWeight = Number(w); }

  function getMapData() {
    if (!ed) return null;
    // 現在の編集状態をmapData形式で返す（テストプレイ用）
    return {
      playerStart: [ed.startRow, ed.startCol],
      foods: ed.foods.map(f => ({color:f.color, weight:f.weight, row:f.row, col:f.col})),
      treasures: ed.treasures.map(t => ({weight:t.weight, row:t.row, col:t.col})),
      tiles: ed.tiles.map(row => row.map(c => ({
        type: c.type,
        piks: {...c.piks},
        hp: c.hp,
      }))),
    };
  }

  // GitHub pushボタン
  async function pushToGitHub(owner, repo, pat, msg) {
    const ta = document.getElementById('editorOutput');
    if (!ta || !ta.value) { alert('HTMLが空です'); return; }
    const content = ta.value;
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const commitMsg = msg || 'Update map via PiktorioEditor';
    // 現在のSHAを取得
    const res1 = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/index.html`, {
      headers: { Authorization: `token ${pat}`, 'User-Agent': 'PiktorioEditor' }
    });
    if (!res1.ok) { alert('GitHub取得失敗: ' + res1.status); return; }
    const data1 = await res1.json();
    const sha = data1.sha;
    // 更新
    const res2 = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/index.html`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${pat}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PiktorioEditor',
      },
      body: JSON.stringify({ message: commitMsg, content: encoded, sha }),
    });
    if (res2.ok) {
      alert('GitHubへの更新が完了しました');
    } else {
      const err = await res2.json();
      alert('更新失敗: ' + (err.message || res2.status));
    }
  }

  return {
    activate, deactivate, render,
    setTool, setDrawType, setFoodColor, setFoodWeight, setTreasureWeight,
    getMapData, pushToGitHub,
  };
})();
