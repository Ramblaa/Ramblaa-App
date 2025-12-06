import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone, MessageCircle, Send, ArrowLeft, Bot, BotOff, User, CheckSquare,
  ExternalLink, Search, Calendar, Clock, MapPin, Plus, Wrench, Brush,
  Package, Check, Trash2, PlayCircle, ChevronDown, MessageSquarePlus,
  Loader2, Brain, Settings
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Switch } from '../components/ui/switch'
import { cn } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import ScenarioSetupModal from '../components/ScenarioSetupModal'
import apiService from '../services/api'

// Transform backend message to UI format
const transformMessage = (dbMessage) => ({
  id: dbMessage.id || dbMessage.message_uuid,
  text: dbMessage.message_body || '',
  sender: dbMessage.message_type === 'Inbound' ? 'guest' : 'host',
  senderType: dbMessage.requestor_role === 'ai' ? 'rambley' :
              dbMessage.requestor_role === 'staff' ? 'staff' : 'host',
  timestamp: new Date(dbMessage.timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
});

// Transform backend task to UI format
const transformTask = (dbTask) => ({
  id: dbTask.id,
  title: dbTask.title,
  type: dbTask.task_type,
  property: dbTask.property_id,
  assignee: dbTask.assignee_name,
  dueDate: dbTask.due_date,
  dueTime: dbTask.due_time,
  status: dbTask.status,
  priority: dbTask.priority,
  description: dbTask.description,
  threadCount: 1, // For now
  conversations: [] // Will populate if needed
});


const statusColors = {
  pending: 'warning',
  'in-progress': 'default',
  completed: 'success',
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
}

// Persona options for message sending
const personas = [
  {
    id: 'guest',
    label: 'Guest',
    description: 'Respond as the guest',
    icon: User,
    color: 'bg-blue-100 text-blue-600',
    sender: 'guest'
  },
  {
    id: 'host',
    label: 'Host',
    description: 'Manual host response',
    icon: User,
    color: 'bg-green-100 text-green-600',
    sender: 'host',
    senderType: 'host'
  },
  {
    id: 'rambley',
    label: 'Ramble AI',
    description: 'AI-powered response',
    icon: Bot,
    color: 'bg-purple-100 text-purple-600',
    sender: 'host',
    senderType: 'rambley'
  },
  {
    id: 'staff',
    label: 'Staff',
    description: 'Cleaning/maintenance staff',
    icon: Wrench,
    color: 'bg-orange-100 text-orange-600',
    sender: 'host',
    senderType: 'staff'
  }
]

// Helper to get relevant personas for a conversation
function getRelevantPersonas(conversation, currentSession, hostName = 'Harrison Budd') {
  const personas = []
  if (!conversation || !currentSession) return personas

  // Always add Guest - use conversation's guest name or fallback to session guest name
  const guestName = conversation.guestName || conversation.scenario?.guest_name || currentSession.scenario_data?.guest_name || 'Guest';
  personas.push({
    id: 'guest',
    type: 'guest',
    label: `Guest (${guestName})`,
    description: 'Respond as the guest',
    icon: User,
    color: 'bg-blue-100 text-blue-600',
    sender: 'guest',
    senderType: 'guest',
    name: guestName
  })

  // Always add Host
  personas.push({
    id: 'host',
    type: 'host',
    label: `Host (${hostName})`,
    description: 'Manual host response',
    icon: User,
    color: 'bg-green-100 text-green-600',
    sender: 'host',
    senderType: 'host',
    name: hostName
  })

  // Add Staff (always available for demo purposes)
  personas.push({
    id: 'staff',
    type: 'staff',
    label: 'Staff Member',
    description: 'Cleaning/maintenance staff',
    icon: Wrench,
    color: 'bg-orange-100 text-orange-600',
    sender: 'staff',
    senderType: 'staff',
    name: 'Staff Member'
  })

  return personas
}

export default function SandboxPage() {
  const navigate = useNavigate()
  const hostName = 'Harrison Budd'

  // Core state
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Messages state
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [conversations, setConversations] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPersona, setSelectedPersona] = useState(null)
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false)
  const [conversationStates, setConversationStates] = useState({})

  // Tasks state
  const [taskFilter, setTaskFilter] = useState('all')
  const [taskPropertyFilter, setTaskPropertyFilter] = useState('all')
  const [taskSearchTerm, setTaskSearchTerm] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedTaskConversation, setSelectedTaskConversation] = useState(null)
  const [taskConversationStates, setTaskConversationStates] = useState({})
  const [tasks, setTasks] = useState([])

  // Demo state
  const [demoMode, setDemoMode] = useState('messages') // 'messages' or 'tasks'

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conversation => {
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase()
    
    return conversation.guestName.toLowerCase().includes(query) ||
           conversation.phone.replace(/\D/g, '').includes(query.replace(/\D/g, '')) ||
           conversation.property.toLowerCase().includes(query) ||
           conversation.lastMessage.toLowerCase().includes(query) ||
           conversation.messages.some(message => 
             message.text.toLowerCase().includes(query)
           )
  })

  // Get unique properties for task filter
  const taskProperties = [...new Set(tasks.map(task => task.property))].sort()

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const statusMatch = taskFilter === 'all' || 
      (taskFilter === 'upcoming' && task.status !== 'completed') ||
      (taskFilter === 'completed' && task.status === 'completed') ||
      task.status === taskFilter

    const propertyMatch = taskPropertyFilter === 'all' || task.property === taskPropertyFilter

    const searchMatch = !taskSearchTerm.trim() || 
      task.title.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
      task.property.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
      task.assignee.toLowerCase().includes(taskSearchTerm.toLowerCase())

    return statusMatch && propertyMatch && searchMatch
  })

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return

    const messageText = newMessage.trim()
    setNewMessage('') // Clear input immediately for better UX

    try {
      // Check if auto-response is enabled for guest messages
      const shouldAutoRespond = selectedPersona.senderType === 'guest' && isAutoResponseEnabled

      // Send message to backend
      await apiService.sendSandboxMessage(
        selectedConversation.id,
        messageText,
        selectedPersona.senderType,
        selectedPersona.sender,
        shouldAutoRespond
      )

      // Capture initial message count before reloading
      const initialMessageCount = selectedConversation?.messages?.length || 0;

      // Reload conversation messages to get the sent message
      await loadConversationMessages(selectedConversation)

      // If auto-response is expected, poll for AI response
      if (shouldAutoRespond) {
        console.log('[SandboxPage] Auto-response expected, starting polling...')
        // Add 1 to account for the message we just sent
        pollForAIResponse(selectedConversation.id, initialMessageCount + 1)
      }

    } catch (error) {
      console.error('Failed to send message:', error)
      // Show error to user
      alert('Failed to send message. Please try again.')
      // Restore the message text
      setNewMessage(messageText)
    }
  }

  // Legacy code for updating local state - keeping for reference but not used with API integration
  const handleSendMessageLocal = (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return

    const now = new Date()
    const timestamp = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

    const newMessageObj = {
      id: Date.now(),
      text: newMessage.trim(),
      sender: selectedPersona.sender,
      senderType: selectedPersona.senderType,
      timestamp: timestamp
    }

    // Update conversations with new message
    setConversations(prev => prev.map(conv => {
      if (conv.id === selectedConversation.id) {
        const updatedMessages = [...conv.messages, newMessageObj]
        return {
          ...conv,
          messages: updatedMessages,
          lastMessage: newMessage.trim(),
          timestamp: 'Just now'
        }
      }
      return conv
    }))

    // Update selected conversation
    setSelectedConversation(prev => ({
      ...prev,
      messages: [...prev.messages, newMessageObj],
      lastMessage: newMessage.trim(),
      timestamp: 'Just now'
    }))

    // If host sends a message, disable auto-response for this conversation
    if (selectedPersona.sender === 'host' && selectedPersona.senderType === 'host') {
      setConversationStates(prev => ({
        ...prev,
        [selectedConversation.id]: {
          ...prev[selectedConversation.id],
          autoResponseEnabled: false
        }
      }))
    }

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

  const handleTaskAction = (e, taskId, action) => {
    e.stopPropagation()
    console.log(`Demo: ${action} task:`, taskId)
  }

  const handleTaskClick = (task) => {
    setSelectedTask(task)
    setSelectedTaskConversation(null)
    setDemoMode('task-detail')
  }

  const handleTaskSendMessage = (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedTaskConversation) return
    
    // When sending a message, disable auto-response for this conversation
    setTaskConversationStates(prev => ({
      ...prev,
      [selectedTaskConversation.id]: {
        ...prev[selectedTaskConversation.id],
        autoResponseEnabled: false
      }
    }))
    
    // In real app, this would send the message via API
    console.log('Sending task message:', newMessage, 'to conversation:', selectedTaskConversation.id)
    setNewMessage('')
  }

  const toggleTaskAutoResponse = () => {
    if (!selectedTaskConversation) return
    
    setTaskConversationStates(prev => ({
      ...prev,
      [selectedTaskConversation.id]: {
        ...prev[selectedTaskConversation.id],
        autoResponseEnabled: !getTaskAutoResponseState()
      }
    }))
  }

  const getTaskAutoResponseState = () => {
    if (!selectedTaskConversation) return false
    return taskConversationStates[selectedTaskConversation.id]?.autoResponseEnabled ?? selectedTaskConversation.autoResponseEnabled
  }

  const backToTasksList = () => {
    setSelectedTask(null)
    setSelectedTaskConversation(null)
    setDemoMode('tasks')
  }

  const startNewChat = () => {
    setSelectedConversation(null)
    setNewMessage('')
    setSelectedPersona(null)
    setShowPersonaDropdown(false)
    if (demoMode !== 'messages') {
      setDemoMode('messages')
    }
  }

  const isAutoResponseEnabled = selectedConversation ? 
    conversationStates[selectedConversation.id]?.autoResponseEnabled ?? selectedConversation.autoResponseEnabled : 
    false

  const getSenderBadge = (message) => {
    if (message.sender === 'guest') return null
    if (message.senderType === 'rambley') {
      return (
        <div className="flex items-center gap-1 text-xs text-ink-500">
          <Bot className="h-3 w-3" />
          <span>Ramble</span>
        </div>
      )
    } else if (message.senderType === 'staff') {
      return (
        <div className="flex items-center gap-1 text-xs text-ink-500">
          <Wrench className="h-3 w-3" />
          <span>Staff</span>
        </div>
      )
    } else {
      return (
        <div className="flex items-center gap-1 text-xs text-ink-500">
          <User className="h-3 w-3" />
          <span>Host</span>
        </div>
      )
    }
  }

  const renderTaskLinks = (generatedTasks) => {
    if (!generatedTasks || generatedTasks.length === 0) return null

    return (
      <div className="mt-2 pt-2 border-t border-ink-300/20">
        <div className="flex items-center gap-1 text-xs text-ink-500 mb-1">
          <CheckSquare className="h-3 w-3" />
          <span>Tasks created:</span>
        </div>
        <div className="space-y-1">
          {generatedTasks.map(taskId => {
            const task = tasks.find(t => t.id === taskId)
            if (!task) return null

            return (
              <button
                key={taskId}
                onClick={() => setDemoMode('tasks')}
                className="flex items-center gap-2 text-xs text-brand-600 hover:text-brand-600/80 transition-colors group"
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  task.status === 'pending' ? 'bg-yellow-500' :
                  task.status === 'in-progress' ? 'bg-blue-500' :
                  'bg-green-500'
                )} />
                <span className="flex-1 text-left truncate">{task.title}</span>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const getTaskCounts = (property = 'all') => {
    const tasksToCount = property === 'all' ? tasks : tasks.filter(t => t.property === property)
    return {
      pending: tasksToCount.filter(t => t.status === 'pending').length,
      inProgress: tasksToCount.filter(t => t.status === 'in-progress').length,
      completed: tasksToCount.filter(t => t.status === 'completed').length,
    }
  }

  const counts = getTaskCounts(taskPropertyFilter)

  // Load initial data
  useEffect(() => {
    loadSessions();
  }, []);

  // Load session data when current session changes
  useEffect(() => {
    if (currentSession) {
      loadSessionData(currentSession.id);
    }
  }, [currentSession]);

  // Data loading functions
  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await apiService.getSandboxSessions();
      setSessions(response.data);

      // Auto-select the most recent session if available
      if (response.data.length > 0 && !currentSession) {
        setCurrentSession(response.data[0]);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      console.log('[SandboxPage] Loading conversations...');
      const response = await apiService.getSandboxSessions();
      const sessions = response.data || [];
      console.log('[SandboxPage] Received sessions:', sessions.length);

      // Transform sessions to conversation format
      const transformedConversations = sessions.map(session => ({
        id: session.id,
        guestName: session.scenario_data?.guest_name || 'Unknown Guest',
        phone: session.scenario_data?.guest_phone || 'No phone',
        property: session.property_name || 'Unknown Property',
        lastMessage: session.message_count > 0 ? 'Last message...' : 'No messages yet',
        timestamp: new Date(session.updated_at || session.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        unread: 0,
        autoResponseEnabled: true,
        messages: [],
        isActive: session.is_active,
        scenario: session.scenario_data
      }));

      console.log('[SandboxPage] Setting conversations:', transformedConversations.length);
      setConversations(transformedConversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversationMessages = async (conversation) => {
    try {
      console.log('[SandboxPage] Loading messages for conversation:', conversation.id);
      const response = await apiService.getSandboxSession(conversation.id);
      const sessionData = response.data;

      // Transform messages
      const transformedMessages = sessionData.messages.map(transformMessage);

      // Update the conversation with loaded messages
      const updatedConversation = {
        ...conversation,
        messages: transformedMessages
      };

      setSelectedConversation(updatedConversation);
    } catch (error) {
      console.error('Failed to load conversation messages:', error);
      // Still set the conversation even if messages fail to load
      setSelectedConversation(conversation);
    }
  };

  // Poll for AI response after sending a guest message
  const pollForAIResponse = (sessionId, initialMessageCount) => {
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLLS = 15; // Max 30 seconds
    let pollCount = 0;

    console.log(`[SandboxPage] Starting to poll for AI response. Initial message count: ${initialMessageCount}`);

    const poll = async () => {
      try {
        pollCount++;
        console.log(`[SandboxPage] Polling for AI response (${pollCount}/${MAX_POLLS})...`);

        const response = await apiService.getSandboxSession(sessionId);
        const sessionData = response.data;

        console.log(`[SandboxPage] Current message count: ${sessionData.messages.length}, Initial: ${initialMessageCount}`);

        // Check if there are new messages since we started polling
        if (sessionData.messages.length > initialMessageCount) {
          console.log('[SandboxPage] New messages detected, updating conversation...');
          const transformedMessages = sessionData.messages.map(transformMessage);
          setSelectedConversation(prev => ({
            ...prev,
            messages: transformedMessages
          }));
          return; // Stop polling
        }

        // Continue polling if we haven't reached max attempts
        if (pollCount < MAX_POLLS) {
          setTimeout(poll, POLL_INTERVAL);
        } else {
          console.log('[SandboxPage] Polling timeout - no AI response received');
        }
      } catch (error) {
        console.error('[SandboxPage] Error during polling:', error);
      }
    };

    // Start polling after a short delay
    setTimeout(poll, 1000);
  };

  const loadSessionData = async (sessionId) => {
    try {
      setLoading(true);
      const response = await apiService.getSandboxSession(sessionId);
      const sessionData = response.data;

      // Transform messages to conversations format
      const guestName = sessionData.session.scenario_data.guest_name;
      const guestPhone = sessionData.session.scenario_data.guest_phone || '+1234567890';
      const propertyName = sessionData.session.property.name;

      if (sessionData.messages.length > 0) {
        const conversation = {
          id: sessionId,
          guestName,
          phone: guestPhone,
          property: propertyName,
          lastMessage: sessionData.messages[sessionData.messages.length - 1]?.message_body || '',
          timestamp: 'Active session',
          unread: 0,
          autoResponseEnabled: true,
          messages: sessionData.messages.map(transformMessage)
        };

        // Only set conversations if not in messages mode (messages mode manages its own conversations list)
        if (demoMode !== 'messages') {
          setConversations([conversation]);
        }
        setSelectedConversation(conversation);
      } else {
        // Only clear conversations if not in messages mode
        if (demoMode !== 'messages') {
          setConversations([]);
        }
        setSelectedConversation(null);
      }

      // Transform tasks
      setTasks(sessionData.tasks.map(transformTask));

    } catch (error) {
      console.error('Error loading session data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (sessionData) => {
    try {
      const response = await apiService.createSandboxSession(sessionData);
      await loadSessions();

      // Select the new session
      const newSession = sessions.find(s => s.id === response.data.session_id) || {
        id: response.data.session_id,
        session_name: response.data.session_name,
        scenario_data: response.data.scenario,
        property_name: response.data.property.name
      };
      setCurrentSession(newSession);

    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  };

  const handleProcessSession = async () => {
    if (!currentSession) return;

    try {
      setIsProcessing(true);
      await apiService.processSandboxSession(currentSession.id);

      // Reload session data to get AI responses
      await loadSessionData(currentSession.id);

    } catch (error) {
      console.error('Error processing session:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // When conversation changes, update persona options and default
  useEffect(() => {
    if (selectedConversation && currentSession) {
      const personas = getRelevantPersonas(selectedConversation, currentSession, hostName)
      setSelectedPersona(personas[0] || null)
    }
  }, [selectedConversation, currentSession])

  // Close persona dropdown when clicking outside
  useEffect(() => {
    if (!showPersonaDropdown) return;

    const handleClickOutside = (event) => {
      if (!event.target.closest('.persona-dropdown')) {
        setShowPersonaDropdown(false);
      }
    };

    // Use a small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showPersonaDropdown]);

  // Load conversations when switching to messages mode
  useEffect(() => {
    console.log('[SandboxPage] useEffect triggered, demoMode:', demoMode);
    if (demoMode === 'messages') {
      console.log('[SandboxPage] Loading conversations due to messages mode');
      loadConversations();
    }
  }, [demoMode]);

  return (
    <div className="h-full flex flex-col">
      {/* Sandbox Header with Mode Tabs */}
      <div className="flex-shrink-0 p-6 border-b bg-gradient-to-r from-brand-600/5 to-brand-600/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-brand-600/10">
                <PlayCircle className="h-6 w-6 text-brand-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-ink-900">Sandbox Mode</h1>
                <p className="text-ink-500">Test and explore Ramble features in a safe demo environment</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">

            <div className="flex bg-brand-light rounded-lg p-1">
              <Button
                variant={demoMode === 'messages' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDemoMode('messages')}
                className="text-sm"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Messages
              </Button>
              <Button
                variant={demoMode === 'tasks' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDemoMode('tasks')}
                className="text-sm"
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Tasks
              </Button>
            </div>


            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSetupModal(true)}
              className="text-sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Scenario
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {demoMode === 'task-detail' ? (
            <motion.div
              key="task-detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full flex"
            >
              {/* Task Detail View - Similar to TaskDetailPage */}
              <div className={cn(
                "w-full lg:w-96 border-r bg-background",
                selectedTaskConversation ? "hidden lg:block" : "block"
              )}>
                {/* Task Header */}
                <div className="p-6 border-b">
                  <Button variant="ghost" onClick={backToTasksList} className="mb-4 -ml-2">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tasks
                  </Button>
                  
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      selectedTask?.type === 'cleaning' ? 'bg-blue-100 text-blue-600' :
                      selectedTask?.type === 'maintenance' ? 'bg-orange-100 text-orange-600' :
                      selectedTask?.type === 'inspection' ? 'bg-green-100 text-green-600' :
                      'bg-purple-100 text-purple-600'
                    )}>
                      {selectedTask?.type === 'cleaning' ? <Brush className="h-5 w-5" /> :
                       selectedTask?.type === 'maintenance' ? <Wrench className="h-5 w-5" /> :
                       selectedTask?.type === 'inspection' ? <Search className="h-5 w-5" /> :
                       <Package className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-lg font-bold text-ink-900">{selectedTask?.title}</h1>
                        <Badge className={cn(
                          "text-xs",
                          selectedTask?.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          selectedTask?.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        )}>
                          {selectedTask?.status === 'in-progress' ? 'In Progress' : 
                           selectedTask?.status?.charAt(0).toUpperCase() + selectedTask?.status?.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-ink-500 mt-1">{selectedTask?.description}</p>
                      
                      <div className="flex flex-wrap gap-3 text-xs text-ink-500 mt-2">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{selectedTask?.property}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{selectedTask?.assignee}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{selectedTask?.dueDate} at {selectedTask?.dueTime}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conversations List */}
                <div className="overflow-y-auto">
                  <div className="p-4">
                    <h2 className="text-sm font-medium text-ink-900 mb-3">Task Communications</h2>
                  </div>
                  
                  {selectedTask?.conversations?.map((conversation) => {
                    const lastMessage = conversation.messages[conversation.messages.length - 1]
                    
                    // Generate initials from person name
                    const getInitials = (name) => {
                      const names = name.split(' ')
                      if (names.length >= 2) {
                        return `${names[0][0]}${names[1][0]}`.toUpperCase()
                      }
                      return name.substring(0, 2).toUpperCase()
                    }
                    
                    // Get avatar background color based on person type
                    const getAvatarColor = (personType) => {
                      switch (personType) {
                        case 'guest':
                          return 'bg-brand-100 text-ink-900'
                        case 'staff':
                          return 'bg-ink-900 text-brand-200'
                        default:
                          return 'bg-ink-900 text-brand-200'
                      }
                    }
                    
                    return (
                      <motion.div
                        key={conversation.id}
                        whileHover={{ backgroundColor: 'rgba(154, 23, 80, 0.05)' }}
                        className={cn(
                          "p-4 border-b cursor-pointer transition-colors",
                          selectedTaskConversation?.id === conversation.id ? "bg-brand-600/10 border-brand-600/20" : ""
                        )}
                        onClick={() => setSelectedTaskConversation(conversation)}
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
                              <h3 className="font-medium text-ink-900 text-sm">{conversation.personName}</h3>
                              <Badge variant="secondary" className="text-xs">
                                {conversation.personRole}
                              </Badge>
                            </div>
                            <p className="text-sm text-ink-500 truncate">
                              {lastMessage.senderName}: {lastMessage.text}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs text-ink-500">{conversation.lastActivity}</p>
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

              {/* Task Conversation Messages View */}
              <div className={cn(
                "flex-1 flex flex-col",
                !selectedTaskConversation ? "hidden lg:flex" : "flex"
              )}>
                {selectedTaskConversation ? (
                  <>
                    {/* Desktop Task Chat Header */}
                    <div className="hidden lg:flex items-center justify-between p-4 border-b bg-background">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-100 text-ink-900 rounded-full flex items-center justify-center font-medium text-sm">
                          {selectedTaskConversation.personName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <h2 className="font-semibold text-ink-900">{selectedTaskConversation.personName}</h2>
                          <p className="text-sm text-ink-500">{selectedTaskConversation.personRole}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-900">Auto Response</span>
                          <Switch
                            checked={getTaskAutoResponseState()}
                            onCheckedChange={toggleTaskAutoResponse}
                          />
                          <span className={cn(
                            "text-xs font-medium",
                            getTaskAutoResponseState() ? "text-brand-600" : "text-ink-500"
                          )}>
                            {getTaskAutoResponseState() ? "ON" : "OFF"}
                          </span>
                          {getTaskAutoResponseState() ? (
                            <Bot className="h-4 w-4 text-brand-600" />
                          ) : (
                            <BotOff className="h-4 w-4 text-ink-500" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mobile Task Chat Header */}
                    <div className="flex items-center justify-between p-4 border-b bg-background lg:hidden">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedTaskConversation(null)}
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-white">
                            {selectedTaskConversation.personName.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <h2 className="font-medium text-ink-900">{selectedTaskConversation.personName}</h2>
                          <p className="text-xs text-ink-500">{selectedTaskConversation.personRole}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={getTaskAutoResponseState()}
                          onCheckedChange={toggleTaskAutoResponse}
                        />
                        <span className={cn(
                          "text-xs font-medium",
                          getTaskAutoResponseState() ? "text-brand-600" : "text-ink-500"
                        )}>
                          {getTaskAutoResponseState() ? "ON" : "OFF"}
                        </span>
                        {getTaskAutoResponseState() ? (
                          <Bot className="h-4 w-4 text-brand-600" />
                        ) : (
                          <BotOff className="h-4 w-4 text-ink-500" />
                        )}
                      </div>
                    </div>

                    {/* Task Messages Container */}
                    <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
                      <div className="p-4 space-y-4">
                        <AnimatePresence>
                          {selectedTaskConversation.messages.map((message, index) => (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.1 }}
                              className={cn(
                                "flex",
                                message.sender === 'guest' || (message.sender !== 'guest' && message.sender !== 'rambley' && message.sender !== 'host') 
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
                                  "max-w-[85%] sm:max-w-xs lg:max-w-md",
                                  message.sender === 'guest' || (message.sender !== 'guest' && message.sender !== 'rambley' && message.sender !== 'host')
                                    ? "mr-4 sm:mr-12" 
                                    : "ml-4 sm:ml-12"
                                )}>
                                  {/* Sender badge for non-guest messages */}
                                  {message.sender !== 'guest' && (message.sender === 'rambley' || message.sender === 'host') && (
                                    <div className={cn(
                                      "flex mb-1",
                                      message.sender !== 'rambley' && message.sender !== 'host'
                                        ? "justify-start"
                                        : "justify-end"
                                    )}>
                                      <div className="flex items-center gap-1 text-xs text-ink-500">
                                        {message.sender === 'rambley' ? (
                                          <>
                                            <Bot className="h-3 w-3" />
                                            <span>Ramble</span>
                                          </>
                                        ) : message.sender === 'host' ? (
                                          <>
                                            <User className="h-3 w-3" />
                                            <span>Host</span>
                                          </>
                                        ) : (
                                          <>
                                            <User className="h-3 w-3" />
                                            <span>{message.senderName || 'Contact'}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  <div className={cn(
                                    "px-4 py-2 rounded-lg",
                                    message.sender === 'guest'
                                      ? "bg-brand-100 text-ink-900"
                                      : message.sender === 'rambley' || message.sender === 'host'
                                        ? "bg-brand-600 text-white"
                                        : "bg-ink-900 text-brand-200"
                                  )}>
                                    <p className="text-sm">{message.text}</p>
                                    <p className={cn(
                                      "text-xs mt-1",
                                      message.sender === 'guest'
                                        ? "text-ink-500"
                                        : message.sender === 'rambley' || message.sender === 'host'
                                          ? "text-white/70"
                                          : "text-brand-200/70"
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
                    </div>

                    {/* Task Message Input */}
                    <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto p-4 border-t bg-background z-20 safe-area-inset-bottom">
                      {!getTaskAutoResponseState() && (
                        <div className="mb-3 p-2 bg-brand-100/50 rounded-lg border border-brand-200">
                          <div className="flex items-center gap-2 text-sm text-ink-900">
                            <BotOff className="h-4 w-4" />
                            <span>Auto-response is disabled. You're in manual mode for this conversation.</span>
                          </div>
                        </div>
                      )}
                      <form onSubmit={handleTaskSendMessage} className="flex gap-2">
                        <Input
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder={`Message ${selectedTaskConversation.personName}...`}
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
                      <MessageCircle className="mx-auto h-12 w-12 text-ink-500 mb-4" />
                      <h3 className="text-lg font-medium text-ink-900 mb-2">Select a conversation</h3>
                      <p className="text-ink-500">Choose a person to view your communication with them</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : demoMode === 'messages' ? (
            <motion.div
              key="messages"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="h-full flex"
            >
              {/* Messages List - Identical to MessagesPage */}
              <div className={cn(
                "w-full lg:w-96 border-r bg-background flex flex-col h-full",
                selectedConversation ? "hidden lg:block" : "block"
              )}>
                <div className="p-6 border-b flex-shrink-0">
                  <h1 className="text-2xl font-bold text-ink-900">Messages</h1>
                  <p className="text-ink-500">Guest conversations</p>

                  {/* Search Input */}
                  <div className="mt-4 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-500" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search guests, properties, numbers..."
                      className="pl-10"
                    />
                  </div>
                </div>

                <div
                  className="flex-1"
                  style={{
                    height: 'calc(100vh - 200px)',
                    overflowY: 'scroll',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {filteredConversations.length > 0 ? (
                    filteredConversations.map((conversation) => (
                      <motion.div
                        key={conversation.id}
                        whileHover={{ backgroundColor: 'rgba(154, 23, 80, 0.05)' }}
                        className={cn(
                          "p-4 border-b cursor-pointer transition-colors",
                          selectedConversation?.id === conversation.id ? "bg-brand-600/10 border-brand-600/20" : ""
                        )}
                        onClick={() => loadConversationMessages(conversation)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-brand-100 text-ink-900 rounded-full flex items-center justify-center font-medium text-sm">
                            {getInitials(conversation.guestName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-ink-900 truncate">{conversation.guestName}</h3>
                              {conversation.unread > 0 && (
                                <Badge variant="default" className="ml-2">
                                  {conversation.unread}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-ink-500 mb-1">
                              <Phone className="h-3 w-3" />
                              <span>{conversation.phone}</span>
                              <span>•</span>
                              <span>{conversation.property}</span>
                            </div>
                            <p className="text-sm text-ink-500 truncate">{conversation.lastMessage}</p>
                            <p className="text-xs text-ink-500 mt-1">{conversation.timestamp}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <MessageCircle className="mx-auto h-12 w-12 text-ink-500 mb-4" />
                      <h3 className="text-lg font-medium text-ink-900 mb-2">No conversations found</h3>
                      <p className="text-ink-500 text-sm">
                        {searchQuery ? `No results for "${searchQuery}"` : 'No conversations available'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat View - Identical to MessagesPage */}
              <div className={cn(
                "flex-1 flex flex-col",
                !selectedConversation ? "hidden lg:flex" : "flex"
              )}>
                {selectedConversation ? (
                  <>
                    {/* Desktop Chat Header */}
                    <div className="hidden lg:flex items-center justify-between p-4 border-b bg-background">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-100 text-ink-900 rounded-full flex items-center justify-center font-medium text-sm">
                          {selectedConversation.guestName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <h2 className="font-semibold text-ink-900">{selectedConversation.guestName}</h2>
                          <p className="text-sm text-ink-500">{selectedConversation.property}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-900">Auto Response</span>
                          <Switch
                            checked={isAutoResponseEnabled}
                            onCheckedChange={toggleAutoResponse}
                          />
                          <span className={cn(
                            "text-xs font-medium",
                            isAutoResponseEnabled ? "text-brand-600" : "text-ink-500"
                          )}>
                            {isAutoResponseEnabled ? "ON" : "OFF"}
                          </span>
                          {isAutoResponseEnabled ? (
                            <Bot className="h-4 w-4 text-brand-600" />
                          ) : (
                            <BotOff className="h-4 w-4 text-ink-500" />
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
                        <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-white">
                            {selectedConversation.guestName.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <h2 className="font-medium text-ink-900">{selectedConversation.guestName}</h2>
                          <p className="text-xs text-ink-500">{selectedConversation.property}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isAutoResponseEnabled}
                          onCheckedChange={toggleAutoResponse}
                        />
                        <span className={cn(
                          "text-xs font-medium",
                          isAutoResponseEnabled ? "text-brand-600" : "text-ink-500"
                        )}>
                          {isAutoResponseEnabled ? "ON" : "OFF"}
                        </span>
                        {isAutoResponseEnabled ? (
                          <Bot className="h-4 w-4 text-brand-600" />
                        ) : (
                          <BotOff className="h-4 w-4 text-ink-500" />
                        )}
                      </div>
                    </div>

                    {/* Messages Container - with bottom padding for fixed input */}
                    <div className="flex-1 overflow-y-auto pb-32 lg:pb-0">
                      <div className="p-4 space-y-4">
                        <AnimatePresence>
                          {selectedConversation.messages.map((message, index) => (
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
                                  "px-4 py-2 rounded-lg",
                                  message.sender === 'host' 
                                    ? "bg-brand-600 text-white"
                                    : "bg-brand-100 text-ink-900"
                                )}>
                                  <p className="text-sm">{message.text}</p>
                                  <p className={cn(
                                    "text-xs mt-1",
                                    message.sender === 'host' 
                                      ? "text-white/70"
                                      : "text-ink-500"
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
                      </div>
                    </div>

                    {/* Message Input - Fixed on mobile, normal on desktop */}  
                    <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto p-4 border-t bg-background z-20 safe-area-inset-bottom">
                      {/* Persona Selector */}
                      {!selectedPersona && (
                        <div className="mb-3 p-3 bg-brand-100/50 rounded-lg border border-brand-200">
                          <div className="flex items-center gap-2 text-sm text-ink-900 mb-2">
                            <Bot className="h-4 w-4" />
                            <span className="font-medium">Choose your persona:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getRelevantPersonas(selectedConversation, currentSession, hostName).map((persona) => (
                              <Button
                                key={persona.id}
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedPersona(persona)}
                                className="text-xs"
                              >
                                {persona.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <Input
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder={`Type message as ${selectedPersona ? selectedPersona.label : ''}...`}
                          className="flex-1"
                        />

                        {/* Persona Switcher */}
                        {selectedPersona && (
                          <div className="relative persona-dropdown">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
                              className="flex items-center gap-2 px-3 py-2 h-10"
                            >
                              <selectedPersona.icon className="h-4 w-4" />
                              <span className="text-sm">{selectedPersona.label}</span>
                              <ChevronDown className="h-3 w-3" />
                            </Button>

                            {/* Dropdown Menu */}
                            {showPersonaDropdown && (
                              <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[120px]">
                                {getRelevantPersonas(selectedConversation, currentSession, hostName).map((persona) => (
                                  <button
                                    key={persona.type}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPersona(persona);
                                      setShowPersonaDropdown(false);
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                                      selectedPersona.type === persona.type ? 'bg-brand-600/10 text-brand-600' : 'text-gray-700'
                                    }`}
                                  >
                                    <persona.icon className="h-4 w-4" />
                                    <span>{persona.label}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <Button type="submit" size="icon" disabled={!newMessage.trim() || !selectedPersona}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-brand-light/50">
                    <div className="text-center">
                      <MessageCircle className="mx-auto h-12 w-12 text-ink-500 mb-4" />
                      <h3 className="text-lg font-medium text-ink-900 mb-2">Select a conversation</h3>
                      <p className="text-ink-500">Choose a guest conversation to start messaging</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-6 space-y-6"
            >
              {/* Tasks Header - Identical to TasksPage */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-ink-900">Tasks</h1>
                  <p className="text-ink-500">Manage cleaning, maintenance, and property tasks</p>
                </div>
                <Button className="sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
                </Button>
              </div>

              {/* Filters - Identical to TasksPage */}
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
                      variant={taskFilter === filterOption.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTaskFilter(filterOption.key)}
                      className="capitalize"
                    >
                      {filterOption.label}
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "ml-2 text-xs pointer-events-none",
                          taskFilter === filterOption.key 
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
                      value={taskPropertyFilter}
                      onChange={(e) => setTaskPropertyFilter(e.target.value)}
                      className="h-9 w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                    >
                      <option value="all">All Properties</option>
                      {taskProperties.map((property) => (
                        <option key={property} value={property}>
                          {property}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-2 flex-1 max-w-md">
                    <Search className="h-4 w-4 text-ink-500" />
                    <Input 
                      placeholder="Search tasks..."
                      value={taskSearchTerm}
                      onChange={(e) => setTaskSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Tasks List - Identical to TasksPage */}
              <div className="space-y-4">
                {filteredTasks.map((task, index) => {
                  const TypeIcon = typeIcons[task.type] || CheckSquare
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card 
                        className={cn(
                          "transition-all hover:shadow-md cursor-pointer",
                          task.status === 'completed' ? 'opacity-75' : ''
                        )}
                        onClick={() => handleTaskClick(task)}
                      >
                        <div className="p-6">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                                  <TypeIcon className="h-4 w-4 text-brand-600" />
                                </div>
                                <div className="flex-1">
                                  <h3 className="font-semibold text-ink-900">{task.title}</h3>
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
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>{task.dueDate} at {task.dueTime}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <MessageCircle className="h-4 w-4" />
                                  <span>{task.threadCount} thread{task.threadCount !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col sm:items-end gap-2">
                              <div className="flex gap-2">
                                <Badge variant={statusColors[task.status]}>
                                  {task.status.replace('-', ' ')}
                                </Badge>
                                <Badge variant={priorityColors[task.priority]}>
                                  {task.priority} priority
                                </Badge>
                              </div>
                              
                              <div className="flex gap-2">
                                {task.status !== 'completed' && (
                                  <Button 
                                    size="icon" 
                                    variant="outline"
                                    onClick={(e) => handleTaskAction(e, task.id, 'complete')}
                                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button 
                                  size="icon" 
                                  variant="outline"
                                  onClick={(e) => handleTaskAction(e, task.id, 'delete')}
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
                    {taskSearchTerm ? `No results for "${taskSearchTerm}"` : 'Try adjusting your filters or create a new task.'}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scenario Setup Modal */}
      <ScenarioSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onCreateSession={handleCreateSession}
      />
    </div>
  )
} 