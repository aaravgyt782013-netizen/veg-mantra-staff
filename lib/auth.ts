import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./prisma";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "CHANGE_ME_BEFORE_PRODUCTION");

export async function setSession(userId:string) {
  const token = await new SignJWT({sub:userId}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(secret);
  (await cookies()).set("vm_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*12});
}
export async function clearSession(){ (await cookies()).delete("vm_session"); }
export async function getUser(){
  const token=(await cookies()).get("vm_session")?.value;
  if(!token) return null;
  try {
    const {payload}=await jwtVerify(token,secret);
    if(!payload.sub) return null;
    return db.user.findUnique({where:{id:payload.sub}});
  } catch { return null; }
}
export async function requireRole(roles:string[]){
  const user=await getUser();
  if(!user || !user.active || !roles.includes(user.role)) throw new Error("UNAUTHORIZED");
  return user;
}