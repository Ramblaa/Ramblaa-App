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
  ChevronDown,
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
  const [activeTab, setActiveTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [rules, setRules] = useState([])
  const [scheduledMessages, setScheduledMessages] = useState([])
  const [properties, setProperties] = useState([])
  const [stats, setStats] = useState(null)
  const [triggerTypes, setTriggerTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editingRule, setEditingRule] = useState(null)
  
  // Form states
  const [templateForm, setTemplateForm] = useState({
    propertyId: '',
    name: '',
    contentSid: '',
    fallbackBody: '',
    variablesSchema: [],
  })
  
  const [ruleForm, setRuleForm] = useState({
    propertyId: '',
    templateId: '',
    name: '',
    triggerType: 'ON_BOOKING_CREATED',
    triggerOffsetDays: 0,
    triggerTime: '09:00',
    minStayNights: null,
    priority: 100,
  })

  // Fetch data
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [templatesRes, rulesRes, messagesRes, propsRes, statsRes, triggersRes] = await Promise.all([
        apiService.request('/api/scheduled/templates'),
        apiService.request('/api/scheduled/rules'),
        apiService.request('/api/scheduled/messages?limit=50'),
        apiService.request('/api/properties'),
        apiService.request('/api/scheduled/stats'),
        apiService.request('/api/scheduled/trigger-types'),
      ])
      
      setTemplates(templatesRes)
      setRules(rulesRes)
      setScheduledMessages(messagesRes)
      setProperties(propsRes)
      setStats(statsRes)
      setTriggerTypes(triggersRes)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Template CRUD
  const handleCreateTemplate = async () => {
    try {
      await apiService.request('/api/scheduled/templates', {
        method: 'POST',
        body: JSON.stringify({
          ...templateForm,
          variablesSchema: templateForm.variablesSchema.length > 0 
            ? templateForm.variablesSchema 
            : ['1', '2', '3', '4', '5'],
        }),
      })
      setShowTemplateModal(false)
      resetTemplateForm()
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpdateTemplate = async () => {
    try {
      await apiService.request(`/api/scheduled/templates/${editingTemplate.id}`, {
        method: 'PUT',
        body: JSON.stringify(templateForm),
      })
      setShowTemplateModal(false)
      setEditingTemplate(null)
      resetTemplateForm()
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    try {
      await apiService.request(`/api/scheduled/templates/${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  // Rule CRUD
  const handleCreateRule = async () => {
    try {
      await apiService.request('/api/scheduled/rules', {
        method: 'POST',
        body: JSON.stringify(ruleForm),
      })
      setShowRuleModal(false)
      resetRuleForm()
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpdateRule = async () => {
    try {
      await apiService.request(`/api/scheduled/rules/${editingRule.id}`, {
        method: 'PUT',
        body: JSON.stringify(ruleForm),
      })
      setShowRuleModal(false)
      setEditingRule(null)
      resetRuleForm()
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteRule = async (id) => {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      await apiService.request(`/api/scheduled/rules/${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleRule = async (rule) => {
    try {
      await apiService.request(`/api/scheduled/rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !rule.isActive }),
      })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  // Scheduled message actions
  const handleCancelMessage = async (id) => {
    try {
      await apiService.request(`/api/scheduled/messages/${id}/cancel`, { method: 'POST' })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleProcessNow = async () => {
    try {
      const result = await apiService.request('/api/scheduled/process', { method: 'POST' })
      alert(`Processed: ${result.sent} sent, ${result.failed} failed`)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRetryFailed = async () => {
    try {
      const result = await apiService.request('/api/scheduled/retry-failed', { method: 'POST' })
      alert(`Reset ${result.reset} failed messages for retry`)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  // Form helpers
  const resetTemplateForm = () => {
    setTemplateForm({
      propertyId: '',
      name: '',
      contentSid: '',
      fallbackBody: '',
      variablesSchema: [],
    })
  }

  const resetRuleForm = () => {
    setRuleForm({
      propertyId: '',
      templateId: '',
      name: '',
      triggerType: 'ON_BOOKING_CREATED',
      triggerOffsetDays: 0,
      triggerTime: '09:00',
      minStayNights: null,
      priority: 100,
    })
  }

  const openEditTemplate = (template) => {
    setEditingTemplate(template)
    setTemplateForm({
      propertyId: template.propertyId,
      name: template.name,
      contentSid: template.contentSid || '',
      fallbackBody: template.fallbackBody || '',
      variablesSchema: template.variablesSchema || [],
    })
    setShowTemplateModal(true)
  }

  const openEditRule = (rule) => {
    setEditingRule(rule)
    setRuleForm({
      propertyId: rule.propertyId,
      templateId: rule.templateId,
      name: rule.name,
      triggerType: rule.triggerType,
      triggerOffsetDays: rule.triggerOffsetDays || 0,
      triggerTime: rule.triggerTime?.slice(0, 5) || '09:00',
      minStayNights: rule.minStayNights,
      priority: rule.priority || 100,
    })
    setShowRuleModal(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full"
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Scheduled Messages</h1>
          <p className="text-brand-mid-gray mt-1">
            Automate guest communications at key moments in their stay
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2 text-brand-mid-gray hover:text-brand-dark rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          {activeTab === 'templates' && (
            <button
              onClick={() => {
                resetTemplateForm()
                setEditingTemplate(null)
                setShowTemplateModal(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90"
            >
              <Plus className="w-4 h-4" />
              Add Template
            </button>
          )}
          
          {activeTab === 'rules' && (
            <button
              onClick={() => {
                resetRuleForm()
                setEditingRule(null)
                setShowRuleModal(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90"
            >
              <Plus className="w-4 h-4" />
              Add Rule
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
                <p className="text-2xl font-bold text-brand-dark">{stats.byStatus?.pending || 0}</p>
                <p className="text-sm text-brand-mid-gray">Pending</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-dark">{stats.byStatus?.sent || 0}</p>
                <p className="text-sm text-brand-mid-gray">Sent</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-dark">{stats.byStatus?.failed || 0}</p>
                <p className="text-sm text-brand-mid-gray">Failed</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-dark">{stats.upcomingNext24Hours || 0}</p>
                <p className="text-sm text-brand-mid-gray">Next 24h</p>
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
          {['templates', 'rules', 'queue'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-3 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab
                  ? "border-brand-purple text-brand-purple"
                  : "border-transparent text-brand-mid-gray hover:text-brand-dark"
              )}
            >
              {tab === 'queue' ? 'Message Queue' : tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'templates' && (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {templates.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <MessageSquare className="w-12 h-12 text-brand-mid-gray mx-auto mb-4" />
                <h3 className="text-lg font-medium text-brand-dark mb-2">No Templates Yet</h3>
                <p className="text-brand-mid-gray mb-4">
                  Create your first message template to get started
                </p>
                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90"
                >
                  Create Template
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <div 
                    key={template.id}
                    className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-brand-dark">{template.name}</h3>
                          <span className={cn(
                            "px-2 py-0.5 text-xs rounded-full",
                            template.isActive 
                              ? "bg-green-100 text-green-700" 
                              : "bg-gray-100 text-gray-600"
                          )}>
                            {template.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-sm text-brand-mid-gray mt-1">
                          Property: {template.propertyName}
                        </p>
                        {template.contentSid && (
                          <p className="text-xs text-brand-mid-gray mt-1 font-mono">
                            ContentSid: {template.contentSid}
                          </p>
                        )}
                        {template.fallbackBody && (
                          <p className="text-sm text-brand-mid-gray mt-2 italic">
                            "{template.fallbackBody.slice(0, 100)}..."
                          </p>
                        )}
                        <p className="text-xs text-brand-mid-gray mt-2">
                          {template.ruleCount} rule(s) using this template
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditTemplate(template)}
                          className="p-2 text-brand-mid-gray hover:text-brand-dark rounded-lg hover:bg-gray-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="p-2 text-brand-mid-gray hover:text-red-600 rounded-lg hover:bg-red-50"
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

        {activeTab === 'rules' && (
          <motion.div
            key="rules"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {rules.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <Calendar className="w-12 h-12 text-brand-mid-gray mx-auto mb-4" />
                <h3 className="text-lg font-medium text-brand-dark mb-2">No Schedule Rules Yet</h3>
                <p className="text-brand-mid-gray mb-4">
                  Create a rule to define when templates should be sent
                </p>
                <button
                  onClick={() => setShowRuleModal(true)}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90"
                >
                  Create Rule
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {rules.map((rule) => (
                  <div 
                    key={rule.id}
                    className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-brand-dark">{rule.name}</h3>
                          <span className={cn(
                            "px-2 py-0.5 text-xs rounded-full",
                            rule.isActive 
                              ? "bg-green-100 text-green-700" 
                              : "bg-gray-100 text-gray-600"
                          )}>
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-sm text-brand-mid-gray mt-1">
                          Property: {rule.propertyName} → Template: {rule.templateName}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="px-2 py-1 bg-brand-purple/10 text-brand-purple rounded">
                            {TRIGGER_TYPE_LABELS[rule.triggerType] || rule.triggerType}
                          </span>
                          {rule.triggerOffsetDays !== 0 && (
                            <span className="text-brand-mid-gray">
                              {Math.abs(rule.triggerOffsetDays)} day(s)
                            </span>
                          )}
                          <span className="text-brand-mid-gray">
                            at {rule.triggerTime?.slice(0, 5) || '09:00'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={cn(
                            "p-2 rounded-lg",
                            rule.isActive
                              ? "text-green-600 hover:bg-green-50"
                              : "text-gray-400 hover:bg-gray-100"
                          )}
                          title={rule.isActive ? 'Pause rule' : 'Activate rule'}
                        >
                          {rule.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => openEditRule(rule)}
                          className="p-2 text-brand-mid-gray hover:text-brand-dark rounded-lg hover:bg-gray-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-2 text-brand-mid-gray hover:text-red-600 rounded-lg hover:bg-red-50"
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
              <h2 className="text-lg font-medium text-brand-dark">Message Queue</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetryFailed}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Retry Failed
                </button>
                <button
                  onClick={handleProcessNow}
                  className="px-3 py-1.5 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90"
                >
                  Process Now
                </button>
              </div>
            </div>
            
            {scheduledMessages.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <Clock className="w-12 h-12 text-brand-mid-gray mx-auto mb-4" />
                <h3 className="text-lg font-medium text-brand-dark mb-2">No Scheduled Messages</h3>
                <p className="text-brand-mid-gray">
                  Messages will appear here when bookings trigger schedule rules
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium text-brand-mid-gray">Guest</th>
                      <th className="text-left p-3 text-sm font-medium text-brand-mid-gray">Rule</th>
                      <th className="text-left p-3 text-sm font-medium text-brand-mid-gray">Scheduled For</th>
                      <th className="text-left p-3 text-sm font-medium text-brand-mid-gray">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-brand-mid-gray">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledMessages.map((msg) => (
                      <tr key={msg.id} className="border-b border-gray-50 last:border-0">
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-brand-dark">{msg.guestName}</p>
                            <p className="text-xs text-brand-mid-gray">{msg.toNumber}</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="text-sm text-brand-dark">{msg.ruleName}</p>
                            <p className="text-xs text-brand-mid-gray">{msg.templateName}</p>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-brand-mid-gray">
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

      {/* Template Modal */}
      <AnimatePresence>
        {showTemplateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowTemplateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-brand-dark">
                  {editingTemplate ? 'Edit Template' : 'New Template'}
                </h2>
                <button onClick={() => setShowTemplateModal(false)}>
                  <X className="w-5 h-5 text-brand-mid-gray" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Property *
                  </label>
                  <select
                    value={templateForm.propertyId}
                    onChange={(e) => setTemplateForm({ ...templateForm, propertyId: e.target.value })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    disabled={!!editingTemplate}
                  >
                    <option value="">Select Property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="e.g., Welcome Message"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Twilio ContentSid
                  </label>
                  <input
                    type="text"
                    value={templateForm.contentSid}
                    onChange={(e) => setTemplateForm({ ...templateForm, contentSid: e.target.value })}
                    placeholder="e.g., HX1234abcd..."
                    className="w-full p-2 border border-gray-200 rounded-lg font-mono text-sm"
                  />
                  <p className="text-xs text-brand-mid-gray mt-1">
                    Use this for Meta-approved WhatsApp templates
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Fallback Message Body
                  </label>
                  <textarea
                    value={templateForm.fallbackBody}
                    onChange={(e) => setTemplateForm({ ...templateForm, fallbackBody: e.target.value })}
                    placeholder="Hi {{guest_name}}, welcome to {{property_name}}!"
                    rows={4}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                  <p className="text-xs text-brand-mid-gray mt-1">
                    Variables: {'{{guest_name}}'}, {'{{check_in_date}}'}, {'{{check_out_date}}'}, {'{{property_name}}'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-brand-mid-gray hover:text-brand-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                  disabled={!templateForm.propertyId || !templateForm.name || (!templateForm.contentSid && !templateForm.fallbackBody)}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rule Modal */}
      <AnimatePresence>
        {showRuleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRuleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-brand-dark">
                  {editingRule ? 'Edit Rule' : 'New Schedule Rule'}
                </h2>
                <button onClick={() => setShowRuleModal(false)}>
                  <X className="w-5 h-5 text-brand-mid-gray" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Property *
                  </label>
                  <select
                    value={ruleForm.propertyId}
                    onChange={(e) => setRuleForm({ ...ruleForm, propertyId: e.target.value, templateId: '' })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    disabled={!!editingRule}
                  >
                    <option value="">Select Property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Template *
                  </label>
                  <select
                    value={ruleForm.templateId}
                    onChange={(e) => setRuleForm({ ...ruleForm, templateId: e.target.value })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    disabled={!ruleForm.propertyId}
                  >
                    <option value="">Select Template</option>
                    {templates
                      .filter((t) => t.propertyId === ruleForm.propertyId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    placeholder="e.g., Welcome on Booking"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Trigger Type *
                  </label>
                  <select
                    value={ruleForm.triggerType}
                    onChange={(e) => setRuleForm({ ...ruleForm, triggerType: e.target.value })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  >
                    {triggerTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.description}
                      </option>
                    ))}
                  </select>
                </div>
                
                {ruleForm.triggerType !== 'ON_BOOKING_CREATED' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-brand-dark mb-1">
                        Offset (Days)
                      </label>
                      <input
                        type="number"
                        value={ruleForm.triggerOffsetDays}
                        onChange={(e) => setRuleForm({ ...ruleForm, triggerOffsetDays: parseInt(e.target.value) || 0 })}
                        className="w-full p-2 border border-gray-200 rounded-lg"
                      />
                      <p className="text-xs text-brand-mid-gray mt-1">
                        Number of days before/after the trigger date
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-brand-dark mb-1">
                        Time of Day
                      </label>
                      <input
                        type="time"
                        value={ruleForm.triggerTime}
                        onChange={(e) => setRuleForm({ ...ruleForm, triggerTime: e.target.value })}
                        className="w-full p-2 border border-gray-200 rounded-lg"
                      />
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Minimum Stay (Nights)
                  </label>
                  <input
                    type="number"
                    value={ruleForm.minStayNights || ''}
                    onChange={(e) => setRuleForm({ ...ruleForm, minStayNights: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Optional - only send for stays >= X nights"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-brand-dark mb-1">
                    Priority
                  </label>
                  <input
                    type="number"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 100 })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                  <p className="text-xs text-brand-mid-gray mt-1">
                    Lower number = higher priority (default: 100)
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 text-brand-mid-gray hover:text-brand-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={editingRule ? handleUpdateRule : handleCreateRule}
                  disabled={!ruleForm.propertyId || !ruleForm.templateId || !ruleForm.name}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingRule ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

