import http from 'node:http';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';

const HOST = '127.0.0.1';
const PORT = Number(process.env.NEX_AGENT_PORT || 4177);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const token = process.env.NEX_AGENT_TOKEN || randomBytes(32).toString('base64url');
const requestedRoot = path.resolve(process.argv[2] || process.cwd());
await fs.mkdir(requestedRoot, {recursive:true});
const ROOT = await fs.realpath(requestedRoot);

function insideRoot(candidate) {
  const relative = path.relative(ROOT, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function resolveRelative(input = '.') {
  if (typeof input !== 'string' || input.length > 500) throw new Error('Caminho inválido.');
  const normalized = input.replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error('Use caminhos relativos dentro da pasta de trabalho.');
  }
  const candidate = path.resolve(ROOT, normalized || '.');
  if (!insideRoot(candidate)) throw new Error('Caminho fora da pasta de trabalho.');
  return candidate;
}
async function checkedExisting(input) {
  const candidate = resolveRelative(input);
  const real = await fs.realpath(candidate);
  if (!insideRoot(real)) throw new Error('O caminho aponta para fora da pasta de trabalho.');
  const stat = await fs.stat(real);
  return {absolute:real,stat};
}
async function checkedParent(input) {
  const candidate = resolveRelative(input);
  const parent = await fs.realpath(path.dirname(candidate));
  if (!insideRoot(parent)) throw new Error('A pasta de destino aponta para fora do workspace.');
  return {absolute:path.join(parent,path.basename(candidate)),parent};
}
function safeToken(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a,b);
}
function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':body.length,'cache-control':'no-store'});
  res.end(body);
}
async function readBody(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Requisição muito grande.');
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function runProcess(command,args,cwd) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,shell:false,windowsHide:true});
    let stdout='',stderr='',finished=false;
    const timer=setTimeout(()=>{if(!finished){finished=true;child.kill();resolve({exitCode:null,timedOut:true,stdout:stdout.slice(-25000),stderr:stderr.slice(-25000)});}},60000);
    child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString()).slice(-25000);});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-25000);});
    child.on('error',error=>{if(finished)return;finished=true;clearTimeout(timer);reject(error);});
    child.on('close',code=>{if(finished)return;finished=true;clearTimeout(timer);resolve({exitCode:code,timedOut:false,stdout,stderr});});
  });
}
async function listFiles(input) {
  const {absolute,stat}=await checkedExisting(input.path || '.');
  if (!stat.isDirectory()) throw new Error('O caminho informado não é uma pasta.');
  const entries=await fs.readdir(absolute,{withFileTypes:true});
  const ignored=new Set(['.git','node_modules','.next','.vercel','dist','build']);
  const result=[];
  for(const entry of entries) {
    if(entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if(ignored.has(entry.name)) continue;
    const full=path.join(absolute,entry.name);
    try {
      const real=await fs.realpath(full);
      if(!insideRoot(real)) continue;
      const info=await fs.stat(real);
      result.push({name:entry.name,path:path.relative(ROOT,full).split(path.sep).join('/'),type:info.isDirectory()?'directory':'file',size:info.isFile()?info.size:undefined});
    } catch {}
    if(result.length>=200) break;
  }
  result.sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='directory'?-1:1);
  return {workspace:ROOT,items:result};
}
async function readFile(input) {
  const {absolute,stat}=await checkedExisting(input.path);
  if(!stat.isFile()) throw new Error('O caminho não é um arquivo.');
  if(stat.size>MAX_FILE_BYTES) throw new Error('Arquivo maior que 1 MB; leitura bloqueada nesta versão.');
  const content=await fs.readFile(absolute,'utf8');
  return {path:input.path,content,size:stat.size};
}
async function writeFile(input,createOnly=false) {
  const relative=input.path;
  if(typeof input.content!=='string'||Buffer.byteLength(input.content,'utf8')>MAX_FILE_BYTES) throw new Error('Conteúdo inválido ou maior que 1 MB.');
  if(!relative || relative==='.' || relative.endsWith('/')) throw new Error('Informe o caminho de um arquivo.');
  const {absolute}=await checkedParent(relative);
  if(createOnly) {
    const handle=await fs.open(absolute,'wx');
    try { await handle.writeFile(input.content,'utf8'); } finally { await handle.close(); }
  } else {
    try {
      const real=await fs.realpath(absolute);
      if(!insideRoot(real)) throw new Error('O arquivo aponta para fora do workspace.');
      if(!(await fs.stat(real)).isFile()) throw new Error('O destino não é um arquivo.');
    } catch(error) { if(error.code!=='ENOENT') throw error; }
    await fs.writeFile(absolute,input.content,'utf8');
  }
  return {path:relative,bytes:Buffer.byteLength(input.content,'utf8'),created:createOnly};
}
async function saveScaffold(input) {
  if(!Array.isArray(input.files)||!input.files.length||input.files.length>30) throw new Error('Projeto inválido: envie de 1 a 30 arquivos.');
  const prepared=[];
  for(const file of input.files) {
    if(!file||typeof file.path!=='string'||typeof file.content!=='string'||Buffer.byteLength(file.content,'utf8')>MAX_FILE_BYTES) throw new Error('Um dos arquivos do projeto é inválido.');
    const {absolute}=await checkedParent(file.path);
    try { await fs.lstat(absolute); throw new Error('Já existe um arquivo ou pasta em '+file.path+'. Nada foi sobrescrito.'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    prepared.push({absolute,path:file.path,content:file.content});
  }
  const created=[];
  try {
    for(const file of prepared) {
      const handle=await fs.open(file.absolute,'wx');
      try { await handle.writeFile(file.content,'utf8'); } finally { await handle.close(); }
      created.push(file.absolute);
    }
  } catch(error) {
    await Promise.all(created.map(file=>fs.rm(file,{force:true}).catch(()=>{})));
    throw error;
  }
  return {created:prepared.map(file=>file.path),count:prepared.length};
}
async function executeCommand(input) {
  if(typeof input.command!=='string'||input.command.length>180) throw new Error('Comando inválido.');
  const value=input.command.trim();
  if(value==='npm test') {
    const command=process.platform==='win32'?'cmd.exe':'npm';
    const args=process.platform==='win32'?['/d','/s','/c','npm test']:['test'];
    return runProcess(command,args,ROOT);
  }
  let match=value.match(/^npm run ([a-zA-Z0-9:_-]{1,60})$/);
  if(match) {
    const command=process.platform==='win32'?'cmd.exe':'npm';
    const args=process.platform==='win32'?['/d','/s','/c','npm run '+match[1]]:['run',match[1]];
    return runProcess(command,args,ROOT);
  }
  match=value.match(/^(node|python) ([^\s]+)$/);
  if(match) {
    const {absolute,stat}=await checkedExisting(match[2]);
    if(!stat.isFile()) throw new Error('O script informado não é um arquivo.');
    return runProcess(match[1], [absolute], ROOT);
  }
  throw new Error('Comando bloqueado. Permitidos: npm test, npm run <script>, node <arquivo.js> ou python <arquivo.py>.');
}
async function handle(req,res) {
  if(req.method==='OPTIONS') { res.writeHead(204);res.end();return; }
  if(!safeToken(req.headers.authorization?.replace(/^Bearer\s+/i,''))) return json(res,401,{error:'Token inválido. Conecte novamente o agente local.'});
  const origin=req.headers.origin;
  if(origin && !origin.startsWith('chrome-extension://')) return json(res,403,{error:'Origem não autorizada.'});
  const url=new URL(req.url,'http://127.0.0.1:'+PORT);
  try {
    if(req.method==='GET'&&url.pathname==='/api/status') return json(res,200,{ok:true,version:'0.1.0',workspace:ROOT,connected:true});
    const input=await readBody(req);
    if(req.method==='POST'&&url.pathname==='/api/files/list') return json(res,200,{ok:true,...await listFiles(input)});
    if(req.method==='POST'&&url.pathname==='/api/files/read') return json(res,200,{ok:true,...await readFile(input)});
    if(req.method==='POST'&&url.pathname==='/api/files/create') return json(res,201,{ok:true,...await writeFile(input,true)});
    if(req.method==='POST'&&url.pathname==='/api/files/write') return json(res,200,{ok:true,...await writeFile(input,false)});
    if(req.method==='POST'&&url.pathname==='/api/projects/scaffold') return json(res,201,{ok:true,...await saveScaffold(input)});
    if(req.method==='POST'&&url.pathname==='/api/commands/run') return json(res,200,{ok:true,...await executeCommand(input)});
    return json(res,404,{error:'Rota não encontrada.'});
  } catch(error) { return json(res,400,{error:error.message||'Falha na operação.'}); }
}
const server=http.createServer((req,res)=>{
  if((req.url==='/api/status'&&req.method==='GET')||req.method==='POST'||req.method==='OPTIONS') {
    handle(req,res).catch(error=>json(res,500,{error:error.message||'Falha interna.'}));
  } else json(res,404,{error:'Rota não encontrada.'});
});
server.listen(PORT,HOST,()=>{
  console.log('\nNEX LOCAL CODE AGENT 0.1.0');
  console.log('Workspace: '+ROOT);
  console.log('Endereço: http://'+HOST+':'+PORT);
  console.log('Token de conexão (copie no NEX): '+token);
  console.log('Acesso limitado ao workspace. Para encerrar, pressione Ctrl+C.\n');
});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
