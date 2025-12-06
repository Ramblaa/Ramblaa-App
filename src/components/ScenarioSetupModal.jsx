import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, User, MapPin, FileText, Loader2, Phone } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { getSandboxProperties } from '../services/sandboxService';
import apiService from '../services/api';

const ScenarioSetupModal = ({ isOpen, onClose, onCreateSession }) => {
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState([]);
  const [formData, setFormData] = useState({
    property_id: '',
    guest_name: '',
    guest_phone: '',
    check_in_date: '',
    check_out_date: '',
    initial_context: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadProperties();
      // Set default dates (today and tomorrow)
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      setFormData(prev => ({
        ...prev,
        check_in_date: today.toISOString().split('T')[0],
        check_out_date: tomorrow.toISOString().split('T')[0]
      }));
    }
  }, [isOpen]);

  const loadProperties = async () => {
    try {
      const response = await apiService.getSandboxProperties();
      setProperties(response.data || []);
    } catch (error) {
      console.error('Error loading properties:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const scenario = {
        property_id: parseInt(formData.property_id),
        guest_name: formData.guest_name,
        guest_phone: formData.guest_phone || '+1234567890',
        check_in_date: formData.check_in_date,
        check_out_date: formData.check_out_date,
        initial_context: formData.initial_context
      };

      // Auto-generate session name
      const selectedProperty = properties.find(p => p.id === parseInt(formData.property_id));
      const sessionName = `${formData.guest_name} - ${selectedProperty?.name || 'Property'}`;

      const sessionData = {
        session_name: sessionName,
        scenario
      };

      await onCreateSession(sessionData);
      onClose();

      // Reset form
      setFormData({
        property_id: '',
        guest_name: '',
        guest_phone: '',
        check_in_date: '',
        check_out_date: '',
        initial_context: ''
      });
    } catch (error) {
      console.error('Error creating session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const selectedProperty = properties.find(p => p.id === parseInt(formData.property_id));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-xl font-bold text-ink-900">
                  Create Sandbox Scenario
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Property Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="property_id" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Property *
                    </Label>
                    <select
                      id="property_id"
                      value={formData.property_id}
                      onChange={(e) => handleInputChange('property_id', e.target.value)}
                      required
                      className="w-full h-10 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                    >
                      <option value="">Select a property...</option>
                      {properties.map(property => (
                        <option key={property.id} value={property.id}>
                          {property.name} - {property.address}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Property Details */}
                  {selectedProperty && (
                    <div className="p-3 bg-brand-100/20 rounded-lg border border-brand-200">
                      <h4 className="font-medium text-ink-900 mb-1">{selectedProperty.name}</h4>
                      <p className="text-sm text-ink-500">{selectedProperty.address}</p>
                      <div className="flex gap-4 mt-2 text-sm text-ink-500">
                        <span>Check-in: {selectedProperty.check_in_time}</span>
                        <span>Check-out: {selectedProperty.check_out_time}</span>
                      </div>
                    </div>
                  )}

                  {/* Guest Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="guest_name" className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Guest Name *
                      </Label>
                      <Input
                        id="guest_name"
                        value={formData.guest_name}
                        onChange={(e) => handleInputChange('guest_name', e.target.value)}
                        placeholder="e.g., Sarah Johnson"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="guest_phone" className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Guest Phone
                      </Label>
                      <Input
                        id="guest_phone"
                        value={formData.guest_phone}
                        onChange={(e) => handleInputChange('guest_phone', e.target.value)}
                        placeholder="e.g., +1 555 123 4567"
                      />
                      <p className="text-xs text-ink-500">
                        Optional - will use a demo number if not provided
                      </p>
                    </div>
                  </div>

                  {/* Booking Dates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="check_in_date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Check-in Date *
                      </Label>
                      <Input
                        id="check_in_date"
                        type="date"
                        value={formData.check_in_date}
                        onChange={(e) => handleInputChange('check_in_date', e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="check_out_date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Check-out Date *
                      </Label>
                      <Input
                        id="check_out_date"
                        type="date"
                        value={formData.check_out_date}
                        onChange={(e) => handleInputChange('check_out_date', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Initial Context */}
                  <div className="space-y-2">
                    <Label htmlFor="initial_context">Initial Message (Optional)</Label>
                    <textarea
                      id="initial_context"
                      value={formData.initial_context}
                      onChange={(e) => handleInputChange('initial_context', e.target.value)}
                      placeholder="e.g., Hi! I just arrived and can't find the key code. Could you help me get into the property?"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 resize-none"
                    />
                    <p className="text-xs text-ink-500">
                      Start the scenario with a specific guest message
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading || !formData.property_id || !formData.guest_name}
                      className="min-w-[120px]"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Scenario'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ScenarioSetupModal;