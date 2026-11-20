const DB='twige-v1';let db;
function open(){if(db)return Promise.resolve(db);return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{for(const name of ['state','recordings'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name)};req.onsuccess=()=>resolve(db=req.result);req.onerror=()=>reject(req.error)})}
export async function get(key,store='state'){const d=await open();return new Promise((resolve,reject)=>{const q=d.transaction(store).objectStore(store).get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
export async function put(key,value,store='state'){const d=await open();return new Promise((resolve,reject)=>{const q=d.transaction(store,'readwrite').objectStore(store).put(value,key);q.onsuccess=()=>resolve(value);q.onerror=()=>reject(q.error)})}
export const initial={language:'en',explain:'en',completed:{en:[],sw:[]},reviews:[],phrasebook:[],writing:[],answers:[],answersUpdated:0,reviewLog:null,tasks:{},lastDay:null,days:0};
export async function load(){const s={...initial,...(await get('progress')||{})};s.completed={en:[],sw:[],...s.completed};return s}
export async function save(state){return put('progress',state)}
