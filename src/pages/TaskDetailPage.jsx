import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Bot, BotOff, UserCircle, Users, User, MessageCircle, Clock, MapPin, Calendar, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useParams, useNavigate } from 'react-router-dom'
import { tasksApi, messagesApi } from '../lib/api'

const typeIcons = {
  cleaning: 'bg-blue-100 text-blue-600',
  maintenance: 'bg-orange-100 text-orange-600',
  inspection: 'bg-green-100 text-green-600',
  restocking: 'bg-purple-100 text-purple-600',
  other: 'bg-gray-100 text-gray-600',
}

const senderIcons = {
  guest: UserCircle,
  host: User,
  rambley: Bot,
  staff: Users,
}

const senderColors = {
  guest: 'bg-blue-100 text-blue-600',
  rambley: 'bg-purple-100 text-purple-600',
  staff: 'bg-orange-100 text-orange-600',
}

export default function TaskDetailPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [newMessage, setNewMessage] = useState('')
  const [conversationStates, setConversationStates] = useState({})
  const [sending, setSending] = useState(false)

  // Load task on mount
  useEffect(() => {
    loadTask()
  }, [taskId])

  async function loadTask() {
    try {
      setLoading(true)
      setError(null)
      const data = await tasksApi.getTask(taskId)
      
      // Structure task data with conversations
      const structuredTask = {
        ...data,
        conversations: buildConversations(data),
      }
      
      setTask(structuredTask)
    } catch (err) {
      console.error('Failed to load task:', err)
      setError('Failed to load task')
      // Fall back to mock
      setTask(getMockTask(taskId))
    } finally {
      setLoading(false)
    }
  }

  // Build conversation threads from messages and task data
  function buildConversations(taskData) {
    const conversations = []
    
    // Guest conversation (if there's a guest phone)
    if (taskData.guestPhone) {
      conversations.push({
        id: `guest-${taskData.guestPhone}`,
        personName: taskData.guestName || 'Guest',
        personRole: 'Guest',
        personType: 'guest',
        phone: taskData.guestPhone,
        lastActivity: formatLastActivity(taskData.updatedAt),
        autoResponseEnabled: true,
        messages: parseConversationThread(taskData.conversation, 'guest'),
      })
    }
    
    // Staff conversation (if assigned)
    if (taskData.assigneePhone || taskData.assignee) {
      conversations.push({
        id: `staff-${taskData.assigneePhone || taskData.id}`,
        personName: taskData.assignee || 'Staff',
        personRole: 'Staff',
        personType: 'staff',
        phone: taskData.assigneePhone,
        lastActivity: formatLastActivity(taskData.updatedAt),
        autoResponseEnabled: false,
        messages: parseConversationThread(taskData.conversation, 'staff'),
      })
    }
    
    // Add any additional messages from the messages array
    if (taskData.messages?.length) {
      const guestConv = conversations.find(c => c.personType === 'guest')
      if (guestConv) {
        const additionalMsgs = taskData.messages.map(m => ({
          id: m.id,
          text: m.text,
          sender: m.sender,
          senderName: m.sender === 'guest' ? taskData.guestName : 'Rambley',
          timestamp: formatTimestamp(m.timestamp),
        }))
        guestConv.messages = [...guestConv.messages, ...additionalMsgs]
      }
    }
    
    return conversations.length > 0 ? conversations : getDefaultConversations(taskData)
  }

  function parseConversationThread(conversation, filterType) {
    if (!conversation) return []
    
    const items = Array.isArray(conversation) ? conversation : 
      typeof conversation === 'string' ? conversation.split('\n').filter(Boolean) : []
    
    return items.map((item, idx) => {
      // Parse format: "YYYY-MM-DD - Actor - Direction - Message"
      const parts = typeof item === 'string' ? item.split(' - ') : []
      if (parts.length >= 4) {
        const [date, actor, direction, ...messageParts] = parts
        const message = messageParts.join(' - ')
        const sender = actor.toLowerCase().includes('guest') ? 'guest' :
                       actor.toLowerCase().includes('staff') ? 'staff' : 'rambley'
        
        return {
          id: `${filterType}-${idx}`,
          text: message,
          sender,
          senderName: actor,
          timestamp: formatTimestamp(date),
        }
      }
      return {
        id: `${filterType}-${idx}`,
        text: typeof item === 'string' ? item : JSON.stringify(item),
        sender: 'rambley',
        senderName: 'Rambley',
        timestamp: 'Unknown',
      }
    })
  }

  function formatTimestamp(dateStr) {
    if (!dateStr) return 'Unknown'
    try {
      const date = new Date(dateStr)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return dateStr
    }
  }

  function formatLastActivity(dateStr) {
    if (!dateStr) return 'Unknown'
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date
      
      if (diff < 60000) return 'Just now'
      if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    } catch {
      return dateStr
    }
  }

  function getDefaultConversations(taskData) {
    return [{
      id: 'default',
      personName: taskData.guestName || 'Guest',
      personRole: 'Guest',
      personType: 'guest',
      lastActivity: formatLastActivity(taskData.createdAt),
      autoResponseEnabled: true,
      messages: [{
        id: 1,
        text: taskData.guestMessage || taskData.description || 'No messages yet',
        sender: 'guest',
        senderName: taskData.guestName || 'Guest',
        timestamp: formatTimestamp(taskData.createdAt),
      }],
    }]
  }
  
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-purple" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center">
          <h2 className="text-lg font-medium text-brand-dark">Task not found</h2>
          <p className="text-brand-mid-gray">The requested task could not be found.</p>
        </div>
      </div>
    )
  }

  // Sort conversations by latest activity (most recent first)
  const sortedConversations = [...(task.conversations || [])].sort((a, b) => {
    return 0 // Keep original order for now
  })

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return
    
    try {
      setSending(true)
      
      // When sending a message, disable auto-response for this conversation
      setConversationStates(prev => ({
        ...prev,
        [selectedConversation.id]: {
          ...prev[selectedConversation.id],
          autoResponseEnabled: false
        }
      }))
      
      // Send via API if we have a phone
      if (selectedConversation.phone) {
        await messagesApi.sendMessage({
          to: selectedConversation.phone,
          body: newMessage,
          propertyId: task.propertyId,
        })
      }

      // Optimistically add to UI
      const updatedTask = { ...task }
      const convIdx = updatedTask.conversations.findIndex(c => c.id === selectedConversation.id)
      if (convIdx >= 0) {
        updatedTask.conversations[convIdx].messages.push({
          id: Date.now(),
          text: newMessage,
          sender: 'host',
          senderName: 'Host',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        })
        setTask(updatedTask)
        setSelectedConversation(updatedTask.conversations[convIdx])
      }
      
      setNewMessage('')
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const toggleAutoResponse = () => {
    if (!selectedConversation) return
    
    setConversationStates(prev => ({
      ...prev,
      [selectedConversation.id]: {
        ...prev[selectedConversation.id],
        autoResponseEnabled: !getAutoResponseState()
      }
    }))
  }

  const getAutoResponseState = () => {
    if (!selectedConversation) return false
    return conversationStates[selectedConversation.id]?.autoResponseEnabled ?? selectedConversation.autoResponseEnabled
  }

  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return { color: 'bg-yellow-100 text-yellow-700', label: 'Pending' }
      case 'in-progress':
        return { color: 'bg-blue-100 text-blue-700', label: 'In Progress' }
      case 'completed':
        return { color: 'bg-green-100 text-green-700', label: 'Completed' }
      case 'escalated':
        return { color: 'bg-red-100 text-red-700', label: 'Escalated' }
      default:
        return { color: 'bg-gray-100 text-gray-700', label: status || 'Unknown' }
    }
  }

  const statusInfo = getStatusInfo(task.status)
  const isAutoResponseEnabled = getAutoResponseState()

  return (
    <div className="h-full flex">
      {/* Conversations Sidebar */}
      <div className={cn(
        "w-full lg:w-96 border-r bg-background",
        selectedConversation ? "hidden lg:block" : "block"
      )}>
        {/* Task Header */}
        <div className="p-6 border-b">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              typeIcons[task.type] || typeIcons.other
            )}>
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-bold text-brand-dark">{task.title}</h1>
                <Badge className={`text-xs ${statusInfo.color}`}>
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-sm text-brand-mid-gray mt-1">{task.description}</p>
              
              <div className="flex flex-wrap gap-3 text-xs text-brand-mid-gray mt-2">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>{task.property}</span>
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{task.assignee || 'Unassigned'}</span>
                </div>
                {task.dueDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{task.dueDate} {task.dueTime ? `at ${task.dueTime}` : ''}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Conversations List */}
        <div className="overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium text-brand-dark mb-3">Task Communications</h2>
          </div>
          
          {sortedConversations.map((conversation) => {
            const lastMessage = conversation.messages[conversation.messages.length - 1]
            
            // Generate initials from person name
            const getInitials = (name) => {
              const names = (name || 'Unknown').split(' ')
              if (names.length >= 2) {
                return `${names[0][0]}${names[1][0]}`.toUpperCase()
              }
              return (name || 'U').substring(0, 2).toUpperCase()
            }
            
            // Get avatar background color based on person type
            const getAvatarColor = (personType) => {
              switch (personType) {
                case 'guest':
                  return 'bg-brand-vanilla text-brand-dark'
                case 'staff':
                  return 'bg-brand-dark text-brand-vanilla'
                default:
                  return 'bg-brand-dark text-brand-vanilla'
              }
            }
            
            return (
              <motion.div
                key={conversation.id}
                whileHover={{ backgroundColor: 'rgba(154, 23, 80, 0.05)' }}
                className={cn(
                  "p-4 border-b cursor-pointer transition-colors",
                  selectedConversation?.id === conversation.id ? "bg-brand-purple/10 border-brand-purple/20" : ""
                )}
                onClick={() => setSelectedConversation(conversation)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-medium text-sm",
                    getAvatarColor(conversation.personType)
                  )}>
                    {getInitials(conversation.personName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-brand-dark text-sm">{conversation.personName}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {conversation.personRole}
                      </Badge>
                    </div>
                    <p className="text-sm text-brand-mid-gray truncate">
                      {lastMessage?.senderName}: {lastMessage?.text || 'No messages'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-brand-mid-gray">{conversation.lastActivity}</p>
                      <Badge variant="outline" className="text-xs">
                        {conversation.messages.length}
                      </Badge>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Conversation Messages View */}
      <div className={cn(
        "flex-1 flex flex-col",
        !selectedConversation ? "hidden lg:flex" : "flex"
      )}>
        {selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b bg-background flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm",
                  selectedConversation.personType === 'guest' ? 'bg-brand-vanilla text-brand-dark' :
                  selectedConversation.personType === 'staff' ? 'bg-brand-dark text-brand-vanilla' :
                  'bg-brand-dark text-brand-vanilla'
                )}>
                  {(() => {
                    const names = (selectedConversation.personName || 'Unknown').split(' ')
                    if (names.length >= 2) {
                      return `${names[0][0]}${names[1][0]}`.toUpperCase()
                    }
                    return (selectedConversation.personName || 'U').substring(0, 2).toUpperCase()
                  })()}
                </div>
                <div>
                  <h2 className="font-semibold text-brand-dark">{selectedConversation.personName}</h2>
                  <p className="text-xs text-brand-mid-gray">
                    {selectedConversation.personRole} • {selectedConversation.messages.length} messages
                  </p>
                </div>
              </div>

              {/* Auto Response Toggle */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-brand-mid-gray">Auto Response</span>
                <Button
                  variant={isAutoResponseEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={toggleAutoResponse}
                  className={cn(
                    "transition-all duration-200",
                    isAutoResponseEnabled 
                      ? "bg-brand-purple hover:bg-brand-purple/90 text-white" 
                      : "border-brand-purple text-brand-purple hover:bg-brand-purple/10"
                  )}
                >
                  {isAutoResponseEnabled ? (
                    <>
                      <Bot className="h-4 w-4 mr-1" />
                      ON
                    </>
                  ) : (
                    <>
                      <BotOff className="h-4 w-4 mr-1" />
                      OFF
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <AnimatePresence>
                {selectedConversation.messages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex",
                      message.sender === 'guest' || message.sender === 'staff'
                        ? "justify-start" 
                        : "justify-end",
                      message.isSystemMessage && "opacity-60 justify-center"
                    )}
                  >
                    {message.isSystemMessage ? (
                      <div className="bg-gray-100 text-gray-600 italic text-sm px-3 py-2 rounded-lg max-w-md text-center">
                        {message.text}
                      </div>
                    ) : (
                      <div className={cn(
                        "max-w-xs lg:max-w-md",
                        message.sender === 'guest' || message.sender === 'staff'
                          ? "mr-12" 
                          : "ml-12"
                      )}>
                        {/* Sender badge for non-guest messages */}
                        {message.sender !== 'guest' && message.sender !== 'staff' && (
                          <div className="flex mb-1 justify-end">
                            <div className="flex items-center gap-1 text-xs text-brand-mid-gray">
                              {message.sender === 'rambley' ? (
                                <>
                                  <Bot className="h-3 w-3" />
                                  <span>Rambley</span>
                                </>
                              ) : (
                                <>
                                  <User className="h-3 w-3" />
                                  <span>Host</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        <div className={cn(
                          "px-4 py-2 rounded-lg",
                          message.sender === 'guest'
                            ? "bg-brand-vanilla text-brand-dark"
                            : message.sender === 'staff'
                              ? "bg-brand-dark text-brand-vanilla"
                              : "bg-brand-purple text-white"
                        )}>
                          <p className="text-sm">{message.text}</p>
                          <p className={cn(
                            "text-xs mt-1",
                            message.sender === 'guest'
                              ? "text-brand-mid-gray"
                              : message.sender === 'staff'
                                ? "text-brand-vanilla/70"
                                : "text-white/70"
                          )}>
                            {message.timestamp}
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t bg-background">
              {!isAutoResponseEnabled && (
                <div className="mb-3 p-2 bg-brand-vanilla/50 rounded-lg border border-brand-vanilla">
                  <div className="flex items-center gap-2 text-sm text-brand-dark">
                    <BotOff className="h-4 w-4" />
                    <span>Auto-response is disabled. You're in manual mode for this conversation.</span>
                  </div>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Message ${selectedConversation.personName}...`}
                  className="flex-1"
                  disabled={sending}
                />
                <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-brand-light/50">
            <div className="text-center">
              <MessageCircle className="mx-auto h-12 w-12 text-brand-mid-gray mb-4" />
              <h3 className="text-lg font-medium text-brand-dark mb-2">Select a conversation</h3>
              <p className="text-brand-mid-gray">Choose a person to view your communication with them</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Mock task for fallback
function getMockTask(taskId) {
  return {
    id: taskId,
    title: 'Deliver fresh towels - Room 12',
    type: 'cleaning',
    property: 'Sunset Villa',
    assignee: 'Maria Garcia',
    dueDate: '2024-01-15',
    dueTime: '11:00 AM',
    status: 'pending',
    priority: 'high',
    description: 'Guest requested fresh towels for the bathroom.',
    conversations: [
      {
        id: 'sarah-johnson',
        personName: 'Sarah Johnson',
        personRole: 'Guest',
        personType: 'guest',
        lastActivity: '2:13 PM',
        autoResponseEnabled: true,
        messages: [
          { id: 1, text: 'Could I get some fresh towels delivered to the room?', sender: 'guest', senderName: 'Sarah Johnson', timestamp: '2:05 PM' },
          { id: 2, text: "Of course! I'll arrange for fresh towels to be delivered within the hour.", sender: 'rambley', senderName: 'Rambley', timestamp: '2:06 PM' },
          { id: 3, text: 'Task created: Fresh towel delivery for Room 12. Assigned to Maria Garcia.', sender: 'rambley', senderName: 'Rambley', timestamp: '2:06 PM', isSystemMessage: true },
          { id: 4, text: 'Your fresh towels are on the way! Maria will deliver them within 15 minutes.', sender: 'rambley', senderName: 'Rambley', timestamp: '2:12 PM' },
          { id: 5, text: 'Great, thank you so much!', sender: 'guest', senderName: 'Sarah Johnson', timestamp: '2:13 PM' }
        ]
      },
      {
        id: 'maria-garcia',
        personName: 'Maria Garcia',
        personRole: 'Housekeeping Staff',
        personType: 'staff',
        lastActivity: '2:11 PM',
        autoResponseEnabled: false,
        messages: [
          { id: 6, text: 'Hi Maria! Guest in Room 12 needs fresh towels delivered ASAP. Can you handle this?', sender: 'rambley', senderName: 'Rambley', timestamp: '2:07 PM' },
          { id: 7, text: "Sure! I'm finishing up Room 8, will be there in 15 minutes.", sender: 'staff', senderName: 'Maria Garcia', timestamp: '2:10 PM' },
          { id: 8, text: 'Perfect, thank you Maria!', sender: 'rambley', senderName: 'Rambley', timestamp: '2:11 PM' }
        ]
      }
    ]
  }
}
