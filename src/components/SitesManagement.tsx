import React, { useState, useEffect } from 'react';
import { Site, siteManagementService } from '../services/siteManagementService';
import { useAuth } from '../contexts/AuthContext';

interface SiteFormData {
  siteId: string;
  siteName: string;
  state: string;
  city: string;
  transmission: 'Microwave' | 'VSAT' | 'Fiber';
  status: 'On Air' | 'Off Air' | 'Maintenance' | 'Planned';
  supervisor?: string;
}

const statusColors = {
  'On Air': 'bg-green-500',
  'Off Air': 'bg-red-500',
  'Maintenance': 'bg-yellow-500',
  'Planned': 'bg-blue-500',
};

const transmissionIcons = {
  Microwave: '📡',
  VSAT: '🛰️',
  Fiber: '🌐',
};

export const SitesManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [formData, setFormData] = useState<SiteFormData>({
    siteId: '',
    siteName: '',
    state: '',
    city: '',
    transmission: 'Microwave',
    status: 'On Air',
    supervisor: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Filter states
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTransmission, setSelectedTransmission] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Get unique states for filter dropdown
  const uniqueStates = [...new Set(sites.map(site => site.state))].sort();

  // Fetch sites on component mount
  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch all sites with a high limit to get all 377 sites
      const fetchedSites = await siteManagementService.getAllSites({ limit: 1000 });
      setSites(fetchedSites);
    } catch (err) {
      setError('Failed to load sites');
      console.error('Error fetching sites:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter sites based on current filters
  const filteredSites = sites.filter(site => {
    if (selectedState !== 'all' && site.state !== selectedState) return false;
    if (selectedStatus !== 'all' && site.status !== selectedStatus) return false;
    if (selectedTransmission !== 'all' && site.transmission !== selectedTransmission) return false;
    if (searchTerm && !site.siteName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !site.city.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const resetForm = () => {
    setFormData({
      siteId: '',
      siteName: '',
      state: '',
      city: '',
      transmission: 'Microwave',
      status: 'On Air',
      supervisor: '',
    });
    setFormErrors({});
    setEditingSite(null);
  };

  const handleInputChange = (field: keyof SiteFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.siteId.trim()) errors.siteId = 'Site ID is required';
    if (!formData.siteName.trim()) errors.siteName = 'Site name is required';
    if (!formData.state.trim()) errors.state = 'State is required';
    if (!formData.city.trim()) errors.city = 'City is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      if (editingSite) {
        // Update existing site
        await siteManagementService.updateSite(editingSite.id, formData);
      } else {
        // Create new site
        await siteManagementService.createSite(formData);
      }

      resetForm();
      setShowAddModal(false);
      await fetchSites(); // Refresh the list
    } catch (err) {
      console.error('Error saving site:', err);
      setError(err instanceof Error ? err.message : 'Failed to save site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (site: Site) => {
    setEditingSite(site);
    setFormData({
      siteId: site.siteId,
      siteName: site.siteName,
      state: site.state,
      city: site.city,
      transmission: site.transmission,
      status: site.status,
      supervisor: site.supervisor || '',
    });
    setShowAddModal(true);
  };

  const handleDelete = async (siteId: string) => {
    if (!confirm('Are you sure you want to delete this site?')) return;

    try {
      await siteManagementService.deleteSite(siteId);
      await fetchSites(); // Refresh the list
    } catch (err) {
      console.error('Error deleting site:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete site');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sites Management</h2>
          <p className="text-muted-foreground mt-1">Manage {sites.length} network sites across multiple states</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
        >
          + Add Site
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sites..."
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">State</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm"
            >
              <option value="all">All States</option>
              {uniqueStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm"
            >
              <option value="all">All Status</option>
              <option value="On Air">On Air</option>
              <option value="Off Air">Off Air</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Planned">Planned</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Transmission</label>
            <select
              value={selectedTransmission}
              onChange={(e) => setSelectedTransmission(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm"
            >
              <option value="all">All Types</option>
              <option value="Microwave">Microwave</option>
              <option value="VSAT">VSAT</option>
              <option value="Fiber">Fiber</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredSites.length} of {sites.length} sites
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-background border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Site ID</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Site Name</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">State</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">City</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Type</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Uptime</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Supervisor</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSites.map(site => (
              <tr key={site.id} className="border-b border-border hover:bg-accent">
                <td className="px-6 py-4 text-sm text-foreground font-mono">{site.siteId}</td>
                <td className="px-6 py-4 text-sm text-foreground">{site.siteName}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{site.state}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{site.city}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span>{transmissionIcons[site.transmission]}</span>
                    {site.transmission}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${site.status === 'On Air' ? 'bg-green-500/20 text-green-400' : site.status === 'Off Air' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {site.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{site.uptime}%</td>
                <td className="px-6 py-4 text-sm text-primary">
                  {site.supervisor || <span className="text-muted-foreground">No supervisor</span>}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleEdit(site)}
                    className="text-primary hover:text-primary/80 text-sm mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(site.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Site Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg border border-border w-full max-w-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {editingSite ? 'Edit Site' : 'Add New Site'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Site ID</label>
                <input
                  type="text"
                  value={formData.siteId}
                  onChange={(e) => handleInputChange('siteId', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.siteId ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter site ID"
                />
                {formErrors.siteId && <p className="text-red-400 text-sm mt-1">{formErrors.siteId}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Site Name</label>
                <input
                  type="text"
                  value={formData.siteName}
                  onChange={(e) => handleInputChange('siteName', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.siteName ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter site name"
                />
                {formErrors.siteName && <p className="text-red-400 text-sm mt-1">{formErrors.siteName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.state ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter state"
                />
                {formErrors.state && <p className="text-red-400 text-sm mt-1">{formErrors.state}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.city ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter city"
                />
                {formErrors.city && <p className="text-red-400 text-sm mt-1">{formErrors.city}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Transmission Type</label>
                <select
                  value={formData.transmission}
                  onChange={(e) => handleInputChange('transmission', e.target.value as any)}
                  className="w-full px-3 py-2 bg-background border border-input rounded text-foreground"
                >
                  <option value="Microwave">Microwave</option>
                  <option value="VSAT">VSAT</option>
                  <option value="Fiber">Fiber</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value as any)}
                  className="w-full px-3 py-2 bg-background border border-input rounded text-foreground"
                >
                  <option value="On Air">On Air</option>
                  <option value="Off Air">Off Air</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Planned">Planned</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Supervisor (Optional)</label>
                <input
                  type="text"
                  value={formData.supervisor}
                  onChange={(e) => handleInputChange('supervisor', e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded text-foreground"
                  placeholder="Enter supervisor name"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded transition-colors"
                >
                  {submitting ? 'Saving...' : (editingSite ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
