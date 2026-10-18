// Patch the services-section chunk (2tvcy0m4g8gry.js):
//   - adds a right-arrow button on the services card (bottom-right, follows the
//     active service)
//   - clicking it calls showModal() on an always-mounted native <dialog> that
//     holds the detailed information of that service (same tree/outline content
//     as the previous himrobo.com "What We Do" site)
//
// IMPORTANT: the dialog must NEVER be conditionally mounted at the component
// root and the root element type must never change — a root type flip remounts
// the whole 400lvh section and kills framer-motion's scroll tracking (the card
// then freezes on service 0). The arrow + dialog are therefore added as extra
// children of the existing card div (absolute / display:none), and only
// dtReady (post-hydration) gates their insertion. The dialog opens/closes
// imperatively via .showModal()/.close() — no structural change on open.
//
// The patch is idempotent: previous generations are reverted by exact-string
// REVERTS, the helpers/data region between /*HIM-SVC-DETAILS-START*/ and
// /*HIM-SVC-DETAILS-END*/ is rebuilt, then the current EDITS are applied.
// The assembled source is compiled with vm.Script BEFORE writing — a broken
// chunk would kill the whole client app (3D scenes included).
//
// Usage: node tools/patch-services.cjs [--dry]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DRY = process.argv.includes('--dry');
const FILE = path.join(__dirname, '..', 'vendor', '_next', 'static', 'chunks', '2tvcy0m4g8gry.js');
const MARK_START = '/*HIM-SVC-DETAILS-START*/';
const MARK_END = '/*HIM-SVC-DETAILS-END*/';

