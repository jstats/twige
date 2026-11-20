export const INTERVALS=[1,3,7,14,30,60];
export const day=(d=new Date())=>new Date(d).toISOString().slice(0,10);
export function add(item,date=day()){return {id:item.id,prompt:item.prompt,answer:item.answer,lang:item.lang||'en',tag:item.tag||'everyday',box:0,due:day(new Date(Date.parse(date+'T12:00:00Z')+86400000))}}
export function grade(item,rating,date=day()){const box=rating==='again'?0:rating==='easy'?Math.min(5,item.box+1):item.box;return {...item,box,due:day(new Date(Date.parse(date+'T12:00:00Z')+INTERVALS[box]*86400000))}}
export function due(items,date=day(),limit=20){return items.filter(i=>i.due<=date).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,limit)}
export function merge(items,item){return [...items.filter(i=>i.id!==item.id),item]}
