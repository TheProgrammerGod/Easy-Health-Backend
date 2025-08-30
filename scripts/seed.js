// scripts/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const pw = await bcrypt.hash('password', 12);
        
        // Create or update doctor user
        const doctor = await prisma.user.upsert({
            where: { email: 'doctor@example.com'},
            update: {},
            create: {
                email: 'doctor@example.com',
                name: 'Dr. John Smith',
                role: 'provider',
                passwordHash: pw,
                phone: '+1234567890'
            }
        });

        // Create or update patient user
        const patient = await prisma.user.upsert({
            where: { email: 'patient@example.com'},
            update: {},
            create: {
                email: 'patient@example.com',
                name: 'Jane Doe',
                role: 'patient',
                passwordHash: pw,
                phone: '+0987654321'
            }
        });

        // Create provider record for doctor
        const provider = await prisma.provider.upsert({
            where: { userId: doctor.id },
            update: {},
            create: {
                userId: doctor.id,
                speciality: 'General Medicine',
                description: 'Experienced general physician with focus on preventive care and comprehensive treatment',
                experience: '8 years',
                appointmentFee: 75.00
            }
        });

        console.log('✅ Seeded successfully:');
        console.log('Doctor User ID:', doctor.id);
        console.log('Provider ID:', provider.id);
        console.log('Patient User ID:', patient.id);
        
        console.log('\n📝 Example API request for booking:');
        console.log(JSON.stringify({
            providerId: provider.id,
            slotDate: "2025-08-31",
            slotTime: "10:30",
            reason: "Regular check-up"
        }, null, 2));

        // Also handle your specific existing doctor
        const existingDoctorId = '4d7de04a-18c7-489a-ad02-6df25d623fc8';
        
        const existingDoctor = await prisma.user.findUnique({
            where: { id: existingDoctorId }
        });

        if (existingDoctor && existingDoctor.role === 'provider') {
            const existingProvider = await prisma.provider.upsert({
                where: { userId: existingDoctorId },
                update: {},
                create: {
                    userId: existingDoctorId,
                    speciality: 'General Medicine',
                    description: `Dr. ${existingDoctor.name} - Experienced medical practitioner`,
                    experience: '5+ years',
                    appointmentFee: 50.00
                }
            });
            
            console.log('\n✅ Also created provider for existing doctor:');
            console.log('Existing Doctor User ID:', existingDoctorId);
            console.log('Existing Provider ID:', existingProvider.id);
            
            console.log('\n📝 Example API request for your existing doctor:');
            console.log(JSON.stringify({
                providerId: existingProvider.id,
                slotDate: "2025-08-31",
                slotTime: "10:30",
                reason: "Regular check-up"
            }, null, 2));
        }

    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main()
.catch(e => { console.error(e); process.exit(1); })
.finally(() => process.exit(0));