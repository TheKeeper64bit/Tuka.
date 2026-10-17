const memory=new Map();
export const walkKey=(from,to)=>`${from.lon.toFixed(5)},${from.lat.toFixed(5)};${to.lon.toFixed(5)},${to.lat.toFixed(5)}`;
export function knownWalk(from,to){return memory.get(walkKey(from,to))?.distance;}
export async function walkingPath(from,to,signal){
  const key=walkKey(from,to);if(memory.has(key))return memory.get(key);
  const [a,b]=key.split(';');
  const response=await fetch('/api/walk?'+new URLSearchParams({from:a,to:b}),{signal});
  if(!response.ok)throw Error('Walking route unavailable');
  const value=await response.json();if(!Array.isArray(value.coordinates)||!Number.isFinite(value.distance))throw Error('Invalid walking route');
  if(memory.size>=100)memory.delete(memory.keys().next().value);
  memory.set(key,value);return value;
}
export function walkInstruction(step){
  const modifier={'left':'Turn left','right':'Turn right','slight left':'Bear left','slight right':'Bear right','sharp left':'Turn sharply left','sharp right':'Turn sharply right','straight':'Continue straight','uturn':'Turn back'}[step.modifier];
  const action=step.type==='depart'?'Start walking':step.type==='arrive'?'Arrive':step.type.includes('roundabout')?'Follow the roundabout':modifier||'Continue';
  return action+(step.name?' · '+step.name:'')+(step.distance?' · '+step.distance+' m':'');
}
