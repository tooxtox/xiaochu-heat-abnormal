function latest(rows, key, time) {
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid][key] <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function glitchPulseAt(data, time, scene) {
  const rhythm = data.v22Rhythm;
  if (!rhythm) return null;
  const t = time + 1e-8;
  const window = rhythm.windows[latest(rhythm.windows, 'from', t)];
  if (!window || t >= window.to) return null;
  const index = latest(rhythm.pulses, 'time', t);
  const mark = rhythm.pulses[index];
  if (!mark || mark.time < window.from - 1e-8) return null;
  const age = Math.max(0, time - mark.time);
  if (age >= .285) return null;
  return {
    age, index, scene, level: window.level, strength: mark.strength,
    tier: mark.tier, windowId: window.id, cold: window.id === 'server-pulse',
  };
}

const lyricRecoil=[1,-.78,.61,-.42,.24,-.12];

export function lyricShakeAt(data,time) {
  if(!data.v33)return null;
  const pulse=glitchPulseAt(data,time);
  if(!pulse||pulse.tier<2)return null;
  const {windowId,age,index,strength,tier}=pulse;
  if(windowId!=='first-impact'&&windowId!=='final-rise'&&windowId!=='collapse')return null;
  const recoil=lyricRecoil[Math.floor((age+1e-8)*60)];
  if(recoil===undefined)return null;
  const gain=(windowId==='collapse'?13:9)*(.58+.42*strength)*(tier===3?1:.65);
  const side=index%2===0?1:-1;
  return {x:side*gain*recoil,y:gain*.46*Math.sin(index*2.4+age*150)*Math.abs(recoil)};
}