import type {NextFunction,Request,Response} from 'express'; import {ensureOwnerFromEnv,userFromToken,type UserRecord} from './persistence';
declare global{namespace Express{interface Request{fridayUser?:UserRecord}}}
export function requireWebSession(req:Request,res:Response,next:NextFunction){const h=req.header('authorization')||'',t=h.startsWith('Bearer ')?h.slice(7).trim():'';const u=t?userFromToken(t):null;if(!u){res.status(401).json({ok:false,error:'Authenticated Friday session required.'});return}req.fridayUser=u;next()}
export const bootstrapOwner=()=>{ensureOwnerFromEnv()};
