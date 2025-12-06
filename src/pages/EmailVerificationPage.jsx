import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useAuth } from '../contexts/AuthContext'

export default function EmailVerificationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('verifying') // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const { verifyEmail, resendVerification, isLoading } = useAuth()

  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      setStatus('error')
      setMessage('Invalid verification link. Please check your email for the correct link.')
      return
    }

    handleVerification(token)
  }, [searchParams])

  const handleVerification = async (token) => {
    try {
      const result = await verifyEmail(token)
      
      if (result.success) {
        setStatus('success')
        setMessage('Your email has been verified successfully! You can now sign in.')
      } else {
        setStatus('error')
        setMessage(result.error || 'Email verification failed')
      }
    } catch (error) {
      setStatus('error')
      setMessage('An unexpected error occurred during verification.')
    }
  }

  const handleResendVerification = async () => {
    if (!email) {
      setMessage('Please enter your email address')
      return
    }

    const result = await resendVerification(email)
    
    if (result.success) {
      setMessage('Verification email sent! Please check your inbox.')
    } else {
      setMessage(result.error || 'Failed to send verification email')
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'verifying':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-brand-600 border-t-transparent rounded-full"
          />
        )
      case 'success':
        return (
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
      default:
        return 'text-brand-600'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-ink-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 w-20 h-20 bg-brand-600 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-white">R</span>
            </div>
            <CardTitle className="text-2xl text-ink-900">
              {status === 'verifying' && 'Verifying Email...'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error' && 'Verification Failed'}
            </CardTitle>
            <CardDescription className="text-ink-500">
              {status === 'verifying' && 'Please wait while we verify your email address'}
              {status === 'success' && 'Your account is now active and ready to use'}
              {status === 'error' && 'There was an issue verifying your email'}
            </CardDescription>
          </CardHeader>

          <CardContent className="text-center space-y-6">
            <div className="flex justify-center">
              {getStatusIcon()}
            </div>

            {message && (
              <div className={`p-4 rounded-lg ${
                status === 'success' 
                  ? 'bg-green-50 border border-green-200' 
                  : status === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}>
                <p className={`text-sm ${getStatusColor()}`}>
                  {message}
                </p>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Sign In Now
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Enter your email to resend verification
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                </div>
                
                <div className="space-y-2">
                  <Button
                    onClick={handleResendVerification}
                    disabled={isLoading || !email}
                    className="w-full"
                  >
                    {isLoading ? 'Sending...' : 'Resend Verification Email'}
                  </Button>
                  
                  <Button
                    onClick={() => navigate('/login')}
                    variant="outline"
                    className="w-full"
                  >
                    Back to Login
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}