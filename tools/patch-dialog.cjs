// Rebuilds the DialogContactPanel body (the contact-form dialog) inside the compiled
// chunk vendor/_next/static/chunks/00vqtpq6zjam1.js.
// Source of truth = the pristine clone (../next-app). Output goes to next-app-custom.
// Validates the fully assembled file BEFORE writing, so the live file can never be left broken.
// Usage (from the next-app-custom folder):  node tools/patch-dialog.cjs
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', 'next-app', 'vendor', '_next', 'static', 'chunks', '00vqtpq6zjam1.js');
const DST = path.join(ROOT, 'vendor', '_next', 'static', 'chunks', '00vqtpq6zjam1.js');
const MARK = '"DialogContactPanel",0,e=>{';

const NEW_BODY = `let{title:v,closeLabel:U}=e,{isOpen:z,titleId:F,setIsOpen:B}=(0,I.useDialogContact)();
let X=(0,o.useCallback)(()=>B(!1),[B]);
(0,M.useKeydown)("Escape",X,{isEnabled:z});
return z&&(0,r.jsx)(x.m.dialog,{className:"z-header px-gutter-outer pointer-events-auto grid place-items-center-safe overflow-y-auto bg-black/50 backdrop-blur-sm","data-lenis-prevent":!0,ref:R,"aria-labelledby":F,onClose:X,closedby:"none",onCancel:N,onClick:ev=>{ev.target===ev.currentTarget&&X()},initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.2,ease:T.EASE_LINEAR},children:(0,r.jsxs)("div",{className:"py-gutter-outer flex w-full flex-col items-center gap-10",style:{maxWidth:"880px"},children:[(0,r.jsxs)("div",{className:"bg-grey-50 rounded-large tablet:gap-10 tablet:p-19 flex w-full flex-col gap-8 p-14",children:[(0,r.jsx)("h2",{className:"text-heading-2",id:F,children:v}),(0,r.jsxs)("form",{className:"flex flex-col gap-4",onSubmit:s=>{s.preventDefault();let f=new FormData(s.currentTarget);if(!f.get("captcha")){return alert("Please confirm you are not a robot")}console.log("Contact form submitted:",Object.fromEntries(f));alert("Thank you for your message. We will get back to you soon.");s.currentTarget.reset();B(!1)},children:[
(0,r.jsxs)("div",{style:{display:"flex",flexWrap:"wrap",gap:"16px"},children:[(0,r.jsxs)("div",{className:"flex flex-col gap-2",style:{flex:"1 1 200px"},children:[(0,r.jsx)("label",{className:"text-paragraph-medium",htmlFor:"contact-name",children:"Name"}),(0,r.jsx)("input",{id:"contact-name",name:"name",required:!0,className:"bg-grey-10 rounded-medium w-full text-paragraph-medium",style:{padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px"}})]}),(0,r.jsxs)("div",{className:"flex flex-col gap-2",style:{flex:"1 1 200px"},children:[(0,r.jsx)("label",{className:"text-paragraph-medium",htmlFor:"contact-email",children:"Email"}),(0,r.jsx)("input",{id:"contact-email",name:"email",type:"email",required:!0,className:"bg-grey-10 rounded-medium w-full text-paragraph-medium",style:{padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px"}})]})]}),
(0,r.jsxs)("div",{style:{display:"flex",flexWrap:"wrap",gap:"16px"},children:[(0,r.jsxs)("div",{className:"flex flex-col gap-2",style:{flex:"1 1 200px"},children:[(0,r.jsx)("label",{className:"text-paragraph-medium",htmlFor:"contact-mobile",children:"Mobile"}),(0,r.jsx)("input",{id:"contact-mobile",name:"mobile",type:"tel",className:"bg-grey-10 rounded-medium w-full text-paragraph-medium",style:{padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px"}})]}),(0,r.jsxs)("div",{className:"flex flex-col gap-2",style:{flex:"1 1 200px"},children:[(0,r.jsx)("label",{className:"text-paragraph-medium",htmlFor:"contact-company",children:"Your Company Name"}),(0,r.jsx)("input",{id:"contact-company",name:"company",className:"bg-grey-10 rounded-medium w-full text-paragraph-medium",style:{padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px"}})]})]}),
(0,r.jsxs)("div",{className:"flex flex-col gap-2",children:[(0,r.jsx)("label",{className:"text-paragraph-medium",htmlFor:"contact-service",children:"Select Service Required"}),(0,r.jsx)("select",{id:"contact-service",name:"service",defaultValue:"",required:!0,className:"bg-grey-10 rounded-medium w-full text-paragraph-medium",style:{padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px"},children:[(0,r.jsx)("option",{value:"",disabled:!0,children:"Select Service Required"}),(0,r.jsx)("option",{value:"Knowledge based consulting",children:"Knowledge based consulting"}),(0,r.jsx)("option",{value:"Technology Solutions",children:"Technology Solutions"}),(0,r.jsx)("option",{value:"Recommender Systems",children:"Recommender Systems"}),(0,r.jsx)("option",{value:"Labs / Research",children:"Labs / Research"})]})]}),
(0,r.jsxs)("div",{className:"flex flex-col gap-2",children:[(0,r.jsx)("label",{className:"text-paragraph-medium",htmlFor:"contact-message",children:"Message"}),(0,r.jsx)("textarea",{id:"contact-message",name:"message",className:"bg-grey-10 rounded-medium w-full text-paragraph-medium",rows:4,style:{padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px"}})]}),
(0,r.jsxs)("div",{style:{display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:"16px"},children:[(0,r.jsx)("label",{className:"flex items-center gap-2 cursor-pointer",children:[(0,r.jsx)("input",{type:"checkbox",name:"captcha",required:!0}),"I'm not a robot"]}),(0,r.jsx)("button",{type:"submit",className:"bg-accent-primary text-white rounded-full w-fit cursor-pointer items-center text-paragraph-medium transition-colors duration-200 ease-linear motion-reduce:transition-none",style:{padding:"7px 16px"},children:"Send Message"})]})
]})]}),(0,r.jsxs)("button",{type:"button",className:"text-paragraph-large hover:text-accent-secondary flex min-h-11 cursor-pointer items-center gap-1 px-2 text-white transition-colors duration-200 ease-linear motion-reduce:transition-none",onClick:X,"aria-expanded":"true",autoFocus:!0,children:[(0,r.jsx)(S.IconClose,{className:"size-6"}),U]})]})})`;