// ---------------------------------------------------------------- region body
// (inserted after `function ew(e){return e.a11yShow}`, before the BlockFactory export)
const REGION = String.raw`/*HIM-SVC-DETAILS-START*/
let dtSVC=[{title:"Knowledge based consulting",root:null,chips:null,cols:[{h:"Design Intelligence",s:["Product Improvements","Problem Solving"],g:[{t:"Product Improvements:-",n:"Design changes for",b:["Product cost reduction","Part count reduction","Proper fit and function"]},{t:"Problem Solving:-",b:["Solve design problems to optimize function, reliability and robustness","Solve engineering problems through analysis and computation","Bring the best of both worlds \u2013 design feasibility and design requirement"]}]},{h:"Manufacturing Intelligence",s:["Part Handling Solutions","Manufacturing Automation"],g:[{t:"Part Handling Solutions:-",n:"Design changes for",b:["Optimum handling solution for the given problem","Make or buy decision for handling accessories like grippers","Combining parameters like speed, capacity, safety and cost to arrive at the right solution"]},{t:"Manufacturing Automation:-",b:["Sophisticated automation with PLCs, sensors and actuators","Choosing the right actuator/sensors","System design considering impact of control on the accuracy and reliability of the automation system"]}]}]},{title:"Technology Solutions",root:"Technology Solutions",chips:["Robotics","Internet of Things"],cols:[{h:"Robotics",s:["Industrial\nApplication","Commercial\nApplication","Defence /\nNuclear\nApplication"],g:[{t:"Industrial Application:-",n:"Industrial Robots for :-",b:["Pick and Place / Handling for precise handling"]},{t:"Commercial Application :-",n:"Robots for needs like",b:["Service robots","Friendly robots"]},{t:"Defence / Nuclear Application:-",n:"Robots for needs like",b:["Surveillance robots","Swarm robots"]}]},{h:"Internet of Things",s:["Sensor Application","Data Analytics"],g:[{t:"Sensor Application:-",b:["Sensor selection based on the application","Building circuitry to enable sensor data capture"]},{t:"Data Analytics:-",b:["Data transformation / Data normalization","First level statistical analysis","Using Machine Learning algorithms for finding patterns and doing prediction","Partitioning data into training, cross validation and test data","Inferencing insights from predictions and patterns"]}]}]},{title:"Recommender Systems",root:"Recommender Systems",chips:["Manufacturing / Assembly Risk","Engineering de-skilling","Anomaly Detection"],cols:null,g:[{t:"Manufacturing / Assembly Risk:-",b:["Evaluate manufacturing & assembly risk based on manufacturing & assembly parameters","Combine process capability, DFMEA & manufacturing/assembly risk to predict quality cost"]},{t:"Engineering de-skilling:-",b:["To reduce human error","To make skill free decision making","System dependent solutions"]},{t:"Anomaly Detection:-",b:["Find anomalies from process data","Provide actionable information like early warning for failures"]}]},{title:"Labs / Research",root:"Labs / Research",chips:["Gesture Recognition","Visual Inspection","Artificial Intelligence"],cols:null,g:[{t:"Gesture Recognition:-",b:["For intuitive user interfaces in industry and consumer applications"]},{t:"Visual Inspection:-",b:["Using camera / laser / IR sensor","Defect recognition / Defect classification"]},{t:"Artificial Intelligence:-",b:["Custom 'learning' algorithms","Combine sensors, data and AI to design intelligent adaptive systems"]}]}];
function dtSVCFor(e,t){try{for(let r=0;r<dtSVC.length;r++)if(e&&e[t]&&e[t].title===dtSVC[r].title)return dtSVC[r]}catch(e){}return dtSVC[t]||dtSVC[0]}
function dtChip(e,t){let n=String(e).split("\n");return(0,a.jsx)("span",{style:{display:"inline-block",border:"1px solid #d4d4d8",borderRadius:"6px",background:"#fff",padding:"6px 12px",fontSize:"13px",lineHeight:"1.35",color:"#27272a",textAlign:"center"},children:1===n.length?e:n.map(function(e,t){return t?(0,a.jsxs)(l.Fragment,{children:[(0,a.jsx)("br",{}),e]},t):e})},t)}
function dtGroup(e,t){return(0,a.jsxs)("div",{style:{marginTop:"16px"},children:[(0,a.jsx)("div",{style:{fontWeight:700,fontSize:"14px",color:"#18181b"},children:"\u2022 "+e.t}),e.n?(0,a.jsx)("div",{style:{marginTop:"6px",paddingLeft:"20px",fontSize:"13.5px",color:"#3f3f46"},children:e.n}):null,(0,a.jsx)("ul",{style:{listStyle:"disc",marginTop:"6px",paddingLeft:"36px",fontSize:"13.5px",lineHeight:"1.65",color:"#27272a"},children:e.b.map(function(e,t){return(0,a.jsx)("li",{children:e},t)})})]},t)}
let dtTreeCSS=".himtree{display:flex;justify-content:center}.himtree ul{margin:0;padding:20px 0 0;list-style:none;position:relative;display:flex;justify-content:center;text-align:center}.himtree>ul{padding-top:0}.himtree li{display:flex;flex-direction:column;align-items:center;list-style:none;position:relative;padding:20px 5px 0;text-align:center}.himtree li:only-child{padding-top:0}.himtree li::before,.himtree li::after{content:'';position:absolute;top:0;right:50%;border-top:1px solid #ccc;width:50%;height:20px}.himtree li::after{right:auto;left:50%;border-left:1px solid #ccc}.himtree li:only-child::before,.himtree li:only-child::after{display:none}.himtree li:first-child::before,.himtree li:last-child::after{border:0 none}.himtree li:last-child::before{border-right:1px solid #ccc;border-radius:0 5px 0 0}.himtree li:first-child::after{border-radius:5px 0 0 0}.himtree ul ul::before{content:'';position:absolute;top:0;left:50%;border-left:1px solid #ccc;width:0;height:20px}[data-him-svc-dialog]{opacity:0;transition:opacity .22s ease-in,display .22s allow-discrete,overlay .22s allow-discrete}[data-him-svc-dialog][open]{opacity:1;transition:opacity .26s ease-out,display .26s allow-discrete,overlay .26s allow-discrete}[data-him-svc-dialog] .him-svc-panel{opacity:0;transform:translateY(16px) scale(.96);transition:opacity .18s ease-in,transform .18s ease-in}[data-him-svc-dialog][open] .him-svc-panel{opacity:1;transform:translateY(0) scale(1);transition:opacity .3s ease-out,transform .34s cubic-bezier(.16,1,.3,1)}@starting-style{[data-him-svc-dialog][open]{opacity:0}[data-him-svc-dialog][open] .him-svc-panel{opacity:0;transform:translateY(16px) scale(.96)}}@media (prefers-reduced-motion:reduce){[data-him-svc-dialog],[data-him-svc-dialog] .him-svc-panel{transition:none!important}}";
function dtTree(e,t){return(0,a.jsxs)("div",{className:"himtree",children:[(0,a.jsxs)("ul",{children:[(0,a.jsxs)("li",{children:[dtChip(e.h,"p"),(0,a.jsx)("ul",{children:(e.s||[]).map(function(e,t){return(0,a.jsx)("li",{children:dtChip(e,t)},t)})})]})]})]},t)}
function dtCol(e,t){return(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column"},children:[dtTree({h:e.h,s:e.s},"t"),e.g.map(function(e,t){return dtGroup(e,t)})]},t)}
function dtHead(e){return dtTree({h:e.root,s:e.chips},"r")}
function dtBody(e){return(0,a.jsxs)("div",{children:[e.root?dtHead(e):null,e.cols?(0,a.jsx)("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:"32px",marginTop:e.root?"22px":"0"},children:e.cols.map(function(e,t){return dtCol(e,t)})}):(0,a.jsx)("div",{style:{display:"flex",flexDirection:"column",marginTop:e.root?"4px":"0"},children:(e.g||[]).map(function(e,t){return dtGroup(e,t)})})]})}
function dtDetailDialog(e){let t=(0,l.useRef)(null);(0,l.useEffect)(function(){let n=t.current;if(!n)return;let o=window.__lenis;if(e.open){o&&o.stop();if(!n.open)try{n.showModal()}catch(t){}}else{if(n.open)n.close();o&&o.start()}},[e.open]);(0,l.useEffect)(function(){if("undefined"==typeof document||document.querySelector("style[data-him-svc-tree]"))return;let n=document.createElement("style");n.setAttribute("data-him-svc-tree","");n.textContent=dtTreeCSS;document.head.appendChild(n)},[]);return(0,a.jsx)("dialog",{"data-him-svc-dialog":!0,ref:t,onCancel:function(n){n.preventDefault(),e.onClose&&e.onClose()},style:{position:"fixed",inset:"0",width:"100vw",height:"100vh",maxWidth:"none",maxHeight:"none",margin:"0",padding:"0",border:"none",background:"transparent",color:"#18181b",overflow:"hidden"},children:(0,a.jsx)("div",{className:"him-svc-wrap",onClick:function(n){n.target===n.currentTarget&&e.onClose&&e.onClose()},style:{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",padding:"24px",background:"rgba(0,0,0,.4)"},children:(0,a.jsxs)("div",{className:"him-svc-panel",style:{width:"min(1040px,94vw)",maxHeight:"100%",background:"#fbfbfc",borderRadius:"20px",boxShadow:"0 24px 80px rgba(0,0,0,.35)",overflow:"hidden",display:"flex",flexDirection:"column",minHeight:"0"},children:[(0,a.jsxs)("div",{style:{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",padding:"18px 64px",background:"#f0f0f2",borderBottom:"1px solid #e4e4e7"},children:[(0,a.jsx)("div",{className:"text-heading-4",style:{textAlign:"center"},children:e.svc?e.svc.title:""}),(0,a.jsx)("button",{"data-him-svc-close":!0,type:"button","aria-label":"Close details",onClick:e.onClose,style:{position:"absolute",right:"16px",top:"50%",transform:"translateY(-50%)",width:"36px",height:"36px",border:"none",borderRadius:"999px",background:"transparent",cursor:"pointer",fontSize:"20px",lineHeight:"1",color:"#52525b"},children:"\u2715"})]}),(0,a.jsx)("div",{"data-lenis-prevent":!0,style:{overflowY:"auto",padding:"26px 36px 36px",minHeight:"0"},children:e.svc?dtBody(e.svc):null})]})})})}
/*HIM-SVC-DETAILS-END*/`;

