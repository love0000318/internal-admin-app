import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getCurrentUser,hashSessionToken,SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { getPrisma } from '@/lib/db/prisma';
import { meetingConfig,privateHeaders } from '@/lib/meeting-sso/config';
import { accessFor,makeTicket,sealReference } from '@/lib/meeting-sso/protocol.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const c=meetingConfig(),p=new URL(request.url).searchParams;
    const state=p.get('state')??'',nonce=p.get('nonce')??'';
    if(p.get('client_id')!==c.clientId||p.get('redirect_uri')!==c.meeting+'/'||!/^[-_A-Za-z0-9]{43}$/.test(state)||!/^[-_A-Za-z0-9]{43}$/.test(nonce))return new Response('잘못된 로그인 요청입니다.',{status:400,headers:privateHeaders});
    const user=await getCurrentUser();
    if(!user){
      const safe=(s:string)=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Internal OPS 로그인</title><h1>Internal OPS 로그인</h1><p>기존 계정으로 로그인한 뒤 회의 앱으로 돌아가 OPS 로그인 버튼을 다시 누르세요.</p><p><a href="${safe(c.issuer)}/login">기존 OPS 로그인 열기</a></p><p><a href="${safe(c.meeting)}/">회의 앱으로 돌아가기</a></p></html>`,{status:401,headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    const identity=accessFor(user,c.teamMap,c.pilotIds,c.rollout);
    if(!identity)return new Response('접근 권한이 없습니다.',{status:403,headers:privateHeaders});
    const raw=(await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if(!raw)return new Response('다시 로그인하세요.',{status:401,headers:privateHeaders});
    const session=await getPrisma().session.findUnique({where:{tokenHash:hashSessionToken(raw)}});
    if(!session||session.revokedAt||session.expiresAt.getTime()<=Date.now()||session.userId!==user.id)return new Response('다시 로그인하세요.',{status:401,headers:privateHeaders});
    const now=Math.floor(Date.now()/1000),until=Math.min(Math.floor(session.expiresAt.getTime()/1000),now+8*3600);
    const reference=sealReference({sid:session.id,client:c.clientId,until},c.secret);
    const ticket=makeTicket({iss:c.issuer,aud:c.clientId,sub:user.id,iat:now,exp:now+60,jti:randomBytes(24).toString('base64url'),nonce,session_ref:reference},c.privateKey,c.keyId);
    return new Response(null,{status:303,headers:{...privateHeaders,Location:c.meeting+'/#ops_ticket='+encodeURIComponent(ticket)+'&state='+encodeURIComponent(state)}});
  }catch{return new Response('OPS 회의 연동이 비활성화되었거나 설정을 확인해야 합니다.',{status:503,headers:privateHeaders});}
}
