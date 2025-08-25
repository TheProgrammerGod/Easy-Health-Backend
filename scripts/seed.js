require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const pw = await bcrypt.hash('password', 12);
    const doctor = await prisma.user.upsert({
        where: { email: 'doctor@example.com'},
        update: {},
        create: {
            email: 'doctor@example.com',
            name: 'Doctor',
            role: 'provider',
            passwordHash: pw
        }
    });

    const patient = await prisma.user.upsert({
        where: { email: 'patient@example.com'},
        update: {},
        create: {
            email: 'patient@example.com',
            name: 'Patient',
            role: 'patient',
            passwordHash: pw
        }
    });

    console.log('seeded: ', {doctorId: doctor.id, patientId: patient.id})
}

main()
.catch(e => { console.error(e); process.exit(1); })
.finally(() => process.exit(0));