import { getPrisma } from '@/lib/db/prisma';
import { meetingConfig,privateHeaders } from '@/lib/meeting-sso/config';
import { accessFor,openReference,secretEqual } from '@/lib/meeting-sso/protocol.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  const inactive=()=>Response.json({active:false},{status:200,headers:privateHeaders});
  try{
    const c=meetingConfig();
    if(!secretEqual(request.headers.get('authorization')??'','Bearer '+c.secret))return new Response(null,{status:401,headers:privateHeaders});
    const text=await request.text();if(text.length>6000)return new Response(null,{status:413,headers:privateHeaders});
    const body=JSON.parse(text);if(body.client_id!==c.clientId)return inactive();
    const ref=openReference(body.session_ref,c.secret);
    if(ref.client!==c.clientId||ref.until<=Date.now()/1000||typeof ref.sid!=='string')return inactive();
    const prisma=getPrisma();
    const session=await prisma.session.findUnique({where:{id:ref.sid},include:{user:{include:{profile:true}}}});
    if(!session||session.revokedAt||session.expiresAt.getTime()<=Date.now()||session.user.status!=='ACTIVE')return inactive();
    const managed=new Set<string>();
    if(session.user.role==='LEAD'){
      const teams=await prisma.team.findMany({select:{id:true,parentTeamId:true,leadUserId:true,status:true}});
      teams.filter(t=>t.leadUserId===session.userId&&t.status==='ACTIVE').forEach(t=>managed.add(t.id));
      for(let changed=true;changed;){
        changed=false;
        for(const t of teams){
          if(t.status==='ACTIVE'&&t.parentTeamId&&managed.has(t.parentTeamId)&&!managed.has(t.id)){
            managed.add(t.id);changed=true;
          }
        }
      }
    }
    const identity=accessFor({...session.user,teamId:session.user.teamId??session.user.profile?.teamId??null,managedTeamIds:[...managed]},c.teamMap,c.pilotIds,c.rollout);
    if(!identity)return inactive();
    return Response.json({active:true,...identity,expires:Math.min(ref.until,Math.floor(session.expiresAt.getTime()/1000))},{headers:privateHeaders});
  }catch{return inactive();}
}
