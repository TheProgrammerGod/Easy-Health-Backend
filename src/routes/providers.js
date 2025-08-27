const express = require('express');
const r = express.Router();
// const authRequired = require('../middlewares/auth.js');
const {prisma} = require('../db');
const { authRequired } = require('../middleware/auth');

// GET /providers/:providerId/available-slots
// Generate and return only available slots for the next 5 days
r.get('/:providerId/available-slots', authRequired, async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const availableSlots = [];
    const now = new Date();
    
    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      const currentDate = new Date(now);
      currentDate.setDate(now.getDate() + dayOffset);
      currentDate.setHours(10, 0, 0, 0);
      
      while (currentDate.getHours() < 20 || (currentDate.getHours() === 20 && currentDate.getMinutes() === 0)) {
        const startTime = new Date(currentDate);
        const endTime = new Date(currentDate);
        endTime.setMinutes(endTime.getMinutes() + 30);
        
        // Skip slots that are in the past
        if (startTime > now) {
          availableSlots.push({
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            providerId
          });
        }
        
        currentDate.setMinutes(currentDate.getMinutes() + 30);
      }
    }
    
    // Get all booked slots for this provider in the next 5 days
    const fiveDaysFromNow = new Date(now);
    fiveDaysFromNow.setDate(now.getDate() + 5);
    
    const bookedSlots = await prisma.providerSlot.findMany({
      where: {
        providerId,
        startTime: {
          gte: now,
          lte: fiveDaysFromNow
        },
        isBooked: true
      },
      select: {
        startTime: true,
        endTime: true
      }
    });
    
    const bookedSlotTimes = new Set(
      bookedSlots.map(slot => slot.startTime.toISOString())
    );
    
    // Filter out booked slots
    const onlyAvailableSlots = availableSlots.filter(slot => 
      !bookedSlotTimes.has(slot.startTime)
    );
    
    res.json({ 
      availableSlots: onlyAvailableSlots,
      totalCount: onlyAvailableSlots.length 
    });
    
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'fetch_available_slots_failed' });
  }
});

module.exports = r;
