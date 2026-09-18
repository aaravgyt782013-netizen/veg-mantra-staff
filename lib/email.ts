export async function notifyManager(subject:string, text:string){
  const key=process.env.RESEND_API_KEY, to=process.env.MANAGER_EMAIL;
  if(!key || !to) return;
  await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({
    from:process.env.EMAIL_FROM || "Veg Mantra Attendance <onboarding@resend.dev>",to,subject,text
  })});
}