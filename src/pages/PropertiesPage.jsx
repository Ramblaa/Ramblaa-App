import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  MapPin, 
  Plus, 
  Edit, 
  Trash2,
  Save,
  ArrowLeft,
  Clock,
  Key,
  Shield,
  X,
  RefreshCw
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { useNotification } from '../contexts/NotificationContext'
import contactsService from '../services/contactsService'
import AddPropertyModal from '../components/AddPropertyModal'

export default function PropertiesPage() {
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingProperty, setEditingProperty] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [errors, setErrors] = useState({})
  const [newProperty, setNewProperty] = useState({
    name: '',
    address: '',
    type: '',
    bedrooms: 0,
    bathrooms: 0,
    maxGuests: 1,
    checkinTime: '3:00 PM',
    checkoutTime: '11:00 AM',
    instructions: '',
    houseRules: '',
    wifiName: '',
    wifiPassword: '',
    emergencyContact: '',
    status: 'active'
  })
  const { showWarning, showSuccess, showError } = useNotification()

  // Load data on component mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await contactsService.getProperties()
      setProperties(response.properties || response)
      
    } catch (err) {
      console.error('Error loading properties:', err)
      setError(err.message || 'Failed to load properties')
      showError('Failed to load properties')
    } finally {
      setLoading(false)
    }
  }

  const handleAddProperty = async () => {
    if (!newProperty.name.trim() || !newProperty.address.trim()) {
      showWarning('Please fill in at least the property name and address.')
      return
    }

    try {
      setLoading(true)
      
      const createdProperty = await contactsService.createProperty(newProperty)
      
      // Update the properties list
      setProperties(prev => [...prev, createdProperty])
      
      // Reset form and close modal
      setShowAddModal(false)
      setNewProperty({
        name: '',
        address: '',
        type: '',
        bedrooms: 0,
        bathrooms: 0,
        maxGuests: 1,
        checkinTime: '3:00 PM',
        checkoutTime: '11:00 AM',
        instructions: '',
        houseRules: '',
        wifiName: '',
        wifiPassword: '',
        emergencyContact: '',
        status: 'active'
      })
      
      showSuccess('Property added successfully!')
      
    } catch (err) {
      console.error('Error adding property:', err)
      showError(err.message || 'Failed to add property')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProperty = async (propertyId) => {
    if (!confirm('Are you sure you want to delete this property?')) {
      return
    }

    try {
      setLoading(true)
      
      await contactsService.deleteProperty(propertyId)
      
      // Remove from properties list
      setProperties(prev => prev.filter(property => property.id !== propertyId))
      
      // If we're viewing the deleted property, go back to list
      if (selectedProperty && selectedProperty.id === propertyId) {
        setSelectedProperty(null)
      }
      
      showSuccess('Property deleted successfully!')
      
    } catch (err) {
      console.error('Error deleting property:', err)
      showError(err.message || 'Failed to delete property')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field, value) => {
    setNewProperty(prev => ({ ...prev, [field]: value }))
  }

  const startEditingProperty = (property) => {
    setEditingProperty(true)
    setEditForm({
      name: property.name || '',
      address: property.address || '',
      description: property.description || '',
      property_type: property.property_type || property.type || '',
      bedrooms: property.bedrooms || 0,
      bathrooms: property.bathrooms || 0,
      max_guests: property.max_guests || property.maxGuests || 1,
      checkin_time: property.checkin_time || property.checkinTime || '3:00 PM',
      checkout_time: property.checkout_time || property.checkoutTime || '11:00 AM',
      wifi_name: property.wifi_name || property.wifiName || '',
      wifi_password: property.wifi_password || property.wifiPassword || '',
      emergency_contact: property.emergency_contact || property.emergencyContact || '',
      instructions: property.instructions || '',
      house_rules: property.house_rules || property.houseRules || ''
    })
    setErrors({})
  }

  const cancelEditingProperty = () => {
    setEditingProperty(false)
    setEditForm({})
    setErrors({})
  }

  const updateEditForm = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validatePropertyForm = () => {
    const newErrors = {}
    
    if (!editForm.name?.trim()) {
      newErrors.name = 'Property name is required'
    }
    
    if (!editForm.address?.trim()) {
      newErrors.address = 'Address is required'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const savePropertyChanges = async () => {
    if (!validatePropertyForm()) return
    
    try {
      setLoading(true)
      
      const updatedProperty = await contactsService.updateProperty(selectedProperty.id, editForm)
      
      // Update the properties list
      setProperties(prev => 
        prev.map(property => 
          property.id === selectedProperty.id ? updatedProperty : property
        )
      )
      
      // Update selected property
      setSelectedProperty(updatedProperty)
      setEditingProperty(false)
      setEditForm({})
      setErrors({})
      showSuccess('Property updated successfully!')
      
    } catch (err) {
      console.error('Error updating property:', err)
      showError(err.message || 'Failed to update property')
    } finally {
      setLoading(false)
    }
  }

  // Refresh button
  const RefreshButton = () => (
    <Button
      variant="ghost"
      size="sm"
      onClick={loadData}
      disabled={loading}
      className="h-6 px-2"
      title="Refresh properties"
    >
      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
    </Button>
  )

  const renderPropertyDetail = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => {
            setSelectedProperty(null)
            setEditingProperty(false)
            setEditForm({})
            setErrors({})
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Properties
        </Button>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-ink-900">{selectedProperty.name}</h3>
          <p className="text-ink-500">{selectedProperty.address}</p>
        </div>
        <div className="flex gap-2">
          {!editingProperty ? (
            <Button onClick={() => startEditingProperty(selectedProperty)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Property
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={cancelEditingProperty} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={savePropertyChanges} disabled={loading}>
                {loading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="property-name">Property Name *</Label>
            <Input 
              id="property-name" 
              value={editingProperty ? editForm.name : selectedProperty.name || ''}
              onChange={(e) => updateEditForm('name', e.target.value)}
              disabled={!editingProperty}
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-1">{errors.name}</p>
            )}
          </div>
          <div>
            <Label htmlFor="property-address">Address *</Label>
            <Input 
              id="property-address" 
              value={editingProperty ? editForm.address : selectedProperty.address || ''}
              onChange={(e) => updateEditForm('address', e.target.value)}
              disabled={!editingProperty}
              className={errors.address ? 'border-red-500' : ''}
            />
            {errors.address && (
              <p className="text-sm text-red-500 mt-1">{errors.address}</p>
            )}
          </div>
          <div>
            <Label htmlFor="property-type">Property Type</Label>
            <select
              id="property-type"
              value={editingProperty ? editForm.property_type : selectedProperty.property_type || selectedProperty.type || ''}
              onChange={(e) => updateEditForm('property_type', e.target.value)}
              disabled={!editingProperty}
              className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-gray-50"
            >
              <option value="">Select Type</option>
              <option value="villa">Villa</option>
              <option value="apartment">Apartment</option>
              <option value="house">House</option>
              <option value="condo">Condo</option>
              <option value="cabin">Cabin</option>
            </select>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input 
              id="description" 
              value={editingProperty ? editForm.description : selectedProperty.description || ''}
              onChange={(e) => updateEditForm('description', e.target.value)}
              disabled={!editingProperty}
            />
          </div>
          <div>
            <Label htmlFor="bedrooms">Bedrooms</Label>
            <Input 
              id="bedrooms" 
              type="number"
              min="0"
              value={editingProperty ? editForm.bedrooms : selectedProperty.bedrooms || 0}
              onChange={(e) => updateEditForm('bedrooms', parseInt(e.target.value) || 0)}
              disabled={!editingProperty}
            />
          </div>
          <div>
            <Label htmlFor="bathrooms">Bathrooms</Label>
            <Input 
              id="bathrooms" 
              type="number"
              min="0"
              step="0.5"
              value={editingProperty ? editForm.bathrooms : selectedProperty.bathrooms || 0}
              onChange={(e) => updateEditForm('bathrooms', parseFloat(e.target.value) || 0)}
              disabled={!editingProperty}
            />
          </div>
          <div>
            <Label htmlFor="max-guests">Max Guests</Label>
            <Input 
              id="max-guests" 
              type="number"
              min="1"
              value={editingProperty ? editForm.max_guests : selectedProperty.max_guests || selectedProperty.maxGuests || 1}
              onChange={(e) => updateEditForm('max_guests', parseInt(e.target.value) || 1)}
              disabled={!editingProperty}
            />
          </div>
          <div>
            <Label htmlFor="checkin-time">Check-in Time</Label>
            <Input 
              id="checkin-time" 
              value={editingProperty ? editForm.checkin_time : selectedProperty.checkin_time || selectedProperty.checkinTime || '3:00 PM'}
              onChange={(e) => updateEditForm('checkin_time', e.target.value)}
              disabled={!editingProperty}
            />
          </div>
          <div>
            <Label htmlFor="checkout-time">Check-out Time</Label>
            <Input 
              id="checkout-time" 
              value={editingProperty ? editForm.checkout_time : selectedProperty.checkout_time || selectedProperty.checkoutTime || '11:00 AM'}
              onChange={(e) => updateEditForm('checkout_time', e.target.value)}
              disabled={!editingProperty}
            />
          </div>
        </CardContent>
      </Card>

      {/* Access & WiFi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Access & WiFi
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="wifi-name">WiFi Network Name</Label>
            <Input 
              id="wifi-name" 
              value={editingProperty ? editForm.wifi_name : selectedProperty.wifi_name || selectedProperty.wifiName || ''}
              onChange={(e) => updateEditForm('wifi_name', e.target.value)}
              disabled={!editingProperty}
            />
          </div>
          <div>
            <Label htmlFor="wifi-password">WiFi Password</Label>
            <Input 
              id="wifi-password" 
              value={editingProperty ? editForm.wifi_password : selectedProperty.wifi_password || selectedProperty.wifiPassword || ''}
              onChange={(e) => updateEditForm('wifi_password', e.target.value)}
              disabled={!editingProperty}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="emergency-contact">Emergency Contact</Label>
            <Input 
              id="emergency-contact" 
              value={editingProperty ? editForm.emergency_contact : selectedProperty.emergency_contact || selectedProperty.emergencyContact || ''}
              onChange={(e) => updateEditForm('emergency_contact', e.target.value)}
              disabled={!editingProperty}
            />
          </div>
        </CardContent>
      </Card>

      {/* Check-in Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Check-in Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="instructions">Instructions</Label>
          <textarea 
            id="instructions"
            className="w-full h-32 px-3 py-2 border border-input rounded-md text-sm mt-2 disabled:bg-gray-50"
            value={editingProperty ? editForm.instructions : selectedProperty.instructions || ''}
            onChange={(e) => updateEditForm('instructions', e.target.value)}
            disabled={!editingProperty}
            placeholder="Enter detailed check-in instructions for guests..."
          />
        </CardContent>
      </Card>

      {/* House Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            House Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="house-rules">Rules</Label>
          <textarea 
            id="house-rules"
            className="w-full h-32 px-3 py-2 border border-input rounded-md text-sm mt-2 disabled:bg-gray-50"
            value={editingProperty ? editForm.house_rules : selectedProperty.house_rules || selectedProperty.houseRules || ''}
            onChange={(e) => updateEditForm('house_rules', e.target.value)}
            disabled={!editingProperty}
            placeholder="Enter house rules (e.g., • No smoking inside&#10;• Quiet hours: 10 PM - 8 AM)"
          />
        </CardContent>
      </Card>
    </div>
  )

  const renderPropertiesList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-ink-900">Properties</h3>
          <RefreshButton />
        </div>
        <Button onClick={() => setShowAddModal(true)} disabled={loading}>
          <Plus className="mr-2 h-4 w-4" />
          Add Property
        </Button>
      </div>
      
      <div className="grid gap-4">
        {loading && properties.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-ink-500">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Loading properties...</span>
            </div>
          </div>
        ) : error && properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="text-red-500 text-center">
              <p className="font-medium">Failed to load properties</p>
              <p className="text-sm text-ink-500">{error}</p>
            </div>
            <Button onClick={loadData} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="text-center">
              <p className="font-medium text-ink-900">No properties found</p>
              <p className="text-sm text-ink-500">Add your first property to get started!</p>
            </div>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </div>
        ) : (
          properties.map((property) => (
            <Card key={property.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1" onClick={() => setSelectedProperty(property)}>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-ink-900">{property.name}</h4>
                      <Badge variant={property.status === 'active' ? 'default' : 'secondary'}>
                        {property.status}
                      </Badge>
                    </div>
                    <p className="text-ink-500 text-sm mt-1">{property.address}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-ink-500">
                      <span>Check-in: {property.checkin_time || property.checkinTime || '3:00 PM'}</span>
                      <span>Check-out: {property.checkout_time || property.checkoutTime || '11:00 AM'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setSelectedProperty(property)
                      startEditingProperty(property)
                    }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteProperty(property.id)
                      }}
                      disabled={loading}
                      className="hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {selectedProperty ? renderPropertyDetail() : renderPropertiesList()}
      </motion.div>
      {showAddModal && (
        <AddPropertyModal 
          newProperty={newProperty}
          handleInputChange={handleInputChange}
          handleAddProperty={handleAddProperty}
          setShowAddModal={setShowAddModal}
        />
      )}
    </div>
  )
} 