// ---------------------------------------------------------------- reverts
// [previous-generation artifact, pristine form] — restore the pristine chunk
// before applying the current edits (keeps the tool idempotent across versions).
const PRISTINE_CARD = 'M[29]!==b||M[30]!==x?(_=(0,a.jsxs)("div",{"aria-live":"polite",className:"tablet:max-w-100 rounded-small col-span-full flex w-full flex-col gap-8 justify-self-end bg-white p-8",children:[b,x]}),M[29]=b,M[30]=x,M[31]=_):_=M[31]';
const REVERTS = [
  ['M=(0,i.c)(40),{tags:E,areas:j}=e', 'M=(0,i.c)(38),{tags:E,areas:j}=e'],
  [
    '[R,L]=(0,l.useState)(null),[dtReady,dtSetReady]=(0,l.useState)(!1),[dtOpen,dtSet]=(0,l.useState)(null),N=null!=R?R:O;',
    '[R,L]=(0,l.useState)(null),N=null!=R?R:O;',
  ],
  [
    '(0,l.useEffect)(o,f),(0,l.useEffect)(function(){dtSetReady(!0)},[]),M[7]!==j.length?',
    '(0,l.useEffect)(o,f),M[7]!==j.length?',
  ],
  [
    'M[29]!==b||M[30]!==x||M[38]!==dtReady?(_=(0,a.jsxs)("div",{"aria-live":"polite",className:"tablet:max-w-100 rounded-small col-span-full flex w-full flex-col gap-8 justify-self-end bg-white p-8",children:[b,dtReady?(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"},children:[x,(0,a.jsx)("button",{"data-him-detail":!0,type:"button","aria-label":"View service details",title:"View details",onClick:function(){dtSet(N)},style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:"40px",height:"40px",borderRadius:"999px",border:"none",background:"#e05c00",color:"#fff",cursor:"pointer",flexShrink:"0",boxShadow:"0 6px 18px rgba(224,92,0,.35)"},children:(0,a.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:(0,a.jsx)("path",{d:"M5 12h14M13 6l6 6-6 6"})})})]}):x]}),M[29]=b,M[30]=x,M[38]=dtReady,M[31]=_):_=M[31]',
    PRISTINE_CARD,
  ],
  [
    'M[29]!==b||M[30]!==x||M[38]!==dtReady||M[39]!==dtOpen?(_=(0,a.jsxs)("div",{"aria-live":"polite",className:"tablet:max-w-100 rounded-small col-span-full flex w-full flex-col gap-8 justify-self-end bg-white p-8",style:{position:"relative"},children:[b,x,dtReady?(0,a.jsx)("button",{"data-him-detail":!0,type:"button","aria-label":"View service details",title:"View details",onClick:function(){dtSet(N)},style:{position:"absolute",right:"16px",bottom:"16px",display:"inline-flex",alignItems:"center",justifyContent:"center",width:"40px",height:"40px",borderRadius:"999px",border:"none",background:"#e05c00",color:"#fff",cursor:"pointer",boxShadow:"0 6px 18px rgba(224,92,0,.35)"},children:(0,a.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:(0,a.jsx)("path",{d:"M5 12h14M13 6l6 6-6 6"})})}):null,dtReady?(0,a.jsx)(dtDetailDialog,{open:dtOpen!=null,svc:dtOpen==null?null:dtSVCFor(j,dtOpen),onClose:function(){dtSet(null)}}):null]}),M[29]=b,M[30]=x,M[38]=dtReady,M[39]=dtOpen,M[31]=_):_=M[31]',
    PRISTINE_CARD,
  ],
  [
    ',M[37]=C):C=M[37],dtOpen==null?C:(0,a.jsxs)("div",{style:{display:"contents"},children:[C,(0,a.jsx)(dtDetailDialog,{svc:dtSVCFor(j,dtOpen),onClose:function(){dtSet(null)}})]})}],97302)',
    ',M[37]=C):C=M[37],C}],97302)',
  ],
];

