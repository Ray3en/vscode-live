const $ = id => document.getElementById(id);
const key = 'delo-rooms-v1';
const files = {
  'App.tsx': 'import { Routes, Route } from "react-router-dom";\nimport ProductsPage from "./ProductsPage";\n\nexport default function App() {\n  return (\n    <Routes>\n      <Route path="/products" element={<ProductsPage />} />\n    </Routes>\n  );\n}',
  'ProductsPage.tsx': 'export default function ProductsPage() {\n  return <h1>Каталог товаров</h1>;\n}',
  'products.ts': 'export async function fetchProduct(id: number) {\n  const response = await fetch("/api/products/" + id);\n  return response.json();\n}'
};
const seed = [{id:'284610',name:'Маршрутизация в React',files:{...files}}, {id:'712405',name:'React Context',files:{'theme.ts':'export type Theme = "light" | "dark";'}}, {id:'613820',name:'Запросы к API',files:{'products.ts':files['products.ts']}}];
if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(seed));
const rooms = () => JSON.parse(localStorage.getItem(key));
const owners = JSON.parse(sessionStorage.getItem('owners') || '[]');
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active = '', file = '', online = true, mode = '', frozen;
function mutate(fn){const all=rooms();fn(all);localStorage.setItem(key,JSON.stringify(all));}
const art = '<svg viewBox="0 0 440 225" fill="none" aria-hidden="true"><defs><pattern id="dots" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#6987b3"/></pattern></defs><rect width="440" height="225" fill="url(#dots)" opacity=".4"/><g transform="translate(75 8) rotate(-12 140 105) skewX(9)" stroke="#93b4ff">'+[32,20,8,0].map((d,i)=>'<rect x="'+(35+d)+'" y="'+(32+d)+'" width="215" height="116" rx="9" fill="#243b66" opacity="'+(.45+i*.17)+'"/>').join('')+'<path d="m113 71 -21 17 21 17m66-34 21 17-21 17m-24-44-19 58" stroke-width="6" stroke-linecap="round"/></g></svg>';
function connection(){return '<aside class="panel"><h3>Соединение</h3><p class="pill '+(online?'':'off')+'">'+(online?'Подключено':'Отключено')+'</p><p class="muted">Демо-сервер · локальный режим</p><button data-act="network">'+(online?'Отключить':'Восстановить соединение')+'</button></aside>'}
function render(){
 const all=online?rooms():frozen;const room=all.find(r=>r.id===active);
 if(active && !room) active='';
 const crumb='<div class="crumb">Рабочее пространство　/　Комнаты</div>';
 if(!room){
 const hero=all[0];
 $('app').innerHTML=crumb+'<div class="top"><h1>Комнаты</h1><div class="actions"><button data-act="join">Войти по коду</button><button class="primary" data-act="create">＋ Создать комнату</button></div></div>'+(hero?'<section class="hero">'+art+'<div><span class="pill">В эфире</span><h2>'+esc(hero.name)+'</h2><button data-room="'+hero.id+'">Открыть комнату　→</button></div></section>':'')+'<div class="grid"><section><h2>Все комнаты <small>'+all.length+'</small></h2><div class="list">'+all.map(r=>'<button class="item" data-room="'+r.id+'"><span class="icon">&lt;/&gt;</span><span><b>'+esc(r.name)+'</b><small>'+r.id+' · Файлов: '+Object.keys(r.files).length+'</small></span><i>→</i></button>').join('')+'</div></section>'+connection()+'</div>';return;
 }
 const host=owners.includes(active);
 if(!(file in room.files)) file=Object.keys(room.files)[0];
 $('app').innerHTML=crumb+'<div class="top"><h1>'+esc(room.name)+'</h1></div><div class="actions"><button data-act="leave">← Комнаты</button><button data-act="copy">Код: '+active+'　⧉</button><span class="muted">'+(host?'Преподаватель':'Студент · Только чтение')+'</span></div><div class="grid"><section><div class="workspace"><div class="tree"><h3>Файлы эфира</h3>'+Object.keys(room.files).map(f=>'<button class="'+(file===f?'sel':'')+'" data-file="'+esc(f)+'">'+esc(f)+'</button>').join('')+(host?'<button data-act="add">＋ Добавить файл</button>':'')+'</div><div class="editor"><label for="code">'+esc(file)+'</label><textarea id="code" spellcheck="false" '+(host&&online?'':'readonly')+'></textarea></div></div></section>'+connection()+'</div>';
 $('code').value=room.files[file];$('code').oninput=e=>{if(online&&host)mutate(all=>{const r=all.find(r=>r.id===active);if(r)r.files[file]=e.target.value;});};
}
function enter(id){if(!online)return alert('Сначала восстановите соединение.');active=id;file='';render();}
function openForm(action){
 if(!online)return alert('Сначала восстановите соединение.');
 mode=action;const config={create:['Новая комната','Название занятия','Создать комнату'],join:['Вход в комнату','Шестизначный код','Подключиться'],add:['Добавить файл','Имя файла','Добавить']};
 const [heading,label,button]=config[action];$('title').textContent=heading;$('label').textContent=label;$('submit').textContent=button;$('field').value='';$('error').textContent='';$('modal').showModal();$('field').focus();
}
$('form').onsubmit=e=>{e.preventDefault();const value=$('field').value.trim();if(!value)return;
 if(mode==='join'){if(!rooms().some(r=>r.id===value)){ $('error').textContent='Комната с таким кодом не найдена.';return;}enter(value);}
 if(mode==='create'){let id;do{id=String(100000+Math.floor(Math.random()*900000));}while(rooms().some(r=>r.id===id));mutate(all=>all.unshift({id,name:value,files:{'index.ts':'// Код занятия\n'}}));owners.push(id);sessionStorage.setItem('owners',JSON.stringify(owners));enter(id);}
 if(mode==='add'){const r=rooms().find(r=>r.id===active);if(!r||!owners.includes(active)||Object.hasOwn(r.files,value)||['__proto__','constructor','prototype'].includes(value)){ $('error').textContent='Выберите другое имя файла.';return;}mutate(all=>all.find(r=>r.id===active).files[value]='');file=value;render();}
 $('modal').close();};
$('app').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.room)return enter(b.dataset.room);if(b.dataset.file){file=b.dataset.file;return render();}switch(b.dataset.act){
 case 'create':case 'join':case 'add':openForm(b.dataset.act);break;
 case 'network':if(online)frozen=rooms();online=!online;render();break;
 case 'leave':active='';render();break;
 case 'copy':try{await navigator.clipboard.writeText(active);b.textContent='Скопировано';}catch{prompt('Код комнаты',active);}break;
}};
window.addEventListener('storage',e=>{if(online&&e.key===key)render();});render();
