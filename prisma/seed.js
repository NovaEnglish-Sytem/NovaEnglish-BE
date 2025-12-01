import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Helper: build SHORT_ANSWER/MATCHING blanks and answers
function buildBlankQuestion(template, answersPerBlank) {
  // template should contain the same number of `[...]` as answersPerBlank.length
  return {
    question: template,
    answerText: answersPerBlank,
  }
}

async function clearExistingQuestionData() {
  // Order matters because of FK relations
  await prisma.temporaryAnswer.deleteMany({})
  await prisma.activeTestSession.deleteMany({})
  await prisma.testAttempt.deleteMany({})
  await prisma.testRecord.deleteMany({})

  await prisma.mediaAsset.deleteMany({})
  await prisma.questionItem.deleteMany({})
  await prisma.questionPage.deleteMany({})
  await prisma.questionPackage.deleteMany({})
  await prisma.questionCategory.deleteMany({})
}

function getCategorySeedData() {
  // 4 categories, each with 4 packages, each package has 3 pages
  // Every package: totalQuestions = 30, durationMinutes = 45
  // Breakdown per package (per-blank counting):
  // - 10 MULTIPLE_CHOICE (10)
  // - 8 TRUE_FALSE_NOT_GIVEN (8)
  // - 2 SHORT_ANSWER items, each with 3 blanks (6)
  // - 2 MATCHING_DROPDOWN items, each with 3 blanks (6)
  // Total = 30

  return [
    {
      code: 'acad',
      name: 'Academic Reading',
      stories: [
        [
          'You are reading an extract from an academic article about the impact of digital libraries on university students. Twenty years ago, most students relied on a small number of printed textbooks and a limited collection of journals stored in the basement of the university library. Access to sources was controlled by opening hours, and popular titles were often unavailable because they had already been borrowed.',
          '',
          'Today, the same library subscribes to thousands of online journals and provides remote access to e-books from publishers all over the world. Instead of waiting in line at the borrowing desk, students log in from their laptops, phones, or tablets to download articles within seconds. This has reduced the time spent searching for basic information and allowed students to explore a much wider range of viewpoints than before.',
          '',
          'However, the article also notes that digital libraries have changed study habits in more subtle ways. Because information is available at any moment, many students now study in short, intense bursts between classes or late at night, rather than during long, uninterrupted sessions in the reading room. Group projects are increasingly organised online, with students sharing highlights and comments directly inside digital documents instead of meeting around a physical table.'
        ].join('\n'),
        [
          'The second passage reports on a three-year research project that compared traditional printed textbooks with electronic tablets in a large university. At the beginning of the study, half of the students were given standard printed materials, while the other half received the same content in digital form on lightweight devices. All students were trained to use the equipment and were tested on their reading skills before the experiment began.',
          '',
          'Researchers monitored not only test scores but also the way students interacted with their texts. They recorded how often students highlighted key phrases, added notes in the margins, or searched for specific terms. Eye-tracking software was used to measure how long students spent on complex diagrams and how frequently they re-read difficult paragraphs.',
          '',
          'By the end of the project, the two groups achieved similar overall results in comprehension tests, but their experiences of reading were noticeably different. Students using tablets reported greater flexibility, as they could revise on the bus or during short breaks. Those with printed books, on the other hand, said they found it easier to concentrate for longer periods and were less tempted to check messages or browse unrelated websites.'
        ].join('\n'),
        [
          'The final passage for this category is a reflective narrative set in a quiet corner of the university library. It is late in the evening, and most of the study spaces are empty. A postgraduate student, Lena, sits at a desk surrounded by both printed books and an open laptop. On the shelves behind her are volumes that have not been touched for years, while on the screen in front of her a digital article is waiting to be downloaded.',
          '',
          'Lena remembers the stories her older relatives told her about spending entire weekends in the library, photocopying chapter after chapter from heavy textbooks. She compares this with her own routine: collecting dozens of PDF files in a single afternoon and organising them into folders that can be carried on a small memory stick. Yet she also notices that the silence of the library helps her to think more clearly than the crowded café where she sometimes works.',
          '',
          'As she finishes her reading for the night, Lena realises that academic reading is no longer tied to a single physical place. Instead, it takes place across a network of screens, devices and buildings, each offering a slightly different environment for concentration. The library has become less of a warehouse for books and more of a gateway, connecting students to a global collection of ideas.'
        ].join('\n'),
      ],
    },
    {
      code: 'ever',
      name: 'Everyday Conversations',
      stories: [
        [
          'You are listening to a conversation between two friends, Maya and Daniel, who are planning a weekend trip to the countryside. They are sitting at a small kitchen table covered with travel brochures, open maps and half-finished cups of coffee. Outside the window, the city traffic is growing louder as rush hour approaches.',
          '',
          'Maya suggests taking the early train on Saturday morning so that they can arrive before the hiking trails become crowded. Daniel, however, is worried about the price of train tickets and wonders if renting a car might be cheaper. They compare the advantages of each option: the flexibility of driving versus the comfort of being able to sleep on the train. At the same time, they try to keep the total cost within their limited budget.',
          '',
          'As the conversation continues, the friends move from practical details to the kind of weekend they hope to have. Maya imagines long walks through quiet forests and evenings spent talking around a small campfire. Daniel is more interested in visiting a local market and trying regional food. By the end of the discussion, they agree on a plan that combines both ideas, promising themselves that the main goal is simply to spend time together away from their busy routines.'
        ].join('\n'),
        [
          'In the second passage, the scene shifts to a busy city café just before lunchtime. A customer named Aisha is standing at the counter, reading the menu while a barista cleans the espresso machine. The aroma of freshly ground coffee fills the air, and soft music plays in the background.',
          '',
          'Aisha hesitates between ordering her usual drink and trying a new seasonal blend advertised on a colourful poster. The barista notices her uncertainty and begins a friendly conversation, explaining the differences between the beans on offer. He describes where they were grown, how they were roasted, and what flavours she can expect to taste. Their chat moves naturally from coffee to travel, as Aisha mentions that she once visited a small village near one of the plantations.',
          '',
          'Before she leaves, the barista tells her about a new loyalty programme that rewards customers who bring their own reusable cups. Aisha appreciates the idea and decides to sign up, realising that a simple everyday purchase can also be a small step towards reducing waste. As she sits down with her drink, she reflects on how a short conversation with a stranger has brightened her day.'
        ].join('\n'),
        [
          'The final passage in this category takes place in the dimly lit hallway of an apartment building during a sudden power cut. Emergency lights cast a faint glow on the walls, and the usual hum of household appliances has fallen silent. Neighbours who rarely speak to one another now find themselves standing side by side, holding candles and mobile phones.',
          '',
          'An elderly resident, Mr. Harris, jokes that the blackout reminds him of his childhood, when evening entertainment meant listening to the radio together rather than watching separate screens. A young couple from the third floor introduce themselves properly for the first time, admitting that they had always been too shy to start a conversation in the lift. Someone suggests checking on the residents who live alone, and small groups move from door to door, knocking gently and offering help.',
          '',
          'As the minutes pass, what began as an inconvenience slowly turns into an unexpected social event. People share stories about their day and swap phone numbers in case the building ever needs to organise support in the future. When the lights finally return, several neighbours are reluctant to end the gathering, surprised at how a simple interruption to their routine created an opportunity for genuine connection.'
        ].join('\n'),
      ],
    },
    {
      code: 'work',
      name: 'Workplace Communication',
      stories: [
        [
          'You are reading an internal email sent by a project manager named Carla to her software development team. The message is written on a Wednesday morning, shortly after the company has decided to delay the release of a major product update. Carla knows that the news will disappoint some team members, who have already been working long hours to meet the original deadline.',
          '',
          'In the email, she carefully explains the reasons behind the decision. A group of test users discovered several unexpected bugs that could affect data security, and senior management has chosen to prioritise reliability over speed. Carla emphasises that this is not a sign of failure but an opportunity to strengthen the product and avoid costly problems in the future.',
          '',
          'She then outlines a revised schedule, asking each sub-team to review their tasks and identify which features need immediate attention. Rather than simply issuing orders, Carla invites feedback and encourages team members to raise any concerns during a video call later that day. Her tone is firm but supportive, reflecting her belief that clear, respectful communication is essential when plans change.'
        ].join('\n'),
        [
          'The second passage describes a performance review meeting between a supervisor, Malik, and an employee, Sofia, who has recently taken on more responsibilities. They sit across from each other in a small meeting room, with a printed evaluation form lying between them. Outside, the office corridor is quiet, but inside the atmosphere is slightly tense.',
          '',
          'Malik begins by acknowledging Sofia’s achievements over the past year, including the successful launch of a training programme she designed for new staff. He points out that several colleagues have praised her ability to explain complex tasks in simple, practical language. Sofia listens carefully, occasionally taking notes and asking for specific examples.',
          '',
          'When the conversation turns to areas for improvement, Malik mentions that Sofia sometimes hesitates to delegate work, preferring to complete difficult tasks on her own. Together, they discuss strategies for building trust within the team and for giving clear instructions without feeling overly controlling. By the end of the meeting, Sofia feels more confident about her strengths and has a concrete plan for developing her leadership skills.'
        ].join('\n'),
        [
          'The last passage follows a hectic Monday morning in an open-plan office. Phones are ringing, keyboards are tapping and the sound of overlapping conversations fills the air. At one desk, a small group of colleagues gathers around a whiteboard covered in colourful diagrams and half-erased notes from the previous week.',
          '',
          'They are preparing for a client presentation and need to agree on which information to include in the final slides. One colleague argues passionately for adding more technical details, while another insists that the client will only be interested in clear, simple benefits. As the discussion becomes more animated, their team leader interrupts to remind them that time is limited and that they must reach a decision within the next fifteen minutes.',
          '',
          'Through careful questioning and summarising, the leader helps the team to identify their main message and remove unnecessary repetition. Once the plan is clear, the mood in the office lightens. People return to their desks with a stronger sense of direction, aware that effective workplace communication is not just about speaking, but also about listening and negotiating under pressure.'
        ].join('\n'),
      ],
    },
    {
      code: 'glob',
      name: 'Global Issues',
      stories: [
        [
          'You are reading a magazine article about a coastal town that has successfully adapted to rising sea levels. For generations, the town depended on fishing and tourism, but increasingly severe storms began to damage homes, roads and the harbour. At first, many residents resisted the idea that the climate was changing, arguing that the weather had always been unpredictable.',
          '',
          'Over time, however, the evidence became impossible to ignore. High tides reached further inland, and flooding that had once occurred every few decades started to happen almost every year. Rather than abandoning the area, local leaders worked with engineers and scientists to design a series of sea walls, raised walkways and floating gardens that could withstand the new conditions.',
          '',
          'The article describes how these projects transformed not only the physical appearance of the town but also the way people thought about their future. Schools introduced lessons on coastal ecosystems, and visitors came not just for the beaches but to learn about adaptation strategies. The town, once seen as a victim of environmental change, gradually became a model for resilience.'
        ].join('\n'),
        [
          'The second passage follows the journey of a young activist named Ren, who campaigns for cleaner air in a large, polluted city. Growing up near a busy main road, Ren suffered from frequent coughs and headaches, which doctors linked to poor air quality. As a teenager, Ren began reading about the health impacts of pollution and attending local community meetings.',
          '',
          'At first, Ren’s efforts seemed to have little effect. Only a handful of people turned up to public events, and some officials dismissed the concerns as exaggerated. Undeterred, Ren started collecting personal stories from residents whose children had developed asthma or whose elderly relatives found it difficult to walk outside on hazy days. These stories were shared on social media alongside photographs that clearly showed the thick layer of smog hanging over the city skyline.',
          '',
          'Gradually, the campaign attracted wider attention. Journalists requested interviews, schools invited Ren to speak at assemblies, and a group of doctors offered to provide medical data to support the cause. Although the air did not improve overnight, the city council finally agreed to introduce stricter limits on vehicle emissions and to expand public transport options, demonstrating how persistent local action can influence policy.'
        ].join('\n'),
        [
          'The final passage is a reflective piece about how ordinary daily choices can contribute to global environmental change. It begins with a simple image: a commuter standing in front of a supermarket shelf, trying to decide between different brands of bottled water. The labels describe mountain springs and pure glacial sources, but they say little about the energy used to transport the bottles across long distances.',
          '',
          'The writer invites readers to imagine how many similar decisions they make in a single day, from choosing what to eat for breakfast to deciding how to travel to work. Each choice, taken alone, seems insignificant. Yet when multiplied by millions of people over many years, these decisions shape demand for products, influence the amount of waste produced and determine the size of our collective carbon footprint.',
          '',
          'Rather than arguing that individuals carry the entire responsibility for solving global problems, the passage suggests a more balanced view. Governments and corporations must implement large-scale changes, but citizens can support or resist these changes through their everyday behaviour. By paying closer attention to the hidden stories behind the objects they use, people can begin to align their habits with the kind of future they hope to see.'
        ].join('\n'),
      ],
    },
  ]
}

