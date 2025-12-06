import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  HelpCircle,
  Plus, 
  Edit, 
  Trash2,
  Bot,
  User,
  AlertCircle,
  TrendingUp,
  Save,
  X,
  Search,
  ClipboardList,
  Users,
  Phone,
  Loader2
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import apiService from '../services/api'

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function ResourcesPage() {
  const [activeTab, setActiveTab] = useState('faqs')
  
  return (
    <div className="p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 sm:space-y-6"
      >
        {/* Header */}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-ink-900">Resources</h1>
          <p className="text-sm sm:text-base text-ink-500">Manage FAQs and task definitions for your properties</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('faqs')}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'faqs'
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-ink-500 hover:text-ink-900 hover:border-gray-300"
            )}
          >
            <HelpCircle className="inline-block mr-2 h-4 w-4" />
            FAQs
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'tasks'
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-ink-500 hover:text-ink-900 hover:border-gray-300"
            )}
          >
            <ClipboardList className="inline-block mr-2 h-4 w-4" />
            Task Definitions
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'faqs' ? <FAQsPanel /> : <TaskDefinitionsPanel />}
      </motion.div>
    </div>
  )
}

// ============================================================================
// FAQs Panel
// ============================================================================

function FAQsPanel() {
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingFaq, setEditingFaq] = useState(null)
  const [formData, setFormData] = useState({ subCategory: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState('')

  useEffect(() => {
    loadProperties()
  }, [])

  useEffect(() => {
    if (selectedProperty) {
      loadFAQs()
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
    }
  }

  const loadFAQs = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/faqs`)
      const data = await response.json()
      setFaqs(data)
      setError(null)
    } catch (err) {
      console.error('Error loading FAQs:', err)
      setError('Failed to load FAQs')
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingFaq(null)
    setFormData({ subCategory: '', description: '' })
    setShowModal(true)
  }

  const openEditModal = (faq) => {
    setEditingFaq(faq)
    setFormData({ 
      subCategory: faq.subCategory || '', 
      description: faq.description || '' 
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingFaq(null)
    setFormData({ subCategory: '', description: '' })
  }

  const handleSave = async () => {
    if (!formData.subCategory.trim()) return
    
    try {
      setSaving(true)
      
      if (editingFaq) {
        // Update existing FAQ
        const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/faqs/${editingFaq.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subCategory: formData.subCategory.trim(),
            description: formData.description.trim() || null
          })
        })
        if (!response.ok) throw new Error('Failed to update')
      } else {
        // Create new FAQ
        const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/faqs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subCategory: formData.subCategory.trim(),
            description: formData.description.trim() || null
          })
        })
        if (!response.ok) throw new Error('Failed to create')
      }
      
      await loadFAQs()
      closeModal()
    } catch (err) {
      console.error('Error saving FAQ:', err)
      setError('Failed to save FAQ')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (faq) => {
    if (!confirm(`Delete FAQ "${faq.subCategory}"?`)) return
    
    try {
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/faqs/${faq.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        await loadFAQs()
      }
    } catch (err) {
      console.error('Error deleting FAQ:', err)
      setError('Failed to delete FAQ')
    }
  }

  const filteredFaqs = faqs.filter(faq => {
    if (!searchTerm.trim()) return true
    const query = searchTerm.toLowerCase()
    return faq.subCategory?.toLowerCase().includes(query) ||
           faq.description?.toLowerCase().includes(query)
  })

  if (loading && !faqs.length) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
        <p className="mt-2 text-ink-500">Loading FAQs...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Property Selector and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <Label className="text-sm font-medium">Property:</Label>
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add FAQ
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-ink-500" />
        <Input 
          placeholder="Search FAQs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* FAQs List */}
      {filteredFaqs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <HelpCircle className="mx-auto h-12 w-12 text-ink-500 mb-4" />
            <h3 className="text-lg font-medium text-ink-900 mb-2">No FAQs found</h3>
            <p className="text-ink-500">
              {searchTerm ? `No results for "${searchTerm}"` : 'Add FAQs to help guests get quick answers.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredFaqs.map((faq) => (
            <Card key={faq.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-medium text-ink-900">{faq.subCategory}</h4>
                    <p className="text-sm text-ink-500 mt-1">{faq.description}</p>
                    {faq.details && Object.keys(faq.details).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(faq.details).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {String(value)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 w-8 p-0"
                      onClick={() => openEditModal(faq)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(faq)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit FAQ Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-ink-900">
                {editingFaq ? 'Edit FAQ' : 'Add New FAQ'}
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={closeModal}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Category/Topic *</Label>
                <Input
                  value={formData.subCategory}
                  onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                  placeholder="e.g., WiFi, Check-in, Pool Hours..."
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium">Description/Answer</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter the FAQ answer..."
                  className="mt-1 w-full h-24 px-3 py-2 border rounded-md text-sm resize-y"
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleSave}
                  disabled={saving || !formData.subCategory.trim()}
                  className="flex-1"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : (editingFaq ? 'Update FAQ' : 'Add FAQ')}
                </Button>
                <Button variant="outline" onClick={closeModal} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Task Definitions Panel
// ============================================================================

function TaskDefinitionsPanel() {
  const [taskDefs, setTaskDefs] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTaskDef, setEditingTaskDef] = useState(null)
  const [formData, setFormData] = useState({
    subCategory: '',
    primaryCategory: 'Housekeeping',
    description: '',
    staffRequirements: '',
    guestRequirements: '',
    hostEscalation: '',
    staffId: '',
    staffName: '',
    staffPhone: ''
  })
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState('')

  useEffect(() => {
    loadProperties()
  }, [])

  useEffect(() => {
    if (selectedProperty) {
      loadTaskDefs()
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
    }
  }

  const loadTaskDefs = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/task-definitions`)
      const data = await response.json()
      setTaskDefs(data)
      setError(null)
    } catch (err) {
      console.error('Error loading task definitions:', err)
      setError('Failed to load task definitions')
    } finally {
      setLoading(false)
    }
  }

  const loadStaff = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/staff`)
      const data = await response.json()
      setStaff(data)
    } catch (err) {
      console.error('Error loading staff:', err)
    }
  }

  const openAddModal = () => {
    setEditingTaskDef(null)
    setFormData({
      subCategory: '',
      primaryCategory: 'Housekeeping',
      description: '',
      staffRequirements: '',
      guestRequirements: '',
      hostEscalation: '',
      staffId: '',
      staffName: '',
      staffPhone: ''
    })
    setShowModal(true)
  }

  const openEditModal = (taskDef) => {
    setEditingTaskDef(taskDef)
    setFormData({
      subCategory: taskDef.subCategory || '',
      primaryCategory: taskDef.details?.primaryCategory || 'Housekeeping',
      description: taskDef.details?.description || '',
      staffRequirements: taskDef.staffRequirements || '',
      guestRequirements: taskDef.guestRequirements || '',
      hostEscalation: taskDef.hostEscalation || '',
      staffId: taskDef.staffId || '',
      staffName: taskDef.staffName || '',
      staffPhone: taskDef.staffPhone || ''
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingTaskDef(null)
    setFormData({
      subCategory: '',
      primaryCategory: 'Housekeeping',
      description: '',
      staffRequirements: '',
      guestRequirements: '',
      hostEscalation: '',
      staffId: '',
      staffName: '',
      staffPhone: ''
    })
  }

  const handleStaffSelect = (staffId) => {
    const selectedStaff = staff.find(s => s.id === staffId)
    if (selectedStaff) {
      setFormData({
        ...formData,
        staffId: selectedStaff.id,
        staffName: selectedStaff.name,
        staffPhone: selectedStaff.phone
      })
    } else {
      setFormData({
        ...formData,
        staffId: '',
        staffName: '',
        staffPhone: ''
      })
    }
  }

  const handleSave = async () => {
    if (!formData.subCategory.trim()) return
    
    try {
      setSaving(true)
      const payload = {
        subCategory: formData.subCategory.trim(),
        primaryCategory: formData.primaryCategory,
        description: formData.description.trim() || null,
        staffRequirements: formData.staffRequirements.trim() || null,
        guestRequirements: formData.guestRequirements.trim() || null,
        hostEscalation: formData.hostEscalation.trim() || null,
        staffId: formData.staffId || null,
        staffName: formData.staffName || null,
        staffPhone: formData.staffPhone || null
      }
      
      if (editingTaskDef) {
        // Update existing
        const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/task-definitions/${editingTaskDef.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to update')
      } else {
        // Create new
        const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/task-definitions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to create')
      }
      
      await loadTaskDefs()
      closeModal()
    } catch (err) {
      console.error('Error saving task definition:', err)
      setError('Failed to save task definition')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (taskDef) => {
    if (!confirm(`Delete task definition "${taskDef.subCategory}"?`)) return
    
    try {
      const response = await fetch(`${API_BASE_URL}/properties/${selectedProperty}/task-definitions/${taskDef.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        await loadTaskDefs()
      }
    } catch (err) {
      console.error('Error deleting task definition:', err)
      setError('Failed to delete task definition')
    }
  }

  if (loading && !taskDefs.length) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
        <p className="mt-2 text-ink-500">Loading task definitions...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Property Selector and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <Label className="text-sm font-medium">Property:</Label>
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Task Definition
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Task Definitions</strong> are templates that define task categories and assign staff. 
          When a guest message triggers a task (e.g., "Can I get fresh towels?"), the system automatically 
          creates a task and notifies the assigned staff member.
        </p>
      </div>

      {/* Task Definitions List */}
      {taskDefs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-ink-500 mb-4" />
            <h3 className="text-lg font-medium text-ink-900 mb-2">No Task Definitions</h3>
            <p className="text-ink-500">
              Add task definitions to automate staff assignments when guests make requests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {taskDefs.map((taskDef) => (
            <Card key={taskDef.id}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold text-ink-900 text-lg">{taskDef.subCategory}</h4>
                      {taskDef.details?.primaryCategory && (
                        <Badge variant="outline">{taskDef.details.primaryCategory}</Badge>
                      )}
                    </div>
                    
                    {taskDef.details?.description && (
                      <p className="text-sm text-ink-500">{taskDef.details.description}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {taskDef.staffRequirements && (
                        <div className="bg-gray-50 p-3 rounded">
                          <span className="font-medium text-ink-900">Staff Requirements:</span>
                          <p className="text-ink-500 mt-1">{taskDef.staffRequirements}</p>
                        </div>
                      )}
                      {taskDef.guestRequirements && (
                        <div className="bg-gray-50 p-3 rounded">
                          <span className="font-medium text-ink-900">Guest Requirements:</span>
                          <p className="text-ink-500 mt-1">{taskDef.guestRequirements}</p>
                        </div>
                      )}
                      {taskDef.hostEscalation && (
                        <div className="bg-red-50 p-3 rounded md:col-span-2">
                          <span className="font-medium text-red-700">Host Escalation:</span>
                          <p className="text-red-600 mt-1">{taskDef.hostEscalation}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Staff Assignment */}
                  <div className="lg:w-64 bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-800">Assigned Staff</span>
                    </div>
                    {taskDef.staffName ? (
                      <div>
                        <p className="font-medium text-ink-900">{taskDef.staffName}</p>
                        <div className="flex items-center gap-1 text-sm text-ink-500 mt-1">
                          <Phone className="h-3 w-3" />
                          {taskDef.staffPhone?.replace('whatsapp:', '')}
                        </div>
                      </div>
                    ) : (
                      <p className="text-ink-500 text-sm">No staff assigned</p>
                    )}
                  </div>

                  <div className="flex gap-2 lg:flex-col">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 w-8 p-0"
                      onClick={() => openEditModal(taskDef)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(taskDef)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Task Definition Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-ink-900">
                {editingTaskDef ? 'Edit Task Definition' : 'Add Task Definition'}
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={closeModal}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Task Category *</Label>
                  <Input
                    value={formData.subCategory}
                    onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                    placeholder="e.g., Fresh Towels"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Primary Category</Label>
                  <select
                    value={formData.primaryCategory}
                    onChange={(e) => setFormData({ ...formData, primaryCategory: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Concierge">Concierge</option>
                    <option value="Security">Security</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Description</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe when this task is triggered..."
                  className="mt-1 w-full h-20 px-3 py-2 border rounded-md text-sm resize-y"
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Assign Staff Member</Label>
                <select
                  value={formData.staffId}
                  onChange={(e) => handleStaffSelect(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="">-- Select Staff --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone?.replace('whatsapp:', '')})
                    </option>
                  ))}
                </select>
                {formData.staffName && (
                  <p className="mt-2 text-sm text-green-600">
                    ✓ Will notify {formData.staffName} when this task is created
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="text-sm font-medium">Staff Requirements</Label>
                  <Input
                    value={formData.staffRequirements}
                    onChange={(e) => setFormData({ ...formData, staffRequirements: e.target.value })}
                    placeholder="What staff needs to confirm/do"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Guest Requirements</Label>
                  <Input
                    value={formData.guestRequirements}
                    onChange={(e) => setFormData({ ...formData, guestRequirements: e.target.value })}
                    placeholder="What info is needed from guest"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Host Escalation Criteria</Label>
                  <Input
                    value={formData.hostEscalation}
                    onChange={(e) => setFormData({ ...formData, hostEscalation: e.target.value })}
                    placeholder="When to escalate to host"
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  onClick={handleSave}
                  disabled={saving || !formData.subCategory.trim()}
                  className="flex-1"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : (editingTaskDef ? 'Update' : 'Add Task Definition')}
                </Button>
                <Button variant="outline" onClick={closeModal} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
