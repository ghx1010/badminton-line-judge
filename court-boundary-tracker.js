(() => {
  'use strict';
  const video = document.querySelector('#video');
  const host = document.querySelector('.viewer');
  if (!video || !host) return;

  const analysis = document.createElement('canvas');
  analysis.width = 320; analysis.height = 426;
  const ax = analysis.getContext('2d', { willReadFrequently: true });
  const overlay = document.createElement('canvas');
  overlay.className = 'court-boundary-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
  host.append(overlay);
  const ox = overlay.getContext('2d');

  const state = { quad: null, confidence: 0, lostAt: 0, lastAt: 0 };
  const halfLength = 6.7, doublesWidth = 6.10, singlesWidth = 5.18;

  function mode() {
    return document.querySelector('#modeBadge')?.textContent.includes('单打') ? 'singles' : 'doubles';
  }
  function resize() {
    const d = devicePixelRatio || 1, r = overlay.getBoundingClientRect();
    overlay.width = Math.max(1, Math.round(r.width * d));
    overlay.height = Math.max(1, Math.round(r.height * d));
    ox.setTransform(d, 0, 0, d, 0, 0);
  }
  new ResizeObserver(resize).observe(overlay); resize();

  const lum = (data, width, x, y) => {
    const i = (y * width + x) * 4;
    return (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
  };
  const median = values => {
    const a = values.filter(Number.isFinite).sort((a,b)=>a-b);
    return a.length ? a[(a.length / 2) | 0] : NaN;
  };
  const fit = points => {
    if (points.length < 8) return null;
    let sy=0,sx=0,syy=0,syx=0;
    for (const [y,x] of points) { sy += y; sx += x; syy += y*y; syx += y*x; }
    const n=points.length, d=n*syy-sy*sy;
    return Math.abs(d)<1e-5 ? null : { a:(n*syx-sy*sx)/d, b:(sx-sy*syx)/d };
  };
  const lineAt = (line,y) => line.a*y + line.b;
  function valid(q, w, h) {
    if (!q || q.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
    const [nl,nr,fr,fl] = q, near = nr.x-nl.x, far = fr.x-fl.x;
    if (!(near > w*.28 && far > w*.08 && near > far*1.08)) return false;
    if (!(nl.y > fl.y+h*.10 && nr.y > fr.y+h*.10)) return false;
    if (!(nl.x < nr.x && fl.x < fr.x && fl.y < nl.y && fr.y < nr.y)) return false;
    const area=Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
    return area > w*h*.055;
  }
  function candidate(data, w, h) {
    const rows=[];
    for (let y=(h*.12)|0; y<h-3; y+=3) {
      const edge=[];
      for (let x=3; x<w-3; x+=2) {
        const dx=Math.abs(lum(data,w,x-3,y)-lum(data,w,x+3,y));
        const dy=Math.abs(lum(data,w,x,y-3)-lum(data,w,x,y+3));
        if (Math.max(dx,dy)>72) edge.push(x);
      }
      if (edge.length>8) {
        const left=median(edge.slice(0,Math.max(2,(edge.length*.13)|0)));
        const right=median(edge.slice(-Math.max(2,(edge.length*.13)|0)));
        if (right-left>w*.18) rows.push({y,left,right});
      }
    }
    const far=rows.filter(r=>r.y>h*.18&&r.y<h*.58), near=rows.filter(r=>r.y>h*.56);
    if (far.length<7||near.length<7) return null;
    const farY=median(far.map(r=>r.y)), nearY=median(near.map(r=>r.y));
    const active=rows.filter(r=>r.y>=farY-10&&r.y<=nearY+10);
    const left=fit(active.map(r=>[r.y,r.left])), right=fit(active.map(r=>[r.y,r.right]));
    if (!left||!right) return null;
    const q=[{x:lineAt(left,nearY),y:nearY},{x:lineAt(right,nearY),y:nearY},{x:lineAt(right,farY),y:farY},{x:lineAt(left,farY),y:farY}];
    if (!valid(q,w,h)) return null;
    const coverage=Math.min(1,rows.length/70);
    return {q, confidence:.42+.48*coverage};
  }
  function singleInset(q) {
    const ratio=(doublesWidth-singlesWidth)/(2*doublesWidth);
    return q.map((p,i)=>{
      const mate=i===0?q[1]:i===1?q[0]:i===2?q[3]:q[2];
      return {x:p.x+(mate.x-p.x)*ratio,y:p.y+(mate.y-p.y)*ratio};
    });
  }
  function smooth(next) {
    if (!state.quad) return next;
    return next.map((p,i)=>({x:state.quad[i].x*.72+p.x*.28,y:state.quad[i].y*.72+p.y*.28}));
  }
  function draw() {
    const r=overlay.getBoundingClientRect(); ox.clearRect(0,0,r.width,r.height);
    if (!state.quad) return;
    const sx=r.width/analysis.width, sy=r.height/analysis.height, q=state.quad;
    ox.save(); ox.lineWidth=3; ox.strokeStyle='#62f5b2'; ox.fillStyle='rgba(98,245,178,.10)';
    ox.beginPath(); q.forEach((p,i)=>i?ox.lineTo(p.x*sx,p.y*sy):ox.moveTo(p.x*sx,p.y*sy)); ox.closePath(); ox.fill(); ox.stroke();
    ox.fillStyle='#ffd166'; q.forEach(p=>{ox.beginPath();ox.arc(p.x*sx,p.y*sy,4,0,Math.PI*2);ox.fill()});
    ox.font='12px system-ui'; ox.fillStyle='#dfffee'; ox.fillText('实时场地边界 '+Math.round(state.confidence*100)+'%',12,22); ox.restore();
  }
  function tick(now) {
    if (video.readyState>=2 && !video.paused && now-state.lastAt>48) {
      state.lastAt=now; ax.drawImage(video,0,0,analysis.width,analysis.height);
      const frame=ax.getImageData(0,0,analysis.width,analysis.height);
      const found=candidate(frame.data,analysis.width,analysis.height);
      if (found) {
        state.quad=smooth(mode()==='singles'?singleInset(found.q):found.q);
        state.confidence=state.confidence*.65+found.confidence*.35; state.lostAt=0;
      } else if (!state.lostAt) state.lostAt=now;
      if (state.lostAt && now-state.lostAt>800) { state.quad=null; state.confidence=0; }
    }
    draw(); requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();