function buildPackageTitle(prefix, index) {
  const num = String(index + 1).padStart(3, '0')
  return `${prefix}-pkg${num}`
}

function buildMcq(itemOrder, question, options, correctLetter) {
  return {
    itemOrder,
    type: 'MULTIPLE_CHOICE',
    question,
    choicesJson: options,
    correctKey: correctLetter,
    answerText: null,
  }
}

function buildTfng(itemOrder, statement, correctKey) {
  return {
    itemOrder,
    type: 'TRUE_FALSE_NOT_GIVEN',
    question: statement,
    choicesJson: null,
    correctKey, // 'T' | 'F' | 'NG'
    answerText: null,
  }
}

function buildShort(itemOrder, template, answersPerBlank) {
  const { question, answerText } = buildBlankQuestion(template, answersPerBlank)
  return {
    itemOrder,
    type: 'SHORT_ANSWER',
    question,
    choicesJson: null,
    correctKey: null,
    answerText,
  }
}

function buildMatching(itemOrder, template, options, answersPerBlank) {
  const { question, answerText } = buildBlankQuestion(template, answersPerBlank)
  return {
    itemOrder,
    type: 'MATCHING_DROPDOWN',
    question,
    choicesJson: options,
    correctKey: null,
    answerText,
  }
}

function buildPagesForPackage(categoryName, packageIndex, stories, categoryCode) {
  // 3 pages, each with its own passage (story) and instructions
  // Distribute question types across the 3 pages but keep total 30

  const baseInstructions = [
    'Read the passage carefully and answer the following questions. Choose the correct letter A, B, C or D.',
    'Read the passage. For Questions, write TRUE if the statement agrees with the information, FALSE if it contradicts, or NOT GIVEN if the information is not mentioned.',
    'Complete the summary below using the passage. For each gap, write a suitable word or short phrase from the text or choose the correct option from the dropdown.'
  ]

  const toHtmlParagraphs = (text) => {
    const parts = String(text || '')
      .split('\n\n')
      .map(p => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return ''
    return parts.map(p => `<p>${p}</p>`).join('')
  }

  const pages = []

  // Page 1: 4 MCQ + 3 TFNG + 1 SHORT (3 blanks) => 10 questions
  {
    const questions = []
    let order = 1

    questions.push(
      buildMcq(
        order++,
        `In the ${categoryName.toLowerCase()} passage, what is the main focus described in the opening paragraph?`,
        [
          'A sudden unexpected event',
          'A gradual change over time',
          'A historical conflict',
          'A scientific experiment that failed',
        ],
        'B',
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'According to the passage, what is one key benefit mentioned by the narrator?',
        [
          'Lower overall costs for everyone involved',
          'Greater flexibility and convenience for users',
          'A complete removal of traditional methods',
          'The elimination of face-to-face interaction',
        ],
        'B',
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'What problem did the people in the passage initially face?',
        [
          'Lack of interest from local authorities',
          'Limited access to reliable information',
          'Difficulty in understanding complex instructions',
          'Not enough time to complete their tasks',
        ],
        'B',
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'How does the writer describe the overall atmosphere of the situation?',
        [
          'Calm and predictable',
          'Chaotic and hostile',
          'Hopeful but uncertain',
          'Completely desperate',
        ],
        'C',
      ),
    )

    questions.push(
      buildTfng(order++, 'The passage states that everyone immediately accepted the changes described.', 'F'))
    questions.push(
      buildTfng(order++, 'According to the passage, some people were worried about losing their independence.', 'T'),
    )
    questions.push(
      buildTfng(order++, 'The passage provides detailed numerical data to support every claim.', 'NG'),
    )

    questions.push(
      buildShort(
        order++,
        'The main purpose of the new approach is to improve [overall access], reduce [unnecessary delays] and encourage [active participation].',
        [
          ['overall access'],
          ['unnecessary delays'],
          ['active participation'],
        ],
      ),
    )

    const pkgTitle = buildPackageTitle(categoryCode, packageIndex)
    const page1Raw = `Package code (for testing): ${pkgTitle}\n\n${stories[0]}`
    const page1Passage = toHtmlParagraphs(page1Raw)

    pages.push({
      pageOrder: 1,
      storyPassage: page1Passage,
      instructions: baseInstructions[0],
      questions,
    })
  }

  // Page 2: 3 MCQ + 3 TFNG + 1 SHORT (3 blanks) => 9 questions
  {
    const questions = []
    let order = 1

    questions.push(
      buildMcq(
        order++,
        'Why did some people in the passage hesitate to change their usual behaviour?',
        [
          'They did not understand the benefits clearly',
          'They were forbidden by local regulations',
          'They did not have enough money',
          'They were physically unable to do so',
        ],
        'A',
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'What comparison does the writer use to explain the new situation?',
        [
          'Climbing a steep mountain',
          'Learning a new language',
          'Building a bridge across a river',
          'Preparing a complex meal',
        ],
        'B',
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'What does the writer suggest about the future?',
        [
          'The changes will probably be reversed soon',
          'People will adapt gradually over time',
          'There will be immediate and dramatic improvements',
          'The situation will become worse for most people',
        ],
        'B',
      ),
    )

    questions.push(
      buildTfng(order++, 'The passage describes at least one successful example of adaptation.', 'T'))
    questions.push(
      buildTfng(order++, 'The writer claims that the situation is completely unique in history.', 'F'))
    questions.push(
      buildTfng(order++, 'The passage mentions expert opinions from different countries.', 'NG'))

    questions.push(
      buildShort(
        order++,
        'In the passage, the change is described as [slow but steady], requiring [cooperation] and supported by [clear communication].',
        [
          ['slow but steady'],
          ['cooperation'],
          ['clear communication'],
        ],
      ),
    )

    pages.push({
      pageOrder: 2,
      storyPassage: toHtmlParagraphs(stories[1]),
      instructions: toHtmlParagraphs(baseInstructions[1]),
      questions,
    })
  }

  // Page 3: 3 TFNG + 2 MATCHING (3 blanks each) + 2 MCQ => 10 questions
  {
    const questions = []
    let order = 1

    questions.push(
      buildTfng(order++, 'The writer suggests that small daily decisions can have long-term effects.', 'T'),
    )
    questions.push(
      buildTfng(order++, 'The passage states that individual actions are completely irrelevant.', 'F'))
    questions.push(
      buildTfng(order++, 'The passage explains a detailed scientific formula for predicting behaviour.', 'NG'))

    const matchingOptions = [
      'greater convenience',
      'reduced time pressure',
      'better understanding',
      'stronger relationships',
      'improved confidence',
      'lower overall stress',
    ]

    questions.push(
      buildMatching(
        order++,
        'According to the passage, adjusting daily habits can lead to [greater convenience], [better understanding] and [lower overall stress].',
        matchingOptions,
        [
          ['greater convenience'],
          ['better understanding'],
          ['lower overall stress'],
        ],
      ),
    )

    questions.push(
      buildMatching(
        order++,
        'The writer mentions that supportive environments provide [stronger relationships], [improved confidence] and [reduced time pressure].',
        matchingOptions,
        [
          ['stronger relationships'],
          ['improved confidence'],
          ['reduced time pressure'],
        ],
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'What does the writer identify as the first step towards meaningful change?',
        [
          'Making large sacrifices immediately',
          'Recognising the impact of small choices',
          'Convincing others to act first',
          'Waiting for external instructions',
        ],
        'B',
      ),
    )

    questions.push(
      buildMcq(
        order++,
        'How does the narrator feel at the end of the passage?',
        [
          'Completely discouraged',
          'Cautiously optimistic',
          'Angry and disappointed',
          'Indifferent to the outcome',
        ],
        'B',
      ),
    )

    pages.push({
      pageOrder: 3,
      storyPassage: toHtmlParagraphs(stories[2]),
      instructions: toHtmlParagraphs(baseInstructions[2]),
      questions,
    })
  }

  return pages
}

async function seed() {
  await clearExistingQuestionData()

  const categoriesData = getCategorySeedData()

  for (const cat of categoriesData) {
    const category = await prisma.questionCategory.create({
      data: {
        name: cat.name,
      },
    })

    for (let pkgIndex = 0; pkgIndex < 4; pkgIndex++) {
      const title = buildPackageTitle(cat.code, pkgIndex)
      const status = pkgIndex === 3 ? 'DRAFT' : 'PUBLISHED'

      const packageRecord = await prisma.questionPackage.create({
        data: {
          categoryId: category.id,
          title,
          totalQuestions: 30,
          durationMinutes: 45,
          status,
        },
      })

      const pages = buildPagesForPackage(cat.name, pkgIndex, cat.stories, cat.code)

      for (const pg of pages) {
        const pageRecord = await prisma.questionPage.create({
          data: {
            packageId: packageRecord.id,
            pageOrder: pg.pageOrder,
            storyPassage: pg.storyPassage,
            instructions: pg.instructions,
          },
        })

        for (const q of pg.questions) {
          await prisma.questionItem.create({
            data: {
              pageId: pageRecord.id,
              itemOrder: q.itemOrder,
              type: q.type,
              question: q.question,
              choicesJson: q.choicesJson,
              correctKey: q.correctKey,
              answerText: q.answerText,
            },
          })
        }
      }
    }
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
