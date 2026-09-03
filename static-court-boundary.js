(() => {
  'use strict';
  const video=document.querySelector('#video'), host=document.querySelector('.viewer'), controls=document.querySelector('.controls');
  if (!video || !host || !controls) return;
  const source=document.createElement('canvas'); source.width=400; source.height=533;
  const sx=source.getContext('2d',{willReadFrequently:true});
  const layer=document.createElement('canvas'); layer.className='static-court-overlay';
  layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
  host.append(layer); const lx=layer.getContext('2d');
  const button=document.createElement('button'); button.type='button'; button.className='btn'; button.textContent='识别当前画面';
  controls.append(button);
  let quad=null, score=0;
  const L=(d,w,x,y)=>{const i=(y*w+x)*4;return d[i]*.213+d[i+1]*.715+d[i+2]*.072};
  const med=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[(a.length/2)|0]:NaN};
  const regression=ps=>{if(ps.length<8)return null;let sy=0,sx=0,syy=0,syx=0;for(const[y,x]of ps){sy+=y;sx+=x;syy+=y*y;syx+=y*x}const n=ps.length,D=n*syy-sy*sy;return Math.abs(D)<1e-6?null:{a:(n*syx-sy*sx)/D,b:(sx*syy-sy*syx)/D}};
  const xAt=(l,y)=>l.a*y+l.b;
  function valid(q,w,h){const[a,b,c,d]=q,n=b.x-a.x,f=c.x-d.x,area=Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;return n>w*.28&&f>w*.08&&n>f*1.08&&a.y>d.y+h*.1&&b.y>c.y+h*.1&&area>w*h*.055}
  function find(data,w,h){
    const rows=[];
    for(let y=(h*.12)|0;y<h-3;y+=3){const xs=[];for(let x=3;x<w-3;x+=2){const edge=Math.max(Math.abs(L(data,w,x-3,y)-L(data,w,x+3,y)),Math.abs(L(data,w,x,y-3)-L(data,w,x,y+3)));if(edge>72)xs.push(x)}if(xs.length>8){const left=med(xs.slice(0,Math.max(2,(xs.length*.13)|0))),right=med(xs.slice(-Math.max(2,(xs.length*.13)|0)));if(right-left>w*.18)rows.push({y,left,right})}}
    const far=rows.filter(r=>r.y>h*.18&&r.y<h*.58),near=rows.filter(r=>r.y>h*.56);if(far.length<7||near.length<7)return null;
    const fy=med(far.map(r=>r.y)),ny=med(near.map(r=>r.y)),active=rows.filter(r=>r.y>=fy-10&&r.y<=ny+10),left=regression(active.map(r=>[r.y,r.left])),right=regression(active.map(r=>[r.y,r.right]));if(!left||!right)return null;
    const q=[{x:xAt(left,ny),y:ny},{x:xAt(right,ny),y:ny},{x:xAt(right,fy),y:fy},{x:xAt(left,fy),y:fy}];return valid(q,w,h)?{q,score:Math.min(.95,.4+rows.length/80)}:null;
  }
  function singles(q){const r=(6.10-5.18)/(2*6.10);return q.map((p,i)=>{const mate=i===0?q[1]:i===1?q[0]:i===2?q[3]:q[2];return{x:p.x+(mate.x-p.x)*r,y:p.y+(mate.y-p.y)*r}})}
  function draw(){const r=layer.getBoundingClientRect(),d=devicePixelRatio||1;layer.width=Math.round(r.width*d);layer.height=Math.round(r.height*d);lx.setTransform(d,0,0,d,0,0);lx.clearRect(0,0,r.width,r.height);if(!quad)return;const px=r.width/source.width,py=r.height/source.height;lx.lineWidth=3;lx.strokeStyle='#ffd166';lx.fillStyle='rgba(255,209,102,.12)';lx.beginPath();quad.forEach((p,i)=>i?lx.lineTo(p.x*px,p.y*py):lx.moveTo(p.x*px,p.y*py));lx.closePath();lx.fill();lx.stroke();lx.fillStyle='#ffd166';quad.forEach(p=>{lx.beginPath();lx.arc(p.x*px,p.y*py,4,0,7);lx.fill()});lx.fillStyle='#dfffee';lx.font='12px system-ui';lx.fillText('静态边界识别 '+Math.round(score*100)+'%',12,22)}
  button.onclick=()=>{if(video.readyState<2){document.querySelector('#statusText').textContent='请先启动摄像头或载入视频';return}sx.drawImage(video,0,0,source.width,source.height);const hit=find(sx.getImageData(0,0,source.width,source.height).data,source.width,source.height);if(!hit){quad=null;score=0;document.querySelector('#statusText').textContent='未找到有效球场边界；请让完整半场清晰可见';draw();return}quad=document.querySelector('#modeBadge')?.textContent.includes('单打')?singles(hit.q):hit.q;score=hit.score;document.querySelector('#statusText').textContent='已绘制当前画面的球场边界';draw()};
  new ResizeObserver(draw).observe(layer);
})();