// ---------------------------------------------------------------- anchored edits
// [pristine anchor, new content, marker that proves it is already applied]
const EDITS = [
  [
    'M=(0,i.c)(38),{tags:E,areas:j}=e',
    'M=(0,i.c)(42),{tags:E,areas:j}=e',
    'M=(0,i.c)(42),{tags:E,areas:j}=e',
  ],
  [
    '[R,L]=(0,l.useState)(null),N=null!=R?R:O;',
    '[R,L]=(0,l.useState)(null),[dtReady,dtSetReady]=(0,l.useState)(!1),[dtOpen,dtSet]=(0,l.useState)(null),N=null!=R?R:O;',
    '[dtReady,dtSetReady]=(0,l.useState)(!1)',
  ],
  [
    '(0,l.useEffect)(o,f),M[7]!==j.length?',
    '(0,l.useEffect)(o,f),(0,l.useEffect)(function(){dtSetReady(!0)},[]),M[7]!==j.length?',
    'dtSetReady(!0)},[]),M[7]!==j.length?',
  ],
  [
    PRISTINE_CARD,
    'M[29]!==b||M[30]!==x||M[38]!==dtReady||M[39]!==dtOpen?(_=(0,a.jsxs)("div",{"aria-live":"polite",className:"tablet:max-w-100 rounded-small col-span-full flex w-full flex-col gap-8 justify-self-end bg-white p-8"+(dtReady?" relative":""),style:dtReady?{position:"relative"}:null,children:[b,x,dtReady?(0,a.jsx)("button",{"data-him-detail":!0,type:"button","aria-label":"View service details",title:"View details",onClick:function(){dtSet(N)},style:{position:"absolute",right:"16px",bottom:"16px",display:"inline-flex",alignItems:"center",justifyContent:"center",width:"40px",height:"40px",borderRadius:"999px",border:"none",background:"#e05c00",color:"#fff",cursor:"pointer",boxShadow:"0 6px 18px rgba(224,92,0,.35)"},children:(0,a.jsx)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:(0,a.jsx)("path",{d:"M5 12h14M13 6l6 6-6 6"})})}):null,dtReady?(0,a.jsx)(dtDetailDialog,{open:dtOpen!=null,svc:dtOpen==null?null:dtSVCFor(j,dtOpen),onClose:function(){dtSet(null)}}):null]}),M[29]=b,M[30]=x,M[38]=dtReady,M[39]=dtOpen,M[31]=_):_=M[31]',
    'style:dtReady?{position:"relative"}:null',
  ],
];

