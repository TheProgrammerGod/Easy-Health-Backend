// src/routes/appointments.js
const { Router } = require('express');
const { prisma } = require('../db');
const { authRequired } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { compare } = require('bcryptjs');

const r = Router();

// Dummy doctors data (since you don't have a doctors API yet)
const dummyDoctors = [
  {
    id: 'doc1',
    name: 'Dr. Richard James',
    speciality: 'General physician',
    degree: 'MBBS',
    experience: '4 Years',
    about: 'Dr. Davis has a strong commitment to delivering comprehensive medical care, focusing on preventive medicine, early diagnosis, and effective treatment strategies.',
    fees: 50,
    address: { line1: '17th Cross, Richmond', line2: 'Circle, Ring Road, London' },
    image: '/api/placeholder/doctor1.jpg'
  },
  {
    id: 'doc_2', 
    name: 'Dr. Emily Larson',
    speciality: 'Gynecologist',
    degree: 'MBBS',
    experience: '3 Years',
    about: 'Dr. Larson has a strong commitment to delivering comprehensive medical care, focusing on preventive medicine, early diagnosis, and effective treatment strategies.',
    fees: 60,
    address: { line1: '27th Cross, Richmond', line2: 'Circle, Ring Road, London' },
    image: '/api/placeholder/doctor2.jpg'
  },
  {
    id: 'doc_3',
    name: 'Dr. Sarah Patel',
    speciality: 'Dermatologist', 
    degree: 'MBBS',
    experience: '1 Years',
    about: 'Dr. Patel has a strong commitment to delivering comprehensive medical care, focusing on preventive medicine, early diagnosis, and effective treatment strategies.',
    fees: 30,
    address: { line1: '37th Cross, Richmond', line2: 'Circle, Ring Road, London' },
    image: '/api/placeholder/doctor3.jpg'
  }
];
function normalizeTime(timeStr) {
  // Match 12-hour format e.g. "06:00 pm" or "6:00 AM"
  const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)/);
  if (ampmMatch) {
    let [_, hour, minute, period] = ampmMatch;
    hour = parseInt(hour, 10);
    if (period.toLowerCase() === "pm" && hour < 12) {
      hour += 12;
    }
    if (period.toLowerCase() === "am" && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  // Otherwise assume it's already "HH:mm"
  return timeStr;
}

/**
 * POST /appointments/book
 * body: { doctorId, slotDate, slotTime, reason? }
 * Books an appointment for the authenticated user
 */
r.post('/book', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const { doctorId, slotDate, slotTime, reason } = req.body || {};
    const patientId = req.auth.userId;
    console.log(doctorId,slotDate,slotTime,reason)
    // Validate input
    if (!doctorId || !slotDate || !slotTime) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Check if doctor exists in dummy data
    const doctor = dummyDoctors.find(doc => doc.id === doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'doctor_not_found' });
    }

    // Parse slot date and time
    const [day, month, year] = slotDate.split("_");

    const normalizedTime = normalizeTime(slotTime);

    const slotDateTime = new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(
        2,
        "0"
      )}T${normalizedTime}:00`
    );

    console.log("slotDateTime:", slotDateTime);
    if (isNaN(slotDateTime.getTime())) {
      return res.status(400).json({ error: 'invalid_date_time' });
    }

    // Check if slot is in the past
    if (slotDateTime < new Date()) {
      return res.status(400).json({ error: 'cannot_book_past_slot' });
    }

    // Create slot end time (30 minutes later)
    const endTime = new Date(slotDateTime);
    endTime.setMinutes(endTime.getMinutes() + 30);

    // Create a provider slot first
    const providerSlot = await prisma.providerSlot.create({
      data: {
        providerId: doctorId, // Using doctorId as providerId for now
        startTime: slotDateTime,
        endTime: endTime,
        isBooked: true
      }
    });

    // Create the appointment
    const appointment = await prisma.appointment.create({
      data: {
        providerId: doctorId,
        patientId: patientId,
        slotId: providerSlot.id,
        status: 'booked',
        reason: reason || null
      },
      include: {
        slot: true
      }
    });

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: appointment.id,
        doctorId: doctorId,
        doctorName: doctor.name,
        date: slotDate,
        time: slotTime,
        status: appointment.status,
        reason: appointment.reason,
        createdAt: appointment.createdAt
      }
    });

  } catch (error) {
    console.error('Booking error:', error);
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'slot_already_booked' });
    }
    
    res.status(500).json({ error: 'booking_failed' });
  }
});

/**
 * GET /appointments/my-appointments
 * Returns all appointments for the authenticated user
 */
r.get('/my-appointments', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const patientId = req.auth.userId;

    const appointments = await prisma.appointment.findMany({
      where: {
        patientId: patientId
      },
      include: {
        slot: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Enrich appointments with doctor data from dummy data
    const enrichedAppointments = appointments.map(appointment => {
      const doctor = dummyDoctors.find(doc => doc.id === appointment.providerId) || {
        id: appointment.providerId,
        name: 'Unknown Doctor',
        speciality: 'General',
        address: { line1: 'Address not available', line2: '' },
        image: '/api/placeholder/default-doctor.jpg'
      };

      return {
        id: appointment.id,
        doctor: {
          id: doctor.id,
          name: doctor.name,
          speciality: doctor.speciality,
          image: doctor.image,
          address: doctor.address
        },
        date: appointment.slot.startTime,
        time: appointment.slot.startTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        status: appointment.status,
        reason: appointment.reason,
        createdAt: appointment.createdAt
      };
    });

    res.json({
      appointments: enrichedAppointments,
      total: enrichedAppointments.length
    });

  } catch (error) {
    console.error('Fetch appointments error:', error);
    res.status(500).json({ error: 'fetch_failed' });
  }
});

/**
 * PUT /appointments/:appointmentId/cancel
 * Cancels an appointment
 */
r.put('/:appointmentId/cancel', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const patientId = req.auth.userId;

    // Find the appointment
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        patientId: patientId
      },
      include: {
        slot: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'appointment_not_found' });
    }

    // Check if appointment can be cancelled (not in the past and not already cancelled)
    if (appointment.slot.startTime < new Date()) {
      return res.status(400).json({ error: 'cannot_cancel_past_appointment' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'appointment_already_cancelled' });
    }

    // Update appointment status and slot availability
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'cancelled' }
      }),
      prisma.providerSlot.update({
        where: { id: appointment.slotId },
        data: { isBooked: false }
      })
    ]);

    res.json({ message: 'Appointment cancelled successfully' });

  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ error: 'cancel_failed' });
  }
});

/**
 * GET /appointments/available-slots/:doctorId
 * Returns available slots for a doctor (for future use)
 */
r.get('/available-slots/:doctorId', authRequired, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query; // Expected format: YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ error: 'date_required' });
    }

    // Check if doctor exists
    const doctor = dummyDoctors.find(doc => doc.id === doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'doctor_not_found' });
    }

    // Get booked slots for the date
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const bookedSlots = await prisma.providerSlot.findMany({
      where: {
        providerId: doctorId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay
        },
        isBooked: true
      }
    });

    // Generate available time slots (10 AM to 9 PM, 30-minute intervals)
    const availableSlots = [];
    const slotDate = new Date(date);
    
    for (let hour = 10; hour < 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotTime = new Date(slotDate);
        slotTime.setHours(hour, minute, 0, 0);
        
        // Check if this slot is already booked
        const isBooked = bookedSlots.some(slot => 
          slot.startTime.getTime() === slotTime.getTime()
        );
        
        // Check if slot is in the future
        const isFuture = slotTime > new Date();
        
        if (!isBooked && isFuture) {
          availableSlots.push({
            time: slotTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            datetime: slotTime
          });
        }
      }
    }

    res.json({ availableSlots });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ error: 'fetch_slots_failed' });
  }
});

module.exports = r;