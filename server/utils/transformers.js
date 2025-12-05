/**
 * Response Transformers
 * Utilities to transform database rows to API response format
 * Converts snake_case database fields to camelCase API fields
 */

/**
 * Transform a database user row to API response format
 * @param {Object} user - Database user row
 * @returns {Object} Formatted user object
 */
export function formatUserResponse(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    accountId: user.account_id,
    isActive: user.is_active,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    lastLogin: user.last_login,
  };
}

/**
 * Transform a database message row to API response format
 * @param {Object} message - Database message row
 * @returns {Object} Formatted message object
 */
export function formatMessageResponse(message) {
  if (!message) return null;

  return {
    id: message.id,
    fromNumber: message.from_number,
    toNumber: message.to_number,
    body: message.body,
    messageType: message.message_type,
    requestorRole: message.requestor_role,
    propertyId: message.property_id,
    bookingId: message.booking_id,
    twilioSid: message.twilio_sid,
    createdAt: message.created_at,
  };
}

/**
 * Transform a database property row to API response format
 * @param {Object} property - Database property row
 * @returns {Object} Formatted property object
 */
export function formatPropertyResponse(property) {
  if (!property) return null;

  return {
    id: property.id,
    name: property.name,
    address: property.address,
    type: property.type,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    maxGuests: property.max_guests,
    checkinTime: property.checkin_time,
    checkoutTime: property.checkout_time,
    instructions: property.instructions,
    houseRules: property.house_rules,
    wifiName: property.wifi_name,
    wifiPassword: property.wifi_password,
    emergencyContact: property.emergency_contact,
    status: property.status,
    accountId: property.account_id,
    createdAt: property.created_at,
    updatedAt: property.updated_at,
  };
}

/**
 * Transform a database booking row to API response format
 * @param {Object} booking - Database booking row
 * @returns {Object} Formatted booking object
 */
export function formatBookingResponse(booking) {
  if (!booking) return null;

  return {
    id: booking.id,
    propertyId: booking.property_id,
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    guestPhone: booking.guest_phone,
    startDate: booking.start_date,
    endDate: booking.end_date,
    checkInTime: booking.check_in_time,
    checkOutTime: booking.check_out_time,
    status: booking.status,
    source: booking.source,
    notes: booking.notes,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
  };
}

/**
 * Transform a database task row to API response format
 * @param {Object} task - Database task row
 * @returns {Object} Formatted task object
 */
export function formatTaskResponse(task) {
  if (!task) return null;

  return {
    id: task.id,
    propertyId: task.property_id,
    bookingId: task.booking_id,
    type: task.type,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignedTo: task.assigned_to,
    dueDate: task.due_date,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    // Include property name if joined
    propertyName: task.property_name,
    assigneeName: task.assignee_name,
  };
}

/**
 * Transform a database contact row to API response format
 * @param {Object} contact - Database contact row
 * @returns {Object} Formatted contact object
 */
export function formatContactResponse(contact) {
  if (!contact) return null;

  return {
    id: contact.id,
    name: contact.name,
    serviceType: contact.service_type,
    phone: contact.phone,
    preferredLanguage: contact.preferred_language,
    notes: contact.notes,
    isActive: contact.is_active,
    accountId: contact.account_id,
    createdAt: contact.created_at,
    updatedAt: contact.updated_at,
  };
}

/**
 * Format phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
export function formatPhoneForDisplay(phone) {
  if (!phone) return 'Unknown';
  // Remove whatsapp: prefix and format
  const cleaned = phone.replace('whatsapp:', '').replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone.replace('whatsapp:', '');
}

/**
 * Get user initials from first and last name
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string} Initials (e.g., "JD" for John Doe)
 */
export function getInitials(firstName, lastName) {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return `${first}${last}` || '?';
}

/**
 * Format timestamp for display
 * @param {string|Date} timestamp
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted timestamp
 */
export function formatTimestamp(timestamp, options = {}) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const defaultOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  };

  return date.toLocaleDateString('en-US', defaultOptions);
}
