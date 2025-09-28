import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, MessageCircle, Send, ArrowLeft, Bot, BotOff, User, CheckSquare, ExternalLink, Search } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { Switch } from '../components/ui/switch'
import apiService from '../services/api'

// TODO: Replace with actual task API calls when task linking is implemented

export default function MessagesPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [conversationStates, setConversationStates] = useState({})
  const [initialLoading, setInitialLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState(null)
  const [conversationLoading, setConversationLoading] = useState(false)

  // Memoized loadConversations function to prevent unnecessary recreations
  const loadConversations = useCallback(async (isSearch = false) => {
    try {
      // Set appropriate loading state
      if (isSearch) {
        setSearchLoading(true)
      } else if (initialLoading) {
        setInitialLoading(true)
      }
      
      setError(null)
      
      const response = await apiService.getConversations({ 
        search: searchQuery || undefined,
        limit: 50 
      })
      
      setConversations(response.data || [])
      
      // Only update conversation states if we don't already have them or if data changed
      setConversationStates(prevStates => {
        const newStates = {}
        response.data?.forEach(conv => {
          newStates[conv.id] = { 
            autoResponseEnabled: prevStates[conv.id]?.autoResponseEnabled ?? conv.autoResponseEnabled ?? true 
          }
        })
        return newStates
      })
      
    } catch (err) {
      console.error('Failed to load conversations:', err)
      setError('Failed to load conversations. Please try again.')
    } finally {
      setInitialLoading(false)
      setSearchLoading(false)
    }
  }, [searchQuery, initialLoading])

  // Single useEffect to handle both initial load and search with debouncing
  useEffect(() => {
    const isInitialLoad = initialLoading && conversations.length === 0
    
    if (isInitialLoad) {
      // Load immediately on mount
      loadConversations(false)
    } else if (searchQuery !== '') {
      // Debounce search queries
      const timeoutId = setTimeout(() => {
        loadConversations(true)
      }, 300)
      return () => clearTimeout(timeoutId)
    } else if (searchQuery === '' && !isInitialLoad) {
      // Clear search - load immediately without search term
      loadConversations(false)
    }
  }, [searchQuery, loadConversations, initialLoading, conversations.length])

  const handleConversationSelect = async (conversation) => {
    try {
      setConversationLoading(true)
      setError(null)
      
      // If we already have messages in the conversation, use them
      if (conversation.messages && conversation.messages.length > 0) {
        setSelectedConversation(conversation)
        return
      }
      
      // Otherwise, load full conversation from API
      const response = await apiService.getConversation(conversation.id)
      setSelectedConversation(response.data)
      
    } catch (err) {
      console.error('Failed to load conversation:', err)
      setError('Failed to load conversation messages. Please try again.')
    } finally {
      setConversationLoading(false)
    }
  }

  // Memoized filtered conversations to prevent unnecessary recalculations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    
    const query = searchQuery.toLowerCase()
    
    return conversations.filter(conversation => {
      // Search in guest name
      if (conversation.guestName?.toLowerCase().includes(query)) return true
      
      // Search in phone number (remove formatting for search)
      if (conversation.phone?.replace(/\D/g, '').includes(query.replace(/\D/g, ''))) return true
      
      // Search in property name
      if (conversation.property?.toLowerCase().includes(query)) return true
      
      // Search in last message
      if (conversation.lastMessage?.toLowerCase().includes(query)) return true
      
      // Search in all messages if available
      if (conversation.messages?.some(message => 
        message.text?.toLowerCase().includes(query)
      )) return true
      
      return false
    })
  }, [conversations, searchQuery])

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return

    // When host sends a message, disable auto-response for this conversation
    setConversationStates(prev => ({
      ...prev,
      [selectedConversation.id]: {
        ...prev[selectedConversation.id],
        autoResponseEnabled: false
      }
    }))

    // Add message to conversation (in real app, this would be an API call)
    console.log('Sending message:', newMessage)
    setNewMessage('')
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
    // Navigate to the task detail page
    navigate(`/tasks/${taskId}`)
  }

  const isAutoResponseEnabled = selectedConversation ? 
    conversationStates[selectedConversation.id]?.autoResponseEnabled ?? selectedConversation.autoResponseEnabled : 
    false

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

  const renderTaskLinks = (generatedTasks) => {
    if (!generatedTasks || generatedTasks.length === 0) return null

    return (
      <div className="mt-2 pt-2 border-t border-brand-mid-gray/20">
        <div className="flex items-center gap-1 text-xs text-brand-mid-gray mb-1">
          <CheckSquare className="h-3 w-3" />
          <span>Tasks created:</span>
        </div>
        <div className="space-y-1">
          {generatedTasks.map(taskId => (
            <button
              key={taskId}
              onClick={() => handleTaskLink(taskId)}
              className="flex items-center gap-2 text-xs text-brand-purple hover:text-brand-purple/80 transition-colors group"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="flex-1 text-left truncate">Task {taskId}</span>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Conversations List */}
      <div className={cn(
        "w-full lg:w-96 border-r bg-background flex flex-col",
        selectedConversation ? "hidden lg:flex" : "flex"
      )}>
        <div className="p-4 sm:p-6 border-b flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-brand-dark">Messages</h1>
          <p className="text-sm sm:text-base text-brand-mid-gray">Guest conversations</p>

          {/* Search Input */}
          <div className="mt-3 sm:mt-4 relative">
            <Search className={cn(
              "absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-brand-mid-gray",
              searchLoading && "animate-pulse"
            )} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guests, properties, numbers..."
              className="pl-10"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-brand-purple border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadConversations}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          )}
          
          {initialLoading ? (
            <div className="p-4 text-center">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 border-b">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                        <div className="h-3 bg-gray-100 rounded w-3/4"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredConversations.length > 0 ? (
            filteredConversations.map((conversation) => {
              // Generate initials from guest name
              const getInitials = (name) => {
                const names = name.split(' ')
                if (names.length >= 2) {
                  return `${names[0][0]}${names[1][0]}`.toUpperCase()
                }
                return name.substring(0, 2).toUpperCase()
              }
              
              return (
                <motion.div
                  key={conversation.id}
                  whileHover={{ backgroundColor: 'rgba(154, 23, 80, 0.05)' }}
                  className={cn(
                    "p-4 border-b cursor-pointer transition-colors",
                    selectedConversation?.id === conversation.id ? "bg-brand-purple/10 border-brand-purple/20" : ""
                  )}
                  onClick={() => handleConversationSelect(conversation)}
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
                      <p className="text-xs text-brand-mid-gray mt-1">{conversation.timestamp}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })
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
            {/* Desktop Chat Header */}
            <div className="hidden lg:flex items-center justify-between p-4 border-b bg-background">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-vanilla text-brand-dark rounded-full flex items-center justify-center font-medium text-sm">
                  {selectedConversation.guestName.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h2 className="font-semibold text-brand-dark">{selectedConversation.guestName}</h2>
                  <p className="text-sm text-brand-mid-gray">{selectedConversation.property}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-brand-dark">Auto Response</span>
                  <Switch
                    checked={isAutoResponseEnabled}
                    onCheckedChange={toggleAutoResponse}
                  />
                  <span className={cn(
                    "text-xs font-medium",
                    isAutoResponseEnabled ? "text-brand-purple" : "text-brand-mid-gray"
                  )}>
                    {isAutoResponseEnabled ? "ON" : "OFF"}
                  </span>
                  {isAutoResponseEnabled ? (
                    <Bot className="h-4 w-4 text-brand-purple" />
                  ) : (
                    <BotOff className="h-4 w-4 text-brand-mid-gray" />
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Chat Header */}
            <div className="flex items-center justify-between p-4 border-b bg-background lg:hidden">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedConversation(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-brand-purple rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-white">
                    {selectedConversation.guestName.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <h2 className="font-medium text-brand-dark">{selectedConversation.guestName}</h2>
                  <p className="text-xs text-brand-mid-gray">{selectedConversation.property}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={isAutoResponseEnabled}
                  onCheckedChange={toggleAutoResponse}
                />
                <span className={cn(
                  "text-xs font-medium",
                  isAutoResponseEnabled ? "text-brand-purple" : "text-brand-mid-gray"
                )}>
                  {isAutoResponseEnabled ? "ON" : "OFF"}
                </span>
                {isAutoResponseEnabled ? (
                  <Bot className="h-4 w-4 text-brand-purple" />
                ) : (
                  <BotOff className="h-4 w-4 text-brand-mid-gray" />
                )}
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                {conversationLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-pulse text-brand-mid-gray">Loading messages...</div>
                  </div>
                ) : (
                  <AnimatePresence>
                    {selectedConversation.messages?.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      "flex",
                      message.sender === 'host' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[85%] sm:max-w-xs lg:max-w-md",
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
                        "px-3 sm:px-4 py-2 rounded-lg",
                        message.sender === 'host'
                          ? "bg-brand-purple text-white" // Both Rambley and Host use purple background
                          : "bg-brand-vanilla text-brand-dark" // Guest messages unchanged
                      )}>
                        <p className="text-sm leading-relaxed">{message.text}</p>
                        <p className={cn(
                          "text-xs mt-1",
                          message.sender === 'host'
                            ? "text-white/70" // Both Rambley and Host timestamps
                            : "text-brand-mid-gray" // Guest timestamp
                        )}>
                          {message.timestamp}
                        </p>

                        {/* Task Links */}
                        {renderTaskLinks(message.generatedTasks)}
                      </div>
                    </div>
                  </motion.div>
                  ))}
                  </AnimatePresence>
                )}
              </div>
            </div>

            {/* Message Input - Fixed at bottom of chat area */}
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
                />
                <Button type="submit" size="icon">
                  <Send className="h-4 w-4" />
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
    </div>
  )
} 