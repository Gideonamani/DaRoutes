export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Returns meters between two [lat, lon] pairs
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371e3;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const sinDphi = Math.sin(dphi / 2);
  const sinDlambda = Math.sin(dlambda / 2);
  const h = sinDphi * sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlambda * sinDlambda;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