const REGION_INSERT_OLD = 'function ew(e){return e.a11yShow}e.s(["BlockFactory",0,e=>{';
const REGION_INSERT_NEW = 'function ew(e){return e.a11yShow}' + REGION + 'e.s(["BlockFactory",0,e=>{';

// ---------------------------------------------------------------- helpers
const count = (hay, needle) => hay.split(needle).length - 1;
function compileCheck(code, label) {
  try {
    new vm.Script(code, { filename: label });
    return null;
  } catch (e) {
    return e.message;
  }
}

// ---------------------------------------------------------------- build
let src = fs.readFileSync(FILE, 'utf8');
console.log('chunk:', FILE, '(' + src.length + ' bytes)');

// 1) strip previous region (idempotent rebuild)
{
  const s = src.indexOf(MARK_START);
  const e = src.indexOf(MARK_END);
  if (s !== -1 && e !== -1 && e > s) {
    src = src.slice(0, s) + src.slice(e + MARK_END.length);
    console.log('stripped previous HIM-SVC-DETAILS region');
  } else if (s !== -1 || e !== -1) {
    console.error('FATAL: incomplete region markers (start=' + s + ', end=' + e + ')');
    process.exit(1);
  }
}

// 2) revert previous-generation edits to pristine form
for (const [artifact, pristine] of REVERTS) {
  const c = count(src, artifact);
  if (c === 0) continue;
  if (c !== 1) {
    console.error('FATAL: revert artifact not unique (' + c + 'x): ' + artifact.slice(0, 80));
    process.exit(1);
  }
  src = src.replace(artifact, pristine);
  console.log('reverted: ' + artifact.slice(0, 60));
}

