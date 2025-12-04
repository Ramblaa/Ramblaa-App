import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Check, X, RefreshCw, Calendar, User, Phone, Mail, Building2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useNotification } from '../contexts/NotificationContext'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function BookingsPage() {
  const [bookings, setBookings] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingBooking, setEditingBooking] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [newBooking, setNewBooking] = useState({
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    startDate: '',
    endDate: '',
  })
  const { showSuccess, showError: showErrorNotif, showWarning } = useNotification()

  useEffect(() => {
    loadProperties()
  }, [])

  useEffect(() => {
    if (selectedProperty) {
      loadBookings()
    }
  }, [selectedProperty, showActiveOnly])

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

  const loadBookings = async () => {
    try {
      setLoading(true)
      const url = `${API_BASE_URL}/properties/${selectedProperty}/bookings${showActiveOnly ? '?active=true' : ''}`
      const response = await fetch(url)
      const data = await response.json()
      setBookings(data)
      setError(null)
    } catch (err) {
      console.error('Error loading bookings:', err)
      setError('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  const handleAddBooking = async () => {
    if (!newBooking.guestName.trim() || !newBooking.startDate || !newBooking.endDate) {
      showWarning('Please fill in guest name and dates')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBooking)
      })

      if (response.ok) {
        await loadBookings()
        setShowAddModal(false)
        setNewBooking({ guestName: '', guestPhone: '', guestEmail: '', startDate: '', endDate: '' })
        showSuccess('Booking added successfully!')
      } else {
        throw new Error('Failed to create booking')
      }
    } catch (err) {
      console.error('Error adding booking:', err)
      showErrorNotif('Failed to add booking')
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (booking) => {
    setEditingBooking(booking.id)
    setEditForm({
      guestName: booking.guestName,
      guestPhone: booking.guestPhone || '',
      guestEmail: booking.guestEmail || '',
      startDate: booking.startDate?.split('T')[0] || '',
      endDate: booking.endDate?.split('T')[0] || '',
    })
  }

  const cancelEditing = () => {
    setEditingBooking(null)
    setEditForm({})
  }

  const saveChanges = async () => {
    if (!editForm.guestName?.trim() || !editForm.startDate || !editForm.endDate) {
      showWarning('Guest name and dates are required')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/bookings/${editingBooking}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })

      if (response.ok) {
        await loadBookings()
        setEditingBooking(null)
        setEditForm({})
        showSuccess('Booking updated!')
      } else {
        throw new Error('Failed to update')
      }
    } catch (err) {
      console.error('Error updating booking:', err)
      showErrorNotif('Failed to update booking')
    } finally {
      setLoading(false)
    }
  }

  const deleteBooking = async (id) => {
    if (!confirm('Delete this booking?')) return

    try {
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/bookings/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadBookings()
        showSuccess('Booking deleted')
      }
    } catch (err) {
      console.error('Error deleting booking:', err)
      showErrorNotif('Failed to delete booking')
    }
  }

  const getBookingStatus = (booking) => {
    const today = new Date().toISOString().split('T')[0]
    const start = booking.startDate?.split('T')[0]
    const end = booking.endDate?.split('T')[0]

    if (end < today) return { label: 'Past', color: 'bg-gray-100 text-gray-600' }
    if (start <= today && end >= today) return { label: 'Active', color: 'bg-green-100 text-green-700' }
    return { label: 'Upcoming', color: 'bg-blue-100 text-blue-700' }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading && bookings.length === 0 && properties.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-brand-mid-gray">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading bookings...</span>
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
          <h1 className="text-2xl font-bold text-brand-dark">Bookings</h1>
          <p className="text-brand-mid-gray">Manage guest bookings for your properties</p>
        </div>

        {/* Property Selector and Actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
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
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
              />
              Active only
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadBookings}
              disabled={loading}
              className="h-8 px-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Booking
          </Button>
        </div>

        {/* Bookings List */}
        {bookings.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Calendar className="mx-auto h-12 w-12 text-brand-mid-gray mb-4" />
              <h3 className="text-lg font-medium text-brand-dark mb-2">No Bookings Found</h3>
              <p className="text-brand-mid-gray">
                {showActiveOnly ? 'No active bookings. Try showing all bookings.' : 'Add bookings to track your guests.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {bookings.map((booking) => {
              const status = getBookingStatus(booking)
              return (
                <Card key={booking.id}>
                  <CardContent className="p-4">
                    {editingBooking === booking.id ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Guest Name *</Label>
                            <Input
                              value={editForm.guestName || ''}
                              onChange={(e) => setEditForm({ ...editForm, guestName: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Phone</Label>
                            <Input
                              value={editForm.guestPhone || ''}
                              onChange={(e) => setEditForm({ ...editForm, guestPhone: e.target.value })}
                              placeholder="whatsapp:+1234567890"
                            />
                          </div>
                          <div>
                            <Label>Email</Label>
                            <Input
                              type="email"
                              value={editForm.guestEmail || ''}
                              onChange={(e) => setEditForm({ ...editForm, guestEmail: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label>Check-in *</Label>
                              <Input
                                type="date"
                                value={editForm.startDate || ''}
                                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Check-out *</Label>
                              <Input
                                type="date"
                                value={editForm.endDate || ''}
                                onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                              />
                            </div>
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
                            <User className="h-5 w-5 text-brand-mid-gray" />
                            <h4 className="font-semibold text-brand-dark">{booking.guestName}</h4>
                            <Badge className={`text-xs ${status.color}`}>
                              {status.label}
                            </Badge>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-brand-mid-gray">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(booking.startDate)} → {formatDate(booking.endDate)}</span>
                            </div>
                            {booking.guestPhone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span>{booking.guestPhone?.replace('whatsapp:', '')}</span>
                              </div>
                            )}
                            {booking.guestEmail && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                <span>{booking.guestEmail}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditing(booking)}
                            disabled={editingBooking !== null}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteBooking(booking.id)}
                            disabled={editingBooking !== null}
                            className="hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Add Booking Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-brand-dark">Add Booking</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)} className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Guest Name *</Label>
                  <Input
                    value={newBooking.guestName}
                    onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })}
                    placeholder="Guest name"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newBooking.guestPhone}
                    onChange={(e) => setNewBooking({ ...newBooking, guestPhone: e.target.value })}
                    placeholder="whatsapp:+1234567890"
                  />
                  <p className="text-xs text-brand-mid-gray mt-1">Include 'whatsapp:' prefix for WhatsApp numbers</p>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newBooking.guestEmail}
                    onChange={(e) => setNewBooking({ ...newBooking, guestEmail: e.target.value })}
                    placeholder="guest@email.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Check-in Date *</Label>
                    <Input
                      type="date"
                      value={newBooking.startDate}
                      onChange={(e) => setNewBooking({ ...newBooking, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Check-out Date *</Label>
                    <Input
                      type="date"
                      value={newBooking.endDate}
                      onChange={(e) => setNewBooking({ ...newBooking, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleAddBooking} disabled={loading} className="flex-1">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Adding...' : 'Add Booking'}
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

