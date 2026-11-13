export class NexVideoEngine {
  plan(prompt='') {
    const text=prompt.toLowerCase();
    const objects=[];
    const known=[['nave','spaceship'],['robo','robot'],['robô','robot'],['personagem','character'],['cidade','city'],['floresta','forest'],['predio','building'],['prédio','building'],['particulas','particles']];
    for(const [term,type] of known) if(text.includes(term)) objects.push({id:`${type}_${objects.length+1}`,type,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},animation:text.includes('andando')||text.includes('movimento')?{type:'walk-cycle',duration:4}:null});
    if(!objects.length) objects.push({id:'subject_1',type:'generic-subject',transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
    const duration=(text.match(/(\d+)\s*s/)||[,8])[1]*1;
    return {schema:'nex.video-plan.v1',prompt,scene:{environment:text.includes('noite')?'night':'neutral',objects},camera:{shot:text.includes('close')?'close-up':'wide',motion:text.includes('pan')?'pan':'static',focalLength:50},lighting:{key:text.includes('dram')?'dramatic':'soft',colorTemperature:text.includes('azul')?'cool':'neutral'},timeline:[{t:0,action:'establish-scene'},{t:duration/2,action:'animate-subjects'},{t:duration,action:'end-shot'}],durationSeconds:duration,capabilities:{planning:true,rendering:false,videoGeneration:false}};
  }
}
