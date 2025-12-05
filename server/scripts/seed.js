/**
 * Seed Script - Add test property data
 * Run with: node scripts/seed.js
 */

const API_URL = 'http://localhost:3001/api';

async function seed() {
  console.log('🌱 Seeding database...\n');

  // 1. Create a property
  console.log('Creating property...');
  const propertyRes = await fetch(`${API_URL}/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Sunset Villa Amsterdam',
      address: '123 Canal Street, Amsterdam, Netherlands',
      hostPhone: '+31612345678',
      hostName: 'Danyon',
      details: {
        checkInTime: '15:00',
        checkOutTime: '11:00',
        maxGuests: 4,
        bedrooms: 2,
        bathrooms: 1,
      },
    }),
  });
  const property = await propertyRes.json();
  console.log('✅ Property created:', property.name, '(ID:', property.id, ')\n');

  // 2. Add FAQs (including WiFi!)
  console.log('Adding FAQs...');
  const faqs = [
    {
      subCategory: 'WiFi',
      description: 'WiFi network and password',
      details: {
        SSID: 'SunsetVilla_Guest',
        Password: 'Welcome2024!',
        notes: 'Connect to SunsetVilla_Guest network. Password is Welcome2024!',
      },
    },
    {
      subCategory: 'Check-in',
      description: 'Check-in instructions',
      details: {
        time: '15:00',
        method: 'Self check-in with lockbox',
        lockboxCode: '4521',
        location: 'Lockbox is on the right side of the front door',
      },
    },
    {
      subCategory: 'Check-out',
      description: 'Check-out instructions',
      details: {
        time: '11:00',
        instructions: 'Please leave keys on the kitchen counter, take out trash, and close all windows.',
      },
    },
    {
      subCategory: 'Parking',
      description: 'Parking information',
      details: {
        type: 'Street parking',
        permit: 'Not required on weekends. Weekday permit in welcome folder.',
        notes: 'Free parking available on Sundays',
      },
    },
    {
      subCategory: 'House Rules',
      description: 'Property rules',
      details: {
        noSmoking: true,
        noPets: true,
        quietHours: '22:00 - 08:00',
        maxGuests: 4,
      },
    },
  ];

  for (const faq of faqs) {
    await fetch(`${API_URL}/properties/${property.id}/faqs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(faq),
    });
    console.log('  ✅', faq.subCategory);
  }
  console.log('');

  // 3. Add staff
  console.log('Adding staff...');
  const staffRes = await fetch(`${API_URL}/properties/${property.id}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Maria Garcia',
      phone: '+31687654321',
      role: 'Staff',
      preferredLanguage: 'en',
      details: { specialty: 'Housekeeping' },
    }),
  });
  const staff = await staffRes.json();
  console.log('✅ Staff added:', staff.name, '\n');

  // 4. Create a booking for the test phone number
  console.log('Creating booking for +31630211666...');
  const today = new Date();
  const checkIn = today.toISOString().split('T')[0];
  const checkOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const bookingRes = await fetch(`${API_URL}/properties/${property.id}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestName: 'Test Guest',
      guestPhone: '+31630211666',
      guestEmail: 'test@example.com',
      startDate: checkIn,
      endDate: checkOut,
      details: {
        guests: 2,
        platform: 'Airbnb',
        confirmationCode: 'HM12345',
      },
    }),
  });
  const booking = await bookingRes.json();
  console.log('✅ Booking created for dates:', checkIn, 'to', checkOut, '\n');

  // 5. Add task definitions
  console.log('Adding task definitions...');
  const taskDefs = [
    {
      subCategory: 'Fresh Towels',
      staffRequirements: 'Confirm delivery time',
      guestRequirements: 'Preferred delivery time',
      hostEscalation: 'Guest complaints about quality',
    },
    {
      subCategory: 'Extra Cleaning',
      staffRequirements: 'Confirm availability and time',
      guestRequirements: 'Specific areas to clean',
      hostEscalation: 'Request for deep cleaning or special equipment',
    },
    {
      subCategory: 'Maintenance',
      staffRequirements: 'Confirm issue and ETA',
      guestRequirements: 'Description of issue',
      hostEscalation: 'Major repairs, safety issues, or cost approval needed',
    },
  ];

  // Note: Task definitions would need a separate endpoint - skipping for now
  console.log('  (Task definitions require direct DB access - skipping)\n');

  console.log('🎉 Seeding complete!\n');
  console.log('Property ID:', property.id);
  console.log('Booking linked to: +31630211666');
  console.log('\nTest message: "What is the WiFi password?"');
  console.log('Expected response: Should include SSID and password from FAQs');
}

seed().catch(console.error);

