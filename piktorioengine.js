// piktorioengine.js — Piktorioゲームエンジン v0.11

const Piktorioengine = (() => {

  const COLORS      = ['red','blue','yellow'];
  const MOVE_LIMIT  = 3;
  const CRACKED_HP       = 100;
  const COLOR_CRACKED_HP =  40;

  const CRACKED_BASE = { cracked:'walk', red_cracked:'red', blue_cracked:'blue', yellow_cracked:'yellow' };
  const IS_CRACKED   = t => t in CRACKED_BASE;
  const BASE_OF      = t => CRACKED_BASE[t] || t;
  // 色ヒビ壁が0になったら通路（walkに）
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

  // 表示マス数（メインマップは常にこのマス数分を表示）
  const VIEW_TILES = 10;
  // ミニマップ1マスのpx
  const MINI_PX = 4;

  let state = null;

  // ===== フラッシュ管理 =====
  // key -> { end: timestamp }
  const _flash = {};
  function _fkey(r,c,zone){ return `${r},${c},${zone}`; }

  function _triggerFlash(r,c,zone){
    _flash[_fkey(r,c,zone)] = { end: Date.now()+220 };
    // 即再描画してフラッシュ開始を見せる
    if(state) _render();
    // フラッシュ終了後に再描画
    setTimeout(()=>{ if(state) _render(); }, 240);
  }

  function _isFlashing(r,c,zone){
    const f = _flash[_fkey(r,c,zone)];
    return f != null && Date.now() < f.end;
  }

  // ===== 初期化 =====
  function init(mapData){
    const rows=mapData.tiles.length, cols=mapData.tiles[0].length;
    const fogRadius=Math.sqrt((rows/2)**2+(cols/2)**2)+1;
    const tiles=mapData.tiles.map(row=>row.map(cell=>({
      type:cell.type,
      piks:{red:cell.piks?.red||0, blue:cell.piks?.blue||0, yellow:cell.piks?.yellow||0},
      hp:IS_CRACKED(cell.type)?(cell.hp??DEFAULT_HP(cell.type)):null,
    })));
    const fogMap=Array.from({length:rows},()=>new Array(cols).fill(Infinity));
    state={rows,cols,map:tiles,fogMap,fogRadius,
      startRow:mapData.playerStart[0], startCol:mapData.playerStart[1],
      player:{row:mapData.playerStart[0], col:mapData.playerStart[1], piks:{red:0,blue:0,yellow:0}},
      phase:'player_move', movesLeft:MOVE_LIMIT, turn:1, message:'移動してください'};
    _revealFog(state.player.row,state.player.col);
    _collectPiks();
    _render();
    _bindKeys();
  }

  function _revealFog(r,c){
    const R=state.fogRadius, R2=R*R, ri=Math.ceil(R);
    for(let dr=-ri;dr<=ri;dr++) for(let dc=-ri;dc<=ri;dc++){
      const d2=dr*dr+dc*dc; if(d2>R2) continue;
      const nr=r+dr, nc=c+dc;
      if(nr>=0&&nr<state.rows&&nc>=0&&nc<state.cols&&d2<state.fogMap[nr][nc])
        state.fogMap[nr][nc]=d2;
    }
  }

  function _isVisible(r,c){ return state.fogMap[r][c]<Infinity; }

  function _collectPiks(){
    const cell=state.map[state.player.row][state.player.col];
    COLORS.forEach(col=>{ state.player.piks[col]+=cell.piks[col]; cell.piks[col]=0; });
  }

  function _canEnter(r,c){
    if(r<0||r>=state.rows||c<0||c>=state.cols) return false;
    return state.map[r][c].type==='walk';
  }

  function _isReachableForAction(r,c){
    return Math.abs(r-state.player.row)<=1 && Math.abs(c-state.player.col)<=1;
  }

  // ===== 移動 =====
  function movePlayer(dr,dc){
    if(state.phase!=='player_move') return;
    if(state.movesLeft<=0){ _enterActionPhase(); return; }
    const nr=state.player.row+dr, nc=state.player.col+dc;
    if(!_canEnter(nr,nc)){ _setMessage('そこには進めません'); _render(); return; }
    state.player.row=nr; state.player.col=nc; state.movesLeft--;
    _revealFog(nr,nc); _collectPiks();
    if(state.movesLeft===0) _enterActionPhase();
    else{ _setMessage(`移動してください（残り${state.movesLeft}マス）`); _render(); }
  }

  function _enterActionPhase(){
    state.phase='player_action';
    _setMessage('アクション：各マスの隅をタップしてpikを操作'); _render();
  }

  // ===== アクション =====
  function cellAction(r,c,zone){
    if(state.phase!=='player_action') return;
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
    if(state.phase!=='player_action') return;
    state.phase='pik'; _setMessage('pikターン中…'); _render();
    setTimeout(_runPikTurn, 400);
  }

  function skipMove(){
    if(state.phase!=='player_move') return; _enterActionPhase();
  }

  // ===== pikターン =====
  function _runPikTurn(){
    const broken=[];
    for(let r=0;r<state.rows;r++) for(let c=0;c<state.cols;c++){
      const cell=state.map[r][c];
      if(!IS_CRACKED(cell.type)) continue;
      const dmg=cell.piks.red*2+cell.piks.blue+cell.piks.yellow;
      if(dmg<=0) continue;
      cell.hp=Math.max(0,cell.hp-dmg);
      if(cell.hp===0) broken.push([r,c]);
    }
    for(const[r,c] of broken) _breakAndChain(r,c);
    state.phase='enemy'; _setMessage('敵ターン中…'); _render();
    setTimeout(_runEnemyTurn, 400);
  }

  // ヒビ壁を壊す：すべての種類→walk。色ヒビの場合は同色タイルも連鎖通路化
  function _breakAndChain(r,c){
    const cell=state.map[r][c];
    if(!IS_CRACKED(cell.type)) return;
    const chainTarget=BASE_OF(cell.type); // 'walk' or 'red'/'blue'/'yellow'
    cell.type='walk'; cell.hp=null;       // ヒビ壁自体→通路

    if(chainTarget==='walk') return;      // 無色ヒビは連鎖なし

    // 同色の非ヒビタイルをBFSで通路化
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
    state.phase='player_move'; state.movesLeft=MOVE_LIMIT; state.turn++;
    _setMessage(`ターン ${state.turn} — 移動してください（残り3マス）`); _render();
  }

  // ===== レイアウト：メインマップは常に VIEW_TILES×VIEW_TILES マスを表示 =====
  function _getLayout(canvas){
    // セルサイズ = キャンバスサイズ / VIEW_TILES
    const CELL = Math.floor(canvas.width / VIEW_TILES);
    // プレイヤーを中心に、VIEW_TILESマス分の範囲を表示
    const half = VIEW_TILES / 2;
    let ox = canvas.width/2  - (state.player.col+0.5)*CELL;
    let oy = canvas.height/2 - (state.player.row+0.5)*CELL;
    // マップ端でクランプ
    ox = Math.min(0, Math.max(canvas.width  - CELL*state.cols, ox));
    oy = Math.min(0, Math.max(canvas.height - CELL*state.rows, oy));
    return {CELL,ox,oy};
  }

  // ===== レンダリング =====
  function _render(){
    const canvas=document.getElementById('piktorioCanvas');
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const {CELL,ox,oy}=_getLayout(canvas);
    const vpW=canvas.width, vpH=canvas.height;

    ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,vpW,vpH);

    // メインマップ
    for(let r=0;r<state.rows;r++) for(let c=0;c<state.cols;c++){
      const x=ox+c*CELL, y=oy+r*CELL;
      if(x+CELL<0||x>vpW||y+CELL<0||y>vpH) continue;
      _drawCell(ctx,r,c,x,y,CELL);
    }

    if(state.phase==='player_move'&&state.movesLeft>0) _drawReachable(ctx,CELL,ox,oy);
    if(state.phase==='player_action') _drawActionButtons(ctx,CELL,ox,oy);

    _drawPlayer(ctx,CELL,ox,oy);

    const pr=state.player.row, pc=state.player.col;
    const cellX=ox+pc*CELL, cellY=oy+pr*CELL;
    if(state.phase==='player_move'){
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dc,dr])=>_drawArrow(ctx,cellX,cellY,CELL,dc,dr));
      _drawCheckmark(ctx,cellX,cellY,CELL);
    }
    if(state.phase==='player_action') _drawCheckmark(ctx,cellX,cellY,CELL);

    _drawMinimap(ctx,canvas);
    _updateUI();
  }

  // ===== タイル描画 =====
  function _drawCell(ctx,r,c,x,y,CELL){
    const cell=state.map[r][c];
    if(!_isVisible(r,c)){ ctx.fillStyle='#0a0a0a'; ctx.fillRect(x,y,CELL,CELL); return; }

    ctx.fillStyle=TILE_FILL[cell.type]||'#333';
    ctx.fillRect(x,y,CELL,CELL);

    // スタートマス白枠
    if(r===state.startRow&&c===state.startCol){
      ctx.strokeStyle='rgba(255,255,255,0.7)';
      ctx.lineWidth=Math.max(1.5,CELL*0.05);
      ctx.strokeRect(x+1,y+1,CELL-2,CELL-2);
    }

    if(IS_CRACKED(cell.type)){
      _drawCrackPattern(ctx,x,y,CELL,cell.hp,cell.type);
      _drawHpGauge(ctx,x,y,CELL,cell.hp,cell.type);
    }

    const fs=Math.max(7,Math.floor(CELL*0.26)); ctx.font=`bold ${fs}px monospace`;
    if(cell.piks.red>0)    { ctx.fillStyle='#ff9999'; ctx.fillText(cell.piks.red,    x+2,y+fs+1); }
    if(cell.piks.yellow>0) { ctx.fillStyle='#ffee44'; ctx.fillText(cell.piks.yellow, x+CELL-ctx.measureText(cell.piks.yellow).width-2,y+fs+1); }
    if(cell.piks.blue>0)   { ctx.fillStyle='#88ccff'; ctx.fillText(cell.piks.blue,   x+2,y+CELL-3); }
  }

  // ===== ヒビ模様 =====
  function _drawCrackPattern(ctx,x,y,CELL,hp,type){
    const maxHp=type==='cracked'?CRACKED_HP:COLOR_CRACKED_HP;
    const intensity=1-(hp??maxHp)/maxHp;
    ctx.save();
    ctx.beginPath(); ctx.rect(x,y,CELL,CELL); ctx.clip();
    ctx.strokeStyle=`rgba(255,220,130,${0.5+intensity*0.45})`;
    ctx.lineWidth=Math.max(1,CELL*0.06);
    ctx.lineCap='round';
    const cx=x+CELL/2, cy=y+CELL/2;
    const cracks=[
      [[cx,cy],[cx-CELL*0.32,cy-CELL*0.38]],
      [[cx,cy],[cx+CELL*0.28,cy-CELL*0.32]],
      [[cx,cy],[cx+CELL*0.12,cy+CELL*0.42]],
      [[cx,cy],[cx-CELL*0.22,cy+CELL*0.32]],
    ];
    const count=Math.max(1, 1+Math.floor(intensity*(cracks.length-1)));
    for(let i=0;i<count;i++){
      ctx.beginPath();
      ctx.moveTo(cracks[i][0][0],cracks[i][0][1]);
      ctx.lineTo(cracks[i][1][0],cracks[i][1][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===== 円グラフ =====
  // 100%   → 完全な弧（線のみ）
  // <100%  → 扇形の輪郭線のみ（塗り潰しなし）
  function _drawHpGauge(ctx,x,y,CELL,hp,type){
    if(hp===null||hp<=0) return;
    const maxHp=type==='cracked'?CRACKED_HP:COLOR_CRACKED_HP;
    const ratio=hp/maxHp;
    const cx=x+CELL/2, cy=y+CELL/2, r=CELL*0.28;
    const sc=GAUGE_STROKE[type]||'rgba(255,255,255,0.85)';
    const lw=Math.max(0.5,CELL*0.022);

    ctx.strokeStyle=sc; ctx.lineWidth=lw; ctx.lineCap='round';

    if(ratio>=0.9999){
      // 100%：完全な円弧
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    }else{
      // <100%：扇形の輪郭のみ（塗り潰しなし）
      const startA=-Math.PI/2;
      const endA=startA - Math.PI*2*ratio; // 反時計回り
      // 弧
      ctx.beginPath(); ctx.arc(cx,cy,r,startA,endA,true); ctx.stroke();
      // 中心から弧の両端への2辺
      const x1=cx+r*Math.cos(startA), y1=cy+r*Math.sin(startA);
      const x2=cx+r*Math.cos(endA),   y2=cy+r*Math.sin(endA);
      ctx.beginPath();
      ctx.moveTo(cx,cy); ctx.lineTo(x1,y1);
      ctx.moveTo(cx,cy); ctx.lineTo(x2,y2);
      ctx.stroke();
    }
  }

  // ===== アクションボタン =====
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
      // フラッシュ中：1.55倍に拡大
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

  // ===== 矢印：フラッシュ時に拡大 =====
  function _drawArrow(ctx,cellX,cellY,CELL,dcol,drow){
    const nr=state.player.row+drow, nc=state.player.col+dcol;
    if(!_canEnter(nr,nc)) return;
    const fl=_isFlashing(nr,nc,'arrow');
    const cx=cellX+CELL/2+dcol*CELL, cy=cellY+CELL/2+drow*CELL;
    const s=CELL*(fl ? 0.30 : 0.20);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.atan2(drow,dcol)+Math.PI/2);
    ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.7,s*0.55); ctx.lineTo(-s*0.7,s*0.55); ctx.closePath();
    ctx.fillStyle=fl?'rgba(255,255,120,0.99)':'rgba(255,255,220,0.88)'; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
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

  // ===== ミニマップ（全マスを MINI_PX px で表示） =====
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
    // プレイヤー
    const px=mx+state.player.col*M+M*0.5, py=my+state.player.row*M+M*0.5;
    ctx.beginPath(); ctx.arc(px,py,M*0.65,0,Math.PI*2); ctx.fillStyle='#f0efe0'; ctx.fill();
    ctx.strokeStyle='#333'; ctx.lineWidth=0.8; ctx.stroke();
  }

  function _setMessage(msg){ state.message=msg; const el=document.getElementById('piktorioMessage'); if(el) el.textContent=msg; }

  function _updateUI(){
    const names={player_move:'移動フェーズ',player_action:'アクションフェーズ',pik:'pikターン',enemy:'敵ターン'};
    const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    set('piktorioPhase',names[state.phase]||state.phase);
    set('piktorioTurn',`${state.turn}`);
    set('piktorioMoves',state.phase==='player_move'?`${state.movesLeft}`:'—');
    set('piktorioMessage',state.message);
  }

  function _bindKeys(){
    if(_bindKeys._done) return; _bindKeys._done=true;
    document.addEventListener('keydown',e=>{
      if(!state) return;
      const dirs={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],w:[-1,0],s:[1,0],a:[0,-1],d:[0,1]};
      if(dirs[e.key]){ e.preventDefault(); movePlayer(...dirs[e.key]); }
      if(e.key===' '||e.key==='Enter'){ e.preventDefault();
        if(state.phase==='player_move')   skipMove();
        if(state.phase==='player_action') endPlayerTurn(); }
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

    if((state.phase==='player_move'||state.phase==='player_action')&&_hitCheckmark(px,py,cellX,cellY,CELL)){
      if(state.phase==='player_move')   { skipMove(); return; }
      if(state.phase==='player_action') { endPlayerTurn(); return; }
    }
    if(state.phase==='player_move'){
      if(r<0||r>=state.rows||c<0||c>=state.cols) return;
      const dr=r-pr, dc=c-pc;
      if(Math.abs(dr)+Math.abs(dc)===1&&_canEnter(r,c)){
        _triggerFlash(r,c,'arrow'); // 矢印フラッシュ
        movePlayer(dr,dc);
      }
      return;
    }
    if(state.phase==='player_action'){
      if(r<0||r>=state.rows||c<0||c>=state.cols) return;
      const half=CELL/2;
      let zone;
      if(lx<half&&ly<half)       zone='topleft';
      else if(lx>=half&&ly<half) zone='topright';
      else if(lx<half&&ly>=half) zone='bottomleft';
      else                       zone='bottomright';
      cellAction(r,c,zone);
    }
  }

  return{init,movePlayer,cellAction,endPlayerTurn,skipMove,handleCanvasClick};
})();
