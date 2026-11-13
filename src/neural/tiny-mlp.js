export class TinyMLP {
  constructor({inputSize, hiddenSize=16, outputSize, learningRate=0.08, seed=42}={}) {
    if (!inputSize || !outputSize) throw new Error('inputSize e outputSize são obrigatórios');
    this.inputSize=inputSize; this.hiddenSize=hiddenSize; this.outputSize=outputSize; this.learningRate=learningRate; this.seed=seed; this.step=0;
    const rand=this.rng(seed);
    this.W1=Array.from({length:hiddenSize},()=>Array.from({length:inputSize},()=> (rand()*2-1)*Math.sqrt(2/inputSize)));
    this.b1=Array(hiddenSize).fill(0);
    this.W2=Array.from({length:outputSize},()=>Array.from({length:hiddenSize},()=> (rand()*2-1)*Math.sqrt(2/hiddenSize)));
    this.b2=Array(outputSize).fill(0);
  }
  rng(seed){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
  shuffle(items,seed){const a=items.slice(),rand=this.rng(seed);for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  static softmax(xs){const m=Math.max(...xs),es=xs.map(x=>Math.exp(x-m)),sum=es.reduce((a,b)=>a+b,0);return es.map(x=>x/sum);}
  forward(x){const h=this.W1.map((row,i)=>Math.tanh(row.reduce((s,w,j)=>s+w*x[j],this.b1[i])));const logits=this.W2.map((row,i)=>row.reduce((s,w,j)=>s+w*h[j],this.b2[i]));return{h,probs:TinyMLP.softmax(logits)};}
  predict(x){const probs=this.forward(x).probs;let index=0;probs.forEach((p,i)=>{if(p>probs[index])index=i;});const sorted=probs.slice().sort((a,b)=>b-a);return{index,confidence:probs[index],margin:sorted[0]-(sorted[1]??0),probabilities:probs};}
  trainBatch(batch){if(!batch.length)return 0;const gW1=Array.from({length:this.hiddenSize},()=>Array(this.inputSize).fill(0)),gb1=Array(this.hiddenSize).fill(0),gW2=Array.from({length:this.outputSize},()=>Array(this.hiddenSize).fill(0)),gb2=Array(this.outputSize).fill(0);let loss=0;
    for(const{x,y}of batch){const{h,probs}=this.forward(x);loss-=Math.log(Math.max(probs[y],1e-12));const dz2=probs.map((p,i)=>p-(i===y?1:0));for(let i=0;i<this.outputSize;i++){for(let j=0;j<this.hiddenSize;j++)gW2[i][j]+=dz2[i]*h[j];gb2[i]+=dz2[i];}const dh=Array(this.hiddenSize).fill(0);for(let j=0;j<this.hiddenSize;j++)for(let i=0;i<this.outputSize;i++)dh[j]+=this.W2[i][j]*dz2[i];for(let j=0;j<this.hiddenSize;j++){const dz1=dh[j]*(1-h[j]*h[j]);for(let k=0;k<this.inputSize;k++)gW1[j][k]+=dz1*x[k];gb1[j]+=dz1;}}
    const scale=this.learningRate/batch.length;for(let i=0;i<this.outputSize;i++){for(let j=0;j<this.hiddenSize;j++)this.W2[i][j]-=scale*gW2[i][j];this.b2[i]-=scale*gb2[i];}for(let j=0;j<this.hiddenSize;j++){for(let k=0;k<this.inputSize;k++)this.W1[j][k]-=scale*gW1[j][k];this.b1[j]-=scale*gb1[j];}this.step++;return loss/batch.length;}
  evaluate(dataset){let loss=0,correct=0;for(const item of dataset){const p=this.predict(item.x);loss-=Math.log(Math.max(p.probabilities[item.y],1e-12));if(p.index===item.y)correct++;}return{loss:dataset.length?loss/dataset.length:0,accuracy:dataset.length?correct/dataset.length:0};}
  train(dataset,{epochs=100,validation=[],batchSize=dataset.length,shuffle=true,patience=20,onEpoch=()=>{}}={}){const history=[];let best=Infinity,bestWeights=null,stale=0;for(let epoch=1;epoch<=epochs;epoch++){const ordered=shuffle?this.shuffle(dataset,this.seed+epoch):dataset;for(let i=0;i<ordered.length;i+=batchSize)this.trainBatch(ordered.slice(i,i+batchSize));const train=this.evaluate(dataset),val=validation.length?this.evaluate(validation):null,score=val?.loss??train.loss,row={epoch,loss:train.loss,...train,validation:val};history.push(row);onEpoch(row);if(score<best){best=score;bestWeights=this.toJSON();stale=0;}else if(++stale>=patience)break;}if(bestWeights)Object.assign(this,TinyMLP.fromJSON(bestWeights));return history;}
  toJSON(){return{inputSize:this.inputSize,hiddenSize:this.hiddenSize,outputSize:this.outputSize,learningRate:this.learningRate,seed:this.seed,step:this.step,W1:this.W1,b1:this.b1,W2:this.W2,b2:this.b2};}
  static fromJSON(data){const m=new TinyMLP(data);Object.assign(m,data);return m;}
}
export class TextVectorizer {
  constructor(labels,vocab){this.labels=labels;this.vocab=vocab;}
  tokenize(text){return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9_]+/g)||[];}
  encode(text){const tokens=this.tokenize(text),x=Array(this.vocab.length).fill(0);for(const t of tokens){const i=this.vocab.indexOf(t);if(i>=0)x[i]++;}const n=Math.max(tokens.length,1);return x.map(v=>v/n);}
  recognizedRatio(text){const tokens=this.tokenize(text);return tokens.length?tokens.filter(t=>this.vocab.includes(t)).length/tokens.length:0;}
  static fromExamples(examples){const labels=[...new Set(examples.map(e=>e.label))],vocab=[...new Set(examples.flatMap(e=>e.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9_]+/g)||[]))];return{vectorizer:new TextVectorizer(labels,vocab),labels};}
}
