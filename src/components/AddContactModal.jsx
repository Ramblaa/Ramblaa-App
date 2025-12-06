import React from 'react';
import { Plus, X, MapPin, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

const AddContactModal = React.memo(({ 
  newContact, 
  handleNewContactChange, 
  toggleServiceLocation, 
  availableProperties, 
  handleAddContact, 
  setShowAddModal, 
  loading 
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ink-900">Add New Contact</h2>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setShowAddModal(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <Label htmlFor="new-contact-name" className="text-sm font-medium">Name or Business Name *</Label>
              <Input 
                id="new-contact-name" 
                value={newContact.name}
                onChange={(e) => handleNewContactChange('name', e.target.value)}
                placeholder="Enter name or business name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-contact-type" className="text-sm font-medium">Service Type *</Label>
              <Input 
                id="new-contact-type" 
                value={newContact.service_type}
                onChange={(e) => handleNewContactChange('service_type', e.target.value)}
                placeholder="e.g. Cleaning Service, Maintenance, Tour Guide"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-contact-phone" className="text-sm font-medium">Phone Number *</Label>
              <Input 
                id="new-contact-phone" 
                value={newContact.phone}
                onChange={(e) => handleNewContactChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-contact-language" className="text-sm font-medium">Preferred Language</Label>
              <select 
                id="new-contact-language"
                value={newContact.preferred_language}
                onChange={(e) => handleNewContactChange('preferred_language', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="it">Italian</option>
                <option value="de">German</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-contact-notes" className="text-sm font-medium">Notes</Label>
              <Input 
                id="new-contact-notes" 
                value={newContact.notes}
                onChange={(e) => handleNewContactChange('notes', e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </CardContent>
        </Card>

        {/* Service Locations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Service Locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-sm text-ink-500 mb-3 block">
              Select which properties this contact can service:
            </Label>
            <div className="space-y-2">
              {availableProperties.map((property) => (
                <label key={property.id} className="flex items-center gap-3 p-2 rounded border hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newContact.serviceLocations.includes(property.id)}
                    onChange={() => toggleServiceLocation(property.id, true)}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-ink-900">{property.name}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-3">
        <Button 
          variant="outline"
          onClick={() => setShowAddModal(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleAddContact}
          disabled={loading}
        >
          {loading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Add Contact
        </Button>
      </div>
    </div>
  </div>
));

AddContactModal.displayName = 'AddContactModal';

export default AddContactModal; 