// 3) anchored edits (skip when already applied)
for (const [oldS, newS, proof] of EDITS) {
  if (src.includes(proof) && count(src, oldS) === 0) {
    console.log('skip (already applied): ' + oldS.slice(0, 60));
    continue;
  }
  const c = count(src, oldS);
  if (c !== 1) {
    console.error('FATAL: anchor not unique/found (' + c + 'x): ' + oldS.slice(0, 90));
    process.exit(1);
  }
  src = src.replace(oldS, newS);
  console.log('applied: ' + oldS.slice(0, 60));
}

// 4) region insert
{
  const c = count(src, REGION_INSERT_OLD);
  if (src.includes(MARK_START)) {
    console.error('FATAL: region markers still present after strip');
    process.exit(1);
  } else if (c !== 1) {
    console.error('FATAL: region insert anchor not unique/found (' + c + 'x)');
    process.exit(1);
  }
  src = src.replace(REGION_INSERT_OLD, REGION_INSERT_NEW);
  console.log('applied: region insert (' + REGION.length + ' chars)');
}

// 5) validate assembled source BEFORE writing
const err = compileCheck(src, '2tvcy0m4g8gry.js');
if (err) {
  console.error('FATAL: assembled chunk does not compile:\n' + err);
  console.error('(nothing written — chunk left untouched)');
  process.exit(1);
}
const checks = {
  'region markers': count(src, MARK_START) === 1 && count(src, MARK_END) === 1,
  'arrow button (absolute)': count(src, 'data-him-detail') === 1 && src.includes('position:"absolute",right:"16px",bottom:"16px"'),
  'card becomes relative on mount': src.includes('style:dtReady?{position:"relative"}:null') && src.includes('+(dtReady?" relative":"")'),
  'dialog lenis lock (stop/start + prevent)': src.includes('o&&o.stop()') && src.includes('o&&o.start()') && src.includes('"data-lenis-prevent":!0'),
  'detail dialog (always mounted)': count(src, 'dtDetailDialog') >= 2 && src.includes('if(!n.open)try{n.showModal()}catch(t){}'),
  'diagram connectors (tree css + helper)': src.includes('dtTreeCSS=".himtree{') && src.includes('className:"himtree"') && src.includes('ul ul::before{content:'),
  'dialog open/close animation (css transitions)': src.includes('allow-discrete') && src.includes('@starting-style') && src.includes('className:"him-svc-panel"') && src.includes('background:"rgba(0,0,0,.4)"'),
  'state hook': count(src, '[dtReady,dtSetReady]') === 1,
  'cache grown to 42': count(src, '(0,i.c)(42)') === 1,
  'no root wrapper': !src.includes('display:"contents"'),
};
for (const [k, v] of Object.entries(checks)) {
  console.log((v ? 'ok   ' : 'MISS ') + k);
  if (!v) process.exit(1);
}

if (DRY) {
  console.log('DRY RUN — vm.Script OK, would write ' + src.length + ' bytes (was ' + fs.statSync(FILE).size + ')');
  process.exit(0);
}

fs.writeFileSync(FILE, src, 'utf8');
console.log('written ' + src.length + ' bytes');

// 6) re-read + re-validate
const back = fs.readFileSync(FILE, 'utf8');
const err2 = compileCheck(back, 'readback');
if (err2) {
  console.error('FATAL: read-back does not compile: ' + err2);
  process.exit(1);
}
if (back !== src) {
  console.error('FATAL: read-back differs from written content');
  process.exit(1);
}
console.log('read-back validated OK');
