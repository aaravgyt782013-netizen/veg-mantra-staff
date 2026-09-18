// Browsers cannot expose the Wi-Fi SSID to a normal website.
// Production enforcement therefore uses the cafe network's public IP allowlist.
// Put the cafe public IPv4 addresses in ALLOWED_CAFE_IPS, comma-separated.
export function getClientIp(req:Request){
  const forwarded=req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
}
export function cafeNetworkAllowed(req:Request){
  const allowed=(process.env.ALLOWED_CAFE_IPS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!allowed.length) return false;
  return allowed.includes(getClientIp(req));
}