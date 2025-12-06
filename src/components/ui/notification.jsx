import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Info, 
  X 
} from 'lucide-react'
import { Button } from './button'

const Notification = ({ 
  type = 'info', 
  title, 
  message, 
  isVisible, 
  onClose, 
  autoClose = true, 
  duration = 5000 
}) => {
  useEffect(() => {
    if (autoClose && isVisible) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [autoClose, duration, isVisible, onClose])

  const getNotificationStyle = (type) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50 border-green-200',
          icon: CheckCircle,
          iconColor: 'text-green-600',
          titleColor: 'text-green-800',
          messageColor: 'text-green-700'
        }
      case 'warning':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: AlertTriangle,
          iconColor: 'text-yellow-600',
          titleColor: 'text-yellow-800',
          messageColor: 'text-yellow-700'
        }
      case 'error':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: XCircle,
          iconColor: 'text-red-600',
          titleColor: 'text-red-800',
          messageColor: 'text-red-700'
        }
      case 'info':
      default:
        return {
          bg: 'bg-brand-100 border-brand-600/20',
          icon: Info,
          iconColor: 'text-brand-600',
          titleColor: 'text-ink-900',
          messageColor: 'text-ink-500'
        }
    }
  }

  const style = getNotificationStyle(type)
  const Icon = style.icon

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className={`max-w-md w-full border rounded-lg p-6 shadow-lg ${style.bg}`}
      >
        <div className="flex items-start gap-4">
          <Icon className={`h-6 w-6 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
          
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className={`text-sm font-semibold mb-1 ${style.titleColor}`}>
                {title}
              </h3>
            )}
            <p className={`text-sm ${style.messageColor}`}>
              {message}
            </p>
          </div>

          <Button 
            variant="ghost" 
            size="icon"
            className="h-6 w-6 p-0 hover:bg-black/10"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button 
            size="sm"
            className="bg-brand-600 hover:bg-brand-600/90 text-white"
            onClick={onClose}
          >
            OK
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default Notification 