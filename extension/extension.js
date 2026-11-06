const vscode = require('vscode');
const path = require('node:path');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let session;
let status;
let changed;

function endpoint(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (local && url.protocol === 'http:'))) {
    throw new Error('Используйте HTTPS или локальный HTTP без параметров.');
  }
  return url.href.replace(/\/$/, '');
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!res.ok && res.status !== 304) {
    throw new Error(res.status === 404 ? 'Трансляция завершена или ссылка недействительна.' : 'Сервер вернул HTTP ' + res.status);
  }
  return res;
}

async function stop(s = session) {
  if (!s || session !== s) return;
  session = undefined;
  status.hide();
  if (s.write) await request(s.url, { method: 'DELETE', headers: s.headers });
}

async function publish(s, doc) {
  if (doc.isClosed) {
    await stop(s);
    return;
  }
  const version = doc.version;
  const dirty = version !== s.version;
  if (!dirty && Date.now() - s.last < 15000) return;
  const body = dirty ? JSON.stringify({ name: path.basename(doc.fileName), language: doc.languageId, text: doc.getText() }) : undefined;
  if (body && Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('Размер сообщения превышает 2 МиБ.');
  await request(s.url, { method: 'PUT', headers: s.headers, body });
  s.version = version;
  s.last = Date.now();
}

async function receive(s) {
  const res = await request(s.url, { headers: s.etag ? { 'If-None-Match': s.etag } : {} });
  if (res.status === 304 || session !== s) return;
  const data = await res.json();
  s.etag = res.headers.get('etag');
  if (!data || session !== s) return;
  s.text = data.text;
  if (!s.uri) {
    s.uri = vscode.Uri.from({ scheme: 'codestream', path: '/' + path.basename(data.name), query: s.url.split('/').pop() });
    let doc = await vscode.workspace.openTextDocument(s.uri);
    if (vscode.languages.getLanguages && (await vscode.languages.getLanguages()).includes(data.language)) {
      doc = await vscode.languages.setTextDocumentLanguage(doc, data.language);
    }
    if (session === s) await vscode.window.showTextDocument(doc, { preview: false });
  } else {
    changed.fire(s.uri);
  }
}

async function run(s, action) {
  try {
    while (session === s) {
      await action();
      await pause(500);
    }
  } catch (error) {
    if (session !== s) return;
    await stop(s).catch(() => {});
    vscode.window.showErrorMessage('Code Stream: ' + error.message);
  }
}

async function start(s) {
  const doc = vscode.window.activeTextEditor?.document;
  if (!doc || !['file', 'untitled', 'vscode-remote'].includes(doc.uri.scheme)) throw new Error('Откройте файл для трансляции.');
  const address = await vscode.window.showInputBox({ prompt: 'Адрес сервера Code Stream', value: 'http://127.0.0.1:7341' });
  if (!address || session !== s) return;
  const base = endpoint(address);
  const key = await vscode.window.showInputBox({ prompt: 'Ключ ведущего', password: true });
  if (!key || session !== s) return;
  const room = await (await request(base + '/rooms', { method: 'POST', headers: { Authorization: 'Bearer ' + key } })).json();
  s.url = base + '/rooms/' + room.id;
  s.write = room.write;
  s.headers = { Authorization: 'Bearer ' + s.write };
  if (session !== s) {
    await request(s.url, { method: 'DELETE', headers: s.headers });
    return;
  }
  await publish(s, doc);
  if (session !== s) return;
  status.text = '$(broadcast) Эфир: ' + path.basename(doc.fileName);
  status.show();
  await vscode.env.clipboard.writeText(s.url);
  vscode.window.showInformationMessage('Трансляция началась. Ссылка для зрителей скопирована.');
  void run(s, () => publish(s, doc));
}

async function join(s) {
  const invite = await vscode.window.showInputBox({ prompt: 'Вставьте ссылку ведущего' });
  if (!invite || session !== s) return;
  s.url = endpoint(invite);
  if (!/\/rooms\/[a-f0-9]{48}$/.test(s.url)) throw new Error('Проверьте ссылку на комнату.');
  await receive(s);
  if (session !== s) return;
  status.text = '$(eye) Просмотр эфира';
  status.show();
  void run(s, () => receive(s));
}

async function begin(action) {
  if (session) return vscode.window.showInformationMessage('Сначала завершите текущий сеанс через Code Stream: Stop.');
  const s = {};
  session = s;
  try {
    await action(s);
    if (!s.url && session === s) await stop(s);
  } catch (error) {
    await stop(s).catch(() => {});
    throw error;
  }
}

function activate(context) {
  changed = new vscode.EventEmitter();
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.command = 'codeStream.stop';
  status.tooltip = 'Завершить сеанс';
  context.subscriptions.push(status, changed, vscode.workspace.registerTextDocumentContentProvider('codestream', {
    onDidChange: changed.event,
    provideTextDocumentContent: uri => session?.uri?.toString() === uri.toString() ? session.text : ''
  }));
  const commands = {
    start: () => begin(start), join: () => begin(join), stop: () => stop(),
    copy: () => session?.write ? vscode.env.clipboard.writeText(session.url) : vscode.window.showInformationMessage('Сначала запустите эфир.')
  };
  for (const [name, action] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand('codeStream.' + name, async () => {
      try { await action(); } catch (error) { vscode.window.showErrorMessage('Code Stream: ' + error.message); }
    }));
  }
}
module.exports = { activate, deactivate: () => stop().catch(() => {}) };
