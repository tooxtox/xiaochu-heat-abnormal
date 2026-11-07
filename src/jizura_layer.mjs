// V15 JIZURA 字面 lyric layer.
//
// Every lyric line carries a semantic direction (data/jizura_direction.json): which plan
// (colour world + material pool), which layout, how it enters / holds / leaves, which
// decorations, and the LRC marks (emphasis, phrase break, key line) that the engine's own
// parser understands. The engine plans the cuts; the director decides what they mean.
//
// Three things this layer owns that the engine cannot know:
//   1. which plan renders which line  — colour world follows the background, not the lyrics;
//   2. where the Chinese translation sits — a subtitle band that survives any background;
//   3. determinism — every renderer is built and every paper texture is pre-warmed while a
//      seeded Math.random shim is installed, so separate render workers agree pixel for pixel.
const W = 1920, H = 1080;

function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error(`Cannot load ${src}`));document.head.append(s)})}
function stamp(t){const m=Math.floor(t/60),s=t-m*60;return `[${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}]`}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function hexA(hex,a){const h=hex.replace('#','');const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`}

// ---------------------------------------------------------------- LRC with meaning
// The engine understands three marks: *word* (emphasis), / (phrase break) and a trailing !
// (key line). Interludes are written as explicit [間奏 N] rows so the engine never falls
// back to its countdown variant in the long instrumental gaps.
function buildLrc(lines, direction){
  const rows=[], lyricRow=new Map(), gaps=[];
  lines.forEach((line,i)=>{
    const d=direction.lines[i]||{};
    let text=line.text;
    if(d.break) text=d.break.split('/').map(part=>part.trim()).filter(Boolean).join('/');
    if(d.emphasis&&text.includes(d.emphasis)) text=text.replace(d.emphasis,`*${d.emphasis}*`);
    if(d.kime) text=text.replace(/[!！]+$/,'')+'!';
    rows.push(`${stamp(line.time)}${text}`);
    lyricRow.set(i,rows.length-1);
    const next=lines[i+1]?lines[i+1].time:Infinity;
    const gap=next-line.end;
    if(Number.isFinite(line.end)&&Number.isFinite(gap)&&gap>0.2){
      rows.push(`${stamp(line.end)}[間奏 ${Math.max(0.5,gap-0.02).toFixed(2)}]`);
      gaps.push({row:rows.length-1,start:line.end,end:next});
    }
  });
  return {lrc:rows.join('\n'),lyricRow,gaps};
}

// ---------------------------------------------------------------- plan overrides
// project.overrides is keyed by the LRC row index, so the row map from buildLrc is used
// here. Every cut gets trans:'none' — JIZURA's own transitions would overwrite the exit
// motion of the previous line, and the exits here carry the meaning.
function buildOverrides(direction,lrc){
  const overrides={};
  direction.lines.forEach((d,i)=>{
    const row=lrc.lyricRow.get(i);
    if(row==null) return;
    const cuts=Math.max(1,d.cuts||1);
    const cutTech={};
    for(let k=0;k<cuts;k++) cutTech[k]={trans:'none'};
    if(d.cutTech) for(const [k,tech] of Object.entries(d.cutTech)) cutTech[k]=Object.assign({},cutTech[k],tech);
    overrides[row]={
      layout:d.layout,enter:d.enter,exit:d.exit,hold:d.hold,
      decor:d.decor||[],treat:d.treat,cam:d.cam,bg:'none',cuts,cutTech,
    };
  });
  direction.interludes.forEach((spec,i)=>{
    const gap=lrc.gaps[i];
    if(gap) overrides[gap.row]={bg:'none',decor:spec.decor||[],cam:'push'};
  });
  return overrides;
}

// ---------------------------------------------------------------- material pool
// Deny-lists adapted from the vocaloid-style-mv reference: no opaque plates, no novelty
// props, no full-frame effects (the film's own glitch pass owns those), no horror set.
const DENY={
  layout:'wall cylinder cube subtitleBar tile kaleido bubble bubbles chat notification searchBar keycaps slotMachine stickerBomb crossword wordSearch puzzle burst balloons magnets tiles bulbs ledScroll billboard crowdBubbles flipCards accordion pile blocks knSlamStack halftoneBig tySquare tyRotBlock popArt flags',
  cam:'knCardFlip knTiltKick knReadPan knShearKick knRushIn knJumpCut jelly bounce',
  decor:'tyColophon tyTextRule tyTypeScale dateStamp dots arrows shapes qrBlock triangleSpin checkerStrip confetti petals heartsStars memphis starburst cursorClick windowChrome progressBar toggleSwitch notifBell likeCounter mediaControls volumeBars bubbles tapePieces highlightMark staple paperClip',
  fx:'flash bloomFlash strobe whiteFrame blackFrame colorBars invert panelWipe irisTrans doors kaleido posterize ditherBit splitSlide blindsTrans vhsRoll trackingNoise',
  treat:'boxed marker sticker circled rainbow chrome knWordPlate',
};
const MOODS=['glitch','editorial','calm','emotional'];

function buildEnabled(){
  const enabled={};
  for(const group of window.J.GROUP_KEYS){
    enabled[group]={};
    const no=new Set((DENY[group]||'').split(/\s+/));
    for(const key of window.J.order(group)){
      const def=window.J.registry(group)[key]||{},tags=Array.isArray(def.tags)?def.tags:null;
      enabled[group][key]=key==='none'||(!no.has(key)&&!/^hr[A-Z]/.test(key)&&def.set!=='horror'&&(!tags||tags.some(t=>MOODS.includes(t))));
    }
  }
  return enabled;
}

export async function createJizuraLayer(data){
  const direction=data.jizuraDirection;
  if(!direction||!direction.lines||!direction.lines.length) throw new Error('data/jizura_direction.json is required for the JIZURA lyric layer.');
  const lines=data.lyrics.lines;
  const lrc=buildLrc(lines,direction);
  const overrides=buildOverrides(direction,lrc);
  // The lyric rows carry an id, not an index; the direction table is matched by id.
  const byId=new Map(direction.lines.map(d=>[d.id,d]));

  // The engine draws glyphs from a pool for scramble / randomOrder / reel layouts; those
  // characters are not part of the lyric text, so they have to be requested explicitly.
  let poolText='';

  // Seeded window: engine load, plan building and texture pre-warm all happen here, so
  // every render worker produces identical pixels.
  const random=Math.random;
  let seed=0x5a4e4b4f;
  Math.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const info=[];
  try{
    await script('./jizura/app/jizura_engine.js');
    await script('./jizura/app/jizura_adapter.js');
    try{ poolText=Object.values(window.J.POOLS||{}).map(group=>Object.values(group||{}).join('')).join(''); }catch{ poolText=''; }
    const enabled=buildEnabled();
    const common={
      lyrics:lrc.lrc,fps:60,res:1080,aspect:'16:9',seed:4114,
      unify:false,typeset:false,extra:true,wa:false,horror:false,enabled,
      centerFree:false,lang:'ja',fontText:poolText,
    };
    for(const [name,plan] of Object.entries(direction.plans)){
      const project=Object.assign({},common,{
        style:plan.style,schemes:plan.schemes,colors:plan.colors,fx:plan.fx,overrides,
      });
      info.push(await window.JZ.addPlan(name,project));
      const built=window.JZ.plans[name];
      // Renderer.paper() is built lazily on the first frame that needs it; force it now,
      // while the seeded shim is still installed (the paper styles would otherwise differ
      // between render workers).
      if(built&&built.R&&typeof built.R.paper==='function') built.R.paper(built.plan.W,built.plan.H);
    }
  } finally { Math.random=random; }

  const baseFx={};
  for(const [name,plan] of Object.entries(direction.plans)) baseFx[name]=Object.assign({},plan.fx);

  const canvas=document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const layer=canvas.getContext('2d');

  function lineAt(t){
    let lo=0,hi=lines.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(lines[mid].time<=t)lo=mid+1;else hi=mid;}
    const line=lines[lo-1];
    return line&&t<(line.end??Infinity)?line:null;
  }
  function gapAt(t){
    for(const gap of lrc.gaps) if(t>=gap.start&&t<gap.end) return gap;
    return null;
  }
  // Which plan renders the moment: the line's own plan, or — inside an instrumental gap —
  // the plan of the line that follows it.
  function stateAt(t){
    const line=lineAt(t);
    if(line){
      const d=byId.get(line.id);
      if(!d) return null;
      // Probe hook: tools/jizura_variant_probe.mjs swaps one line's colour world to A/B the
      // two ink polarities against the real picture. It only measures — the director table
      // still decides what is actually rendered.
      const probe=window.__MZ_PLAN_PROBE;
      const plan=(probe&&probe[line.id])||d.plan;
      return {line,d,plan,plane:d.layer==='behind'?'back':'front',interlude:false};
    }
    const gap=gapAt(t);
    if(!gap) return null;
    const index=direction.lines.findIndex(d=>d.time>=gap.start);
    const d=index>=0?direction.lines[index]:null;
    const spec=direction.interludes[direction.interludes.findIndex((_,i)=>lrc.gaps[i]===gap)]||{};
    return {line:null,d:null,plan:d?d.plan:'dark',plane:spec.plane||'back',interlude:true};
  }

  function schemeOf(planName){
    const built=window.JZ.plans[planName];
    if(!built) return {fg:'#F5EEEA',bg:'#060607'};
    const cut=built.plan.cuts[0];
    const index=cut?cut.scheme:0;
    const scheme=(built.plan.style.schemes[index]||built.plan.style.schemes[0])||{};
    return {fg:scheme.fg||'#F5EEEA',bg:scheme.bg||'#060607',accent:scheme.accent||'#ED8B50'};
  }

  // Chinese translation: a subtitle band that stays readable over any background. The
  // band owns its own colours — the film's black and paper — instead of borrowing the
  // plan's ink, so the Japanese line can flip to dark ink on a bright shot without the
  // translation turning into a milky strip.
  const TRANSLATION_BG = '#090C13';
  const TRANSLATION_FG = '#E9EDE5';
  function drawTranslation(c,state){
    const line=state.line;
    if(!line||!line.translation) return;
    // Only fade in. Repeated lines share the same Chinese text, so an out-fade would
    // make the subtitle flicker on every repetition.
    const fade=clamp((state.t-line.time)/0.12,0,1);
    if(fade<=0) return;
    c.save();
    const scrim=c.createLinearGradient(0,H-190,0,H);
    scrim.addColorStop(0,hexA(TRANSLATION_BG,0));
    scrim.addColorStop(1,hexA(TRANSLATION_BG,0.26));
    c.fillStyle=scrim;c.fillRect(0,H-190,W,190);
    const x=112,y=H-74;
    c.font='34px "Noto Sans SC", "Noto Sans JP", sans-serif';
    c.textBaseline='alphabetic';c.textAlign='left';
    c.lineJoin='round';c.miterLimit=2;c.lineWidth=7;
    c.strokeStyle=hexA(TRANSLATION_BG,0.92*fade);
    c.fillStyle=hexA(TRANSLATION_FG,fade);
    c.strokeText(line.translation,x,y);
    c.fillText(line.translation,x,y);
    c.restore();
  }

  function draw(c,t,data_,plane){
    const state=stateAt(t);
    if(!state) return;
    state.t=t;
    if(state.plane===plane){
      const built=window.JZ.plans[state.plan];
      if(built){
        // per-line intensity: repeated sections escalate, and the change is a pure
        // function of the song time, so it stays deterministic.
        const base=baseFx[state.plan]||{};
        const fx=state.d&&state.d.fx?Object.assign({},base,state.d.fx):base;
        Object.assign(built.plan.fx,fx);
        layer.setTransform(1,0,0,1,0,0);
        layer.globalAlpha=1;layer.globalCompositeOperation='source-over';
        layer.clearRect(0,0,W,H);
        // noPost: the engine's transparent post pass multiplies the layer alpha by itself once per
        // active impact event, so an emphasised line (chroma + shake) fades the whole lyric away.
        // The film's own glitch pass drives the screen-level impact instead.
        window.JZ.drawPlan(state.plan,layer,t,'front',{noPost:true});
        c.drawImage(canvas,0,0,W,H);
      }
    }
    if(plane==='front') drawTranslation(c,state);
  }

  return {draw,info,lrc:lrc.lrc};
}
