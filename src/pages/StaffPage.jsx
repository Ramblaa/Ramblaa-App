import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Check, X, Building2, RefreshCw, Phone, UserCog } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useNotification } from '../contexts/NotificationContext'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function StaffPage() {
  const [staff, setStaff] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingStaff, setEditingStaff] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [errors, setErrors] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [newStaff, setNewStaff] = useState({
    name: '',
    phone: '',
    role: 'Staff',
    preferredLanguage: 'en',
  })
  const { showSuccess, showError, showWarning } = useNotification()

  useEffect(() => {
    loadProperties()
  }, [])

  useEffect(() => {
    if (selectedProperty) {
      loadStaff()
    }
  }, [selectedProperty])

  const loadProperties = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/properties`)
      const data = await response.json()
      setProperties(data)
      if (data.length > 0) {
        setSelectedProperty(data[0].id)
      }
    } catch (err) {
      console.error('Error loading properties:', err)
      setError('Failed to load properties')
    }
  }

  const loadStaff = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/staff`)
      const data = await response.json()
      setStaff(data)
      setError(null)
    } catch (err) {
      console.error('Error loading staff:', err)
      setError('Failed to load staff')
    } finally {
      setLoading(false)
    }
  }

  const handleAddStaff = async () => {
    if (!newStaff.name.trim() || !newStaff.phone.trim()) {
      showWarning('Please fill in name and phone number')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff)
      })

      if (response.ok) {
        await loadStaff()
        setShowAddModal(false)
        setNewStaff({ name: '', phone: '', role: 'Staff', preferredLanguage: 'en' })
        showSuccess('Staff member added successfully!')
      } else {
        throw new Error('Failed to create staff')
      }
    } catch (err) {
      console.error('Error adding staff:', err)
      showError('Failed to add staff member')
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (member) => {
    setEditingStaff(member.id)
    setEditForm({
      name: member.name,
      phone: member.phone,
      role: member.role || 'Staff',
      preferredLanguage: member.preferredLanguage || 'en'
    })
    setErrors({})
  }

  const cancelEditing = () => {
    setEditingStaff(null)
    setEditForm({})
    setErrors({})
  }

  const saveChanges = async () => {
    if (!editForm.name?.trim() || !editForm.phone?.trim()) {
      setErrors({ name: !editForm.name?.trim() ? 'Required' : '', phone: !editForm.phone?.trim() ? 'Required' : '' })
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/staff/${editingStaff}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })

      if (response.ok) {
        await loadStaff()
        setEditingStaff(null)
        setEditForm({})
        showSuccess('Staff member updated!')
      } else {
        throw new Error('Failed to update')
      }
    } catch (err) {
      console.error('Error updating staff:', err)
      showError('Failed to update staff member')
    } finally {
      setLoading(false)
    }
  }

  const deleteStaff = async (id) => {
    if (!confirm('Delete this staff member?')) return

    try {
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/staff/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadStaff()
        showSuccess('Staff member deleted')
      }
    } catch (err) {
      console.error('Error deleting staff:', err)
      showError('Failed to delete staff member')
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'host': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'manager': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'cleaner': return 'bg-green-100 text-green-800 border-green-200'
      case 'maintenance': return 'bg-orange-100 text-orange-800 border-orange-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  if (loading && staff.length === 0 && properties.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-ink-500">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading staff...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Staff</h1>
          <p className="text-ink-500">Manage staff members for your properties</p>
        </div>

        {/* Property Selector and Actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Property:</Label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm min-w-[200px]"
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadStaff}
              disabled={loading}
              className="h-8 px-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Staff Member
          </Button>
        </div>

        {/* Staff List */}
        {staff.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <UserCog className="mx-auto h-12 w-12 text-ink-500 mb-4" />
              <h3 className="text-lg font-medium text-ink-900 mb-2">No Staff Members</h3>
              <p className="text-ink-500">Add staff members to assign tasks and manage your property.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {staff.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-4">
                  {editingStaff === member.id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Name *</Label>
                          <Input
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className={errors.name ? 'border-red-500' : ''}
                          />
                        </div>
                        <div>
                          <Label>Phone *</Label>
                          <Input
                            value={editForm.phone || ''}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            placeholder="+1234567890 or whatsapp:+1234567890"
                            className={errors.phone ? 'border-red-500' : ''}
                          />
                        </div>
                        <div>
                          <Label>Role</Label>
                          <select
                            value={editForm.role || 'Staff'}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="Host">Host</option>
                            <option value="Manager">Manager</option>
                            <option value="Staff">Staff</option>
                            <option value="Cleaner">Cleaner</option>
                            <option value="Maintenance">Maintenance</option>
                          </select>
                        </div>
                        <div>
                          <Label>Preferred Language</Label>
                          <select
                            value={editForm.preferredLanguage || 'en'}
                            onChange={(e) => setEditForm({ ...editForm, preferredLanguage: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="en">English</option>
                            <option value="id">Indonesian</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveChanges} disabled={loading}>
                          <Check className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEditing}>
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-semibold text-ink-900">{member.name}</h4>
                          <Badge className={`text-xs ${getRoleBadgeColor(member.role)}`}>
                            {member.role || 'Staff'}
                          </Badge>
                          {member.preferredLanguage && member.preferredLanguage !== 'en' && (
                            <Badge variant="outline" className="text-xs">
                              {member.preferredLanguage.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm text-ink-500">
                          <Phone className="h-3 w-3" />
                          <span>{member.phone?.replace('whatsapp:', '')}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(member)}
                          disabled={editingStaff !== null}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteStaff(member.id)}
                          disabled={editingStaff !== null}
                          className="hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Staff Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-ink-900">Add Staff Member</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)} className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    placeholder="Staff member name"
                  />
                </div>
                <div>
                  <Label>Phone *</Label>
                  <Input
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    placeholder="whatsapp:+1234567890"
                  />
                  <p className="text-xs text-ink-500 mt-1">Include 'whatsapp:' prefix for WhatsApp numbers</p>
                </div>
                <div>
                  <Label>Role</Label>
                  <select
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="Host">Host</option>
                    <option value="Manager">Manager</option>
                    <option value="Staff">Staff</option>
                    <option value="Cleaner">Cleaner</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <Label>Preferred Language</Label>
                  <select
                    value={newStaff.preferredLanguage}
                    onChange={(e) => setNewStaff({ ...newStaff, preferredLanguage: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="en">English</option>
                    <option value="id">Indonesian</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleAddStaff} disabled={loading} className="flex-1">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Adding...' : 'Add Staff'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

