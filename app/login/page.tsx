"use client";
import {useState} from "react";

export default function Login(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[showPassword,setShowPassword]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);

 async function submit(e:React.FormEvent){
  e.preventDefault();
  if(busy)return;
  setBusy(true);
  setError("");
  try{
   const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim(),password}),cache:"no-store"});
   const j=await r.json();
   if(!r.ok){setError(j.error||"Login failed");return;}
   window.location.replace(j.redirect);
  }catch{
   setError("Unable to connect. Please try again.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="login">
  <div className="card loginbox">
   <div className="brand" style={{color:"#173d22"}}>VEG MANTRA<br/><small style={{color:"#6c746b"}}>MOHAN NAGAR • STAFF PORTAL</small></div>
   <h1>Sign in</h1>
   <p className="muted">Owner and Manager accounts</p>
   {error&&<div className="error">{error}</div>}
   <form onSubmit={submit}>
    <label>Email</label>
    <input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/>
    <label>Password</label>
    <div style={{position:"relative",display:"flex",alignItems:"center"}}>
     <input type={showPassword?"text":"password"} required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} style={{width:"100%",paddingRight:90}}/>
     <button type="button" onClick={()=>setShowPassword(v=>!v)} disabled={busy} aria-label={showPassword?"Hide password":"Show password"} style={{position:"absolute",right:8,background:"transparent",border:0,cursor:"pointer",fontWeight:600,color:"#173d22",padding:"8px 10px"}}>{showPassword?"Hide":"Show"}</button>
    </div>
    <button className="btn" style={{width:"100%"}} disabled={busy}>{busy?"Signing in…":"Sign in"}</button>
   </form>
  </div>
 </main>
}