const x = fs.readFileSync(SRC, 'utf8');
const start = x.indexOf(MARK);
if (start < 0) throw new Error('start marker not found in pristine');
const bodyStart = x.indexOf('{', start);
const bodyEnd = x.indexOf('],20699', bodyStart);
if (bodyEnd < 0) throw new Error('end marker not found in pristine');

const out = x.slice(0, bodyStart + 1) + NEW_BODY + '}' + x.slice(bodyEnd);

// --- validations BEFORE writing ---
try { new vm.Script(out); } catch (err) { console.error('ABORT: assembled file does not compile:', err.message); process.exit(1); }
const markCount = (out.match(/\],20699/g) || []).length;
if (markCount !== 1) { console.error('ABORT: `],20699` count = ' + markCount); process.exit(1); }
for (const needle of ['Send Message', "I'm not a robot", 'contact-service', 'Knowledge based consulting', 'Technology Solutions', 'Recommender Systems', 'Labs / Research', 'S.IconClose', 'useKeydown', 'ref:R', 'onCancel:N', '"data-lenis-prevent":!0']) {
  if (!out.includes(needle)) { console.error('ABORT: missing', needle); process.exit(1); }
}
fs.writeFileSync(DST, out);
// --- verify written file ---
const back = fs.readFileSync(DST, 'utf8');
try { new vm.Script(back); } catch (err) { console.error('POST-WRITE COMPILE FAILED!', err.message); process.exit(1); }
console.log('OK  wrote', DST);
console.log('length', back.length, '(pristine', x.length + ')');
console.log('marker count 1 | Send Message | captcha | 4 services | close button: all present');
