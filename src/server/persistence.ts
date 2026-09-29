import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
export type UserRecord={id:string;email:string;passwordHash:string;role:'owner'|'admin'|'user';createdAt:string};
export type TaskRecord={id:string;userId:string;command:string;status:string;createdAt:string;updatedAt:string;payload?:unknown;result?:unknown};
export type TaskEventRecord={id:string;taskId:string;at:string;phase:string;message:string;details?:unknown};
type Store={users:UserRecord[];sessions:{tokenHash:string;userId:string;expiresAt:string}[];tasks:TaskRecord[];events:TaskEventRecord[]};
const file=path.join(process.cwd(),'data','friday-store.json');
const read=():Store=>{try{if(!fs.existsSync(file))return{users:[],sessions:[],tasks:[],events:[]};const x=JSON.parse(fs.readFileSync(file,'utf8'));return{users:x.users||[],sessions:x.sessions||[],tasks:x.tasks||[],events:x.events||[]}}catch{return{users:[],sessions:[],tasks:[],events:[]}}};
const write=(s:Store)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(s,null,2));fs.renameSync(t,file)};
const hash=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
export const hashPassword=(p:string)=>{const s=crypto.randomBytes(16).toString('hex');return 'scrypt:'+s+':'+crypto.scryptSync(p,s,64).toString('hex')};
export const verifyPassword=(p:string,e:string)=>{const[a,s,w]=e.split(':');if(a!=='scrypt'||!s||!w)return false;const v=crypto.scryptSync(p,s,64).toString('hex');return crypto.timingSafeEqual(Buffer.from(v,'hex'),Buffer.from(w,'hex'))};
export function ensureOwnerFromEnv(){const email=process.env.FRIDAY_OWNER_EMAIL?.trim().toLowerCase(),password=process.env.FRIDAY_OWNER_PASSWORD;if(!email||!password)return null;const s=read();let u=s.users.find(x=>x.email===email);if(!u){u={id:crypto.randomUUID(),email,passwordHash:hashPassword(password),role:'owner',createdAt:new Date().toISOString()};s.users.push(u);write(s)}return u}
export function authenticate(email:string,password:string){const s=read(),u=s.users.find(x=>x.email===email.trim().toLowerCase());if(!u||!verifyPassword(password,u.passwordHash))return null;const token=crypto.randomBytes(32).toString('base64url');s.sessions.push({tokenHash:hash(token),userId:u.id,expiresAt:new Date(Date.now()+30*86400000).toISOString()});write(s);return{user:u,token}}
export function userFromToken(token:string){const s=read(),x=s.sessions.find(v=>v.tokenHash===hash(token)&&new Date(v.expiresAt).getTime()>Date.now());return x?s.users.find(u=>u.id===x.userId)||null:null}
export function createTask(userId:string,command:string,payload?:unknown){const now=new Date().toISOString(),t:TaskRecord={id:crypto.randomUUID(),userId,command,status:'QUEUED',createdAt:now,updatedAt:now,payload};const s=read();s.tasks.push(t);write(s);return t}
export function updateTask(id:string,patch:Partial<TaskRecord>){const s=read(),t=s.tasks.find(x=>x.id===id);if(!t)return null;Object.assign(t,patch,{updatedAt:new Date().toISOString()});write(s);return t}
export const getTask=(id:string,userId:string)=>read().tasks.find(t=>t.id===id&&t.userId===userId)||null;
export const listTasks=(userId:string)=>read().tasks.filter(t=>t.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50);
export function addTaskEvent(taskId:string,phase:string,message:string,details?:unknown){const e={id:crypto.randomUUID(),taskId,at:new Date().toISOString(),phase,message,details};const s=read();s.events.push(e);write(s);return e}
export const listTaskEvents=(taskId:string)=>read().events.filter(e=>e.taskId===taskId).sort((a,b)=>a.at.localeCompare(b.at));
