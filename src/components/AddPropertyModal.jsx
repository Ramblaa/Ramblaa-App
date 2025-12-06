import React from 'react';
import { Plus, X, MapPin, Clock, Shield } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

const AddPropertyModal = React.memo(({ 
  newProperty, 
  handleInputChange, 
  handleAddProperty, 
  setShowAddModal 
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ink-900">Add New Property</h2>
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
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1">
                <Label htmlFor="property-name" className="text-sm font-medium">Property Name *</Label>
                <Input
                  id="property-name"
                  value={newProperty.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g. Sunset Villa, Mountain Retreat"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="property-type" className="text-sm font-medium">Property Type *</Label>
                <select
                  id="property-type"
                  value={newProperty.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                >
                  <option value="">Select Type</option>
                  <option value="villa">Villa</option>
                  <option value="apartment">Apartment</option>
                  <option value="house">House</option>
                  <option value="condo">Condo</option>
                  <option value="cabin">Cabin</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="property-address" className="text-sm font-medium">Full Address *</Label>
              <Input
                id="property-address"
                value={newProperty.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter complete address"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1">
                <Label htmlFor="property-bedrooms" className="text-sm font-medium">Bedrooms</Label>
                <Input
                  id="property-bedrooms"
                  type="number"
                  min="0"
                  value={newProperty.bedrooms}
                  onChange={(e) => handleInputChange('bedrooms', parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="property-bathrooms" className="text-sm font-medium">Bathrooms</Label>
                <Input
                  id="property-bathrooms"
                  type="number"
                  min="0"
                  step="0.5"
                  value={newProperty.bathrooms}
                  onChange={(e) => handleInputChange('bathrooms', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="property-max-guests" className="text-sm font-medium">Max Guests</Label>
                <Input
                  id="property-max-guests"
                  type="number"  
                  min="1"
                  value={newProperty.maxGuests}
                  onChange={(e) => handleInputChange('maxGuests', parseInt(e.target.value) || 1)}
                  placeholder="1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access & WiFi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Access & WiFi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1">
                <Label htmlFor="wifi-name">WiFi Network Name</Label>
                <Input
                  id="wifi-name"
                  value={newProperty.wifiName}
                  onChange={(e) => handleInputChange('wifiName', e.target.value)}
                  placeholder="Enter WiFi network name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wifi-password">WiFi Password</Label>
                <Input
                  id="wifi-password"
                  value={newProperty.wifiPassword}
                  onChange={(e) => handleInputChange('wifiPassword', e.target.value)}
                  placeholder="Enter WiFi password"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="emergency-contact">Emergency Contact</Label>
              <Input
                id="emergency-contact"
                value={newProperty.emergencyContact}
                onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
                placeholder="Enter emergency contact number"
              />
            </div>
          </CardContent>
        </Card>

        {/* Check-in Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Check-in Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="new-instructions">Instructions</Label>
            <textarea 
              id="new-instructions"
              className="w-full h-32 px-3 py-2 border border-input rounded-md text-sm mt-2"
              value={newProperty.instructions}
              onChange={(e) => handleInputChange('instructions', e.target.value)}
              placeholder="Enter detailed check-in instructions for guests..."
            />
          </CardContent>
        </Card>

        {/* House Rules */}
        <Card>
          <CardHeader>
            <CardTitle>House Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="new-house-rules">Rules</Label>
            <textarea 
              id="new-house-rules"
              className="w-full h-32 px-3 py-2 border border-input rounded-md text-sm mt-2"
              value={newProperty.houseRules}
              onChange={(e) => handleInputChange('houseRules', e.target.value)}
              placeholder="Enter house rules (e.g., • No smoking inside&#10;• Quiet hours: 10 PM - 8 AM)"
            />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-3">
        <Button 
          variant="outline"
          onClick={() => setShowAddModal(false)}
        >
          Cancel
        </Button>
        <Button onClick={handleAddProperty}>
          <Plus className="mr-2 h-4 w-4" />
          Add Property
        </Button>
      </div>
    </div>
  </div>
));

AddPropertyModal.displayName = 'AddPropertyModal';

export default AddPropertyModal; 