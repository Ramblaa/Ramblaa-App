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
  Search
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import apiService from '../services/api'


export default function FAQsPage() {
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingFaq, setEditingFaq] = useState(null)
  const [answerDraft, setAnswerDraft] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newFaq, setNewFaq] = useState({ question: '', answer: '', answer_type: 'unanswered' })

  // Load FAQs from API
  useEffect(() => {
    loadFAQs()
  }, [selectedFilter, searchTerm])

  const loadFAQs = async () => {
    try {
      setLoading(true)
      const params = {
        sort: 'ask_count',
        order: 'desc'
      }
      
      if (selectedFilter !== 'all') {
        params.answer_type = selectedFilter
      }
      
      if (searchTerm.trim()) {
        params.search = searchTerm.trim()
      }
      
      const response = await apiService.getFAQs(params)
      setFaqs(response.faqs || [])
      setError(null)
    } catch (err) {
      console.error('Error loading FAQs:', err)
      setError('Failed to load FAQs. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleStartAnswering = (faq) => {
    setEditingFaq(faq.id)
    setAnswerDraft(faq.answer || '')
  }

  const handleSaveAnswer = async (faqId) => {
    if (!answerDraft.trim()) return
    
    try {
      setSaving(true)
      const faq = faqs.find(f => f.id === faqId)
      
      await apiService.updateFAQ(faqId, {
        question: faq.question,
        answer: answerDraft.trim(),
        answer_type: 'host',
        category_id: faq.category_id,
        property_id: faq.property_id,
        tags: faq.tags || []
      })
      
      // Reload FAQs to get updated data
      await loadFAQs()
      
      setEditingFaq(null)
      setAnswerDraft('')
    } catch (err) {
      console.error('Error saving answer:', err)
      setError('Failed to save answer. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelAnswering = () => {
    setEditingFaq(null)
    setAnswerDraft('')
  }

  const handleDeleteFAQ = async (faqId) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return
    
    try {
      await apiService.deleteFAQ(faqId)
      await loadFAQs()
    } catch (err) {
      console.error('Error deleting FAQ:', err)
      setError('Failed to delete FAQ. Please try again.')
    }
  }

  const handleAddFAQ = async () => {
    if (!newFaq.question.trim()) return
    
    try {
      setSaving(true)
      await apiService.createFAQ({
        question: newFaq.question.trim(),
        answer: newFaq.answer.trim() || null,
        answer_type: newFaq.answer.trim() ? 'host' : 'unanswered'
      })
      
      // Reload FAQs and close modal
      await loadFAQs()
      setShowAddModal(false)
      setNewFaq({ question: '', answer: '', answer_type: 'unanswered' })
    } catch (err) {
      console.error('Error adding FAQ:', err)
      setError('Failed to add FAQ. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const getAnswerTypeInfo = (answerType) => {
    switch (answerType) {
      case 'llm':
        return {
          icon: Bot,
          label: 'AI Generated',
          color: 'bg-blue-100 text-blue-700',
          description: 'Answered automatically using available context'
        }
      case 'host':
        return {
          icon: User,
          label: 'Host Answered',
          color: 'bg-green-100 text-green-700',
          description: 'Answered by property host'
        }
      case 'unanswered':
        return {
          icon: AlertCircle,
          label: 'Needs Answer',
          color: 'bg-red-100 text-red-700',
          description: 'Requires host input'
        }
      default:
        return {
          icon: HelpCircle,
          label: 'Unknown',
          color: 'bg-gray-100 text-gray-700',
          description: 'Unknown status'
        }
    }
  }

  const getFaqCounts = () => {
    return {
      all: faqs.length,
      llm: faqs.filter(f => f.answer_type === 'llm').length,
      host: faqs.filter(f => f.answer_type === 'host').length,
      unanswered: faqs.filter(f => f.answer_type === 'unanswered').length,
    }
  }

  const counts = getFaqCounts()
  
  // Format last_asked timestamp
  const formatLastAsked = (timestamp) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleString()
  }
  
  // Show loading state
  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-2 text-ink-500">Loading FAQs...</p>
        </div>
      </div>
    )
  }
  
  // Show error state
  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-ink-900 mb-2">Error Loading FAQs</h3>
            <p className="text-ink-500 mb-4">{error}</p>
            <Button onClick={loadFAQs}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 sm:space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-ink-900">Frequently Asked Questions</h1>
            <p className="text-sm sm:text-base text-ink-500">Manage common questions and improve guest experience</p>
          </div>
          <Button 
            className="sm:w-auto flex-shrink-0"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add FAQ
          </Button>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col gap-4">
          {/* Answer Type Filters */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All FAQs', count: counts.all },
              { key: 'llm', label: 'AI Generated', count: counts.llm },
              { key: 'host', label: 'Host Answered', count: counts.host },
              { key: 'unanswered', label: 'Need Answers', count: counts.unanswered }
            ].map((filterOption) => (
              <Button
                key={filterOption.key}
                variant={selectedFilter === filterOption.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedFilter(filterOption.key)}
                className="capitalize text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">{filterOption.label}</span>
                <span className="sm:hidden">
                  {filterOption.key === 'llm' ? 'AI Gen' : 
                   filterOption.key === 'unanswered' ? 'Need Ans' : 
                   filterOption.label.split(' ')[0]}
                </span>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "ml-1 sm:ml-2 text-xs pointer-events-none",
                    selectedFilter === filterOption.key 
                      ? "bg-white/20 text-white" 
                      : "bg-ink-500/10 text-ink-500"
                  )}
                >
                  {filterOption.count}
                </Badge>
              </Button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="h-4 w-4 text-ink-500 flex-shrink-0" />
            <Input 
              placeholder="Search FAQs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-0"
            />
          </div>
        </div>

        {/* FAQs List */}
        <div className="space-y-4">
          {faqs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-ink-500 mb-4" />
                <h3 className="text-lg font-medium text-ink-900 mb-2">No FAQs found</h3>
                <p className="text-ink-500">
                  {searchTerm ? `No results for "${searchTerm}"` : 'Add your first FAQ to help guests get quick answers.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-900">
                  {selectedFilter === 'all' ? 'Questions by Popularity' : `${
                    selectedFilter === 'llm' ? 'AI Generated' :
                    selectedFilter === 'host' ? 'Host Answered' :
                    'Questions Needing Answers'
                  } (${sortedFaqs.length})`}
                </h3>
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <TrendingUp className="h-4 w-4" />
                  Sorted by ask frequency
                </div>
              </div>
              
              <div className="grid gap-4">
                {faqs.map((faq, index) => {
                  const typeInfo = getAnswerTypeInfo(faq.answer_type)
                  const Icon = typeInfo.icon
                  const isEditing = editingFaq === faq.id
                  
                  return (
                    <Card key={faq.id} className={`${
                      faq.answer_type === 'unanswered' ? 'border-red-200 bg-red-50/30' : ''
                    }`}>
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          {/* FAQ Header */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="flex items-center justify-center w-6 h-6 bg-ink-500/10 rounded-full text-xs font-medium text-ink-500 flex-shrink-0">
                                {index + 1}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-ink-900 mb-2 break-words">{faq.question}</h4>
                                
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color} w-fit`}>
                                    <Icon className="h-3 w-3 flex-shrink-0" />
                                    <span className="whitespace-nowrap">{typeInfo.label}</span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 text-sm text-ink-500">
                                    <TrendingUp className="h-3 w-3 flex-shrink-0" />
                                    <span className="whitespace-nowrap">Asked {faq.ask_count || 0} times</span>
                                  </div>
                                  
                                  {faq.confidence && (
                                    <Badge variant="outline" className="text-xs w-fit">
                                      {faq.confidence}% confidence
                                    </Badge>
                                  )}
                                </div>
                                
                                <p className="text-xs text-ink-500 mb-3 break-words">
                                  Last asked: {formatLastAsked(faq.last_asked)}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 flex-shrink-0">
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 w-8 p-0"
                                onClick={() => handleDeleteFAQ(faq.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Answer Section */}
                          <div className="pl-0 sm:pl-9 mt-4">
                            {faq.answer_type === 'unanswered' ? (
                              // Unanswered - Show input or current answer
                              <div className="space-y-3">
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                  <p className="text-sm text-red-800 font-medium mb-1 break-words">
                                    This question needs an answer
                                  </p>
                                  <p className="text-xs text-red-700 break-words">
                                    Help improve guest experience by providing a helpful response.
                                  </p>
                                </div>
                                
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <Label htmlFor={`answer-${faq.id}`} className="text-sm font-medium">
                                        Your Answer
                                      </Label>
                                      <textarea
                                        id={`answer-${faq.id}`}
                                        value={answerDraft}
                                        onChange={(e) => setAnswerDraft(e.target.value)}
                                        className="w-full h-24 px-3 py-2 border rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 break-words"
                                        placeholder="Type your answer here..."
                                      />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                      <Button 
                                        size="sm" 
                                        onClick={() => handleSaveAnswer(faq.id)} 
                                        className="w-full sm:w-auto"
                                        disabled={saving || !answerDraft.trim()}
                                      >
                                        <Save className="mr-2 h-4 w-4" />
                                        {saving ? 'Saving...' : 'Save Answer'}
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={handleCancelAnswering} className="w-full sm:w-auto">
                                        <X className="mr-2 h-4 w-4" />
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button size="sm" onClick={() => handleStartAnswering(faq)} className="w-full sm:w-auto">
                                    <Edit className="mr-2 h-4 w-4" />
                                    Add Answer
                                  </Button>
                                )}
                              </div>
                            ) : (
                              // Answered - Show current answer
                              <div className="space-y-2">
                                <div className="p-3 bg-gray-50 border rounded-lg">
                                  <p className="text-sm text-ink-900 break-words whitespace-pre-wrap">{faq.answer}</p>
                                </div>
                                <p className="text-xs text-ink-500 break-words">
                                  {typeInfo.description}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Add FAQ Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
            <div className="bg-white rounded-lg p-6 w-full max-w-md relative">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-ink-900">Add New FAQ</h2>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setShowAddModal(false)
                    setNewFaq({ question: '', answer: '', answer_type: 'unanswered' })
                  }}
                  className="absolute top-4 right-4 h-8 w-8 p-0 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="question" className="text-sm font-medium">
                    Question *
                  </Label>
                  <Input
                    id="question"
                    value={newFaq.question}
                    onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                    placeholder="Enter the FAQ question..."
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="answer" className="text-sm font-medium">
                    Answer (optional)
                  </Label>
                  <textarea
                    id="answer"
                    value={newFaq.answer}
                    onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                    placeholder="Enter the answer (leave blank if unanswered)..."
                    className="mt-1 w-full h-24 px-3 py-2 border rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                  />
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <Button 
                    onClick={handleAddFAQ}
                    disabled={saving || !newFaq.question.trim()}
                    className="flex-1"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Adding...' : 'Add FAQ'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowAddModal(false)
                      setNewFaq({ question: '', answer: '', answer_type: 'unanswered' })
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
} 