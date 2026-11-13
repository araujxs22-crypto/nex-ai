export class NexMemory {
  constructor({key='nex-core-memory', storage=null}={}) { this.key=key; this.storage=storage ?? (typeof localStorage!=='undefined'?localStorage:null); this.items=this.load(); }
  load(){ try { return JSON.parse(this.storage?.getItem(this.key)||'[]'); } catch { return []; } }
  persist(){ if(this.storage) this.storage.setItem(this.key, JSON.stringify(this.items)); }
  remember(text, metadata={}) { const item={id:Date.now()+Math.random(),text:String(text),metadata,createdAt:new Date().toISOString()}; this.items.push(item); this.persist(); return item; }
  search(query, limit=5){ const terms=String(query).toLowerCase().split(/\s+/).filter(Boolean); return this.items.map(item=>({item,score:terms.reduce((s,t)=>s+(item.text.toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.item); }
  all(){ return this.items.slice(); }
  clear(){ this.items=[]; this.persist(); }
  export(){ return JSON.stringify(this.items,null,2); }
  import(json){ const parsed=JSON.parse(json); if(!Array.isArray(parsed)) throw new Error('Memória inválida'); this.items=parsed; this.persist(); }
}
