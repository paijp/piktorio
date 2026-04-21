// piktorioengine.js — Piktorioゲームエンジン v0.6

const Piktorioengine = (() => {

  const TILE  = { WALK:'walk', WALL:'wall', CRACKED:'cracked', RED:'red', BLUE:'blue', YELLOW:'yellow' };
  const PHASE = { PLAYER_MOVE:'player_move', PLAYER_ACTION:'player_action', PIK:'pik', ENEMY:'enemy' };
  const COLORS     = ['red','blue','yellow'];
  const MOVE_LIMIT = 3;
  const MAP_SCALE  = 2;
  const CRACKED_HP = 100;

  const TILE_FILL = {
    walk:    '#2d5a1b',
    wall:    '#5a3010',
    cracked: '#4a2808',
    red:     '#cc3333',   // 明るく
    blue:    '#2277cc',   // 明るく
    yellow:  '#aaaa10',   // 明るく
  };
  const MINI_FILL = {
    walk:    '#3a7a22',
    wall:    '#7a4a20',
    cracked: '#6a3a18',
    red:     '#cc4444',
    blue:    '#3388cc',
    yellow:  '#aaaa20',
  };

  let state = null;

  // ===== 初期化 =====
  function init(mapData) {
    const rows=mapData.tiles.length, cols=mapData.tiles[0].length;
    const fogRadius = Math.sqrt((rows/2)**2+(cols/2)**2)+1;
    const tiles = mapData.tiles.map(row=>row.map(cell=>({
      type:cell.type,
      piks:{red:cell.piks?.red||0,blue:cell.piks?.blue||0,yellow:cell.piks?.yellow||0},
      hp:cell.type==='cracked'?(cell.hp??CRACKED_HP):null,
    })));
    const fogMap=Array.from({length:rows},()=>new Array(cols).fill(Infinity));
    state={rows,cols,map:tiles,fogMap,fogRadius,
      player:{row:mapData.playerStart[0],col:mapData.playerStart[1],piks:{red:0,blue:0,yellow:0}},
      phase:'player_move',movesLeft:MOVE_LIMIT,turn:1,message:'移動してください'};
    _revealFog(state.player.row,state.player.col);
    _collectPiks();_render();_bindKeys();
  }

  function _revealFog(r,c){
    const R=state.fogRadius,R2=R*R,ri=Math.ceil(R);
    for(let dr=-ri;dr<=ri;dr++)for(let dc=-ri;dc<=ri;dc++){
      const d2=dr*dr+dc*dc;if(d2>R2)continue;
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<state.rows&&nc>=0&&nc<state.cols&&d2<state.fogMap[nr][nc])state.fogMap[nr][nc]=d2;
    }
  }
  function _isVisible(r,c){return state.fogMap[r][c]<Infinity;}

  function _collectPiks(){
    const cell=state.map[state.player.row][state.player.col];
    COLORS.forEach(col=>{state.player.piks[col]+=cell.piks[col];cell.piks[col]=0;});
  }

  function _canEnter(r,c){
    if(r<0||r>=state.rows||c<0||c>=state.cols)return false;
    return state.map[r][c].type==='walk';
  }
  function _isReachableForAction(r,c){
    return Math.abs(r-state.player.row)<=1&&Math.abs(c-state.player.col)<=1;
  }

  // ===== 移動 =====
  function movePlayer(dr,dc){
    if(state.phase!=='player_move')return;
    if(state.movesLeft<=0){_enterActionPhase();return;}
    const nr=state.player.row+dr,nc=state.player.col+dc;
    if(!_canEnter(nr,nc)){_setMessage('そこには進めません');_render();return;}
    state.player.row=nr;state.player.col=nc;state.movesLeft--;
    _revealFog(nr,nc);_collectPiks();
    if(state.movesLeft===0)_enterActionPhase();
    else{_setMessage(`移動してください（残り${state.movesLeft}マス）`);_render();}
  }
  function _enterActionPhase(){
    state.phase='player_action';_setMessage('アクション：各マスの隅をタップしてpikを操作');_render();
  }

  // ===== アクション =====
  // zone: 'topleft'=赤置, 'topright'=黄置, 'bottomleft'=青置, 'bottomright'=全拾
  function cellAction(r,c,zone){
    if(state.phase!=='player_action')return;
    if(!_isReachableForAction(r,c)){_setMessage('操作できるのは隣接マス（斜め含む）のみです');_render();return;}
    const cell=state.map[r][c],type=cell.type;
    if(type==='wall'){_setMessage('壁には操作できません');_render();return;}

    if(zone==='bottomright'){
      if(type!=='walk'){_setMessage('このマスからは直接拾えません');_render();return;}
      if(!COLORS.some(col=>cell.piks[col]>0)){_setMessage('このマスにpikはいません');_render();return;}
      COLORS.forEach(col=>{state.player.piks[col]+=cell.piks[col];cell.piks[col]=0;});
      _setMessage('pikを拾いました');
    }else{
      const colorMap={topleft:'red',topright:'yellow',bottomleft:'blue'};
      const color=colorMap[zone];
      if(type==='red'&&color!=='red'){_setMessage('赤マスには赤pikのみ置けます');_render();return;}
      if(type==='blue'&&color!=='blue'){_setMessage('青マスには青pikのみ置けます');_render();return;}
      if(type==='yellow'&&color!=='yellow'){_setMessage('黄マスには黄pikのみ置けます');_render();return;}
      if(state.player.piks[color]<=0){_setMessage(`${_colorJa(color)}pikを持っていません`);_render();return;}
      state.player.piks[color]--;cell.piks[color]++;
      _setMessage(`${_colorJa(color)}pikを置きました`);
    }
    _render();
  }
  function _colorJa(c){return{red:'赤',blue:'青',yellow:'黄'}[c]||c;}

  // ===== ターン制御 =====
  function endPlayerTurn(){
    if(state.phase!=='player_action')return;
    state.phase='pik';_setMessage('pikターン中…');_render();setTimeout(_runPikTurn,400);
  }
  function skipMove(){if(state.phase!=='player_move')return;_enterActionPhase();}

  function _runPikTurn(){
    for(let r=0;r<state.rows;r++)for(let c=0;c<state.cols;c++){
      const cell=state.map[r][c];
      if(cell.type!=='cracked')continue;
      const dmg=cell.piks.red*2+cell.piks.blue+cell.piks.yellow;
      if(dmg<=0)continue;
      cell.hp=Math.max(0,cell.hp-dmg);
      if(cell.hp===0){cell.type='walk';cell.hp=null;}
    }
    state.phase='enemy';_setMessage('敵ターン中…');_render();setTimeout(_runEnemyTurn,400);
  }
  function _runEnemyTurn(){
    state.phase='player_move';state.movesLeft=MOVE_LIMIT;state.turn++;
    _setMessage(`ターン ${state.turn} — 移動してください（残り3マス）`);_render();
  }

  // ===== レイアウト =====
  function _getLayout(canvas){
    const BASE=Math.floor(Math.min(canvas.width/state.cols,canvas.height/state.rows));
    const CELL=BASE*MAP_SCALE;
    let ox=canvas.width/2-(state.player.col+0.5)*CELL;
    let oy=canvas.height/2-(state.player.row+0.5)*CELL;
    ox=Math.min(0,Math.max(canvas.width-CELL*state.cols,ox));
    oy=Math.min(0,Math.max(canvas.height-CELL*state.rows,oy));
    return{CELL,ox,oy};
  }

  // ===== レンダリング =====
  function _render(){
    const canvas=document.getElementById('piktorioCanvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const{CELL,ox,oy}=_getLayout(canvas);
    const vpW=canvas.width,vpH=canvas.height;
    ctx.fillStyle='#0a0a0a';ctx.fillRect(0,0,vpW,vpH);

    for(let r=0;r<state.rows;r++)for(let c=0;c<state.cols;c++){
      const x=ox+c*CELL,y=oy+r*CELL;
      if(x+CELL<0||x>vpW||y+CELL<0||y>vpH)continue;
      _drawCell(ctx,r,c,x,y,CELL);
    }

    if(state.phase==='player_move'&&state.movesLeft>0)_drawReachable(ctx,CELL,ox,oy);
    if(state.phase==='player_action')_drawActionButtons(ctx,CELL,ox,oy);

    _drawPlayer(ctx,CELL,ox,oy);

    const pr=state.player.row,pc=state.player.col;
    const cellX=ox+pc*CELL,cellY=oy+pr*CELL;
    if(state.phase==='player_move'){
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dc,dr])=>_drawArrow(ctx,cellX,cellY,CELL,dc,dr));
      _drawCheckmark(ctx,cellX,cellY,CELL);
    }
    if(state.phase==='player_action')_drawCheckmark(ctx,cellX,cellY,CELL);

    _drawMinimap(ctx,canvas);
    _updateUI();
  }

  // ===== タイル描画 =====
  function _drawCell(ctx,r,c,x,y,CELL){
    const cell=state.map[r][c];
    if(!_isVisible(r,c)){ctx.fillStyle='#0a0a0a';ctx.fillRect(x,y,CELL,CELL);return;}
    ctx.fillStyle=TILE_FILL[cell.type]||'#333';
    ctx.fillRect(x,y,CELL,CELL);
    if(cell.type==='cracked'){
      _drawCrackPattern(ctx,x,y,CELL,cell.hp);
      _drawHpGauge(ctx,x,y,CELL,cell.hp);
    }
    // pik数テキスト
    const fs=Math.max(9,Math.floor(CELL*0.26));ctx.font=`bold ${fs}px monospace`;
    if(cell.piks.red>0){ctx.fillStyle='#ff9999';ctx.fillText(cell.piks.red,x+3,y+fs+2);}
    if(cell.piks.yellow>0){ctx.fillStyle='#ffee44';ctx.fillText(cell.piks.yellow,x+CELL-ctx.measureText(cell.piks.yellow).width-3,y+fs+2);}
    if(cell.piks.blue>0){ctx.fillStyle='#88ccff';ctx.fillText(cell.piks.blue,x+3,y+CELL-4);}
  }

  // ===== ヒビ模様 =====
  function _drawCrackPattern(ctx,x,y,CELL,hp){
    const intensity=1-(hp??CRACKED_HP)/CRACKED_HP;
    ctx.save();
    ctx.strokeStyle=`rgba(200,140,60,${0.3+intensity*0.5})`;
    ctx.lineWidth=1;
    const cx=x+CELL/2,cy=y+CELL/2;
    const cracks=[
      [[cx,cy],[cx-CELL*0.30,cy-CELL*0.35]],
      [[cx,cy],[cx+CELL*0.25,cy-CELL*0.30]],
      [[cx,cy],[cx+CELL*0.10,cy+CELL*0.40]],
      [[cx,cy],[cx-CELL*0.20,cy+CELL*0.30]],
    ];
    const count=1+Math.floor(intensity*(cracks.length-1));
    for(let i=0;i<count;i++){
      ctx.beginPath();
      ctx.moveTo(cracks[i][0][0],cracks[i][0][1]);
      ctx.lineTo(cracks[i][1][0],cracks[i][1][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===== 耐久力円グラフ =====
  // ・数字なし
  // ・色：壁(#5a3010)より少し明るい茶色 → #8a5828
  // ・左右逆：反時計回り（startAngle=-π/2、反時計方向）
  function _drawHpGauge(ctx,x,y,CELL,hp){
    if(hp===null)return;
    const cx=x+CELL/2,cy=y+CELL/2,r=CELL*0.3;
    const ratio=hp/CRACKED_HP;

    // 背景（暗い円）
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fill();

    // 扇形：反時計回り（counterclockwise=true）
    if(ratio>0){
      const startAngle=-Math.PI/2;
      const endAngle=startAngle-Math.PI*2*ratio; // 反時計回りなので引く
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,startAngle,endAngle,true); // true=反時計回り
      ctx.closePath();
      // 色：壁(#5a3010)より明るい茶色、HPが減ると暗くなる
      const lightness=Math.floor(28+ratio*18); // 28%〜46%
      ctx.fillStyle=`hsl(28,70%,${lightness}%)`;
      ctx.fill();
    }

    // 外枠
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle='rgba(180,120,60,0.65)';ctx.lineWidth=1;ctx.stroke();
  }

  // ===== アクションボタン（各マスの4隅に固定配置） =====
  // 左上=赤置き(赤背景)、右上=黄置き(黄背景)、左下=青置き(青背景)、右下=回収(白背景)
  function _drawActionButtons(ctx,CELL,ox,oy){
    const pr=state.player.row,pc=state.player.col;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      const r=pr+dr,c=pc+dc;
      if(r<0||r>=state.rows||c<0||c>=state.cols)continue;
      const cell=state.map[r][c],type=cell.type;
      if(type==='wall')continue;
      const x=ox+c*CELL,y=oy+r*CELL;
      _drawCellButtons(ctx,x,y,CELL,type,cell,r===pr&&c===pc);
    }
  }

  function _drawCellButtons(ctx,x,y,CELL,type,cell,isSelf){
    const s=CELL*0.22; // ボタン半径
    const pad=CELL*0.14; // 隅からのオフセット

    // 各隅の中心座標
    const corners=[
      {zone:'topleft',    cx:x+pad+s,       cy:y+pad+s,        color:'red',    bg:'rgba(200,60,60,0.72)',  symbol:'●'},
      {zone:'topright',   cx:x+CELL-pad-s,  cy:y+pad+s,        color:'yellow', bg:'rgba(200,180,20,0.72)',symbol:'●'},
      {zone:'bottomleft', cx:x+pad+s,       cy:y+CELL-pad-s,   color:'blue',   bg:'rgba(40,120,220,0.72)',symbol:'●'},
      {zone:'bottomright',cx:x+CELL-pad-s,  cy:y+CELL-pad-s,   color:null,     bg:'rgba(180,180,180,0.5)',symbol:'×'},
    ];

    for(const btn of corners){
      // 非表示条件チェック
      if(btn.zone==='bottomright'){
        // 回収：walkマスでpikがある場合のみ
        if(type!=='walk')continue;
        if(!COLORS.some(col=>cell.piks[col]>0))continue;
      } else {
        // 置く：色専用マスへの色制限チェック
        if(type==='red'    && btn.color!=='red')    continue;
        if(type==='blue'   && btn.color!=='blue')   continue;
        if(type==='yellow' && btn.color!=='yellow') continue;
        // 持ちpikがない場合は薄く表示（透明度下げるだけで表示はする）
      }

      // ボタン描画
      ctx.beginPath();ctx.arc(btn.cx,btn.cy,s,0,Math.PI*2);
      ctx.fillStyle=btn.bg;ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=0.8;ctx.stroke();

      // シンボル
      if(btn.symbol==='×'){
        const hs=s*0.5;
        ctx.save();ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*0.28;ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(btn.cx-hs,btn.cy-hs);ctx.lineTo(btn.cx+hs,btn.cy+hs);
        ctx.moveTo(btn.cx+hs,btn.cy-hs);ctx.lineTo(btn.cx-hs,btn.cy+hs);
        ctx.stroke();ctx.restore();
      }
    }
  }

  // ===== 移動ハイライト =====
  function _drawReachable(ctx,CELL,ox,oy){
    _bfsReachable(state.player.row,state.player.col,state.movesLeft).forEach(([r,c])=>{
      ctx.fillStyle='rgba(255,255,180,0.2)';ctx.fillRect(ox+c*CELL,oy+r*CELL,CELL,CELL);
    });
  }

  function _bfsReachable(sR,sC,steps){
    const vis=new Set([`${sR},${sC}`]),q=[[sR,sC,steps]],res=[];
    while(q.length){const[r,c,left]=q.shift();if(!left)continue;
      for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc,k=`${nr},${nc}`;
        if(!vis.has(k)&&_canEnter(nr,nc)){vis.add(k);res.push([nr,nc]);q.push([nr,nc,left-1]);}
      }
    }return res;
  }

  // ===== プレイヤー =====
  function _drawPlayer(ctx,CELL,ox,oy){
    const{row,col,piks}=state.player;
    const x=ox+col*CELL,y=oy+row*CELL,cx=x+CELL/2,cy=y+CELL/2,r=CELL*0.28;
    ctx.beginPath();ctx.arc(cx+1,cy+2,r,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#f0efe0';ctx.fill();
    ctx.strokeStyle='#999';ctx.lineWidth=1.5;ctx.stroke();
    const fs=Math.max(8,Math.floor(CELL*0.24));ctx.font=`bold ${fs}px monospace`;
    if(piks.red>0){ctx.fillStyle='#ff9999';ctx.fillText(piks.red,x+3,y+fs+2);}
    if(piks.yellow>0){ctx.fillStyle='#ffee44';ctx.fillText(piks.yellow,x+CELL-ctx.measureText(piks.yellow).width-3,y+fs+2);}
    if(piks.blue>0){ctx.fillStyle='#88ccff';ctx.fillText(piks.blue,x+3,y+CELL-4);}
  }

  // ===== 矢印 =====
  function _drawArrow(ctx,cellX,cellY,CELL,dcol,drow){
    const nr=state.player.row+drow,nc=state.player.col+dcol;
    if(!_canEnter(nr,nc))return;
    const cx=cellX+CELL/2+dcol*CELL,cy=cellY+CELL/2+drow*CELL,s=CELL*0.2;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.atan2(drow,dcol)+Math.PI/2);
    ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*0.7,s*0.55);ctx.lineTo(-s*0.7,s*0.55);ctx.closePath();
    ctx.fillStyle='rgba(255,255,220,0.88)';ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;ctx.stroke();
    ctx.restore();
  }

  // ===== チェックマーク =====
  function _drawCheckmark(ctx,cellX,cellY,CELL){
    const cx=cellX+CELL/2,cy=cellY+CELL/2,s=CELL*0.22;
    ctx.beginPath();ctx.arc(cx,cy,s*1.1,0,Math.PI*2);
    ctx.fillStyle='rgba(40,160,40,0.72)';ctx.fill();
    ctx.save();ctx.strokeStyle='rgba(255,255,255,0.95)';ctx.lineWidth=s*0.4;
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(cx-s*0.45,cy);ctx.lineTo(cx-s*0.1,cy+s*0.45);ctx.lineTo(cx+s*0.48,cy-s*0.42);
    ctx.stroke();ctx.restore();
  }
  function _hitCheckmark(px,py,cellX,cellY,CELL){
    const cx=cellX+CELL/2,cy=cellY+CELL/2,r=CELL*0.32;
    return(px-cx)**2+(py-cy)**2<=r*r;
  }

  // ===== ミニマップ =====
  function _drawMinimap(ctx,canvas){
    const MINI=5,PAD=8,mW=state.cols*MINI,mH=state.rows*MINI;
    const mx=canvas.width-mW-PAD,my=canvas.height-mH-PAD;
    ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(mx-2,my-2,mW+4,mH+4);
    for(let r=0;r<state.rows;r++)for(let c=0;c<state.cols;c++){
      const cell=state.map[r][c],x=mx+c*MINI,y=my+r*MINI;
      if(!_isVisible(r,c)){ctx.fillStyle='#111';ctx.fillRect(x,y,MINI,MINI);continue;}
      ctx.fillStyle=MINI_FILL[cell.type]||'#444';ctx.fillRect(x,y,MINI,MINI);
      if(cell.piks.red>0||cell.piks.blue>0||cell.piks.yellow>0){
        let dc='#fff';
        if(cell.piks.red>0)dc='#ff8888';else if(cell.piks.yellow>0)dc='#ffee44';else dc='#66aaff';
        ctx.beginPath();ctx.arc(x+MINI*0.5,y+MINI*0.5,MINI*0.3,0,Math.PI*2);ctx.fillStyle=dc;ctx.fill();
      }
    }
    const px=mx+state.player.col*MINI+MINI*0.5,py=my+state.player.row*MINI+MINI*0.5;
    ctx.beginPath();ctx.arc(px,py,MINI*0.55,0,Math.PI*2);ctx.fillStyle='#f0efe0';ctx.fill();
    ctx.strokeStyle='#333';ctx.lineWidth=0.8;ctx.stroke();
  }

  function _setMessage(msg){state.message=msg;const el=document.getElementById('piktorioMessage');if(el)el.textContent=msg;}

  function _updateUI(){
    const names={player_move:'移動フェーズ',player_action:'アクションフェーズ',pik:'pikターン',enemy:'敵ターン'};
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set('piktorioPhase',names[state.phase]||state.phase);
    set('piktorioTurn',`${state.turn}`);
    set('piktorioMoves',state.phase==='player_move'?`${state.movesLeft}`:'—');
    set('piktorioMessage',state.message);
  }

  function _bindKeys(){
    if(_bindKeys._done)return;_bindKeys._done=true;
    document.addEventListener('keydown',e=>{
      if(!state)return;
      const dirs={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],w:[-1,0],s:[1,0],a:[0,-1],d:[0,1]};
      if(dirs[e.key]){e.preventDefault();movePlayer(...dirs[e.key]);}
      if(e.key===' '||e.key==='Enter'){e.preventDefault();
        if(state.phase==='player_move')skipMove();
        if(state.phase==='player_action')endPlayerTurn();}
    });
  }

  function _pixelToCell(clientX,clientY){
    const canvas=document.getElementById('piktorioCanvas');
    const rect=canvas.getBoundingClientRect();
    const px=(clientX-rect.left)*(canvas.width/rect.width);
    const py=(clientY-rect.top)*(canvas.height/rect.height);
    const{CELL,ox,oy}=_getLayout(canvas);
    const c=Math.floor((px-ox)/CELL),r=Math.floor((py-oy)/CELL);
    const lx=(px-ox)-c*CELL,ly=(py-oy)-r*CELL;
    return{r,c,lx,ly,CELL,px,py,ox,oy};
  }

  function handleCanvasClick(e){
    if(!state)return;e.preventDefault&&e.preventDefault();
    const{r,c,lx,ly,CELL,px,py,ox,oy}=_pixelToCell(e.clientX,e.clientY);
    const pr=state.player.row,pc=state.player.col;
    const cellX=ox+pc*CELL,cellY=oy+pr*CELL;

    // ✓ チェックマーク
    if((state.phase==='player_move'||state.phase==='player_action')&&_hitCheckmark(px,py,cellX,cellY,CELL)){
      if(state.phase==='player_move'){skipMove();return;}
      if(state.phase==='player_action'){endPlayerTurn();return;}
    }

    // 移動フェーズ
    if(state.phase==='player_move'){
      if(r<0||r>=state.rows||c<0||c>=state.cols)return;
      const dr=r-pr,dc=c-pc;
      if(Math.abs(dr)+Math.abs(dc)===1&&_canEnter(r,c))movePlayer(dr,dc);
      return;
    }

    // アクションフェーズ：タップ座標からゾーン判定
    if(state.phase==='player_action'){
      if(r<0||r>=state.rows||c<0||c>=state.cols)return;
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
