const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrateQueue() {
  try {
    const queuePath = path.join(__dirname, '..', '.queue.json');

    if (!fs.existsSync(queuePath)) {
      console.log('No .queue.json file found. Creating empty database.');
      return;
    }

    const queueData = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));

    if (!Array.isArray(queueData)) {
      console.error('Invalid .queue.json format');
      return;
    }

    console.log(`Migrating ${queueData.length} emails...`);

    let contactsCreated = 0;
    let emailsCreated = 0;
    let skipped = 0;

    for (const emailRecord of queueData) {
      try {
        const { to, subject, body, sentAt, failedAt, error, company, userId } = emailRecord;

        if (!to || !userId) {
          console.warn(`Skipping invalid email record: ${JSON.stringify(emailRecord)}`);
          skipped++;
          continue;
        }

        // Find or create contact by email
        let contact = await prisma.contact.findUnique({ where: { email: to } });

        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              email: to,
              name: emailRecord.contactName || to.split('@')[0],
              company: company || 'Unknown',
              state: 'emailed',
              source: 'migration'
            }
          });
          contactsCreated++;
        }

        // Create email record
        await prisma.email.create({
          data: {
            to,
            subject: subject || 'No subject',
            body: body || '',
            sentAt: sentAt ? new Date(sentAt) : null,
            failedAt: failedAt ? new Date(failedAt) : null,
            error: error || null,
            userId,
            company: company || null,
            contactId: contact.id
          }
        });
        emailsCreated++;

      } catch (err) {
        console.error(`Error migrating email to ${emailRecord.to}: ${err.message}`);
        skipped++;
      }
    }

    console.log(`\n=== Migration Complete ===`);
    console.log(`Contacts created: ${contactsCreated}`);
    console.log(`Emails migrated: ${emailsCreated}`);
    console.log(`Skipped: ${skipped}`);

    // Backup original queue
    const backupPath = queuePath + '.backup-' + new Date().toISOString().split('T')[0];
    fs.copyFileSync(queuePath, backupPath);
    console.log(`\nBackup saved to: ${backupPath}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateQueue();
