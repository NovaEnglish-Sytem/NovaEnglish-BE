import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function upsertCategory(name) {
  return prisma.questionCategory.upsert({
    where: { name },
    update: {},
    create: { name },
  })
}

async function createPackageWithQuestions(category, { prefix, index, durationMinutes = 10 }) {
  const number = String(index).padStart(3, '0')
  const title = `${prefix}-pkg${number}`
  const categoryName = category.name || 'General'

  // Simple CKEditor5-style HTML passage showing which package is being used
  let storyPassage = ''
  if (index === 1) {
    storyPassage = `
<p><strong>Package:</strong> ${title}</p>
<p>This passage is for the <strong>${categoryName}</strong> topic. Read the short description below before answering the questions.</p>
<p>Everyday life in this story is simple: a student wakes up, has breakfast, and prepares for an ordinary day. Pay attention to the small details, such as time, place, and actions, because they may help you answer the questions.</p>
    `.trim()
  } else if (index === 2) {
    storyPassage = `
<p><strong>Package:</strong> ${title}</p>
<p>This passage belongs to the <strong>${categoryName}</strong> topic. It describes a short scene with friends and daily routines.</p>
<p>Imagine a sunny day when people go outside, read books, or meet each other. Focus on who goes where, what they do, and when they do it. These details are often used in the questions.</p>
    `.trim()
  } else {
    storyPassage = `
<p><strong>Package:</strong> ${title}</p>
<p>This passage is part of the <strong>${categoryName}</strong> topic and shows a simple situation related to school and free time.</p>
<p>Think about how people travel, what they carry, and how they feel. The information in this short text is designed to support the questions you will answer next.</p>
    `.trim()
  }

  const pkg = await prisma.questionPackage.upsert({
    where: { categoryId_title: { categoryId: category.id, title } },
    update: {},
    create: {
      categoryId: category.id,
      title,
      durationMinutes,
      status: 'PUBLISHED',
    },
  })

  const page = await prisma.questionPage.create({
    data: {
      packageId: pkg.id,
      pageOrder: 1,
      storyPassage,
      instructions: 'Answer the following questions. Some questions already give you a clue inside the sentence.',
    },
  })

  // Vary question texts per package index so each package feels different
  let mcqData
  let tfngData
  let shortData
  let matchingData

  if (index === 1) {
    mcqData = {
      question:
        'Every morning, Budi drinks a glass of warm milk. What does Budi drink every morning? (Clue: the answer is in the first sentence).',
      choicesJson: [
        { text: 'Sweet tea' },
        { text: 'Warm milk' },
        { text: 'Water' },
        { text: 'Orange juice' },
      ],
      correctKey: 'B',
    }

    tfngData = {
      question:
        'Sentence: "Siti goes to school at seven o\'clock in the morning."\nStatement: Siti goes to school at eight o\'clock in the morning.\nClue: compare the time in the sentence and in the statement.',
      correctKey: 'FALSE',
    }

    shortData = {
      // Student types the full words
      question:
        'Choose the correct words for each sentence. Options: Red, Sweet, Cold.\nStrawberries are [red]. The candy tastes [sweet]. The iced tea feels [cold]. (Clue: the words in square brackets are the correct answers.)',
      answerText: ['red', 'sweet', 'cold'],
    }

    matchingData = {
      question:
        'Match the letters with the correct fruit. Options: A. apple, B. banana, C. orange.\nI see an [A] on the table. She eats a [B] at lunch. He drinks fresh [C] juice. (Clue: the letters in brackets match the options A, B, C above).',
      answerText: ['a', 'b', 'c'],
      choicesJson: [
        { text: 'A' },
        { text: 'B' },
        { text: 'C' },
      ],
    }
  } else if (index === 2) {
    mcqData = {
      question:
        'On Sunday, Ana goes to the park with her friends. Where does Ana go on Sunday? (Clue: look at the first sentence).',
      choicesJson: [
        { text: 'The market' },
        { text: 'The park' },
        { text: 'The library' },
        { text: 'The station' },
      ],
      correctKey: 'B',
    }

    tfngData = {
      question:
        'Sentence: "Tom reads a book every night before sleeping."\nStatement: Tom reads a book every morning.\nClue: compare the time of day.',
      correctKey: 'FALSE',
    }

    shortData = {
      question:
        'Choose the correct time words for each sentence. Options: Morning, Afternoon, Night.\nThe sun rises in the [morning]. School usually ends in the [afternoon]. Most people sleep at [night]. (Clue: the words in brackets are the correct answers.)',
      answerText: ['morning', 'afternoon', 'night'],
    }

    matchingData = {
      question:
        'Match the letters with the correct weather. Options: A. sunny, B. rainy, C. windy.\nToday the sky is [A]. In the afternoon it becomes [B]. At night it is very [C]. (Clue: the letters in brackets match the options A, B, C above).',
      answerText: ['a', 'b', 'c'],
      choicesJson: [
        { text: 'A' },
        { text: 'B' },
        { text: 'C' },
      ],
    }
  } else {
    mcqData = {
      question:
        "Lisa has a blue backpack for school. What color is Lisa's backpack? (Clue: the color is mentioned in the sentence).",
      choicesJson: [
        { text: 'Red' },
        { text: 'Blue' },
        { text: 'Green' },
        { text: 'Yellow' },
      ],
      correctKey: 'B',
    }

    tfngData = {
      question:
        'Sentence: "The train arrives at ten thirty."\nStatement: The train arrives at ten o\'clock.\nClue: compare the time.',
      correctKey: 'FALSE',
    }

    shortData = {
      question:
        'Choose the correct transport words for each sentence. Options: Bus, Bicycle, Car.\nEvery day, Amir goes to school by [bicycle]. His father drives a [car]. Sometimes they take the [bus] together. (Clue: the words in brackets are the correct answers.)',
      answerText: ['bicycle', 'car', 'bus'],
    }

    matchingData = {
      question:
        'Match the letters with the correct feeling. Options: A. happy, B. tired, C. hungry.\nAfter playing football, he feels [B]. Before lunch, she is [C]. On her birthday, she is very [A]. (Clue: the letters in brackets match the options A, B, C above).',
      answerText: ['b', 'c', 'a'],
      choicesJson: [
        { text: 'A' },
        { text: 'B' },
        { text: 'C' },
      ],
    }
  }

  const mcq = await prisma.questionItem.create({
    data: {
      pageId: page.id,
      itemOrder: 1,
      type: 'MULTIPLE_CHOICE',
      question: mcqData.question,
      choicesJson: mcqData.choicesJson,
      correctKey: mcqData.correctKey,
    },
  })

  const tfng = await prisma.questionItem.create({
    data: {
      pageId: page.id,
      itemOrder: 2,
      type: 'TRUE_FALSE_NOT_GIVEN',
      question: tfngData.question,
      correctKey: tfngData.correctKey,
    },
  })

  const shortAnswer = await prisma.questionItem.create({
    data: {
      pageId: page.id,
      itemOrder: 3,
      type: 'SHORT_ANSWER',
      question: shortData.question,
      answerText: shortData.answerText,
    },
  })

  const matching = await prisma.questionItem.create({
    data: {
      pageId: page.id,
      itemOrder: 4,
      type: 'MATCHING_DROPDOWN',
      question: matchingData.question,
      answerText: matchingData.answerText,
      choicesJson: matchingData.choicesJson,
    },
  })

  // Second page for the same package
  const page2 = await prisma.questionPage.create({
    data: {
      packageId: pkg.id,
      pageOrder: 2,
      storyPassage,
      instructions: 'Answer the following questions. Some questions already give you a clue inside the sentence.',
    },
  })

  const mcq2 = await prisma.questionItem.create({
    data: {
      pageId: page2.id,
      itemOrder: 1,
      type: 'MULTIPLE_CHOICE',
      question: mcqData.question,
      choicesJson: mcqData.choicesJson,
      correctKey: mcqData.correctKey,
    },
  })

  const tfng2 = await prisma.questionItem.create({
    data: {
      pageId: page2.id,
      itemOrder: 2,
      type: 'TRUE_FALSE_NOT_GIVEN',
      question: tfngData.question,
      correctKey: tfngData.correctKey,
    },
  })

  const shortAnswer2 = await prisma.questionItem.create({
    data: {
      pageId: page2.id,
      itemOrder: 3,
      type: 'SHORT_ANSWER',
      question: shortData.question,
      answerText: shortData.answerText,
    },
  })

  const matching2 = await prisma.questionItem.create({
    data: {
      pageId: page2.id,
      itemOrder: 4,
      type: 'MATCHING_DROPDOWN',
      question: matchingData.question,
      answerText: matchingData.answerText,
      choicesJson: matchingData.choicesJson,
    },
  })

  const totalQuestions = 12

  await prisma.questionPackage.update({
    where: { id: pkg.id },
    data: { totalQuestions },
  })

  return { pkg, pages: [page, page2], items: [mcq, tfng, shortAnswer, matching, mcq2, tfng2, shortAnswer2, matching2] }
}

async function main() {
  // Clear student test data
  await prisma.temporaryAnswer.deleteMany().catch(() => {})
  await prisma.activeTestSession.deleteMany().catch(() => {})
  await prisma.testAttempt.deleteMany().catch(() => {})
  await prisma.testRecord.deleteMany().catch(() => {})

  // Clear question domain tables
  await prisma.mediaAsset.deleteMany().catch(() => {})
  await prisma.questionItem.deleteMany().catch(() => {})
  await prisma.questionPage.deleteMany().catch(() => {})
  await prisma.questionPackage.deleteMany().catch(() => {})
  await prisma.questionCategory.deleteMany().catch(() => {})

  const categoriesConfig = [
    'Daily Life',
    'School Stories',
    'Travel Time',
    'Fun and Hobbies',
    'Family Moments',
  ]

  for (const name of categoriesConfig) {
    const cat = await upsertCategory(name)
    const prefix = name.slice(0, 4).toLowerCase()
    for (let i = 1; i <= 3; i++) {
      await createPackageWithQuestions(cat, { prefix, index: i })
    }
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
