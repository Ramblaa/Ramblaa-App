import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  User,
  Settings as SettingsIcon,
  Shield,
  Plus,
  Edit,
  Trash2,
  Bell,
  Clock,
  Mail,
  Phone,
  MapPin,
  Globe,
  Eye,
  Moon,
  Sun,
  MessageSquare,
  AlertTriangle,
  CheckSquare
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'

const tabs = [
  { id: 'account', name: 'Account Details', icon: User },
  { id: 'preferences', name: 'Notifications', icon: SettingsIcon },
  { id: 'rules', name: 'Rules', icon: Shield },
]

const taskRules = [
  { 
    id: 1, 
    name: 'Auto-assign cleaning tasks', 
    description: 'Automatically assign cleaning tasks to available staff based on property location',
    enabled: true,
    type: 'task-assignment'
  },
  { 
    id: 2, 
    name: 'Require photo confirmation', 
    description: 'Staff must upload photos when completing maintenance tasks',
    enabled: true,
    type: 'task-completion'
  },
  { 
    id: 3, 
    name: 'Send reminder notifications', 
    description: 'Send reminders 2 hours before task deadline',
    enabled: false,
    type: 'notifications'
  },
]

const escalationRules = [
  { 
    id: 1, 
    name: 'Missing information', 
    description: 'Escalate when critical information is missing from guest requests or property details',
    enabled: true,
    priority: 'medium'
  },
  { 
    id: 2, 
    name: 'No response from contacts', 
    description: 'Escalate when staff or service contacts don\'t respond within expected timeframe',
    enabled: true,
    priority: 'high'
  },
  { 
    id: 3, 
    name: 'User frustration / escalation', 
    description: 'Escalate when guests express frustration or specifically request manager intervention',
    enabled: true,
    priority: 'high'
  },
  { 
    id: 4, 
    name: 'Safety concerns', 
    description: 'Immediately escalate any reported safety issues or potential hazards',
    enabled: true,
    priority: 'critical'
  },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('account')

  const renderAccountDetails = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="business-name">Business Name</Label>
              <Input id="business-name" defaultValue="Sunset Property Management" />
            </div>
            <div>
              <Label htmlFor="business-type">Business Type</Label>
              <Input id="business-type" defaultValue="Vacation Rental Management" />
            </div>
            <div>
              <Label htmlFor="contact-email">Contact Email</Label>
              <div className="flex">
                <Mail className="w-4 h-4 mt-3 mr-2 text-ink-500" />
                <Input id="contact-email" defaultValue="admin@sunsetproperties.com" />
              </div>
            </div>
            <div>
              <Label htmlFor="contact-phone">Contact Phone</Label>
              <div className="flex">
                <Phone className="w-4 h-4 mt-3 mr-2 text-ink-500" />
                <Input id="contact-phone" defaultValue="+1 (555) 123-4567" />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="business-address">Business Address</Label>
              <div className="flex">
                <MapPin className="w-4 h-4 mt-3 mr-2 text-ink-500" />
                <Input id="business-address" defaultValue="123 Ocean Drive, Miami Beach, FL 33139" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="admin-name">Administrator Name</Label>
              <Input id="admin-name" defaultValue="Sarah Johnson" />
            </div>
            <div>
              <Label htmlFor="admin-title">Title</Label>
              <Input id="admin-title" defaultValue="Property Manager" />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" defaultValue="EST (UTC-5)" />
            </div>
            <div>
              <Label htmlFor="language">Language</Label>
              <Input id="language" defaultValue="English" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Save Changes</Button>
      </div>
    </div>
  )

  const renderPreferences = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-brand-600" />
              <CardTitle className="text-lg">Guest Messages</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-ink-500">Toggle All</Label>
              <Switch defaultChecked />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">New guest message received</Label>
              <p className="text-sm text-ink-500">When a guest sends a new message</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Guest requests manager contact</Label>
              <p className="text-sm text-ink-500">When a guest specifically asks to speak with a manager</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Guest complaint or negative feedback</Label>
              <p className="text-sm text-ink-500">When sentiment analysis detects guest dissatisfaction</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Emergency or urgent requests</Label>
              <p className="text-sm text-ink-500">When guests report emergencies or urgent issues</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-brand-600" />
              <CardTitle className="text-lg">Escalations</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-ink-500">Toggle All</Label>
              <Switch defaultChecked />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Escalation triggered</Label>
              <p className="text-sm text-ink-500">When an escalation rule is activated</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">High-priority escalation</Label>
              <p className="text-sm text-ink-500">When a critical or high-priority escalation occurs</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Escalation resolved</Label>
              <p className="text-sm text-ink-500">When an escalated issue is marked as resolved</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Staff response timeout</Label>
              <p className="text-sm text-ink-500">When staff don't respond within the set time limit</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-brand-600" />
              <CardTitle className="text-lg">Tasks</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-ink-500">Toggle All</Label>
              <Switch />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">New task created</Label>
              <p className="text-sm text-ink-500">When a new task is assigned to staff</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Task completed</Label>
              <p className="text-sm text-ink-500">When staff mark a task as completed</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Task overdue</Label>
              <p className="text-sm text-ink-500">When a task passes its deadline without completion</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Task messages and updates</Label>
              <p className="text-sm text-ink-500">When staff add comments or updates to tasks</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Task deadline reminders</Label>
              <p className="text-sm text-ink-500">Reminders sent before task deadlines</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch />
                <Label className="text-sm">Text</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked />
                <Label className="text-sm">Email</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Default Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="default-checkin">Default Check-in Time</Label>
              <Input id="default-checkin" defaultValue="3:00 PM" />
            </div>
            <div>
              <Label htmlFor="default-checkout">Default Check-out Time</Label>
              <Input id="default-checkout" defaultValue="11:00 AM" />
            </div>
            <div>
              <Label htmlFor="task-deadline">Default Task Deadline</Label>
              <Input id="task-deadline" defaultValue="24 hours" />
            </div>
            <div>
              <Label htmlFor="response-time">Expected Response Time</Label>
              <Input id="response-time" defaultValue="2 hours" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Save Notifications</Button>
      </div>
    </div>
  )

  const renderRules = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <CardTitle className="text-lg min-w-0">Task Rules</CardTitle>
            <Button size="sm" className="sm:w-auto flex-shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          {taskRules.map((rule) => (
            <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                  <h4 className="font-medium text-ink-900">{rule.name}</h4>
                  <Badge variant="outline" className="text-xs w-fit">
                    {rule.type}
                  </Badge>
                </div>
                <p className="text-sm text-ink-500">{rule.description}</p>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-3 flex-shrink-0">
                <Switch checked={rule.enabled} />
                <div className="flex gap-1">
                  <Button size="sm" variant="outline">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <CardTitle className="text-lg min-w-0">Escalation Rules</CardTitle>
            <Button size="sm" className="sm:w-auto flex-shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {escalationRules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-ink-900">{rule.name}</h4>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      rule.priority === 'high' ? 'border-red-300 text-red-600' :
                      rule.priority === 'medium' ? 'border-yellow-300 text-yellow-600' :
                      'border-green-300 text-green-600'
                    }`}
                  >
                    {rule.priority} priority
                  </Badge>
                </div>
                <p className="text-sm text-ink-500">{rule.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={rule.enabled} />
                <div className="flex gap-1">
                  <Button size="sm" variant="outline">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="max-concurrent-tasks">Max Concurrent Tasks per Staff</Label>
              <Input id="max-concurrent-tasks" defaultValue="5" type="number" />
            </div>
            <div>
              <Label htmlFor="booking-buffer">Booking Buffer Time</Label>
              <Input id="booking-buffer" defaultValue="2 hours" />
            </div>
            <div>
              <Label htmlFor="cancellation-window">Cancellation Window</Label>
              <Input id="cancellation-window" defaultValue="48 hours" />
            </div>
            <div>
              <Label htmlFor="emergency-contact">Emergency Contact Timeout</Label>
              <Input id="emergency-contact" defaultValue="15 minutes" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Save Rules</Button>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return renderAccountDetails()
      case 'preferences':
        return renderPreferences()
      case 'rules':
        return renderRules()
      default:
        return renderAccountDetails()
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-ink-900">Settings</h1>
        <p className="text-sm sm:text-base text-ink-500">Manage your account, preferences, and business rules</p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-ink-500 hover:text-ink-900 hover:border-ink-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {renderContent()}
      </motion.div>
    </div>
  )
} 