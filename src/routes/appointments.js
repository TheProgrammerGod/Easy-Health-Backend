// src/routes/appointments.js
const { Router } = require('express');
const { prisma } = require('../db');
const { authRequired } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const r = Router();

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
 * body: { providerId, slotDate, slotTime, reason? }
 * Books an appointment for the authenticated user
 */
r.post('/book', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const { providerId, slotDate, slotTime, reason } = req.body || {};
    const patientId = req.auth.userId;
    
    console.log('Booking request:', { providerId, slotDate, slotTime, reason });
    
    // Validate input
    if (!providerId || !slotDate || !slotTime) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Check if provider exists in database
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!provider) {
      return res.status(404).json({ error: 'provider_not_found' });
    }

    // Verify the provider user has the correct role
    if (provider.user.role !== 'provider') {
      return res.status(400).json({ error: 'invalid_provider' });
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

    // Check if this time slot is already booked for this provider
    const existingSlot = await prisma.providerSlot.findFirst({
      where: {
        providerId: providerId,
        startTime: slotDateTime,
        isBooked: true
      }
    });

    if (existingSlot) {
      return res.status(409).json({ error: 'slot_already_booked' });
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Create a provider slot first
      const providerSlot = await tx.providerSlot.create({
        data: {
          providerId: providerId,
          startTime: slotDateTime,
          endTime: endTime,
          isBooked: true
        }
      });

      // Create the appointment
      const appointment = await tx.appointment.create({
        data: {
          providerId: provider.user.id, // Use the User ID for the appointment
          patientId: patientId,
          slotId: providerSlot.id,
          status: 'booked',
          reason: reason || null
        },
        include: {
          slot: true,
          provider: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        }
      });

      return { appointment, providerSlot, provider };
    });

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: result.appointment.id,
        providerId: providerId,
        providerName: provider.user.name,
        providerSpeciality: provider.speciality,
        date: slotDate,
        time: slotTime,
        status: result.appointment.status,
        reason: result.appointment.reason,
        appointmentFee: provider.appointmentFee,
        createdAt: result.appointment.createdAt
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
        slot: {
          include: {
            provider: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform appointments with provider data from database
    const enrichedAppointments = appointments.map(appointment => {
      const provider = appointment.slot.provider;
      
      return {
        id: appointment.id,
        provider: {
          id: provider.id,
          name: provider.user.name,
          speciality: provider.speciality,
          experience: provider.experience,
          appointmentFee: provider.appointmentFee,
          description: provider.description
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

    // Update appointment status and slot availability using transaction
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
 * GET /appointments/available-slots/:providerId
 * Returns available slots for a provider
 */
r.get('/available-slots/:providerId', authRequired, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { date } = req.query; // Expected format: YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ error: 'date_required' });
    }

    // Check if provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });

    if (!provider) {
      return res.status(404).json({ error: 'provider_not_found' });
    }

    // Get booked slots for the date
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const bookedSlots = await prisma.providerSlot.findMany({
      where: {
        providerId: providerId,
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

    res.json({ 
      provider: {
        id: provider.id,
        name: provider.user.name,
        speciality: provider.speciality,
        appointmentFee: provider.appointmentFee
      },
      availableSlots 
    });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ error: 'fetch_slots_failed' });
  }
});

/**
 * GET /appointments/providers
 * Returns all available providers
 */
r.get('/providers', authRequired, async (req, res) => {
  try {
    const providers = await prisma.provider.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        user: {
          createdAt: 'desc'
        }
      }
    });

    const formattedProviders = providers.map(provider => ({
      id: provider.id,
      name: provider.user.name,
      email: provider.user.email,
      speciality: provider.speciality,
      description: provider.description,
      experience: provider.experience,
      appointmentFee: Number(provider.appointmentFee),
      createdAt: provider.user.createdAt
    }));

    res.json({
      providers: formattedProviders,
      total: formattedProviders.length
    });

  } catch (error) {
    console.error('Fetch providers error:', error);
    res.status(500).json({ error: 'fetch_providers_failed' });
  }
});

module.exports = r;