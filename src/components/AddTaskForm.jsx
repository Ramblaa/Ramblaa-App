import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

const AddTaskForm = React.memo(({ 
  newTask, 
  setNewTask, 
  initialTaskCategories, 
  contacts = [], 
  properties = [], 
  handleAddTask 
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Plus className="h-5 w-5 text-brand-600" />
        Add New Task
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <Label htmlFor="task-category">Category *</Label>
          <select
            id="task-category"
            value={newTask.category}
            onChange={(e) => setNewTask(prev => ({ ...prev, category: e.target.value }))}
            className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            <option value="">Select category</option>
            {Object.keys(initialTaskCategories).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="task-name">Task Name *</Label>
          <Input
            id="task-name"
            value={newTask.name}
            onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter task name"
          />
        </div>
        <div>
          <Label htmlFor="task-contact">Contact</Label>
          <select
            id="task-contact"
            value={newTask.contactId}
            onChange={(e) => setNewTask(prev => ({ ...prev, contactId: e.target.value }))}
            className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            <option value="">No specific contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} - {contact.type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="task-location">Location</Label>
          <select
            id="task-location"
            value={newTask.locationId}
            onChange={(e) => setNewTask(prev => ({ ...prev, locationId: e.target.value }))}
            className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            <option value="">No specific location</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button onClick={handleAddTask} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>
      <div>
        <Label htmlFor="task-requirements">Requirements & Instructions *</Label>
        <textarea
          id="task-requirements"
          value={newTask.requirements}
          onChange={(e) => setNewTask(prev => ({ ...prev, requirements: e.target.value }))}
          placeholder="Describe what needs to be done, any special requirements, and detailed instructions..."
          className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 mt-2"
        />
      </div>
    </CardContent>
  </Card>
));

AddTaskForm.displayName = 'AddTaskForm';

export default AddTaskForm; 