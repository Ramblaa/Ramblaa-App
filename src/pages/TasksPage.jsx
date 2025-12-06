import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, MapPin, User, Plus, Wrench, Brush, Search, Package, MessageCircle, Check, Trash2, Loader2, AlertCircle, Repeat, ExternalLink, Pencil, Pause, Play } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { tasksApi, propertiesApi } from '../lib/api'
import { format } from 'date-fns'

const statusColors = {
  pending: 'warning',
  'in-progress': 'default',
  completed: 'success',
  escalated: 'destructive',
}

const priorityColors = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
}

const typeIcons = {
  cleaning: Brush,
  maintenance: Wrench,
  inspection: Search,
  restocking: Package,
  other: MessageCircle,
}

export default function TasksPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [properties, setProperties] = useState([])
  const [propertyDetails, setPropertyDetails] = useState(null) // includes taskDefinitions, staff
  const [filter, setFilter] = useState('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recurringTemplates, setRecurringTemplates] = useState([])
  const [activeTab, setActiveTab] = useState('tasks') // 'tasks' | 'recurring'
  const [editingTemplate, setEditingTemplate] = useState(null) // template being edited
  const [deletingTemplateId, setDeletingTemplateId] = useState(null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const [newTask, setNewTask] = useState({
    propertyId: '',
    taskDefinitionId: '',
    title: '',
    taskBucket: '',
    description: '',
    staffId: '',
    staffName: '',
    staffPhone: '',
    bookingId: '',
    phone: '',
    repeatType: 'NONE', // NONE | DAILY | WEEKLY | MONTHLY | INTERVAL
    intervalDays: 90,
    startDate: today,
    endDate: '',
    timeOfDay: '09:00',
    maxOccurrences: '',
  })

  // Load tasks and properties on mount
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      
      const [tasksData, propertiesData, recurringData] = await Promise.all([
        tasksApi.getTasks({ limit: 100 }),
        propertiesApi.getProperties({ limit: 100 }),
        tasksApi.getRecurringTasks().catch(() => []),
      ])
      
      setTasks(tasksData)
      setProperties(propertiesData)
      setRecurringTemplates(recurringData || [])
      if (!newTask.propertyId && propertiesData?.length) {
        const firstId = propertiesData[0].id
        setNewTask(prev => ({ ...prev, propertyId: firstId }))
        await loadPropertyDetails(firstId)
      } else if (newTask.propertyId) {
        await loadPropertyDetails(newTask.propertyId)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load tasks')
      // Fall back to mock data
      setTasks(getMockTasks())
      setProperties([
        { id: '1', name: 'Sunset Villa' },
        { id: '2', name: 'Mountain Retreat' },
        { id: '3', name: 'Beach House' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTask = async () => {
      if (!newTask.propertyId || !newTask.title || !newTask.taskDefinitionId || !newTask.staffId) {
        alert('Please fill property, task definition, staff, and title')
      return
    }
    setSaving(true)
    try {
      if (newTask.repeatType === 'NONE') {
        await tasksApi.createTask({
          propertyId: newTask.propertyId,
          bookingId: newTask.bookingId || undefined,
          phone: newTask.phone || undefined,
          title: newTask.title,
          description: newTask.description,
          taskBucket: newTask.taskBucket || 'Other',
          staffId: newTask.staffId,
          staffName: newTask.staffName || undefined,
          staffPhone: newTask.staffPhone || undefined,
        })
      } else {
        await tasksApi.createRecurringTask({
          propertyId: newTask.propertyId,
          bookingId: newTask.bookingId || undefined,
          phone: newTask.phone || undefined,
          title: newTask.title,
          description: newTask.description,
          taskBucket: newTask.taskBucket || 'Other',
          staffId: newTask.staffId,
          staffName: newTask.staffName || undefined,
          staffPhone: newTask.staffPhone || undefined,
          repeatType: newTask.repeatType,
          intervalDays: newTask.intervalDays || 90,
          startDate: newTask.startDate,
          endDate: newTask.endDate || null,
          timeOfDay: newTask.timeOfDay || '09:00',
          maxOccurrences: newTask.maxOccurrences || null,
          createFirst: true,
        })
      }
      setShowAddModal(false)
      setNewTask(prev => ({ ...prev, title: '', description: '', taskBucket: '', repeatType: 'NONE' }))
      loadData()
    } catch (err) {
      console.error('Add task failed', err)
      alert(err.message || 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  const loadPropertyDetails = async (propertyId) => {
    if (!propertyId) return
    try {
      const details = await propertiesApi.getProperty(propertyId)
      setPropertyDetails(details)
    } catch (err) {
      console.error('Failed to load property details', err)
      setPropertyDetails(null)
    }
  }

  const handleEditTemplate = (template) => {
    // Load property details for the template's property
    loadPropertyDetails(template.propertyId)
    setEditingTemplate(template)
  }

  const handleSaveTemplateEdit = async () => {
    if (!editingTemplate) return
    setSaving(true)
    try {
      await tasksApi.updateRecurringTask(editingTemplate.id, {
        title: editingTemplate.title,
        description: editingTemplate.description,
        taskBucket: editingTemplate.taskBucket,
        repeatType: editingTemplate.repeatType,
        intervalDays: editingTemplate.intervalDays,
        timeOfDay: editingTemplate.timeOfDay,
        isActive: editingTemplate.isActive,
      })
      setEditingTemplate(null)
      loadData()
    } catch (err) {
      console.error('Failed to update template', err)
      alert(err.message || 'Failed to update template')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Are you sure you want to delete this recurring template? Existing task instances will remain.')) {
      return
    }
    setDeletingTemplateId(templateId)
    try {
      await tasksApi.deleteRecurringTask(templateId)
      loadData()
    } catch (err) {
      console.error('Failed to delete template', err)
      alert(err.message || 'Failed to delete template')
    } finally {
      setDeletingTemplateId(null)
    }
  }

  const handleToggleTemplateActive = async (template) => {
    try {
      await tasksApi.updateRecurringTask(template.id, {
        isActive: !template.isActive,
      })
      loadData()
    } catch (err) {
      console.error('Failed to toggle template', err)
      alert(err.message || 'Failed to update template')
    }
  }

  const filteredTasks = tasks.filter(task => {
    // Status filter
    const statusMatch = filter === 'all' || 
      (filter === 'upcoming' && task.status !== 'completed') ||
      (filter === 'completed' && task.status === 'completed') ||
      task.status === filter

    // Property filter
    const propertyMatch = propertyFilter === 'all' || task.property === propertyFilter || task.propertyId === propertyFilter

    // Search filter
    const searchMatch = !searchTerm.trim() || 
      task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.property?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.assignee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.type?.toLowerCase().includes(searchTerm.toLowerCase())

    return statusMatch && propertyMatch && searchMatch
  })

  const getTaskCounts = (property = 'all') => {
    const tasksToCount = property === 'all' ? tasks : tasks.filter(t => t.property === property || t.propertyId === property)
    return {
      pending: tasksToCount.filter(t => t.status === 'pending').length,
      inProgress: tasksToCount.filter(t => t.status === 'in-progress').length,
      completed: tasksToCount.filter(t => t.status === 'completed').length,
      highPriority: tasksToCount.filter(t => t.priority === 'high').length,
    }
  }

  const counts = getTaskCounts(propertyFilter)

  const handleMarkComplete = async (e, taskId) => {
    e.stopPropagation()
    try {
      await tasksApi.completeTask(taskId)
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, status: 'completed' } : t
      ))
    } catch (err) {
      console.error('Failed to complete task:', err)
    }
  }

  const handleDeleteTask = async (e, taskId) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this task?')) return
    
    try {
      await tasksApi.deleteTask(taskId)
      // Update local state
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Tasks</h1>
          <p className="text-ink-500">Manage cleaning, maintenance, and property tasks</p>
        </div>
        <Button className="sm:w-auto" onClick={() => setShowAddModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      {/* Tabs: Tasks vs Recurring Templates */}
      <div className="flex gap-2 border-b border-ink-200">
        <button
          onClick={() => setActiveTab('tasks')}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === 'tasks'
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-ink-500 hover:text-ink-900"
          )}
        >
          Tasks
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-ink-100 text-ink-600">{tasks.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1",
            activeTab === 'recurring'
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-ink-500 hover:text-ink-900"
          )}
        >
          <Repeat className="h-4 w-4" />
          Recurring Templates
          <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-ink-100 text-ink-600">{recurringTemplates.length}</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadData}>Retry</Button>
        </div>
      )}

      {activeTab === 'tasks' && (
      <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Status Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All Tasks', count: tasks.length },
            { key: 'upcoming', label: 'Upcoming', count: tasks.filter(t => t.status !== 'completed').length },
            { key: 'pending', label: 'Pending', count: counts.pending },
            { key: 'in-progress', label: 'In Progress', count: counts.inProgress },
            { key: 'completed', label: 'Completed', count: counts.completed }
          ].map((filterOption) => (
            <Button
              key={filterOption.key}
              variant={filter === filterOption.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(filterOption.key)}
              className="capitalize"
            >
              {filterOption.label}
              <Badge 
                variant="secondary" 
                className={cn(
                  "ml-2 text-xs pointer-events-none",
                  filter === filterOption.key 
                    ? "bg-white/20 text-white" 
                    : "bg-ink-500/10 text-ink-500"
                )}
              >
                {filterOption.count}
              </Badge>
            </Button>
          ))}
        </div>

        <div className="flex gap-4">
          {/* Property Filter */}
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-ink-500" />
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="h-9 w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
            >
              <option value="all">All Properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-ink-500" />
            <Input 
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        {filteredTasks.map((task, index) => {
          const IconComponent = typeIcons[task.type] || typeIcons.other
          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className={cn(
                  "transition-all hover:shadow-md cursor-pointer",
                  task.status === 'completed' ? 'opacity-75' : ''
                )}
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                          <IconComponent className="h-4 w-4 text-brand-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-ink-900">{task.title}</h3>
                          {task.subtitle && (
                            <p className="text-xs text-ink-500">{task.subtitle}</p>
                          )}
                          <p className="text-sm text-ink-500 mt-1">{task.description}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-ink-500">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{task.property}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>{task.assignee}</span>
                        </div>
                        {task.dueDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>{task.dueDate} {task.dueTime ? `at ${task.dueTime}` : ''}</span>
                          </div>
                        )}
                        {task.threadCount > 0 && (
                          <div className="flex items-center gap-1">
                            <MessageCircle className="h-4 w-4" />
                            <span>{task.threadCount} thread{task.threadCount !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:items-end gap-2">
                      <div className="flex gap-2">
                        <Badge variant={statusColors[task.status] || 'secondary'}>
                          {task.status?.replace('-', ' ')}
                        </Badge>
                        <Badge variant={priorityColors[task.priority] || 'secondary'}>
                          {task.priority} priority
                        </Badge>
                        {task.isFromRecurring && (
                          <Badge variant="info" className="flex items-center gap-1">
                            <Repeat className="h-3 w-3" />
                            From Template
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {task.status !== 'completed' && (
                          <Button 
                            size="icon" 
                            variant="outline"
                            onClick={(e) => handleMarkComplete(e, task.id)}
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="icon" 
                          variant="outline"
                          onClick={(e) => handleDeleteTask(e, task.id)}
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-12">
          <Clock className="mx-auto h-12 w-12 text-ink-500 mb-4" />
          <h3 className="text-lg font-medium text-ink-900 mb-2">No tasks found</h3>
          <p className="text-ink-500">
            {searchTerm ? `No results for "${searchTerm}"` : 'Try adjusting your filters or create a new task.'}
          </p>
        </div>
      )}
      </>
      )}

      {activeTab === 'recurring' && (
        <div className="space-y-4">
          {recurringTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Repeat className="mx-auto h-12 w-12 text-ink-400 mb-4" />
              <h3 className="text-lg font-medium text-ink-900 mb-2">No recurring task templates</h3>
              <p className="text-ink-500 mb-4">Create a recurring task to have it repeat automatically.</p>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Recurring Task
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {recurringTemplates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Repeat className="h-5 w-5 text-brand-600" />
                          <h3 className="font-semibold text-ink-900">{template.title}</h3>
                        </div>
                        <p className="text-sm text-ink-500">{template.description}</p>
                        <div className="flex flex-wrap gap-3 text-sm text-ink-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {template.repeatType === 'DAILY' && 'Every day'}
                            {template.repeatType === 'WEEKLY' && 'Every week'}
                            {template.repeatType === 'MONTHLY' && 'Every month'}
                            {template.repeatType === 'INTERVAL' && `Every ${template.intervalDays} days`}
                          </span>
                          {template.timeOfDay && (
                            <span>at {template.timeOfDay}</span>
                          )}
                          {template.staffName && (
                            <span className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              {template.staffName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:items-end gap-2">
                        <div className="flex gap-2">
                          <Badge variant={template.isActive ? 'success' : 'secondary'}>
                            {template.isActive ? 'Active' : 'Paused'}
                          </Badge>
                          <Badge variant="outline">
                            {template.occurrencesCreated || 0} created
                          </Badge>
                        </div>
                        <p className="text-xs text-ink-400">
                          Next: {template.nextRunAt ? format(new Date(template.nextRunAt), 'MMM d, yyyy') : 'N/A'}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditTemplate(template)}
                            className="h-8"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleTemplateActive(template)}
                            className={cn("h-8", template.isActive ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700")}
                          >
                            {template.isActive ? (
                              <>
                                <Pause className="h-3 w-3 mr-1" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                Resume
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteTemplate(template.id)}
                            disabled={deletingTemplateId === template.id}
                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {deletingTemplateId === template.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-ink-900">Add Task</h2>
                <p className="text-sm text-ink-500">One-off or recurring task</p>
              </div>
              <Button variant="ghost" onClick={() => setShowAddModal(false)}>Close</Button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink-800">Property *</label>
                  <select
                    value={newTask.propertyId}
                    onChange={(e) => setNewTask(prev => ({ ...prev, propertyId: e.target.value }))}
                    className="h-10 w-full rounded-md border border-ink-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-ink-800">Task Definition *</label>
                    <select
                      value={newTask.taskDefinitionId}
                      onChange={(e) => {
                        const selectedId = e.target.value
                        const def = propertyDetails?.taskDefinitions?.find((d) => String(d.id) === String(selectedId))
                        setNewTask(prev => ({
                          ...prev,
                          taskDefinitionId: selectedId,
                          taskBucket: def?.subCategory || prev.taskBucket,
                          description: def ? (prev.description || def.staffRequirements || def.guestRequirements || '') : prev.description,
                        }))
                      }}
                      className="h-10 w-full rounded-md border border-ink-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                    >
                      <option value="">Select definition</option>
                      {propertyDetails?.taskDefinitions?.map((d) => (
                        <option key={d.id} value={d.id}>{d.subCategory}</option>
                      ))}
                    </select>
                    {!propertyDetails?.taskDefinitions?.length && (
                      <p className="text-xs text-amber-600">
                        No task definitions. <a className="underline" href="/resources" target="_blank" rel="noreferrer">Open Resources</a> to add one.
                      </p>
                    )}
                  </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink-800">Category</label>
                  <Input
                    value={newTask.taskBucket}
                    onChange={(e) => setNewTask(prev => ({ ...prev, taskBucket: e.target.value }))}
                    placeholder="Cleaning, Maintenance, Other..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-800">Title *</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., AC filter cleaning"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-800">Description / Instructions</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full h-24 px-3 py-2 border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                  placeholder="Describe what needs to be done..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink-800">Staff *</label>
                  <select
                    value={newTask.staffId}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      const staff = propertyDetails?.staff?.find((s) => String(s.id) === String(selectedId))
                      setNewTask(prev => ({
                        ...prev,
                        staffId: selectedId,
                        staffName: staff?.name || '',
                        staffPhone: staff?.phone || '',
                      }))
                    }}
                    className="h-10 w-full rounded-md border border-ink-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                  >
                    <option value="">Select staff</option>
                    {propertyDetails?.staff?.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.role ? `(${s.role})` : ''}</option>
                    ))}
                  </select>
                  {!propertyDetails?.staff?.length && (
                    <p className="text-xs text-amber-600">
                      No staff for this property. <a className="underline" href="/resources" target="_blank" rel="noreferrer">Open Resources</a> to add staff.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink-800">Guest phone (optional)</label>
                  <Input
                    value={newTask.phone}
                    onChange={(e) => setNewTask(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+1..."
                  />
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink-900">Repeat</p>
                    <p className="text-sm text-ink-500">Create recurring tasks automatically</p>
                  </div>
                  <select
                    value={newTask.repeatType}
                    onChange={(e) => setNewTask(prev => ({ ...prev, repeatType: e.target.value }))}
                    className="h-10 rounded-md border border-ink-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                  >
                    <option value="NONE">None (one-off)</option>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="INTERVAL">Every N days</option>
                  </select>
                </div>

                {newTask.repeatType !== 'NONE' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-ink-800">Start date</label>
                      <Input
                        type="date"
                        value={newTask.startDate}
                        onChange={(e) => setNewTask(prev => ({ ...prev, startDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-ink-800">Time of day</label>
                      <Input
                        type="time"
                        value={newTask.timeOfDay}
                        onChange={(e) => setNewTask(prev => ({ ...prev, timeOfDay: e.target.value }))}
                      />
                    </div>
                    {newTask.repeatType === 'INTERVAL' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink-800">Every N days</label>
                        <Input
                          type="number"
                          min="1"
                          value={newTask.intervalDays}
                          onChange={(e) => setNewTask(prev => ({ ...prev, intervalDays: Number(e.target.value || 1) }))}
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-ink-800">End date (optional)</label>
                      <Input
                        type="date"
                        value={newTask.endDate}
                        onChange={(e) => setNewTask(prev => ({ ...prev, endDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-ink-800">Max occurrences (optional)</label>
                      <Input
                        type="number"
                        min="1"
                        value={newTask.maxOccurrences}
                        onChange={(e) => setNewTask(prev => ({ ...prev, maxOccurrences: e.target.value }))}
                        placeholder="e.g., 10"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-ink-50 flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleSaveTask} disabled={saving}>
                {saving ? 'Saving...' : 'Save Task'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Recurring Template Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-xl font-semibold text-ink-900">Edit Recurring Template</h2>
                <p className="text-sm text-ink-500">{editingTemplate.propertyName}</p>
              </div>
              <Button variant="ghost" onClick={() => setEditingTemplate(null)}>Close</Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-800">Title</label>
                <Input
                  value={editingTemplate.title}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-800">Description</label>
                <Input
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-800">Category</label>
                <Input
                  value={editingTemplate.taskBucket || ''}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, taskBucket: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink-800">Repeat</label>
                  <select
                    value={editingTemplate.repeatType}
                    onChange={(e) => setEditingTemplate(prev => ({ ...prev, repeatType: e.target.value }))}
                    className="h-10 w-full rounded-md border border-ink-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="INTERVAL">Every N days</option>
                  </select>
                </div>
                {editingTemplate.repeatType === 'INTERVAL' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-ink-800">Every N days</label>
                    <Input
                      type="number"
                      min="1"
                      value={editingTemplate.intervalDays}
                      onChange={(e) => setEditingTemplate(prev => ({ ...prev, intervalDays: Number(e.target.value || 1) }))}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-800">Time of day</label>
                <Input
                  type="time"
                  value={editingTemplate.timeOfDay || '09:00'}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, timeOfDay: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="templateActive"
                  checked={editingTemplate.isActive}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-600"
                />
                <label htmlFor="templateActive" className="text-sm text-ink-700">Active (will create new tasks)</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-ink-50 flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditingTemplate(null)}>Cancel</Button>
              <Button onClick={handleSaveTemplateEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Mock data fallback
function getMockTasks() {
  return [
    {
      id: '1',
      title: 'Deliver fresh towels - Room 12',
      type: 'cleaning',
      property: 'Sunset Villa',
      assignee: 'Maria Garcia',
      dueDate: '2024-01-15',
      dueTime: '11:00 AM',
      status: 'pending',
      priority: 'high',
      description: 'Guest requested fresh towels for the bathroom.',
      threadCount: 3
    },
    {
      id: '2',
      title: 'WiFi troubleshooting - Mountain Retreat',
      type: 'maintenance',
      property: 'Mountain Retreat',
      assignee: 'John Smith',
      dueDate: '2024-01-15',
      dueTime: '2:00 PM',
      status: 'in-progress',
      priority: 'medium',
      description: 'Guest reported WiFi password issues.',
      threadCount: 2
    },
    {
      id: '3',
      title: 'Fix dripping bathroom faucet - Beach House',
      type: 'maintenance',
      property: 'Beach House',
      assignee: 'John Smith',
      dueDate: '2024-01-16',
      dueTime: '10:00 AM',
      status: 'pending',
      priority: 'medium',
      description: 'Guest reported dripping faucet in bathroom.',
      threadCount: 1
    },
    {
      id: '4',
      title: 'Post-checkout inspection - Beach House',
      type: 'inspection',
      property: 'Beach House',
      assignee: 'Sarah Wilson',
      dueDate: '2024-01-16',
      dueTime: '2:00 PM',
      status: 'pending',
      priority: 'low',
      description: 'Routine post-checkout property inspection.',
      threadCount: 1
    },
    {
      id: '5',
      title: 'Restocking - Sunset Villa',
      type: 'restocking',
      property: 'Sunset Villa',
      assignee: 'David Lee',
      dueDate: '2024-01-13',
      dueTime: '1:00 PM',
      status: 'completed',
      priority: 'low',
      description: 'Restock toiletries and kitchen essentials.',
      threadCount: 1
    },
  ]
}
