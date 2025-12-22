import { siteManagementService, Site } from './siteManagementService';

// Cache for site to region mapping
let siteRegionCache: Map<string, string> | null = null;
let lastCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL for cache

// Normalize region names to ensure consistency
const normalizeRegion = (region: string | undefined): string => {
  if (!region) return 'Unknown';
  
  // Convert to title case and trim
  return region
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
};

/**
 * Fetches sites and builds a site to region mapping
 * @returns Promise<Map<string, string>> Map of site codes to regions
 */
const fetchSiteRegionMap = async (): Promise<Map<string, string>> => {
  const now = Date.now();
  
  // Return cached data if it's still valid
  if (siteRegionCache && (now - lastCacheTime) < CACHE_TTL) {
    console.log('Using cached site region map');
    return siteRegionCache;
  }

  try {
    console.log('Fetching site region mapping...');
    // Fetch all sites
    const sites = await siteManagementService.getAllSites();
    console.log(`Fetched ${sites.length} sites for region mapping`);
    
    // Create a new map for site code to region mapping
    const newMap = new Map<string, string>();
    
    sites.forEach((site: Site) => {
      if (site.siteId && site.region) {
        const normalizedRegion = normalizeRegion(site.region);
        newMap.set(site.siteId, normalizedRegion);
        console.log(`Mapped site ${site.siteId} to region: ${normalizedRegion}`);
      }
    });
    
    // Update cache
    siteRegionCache = newMap;
    lastCacheTime = now;
    
    console.log(`Site region map updated with ${newMap.size} entries`);
    return newMap;
  } catch (error) {
    console.error('Failed to fetch site region mapping:', error);
    // Return the existing cache if available, or an empty map
    return siteRegionCache || new Map<string, string>();
  }
};

/**
 * Gets the region for a specific site
 * @param siteCode The site code to look up
 * @returns Promise<string> The region name or 'Unknown' if not found
 */
const getSiteRegion = async (siteCode: string): Promise<string> => {
  if (!siteCode) {
    console.warn('No site code provided to getSiteRegion');
    return 'Unknown';
  }
  
  try {
    const siteMap = await fetchSiteRegionMap();
    const region = siteMap.get(siteCode);
    
    if (!region) {
      console.warn(`No region found for site code: ${siteCode}`);
      return 'Unknown';
    }
    
    return region;
  } catch (error) {
    console.error(`Error getting region for site ${siteCode}:`, error);
    return 'Unknown';
  }
};

export const siteRegionService = {
  fetchSiteRegionMap,
  getSiteRegion
};
