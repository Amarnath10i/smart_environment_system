import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()

async function main() {
  const pw = bcrypt.hashSync('password', 10)

  // ── Core users ────────────────────────────────────────────────────────────
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

  // ── Diverse environmental users (NGOs, activists, collectives) ───────────
  const users = await Promise.all([
    // Major NGOs
    prisma.user.upsert({
      where: { email: 'wwf-india@wwfindia.org' },
      update: { name: 'WWF India', role: 'analyst', isVerified: true },
      create: { email: 'wwf-india@wwfindia.org', password: pw, name: 'WWF India', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'greenpeace-india@greenpeace.org' },
      update: { name: 'Greenpeace India', role: 'analyst', isVerified: true },
      create: { email: 'greenpeace-india@greenpeace.org', password: pw, name: 'Greenpeace India', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'cse-india@cseindia.org' },
      update: { name: 'Centre for Science & Environment', role: 'analyst', isVerified: true },
      create: { email: 'cse-india@cseindia.org', password: pw, name: 'Centre for Science & Environment', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'ati@ati.org.in' },
      update: { name: 'Ashoka Trust for Research in Ecology (ATREE)', role: 'analyst', isVerified: true },
      create: { email: 'ati@ati.org.in', password: pw, name: 'Ashoka Trust for Research in Ecology (ATREE)', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'bnhs@bnhs.org' },
      update: { name: 'Bombay Natural History Society', role: 'analyst', isVerified: true },
      create: { email: 'bnhs@bnhs.org', password: pw, name: 'Bombay Natural History Society', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'wtf-india@wti.org.in' },
      update: { name: 'Wildlife Trust of India', role: 'analyst', isVerified: true },
      create: { email: 'wtf-india@wti.org.in', password: pw, name: 'Wildlife Trust of India', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'sanctuary@sanctuaryasia.com' },
      update: { name: 'Sanctuary Nature Foundation', role: 'analyst', isVerified: true },
      create: { email: 'sanctuary@sanctuaryasia.com', password: pw, name: 'Sanctuary Nature Foundation', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'ncf-india@ncf-india.org' },
      update: { name: 'Nature Conservation Foundation', role: 'analyst', isVerified: true },
      create: { email: 'ncf-india@ncf-india.org', password: pw, name: 'Nature Conservation Foundation', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'aranya@aranya.org.in' },
      update: { name: 'Aranya Wildlife Trust', role: 'analyst', isVerified: true },
      create: { email: 'aranya@aranya.org.in', password: pw, name: 'Aranya Wildlife Trust', role: 'analyst', isVerified: true }
    }),

    // Grassroots / local collectives
    prisma.user.upsert({
      where: { email: 'sundarbans-watch@sundarbanswatch.org' },
      update: { name: 'Sundarbans Watch Collective', role: 'analyst', isVerified: true },
      create: { email: 'sundarbans-watch@sundarbanswatch.org', password: pw, name: 'Sundarbans Watch Collective', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'yamuna-jiye@yamunajiye.org' },
      update: { name: 'Yamuna Jiye Abhiyaan', role: 'analyst', isVerified: true },
      create: { email: 'yamuna-jiye@yamunajiye.org', password: pw, name: 'Yamuna Jiye Abhiyaan', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'bangalore-lakes@banglorelakes.org' },
      update: { name: 'Bangalore Lakes Trust', role: 'analyst', isVerified: true },
      create: { email: 'bangalore-lakes@banglorelakes.org', password: pw, name: 'Bangalore Lakes Trust', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'western-ghats@westernghats.org' },
      update: { name: 'Western Ghats Conservation Forum', role: 'analyst', isVerified: true },
      create: { email: 'western-ghats@westernghats.org', password: pw, name: 'Western Ghats Conservation Forum', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'chilika-conservation@chilika.org' },
      update: { name: 'Chilika Conservation Group', role: 'analyst', isVerified: true },
      create: { email: 'chilika-conservation@chilika.org', password: pw, name: 'Chilika Conservation Group', role: 'analyst', isVerified: true }
    }),

    // Individual activists / researchers
    prisma.user.upsert({
      where: { email: 'dr-ramesh@iisc.ac.in' },
      update: { name: 'Dr. Ramesh Krishnan (IISc)', role: 'analyst', isVerified: true },
      create: { email: 'dr-ramesh@iisc.ac.in', password: pw, name: 'Dr. Ramesh Krishnan (IISc)', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'meera-climate@meera.in' },
      update: { name: 'Meera Subramanian (Climate Journalist)', role: 'analyst', isVerified: true },
      create: { email: 'meera-climate@meera.in', password: pw, name: 'Meera Subramanian (Climate Journalist)', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'arvind-wildlife@arvind.in' },
      update: { name: 'Arvind Kumar (Wildlife Biologist)', role: 'analyst', isVerified: true },
      create: { email: 'arvind-wildlife@arvind.in', password: pw, name: 'Arvind Kumar (Wildlife Biologist)', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'sneha-rivers@sneha.in' },
      update: { name: 'Sneha Menon (River Conservationist)', role: 'analyst', isVerified: true },
      create: { email: 'sneha-rivers@sneha.in', password: pw, name: 'Sneha Menon (River Conservationist)', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'rohan-forest@rohan.in' },
      update: { name: 'Rohan Desai (Forest Rights Activist)', role: 'analyst', isVerified: true },
      create: { email: 'rohan-forest@rohan.in', password: pw, name: 'Rohan Desai (Forest Rights Activist)', role: 'analyst', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'divya-coastal@divya.in' },
      update: { name: 'Divya Nair (Coastal Ecologist)', role: 'analyst', isVerified: true },
      create: { email: 'divya-coastal@divya.in', password: pw, name: 'Divya Nair (Coastal Ecologist)', role: 'analyst', isVerified: true }
    }),

    // Citizen groups
    prisma.user.upsert({
      where: { email: 'delhi-cleanair@delhicleanair.org' },
      update: { name: 'Delhi Clean Air Forum', role: 'public', isVerified: true },
      create: { email: 'delhi-cleanair@delhicleanair.org', password: pw, name: 'Delhi Clean Air Forum', role: 'public', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'mumbai-plasticfree@mumbaiplasticfree.org' },
      update: { name: 'Mumbai Plastic Free', role: 'public', isVerified: true },
      create: { email: 'mumbai-plasticfree@mumbaiplasticfree.org', password: pw, name: 'Mumbai Plastic Free', role: 'public', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'chennai-coastal@chennaicoastal.org' },
      update: { name: 'Chennai Coastal Watch', role: 'public', isVerified: true },
      create: { email: 'chennai-coastal@chennaicoastal.org', password: pw, name: 'Chennai Coastal Watch', role: 'public', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'kolkata-wetlands@kolkatawetlands.org' },
      update: { name: 'Kolkata Wetlands Protection', role: 'public', isVerified: true },
      create: { email: 'kolkata-wetlands@kolkatawetlands.org', password: pw, name: 'Kolkata Wetlands Protection', role: 'public', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'pune-hills@punehills.org' },
      update: { name: 'Pune Hills Conservation', role: 'public', isVerified: true },
      create: { email: 'pune-hills@punehills.org', password: pw, name: 'Pune Hills Conservation', role: 'public', isVerified: true }
    }),
    prisma.user.upsert({
      where: { email: 'hyderabad-rocks@hydrocks.org' },
      update: { name: 'Hyderabad Rocks Society', role: 'public', isVerified: true },
      create: { email: 'hyderabad-rocks@hydrocks.org', password: pw, name: 'Hyderabad Rocks Society', role: 'public', isVerified: true }
    }),
  ])

  console.log('Users created:', users.length)
  console.log('NGOs:', users.slice(0, 9).map(u => u.name))
  console.log('Grassroots:', users.slice(9, 15).map(u => u.name))
  console.log('Individuals:', users.slice(15, 21).map(u => u.name))
  console.log('Citizens:', users.slice(21).map(u => u.name))

  const allUsers = [admin, analyst, ...users]
  const ngos = users.slice(0, 9) // Major NGOs (0-8)
  const grassroots = users.slice(9, 14) // Local collectives (9-13)
  const individuals = users.slice(14, 20) // Individual activists (14-19)
  const citizens = users.slice(20) // Citizen groups (20+) 

  // ── Sensors ───────────────────────────────────────────────────────────────
  const sensors = await Promise.all([
    prisma.sensor.create({ data: { type: 'temperature', location: 'Connaught Place, Delhi', lat: 28.6315, lon: 77.2167 } }),
    prisma.sensor.create({ data: { type: 'humidity', location: 'Bandra, Mumbai', lat: 19.0544, lon: 72.8405 } }),
    prisma.sensor.create({ data: { type: 'air_quality', location: 'Koramangala, Bengaluru', lat: 12.9352, lon: 77.6245 } }),
    prisma.sensor.create({ data: { type: 'noise', location: 'Park Street, Kolkata', lat: 22.5550, lon: 88.3512 } }),
    prisma.sensor.create({ data: { type: 'air_quality', location: 'Salt Lake, Kolkata', lat: 22.5850, lon: 88.4150 } }),
    prisma.sensor.create({ data: { type: 'temperature', location: 'Marina Beach, Chennai', lat: 13.0499, lon: 80.2824 } }),
    prisma.sensor.create({ data: { type: 'humidity', location: 'Chilika Lake, Odisha', lat: 19.7000, lon: 85.2000 } }),
    prisma.sensor.create({ data: { type: 'air_quality', location: 'Sundarbans, West Bengal', lat: 21.9497, lon: 88.9550 } }),
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

  // ── News ──────────────────────────────────────────────────────────────────
  await prisma.news.createMany({ data: [
    { title: 'Delhi Air Quality Hits Severe Category Ahead of Diwali', content: 'The Air Quality Index in Delhi NCR has crossed 400, prompting authorities to issue health advisories. Schools and outdoor activities have been restricted.', source: 'The Hindu' },
    { title: 'India Targets 500 GW Renewable Energy by 2030', content: 'The government announced accelerated solar and wind projects across Rajasthan, Gujarat, and Tamil Nadu as part of the national clean energy mission.', source: 'Economic Times' },
    { title: 'Western Ghats Biodiversity Crisis Deepens', content: 'A new study reveals that over 30% of endemic species in the Western Ghats face extinction risk due to deforestation and climate change pressures.', source: 'Down To Earth' },
    { title: 'Sundarbans Mangroves Show Resilience After Cyclone', content: 'Post-cyclone assessment shows natural regeneration of mangroves in protected areas, highlighting importance of conservation.', source: 'The Telegraph' },
    { title: 'Chennai Water Crisis: Lakes Revival Shows Promise', content: 'Community-led lake restoration in Chennai has increased groundwater levels by 40% in restored areas.', source: 'Times of India' },
    { title: 'Tiger Numbers Rise in Central India Corridors', content: 'Latest census shows 15% increase in tiger population across Kanha-Pench corridor due to improved connectivity.', source: 'Hindustan Times' },
  ]})

  // ── Campaigns (created by diverse orgs) ───────────────────────────────────
  const campaignsData = [
    { title: 'Clean Yamuna Drive 2025', description: 'Join thousands of volunteers in the largest river cleanup initiative this monsoon season across Delhi and Agra.', creator: admin },
    { title: 'Plant 1 Million Trees — Bengaluru', description: 'Urban greening initiative targeting 50 wards in Bengaluru with native tree species to combat the urban heat island effect.', creator: analyst },
    { title: 'Save the Sundarbans Mangroves', description: 'Protect 50,000 hectares of critical mangrove habitat from industrial encroachment and climate impacts.', creator: ngos[0] }, // WWF
    { title: 'Stop Coal Mining in Hasdeo Aranya', description: 'Prevent destruction of one of Central India\'s last intact forest corridors for coal extraction.', creator: ngos[1] }, // Greenpeace
    { title: 'Right to Clean Air — Delhi NCR', description: 'Demand strict enforcement of NCAP targets and real-time industrial emission monitoring.', creator: ngos[2] }, // CSE
    { title: 'Revive Bellandur Lake — Bengaluru', description: 'Community-driven restoration of Bengaluru\'s largest lake from toxic foam to thriving wetland.', creator: grassroots[1] }, // Bangalore Lakes Trust
    { title: 'Protect Olive Ridley Nesting Sites — Odisha', description: 'Safeguard mass nesting beaches at Gahirmatha and Rushikulya from light pollution and trawling.', creator: ngos[5] }, // WTI
    { title: 'Western Ghats UNESCO Buffer Zone Expansion', description: 'Advocate for expanded protected areas and ecological corridors across the Western Ghats.', creator: grassroots[2] }, // Western Ghats Conservation Forum
    { title: 'Ban Single-Use Plastics — Maharashtra', description: 'Push for strict enforcement of plastic ban and support alternatives for small vendors.', creator: citizens[1] }, // Mumbai Plastic Free
    { title: 'Save Aarey Forest — Mumbai', description: 'Stop metro car shed construction in Aarey, Mumbai\'s last green lung and leopard habitat.', creator: ngos[3] }, // ATREE
    { title: 'Chilika Lake Fisheries Sustainability', description: 'Promote sustainable fishing practices and protect Irrawaddy dolphin habitat in Chilika.', creator: grassroots[3] }, // Chilika Conservation
    { title: 'Delhi Ridge Forest Protection', description: 'Prevent encroachment and illegal mining in Delhi\'s vital green lung and water recharge zone.', creator: citizens[0] }, // Delhi Clean Air Forum
    { title: 'Electrify Rural Schools — Solar for Education', description: 'Install solar panels in 500 off-grid schools across Rajasthan, Jharkhand, and Odisha.', creator: individuals[0] }, // Dr. Ramesh
    { title: 'Urban Wetland Conservation — East Kolkata Wetlands', description: 'Protect the world\'s only wastewater-fed aquaculture system and Ramsar site.', creator: individuals[4] }, // Rohan Desai
    { title: 'Himalayan Glacier Monitoring Network', description: 'Citizen science initiative to monitor glacier retreat across Uttarakhand and Himachal.', creator: individuals[1] }, // Meera
  ]

  const createdCampaigns = []
  for (const c of campaignsData) {
    const camp = await prisma.campaign.create({ data: { title: c.title, description: c.description, creatorId: c.creator.id } })
    createdCampaigns.push(camp)
    // Add 1-3 participants
    const participants = allUsers.filter(u => u.id !== c.creator.id).sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3) + 1)
    if (participants.length > 0) {
      await prisma.campaign.update({ where: { id: camp.id }, data: { participants: { connect: participants.map(p => ({ id: p.id })) } } })
    }
  }

  // ── Groups (created by diverse orgs) ──────────────────────────────────────
  const groupsData = [
    { name: 'Air Quality Watchdogs', issue: 'Monitoring and reporting industrial air pollution violations across Delhi NCR', creator: admin },
    { name: 'Sundarbans Mangrove Guardians', issue: 'Community-based mangrove monitoring and anti-poaching patrols in Sundarbans', creator: grassroots[0] },
    { name: 'Western Ghats Biodiversity Network', issue: 'Documenting endemic species and tracking habitat fragmentation in the Western Ghats', creator: grassroots[2] },
    { name: 'Bangalore Lake Warriors', issue: 'Weekly lake cleanups, water quality testing, and encroachment reporting', creator: grassroots[1] },
    { name: 'Delhi Clean Air Forum', issue: 'Citizen advocacy for clean air policy implementation and real-time monitoring', creator: citizens[0] },
    { name: 'Mumbai Plastic Free', issue: 'Plastic waste audits, beach cleanups, and vendor education on alternatives', creator: citizens[1] },
    { name: 'Chennai Coastal Watch', issue: 'Turtle nesting protection, beach profiling, and marine debris monitoring', creator: citizens[2] },
    { name: 'Kolkata Wetlands Protectors', issue: 'Protecting East Kolkata Wetlands from encroachment and pollution', creator: citizens[3] },
    { name: 'Pune Hills Conservation', issue: 'Hill slope protection, native plantation, and biodiversity documentation', creator: citizens[4] },
    { name: 'Hyderabad Rocks Society', issue: 'Deccan plateau rock formation conservation and geo-heritage awareness', creator: citizens[5] },
    { name: 'Yamuna River Keepers', issue: 'Water quality monitoring, industrial discharge reporting, and floodplain protection', creator: ngos[2] },
    { name: 'Chilika Fisherfolk Collective', issue: 'Sustainable fisheries, dolphin conservation, and lagoon health monitoring', creator: grassroots[3] },
    { name: 'Wildlife Corridor Connectors', issue: 'Identifying and protecting wildlife corridors across Central Indian landscape', creator: ngos[4] }, // BNHS
    { name: 'Himalayan Glacier Watch', issue: 'Citizen science glacier monitoring and climate impact documentation', creator: individuals[1] },
    { name: 'Forest Rights Defenders', issue: 'Supporting FRA implementation and community forest resource rights', creator: individuals[4] },
    { name: 'Urban Biodiversity Mappers', issue: 'Mapping urban biodiversity hotspots and advocating for green infrastructure', creator: individuals[0] },
  ]

  const createdGroups = []
  for (const g of groupsData) {
    const grp = await prisma.group.create({
      data: {
        name: g.name,
        issue: g.issue,
        creatorId: g.creator.id,
        members: { connect: [{ id: g.creator.id }] },
      }
    })
    createdGroups.push(grp)
    // Add 2-5 members
    const members = allUsers.filter(u => u.id !== g.creator.id).sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 4) + 2)
    if (members.length > 0) {
      await prisma.group.update({ where: { id: grp.id }, data: { members: { connect: members.map(m => ({ id: m.id })) } } })
    }
  }

  // ── Messages in groups ────────────────────────────────────────────────────
  const messageTemplates = [
    'Great initiative! Our team has documented similar issues in {location}.',
    'We should coordinate with the state pollution control board on this.',
    'The latest satellite data shows {metric} has increased by 15% this quarter.',
    'Community meeting scheduled for next Saturday at 10 AM. All welcome!',
    'Submitted RTI application for {topic}. Will share response when received.',
    'Volunteers needed for field survey this weekend. DM if interested.',
    'Great catch! I\'ve escalated this to the regional office.',
    'The new policy draft has some good provisions but misses {gap}.',
    'Photo documentation from today\'s patrol attached. Evidence of {violation}.',
    'Next cleanup drive: {date}. Meeting point: {location}.',
  ]

  for (const grp of createdGroups) {
    const msgCount = Math.floor(Math.random() * 5) + 2
    const groupMembers = await prisma.group.findUnique({ where: { id: grp.id }, include: { members: true } })
    if (groupMembers?.members.length) {
      for (let i = 0; i < msgCount; i++) {
        const author = groupMembers.members[Math.floor(Math.random() * groupMembers.members.length)]
        const template = messageTemplates[Math.floor(Math.random() * messageTemplates.length)]
        const content = template
          .replace('{location}', ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Sundarbans', 'Western Ghats'][Math.floor(Math.random() * 7)])
          .replace('{metric}', ['PM2.5', 'NO2', 'forest loss', 'water quality index'][Math.floor(Math.random() * 4)])
          .replace('{topic}', ['industrial emissions', 'forest clearance', 'water allocation'][Math.floor(Math.random() * 3)])
          .replace('{violation}', ['illegal dumping', 'encroachment', 'excess emissions'][Math.floor(Math.random() * 3)])
          .replace('{date}', ['this Saturday', 'next Sunday', 'July 20'][Math.floor(Math.random() * 3)])
          .replace('{gap}', ['community consent', 'cumulative impact assessment', 'enforcement mechanism'][Math.floor(Math.random() * 3)])
        await prisma.message.create({ data: { content, groupId: grp.id, userId: author.id } })
      }
    }
  }

  // ── Fundraisers (created by diverse orgs) ─────────────────────────────────
  const fundraisersData = [
    { cause: 'Solar Panels for Rural Schools — Rajasthan', description: '200 government schools in remote Rajasthan villages lack electricity. We are installing solar panels to power classrooms and digital learning tools.', goal: 500000, raised: 287500, creator: admin },
    { cause: 'Mangrove Restoration — Sundarbans', description: 'Restore 50 hectares of degraded mangrove forests in the Sundarbans delta to protect coastal communities and critical tiger habitat.', goal: 800000, raised: 412000, creator: analyst },
    { cause: 'Wildlife Corridor Land Purchase — Kanha-Pench', description: 'Secure 200 acres of critical tiger corridor connecting Kanha and Pench reserves. Land is under immediate threat from mining.', goal: 1200000, raised: 650000, creator: ngos[4] }, // BNHS
    { cause: 'Community Forest Rights — Gondia, Maharashtra', description: 'Legal support for 50 villages filing Community Forest Resource claims under FRA. Empowering tribals to protect their forests.', goal: 300000, raised: 180000, creator: individuals[4] }, // Rohan
    { cause: 'Urban Miyawaki Forests — Chennai', description: 'Create 10 dense native micro-forests (Miyawaki method) across Chennai to combat heat island and restore biodiversity.', goal: 400000, raised: 220000, creator: grassroots[2] }, // Bangalore Lakes / Chennai
    { cause: 'Plastic-Free Himalayan Trails — Uttarakhand', description: 'Install waste segregation systems and composting units along 50 km of trekking trails in Valley of Flowers and Roopkund.', goal: 250000, raised: 140000, creator: ngos[6] }, // Sanctuary
    { cause: 'Vulture Breeding Centre — Pinjore, Haryana', description: 'Support captive breeding of critically endangered Gyps vultures. Release program to restore scavenging ecosystem.', goal: 600000, raised: 350000, creator: ngos[5] }, // WTI
    { cause: 'River Dolphin Conservation — Ganga & Brahmaputra', description: 'Acoustic monitoring, bycatch reduction gear for fishers, and community awareness for Gangetic and Indus river dolphins.', goal: 450000, raised: 275000, creator: ngos[0] }, // WWF
    { cause: 'Coastal Community Climate Resilience — Odisha', description: 'Cyclone shelters, mangrove nurseries, and saline-tolerant crops for 20 vulnerable villages in Kendrapara and Bhadrak.', goal: 700000, raised: 380000, creator: grassroots[3] }, // Chilika
    { cause: 'Electrify Tribal Hamlets — Solar Microgrids', description: 'Off-grid solar microgrids for 15 forest fringe villages in Jharkhand and Chhattisgarh. Clean energy replaces diesel.', goal: 900000, raised: 510000, creator: individuals[0] }, // Dr. Ramesh
    { cause: 'Wetland Revival — Pallikaranai Marsh, Chennai', description: 'Restore 300 acres of Pallikaranai marsh from garbage dump to thriving wetland. Bird habitat, flood mitigation, groundwater recharge.', goal: 350000, raised: 190000, creator: citizens[2] }, // Chennai Coastal
    { cause: 'Grassland Conservation — Rollapadu, Andhra Pradesh', description: 'Protect last remaining habitat of Great Indian Bustard and Lesser Florican. Anti-poaching, habitat management, community stewardship.', goal: 500000, raised: 280000, creator: ngos[7] }, // NCF
  ]

  for (const f of fundraisersData) {
    await prisma.fundraiser.create({
      data: { cause: f.cause, description: f.description, goal: f.goal, raised: f.raised, creatorId: f.creator.id }
    })
  }

  console.log('✓ Database seeded with diverse Indian environmental organizations, activists, and citizen groups')
}

main().then(()=>prisma.$disconnect()).catch(e=>{console.error(e);prisma.$disconnect();process.exit(1)})