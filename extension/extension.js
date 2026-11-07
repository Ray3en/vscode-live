const vscode = require('vscode');
const path = require('node:path');
let session, status, changed;
const wait = ms => new Promise(r => setTimeout(r, ms));
function baseUrl() { return vscode.workspace.getConfiguration('efir').get('serverUrl','http://127.0.0.1:18081').replace(/\/$/,''); }
async function request(pathname, options={}) {
  const res=await fetch(baseUrl()+pathname,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
  if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||`HTTP ${res.status}`);} return res.status===204?null:res.json();
}
function sourceDocs(){return vscode.workspace.textDocuments.filter(d=>['file','untitled','vscode-remote'].includes(d.uri.scheme)).slice(0,100);}
function fileName(doc){const folder=vscode.workspace.getWorkspaceFolder(doc.uri);return folder?path.relative(folder.uri.fsPath,doc.uri.fsPath):path.basename(doc.fileName);}
function snapshot(){return Object.fromEntries(sourceDocs().map(d=>[fileName(d),d.getText()]));}
async function publish(s){const files=snapshot();const mark=JSON.stringify(files);if(mark===s.mark)return;s.room=await request(`/rooms/${s.id}`,{method:'PUT',headers:{Authorization:`Bearer ${s.write}`},body:JSON.stringify({files})});s.mark=mark;}
function uriFor(s,name){return vscode.Uri.from({scheme:'efir',path:'/'+name,query:s.id});}
async function openFile(name){if(!session?.room)return;const uri=uriFor(session,name);const doc=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(doc,{preview:false});}
async function chooseFile(){if(!session?.room)return vscode.window.showInformationMessage('Сначала подключитесь к эфиру.');const name=await vscode.window.showQuickPick(Object.keys(session.room.files),{placeHolder:'Файл эфира'});if(name)await openFile(name);}
async function poll(s){while(session===s){try{if(s.write)await publish(s);else{const next=await request(`/rooms/${s.id}`);if(!s.room||next.version!==s.room.version){s.room=next;for(const name of Object.keys(next.files))changed.fire(uriFor(s,name));}}await wait(600);}catch(e){if(session===s){status.text='$(debug-disconnect) Эфир: '+e.message;await wait(2000);}}}}
async function start(){if(session)throw new Error('Сначала завершите текущий эфир.');const name=await vscode.window.showInputBox({prompt:'Название занятия'});if(!name)return;const data=await request('/rooms',{method:'POST',body:JSON.stringify({name,files:snapshot()})});session={id:data.id,write:data.write,room:data.room,mark:JSON.stringify(data.room.files)};status.text=`$(broadcast) Эфир: ${data.id}`;status.show();await vscode.env.clipboard.writeText(data.id);vscode.window.showInformationMessage(`Комната ${data.id}. Код скопирован.`);void poll(session);}
async function join(){if(session)throw new Error('Сначала завершите текущий эфир.');const id=await vscode.window.showInputBox({prompt:'Шестизначный код комнаты',validateInput:v=>/^\d{6}$/.test(v)?undefined:'Нужно 6 цифр'});if(!id)return;const room=await request(`/rooms/${id}`);session={id,room};status.text=`$(eye) Эфир: ${id}`;status.show();await openFile(Object.keys(room.files)[0]);void poll(session);}
async function stop(){const s=session;session=undefined;status.hide();if(s?.write)await request(`/rooms/${s.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${s.write}`}}).catch(()=>{});}
function activate(context){changed=new vscode.EventEmitter();status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);status.command='efir.openFile';context.subscriptions.push(status,changed,vscode.workspace.registerTextDocumentContentProvider('efir',{onDidChange:changed.event,provideTextDocumentContent:uri=>session?.room?.files[uri.path.slice(1)]||''}));for(const [id,fn] of Object.entries({start,join,stop,openFile:chooseFile,copy:()=>session&&vscode.env.clipboard.writeText(session.id)}))context.subscriptions.push(vscode.commands.registerCommand('efir.'+id,()=>fn().catch(e=>vscode.window.showErrorMessage('Эфир: '+e.message))));}
module.exports={activate,deactivate:()=>stop()};
