// piktorioengine.js — Piktorioゲームエンジン v0.15

const Piktorioengine = (() => {

  const COLORS      = ['red','blue','yellow'];
  const FOOD_WEIGHTS  = [1, 5, 10];
  const TREASURE_WEIGHTS = [10, 20, 40];
  const FOOD_COLOR_FILL = { red:'#cc3333', blue:'#2277cc', yellow:'#aaaa10' };
  const FOOD_COLOR_STROKE = { red:'#ff8888', blue:'#88ccff', yellow:'#ffee44' };
  const MOVE_LIMIT  = 3;
  const CRACKED_HP       = 100;
  const COLOR_CRACKED_HP =  40;

  const CRACKED_BASE = { cracked:'walk', red_cracked:'red', blue_cracked:'blue', yellow_cracked:'yellow' };
  const IS_CRACKED   = t => t in CRACKED_BASE;
  const BASE_OF      = t => CRACKED_BASE[t] || t;
  const BREAK_INTO   = { cracked:'walk', red_cracked:'walk', blue_cracked:'walk', yellow_cracked:'walk' };
  const DEFAULT_HP   = t => t==='cracked' ? CRACKED_HP : COLOR_CRACKED_HP;

  const TILE_FILL = {
    walk:'#2d5a1b', wall:'#5a3010', cracked:'#4a2808',
    red:'#cc3333', blue:'#2277cc', yellow:'#aaaa10',
    red_cracked:'#cc3333', blue_cracked:'#2277cc', yellow_cracked:'#aaaa10',
  };
  const MINI_FILL = {
    walk:'#3a7a22', wall:'#7a4a20', cracked:'#6a3a18',
    red:'#cc4444', blue:'#3388cc', yellow:'#aaaa20',
    red_cracked:'#cc4444', blue_cracked:'#3388cc', yellow_cracked:'#aaaa20',
  };
  const GAUGE_STROKE = {
    cracked:       'rgba(220,220,220,0.85)',
    red_cracked:   'rgba(255,160,160,0.9)',
    blue_cracked:  'rgba(120,200,255,0.9)',
    yellow_cracked:'rgba(240,240,80,0.9)',
  };

  const VIEW_TILES = 10;
  const MINI_PX = 4;

  let state = null;

  // ===== デバッグログ =====
  function _dbgLog(msg){
    const el=document.getElementById('debugLog');
    if(!el) return;
    const ts=new Date().toLocaleTimeString('ja-JP',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
    el.value=(ts+' '+msg+'\n'+el.value).slice(0,4000);
  }

  // ===== フラッシュ管理 =====
  const _flash = {};
  function _fkey(r,c,zone){ return `${r},${c},${zone}`; }

  function _triggerFlash(r,c,zone){
    _flash[_fkey(r,c,zone)] = { end: Date.now()+220 };
    if(state) _render();
    setTimeout(()=>{ if(state) _render(); }, 240);
  }

  function _isFlashing(r,c,zone){
    const f = _flash[_fkey(r,c,zone)];
    return f != null && Date.now() < f.end;
  }

  // ===== 初期化 =====
  function init(mapData){
    const rows=mapData.tiles.length, cols=mapData.tiles[0].length;
    const tiles=mapData.tiles.map(row=>row.map(cell=>({
      type:cell.type,
      piks:{red:cell.piks?.red||0, blue:cell.piks?.blue||0, yellow:cell.piks?.yellow||0},
      hp:IS_CRACKED(cell.type)?(cell.hp??DEFAULT_HP(cell.type)):null,
    })));
    const fogMap=Array.from({length:rows},()=>new Array(cols).fill(false));
    // mapData.foodsからエサリストを構築
    const foods=(mapData.foods||[]).map((f,i)=>({
      id:i, color:f.color, weight:f.weight,
      row:f.row, col:f.col,
    }));
    const treasures=(mapData.treasures||[]).map((t,i)=>({
      id:i, weight:t.weight,
      row:t.row, col:t.col,
    }));
    const treasureTotal=treasures.length;
    state={rows,cols,map:tiles,fogMap,foods,treasures,treasureTotal,treasureArrived:0,
      startRow:mapData.playerStart[0], startCol:mapData.playerStart[1],
      player:{row:mapData.playerStart[0], col:mapData.playerStart[1], piks:{red:0,blue:0,yellow:0}},
      phase:'player', movesLeft:MOVE_LIMIT, turn:1, message:'移動してください'};
    _revealFogFromView();
    _collectPiks();
    _render();
    _bindKeys();
  }

  function _revealFogFromView(){
    const canvas=document.getElementById('piktorioCanvas');
    if(!canvas) return;
    const{CELL,ox,oy}=_getLayout(canvas);
    const vpW=canvas.width, vpH=canvas.height;
    const cMin=Math.max(0,Math.floor(-ox/CELL));
    const cMax=Math.min(state.cols-1,Math.floor((vpW-ox)/CELL));
    const rMin=Math.max(0,Math.floor(-oy/CELL));
    const rMax=Math.min(state.rows-1,Math.floor((vpH-oy)/CELL));
    for(let r=rMin;r<=rMax;r++) for(let c=cMin;c<=cMax;c++)
      state.fogMap[r][c]=true;
  }

  function _isVisible(r,c){ return state.fogMap[r][c]; }

  function _collectPiks(){
    const cell=state.map[state.player.row][state.player.col];
    COLORS.forEach(col=>{ state.player.piks[col]+=cell.piks[col]; cell.piks[col]=0; });
  }

  function _canEnter(r,c){
    if(r<0||r>=state.rows||c<0||c>=state.cols) return false;
    if(state.map[r][c].type!=='walk') return false;
    // エサ・宝物のいるマスには進入不可
    if(state&&state.foods&&state.foods.some(f=>f.row===r&&f.col===c)) return false;
    if(state&&state.treasures&&state.treasures.some(t=>t.row===r&&t.col===c)) return false;
    return true;
  }

  function _isReachableForAction(r,c){
    return Math.abs(r-state.player.row)<=1 && Math.abs(c-state.player.col)<=1;
  }

  function movePlayer(dr,dc){
    if(state.phase!=='player') return;
    if(state.movesLeft<=0){ _setMessage('移動回数を使い切りました。チェックでターン終了'); _render(); return; }
    const nr=state.player.row+dr, nc=state.player.col+dc;
    if(!_canEnter(nr,nc)){ _setMessage('そこには進めません'); _render(); return; }
    state.player.row=nr; state.player.col=nc;
    state.movesLeft--;
    _revealFogFromView();
    _collectPiks();
    if(state.movesLeft===0) _setMessage('アクション：pikを操作してチェックでターン終了');
    else _setMessage(`移動またはpik操作（残り移動${state.movesLeft}マス）`);
    _render();
  }

  function cellAction(r,c,zone){
    if(state.phase!=='player') return;
    if(!_isReachableForAction(r,c)){ _setMessage('操作できるのは隣接マス（斜め含む）のみです'); _render(); return; }
    const cell=state.map[r][c], type=cell.type;
    if(type==='wall'){ _setMessage('壁には操作できません'); _render(); return; }
    if(zone==='bottomright'){
      if(!COLORS.some(col=>cell.piks[col]>0)){ _setMessage('このマスにpikはいません'); _render(); return; }
      _triggerFlash(r,c,zone);
      COLORS.forEach(col=>{ state.player.piks[col]+=cell.piks[col]; cell.piks[col]=0; });
      _setMessage('pikを拾いました');
    }else{
      const colorMap={topleft:'red',topright:'yellow',bottomleft:'blue'};
      const color=colorMap[zone];
      const base=BASE_OF(type);
      if(base==='red'    &&color!=='red')    { _setMessage('赤マスには赤pikのみ置けます');  _render(); return; }
      if(base==='blue'   &&color!=='blue')   { _setMessage('青マスには青pikのみ置けます');  _render(); return; }
      if(base==='yellow' &&color!=='yellow') { _setMessage('黄マスには黄pikのみ置けます');  _render(); return; }
      if(state.player.piks[color]<=0){ _setMessage(`${_colorJa(color)}pikを持っていません`); _render(); return; }
      _triggerFlash(r,c,zone);
      state.player.piks[color]--; cell.piks[color]++;
      _setMessage(`${_colorJa(color)}pikを置きました`);
    }
    _render();
  }

  function _colorJa(c){ return {red:'赤',blue:'青',yellow:'黄'}[c]||c; }

  function endPlayerTurn(){
    if(state.phase!=='player') return;
    state.phase='pik'; _setMessage('pikターン中…'); _render();
    setTimeout(_runPikTurn, 400);
  }

  function skipMove(){
    if(state.phase!=='player') return;
    state.movesLeft=0;
    _setMessage('アクション：pikを操作してチェックでターン終了');
    _render();
  }

  function _runPikTurn(){
    const broken=[], damaged=[];
    for(let r=0;r<state.rows;r++) for(let c=0;c<state.cols;c++){
      const cell=state.map[r][c];
      if(!IS_CRACKED(cell.type)) continue;
      const dmg=cell.piks.red*2+cell.piks.blue+cell.piks.yellow;
      if(dmg<=0) continue;
      cell.hp=Math.max(0,cell.hp-dmg);
      damaged.push([r,c]);
      if(cell.hp===0) broken.push([r,c]);
    }
    for(const[r,c] of damaged) _triggerFlash(r,c,'cracked_hit');
    for(const[r,c] of broken) _breakAndChain(r,c);
    state.phase='enemy'; _setMessage('敵ターン中…');
    setTimeout(()=>{
      _runFoodTurn(()=>{
        _render(); setTimeout(_runEnemyTurn, 300);
      });
    }, 260);
  }

  // ===== エサターン =====
  // エサを1マス動かしてスタート到達チェック、到達リストを返す
  function _foodStep1(arrived){
    for(const food of state.foods){
      const fromCell=state.map[food.row][food.col];
      const total=fromCell.piks.red+fromCell.piks.blue+fromCell.piks.yellow;
      if(total<food.weight){ _dbgLog(`food#${food.id}(${food.color}w${food.weight}) skip pik=${total}<${food.weight}`); food._steps=0; continue; }
      food._steps=(total>=food.weight*2)?2:1;
      const next=_foodNextCell(food.row,food.col,food.color);
      if(next===null){ food._steps=0; continue; }
      const src=state.map[food.row][food.col];
      const dst=state.map[next[0]][next[1]];
      COLORS.forEach(col=>{ dst.piks[col]+=src.piks[col]; src.piks[col]=0; });
      _dbgLog(`food#${food.id}(${food.color}w${food.weight}) move1→(${next[0]},${next[1]})`);
      food.row=next[0]; food.col=next[1];
      if(food.row===state.startRow&&food.col===state.startCol) arrived.push(food);
    }
  }

  // 2マス移動のエサが残っていれば2歩目を動かす
  function _foodStep2(arrived){
    for(const food of state.foods){
      if(!food._steps||food._steps<2) continue;
      if(arrived.some(f=>f.id===food.id)) continue; // 既に到達済み
      const next=_foodNextCell(food.row,food.col,food.color);
      if(next===null) continue;
      const src=state.map[food.row][food.col];
      const dst=state.map[next[0]][next[1]];
      COLORS.forEach(col=>{ dst.piks[col]+=src.piks[col]; src.piks[col]=0; });
      _dbgLog(`food#${food.id}(${food.color}w${food.weight}) move2→(${next[0]},${next[1]})`);
      food.row=next[0]; food.col=next[1];
      if(food.row===state.startRow&&food.col===state.startCol) arrived.push(food);
    }
  }

  function _foodArrive(arrived){
    for(const food of arrived){
      state.map[state.startRow][state.startCol].piks[food.color]+=food.weight;
      _dbgLog(`food#${food.id}(${food.color}w${food.weight}) ARRIVED +${food.weight}pik`);
      state.foods=state.foods.filter(f=>f.id!==food.id);
    }
  }

  // エサターン：1歩目→描画→150ms→2歩目→描画→onDone
  function _runFoodTurn(onDone){
    const arrived=[];
    _foodStep1(arrived);
    _foodArrive(arrived);
    _render();
    // 2歩目が必要なエサがあれば待機してから実行
    const needStep2=state.foods.some(f=>f._steps===2);
    if(needStep2){
      setTimeout(()=>{
        const arrived2=[];
        _foodStep2(arrived2);
        _foodArrive(arrived2);
        _render();
        onDone();
      },150);
    } else {
      onDone();
    }
  }

  // ===== 宝物ターン =====
  function _treasureStep1(arrived){
    for(const t of state.treasures){
      const cell=state.map[t.row][t.col];
      const total=cell.piks.red+cell.piks.blue+cell.piks.yellow;
      if(total<t.weight){ t._steps=0; continue; }
      t._steps=(total>=t.weight*2)?2:1;
      const next=_treasureNextCell(t.row,t.col);
      if(next===null){ t._steps=0; continue; }
      const src=state.map[t.row][t.col];
      const dst=state.map[next[0]][next[1]];
      COLORS.forEach(col=>{ dst.piks[col]+=src.piks[col]; src.piks[col]=0; });
      t.row=next[0]; t.col=next[1];
      if(t.row===state.startRow&&t.col===state.startCol) arrived.push(t);
    }
  }

  function _treasureStep2(arrived){
    for(const t of state.treasures){
      if(!t._steps||t._steps<2) continue;
      if(arrived.some(a=>a.id===t.id)) continue;
      const next=_treasureNextCell(t.row,t.col);
      if(next===null) continue;
      const src=state.map[t.row][t.col];
      const dst=state.map[next[0]][next[1]];
      COLORS.forEach(col=>{ dst.piks[col]+=src.piks[col]; src.piks[col]=0; });
      t.row=next[0]; t.col=next[1];
      if(t.row===state.startRow&&t.col===state.startCol) arrived.push(t);
    }
  }

  function _runTreasureTurn(onDone){
    if(!state.treasures||state.treasures.length===0){ onDone(); return; }
    const arrived=[];
    _treasureStep1(arrived);
    // 到達した宝物を消滅
    for(const t of arrived){
      state.treasureArrived++;
      state.treasures=state.treasures.filter(x=>x.id!==t.id);
    }
    _render();
    const needStep2=state.treasures.some(t=>t._steps===2);
    if(needStep2){
      setTimeout(()=>{
        const arrived2=[];
        _treasureStep2(arrived2);
        for(const t of arrived2){
          state.treasureArrived++;
          state.treasures=state.treasures.filter(x=>x.id!==t.id);
        }
        _render();
        // 全宝物到達でクリア
        if(state.treasureTotal>0&&state.treasures.length===0){
          _setMessage('★ ステージクリア！全宝物をスタートに運びました ★');
        }
        onDone();
      },150);
    } else {
      if(state.treasureTotal>0&&state.treasures.length===0){
        _setMessage('★ ステージクリア！全宝物をスタートに運びました ★');
      }
      onDone();
    }
  }

  // 宝物の次の移動先（walkのみ通過可）
  function _treasureNextCell(fr,fc){
    const sr=state.startRow, sc=state.startCol;
    if(fr===sr&&fc===sc) return null;
    const key=(r,c)=>r*200+c;
    const visited=new Map();
    visited.set(key(fr,fc),null);
    const queue=[[fr,fc]];
    while(queue.length){
      const[r,c]=queue.shift();
      for(const[dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr, nc=c+dc;
        if(nr<0||nr>=state.rows||nc<0||nc>=state.cols) continue;
        if(visited.has(key(nr,nc))) continue;
        const cell=state.map[nr][nc];
        if(cell.type!=='walk') continue;
        // プレイヤー・他エサ・他宝物のいるマスは通過不可
        if(nr===state.player.row&&nc===state.player.col) continue;
        if(state.foods.some(f=>f.row===nr&&f.col===nc)) continue;
        if(state.treasures.some(t=>t.row===nr&&t.col===nc)) continue;
        visited.set(key(nr,nc),[r,c]);
        if(nr===sr&&nc===sc){
          let cur=[nr,nc];
          while(true){
            const prev=visited.get(key(cur[0],cur[1]));
            if(prev[0]===fr&&prev[1]===fc) return cur;
            cur=prev;
          }
        }
        queue.push([nr,nc]);
      }
    }
    return null;
  }

  // エサの次の移動先をBFS最短経路で1マス返す
  function _foodNextCell(fr,fc,foodColor){
    // BFSでスタートマスへの最短経路を探す
    // 通過可能条件:
    //   walk/cracked/色ヒビ壁: 常に通過可
    //   色壁(red/blue/yellow): そのマスのpikが全て同色であれば通過可
    const sr=state.startRow, sc=state.startCol;
    if(fr===sr&&fc===sc) return null;
    const key=(r,c)=>r*200+c;
    const visited=new Map();
    visited.set(key(fr,fc), null);
    const queue=[[fr,fc]];
    while(queue.length){
      const[r,c]=queue.shift();
      for(const[dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr, nc=c+dc;
        if(nr<0||nr>=state.rows||nc<0||nc>=state.cols) continue;
        if(visited.has(key(nr,nc))) continue;
        const cell=state.map[nr][nc];
        if(!_foodCanPass(cell,foodColor,nr,nc)) continue;
        // プレイヤーのいるマスは通過不可
        if(nr===state.player.row&&nc===state.player.col) continue;
        // 他エサのいるマスは通過不可
        if(state.foods.some(f=>f!==undefined&&f.row===nr&&f.col===nc)) continue;
        visited.set(key(nr,nc), [r,c]);
        if(nr===sr&&nc===sc){
          // 経路を逆トレースして最初の1歩を返す
          let cur=[nr,nc];
          while(true){
            const prev=visited.get(key(cur[0],cur[1]));
            if(prev[0]===fr&&prev[1]===fc) return cur;
            cur=prev;
          }
        }
        queue.push([nr,nc]);
      }
    }
    return null; // 経路なし
  }

  function _foodCanPass(cell,foodColor,nr,nc){
    const t=cell.type;
    // walk のみ無条件通過
    if(t==='walk') return true;
    // 色壁: そのマスのpikが全て同色なら通過可
    if(t==='red'||t==='blue'||t==='yellow'){
      const total=cell.piks.red+cell.piks.blue+cell.piks.yellow;
      if(total===0){ _dbgLog(`canPass(${nr},${nc}) BLOCK color-wall ${t} no-pik`); return false; }
      const ok=cell.piks[t]===total;
      if(!ok) _dbgLog(`canPass(${nr},${nc}) BLOCK color-wall ${t} mixed-pik`);
      return ok;
    }
    // それ以外（wall/cracked/色ヒビ壁）はすべて通過不可
    _dbgLog(`canPass(${nr},${nc}) BLOCK ${t}`);
    return false;
  }

  function _breakAndChain(r,c){
    const cell=state.map[r][c];
    if(!IS_CRACKED(cell.type)) return;
    const chainTarget=BASE_OF(cell.type);
    cell.type='walk'; cell.hp=null;
    if(chainTarget==='walk') return;
    const queue=[[r,c]], visited=new Set([`${r},${c}`]);
    while(queue.length){
      const[cr,cc]=queue.shift();
      for(const[dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=cr+dr, nc=cc+dc, key=`${nr},${nc}`;
        if(visited.has(key)) continue;
        if(nr<0||nr>=state.rows||nc<0||nc>=state.cols) continue;
        visited.add(key);
        const nb=state.map[nr][nc];
        if(nb.type===chainTarget){ nb.type='walk'; nb.hp=null; queue.push([nr,nc]); }
      }
    }
  }

  function _runEnemyTurn(){
    state.phase='player'; state.movesLeft=MOVE_LIMIT; state.turn++;
    _setMessage(`ターン ${state.turn} — 移動またはpik操作（残り移動3マス）`); _render();
  }

  function _getLayout(canvas){
    const CELL = Math.floor(canvas.width / VIEW_TILES);
    let ox = canvas.width/2  - (state.player.col+0.5)*CELL;
    let oy = canvas.height/2 - (state.player.row+0.5)*CELL;
    ox = Math.min(0, Math.max(canvas.width  - CELL*state.cols, ox));
    oy = Math.min(0, Math.max(canvas.height - CELL*state.rows, oy));
    return {CELL,ox,oy};
  }

  function _render(){
    const canvas=document.getElementById('piktorioCanvas');
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const {CELL,ox,oy}=_getLayout(canvas);
    const vpW=canvas.width, vpH=canvas.height;
    ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,vpW,vpH);
    for(let r=0;r<state.rows;r++) for(let c=0;c<state.cols;c++){
      const x=ox+c*CELL, y=oy+r*CELL;
      if(x+CELL<0||x>vpW||y+CELL<0||y>vpH) continue;
      _drawCell(ctx,r,c,x,y,CELL);
    }
    if(state.phase==='player'&&state.movesLeft>0) _drawReachable(ctx,CELL,ox,oy);
    if(state.phase==='player') _drawActionButtons(ctx,CELL,ox,oy);
    _drawPlayer(ctx,CELL,ox,oy);
    const pr=state.player.row, pc=state.player.col;
    const cellX=ox+pc*CELL, cellY=oy+pr*CELL;
    if(state.phase==='player'){
      if(state.movesLeft>0){
        [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dc,dr])=>_drawArrow(ctx,cellX,cellY,CELL,dc,dr));
        _drawCheckmark(ctx,cellX,cellY,CELL);
      } else {
        // 移動残り0: 中央チェックマーク＋4方向チェックマーク（全部ターン終了）
        _drawCheckmark(ctx,cellX,cellY,CELL);
        [[0,-2],[0,2],[-2,0],[2,0]].forEach(([dc,dr])=>_drawEndTurnButton(ctx,cellX,cellY,CELL,dc,dr));
      }
    }
    _drawMinimap(ctx,canvas);
    _updateUI();
  }

  function _drawCell(ctx,r,c,x,y,CELL){
    const cell=state.map[r][c];
    if(!_isVisible(r,c)){ ctx.fillStyle='#0a0a0a'; ctx.fillRect(x,y,CELL,CELL); return; }
    const crackHit = IS_CRACKED(cell.type) && _isFlashing(r,c,'cracked_hit');
    ctx.fillStyle = crackHit ? '#ffffff' : (TILE_FILL[cell.type]||'#333');
    ctx.fillRect(x,y,CELL,CELL);
    if(r===state.startRow&&c===state.startCol){
      ctx.strokeStyle='rgba(255,255,255,0.7)';
      ctx.lineWidth=Math.max(3,CELL*0.10);
      ctx.strokeRect(x+1,y+1,CELL-2,CELL-2);
    }
    if(IS_CRACKED(cell.type) && !crackHit){
      _drawHpGauge(ctx,x,y,CELL,cell.hp,cell.type);
    }
    const fs=Math.max(7,Math.floor(CELL*0.26)); ctx.font=`bold ${fs}px monospace`;
    if(cell.piks.red>0)    { ctx.fillStyle='#ff9999'; ctx.fillText(cell.piks.red,    x+2,y+fs+1); }
    if(cell.piks.yellow>0) { ctx.fillStyle='#ffee44'; ctx.fillText(cell.piks.yellow, x+CELL-ctx.measureText(cell.piks.yellow).width-2,y+fs+1); }
    if(cell.piks.blue>0)   { ctx.fillStyle='#88ccff'; ctx.fillText(cell.piks.blue,   x+2,y+CELL-3); }
    // エサ描画
    for(const food of state.foods){
      if(food.row===r&&food.col===c) _drawFood(ctx,x,y,CELL,food);
    }
    // 宝物描画
    for(const t of (state.treasures||[])){
      if(t.row===r&&t.col===c) _drawTreasure(ctx,x,y,CELL,t);
    }
  }

  // ===== エサ描画 =====
  function _drawFood(ctx,x,y,CELL,food){
    const cx=x+CELL/2, cy=y+CELL/2;
    const r=CELL*0.30;
    // 影
    ctx.beginPath(); ctx.arc(cx+1,cy+2,r,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();
    // 塗り
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle=FOOD_COLOR_FILL[food.color]||'#888'; ctx.fill();
    // 縁
    ctx.strokeStyle=FOOD_COLOR_STROKE[food.color]||'#ccc';
    ctx.lineWidth=Math.max(1,CELL*0.05); ctx.stroke();
    // 重さ数字
    const fs=Math.max(7,Math.floor(CELL*0.28));
    ctx.font=`bold ${fs}px monospace`;
    ctx.fillStyle='#fff';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(String(food.weight),cx,cy+1);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }

  function _drawHpGauge(ctx,x,y,CELL,hp,type){
    if(hp===null||hp<=0) return;
    const maxHp=type==='cracked'?CRACKED_HP:COLOR_CRACKED_HP;
    const ratio=hp/maxHp;
    const cx=x+CELL/2, cy=y+CELL/2, r=CELL*0.28;
    const sc=GAUGE_STROKE[type]||'rgba(255,255,255,0.85)';
    const lw=Math.max(0.5,CELL*0.022);
    ctx.strokeStyle=sc; ctx.lineWidth=lw; ctx.lineCap='round';
    if(ratio>=0.9999){
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    }else{
      const startA=-Math.PI/2;
      const endA=startA - Math.PI*2*ratio;
      ctx.beginPath(); ctx.arc(cx,cy,r,startA,endA,true); ctx.stroke();
      const x1=cx+r*Math.cos(startA), y1=cy+r*Math.sin(startA);
      const x2=cx+r*Math.cos(endA),   y2=cy+r*Math.sin(endA);
      ctx.beginPath();
      ctx.moveTo(cx,cy); ctx.lineTo(x1,y1);
      ctx.moveTo(cx,cy); ctx.lineTo(x2,y2);
      ctx.stroke();
    }
  }

  // ===== 宝物描画 =====
  function _drawTreasure(ctx,x,y,CELL,t){
    const cx=x+CELL/2, cy=y+CELL/2;
    const r=CELL*0.32;
    // 影
    ctx.beginPath(); ctx.arc(cx+1,cy+2,r,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();
    // 白円
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fill();
    ctx.strokeStyle='rgba(200,200,255,0.8)';
    ctx.lineWidth=Math.max(1,CELL*0.05); ctx.stroke();
    // ★と重さ数字
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#e8d020';
    ctx.font=`bold ${Math.max(8,Math.floor(CELL*0.28))}px monospace`;
    ctx.fillText('★',cx,cy-CELL*0.06);
    ctx.fillStyle='#333';
    ctx.font=`bold ${Math.max(6,Math.floor(CELL*0.20))}px monospace`;
    ctx.fillText(String(t.weight),cx,cy+CELL*0.14);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.restore();
  }

  function _drawActionButtons(ctx,CELL,ox,oy){
    const pr=state.player.row, pc=state.player.col;
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      if(dr===0&&dc===0) continue;
      const r=pr+dr, c=pc+dc;
      if(r<0||r>=state.rows||c<0||c>=state.cols) continue;
      const cell=state.map[r][c], type=cell.type;
      if(type==='wall') continue;
      _drawCellActionButtons(ctx,ox+c*CELL,oy+r*CELL,CELL,r,c,type,cell);
    }
  }

  function _drawCellActionButtons(ctx,x,y,CELL,r,c,type,cell){
    const q=CELL/4, base=BASE_OF(type);
    const baseR=CELL*0.19;
    const buttons=[
      {zone:'topleft',    cx:x+q,   cy:y+q,   color:'red',    bgN:'rgba(200,60,60,0.75)',  bgF:'rgba(255,140,140,0.97)'},
      {zone:'topright',   cx:x+3*q, cy:y+q,   color:'yellow', bgN:'rgba(180,160,10,0.75)', bgF:'rgba(255,245,60,0.97)'},
      {zone:'bottomleft', cx:x+q,   cy:y+3*q, color:'blue',   bgN:'rgba(30,110,210,0.75)', bgF:'rgba(80,190,255,0.97)'},
      {zone:'bottomright',cx:x+3*q, cy:y+3*q, color:null,     bgN:'rgba(140,140,140,0.6)', bgF:'rgba(255,255,255,0.97)'},
    ];
    for(const btn of buttons){
      if(btn.zone==='bottomright'){
        if(type==='wall') continue;
        if(!COLORS.some(col=>cell.piks[col]>0)) continue;
      }else{
        if(base==='red'    &&btn.color!=='red')    continue;
        if(base==='blue'   &&btn.color!=='blue')   continue;
        if(base==='yellow' &&btn.color!=='yellow') continue;
        if(state.player.piks[btn.color]<=0) continue;
      }
      const fl=_isFlashing(r,c,btn.zone);
      const btnR=fl ? baseR*1.55 : baseR;
      const bg=fl ? btn.bgF : btn.bgN;
      ctx.beginPath(); ctx.arc(btn.cx,btn.cy,btnR,0,Math.PI*2);
      ctx.fillStyle=bg; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=0.8; ctx.stroke();
      if(btn.zone==='bottomright'){
        const hs=btnR*0.52;
        ctx.save();
        ctx.strokeStyle=fl?'rgba(0,0,0,0.9)':'rgba(255,255,255,0.9)';
        ctx.lineWidth=btnR*0.32; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(btn.cx-hs,btn.cy-hs); ctx.lineTo(btn.cx+hs,btn.cy+hs);
        ctx.moveTo(btn.cx+hs,btn.cy-hs); ctx.lineTo(btn.cx-hs,btn.cy+hs);
        ctx.stroke(); ctx.restore();
      }else{
        ctx.beginPath(); ctx.arc(btn.cx,btn.cy,btnR*0.38,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.fill();
      }
    }
  }

  function _drawReachable(ctx,CELL,ox,oy){
    _bfsReachable(state.player.row,state.player.col,state.movesLeft).forEach(([r,c])=>{
      ctx.fillStyle='rgba(255,255,180,0.2)'; ctx.fillRect(ox+c*CELL,oy+r*CELL,CELL,CELL);
    });
  }
  function _bfsReachable(sR,sC,steps){
    const vis=new Set([`${sR},${sC}`]), q=[[sR,sC,steps]], res=[];
    while(q.length){ const[r,c,left]=q.shift(); if(!left) continue;
      for(const[dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc,k=`${nr},${nc}`;
        if(!vis.has(k)&&_canEnter(nr,nc)){ vis.add(k); res.push([nr,nc]); q.push([nr,nc,left-1]); }
      }
    } return res;
  }

  function _drawPlayer(ctx,CELL,ox,oy){
    const{row,col,piks}=state.player;
    const x=ox+col*CELL, y=oy+row*CELL, cx=x+CELL/2, cy=y+CELL/2, r=CELL*0.28;
    ctx.beginPath(); ctx.arc(cx+1,cy+2,r,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='#f0efe0'; ctx.fill();
    ctx.strokeStyle='#999'; ctx.lineWidth=1.5; ctx.stroke();
    const fs=Math.max(7,Math.floor(CELL*0.24)); ctx.font=`bold ${fs}px monospace`;
    if(piks.red>0)    { ctx.fillStyle='#ff9999'; ctx.fillText(piks.red,    x+2,y+fs+1); }
    if(piks.yellow>0) { ctx.fillStyle='#ffee44'; ctx.fillText(piks.yellow, x+CELL-ctx.measureText(piks.yellow).width-2,y+fs+1); }
    if(piks.blue>0)   { ctx.fillStyle='#88ccff'; ctx.fillText(piks.blue,   x+2,y+CELL-3); }
  }

  function _drawArrow(ctx,cellX,cellY,CELL,dcol,drow){
    const nr=state.player.row+drow, nc=state.player.col+dcol;
    if(!_canEnter(nr,nc)) return;
    const fl=_isFlashing(nr,nc,'arrow');
    const cx=cellX+CELL/2+dcol*2*CELL, cy=cellY+CELL/2+drow*2*CELL;
    const s=CELL*(fl ? 0.30 : 0.20);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.atan2(drow,dcol)+Math.PI/2);
    ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.7,s*0.55); ctx.lineTo(-s*0.7,s*0.55); ctx.closePath();
    ctx.fillStyle=fl?'rgba(255,255,120,0.99)':'rgba(255,255,220,0.88)'; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }

  // ターン終了ボタン（movesLeft===0のとき4方向に表示）
  function _drawEndTurnButton(ctx,cellX,cellY,CELL,dcol,drow){
    const cx=cellX+CELL/2+dcol*CELL, cy=cellY+CELL/2+drow*CELL;
    const s=CELL*0.22;
    // 緑円
    ctx.beginPath(); ctx.arc(cx,cy,s*1.1,0,Math.PI*2);
    ctx.fillStyle='rgba(40,160,40,0.72)'; ctx.fill();
    // チェック記号
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=s*0.4;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(cx-s*0.45,cy); ctx.lineTo(cx-s*0.1,cy+s*0.45); ctx.lineTo(cx+s*0.48,cy-s*0.42);
    ctx.stroke(); ctx.restore();
  }

  function _drawCheckmark(ctx,cellX,cellY,CELL){
    const cx=cellX+CELL/2, cy=cellY+CELL/2, s=CELL*0.22;
    ctx.beginPath(); ctx.arc(cx,cy,s*1.1,0,Math.PI*2);
    ctx.fillStyle='rgba(40,160,40,0.72)'; ctx.fill();
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=s*0.4;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(cx-s*0.45,cy); ctx.lineTo(cx-s*0.1,cy+s*0.45); ctx.lineTo(cx+s*0.48,cy-s*0.42);
    ctx.stroke(); ctx.restore();
  }
  function _hitCheckmark(px,py,cellX,cellY,CELL){
    const cx=cellX+CELL/2, cy=cellY+CELL/2, r=CELL*0.32;
    return (px-cx)**2+(py-cy)**2<=r*r;
  }

  function _drawMinimap(ctx,canvas){
    const M=MINI_PX, PAD=6;
    const mW=state.cols*M, mH=state.rows*M;
    const mx=canvas.width-mW-PAD, my=canvas.height-mH-PAD;
    ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(mx-2,my-2,mW+4,mH+4);
    for(let r=0;r<state.rows;r++) for(let c=0;c<state.cols;c++){
      const cell=state.map[r][c], x=mx+c*M, y=my+r*M;
      if(!_isVisible(r,c)){ ctx.fillStyle='#111'; ctx.fillRect(x,y,M,M); continue; }
      if(r===state.startRow&&c===state.startCol){
        ctx.fillStyle='#ffffff'; ctx.fillRect(x,y,M,M);
      }else{
        ctx.fillStyle=MINI_FILL[cell.type]||'#444'; ctx.fillRect(x,y,M,M);
      }
      if(cell.piks.red>0||cell.piks.blue>0||cell.piks.yellow>0){
        let dc='#fff';
        if(cell.piks.red>0) dc='#ff8888'; else if(cell.piks.yellow>0) dc='#ffee44'; else dc='#66aaff';
        ctx.beginPath(); ctx.arc(x+M*0.5,y+M*0.5,M*0.3,0,Math.PI*2); ctx.fillStyle=dc; ctx.fill();
      }
    }
    const px=mx+state.player.col*M+M*0.5, py=my+state.player.row*M+M*0.5;
    ctx.beginPath(); ctx.arc(px,py,M*0.65,0,Math.PI*2); ctx.fillStyle='#f0efe0'; ctx.fill();
    ctx.strokeStyle='#333'; ctx.lineWidth=0.8; ctx.stroke();
    // 宝物カウンタをミニマップの上に表示
    if(state.treasureTotal>0){
      const total=state.treasureTotal, arrived=state.treasureArrived;
      const label=`★ ${arrived}/${total}`;
      const fs=Math.max(9,M*2.5);
      ctx.font=`bold ${fs}px monospace`;
      ctx.textAlign='right';
      ctx.fillStyle=arrived===total?'#ffe040':'rgba(255,255,255,0.85)';
      ctx.fillText(label, mx+mW, my-3);
      ctx.textAlign='left';
    }
  }

  function _setMessage(msg){ state.message=msg; const el=document.getElementById('piktorioMessage'); if(el) el.textContent=msg; }

  function _updateUI(){
    const names={player:'プレイヤーターン',pik:'pikターン',enemy:'敵ターン'};
    const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    set('piktorioPhase',names[state.phase]||state.phase);
    set('piktorioTurn',`${state.turn}`);
    set('piktorioMoves',state.phase==='player'?`${state.movesLeft}`:'—');
    set('piktorioMessage',state.message);
  }

  function _bindKeys(){
    if(_bindKeys._done) return; _bindKeys._done=true;
    document.addEventListener('keydown',e=>{
      if(!state) return;
      const dirs={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],w:[-1,0],s:[1,0],a:[0,-1],d:[0,1]};
      if(dirs[e.key]){ e.preventDefault(); movePlayer(...dirs[e.key]); }
      if(e.key===' '||e.key==='Enter'){ e.preventDefault();
        if(state.phase==='player'&&state.movesLeft>0) skipMove();
        else if(state.phase==='player')               endPlayerTurn(); }
    });
  }

  function _pixelToCell(clientX,clientY){
    const canvas=document.getElementById('piktorioCanvas');
    const rect=canvas.getBoundingClientRect();
    const px=(clientX-rect.left)*(canvas.width/rect.width);
    const py=(clientY-rect.top)*(canvas.height/rect.height);
    const{CELL,ox,oy}=_getLayout(canvas);
    const c=Math.floor((px-ox)/CELL), r=Math.floor((py-oy)/CELL);
    const lx=(px-ox)-c*CELL, ly=(py-oy)-r*CELL;
    return{r,c,lx,ly,CELL,px,py,ox,oy};
  }

  function handleCanvasClick(e){
    if(!state) return; e.preventDefault&&e.preventDefault();
    const{r,c,lx,ly,CELL,px,py,ox,oy}=_pixelToCell(e.clientX,e.clientY);
    const pr=state.player.row, pc=state.player.col;
    const cellX=ox+pc*CELL, cellY=oy+pr*CELL;
    if(state.phase==='player'&&_hitCheckmark(px,py,cellX,cellY,CELL)){
      endPlayerTurn();
      return;
    }
    if(state.phase==='player'){
      if(r<0||r>=state.rows||c<0||c>=state.cols) return;
      const dr=r-pr, dc_=c-pc;
      // 矢印は2マス先に描画。タップ先が同軸1〜2マス先なら隣1マスへ移動
      const adR=Math.abs(dr), adC=Math.abs(dc_);
      const isOuterButton=(adR===0&&adC===2)||(adC===0&&adR===2);
      if(isOuterButton){
        if(state.movesLeft>0){
          // 矢印ボタン: 移動
          const mdr=dr===0?0:(dr>0?1:-1), mdc=dc_===0?0:(dc_>0?1:-1);
          if(_canEnter(state.player.row+mdr,state.player.col+mdc)){
            _triggerFlash(state.player.row+mdr,state.player.col+mdc,'arrow');
            movePlayer(mdr,mdc);
            return;
          }
        } else {
          // ターン終了ボタン
          endPlayerTurn();
          return;
        }
      }
      if(Math.abs(dr)<=1&&Math.abs(dc_)<=1&&!(dr===0&&dc_===0)){
        const half=CELL/2;
        let zone;
        if(lx<half&&ly<half)       zone='topleft';
        else if(lx>=half&&ly<half) zone='topright';
        else if(lx<half&&ly>=half) zone='bottomleft';
        else                       zone='bottomright';
        cellAction(r,c,zone);
      }
    }
  }

  return{init,movePlayer,cellAction,endPlayerTurn,skipMove,handleCanvasClick};
})();
