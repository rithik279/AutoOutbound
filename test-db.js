import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const contactCount = await prisma.contact.count();
    const emailCount = await prisma.email.count();

    console.log('\n=== Database Verification ===');
    console.log(`✓ Connected to PostgreSQL`);
    console.log(`✓ Contacts in database: ${contactCount}`);
    console.log(`✓ Emails in database: ${emailCount}`);

    // Show sample contacts
    const sampleContacts = await prisma.contact.findMany({ take: 3 });
    if (sampleContacts.length > 0) {
      console.log('\nSample contacts:');
      sampleContacts.forEach(c => {
        console.log(`  - ${c.name} (${c.email}) [${c.state}]`);
      });
    }

    // Show email stats
    const sent = await prisma.email.count({ where: { sentAt: { not: null } } });
    const pending = await prisma.email.count({ where: { sentAt: null, failedAt: null } });
    const failed = await prisma.email.count({ where: { failedAt: { not: null } } });

    console.log('\nEmail stats:');
    console.log(`  Sent: ${sent}`);
    console.log(`  Pending: ${pending}`);
    console.log(`  Failed: ${failed}`);

    console.log('\n✓ Database setup complete!');
  } catch (err) {
    console.error('✗ Database error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
