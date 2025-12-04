import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, MapPin, User, Plus, Wrench, Brush, Search, Package, MessageCircle, Check, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { tasksApi, propertiesApi } from '../lib/api'

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
  const [filter, setFilter] = useState('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load tasks and properties on mount
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      
      const [tasksData, propertiesData] = await Promise.all([
        tasksApi.getTasks({ limit: 100 }),
        propertiesApi.getProperties({ limit: 100 }),
      ])
      
      setTasks(tasksData)
      setProperties(propertiesData)
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
        <Loader2 className="h-8 w-8 animate-spin text-brand-purple" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Tasks</h1>
          <p className="text-brand-mid-gray">Manage cleaning, maintenance, and property tasks</p>
        </div>
        <Button className="sm:w-auto" onClick={() => navigate('/tasks/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadData}>Retry</Button>
        </div>
      )}

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
                    : "bg-brand-mid-gray/10 text-brand-mid-gray"
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
            <MapPin className="h-4 w-4 text-brand-mid-gray" />
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="h-9 w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2"
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
            <Search className="h-4 w-4 text-brand-mid-gray" />
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
                        <div className="w-8 h-8 bg-brand-vanilla rounded-full flex items-center justify-center">
                          <IconComponent className="h-4 w-4 text-brand-purple" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-brand-dark">{task.title}</h3>
                          <p className="text-sm text-brand-mid-gray mt-1">{task.description}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-brand-mid-gray">
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
          <Clock className="mx-auto h-12 w-12 text-brand-mid-gray mb-4" />
          <h3 className="text-lg font-medium text-brand-dark mb-2">No tasks found</h3>
          <p className="text-brand-mid-gray">
            {searchTerm ? `No results for "${searchTerm}"` : 'Try adjusting your filters or create a new task.'}
          </p>
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
