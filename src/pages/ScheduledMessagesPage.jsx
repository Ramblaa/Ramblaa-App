import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Clock, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Check, 
  Calendar,
  MessageSquare,
  Send,
  AlertCircle,
  RefreshCw,
  Play,
  Pause
} from 'lucide-react'
import { cn } from '../lib/utils'
import apiService from '../services/api'

const TRIGGER_TYPE_LABELS = {
  ON_BOOKING_CREATED: 'On Booking Created',
  DAYS_BEFORE_CHECKIN: 'Days Before Check-in',
  ON_CHECKIN_DATE: 'On Check-in Date',
  DAYS_AFTER_CHECKIN: 'Days After Check-in',
  ON_CHECKOUT_DATE: 'On Check-out Date',
  DAYS_AFTER_CHECKOUT: 'Days After Check-out',
}

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

export default function ScheduledMessagesPage() {
  const [activeTab, setActiveTab] = useState('schedules')
  const [templates, setTemplates] = useState([])
  const [rules, setRules] = useState([])
  const [scheduledMessages, setScheduledMessages] = useState([])
  const [properties, setProperties] = useState([])
  const [stats, setStats] = useState(null)
  const [triggerTypes, setTriggerTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Combined modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null) // { template, rule }
  const [saving, setSaving] = useState(false)
  
  // Combined form state (template + rule in one)
  const [scheduleForm, setScheduleForm] = useState({
    // Template fields
    propertyId: '',
    templateName: '',
    contentSid: '',
    // Rule fields
    ruleName: '',
    triggerType: 'ON_BOOKING_CREATED',
    triggerOffsetDays: 0,
    triggerTime: '09:00',
  })

  // Fetch data
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const propsRes = await apiService.request('/properties')
      setProperties(propsRes || [])
      
      const results = await Promise.allSettled([
        apiService.request('/scheduled/templates'),
        apiService.request('/scheduled/rules'),
        apiService.request('/scheduled/messages?limit=50'),
        apiService.request('/scheduled/stats'),
        apiService.request('/scheduled/trigger-types'),
      ])
      
      if (results[0].status === 'fulfilled') setTemplates(results[0].value || [])
      if (results[1].status === 'fulfilled') setRules(results[1].value || [])
      if (results[2].status === 'fulfilled') setScheduledMessages(results[2].value || [])
      if (results[3].status === 'fulfilled') setStats(results[3].value)
      if (results[4].status === 'fulfilled') setTriggerTypes(results[4].value || [])
      
      setError(null)
    } catch (err) {
      console.error('[ScheduledMessages] Fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Combine templates with their rules for display
  const getSchedulesWithRules = () => {
    return rules.map(rule => {
      const template = templates.find(t => t.id === rule.templateId)
      return {
        ...rule,
        template,
        templateName: template?.name || rule.templateName,
        contentSid: template?.contentSid,
      }
    })
  }

  // Create new schedule (template + rule in one flow)
  const handleCreateSchedule = async () => {
    try {
      setSaving(true)
      
      // Step 1: Create template
      const newTemplate = await apiService.request('/scheduled/templates', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: scheduleForm.propertyId,
          name: scheduleForm.templateName,
          contentSid: scheduleForm.contentSid,
          variablesSchema: ['1', '2', '3', '4', '5'],
        }),
      })
      
      // Step 2: Create rule linked to template
      await apiService.request('/scheduled/rules', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: scheduleForm.propertyId,
          templateId: newTemplate.id,
          name: scheduleForm.ruleName || `${scheduleForm.templateName} - ${TRIGGER_TYPE_LABELS[scheduleForm.triggerType]}`,
          triggerType: scheduleForm.triggerType,
          triggerOffsetDays: scheduleForm.triggerOffsetDays,
          triggerTime: scheduleForm.triggerTime,
        }),
      })
      
      setShowScheduleModal(false)
      resetForm()
      fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Update existing schedule
  const handleUpdateSchedule = async () => {
    try {
      setSaving(true)
      
      // Update template
      if (editingSchedule.template) {
        await apiService.request(`/scheduled/templates/${editingSchedule.template.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: scheduleForm.templateName,
            contentSid: scheduleForm.contentSid,
          }),
        })
      }
      
      // Update rule
      await apiService.request(`/scheduled/rules/${editingSchedule.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: scheduleForm.ruleName,
          triggerType: scheduleForm.triggerType,
          triggerOffsetDays: scheduleForm.triggerOffsetDays,
          triggerTime: scheduleForm.triggerTime,
        }),
      })
      
      setShowScheduleModal(false)
      setEditingSchedule(null)
      resetForm()
      fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSchedule = async (schedule) => {
    if (!confirm(`Delete "${schedule.name}"?\n\nThis will also delete the associated template.`)) return
    try {
      // Delete rule first
      await apiService.request(`/scheduled/rules/${schedule.id}`, { method: 'DELETE' })
      // Delete template
      if (schedule.templateId) {
        await apiService.request(`/scheduled/templates/${schedule.templateId}`, { method: 'DELETE' })
      }
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleSchedule = async (schedule) => {
    try {
      await apiService.request(`/scheduled/rules/${schedule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !schedule.isActive }),
      })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCancelMessage = async (id) => {
    try {
      await apiService.request(`/scheduled/messages/${id}/cancel`, { method: 'POST' })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleProcessNow = async () => {
    try {
      const result = await apiService.request('/scheduled/process', { method: 'POST' })
      alert(`Processed: ${result.sent} sent, ${result.failed} failed`)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRetryFailed = async () => {
    try {
      const result = await apiService.request('/scheduled/retry-failed', { method: 'POST' })
      alert(`Reset ${result.reset} failed messages for retry`)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => {
    setScheduleForm({
      propertyId: '',
      templateName: '',
      contentSid: '',
      ruleName: '',
      triggerType: 'ON_BOOKING_CREATED',
      triggerOffsetDays: 0,
      triggerTime: '09:00',
    })
  }

  const openEditSchedule = (schedule) => {
    setEditingSchedule(schedule)
    setScheduleForm({
      propertyId: schedule.propertyId,
      templateName: schedule.template?.name || schedule.templateName || '',
      contentSid: schedule.template?.contentSid || schedule.contentSid || '',
      ruleName: schedule.name,
      triggerType: schedule.triggerType,
      triggerOffsetDays: schedule.triggerOffsetDays || 0,
      triggerTime: schedule.triggerTime?.slice(0, 5) || '09:00',
    })
    setShowScheduleModal(true)
  }

  const openNewSchedule = () => {
    setEditingSchedule(null)
    resetForm()
    setShowScheduleModal(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  const schedules = getSchedulesWithRules()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Scheduled Messages</h1>
          <p className="text-ink-500 mt-1">
            Automate guest communications at key moments in their stay
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2 text-ink-500 hover:text-ink-900 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          {activeTab === 'schedules' && (
            <button
              onClick={openNewSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-600/90"
            >
              <Plus className="w-4 h-4" />
              New Schedule
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink-900">{stats.byStatus?.pending || 0}</p>
                <p className="text-sm text-ink-500">Pending</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink-900">{stats.byStatus?.sent || 0}</p>
                <p className="text-sm text-ink-500">Sent</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink-900">{stats.byStatus?.failed || 0}</p>
                <p className="text-sm text-ink-500">Failed</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink-900">{stats.upcomingNext24Hours || 0}</p>
                <p className="text-sm text-ink-500">Next 24h</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {['schedules', 'queue'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-3 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-ink-500 hover:text-ink-900"
              )}
            >
              {tab === 'queue' ? 'Message Queue' : 'Scheduled Messages'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'schedules' && (
          <motion.div
            key="schedules"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {schedules.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <Calendar className="w-12 h-12 text-ink-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-ink-900 mb-2">No Scheduled Messages Yet</h3>
                <p className="text-ink-500 mb-4">
                  Create your first scheduled message to automate guest communications
                </p>
                <button
                  onClick={openNewSchedule}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-600/90"
                >
                  Create Schedule
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {schedules.map((schedule) => (
                  <div 
                    key={schedule.id}
                    className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-ink-900">{schedule.templateName || schedule.name}</h3>
                          <span className={cn(
                            "px-2 py-0.5 text-xs rounded-full",
                            schedule.isActive 
                              ? "bg-green-100 text-green-700" 
                              : "bg-gray-100 text-gray-600"
                          )}>
                            {schedule.isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        
                        <p className="text-sm text-ink-500">
                          Property: {schedule.propertyName}
                        </p>
                        
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="px-2 py-1 bg-brand-600/10 text-brand-600 rounded">
                            {TRIGGER_TYPE_LABELS[schedule.triggerType] || schedule.triggerType}
                          </span>
                          {schedule.triggerOffsetDays !== 0 && (
                            <span className="text-ink-500">
                              {Math.abs(schedule.triggerOffsetDays)} day(s)
                            </span>
                          )}
                          {schedule.triggerType !== 'ON_BOOKING_CREATED' && (
                            <span className="text-ink-500">
                              at {schedule.triggerTime?.slice(0, 5) || '09:00'}
                            </span>
                          )}
                        </div>
                        
                        {schedule.contentSid && (
                          <p className="text-xs text-ink-500 mt-2 font-mono">
                            ContentSid: {schedule.contentSid}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleSchedule(schedule)}
                          className={cn(
                            "p-2 rounded-lg",
                            schedule.isActive
                              ? "text-green-600 hover:bg-green-50"
                              : "text-gray-400 hover:bg-gray-100"
                          )}
                          title={schedule.isActive ? 'Pause schedule' : 'Activate schedule'}
                        >
                          {schedule.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => openEditSchedule(schedule)}
                          className="p-2 text-ink-500 hover:text-ink-900 rounded-lg hover:bg-gray-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(schedule)}
                          className="p-2 text-ink-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'queue' && (
          <motion.div
            key="queue"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-ink-900">Message Queue</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetryFailed}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Retry Failed
                </button>
                <button
                  onClick={handleProcessNow}
                  className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-600/90"
                >
                  Process Now
                </button>
              </div>
            </div>
            
            {scheduledMessages.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <Clock className="w-12 h-12 text-ink-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-ink-900 mb-2">No Scheduled Messages</h3>
                <p className="text-ink-500">
                  Messages will appear here when bookings trigger your schedules
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium text-ink-500">Guest</th>
                      <th className="text-left p-3 text-sm font-medium text-ink-500">Schedule</th>
                      <th className="text-left p-3 text-sm font-medium text-ink-500">Scheduled For</th>
                      <th className="text-left p-3 text-sm font-medium text-ink-500">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-ink-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledMessages.map((msg) => (
                      <tr key={msg.id} className="border-b border-gray-50 last:border-0">
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-ink-900">{msg.guestName}</p>
                            <p className="text-xs text-ink-500">{msg.toNumber}</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="text-sm text-ink-900">{msg.templateName}</p>
                            <p className="text-xs text-ink-500">{msg.ruleName}</p>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-ink-500">
                          {new Date(msg.scheduledFor).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full capitalize",
                            STATUS_STYLES[msg.status] || 'bg-gray-100'
                          )}>
                            {msg.status}
                          </span>
                          {msg.errorMessage && (
                            <p className="text-xs text-red-500 mt-1" title={msg.errorMessage}>
                              {msg.errorMessage.slice(0, 30)}...
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          {msg.status === 'pending' && (
                            <button
                              onClick={() => handleCancelMessage(msg.id)}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Combined Schedule Modal (Template + Rule) */}
      <AnimatePresence>
        {showScheduleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowScheduleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-ink-900">
                  {editingSchedule ? 'Edit Schedule' : 'New Scheduled Message'}
                </h2>
                <button onClick={() => setShowScheduleModal(false)}>
                  <X className="w-5 h-5 text-ink-500" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Template Section */}
                <div className="pb-4 border-b border-gray-100">
                  <h3 className="text-sm font-medium text-ink-500 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Message Template
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-900 mb-1">
                        Property *
                      </label>
                      <select
                        value={scheduleForm.propertyId}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, propertyId: e.target.value })}
                        className="w-full p-2 border border-gray-200 rounded-lg"
                        disabled={!!editingSchedule}
                      >
                        <option value="">Select Property</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-ink-900 mb-1">
                        Template Name *
                      </label>
                      <input
                        type="text"
                        value={scheduleForm.templateName}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, templateName: e.target.value })}
                        placeholder="e.g., Welcome Message"
                        className="w-full p-2 border border-gray-200 rounded-lg"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-ink-900 mb-1">
                        Twilio ContentSid *
                      </label>
                      <input
                        type="text"
                        value={scheduleForm.contentSid}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, contentSid: e.target.value })}
                        placeholder="e.g., HXb0d05c2f5155d181350d93c41235da1d"
                        className="w-full p-2 border border-gray-200 rounded-lg font-mono text-sm"
                      />
                      <p className="text-xs text-ink-500 mt-1">
                        Get this from your Twilio Content Templates
                      </p>
                    </div>
                  </div>
                </div>

                {/* Schedule Section */}
                <div>
                  <h3 className="text-sm font-medium text-ink-500 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Schedule Trigger
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-900 mb-1">
                        When to Send *
                      </label>
                      <select
                        value={scheduleForm.triggerType}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, triggerType: e.target.value })}
                        className="w-full p-2 border border-gray-200 rounded-lg"
                      >
                        {triggerTypes.length > 0 ? (
                          triggerTypes.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.description}
                            </option>
                          ))
                        ) : (
                          Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    
                    {scheduleForm.triggerType !== 'ON_BOOKING_CREATED' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-ink-900 mb-1">
                              Days Offset
                            </label>
                            <input
                              type="number"
                              value={scheduleForm.triggerOffsetDays}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, triggerOffsetDays: parseInt(e.target.value) || 0 })}
                              className="w-full p-2 border border-gray-200 rounded-lg"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-ink-900 mb-1">
                              Time of Day
                            </label>
                            <input
                              type="time"
                              value={scheduleForm.triggerTime}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, triggerTime: e.target.value })}
                              className="w-full p-2 border border-gray-200 rounded-lg"
                            />
                          </div>
                        </div>
                        </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 text-ink-500 hover:text-ink-900"
                >
                  Cancel
                </button>
                <button
                  onClick={editingSchedule ? handleUpdateSchedule : handleCreateSchedule}
                  disabled={!scheduleForm.propertyId || !scheduleForm.templateName || !scheduleForm.contentSid || saving}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-600/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                  )}
                  {editingSchedule ? 'Update' : 'Create Schedule'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
