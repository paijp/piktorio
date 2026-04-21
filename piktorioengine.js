// piktorioengine.js — Piktorioゲームエンジン v0.2
// GitHub Pages対応・サーバレス・ターン制シミュレーション

const Piktorioengine = (() => {

  // ===== 定数 =====
  const TILE = {
    WALK:   'walk',
    WALL:   'wall',
    RED:    'red',
    BLUE:   'blue',
    YELLOW: 'yellow',
  };

  const PHASE = {
    PLAYER_MOVE:   'player_move',
    PLAYER_ACTION: 'player_action',
    PIK:           'pik',
    ENEMY:         'enemy',
  };

  const COLORS = ['red', 'blue', 'yellow'];
  const MOVE_LIMIT = 3;

  // マップ表示倍率
  const MAP_SCALE = 2;
  // 霧：訪問済み範囲+この距離まで表示（チェビシェフ距離）
  const FOG_EXTRA = 2;

  // タイル色（壁は茶色系）
  const TILE_FILL = {
    [TILE.WALK]:   '#2d5a1b',
    [TILE.WALL]:   '#5a3010',
    [TILE.RED]:    '#6b1a1a',
    [TILE.BLUE]:   '#1a4a6b',
    [TILE.YELLOW]: '#5a5a10',
  };

  const TILE_STROKE = {
    [TILE.WALK]:   '#3a7a25',
    [TILE.WALL]:   '#7a4a20',
    [TILE.RED]:    '#cc3333',
    [TILE.BLUE]:   '#3399cc',
    [TILE.YELLOW]: '#cccc22',
  };

  // ===== 状態 =====
  let state = null;

  // ===== 初期化 =====
  function init(mapData) {
    const rows = mapData.tiles.length;
    const cols = mapData.tiles[0].length;

    const tiles = mapData.tiles.map(row =>
      row.map(cell => ({
        type: cell.type,
        piks: {
          red:    cell.piks?.red    || 0,
          blue:   cell.piks?.blue   || 0,
          yellow: cell.piks?.yellow || 0,
        },
      }))
    );

    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

    state = {
      rows, cols,
      map: tiles,
      visited,
      player: {
        row: mapData.playerStart[0],
        col: mapData.playerStart[1],
        piks: { red: 0, blue: 0, yellow: 0 },
      },
      phase: PHASE.PLAYER_MOVE,
      movesLeft: MOVE_LIMIT,
      turn: 1,
      message: '移動してください（残り3マス）',
    };

    _markVisited(state.player.row, state.player.col);
    _collectPiks();
    _render();
    _bindKeys();
  }

  // ===== 訪問済みマーク =====
  function _markVisited(r, c) {
    const dist = MOVE_LIMIT + FOG_EXTRA;
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
          state.visited[nr][nc] = true;
        }
      }
    }
  }

  function _isVisible(r, c) {
    return state.visited[r][c];
  }

  // ===== pikの自動回収 =====
  function _collectPiks() {
    const cell = _getCell(state.player.row, state.player.col);
    COLORS.forEach(color => {
      state.player.piks[color] += cell.piks[color];
      cell.piks[color] = 0;
    });
  }

  function _getCell(r, c) {
    return state.map[r][c];
  }

  // ===== 移動可否（WALKのみ） =====
  function _canEnter(r, c) {
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return false;
    return state.map[r][c].type === TILE.WALK;
  }

  // アクション範囲：チェビシェフ距離1（8方向+自分）
  function _isReachableForAction(r, c) {
    const pr = state.player.row;
    const pc = state.player.col;
    return Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1;
  }

  // ===== 移動 =====
  function movePlayer(dr, dc) {
    if (state.phase !== PHASE.PLAYER_MOVE) return;
    if (state.movesLeft <= 0) { _enterActionPhase(); return; }

    const nr = state.player.row + dr;
    const nc = state.player.col + dc;
    if (!_canEnter(nr, nc)) {
      _setMessage('そこには進めません');
      _render();
      return;
    }

    state.player.row = nr;
    state.player.col = nc;
    state.movesLeft--;
    _markVisited(nr, nc);
    _collectPiks();

    if (state.movesLeft === 0) {
      _enterActionPhase();
    } else {
      _setMessage(`移動してください（残り${state.movesLeft}マス）`);
      _render();
    }
  }

  function _enterActionPhase() {
    state.phase = PHASE.PLAYER_ACTION;
    _setMessage('アクション：マスをタップしてpikを操作 / スペースでターン終了');
    _render();
  }

  // ===== アクション =====
  function cellAction(r, c, zone) {
    if (state.phase !== PHASE.PLAYER_ACTION) return;

    if (!_isReachableForAction(r, c)) {
      _setMessage('操作できるのは自分のいるマスか隣接マス（斜め含む）のみです');
      _render();
      return;
    }

    const cell = _getCell(r, c);
    const type = cell.type;

    if (type === TILE.WALL) {
      _setMessage('壁には操作できません');
      _render();
      return;
    }

    if (zone === 'bottomright') {
      if (type !== TILE.WALK) {
        _setMessage('色専用マスからは直接拾えません');
        _render();
        return;
      }
      const hasPiks = COLORS.some(color => cell.piks[color] > 0);
      if (!hasPiks) { _setMessage('このマスにpikはいません'); _render(); return; }
      COLORS.forEach(color => {
        state.player.piks[color] += cell.piks[color];
        cell.piks[color] = 0;
      });
      _setMessage('pikを拾いました');

    } else {
      const colorMap = { topleft: 'red', topright: 'yellow', bottomleft: 'blue' };
      const color = colorMap[zone];

      if (type === TILE.RED    && color !== 'red')    { _setMessage('赤マスには赤pikのみ置けます');   _render(); return; }
      if (type === TILE.BLUE   && color !== 'blue')   { _setMessage('青マスには青pikのみ置けます');   _render(); return; }
      if (type === TILE.YELLOW && color !== 'yellow') { _setMessage('黄マスには黄pikのみ置けます');   _render(); return; }

      if (state.player.piks[color] <= 0) {
        _setMessage(`${_colorJa(color)}pikを持っていません`); _render(); return;
      }
      state.player.piks[color]--;
      cell.piks[color]++;
      _setMessage(`${_colorJa(color)}pikを置きました`);
    }
    _render();
  }

  function _colorJa(c) {
    return { red: '赤', blue: '青', yellow: '黄' }[c] || c;
  }

  // ===== ターン終了 =====
  function endPlayerTurn() {
    if (state.phase !== PHASE.PLAYER_ACTION) return;
    state.phase = PHASE.PIK;
    _setMessage('pikターン中…');
    _render();
    setTimeout(_runPikTurn, 400);
  }

  function skipMove() {
    if (state.phase !== PHASE.PLAYER_MOVE) return;
    _enterActionPhase();
  }

  function _runPikTurn() {
    state.phase = PHASE.ENEMY;
    _setMessage('敵ターン中…');
    _render();
    setTimeout(_runEnemyTurn, 400);
  }

  function _runEnemyTurn() {
    state.phase = PHASE.PLAYER_MOVE;
    state.movesLeft = MOVE_LIMIT;
    state.turn++;
    _setMessage(`ターン ${state.turn} — 移動してください（残り3マス）`);
    _render();
  }

  // ===== レンダリング =====
  function _render() {
    const canvas = document.getElementById('piktorioCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const BASE_CELL = Math.floor(Math.min(
      canvas.width  / state.cols,
      canvas.height / state.rows
    ));
    const CELL = BASE_CELL * MAP_SCALE;

    const mapW = CELL * state.cols;
    const mapH = CELL * state.rows;
    const vpW = canvas.width;
    const vpH = canvas.height;

    const playerMapX = (state.player.col + 0.5) * CELL;
    const playerMapY = (state.player.row + 0.5) * CELL;

    let ox = vpW / 2 - playerMapX;
    let oy = vpH / 2 - playerMapY;
    ox = Math.min(0, Math.max(vpW - mapW, ox));
    oy = Math.min(0, Math.max(vpH - mapH, oy));

    // 背景（霧）
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, vpW, vpH);

    // マス
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const x = ox + c * CELL;
        const y = oy + r * CELL;
        if (x + CELL < 0 || x > vpW || y + CELL < 0 || y > vpH) continue;
        _drawCell(ctx, r, c, x, y, CELL);
      }
    }

    if (state.phase === PHASE.PLAYER_MOVE && state.movesLeft > 0)
      _drawReachable(ctx, CELL, ox, oy);

    if (state.phase === PHASE.PLAYER_ACTION)
      _drawActionRange(ctx, CELL, ox, oy);

    _drawPlayer(ctx, CELL, ox, oy);
    _updateUI();
  }

  function _drawCell(ctx, r, c, x, y, CELL) {
    const cell = state.map[r][c];
    if (!_isVisible(r, c)) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x, y, CELL, CELL);
      return;
    }

    ctx.fillStyle = TILE_FILL[cell.type] || '#333';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = TILE_STROKE[cell.type] || '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    const fs = Math.max(9, Math.floor(CELL * 0.26));
    ctx.font = `bold ${fs}px monospace`;

    if (cell.piks.red > 0) {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(cell.piks.red, x + 3, y + fs + 2);
    }
    if (cell.piks.yellow > 0) {
      ctx.fillStyle = '#ffee44';
      const tw = ctx.measureText(cell.piks.yellow).width;
      ctx.fillText(cell.piks.yellow, x + CELL - tw - 3, y + fs + 2);
    }
    if (cell.piks.blue > 0) {
      ctx.fillStyle = '#55aaff';
      ctx.fillText(cell.piks.blue, x + 3, y + CELL - 4);
    }
  }

  function _drawReachable(ctx, CELL, ox, oy) {
    const reachable = _bfsReachable(state.player.row, state.player.col, state.movesLeft);
    reachable.forEach(([r, c]) => {
      ctx.fillStyle = 'rgba(255,255,180,0.2)';
      ctx.fillRect(ox + c * CELL, oy + r * CELL, CELL, CELL);
    });
  }

  function _drawActionRange(ctx, CELL, ox, oy) {
    const pr = state.player.row, pc = state.player.col;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = pr + dr, c = pc + dc;
        if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) continue;
        if (state.map[r][c].type === TILE.WALL) continue;
        ctx.fillStyle = 'rgba(180,255,180,0.14)';
        ctx.fillRect(ox + c * CELL, oy + r * CELL, CELL, CELL);
      }
    }
  }

  function _bfsReachable(startR, startC, steps) {
    const visited = new Set([`${startR},${startC}`]);
    const queue   = [[startR, startC, steps]];
    const result  = [];
    const dirs    = [[-1,0],[1,0],[0,-1],[0,1]];
    while (queue.length) {
      const [r, c, left] = queue.shift();
      if (left === 0) continue;
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        const key = `${nr},${nc}`;
        if (!visited.has(key) && _canEnter(nr, nc)) {
          visited.add(key);
          result.push([nr, nc]);
          queue.push([nr, nc, left - 1]);
        }
      }
    }
    return result;
  }

  function _drawPlayer(ctx, CELL, ox, oy) {
    const { row, col, piks } = state.player;
    const x  = ox + col * CELL;
    const y  = oy + row * CELL;
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;
    const r  = CELL * 0.28;

    ctx.beginPath();
    ctx.arc(cx + 1, cy + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f0efe0';
    ctx.fill();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const fs = Math.max(8, Math.floor(CELL * 0.24));
    ctx.font = `bold ${fs}px monospace`;
    if (piks.red > 0) {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(piks.red, x + 3, y + fs + 2);
    }
    if (piks.yellow > 0) {
      ctx.fillStyle = '#ffee44';
      const tw = ctx.measureText(piks.yellow).width;
      ctx.fillText(piks.yellow, x + CELL - tw - 3, y + fs + 2);
    }
    if (piks.blue > 0) {
      ctx.fillStyle = '#55aaff';
      ctx.fillText(piks.blue, x + 3, y + CELL - 4);
    }
  }

  function _setMessage(msg) {
    state.message = msg;
    const el = document.getElementById('piktorioMessage');
    if (el) el.textContent = msg;
  }

  function _updateUI() {
    const phaseNames = {
      [PHASE.PLAYER_MOVE]:   '移動フェーズ',
      [PHASE.PLAYER_ACTION]: 'アクションフェーズ',
      [PHASE.PIK]:           'pikターン',
      [PHASE.ENEMY]:         '敵ターン',
    };
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('piktorioPhase',   phaseNames[state.phase] || state.phase);
    set('piktorioTurn',    `${state.turn}`);
    set('piktorioMoves',   state.phase === PHASE.PLAYER_MOVE ? `${state.movesLeft}` : '—');
    set('piktorioMessage', state.message);

    const endBtn  = document.getElementById('piktorioEndTurn');
    const skipBtn = document.getElementById('piktorioSkipMove');
    if (endBtn)  endBtn.disabled  = state.phase !== PHASE.PLAYER_ACTION;
    if (skipBtn) skipBtn.disabled = state.phase !== PHASE.PLAYER_MOVE;
  }

  // ===== キーボード =====
  function _bindKeys() {
    if (_bindKeys._done) return;
    _bindKeys._done = true;
    document.addEventListener('keydown', e => {
      if (!state) return;
      const dirs = {
        ArrowUp:    [-1, 0], ArrowDown:  [1, 0],
        ArrowLeft:  [ 0,-1], ArrowRight: [0, 1],
        w: [-1,0], s: [1,0], a: [0,-1], d: [0,1],
      };
      if (dirs[e.key]) { e.preventDefault(); movePlayer(...dirs[e.key]); }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (state.phase === PHASE.PLAYER_MOVE)   skipMove();
        if (state.phase === PHASE.PLAYER_ACTION) endPlayerTurn();
      }
    });
  }

  // ===== 座標変換 =====
  function _pixelToCell(clientX, clientY) {
    const canvas = document.getElementById('piktorioCanvas');
    const rect   = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width  / rect.width);
    const py = (clientY - rect.top)  * (canvas.height / rect.height);

    const BASE_CELL = Math.floor(Math.min(canvas.width / state.cols, canvas.height / state.rows));
    const CELL = BASE_CELL * MAP_SCALE;

    const playerMapX = (state.player.col + 0.5) * CELL;
    const playerMapY = (state.player.row + 0.5) * CELL;
    let ox = canvas.width  / 2 - playerMapX;
    let oy = canvas.height / 2 - playerMapY;
    ox = Math.min(0, Math.max(canvas.width  - CELL * state.cols, ox));
    oy = Math.min(0, Math.max(canvas.height - CELL * state.rows, oy));

    const c  = Math.floor((px - ox) / CELL);
    const r  = Math.floor((py - oy) / CELL);
    const lx = (px - ox) - c * CELL;
    const ly = (py - oy) - r * CELL;
    return { r, c, lx, ly, CELL };
  }

  // ===== クリック／タップ =====
  function handleCanvasClick(e) {
    if (!state) return;
    e.preventDefault && e.preventDefault();
    const { r, c, lx, ly, CELL } = _pixelToCell(e.clientX, e.clientY);
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;

    if (state.phase === PHASE.PLAYER_MOVE) {
      const dr = r - state.player.row;
      const dc = c - state.player.col;
      if (Math.abs(dr) + Math.abs(dc) === 1) movePlayer(dr, dc);
      return;
    }

    if (state.phase === PHASE.PLAYER_ACTION) {
      const half = CELL / 2;
      let zone;
      if      (lx <  half && ly <  half) zone = 'topleft';
      else if (lx >= half && ly <  half) zone = 'topright';
      else if (lx <  half && ly >= half) zone = 'bottomleft';
      else                               zone = 'bottomright';
      cellAction(r, c, zone);
    }
  }

  // ===== 公開API =====
  return {
    init,
    movePlayer,
    cellAction,
    endPlayerTurn,
    skipMove,
    handleCanvasClick,
  };

})();
