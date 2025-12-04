import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, MessageCircle, Send, ArrowLeft, Bot, BotOff, User, CheckSquare, ExternalLink, Search, Loader2, Link2, Calendar } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { messagesApi, tasksApi } from '../lib/api'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function MessagesPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [conversationMeta, setConversationMeta] = useState({}) // Loaded metadata from API
  const [conversationMessages, setConversationMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [conversationStates, setConversationStates] = useState({})
  const [showBookingSelector, setShowBookingSelector] = useState(false)
  const [availableBookings, setAvailableBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(false)
  
  // Ref for scrolling to latest message
  const messagesEndRef = useRef(null)

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Auto-scroll when messages change or conversation switches
  useEffect(() => {
    scrollToBottom()
  }, [conversationMessages])

  // Get display data - prefer loaded meta, fall back to selected conversation
  const displayData = {
    guestName: conversationMeta.guestName || selectedConversation?.guestName || formatPhoneForDisplay(selectedConversation?.phone),
    property: conversationMeta.property || selectedConversation?.property || 'Unknown Property',
    phone: conversationMeta.phone || selectedConversation?.phone || '',
    propertyId: conversationMeta.propertyId || selectedConversation?.propertyId,
    bookingId: conversationMeta.bookingId || selectedConversation?.bookingId,
  }

  // Format phone for display
  function formatPhoneForDisplay(phone) {
    if (!phone) return 'Unknown'
    return phone.replace('whatsapp:', '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
  }

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Load messages when conversation is selected - use ID (bookingId or phone) as stable key
  useEffect(() => {
    const conversationId = selectedConversation?.bookingId || selectedConversation?.id
    if (conversationId) {
      loadConversationMessages(conversationId)
    }
  }, [selectedConversation?.id]) // Only trigger on ID change, not metadata changes

  async function loadConversations() {
    try {
      setLoading(true)
      setError(null)
      const data = await messagesApi.getConversations({ limit: 50 })
      setConversations(data)
      
      // Initialize conversation states using id as key
      const states = {}
      data.forEach(conv => {
        states[conv.id] = { autoResponseEnabled: true }
      })
      setConversationStates(states)
    } catch (err) {
      console.error('Failed to load conversations:', err)
      setError('Failed to load conversations')
      // Fall back to mock data for demo
      setConversations(getMockConversations())
    } finally {
      setLoading(false)
    }
  }

  async function loadConversationMessages(conversationId) {
    try {
      const data = await messagesApi.getConversation(conversationId)
      setConversationMessages(data.messages || [])
      // Update metadata without changing the ID (prevents re-fetch loop)
      setConversationMeta({
        guestName: data.guestName,
        property: data.property,
        propertyId: data.propertyId,
        bookingId: data.bookingId,
        phone: data.phone,
      })
    } catch (err) {
      console.error('Failed to load messages:', err)
      // Keep existing messages or use mock
    }
  }

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conversation => {
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase()
    
    if (conversation.guestName?.toLowerCase().includes(query)) return true
    if (conversation.phone?.replace(/\D/g, '').includes(query.replace(/\D/g, ''))) return true
    if (conversation.property?.toLowerCase().includes(query)) return true
    if (conversation.lastMessage?.toLowerCase().includes(query)) return true
    
    return false
  })

  // Reset meta when conversation changes
  useEffect(() => {
    setConversationMeta({})
    setConversationMessages([])
  }, [selectedConversation?.id])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return

    try {
      setSending(true)
      
      // When host sends a message, disable auto-response for this conversation
      setConversationStates(prev => ({
        ...prev,
        [selectedConversation.id]: {
          ...prev[selectedConversation.id],
          autoResponseEnabled: false
        }
      }))

      await messagesApi.sendMessage({
        to: displayData.phone,
        body: newMessage,
        propertyId: displayData.propertyId,
        bookingId: displayData.bookingId,
      })

      // Optimistically add message to UI
      setConversationMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: newMessage,
        sender: 'host',
        senderType: 'host',
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      }])

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
        autoResponseEnabled: !prev[selectedConversation.id]?.autoResponseEnabled
      }
    }))
  }

  const handleTaskLink = (taskId) => {
    navigate(`/tasks/${taskId}`)
  }

  const isAutoResponseEnabled = selectedConversation ? 
    conversationStates[selectedConversation.id]?.autoResponseEnabled ?? true : 
    false

  // Load available bookings for linking
  async function loadAvailableBookings() {
    try {
      setLoadingBookings(true)
      // Get all properties first, then get bookings for each
      const propsRes = await fetch(`${API_BASE_URL}/properties`)
      const properties = await propsRes.json()
      
      let allBookings = []
      for (const prop of properties) {
        const bookingsRes = await fetch(`${API_BASE_URL}/properties/${prop.id}/bookings?active=false`)
        const bookings = await bookingsRes.json()
        allBookings = [...allBookings, ...bookings.map(b => ({ ...b, propertyName: prop.name }))]
      }
      
      setAvailableBookings(allBookings)
    } catch (err) {
      console.error('Failed to load bookings:', err)
    } finally {
      setLoadingBookings(false)
    }
  }

  // Link conversation to a booking
  async function linkToBooking(bookingId) {
    if (!selectedConversation || !bookingId) return
    
    try {
      // Update all messages from this phone to be associated with the booking
      // This would require a backend endpoint - for now just refresh
      setShowBookingSelector(false)
      await loadConversations()
    } catch (err) {
      console.error('Failed to link booking:', err)
    }
  }

  // Open booking selector
  function openBookingSelector() {
    setShowBookingSelector(true)
    loadAvailableBookings()
  }

  const getSenderBadge = (message) => {
    if (message.sender === 'guest') return null
    if (message.senderType === 'rambley') {
      return (
        <div className="flex items-center gap-1 text-xs text-brand-mid-gray">
          <Bot className="h-3 w-3" />
          <span>Rambley</span>
        </div>
      )
    } else {
      return (
        <div className="flex items-center gap-1 text-xs text-brand-mid-gray">
          <User className="h-3 w-3" />
          <span>Host</span>
        </div>
      )
    }
  }

  const renderTaskLinks = (taskIds, taskAction) => {
    if (!taskIds || taskIds.length === 0) return null

    // Show "Task created" or "Task updated" based on taskAction
    const label = taskAction === 'created' ? 'Task created:' : 'Task updated:'

    return (
      <div className="mt-2 pt-2 border-t border-brand-mid-gray/20">
        <div className="flex items-center gap-1 text-xs text-brand-mid-gray mb-1">
          <CheckSquare className="h-3 w-3" />
          <span>{label}</span>
        </div>
        <div className="space-y-1">
          {taskIds.map(taskId => (
            <button
              key={taskId}
              onClick={() => handleTaskLink(taskId)}
              className="flex items-center gap-2 text-xs text-brand-purple hover:text-brand-purple/80 transition-colors group"
            >
              <div className={cn(
                "w-2 h-2 rounded-full",
                taskAction === 'created' ? "bg-green-500" : "bg-yellow-500"
              )} />
              <span className="flex-1 text-left truncate">Task {taskId.slice(0, 8)}...</span>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  const getInitials = (name) => {
    const names = (name || 'Unknown').split(' ')
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase()
    }
    return (name || 'U').substring(0, 2).toUpperCase()
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-purple" />
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Conversations List */}
      <div className={cn(
        "w-full lg:w-96 border-r bg-background",
        selectedConversation ? "hidden lg:block" : "block"
      )}>
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-brand-dark">Messages</h1>
          <p className="text-brand-mid-gray">Guest conversations</p>
          
          {/* Search Input */}
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-brand-mid-gray" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guests, properties, numbers..."
              className="pl-10"
            />
          </div>
        </div>
        
        <div className="overflow-y-auto">
          {error && (
            <div className="p-4 text-center text-red-500 text-sm">{error}</div>
          )}
          
          {filteredConversations.length > 0 ? (
            filteredConversations.map((conversation) => (
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
                  <div className="w-10 h-10 bg-brand-vanilla text-brand-dark rounded-full flex items-center justify-center font-medium text-sm">
                    {getInitials(conversation.guestName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-brand-dark truncate">{conversation.guestName}</h3>
                      {conversation.unread > 0 && (
                        <Badge variant="default" className="ml-2">
                          {conversation.unread}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-brand-mid-gray mb-1">
                      <Phone className="h-3 w-3" />
                      <span>{conversation.phone}</span>
                      <span>•</span>
                      <span>{conversation.property}</span>
                    </div>
                    <p className="text-sm text-brand-mid-gray truncate">{conversation.lastMessage}</p>
                    <p className="text-xs text-brand-mid-gray mt-1">{formatTimestamp(conversation.timestamp)}</p>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="p-8 text-center">
              <MessageCircle className="mx-auto h-12 w-12 text-brand-mid-gray mb-4" />
              <h3 className="text-lg font-medium text-brand-dark mb-2">No conversations found</h3>
              <p className="text-brand-mid-gray text-sm">
                {searchQuery ? `No results for "${searchQuery}"` : 'No conversations available'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Chat View */}
      <div className={cn(
        "flex-1 flex flex-col",
        !selectedConversation ? "hidden lg:flex" : "flex"
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
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
                <div className="w-10 h-10 bg-brand-vanilla text-brand-dark rounded-full flex items-center justify-center font-medium text-sm">
                  {getInitials(displayData.guestName)}
                </div>
                <div>
                  <h2 className="font-semibold text-brand-dark">{displayData.guestName}</h2>
                  <div className="flex items-center gap-1 text-xs text-brand-mid-gray">
                    <Phone className="h-3 w-3" />
                    <span>{displayData.phone}</span>
                    {displayData.property && displayData.property !== 'Unknown Property' && (
                      <>
                        <span>•</span>
                        <span>{displayData.property}</span>
                      </>
                    )}
                  </div>
                  {/* Link to Booking button when no booking associated */}
                  {!displayData.bookingId && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="h-auto p-0 text-xs text-brand-purple"
                      onClick={openBookingSelector}
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Link to Booking
                    </Button>
                  )}
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
                {conversationMessages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex",
                      message.sender === 'host' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-xs lg:max-w-md",
                      message.sender === 'host' ? "flex flex-col items-end" : ""
                    )}>
                      {/* Sender Badge for host messages */}
                      {message.sender === 'host' && (
                        <div className="mb-1">
                          {getSenderBadge(message)}
                        </div>
                      )}
                      
                      {/* Message Bubble */}
                      <div className={cn(
                        "px-4 py-2 rounded-lg",
                        message.sender === 'host' 
                          ? "bg-brand-purple text-white"
                          : "bg-brand-vanilla text-brand-dark"
                      )}>
                        <p className="text-sm">{message.text}</p>
                        <p className={cn(
                          "text-xs mt-1",
                          message.sender === 'host' 
                            ? "text-white/70"
                            : "text-brand-mid-gray"
                        )}>
                          {message.timestamp}
                        </p>
                        
                        {/* Task Links */}
                        {renderTaskLinks(message.taskIds, message.taskAction)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {/* Scroll anchor - always scroll to this element */}
              <div ref={messagesEndRef} />
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
                  placeholder="Type your message..."
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
              <p className="text-brand-mid-gray">Choose a guest conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* Booking Selector Modal */}
      {showBookingSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-brand-dark">Link to Booking</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowBookingSelector(false)} className="h-8 w-8 p-0">
                ×
              </Button>
            </div>
            
            <p className="text-sm text-brand-mid-gray mb-4">
              Select a booking to associate with this conversation. This helps track messages by guest stay.
            </p>

            {loadingBookings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-purple" />
              </div>
            ) : availableBookings.length === 0 ? (
              <div className="text-center py-8 text-brand-mid-gray">
                No bookings available
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-2">
                {availableBookings.map(booking => (
                  <button
                    key={booking.id}
                    onClick={() => linkToBooking(booking.id)}
                    className="w-full p-3 text-left rounded-lg border hover:border-brand-purple hover:bg-brand-purple/5 transition-colors"
                  >
                    <div className="font-medium text-brand-dark">{booking.guestName}</div>
                    <div className="flex items-center gap-2 text-xs text-brand-mid-gray mt-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(booking.startDate).toLocaleDateString()} - {new Date(booking.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-brand-mid-gray mt-1">{booking.propertyName}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowBookingSelector(false)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Mock data fallback
function getMockConversations() {
  return [
    {
      phone: '+15551234567',
      guestName: 'Sarah Johnson',
      property: 'Sunset Villa',
      lastMessage: 'Thank you for the check-in instructions!',
      timestamp: new Date(Date.now() - 120000).toISOString(),
      unread: 2,
    },
    {
      phone: '+15559876543',
      guestName: 'Mike Chen',
      property: 'Mountain Retreat',
      lastMessage: "The WiFi password isn't working",
      timestamp: new Date(Date.now() - 900000).toISOString(),
      unread: 1,
    },
    {
      phone: '+15554567890',
      guestName: 'Emma Rodriguez',
      property: 'Beach House',
      lastMessage: 'Check-out completed, thank you!',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      unread: 0,
    },
  ]
}
