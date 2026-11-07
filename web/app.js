const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owners = JSON.parse(sessionStorage.getItem('efir-owners') || '{}');
let room = null, file = '', online = true, mode = '', timer, saveTimer;

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `HTTP ${res.status}`); }
  return res.status === 204 ? null : res.json();
}
function token() { return room && owners[room.id]; }
function connection(inRoom=false) { const nav=inRoom?`<div class="side-nav"><h3>Комната</h3><button data-act="leave">← Все комнаты</button><button data-act="copy">Код: ${room.id}　⧉</button><button data-act="fullscreen">⛶ Полноэкранный режим</button><p class="muted">${token()?'Преподаватель':'Студент · Только чтение'}</p></div>`:'';return `<aside class="panel">${nav}<div class="connection"><h3>Соединение</h3><p class="pill ${online?'':'off'}">${online?'Подключено':'Отключено'}</p><p class="muted">Сервер комнат · общий режим</p><button data-act="network">${online?'Отключить':'Восстановить соединение'}</button></div></aside>`; }
function jsxTag(source){const re=/(<\/?)([A-Za-z][\w.]*)|([\w:-]+)(?=\s*=)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([{}=/>])/g;let out='',last=0;for(const m of source.matchAll(re)){out+=esc(source.slice(last,m.index));let kind='punct';if(m[2])kind=/^[A-Z]/.test(m[2])?'component':'element';else if(m[3])kind='prop';else if(m[4])kind='string';out+=`<span class="tok-${kind}">${esc(m[0])}</span>`;last=m.index+m[0].length;}return out+esc(source.slice(last));}
function highlight(source,name){if(!/\.(jsx|tsx)$/i.test(name))return esc(source);const re=/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<\/?[A-Za-z][^>]*>|\buse[A-Z]\w*\b|\b[A-Z]\w*(?=\s*[<(])|\b[a-zA-Z_$][\w$]*(?=\s*\()|\b(?:import|from|export|default|const|let|var|function|return|if|else|for|while|async|await|class|extends|interface|type|enum|new|throw|try|catch|finally|typeof|instanceof|as|keyof|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|=>|===|!==|&&|\|\||\?\?)/g;let out='',last=0;for(const m of source.matchAll(re)){out+=esc(source.slice(last,m.index));const v=m[0];let kind=v.startsWith('//')||v.startsWith('/*')?'comment':v.startsWith('<')?'jsx':/^["'`]/.test(v)?'string':/^\d/.test(v)?'number':/^use[A-Z]/.test(v)?'hook':/^[A-Z]/.test(v)?'component':/^[a-zA-Z_$]/.test(v)&&source.slice(m.index+v.length).match(/^\s*\(/)?'function':/^[=&|?!]/.test(v)?'operator':'keyword';out+=kind==='jsx'?jsxTag(v):`<span class="tok-${kind}">${esc(v)}</span>`;last=m.index+v.length;}return out+esc(source.slice(last))+'\n';}
async function toggleFullscreen(){if(document.fullscreenElement)return document.exitFullscreen();document.body.classList.add('focus-mode');try{await document.documentElement.requestFullscreen();}catch{}}
function render() {
  const crumb = '<div class="crumb">Рабочее пространство　/　Комнаты</div>';
  if (!room) {
    $('app').innerHTML = `${crumb}<div class="top"><h1>Комнаты</h1><div class="actions"><button data-act="join">Войти по коду</button><button class="primary" data-act="create">＋ Создать комнату</button></div></div><section class="hero"><div><span class="pill">Эфир</span><h2>Совместный просмотр кода</h2><p class="muted">Создайте комнату или подключитесь по шестизначному коду.</p></div></section><div class="grid"><section><h2>Как подключиться</h2><p class="note">Преподаватель создаёт комнату и передаёт код студентам. Изменения синхронизируются через сервер.</p></section>${connection()}</div>`;
    return;
  }
  const host = Boolean(token()), names = Object.keys(room.files);
  if (!names.includes(file)) file = names[0] || '';
  $('app').innerHTML = `${crumb}<div class="top room-title"><h1>${esc(room.name)}</h1></div><div class="grid room-grid"><section><div class="workspace"><div class="tree"><h3>Файлы эфира</h3>${names.map(n=>`<button class="${file===n?'sel':''}" data-file="${esc(n)}">${esc(n)}</button>`).join('')}${host?'<button data-act="add">＋ Добавить файл</button>':''}</div><div class="editor"><label for="code">${esc(file)}</label><div class="code-editor"><pre id="highlight" aria-hidden="true"></pre><textarea id="code" spellcheck="false" ${host&&online?'':'readonly'}></textarea></div></div></div></section>${connection(true)}</div>`;
  const editor=$('code'),layer=$('highlight');editor.value=room.files[file]||'';const paint=()=>{layer.innerHTML=highlight(editor.value,file);layer.scrollTop=editor.scrollTop;layer.scrollLeft=editor.scrollLeft;};paint();editor.onscroll=paint;
  editor.oninput=e=>{room.files[file]=e.target.value;paint();clearTimeout(saveTimer);saveTimer=setTimeout(save,180);};
}
async function save() {
  if (!online || !token()) return;
  try { room = await api(`/rooms/${room.id}`, { method:'PUT', headers:{ Authorization:`Bearer ${token()}` }, body:JSON.stringify({ files:room.files }) }); }
  catch (e) { online = false; render(); alert(e.message); }
}
async function refresh() {
  clearTimeout(timer);
  if (online && room) try {
    const next = await api(`/rooms/${room.id}`);
    if (next.version !== room.version) { const editor = $('code'); const focused = editor === document.activeElement && token(); room = next; if (!focused) render(); }
  } catch { online = false; render(); }
  timer = setTimeout(refresh, 700);
}
function openForm(action) {
  if (!online) return alert('Сначала восстановите соединение.');
  mode = action; const c = { create:['Новая комната','Название занятия','Создать комнату'], join:['Вход в комнату','Шестизначный код','Подключиться'], add:['Добавить файл','Имя файла','Добавить'] }[action];
  [$('title').textContent,$('label').textContent,$('submit').textContent] = c; $('field').value=''; $('error').textContent=''; $('modal').showModal(); $('field').focus();
}
$('form').onsubmit = async e => {
  e.preventDefault(); const value = $('field').value.trim(); if (!value) return;
  try {
    if (mode === 'create') { const data = await api('/rooms', { method:'POST', body:JSON.stringify({ name:value }) }); room=data.room; owners[data.id]=data.write; sessionStorage.setItem('efir-owners',JSON.stringify(owners)); }
    if (mode === 'join') { if (!/^\d{6}$/.test(value)) throw new Error('Введите шестизначный код'); room=await api(`/rooms/${value}`); }
    if (mode === 'add') { if (!/^[^/\\]{1,120}$/.test(value) || Object.hasOwn(room.files,value)) throw new Error('Выберите другое имя файла'); room.files[value]=''; file=value; await save(); }
    $('modal').close(); file=''; render(); refresh();
  } catch (err) { $('error').textContent=err.message; }
};
$('app').onclick = async e => { const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.file){file=b.dataset.file;return render();}
  switch(b.dataset.act){
    case 'create':case 'join':case 'add':openForm(b.dataset.act);break;
    case 'leave':room=null;clearTimeout(timer);render();break;
    case 'copy':try{await navigator.clipboard.writeText(room.id);b.textContent='Скопировано';}catch{prompt('Код комнаты',room.id);}break;
    case 'fullscreen':await toggleFullscreen();break;
    case 'network':online=!online;render();if(online)refresh();break;
  }
};
document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('focus-mode',Boolean(document.fullscreenElement)));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')&&!document.fullscreenElement)document.body.classList.remove('focus-mode');});
render();
