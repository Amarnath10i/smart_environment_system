import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()

async function main() {
  const pw = bcrypt.hashSync('password', 10)

  // `update` carries the display fields rather than being empty: with `update: {}`
  // a re-run left an existing row exactly as it was, so the names below never
  // reached rows created before they were added -- the demo accounts stayed
  // nameless and the UI rendered them as "Anonymous". Passwords are left out of
  // `update` deliberately, so re-seeding never resets a real chosen password.
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { name: 'Admin', role: 'admin', isVerified: true },
    create: { email: 'admin@example.com', password: pw, name: 'Admin', role: 'admin', isVerified: true }
  })
  const analyst = await prisma.user.upsert({
    where: { email: 'analyst@example.com' },
    update: { name: 'Dr. Priya Sharma', role: 'analyst', isVerified: true },
    create: { email: 'analyst@example.com', password: pw, name: 'Dr. Priya Sharma', role: 'analyst', isVerified: true }
  })

  // Sensors with Indian city names
  const sensors = await Promise.all([
    prisma.sensor.create({ data: { type: 'temperature', location: 'Connaught Place, Delhi', lat: 28.6315, lon: 77.2167 } }),
    prisma.sensor.create({ data: { type: 'humidity', location: 'Bandra, Mumbai', lat: 19.0544, lon: 72.8405 } }),
    prisma.sensor.create({ data: { type: 'air_quality', location: 'Koramangala, Bengaluru', lat: 12.9352, lon: 77.6245 } }),
    prisma.sensor.create({ data: { type: 'noise', location: 'Park Street, Kolkata', lat: 22.5550, lon: 88.3512 } }),
  ])

  const now = new Date()
  for (const sensor of sensors) {
    for (let i = 0; i < 12; i++) {
      const ts = new Date(now.getTime() - i * 5 * 60000)
      let val = 0
      if (sensor.type === 'temperature') val = 28 + Math.random() * 8
      else if (sensor.type === 'humidity') val = 55 + Math.random() * 20
      else if (sensor.type === 'air_quality') val = 80 + Math.random() * 60
      else val = 45 + Math.random() * 30
      await prisma.sensorData.create({ data: { sensorId: sensor.id, value: parseFloat(val.toFixed(2)), timestamp: ts } })
    }
  }

  await prisma.news.createMany({ data: [
    { title: 'Delhi Air Quality Hits Severe Category Ahead of Diwali', content: 'The Air Quality Index in Delhi NCR has crossed 400, prompting authorities to issue health advisories. Schools and outdoor activities have been restricted.', source: 'The Hindu' },
    { title: 'India Targets 500 GW Renewable Energy by 2030', content: 'The government announced accelerated solar and wind projects across Rajasthan, Gujarat, and Tamil Nadu as part of the national clean energy mission.', source: 'Economic Times' },
    { title: 'Western Ghats Biodiversity Crisis Deepens', content: 'A new study reveals that over 30% of endemic species in the Western Ghats face extinction risk due to deforestation and climate change pressures.', source: 'Down To Earth' },
  ]})

  // Campaign with participants
  const camp = await prisma.campaign.create({ data: { title: 'Clean Yamuna Drive 2025', description: 'Join thousands of volunteers in the largest river cleanup initiative this monsoon season across Delhi and Agra.', creatorId: admin.id } })
  await prisma.campaign.update({ where: { id: camp.id }, data: { participants: { connect: [{ id: analyst.id }] } } })
  await prisma.campaign.create({ data: { title: 'Plant 1 Million Trees — Bengaluru', description: 'Urban greening initiative targeting 50 wards in Bengaluru with native tree species to combat the urban heat island effect.', creatorId: analyst.id } })

  // Group with messages
  const grp = await prisma.group.create({ data: { name: 'Air Quality Watchdogs', issue: 'Monitoring and reporting industrial air pollution violations', creatorId: admin.id, members: { connect: [{ id: analyst.id }] } } })
  await prisma.message.createMany({ data: [
    { content: 'PM2.5 levels near NTPC plant exceeded 250 µg/m³ today. Reporting to PCB.', groupId: grp.id, userId: admin.id },
    { content: 'Good catch. I\'ve submitted the complaint with photographic evidence on the CPCB portal.', groupId: grp.id, userId: analyst.id },
    { content: 'Let\'s schedule a field survey this Saturday around 7 AM before industrial activity peaks.', groupId: grp.id, userId: admin.id },
  ]})

  // Fundraisers with donations
  const f1 = await prisma.fundraiser.create({ data: { cause: 'Solar Panels for Rural Schools — Rajasthan', description: '200 government schools in remote Rajasthan villages lack electricity. We are installing solar panels to power classrooms and digital learning tools.', goal: 500000, raised: 287500, creatorId: admin.id } })
  const f2 = await prisma.fundraiser.create({ data: { cause: 'Mangrove Restoration — Sundarbans', description: 'Restore 50 hectares of degraded mangrove forests in the Sundarbans delta to protect coastal communities and critical tiger habitat.', goal: 800000, raised: 412000, creatorId: analyst.id } })

  console.log('✓ Database seeded with Indian context data')
}

main().then(()=>prisma.$disconnect()).catch(e=>{console.error(e);prisma.$disconnect();process.exit(1)})
