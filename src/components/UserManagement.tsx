import React, { useState, useEffect } from 'react';
import { User, userManagementService, CreateUserRequest, UpdateUserRequest } from '../services/userManagementService';
import { useAuth } from '../contexts/AuthContext';

interface UserFormData {
  name: string;
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'engineer' | 'operator' | 'viewer';
}

const roleColors = {
  admin: 'bg-purple-500/20 text-purple-400 border-purple-500',
  engineer: 'bg-blue-500/20 text-blue-400 border-blue-500',
  operator: 'bg-green-500/20 text-green-400 border-green-500',
  viewer: 'bg-gray-500/20 text-gray-400 border-gray-500',
};

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'viewer',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedUsers = await userManagementService.getAllUsers();
      setUsers(fetchedUsers);
    } catch (err) {
      setError('Failed to load users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'viewer',
    });
    setFormErrors({});
    setEditingUser(null);
  };

  const handleInputChange = (field: keyof UserFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.username.trim()) errors.username = 'Username is required';
    if (formData.username.length < 3) errors.username = 'Username must be at least 3 characters';
    if (!formData.email.trim()) errors.email = 'Email is required';
    if (!formData.email.includes('@')) errors.email = 'Valid email is required';
    if (!editingUser && !formData.password) errors.password = 'Password is required';
    if (!editingUser && formData.password.length < 6) errors.password = 'Password must be at least 6 characters';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      if (editingUser) {
        // Update existing user
        const updateData: UpdateUserRequest = {
          name: formData.name,
          username: formData.username,
          email: formData.email,
          role: formData.role,
        };

        await userManagementService.updateUser(editingUser.id, updateData);
      } else {
        // Create new user
        const createData: CreateUserRequest = {
          name: formData.name,
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        };

        await userManagementService.createUser(createData);
      }

      resetForm();
      setShowAddModal(false);
      await fetchUsers(); // Refresh the list
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err instanceof Error ? err.message : 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      username: user.username,
      email: user.email,
      password: '', // Don't populate password for editing
      role: user.role,
    });
    setShowAddModal(true);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await userManagementService.deleteUser(userId);
      await fetchUsers(); // Refresh the list
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const formatLastLogin = (lastLogin: string) => {
    return new Date(lastLogin).toLocaleString();
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
          <h2 className="text-2xl font-bold text-foreground">User Management</h2>
          <p className="text-muted-foreground mt-1">Manage NOC team access and permissions</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
        >
          + Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-background border-b border-border">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Name</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Username</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Email</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Role</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Last Login</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-border hover:bg-accent">
                <td className="px-6 py-4 text-sm text-foreground">{user.name || user.username}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{user.username}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold border ${roleColors[user.role]}`}>
                    {user.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {user.lastLogin ? formatLastLogin(user.lastLogin) : 'Never'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${user.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleEdit(user)}
                    className="text-primary hover:text-primary/80 text-sm mr-3"
                  >
                    Edit
                  </button>
                  {user.id !== currentUser?.id && (
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg border border-border w-full max-w-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {editingUser ? 'Edit User' : 'Add New User'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.name ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter full name"
                />
                {formErrors.name && <p className="text-red-400 text-sm mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.username ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter username"
                />
                {formErrors.username && <p className="text-red-400 text-sm mt-1">{formErrors.username}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.email ? 'border-red-500' : 'border-input'}`}
                  placeholder="Enter email address"
                />
                {formErrors.email && <p className="text-red-400 text-sm mt-1">{formErrors.email}</p>}
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={`w-full px-3 py-2 bg-background border rounded text-foreground ${formErrors.password ? 'border-red-500' : 'border-input'}`}
                    placeholder="Enter password"
                  />
                  {formErrors.password && <p className="text-red-400 text-sm mt-1">{formErrors.password}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => handleInputChange('role', e.target.value as any)}
                  className="w-full px-3 py-2 bg-background border border-input rounded text-foreground"
                >
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="engineer">Engineer</option>
                  <option value="admin">Admin</option>
                </select>
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
                  {submitting ? 'Saving...' : (editingUser ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
