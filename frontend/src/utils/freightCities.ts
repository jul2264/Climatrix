export interface FreightCity {
  label: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  aliases?: string[];
  isFreightHub: boolean;
}

export const TOP_FREIGHT_CITIES: FreightCity[] = [
  // Midwest Freight Corridors
  { label: 'Chicago, IL', name: 'Chicago', state: 'IL', lat: 41.8781, lon: -87.6298, aliases: ['chi', 'windy city'], isFreightHub: true },
  { label: 'Indianapolis, IN', name: 'Indianapolis', state: 'IN', lat: 39.7684, lon: -86.1581, aliases: ['indy', 'crossroads'], isFreightHub: true },
  { label: 'Columbus, OH', name: 'Columbus', state: 'OH', lat: 39.9612, lon: -82.9988, aliases: ['cbus'], isFreightHub: true },
  { label: 'St. Louis, MO', name: 'St. Louis', state: 'MO', lat: 38.627, lon: -90.1994, aliases: ['stl', 'saint louis'], isFreightHub: true },
  { label: 'Cincinnati, OH', name: 'Cincinnati', state: 'OH', lat: 39.1031, lon: -84.512, aliases: ['cincy'], isFreightHub: true },
  { label: 'Cleveland, OH', name: 'Cleveland', state: 'OH', lat: 41.4993, lon: -81.6944, aliases: ['cle'], isFreightHub: true },
  { label: 'Detroit, MI', name: 'Detroit', state: 'MI', lat: 42.3314, lon: -83.0458, aliases: ['motown', 'det'], isFreightHub: true },
  { label: 'Milwaukee, WI', name: 'Milwaukee', state: 'WI', lat: 43.0389, lon: -87.9065, aliases: ['mke'], isFreightHub: true },
  { label: 'Minneapolis, MN', name: 'Minneapolis', state: 'MN', lat: 44.9778, lon: -93.265, aliases: ['twin cities', 'msp'], isFreightHub: true },
  { label: 'Kansas City, MO', name: 'Kansas City', state: 'MO', lat: 39.0997, lon: -94.5786, aliases: ['kc', 'kcm'], isFreightHub: true },
  { label: 'Omaha, NE', name: 'Omaha', state: 'NE', lat: 41.2565, lon: -95.9345, aliases: ['oma'], isFreightHub: true },
  { label: 'Des Moines, IA', name: 'Des Moines', state: 'IA', lat: 41.5868, lon: -93.625, aliases: ['dsm'], isFreightHub: true },
  { label: 'Louisville, KY', name: 'Louisville', state: 'KY', lat: 38.2527, lon: -85.7585, aliases: ['lou'], isFreightHub: true },

  // South & Southeast Freight Hubs
  { label: 'Atlanta, GA', name: 'Atlanta', state: 'GA', lat: 33.749, lon: -84.388, aliases: ['atl'], isFreightHub: true },
  { label: 'Memphis, TN', name: 'Memphis', state: 'TN', lat: 35.1495, lon: -90.049, aliases: ['mem', 'fedex hub'], isFreightHub: true },
  { label: 'Nashville, TN', name: 'Nashville', state: 'TN', lat: 36.1627, lon: -86.7816, aliases: ['bna', 'music city'], isFreightHub: true },
  { label: 'Dallas, TX', name: 'Dallas', state: 'TX', lat: 32.7767, lon: -96.797, aliases: ['dfw', 'dal'], isFreightHub: true },
  { label: 'Fort Worth, TX', name: 'Fort Worth', state: 'TX', lat: 32.7555, lon: -97.3308, aliases: ['ft worth'], isFreightHub: true },
  { label: 'Houston, TX', name: 'Houston', state: 'TX', lat: 29.7604, lon: -95.3698, aliases: ['hou'], isFreightHub: true },
  { label: 'San Antonio, TX', name: 'San Antonio', state: 'TX', lat: 29.4241, lon: -98.4936, aliases: ['sat'], isFreightHub: true },
  { label: 'Austin, TX', name: 'Austin', state: 'TX', lat: 30.2672, lon: -97.7431, aliases: ['atx'], isFreightHub: true },
  { label: 'Charlotte, NC', name: 'Charlotte', state: 'NC', lat: 35.2271, lon: -80.8431, aliases: ['clt'], isFreightHub: true },
  { label: 'Jacksonville, FL', name: 'Jacksonville', state: 'FL', lat: 30.3322, lon: -81.6557, aliases: ['jax'], isFreightHub: true },
  { label: 'Tampa, FL', name: 'Tampa', state: 'FL', lat: 27.9506, lon: -82.4572, aliases: ['tpa'], isFreightHub: true },
  { label: 'Miami, FL', name: 'Miami', state: 'FL', lat: 25.7617, lon: -80.1918, aliases: ['mia'], isFreightHub: true },
  { label: 'Orlando, FL', name: 'Orlando', state: 'FL', lat: 28.5383, lon: -81.3792, aliases: ['mco'], isFreightHub: true },
  { label: 'Birmingham, AL', name: 'Birmingham', state: 'AL', lat: 33.5186, lon: -86.8104, aliases: ['bhm'], isFreightHub: true },
  { label: 'New Orleans, LA', name: 'New Orleans', state: 'LA', lat: 29.9511, lon: -90.0715, aliases: ['nola'], isFreightHub: true },

  // Northeast & Mid-Atlantic
  { label: 'New York, NY', name: 'New York', state: 'NY', lat: 40.7128, lon: -74.006, aliases: ['nyc', 'big apple'], isFreightHub: true },
  { label: 'Philadelphia, PA', name: 'Philadelphia', state: 'PA', lat: 39.9526, lon: -75.1652, aliases: ['philly'], isFreightHub: true },
  { label: 'Pittsburgh, PA', name: 'Pittsburgh', state: 'PA', lat: 40.4406, lon: -79.9959, aliases: ['pit'], isFreightHub: true },
  { label: 'Boston, MA', name: 'Boston', state: 'MA', lat: 42.3601, lon: -71.0589, aliases: ['bos'], isFreightHub: true },
  { label: 'Baltimore, MD', name: 'Baltimore', state: 'MD', lat: 39.2904, lon: -76.6122, aliases: ['bwi'], isFreightHub: true },
  { label: 'Richmond, VA', name: 'Richmond', state: 'VA', lat: 37.5407, lon: -77.436, aliases: ['ric'], isFreightHub: true },
  { label: 'Buffalo, NY', name: 'Buffalo', state: 'NY', lat: 42.8864, lon: -78.8784, aliases: ['buf'], isFreightHub: true },

  // West & Southwest
  { label: 'Denver, CO', name: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903, aliases: ['den', 'mile high'], isFreightHub: true },
  { label: 'Phoenix, AZ', name: 'Phoenix', state: 'AZ', lat: 33.4484, lon: -112.074, aliases: ['phx'], isFreightHub: true },
  { label: 'Los Angeles, CA', name: 'Los Angeles', state: 'CA', lat: 34.0522, lon: -118.2437, aliases: ['la', 'lax'], isFreightHub: true },
  { label: 'San Francisco, CA', name: 'San Francisco', state: 'CA', lat: 37.7749, lon: -122.4194, aliases: ['sf', 'bay area'], isFreightHub: true },
  { label: 'Seattle, WA', name: 'Seattle', state: 'WA', lat: 47.6062, lon: -122.3321, aliases: ['sea'], isFreightHub: true },
  { label: 'Portland, OR', name: 'Portland', state: 'OR', lat: 45.5152, lon: -122.6784, aliases: ['pdx'], isFreightHub: true },
  { label: 'Salt Lake City, UT', name: 'Salt Lake City', state: 'UT', lat: 40.7608, lon: -111.891, aliases: ['slc'], isFreightHub: true },
  { label: 'Las Vegas, NV', name: 'Las Vegas', state: 'NV', lat: 36.1699, lon: -115.1398, aliases: ['vegas', 'las'], isFreightHub: true },
  { label: 'Albuquerque, NM', name: 'Albuquerque', state: 'NM', lat: 35.0844, lon: -106.6504, aliases: ['abq'], isFreightHub: true },
  { label: 'Oklahoma City, OK', name: 'Oklahoma City', state: 'OK', lat: 35.4676, lon: -97.5164, aliases: ['okc'], isFreightHub: true },
  { label: 'Tulsa, OK', name: 'Tulsa', state: 'OK', lat: 36.154, lon: -95.9928, aliases: ['tul'], isFreightHub: true },
];

export function searchLocalFreightCities(query: string, limit = 5): FreightCity[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  return TOP_FREIGHT_CITIES.filter((city) => {
    if (city.name.toLowerCase().startsWith(q)) return true;
    if (city.label.toLowerCase().startsWith(q)) return true;
    if (city.aliases && city.aliases.some((a) => a.startsWith(q) || a === q)) return true;
    return false;
  }).slice(0, limit);
}
